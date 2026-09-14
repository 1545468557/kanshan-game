// 登录门：公网域名上「不登录进不去」，本地地址不设门。
//
// 为什么专门测这个文件：这道门的**失败方向是致命的** ——
//   ① 该设门没设门 → 人气奖白丢，用户明确要求过的事没做到；
//   ② 不该设门却设了 → 整站变砖，连评委都进不去，比 ① 严重得多。
// 所以下面每一条「不设门」的条件都要有用例钉住。
//
// 关于「读源码算不算数」：这里**不是**拿 grep 找字面串，而是把 isLocalHost / shouldGate
// 两个纯函数从源码里整段取出来，放进 Node 的 vm 沙箱里**真正执行**，断言的是执行结果。
// 取不到函数会立刻报错（不是静默跳过），所以不会出现「改了函数名、测试还在绿」的假象。
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readPublic = name => readFileSync(join(root, 'public', name), 'utf8');

const source = readPublic('zhihu-login.js');

let passed = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

// ---- 把纯函数整段抠出来（按括号配平，不靠行号）----
//
// ⚠️ 必须先跳过**参数表**、再找函数体的那个 `{`。
// 2026-09-14 踩到：shouldGate 的第二个参数改成了解构
// （`{skipped = false, strict = false} = {}`），于是「第一个 `{`」落在参数里，
// 配平从参数那个 `{` 开始算 ⇒ 切出来的源码缺一半 ⇒
// 报错是 `SyntaxError: Unexpected identifier 'globalThis'`，
// **看起来像产品代码语法错了，其实是我的测试工具切错了。**
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return '';
  // 参数表：从函数名后的第一个 ( 开始配平小括号，配平结束后的第一个 { 才是函数体
  let parens = 0;
  let open = -1;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '(') parens += 1;
    else if (source[i] === ')') {
      parens -= 1;
      if (parens === 0) {
        open = source.indexOf('{', i);
        break;
      }
    }
  }
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return '';
}

const isLocalHostSource = extractFunction('isLocalHost');
const shouldGateSource = extractFunction('shouldGate');
const guestChosenSource = extractFunction('guestChosen');
check('源码里能取到 isLocalHost', isLocalHostSource.length > 0);
check('源码里能取到 shouldGate', shouldGateSource.length > 0);
check('源码里能取到 guestChosen', guestChosenSource.length > 0);

// 在沙箱里跑一遍真代码：声明的变量名必须和源码里用的一致（改名了这里就会失败）。
function buildSandbox({hostname, declared, forced}) {
  const context = {
    location: {hostname, search: ''},
    URLSearchParams
  };
  vm.createContext(context);
  vm.runInContext(
    `let declared = ${JSON.stringify(!!declared)};
     let forcedGate = ${JSON.stringify(!!forced)};
     ${isLocalHostSource}
     ${shouldGateSource}
     globalThis.isLocalHost = isLocalHost;
     globalThis.shouldGate = shouldGate;`,
    context
  );
  return context;
}

// ---- 本地地址：一律不设门 ----
const LOCAL_HOSTS = [
  'localhost', '127.0.0.1', '::1', '[::1]',
  '192.168.1.9', '10.0.0.5', '172.16.3.4', '172.31.0.1',
  'mac.local', 'MacBook-Pro.local', 'foo.localhost', ''
];
for (const host of LOCAL_HOSTS) {
  check(`本地地址不设门：${host || '(空)'}`,
    buildSandbox({hostname: host, declared: true, forced: false}).isLocalHost(host) === true);
}

// ---- 公网地址：设门 ----
const PUBLIC_HOSTS = [
  'kanshan-archive-81255.app.workbuddy.host',
  'zukotzigbxp.sealoshzh.site',
  'zutu.meetmind.online',
  '1545468557.github.io',
  '8.8.8.8',
  '172.32.0.1',   // 私网段只到 172.31，172.32 是公网
  '192.169.0.1',  // 192.169 不在 192.168 段内
  'localhost.evil.com' // 看着像 localhost，其实不是
];
for (const host of PUBLIC_HOSTS) {
  check(`公网地址要设门：${host}`,
    buildSandbox({hostname: host, declared: true, forced: false}).isLocalHost(host) === false);
}

