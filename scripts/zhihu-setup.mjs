#!/usr/bin/env node
// 知乎 OAuth 凭证填入工具
//
// 为什么要有这个脚本：App ID / App Key 是两串很长的字符，手工粘进 .env.local 容易
// 多带空格、多带引号、或者粘错行；粘错了不会报错，只会表现为「登录按钮不出现」——
// 一路零提示，最费时间。这个脚本负责校验 + 写入 + 回读核对。
//
// 用法（交互式，推荐）：
//     node scripts/zhihu-setup.mjs
// 用法（非交互，方便脚本化）：
//     node scripts/zhihu-setup.mjs --app-id=xxx --app-key=yyy
// 指定回调地址（**必须是活动页登记的那一条，未必是我们自己的域名**）：
//     node scripts/zhihu-setup.mjs --app-id=xxx --app-key=yyy --redirect-uri=https://... --yes
// 只预览不写入：
//     node scripts/zhihu-setup.mjs --app-id=xxx --app-key=yyy --dry-run
//
// 关于回调地址：官方文档（hackathon-oauth.md）写明黑客松项目「使用赛事页面登记的回调地址」，
// 且换 token 的表单里也要带上同一个值 —— 授权与换 token 必须一字不差地用同一条。
// 所以这个脚本只校验「是不是一个合法网址」，不会替你判断该用哪一条：那是活动页面说了算。
//
// 凭证只写进 .env.local（已被 .gitignore 排除，永不进仓库），不会打印完整值。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
// 回调路径**不要在脚本里再抄一份**：抄一份就会和服务端各说各话，
// 而我们恰恰在最容易出事的地方（回调对不上）需要两边完全一致。
import { CALLBACK_PATH, CALLBACK_PATH_ALIASES } from '../lib/zhihu-oauth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 线上正式域名（活动页登记回调地址时必须一字不差地填这一条）
const PRODUCTION_ORIGIN = 'https://kanshan-archive-81255.app.workbuddy.host';

const args = new Map(
  process.argv.slice(2).map(a => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? ''] : [a, ''];
  })
);
const DRY_RUN = args.has('dry-run');
const ENV_PATH = path.resolve(ROOT, args.get('file') || '.env.local');

function fingerprint(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 8);
}

// 只显示「配没配 / 多长 / 指纹前缀」，绝不回显内容本身。
function describe(value) {
  if (!value) return '（空）';
  return `${value.length} 个字符，指纹 ${fingerprint(value)}`;
}

