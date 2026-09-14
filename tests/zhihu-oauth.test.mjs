// 知乎 OAuth 登录：契约层测试。全程不联网、不碰真实凭证。
//
// 为什么值得单独测：这条链路有四个**静默失败**的坑，每一个的表面症状都是
// 「看起来登录成功了但其实没登录」，而登录人数是要计入人气奖的。
//
//   1. 官方点名：换 token 的响应可能用 `code: 20000` 表示业务成功，
//      **不能只看这个字段**。反过来，只凭 `code` 判成功同样错 —— 成功与否
//      只认响应里有没有 `access_token`。
//   2. 回调参数实测是 `authorization_code`，官方要求兼容 `code`。
//      读错字段名 → 永远拿不到 code → 永远登录不上，而且不报错。
//   3. `code` 是**一次性**的，换 token 的表单字段名偏偏也叫 `code`
//      （不是 `authorization_code`）。写错就是 400。
//   4. 换 token 的表单里带着 App Key。任何「把响应体原样打出来」的日志
//      都可能把密钥写进文件 —— 所以失败信息只允许回「错在哪」。
//
// 另外三条安全断言钉在这里：App Key 不许进授权 URL、不许进会话 cookie、
// 不许出现在任何响应里；`?next=` 不许被用来跳去外站。

import {
  buildAuthorizeUrl,
  callbackCode,
  callbackError,
  parseTokenResponse,
  signedValue,
  unsign,
  safeNext,
  packState,
  unpackState,
  cookieHeader,
  parseCookies,
  createSessionStore,
  createZhihuOAuth,
  AUTHORIZE_ENDPOINT,
  TOKEN_ENDPOINT,
  CALLBACK_PATH,
  acceptedCallbackPaths,
  looksLikeCallback,
  normalizePath,
  diagnosticRedirect,
  DIAGNOSTIC_REDIRECTS,
  manualCodeFrom,
  safeRedirectUri,
  SESSION_COOKIE,
  STATE_COOKIE
} from '../lib/zhihu-oauth.mjs';