// ---- shouldGate：几条「不设门」的兜底 + 一条正常设门 + 访客出口 ----
// 第五个元素是「这一趟已经选了访客」，也就是入口档那个出口的开关。
const PUBLIC = 'kanshan-archive-81255.app.workbuddy.host';
const cases = [
  ['公网 + 已配置 + 未登录 + 页面声明了门 → 设门', {hostname: PUBLIC, declared: true, forced: false}, {enabled: true, loggedIn: false}, true],
  ['已经登录了 → 不设门', {hostname: PUBLIC, declared: true, forced: false}, {enabled: true, loggedIn: true}, false],
  ['服务端没配好凭证 → 不设门（否则没有任何办法能过这道门）', {hostname: PUBLIC, declared: true, forced: false}, {enabled: false, loggedIn: false}, false],
  ['拿不到登录状态（接口挂了/网络抖动）→ 不设门', {hostname: PUBLIC, declared: true, forced: false}, null, false],
  ['页面没声明门（预览页）→ 不设门', {hostname: PUBLIC, declared: false, forced: false}, {enabled: true, loggedIn: false}, false],
  ['页面没声明门，但地址上强制 ?zhihu_gate=1 → 设门（本地看门用的）', {hostname: PUBLIC, declared: false, forced: true}, {enabled: true, loggedIn: false}, true],
  ['本地地址 + 强制 ?zhihu_gate=1 → 设门（就是为了在本机看它）', {hostname: 'localhost', declared: true, forced: true}, {enabled: true, loggedIn: false}, true],
  ['本地地址 + 页面声明了门 → 不设门（开发者要能试玩）', {hostname: 'localhost', declared: true, forced: false}, {enabled: true, loggedIn: false}, false],
  ['状态里缺 enabled 字段 → 不设门', {hostname: PUBLIC, declared: true, forced: false}, {loggedIn: false}, false],

  // ---- 访客出口：点了「先以访客身份进入」之后，同一趟不再拦 ----
  ['公网 + 未登录 + 这一趟已经选了访客 → 不设门（用户拍板的那个出口）', {hostname: PUBLIC, declared: true, forced: false}, {enabled: true, loggedIn: false}, false, true],
  ['本地地址 + 已选访客 → 不设门', {hostname: 'localhost', declared: true, forced: false}, {enabled: true, loggedIn: false}, false, true],
  ['已经登录了 + 已选访客 → 不设门', {hostname: PUBLIC, declared: true, forced: false}, {enabled: true, loggedIn: true}, false, true],
  ['服务端没配好凭证 + 已选访客 → 不设门', {hostname: PUBLIC, declared: true, forced: false}, {enabled: false, loggedIn: false}, false, true],
  ['公网 + 强制 ?zhihu_gate=1 + 已选访客 → 仍然设门（这是专门来看门的，上次的记录不算数）', {hostname: PUBLIC, declared: true, forced: true}, {enabled: true, loggedIn: false}, true, true]
];
for (const [label, env, state, expected, skipped] of cases) {
  const sandbox = buildSandbox(env);
  // 第五个元素是「这一趟已经选了访客」这个开关。shouldGate 的第二个参数现在是对象，
  // 所以这里翻译一下 —— 不翻译会把 boolean 直接传进去，
  // `{skipped = false, strict = false} = {}` 拿到一个 boolean 也能跑，
  // 但 skipped 会恒为 undefined，那几条访客断言就全在测空气。
  const actual = sandbox.shouldGate(state, skipped ? {skipped: true} : {});
  check(`shouldGate：${label}`, actual === expected, `期望 ${expected}，实际 ${actual}`);
}

