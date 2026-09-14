// 管理台口令：**两个口令（正式 / 给评委的测试口令）必须都放行，而且从哪个通道送来都要放行**。
//
// 为什么值得单独一个文件：这条规则是踩出来的，而且坏了**看不出来**。
// 2026-09-14 那次排查我先把因归错了，写在这里免得后人再归错一次：
//   表面现象：线上 /admin 一直 401，本地全绿。
//   第一反应是「平台注入了 ADMIN_PASSWORD，把 .env.local 盖住了」（配置优先级确实是
//   「真实环境变量 > .env.local」）—— **这个猜测是错的**：线上诊断回报 process.env 里
//   根本没有 ADMIN_PASSWORD，而且「拿本地那份口令去线上比对」能成功
//   ⇒ 线上跑的就是本地这份配置。
//   真因：**托管平台的网关会把 Authorization 请求头丢掉**。同一个口令，
//   从查询串送进去服务端能比对成功；放进 Authorization 头就永远到不了 Node 那一层。
//   所以「多通道」不是锦上添花，而是**线上能不能用的前提**。
//
// 这个文件守四件事：
//   ① 两个口令都能进（任何一边被写坏，评委或管理员就有一个人进不去）；
//   ② 三个通道都能进，且是「任意一个对得上就放行」（不是「取第一个非空值就返回」）；
//   ③ 错的口令仍然 401（否则等于没设防 —— 我把这个叫「负对照」）；
//   ④ 健康检查不泄漏任何一个口令。
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from '../lib/config.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ' — ' + detail : ''}`);
}

const REAL = 'admin-real-password-1';
const TEST = 'admin-judge-password-2';

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

// ---------------------------------------------------------------- ① 纯配置层
// 用 overrides 直接把值喂进去，不依赖本机 .env.local 的内容（那会让测试时绿时红）。
// 顺带把知乎那两个键也置空：本机 .env.local 里写了 ZHIHU_ZHIDA_MODE，
// 而密钥为空时 loadConfig 会去问 macOS 钥匙串 —— 那可能弹窗或挂住，测试不能碰它。
const CLEAN = {ZHIHU_ZHIDA_MODE: '', ZHIHU_ACCESS_SECRET: ''};
{
  const both = loadConfig({...CLEAN, ADMIN_PASSWORD: REAL, ADMIN_TEST_PASSWORD: TEST});
  check('两个口令都有时管理页开启', both.admin.enabled === true);
  check('正式口令被读进来', both.admin.password === REAL);
  check('测试口令被读进来', both.admin.testPassword === TEST);

  const onlyTest = loadConfig({...CLEAN, ADMIN_PASSWORD: '', ADMIN_TEST_PASSWORD: TEST});
  check('只配了测试口令也算开启（否则「只想发一个测试口令」的部署会变成打不开）',
    onlyTest.admin.enabled === true && onlyTest.admin.password === '');

  const tooShort = loadConfig({...CLEAN, ADMIN_PASSWORD: 'abc', ADMIN_TEST_PASSWORD: 'xy'});
  check('两个都太短时必须关闭（不能退化成无密码可访问）', tooShort.admin.enabled === false);

  const none = loadConfig({...CLEAN, ADMIN_PASSWORD: '', ADMIN_TEST_PASSWORD: ''});
  check('两个都空时必须关闭', none.admin.enabled === false);
}

// ---------------------------------------------------------------- ② 真服务
const dataDir = mkdtempSync(join(tmpdir(), 'blueadmin-'));
const port = await freePort();

const child = spawn(process.execPath, [join(root, 'server.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
    MODEL_API_KEY: '',
    // 两个都显式给死值：这样断言不受本机 .env.local 影响
    ADMIN_PASSWORD: REAL,
    ADMIN_TEST_PASSWORD: TEST,
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost'
  },
  stdio: 'ignore'
});

const base = `http://127.0.0.1:${port}`;

async function request(path, options) {
  try {
    const res = await fetch(base + path, options);
    return {status: res.status, text: await res.text()};
  } catch (error) {
    return {status: 0, text: '', error: String(error?.cause?.code || error?.message || error)};
  }
}

const withToken = (token) => ({
  headers: token ? {authorization: `Bearer ${token}`} : {}
});