let passed = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ' — ' + detail : ''}`);
}

// 最小的 req / res 替身。res 的 writeHead 会**合并**已 setHeader 的头，
// 和 Node 真实行为一致 —— 不然「先 setHeader('set-cookie') 再 writeHead」
// 在测试里会假通过。
function fakeReq({headers = {}} = {}) {
  return {method: 'GET', url: '/', headers};
}
function fakeRes() {
  const res = {
    status: 0,
    headers: {},
    body: '',
    ended: false,
    writeHead(status, headers = {}) {
      res.status = status;
      Object.assign(res.headers, headers);
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
    },
    end(body = '') {
      res.body = body;
      res.ended = true;
    }
  };
  return res;
}

const config = {
  zhihuOAuth: {appId: 'app-id-0001', appKey: 'app-key-abcdefghijklmnop', redirectUri: '', tokenEndpoint: ''},
  zhihu: {secret: ''}
};

// 假的令牌接口。记下每一次出站请求，方便断言「到底调没调」「表单长什么样」。
function stubToken({status = 200, body = {access_token: 'zh-token', expires_in: 2592000}} = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({url: String(url), method: options.method, headers: options.headers || {}, body: String(options.body || '')});
    if (body instanceof Error) throw body;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: {'content-type': 'application/json'}
    });
  };
  return {fetchImpl, calls};
}

function oauthWith(options = {}) {
  const stub = stubToken(options.tokenResponse);
  const oauth = createZhihuOAuth({
    config: {...config, ...(options.config || {}), zhihuOAuth: {...config.zhihuOAuth, ...(options.config?.zhihuOAuth || {})}},
    fetchImpl: stub.fetchImpl,
    log: () => {}
  });
  return {oauth, calls: stub.calls};
}

// 走一遍 start，把 Set-Cookie 里的 state 取出来 —— 这正是真实浏览器会做的事。
async function startAndReadState(oauth, headers = {'host': 'game.example.com', 'x-forwarded-proto': 'https'}) {
  const res = fakeRes();
  await oauth.handleStart(fakeReq({headers}), res, new URL('http://x/api/auth/zhihu/start'));
  const cookies = parseCookies(String(res.headers['set-cookie'] || '').split(',').join(';'));
  return {res, state: cookies[STATE_COOKIE] || ''};
}

// ---------------------------------------------------------------- 1. 授权地址

{
  const url = buildAuthorizeUrl({appId: 'app-id-0001', redirectUri: 'https://g.example.com/api/auth/zhihu/callback', state: 'st-1'});
  check('授权地址应指向官方端点', url.startsWith(`${AUTHORIZE_ENDPOINT}?`), url.slice(0, 80));
  const parsed = new URL(url);
  check('response_type 固定为 code', parsed.searchParams.get('response_type') === 'code');
  check('redirect_uri 原样拼进去（不能改写）', parsed.searchParams.get('redirect_uri') === 'https://g.example.com/api/auth/zhihu/callback');
  check('app_id 应出现在授权地址上', parsed.searchParams.get('app_id') === 'app-id-0001');
  check('state 应原样带上', parsed.searchParams.get('state') === 'st-1');
  // App ID 是「项目公开配置」，App Key 是「只在后端换 token」——两者绝不能混。
  check('授权地址里不许出现 app_key', !url.toLowerCase().includes('app_key') && !url.includes(config.zhihuOAuth.appKey));
  check('回调路径常量必须是 /api/auth/zhihu/callback', CALLBACK_PATH === '/api/auth/zhihu/callback');
}

// ---------------------------------------------------------------- 2. 回调参数

{
  check('主路径读 authorization_code', callbackCode({authorization_code: 'AC-1'}) === 'AC-1');
  check('可兼容读取 code', callbackCode({code: 'AC-2'}) === 'AC-2');
  check('两个都有时优先 authorization_code', callbackCode({code: 'AC-2', authorization_code: 'AC-1'}) === 'AC-1');
  check('都没有时返回空串', callbackCode({}) === '');
  check('空串不该被当成有效 code', callbackCode({authorization_code: ''}) === '');
  check('数组形式取第一个', callbackCode({authorization_code: ['AC-1', 'AC-9']}) === 'AC-1');
  check('error 参数应被识别', callbackError({error: 'access_denied'}) === 'access_denied');
  check('没有 error 时返回空串', callbackError({}) === '');
}

// ---------------------------------------------------------------- 3. 成功判定

{
  const ok = parseTokenResponse({access_token: 'T', expires_in: 60});
  check('有 access_token 即成功', ok.ok === true && ok.token === 'T');
  check('expires_in 应被读出来', ok.expiresInSeconds === 60);
  check('expires_in 缺失时退到 30 天', parseTokenResponse({access_token: 'T'}).expiresInSeconds === 30 * 24 * 3600);

  // 官方点名的坑：code:20000 是**业务成功码**，不是 access_token 的替代品。
  const trap = parseTokenResponse({code: 20000, message: 'success'});
  check('只有 code:20000 而没有 access_token 时，必须判失败', trap.ok === false, JSON.stringify(trap));
  check('判失败时要说清原因', typeof trap.reason === 'string' && trap.reason.length > 0);

  check('嵌套 data 里的 token 也要认', parseTokenResponse({data: {access_token: 'T2'}}).ok === true);
  check('非对象响应判失败', parseTokenResponse('nope').ok === false);
  check('null 响应判失败', parseTokenResponse(null).ok === false);

  // 失败信息是会被写进日志的，所以绝不允许夹带响应体。
  const echoed = parseTokenResponse({code: 40001, message: 'bad request', app_key: config.zhihuOAuth.appKey, access_token: ''});
  check('失败信息不许回显 app_key', !JSON.stringify(echoed).includes(config.zhihuOAuth.appKey), JSON.stringify(echoed));
  check('失败信息里的 message 要截断', parseTokenResponse({message: 'x'.repeat(500)}).reason.length <= 140);
}

// ---------------------------------------------------------------- 4. 签名与 cookie

{
  const secret = 'k-1';
  const signed = signedValue(secret, 'sid-1');
  check('签名可以验回来', unsign(secret, signed) === 'sid-1');
  check('改一个字符就验不过', unsign(secret, signedValue(secret, 'sid-1').replace(/sid-1/, 'sid-2')) === '');
  check('换一个密钥就验不过', unsign('k-2', signed) === '');
  check('完全没有点的串验不过', unsign(secret, 'sid-1') === '');
  check('空串验不过', unsign(secret, '') === '');
  check('只有点没有值的串验不过', unsign(secret, '.abc') === '');

  const cookie = cookieHeader(SESSION_COOKIE, 'v', {maxAge: 120, secure: true});
  check('会话 cookie 必须是 HttpOnly', cookie.includes('HttpOnly'), cookie);
  check('https 下要加 Secure', cookie.includes('Secure'));
  check('SameSite 用 Lax（回调是顶级导航）', cookie.includes('SameSite=Lax'));
  check('Max-Age 要能设成 0 来删除', cookieHeader('a', '', {maxAge: 0}).includes('Max-Age=0'));
  check('http 下不加 Secure（否则本地登录调试不了）', !cookieHeader('a', 'v', {secure: false}).includes('Secure'));

  const jar = parseCookies('a=1; bb_session=x.y; c=3');
  check('cookie 解析出多个键', jar.a === '1' && jar.c === '3');
  check('含点的值不会被截断', jar[SESSION_COOKIE] === 'x.y');
}

// ---------------------------------------------------------------- 5. 回调地址安全

{
  check('站内路径照常通过', safeNext('/room.html') === '/room.html');
  check('带查询的站内路径也通过', safeNext('/?v=archive') === '/?v=archive');
  check('缺省回到首页', safeNext('') === '/' && safeNext(null) === '/');
  // 这一条是开放重定向的经典绕过写法，必须挡住。
  check('//evil.com 必须被挡', safeNext('//evil.com') === '/');
  check('完整外链必须被挡', safeNext('https://evil.com') === '/');
  check('反斜杠变体必须被挡', !safeNext('\\\\evil.com').startsWith('\\\\'));
  check('换行注入必须被挡', safeNext('/a\r\nSet-Cookie: x=1') === '/');
}

// ---------------------------------------------------------------- 6. state

{
  const secret = 'k-1';
  const packed = packState(secret, {nonce: 'n-1', next: '/room.html'});
  const read = unpackState(secret, packed);
  check('state 能往返', read && read.nonce === 'n-1');
  check('state 里带着回跳目标', read && read.next === '/room.html');
  check('state 被篡改就失效', unpackState('k-2', packed) === null);
  check('state 是空串时失效', unpackState(secret, '') === null);
  // state 里塞外链也不能得逞 —— 恶意站点可以自己构造回调链接。
  const evil = unpackState(secret, packState(secret, {nonce: 'n', next: '//evil.com'}));
  check('state 里的外链回跳会被降级', evil && evil.next === '/');
}

// ---------------------------------------------------------------- 7. 会话表

{
  let clock = 1000;
  const sessions = createSessionStore({now: () => clock});
  const id = sessions.create({ttlSeconds: 10});
  check('新建的会话能取到', sessions.get(id) !== null);
  check('会话数会被统计', sessions.size === 1);
  check('取不存在的会话返回 null', sessions.get('nope') === null);
  check('伪造的会话 id 返回 null', sessions.get('') === null);

  clock += 11000;
  check('过期后取不到', sessions.get(id) === null);
  check('过期后会被清掉', sessions.size === 0);

  clock += 1;
  const kept = sessions.create({ttlSeconds: 999});
  sessions.attach(kept, {contentCount: 7});
  check('可以给会话挂上补充信息', sessions.get(kept).profile.contentCount === 7);
  check('删除会话返回 true', sessions.drop(kept) === true);
  check('重复删除返回 false', sessions.drop(kept) === false);
}

// ---------------------------------------------------------------- 8. 没配凭证时

{
  const {oauth, calls} = oauthWith({config: {zhihuOAuth: {appId: '', appKey: ''}}});
  check('缺凭证时 enabled 为 false', oauth.enabled === false);
  const described = oauth.describe();
  check('缺凭证时要说明缺哪两个变量', /ZHIHU_OAUTH_APP_ID/.test(described.status) && /ZHIHU_OAUTH_APP_KEY/.test(described.status), described.status);

  const onlyId = oauthWith({config: {zhihuOAuth: {appId: 'a', appKey: ''}}}).oauth.describe();
  check('只填了一半要说清缺的是 key', /ZHIHU_OAUTH_APP_KEY/.test(onlyId.status) && !/ZHIHU_OAUTH_APP_ID/.test(onlyId.status), onlyId.status);

  const res = fakeRes();
  await oauth.handleStart(fakeReq({headers: {host: 'x'}}), res, new URL('http://x/api/auth/zhihu/start'));
  check('没配凭证时点登录要明确告知，而不是假装成功', res.status === 302 && res.headers.location === '/?zhihu=unconfigured', `${res.status} ${res.headers.location}`);
  check('没配凭证时不该有任何出站请求', calls.length === 0);

  const res2 = fakeRes();
  await oauth.handleCallback(fakeReq({headers: {}}), res2, new URL('http://x/api/auth/zhihu/callback?authorization_code=X'));
  check('没配凭证时回调也不能当成功', res2.headers.location === '/?zhihu=unconfigured');
  check('没配凭证时回调不该请求令牌接口', calls.length === 0);
}

// ---------------------------------------------------------------- 9. describe 不许泄密

{
  const {oauth} = oauthWith();
  const text = JSON.stringify(oauth.describe());
  check('describe 里不许出现 App Key 原文', !text.includes(config.zhihuOAuth.appKey), text);
  check('describe 应说明已配置', /已配置/.test(oauth.describe().status));
  // 指纹是官方允许的诊断信息（长度 + SHA-256 短前缀），用来核对「填的是不是同一把 key」。
  check('describe 应给出可用于核对的短指纹', /指纹 [0-9a-f]{8}/.test(oauth.describe().status), oauth.describe().status);
  check('默认不该报出令牌端点被改写', oauth.describe().tokenEndpointOverride === '');

  const overridden = oauthWith({config: {zhihuOAuth: {tokenEndpoint: 'http://127.0.0.1:9/token'}}}).oauth.describe();
  check('改了令牌端点要在诊断里显形（防止测试配置被带上线）', overridden.tokenEndpointOverride === 'http://127.0.0.1:9/token');
}

// ---------------------------------------------------------------- 10. 发起授权

{
  const {oauth, calls} = oauthWith();
  const {res, state} = await startAndReadState(oauth);
  check('发起授权应 302', res.status === 302, String(res.status));
  check('应跳到知乎官方授权页', String(res.headers.location).startsWith(AUTHORIZE_ENDPOINT + '?'));
  check('state 应写进 cookie', state.length > 0);
  const setCookie = String(res.headers['set-cookie']);
  check('state cookie 必须是 HttpOnly', /HttpOnly/i.test(setCookie), setCookie);
  check('state cookie 要有存活时间（过期链接不该能用）', /Max-Age=600/.test(setCookie), setCookie);
  check('发起授权不该请求令牌接口', calls.length === 0);

  // 没配固定回调地址时按访问域名推导 —— 这正是本地调试能跑通的原因。
  const derived = new URL(String(res.headers.location)).searchParams.get('redirect_uri');
  check('回调地址应由访问域名推导出来', derived === `https://game.example.com${CALLBACK_PATH}`, String(derived));
  check('https 访问时状态 cookie 要带 Secure（回调不能明文走）', /Secure/i.test(String(res.headers['set-cookie'])));

  const localRes = fakeRes();
  await oauth.handleStart(fakeReq({headers: {host: '127.0.0.1:4180'}}), localRes, new URL('http://x/api/auth/zhihu/start'));
  const localDerived = new URL(String(localRes.headers.location)).searchParams.get('redirect_uri');
  check('本地 http 访问推导出 http（否则本地根本登录不了）', localDerived === `http://127.0.0.1:4180${CALLBACK_PATH}`, String(localDerived));
}