// ---- 现场档：具体游戏内容（第一幕…）不给访客留门（2026-09-14 用户拍板）----
//
// 这一档的全部意义是「访客这一趟在这里无效」。最容易写错的一行是
// `if (skipped) return false;` —— 一旦漏掉档位判断，在首页点一次访客
// 就等于把第一幕也一起免了，而且**看不出来**（门确实没了，谁也不会觉得奇怪）。
const strictCases = [
  ['现场档 + 未登录 → 设门', {hostname: PUBLIC, declared: true, forced: false}, {enabled: true, loggedIn: false}, true, {strict: true}],
  ['现场档 + **已选访客** → 仍然设门（否则首页点一次访客就把第一幕也免了）', {hostname: PUBLIC, declared: true, forced: false}, {enabled: true, loggedIn: false}, true, {skipped: true, strict: true}],
  ['现场档 + 强制 ?zhihu_gate=1 + 已选访客 → 仍然设门', {hostname: PUBLIC, declared: true, forced: true}, {enabled: true, loggedIn: false}, true, {skipped: true, strict: true}],
  ['现场档 + 已经登录 → 不设门', {hostname: PUBLIC, declared: true, forced: false}, {enabled: true, loggedIn: true}, false, {strict: true}],
  ['现场档 + 服务端没配好凭证 → 不设门（宁可漏，也不能把第一幕变成谁都进不去的砖）', {hostname: PUBLIC, declared: true, forced: false}, {enabled: false, loggedIn: false}, false, {strict: true}],
  ['现场档 + 拿不到登录状态 → 不设门', {hostname: PUBLIC, declared: true, forced: false}, null, false, {strict: true}],
  ['现场档 + 本地地址 → 不设门（开发者要能试玩第一幕）', {hostname: 'localhost', declared: true, forced: false}, {enabled: true, loggedIn: false}, false, {strict: true}],
  ['现场档 + 页面没声明门 → 不设门', {hostname: PUBLIC, declared: false, forced: false}, {enabled: true, loggedIn: false}, false, {strict: true}]
];
for (const [label, env, state, expected, options] of strictCases) {
  const sandbox = buildSandbox(env);
  const actual = sandbox.shouldGate(state, options);
  check(`shouldGate：${label}`, actual === expected, `期望 ${expected}，实际 ${actual}`);
}

// 负对照：**只有「已选访客」那一条**摘掉 strict 才会翻面 ——
// 因为档位唯一改变的就是「skipped 还算不算数」。其它几条（未登录、强制预览）
// 不靠 skipped 拦人，摘掉 strict 照样设门，拿它们做负对照等于在测空气。
// 所以这里只挑 skipped=true 且没开强制预览的那条。
for (const [label, env, state, , options] of strictCases.filter(row => row[4].skipped === true && row[1].forced === false)) {
  const sandbox = buildSandbox(env);
  const withoutStrict = sandbox.shouldGate(state, {skipped: true});
  check(`负对照：摘掉 strict 后入口档那条出口就生效了（证明拦住它的是档位）· ${label}`,
    withoutStrict === false, '摘掉 strict 后仍然设门 ⇒ 拦住它的不是档位，上面那条断言在测空气');
}

// ---- 访客记录本身：只记这一趟，而且存不下也不能把整页炸掉 ----
const guestKeyDecl = (source.match(/const GUEST_KEY = '([^']+)'/) || [])[1] || '';
check('源码里有访客记录的键名', guestKeyDecl.length > 0, guestKeyDecl);
check('访客记录的键名带 zhihu-gate 前缀（和别的存储不打架）', guestKeyDecl.startsWith('zhihu-gate-'));

