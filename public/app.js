const NPCS = {
  xiaolin: { name: '小林', role: '雪兔 · 后端开发', glyph: '林', intro: '我已经说过了，退出是我自己的决定。项目……你们继续做就好。' },
  ajie: { name: '阿杰', role: '水獭 · 队长', glyph: '杰', intro: '离截止只剩 48 小时，他一句解释都没有。你觉得这合理吗？' },
  anran: { name: '燕鸥小姐', role: '视觉设计 · 关键目击者', glyph: '然', intro: '昨天小林一直盯着电脑，像是在修什么。他不让我靠近。' }
};

const CLUES = [
  { id: 'commit', title: '被撤回的提交', source: '阿杰 · 版本记录', text: '凌晨 00:47，一次包含配置文件的提交被迅速撤回。', keys: ['提交','代码','记录','昨天做了什么','电脑'] },
  { id: 'key', title: '失效的正式密钥', source: '小林 · 追问', text: '提交中的模型 API Key 已公开，小林发现后立即将它作废。', keys: ['密钥','key','泄露','配置','手脚'] },
  { id: 'backup', title: '无人回复的消息', source: '安然 · 聊天记录', text: '小林在群里问过“谁有备用 Key？”，但消息很快被新讨论淹没。', keys: ['消息','群','回复','备用','求助'] },
  { id: 'fear', title: '未发出的解释', source: '小林 · 深度追问', text: '他担心大家只会记住“事故是他造成的”，所以选择先退出。', keys: ['为什么退出','责任','害怕','解释','怪你','背锅'] }
];

const state = { screen: 'cover', npc: 'xiaolin', used: 0, unlocked: new Set(), drawer: false, conclude: false, answer: NPCS.xiaolin.intro, speaker: '小林', focused: false, acting: false };
let actionTimer;

function sceneImage() {
  return state.acting ? `./assets/scene-${state.npc}-action-v3.jpg` : './assets/hackathon-studio-v2.jpg';
}

function render() {
  document.getElementById('app').innerHTML = state.screen === 'cover' ? cover() : state.screen === 'game' ? game() : result();
  bind();
}

function cover() {
  return `<section class="screen cover">
    <div class="cover-grid">
      <div class="cover-copy">
        <div class="eyebrow"><span class="mark">知</span> 知乎深夜档案馆 · 001</div>
        <h1>看山追问局<span>答案藏在你没问的那一句里</span></h1>
        <p class="cover-desc">黑客松截止前 48 小时，后端开发突然退出。<br><strong>你将成为刘看山，只有 5 次追问机会。</strong></p>
        <button class="start" data-action="start">进入问题现场 <i>→</i></button>
        <div class="tiny">建议佩戴耳机 · 单局约 5 分钟 · 本案内容为演示创作</div>
      </div>
      <div class="cover-art">
        <div class="moon"></div>
        <img class="kanshan" src="./assets/kanshan-greet.gif" alt="刘看山向你打招呼" />
        <div class="case-tag glass">CASE 001<b>消失的队友</b></div>
        <div class="float-note note-a glass">00:47 · 提交已撤回</div>
        <div class="float-note note-b glass">“他为什么一句话都没说？”</div>
      </div>
    </div>
  </section>`;
}

function game() {
  const n = NPCS[state.npc];
  return `<section class="screen game">
    <header class="topbar">
      <div class="brand"><span class="mark">知</span><span>看山追问局</span></div>
      <div class="progress" aria-label="剩余追问次数">${[0,1,2,3,4].map(i => `<i class="pip ${i < state.used ? 'used' : ''}"></i>`).join('')}</div>
      <button class="clue-button" data-action="drawer">线索 <b>${state.unlocked.size}</b></button>
    </header>
    <div class="stage">
      <div class="scene scene-world ${state.focused ? `focused focus-${state.npc}` : ''} ${state.acting ? 'acting' : ''}">
        <img class="scene-art" src="${sceneImage()}" alt="雨夜黑客松工作室，三名角色站在不同位置" />
        <div class="rain-layer" aria-hidden="true"></div>
        <div class="depth-light" aria-hidden="true"></div>
        <div class="scene-shade"></div>
        <button class="hotspot hotspot-xiaolin ${state.npc === 'xiaolin' ? 'active' : ''}" data-npc="xiaolin"><i></i><b>小林</b><small>雪兔 · 后端开发</small></button>
        <button class="hotspot hotspot-ajie ${state.npc === 'ajie' ? 'active' : ''}" data-npc="ajie"><i></i><b>阿杰</b><small>水獭 · 队长</small></button>
        <button class="hotspot hotspot-anran ${state.npc === 'anran' ? 'active' : ''}" data-npc="anran"><i></i><b>燕鸥小姐</b><small>关键目击者</small></button>
        <div class="player-avatar"><span>你正在扮演</span><img src="./assets/kanshan-computer.gif" alt="刘看山侦探分身" /><b>刘看山</b></div>
      </div>
      <div class="dialogue scene-dialogue">
        <div class="case-line"><div class="eyebrow">CASE 001 · 消失的队友</div><small>距作品提交 47:12:08</small></div>
        <div class="dialogue-card">
          <div class="speaker">${state.speaker}</div>
          <p class="answer">${state.answer}</p>
        </div>
        <div class="suggestions">
          ${suggestions().map(q => `<button class="suggestion" data-question="${q}">${q}</button>`).join('')}
        </div>
        <form class="askbox">
          <input id="question" maxlength="60" autocomplete="off" placeholder="追问 ${n.name}……" aria-label="输入你的追问" ${state.used >= 5 ? 'disabled' : ''}/>
          <button aria-label="发送追问" ${state.used >= 5 ? 'disabled' : ''}>↗</button>
        </form>
      </div>
    </div>
    <footer class="dock">
      <div class="people">${Object.entries(NPCS).map(([id,p]) => `<button class="person ${id === state.npc ? 'active' : ''}" data-npc="${id}"><b>${p.name}</b><small>${p.role}</small></button>`).join('')}</div>
      <button class="conclude" data-action="conclude">提交推理</button>
    </footer>
    ${state.drawer ? drawer() : ''}${state.conclude ? conclusionModal() : ''}
  </section>`;
}