// 固定配置的回调地址必须逐字符使用，不许被请求头覆盖。
{
  const fixed = `https://blueblood-mystery.app.workbuddy.host${CALLBACK_PATH}`;
  const {oauth} = oauthWith({config: {zhihuOAuth: {redirectUri: fixed}}});
  const res = fakeRes();
  await oauth.handleStart(fakeReq({headers: {host: 'other.example.com', 'x-forwarded-proto': 'https'}}), res, new URL('http://x/api/auth/zhihu/start'));
  check('配了固定回调地址就绝不改写', new URL(String(res.headers.location)).searchParams.get('redirect_uri') === fixed);
}

// ---------------------------------------------------------------- 11. 回调：该停就停

{
  // 没有 code —— 官方原文：停止流程，不继续换取 Token。
  const {oauth, calls} = oauthWith();
  const {state} = await startAndReadState(oauth);
  const res = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', 'x-forwarded-proto': 'https', cookie: `${STATE_COOKIE}=${state}`}}),
    res,
    new URL('http://x/api/auth/zhihu/callback')
  );
  check('回调里没有 code 时应明确失败', res.headers.location === '/?zhihu=no_code', String(res.headers.location));
  check('没有 code 时**绝不**请求令牌接口', calls.length === 0, `实际调用 ${calls.length} 次`);

  // 用户点了拒绝
  const denied = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', cookie: `${STATE_COOKIE}=${state}`}}),
    denied,
    new URL('http://x/api/auth/zhihu/callback?error=access_denied')
  );
  check('用户拒绝授权时应说明是「取消」', denied.headers.location === '/?zhihu=denied', String(denied.headers.location));
  check('用户拒绝时不该请求令牌接口', calls.length === 0);
}

{
  // state 对不上（要么过期，要么是伪造的回调）—— 不许换 token。
  const {oauth, calls, } = oauthWith();
  const res = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', cookie: `${STATE_COOKIE}=forged.value`}}),
    res,
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-1')
  );
  check('state 验不过时应明确失败', res.headers.location === '/?zhihu=bad_state', String(res.headers.location));
  check('state 验不过时**绝不**请求令牌接口', calls.length === 0, `实际调用 ${calls.length} 次`);

  const missing = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com'}}),
    missing,
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-1')
  );
  check('完全没有 state cookie 时也要失败', missing.headers.location === '/?zhihu=bad_state');
  check('没有 state 时不换 token', calls.length === 0);
}

// ---------------------------------------------------------------- 12. 回调：换 token 的表单契约

