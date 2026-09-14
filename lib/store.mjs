// 极简的落盘存储：两串 JSONL 文件，一行一条。
// 不引数据库，是因为黑客松 Demo 的量级用不上，而且文件方式随时可以备份、grep、发给队友。
//
// data/npc-cache.jsonl   NPC 回答缓存（启动时全部读进内存）
// data/records.jsonl     玩家提问与结案记录（管理员页面按需读取）
//
// data/ 已在 .gitignore 里排除：里面有真实访客输入，不该提交。

import {appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// 云端的文件系统可能是只读的。如果直接在那个目录上 mkdirSync，服务会在**启动时**
// 抛异常直接挂掉 —— 那比"记录写不进去"严重得多（接口全 404、NPC 全部降级）。
// 所以这里先探一次可写性：优先用配置的目录，不行就退到系统临时目录，
// 再不行就只留在内存里。宁可丢记录，也不能起不来。
function pickDataDir(preferred) {
  for (const dir of [preferred, join(tmpdir(), 'kanshan-data')].filter(Boolean)) {
    try {
      mkdirSync(dir, {recursive: true});
      const probe = join(dir, `.write-probe-${process.pid}`);
      writeFileSync(probe, '');
      rmSync(probe, {force: true});
      return dir;
    } catch {
      // 换下一个候选目录
    }
  }
  return '';
}

function readLines(path) {
  if (!path || !existsSync(path)) return [];
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      // 单行损坏（比如写了一半断电）就跳过，不影响其余记录
    }
  }
  return rows;
}

export function createStore(dataDir) {
  const dir = pickDataDir(dataDir);
  const cachePath = dir ? join(dir, 'npc-cache.jsonl') : '';
  const recordsPath = dir ? join(dir, 'records.jsonl') : '';

  // 缓存条数超过这个数就不再追加，避免文件无限膨胀
  const CACHE_LIMIT = 4000;

  function append(path, row) {
    try {
      appendFileSync(path, JSON.stringify(row) + '\n');
      return true;
    } catch {
      return false;
    }
  }

  return {
    loadCache() {
      const map = new Map();
      for (const row of readLines(cachePath)) {
        if (row && typeof row.key === 'string' && typeof row.reply === 'string') map.set(row.key, row);
      }
      return map;
    },

    saveCacheEntry(key, reply, meta = {}) {
      if (existsSync(cachePath)) {
        try {
          if (readFileSync(cachePath, 'utf8').split('\n').length > CACHE_LIMIT) return false;
        } catch {}
      }
      return append(cachePath, {key, reply, ...meta});
    },

    addRecord(record) {
      return append(recordsPath, record);
    },

    readRecords() {
      return readLines(recordsPath);
    },

    // 给管理员页面用的统计。只算聚合数字，不额外暴露原始输入以外的信息。
    resetRecords() {
      try {
        writeFileSync(recordsPath, '');
        return true;
      } catch {
        return false;
      }
    },

    paths: {cachePath, recordsPath, dataDir: dir, writable: Boolean(dir)}
  };
}
