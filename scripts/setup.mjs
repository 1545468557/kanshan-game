// 「一步步跟着走」的配置向导。
//
//   npm run setup                     交互式，推荐给不熟悉的人
//   npm run setup -- --provider zhipu --admin-password 你的密码 --key-stdin
//                                     非交互式：密钥从标准输入读，不进 shell 历史
//
// 它帮你做四件事：挑一家模型厂商、把密钥安全地写进 .env.local、
// 设一个管理员密码、当场用它问 NPC 一句话看看通不通。
// 全程不用你打开任何文件，也不用你懂什么叫 API。

import {existsSync, writeFileSync, copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {randomBytes} from 'node:crypto';

import {createModelClient, ModelError} from '../lib/model-client.mjs';
import {buildMessages, cleanReply, looksInCharacter} from '../lib/npc-persona.mjs';
import {readZhihuSecretFromKeychain} from '../lib/keychain.mjs';
import {readLine} from '../lib/prompt.mjs';
import {
  PROVIDERS, PROVIDER_ORDER, resolveProviderChoice, mask, ensureAdminPassword, composeEnvFile, parseArgs, detectProvider
} from '../lib/setup-core.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, '.env.local');

const {flags, booleans} = parseArgs(process.argv.slice(2));
// booleans 是 Set，必须用 has() 判断，不能用方括号取值（那永远是 undefined）。
const hasFlag = name => booleans.has(name);
const nonInteractive = Boolean(flags.provider) || hasFlag('key-stdin');

const line = (text = '') => console.log(text);
const rule = () => line('─'.repeat(58));

// 普通提问：看得见你打进去的字。
const ask = prompt => readLine({prompt});

// 敏感提问：屏幕上只画圆点。密钥走这条。
const askSecret = prompt => readLine({prompt, secret: true});

async function verify(settings) {
  const useZhida = !settings.apiKey && Boolean(settings.zhihuSecret);
  const config = {
    model: {
      baseUrl: String(settings.baseUrl || '').replace(/\/+$/, ''),
      name: settings.model,
      key: settings.apiKey,
      configured: Boolean(settings.apiKey && settings.baseUrl && settings.model),
      maxTokens: 320,
      timeoutMs: 30000
    },
    limits: {dailyModelBudget: 300, rateMaxPerWindow: 14, rateWindowMs: 300000, maxQuestionChars: 160},
    admin: {password: settings.adminPassword, enabled: true},
    zhihu: {mode: settings.zhihuMode, secret: settings.zhihuSecret || ''}
  };
  const client = createModelClient(config);
  const question = '方老师，你手上的血怎么会是蓝色的？那瓶子是干什么用的？';
  const messages = buildMessages({npcId: 'trainer', question, pressure: 'calm'});
  const started = Date.now();
  const raw = useZhida
    ? await client.zhidaChat(messages, config.zhihu.secret)
    : await client.chat(messages);
  const reply = cleanReply(raw);
  return {reply, ms: Date.now() - started, inCharacter: looksInCharacter(reply), backend: useZhida ? '知乎直答' : config.model.name};
}

// ---------------------------------------------------------------------------

const settings = {baseUrl: '', model: '', apiKey: '', adminPassword: '', zhihuMode: '', zhihuSecret: ''};

try {
  if (!nonInteractive) {
    line();
    rule();
    line('  《蓝血》NPC 对话 · 配置向导');
    rule();
    line();
    line('  后面这些东西需要一个「模型接口」才能工作。你可以这样理解：');
    line('  我们给每个 NPC 请了一位演员，你问一句，他答一句，按次算钱。');
    line('  接下来要做的事，就是去拿一张这位演员的「门禁卡」（叫 API Key）。');
    line();
    line('  你想用哪一家？（按数字，再回车）');
    line();
    PROVIDER_ORDER.forEach((id, index) => {
      const provider = PROVIDERS[id];
      const star = index === 0 ? '   ← 免费，推荐' : '';
      line(`    ${index + 1}  ${provider.label.padEnd(12)} —— ${provider.tag}${star}`);
    });
    line('    0  我不知道是哪一家的，帮我挨个试一遍   ← 手上已经有密钥就选这个');
    line('    5  先不注册，用你机器上现成的知乎密钥试试（额度小，只能问 2 次）');
    line();
    const choice = resolveProviderChoice(await ask('  请选择（直接回车＝1）：'));

    if (choice.kind === 'invalid') {
      line();
      line('  没看懂这个选项，重新运行一次吧。');
      line();
      process.exit(1);
    }

    if (choice.kind === 'auto') {
      line();
      line('  没问题。先拿到那串密钥，然后我挨个试一遍，看它是哪一家的。');
      line();
      settings.apiKey = await askSecret('  粘到下面再回车（屏幕上不显示，这是正常的）：');
      if (!settings.apiKey) {
        line();
        line('  没有输入任何内容，什么都没有改。想重来就再跑一次 npm run setup。');
        line();
        process.exit(1);
      }
      line(`  收到，长度 ${settings.apiKey.length} 个字符（${mask(settings.apiKey)}）。`);
      line();
      line('  正在挨个试，每家只发一个字的请求，大概需要十几秒……');
      const detect = await detectProvider(settings.apiKey, {
        makeClient: (provider, key) => createModelClient({
          model: {
            baseUrl: String(provider.baseUrl).replace(/\/+$/, ''),
            name: provider.model,
            key,
            configured: true,
            maxTokens: 8,
            timeoutMs: 15000
          },
          limits: {dailyModelBudget: 1, rateMaxPerWindow: 1, rateWindowMs: 1000, maxQuestionChars: 10},
          admin: {password: '', enabled: false},
          zhihu: {mode: '', secret: ''}
        })
      });
      if (!detect.found) {
        line();
        line('  四家都试了，都没通。各家返回的原因是：');
        line();
        for (const attempt of detect.attempts) line(`    · ${attempt.label}：${attempt.kind}`);
        line();
        line('  最可能的原因：密钥复制不完整（少字符、末尾带空格）、密钥被停用，');
        line('  或者它不属于这四家（比如是 OpenAI 官方、或者别的小平台）。');
        line('  这种情况就直接打开 .env.local，手工填 MODEL_BASE_URL / MODEL_NAME / MODEL_API_KEY。');
        line();
        process.exit(1);
      }
      settings.baseUrl = detect.provider.baseUrl;
      settings.model = detect.provider.model;
      line();
      line(`  认出来了：是「${detect.provider.label}」，模型用 ${detect.provider.model}。`);
    } else if (choice.kind === 'zhida') {
      settings.zhihuMode = 'auto';
      settings.zhihuSecret = readZhihuSecretFromKeychain();
      if (!settings.zhihuSecret) {
        line();
        line('  没能从系统钥匙串里读到知乎密钥，没办法走这一条。');
        line('  请改用 1-4 里的任意一家（推荐 1，免费）。');
        line();
        process.exit(1);
      }
      line();
      line('  好，先借用你机器上已经存好的知乎密钥。');
      line('  ⚠️ 提醒：知乎直答目前每天只能问 2 次，只够确认「能通」。');
      line('     要放上公网给别人玩，还是得回到 1-4 里某一家。');
    } else {
      const provider = PROVIDERS[choice.id];
      line();
      rule();
      line(`  ${provider.label}　${provider.tag}`);
      rule();
      line();
      line('  这串密钥得你自己去拿，我没法替你注册（要手机号和你本人实名）。步骤是：');
      line();
      provider.steps.forEach((step, index) => line(`    ${index + 1}. ${step}`));
      line();
      line(`  ℹ️ ${provider.note}`);
      line();
      settings.apiKey = await askSecret('  拿到之后，粘到下面再回车（屏幕上不显示，这是正常的）：');
      if (!settings.apiKey) {
        line();
        line('  没有输入任何内容，什么都没有改。想重来就再跑一次 npm run setup。');
        line();
        process.exit(1);
      }
      settings.baseUrl = provider.baseUrl;
      settings.model = provider.model;
      line(`  收到，长度 ${settings.apiKey.length} 个字符（${mask(settings.apiKey)}）。`);
    }
  } else {
    // ---- 非交互模式 ----
    const id = flags.provider;
    if (id === 'zhida') {
      settings.zhihuMode = 'auto';
      settings.zhihuSecret = readZhihuSecretFromKeychain();
      if (!settings.zhihuSecret) throw new Error('钥匙串里没有可用的知乎密钥');
    } else {
      const provider = PROVIDERS[id];
      if (!provider) throw new Error(`不认识的厂商：${id}。可选：${PROVIDER_ORDER.join(' / ')} / zhida`);
      settings.baseUrl = flags['base-url'] || provider.baseUrl;
      settings.model = flags.model || provider.model;
      if (hasFlag('key-stdin')) {
        // 管道传进来时屏幕上不该多出任何东西；如果是人在终端上手敲，就给个提示并画点。
        const typed = Boolean(process.stdin.isTTY);
        settings.apiKey = await readLine({
          prompt: typed ? '  请粘贴密钥后回车（屏幕上不显示）：' : '',
          secret: true,
          echo: typed
        });
      } else {
        settings.apiKey = String(process.env.MODEL_API_KEY || '').trim();
      }
      if (!settings.apiKey) throw new Error('没有拿到密钥。用 --key-stdin 从标准输入传入，或先设置 MODEL_API_KEY 环境变量。');
    }
  }

  // 密码是不是用户自己敲的？自己敲的就别再打出来（免得截图时连密码一起漏出去）。
  let adminPasswordKnownToUser = false;

  if (!nonInteractive) {
    line();
    line('  再设一个「管理员密码」。这是给你自己用的：');
    line('  游戏跑起来以后，打开 /admin 页面看玩家问了什么、结案拿了多少分，就要输它。');
    line();
    const typed = await askSecret('  自己设一个（屏幕上同样不显示；直接回车＝我帮你随机生成）：');
    const {password, generated, extended} = ensureAdminPassword(typed, n => randomBytes(n).toString('hex'));
    settings.adminPassword = password;
    adminPasswordKnownToUser = Boolean(typed);
    if (generated) line(`  已生成：${password}　← 请抄下来，等下还要用`);
    else if (extended) line(`  太短了，我给你加长成：${password}　← 请抄下来`);
    else line('  记好了。它已经写进 .env.local，忘了就打开那个文件看一眼。');
  } else {
    const {password, generated, extended} = ensureAdminPassword(flags['admin-password'], n => randomBytes(n).toString('hex'));
    settings.adminPassword = password;
    if (generated) line(`管理员密码未指定，已生成：${password}`);
    else if (extended) line(`管理员密码太短，已加长成：${password}`);
  }

  if (existsSync(envPath)) {
    const backup = `${envPath}.bak-${Date.now()}`;
    copyFileSync(envPath, backup);
    line();
    line(`  原来的 .env.local 已备份为 ${backup.split('/').pop()}`);
  }
  writeFileSync(envPath, composeEnvFile(settings));
  line();
  line(`  配置已写入 ${envPath}`);
  if (!nonInteractive) line(`  模型：${settings.backendLabel || ''}${settings.apiKey ? mask(settings.apiKey) : '知乎直答'}`);

  if (hasFlag('no-verify')) {
    line('  （--no-verify，跳过联网自检）');
  } else {
    line();
    rule();
    line('  现在真的问一句，看看通不通……');
    rule();
    line();
    const result = await verify(settings);
    line(`  培训师说：${result.reply}`);
    line();
    line(`  用时 ${result.ms} 毫秒，用的是「${result.backend}」。`);
    if (result.inCharacter) {
      line('  ✅ 成功。他在角色里，回答长度也合适。');
    } else {
      line('  ⚠️ 接口通了，但这句台词在游戏里会被弃用（可能太长或出戏）。');
      line('     不影响使用：游戏遇到这种回答会自动用既定台词顶上。');
    }
  }

  if (!nonInteractive) {
    line();
    rule();
    line('  接下来');
    rule();
    line();
    line('  在项目目录运行：');
    line();
    line('      node server.mjs');
    line();
    line('  然后浏览器打开：');
    line('      http://127.0.0.1:4180/              ← 游戏首页（开场菜单）');
    line('      http://127.0.0.1:4180/room.html     ← 直接进第一幕');
    line(`      http://127.0.0.1:4180/admin         ← 玩家记录（密码：${adminPasswordKnownToUser ? '你刚才自己设的那个' : settings.adminPassword}）`);
    line();
    line('  走近房间里的人，按 E，就能问他话了。回答下面会写「由大模型即兴扮演」。');
    line();
  } else {
    line(`完成。管理员密码：${settings.adminPassword}`);
  }
} catch (error) {
  line();
  line(`  出错了：${error instanceof ModelError ? `${error.message}（类型：${error.kind}）` : error.message}`);
  line();
  line('  不用慌张，如果文件已经写好了就不用重来。可以试试：');
  line('    · 检查密钥是不是复制完整（末尾多个空格、少几个字符都会失败）');
  line('    · 直接打开 .env.local 手工修改，然后运行  npm run check:model');
  line();
  process.exitCode = 1;
}