{
  const {oauth, calls} = oauthWith();
  const {state} = await startAndReadState(oauth);
  const res = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', 'x-forwarded-proto': 'https', cookie: `${STATE_COOKIE}=${state}`}}),
    res,
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-42')
  );

  check('应恰好请求一次令牌接口', calls.length === 1, `实际 ${calls.length} 次`);
  const call = calls[0] || {headers: {}, body: ''};
  check('必须 POST 到官方令牌端点', call.method === 'POST' && call.url === TOKEN_ENDPOINT, `${call.method} ${call.url}`);
  check('必须用 form-urlencoded', String(call.headers['content-type'] || '').includes('application/x-www-form-urlencoded'), String(call.headers['content-type']));

  const form = new URLSearchParams(call.body);
  check('表单要带 app_id', form.get('app_id') === config.zhihuOAuth.appId);
  check('表单要带 app_key', form.get('app_key') === config.zhihuOAuth.appKey);
  // 官方原文：grant_type 是固定值 authorization_code，**不要把表单字段改成 authorization_code**。
  check('grant_type 固定为 authorization_code', form.get('grant_type') === 'authorization_code');
  check('表单字段名是 code（不是 authorization_code）', form.get('code') === 'AC-42' && !form.has('authorization_code'), call.body);
  check('表单要回传同一个 redirect_uri', form.get('redirect_uri') === `https://game.example.com${CALLBACK_PATH}`, String(form.get('redirect_uri')));

  // 成功路径：会话种下去，App Key 一个字节都不能进响应。
  check('换到 token 后应跳回站内', res.headers.location === '/', String(res.headers.location));
  const setCookie = String(res.headers['set-cookie']);
  check('应种下会话 cookie', setCookie.includes(`${SESSION_COOKIE}=`), setCookie);
  check('会话 cookie 必须 HttpOnly', /HttpOnly/i.test(setCookie));
  check('会话 cookie 必须带 Secure（https）', /Secure/i.test(setCookie), setCookie);
  check('一次性 state 必须被清掉', /bb_oauth_state=;/.test(setCookie), setCookie);
  const whole = JSON.stringify({h: res.headers, b: res.body}) + String(res.headers.location);
  check('响应里不许出现 app_key', !whole.includes(config.zhihuOAuth.appKey));
  check('会话 cookie 里不许出现 app_key', !setCookie.includes(config.zhihuOAuth.appKey));
  check('会话 id 必须是不透明的（签名验得回来才认）', setCookie.includes('.') && !setCookie.includes('AC-42'));
  check('授权码不许出现在任何 cookie 里', !setCookie.includes('AC-42'));
}

// ---------------------------------------------------------------- 13. 换不到 token 时不能当成功

{
  // 官方点名的坑：业务码 20000 但没 token。
  const {oauth} = oauthWith({tokenResponse: {body: {code: 20000, message: 'success'}, status: 200}});
  const {state} = await startAndReadState(oauth);
  const res = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', cookie: `${STATE_COOKIE}=${state}`}}),
    res,
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-9')
  );
  check('业务码 20000 但没有 access_token 时不能算登录成功', res.headers.location === '/?zhihu=exchange_failed', String(res.headers.location));
  check('失败时不该种会话 cookie', !String(res.headers['set-cookie'] || '').includes(`${SESSION_COOKIE}=`), String(res.headers['set-cookie']));
}

{
  // 网络不通（比如代理把 openapi.zhihu.com 拦了）—— 同样只能是「失败」，不能崩。
  const {oauth} = oauthWith({tokenResponse: {body: Object.assign(new Error('connect ECONNREFUSED'), {name: 'TypeError'})}});
  const {state} = await startAndReadState(oauth);
  const res = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', cookie: `${STATE_COOKIE}=${state}`}}),
    res,
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-9')
  );
  check('连不上令牌接口时应回「失败」而不是抛出', res.status === 302 && res.headers.location === '/?zhihu=exchange_failed', `${res.status} ${res.headers.location}`);
}

{
  // 令牌接口回了 HTML（比如被网关拦截）—— 不能把 HTML 当 JSON 崩掉。
  const {oauth} = oauthWith({tokenResponse: {body: '<html>502 Bad Gateway</html>', status: 502}});
  const {state} = await startAndReadState(oauth);
  const res = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', cookie: `${STATE_COOKIE}=${state}`}}),
    res,
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-9')
  );
  check('令牌接口返回非 JSON 时应判失败', res.headers.location === '/?zhihu=exchange_failed', String(res.headers.location));
}

// ---------------------------------------------------------------- 14. 回跳目标

{
  const {oauth} = oauthWith();
  const res = fakeRes();
  await oauth.handleStart(fakeReq({headers: {host: 'game.example.com'}}), res, new URL('http://x/api/auth/zhihu/start?next=%2Froom.html'));
  const state = parseCookies(String(res.headers['set-cookie'])).bb_oauth_state;

  const back = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', cookie: `${STATE_COOKIE}=${state}`}}),
    back,
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-1')
  );
  check('登录后应回到发起登录的那一页', back.headers.location === '/room.html', String(back.headers.location));

  // 恶意站点可以伪造一个带外链 next 的 start 链接，诱导玩家登录后被跳走。
  const evilRes = fakeRes();
  await oauth.handleStart(fakeReq({headers: {host: 'game.example.com'}}), evilRes, new URL('http://x/api/auth/zhihu/start?next=%2F%2Fevil.com'));
  const evilState = parseCookies(String(evilRes.headers['set-cookie'])).bb_oauth_state;
  const evilBack = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', cookie: `${STATE_COOKIE}=${evilState}`}}),
    evilBack,
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-1')
  );
  check('外链回跳必须降级成首页', evilBack.headers.location === '/', String(evilBack.headers.location));
}

// ---------------------------------------------------------------- 15. 登录状态与退出

{
  const {oauth} = oauthWith();
  const me = fakeRes();
  const sent = [];
  oauth.handleMe(fakeReq({headers: {}}), me, (res, status, payload) => {
    sent.push({status, payload});
    res.writeHead(status);
    res.end(JSON.stringify(payload));
  });
  check('未登录时 me 应如实回答', sent[0].payload.enabled === true && sent[0].payload.loggedIn === false, JSON.stringify(sent[0]));
  check('me 不许带出任何凭证', !JSON.stringify(sent[0].payload).includes(config.zhihuOAuth.appKey));

  const {state} = await startAndReadState(oauth);
  const logged = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', cookie: `${STATE_COOKIE}=${state}`}}),
    logged,
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-1')
  );
  const sessionCookie = parseCookies(String(logged.headers['set-cookie']).replace(/,\s*/g, '; '))[SESSION_COOKIE];

  const me2 = fakeRes();
  const sent2 = [];
  oauth.handleMe(fakeReq({headers: {cookie: `${SESSION_COOKIE}=${sessionCookie}`}}), me2, (res, status, payload) => {
    sent2.push(payload);
    res.writeHead(status);
    res.end(JSON.stringify(payload));
  });
  check('登录后 me 应报告已登录', sent2[0].loggedIn === true, JSON.stringify(sent2[0]));
  check('登录后 me 应给出登录时间与过期时间', Number.isFinite(sent2[0].since) && Number.isFinite(sent2[0].expiresAt));
  check('没配 Access Secret 时不能编造知乎资料', sent2[0].contentCount === null, JSON.stringify(sent2[0].contentCount));

  // 伪造的会话 cookie 不能换来「已登录」。
  const forged = fakeRes();
  const sent3 = [];
  oauth.handleMe(fakeReq({headers: {cookie: `${SESSION_COOKIE}=made-up.value`}}), forged, (res, status, payload) => {
    sent3.push(payload);
    res.writeHead(status);
    res.end('{}');
  });
  check('伪造的会话 cookie 换不来登录态', sent3[0].loggedIn === false, JSON.stringify(sent3[0]));

  const out = fakeRes();
  const sent4 = [];
  oauth.handleLogout(fakeReq({headers: {cookie: `${SESSION_COOKIE}=${sessionCookie}`}}), out, (res, status, payload) => {
    sent4.push(payload);
    res.writeHead(status);
    res.end(JSON.stringify(payload));
  });
  check('退出应返回成功', sent4[0].ok === true && sent4[0].loggedIn === false);
  check('退出要清掉会话 cookie', /bb_session=;/.test(String(out.headers['set-cookie'])), String(out.headers['set-cookie']));

  const after = fakeRes();
  const sent5 = [];
  oauth.handleMe(fakeReq({headers: {cookie: `${SESSION_COOKIE}=${sessionCookie}`}}), after, (res, status, payload) => {
    sent5.push(payload);
    res.writeHead(status);
    res.end('{}');
  });
  check('退出后旧 cookie 立刻失效', sent5[0].loggedIn === false);
}

