'use strict';
// 知乎账号登录：右上角的小挂件 + 盖住整页的**登录门**。首页和调查现场共用同一份。
//
// 四条规矩：
//   1. 服务端没配 app_id / app_key 时，**连按钮都不出现**，门也不设 ——
//      不要摆一个点了就报错的入口，更不要把整站关成谁都进不去的砖。
//   2. 没有任何凭证会出现在这个文件里，它只跟自己的 /api/auth/* 说话。
//   3. 公网域名上**不登录进不去**（2026-09-14 用户拍板，对标同场其它作品）：
//      门的档位由页面自己的 script 标签声明，**分两档**（2026-09-14 用户拍板）：
//        data-gate="1"       —— 入口档（首页/档案馆）：**可以先以访客身份进来**。
//        data-gate="locked"  —— 现场档（第一幕等具体游戏内容）：**必须登记，访客到此为止**。
//      分档的理由：门盖住的是**整站**，而「能进档案馆」和「能进调查现场」本来就不是一件事。
//      前者是浏览（看展陈、看说明书、看故事简介），后者是调查（推开门、进房间）。
//      一旦登录那头出问题（知乎侧的回调地址没登记对就会这样），入口档让评委至少进得来、
//      看得到这个作品是什么；现场档是作品真正的核心体验，那就必须是登记过的人。
//      现场档也留了一条**不算破例的出口**：「← 返回档案馆」——
//      走不动就退回去，而不是把人堵死在一张动不了的画面上。
//      本地地址（localhost / 局域网）**两档都不设门** —— 知乎那边登记的是公网回调地址，
//      本机根本走不完这一趟，设了门等于把开发者自己关在门外，连试玩都做不了。
//      想在机器上看门长什么样：地址后面加 ?zhihu_gate=1。
//      （只认 =1 强制开，不认 =0 强制关 —— 否则公网上任何人加个参数就能跳过登录。）
//      入口档选了访客只记进 sessionStorage：同一趟逛到别的入口档页面不再被拦第二次，
//      换个标签页或重开浏览器门照样在（不是永久免登录）。
//      ⚠️ **访客这一趟对现场档无效** —— 否则在首页点一次访客就等于把第一幕也一起免了。
//   4. **界面上不写我们自己的处境和心思。** 不写「帮我们计入人气」，也不写
//      「这是知乎黑客松的参赛作品」—— 参赛是我们的事，玩家的门只需要一句话。
//      文案要在**作品自己的世界里**成立，而且要能活到上线之后。
//      （2026-09-14 用户两次否掉：先是「登录后可计入人气」，后是门上一整段自我介绍。
//      他的原话：「登录就登录，那么多话干嘛……要是获奖了，上线到全国了，
//      我是不是还是应该跟全国的用户说这是个参赛作品？」）

