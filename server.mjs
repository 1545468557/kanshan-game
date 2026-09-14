// 《蓝血》本地/线上服务：既托管 public/ 静态页面，也提供这些 API。
//
//   POST /api/npc                  问 NPC 一句话
//   POST /api/submit               提交五题结案
//   GET  /api/admin/records        管理员查看玩家记录（需要密码）
//   GET  /api/auth/zhihu/start     跳去知乎授权页（`?try=root|docs` 是诊断开关）
//   GET  /api/auth/zhihu/callback  知乎带 authorization_code 回来，后端换 token
//   GET  /api/auth/zhihu/config    对外公告「回调地址应该填什么」（不含密钥）
//   POST /api/auth/zhihu/manual    应急通道：把落在别处的授权码人工搬回来换 token
//   GET  /api/auth/me              前端问「现在登录了没」
//   POST /api/auth/logout          退出登录
//
// 密钥全部来自环境变量或 .env.local，这个文件里没有任何真实密钥。

import {createServer} from 'node:http';
import {createHash, timingSafeEqual} from 'node:crypto';
import {join} from 'node:path';

import {loadConfig, describeConfig} from './lib/config.mjs';
import {createStore} from './lib/store.mjs';
import {createModelClient} from './lib/model-client.mjs';
import {createNpcService, hashIp, localDateKey} from './lib/npc-service.mjs';
import {
  createZhihuOAuth,
  acceptedCallbackPaths,
  looksLikeCallback,
  diagnosticRedirect
} from './lib/zhihu-oauth.mjs';
import {readJsonBody, clientIp, sendJson, sendFile, resolveStatic} from './lib/http-util.mjs';
import {blueBloodCase, scoreAnswer} from './public/blueblood-case.mjs';

const config = loadConfig();
const store = createStore(config.dataDir);
const modelClient = createModelClient(config);

// 知乎直答是可选的备用后端口子。config 已经按 ZHIHU_ZHIDA_MODE 决定要不要去钥匙串取密钥。
const npcService = createNpcService({config, modelClient, store, zhihuSecret: config.zhihu.secret});

// 知乎 OAuth 登录。没配 app_id / app_key 时 enabled 为 false，
// 四个路由都会给出明确答复而不是假装成功。
const zhihuOAuth = createZhihuOAuth({config, store});

// 回调路径白名单：内置别名 + ZHIHU_OAUTH_REDIRECT_URI 里的那一条。
// 只影响「在哪条路径上接回调」，不影响换 token 时回传的地址（那个仍以配置为准）。
const callbackPaths = acceptedCallbackPaths(config.zhihuOAuth?.redirectUri || '');

function sameSecret(a, b) {
  const left = createHash('sha256').update(String(a)).digest();
  const right = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(left, right);
}

// 口令可能从哪来：把手上所有通道的值都收集起来，**任意一个对得上就放行**。
//
// 为什么不能只认 「Authorization」 头（2026-09-14 线上实测，别改回去）：
//   线上配置与本地逐字节一致（同一个口令从查询串送进 /api/health?t= 能比对成功），
//   可同一个口令走 「Authorization: Bearer」 打 /api/admin/records 却一律 401
//   ⇒ 那个头**没到 Node 这一层**（托管平台的网关吃掉或覆盖了它）。
//   查询串是实测能到的通道，所以它排在最后兜底。
//   注意「任意一个」这个语义很重要：万一网关不是删掉头、而是**塞进它自己的值**，
//   「取第一个非空值就返回」会让兜底永远轮不到，于是又变成 401。
function adminTokenCandidates(req, url) {
  const out = [];
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) out.push(header.slice(7).trim());
  const custom = req.headers['x-admin-token'];
  if (typeof custom === 'string' && custom.trim()) out.push(custom.trim());
  const fromQuery = (url.searchParams.get('token') || '').trim();
  if (fromQuery) out.push(fromQuery);
  return out.filter(Boolean);
}

