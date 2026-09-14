// 路由行为测试：起一个真的服务，用真的 HTTP 请求去敲。
//
// 为什么值得单独测：这些规则改坏了表面上看不出来（页面照常打开），
// 但后果很实际 —— 比如「接口路径拼错时回落成首页 HTML 配 200」，
// 会让调用方拿到一坨 HTML 还以为是数据；再比如剧情全文被静态目录带出去。
//
// 全程不发任何真实模型请求：测试把密钥置空，服务会走「既定台词」兜底。
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ' — ' + detail : ''}`);
}

// 让操作系统挑一个空闲端口，避免和正在跑的服务撞车
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const {port} = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// 数据写到临时目录，别污染本机真实的玩家记录
const dataDir = mkdtempSync(join(tmpdir(), 'blueroute-'));
const port = await freePort();

const child = spawn(process.execPath, [join(root, 'server.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
    // 置空，确保测试不会碰到任何真实模型
    MODEL_API_KEY: '',
    // 两个口令键都要置空：配置优先级是「进程环境变量 > .env.local」，
    // 而本机的 .env.local 里**确实有**这两个键。只置空一个的话，另一个会从文件里读进来，
    // 于是「未配密码时管理接口应关闭」那条就会假红（2026-09-14 加第二个键时踩到）。
    ADMIN_PASSWORD: '',
    ADMIN_TEST_PASSWORD: ''
  },
  stdio: 'ignore'
});

const base = `http://127.0.0.1:${port}`;
const request = async (path, options) => {
  try {
    const res = await fetch(base + path, options);
    const type = res.headers.get('content-type') || '';
    const text = await res.text();
    return {status: res.status, type, text};
  } catch (error) {
    // 服务端主动断开连接也算一种「拒绝」，不能让测试因此崩掉
    return {status: 0, type: '', text: '', error: String(error?.cause?.code || error?.message || error)};
  }
};