// ---------------------------------------------------------------- 16. 补充资料只是锦上添花

{
  // 配了 Access Secret 时，会顺手读一条用户内容拿总数。
  const withSecret = {
    zhihuOAuth: {...config.zhihuOAuth},
    zhihu: {secret: 'open-platform-secret-value'}
  };
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({url: String(url), headers: options.headers || {}});
    if (String(url).includes('/api/v1/user/contents')) {
      return new Response(JSON.stringify({Code: 0, Message: 'success', Data: {Items: [], Paging: {IsEnd: true, Totals: 42}}}), {
        status: 200,
        headers: {'content-type': 'application/json'}
      });
    }
    return new Response(JSON.stringify({access_token: 'zh-token', expires_in: 2592000}), {
      status: 200,
      headers: {'content-type': 'application/json'}
    });
  };
  const oauth = createZhihuOAuth({config: withSecret, fetchImpl, log: () => {}});
  const {state} = await startAndReadState(oauth);
  const res = fakeRes();
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', cookie: `${STATE_COOKIE}=${state}`}}),
    res,
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-1')
  );
  const sessionCookie = parseCookies(String(res.headers['set-cookie']).replace(/,\s*/g, '; '))[SESSION_COOKIE];
  const me = fakeRes();
  const sent = [];
  oauth.handleMe(fakeReq({headers: {cookie: `${SESSION_COOKIE}=${sessionCookie}`}}), me, (r, s, p) => {
    sent.push(p);
    r.writeHead(s);
    r.end('{}');
  });
  check('配了 Access Secret 时应能读到内容总数', sent[0].contentCount === 42, JSON.stringify(sent[0]));

  const userCall = calls.find(row => row.url.includes('/api/v1/user/contents'));
  check('读用户数据要带上 OAuth token 头', Boolean(userCall) && String(userCall.headers['x-oauth-token'] || '').length > 0);
  check('读用户数据要带开放平台 Access Secret', Boolean(userCall) && String(userCall.headers.authorization || '').startsWith('Bearer '));
  check('读用户数据要带秒级时间戳', Boolean(userCall) && /^\d{10}$/.test(String(userCall.headers['x-request-timestamp'] || '')), String(userCall?.headers['x-request-timestamp']));
  check('读用户数据要用官方 developer.zhihu.com 域名', Boolean(userCall) && userCall.url.startsWith('https://developer.zhihu.com/'));

  // 但读资料失败，绝不能让登录失败。
  const brokenFetch = async url => {
    if (String(url).includes('/api/v1/user/contents')) throw new Error('boom');
    return new Response(JSON.stringify({access_token: 'zh-token'}), {status: 200});
  };
  const oauth2 = createZhihuOAuth({config: withSecret, fetchImpl: brokenFetch, log: () => {}});
  const started = await startAndReadState(oauth2);
  const res2 = fakeRes();
  await oauth2.handleCallback(
    fakeReq({headers: {host: 'game.example.com', cookie: `${STATE_COOKIE}=${started.state}`}}),
    res2,
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-1')
  );
  check('读取知乎资料失败时登录仍应成功', res2.headers.location === '/' && String(res2.headers['set-cookie']).includes(`${SESSION_COOKIE}=`), `${res2.headers.location}`);
}

// ---------------------------------------------------------------- 17. 登录记录

{
  const rows = [];
  const stub = stubToken();
  const oauth = createZhihuOAuth({
    config,
    fetchImpl: stub.fetchImpl,
    store: {addRecord: row => rows.push(row)},
    now: () => 1700000000000,
    log: () => {}
  });
  const {state} = await startAndReadState(oauth);
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', cookie: `${STATE_COOKIE}=${state}`}}),
    fakeRes(),
    new URL('http://x/api/auth/zhihu/callback?authorization_code=AC-1')
  );
  check('登录成功应留下一条记录（人气奖要数）', rows.length === 1 && rows[0].kind === 'login', JSON.stringify(rows));
  // 记录里绝不能有 token、授权码、IP 之外的任何用户标识。
  const dumped = JSON.stringify(rows);
  check('登录记录里不许有 token', !dumped.includes('zh-token') && !dumped.includes('AC-1'), dumped);
  check('登录记录里不许有 app_key', !dumped.includes(config.zhihuOAuth.appKey));
}

// ---------------------------------------------------------------- 16. 回调路径别名

// 「活动页登记的到底是哪条回调路径」不由我们决定。官方 2026-S2 统一 skill 的示例命令
// 写的是 https://<domain>/auth/callback，它的 Hello World 模板也只在 /auth/callback 上应答。
// 所以我们两条都接 —— 否则症状是「在知乎点完授权，跳回来一个 404 空白页」。
{
  const aliases = acceptedCallbackPaths('');
  check('别名要包含我们自己公告的路径', aliases.has(CALLBACK_PATH), [...aliases].join(' '));
  check('别名要包含官方模板的 /auth/callback', aliases.has('/auth/callback'), [...aliases].join(' '));

  const pinned = acceptedCallbackPaths('https://g.example.com/whatever/oauth');
  check('配置里写的 pathname 也要认', pinned.has('/whatever/oauth'), [...pinned].join(' '));
  check('配置不是合法 URL 时不抛错，只回内置别名', acceptedCallbackPaths('not-a-url').has(CALLBACK_PATH));
  check('根路径不该被当成回调别名', !acceptedCallbackPaths('https://g.example.com/').has('/'));

  const paths = oauthWith().oauth.describe().callbackPaths;
  check('诊断信息要能看出接受了哪些回调路径', Array.isArray(paths) && paths.includes('/auth/callback'), JSON.stringify(paths));
}

