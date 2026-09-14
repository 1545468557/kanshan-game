// 手机上不许任何视频自己播（2026-09-14 用户在微信里点登录、被一个 5 秒视频盖住之后加的守卫）。
//
// 症状回顾：微信/安卓的浏览器内核会把页面里的 <video> 接管成自己的全屏播放器（X5「视频全屏化」），
// 首页那段背景循环视频正好 5 秒 —— 用户点「用知乎账号登录」，看到的就是它，授权页根本没机会出现。
// 触发它的那根线在 menu.js：因为手机常拦自动播放，所以写了「用户第一次点屏幕/按键时再补一次 play()」，
// 于是**任意一次触屏**（包括点登录按钮）都可能把视频叫起来。
//
// 三条口径，全部打在**结构**上（属性、顺序），不去匹配文案：
//   ① 两个 <video> 都带齐「同层播放」属性（playsinline / webkit-playsinline / x5-playsinline /
//      x5-video-player-type="h5"），而且**都没有 controls**（controls 等于给用户一个「点开播放器」的入口）；
//   ② 首页背景视频的**源不在 HTML 里**（只有 data-src）⇒ 手机端一个字节都不请求那 1 MB；
//   ③ menu.js 的手机分支必须**排在挂 pointerdown/keydown 之前**，而且里面要 return。
//      ——第 ③ 条是这次的核心：顺序反了，手机上一按屏幕照样会把视频叫起来，别的断言还都是绿的。
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = name => readFileSync(join(root, 'public', name), 'utf8');

let passed = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ' — ' + detail : ''}`);
}

// 从 html 里抠出某个元素的开标签（不解析整棵树，够用且不依赖 DOM）。
function tagOf(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) return '';
  const end = html.indexOf('>', start);
  return end < 0 ? '' : html.slice(start, end + 1);
}

const home = read('index.html');
const room = read('room.html');
const menu = read('menu.js');
const handheld = read('handheld.js');

// ---- 判定写在一处，两个页面都得在「会碰视频的脚本」之前加载它 ----
check('handheld.js 存在并导出 window.isHandheld', /window\.isHandheld\s*=/.test(handheld));
check('handheld.js 认得微信内置浏览器（MicroMessenger）', /micromessenger/i.test(handheld));
check('handheld.js 把判定写在 <html> 上（CSS 与验收脚本都能直接读）', /dataset\.handheld/.test(handheld));

const homeHandheld = home.indexOf('src="./handheld.js');
const homeMenu = home.indexOf('src="./menu.js');
check('首页在 menu.js **之前**加载 handheld.js（否则判定还没写好就要用它）',
  homeHandheld > 0 && homeMenu > 0 && homeHandheld < homeMenu, `handheld@${homeHandheld} menu@${homeMenu}`);

const roomHandheld = room.indexOf('src="./handheld.js');
// 比的是**加载顺序**：handheld.js 与「起播序幕」那段脚本谁先跑。
// （第一版拿它跟 <video> 元素的位置比 —— 元素在 body、脚本在后面，那样比是错的：
//   视频元素先出现完全没问题，我们要求的是「起播它的那段脚本」跑之前判定已经就绪。）
const roomStart = room.indexOf('function startOpeningCg');
check('房间在「起播序幕」的那段脚本之前加载 handheld.js',
  roomHandheld > 0 && roomStart > 0 && roomHandheld < roomStart,
  `handheld@${roomHandheld} 起播脚本@${roomStart}`);

// ---- ① 两个视频都带齐同层播放属性、并且都没有 controls ----
const INLINE_ATTRS = ['playsinline', 'webkit-playsinline', 'x5-playsinline', 'x5-video-player-type="h5"'];

const worldTag = tagOf(home, '<video class="world-video"');
check('首页背景视频元素找得到（找不到的话下面几条会假绿）', worldTag.length > 0, worldTag || '(没找到)');
for (const attr of INLINE_ATTRS) {
  check(`首页背景视频带 ${attr}（防内核把它全屏接管）`, worldTag.includes(attr));
}
check('首页背景视频没有 controls（有 controls 就等于给用户一个点开播放器的入口）', !worldTag.includes('controls'));
check('首页背景视频是静音 + 循环（桌面自动播的前提）', worldTag.includes('muted') && worldTag.includes('loop'));

const cgTag = tagOf(room, '<video id="opening-cg-video"');
check('房间序幕视频元素找得到', cgTag.length > 0, cgTag || '(没找到)');
for (const attr of INLINE_ATTRS) {
  check(`房间序幕视频带 ${attr}`, cgTag.includes(attr));
}
check('房间序幕视频没有 controls', !cgTag.includes('controls'));

// ---- ② 首页背景视频的源不在 HTML 里 ----
check('首页背景视频的源不在 HTML 里（只有 data-src）⇒ 手机端根本不会请求这 1 MB',
  worldTag.includes('data-src=') && !worldTag.includes('<source'), worldTag || '(没找到)');
check('menu.js 在桌面端才把 source 注入进去', /createElement\('source'\)/.test(menu) && /video\.dataset\.src/.test(menu));

// ---- ③ 顺序：手机分支必须排在挂 pointerdown/keydown 之前 ----
const guardAt = menu.indexOf('window.isHandheld');
const pointerAt = menu.indexOf("addEventListener('pointerdown'");
check('menu.js 里有手机分支，并且**排在挂 pointerdown 之前**（顺序反了：手机上一按屏幕照样会播）',
  guardAt > 0 && pointerAt > 0 && guardAt < pointerAt, `判定@${guardAt} 挂监听@${pointerAt}`);
check('手机分支里真的 return 了（不是只加了个记号还往下走）',
  guardAt > 0 && /data-skipped[\s\S]{0,120}?return;/.test(menu));

// ---- 房间：手机端序幕改成「点一下再播」 ----
const roomGuardAt = room.indexOf('window.isHandheld');
check('房间的序幕起播处有手机分支', roomGuardAt > 0);
check('手机分支走的是「点击播放」那条现成的路（不是另写一套）',
  roomGuardAt > 0 && /isHandheld\(\)\)\s*\{[\s\S]{0,160}?showOpeningCgPlayButton\(\)/.test(room));
check('桌面仍然自动播（自动播那条路没被删掉）', /else if\s*\(openingCgActive\)\s*startOpeningCg\(\)/.test(room));

console.log(`手机视频口径：${passed} 项通过${failures.length ? `，${failures.length} 项失败` : ''}。`
  + '（口径：手机上不自动播任何视频 —— 首页背景不加载、房间序幕点一下再播；桌面不变。）');
for (const f of failures) console.log(`  ✗ ${f}`);
process.exitCode = failures.length ? 1 : 0;
