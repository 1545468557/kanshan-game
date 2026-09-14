'use strict';
// 首页特效与刘看山。
//
// 三件事：
//   1. 视差 —— 背景、前景人物按不同幅度反向位移，做出书房的纵深；
//   2. 浮尘 —— canvas 粒子，偏向台灯那一侧（书架暗部几乎没有）；
//   3. 刘看山 —— 站着的一个可点击角色，会问好、会记笔记、会得意、会睡着。
//
// 两条硬约束：
//   · **他说的每一句话都不能泄露案件答案。** 五道题的判分关键词一个都不能出现，
//     否则首页就成了「免费信息」（测试里有一条专门扫这里）。
//   · **不为了他额外拖慢首屏。** 只有 idle 会随页面加载；其余四帧等他被鼠标碰到
//     或者被点的时候才去取。不点他的人，一个字节都不用付。

(function () {
  const root = document.documentElement;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.classList.contains('no-motion');

  // ---------------------------------------------------------------- 视差
  let targetX = 0, targetY = 0, curX = 0, curY = 0;
  let pointerSeen = false;

  addEventListener('pointermove', event => {
    if (reduceMotion()) return;
    pointerSeen = true;
    targetX = (event.clientX / innerWidth) * 2 - 1;
    targetY = (event.clientY / innerHeight) * 2 - 1;
  }, {passive: true});

  // 鼠标离开窗口就把画面归位，别停在一个歪着的位置
  addEventListener('pointerleave', () => { targetX = 0; targetY = 0; }, {passive: true});

  // ---------------------------------------------------------------- 台灯呼吸
  let flick = 1;
  setInterval(() => {
    if (reduceMotion()) return;
    // 大部分时间轻微起伏，偶尔来一次明显的暗一下（旧线路的感觉）
    flick = Math.random() < 0.09 ? 0.25 + Math.random() * 0.4 : 0.72 + Math.random() * 0.28;
  }, 110);

  // ---------------------------------------------------------------- 浮尘
  const canvas = document.querySelector('#fx-dust');
  let motes = [], sprite = null, ctx = null, dustW = 0, dustH = 0;

  function makeSprite() {
    // 提前把「一颗柔和的尘」画成小图，之后只 drawImage —— 比每颗都建渐变快得多
    const size = 32;
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const c = off.getContext('2d');
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,232,196,1)');
    g.addColorStop(.45, 'rgba(255,214,160,.45)');
    g.addColorStop(1, 'rgba(255,200,140,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    return off;
  }

  function spawn(anywhere) {
    // 台灯在画面右侧偏中（约 82% / 46%），浮尘往那边聚；左边书架暗部只有零星几颗
    const lit = Math.random() < .62;
    return {
      x: lit ? dustW * (.56 + Math.random() * .40) : Math.random() * dustW,
      y: anywhere ? Math.random() * dustH : dustH + 10,
      size: lit ? 6 + Math.random() * 12 : 2 + Math.random() * 5,
      vy: .06 + Math.random() * .26,
      vx: (Math.random() - .5) * .14,
      // 透明度调过两轮。第一版 .22 起 —— 画布探针实测只覆盖了屏幕的 0.24%、
      // 平均不透明度 7%，2 倍放大的裁剪图里几乎数不出颗粒，等于白写。
      // 现在目标覆盖率约 1%，够看见「光柱里有灰」，又不至于像下雪。
      alpha: (lit ? .42 : .06) + Math.random() * (lit ? .32 : .12),
      phase: Math.random() * Math.PI * 2,
      speed: .004 + Math.random() * .012
    };
  }

  function sizeDust() {
    if (!canvas) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    dustW = canvas.clientWidth;
    dustH = canvas.clientHeight;
    canvas.width = Math.round(dustW * dpr);
    canvas.height = Math.round(dustH * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 每 6000 像素一颗（1440×900 约 216 颗），上限 220。
    // 密度是拿画布探针量出来的，不是拍的：见 spawn() 里那段注释。
    const count = Math.round(Math.min(220, Math.max(70, (dustW * dustH) / 6000)));
    motes = Array.from({length: count}, () => spawn(true));
  }

  function drawDust() {
    if (!ctx) return;
    ctx.clearRect(0, 0, dustW, dustH);
    ctx.globalCompositeOperation = 'lighter';
    for (const mote of motes) {
      mote.phase += mote.speed;
      mote.y -= mote.vy;
      mote.x += mote.vx + Math.sin(mote.phase) * .22;
      if (mote.y < -12 || mote.x < -20 || mote.x > dustW + 20) Object.assign(mote, spawn(false));
      ctx.globalAlpha = mote.alpha * (.6 + .4 * Math.sin(mote.phase * 1.7));
      ctx.drawImage(sprite, mote.x - mote.size / 2, mote.y - mote.size / 2, mote.size, mote.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- 刘看山
  // 主按钮上那层柔光跟着鼠标走（CSS 里的 --bx），否则它永远停在正中间、看不出跟手。
  for (const button of document.querySelectorAll('.menu .primary')) {
    button.addEventListener('pointermove', event => {
      const rect = button.getBoundingClientRect();
      button.style.setProperty('--bx', (((event.clientX - rect.left) / rect.width) * 100).toFixed(1) + '%');
    }, {passive: true});
  }

  // 用缩到 160px 的那份（每个约 170~260 KB）。原始的 320px 每个 940~957 KB，
  // 而这四个状态是**点击轮换**的 —— 玩家点四下就是 3.8 MB。看山在这里最大只显示
  // 148px（.mascot-wrap 的 clamp(104px,15vw,148px)），160 已经 1:1 还多。
  const FRAMES = {
    idle: './assets/kanshan-idle-160.gif',
    greet: './assets/kanshan-greet-160.gif',
    computer: './assets/kanshan-computer-160.gif',
    win: './assets/kanshan-win-160.gif',
    sleep: './assets/kanshan-sleep-160.gif'
  };

  // 点一下换一帧 + 一句话。四句都不含任何判分关键词，只是氛围和招徕。
  const CYCLE = [
    {state: 'greet', line: '你来了。这栋楼里，只有 402 的灯还亮着。'},
    {state: 'computer', line: '三个人的说法我都记下来了 —— 没有一句是完全一样的。'},
    {state: 'win', line: '对上了。你问的那句话，正好是别人一直绕开的那一句。'},
    {state: 'idle', line: '别急着问我。先把问题问对，问对了，人就会自己漏出破绽。'}
  ];

  const SLEEP_LINE = '（刘看山靠着墙睡着了，手里还捏着半页没写完的笔记。）';
  const WAKE_LINE = '唔……我睡着了？刚才正想到一半。';
  const SLEEP_AFTER_MS = 30000;

  const wrap = document.querySelector('.mascot-wrap');
  const button = document.querySelector('#mascot');
  const image = document.querySelector('#mascot-img');
  const bubble = document.querySelector('#mascot-say');

  const loads = new Map();
  function load(name) {
    if (loads.has(name)) return loads.get(name);
    const promise = new Promise(resolve => {
      const el = new Image();
      el.onload = () => resolve(true);
      el.onerror = () => resolve(false);
      el.src = FRAMES[name];
    });
    loads.set(name, promise);
    return promise;
  }

  let shownFrame = 'idle';
  let wantedFrame = 'idle';
  function show(name) {
    if (!FRAMES[name]) return;
    wantedFrame = name;
    if (shownFrame === name && image.getAttribute('src') === FRAMES[name]) return;
    load(name).then(ok => {
      // 只有「当前仍然想要这一帧」时才切，避免快速连点导致画面闪回
      if (!ok || wantedFrame !== name) return;
      if (image.getAttribute('src') !== FRAMES[name]) image.src = FRAMES[name];
      shownFrame = name;
    });
  }

  let sayTimer = null;
  function say(text, sticky) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.dataset.show = 'true';
    clearTimeout(sayTimer);
    if (!sticky) sayTimer = setTimeout(() => { bubble.dataset.show = 'false'; }, 6000);
  }

  // 预取策略见文件头的约束 2：不点他的人不该为这四帧付流量。
  let warmed = false;
  function warm() {
    if (warmed) return;
    warmed = true;
    load('computer');
    load('win');
    load('sleep');
  }

  let step = 0;
  let asleep = false;
  let sleepTimer = null;

  function scheduleSleep() {
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
      if (!button || document.hidden) return scheduleSleep();
      asleep = true;
      button.dataset.awake = 'false';
      show('sleep');
      say(SLEEP_LINE, true);
    }, SLEEP_AFTER_MS);
  }

  function wake() {
    if (!asleep) return false;
    asleep = false;
    if (button) button.dataset.awake = 'true';
    show('idle');
    say(WAKE_LINE);
    return true;
  }

  if (button && image && bubble) {
    button.addEventListener('pointerenter', warm, {once: true});
    button.addEventListener('pointerdown', warm, {once: true});

    button.addEventListener('click', () => {
      warm();
      scheduleSleep();
      if (wake()) return;
      const next = CYCLE[step % CYCLE.length];
      step += 1;
      show(next.state);
      say(next.line);
    });

    // 键盘用户也能玩：空格/回车由 button 自动触发 click，这里只补一个「先热身」
    button.addEventListener('focus', warm, {once: true});

    scheduleSleep();
  }

  // 首页加载完之后，先把最可能被点到的那一帧偷偷取回来
  addEventListener('load', () => setTimeout(() => load('greet'), 800), {once: true});

  // ---------------------------------------------------------------- 主循环
  let last = performance.now();
  let dustSkipped = false;
  let setX = 0, setY = 0, setFlick = flick;   // 上一次真正写进 CSS 的值，用来跳过无变化的帧

  function tick(now) {
    const dt = Math.min(48, now - last);
    last = now;

    // 视差缓动：越接近目标越慢，收得自然
    curX += (targetX - curX) * Math.min(1, dt / 260);
    curY += (targetY - curY) * Math.min(1, dt / 260);

    // 只在数值真的变了的时候才写 CSS 变量。背景是 1672×941 的大图，
    // 每帧无条件重设 --px 会让浏览器每帧都重算样式、重绘整张背景 ——
    // 静止时（鼠标没动）纯属白烧 GPU。留 0.002 的死区就够抹掉浮点抖动。
    if (Math.abs(curX - setX) > .002 || Math.abs(curY - setY) > .002) {
      setX = curX; setY = curY;
      root.style.setProperty('--px', curX.toFixed(2));
      root.style.setProperty('--py', curY.toFixed(2));
      // 人物比背景近，位移更大、方向相反 —— 这就是纵深感
      root.style.setProperty('--mascot-x', (curX * -18).toFixed(1));
      root.style.setProperty('--mascot-y', (curY * -10).toFixed(1));
    }
    if (flick !== setFlick) {
      setFlick = flick;
      root.style.setProperty('--flick', flick.toFixed(2));
    }

    if (canvas && !reduceMotion() && !document.hidden) {
      if (dustSkipped) { dustSkipped = false; sizeDust(); }
      drawDust();
    } else if (canvas && reduceMotion() && !dustSkipped) {
      // 关掉动效时把画面清空，免得留下最后一帧的残影
      if (ctx) ctx.clearRect(0, 0, dustW, dustH);
      dustSkipped = true;
    }

    requestAnimationFrame(tick);
  }

  if (canvas) {
    sprite = makeSprite();
    sizeDust();
    addEventListener('resize', () => { sizeDust(); }, {passive: true});
  }

  root.style.setProperty('--px', '0');
  root.style.setProperty('--py', '0');
  requestAnimationFrame(tick);

  // 给自动化检查留个把手，不要在正式页面依赖它
  window.homeFx = {
    frames: FRAMES,
    state: () => ({shownFrame, wantedFrame, asleep, step}),
    lines: () => [CYCLE.map(row => row.line), SLEEP_LINE, WAKE_LINE].flat()
  };
})();