function guestChosenWith(stored) {
  const context = {
    sessionStorage: {
      getItem: () => {
        if (stored === '__throw__') throw new Error('隐私模式下 sessionStorage 会抛异常');
        return stored;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(
    `const GUEST_KEY = ${JSON.stringify(guestKeyDecl)};
     ${guestChosenSource}
     globalThis.guestChosen = guestChosen;`,
    context
  );
  return context.guestChosen();
}

check('存过访客记录（"1"）→ 认得出来', guestChosenWith('1') === true);
check('没存过（null）→ 不认识', guestChosenWith(null) === false);
check('存了别的值（"0"）→ 不认识', guestChosenWith('0') === false);
check('sessionStorage 抛异常（隐私模式）→ 当作没选过，不抛出去', guestChosenWith('__throw__') === false);

check('访客记录存在 sessionStorage（换个标签页门还在，不是永久免登录）',
  source.includes('sessionStorage') && !source.includes('localStorage'));
check('点访客会记住这一趟', /function enterAsGuest\(\)[\s\S]*?rememberGuest\(\)/.test(source));
check('点访客会撤掉门', /function enterAsGuest\(\)[\s\S]*?dropGate\(\)/.test(source));
// 访客按钮**只有入口档才有** —— 所以代码必须是「有才挂」，不能假设它一定在。
check('门上的访客按钮真的挂上了点击',
  /const guest = el\.querySelector\('\.zhihu-gate-guest'\);\s*if \(guest\) guest\.addEventListener\('click', enterAsGuest\)/.test(source));
check('refresh 把「已选访客」和「是不是现场档」都传进了 shouldGate（只加参数不传＝白改）',
  /shouldGate\(\s*state\s*,\s*\{\s*skipped:\s*guestChosen\(\)\s*,\s*strict:\s*strictPage\s*\}\s*\)/.test(source));

// ---- 两种档位的门面文案：**现场档里不能有访客入口**（这次改动的核心）----
const entryCopy = (source.match(/entry:\s*\{[^}]*\}/) || [''])[0];
const lockedCopy = (source.match(/locked:\s*\{[^}]*\}/) || [''])[0];
check('源码里能取到入口档文案', entryCopy.length > 0, entryCopy);
check('源码里能取到现场档文案', lockedCopy.length > 0, lockedCopy);
check('入口档有访客入口的文案', /guest:/.test(entryCopy), entryCopy);
check('**现场档没有访客入口的文案**（删掉「先以访客身份进入」就在这里生效）', !/guest:/.test(lockedCopy), lockedCopy);
check('现场档留了「返回档案馆」这条退路（走不动就退回去，不是把人堵死）', /back:/.test(lockedCopy), lockedCopy);
check('返回档案馆指向站内（不能是外链）', /back:\s*'[^']*'/.test(lockedCopy) && /href="\.\/"/.test(source));

// ---- onMediaPlay：门开着时谁想播就按下去，并且**记下来**（撤门时好放回去）----
// 为什么要记：关卡页的序幕在门**出现之后**才开始播，不属于「门出现那一刻正在播的」那一批。
// 真实浏览器里房间自己也会重试播放（负对照实测过），所以这条是兜底 —— 但「凡是我按下去的、
// 撤门时都要放回去」这条规则本身必须成立，不能靠别人兜。
const onMediaPlaySource = extractFunction('onMediaPlay');
check('源码里能取到 onMediaPlay', onMediaPlaySource.length > 0);

function mediaGuard() {
  const context = {gateEl: {isConnected: true}};
  vm.createContext(context);
  vm.runInContext(
    `let pausedMedia = [];
     ${onMediaPlaySource}
     globalThis.onMediaPlay = onMediaPlay;
     globalThis.recorded = () => pausedMedia;
     globalThis.gate = () => gateEl;`,
    context
  );
  return context;
}

const fakeMedia = () => ({paused: false, pause() { this.paused = true; }});

{
  const sandbox = mediaGuard();
  const el = fakeMedia();
  sandbox.onMediaPlay({target: el});
  check('门开着时，想播的媒体被按下去', el.paused === true);
  check('而且被记下来了（撤门时要放回去）', sandbox.recorded().includes(el), `记了 ${sandbox.recorded().length} 个`);

  sandbox.onMediaPlay({target: el});
  check('同一个媒体不会被重复记两次', sandbox.recorded().length === 1, `记了 ${sandbox.recorded().length} 个`);
}

{
  const sandbox = mediaGuard();
  sandbox.gate().isConnected = false; // 门已经撤了
  const el = fakeMedia();
  sandbox.onMediaPlay({target: el});
  check('门不在时什么都不做（撤门后不该再按别人的播放）',
    el.paused === false && sandbox.recorded().length === 0,
    `paused=${el.paused} 记了 ${sandbox.recorded().length} 个`);
}

// ---- 门的层级必须在所有覆盖层之上（不写死数字，按现有 CSS 算出来）----
const gateCss = readPublic('zhihu-login.css');
const roomCss = readPublic('room-art.css');
const gateBlock = (gateCss.match(/\.zhihu-gate\{[^}]*\}/) || [''])[0];
const gateZ = Number((gateBlock.match(/z-index:(\d+)/) || [])[1]);
check('zhihu-login.css 里给 .zhihu-gate 定了 z-index', Number.isFinite(gateZ) && gateZ > 0);
const otherZ = [];
for (const css of [gateCss, roomCss]) {
  for (const match of css.matchAll(/z-index:(\d+)/g)) otherZ.push(Number(match[1]));
}
const maxOther = Math.max(...otherZ.filter(value => value !== gateZ), 0);
check(`门的 z-index(${gateZ}) 比其它覆盖层(${maxOther})高`,
  Number.isFinite(gateZ) && gateZ > maxOther);

