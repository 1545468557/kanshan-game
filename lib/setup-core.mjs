// 配置向导的纯逻辑部分：厂商清单、env 文件内容、遮罩显示、参数解析。
// 这里不读键盘、不发请求，所以可以被完整测试覆盖。
// 交互那层壳在 scripts/setup.mjs。

export const PROVIDERS = {
  zhipu: {
    label: '智谱 GLM',
    tag: '免费，不限量，不用花钱',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    steps: [
      '浏览器打开 https://open.bigmodel.cn/ ，用手机号注册',
      '按页面提示完成实名认证（国内厂商都要这一步）',
      '进入「API 密钥」页面，点「创建新的 API 密钥」',
      '复制它给出的那串字符'
    ],
    note: 'GLM-4-Flash 这个模型是永久免费的，不限用量。NPC 说一两句话完全够用。'
  },
  deepseek: {
    label: 'DeepSeek（深度求索）',
    tag: '很便宜，中文好',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    steps: [
      '浏览器打开 https://platform.deepseek.com/ ，注册并登录',
      '左侧找到「API keys」，点「创建 API key」',
      '复制那串 sk- 开头的字符（关掉弹窗后可能就看不到了，先粘到安全的地方）'
    ],
    note: '需要先充一点点钱。NPC 每次回答只有几十个字，充 5 块大概能玩很久。'
  },
  dashscope: {
    label: '通义千问（阿里云百炼）',
    tag: '新用户有免费额度',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    steps: [
      '浏览器打开 https://bailian.console.aliyun.com/ ，用支付宝或淘宝账号登录',
      '开通「模型服务」',
      '在「API-KEY 管理」里新建一个，复制 sk- 开头的那串'
    ],
    note: '新账号一般有免费额度，用完才需要付费。'
  },
  moonshot: {
    label: '月之暗面 Kimi',
    tag: '长文本好',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    steps: [
      '浏览器打开 https://platform.moonshot.cn/ 注册登录',
      '进入「API Key 管理」，新建一个',
      '复制 sk- 开头的那串'
    ],
    note: '需要充值少量费用。'
  }
};

export const PROVIDER_ORDER = ['zhipu', 'deepseek', 'dashscope', 'moonshot'];

// 把菜单里的数字换成厂商名。空输入＝第一个（智谱，免费）。
// '0' 表示「我不知道是哪一家，帮我挨个试试」。
export function resolveProviderChoice(input) {
  const value = String(input ?? '').trim();
  if (!value) return {kind: 'provider', id: PROVIDER_ORDER[0]};
  if (value === '0') return {kind: 'auto'};
  if (value === '5') return {kind: 'zhida'};
  const index = Number(value);
  if (!Number.isInteger(index) || index < 1 || index > PROVIDER_ORDER.length) return {kind: 'invalid'};
  return {kind: 'provider', id: PROVIDER_ORDER[index - 1]};
}

// 手上有一串密钥，但不确定是哪家申请的？那就挨个试一遍。
// 每次只发一个字的请求，代价极小。第一个通的就认定是它。
export async function detectProvider(apiKey, {makeClient, probe = '好'} = {}) {
  const attempts = [];
  for (const id of PROVIDER_ORDER) {
    const provider = PROVIDERS[id];
    try {
      const reply = await makeClient(provider, apiKey).chat([{role: 'user', content: `只回复一个字：${probe}`}]);
      return {found: id, provider, reply, attempts};
    } catch (error) {
      attempts.push({id, label: provider.label, kind: error?.kind || 'unknown', message: error?.message || String(error)});
    }
  }
  return {found: null, attempts};
}

// 在屏幕上只露头尾，中间打点。用于回显确认，避免整串密钥暴露在终端历史里。
export function mask(value) {
  const text = String(value ?? '');
  if (!text) return '（空）';
  if (text.length <= 8) return '•'.repeat(text.length);
  return `${text.slice(0, 3)}${'•'.repeat(Math.min(12, text.length - 6))}${text.slice(-3)}`;
}

// 管理员密码太短就补长，避免有人设成 "1"。
export function ensureAdminPassword(value, randomHex) {
  const typed = String(value ?? '').trim();
  if (!typed) return {password: `bl-${randomHex(4)}`, generated: true};
  if (typed.length < 6) return {password: `${typed}${randomHex(3)}`, generated: false, extended: true};
  return {password: typed, generated: false};
}

// 生成 .env.local 的完整内容。这里必须只写用户自己给的密钥，
// 不写任何从别处读来的东西。
export function composeEnvFile(settings) {
  const rows = [
    '# 这个文件由 npm run setup 生成，只有你本机有，永远不会进 Git。',
    '# 想手工修改也可以：改完保存，重启 node server.mjs 即可。',
    '',
    '# ===== 模型接口 =====',
    `MODEL_BASE_URL=${settings.baseUrl || ''}`,
    `MODEL_NAME=${settings.model || ''}`,
    `MODEL_API_KEY=${settings.apiKey || ''}`,
    '',
    '# ===== 管理员密码（打开 /admin 看玩家记录用）=====',
    `ADMIN_PASSWORD=${settings.adminPassword || ''}`,
    '',
    '# ===== 成本保护（一般不用改）=====',
    'MODEL_MAX_TOKENS=320',
    'MODEL_TIMEOUT_MS=20000',
    'DAILY_MODEL_BUDGET=300',
    'RATE_MAX_PER_WINDOW=14',
    'RATE_WINDOW_MS=300000',
    'MAX_QUESTION_CHARS=160',
    'PORT=4180',
    '# 留空＝项目目录下的 data/；部署到只读文件系统的平台时改成 /tmp/data 之类',
    'DATA_DIR=',
    '',
    '# ===== 知乎直答（可选备用，额度很小）=====',
    `ZHIHU_ZHIDA_MODE=${settings.zhihuMode || ''}`,
    'ZHIHU_ACCESS_SECRET='
  ];
  return rows.join('\n') + '\n';
}

const FLAGS_WITH_VALUE = ['provider', 'base-url', 'model', 'admin-password'];

// 极简参数解析。支持 --flag value 和 --flag=value 两种写法。
export function parseArgs(argv = []) {
  const out = {flags: {}, booleans: new Set()};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      out.flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    if (FLAGS_WITH_VALUE.includes(body)) {
      out.flags[body] = argv[index + 1] ?? '';
      index += 1;
    } else {
      out.booleans.add(body);
    }
  }
  return out;
}
