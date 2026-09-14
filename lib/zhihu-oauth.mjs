// 知乎 OAuth 登录（黑客松专用流程）。
//
// 事实源：官方 zhihu skill 的 references/hackathon-oauth.md。
//   GET  https://openapi.zhihu.com/authorize?redirect_uri=&app_id=&response_type=code
//   回调  {redirect_uri}?authorization_code=xxx      （兼容 code=xxx）
//   POST https://openapi.zhihu.com/access_token      form-urlencoded
//         app_id / app_key / grant_type=authorization_code / redirect_uri / code
//
// 官方写明的安全纪律，这里一条都不打折：
//   · App Key、authorization code、OAuth Token **只在后端**出现；
//   · 诊断信息只说「来源 / 有没有配 / 长度 / SHA-256 短前缀」，绝不说完整值；
//   · 回调地址必须与活动页登记值**完全一致**（含协议、域名、路径、尾部斜杠）；
//   · 换不到 token 时停止流程，不静默降级成「假装已登录」。

import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

export const AUTHORIZE_ENDPOINT = 'https://openapi.zhihu.com/authorize';
export const TOKEN_ENDPOINT = 'https://openapi.zhihu.com/access_token';
export const USER_API_BASE = 'https://developer.zhihu.com';

// 我们自己对外公告的回调路径。活动页登记的回调地址要和它逐字符相同。
export const CALLBACK_PATH = '/api/auth/zhihu/callback';

// 但「登记的是哪一条」并不由我们说了算 —— 所以后端在下面这几条路径上都会应答。
//
// 为什么需要别名：知乎官方 2026-S2 统一 skill 里，示例命令写的是
//   configure_callback.mjs --redirect-uri https://<public-domain>/auth/callback
// 而它的 Hello World 模板（assets/hello-world-oauth/server.mjs）就只在 /auth/callback 上应答。
// 如果评委/我们照着那份示例把 /auth/callback 登记进活动页，而我们的服务只认一条路径，
// 症状会是「在知乎点完授权，跳回来一个 404 空白页」—— 而且看不出是谁的错。
// 多认几条路径的成本是零，收益是把这个不确定性整个删掉。
export const CALLBACK_PATH_ALIASES = [
  CALLBACK_PATH,
  '/auth/callback',
  '/api/auth/callback',
  '/api/auth/zhihu'
];

// 返回「这个进程愿意在哪些路径上接回调」。除了内置别名，还包括
// ZHIHU_OAUTH_REDIRECT_URI 里写的那个 pathname —— 配什么就认什么。
export function acceptedCallbackPaths(fixedRedirect = '') {
  const paths = new Set(CALLBACK_PATH_ALIASES);
  try {
    const {pathname} = new URL(String(fixedRedirect || ''));
    if (pathname && pathname !== '/') paths.add(pathname);
  } catch {
    // 配的不是合法 URL 就只认别名，这里不报错（真正该报错的地方在启动自检里）
  }
  return paths;
}

// 路径归一化：去掉尾部斜杠。
//
// 「多一个斜杠」是手填回调地址时最常见的偏差之一（`...callback/` 与 `...callback`
// 是两条不同的路径），而它的后果是 404 —— 症状是「在知乎点完授权，跳回来一张空白页」，
// 而且看不出是谁的错。既然这条偏差的代价这么高、修起来这么便宜，就在这里一并抹平。
export function normalizePath(pathname) {
  const text = String(pathname || '');
  if (!text || text === '/') return '/';
  return text.replace(/\/+$/, '') || '/';
}