function suggestions() {
  if (state.npc === 'xiaolin') return ['为什么要退出？', '正式密钥发生了什么？', '你害怕谁怪你？'];
  if (state.npc === 'ajie') return ['小林昨天做了什么？', '查过代码提交记录吗？', '有人在群里求助吗？'];
  return ['你在电脑上看到了什么？', '小林说过备用 Key 吗？', '你觉得他为什么沉默？'];
}

function drawer() {
  return `<div class="overlay" data-action="close"><aside class="drawer" onclick="event.stopPropagation()">
    <div class="drawer-head"><div><div class="eyebrow">INVESTIGATION</div><h2>证据匣 ${state.unlocked.size}/4</h2></div><button class="icon-btn" data-action="close">×</button></div>
    <div class="clue-list">${CLUES.map((c,i) => state.unlocked.has(c.id)
      ? `<article class="clue"><small>线索 0${i+1} · ${c.source}</small><h3>${c.title}</h3><p>${c.text}</p></article>`
      : `<article class="clue locked"><small>线索 0${i+1}</small><h3>尚未解锁</h3><p>向不同的人追问同一件事，也许能看到被忽略的角度。</p></article>`).join('')}</div>
  </aside></div>`;
}

function conclusionModal() {
  return `<div class="overlay"><section class="modal glass">
    <div class="modal-head"><div><div class="eyebrow">FINAL ANSWER</div><h2>小林为什么突然退出？</h2></div><button class="icon-btn" data-action="close-conclude">×</button></div>
    <div class="choices">
      <button class="choice" data-ending="wrong"><b>A</b> 他承受不了比赛压力，临阵退缩</button>
      <button class="choice" data-ending="half"><b>B</b> 安然发现他在电脑上做了手脚，他怕被揭穿</button>
      <button class="choice" data-ending="truth"><b>C</b> 密钥意外泄露，他修复失败又担心独自背责</button>
      <button class="choice" data-ending="wrong"><b>D</b> 他准备带着项目代码加入另一支队伍</button>
    </div>
  </section></div>`;
}

function result() {
  const e = state.ending;
  const score = e === 'truth' ? Math.min(96, 62 + state.unlocked.size * 8) : e === 'half' ? 68 : 42;
  const grade = score > 88 ? 'S' : score > 65 ? 'B' : 'C';
  const title = e === 'truth' ? '你问到了沉默背后' : e === 'half' ? '你接近了，但仍错怪了他' : '表面答案骗过了你';
  return `<section class="screen result"><article class="result-card glass">
    <div class="result-grid"><div>
      <div class="eyebrow">CASE CLOSED · 追问报告</div><h1>${title}</h1>
      <p>你的追问人格：<strong>${score > 88 ? '共情型侦探' : score > 65 ? '直觉型观察者' : '快速结论者'}</strong></p>
      <div class="stats"><div class="stat"><b>${score}</b><small>推理分</small></div><div class="stat"><b>${state.used}</b><small>次追问</small></div><div class="stat"><b>${state.unlocked.size}/4</b><small>条线索</small></div></div>
      <div class="truth">真相不是“小林在电脑上做了手脚”。正式密钥被意外提交到公开仓库后，他第一时间撤回并作废，却没有等到队友回应。比技术事故更早击垮他的，是“所有人都会先怪我”的恐惧。</div>
      <div class="actions"><button class="primary" data-action="restart">重新追问</button><button data-action="share">生成追问卡片</button></div>
    </div><div class="result-visual"><div class="grade">${grade}</div><img class="result-mascot" src="./assets/${score > 65 ? 'kanshan-win' : 'kanshan-sleep'}.gif" alt="刘看山结案状态" /></div></div>
  </article></section>`;
}