// ---- 访客入口必须**看起来次一等**，否则它就成了第二个主按钮，门就不像门了 ----
const enterBlock = (gateCss.match(/\.zhihu-gate-enter\{[^}]*\}/) || [''])[0];
const guestBlock = (gateCss.match(/\.zhihu-gate-guest[^{]*\{[^}]*\}/) || [''])[0];
const backBlock = (gateCss.match(/\.zhihu-gate-back[^{]*\{[^}]*\}/) || [''])[0];
check('样式里有访客入口', guestBlock.length > 0);
check('样式里有现场档的「返回档案馆」', backBlock.length > 0, backBlock);
// 注意别写成 `guestBlock === backBlock`：两个正则的**起点不同**（一个从 `.zhihu-gate-guest` 起，
// 一个从 `.zhihu-gate-back` 起），同一个规则块取出来的字符串本来就不相等 ——
// 我第一版就是这么写的，于是断言失败、看起来像样式没共享。**断言失败时先怀疑断言。**
check('两者共用同一条规则（同一种「次一等」的外观，不各写一份）',
  guestBlock.includes('.zhihu-gate-guest') && guestBlock.includes('.zhihu-gate-back'), guestBlock);
const PRIMARY_BLUE = '#0084ff';
check('主按钮是蓝色实心', enterBlock.includes(PRIMARY_BLUE));
check('访客入口**不用**主按钮那个蓝（不是第二个主按钮）', !guestBlock.includes(PRIMARY_BLUE));
const fontSizeOf = block => Number((block.match(/font-size:([\d.]+)px/) || [])[1]);
check(`访客入口字号(${fontSizeOf(guestBlock)})比主按钮(${fontSizeOf(enterBlock)})小`,
  fontSizeOf(guestBlock) < fontSizeOf(enterBlock));
check('访客入口没有实心底色',
  /background:none|background:transparent/.test(guestBlock), guestBlock);

// ---- 哪些页面设门：首页与关卡页设，预览页不设 ----
const home = readPublic('index.html');
const room = readPublic('room.html');
const preview = readPublic('home-preview.html');
const scriptTagOf = html => (html.match(/<script[^>]*zhihu-login\.js[^>]*>\s*<\/script>/) || [''])[0];
const versionOf = html => ((scriptTagOf(html).match(/zhihu-login\.js\?v=([^"'&]+)/) || [])[1] || '');

check('首页的登录脚本挂了 data-gate="1"（入口档：可以以访客身份进）', scriptTagOf(home).includes('data-gate="1"'), scriptTagOf(home));
check('关卡页的登录脚本挂了 data-gate="locked"（现场档：不给访客留门）', scriptTagOf(room).includes('data-gate="locked"'), scriptTagOf(room));
check('预览页**不**挂门（挂了本地就没法看特效了）', !scriptTagOf(preview).includes('data-gate'), scriptTagOf(preview));
check('三个页面都带了破缓存的版本号',
  [home, room, preview].every(html => versionOf(html).length > 0),
  [versionOf(home), versionOf(room), versionOf(preview)].join(' / '));
check('首页与关卡页引用的版本号一致（只改一边＝另一个页面还是旧缓存）',
  versionOf(home) === versionOf(room), `${versionOf(home)} vs ${versionOf(room)}`);

// 样式文件的版本号也要跟着动，否则老访客拿不到门的新样式
const cssTagOf = html => (html.match(/<link[^>]*zhihu-login\.css[^>]*>/) || [''])[0];
check('三个页面都引用了登录样式且带版本号',
  [home, room, preview].every(html => /\?v=[^"']+/.test(cssTagOf(html))),
  [cssTagOf(home), cssTagOf(room), cssTagOf(preview)].join(' | '));

console.log(`登录门：${passed} 项通过${failures.length ? `，${failures.length} 项失败` : ''}（两档：入口档可访客 / 现场档必须登记；公网设门、本地不设门、拿不到状态不设门、访客只记这一趟）。未联网。`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exitCode = failures.length ? 1 : 0;