// 请求自己的对外地址（`https://域名:端口`），供「按访问域名推导」和诊断用。
// 反向代理后面 `host` 可能是内网地址，所以两个 x-forwarded-* 都要看。
export function requestOrigin(req, {defaultProto = 'https'} = {}) {
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() || defaultProto;
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

// 判断「这次请求是不是知乎把用户送回来的」。
//
// ⚠️ 为什么这里刻意放宽到「任意路径」，而不是只认白名单：
//    回调地址那一栏是**在活动页上由我们自己手填的**，而那个页面我们看不见。
//    只要是人手填，就一定会有多余空格、尾斜杠、大小写、少写一段路径这些偏差 ——
//    而这类偏差的代价是「登录永远完不成，且知乎只回一句没有信息量的红字」。
//    把接收端放宽到「我们域名上任何一条像回调的路径」，
//    等于把这一整类失败从「致命」降级成「无所谓」——成本几乎为零。
//
// 放宽的边界（既要够宽，又不能吃掉正常请求）：
//   · 带 `authorization_code` —— 这个参数名是知乎专有的，站内没有任何页面用它，直接认；
//   · 白名单里的路径 —— 带不带参数都接（便于直接访问时看到 `?zhihu=bad_state` 这种诊断结果）；
//   · 其余路径要同时满足「路径本身长得像回调」且带 `code`/`error`；
//   · 带扩展名的路径（`/foo.png`）一律不认，免得把静态资源请求当成回调。
const CALLBACK_ISH_PATH = /(auth|oauth|callback|login|redirect)/i;
const HAS_EXTENSION = /\.[a-z0-9]{1,8}$/i;

function paramPresent(query, name) {
  if (!query) return false;
  const value = typeof query.get === 'function' ? query.get(name) : query[name];
  return Boolean(String(Array.isArray(value) ? value[0] : value ?? '').trim());
}

export function looksLikeCallback(pathname, query, knownPaths = CALLBACK_PATH_ALIASES) {
  const path = normalizePath(pathname);
  if (HAS_EXTENSION.test(path)) return false;
  if (paramPresent(query, 'authorization_code')) return true;
  const known = knownPaths instanceof Set ? knownPaths : new Set(knownPaths);
  if (known.has(path)) return true;
  if (!CALLBACK_ISH_PATH.test(path)) return false;
  return paramPresent(query, 'code') || paramPresent(query, 'error') || paramPresent(query, 'error_code');
}

// 诊断用：三个候选回调地址，用来反推活动页那一栏里到底写了什么。
//
// **白名单硬编码，绝不接受调用方传来的任意 URL** ——
// 否则 `/api/auth/zhihu/start?try=<别人的地址>` 就是一个开放重定向。
// 我们看不见那一栏，只能让这三个候选替我们问一次：哪个能过，那一栏里就是哪个。
export const DIAGNOSTIC_REDIRECTS = {
  // 只登记了站点根（很常见的一种填法）
  root: {label: '站点根地址'},
  // 那一栏的默认值 —— 知乎自己的页面。如果只有它能过，
  // 说明那一栏压根没改过，还是平台给的示例值。
  docs: {
    label: '知乎文档默认值',
    value: 'https://www.zhihu.com/ring/moltbook/api/community/quickstart'
  }
};

// 把 `?try=root|docs` 翻译成一个具体地址。返回空串表示「不覆盖，走正常逻辑」。
//
// `baseUri` 传**配置里那条回调地址**：它的 origin 就是本地/线上最权威的
// 「我们自己的地址」。不传才退回请求头推导 —— 而请求头推导要默认 http，
// 因为本机没有 x-forwarded-proto，默认 https 会得到一个打不开的 https://127.0.0.1。
// （这条真踩过：本地实测 `?try=root` 推出了 `https://127.0.0.1:61803/`。）
//
// ⚠️ 必须用 hasOwn 而不是 `OBJ[key]`：`?try=__proto__` 会从原型链上取到
// `Object.prototype`（是个真值），白名单就被绕过去了。这类「看着像查表、
// 实际查到了原型链」的漏洞不报错，只会静静地放行。
export function diagnosticRedirect(key, req, {baseUri = ''} = {}) {
  const name = String(key || '').trim();
  if (!Object.prototype.hasOwnProperty.call(DIAGNOSTIC_REDIRECTS, name)) return '';
  const entry = DIAGNOSTIC_REDIRECTS[name];
  if (entry.value) return entry.value;
  let base = '';
  try {
    base = baseUri ? new URL(String(baseUri)).origin : '';
  } catch {
    base = '';
  }
  if (!base) base = requestOrigin(req, {defaultProto: 'http'});
  return base ? `${base.replace(/\/+$/, '')}/` : '';
}

export const SESSION_COOKIE = 'bb_session';
export const STATE_COOKIE = 'bb_oauth_state';
const STATE_TTL_SECONDS = 600;

// ---------------------------------------------------------------- 授权地址

export function buildAuthorizeUrl({appId, redirectUri, state}) {
  const params = new URLSearchParams({
    redirect_uri: redirectUri,
    app_id: appId,
    response_type: 'code'
  });
  if (state) params.set('state', state);
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

function firstOf(value) {
  return Array.isArray(value) ? value[0] : value;
}

// 取一个查询参数。**必须同时支持 URLSearchParams 和普通对象**：
// 服务端传进来的是 `url.searchParams`，而它并不支持 `params.authorization_code`
// 这种属性取值（只有 `.get()`），早先那样写会让回调永远读不到授权码 ——
// 症状是「玩家授权完跳回来，什么都没发生」，一点报错都没有。
function readParam(query, name) {
  if (!query) return '';
  if (typeof query.get === 'function') return query.get(name) ?? '';
  return firstOf(query[name]) ?? '';
}

// 黑客松实测主参数是 authorization_code；官方明确说「可以兼容读取 code」。
// 两个都没有就返回空串 —— 调用方必须停在这里，不许拿空 code 去换 token。
export function callbackCode(query = {}) {
  return String(readParam(query, 'authorization_code') || readParam(query, 'code') || '').trim();
}

// 用户在授权页点了「拒绝」时，回调里没有 code，只有 error。
export function callbackError(query = {}) {
  const raw = readParam(query, 'error') || readParam(query, 'error_code') || '';
  return raw ? String(raw).trim().slice(0, 120) : '';
}

// ---------------------------------------------------------------- 换 token

// 官方提醒：业务响应可能用 code:20000 表示成功，**不能只看这个字段判失败**。
// 所以成功与否只认「响应里有没有 access_token」。
export function parseTokenResponse(payload) {
  if (!payload || typeof payload !== 'object') return {ok: false, reason: '响应不是 JSON 对象'};
  const inner = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const token = payload.access_token || payload.accessToken || inner.access_token || inner.accessToken || '';
  if (!token) return {ok: false, reason: describeFailure(payload)};
  const raw = Number(payload.expires_in || payload.expiresIn || inner.expires_in || inner.expiresIn);
  return {
    ok: true,
    token: String(token),
    // 文档没给默认值，退到 30 天（官方说明 OAuth token 有效期 30 天）
    expiresInSeconds: Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30 * 24 * 3600
  };
}

// 只回「错在哪」，**不回整个响应体** —— 换 token 的请求把 app_key 放在表单里，
// 万一服务端把请求原样回显，整包日志就等于把密钥写进了文件。
function describeFailure(payload) {
  const code = payload.code ?? payload.Code ?? payload.error ?? '';
  const message = payload.message || payload.Message || payload.error_description || '';
  const text = `${code ? `code=${code} ` : ''}${String(message).slice(0, 120)}`.trim();
  return text || '响应里没有 access_token';
}

// ---------------------------------------------------------------- 签名工具

function keyOf(secret) {
  return createHash('sha256').update(`kanshan-game/oauth/${secret}`).digest();
}

export function sign(secret, value) {
  return createHmac('sha256', keyOf(secret)).update(value).digest('base64url');
}

// 定长比较，避免按字符提前返回泄漏时序信息。
function sameMac(a, b) {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function signedValue(secret, value) {
  return `${value}.${sign(secret, value)}`;
}

export function unsign(secret, raw) {
  const text = String(raw || '');
  const at = text.lastIndexOf('.');
  if (at <= 0) return '';
  const value = text.slice(0, at);
  return sameMac(text.slice(at + 1), sign(secret, value)) ? value : '';
}

// state 里除了随机串还要带「登录后回哪一页」。放 cookie 里签个名就够了，
// 不用服务端存 —— 回调可能落在另一个进程上（比如多副本部署）。
//
// `declared` 是**这次授权我们向知乎声明的回调地址**，也一起签进去。
// 为什么需要它：手动粘贴授权码那条应急通道（见 manualCodeFrom）必须用
// 「当时声明的那个地址」去换 token —— 知乎要求这里的 redirect_uri 与授权时一致。
// 存在 state 里就不必再加一个服务端会话表，进程重启也不影响。
export function packState(secret, {nonce, next, declared = ''}) {
  const payload = Buffer.from(
    JSON.stringify({n: nonce, x: safeNext(next), d: safeRedirectUri(declared)}),
    'utf8'
  ).toString('base64url');
  return signedValue(secret, payload);
}

export function unpackState(secret, raw) {
  const payload = unsign(secret, raw);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.n !== 'string' || !parsed.n) return null;
    return {nonce: parsed.n, next: safeNext(parsed.x), declared: safeRedirectUri(parsed.d)};
  } catch {
    return null;
  }
}

// 回调地址只允许 http/https（或空）。state 是我们自己签的，签不过就进不来，
// 但多一道值域约束没有成本 —— 万一将来有人改了签名密钥的用法，这里还能兜一层。
export function safeRedirectUri(value) {
  const text = String(value || '');
  if (!text || /[\r\n]/.test(text)) return '';
  return /^https?:\/\//i.test(text) ? text : '';
}

// 从用户粘贴的内容里取出授权码。
//
// 存在的理由：回调地址那一栏在活动页上，我们看不见、也不一定能改。
// 万一知乎认的地址不是我们的，授权码就会落在别处 —— 但**它就在浏览器地址栏里**。
// 让用户把整条地址粘回来，就等于把那一段我们收不到的回调「人工搬」过来，
// 登录照样能完成。这比「登录彻底不可用」好得多。
//
// 接受三种写法：整条 URL、带查询串的路径、或者就是个裸码。
export function manualCodeFrom(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  // 整条 URL 或路径：交给 URLSearchParams 解析（给它加个假 origin 就能吃路径形式）
  if (/[?&]/.test(raw) || /^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `http://x${raw.startsWith('/') ? '' : '/'}${raw}`);
      const fromUrl = callbackCode(parsed.searchParams);
      if (fromUrl) return fromUrl;
    } catch {
      // 解析不了就按「裸码」继续往下走
    }
  }
  // 裸码：只接受 URL 安全字符，且长度合理，免得把一整段 HTML 当码发出去
  return /^[A-Za-z0-9._~-]{6,512}$/.test(raw) ? raw : '';
}

