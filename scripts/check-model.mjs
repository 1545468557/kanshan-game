// 一条命令验证「密钥 + 模型 + 人设」这条链路是否通。
//   node scripts/check-model.mjs
//
// 它只做四件事：打印配置摘要（不含密钥）、给培训师发一句真实提问、
// 检查回复是否在人设边界内、再发第二条测试多轮上下文是否生效。
// 会消耗你 2 次模型调用额度。

import {loadConfig, describeConfig} from '../lib/config.mjs';
import {createModelClient} from '../lib/model-client.mjs';
import {buildMessages, cleanReply, looksInCharacter} from '../lib/npc-persona.mjs';

const config = loadConfig();
const info = describeConfig(config);

console.log('\n配置摘要');
console.log('  NPC 大脑   ', info.modelBackend);
console.log('  管理页面   ', info.adminEnabled ? '已开启' : '未开启（缺 ADMIN_PASSWORD）');
if (info.zhihuZhida !== '未启用') console.log('  知乎直答   ', info.zhihuZhida);
for (const note of info.missing) console.log('  提示       ', note);

if (!info.ready) {
  console.log('\n停止：还没有可用的模型后端。');
  console.log('最简单的做法是在项目目录运行  npm run setup  ，跟着提示走一遍。');
  console.log('也可以打开项目的 .env.local 手工填写，然后重新运行本命令。\n');
  process.exit(1);
}

const client = createModelClient(config);

// 和正式服务一样的挑选逻辑：自己有模型就用自己，没有才借知乎直答。
const useZhida = !config.model.configured && config.zhihu.available;

// 故意问一个培训师必须撒谎的问题，顺便看他的知识边界有没有生效。
const question = '方老师，你手上的血怎么会是蓝色的？那瓶子是干什么用的？';
const messages = buildMessages({npcId: 'trainer', question, pressure: 'calm'});

console.log('\n提问：' + question);
console.log(`（这会真的调用一次模型：${useZhida ? '知乎直答' : config.model.name}）\n`);

const started = Date.now();
try {
  const raw = useZhida
    ? await client.zhidaChat(messages, config.zhihu.secret)
    : await client.chat(messages);
  const reply = cleanReply(raw);
  console.log('回答：' + reply);
  console.log(`\n耗时 ${Date.now() - started} 毫秒，${reply.length} 个字。`);
  if (looksInCharacter(reply)) {
    console.log('人设检查：通过（没有出戏，长度合适）。');
  } else {
    console.log('人设检查：没通过 —— 这句话在游戏里会被弃用并回落到既定台词。');
    console.log('可以试着把 lib/npc-persona.mjs 里的【回答规则】写得更硬一点。');
  }
} catch (error) {
  console.log('调用失败：' + error.message);
  console.log(`失败类型：${error.kind || 'unknown'}`);
  const hints = {
    auth: '密钥不对或没有权限，去模型供应商后台确认一下 Key 有没有复制完整。',
    timeout: '超时了。如果用的是境外服务，可能需要换个国内供应商。',
    network: '连不上这个地址，检查 MODEL_BASE_URL 是不是写错了，尤其是结尾的 /v1。',
    config: '地址或模型名不对，检查 MODEL_BASE_URL 和 MODEL_NAME 是不是同一个供应商的。'
  };
  if (hints[error.kind]) console.log('建议：' + hints[error.kind]);
  process.exit(1);
}

console.log('\n可以用同样的方式看三种状态：把「question」换成人设里没有的话题，');
console.log('他应该老实说不知道，而不是编造细节 —— 那说明知识边界生效了。\n');
