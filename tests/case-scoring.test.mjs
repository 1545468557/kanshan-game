// 案件判分与「免费信息」的完整性测试。
//
// 起因：三位 NPC 的**开场白**在玩家还没提问时就已经显示在面板上，
// 而它当时正好各送出一个判分关键词。实测「完全不推理，只把三条开场白
// 里的词抄进答题框」能拿 3 / 5 —— 谜题在开口之前就被解掉大半。
//
// 从此固定两条取词原则：
//   1. 判分关键词必须是**玩家自己推理或翻证据**才说得出的词；
//   2. 免费信息（开场白、NPC 名牌）不能含关键词。
import {readFileSync} from 'node:fs';

import {blueBloodCase, scoreAnswer} from '../public/blueblood-case.mjs';

let passed = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ' — ' + detail : ''}`);
}

const questions = blueBloodCase.questions;
const questionOf = id => questions.find(item => item.id === id);
const keywordsOf = id => questionOf(id).keywords;

// ---- 1. 开场白是免费信息，绝不能含任何一题的关键词 ----
// 名牌豁免：「培训师 · 方老师」这个名字本身就是第 4 题的答案对象，
// 但玩家还得在三个人里**选出**撒谎的那个，这一步推理没被送掉。
// 「记录员」同理，它只是提示玩家去找录像，凑不够第 3 题需要的两个词。
{
  const all = questions.flatMap(question => question.keywords.map(word => [question.id, word]));
  for (const person of blueBloodCase.npc) {
    for (const [qid, word] of all) {
      check(`${person.id} 的开场白不该出现「${qid}」的关键词「${word}」`,
        !person.opening.includes(word), person.opening);
    }
  }
}

// ---- 2. 标准答案必须自己拿满分 ----
// 收窄关键词最容易误伤的就是答案本身。这条守着「答案还答得对」。
{
  for (const question of questions) {
    check(`标准答案「${question.label}」应当得 1 分`,
      scoreAnswer(question, question.answer) === 1, question.answer);
  }
  const total = questions.reduce((sum, question) => sum + scoreAnswer(question, question.answer), 0);
  check('五道题的标准答案合起来应该是 5 / 5', total === 5, String(total));
}

// ---- 3. 偷懒玩法必须拿不到分 ----
{
  const openings = blueBloodCase.npc.map(person => person.opening).join('');
  const total = questions.reduce((sum, question) => sum + scoreAnswer(question, openings), 0);
  check('只把三条开场白粘进答题框不该得分', total === 0, `实得 ${total} 分：${openings}`);
}
{
  const names = blueBloodCase.npc.map(person => person.name).join(' ');
  const total = questions.reduce((sum, question) => sum + scoreAnswer(question, names), 0);
  check('只把三个 NPC 的名字抄进去不该得分', total === 0, `实得 ${total} 分：${names}`);
}
{
  const free = blueBloodCase.npc.map(person => `${person.name} ${person.opening}`).join('');
  const question = questionOf('from');
  const hit = question.keywords.filter(word => free.includes(word));
  check('「它从哪里来」不该靠 NPC 名牌上的「培训师」白拿分', hit.length === 0, hit.join('、'));
}

// ---- 4. 「不是真血」是正确的说法，不能判成理解反了 ----
// 原来的实现只看「有没有出现真血」，于是玩家写下**正确**的否定表述反而丢分。
{
  const question = questionOf('what');
  check('「是道具，不是真血」应当得分', scoreAnswer(question, '是道具，不是真血') === 1);
  check('「根本不是真血，是模拟的」应当得分', scoreAnswer(question, '根本不是真血，是模拟的') === 1);
  check('「应该是真血，不是道具」应当不得分', scoreAnswer(question, '应该是真血，不是道具') === 0);
  check('描述这个谎不算自己信了：「他把道具说成真血」不该被扣分',
    scoreAnswer(question, '他把道具说成真血了') === 1);
}

// ---- 5. 指认撒谎者：必须点名，泛称不算 ----
{
  const question = questionOf('liar');
  check('写「方老师」算答对', scoreAnswer(question, '方老师') === 1);
  check('写「培训师」算答对', scoreAnswer(question, '是培训师在撒谎') === 1);
  check('只写泛称「老师」不算答对', scoreAnswer(question, '是那位老师') === 0);
  check('指错人（同事张薇）不算答对', scoreAnswer(question, '同事张薇') === 0);
  check('把三个名字一起粘上去不算指认，那是抄名牌',
    scoreAnswer(question, blueBloodCase.npc.map(person => person.name).join(' ')) === 0);
  check('带否定的排除句仍然算对', scoreAnswer(question, '不是张薇，是培训师') === 1);
}

// ---- 6. 门槛题必须凑够词数 ----
{
  check('第 3 题只写「演示」一个词不该得分',
    scoreAnswer(questionOf('lastNight'), '演示') === 0);
  check('第 3 题写「演示」+「记录」应当得分',
    scoreAnswer(questionOf('lastNight'), '是一场演示，还有人做记录') === 1);
  check('第 5 题只写「观察」不该得分',
    scoreAnswer(questionOf('why'), '观察') === 0);
  check('第 5 题写「观察」+「判断」应当得分',
    scoreAnswer(questionOf('why'), '观察他会不会放弃自己的判断') === 1);
}

// ---- 7. 收窄之后，谜题必须仍然「翻证据就能解开」 ----
// 否则把白送的分收掉，只是把游戏改成猜谜。
{
  const investigation = [
    ...blueBloodCase.props.map(prop => `${prop.name} ${prop.text}`),
    ...blueBloodCase.diary.map(page => `${page.title} ${page.text}`)
  ].join('\n');
  const need = {what: 1, from: 1, lastNight: 2, liar: 1, why: 2};
  for (const [id, count] of Object.entries(need)) {
    const hits = keywordsOf(id).filter(word => investigation.includes(word));
    check(`「${questionOf(id).label}」应当能只靠翻房间里的证据凑够 ${count} 个关键词`,
      hits.length >= count, `只在道具和日记里找到: ${hits.join('、') || '（无）'}`);
  }
}

// ---- 8. 本地兜底台词也不许泄底 ----
// 大模型连不上时会退回 public/room-art.mjs 里的预设台词。
// 那段台词曾把「张薇事先被问过主角会不会坚持」直接说出来 —— 正是
// 上一轮从人设数据里删掉的那条越界信息，却在这里留了一份。
{
  const source = readFileSync(new URL('../public/room-art.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function npcReplyLocal');
  const block = source.slice(start, start + 2000);
  check('应当能定位到本地兜底台词', start >= 0 && block.includes('npcReplyLocal'));
  // 只扫**说出口的台词**，不扫用来匹配玩家问题的正则 ——
  // 正则里出现「改口」只是在判断玩家问了什么，玩家看不到它。
  const lines = [...block.matchAll(/return\s*'([^']*)'/g)].map(match => match[1]);
  check('应当扫到多条兜底台词', lines.length >= 4, String(lines.length));
  for (const line of lines) {
    for (const word of keywordsOf('why')) {
      check(`兜底台词不该出现第 5 题的关键词「${word}」`, !line.includes(word), line);
    }
    check('兜底台词不该把「谁被事先问过」说出来', !line.includes('问过我'), line);
  }
}

// ---- 9. 线上真实回答的回归样本：模型嘴里的话也不该白送分 ----
//
// 下面三句是**上线后调用真模型、逐字记下来的**培训师回答（问题见注释）。
// 起因：改提示词之前，他回答「房间里都摆了些什么？」时直接报了一遍名单
// ——「教具箱、假伤口贴片，还有几瓶蓝色模拟液」—— 第一题（蓝血是什么）
// 和第二题（它从哪里来）的关键词各中一个，玩家一步都没走，2/5 就到手了。
//
// 这三句的价值在于它们是**真实模型输出**，不是我想出来的反例。
// 以后只要有人把提示词里的禁用词规则改软，或者又把关键词放宽，
// 这组样本会立刻变红。模型是随机的，所以这里钉的不是「复现同一句话」，
// 而是「这组已观测到的原话，无论如何都不该得分」。
{
  const liveReplies = [
    // 问：昨晚到底发生了什么？
    '就是一次普通的急救演示，我按流程走的。张薇当时太紧张了，把颜色看岔了也正常。',
    // 问：房间里都摆了些什么？
    '就是些培训用的东西，你也看到了。急救演示嘛，摆点常规的器材，没什么特别的。',
    // 问：那个箱子是你的吗？教具箱里有什么？
    '箱子是培训用的，里面就是些常规的东西。具体是什么，你现场看就知道了，我不多解释。'
  ];

  for (const reply of liveReplies) {
    for (const question of blueBloodCase.questions) {
      check(`这句真实回答不该答上「${question.label}」：${reply.slice(0, 18)}…`,
        scoreAnswer(question, reply) === 0, reply);
    }
  }

  // 玩家最省事的作弊法：把三段回答原样粘进每一题。整局下来一分都不该拿到。
  const pasted = liveReplies.join(' ');
  const pastedTotal = blueBloodCase.questions.reduce((sum, question) => sum + scoreAnswer(question, pasted), 0);
  check('把三段真实回答原样粘进五道题，不该拿到任何分', pastedTotal === 0, `实得 ${pastedTotal} 分`);

  // 反面确认：禁的是「随口报名字」，不是「永远不许提这些东西」——
  // 现场那三件物证的名字本身仍然算分，否则谜题就没法从现场解开了。
  check('现场物证名仍然算分（禁的是模型随口念，不是物件本身）',
    scoreAnswer(blueBloodCase.questions.find(q => q.id === 'from'), '教具箱里的小瓶，经假伤口贴片流出来的') === 1);
}

if (failures.length) {
  console.log(`案件判分：${passed} 项通过，${failures.length} 项失败`);
  for (const line of failures) console.log('  ✗ ' + line);
  process.exitCode = 1;
} else {
  console.log(`案件判分：${passed} 项全部通过（免费信息不泄题 / 标准答案自洽 / 偷懒玩法拿不到分 / 否定表述不误判 / 真实模型回答不白送分 / 证据链仍可解）。未联网。`);
}