// 只接受站内相对路径。`//evil.com` 和 `https://evil.com` 都会被挡掉 ——
// 否则 `?next=` 就成了一个开放重定向。
export function safeNext(value) {
  const text = String(value || '');
  if (!text.startsWith('/') || text.startsWith('//')) return '/';
  if (/[\r\n]/.test(text)) return '/';
  return text;
}

// ---------------------------------------------------------------- cookie

export function parseCookies(header) {
  const out = {};
  for (const piece of String(header || '').split(';')) {
    const at = piece.indexOf('=');
    if (at < 0) continue;
    const key = piece.slice(0, at).trim();
    if (key) out[key] = piece.slice(at + 1).trim();
  }
  return out;
}

export function cookieHeader(name, value, {maxAge, secure = false, httpOnly = true} = {}) {
  const parts = [`${name}=${value}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (Number.isFinite(maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return parts.join('; ');
}

// ---------------------------------------------------------------- 会话

// 会话只活在内存里。官方要求「用户退出、应用重启或测试结束时清理服务端 OAuth 会话」，
// 内存表天然满足：进程一停就什么都没了，不会有 token 残留在磁盘上。
export function createSessionStore({ttlMs = 30 * 24 * 3600 * 1000, now = Date.now} = {}) {
  const rows = new Map();

  function prune() {
    const stamp = now();
    for (const [id, row] of rows) if (row.expiresAt <= stamp) rows.delete(id);
  }

  return {
    create({ttlSeconds} = {}) {
      prune();
      const id = randomBytes(18).toString('base64url');
      const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds * 1000 : ttlMs;
      rows.set(id, {createdAt: now(), expiresAt: now() + ttl, profile: null});
      return id;
    },
    get(id) {
      const row = rows.get(String(id || ''));
      if (!row) return null;
      if (row.expiresAt <= now()) {
        rows.delete(String(id));
        return null;
      }
      return row;
    },
    attach(id, profile) {
      const row = this.get(id);
      if (row) row.profile = profile;
      return row;
    },
    drop(id) {
      return rows.delete(String(id));
    },
    dropAll() {
      rows.clear();
    },
    get size() {
      prune();
      return rows.size;
    }
  };
}

// ---------------------------------------------------------------- 主体

function timeoutSignal(ms) {
  // AbortSignal.timeout 在 Node 18+ / 现代浏览器都有；没有就不传信号，别因此报错。
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}

export function createZhihuOAuth({
  config,
  store = null,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  log = () => {}
}) {
  const appId = (config?.zhihuOAuth?.appId || '').trim();
  const appKey = (config?.zhihuOAuth?.appKey || '').trim();
  const fixedRedirect = (config?.zhihuOAuth?.redirectUri || '').trim();
  // 端点是官方固定值。只有自动化测试会把它指到本地假服务。
  const tokenEndpoint = (config?.zhihuOAuth?.tokenEndpoint || '').trim() || TOKEN_ENDPOINT;
  const accessSecret = (config?.zhihu?.secret || '').trim();
  const enabled = Boolean(appId && appKey && typeof fetchImpl === 'function');

  // 会话签名密钥从 appKey 派生：换 key 时旧会话自动作废，这正好是我们想要的。
  const cookieSecret = enabled ? appKey : randomBytes(32).toString('base64url');
  const sessions = createSessionStore({now});

  // 回调地址优先用显式配置（活动页登记什么就用什么）；
  // 没配时按当前请求的域名推导，这样本地也能把整条链路试通。
  //
  // arrivedPath：回调这次实际落在哪条路径上。配了固定地址、但浏览器落在别名路径时，
  // 换 token 必须回传**浏览器真正访问的那条**。
  //
  // 依据：知乎是把用户「送去它记录里的那个回调地址」的。所以浏览器落在哪条路径上，
  // 那条路径就是知乎认的注册值 —— 这比我们本地配置更权威。回传配置里那条
  // 「这次根本没被访问」的地址，是最隐蔽的一种对不上。
  //
  // ⚠️ 但只在**配置的域名就是我们自己的域名**时才跟随路径。2026-09-14 发现活动页的
  //    「跳转地址」栏里写的是 `https://www.zhihu.com/ring/moltbook/api/community/quickstart`
  //    —— 一个知乎自己的地址。万一真是平台代收，把它的 pathname 改成我们的路径
  //    等于伪造一个「已登记的地址」，只会更对不上。域名不是我们的，就原样不动。
  function redirectUriFor(req, arrivedPath = '') {
    const base = fixedRedirect || deriveFromRequest(req);
    if (!arrivedPath || !base) return base;
    try {
      const parsed = new URL(base);
      if (parsed.pathname === arrivedPath) return base;
      if (parsed.host !== requestHost(req)) return base;
      parsed.pathname = arrivedPath;
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return base;
    }
  }

  function requestHost(req) {
    return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  }

  function deriveFromRequest(req) {
    // 没显式配 ZHIHU_OAUTH_REDIRECT_URI 时才走这里。
    // 本地没有 x-forwarded-proto，默认 http 才是对的（https 会得到打不开的地址）。
    const origin = requestOrigin(req, {defaultProto: 'http'});
    return origin ? `${origin}${CALLBACK_PATH}` : '';
  }

  function secureFor(req) {
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    return proto === 'https' || (fixedRedirect || '').startsWith('https://');
  }

  function readSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    const raw = cookies[SESSION_COOKIE] || '';
    const at = raw.lastIndexOf('.');
    if (at <= 0) return {id: '', row: null};
    const id = unsign(cookieSecret, raw);
    if (!id) return {id: '', row: null};
    return {id, row: sessions.get(id)};
  }

  async function exchangeCode(code, redirectUri) {
    const form = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code
    });
    let response;
    try {
      response = await fetchImpl(tokenEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'accept': 'application/json'
        },
        body: form.toString(),
        signal: timeoutSignal(15000)
      });
    } catch (error) {
      return {ok: false, reason: `连不上知乎令牌接口（${error?.name || '网络错误'}）`};
    }
    // 故意不看 response.ok：官方说业务码 code:20000 也算成功，HTTP 状态不等于结果。
    const text = await response.text().catch(() => '');
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      return {ok: false, reason: `令牌接口没有返回 JSON（HTTP ${response.status}）`};
    }
    return parseTokenResponse(payload);
  }

  // 读一条用户内容只为拿「总数」，用来向玩家证明「确实连上了你的知乎账号」。
  // 这是**锦上添花**：Access Secret 没配、或接口报错，都不该让登录失败。
  async function readProfile(token) {
    if (!accessSecret) return null;
    const url = new URL('/api/v1/user/contents', USER_API_BASE);
    url.searchParams.set('ContentType', 'all');
    url.searchParams.set('Limit', '1');
    try {
      const response = await fetchImpl(url.toString(), {
        headers: {
          'authorization': `Bearer ${accessSecret}`,
          'x-oauth-token': token,
          'x-request-timestamp': String(Math.floor(now() / 1000)),
          'content-type': 'application/json',
          'accept': 'application/json'
        },
        signal: timeoutSignal(6000)
      });
      const payload = await response.json().catch(() => null);
      const body = payload?.Data || payload?.data || null;
      const totals = Number(body?.Paging?.Totals);
      return {contentCount: Number.isFinite(totals) ? totals : null};
    } catch {
      return null;
    }
  }

  // 地址 + 响应头。回调必须原样跳回站内，所以这里不走 sendJson。
  function redirect(res, location, cookies = []) {
    const headers = {'location': location, 'cache-control': 'no-store', 'content-length': '0'};
    if (cookies.length) headers['set-cookie'] = cookies;
    res.writeHead(302, headers);
    res.end();
  }

  // redirectUriOverride 只给「那一栏里到底写了什么」这一个诊断问题用。
  // 调用方（server.mjs）只从硬编码白名单里取值，不接受任意 URL。
  async function handleStart(req, res, url, {redirectUriOverride = ''} = {}) {
    if (!enabled) {
      return redirect(res, '/?zhihu=unconfigured');
    }
    const nonce = randomBytes(16).toString('base64url');
    const next = safeNext(url.searchParams.get('next') || '/');
    const redirectUri = String(redirectUriOverride || '').trim() || redirectUriFor(req);
    // declared 一起签进 state：手动粘贴那条应急通道要用它换 token，
    // 而那时已经没有「浏览器落在哪」这个信息了。
    const state = packState(cookieSecret, {nonce, next, declared: redirectUri});
    const target = buildAuthorizeUrl({appId, redirectUri, state});
    log(`知乎 OAuth：开始授权 → ${redirectUri}${redirectUriOverride ? '（诊断模式）' : ''}`);
    return redirect(res, target, [
      cookieHeader(STATE_COOKIE, state, {
        maxAge: STATE_TTL_SECONDS,
        secure: secureFor(req)
      })
    ]);
  }

  async function handleCallback(req, res, url) {
    if (!enabled) return redirect(res, '/?zhihu=unconfigured');

    const cookies = parseCookies(req.headers.cookie);
    const state = unpackState(cookieSecret, cookies[STATE_COOKIE] || '');
    // state 一次性用完即焚，无论成败都要清掉。
    const clearState = cookieHeader(STATE_COOKIE, '', {maxAge: 0, secure: secureFor(req)});

    const denied = callbackError(url.searchParams);
    if (denied) return redirect(res, '/?zhihu=denied', [clearState]);
    if (!state) return redirect(res, '/?zhihu=bad_state', [clearState]);

    const code = callbackCode(url.searchParams);
    if (!code) {
      // 官方原话：回调没有授权码就停止流程，不继续换取 Token。
      return redirect(res, '/?zhihu=no_code', [clearState]);
    }

    const redirectUri = redirectUriFor(req, url.pathname);
    const exchanged = await exchangeCode(code, redirectUri);
    if (!exchanged.ok) {
      // 只把「错在哪」写进日志。code 和 token 都不落盘、不回前端。
      log(`知乎 OAuth：换取 token 失败 —— ${exchanged.reason}`);
      return redirect(res, '/?zhihu=exchange_failed', [clearState]);
    }

    const sessionId = sessions.create({ttlSeconds: exchanged.expiresInSeconds});
    const profile = await readProfile(exchanged.token);
    if (profile) sessions.attach(sessionId, profile);

    if (store) {
      store.addRecord({
        ts: now(),
        kind: 'login',
        provider: 'zhihu',
        day: null
      });
    }
    log(`知乎 OAuth：登录成功（会话数 ${sessions.size}）`);

    return redirect(res, safeNext(state.next), [
      clearState,
      cookieHeader(SESSION_COOKIE, signedValue(cookieSecret, sessionId), {
        maxAge: exchanged.expiresInSeconds,
        secure: secureFor(req)
      })
    ]);
  }

  // 手动把授权码搬回来。存在的理由见 manualCodeFrom 的注释：
  // 万一知乎认的回调地址不是我们的，正常回调就永远收不到 ——
  // 但授权码就在浏览器地址栏里，让用户整条粘回来，登录照样能完成。
  //
  // 这条路只在**同一个浏览器**里有效（要求 state cookie 对得上、且签发于 10 分钟内），
  // 所以它不是「绕过登录」，只是把同一趟授权换一种方式接住。
  async function handleManual(req, res, sendJson, rawInput) {
    if (!enabled) return sendJson(res, 200, {ok: false, reason: 'unconfigured'});

    const cookies = parseCookies(req.headers.cookie);
    const state = unpackState(cookieSecret, cookies[STATE_COOKIE] || '');
    if (!state) return sendJson(res, 400, {ok: false, reason: 'bad_state'});

    const code = manualCodeFrom(rawInput);
    if (!code) return sendJson(res, 400, {ok: false, reason: 'no_code'});

    // 用「当时声明的那个地址」去换 —— 知乎要求这一步与授权请求一致。
    const redirectUri = state.declared || redirectUriFor(req);
    const exchanged = await exchangeCode(code, redirectUri);
    if (!exchanged.ok) {
      log(`知乎 OAuth：手动换 token 失败 —— ${exchanged.reason}`);
      // detail 只带「错在哪」，绝不回显响应体（那里面可能有 app_key）。
      return sendJson(res, 200, {ok: false, reason: 'exchange_failed', detail: exchanged.reason});
    }

    const sessionId = sessions.create({ttlSeconds: exchanged.expiresInSeconds});
    const profile = await readProfile(exchanged.token);
    if (profile) sessions.attach(sessionId, profile);
    if (store) store.addRecord({ts: now(), kind: 'login', provider: 'zhihu', day: null});
    log(`知乎 OAuth：手动搬回授权码后登录成功（会话数 ${sessions.size}）`);

    res.setHeader('set-cookie', [
      cookieHeader(STATE_COOKIE, '', {maxAge: 0, secure: secureFor(req)}),
      cookieHeader(SESSION_COOKIE, signedValue(cookieSecret, sessionId), {
        maxAge: exchanged.expiresInSeconds,
        secure: secureFor(req)
      })
    ]);
    return sendJson(res, 200, {ok: true, next: state.next});
  }

  function handleMe(req, res, sendJson) {
    const {row} = readSession(req);
    const session = row || null;
    return sendJson(res, 200, {
      ok: true,
      enabled,
      loggedIn: Boolean(session),
      since: session ? session.createdAt : null,
      expiresAt: session ? session.expiresAt : null,
      contentCount: session?.profile?.contentCount ?? null
    });
  }

  function handleLogout(req, res, sendJson) {
    const {id} = readSession(req);
    if (id) sessions.drop(id);
    res.setHeader('set-cookie', cookieHeader(SESSION_COOKIE, '', {
      maxAge: 0,
      secure: secureFor(req)
    }));
    return sendJson(res, 200, {ok: true, loggedIn: false});
  }

  // 给启动横幅 / 健康检查用：说「配没配、多长、指纹前 8 位」，**永远不说值**。
  function describe() {
    const paths = [...acceptedCallbackPaths(fixedRedirect)];
    if (!appId || !appKey) {
      const missing = [!appId && 'ZHIHU_OAUTH_APP_ID', !appKey && 'ZHIHU_OAUTH_APP_KEY'].filter(Boolean);
      return {enabled: false, status: `未配置（缺 ${missing.join(' / ')}）`, callbackPaths: paths};
    }
    const fingerprint = createHash('sha256').update(appKey).digest('hex').slice(0, 8);
    return {
      enabled: true,
      status: `已配置（App Key ${appKey.length} 位，指纹 ${fingerprint}）`,
      redirectUri: fixedRedirect || `按访问域名推导 + ${CALLBACK_PATH}`,
      // 活动页登记的回调必须落在这些路径上；不在的话要回来加一条别名。
      callbackPaths: paths,
      // 「对表」用：那一栏要填的就是 redirectUri。带上长度和指纹是因为
      // 肉眼比 66 个字符很容易漏掉一个空格或多一个斜杠，比指纹可靠得多。
      // 这两个值不含任何密钥，公开无妨（redirect_uri 本来就出现在浏览器地址栏里）。
      redirectUriLength: fixedRedirect.length,
      redirectUriFingerprint: fixedRedirect
        ? createHash('sha256').update(fixedRedirect).digest('hex').slice(0, 12)
        : '',
      // 除白名单之外，域名上任何「长得像回调」的路径也会接住（见 looksLikeCallback）。
      callbackCatchAll: true,
      profileApi: Boolean(accessSecret),
      // 非空说明令牌端点被改过 —— 只可能是测试，正式环境要把它清掉
      tokenEndpointOverride: tokenEndpoint === TOKEN_ENDPOINT ? '' : tokenEndpoint
    };
  }

  return {
    enabled,
    describe,
    handleStart,
    handleCallback,
    // 应急通道：把落在别处的授权码人工搬回来（只在同一浏览器内有效）。
    handleManual,
    handleMe,
    handleLogout,
    redirectUriFor,
    sessions,
    // 给「结案记录」用：只回「这次提交是不是登录用户发的」，不暴露会话内容。
    sessionOf(req) {
      const {row} = readSession(req);
      return row ? {loggedIn: true, since: row.createdAt} : {loggedIn: false, since: null};
    },
    // 测试用：不走 HTTP 直接完成一次回调
    _exchangeCode: exchangeCode
  };
}
