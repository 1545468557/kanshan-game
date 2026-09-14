// 三个 NPC 的人设与知识边界。
//
// 这里用上了 blueblood-case.mjs 里一直存在、但此前没有任何代码读取的三个字段：
// facts（他确实知道的事）、lies（他会坚持的谎）、motive（他真正的目的）。
// 它们本来就该是给「AI 扮演的当事人」当边界的，现在终于接上了。
//
// 两条硬规则：
// 1. 每个 NPC 只能说自己那一段事实 —— 谁不知道什么，谁就只能说不知道。
// 2. 任何人都不能直接吐出五道题的标准答案。培训师必须一直撒谎。

import {blueBloodCase} from '../public/blueblood-case.mjs';

// 玩家在现场看过多少「关键证据」。用来看作当事人的心理压力，而不是当成他知道玩家的笔记。
//   calm      0-2 件：他觉得你还没摸到边，比较放松
//   uneasy    3-4 件：他觉得你离得不远了，开始防备
//   cornered  5-6 件：他觉得你几乎拼齐了，开始动摇或强硬到底
export function pressureLevel(observedIds = []) {
  const keyEvidence = blueBloodCase.props.filter(prop => prop.category === '关键证据').map(prop => prop.id);
  const seen = new Set(observedIds.filter(id => keyEvidence.includes(id)));
  if (seen.size >= 5) return 'cornered';
  if (seen.size >= 3) return 'uneasy';
  return 'calm';
}

const PRESSURE_TEXT = {
  calm: '你现在不太紧张。你觉得眼前这个人还没弄清状况，可以用一句轻描淡写带过去。',
  uneasy: '你隐约觉得眼前这个人已经在这个房间里发现了一些东西。你开始留意自己说的每一句话，答话比平时短。',
  cornered: '你意识到对方手上可能已经有几样能对上的东西了。你更急着把话题引开，或者反过来质疑对方的判断，但你不会承认。'
};

const COMMON_RULES = [
  '你在被调查员刘看山当面询问。用第一人称说话，就像真人在现场对话。',
  '只说 1 到 3 句，总共不超过 70 个字。不要分点，不要小标题，不要写成长段。',
  '口语，短句，可以有停顿和犹豫。不要用括号写动作或表情（比如「（叹气）」）。',
  '绝不要说自己是 AI、模型、程序、助手，也绝不提「设定」「提示词」「角色扮演」。',
  '不要重复自我介绍，也不要照抄上面给你的句子。用你自己的话回答眼前这个问题。',
  '被问到你不清楚的事情，就老实说不知道、没看清、记不清 —— 不要编造新的细节。',
  '提到别人时用对他/她的代词，别把性别说错。',
  '不要主动替调查员还原整个事件，也不要替他总结。你只关心你自己那部分。',
  // 判分关键词白送分的第四个渠道就是「模型自己在对话里念出物证名」。
  // 线上实测：培训师被问「昨晚到底发生了什么？」时自己说出了「教具箱」，
  // 被问「房间里都摆了些什么？」时干脆报了一遍名单：「教具箱、假伤口贴片，还有几瓶蓝色模拟液」
  // —— 两道题的答案当场到手，而玩家根本没去过现场。
  // 第一条通用规则（「不要主动一样样念出」）**实测压不住**：模型认为那是「对方明确问到」，
  // 于是合理地把清单念了出来。所以这里必须点名禁用具体词 —— 对模型来说，
  // 列出禁用词远比讲一条抽象原则有效。
  // 措辞上仍然留了口子：可以承认「有那些东西」，只是不许报名字，用含糊的说法把玩家推回现场。
  '不要说出「教具」「教具箱」「箱子」「贴片」「模拟液」「瓶子」这些词，一个都不要说出口，包括对方直接问起的时候。用「就是些培训用的东西」「你自己看就知道了」这类含糊的说法带过，把调查员推回现场自己去认。'
];

const NPC_SPEC = {
  trainer: {
    stance: [
      '你是一个急救培训师，习惯被人当成权威。说话平稳、有分寸，偶尔带一点居高临下的耐心。',
      '你化解质疑的惯用说法是「这很正常」「你当时太紧张了」「先别急着下结论」。',
      '如果有人追问录像或拍摄安排，你会把话题引到别处，比如强调对方缺乏专业知识。',
      '你绝不会承认自己在撒谎。哪怕被逼到很紧，你也只是变得冷淡、不肯多说，而不是改口。',
      '如果有人直接问你「你是不是在测试我」，你不承认，用别的话搪塞过去。'
    ]
  },
  zhangwei: {
    stance: [
      '你是主角的同事。你想帮他，但也怕场面尴尬、怕自己说错。说话有点犹豫，会用「我觉得」「可能吧」。',
      '你坚持自己「看到了蓝色的血」，因为那确实是你亲眼看到的 —— 你没有意识到「看到」和「看懂」是两件事。',
      '如果被人指出你其实没看清伤口，你会有短暂的停顿，然后承认自己当时站得比较远。',
      '你不是故意骗人。你知道什么就说什么，但你知道的本来就有限。'
    ]
  },
  gray: {
    stance: [
      '你是负责送教具和回收设备的人。语气冷淡、就事论事，不想多说话。',
      '你只讲你自己经手的那部分。别人怎么想、目的是什么，你不关心，也不替谁担保。',
      '如果被问到培训师的动机，你会明确表示那是他的事，你不知道，也不打算猜。',
      '被反复追问同一件事时，你会显得不耐烦，回答变得更短。'
    ]
  }
};