// 用户常从网页复制，会带上换行、空格、引号；一律去掉，并检查有没有肉眼看不见的字符。
function clean(raw) {
  let v = String(raw ?? '').trim();
  v = v.replace(/^["'`]+|["'`]+$/g, '').trim();
  const invisible = [...v].filter(ch => /[\u0000-\u001f\u007f\u200b-\u200f\ufeff]/.test(ch));
  return { value: v, invisible: invisible.length };
}

// ---------------------------------------------------------------- 读一行输入
// 自己缓冲 stdin，而不是每次提问 new 一个 readline：
// 每次新建 readline 会抢走剩下的缓冲，第二次提问就再也收不到数据；
// 而管道结束（EOF / Ctrl-D）时 readline 的 question 回调根本不会触发 —— 直接卡死。
// 对一个「第一次用的人会照着粘」的脚本来说，卡死是最糟的失败方式，所以自己管。
let lineBuffer = '';
let lineWaiter = null;
let inputEnded = false;

function deliverLine() {
  if (!lineWaiter) return;
  const at = lineBuffer.indexOf('\n');
  if (at < 0) {
    if (inputEnded) {
      const wait = lineWaiter;
      lineWaiter = null;
      wait(lineBuffer.length ? lineBuffer : null);   // 最后一行没有换行符也要交付
    }
    return;
  }
  const line = lineBuffer.slice(0, at).replace(/\r$/, '');
  lineBuffer = lineBuffer.slice(at + 1);
  const wait = lineWaiter;
  lineWaiter = null;
  wait(line);
}

// 这个监听器全程挂着；askHidden 会在 raw 模式期间暂时摘掉它。
const onStdinData = chunk => { lineBuffer += chunk.toString('utf8'); deliverLine(); };
process.stdin.on('data', onStdinData);
process.stdin.on('end', () => { inputEnded = true; deliverLine(); });

function nextLine() {
  return new Promise(resolve => { lineWaiter = resolve; deliverLine(); });
}

async function askVisible(question, fallback = '') {
  process.stdout.write(fallback ? `${question}（直接回车用 ${fallback}）` : `${question}`);
  process.stdin.resume();
  const line = await nextLine();
  return (line === null || line === '') ? fallback : line;
}

// App Key 输入时不回显：它是密钥，别留在终端历史和录屏里。
// 非终端输入（管道、CI）没有 raw 模式可用，退回普通读取并说明会回显 ——
// 否则 setRawMode 在现代 Node 上会直接抛错。
function askHidden(question) {
  if (!process.stdin.isTTY) {
    console.log('（当前不是终端输入，这一项会回显）');
    return askVisible(question);
  }
  return new Promise(resolve => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.removeListener('data', onStdinData);
    stdin.setRawMode(true);
    stdin.resume();
    let buffer = '';
    const finish = value => {
      stdin.setRawMode(false);
      stdin.removeListener('data', onData);
      stdin.pause();
      stdin.on('data', onStdinData);
      process.stdout.write('\n');
      resolve(value);
    };
    const onData = chunk => {
      // raw 模式下一次按键一个 chunk，逐字符处理（粘贴进来的是多个字符）
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') return finish(buffer);
        if (ch === '\u0003') {                    // Ctrl-C
          stdin.setRawMode(false);
          process.stdout.write('\n已取消，什么都没写入。\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') { buffer = buffer.slice(0, -1); continue; }
        buffer += ch;
      }
    };
    stdin.on('data', onData);
  });
}

// 把 .env.local 拆成行，按 key 就地替换，不认识的注释和空行原样保留。
function readEnvFile(file) {
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').split('\n');
  // 文件还不存在时，拿 .env.example 当骨架，但**先不落盘**。
  // 文件只在「通过全部校验、确定要写入」那一步才被创建 ——
  // 否则一次填错的运行会留下一个空壳文件，让人以为已经配好了。
  const example = path.join(ROOT, '.env.example');
  return fs.existsSync(example) ? fs.readFileSync(example, 'utf8').split('\n') : [];
}

function currentValue(lines, key) {
  const prefix = key + '=';
  const line = lines.find(l => l.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

// 已经存在的键就地改值；缺的键**作为一个整块**插进「知乎直答」小节之前。
// 不能一个键一次插入 —— 那样每插一次都会多带一个空行。
function writeZhihuSection(lines, entries) {
  const missing = [];
  let updated = false;
  for (const [key, value] of entries) {
    const index = lines.findIndex(l => l.startsWith(key + '='));
    if (index >= 0) { lines[index] = key + '=' + value; updated = true; }
    else missing.push([key, value]);
  }
  if (!missing.length) return lines;

  const block = [];
  if (!lines.some(l => l.includes('===== 知乎 OAuth'))) {
    block.push('# ===== 知乎 OAuth 登录（活动页「创建项目」后分配）=====');
    block.push('# App ID 是公开配置；App Key 是密钥，不进仓库、前端、截图或演示视频。');
    block.push('# 两个都填齐，首页右上角才会出现「用知乎账号登录」；缺一个整个入口不显示。');
  }
  for (const [key, value] of missing) block.push(key + '=' + value);

  const anchor = lines.findIndex(l => l.includes('===== 知乎直答'));
  if (anchor >= 0) {
    const head = lines.slice(0, anchor);
    const tail = lines.slice(anchor);
    if (head.length && head[head.length - 1].trim() !== '') head.push('');
    return [...head, ...block, '', ...tail];
  }
  const out = lines.slice();
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return [...out, '', ...block, ''];
}

async function main() {
  console.log('\n知乎 OAuth 凭证填入\n' + '─'.repeat(46));
  if (DRY_RUN) console.log('（预览模式：只显示会写入什么，不改文件）');
  console.log(`配置文件：${ENV_PATH}\n`);

  let lines = readEnvFile(ENV_PATH);

  const existingId = currentValue(lines, 'ZHIHU_OAUTH_APP_ID');
  const existingKey = currentValue(lines, 'ZHIHU_OAUTH_APP_KEY');
  const existingRedirect = currentValue(lines, 'ZHIHU_OAUTH_REDIRECT_URI');
  const fallbackRedirect = existingRedirect || `${PRODUCTION_ORIGIN}${CALLBACK_PATH}`;

  const hasArgs = args.has('app-id');
  let rawId = hasArgs ? args.get('app-id') : '';
  let rawKey = args.get('app-key') || '';
  let rawRedirect = args.get('redirect-uri') || '';

  if (!hasArgs) {
    if (existingId) console.log(`当前 App ID：${describe(existingId)}（直接回车保留）`);
    console.log('App ID 在活动页「创建项目」之后由官方分配。\n');
    rawId = await askVisible('App ID：', existingId);

    console.log(existingKey
      ? `\n当前 App Key：${describe(existingKey)}（直接回车保留）`
      : '\nApp Key 请粘贴（输入时不显示字符，这是正常的）：');
    rawKey = await askHidden('App Key：');

    console.log('\n回调地址：必须用**活动页登记的那一条**，一字不差。');
    console.log('官方文档写明黑客松项目「使用赛事页面登记的回调地址」，换 token 时也要带同一个值。');
    rawRedirect = await askVisible('\n回调地址：', fallbackRedirect);
  }

  const id = clean(rawId);
  const key = clean(rawKey);

  // 「直接回车保留」必须真的保留 —— 早先这里只是在屏幕上承诺，实际会把空值当成缺失然后退出。
  if (!key.value && existingKey) key.value = existingKey;

  if (!id.value && !key.value) {
    console.log('\n两个都没填，什么都没写入。拿到凭证后再跑一次这个脚本。');
    process.exit(0);
  }
  if (!id.value) { console.log('\n缺少 App ID，什么都没写入。'); process.exit(1); }
  if (!key.value) { console.log('\n缺少 App Key，什么都没写入。'); process.exit(1); }
  if (id.invisible || key.invisible) {
    console.log('\n⚠️ 检测到肉眼看不见的控制字符（多半是从网页复制带上的），已剔除。');
  }

  // 回调地址：默认写死线上正式域名。留空的话代码会按「当前访问的域名」临时推导，
  // 平时没问题，但域名一换就和活动页登记的地址对不上——那种错会静默失败，很难查。
  const redirect = clean(rawRedirect).value || `${PRODUCTION_ORIGIN}${CALLBACK_PATH}`;
  if (!/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(redirect)) {
    console.log(`\n回调地址不是一个合法的网址：${redirect}\n什么都没写入。`);
    process.exit(1);
  }

  // 官方文档（hackathon-oauth.md）写得很明确：
  //   黑客松项目「使用赛事页面登记的回调地址」，而且换 token 的表单里也要带同一个值。
  // 所以这个地址只受一条约束 —— 跟活动页登记的那一条一字不差。
  // ⚠️ 它**未必**是我们自己的域名：平台完全可能登记它自己的地址来做登录计数
  //    （比赛要求把登录人数算进人气奖，平台必须在中途看到这次登录）。
  // 早先这个脚本硬性要求结尾必须是 /api/auth/zhihu/callback，那是个错误的假设，已去掉。
  if (!redirect.startsWith(PRODUCTION_ORIGIN)) {
    console.log('\n⚠️ 这个回调地址不是我们自己的域名。三种情况：');
    console.log('   ① 活动页登记的就是它 → 那它是对的，不能用我们自己的地址替代（否则知乎会拒绝或送错地方）');
    console.log('   ② 活动页那一栏其实叫「项目地址」而不是「回调地址」→ 填进去会让登录永远完不成');
    console.log('   ③ 活动页另有一栏「回调地址」还没填 → 回去补上那一条');
    console.log(`   我们自己的地址是：${PRODUCTION_ORIGIN}${CALLBACK_PATH}`);
    if (!args.has('yes') && !DRY_RUN && process.stdin.isTTY) {
      const answer = await askVisible('   确认这是活动页登记的回调地址吗？(y/N)：');
      if (!/^y(es)?$/i.test(answer.trim())) { console.log('已取消，什么都没写入。'); process.exit(0); }
    }
  }

  // 只有「路径」可能对不上；服务端已经在下面这几条路径上都会应答，
  // 所以真正需要你填对的是**活动页显示的那一串原文**，路径不必改成我们喜欢的形状。
  console.log('\n服务端接受的回调路径（活动页登记的那条只要落在这里面，登录就能跳回来）：');
  for (const p of CALLBACK_PATH_ALIASES) console.log(`  ${PRODUCTION_ORIGIN}${p}`);

  lines = writeZhihuSection(lines, [
    ['ZHIHU_OAUTH_APP_ID', id.value],
    ['ZHIHU_OAUTH_APP_KEY', key.value],
    ['ZHIHU_OAUTH_REDIRECT_URI', redirect]
  ]);

  console.log('\n将要写入：');
  console.log(`  App ID       ${describe(id.value)}`);
  console.log(`  App Key      ${describe(key.value)}`);
  console.log(`  回调地址     ${redirect}`);

  if (DRY_RUN) {
    console.log('\n（预览模式，未写入任何文件）');
    return;
  }

  fs.writeFileSync(ENV_PATH, lines.join('\n'));

  // 回读核对：确认真的写进去了，而不是「以为写进去了」。
  const check = readEnvFile(ENV_PATH);
  const okId = currentValue(check, 'ZHIHU_OAUTH_APP_ID') === id.value;
  const okKey = currentValue(check, 'ZHIHU_OAUTH_APP_KEY') === key.value;
  const okRedirect = currentValue(check, 'ZHIHU_OAUTH_REDIRECT_URI') === redirect;
  console.log(`\n回读核对：App ID ${okId ? '✓' : '✗'}  App Key ${okKey ? '✓' : '✗'}  回调地址 ${okRedirect ? '✓' : '✗'}`);
  if (!(okId && okKey && okRedirect)) {
    console.log('写入后回读不一致，请把上面这行告诉助手。');
    process.exit(1);
  }

  console.log('\n' + '─'.repeat(46));
  console.log('接下来两件事：');
  console.log('\n1) 去活动页「创建项目」的登记处，把回调地址填成（一字不差）：');
  console.log(`   ${redirect}`);
  console.log('\n2) 重启服务让配置生效（server.mjs 是启动时读一次配置的）：');
  console.log('   node server.mjs');
  console.log('   然后打开 http://127.0.0.1:4180/api/health');
  console.log('   看到 zhihuOAuth 不是「未配置」，就说明生效了。\n');
}

// 收尾时必须放开 stdin：那个常驻的 'data' 监听器会让 Node 一直等着输入，
// 于是脚本打印完所有内容却不退出 —— 在终端里表现为「光标不回来」。
function stopStdin() {
  process.stdin.removeListener('data', onStdinData);
  process.stdin.pause();
  if (typeof process.stdin.unref === 'function') process.stdin.unref();
}

main()
  .then(stopStdin)
  .catch(error => {
    console.error('\n出错了：', error.message);
    stopStdin();
    process.exitCode = 1;
  });