function adminAuthorized(req, url) {
  if (!config.admin.enabled) return false;
  const tokens = adminTokenCandidates(req, url);
  if (!tokens.length) return false;
  // 两个口令都接受：正式的（ADMIN_PASSWORD）与给评委的测试口令（ADMIN_TEST_PASSWORD）。
  // 为什么要有第二个名字见 lib/config.mjs 里的注释（平台注入会盖住 .env.local）。
  // 注意：每个比较都要走 sameSecret（定长哈希 + 定时安全比较），不要写成 === 短路判断。
  const secrets = [config.admin.password, config.admin.testPassword].filter(Boolean);
  for (const token of tokens) {
    for (const secret of secrets) {
      if (sameSecret(token, secret)) return true;
    }
  }
  return false;
}

function buildSummary(records) {
  const sessions = new Set(records.map(row => row.session).filter(Boolean));
  const byNpc = {};
  const questions = new Map();
  const fallbackReasons = {};
  let modelCalls = 0;
  let cacheHits = 0;
  let fallbacks = 0;

  for (const row of records) {
    if (row.source === 'model') modelCalls += 1;
    else if (row.source === 'cache') cacheHits += 1;
    else if (row.source === 'fallback') {
      fallbacks += 1;
      fallbackReasons[row.reason || 'unknown'] = (fallbackReasons[row.reason || 'unknown'] || 0) + 1;
    }
    if (row.npcId) byNpc[row.npcId] = (byNpc[row.npcId] || 0) + 1;
    if (row.question) {
      const q = row.question.slice(0, 60);
      questions.set(q, (questions.get(q) || 0) + 1);
    }
  }

  const days = {};
  for (const row of records) {
    if (!row.day) continue;
    days[row.day] = (days[row.day] || 0) + 1;
  }

  const submissions = records.filter(row => row.kind === 'submit');
  const scores = submissions.map(row => row.total).filter(value => Number.isFinite(value));
  const logins = records.filter(row => row.kind === 'login').length;
  // 「人气奖」看的就是登录人数，所以顺手把「登录过的提交」也单独数一份。
  const liftedSubmissions = submissions.filter(row => row.zhihu === true).length;

  return {
    totals: {
      records: records.length,
      questions: records.length - submissions.length,
      submissions: submissions.length,
      sessions: sessions.size,
      logins,
      liftedSubmissions,
      days
    },
    sources: {model: modelCalls, cache: cacheHits, fallback: fallbacks, fallbackReasons},
    byNpc,
    topQuestions: [...questions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([question, count]) => ({question, count})),
    submissionScores: scores.length
      ? {count: scores.length, average: Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length * 10) / 10, values: scores.sort((a, b) => a - b)}
      : {count: 0, average: null, values: []},
    service: npcService.stats()
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const ip = clientIp(req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {'allow': 'GET, POST, HEAD, OPTIONS'});
    return res.end();
  }

  // ---- 健康检查：只说「配没配」，不说值 ----
  if (path === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      config: describeConfig(config),
      stats: npcService.stats()
    });
  }

  // ---- 问 NPC 一句话 ----
  if (path === '/api/npc' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (body.error) return sendJson(res, body.error === 'too_large' ? 413 : 400, {ok: false, fallback: true, reason: body.error});
    const {npcId, question, observed, history, sessionId} = body.value;
    const result = await npcService.ask({
      npcId: String(npcId || ''),
      question: String(question || ''),
      observed: Array.isArray(observed) ? observed.slice(0, 40).map(String) : [],
      history: Array.isArray(history) ? history.slice(-6) : [],
      ip,
      sessionId: String(sessionId || '')
    });
    return sendJson(res, 200, result);
  }

  // ---- 知乎 OAuth 登录 ----
  // 这四条必须排在静态文件之前，否则 /api/auth/... 会被当成接口 404。
  //
  // `?try=root|docs` 是**诊断开关**：活动页「回调地址」那一栏我们看不见，
  // 只能让它替我们试几个候选（白名单硬编码在 lib 里，不接受任意 URL）。
  if (path === '/api/auth/zhihu/start' && req.method === 'GET') {
    return zhihuOAuth.handleStart(req, res, url, {
      // baseUri 传配置里那条：它的 origin 就是「我们自己的地址」最权威的来源，
      // 本地/线上都成立（本机没有 x-forwarded-proto，靠请求头推导会错成 https）。
      redirectUriOverride: diagnosticRedirect(url.searchParams.get('try'), req, {
        baseUri: config.zhihuOAuth?.redirectUri || ''
      })
    });
  }
  // 回调落点：**不限定路径**（见 lib/zhihu-oauth.mjs 里 looksLikeCallback 的注释）。
  // 那一栏是手填的，多一个斜杠、少一段路径、大小写不一致都是必然会出现的事，
  // 而接收端一旦认窄了，代价就是「登录永远完不成」。认宽的成本是零。
  //
  // 安全性：只会进 handleCallback，而它要求 state cookie 对得上才会往下走；
  // 认错的请求至多被 302 回 `/?zhihu=bad_state`，不会执行任何副作用。
  //
  // `/api/auth/zhihu/config` 与下面两条明确的路由都排在万能兜底**前面** ——
  // 否则 `/api/auth/me?code=x` 这种（路径里有 auth、又带 code）会被当成回调。
  if (path === '/api/auth/zhihu/config' && (req.method === 'GET' || req.method === 'HEAD')) {
    return sendJson(res, 200, {ok: true, ...zhihuOAuth.describe()});
  }
  if (path === '/api/auth/me' && (req.method === 'GET' || req.method === 'HEAD')) {
    return zhihuOAuth.handleMe(req, res, sendJson);
  }
  // 应急通道：万一知乎认的回调地址不是我们的，授权码会落在别处（但就在地址栏里）。
  // 用户把整条地址粘回来，服务端用「当时声明的那个地址」去换 token。见 lib 里 manualCodeFrom。
  if (path === '/api/auth/zhihu/manual' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (body.error) return sendJson(res, body.error === 'too_large' ? 413 : 400, {ok: false, reason: body.error});
    return zhihuOAuth.handleManual(req, res, sendJson, body.value?.input);
  }
  if (path === '/api/auth/logout' && req.method === 'POST') {
    return zhihuOAuth.handleLogout(req, res, sendJson);
  }
  if (req.method === 'GET' && looksLikeCallback(path, url.searchParams, callbackPaths)) {
    return zhihuOAuth.handleCallback(req, res, url);
  }

  // ---- 提交结案：分数在服务端重算，不信前端传来的数字 ----
  if (path === '/api/submit' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (body.error) return sendJson(res, body.error === 'too_large' ? 413 : 400, {ok: false, reason: body.error});
    const {sessionId, answers} = body.value;
    const safeAnswers = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
    const scores = blueBloodCase.questions.map(question => scoreAnswer(question, safeAnswers[question.id] || ''));
    const total = scores.reduce((sum, value) => sum + value, 0);
    const lifted = zhihuOAuth.sessionOf(req);
    store.addRecord({
      ts: Date.now(),
      day: localDateKey(Date.now()),
      kind: 'submit',
      session: String(sessionId || '').slice(0, 40),
      ip: hashIp(ip, localDateKey(Date.now())),
      // 只记「是不是登录用户提交的」，不记会话 id 或任何凭证
      zhihu: lifted.loggedIn,
      total,
      scores,
      answers: Object.fromEntries(blueBloodCase.questions.map(question => [question.id, String(safeAnswers[question.id] || '').slice(0, 500)]))
    });
    return sendJson(res, 200, {ok: true, total, scores});
  }

  // ---- 管理员页面与接口 ----
  if (path === '/admin' && req.method === 'GET') {
    if (sendFile(res, join(config.staticDir, 'admin.html'))) return;
    return sendJson(res, 404, {ok: false, message: '管理页面文件缺失'});
  }

  if (path.startsWith('/api/admin/')) {
    if (!config.admin.enabled) {
      return sendJson(res, 503, {ok: false, message: '还没有配置管理口令（ADMIN_PASSWORD 或 ADMIN_TEST_PASSWORD，至少 6 位），管理页面已关闭。'});
    }
    if (!adminAuthorized(req, url)) return sendJson(res, 401, {ok: false, message: '密码不对'});
    if (path === '/api/admin/records') {
      const records = store.readRecords();
      const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '400', 10) || 400, 2000);
      return sendJson(res, 200, {ok: true, total: records.length, summary: buildSummary(records), records: records.slice(-limit).reverse()});
    }
    if (path === '/api/admin/reset' && req.method === 'POST') {
      const ok = store.resetRecords();
      return sendJson(res, ok ? 200 : 500, {ok});
    }
    return sendJson(res, 404, {ok: false, message: '没有这个管理接口'});
  }

  // ---- 静态文件 ----
  if (req.method === 'GET' || req.method === 'HEAD') {
    // 走到这里还带着 /api/ 前缀，说明是接口路径写错了。
    // 必须回一个明确的 404 JSON，绝不能回落成首页 HTML：
    // 否则调用方拿到一坨 HTML 配 200，排查起来毫无头绪。
    if (path.startsWith('/api/')) {
      return sendJson(res, 404, {ok: false, message: `没有这个接口：${path}`});
    }

    // 任何以点开头的路径片段（.env、.git、.DS_Store）一律不提供
    const hasDotSegment = path.split('/').some(segment => segment.length > 1 && segment.startsWith('.'));
    if (!hasDotSegment) {
      let full = resolveStatic(config.staticDir, path);
      // 不暴露剧情全文与配置文件：即使它们被误拷进 dist，也不对外提供
      if (full && /(^|[/\\])(STORY\.md|README\.md|\.env[^/\\]*)$/.test(full)) full = null;
      if (full && sendFile(res, full, {head: req.method === 'HEAD', req})) return;
      // 只有「看起来像路由」（末段没有扩展名）的路径才回落到首页。
      // 带扩展名的路径老老实实 404 —— 否则 /STORY.md 会拿到一个 200 的首页，看着像泄漏。
      const lastSegment = path.split('/').pop() || '';
      if (!lastSegment.includes('.') && sendFile(res, join(config.staticDir, 'index.html'), {head: req.method === 'HEAD', req})) return;
    }
  }

  sendJson(res, 404, {ok: false, message: '没有这个地址'});
});

