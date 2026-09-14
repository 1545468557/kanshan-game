// 配置向导的纯逻辑测试。不发网络请求、不读键盘、不写磁盘。
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  PROVIDERS, PROVIDER_ORDER, resolveProviderChoice, mask, ensureAdminPassword, composeEnvFile, parseArgs, detectProvider
} from '../lib/setup-core.mjs';

let passed = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ' — ' + detail : ''}`);
}

// ---- 厂商清单本身要站得住 ----
{
  check('至少有一家厂商可选', PROVIDER_ORDER.length >= 4, String(PROVIDER_ORDER.length));
  for (const id of PROVIDER_ORDER) {
    const provider = PROVIDERS[id];
    check(`${id} 应该有 label/tag/baseUrl/model`, Boolean(provider?.label && provider?.tag && provider?.baseUrl && provider?.model));
    check(`${id} 的地址必须是 https`, String(provider?.baseUrl || '').startsWith('https://'), provider?.baseUrl);
    check(`${id} 必须给出注册步骤`, Array.isArray(provider?.steps) && provider.steps.length >= 3);
    check(`${id} 必须有一句费用说明`, typeof provider?.note === 'string' && provider.note.length > 6);
  }
  check('第一顺位应该是免费的智谱', PROVIDER_ORDER[0] === 'zhipu', PROVIDER_ORDER[0]);
}

// ---- 菜单选择 ----
{
  check('空输入默认选免费那家', resolveProviderChoice('').id === 'zhipu');
  check('1 是智谱', resolveProviderChoice('1').id === 'zhipu');
  check('2 是 DeepSeek', resolveProviderChoice('2').id === 'deepseek');
  check('4 是 Kimi', resolveProviderChoice('4').id === 'moonshot');
  check('0 走自动识别', resolveProviderChoice('0').kind === 'auto');
  check('5 走知乎直答', resolveProviderChoice('5').kind === 'zhida');
  check('越界数字被拒绝', resolveProviderChoice('9').kind === 'invalid');
  check('乱输入被拒绝', resolveProviderChoice('abc').kind === 'invalid');
  check('前后空格不影响', resolveProviderChoice('  3  ').id === 'dashscope');
}

// ---- 遮罩：屏幕上只露头尾 ----
{
  const long = mask('sk-1234567890abcdefghij');
  check('长密钥遮罩后不该包含中段', !long.includes('67890abcdef'), long);
  check('长密钥遮罩后应该露头', long.startsWith('sk-'), long);
  check('空值有明确提示', mask('') === '（空）');
  check('短值全部遮住', mask('abcd') === '••••');
}

// ---- 管理员密码兜底 ----
{
  const generated = ensureAdminPassword('', n => 'a'.repeat(n * 2));
  check('空输入应该自动生成', generated.generated && generated.password.startsWith('bl-'));
  const extended = ensureAdminPassword('123', n => 'f'.repeat(n * 2));
  check('太短应该被加长', extended.extended && extended.password.length >= 6, extended.password);
  const kept = ensureAdminPassword('mypassword', n => 'f'.repeat(n * 2));
  check('够长就原样保留', kept.password === 'mypassword' && !kept.generated && !kept.extended);
}

// ---- 生成的 .env.local 内容 ----
{
  const text = composeEnvFile({
    baseUrl: 'https://example.com/v1',
    model: 'some-model',
    apiKey: 'sk-test-key',
    adminPassword: 'my-admin-pw',
    zhihuMode: '',
    zhihuSecret: 'THIS-SHOULD-NEVER-BE-WRITTEN'
  });
  check('写入模型地址', text.includes('MODEL_BASE_URL=https://example.com/v1'));
  check('写入模型名', text.includes('MODEL_NAME=some-model'));
  check('写入密钥', text.includes('MODEL_API_KEY=sk-test-key'));
  check('写入管理员密码', text.includes('ADMIN_PASSWORD=my-admin-pw'));
  check('包含成本保护默认值', text.includes('DAILY_MODEL_BUDGET=300'));
  check('以换行结尾', text.endsWith('\n'));
  check('出于安全，不把知乎密钥写进文件（它本就在钥匙串里）', !text.includes('THIS-SHOULD-NEVER-BE-WRITTEN'));
  check('每行都是 KEY=VALUE 或注释', text.split('\n').every(row => !row.trim() || row.trim().startsWith('#') || /^[A-Z_]+=/.test(row)));
  check('ZhiHu 备用项默认留空', /^ZHIHU_ZHIDA_MODE=$/m.test(text));
}

// ---- 参数解析 ----
{
  const spaced = parseArgs(['--provider', 'zhipu', '--key-stdin']);
  check('支持 --flag value 写法', spaced.flags.provider === 'zhipu');
  check('支持布尔开关', spaced.booleans.has('key-stdin'));
  const equals = parseArgs(['--admin-password=abc123', '--no-verify']);
  check('支持 --flag=value 写法', equals.flags['admin-password'] === 'abc123');
  check('等号写法下布尔开关也认得', equals.booleans.has('no-verify'));
  check('无关参数被忽略', Object.keys(parseArgs(['foo', 'bar']).flags).length === 0);
  check('booleans 是 Set（调用方必须用 has）', parseArgs(['--key-stdin']).booleans instanceof Set);
}

// ---- 调用方有没有正确使用 parseArgs 的返回值 ----
// 背景：曾经出现过「纯函数返回 Set，setup.mjs 却写成 booleans['key-stdin']」的 bug。
// Set 方括号取值永远返回 undefined，于是 --key-stdin 静默失效，
// 而纯逻辑测试全绿（它只验证了返回值形状）。这道扫描专门防这一类。
{
  const here = dirname(fileURLToPath(import.meta.url));
  const setupSource = readFileSync(join(here, '..', 'scripts', 'setup.mjs'), 'utf8');
  check('setup.mjs 不得对方括号方式取布尔开关', !/booleans\s*\[/.test(setupSource));
  check('setup.mjs 必须用 hasFlag/booleans.has 判断开关', /booleans\.has\(|hasFlag\(/.test(setupSource));
  check('setup.mjs 里出现的每个开关名都是它真的会用到的', ['key-stdin', 'no-verify'].every(name => setupSource.includes(name)));

  // 改用 node:readline 会同时带回两个老毛病：非交互模式下抢走标准输入、
  // 以及关不掉密钥回显（密钥会明文出现在屏幕上，可能被截图）。
  const promptSource = readFileSync(join(here, '..', 'lib', 'prompt.mjs'), 'utf8');
  check('setup.mjs 不得再引入 node:readline', !/node:readline/.test(setupSource));
  check('setup.mjs 必须用自带的行读取器', setupSource.includes('lib/prompt.mjs'));
  check('密钥一律走不回显的那条路', /const askSecret = prompt => readLine\(\{prompt, secret: true\}\)/.test(setupSource));
  check('行读取器必须真的关掉终端回显', promptSource.includes('setRawMode(true)'));
  check('行读取器要认得 Ctrl-C', promptSource.includes('\\u0003'));
  check('行读取器要认得退格', promptSource.includes('\\u007f'));
  check('行读取器要处理管道读完的情况，否则会一直等下去', promptSource.includes("stdin.on('end'"));
  check('行读取器退出时要还原终端状态', promptSource.includes("process.on('exit'"));
}

// ---- 自动识别：第一个不通就试下一个 ----
{
  const tried = [];
  const result = await detectProvider('sk-some-key', {
    makeClient: (provider, key) => ({
      async chat() {
        tried.push(provider.label);
        if (provider.label.includes('智谱')) throw Object.assign(new Error('401'), {kind: 'auth'});
        return '好';
      }
    })
  });
  check('应该按顺序挨个试', tried.length === 2, tried.join(' → '));
  check('应该认出第二家', result.found === 'deepseek', String(result.found));
  check('应该记住失败原因', result.attempts[0].kind === 'auth', JSON.stringify(result.attempts));

  const none = await detectProvider('sk-bad', {
    makeClient: () => ({async chat() { throw Object.assign(new Error('nope'), {kind: 'auth'}); }})
  });
  check('四家都不通时应该如实报告', none.found === null && none.attempts.length === PROVIDER_ORDER.length);
}

if (failures.length) {
  console.log(`配置向导：${passed} 项通过，${failures.length} 项失败`);
  for (const row of failures) console.log('  ✗ ' + row);
  process.exitCode = 1;
} else {
  console.log(`配置向导：${passed} 项全部通过（菜单 / 遮罩 / 密码兜底 / env 文件 / 参数 / 自动识别）。未联网。`);
}
