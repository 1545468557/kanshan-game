// 从 macOS 钥匙串里取出知乎 Access Secret。
//
// 知乎官方 zhihu-cli 在 2026-09-10 已经把这串密钥存进钥匙串并通过在线鉴权，
// 所以它本来就躺在这台机器上。这里只是把它读出来用在我们的服务端，
// 不写进任何文件、不打印、不回传前端。
//
// 读不到就返回空字符串，绝不让它成为启动的阻塞项。

import {execFileSync} from 'node:child_process';

const SERVICE = 'zhihu-cli';
const ACCOUNT = 'access-secret';

let cached;

export function readZhihuSecretFromKeychain() {
  if (cached !== undefined) return cached;
  if (process.platform !== 'darwin') {
    cached = '';
    return cached;
  }
  try {
    cached = execFileSync('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'], {
      encoding: 'utf8',
      // stderr 丢掉：找不到条目时 security 会往 stderr 写一大段，没必要让用户看到
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    cached = '';
  }
  return cached;
}

// 给日志和自检用：只说「有没有」，绝不说值。
export function keychainStatus() {
  const secret = readZhihuSecretFromKeychain();
  return {
    available: Boolean(secret),
    service: SERVICE,
    account: ACCOUNT,
    length: secret.length
  };
}
