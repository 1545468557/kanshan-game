// 知乎 OAuth 端到端测试：起**真的** server.mjs，用真的 HTTP 请求走完整条登录链路。
//
// 单元测试证明的是「函数算得对」；这个文件证明的是「接起来能用」——
// 也就是比赛清单里那句「登录流程经过实际运行验证」。
//
// 怎么做到离线又不花钱：
//   · 用一个本地假服务冒充知乎的令牌接口，靠 ZHIHU_OAUTH_TOKEN_ENDPOINT 指过去，
//     于是「换 token」这一步真的发了 HTTP 请求，只是目的地是我们自己；
//   · App ID / App Key 都是随手编的假值，不是真凭证；
//   · 从头到尾不碰 openapi.zhihu.com，也不碰任何大模型。
//
// 顺带钉住三条上线后最容易出事、又最不容易被发现的规矩：
//   · 授权地址里只能有 app_id，不能有 app_key；
//   · 任何响应（正文 + 响应头）都不许出现 app_key；
//   · 回调里没有 code / state 验不过 / 换不到 token 时，一律「明确失败」，
//     绝不种会话 cookie —— 否则玩家明明没登录成功，后台却把他算进了人气奖。

import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createServer as createHttpServer} from 'node:http';
import {mkdtempSync, readFileSync, rmSync, existsSync} from 'node:fs';
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

// ---- 假令牌接口 ----
const tokenCalls = [];
let tokenReply = {status: 200, body: {access_token: 'e2e-oauth-token', expires_in: 2592000}};
const tokenPort = await freePort();
const tokenServer = createHttpServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    tokenCalls.push({method: req.method, url: req.url, headers: req.headers, body});
    res.writeHead(tokenReply.status, {'content-type': 'application/json'});
    res.end(typeof tokenReply.body === 'string' ? tokenReply.body : JSON.stringify(tokenReply.body));
  });
});
await new Promise(resolve => tokenServer.listen(tokenPort, '127.0.0.1', resolve));

const APP_ID = 'e2e-app-id-0001';
const APP_KEY = 'e2e-app-key-not-a-real-secret';
const CALLBACK = '/api/auth/zhihu/callback';

const dataDir = mkdtempSync(join(tmpdir(), 'bluoauth-'));
const port = await freePort();
const base = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, [join(root, 'server.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
    MODEL_API_KEY: '',
    ADMIN_PASSWORD: '',
    // 同上：本机 .env.local 里也有这个键，不清掉会从文件读进来（优先级：进程环境变量 > 文件）
    ADMIN_TEST_PASSWORD: '',
    // 本地请求不要走代理
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
    ZHIHU_OAUTH_APP_ID: APP_ID,
    ZHIHU_OAUTH_APP_KEY: APP_KEY,
    // 必须和下面断言用的完全一致（含协议、域名、路径、尾部没有斜杠）
    ZHIHU_OAUTH_REDIRECT_URI: `${base}${CALLBACK}`,
    ZHIHU_OAUTH_TOKEN_ENDPOINT: `http://127.0.0.1:${tokenPort}/access_token`
  },
  stdio: 'ignore'
});

// 所有响应都留一份，最后统一扫「有没有密钥漏出去」。
const seen = [];

function cookieFrom(response, name) {
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  for (const line of raw) {
    const m = new RegExp(`(?:^|[;,]\\s*)${name}=([^;,]*)`).exec(String(line));
    if (m) return m[1];
  }
  return '';
}

async function request(path, options = {}) {
  const res = await fetch(base + path, {redirect: 'manual', ...options});
  const text = await res.text();
  const headers = {};
  for (const [key, value] of res.headers) headers[key] = value;
  // set-cookie 在 Headers 上会被合并，单独取一份完整的
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  seen.push({path, status: res.status, location: res.headers.get('location') || '', text, headers, setCookies});
  return {status: res.status, location: res.headers.get('location') || '', text, headers, setCookies, raw: res};
}