(function () {
  const slot = document.querySelector('#zhihu-slot');

  const REASONS = {
    ok: '已用知乎账号登录。',
    unconfigured: '知乎登录还没有配置好，先用访客身份继续。',
    denied: '你取消了知乎授权，可以随时再试。',
    bad_state: '这次登录链接已经失效了，请再点一次。',
    no_code: '知乎没有返回授权码，登录没有完成。',
    exchange_failed: '知乎那边没有通过验证，登录没有完成。'
  };

  let toastTimer = null;
  function toast(text) {
    let el = document.querySelector('#zhihu-toast');
    if (!el) {
      el = document.createElement('p');
      el.id = 'zhihu-toast';
      el.className = 'zhihu-toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = text;
    el.classList.add('active');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('active'), 5200);
  }

  // 从知乎跳回来时地址上带着结果。先解析、后建门，门里要把它显示出来
  // （门盖住整页时底下那个吐司是看不见的，失败原因必须写在门里）。
  const params = new URLSearchParams(location.search);
  const reason = params.get('zhihu');
  const forcedGate = params.get('zhihu_gate') === '1';
  if (reason) {
    const text = REASONS[reason] || '登录没有完成。';
    document.addEventListener('DOMContentLoaded', () => toast(text));
    if (document.readyState !== 'loading') toast(text);
    params.delete('zhihu');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + location.hash);
  }

  // ---------------------------------------------------------------- 右上角按钮

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'zhihu-account';
  button.hidden = true;
  if (slot) slot.append(button);

  function paint(state) {
    if (!slot) return;
    if (!state || !state.enabled) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    if (state.loggedIn) {
      button.dataset.state = 'in';
      button.innerHTML = '<i aria-hidden="true">知</i><span>已用知乎账号登录<small>点这里退出</small></span>';
      button.setAttribute('aria-label', '已用知乎账号登录，点击退出登录');
      return;
    }
    button.dataset.state = 'out';
    button.innerHTML = '<i aria-hidden="true">知</i><span>用知乎账号登录<small>进现场要用</small></span>';
    button.setAttribute('aria-label', '用知乎账号登录');
  }

  button.addEventListener('click', async () => {
    if (button.dataset.state === 'out') {
      goLogin();
      return;
    }
    button.disabled = true;
    try {
      const response = await fetch('./api/auth/logout', {method: 'POST', credentials: 'same-origin'});
      const payload = await response.json().catch(() => ({}));
      paint({enabled: true, loggedIn: Boolean(payload.loggedIn)});
      toast('已退出知乎账号。');
    } catch {
      toast('退出没有成功，请刷新后重试。');
    } finally {
      button.disabled = false;
    }
  });

  // 把「登录成功后回到哪一页」带过去。服务端会校验它必须是站内路径。
  // 关卡页的 ?intro=cg1 也在 location.search 里，所以回来还是接着看序幕。
  function goLogin() {
    const next = location.pathname + location.search;
    location.href = `./api/auth/zhihu/start?next=${encodeURIComponent(next)}`;
  }

  // ---------------------------------------------------------------- 登录门

  // 这一页要不要设门、设哪一档，由页面自己声明：
  //   <script src="./zhihu-login.js" data-gate="1">       入口档（可访客）
  //   <script src="./zhihu-login.js" data-gate="locked">  现场档（必须登记）
  // 预览页（home-preview.html）故意不挂 —— 那是本地看特效用的，挂了就没法看了。
  //
  // 为什么档位写死在页面上、而不是由脚本按 URL 去猜：页面自己最清楚自己是「入口」还是「现场」，
  // 将来加第二关第三关也不用回来改这个文件（踩过：把「第几关」写进全站共用的地方，
  // 每加一关都要回来改一遍）。
  const script = document.currentScript;
  const declaredMode = String(
    (script && script.dataset.gate) ||
    (document.body && document.body.dataset.zhihuGate) ||
    ''
  ).trim().toLowerCase();
  const gateMode = declaredMode === 'locked' || declaredMode === 'strict'
    ? 'locked'
    : declaredMode === '1' || declaredMode === 'entry'
      ? 'entry'
      : '';
  const declared = Boolean(gateMode);
  const strictPage = gateMode === 'locked';

  // 本地地址一律不设门。公网域名（含平台的 *.app.workbuddy.host）才设。
  function isLocalHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    if (!host) return true; // file:// 或读不到主机名 —— 按本地处理，别把自己关在外面
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;
    if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    return false;
  }

  // 什么情况下才设门。**每一条都是「宁可漏，也不要把整站变砖」**：
  //   拿不到登录状态（网络抖一下 / 接口挂了）→ 不设门，让人进去；
  //   服务端没配好凭证 → 不设门，否则没有任何办法能通过这道门。
  //
  // 第二个参数：`skipped` = 这一趟已经选了访客，`strict` = 这是现场档。
  // 顺序要紧：**强制预览排第一** —— ?zhihu_gate=1 是专门来看门的，不该被上一次的访客记录挡住；
  // 而 skipped **只对入口档有效** —— 否则在首页点一次访客，就等于把第一幕也一起免了。
  function shouldGate(state, {skipped = false, strict = false} = {}) {
    if (!declared && !forcedGate) return false;
    if (!state || !state.enabled || state.loggedIn) return false;
    if (forcedGate) return true;
    if (skipped && !strict) return false;
    return !isLocalHost(location.hostname);
  }

  let gateEl = null;
  let pausedMedia = [];
  let mediaPaused = false;

  // 访客这一趟：只记在 sessionStorage —— 影响这个标签页这次会话，不碰别人的浏览器。
  // 隐私模式下 sessionStorage 可能直接抛异常，所以每一处都包起来：
  // 存不下最多是逛关卡页时再被问一次，绝不能让「点访客」这个动作本身失败。
  const GUEST_KEY = 'zhihu-gate-guest';

  function guestChosen() {
    try {
      return sessionStorage.getItem(GUEST_KEY) === '1';
    } catch {
      return false;
    }
  }

  function rememberGuest() {
    try {
      sessionStorage.setItem(GUEST_KEY, '1');
    } catch {
      /* 存不下就算了，不影响这一次进入 */
    }
  }

  function enterAsGuest() {
    rememberGuest();
    dropGate();
    toast('已按访客身份进入。');
  }

  // 门的文案按档位分开。两档说的其实是同一件事的两半：
  //   入口档 —— 说「登记的好处」（因为不登记也能进）
  //   现场档 —— 说「为什么拦你」（因为这里不给访客留门）
  const GATE_COPY = {
    entry: {
      kicker: '故事档案馆 · 入馆登记',
      title: '卷宗只交给登记过的调查员',
      lead: '用知乎账号登录，就能走进档案馆。',
      guest: '先以访客身份进入'
    },
    locked: {
      kicker: '故事档案馆 · 现场登记',
      title: '调查现场只对登记过的调查员开放',
      lead: '用知乎账号登录，才能推开门。',
      // 现场档不设访客入口：看馆藏是浏览，进房间是调查。
      // 但留一条「退回去」的路 —— 走不动就退回档案馆，
      // 而不是把人堵死在一张动不了的画面上（这也让整站永远不会变砖）。
      back: '← 返回档案馆'
    }
  };

  function buildGate() {
    const copy = GATE_COPY[gateMode] || GATE_COPY.entry;
    const el = document.createElement('div');
    el.className = 'zhihu-gate';
    el.id = 'zhihu-gate';
    el.dataset.mode = gateMode;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'zhihu-gate-title');
    el.innerHTML = [
      '<div class="zhihu-gate-card">',
      `<p class="zhihu-gate-kicker">${copy.kicker}</p>`,
      `<h2 id="zhihu-gate-title">${copy.title}</h2>`,
      `<p class="zhihu-gate-lead">${copy.lead}</p>`,
      '<button class="zhihu-gate-enter" type="button"><i aria-hidden="true">知</i><span>用知乎账号登录</span></button>',
      copy.guest ? `<button class="zhihu-gate-guest" type="button">${copy.guest}</button>` : '',
      copy.back ? `<a class="zhihu-gate-back" href="./">${copy.back}</a>` : '',
      '<p class="zhihu-gate-note" id="zhihu-gate-note" role="status"></p>',
      '</div>'
    ].join('');
    el.querySelector('.zhihu-gate-enter').addEventListener('click', goLogin);
    // 访客按钮只有入口档才有 —— 这里不能假设它一定在。
    const guest = el.querySelector('.zhihu-gate-guest');
    if (guest) guest.addEventListener('click', enterAsGuest);
    return el;
  }

  // 门只挡人，不挡键盘：inert 让 Tab 键也走不进被盖住的界面。
  // 浏览器不支持 inert 时至少还有覆盖层挡着点击，不会变成「能点却看不见」。
  function setBackgroundInert(on) {
    for (const child of Array.from(document.body.children)) {
      if (child.id === 'zhihu-gate' || child.id === 'zhihu-toast') continue;
      try {
        child.inert = on;
      } catch {
        /* 老浏览器没有 inert，忽略 */
      }
    }
  }

  // 门开着的时候不许有任何东西出声/自播。两道：
  //   ① 现在就把正在播的暂停（可能是玩家登录前就点开的音乐）；
  //   ② 之后谁再想播就按下去 —— 只做 ① 会漏掉竞态：
  //      关卡页的序幕动画是在门**出现之后**才真正开始播的（play() 是异步的），
  //      等它响起来时 ① 早就跑完了，于是它在门后面自己演完、还带着声音。
  // 登录成功是整页重载，所以平时不用考虑续播；但状态查得慢时门可能闪一下就没
  // （本来就已经登录了），那种情况必须把刚才暂停的恢复回去，不然玩家会卡在一个不动的画面上。
  function onMediaPlay(event) {
    if (!gateEl || !gateEl.isConnected) return;
    const el = event.target;
    if (el && typeof el.pause === 'function') {
      // 记下来，撤门时要把它放回去。关卡页的序幕是在门**出现之后**才开始播的，
      // 不属于「门出现那一刻正在播的」那一批，只按那一批记就会漏掉它。
      // 实测补一句诚实话：房间自己也会重试把序幕播起来，所以这行是**兜底**、不是唯一依靠；
      // 但「凡是被门按下去的，撤门时都放回去」这条规则本身要成立（2026-09-14）。
      if (!pausedMedia.includes(el)) pausedMedia.push(el);
      try {
        el.pause();
      } catch {
        /* 忽略 */
      }
    }
  }

  function pauseMedia() {
    if (mediaPaused) return;
    mediaPaused = true;
    pausedMedia = [];
    document.addEventListener('play', onMediaPlay, true);
    for (const el of document.querySelectorAll('video,audio')) {
      if (el.paused) continue;
      pausedMedia.push(el);
      try {
        el.pause();
      } catch {
        /* 忽略 */
      }
    }
  }

  function resumeMedia() {
    if (!mediaPaused) return;
    mediaPaused = false;
    document.removeEventListener('play', onMediaPlay, true);
    const list = pausedMedia;
    pausedMedia = [];
    for (const el of list) {
      try {
        const playing = el.play();
        if (playing && typeof playing.catch === 'function') playing.catch(() => {});
      } catch {
        /* 自动播放被拒就保持暂停，不是错误 */
      }
    }
  }

  function showGate() {
    if (!gateEl) gateEl = buildGate();
    if (!gateEl.isConnected) document.body.append(gateEl);

    const note = gateEl.querySelector('#zhihu-gate-note');
    const label = gateEl.querySelector('.zhihu-gate-enter span');
    const text = reason && reason !== 'ok' ? REASONS[reason] || '登录没有完成。' : '';
    note.textContent = text;
    note.classList.toggle('active', Boolean(text));
    if (label) label.textContent = text ? '再试一次' : '用知乎账号登录';

    document.documentElement.classList.add('zhihu-gate-lock');
    setBackgroundInert(true);
    pauseMedia();

    // 把焦点放进门里，键盘用户不会一上来就 Tab 到被盖住的菜单上。
    const enter = gateEl.querySelector('.zhihu-gate-enter');
    if (enter && document.activeElement && document.activeElement !== enter) {
      try {
        enter.focus({preventScroll: true});
      } catch {
        /* 忽略 */
      }
    }
  }

  function dropGate() {
    if (!gateEl) return;
    if (gateEl.isConnected) gateEl.remove();
    document.documentElement.classList.remove('zhihu-gate-lock');
    setBackgroundInert(false);
    resumeMedia();
  }

  // ---------------------------------------------------------------- 状态

  async function refresh() {
    try {
      const response = await fetch('./api/auth/me', {headers: {accept: 'application/json'}, credentials: 'same-origin'});
      if (!response.ok) throw new Error(String(response.status));
      const state = await response.json();
      paint(state);
      if (shouldGate(state, {skipped: guestChosen(), strict: strictPage})) showGate();
      else dropGate();
    } catch {
      // 拿不到状态就把按钮藏起来、门也不设：宁可没有入口，也不要给一个坏掉的入口，
      // 更不要因为一次网络抖动把所有人都挡在门外。
      paint(null);
      dropGate();
    }
  }

  refresh();
})();
