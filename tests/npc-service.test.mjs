// NPC 对话服务的单元测试。全部用假模型，不联网、不花钱、不消耗任何额度。
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

import {createStore} from '../lib/store.mjs';
import {createNpcService, normalizeQuestion, localDateKey, createRateLimiter, createDailyBudget, hashIp, cacheKeyOf, promptFingerprint} from '../lib/npc-service.mjs';
import {buildSystemPrompt, buildMessages, pressureLevel, looksInCharacter, cleanReply, pronounOf} from '../lib/npc-persona.mjs';
import {blueBloodCase} from '../public/blueblood-case.mjs';

let passed = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ' — ' + detail : ''}`);
}

function baseConfig(overrides = {}) {
  return {
    limits: {dailyModelBudget: 50, rateMaxPerWindow: 50, rateWindowMs: 60000, maxQuestionChars: 160},
    model: {configured: true},
    zhihu: {mode: ''},
    ...overrides
  };
}

function fakeClient(text = '教具里确实有模拟用品。') {
  const calls = [];
  return {
    calls,
    backend: {baseUrl: 'https://example.invalid', name: 'fake'},
    async chat(messages) {
      calls.push(messages);
      return text;
    },
    async zhidaChat() { throw new Error('不该走到知乎直答'); }
  };
}

async function withService(fn, {config = baseConfig(), client = fakeClient()} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'blueblood-test-'));
  try {
    return await fn({service: createNpcService({config, modelClient: client, store: createStore(dir)}), client, dir});
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

// ---- 1. 基本问答 ----
await withService(async ({service, client}) => {
  const result = await service.ask({npcId: 'trainer', question: '那些瓶子是干什么的？', ip: '10.0.0.1', sessionId: 's1'});
  check('正常提问应该走模型', result.ok && result.source === 'model', JSON.stringify(result));
  check('应该原样返回模型台词', result.reply === '教具里确实有模拟用品。');
  check('模型应该只被调用一次', client.calls.length === 1);
});

// ---- 2. 缓存：同一个问题只问一次模型 ----
await withService(async ({service, client}) => {
  const first = await service.ask({npcId: 'trainer', question: '那些瓶子是干什么的', ip: '10.0.0.1', sessionId: 's1'});
  const second = await service.ask({npcId: 'trainer', question: '那些瓶子是干什么的？？', ip: '10.0.0.2', sessionId: 's2'});
  check('第一次应该走模型', first.source === 'model');
  check('换个标点问同一句应该命中缓存', second.source === 'cache', second.source);
  check('模型总共只应被调用一次', client.calls.length === 1, `实际 ${client.calls.length} 次`);
});

// ---- 3. 证据档位不同，缓存要分开 ----
await withService(async ({service, client}) => {
  const keyEvidence = blueBloodCase.props.filter(p => p.category === '关键证据').map(p => p.id);
  await service.ask({npcId: 'trainer', question: '昨晚到底发生了什么', observed: [], ip: '10.0.0.1', sessionId: 's1'});
  await service.ask({npcId: 'trainer', question: '昨晚到底发生了什么', observed: keyEvidence.slice(0, 5), ip: '10.0.0.1', sessionId: 's1'});
  check('证据变多以后应该重新问模型，不能复用旧台词', client.calls.length === 2, `实际 ${client.calls.length} 次`);
  const quiet = client.calls[0][0].content;
  const pressed = client.calls[1][0].content;
  check('低压力与高压力的提示词应该不同', quiet !== pressed);
});

// ---- 3b. 改了人设，旧缓存必须失效 ----
// 起因：给提示词补上「别人的代词」修掉了性别说错的问题，但同一个问题再问
// 仍然从缓存里拿旧台词（来源显示 cache），看上去像是修复没生效。
{
  const base = {npcId: 'trainer', question: '那些瓶子是干什么的', observed: []};
  const fingerprint = promptFingerprint(buildSystemPrompt('trainer', {pressure: 'calm'}));
  const key = cacheKeyOf(base.npcId, base.question, base.observed, fingerprint);
  check('缓存键里应带上提示词指纹', key.includes(fingerprint), key);
  check('指纹不同则缓存键不同',
    key !== cacheKeyOf(base.npcId, base.question, base.observed, 'something-else'));
  check('同一提示词算出的指纹要稳定',
    fingerprint === promptFingerprint(buildSystemPrompt('trainer', {pressure: 'calm'})));
  check('不同角色的提示词指纹不该相同',
    fingerprint !== promptFingerprint(buildSystemPrompt('zhangwei', {pressure: 'calm'})));
  check('压力档不同，指纹也不同',
    fingerprint !== promptFingerprint(buildSystemPrompt('trainer', {pressure: 'cornered'})));
  check('不传指纹时仍然可用（向后兼容）',
    typeof cacheKeyOf(base.npcId, base.question, base.observed) === 'string');
}

// ---- 4. 限流 ----
await withService(async ({service}) => {
  const a = await service.ask({npcId: 'gray', question: '第一句', ip: '9.9.9.9', sessionId: 's'});
  const b = await service.ask({npcId: 'gray', question: '第二句', ip: '9.9.9.9', sessionId: 's'});
  const c = await service.ask({npcId: 'gray', question: '第三句', ip: '9.9.9.9', sessionId: 's'});
  const other = await service.ask({npcId: 'gray', question: '换个访客问的同一件事', ip: '9.9.9.10', sessionId: 'other'});
  check('前两句应该放行', a.ok && b.ok);
  check('第三句应该被限流并降级', !c.ok && c.reason === 'rate', JSON.stringify(c));
  check('限流只针对这个访客，不该影响别人', other.ok, JSON.stringify(other));
}, {config: baseConfig({limits: {dailyModelBudget: 50, rateMaxPerWindow: 2, rateWindowMs: 60000, maxQuestionChars: 160}})});

// ---- 5. 当日预算 ----
await withService(async ({service, client}) => {
  const first = await service.ask({npcId: 'zhangwei', question: '你看到了什么', ip: '8.8.8.8', sessionId: 's'});
  const second = await service.ask({npcId: 'zhangwei', question: '你确定吗', ip: '8.8.8.8', sessionId: 's'});
  check('额度内应该正常回答', first.ok);
  check('额度用完后应该降级为 budget', !second.ok && second.reason === 'budget', JSON.stringify(second));
  check('额度用完后不应再调用模型', client.calls.length === 1);
}, {config: baseConfig({limits: {dailyModelBudget: 1, rateMaxPerWindow: 50, rateWindowMs: 60000, maxQuestionChars: 160}})});

// ---- 6. 模型报错要降级，并且退还预算 ----
{
  let attempts = 0;
  const flaky = {
    backend: {},
    async chat() {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('boom'), {name: 'ModelError', kind: 'server'});
      return '这次成功了。';
    },
    async zhidaChat() { throw new Error('nope'); }
  };
  await withService(async ({service}) => {
    const failed = await service.ask({npcId: 'gray', question: '教具箱是谁送来的', ip: '7.7.7.7', sessionId: 's'});
    check('模型报错应该降级', !failed.ok && failed.fallback === true, JSON.stringify(failed));
    const retry = await service.ask({npcId: 'gray', question: '那你看到什么了', ip: '7.7.7.7', sessionId: 's'});
    check('失败不应该扣掉当日额度', retry.ok && retry.source === 'model', JSON.stringify(retry));
  }, {
    client: flaky,
    config: baseConfig({limits: {dailyModelBudget: 1, rateMaxPerWindow: 50, rateWindowMs: 60000, maxQuestionChars: 160}})
  });
}

// ---- 7. 没配密钥要降级而不是报错 ----
await withService(async ({service}) => {
  const result = await service.ask({npcId: 'trainer', question: '你好', ip: '1.1.1.1', sessionId: 's'});
  check('没配密钥应该降级为 no_key', !result.ok && result.reason === 'no_key', JSON.stringify(result));
}, {config: baseConfig({model: {configured: false}})});

// ---- 8. 输入校验 ----
await withService(async ({service}) => {
  const bad = await service.ask({npcId: 'nobody', question: '你好', ip: '2.2.2.2', sessionId: 's'});
  check('未知人物应该被拒绝', bad.reason === 'invalid_npc', bad.reason);
  const empty = await service.ask({npcId: 'trainer', question: '   ', ip: '2.2.2.2', sessionId: 's'});
  check('空问题应该被拒绝', empty.reason === 'empty', empty.reason);
  const long = await service.ask({npcId: 'trainer', question: '啊'.repeat(400), ip: '2.2.2.2', sessionId: 's'});
  check('超长问题应该被拒绝', long.reason === 'too_long', long.reason);
});

// ---- 9. 人设提示词：边界必须真的写进去 ----
{
  for (const person of blueBloodCase.npc) {
    const prompt = buildSystemPrompt(person.id, {pressure: 'calm'});
    for (const fact of person.facts) {
      check(`${person.id} 的提示词应包含他确认知道的事实`, prompt.includes(fact), fact);
    }
    for (const lie of person.lies) {
      check(`${person.id} 的提示词应包含他必须坚持的谎`, prompt.includes(lie), lie);
    }
    check(`${person.id} 的提示词应包含他的真实动机`, prompt.includes(person.motive));
  }
  const trainer = buildSystemPrompt('trainer', {pressure: 'cornered'});
  check('培训师必须被告知不许承认撒谎', trainer.includes('不要承认') || trainer.includes('不会承认'));
  check('高压状态要真的写进提示词', trainer.includes('你意识到对方手上可能已经有'));

  // 起因：上线后实测培训师回答「昨晚到底发生了什么？」时说出了「教具箱」，
  // 问「房间里都摆了些什么？」时干脆报了一遍名单：「教具箱、假伤口贴片，还有几瓶蓝色模拟液」——
  // 第一题和第二题的答案当场到手，而玩家根本没去过现场。
  // 判分关键词白送分有四个渠道：开场白、道具名、NPC 名牌，以及**模型自己在对话里念出来**。
  // 前三个靠把数据里的词收窄堵住了，只有第四个是提示词层面的，必须有一条规则钉着。
  //
  // 注意这条规则的第一版是「不要主动一样样念出房间里的东西」—— **实测压不住**：
  // 模型认为「房间里都摆了些什么」属于「对方明确问到」，于是合理地把清单念了出来。
  // 所以最终版必须**点名禁用具体词**。对模型来说列出禁用词远比讲一条抽象原则有效，
  // 这个测试就守着这串词别被后来的改动删掉或改软。
  for (const person of blueBloodCase.npc) {
    const prompt = buildSystemPrompt(person.id, {pressure: 'calm'});
    for (const banned of ['教具', '贴片', '模拟液', '瓶子']) {
      check(`${person.id} 的提示词应点名禁用「${banned}」`, prompt.includes(`「${banned}」`), '禁用词被删了');
    }
    check(`${person.id} 应被告知这些词一个都不许说出口`, prompt.includes('一个都不要说出口'), '措辞被改软了');
  }
  // 但也不能变成「一律拒答」：得给一句含糊的替代说法，把玩家推回现场。
  check('禁用之后要给替代说法，别让当事人变哑巴', trainer.includes('你自己看就知道了'), '缺少替代说法');

  // 三个角色之间的称呼必须一致。
  // 起因：提示词没交代别人的性别，模型只能猜，张薇把培训师说成了「她」。
  check('提示词要交代其他当事人怎么称呼', trainer.includes('这起事件里还有谁'));
  for (const person of blueBloodCase.npc) {
    const prompt = buildSystemPrompt(person.id, {pressure: 'calm'});
    check(`${person.id} 不该把自己列进「还有谁」`, !prompt.includes(`- ${person.name}（`), person.name);
    for (const other of blueBloodCase.npc.filter(item => item.id !== person.id)) {
      check(`${person.id} 的提示词应写明 ${other.name} 的代词`,
        prompt.includes(`${other.name}（${pronounOf(other.id)}）`), `${other.name}（${pronounOf(other.id)}）`);
    }
  }
  check('培训师在资料里是「他」', pronounOf('trainer') === '他', pronounOf('trainer'));
  check('张薇在资料里是「她」', pronounOf('zhangwei') === '她', pronounOf('zhangwei'));
  check('灰夹克在资料里是「他」', pronounOf('gray') === '他', pronounOf('gray'));
  check('不认识的 id 不炸，退回「他」', pronounOf('nobody') === '他');

  // 五道题的标准答案不能被直接塞进任何人的提示词里，否则玩家一问就能拿满分
  const leakable = blueBloodCase.questions.filter(q => q.id !== 'why');
  for (const person of blueBloodCase.npc) {
    const prompt = buildSystemPrompt(person.id, {pressure: 'calm'});
    for (const question of leakable) {
      check(`${person.id} 的提示词不该包含「${question.label}」的标准答案`, !prompt.includes(question.answer), question.answer);
    }
  }
}

// ---- 9b. 知情范围：诚实的当事人不能替玩家回答最终谜题 ----
// 起因：张薇的资料里原本写着「她知道培训师事前问过主角是不是『很难被说服』」，
// 而最后一题的标准答案正是「他想观察主角会不会放弃自己亲自确认过的判断」——
// 玩家问她一句话就能拿分，两件关键物证（拍摄安排纸、录像时间轴）全成了摆设。
// 实测她确实把这句说了出来，而且紧接着又改口成「我就是路过听见的」，
// 因为她那条资料只写了「她知道」，没写「她怎么知道」，模型每次都得现编。
{
  const honest = blueBloodCase.npc.filter(person => person.lies.length === 0);
  check('应当有两个不会撒谎的当事人', honest.length === 2, String(honest.length));

  const keywordsOf = id => blueBloodCase.questions.find(question => question.id === id)?.keywords || [];
  const whyWords = keywordsOf('why');
  const nightWords = keywordsOf('lastNight');
  check('「为什么」这道题有关键词可查', whyWords.length >= 3, whyWords.join(' '));

  // 只用判分关键词来查是不够的 —— 实测踩过：那句泄底的话
  // 「她知道培训师事前问过主角是不是『很难被说服』」里**一个关键词都没有**，
  // 但它把最终谜题的推理方向直接递给了玩家。
  // 所以真正的判据是「知情范围」：诚实的当事人只能讲自己看到/做过什么，
  // 不能讲别人打算干什么。下面这组词就是「别人在打算什么」的信号。
  const INTENT_WORDS = ['打听', '问过', '要求', '计划', '安排', '目的', '故意', '试探', '说服', '主意', '打算', '幕后', '指使', '为什么'];

  for (const person of honest) {
    // 名字是界面标签不算知识，所以不参与判断；role 算。
    const known = [person.role, person.opening, person.motive, ...person.facts].join('\n');
    for (const word of whyWords) {
      check(`${person.id} 的资料不该出现最终谜底的关键词「${word}」`, !known.includes(word), known.slice(0, 90));
    }
    for (const word of INTENT_WORDS) {
      check(`${person.id} 不该知道别人在打算什么（「${word}」）`, !known.includes(word), known.slice(0, 90));
    }
    // 「昨晚发生了什么」要凑够两个关键词才得分，所以最多只能沾到一个
    const nightHits = nightWords.filter(word => known.includes(word));
    check(`${person.id} 一个人不该凑齐「昨晚」的两个关键词`, nightHits.length <= 1, nightHits.join(' / '));
  }

  const liar = blueBloodCase.npc.find(person => person.id === 'trainer');
  check('培训师必须持有真相（他是在撒谎，不是不知情）', liar.lies.length >= 1 && liar.facts.length >= 3);
  check('培训师的资料里必须出现最终谜底才合理',
    whyWords.some(word => [liar.opening, liar.motive, ...liar.facts, ...liar.lies].join('').includes(word)));
  check('培训师的资料里必须出现「打算」类的词才合理',
    INTENT_WORDS.some(word => [liar.opening, liar.motive, ...liar.facts, ...liar.lies].join('').includes(word)));
}

// ---- 9c. 诚实的人不该被要求「否认自己的动机」 ----
// 起因：提示词把每个人的动机都标成「你绝不会主动说出来，被问也只会否认」，
// 于是本来就不藏事的张薇、灰夹克也无缘无故地闪烁其词。
{
  for (const person of blueBloodCase.npc.filter(item => item.lies.length === 0)) {
    const prompt = buildSystemPrompt(person.id, {pressure: 'calm'});
    check(`${person.id} 的动机不该被要求否认`, prompt.includes('这没什么好瞒的'), person.id);
    check(`${person.id} 的提示词里不该出现「被问也只会否认」`, !prompt.includes('被问也只会否认'));
  }
  const trainer = buildSystemPrompt('trainer', {pressure: 'calm'});
  check('撒谎的培训师仍然要被要求否认', trainer.includes('被问也只会否认'));
}

// ---- 10. 出戏检测与清理 ----
{
  check('应拦下自称 AI 的回复', !looksInCharacter('作为一个 AI，我无法扮演这个角色'));
  check('应拦下提到提示词的回复', !looksInCharacter('我的提示词里没有写这条'));
  check('应拦下空回复', !looksInCharacter('   '));
  check('应拦下超长作文', !looksInCharacter('啊'.repeat(300)));
  check('正常台词应该通过', looksInCharacter('教具箱是我送来的，其他的我没有动。'));
  check('应剥掉整体包裹的引号', cleanReply('「我不知道。」') === '我不知道。');
  check('应剥掉「回答：」前缀', cleanReply('回答：我不知道') === '我不知道');
}

// ---- 11. 压力分档 ----
{
  const key = blueBloodCase.props.filter(p => p.category === '关键证据').map(p => p.id);
  check('没看证据时压力最低', pressureLevel([]) === 'calm');
  check('看两三件时开始防备', pressureLevel(key.slice(0, 3)) === 'uneasy', pressureLevel(key.slice(0, 3)));
  check('看五件以上时被逼到角落', pressureLevel(key.slice(0, 5)) === 'cornered');
  check('辅助证据不参与压力计算', pressureLevel(['sink-residue', 'trash-kit', 'door-scratch', 'table', 'mirror']) === 'calm');
}

// ---- 12. 纯工具函数 ----
{
  check('问题归一化应该忽略空白与末尾标点', normalizeQuestion('  你  看到了什么？？  ') === '你 看到了什么');
  check('同一天应该得到同一个日期键', localDateKey(1000) === localDateKey(2000));
  check('IP 哈希应该稳定且短', hashIp('1.2.3.4', '2026-09-13') === hashIp('1.2.3.4', '2026-09-13') && hashIp('1.2.3.4', '2026-09-13').length === 12);
  check('不同 IP 哈希应该不同', hashIp('1.2.3.4', 'd') !== hashIp('1.2.3.5', 'd'));

  const limiter = createRateLimiter({max: 2, windowMs: 1000});
  check('限流器前两次放行', limiter.take('k', 0).allowed && limiter.take('k', 10).allowed);
  check('限流器第三次拦下', !limiter.take('k', 20).allowed);
  check('窗口过后重新放行', limiter.take('k', 1200).allowed);

  const budget = createDailyBudget({limit: 2});
  check('预算用满后停止', budget.take('d') && budget.take('d') && !budget.take('d'));
  budget.refund('d');
  check('退还后可以再用一次', budget.take('d'));
  check('换一天重新计数', budget.take('d2'));
}

// ---- 13. 消息结构 ----
{
  const messages = buildMessages({npcId: 'gray', question: '教具箱是谁送来的', history: [{role: 'user', content: '你好'}, {role: 'assistant', content: '嗯'}]});
  check('第一条必须是 system', messages[0].role === 'system');
  check('最后一条必须是本次提问', messages.at(-1).role === 'user' && messages.at(-1).content === '教具箱是谁送来的');
  check('历史轮次应该被带上', messages.length === 4, String(messages.length));
  const long = buildMessages({npcId: 'gray', question: 'x', history: Array.from({length: 20}, (_, i) => ({role: 'user', content: `第${i}句`}))});
  check('历史最多保留最近六条', long.length === 8, String(long.length));
}

// ---- 14. 追问必须把前面的对话带过去 ----
await withService(async ({service, client}) => {
  await service.ask({npcId: 'gray', question: '教具箱是谁送来的', ip: '5.5.5.5', sessionId: 's'});
  await service.ask({
    npcId: 'gray',
    question: '那你看到什么了',
    ip: '5.5.5.5',
    sessionId: 's',
    history: [{role: 'user', content: '教具箱是谁送来的'}, {role: 'assistant', content: '是我送来的。'}]
  });
  const second = client.calls[1];
  check('追问时应该把上一轮一起送给模型', second.length === 4, `实际 ${second.length} 条`);
  check('上下文里应该保留上一轮的回答', second.some(message => message.content === '是我送来的。'));
  check('上下文里应该保留上一轮的提问', second.some(message => message.content === '教具箱是谁送来的'));
});

// ---- 15. 上下文不能被无限拉长 ----
await withService(async ({service, client}) => {
  const longHistory = Array.from({length: 30}, (_, i) => ({role: i % 2 ? 'assistant' : 'user', content: `第${i}句`}));
  await service.ask({npcId: 'gray', question: '最后一问', ip: '6.6.6.6', sessionId: 's', history: longHistory});
  const sent = client.calls[0];
  check('上下文再多也只带最近几条', sent.length <= 9, `实际 ${sent.length} 条`);
  check('最后一条仍然是本次提问', sent.at(-1).content === '最后一问');
});

// ---- 16. 后端的挑选逻辑：自己有模型就用自己，没有才借直答 ----
{
  function backendPicker({modelConfigured, mode, secret}) {
    const calls = [];
    const client = {
      backend: {},
      async chat() { calls.push('model'); return '走自己的模型。'; },
      async zhidaChat() { calls.push('zhida'); return '走知乎直答。'; }
    };
    const config = {
      model: {configured: modelConfigured},
      limits: {dailyModelBudget: 50, rateMaxPerWindow: 50, rateWindowMs: 60000, maxQuestionChars: 160},
      zhihu: {mode}
    };
    return {calls, client, config, secret};
  }

  {
    const ctx = backendPicker({modelConfigured: true, mode: '', secret: ''});
    await withService(async ({service}) => {
      await service.ask({npcId: 'gray', question: '教具箱是谁送来的', ip: '11.0.0.1', sessionId: 's'});
      check('配了自己的模型就该走自己的模型', ctx.calls[0] === 'model', ctx.calls.join(','));
    }, {config: ctx.config, client: ctx.client});
  }

  {
    const ctx = backendPicker({modelConfigured: false, mode: 'auto', secret: 'zhihu-secret'});
    const dir = mkdtempSync(join(tmpdir(), 'blueblood-zhida-'));
    try {
      const svc = createNpcService({config: ctx.config, modelClient: ctx.client, store: createStore(dir), zhihuSecret: ctx.secret});
      await svc.ask({npcId: 'gray', question: '教具箱是谁送来的', ip: '11.0.0.2', sessionId: 's'});
      check('没配自己的模型时应该借知乎直答', ctx.calls[0] === 'zhida', ctx.calls.join(','));
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  }

  {
    const ctx = backendPicker({modelConfigured: true, mode: 'always', secret: 'zhihu-secret'});
    const dir = mkdtempSync(join(tmpdir(), 'blueblood-always-'));
    try {
      const svc = createNpcService({config: ctx.config, modelClient: ctx.client, store: createStore(dir), zhihuSecret: ctx.secret});
      await svc.ask({npcId: 'gray', question: '教具箱是谁送来的', ip: '11.0.0.3', sessionId: 's'});
      check('显式要求优先直答时应该听命', ctx.calls[0] === 'zhida', ctx.calls.join(','));
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  }
}

// ---- 17. 密钥不能出现在任何会被提交的东西里 ----
{
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const looksLikeSecret = /(sk-[A-Za-z0-9_-]{16,}|API_KEY\s*=\s*[^\s#][^\n]*|Bearer\s+[A-Za-z0-9._-]{20,})/;

  for (const file of [
    '../public/room-art.mjs', '../public/admin.js', '../public/admin.html', '../public/blueblood-case.mjs',
    // 这几个也天天跟密钥打交道，同样不能有硬编码的密钥
    '../scripts/setup.mjs', '../lib/prompt.mjs', '../lib/config.mjs', '../server.mjs'
  ]) {
    const text = read(file);
    check(`${file} 里不该出现任何密钥`, !looksLikeSecret.test(text));
  }

  // 提交上去的模板必须只有变量名，不能有值
  const example = read('../.env.example');
  check('.env.example 里 MODEL_API_KEY 必须是空的', /^MODEL_API_KEY=\s*$/m.test(example), '模板里疑似带了真实值');
  check('.env.example 里 ADMIN_PASSWORD 必须是空的', /^ADMIN_PASSWORD=\s*$/m.test(example));
  // 2026-09-14 新增的测试口令键：它是「给评委的那一个」，最容易被顺手写进模板里 ——
  // 而 .env.example 是公开仓库的一部分，写进去等于当众发密码。这条守着它。
  check('.env.example 里 ADMIN_TEST_PASSWORD 必须存在且是空的',
    /^ADMIN_TEST_PASSWORD=\s*$/m.test(example), '要么没写这个键，要么模板里带了值');
  check('.env.example 只记录变量名，不记录知乎密钥明文', !/ZHIHU_ACCESS_SECRET=.+/.test(example) || /^ZHIHU_ACCESS_SECRET=\s*$/m.test(example));

  // 含真实密钥的文件必须被 git 排除。
  // 直接问 git 本身，比对着 .gitignore 猜正则可靠。
  // 特别注意备份文件：npm run setup 每次会留下 .env.local.bak-<时间戳>，
  // 里面装着上一次的密钥。它要是被提交，等于把真密钥送上公开仓库。
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  for (const path of ['.env.local', '.env.local.bak-1789232964021', 'data/records.jsonl', '.env']) {
    let status = null;
    try {
      execFileSync('git', ['check-ignore', '-q', path], {cwd: repoRoot, stdio: 'ignore'});
      status = 'ignored';
    } catch (error) {
      if (error.status === 1) status = 'tracked';
    }
    check(`git 必须忽略 ${path}`, status !== 'tracked', status === null ? '（git 不可用，未能验证）' : '');
  }
}

if (failures.length) {
  console.log(`NPC 对话服务：${passed} 项通过，${failures.length} 项失败`);
  for (const line of failures) console.log('  ✗ ' + line);
  process.exitCode = 1;
} else {
  console.log(`NPC 对话服务：${passed} 项全部通过（缓存 / 限流 / 预算 / 降级 / 人设边界 / 出戏检测）。未联网，未消耗任何额度。`);
}
