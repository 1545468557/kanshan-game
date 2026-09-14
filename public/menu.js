'use strict';
const dialog = document.querySelector('#panel');
const body = document.querySelector('#panel-body');
const audioButton = document.querySelector('#audio');
const bgm = document.querySelector('#bgm-piano');
const uiChime = document.querySelector('#ui-soft-chime');
let audioContext, drone, droneGain, dialogOpener, whisperTimer;
let prefs = { sound: false, volume: .25, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches };
try { const saved = JSON.parse(localStorage.getItem('clue-menu-preferences') || '{}'); if (typeof saved.sound === 'boolean') prefs.sound = saved.sound; if (typeof saved.motion === 'boolean') prefs.motion = saved.motion; if (typeof saved.volume === 'number') prefs.volume = Math.min(1, Math.max(0, saved.volume)); } catch {}
function savePrefs() { try { localStorage.setItem('clue-menu-preferences', JSON.stringify({ sound: prefs.sound, volume: prefs.volume, motion: prefs.motion })); } catch {} }
function setMediaVolume() { if (bgm) bgm.volume = prefs.sound ? Math.min(.14, Math.max(.02, prefs.volume * .42)) : 0; if (uiChime) uiChime.volume = prefs.sound ? Math.min(.22, Math.max(.04, prefs.volume * .7)) : 0; if (droneGain && audioContext) droneGain.gain.setTargetAtTime(0, audioContext.currentTime, .15); }
function applyPrefs() { document.documentElement.classList.toggle('no-motion', !prefs.motion); audioButton.setAttribute('aria-pressed', String(prefs.sound)); audioButton.setAttribute('aria-label', prefs.sound ? '关闭背景音乐与音效' : '开启背景音乐与音效'); audioButton.innerHTML = `♪ <span>声音${prefs.sound ? '开' : '关'}</span>`; setMediaVolume(); savePrefs(); }
async function startMusic() { if (!bgm || !prefs.sound) return; bgm.volume = Math.min(.14, Math.max(.02, prefs.volume * .42)); try { await bgm.play(); } catch { announce('点击声音按钮即可播放背景音乐。'); } }
function playChime() { if (!prefs.sound || !uiChime) return; try { uiChime.currentTime = 0; uiChime.play().catch(() => {}); } catch {} }
async function toggleSound() { try { /* 已经是「声音开」的状态：音乐正放着 → 这一下是关掉；只是被暂停了（例如刚切走标签页）→ 这一下是接着放，而不是又关一次。（这层判断来自 PR 分支 22ddf4e7） */ if (prefs.sound) { if (bgm?.paused) { await startMusic(); playChime(); } else { prefs.sound = false; applyPrefs(); bgm?.pause(); } return; } if (!audioContext) { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) { audioContext = new Audio(); drone = audioContext.createOscillator(); droneGain = audioContext.createGain(); drone.frequency.value = 64; droneGain.gain.value = 0; drone.connect(droneGain).connect(audioContext.destination); drone.start(); } } /* 不能 await resume()：没有用户手势时它**永远不会 resolve**，会把开关整个卡住、按钮点了没反应。放它自己跑就行。 */ audioContext?.resume().catch(() => {}); prefs.sound = true; applyPrefs(); await startMusic(); playChime(); } catch { announce('当前浏览器暂时无法播放环境音。'); } }
function announce(text) { clearTimeout(whisperTimer); const el = document.querySelector('#scene-message') || document.querySelector('#whisper'); el.textContent = text; el.classList.add('active'); whisperTimer = setTimeout(() => { el.textContent = el.id === 'scene-message' ? '门内安静了下来。' : '每一个故事，都有尚未问出口的问题。'; el.classList.remove('active'); }, 4200); }
// 「房间里没有人」是旧草稿的说法（本案的 402 里明明有三个人在场），
// 所以这一句只说「没有出声」，不断言里面是空的。
function knock() { announce('笃、笃、笃。门虚掩着，里面没有出声。'); playChime(); }
const screens = {
  chapters: () => `<p class="panel-kicker">STORY COLLECTION</p><h2 id="panel-title">选择一个未解的故事</h2><button class="chapter-choice" data-open="case"><img src="./assets/apartment-menu.jpg" alt="402号房门"/><span><small>第一章 · 3D 场景调查</small><h3>蓝血</h3><small>旧公寓 / 五问推理</small></span><span class="arrow">↗</span></button><p class="coming">其他故事尚在筛选中。<br>每个关卡都将保留可查阅的知乎原文来源。</p>`,
  case: () => `<p class="panel-kicker">CASE 001 / 第一章</p><h2 id="panel-title">蓝血</h2><img class="case-image" src="./assets/apartment-menu.jpg" alt="深夜公寓里透出暖光的402号房门"/><div class="panel-copy"><p>昨晚的急救演示结束后，房间里留下了一抹不该出现的蓝色。三个人都说自己只看见了其中一部分。</p><p>你可以先写下五个解释，再通过道具、日记和对话，把“蓝血是什么”问到关键处。</p></div><div class="case-facts"><span>场景调查</span><span>人物追问</span><span>五问结案</span></div><div class="notice">整合版已开放：阅读日记、查看关键物件、询问三名在场者，最后提交五题解释。《蓝血》母题来自知乎官方发布的故事，房间与结局为新增改编。</div><div class="panel-actions"><a class="primary" href="./room.html?intro=cg1"><span>进入调查现场</span><span>↗</span></a><button class="back-button" data-open="prologue"><span>阅读序幕</span><span>↗</span></button><button class="back-button" data-open="chapters">返回故事列表</button></div>`,
  // 序幕文案：必须与《蓝血》的真实前提一致。
  // 曾经这里是「门卫 / 储物 / 门后敲了三下 / 这里已经很久没有人住了」——那是
  // 早期草稿《谁在替空房敲门》的素材（见 STORY.md 附录 A），和本案直接冲突：
  // 402 明明是昨晚刚做完急救演示的房间，不可能「很久没有人住」。
  // 下面这版只保留了官方母题里的三件事：急救培训、血色认知冲突、有人在观察你，
  // 并且刻意不提「模拟液 / 教具 / 贴片 / 培训师」——那些是玩家要自己问出来的答案。
  prologue: () => `<p class="panel-kicker">序幕 / 旧公寓 · 402 · 深夜</p><h2 id="panel-title">这次，换你敲门。</h2><div class="panel-copy"><p>昨晚的急救演示散得很早。你是最后一个离开的 —— 出门之前，你在自己手背上看见了一抹蓝。</p><p>再回到这里时，说法已经对得整整齐齐：没有人见过蓝色。也许是你站在灯下看错了，也许只是记岔了。</p></div><blockquote class="prologue-quote">“每个人都说了一部分。<br>剩下的，等你来问。”</blockquote><div class="panel-copy"><p>还有一件事你没跟任何人提。你说出“血怎么会是蓝的”那一刻，有人在看你 —— 看得很专心，像是早就在等这句话。</p><p>门是虚掩的。昨晚留下的东西都还在里面：用过的纱布、没合上的箱子、一段没看完的录像。走进去，你还能自己确认一次。</p></div><div class="notice">序幕为游戏改编文本，保留知乎官方故事中的急救培训与血色认知冲突；具体经过与结局为本次新增改编。现在可以进入房间，体验移动、物品调查与演示对话。</div><a class="primary" href="./room.html?intro=cg1"><span>推门进入 · 3D 试玩</span><span>↗</span></a><button class="back-button" data-open="case">返回案件简介</button>`,
  // 「调查员须知」是**全站共用的说明书**，不是第一幕的简介。
  // 原先它把《蓝血》的五问原文列了出来（「蓝血是什么、从哪里来、昨晚发生什么…」），
  // 还写死了「五个判断 / 五题结案 / 第一幕整合版」——每加一关都要回来改这一页。
  // 现在只说这套玩法本身（先下判断 → 再查现场 → 最后核对说法）：
  // 题目与条数交给各关自己，第二幕起不用再动这里。
  guide: () => `<p class="panel-kicker">INVESTIGATOR'S NOTES</p><h2 id="panel-title">先写下你的解释</h2><div class="steps"><div class="step"><div><strong>先留下你的判断</strong><p>进现场之前就可以先写。每一关问的问题不一样，条数也由那一关决定；答案可以之后反复修改。</p></div></div><div class="step"><div><strong>再看现场</strong><p>现场既有关键线索，也有普通生活物件和故意做得相似的干扰项。不是每件东西都要提供线索。</p></div></div><div class="step"><div><strong>最后对照说法</strong><p>每个人只知道自己经历的一部分。记不清、看错和刻意隐瞒，是不同的事情。</p></div></div></div><div class="notice">每一关都保留可查阅的知乎原文来源；具体玩法以该关现场的提示为准。</div>`,
  sources: () => `<p class="panel-kicker">FROM ZHIHU</p><h2 id="panel-title">故事有来处，推理有依据</h2><div class="panel-copy"><p>《蓝血》的核心母题来自知乎官方发布的故事：急救培训中，主角发现自己与周围人对“血液颜色”的认知不同，并察觉有人在观察自己。</p><p><a href="https://api.zhihu.com/km-indep-home/hackathon/v2/story/2025684191967294692" target="_blank" rel="noopener noreferrer">查看知乎官方故事来源 ↗</a></p><p>本关保留上述母题，蓝血的具体来源、昨晚经过、撒谎者和动机属于新增游戏改编，不冒充原文结局。</p></div><div class="notice">原始故事可能包含剧透。改编与使用范围以知乎官方的要求为准；本页是独立改编作品，不代表知乎官方发布。</div>`,
  settings: () => `<p class="panel-kicker">PREFERENCES</p><h2 id="panel-title">按你的节奏进入故事</h2><label class="setting-row"><span>背景音乐与音效<small>轻柔钢琴氛围 + 柔和钟鸣，已降低音量</small></span><input id="sound-setting" type="checkbox" ${prefs.sound ? 'checked' : ''}/></label><label class="setting-row"><span>音量<small>建议佩戴耳机，保持适中音量</small></span><input id="volume-setting" type="range" min="0" max="100" value="${Math.round(prefs.volume * 100)}" aria-label="背景音乐音量"/></label><label class="setting-row"><span>界面动态<small>关闭后减少入场与过渡动画</small></span><input id="motion-setting" type="checkbox" ${prefs.motion ? 'checked' : ''}/></label><p class="notice">偏好仅保存在当前浏览器。音乐默认关闭，点击右上角“声音”即可开启。</p>`
};
const prologueText = screens.prologue;
screens.prologue = () => prologueText().replace('<div class="panel-copy">', '<img class="case-image prologue-art" src="./assets/apartment-menu.jpg" alt="第一幕：402号公寓门前"/><div class="panel-copy">') + '<div class="panel-actions"><button class="back-button" id="chapter-knock">轻敲房门</button><span class="scene-feedback" id="scene-message" role="status">试着听听门后的回应。</span></div>';
function openPanel(name) { if (!screens[name]) return; if (!dialog.open) dialogOpener = document.activeElement; document.body.classList.toggle('chapter-one', name === 'case' || name === 'prologue'); body.innerHTML = screens[name](); /* 面板左上角那个徽标：「调查档案 / ???」。**只有属于第一幕的面板才配显示关卡号 01** ——「须知」「来源」「设置」是全站共用的，显示 01 就等于把说明书钉在了第一幕上（第二幕打开同一页会照样写着 01）。新加的通用面板往这个表里补一行即可，别再写三元表达式。 */ document.querySelector('#panel-kind').textContent = ({settings: '设置', sources: '来源', guide: '须知'})[name] || '01'; if (!dialog.open) dialog.showModal(); dialog.scrollTop = 0; document.querySelector('#close-panel').focus(); body.querySelector('#chapter-knock')?.addEventListener('click', knock); body.querySelector('#sound-setting')?.addEventListener('change', async e => { await toggleSound(); e.target.checked = prefs.sound; }); body.querySelector('#volume-setting')?.addEventListener('input', e => { prefs.volume = Number(e.target.value) / 100; applyPrefs(); if (prefs.sound) startMusic(); }); body.querySelector('#motion-setting')?.addEventListener('change', e => { prefs.motion = e.target.checked; applyPrefs(); }); }
document.addEventListener('click', e => { const target = e.target.closest('[data-open]'); if (target) { playChime(); if (target.matches('a.primary')) startMusic(); openPanel(target.dataset.open); } });
document.querySelector('#close-panel').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
dialog.addEventListener('close', () => { document.body.classList.remove('chapter-one'); clearTimeout(whisperTimer); dialogOpener?.focus(); });
document.querySelector('#settings').addEventListener('click', () => openPanel('settings'));
audioButton.addEventListener('click', toggleSound);
document.addEventListener('visibilitychange', () => { if (document.hidden) { audioContext?.suspend().catch(() => {}); bgm?.pause(); } else if (prefs.sound) { audioContext?.resume().catch(() => {}); startMusic(); } });
if (prefs.sound) startMusic();
applyPrefs();