try {
  // 等它起来，最多约 9 秒
  let up = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(base + '/api/health');
      if (res.ok) { up = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  if (!up) {
    check('服务应该能启动', false, '等了 9 秒仍未响应');
  } else {
    // ---- 接口路径写错时必须明确报错，不能回落成首页 ----
    for (const wrong of ['/api/nope', '/api/records', '/api/admin', '/api/']) {
      const res = await request(wrong);
      check(`${wrong} 应该 404`, res.status === 404, `实际 ${res.status}`);
      check(`${wrong} 应该是 JSON 而不是网页`, res.type.includes('json') && !res.text.includes('<!doctype'), res.type);
    }

    // ---- GET 一个只接受 POST 的接口，同样不该回落成网页 ----
    const wrongMethod = await request('/api/npc');
    check('GET /api/npc 应该 404', wrongMethod.status === 404, `实际 ${wrongMethod.status}`);
    check('GET /api/npc 不该返回网页', !wrongMethod.text.includes('<!doctype'), wrongMethod.type);

    // ---- 知乎回调：活动页登记的路径不由我们决定，几条常见的都得接住 ----
    // 官方 2026-S2 统一 skill 的示例写的是 /auth/callback；我们对外公告的是
    // /api/auth/zhihu/callback。两条（含 /api/auth/callback）都必须落到 OAuth 处理器上，
    // 否则症状是「在知乎点完授权，跳回来一个 404 空白页」，而且看不出是谁的错。
    for (const alias of ['/api/auth/zhihu/callback', '/auth/callback', '/api/auth/callback']) {
      const res = await fetch(base + alias, {redirect: 'manual'});
      const location = res.headers.get('location') || '';
      check(`${alias} 该走 OAuth 回调（302 跳回站内）而不是 404`, res.status === 302, `实际 ${res.status}`);
      check(`${alias} 跳回站内时要带上是哪种结果`, /^\/\?zhihu=\w+$/.test(location), location || '(没有 location)');
    }
    // 反过来：不该把任意路径都当回调，否则静态资源和页面全被抢走。
    for (const notCallback of ['/callback', '/auth/', '/api/auth/zhihu/callback/extra']) {
      const res = await fetch(base + notCallback, {redirect: 'manual'});
      check(`${notCallback} 不该被当成回调`, !/^\/\?zhihu=/.test(res.headers.get('location') || ''), String(res.status));
    }

    // 兜底：万一活动页登记的其实是**我们站点的根地址**，知乎会把授权码送回 `/`。
    const rootCallback = await fetch(base + '/?authorization_code=X', {redirect: 'manual'});
    const rootLocation = rootCallback.headers.get('location') || '';
    check(
      '根地址带 authorization_code 时要当回调处理',
      rootCallback.status === 302 && String(rootLocation).startsWith('/?zhihu='),
      `${rootCallback.status} ${rootLocation}`
    );
    const plainRoot = await fetch(base + '/', {redirect: 'manual'});
    check('没带授权码的首页仍然是首页（不许被回调抢走）', plainRoot.status === 200, `实际 ${plainRoot.status}`);

    // ---- 正常页面 ----
    for (const page of ['/', '/room.html', '/admin', '/menu.css']) {
      const res = await request(page);
      check(`${page} 应该 200`, res.status === 200, `实际 ${res.status}`);
    }

    // ---- 入口页只能有一个：本地启动脚本打开的那一页，必须就是网站根路径 ----
    // 起因：`开始游戏.command` 里写死 `open ".../room.html"`，而根路径 `/` 返回的是首页。
    // 于是同一个项目有两个「第一屏」：线上链接是开场菜单，双击启动却直接蹦进第一关。
    // 这种不一致在用户报「怎么直接到第一关了」时最难对账 —— 因为两边都没坏，只是不一样。
    {
      const home = await request('/');
      // 这里曾经断言「标题一字不差等于 `<title>知乎——你是否问到了关键线索</title>`」。
      // 作品定名「故事档案馆」之后它就报红了 —— 页面没错，是断言把「这是首页」这个意思
      // 抄成了一个会过期的字面串（和「断言里写死 ?v= 版本号」是同一类毛病）。
      // 改成断言**首页独有的结构标记**：首页有章节卡 `chapter-teaser`，
      // 第一幕现场有 `art-header`，两者互斥；标题只要求「存在」，不写死文案。
      check('根路径必须是游戏首页，不是第一幕',
        home.text.includes('chapter-teaser') && !home.text.includes('art-header')
          && /<title>[^<]+<\/title>/.test(home.text),
        home.text.slice(0, 140));

      const launcher = readFileSync(join(root, '开始游戏.command'), 'utf8');
      const opened = [...launcher.matchAll(/^\s*open\s+"([^"]+)"/gm)].map(match => match[1]);
      check('双击启动脚本应当只自动打开一个页面', opened.length === 1, JSON.stringify(opened));
      check('双击启动脚本打开的必须是网站根路径（和线上第一屏同一页）',
        opened[0] === 'http://127.0.0.1:4180/', String(opened[0]));

      // 横幅上的措辞也算：把 room.html 标成「游戏入口」会让人以为根路径不是首页。
      const serverSource = readFileSync(join(root, 'server.mjs'), 'utf8');
      check('服务启动横幅不该把 room.html 标成「游戏入口」',
        !/游戏入口[^\n]*room\.html/.test(serverSource), '横幅把第一幕当成入口了');
      const setupSource = readFileSync(join(root, 'scripts/setup.mjs'), 'utf8');
      check('配置向导的提示不该把 room.html 标成「游戏」',
        !/room\.html[^\n]*←\s*游戏['"]/.test(setupSource), '向导还在说 room.html 是游戏入口');
    }

    // ---- 不该被看到的文件 ----
    for (const hidden of ['/STORY.md', '/README.md', '/.env.local', '/.git/config', '/.DS_Store']) {
      const res = await request(hidden);
      check(`${hidden} 不该被提供`, res.status === 404, `实际 ${res.status}`);
      check(`${hidden} 不该泄露任何内容`, !res.text.includes('<!doctype') || res.status === 404, '回落成了网页');
    }

    // ---- 带扩展名但不存在的东西，老老实实 404 ----
    const missingAsset = await request('/nope.js');
    check('不存在的 .js 应该 404', missingAsset.status === 404, `实际 ${missingAsset.status}`);

    // ---- 健康检查只说状态，不说密钥值 ----
    const health = await request('/api/health');
    const payload = JSON.parse(health.text);
    check('健康检查应报告未配置模型', payload.stats && payload.config.ready === false, health.text.slice(0, 120));
    check('健康检查不该包含任何密钥字段值', !/sk-[A-Za-z0-9_-]{16,}/.test(health.text));

    // ---- 管理员接口：没配密码时应明确关闭 ----
    const admin = await request('/api/admin/records');
    check('未配密码时管理接口应关闭', admin.status === 503, `实际 ${admin.status}`);
    check('关闭时应给出人话说明', /ADMIN_PASSWORD/.test(admin.text), admin.text.slice(0, 120));

    // ---- 没配模型时问 NPC：可以用既定台词兜底，但不能崩 ----
    const npc = await request('/api/npc', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({npcId: 'trainer', question: '瓶子是干什么用的？', observed: [], sessionId: 'route-test'})
    });
    check('没有模型时问 NPC 应返回 200', npc.status === 200, `实际 ${npc.status}`);
    const npcBody = JSON.parse(npc.text);
    check('没有模型时应该是兜底回答', npcBody.fallback === true, npc.text.slice(0, 140));
    check('兜底原因应是「没配密钥」', npcBody.reason === 'no_key', String(npcBody.reason));

    // ---- 超大请求体要被挡掉，不能吃光内存 ----
    const huge = await request('/api/npc', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({npcId: 'trainer', question: 'x'.repeat(200000)})
    });
    // 明确回 413/400，或者干脆断开连接，都算挡住了；唯独不能当成正常请求处理
    check('超大请求体不该被当成正常请求', huge.status !== 200, `实际 ${huge.status}`);
    check('超大请求体应有明确的拒绝或断连', huge.status === 413 || huge.status === 400 || huge.status === 0, `实际 ${huge.status} ${huge.error || ''}`);

    // ---- 静态资源：音视频要给对 MIME，并且要支持分段请求 ----
    // 起因：加开场动画时发现静态服务把 .mp4 / .mp3 一律回成 application/octet-stream。
    // 浏览器是靠 Content-Type 决定要不要把它交给 <video> / <audio> 的，回错了就直接不播；
    // 而且不支持 Range 时，iPhone 上的 Safari 拿不到 206 会干脆拒绝播 <video>。
    // 这两条都属于「在电脑上看着没事、换台设备就不播」的坑，光靠肉眼验收抓不到。
    const raw = async (path, options) => {
      try {
        const res = await fetch(base + path, options);
        return {
          status: res.status,
          type: res.headers.get('content-type') || '',
          range: res.headers.get('content-range') || '',
          acceptRanges: res.headers.get('accept-ranges') || '',
          bytes: Buffer.from(await res.arrayBuffer())
        };
      } catch (error) {
        return {status: 0, type: '', range: '', acceptRanges: '', bytes: Buffer.alloc(0), error: String(error?.message || error)};
      }
    };

    for (const [file, expected] of [
      ['bgm-piano.mp3', 'audio/mpeg'],
      ['ui-soft-chime.mp3', 'audio/mpeg'],
      ['cg1-opening.mp4', 'video/mp4'],
      ['apartment-menu.jpg', 'image/jpeg']
    ]) {
      const got = await raw(`/assets/${file}`);
      check(`${file} 应能取到`, got.status === 200, `实际 ${got.status} ${got.error || ''}`);
      check(`${file} 的 content-type 应是 ${expected}`, got.type === expected, `实际 "${got.type}"`);
    }

    const whole = await raw('/assets/cg1-opening.mp4');
    check('整份文件的响应应声明 accept-ranges', whole.acceptRanges === 'bytes', `实际 "${whole.acceptRanges}"`);

    const part = await raw('/assets/cg1-opening.mp4', {headers: {range: 'bytes=0-1023'}});
    check('分段请求应返回 206', part.status === 206, `实际 ${part.status}`);
    check('分段请求应给出 content-range', /^bytes 0-1023\/\d+$/.test(part.range), part.range);
    check('分段请求应只回这一段', part.bytes.length === 1024, `实际 ${part.bytes.length} 字节`);
    check('分段内容应与整份文件对应位置逐字节一致', part.bytes.equals(whole.bytes.subarray(0, 1024)));

    const suffix = await raw('/assets/ui-soft-chime.mp3', {headers: {range: 'bytes=-100'}});
    check('后缀式 Range 应回 206 且长度为 100', suffix.status === 206 && suffix.bytes.length === 100, `实际 ${suffix.status} / ${suffix.bytes.length}`);

    const beyond = await raw('/assets/ui-soft-chime.mp3', {headers: {range: 'bytes=99999999-'}});
    check('越界 Range 应回 416 并带上实际长度', beyond.status === 416 && /^bytes \*\/\d+$/.test(beyond.range), `实际 ${beyond.status} ${beyond.range}`);

    const multi = await raw('/assets/ui-soft-chime.mp3', {headers: {range: 'bytes=0-10,20-30'}});
    check('多段 Range 应回 416（不支持就别假装支持）', multi.status === 416, `实际 ${multi.status}`);
  }
} finally {
  child.kill('SIGTERM');
  rmSync(dataDir, {recursive: true, force: true});
}

if (failures.length) {
  console.log(`服务路由：${passed} 项通过，${failures.length} 项失败`);
  for (const row of failures) console.log('  ✗ ' + row);
  process.exitCode = 1;
} else {
  console.log(`服务路由：${passed} 项全部通过（接口错路径 / 隐藏文件 / 兜底 / 请求体上限 / 音视频 MIME 与分段请求）。未联网，未消耗额度。`);
}
