// 自己读键盘，一行一行地读。
//
// 为什么不用 node:readline：
//   1. 它在创建的那一刻就抓住标准输入。非交互模式下会把 --key-stdin 的内容提前吃掉，
//      导致「明明传了密钥却报没有拿到」。
//   2. 它没法可靠地关闭密钥回显。实测在伪终端下，覆盖 _writeToOutput 之后
//      输入仍然明文出现在屏幕上 —— 而密钥露在屏幕上就可能被人截图。
// 这点代码换来两个确定的结果：密钥一定不显示；交互与非交互走同一条路径。

const DEFAULT_TIMEOUT_MS = 150000;

const state = {
  editing: '',        // 正在输入的这一行
  finished: [],       // 已经按过回车、还没被取走的行
  waiter: null,       // 正在等待输入的那个 Promise
  secret: false,      // 要不要把字符画成点
  echo: false,        // 要不要把字符显示出来（非交互模式以下都不显示）
  lastWasCR: false,   // 处理 \r\n，避免算成两次回车
  timer: null,
  attached: false,
  rawBefore: null,
  escaping: false
};

const write = text => process.stdout.write(text);

function restoreTerminal() {
  if (!state.attached || !process.stdin.isTTY) return;
  try {
    process.stdin.setRawMode(Boolean(state.rawBefore));
  } catch {}
}

function clearTimer() {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
}

// 有人排队等着，就给他一行。
function settle() {
  if (!state.waiter || !state.finished.length) return;
  const resolve = state.waiter;
  state.waiter = null;
  clearTimer();
  resolve(state.finished.shift().trim());
}

function pushLine() {
  state.finished.push(state.editing);
  state.editing = '';
  settle();
}

function abortByUser() {
  write('\n');
  console.log('已取消，什么都没有改。');
  restoreTerminal();
  process.exit(130);
}

function onData(chunk) {
  for (const ch of chunk.toString('utf8')) {
    if (ch === '\r' || ch === '\n') {
      // 收到 \r\n 时只当成一次回车
      if (ch === '\n' && state.lastWasCR) {
        state.lastWasCR = false;
        continue;
      }
      state.lastWasCR = ch === '\r';
      if (state.echo) write('\n');
      pushLine();
      continue;
    }
    state.lastWasCR = false;

    if (ch === '\u0003') return abortByUser();          // Ctrl-C
    if (ch === '\u0004') {                              // Ctrl-D：当作输入结束
      if (state.echo) write('\n');
      pushLine();
      continue;
    }
    if (ch === '\u007f' || ch === '\b') {               // 退格
      if (state.editing) {
        state.editing = state.editing.slice(0, -1);
        if (state.echo) write('\b \b');
      }
      continue;
    }
    if (ch === '\u001b') {                              // 方向键等转义序列，整段丢掉
      state.escaping = true;
      continue;
    }
    if (state.escaping) {
      if (/[A-Za-z~]/.test(ch)) state.escaping = false;
      continue;
    }
    if (ch.codePointAt(0) < 0x20) continue;             // 其余控制字符丢掉

    state.editing += ch;
    if (state.echo) write(state.secret ? '•' : ch);
  }
}

function attach() {
  if (state.attached) return;
  state.attached = true;
  const stdin = process.stdin;

  if (stdin.isTTY) {
    state.rawBefore = Boolean(stdin.isRaw);
    // 关掉终端自己的回显和行缓冲，改由我们决定显示什么
    try {
      stdin.setRawMode(true);
    } catch {}
  }
  stdin.resume();
  stdin.on('data', onData);
  // 管道输入读完就结束了，这时候要把它当成「输入了一行」，否则会一直等下去
  stdin.on('end', () => { if (state.waiter) pushLine(); });
  process.on('exit', restoreTerminal);
}

/**
 * 读一行。
 * @param {object} options
 * @param {string} options.prompt  显示在输入位置前面的提示语
 * @param {boolean} options.secret 输入内容是否画成点（密钥用）
 * @param {boolean} options.echo   是否回显（非交互模式传 false，屏幕上一片安静）
 */
export function readLine({prompt = '', secret = false, echo = true, timeoutMs = DEFAULT_TIMEOUT_MS} = {}) {
  attach();
  if (echo && prompt) write(prompt);
  state.secret = secret;
  state.echo = echo;

  return new Promise(resolve => {
    state.waiter = resolve;
    settle();                       // 也许已经排队等着了（比如一次粘贴了两行）

    if (state.waiter) {
      state.timer = setTimeout(() => {
        write('\n');
        console.log('  等了很久没有收到输入。');
        console.log('  请打开一个真正的「终端」窗口，切到项目目录再运行  npm run setup  。');
        console.log('  （在编辑器里点「运行」按钮通常是收不到键盘输入的。）');
        console.log();
        restoreTerminal();
        process.exit(1);
      }, timeoutMs);
    }
  });
}
