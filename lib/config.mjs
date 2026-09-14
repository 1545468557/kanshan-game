// 配置读取。真实密钥只从这里进来，任何地方都不要把它打印出来。
//
// 优先级：真实环境变量 > .env.local > .env
// 这样本地开发时用 .env.local，部署到托管平台时平台的环境变量会自动生效，
// 不需要改一行代码。

import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {readZhihuSecretFromKeychain} from './keychain.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// 极简 .env 解析：支持 KEY=VALUE、# 注释、值两侧的引号。
// 故意不支持多行值和变量展开 —— 配置越简单，出错的地方越少。
export function parseEnv(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadFile(env, name) {
  const path = join(root, name);
  if (!existsSync(path)) return false;
  Object.assign(env, parseEnv(readFileSync(path, 'utf8')));
  return true;
}

function intOf(env, key, fallback) {
  const value = Number.parseInt(env[key] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadConfig(overrides = {}) {
  const env = {};
  loadFile(env, '.env');
  loadFile(env, '.env.local');
  Object.assign(env, process.env);
  Object.assign(env, overrides);

  const modelKey = (env.MODEL_API_KEY || '').trim();
  const adminPassword = (env.ADMIN_PASSWORD || '').trim();
  // 给评委用的**测试口令**，与正式口令并列存在（两个都接受）。
  // 为什么必须多出这一个名字：托管平台会给运行环境注入 ADMIN_PASSWORD，而
  // 「真实环境变量 > .env.local」这条优先级意味着**改了 .env.local 线上也不会变**
  // （2026-09-14 实测：改完线上仍是旧口令；而同一个文件里的 RATE_MAX_PER_WINDOW
  //   确实生效了 ⇒ 不是「文件没上传」，是这个键被平台盖住了）。
  // 换成一个平台不会注入的名字，改 .env.local 就能真的换掉评委手里那一个，
  // 而且不用动正式口令、不影响原来的使用者。
  const adminTestPassword = (env.ADMIN_TEST_PASSWORD || '').trim();
  const zhihuMode = (env.ZHIHU_ZHIDA_MODE || '').trim().toLowerCase();

  // 只有显式打开直答时才去钥匙串取密钥。取不到也不报错，只是用不了直答。
  let zhihuSecret = (env.ZHIHU_ACCESS_SECRET || '').trim();
  let zhihuSecretFrom = zhihuSecret ? 'env' : 'none';
  if (!zhihuSecret && zhihuMode) {
    zhihuSecret = readZhihuSecretFromKeychain();
    if (zhihuSecret) zhihuSecretFrom = 'keychain';
  }

  return {
    root,
    staticDir: join(root, 'public'),
    // 玩家记录与缓存写在哪里。托管平台（比如 Vercel）的项目目录是只读的，
    // 那时候要把 DATA_DIR 指到 /tmp 之类的可写位置。
    dataDir: (env.DATA_DIR || '').trim() || join(root, 'data'),
    port: intOf(env, 'PORT', 4180),

    model: {
      baseUrl: (env.MODEL_BASE_URL || '').trim().replace(/\/+$/, ''),
      name: (env.MODEL_NAME || '').trim(),
      // 这里只保留是否配置了密钥，不保留密钥本身以外的任何描述
      key: modelKey,
      configured: Boolean(modelKey && (env.MODEL_BASE_URL || '').trim() && (env.MODEL_NAME || '').trim()),
      maxTokens: intOf(env, 'MODEL_MAX_TOKENS', 320),
      timeoutMs: intOf(env, 'MODEL_TIMEOUT_MS', 20000)
    },

    limits: {
      dailyModelBudget: intOf(env, 'DAILY_MODEL_BUDGET', 300),
      rateMaxPerWindow: intOf(env, 'RATE_MAX_PER_WINDOW', 14),
      rateWindowMs: intOf(env, 'RATE_WINDOW_MS', 300000),
      maxQuestionChars: intOf(env, 'MAX_QUESTION_CHARS', 160)
    },

    admin: {
      // 没配置密码时管理页面直接关闭，而不是退化成「无密码可访问」
      password: adminPassword,
      // 给评委的测试口令，和正式口令**并列**；两个任一个对上就放行。
      testPassword: adminTestPassword,
      enabled: adminPassword.length >= 6 || adminTestPassword.length >= 6
    },

    zhihu: {
      // '' = 关闭；'auto' = 只在没配自己的模型时用直答；'always' = 优先直答
      mode: zhihuMode,
      secret: zhihuSecret,
      secretFrom: zhihuSecretFrom,
      available: Boolean(zhihuSecret)
    },

    zhihuOAuth: {
      // 由赛事活动页在「创建项目」后分配。三条都填齐才会打开登录入口，
      // 只填一半时宁可不出现按钮，也不要出现一个点了就报错的按钮。
      appId: (env.ZHIHU_OAUTH_APP_ID || '').trim(),
      appKey: (env.ZHIHU_OAUTH_APP_KEY || '').trim(),
      // 留空 = 按访问域名推导。**上线后建议显式填写**，因为它必须和
      // 活动页登记的回调地址逐字符一致（含协议、域名、路径、尾部斜杠）。
      redirectUri: (env.ZHIHU_OAUTH_REDIRECT_URI || '').trim(),
      // 只为自动化测试存在：把换 token 的地址指到本地假服务，就能整条链路离线跑通。
      // 平时留空，走 lib/zhihu-oauth.mjs 里的官方地址。被填上时启动横幅会明确警告。
      tokenEndpoint: (env.ZHIHU_OAUTH_TOKEN_ENDPOINT || '').trim()
    }
  };
}

// 给日志用的一句话摘要：只说「有没有配」，永远不说值是什么。
export function describeConfig(config) {
  const notes = [];
  const backend = config.model.configured
    ? `${config.model.name} @ ${config.model.baseUrl}`
    : config.zhihu.available
      ? '知乎直答（密钥取自钥匙串）'
      : '未配置';

  if (!config.model.configured) {
    if (config.zhihu.available) {
      notes.push('没有自己的模型密钥，当前借用知乎直答；它的每日额度很小，正式演示前建议换成自己的模型密钥');
    } else {
      // 只报「真正缺的」。注意这里只用密钥做「有没有」的判断，绝不打印它的值。
      const absent = [
        ['MODEL_API_KEY', config.model.key],
        ['MODEL_BASE_URL', config.model.baseUrl],
        ['MODEL_NAME', config.model.name]
      ].filter(([, value]) => !value).map(([name]) => name);
      notes.push(absent.length === 3
        ? 'MODEL_API_KEY / MODEL_BASE_URL / MODEL_NAME 都没配，NPC 会使用既定台词'
        : `只差 ${absent.join(' / ')}，补上就能让 NPC 由大模型即兴扮演`);
    }
  }
  if (!config.admin.enabled) notes.push('ADMIN_PASSWORD 未配置（至少 6 位），玩家记录页面已关闭');

  // 只说「配没配」，不打印任何凭证内容。App ID 会进授权 URL（属于公开配置），
  // App Key 永远不会 —— 所以这里连 App ID 也不回显，免得日后有人顺手加了别的输出。
  const oauthAppId = config.zhihuOAuth.appId;
  const oauthAppKey = config.zhihuOAuth.appKey;
  const oauthStatus = oauthAppId && oauthAppKey
    ? '已启用'
    : oauthAppId || oauthAppKey
      ? `配置不完整（缺 ${!oauthAppId ? 'ZHIHU_OAUTH_APP_ID' : 'ZHIHU_OAUTH_APP_KEY'}）`
      : '未配置（缺 ZHIHU_OAUTH_APP_ID / ZHIHU_OAUTH_APP_KEY）';

  return {
    ready: config.model.configured || config.zhihu.available,
    modelBackend: backend,
    missing: notes,
    dailyModelBudget: config.limits.dailyModelBudget,
    rateLimit: `${config.limits.rateMaxPerWindow} 次 / ${Math.round(config.limits.rateWindowMs / 1000)} 秒`,
    adminEnabled: config.admin.enabled,
    // 「给评委的测试口令」配没配 —— 仍然只说有没有，不回显值（和这个函数里其它字段一个规矩）。
    // 为什么值得单独一个字段：线上改完 .env.local 仍然 401 时，光看 adminEnabled 分不清
    // 「代码没上去」和「这个键没被读到」。有了它，一条 curl 就能定位（2026-09-14）。
    adminTestPassword: config.admin.testPassword ? '已配置' : '未配置',
    zhihuZhida: config.zhihu.mode
      ? `${config.zhihu.mode}（密钥来源：${config.zhihu.secretFrom === 'keychain' ? '钥匙串' : config.zhihu.secretFrom === 'env' ? '环境变量' : '无'}）`
      : '未启用',
    zhihuOAuth: oauthStatus
  };
}