try {
  // 等服务起来（轮询，不固定 sleep）
  let up = false;
  for (let i = 0; i < 80 && !up; i += 1) {
    const ping = await request('/api/health');
    if (ping.status === 200) up = true;
    else await new Promise((r) => setTimeout(r, 150));
  }
  check('测试服务起来了', up, '连不上就说明是环境问题，不是这条规则的问题');

  if (up) {
    const real = await request('/api/admin/records', withToken(REAL));
    check('正式口令能进', real.status === 200, `实际 ${real.status}`);

    const test = await request('/api/admin/records', withToken(TEST));
    check('测试口令也能进（这条是本次新增的核心）', test.status === 200, `实际 ${test.status}`);

    // 负对照：错的口令必须被挡。没有这一条，「能进」可能只是接口根本不校验。
    const wrong = await request('/api/admin/records', withToken('not-a-real-password'));
    check('负对照：错的口令必须 401', wrong.status === 401, `实际 ${wrong.status}`);

    const none = await request('/api/admin/records', withToken(''));
    check('负对照：不带凭证必须 401', none.status === 401, `实际 ${none.status}`);

    // 前缀 / 近似值也不行（防止把比较写成 startsWith 之类的弱判断）
    const prefix = await request('/api/admin/records', withToken(REAL.slice(0, -1)));
    check('负对照：正确口令少一位也必须 401', prefix.status === 401, `实际 ${prefix.status}`);

    // ---- 口令的「通道」：线上真正出问题的地方是**请求头到不了服务端** ----
    // 2026-09-14 实测：同一个口令从查询串送进诊断接口能比对成功，走 Authorization 头却一律 401
    // ⇒ 托管平台的网关吃掉/覆盖了那个头。所以多通道是**线上能不能用的前提**，不是锦上添花。
    const byQuery = await request(`/api/admin/records?token=${TEST}`);
    check('查询串也能带口令（线上托管网关会丢掉 Authorization 头，这是实测唯一通的路）',
      byQuery.status === 200, `实际 ${byQuery.status}`);

    const wrongQuery = await request('/api/admin/records?token=not-a-real-password');
    check('负对照：查询串里放错口令也必须 401', wrongQuery.status === 401, `实际 ${wrongQuery.status}`);

    const byCustomHeader = await request('/api/admin/records', {headers: {'x-admin-token': TEST}});
    check('自定义头 X-Admin-Token 也能带口令', byCustomHeader.status === 200, `实际 ${byCustomHeader.status}`);

    // 这条是防「回退」的：如果哪天有人把实现改成「取第一个非空值就返回」，
    // 那么当网关不是删掉头、而是塞进它自己的值时，查询串兜底就永远轮不到 —— 又变回 401。
    // 所以「任意一个通道对得上就放行」这个语义必须被钉住。
    const headerPoisoned = await request(`/api/admin/records?token=${TEST}`, withToken('gateway-injected-value'));
    check('关键回归：请求头被塞了错值时，查询串里的正确口令仍然放行',
      headerPoisoned.status === 200, `实际 ${headerPoisoned.status}`);

    const resetByQuery = await request(`/api/admin/reset?token=${REAL}`, {method: 'POST'});
    check('清空接口也能走查询串（POST 同样会丢头）', resetByQuery.status === 200, `实际 ${resetByQuery.status}`);

    const health = await request('/api/health');
    check('健康检查不泄漏正式口令', !health.text.includes(REAL));
    check('健康检查不泄漏测试口令', !health.text.includes(TEST));
    check('健康检查仍然只说「开没开」', /"adminEnabled":true/.test(health.text), health.text.slice(0, 140));

    // /admin 页面本身不需要口令就能打开（口令是在接口上校验的）
    const page = await request('/admin');
    check('/admin 页面可打开（口令拦在接口上，不是拦在页面上）', page.status === 200, `实际 ${page.status}`);
  }
} finally {
  child.kill('SIGTERM');
  rmSync(dataDir, {recursive: true, force: true});
}

console.log('');
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`管理台口令：${passed} 项通过，${failures.length} 项失败。`);
  process.exit(1);
} else {
  console.log(`管理台口令：${passed} 项全部通过（两个口令都放行 / 三个通道都放行 / 错法与近似值都 401 / 健康检查不泄漏）。未联网。`);
}