{
  // 落在别名路径上：换 token 回传的 redirect_uri 要跟着变成「浏览器实际访问的那条」。
  const fixed = `https://game.example.com${CALLBACK_PATH}`;
  const {oauth, calls} = oauthWith({config: {zhihuOAuth: {redirectUri: fixed}}});
  const {state} = await startAndReadState(oauth);
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', 'x-forwarded-proto': 'https', cookie: `${STATE_COOKIE}=${state}`}}),
    fakeRes(),
    new URL('http://x/auth/callback?authorization_code=AC-alias')
  );
  const form = new URLSearchParams(calls[0]?.body || '');
  check('落在别名路径时 redirect_uri 要跟着换', form.get('redirect_uri') === 'https://game.example.com/auth/callback', String(form.get('redirect_uri')));
  check('换 token 表单字段名仍然只有 code', form.get('code') === 'AC-alias' && !form.has('authorization_code'), calls[0]?.body);
  check('域名仍以配置为准（不被请求头改写）', String(form.get('redirect_uri')).startsWith('https://game.example.com/'));
}

{
  // 没配固定地址时，别名路径也要能换到 token。
  const {oauth, calls} = oauthWith();
  const {state} = await startAndReadState(oauth);
  await oauth.handleCallback(
    fakeReq({headers: {host: 'game.example.com', 'x-forwarded-proto': 'https', cookie: `${STATE_COOKIE}=${state}`}}),
    fakeRes(),
    new URL('http://x/auth/callback?authorization_code=AC-2')
  );
  const form = new URLSearchParams(calls[0]?.body || '');
  check('没配固定地址时别名路径也能换 token', form.get('redirect_uri') === 'https://game.example.com/auth/callback', String(form.get('redirect_uri')));
}

// ---------------------------------------------------------------- 17. 平台代收时的「一个字都不许改」

// 2026-09-14：活动页「跳转地址」栏里写的是
// https://www.zhihu.com/ring/moltbook/api/community/quickstart —— 一个知乎自己的地址。
// 万一真是平台代收，把它的 pathname 改成我们的路径等于**伪造一个已登记的地址**，只会更对不上。
// 所以：域名不是我们的，就原样使用；只有配置指向我们自己时才跟随浏览器实际落的路径。
{
  const platform = 'https://www.zhihu.com/ring/moltbook/api/community/quickstart';
  const hostHeaders = {host: 'kanshan-archive-81255.app.workbuddy.host', 'x-forwarded-proto': 'https'};
  const {oauth, calls} = oauthWith({config: {zhihuOAuth: {redirectUri: platform}}});
  const started = await startAndReadState(oauth, hostHeaders);
  const authorizeRedirect = new URL(String(started.res.headers.location)).searchParams.get('redirect_uri');
  check('配的是别人的地址时，授权请求要原样用它', authorizeRedirect === platform, String(authorizeRedirect));

  await oauth.handleCallback(
    fakeReq({headers: {...hostHeaders, cookie: `${STATE_COOKIE}=${started.state}`}}),
    fakeRes(),
    new URL('http://x/?authorization_code=AC-root')
  );
  const form = new URLSearchParams(calls[0]?.body || '');
  check('配的是别人的地址时，换 token 也要原样用它', form.get('redirect_uri') === platform, String(form.get('redirect_uri')));
  check('这种情况下仍然只请求一次令牌接口', calls.length === 1, `实际 ${calls.length}`);

  // 反例：配置指向我们自己时，才跟随浏览器实际落的路径。
  const mine = `https://kanshan-archive-81255.app.workbuddy.host${CALLBACK_PATH}`;
  const second = oauthWith({config: {zhihuOAuth: {redirectUri: mine}}});
  const s2 = await startAndReadState(second.oauth, hostHeaders);
  await second.oauth.handleCallback(
    fakeReq({headers: {...hostHeaders, cookie: `${STATE_COOKIE}=${s2.state}`}}),
    fakeRes(),
    new URL('http://x/auth/callback?authorization_code=AC-3')
  );
  const form2 = new URLSearchParams(second.calls[0]?.body || '');
  check(
    '配的是自己域名时才跟随实际路径',
    form2.get('redirect_uri') === 'https://kanshan-archive-81255.app.workbuddy.host/auth/callback',
    String(form2.get('redirect_uri'))
  );
}

// ---------------------------------------------------------------- 18. 回调落点识别：宁宽勿窄

// 为什么单独测这一节：活动页「回调地址」那一栏是**我们自己手填的**，而那个页面我们看不见。
// 手填必然带来「多一个尾斜杠 / 少写一段路径 / 大小写不一致」这类偏差，
// 而接收端一旦认窄了，代价是「登录永远完不成，且知乎只回一句没有信息量的红字」。
// 所以这里的期望是**宽的**：落在我们域名上、又带着回调特征的请求，都得认。
//
// 但「宽」必须停在安全边界上，所以每一类放宽都配一条反例（见本节的 ✗ 断言）。
{
  check('带 authorization_code 的根路径要认', looksLikeCallback('/', new URLSearchParams('authorization_code=AC')));
  check('带 authorization_code 的任意路径也要认', looksLikeCallback('/callback', new URLSearchParams('authorization_code=AC')));
  check('白名单路径不带参数时也认（便于直接访问看诊断结果）', looksLikeCallback('/auth/callback', new URLSearchParams()));
  check('官方模板路径要认', looksLikeCallback('/auth/callback', new URLSearchParams('authorization_code=AC')));
  check('路径大小写不一致也要认', looksLikeCallback('/AUTH/Callback', new URLSearchParams('code=AC')));
  check('像回调的路径 + code 要认', looksLikeCallback('/oauth/return', new URLSearchParams('code=AC')));
  check('带 error 也要认（用户点了「拒绝」）', looksLikeCallback('/auth/callback', new URLSearchParams('error=access_denied')));

  // ✗ 反例：放宽不能把正常请求吃掉。
  check('✗ 不像回调的路径 + code 不认', !looksLikeCallback('/api/submit', new URLSearchParams('code=AC')));
  check('✗ 静态资源带 code 不认', !looksLikeCallback('/assets/hero.png', new URLSearchParams('code=AC')));
  check('✗ 首页正常访问（无任何回调参数）不认', !looksLikeCallback('/', new URLSearchParams()));
  check('✗ 白名单外的回调路径、又不带参数时不认', !looksLikeCallback('/callback', new URLSearchParams()));
  check('✗ 空值不算参数', !looksLikeCallback('/callback', new URLSearchParams('code=')));
  // 负对照：把「像回调的路径」换掉，同一条断言就该翻面 —— 证明上面那条不是在测空气。
  check('✗ 负对照：同样的参数放在不像回调的路径上就不认', !looksLikeCallback('/shop/cart', new URLSearchParams('code=AC')));
}