server.listen(config.port, () => {
  const info = describeConfig(config);
  const oauth = zhihuOAuth.describe();
  const lines = [
    '',
    `《蓝血》本地服务已启动 →  http://127.0.0.1:${config.port}/   （游戏首页／开场菜单）`,
    `  第一幕      http://127.0.0.1:${config.port}/room.html`,
    config.admin.enabled ? `  玩家记录   http://127.0.0.1:${config.port}/admin` : '  玩家记录   未开启（缺 ADMIN_PASSWORD）',
    `  NPC 大脑   ${info.modelBackend}`,
    `  成本保护   每天最多 ${info.dailyModelBudget} 次 · 每人限制 ${info.rateLimit}`,
    info.zhihuZhida === '未启用' ? null : `  知乎直答   ${info.zhihuZhida}`,
    `  知乎登录   ${oauth.status}`,
    // 这一行是给「活动页要填什么回调地址」用的。改了路径就必须改那边，反之亦然。
    oauth.enabled ? `  回调地址   ${oauth.redirectUri}` : null,
    // 活动页登记的那条路径只要落在这里面，登录就一定能跳回来；
    // 落在这几条之外的任何「长得像回调」的路径也接得住（见 looksLikeCallback）。
    oauth.enabled ? `  接受的回调路径  ${[...callbackPaths].join('  ')}  （+ 域名上任何像回调的路径，含尾斜杠）` : null,
    oauth.tokenEndpointOverride
      ? `  ⚠ 提醒     令牌端点被指向了 ${oauth.tokenEndpointOverride}（只有测试才该这样，正式部署请清掉 ZHIHU_OAUTH_TOKEN_ENDPOINT）`
      : null,
    ...info.missing.map(note => `  提示       ${note}`)
  ].filter(Boolean);
  console.log(lines.join('\n') + '\n');
});

export {server, config, zhihuOAuth};