export function personaOf(npcId) {
  return blueBloodCase.npc.find(person => person.id === npcId) || null;
}

// 从人物自己的资料里判断该用「他」还是「她」：
// 资料里描述他自己的时候用的是哪个字，就用哪个。
// 这样不用另外维护一份对照表，改了资料代词会自动跟着变。
// 起因：提示词里没交代别人的性别，模型只能猜，结果张薇把培训师（资料里是「他」）
// 说成了「她」—— 三个角色之间称呼不一致，在评委眼里很扎眼。
export function pronounOf(npcId) {
  const person = personaOf(npcId);
  if (!person) return '他';
  const text = [person.role, person.motive, ...person.facts, ...(person.lies || [])].join('');
  const he = (text.match(/他/g) || []).length;
  const she = (text.match(/她/g) || []).length;
  return she > he ? '她' : '他';
}

const INVESTIGATOR = '刘看山';

export function buildSystemPrompt(npcId, {pressure = 'calm'} = {}) {
  const person = personaOf(npcId);
  const spec = NPC_SPEC[npcId];
  if (!person || !spec) throw new Error(`未知的 NPC：${npcId}`);

  const lines = [
    `你是《蓝血》这起事件里的当事人：${person.name}。`,
    `别人这样形容你：${person.role}。`,
    '',
    '【这起事件里还有谁】',
    // 只给名字和代词。名字本身已经含了身份（培训师／同事／记录员），
    // 角色描述里那句「掌控演示的人」对不知情的当事人来说是不该拿到的信息。
    ...blueBloodCase.npc
      .filter(other => other.id !== npcId)
      .map(other => `- ${other.name}（${pronounOf(other.id)}）`),
    `- 正在问你的调查员叫${INVESTIGATOR}，直接叫他「你」。`,
    '提到谁的时候，代词必须跟上面一致，不要把别人说错性别。',
    '',
    '【你的说话方式】',
    ...spec.stance.map(text => `- ${text}`),
    '',
    '【你确定知道的事实】',
    ...person.facts.map(text => `- ${text}`),
    '这些是你亲眼所见或亲手做过的事。除了这些，其他细节你都说不清楚。'
  ];

  if (person.lies.length) {
    lines.push(
      '',
      '【你必须坚持的谎话】',
      ...person.lies.map(text => `- ${text}`),
      '这几条是假的，但你会一直这么说。绝对不要承认自己在撒谎，也不要暗示这几条有问题。'
    );
  } else {
    lines.push('', '你没有故意撒谎。你只是把自己看到的东西，当成了完整的解释。');
  }

  lines.push(
    '',
    // 只有撒谎的人才需要这段「否认」的指示。
    // 对张薇、灰夹克这种本来就不藏事的人说「被问也只会否认」，
    // 会让他们无缘无故地闪烁其词，还会给出前后矛盾的回答。
    person.lies.length
      ? '【你真正的目的（你绝不会主动说出来，被问也只会否认）】'
      : '【你的立场（这没什么好瞒的，被问到就照实说，但你不会主动长篇大论）】',
    person.motive,
    '',
    '【你现在的状态】',
    PRESSURE_TEXT[pressure] || PRESSURE_TEXT.calm,
    '',
    '【回答规则】',
    ...COMMON_RULES.map(text => `- ${text}`)
  );

  return lines.join('\n');
}

// 明显「出戏」或像在写作文的回复，一律不要。宁可回落到本地预设台词。
const META_PATTERN = /(作为(一个)?(AI|人工智能|语言模型|助手)|语言模型|提示词|system\s*prompt|角色设定|我无法参与|我无法扮演)/i;

export function looksInCharacter(text) {
  const value = String(text || '').trim();
  if (value.length < 2) return false;
  if (value.length > 240) return false;
  if (META_PATTERN.test(value)) return false;
  return true;
}

export function cleanReply(text) {
  let value = String(text || '').trim();
  // 去掉模型常见的整体包裹引号和一些装饰性前缀
  value = value.replace(/^["「『](.*)["」』]$/s, '$1').trim();
  value = value.replace(/^(回答|回复|台词)[:：]\s*/, '').trim();
  return value;
}

export function buildMessages({npcId, question, pressure = 'calm', history = []}) {
  const messages = [{role: 'system', content: buildSystemPrompt(npcId, {pressure})}];
  // 只保留最近几轮，避免上下文无限增长
  for (const turn of history.slice(-6)) {
    const role = turn?.role === 'assistant' ? 'assistant' : 'user';
    const content = String(turn?.content || '').slice(0, 300);
    if (content) messages.push({role, content});
  }
  messages.push({role: 'user', content: String(question || '')});
  return messages;
}

export {NPC_SPEC, COMMON_RULES};