{
  check('尾斜杠归一化', normalizePath('/a/b/') === '/a/b');
  check('多重尾斜杠归一化', normalizePath('/a/b///') === '/a/b');
  check('根路径保持为 /', normalizePath('/') === '/' && normalizePath('') === '/');
  check('中间的空斜杠不动（只处理尾部）', normalizePath('/a//b') === '/a//b');
}

// ---------------------------------------------------------------- 19. 诊断开关：只许选白名单

// `?try=root|docs` 让「活动页那一栏里到底写了什么」这个问题变成三次可点击的实验。
// 它是**生产环境也开着**的后门，所以边界必须钉死：只能选白名单里的候选。
{
  const req = {headers: {host: 'kanshan-archive-81255.app.workbuddy.host', 'x-forwarded-proto': 'https'}};
  check('try=docs 回知乎那个默认值', diagnosticRedirect('docs', req) === DIAGNOSTIC_REDIRECTS.docs.value);
  check('try=root 回本站根地址', diagnosticRedirect('root', req) === 'https://kanshan-archive-81255.app.workbuddy.host/');
  check('没传 try 时不覆盖', diagnosticRedirect('', req) === '' && diagnosticRedirect(null, req) === '');

  // baseUri（= 配置里那条回调地址）优先于请求头：本机没有 x-forwarded-proto，
  // 只靠请求头推导会得到 `https://127.0.0.1:PORT/` 这种打不开的地址 —— 本地实测踩到过。
  {
    const bare = {headers: {host: '127.0.0.1:61803'}};
    check('✗ 没有 baseUri 且没有协议头时，默认 http（本机才打得开）', diagnosticRedirect('root', bare) === 'http://127.0.0.1:61803/', diagnosticRedirect('root', bare));
    check('给了 baseUri 时以它为准（线上 https 不会被降级）',
      diagnosticRedirect('root', bare, {baseUri: 'https://kanshan-archive-81255.app.workbuddy.host/api/auth/zhihu/callback'}) === 'https://kanshan-archive-81255.app.workbuddy.host/',
      diagnosticRedirect('root', bare, {baseUri: 'https://kanshan-archive-81255.app.workbuddy.host/api/auth/zhihu/callback'}));
    check('baseUri 不是合法 URL 时安静退回请求头', diagnosticRedirect('root', req, {baseUri: 'not-a-url'}) === 'https://kanshan-archive-81255.app.workbuddy.host/');
    check('✗ 连 host 都没有时返回空串（宁可不覆盖，也不编一个地址）', diagnosticRedirect('root', {headers: {}}) === '');
  }

  // 🔒 关键安全断言：如果这个开关接受任意 URL，
  // `/api/auth/zhihu/start?try=https://evil.com/` 就是一个开放重定向。
  check('✗ 任意 URL 不认（否则就是开放重定向）', diagnosticRedirect('https://evil.com/', req) === '');
  check('✗ 大小写不同的键不认', diagnosticRedirect('Root', req) === '');
  // 这条曾在实现里真的漏过：`OBJ[key]` 会从原型链上取到 Object.prototype（真值），
  // 于是 `?try=__proto__` 绕过了白名单。改成 hasOwn 才堵住。
  check('✗ __proto__ 之类的原型链键不认', diagnosticRedirect('__proto__', req) === '');
  check('✗ constructor 也不认', diagnosticRedirect('constructor', req) === '');
  check('白名单只有两项（多一项都要在这里复核）', Object.keys(DIAGNOSTIC_REDIRECTS).length === 2, Object.keys(DIAGNOSTIC_REDIRECTS).join(','));
}

{
  const headers = {host: 'game.example.com', 'x-forwarded-proto': 'https'};
  const {oauth} = oauthWith();

  const res = fakeRes();
  await oauth.handleStart(fakeReq({headers}), res, new URL('http://x/api/auth/zhihu/start?try=docs'), {
    redirectUriOverride: 'https://www.zhihu.com/ring/moltbook/api/community/quickstart'
  });
  const sent = new URL(String(res.headers.location)).searchParams.get('redirect_uri');
  check('诊断模式下授权请求用覆盖值', sent === 'https://www.zhihu.com/ring/moltbook/api/community/quickstart', String(sent));
  check('诊断模式也照样不许带 app_key', !String(res.headers.location).includes(config.zhihuOAuth.appKey));

  // ✗ 反例：不传覆盖值时，一切照旧 —— 免得诊断开关悄悄改变了正常流程。
  const res2 = fakeRes();
  await oauth.handleStart(fakeReq({headers}), res2, new URL('http://x/api/auth/zhihu/start'));
  check('✗ 不传覆盖值时走正常逻辑', new URL(String(res2.headers.location)).searchParams.get('redirect_uri') === `https://game.example.com${CALLBACK_PATH}`);
}

// ---------------------------------------------------------------- 20. 「对表」用的诊断信息

// 那一栏要靠人眼核对，而 66 个字符的字符串肉眼比很容易漏掉一个空格或多一个斜杠。
// 所以 describe() 要给出长度和指纹，让「粘进去的那串」和「服务器发出去的那串」
// 能用一个短字符串比完。这两个值都不含密钥。
{
  const fixed = `https://kanshan-archive-81255.app.workbuddy.host${CALLBACK_PATH}`;
  const info = oauthWith({config: {zhihuOAuth: {redirectUri: fixed}}}).oauth.describe();
  check('describe 要给出回调地址原文', info.redirectUri === fixed, String(info.redirectUri));
  check('describe 要给出长度（对表用）', info.redirectUriLength === fixed.length, String(info.redirectUriLength));
  check('describe 要给出指纹（对表用）', /^[0-9a-f]{12}$/.test(String(info.redirectUriFingerprint)), String(info.redirectUriFingerprint));
  check('指纹必须要能区分出「多一个尾斜杠」', /^[0-9a-f]{12}$/.test(String(oauthWith({config: {zhihuOAuth: {redirectUri: `${fixed}/`}}}).oauth.describe().redirectUriFingerprint)));
  check('describe 明说要接住任意像回调的路径', info.callbackCatchAll === true);
  check('✗ describe 不许泄漏 App Key', !JSON.stringify(info).includes(config.zhihuOAuth.appKey));
  // 没配固定地址时不该编一个长度出来（否则对表会得到误导性的数字）。
  const loose = oauthWith().oauth.describe();
  check('✗ 没配固定地址时长度与指纹都是空的', loose.redirectUriLength === 0 && loose.redirectUriFingerprint === '');
}

// ---------------------------------------------------------------- 21. 应急通道：把落在别处的授权码人工搬回来