// 背景循环视频：**只有它真的开始播了**才淡入显示。
// 为什么：公网上这个 1 MB 文件的请求常常迟迟拿不到数据（readyState 停在 0、
// networkState=2 一直等），这时如果照常显示，用户看到的是一块静止封面。
// 底下那层 .world-drift 是纯 CSS 推镜，不依赖下载，永远在动 —— 让视频当加分项而不是唯一指望。
// 另外有些浏览器和省电模式会拦下自动播放，所以用户第一次点屏幕/按键时再补一次 play()。
// ⚠️ 但上面这句兜底**在手机上必须关掉**（2026-09-14 用户报障后改）：
// 手机上「任意一次触屏」——包括点登录门上的「用知乎账号登录」——都会去 play() 这段视频，
// 而微信/安卓的浏览器内核会把 <video> 接管成自己的全屏播放器，把整页连同登录门一起盖住。
// 所以手机上：**不加载、不播、也不挂这个兜底**（源在下面才注入，手机端一个字节都不会下）。
(() => {
  const video = document.querySelector('.world-video');
  if (!video) return;

  if (typeof window.isHandheld === 'function' && window.isHandheld()) {
    // 源本来就不在 HTML 里（见下），所以这里不用清 src —— 只留个记号给验收脚本读。
    video.setAttribute('data-skipped', 'handheld');
    return;
  }

  // 桌面：源在这一段里注入，而不是写在 HTML 上 —— 这样手机端**根本不会请求**这 1 MB。
  // （HTML 里只留 data-src，路径与说明挨在一起，见 index.html。）
  if (video.dataset.src && !video.querySelector('source')) {
    const source = document.createElement('source');
    source.src = video.dataset.src;
    source.type = 'video/mp4';
    video.append(source);
    video.load();
    // 元素上不再写 autoplay（那样手机端一有源就会自己起播），所以桌面这里显式起播一次。
    // 静音视频的自动播放各浏览器都放行；万一被拒，下面那段「第一次点击再补一次」会兜住。
    const started = video.play();
    if (started && typeof started.catch === 'function') started.catch(() => {});
  }

  const reveal = () => video.classList.add('is-playing');
  const stopRetry = () => {
    document.removeEventListener('pointerdown', retry);
    document.removeEventListener('keydown', retry);
  };
  video.addEventListener('playing', () => { reveal(); stopRetry(); });
  // 已经播起来了（比如浏览器很快、或用户刚切回来）就别等事件
  if (!video.paused && video.readyState >= 2) reveal();
  function retry() {
    if (!video.paused) { reveal(); stopRetry(); return; }
    video.play().then(() => { reveal(); stopRetry(); }).catch(() => {});
  }
  document.addEventListener('pointerdown', retry);
  document.addEventListener('keydown', retry);
})();