function ask(q) {
  q = q.trim();
  if (!q || state.used >= 5) return;
  state.used += 1;
  const lower = q.toLowerCase();
  const relevant = CLUES.filter(c => c.keys.some(k => lower.includes(k.toLowerCase())));
  let newly = 0;
  relevant.forEach(c => { if (!state.unlocked.has(c.id)) { state.unlocked.add(c.id); newly++; } });
  state.speaker = NPCS[state.npc].name;
  state.answer = responseFor(state.npc, lower, relevant);
  state.focused = true;
  state.acting = true;
  render();
  clearTimeout(actionTimer);
  actionTimer = setTimeout(() => { state.acting = false; render(); }, 1900);
  if (newly) toast(`获得 ${newly} 条新线索 · 已收入证据匣`);
  if (state.used >= 5) setTimeout(() => { state.conclude = true; render(); }, 700);
}

function responseFor(npc, q, relevant) {
  if (npc === 'xiaolin') {
    if (/为什么.*退出|责任|害怕|怪你|背锅/.test(q)) return '我不是想逃。那次提交里有<strong>不该公开的东西</strong>。我撤回、作废、求助……没人回。我不知道真相出来时，你们会不会只记得是我闯的祸。';
    if (/密钥|key|泄露|配置|手脚/.test(q)) return '是正式环境的模型 Key。我发现后不到三分钟就撤回并作废了，但公开仓库的历史记录里……它出现过。';
    return '你问的是发生了什么，可我更怕你问：<em>这是谁的责任？</em>';
  }
  if (npc === 'ajie') {
    if (/提交|代码|记录|昨天做了什么|电脑/.test(q)) return '我后来查了。00:47 有个提交被撤回，说明写着“remove config”。当时我只顾着催功能，没有继续追问。';
    if (/消息|群|回复|求助|备用/.test(q)) return '群消息太多了……等一下，他确实问过谁有备用 Key。那条消息后面接着我发的进度表，没人回。';
    return '我以为队长的任务是盯住进度。现在想想，我是不是只问了<em>“什么时候做完”</em>？';
  }
  if (/电脑|提交|代码|手脚/.test(q)) return '我看到的不是他“动手脚”。他不停切换仓库记录和控制台，手一直在抖，像是在补救什么。';
  if (/备用|key|消息|求助/.test(q)) return '他小声问过我有没有备用 Key。我没有，就让他去群里问。后来我才发现，没有人回复他。';
  return '我当时猜他做错了事，所以不敢说。可“猜测”和“事实”，也许差的就是一次追问。';
}

function toast(msg) { const t = document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2600); }

function bind() {
  document.querySelector('[data-action="start"]')?.addEventListener('click', () => { state.screen='game'; state.focused=false; render(); });
  document.querySelectorAll('[data-npc]').forEach(b => b.addEventListener('click', () => { state.npc=b.dataset.npc; state.answer=NPCS[state.npc].intro; state.speaker=NPCS[state.npc].name; state.focused=true; state.acting=false; clearTimeout(actionTimer); render(); }));
  document.querySelectorAll('[data-question]').forEach(b => b.addEventListener('click', () => ask(b.dataset.question)));
  document.querySelector('.askbox')?.addEventListener('submit', e => { e.preventDefault(); ask(document.getElementById('question').value); });
  document.querySelector('[data-action="drawer"]')?.addEventListener('click', () => { state.drawer=true; render(); });
  document.querySelectorAll('[data-action="close"]').forEach(b => b.addEventListener('click', () => { state.drawer=false; render(); }));
  document.querySelector('[data-action="conclude"]')?.addEventListener('click', () => { state.conclude=true; render(); });
  document.querySelector('[data-action="close-conclude"]')?.addEventListener('click', () => { state.conclude=false; render(); });
  document.querySelectorAll('[data-ending]').forEach(b => b.addEventListener('click', () => { state.ending=b.dataset.ending; state.screen='result'; render(); }));
  document.querySelector('[data-action="restart"]')?.addEventListener('click', () => { Object.assign(state,{screen:'game',npc:'xiaolin',used:0,unlocked:new Set(),drawer:false,conclude:false,answer:NPCS.xiaolin.intro,speaker:'小林',focused:false,acting:false}); render(); });
  document.querySelector('[data-action="share"]')?.addEventListener('click', () => toast('追问卡片功能将在下一版开放'));
}

render();