// 这是「今天就要能用」的兜底：万一知乎认的回调地址不是我们的，正常回调永远收不到。
// 但授权码就在浏览器地址栏里 —— 让用户整条粘回来，登录照样能完成。
// 边界要钉三件事：只认同一浏览器的 state、只按「当时声明的地址」去换、绝不回显响应体。
{
  const url = 'https://www.zhihu.com/ring/moltbook/api/community/quickstart?authorization_code=AC-REAL&state=zzz';
  check('整条 URL 里能取出授权码', manualCodeFrom(url) === 'AC-REAL', manualCodeFrom(url));
  check('兼容 code 参数名', manualCodeFrom('https://x.example.com/cb?code=AC-2') === 'AC-2');
  check('只有路径 + 查询串也认', manualCodeFrom('/zhihu-check.html?authorization_code=AC-3') === 'AC-3');
  check('裸码也认', manualCodeFrom('AC-BARE-1234') === 'AC-BARE-1234');
  check('前后空白要忽略', manualCodeFrom('  AC-BARE-1234  ') === 'AC-BARE-1234');

  // ✗ 反例：不能让一整段 HTML、一句中文、或者一个空串混进换 token 的表单。
  check('✗ 空串取不出码', manualCodeFrom('') === '' && manualCodeFrom(null) === '');
  check('✗ 一段 HTML 取不出码', manualCodeFrom('<html><body>hello</body></html>') === '');
  check('✗ 没有 code 的普通网址取不出码', manualCodeFrom('https://www.zhihu.com/signin') === '');
  check('✗ 太短的不算码', manualCodeFrom('AC') === '');
  check('✗ 带空格的串不算码（防止把一整句话当码）', manualCodeFrom('AC 123 456') === '');
  check('✗ 超长的串不算码', manualCodeFrom('A'.repeat(600)) === '');
}

{
  // declared：这次授权我们向知乎声明了哪个回调地址。手动换 token 必须用它。
  const packed = packState('k-1', {nonce: 'n1', next: '/room.html', declared: 'https://x.example.com/cb'});
  const back = unpackState('k-1', packed);
  check('state 里要能带回声明的回调地址', back.declared === 'https://x.example.com/cb', JSON.stringify(back));
  check('state 仍然带回 next', back.next === '/room.html');
  check('没传 declared 时是空串', unpackState('k-1', packState('k-1', {nonce: 'n1', next: '/'})).declared === '');

  // ✗ 值域：state 是我们自己签的，但仍然只接受 http/https ——
  //    万一将来签名用法被改坏，这里还能兜一层，不至于把 javascript: 之类的东西当回调地址发出去。
  check('✗ 非 http/https 的声明值会被丢掉', safeRedirectUri('javascript:alert(1)') === '');
  check('✗ 带换行的声明值会被丢掉', safeRedirectUri('https://x.example.com/\r\nX: 1') === '');
  check('合法的 https 值原样保留', safeRedirectUri('https://x.example.com/cb') === 'https://x.example.com/cb');
  check('本地 http 值也保留（本地要能把链路试通）', safeRedirectUri('http://127.0.0.1:4180/cb') === 'http://127.0.0.1:4180/cb');
}

{
  const headers = {host: 'game.example.com', 'x-forwarded-proto': 'https'};
  const {oauth, calls} = oauthWith();
  const started = await startAndReadState(oauth, headers);
  const withCookie = {...headers, cookie: `${STATE_COOKIE}=${started.state}`};

  // 正常一次
  const res = fakeRes();
  const json = {code: 0, body: ''};
  await oauth.handleManual(fakeReq({headers: withCookie}), res, (r, status, payload) => {
    json.code = status;
    json.body = payload;
  }, 'https://www.zhihu.com/ring/moltbook/api/community/quickstart?authorization_code=AC-MANUAL');
  check('手动换 token 应成功', json.body?.ok === true, JSON.stringify(json.body));
  check('手动路径要用「当时声明的地址」换 token',
    String(calls[0]?.url || '').endsWith('/access_token') && new URLSearchParams(calls[0].body).get('redirect_uri') === `https://game.example.com${CALLBACK_PATH}`,
    String(new URLSearchParams(calls[0]?.body || '').get('redirect_uri')));
  check('手动路径只把裸码放进表单', new URLSearchParams(calls[0].body).get('code') === 'AC-MANUAL', calls[0].body);
  const setCookies = [].concat(res.headers['set-cookie'] || []).join(' | ');
  check('手动成功后要种下会话 cookie', /bb_session=/.test(setCookies), setCookies);
  check('手动成功后要作废一次性 state', /bb_oauth_state=;/.test(setCookies), setCookies);
  check('✗ 手动结果里不许出现 app_key', !JSON.stringify(json.body).includes(config.zhihuOAuth.appKey));

  // ✗ 没有 / 伪造 state 时必须停住 —— 否则这条路就成了「拿别人的码登录」。
  const before = calls.length;
  const forged = fakeRes();
  const forgedJson = {};
  await oauth.handleManual(fakeReq({headers: {...headers, cookie: `${STATE_COOKIE}=forged.value`}}), forged, (r, status, payload) => {
    forgedJson.code = status;
    forgedJson.body = payload;
  }, 'AC-SOMEONE-ELSE');
  check('✗ 伪造 state 要 400', forgedJson.code === 400 && forgedJson.body?.reason === 'bad_state', JSON.stringify(forgedJson.body));
  check('✗ 伪造 state 时不许调用令牌接口', calls.length === before);
  check('✗ 伪造 state 时不许种会话 cookie', !/bb_session=/.test([].concat(forged.headers['set-cookie'] || []).join(' | ')));

  const state2 = (await startAndReadState(oauth, headers)).state;
  const junk = fakeRes();
  const junkJson = {};
  await oauth.handleManual(fakeReq({headers: {...headers, cookie: `${STATE_COOKIE}=${state2}`}}), junk, (r, status, payload) => {
    junkJson.code = status;
    junkJson.body = payload;
  }, '<html>不是码</html>');
  check('✗ 粘进来的不是码时要 400', junkJson.code === 400 && junkJson.body?.reason === 'no_code', JSON.stringify(junkJson.body));
  check('✗ 不是码时不许调用令牌接口', calls.length === before);
}

// ---------------------------------------------------------------- 报告

if (failures.length) {
  console.log(`知乎 OAuth：${passed} 项通过，${failures.length} 项失败`);
  for (const row of failures) console.log('  ✗ ' + row);
  process.exitCode = 1;
} else {
  console.log(`知乎 OAuth：${passed} 项全部通过（授权地址 / 回调参数 / 换 token 表单 / 成功判定 / 签名 cookie / 回跳安全 / 会话 / 失败不假装成功）。未联网，未使用任何真实凭证。`);
}