try {
  // ---- 等服务起来 ----
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
    // ---- 1. 配了凭证：入口打开，但还没登录 ----
    const me0 = await request('/api/auth/me');
    const me0Body = JSON.parse(me0.text);
    check('配了凭证时登录功能应打开', me0Body.enabled === true, me0.text);
    check('一开始应当未登录', me0Body.loggedIn === false, me0.text);
    check('登录状态不能被缓存', String(me0.headers['cache-control'] || '').includes('no-store'), String(me0.headers['cache-control']));

    // ---- 2. 点登录：跳到知乎官方授权页 ----
    const start = await request('/api/auth/zhihu/start');
    check('发起授权应 302', start.status === 302, String(start.status));
    check('应跳到知乎官方授权页', start.location.startsWith('https://openapi.zhihu.com/authorize?'), start.location);
    const authorize = new URL(start.location);
    check('授权地址带 response_type=code', authorize.searchParams.get('response_type') === 'code');
    check('授权地址带 app_id', authorize.searchParams.get('app_id') === APP_ID);
    check('授权地址必须用活动页登记的回调地址，一字不差',
      authorize.searchParams.get('redirect_uri') === `${base}${CALLBACK}`, String(authorize.searchParams.get('redirect_uri')));
    check('授权地址里绝对不能出现 app_key', !start.location.includes(APP_KEY) && !/app_key/i.test(start.location));
    check('授权地址要带 state（防伪造回调）', Boolean(authorize.searchParams.get('state')));

    const stateCookie = cookieFrom(start.raw, 'bb_oauth_state');
    check('state 应写进 cookie', stateCookie.length > 0);
    check('state cookie 必须 HttpOnly', start.setCookies.some(line => /bb_oauth_state=/.test(line) && /HttpOnly/i.test(line)));

    // ---- 3. 该停就停：没有 code ----
    const before = tokenCalls.length;
    const noCode = await request(`/api/auth/zhihu/callback`, {headers: {cookie: `bb_oauth_state=${stateCookie}`}});
    check('回调没有授权码时要有明确结论', noCode.location === '/?zhihu=no_code', noCode.location);
    check('回调没有授权码时**不许**去换 token', tokenCalls.length === before, `多了 ${tokenCalls.length - before} 次`);
    check('回调没有授权码时不许种会话 cookie', !noCode.setCookies.some(line => /bb_session=/.test(line)));

    // ---- 4. 该停就停：state 对不上 ----
    const forged = await request(`${CALLBACK}?authorization_code=AC-FORGED`, {headers: {cookie: 'bb_oauth_state=forged.value'}});
    check('伪造的 state 要被挡下', forged.location === '/?zhihu=bad_state', forged.location);
    check('state 验不过时**不许**去换 token', tokenCalls.length === before, `多了 ${tokenCalls.length - before} 次`);
    check('state 验不过时不许种会话 cookie', !forged.setCookies.some(line => /bb_session=/.test(line)));

    const noState = await request(`${CALLBACK}?authorization_code=AC-NOSTATE`);
    check('完全没有 state 时也要挡下', noState.location === '/?zhihu=bad_state', noState.location);
    check('没有 state 时不许去换 token', tokenCalls.length === before);

    // ---- 5. 换不到 token 时不能算登录成功 ----
    tokenReply = {status: 200, body: {code: 20000, message: 'success'}};
    const startAgain = await request('/api/auth/zhihu/start');
    const state2 = cookieFrom(startAgain.raw, 'bb_oauth_state');
    const trap = await request(`${CALLBACK}?authorization_code=AC-TRAP`, {headers: {cookie: `bb_oauth_state=${state2}`}});
    // 官方点名的坑：业务码 20000 但不是真的拿到了 access_token。
    check('业务码 20000 但没有 access_token 时不能算成功', trap.location === '/?zhihu=exchange_failed', trap.location);
    check('换 token 失败时不许种会话 cookie', !trap.setCookies.some(line => /bb_session=/.test(line)));

    // ---- 6. 正常登录：整条链路走通 ----
    tokenReply = {status: 200, body: {access_token: 'e2e-oauth-token', expires_in: 2592000}};
    const callsBefore = tokenCalls.length;
    const start3 = await request('/api/auth/zhihu/start?next=%2Froom.html');
    const state3 = cookieFrom(start3.raw, 'bb_oauth_state');
    const done = await request(`${CALLBACK}?authorization_code=AC-E2E`, {headers: {cookie: `bb_oauth_state=${state3}`}});

    check('换到 token 后要跳回站内页面', done.location === '/room.html', done.location);
    const sessionCookie = cookieFrom(done.raw, 'bb_session');
    check('登录成功应种下会话 cookie', sessionCookie.length > 0);
    check('会话 cookie 必须 HttpOnly（脚本读不到）', done.setCookies.some(line => /bb_session=/.test(line) && /HttpOnly/i.test(line)));
    check('一次性 state 必须立刻作废', done.setCookies.some(line => /bb_oauth_state=;/.test(line)));

    check('应恰好发起一次换 token 请求', tokenCalls.length === callsBefore + 1, `实际新增 ${tokenCalls.length - callsBefore} 次`);
    const call = tokenCalls[tokenCalls.length - 1] || {headers: {}, body: ''};
    check('换 token 必须是 POST', call.method === 'POST', String(call.method));
    check('换 token 必须打在 AG 官方路径上（这里是假服务的 /access_token）', String(call.url) === '/access_token', String(call.url));
    const form = new URLSearchParams(String(call.body || ''));
    check('表单带上了 app_id', form.get('app_id') === APP_ID);
    check('表单带上了 app_key', form.get('app_key') === APP_KEY);
    check('grant_type 是固定值 authorization_code', form.get('grant_type') === 'authorization_code');
    check('表单字段名是 code', form.get('code') === 'AC-E2E');
    check('表单回传同一个 redirect_uri', form.get('redirect_uri') === `${base}${CALLBACK}`, String(form.get('redirect_uri')));
    check('换 token 用的是 form-urlencoded', String(call.headers['content-type'] || '').includes('application/x-www-form-urlencoded'));

    // ---- 7. 登录态真的生效 ----
    const me1 = await request('/api/auth/me', {headers: {cookie: `bb_session=${sessionCookie}`}});
    const me1Body = JSON.parse(me1.text);
    check('带上会话 cookie 后应报告已登录', me1Body.loggedIn === true, me1.text);
    check('应给出登录时间与过期时间', Number.isFinite(me1Body.since) && Number.isFinite(me1Body.expiresAt), me1.text);
    check('me 里不许出现 app_key', !me1.text.includes(APP_KEY));

    const forgedSession = await request('/api/auth/me', {headers: {cookie: 'bb_session=made-up.value'}});
    check('伪造的会话 cookie 换不来登录态', JSON.parse(forgedSession.text).loggedIn === false, forgedSession.text);

    // ---- 8. 登录用户的结案会被单独记一笔（人气奖要数） ----
    const submit = await request('/api/submit', {
      method: 'POST',
      headers: {'content-type': 'application/json', cookie: `bb_session=${sessionCookie}`},
      body: JSON.stringify({sessionId: 'e2e', answers: {what: '是演示用的模拟道具血'}})
    });
    check('提交结案应成功', submit.status === 200 && JSON.parse(submit.text).ok === true, submit.text.slice(0, 140));

    const submitAnon = await request('/api/submit', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({sessionId: 'e2e-anon', answers: {what: '不知道'}})
    });
    check('未登录也能提交结案（挡人的是前端那层登录门，接口自己不许 403 —— 门万一失效也不能让玩家白玩一场）', submitAnon.status === 200, String(submitAnon.status));

    const recordsPath = join(dataDir, 'records.jsonl');
    check('记录文件应该存在', existsSync(recordsPath));
    const rows = existsSync(recordsPath)
      ? readFileSync(recordsPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
      : [];
    const logins = rows.filter(row => row.kind === 'login');
    const submits = rows.filter(row => row.kind === 'submit');
    check('登录成功应留下一条 login 记录', logins.length === 1, JSON.stringify(logins));
    check('登录记录里不许有 token 或授权码', !JSON.stringify(logins).includes('e2e-oauth-token') && !JSON.stringify(logins).includes('AC-E2E'), JSON.stringify(logins));
    check('登录用户的结案应被标记 zhihu=true', submits.some(row => row.zhihu === true), JSON.stringify(submits.map(row => row.zhihu)));
    check('未登录用户的结案应被标记 zhihu=false', submits.some(row => row.zhihu === false), JSON.stringify(submits.map(row => row.zhihu)));
    check('结案记录里不许出现 app_key', !JSON.stringify(submits).includes(APP_KEY));

    // ---- 8b. 回调落点宁宽勿窄：路径写歪了也要接得住 ----
    //
    // 背景：活动页「回调地址」那一栏是手填的，而我们看不见那一栏。
    // 只要手填，就一定会出现「多一个尾斜杠 / 少写一段路径 / 大小写不一致」这类偏差，
    // 而接收端认窄的代价是「在知乎点完授权，跳回来一张 404 空白页」。
    // 所以这里故意用几种「写歪了」的路径去打，期望**每一种都进到回调逻辑**。
    //
    // 怎么判断「进到了回调逻辑」而不是 404：回跳目标会是 `/?zhihu=...`。
    // 全部用无效 state / 不带 code，所以不会真的登录成功 —— 免得污染上面的记录断言。
    const weirdPaths = [
      ['/callback/?authorization_code=AC-ALT', '尾斜杠 + 短路径'],
      ['/oauth/return?authorization_code=AC-ALT', '自造的 oauth 路径'],
      ['/AUTH/Callback?code=AC-ALT', '大小写不一致 + 兼容参数 code']
    ];
    for (const [spec, label] of weirdPaths) {
      const hit = await request(spec, {headers: {cookie: 'bb_oauth_state=forged.value'}});
      check(`写歪的回调路径也要接住（${label}）`, hit.location === '/?zhihu=bad_state', `${hit.status} ${hit.location}`);
    }

    // 多一个尾斜杠：正常公告路径 + 尾斜杠，仍要走到「没有授权码」这一步。
    const startAlt = await request('/api/auth/zhihu/start');
    const stateAlt = cookieFrom(startAlt.raw, 'bb_oauth_state');
    const slash = await request(`${CALLBACK}/`, {headers: {cookie: `bb_oauth_state=${stateAlt}`}});
    check('公告路径多一个尾斜杠也要接住', slash.location === '/?zhihu=no_code', `${slash.status} ${slash.location}`);

    // ✗ 反例：放宽不等于乱接。普通接口带着 code 参数时不许被当成回调，
    // 否则任何一条 GET 接口都可能被一段伪造的查询串带进登录逻辑。
    const notCallback = await request('/api/submit?code=AC-ALT');
    check('✗ 普通接口带 code 时不许被当成回调', !String(notCallback.location).includes('zhihu='), `${notCallback.status} ${notCallback.location}`);

    // ---- 8c. 「对表」用的诊断接口 ----
    // 这一栏靠人眼核对，所以要给出长度和指纹，而不是让人去比 66 个字符。
    const conf = await request('/api/auth/zhihu/config');
    const confBody = JSON.parse(conf.text);
    check('配置诊断接口应可用', conf.status === 200 && confBody.ok === true, conf.text.slice(0, 160));
    check('诊断接口要给出回调地址原文', confBody.redirectUri === `${base}${CALLBACK}`, String(confBody.redirectUri));
    check('诊断接口要给出长度与指纹', confBody.redirectUriLength === (`${base}${CALLBACK}`).length && /^[0-9a-f]{12}$/.test(String(confBody.redirectUriFingerprint)), JSON.stringify({len: confBody.redirectUriLength, fp: confBody.redirectUriFingerprint}));
    check('✗ 诊断接口不许泄漏 app_key', !conf.text.includes(APP_KEY), conf.text.slice(0, 200));

    // ---- 8d. 应急通道：把授权码从地址栏人工搬回来 ----
    //
    // 这条通道的全部意义就是「回调地址那一栏填错了也能登录」：
    // 授权码会落在别处，但它就在浏览器地址栏里，粘回来照样能换到 token。
    const startManual = await request('/api/auth/zhihu/start?next=%2Froom.html');
    const stateManual = cookieFrom(startManual.raw, 'bb_oauth_state');
    tokenReply = {status: 200, body: {access_token: 'e2e-manual-token', expires_in: 2592000}};
    const manual = await request('/api/auth/zhihu/manual', {
      method: 'POST',
      headers: {'content-type': 'application/json', cookie: `bb_oauth_state=${stateManual}`},
      body: JSON.stringify({input: 'https://www.zhihu.com/ring/moltbook/api/community/quickstart?authorization_code=AC-MANUAL'})
    });
    const manualBody = JSON.parse(manual.text);
    check('应急通道应能完成登录', manual.status === 200 && manualBody.ok === true, manual.text.slice(0, 160));
    check('应急通道应跳回发起时指定的页面', manualBody.next === '/room.html', String(manualBody.next));
    check('应急通道要种下会话 cookie', cookieFrom(manual.raw, 'bb_session').length > 0);
    const manualForm = new URLSearchParams(String(tokenCalls[tokenCalls.length - 1]?.body || ''));
    check('应急通道只用裸码换 token', manualForm.get('code') === 'AC-MANUAL', manualForm.get('code'));
    check('应急通道回传「当时声明的」回调地址', manualForm.get('redirect_uri') === `${base}${CALLBACK}`, String(manualForm.get('redirect_uri')));
    check('应急通道换 token 仍然带 app_id 与 app_key', manualForm.get('app_id') === APP_ID && manualForm.get('app_key') === APP_KEY);
    check('✗ 应急通道的响应里不许出现 token 或 app_key', !manual.text.includes('e2e-manual-token') && !manual.text.includes(APP_KEY), manual.text.slice(0, 200));

    // ✗ 没有合法 state 时必须停住：否则这条路就成了「拿别人的授权码登录」。
    const manualForged = await request('/api/auth/zhihu/manual', {
      method: 'POST',
      headers: {'content-type': 'application/json', cookie: 'bb_oauth_state=forged.value'},
      body: JSON.stringify({input: 'AC-SOMEONE-ELSE'})
    });
    check('✗ 应急通道伪造 state 时要 400', manualForged.status === 400, String(manualForged.status));
    check('✗ 应急通道失败时不许种会话 cookie', !manualForged.setCookies.some(line => /bb_session=/.test(line)));

    const manualJunk = await request('/api/auth/zhihu/manual', {
      method: 'POST',
      headers: {'content-type': 'application/json', cookie: `bb_oauth_state=${stateManual}`},
      body: JSON.stringify({input: '<html>不是码</html>'})
    });
    check('✗ 应急通道粘进来的不是码时要 400', manualJunk.status === 400, String(manualJunk.status));

    // ---- 9. 退出 ----
    const out = await request('/api/auth/logout', {method: 'POST', headers: {cookie: `bb_session=${sessionCookie}`}});
    check('退出应返回成功', JSON.parse(out.text).loggedIn === false, out.text);
    check('退出要清掉会话 cookie', out.setCookies.some(line => /bb_session=;/.test(line) && /Max-Age=0/.test(line)));
    const me2 = await request('/api/auth/me', {headers: {cookie: `bb_session=${sessionCookie}`}});
    check('退出后旧 cookie 立刻失效', JSON.parse(me2.text).loggedIn === false, me2.text);

    // ---- 10. 安全兜底：整场跑下来，密钥一次都没漏 ----
    // 只扫**响应**（正文 / 响应头 / 跳转目标），不扫我们自己发出的请求地址 ——
    // 请求地址里带 authorization_code 是 OAuth 的正常形态，浏览器地址栏也会有。
    // 要钉的是「服务端别把它再回显出去」。
    const dump = JSON.stringify(seen.map(row => ({status: row.status, location: row.location, text: row.text, headers: row.headers, setCookies: row.setCookies})));
    check('全程任何响应里都不许出现 app_key', !dump.includes(APP_KEY), '有响应把密钥带出来了');
    check('全程任何响应里都不许出现 access_token', !dump.includes('e2e-oauth-token'), '有响应把 token 带出来了');
    check('全程任何响应里都不许把授权码回显出来', !dump.includes('AC-E2E'), '有响应把授权码带出来了');
    // 反面确认：跳转目标确实是我们自己算的站内地址，没有把授权码原样带回前端。
    check('跳转目标不带任何查询参数', !seen.some(row => /zhihu\/callback\?/.test(row.location)), JSON.stringify(seen.map(row => row.location).filter(Boolean)));

    // 健康检查只能说「配没配」，不能说值。
    const health = await request('/api/health');
    check('健康检查应报告登录功能已启用', /已启用/.test(health.text), health.text.slice(0, 200));
    check('健康检查里不许出现 app_key 或 app_id', !health.text.includes(APP_KEY) && !health.text.includes(APP_ID), health.text.slice(0, 200));
  }
} finally {
  child.kill('SIGTERM');
  tokenServer.close();
  rmSync(dataDir, {recursive: true, force: true});
}

if (failures.length) {
  console.log(`知乎 OAuth 端到端：${passed} 项通过，${failures.length} 项失败`);
  for (const row of failures) console.log('  ✗ ' + row);
  process.exitCode = 1;
} else {
  console.log(`知乎 OAuth 端到端：${passed} 项全部通过（真服务 + 真 HTTP + 假令牌接口：授权跳转 / 回跳落站 / 换 token 表单 / 会话生效 / 结案标记 / 失败不假装成功 / 密钥不外泄）。未联网，未使用真实凭证。`);
}
