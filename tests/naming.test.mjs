// 产品口径两条：① 作品名 =「故事档案馆」，《蓝血》只是第一章的名字；
// ② 界面上不写我们自己的处境（参赛 / 比赛 / 黑客松 / 人气）—— 见文件下半部分。
//
// 为什么要专门测这个：这类问题**页面照常打开**，肉眼扫一遍也看不出来，
// 但代价会累积 —— 作品名一旦被钉在某一章上，每加一章都要回来改一遍，
// 而且极容易漏（本次就漏了 room.html / admin.html 的标题和 admin 的抬头）。
// 所以把口径钉成断言：外层页面用作品名，关卡页写成「第 N 章」，标题结构是「章名｜作品名」。
//
// 关于「读源码算不算数」：上半部分只断言 <title>、页脚、抬头这类**静态标记**，不是文案正文。
// 下半部分要扫 js 源码，所以**先把注释剥掉再扫**（stripComments）—— 那正是为了避开
// 「grep 命中我自己写的注释」这个陷阱：zhihu-login.js 顶部的规矩注释里原样引用了被否掉的旧文案，
// 直接 includes 会得到**假红**。
// 反过来，「第一幕」这个词**允许**留在 menu.js 的注释里（那里在引用被删掉的旧文案，
// 属于历史记录），因此上半部分只扫三个 html，不扫 js。
// 2026-09-14 补充：上半部分扫 html 时**也要先剥掉 `<!-- -->` 注释**（stripHtmlComments）——
// 同一天 index.html 里那条解释「两档登录门」的注释写了「第一幕现场」，就把这条断言带红了。
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = name => readFileSync(join(root, 'public', name), 'utf8');
const titleOf = html => (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';

let passed = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ' — ' + detail : ''}`);
}

// ⚠️ 以后要改名，只改下面这两行。
const PRODUCT = '故事档案馆';
const CHAPTER_ONE = '蓝血';

const home = read('index.html');
const room = read('room.html');
const admin = read('admin.html');

// ⚠️ HTML 注释必须先剥掉。这里踩过一次（2026-09-14）：index.html 里那条解释「两档登录门」的
// 注释写了「第一幕现场 room.html」，而下面「没有把章节说成第一幕」是打在**原始 HTML** 上的，
// 于是命中的是我自己的注释 —— 注释不是玩家看得见的东西，判红的理由不成立。
// 与下半部分 stripComments 的哲学一致：**注释恰恰是记录「为什么不能这么写」的地方**。
const stripHtmlComments = html => html.replace(/<!--[\s\S]*?-->/g, '');
const homeText = stripHtmlComments(home);
const roomText = stripHtmlComments(room);
const adminText = stripHtmlComments(admin);

// ---- 外层（首页）只用作品名，不带任何章节名 ----
check('首页标题用的是作品名', titleOf(home).includes(PRODUCT), titleOf(home));
check('首页标题里不出现章节名（否则每加一章都得回来改首页）',
  !titleOf(home).includes(CHAPTER_ONE), titleOf(home));
check('首页页脚保留作品名', homeText.includes(`<footer><span>观察 · 追问 · 还原</span><span>${PRODUCT}</span></footer>`));
check('首页不再自称「界面原型」（它是真能玩的）', !homeText.includes('原型'));

// ---- 关卡页：章节名在前、作品名在后 ----
check(`关卡页标题是「第一章 · ${CHAPTER_ONE}｜${PRODUCT}」`,
  titleOf(room) === `第一章 · ${CHAPTER_ONE}｜${PRODUCT}`, titleOf(room));
check('关卡页抬头写的是「第一章」', roomText.includes('<span>第一章 · 旧公寓</span>'), titleOf(room));

// ---- 三个会上线的页面都不再用「幕」这种层级词，也没有旧的章节名 ----
// （扫的是剥掉注释之后的正文，见上面 stripHtmlComments 的说明。）
for (const [name, html] of [['index.html', homeText], ['room.html', roomText], ['admin.html', adminText]]) {
  check(`${name} 没有把章节说成「第一幕」`, !html.includes('第一幕'));
  check(`${name} 没有旧的章节名「谁在替空房敲门」`, !html.includes('谁在替空房敲门'));
}

// ---- 产品口径二：界面上不写我们自己的处境（参赛 / 比赛 / 黑客松 / 人气）----
//
// 为什么专门守这个：2026-09-14 用户两次否掉这类话 ——
// 先是按钮上的「登录后可计入人气」，后是登录门上那整段自我介绍。
// 他的原话：「登录就登录，那么多话干嘛，还参赛作品，非要把心思说出来干嘛，
// 要是获奖了，上线到全国了，我是不是还是应该跟全国的用户说这是个参赛作品？」
// 判据：**文案要在作品自己的世界里成立，并且要能活过这次比赛。**
//
// ⚠️ 扫之前必须先把注释去掉：`zhihu-login.js` 顶部的规矩注释里**原样引用**了这些词
// （「帮我们计入人气」「参赛作品」），直接 includes 会命中我自己的注释、不命中真相 ——
// 这个陷阱本项目踩过一次（见 skill threejs-cdp-visual-debug）。
function stripComments(source) {
  let out = '';
  let quote = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += next || '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = '';
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

// 只扫真正会被玩家加载的产品脚本。`app.js` / `legacy-demo.html` 是没人加载的旧原型，
// 那里的「黑客松」是**故事背景**（那个 demo 讲的本来就是一场黑客松），不在此列。
// 注释里出现这些词是允许的 —— 那正是记录「为什么不能这么写」的地方。
// （2026-09-14：新加的 handheld.js 也是玩家会加载的产品脚本，一并纳入。）
const VOICE_WORDS = ['参赛', '比赛', '黑客松', '人气'];
for (const name of ['menu.js', 'zhihu-login.js', 'handheld.js']) {
  const code = stripComments(read(name));
  const hits = VOICE_WORDS.filter(word => code.includes(word));
  check(`${name} 不把作品说成阶段性产物（代码里不该出现 ${VOICE_WORDS.join(' / ')}）`,
    hits.length === 0, hits.join(' / '));
}

console.log(`命名口径：${passed} 项通过${failures.length ? `，${failures.length} 项失败` : ''}。改名请只改本文件顶部的 PRODUCT / CHAPTER_ONE；产品语气（不写自己的处境）见下半个文件的 VOICE_WORDS。`);
for (const f of failures) console.log(`  ✗ ${f}`);
process.exitCode = failures.length ? 1 : 0;
