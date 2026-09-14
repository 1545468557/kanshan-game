// HTTP 小工具：读请求体、判断访客 IP、发 JSON、安全地托管静态文件。
// 没有依赖任何框架 —— 一个 Demo 用不上。

import {createReadStream, statSync} from 'node:fs';
import {extname, join, normalize, sep} from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.hdr': 'image/vnd.radiance',
  '.exr': 'image/x-exr',
  '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  // 音视频必须给对类型：浏览器是靠 Content-Type 决定要不要交给 <video>/<audio> 播放的，
  // 回成 application/octet-stream 时 <video> 会直接报错、序幕动画就播不出来。
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

export function mimeOf(path) {
  return MIME[extname(path).toLowerCase()] || 'application/octet-stream';
}

// 上限 64KB：一个人问 NPC 一句话，不可能需要更多。
export function readJsonBody(req, limit = 64 * 1024) {
  return new Promise(resolve => {
    let size = 0;
    const chunks = [];
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        finish({error: 'too_large'});
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return finish({value: {}});
      try {
        const value = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return finish({error: 'bad_json'});
        finish({value});
      } catch {
        finish({error: 'bad_json'});
      }
    });
    req.on('error', () => finish({error: 'bad_json'}));
  });
}

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

// 把 URL 路径解析成 dist 目录下的真实文件，挡掉 ../ 之类的越界访问。
export function resolveStatic(staticDir, urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const relative = normalize(pathname).replace(/^([/\\])+/, '');
  if (relative.split(/[/\\]/).includes('..')) return null;
  const full = join(staticDir, relative);
  if (!full.startsWith(staticDir + sep) && full !== staticDir) return null;
  return full;
}

// 只解析单段 `bytes=start-end`（也接受 `bytes=start-` 与 `bytes=-后缀长度`）。
// 浏览器取音视频时发的就是这一种；逗号分隔的多段请求按不合法处理。
// 返回 null 表示「这段没法满足」或「根本没带 Range」，由调用方区分后决定回 206 还是 416。
function parseRange(header, size) {
  if (typeof header !== 'string') return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;
  let start, end;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  return {start, end: Math.min(end, size - 1)};
}

export function sendFile(res, full, {head = false, req = null} = {}) {
  let info;
  try {
    info = statSync(full);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;
  const ext = extname(full).toLowerCase();
  // HTML 不缓存（每次部署都要立刻生效），带指纹的静态资源缓存一天
  const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=86400';
  const headers = {
    'content-type': mimeOf(full),
    'cache-control': cacheControl,
    'accept-ranges': 'bytes'
  };
  // 分段请求：音视频要能拖动进度条，而且 iPhone 上的 Safari 拿不到 206 就**不肯播** <video>。
  const rangeHeader = req?.headers?.range;
  const range = parseRange(rangeHeader, info.size);
  if (range) {
    const {start, end} = range;
    res.writeHead(206, {...headers, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${info.size}`});
    if (head) return res.end(), true;
    createReadStream(full, {start, end}).pipe(res);
    return true;
  }
  if (rangeHeader) {
    // 语法不合法或越界：按规范回 416，并把实际长度告诉对方，让它知道该重试还是放弃。
    res.writeHead(416, {...headers, 'content-range': `bytes */${info.size}`});
    return res.end(), true;
  }
  res.writeHead(200, {...headers, 'content-length': info.size});
  if (head) return res.end(), true;
  createReadStream(full).pipe(res);
  return true;
}
