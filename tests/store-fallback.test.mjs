// 存储层在**只读文件系统**上的行为。
//
// 起因：原实现的第一行是 `mkdirSync(dataDir, {recursive: true})`，没有任何兜底。
// 云端沙箱的根目录可能是只读的，那一行会在**服务启动时**直接抛异常 ——
// 结果不是"记录写不进去"，而是整个服务起不来、所有接口全 404、
// NPC 对话全部降级成本地台词。这是部署到公网最容易踩、后果最严重的一个坑。
import {chmodSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {createStore} from '../lib/store.mjs';

let passed = 0;
const failures = [];
function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ' — ' + detail : ''}`);
}

// ---- 1. 正常可写目录：应该就用配置的目录，不要乱退 ----
{
  const dir = mkdtempSync(join(tmpdir(), 'store-ok-'));
  const store = createStore(dir);
  check('可写目录下应该使用配置的目录', store.paths.dataDir === dir, store.paths.dataDir);
  check('可写目录下 writable 应为 true', store.paths.writable === true);
  check('可写目录下能写记录', store.addRecord({kind: 'ok', value: 1}) === true);
  check('刚写的记录能读回来', store.readRecords().some(row => row.kind === 'ok'));
  rmSync(dir, {recursive: true, force: true});
}

// ---- 2. 只读目录：不能抛异常，要退到可写的位置继续工作 ----
{
  const parent = mkdtempSync(join(tmpdir(), 'store-ro-'));
  const readOnly = join(parent, 'data');
  chmodSync(parent, 0o500); // 目录本身可进入但不可新建子项

  let threw = '';
  let store = null;
  try {
    store = createStore(readOnly);
  } catch (error) {
    threw = String(error && error.message);
  }
  check('只读目录下 createStore 不该抛异常', !threw, threw);
  check('只读目录下应当退到别的可写目录', Boolean(store?.paths.dataDir) && store.paths.dataDir !== readOnly,
    String(store?.paths.dataDir));
  check('退让之后 writable 应为 true', store?.paths.writable === true);
  check('退让之后仍然写得出记录', store?.addRecord({kind: 'fallback', value: 2}) === true);
  check('退让之后读得回刚才的记录', Boolean(store?.readRecords().some(row => row.kind === 'fallback')));

  chmodSync(parent, 0o700);
  rmSync(parent, {recursive: true, force: true});
}

// ---- 3. 父路径根本不是一个目录：也不能抛，继续退让 ----
{
  let threw = '';
  let store = null;
  try {
    store = createStore('/dev/null/definitely-not-a-dir');
  } catch (error) {
    threw = String(error && error.message);
  }
  check('非法路径下 createStore 不该抛异常', !threw, threw);
  check('非法路径下仍然拿到可写目录', store?.paths.writable === true, String(store?.paths.dataDir));
}

// ---- 4. 全都不可写时：降级成内存模式，但服务照样能起 ----
// 用 '' 作为首选目录并让临时目录也走不通是不现实的，所以这里只验证
// 「拿不到目录时接口不炸」这条契约：paths 为空串、读写都安静地失败。
{
  const store = createStore('');
  check('空目录名不应抛异常', true);
  check('空目录名会退到临时目录（临时目录通常可写）或降级为内存模式',
    store.paths.writable === true || store.paths.dataDir === '');
  check('无论哪种模式，addRecord 都必须返回布尔值而不是抛异常',
    typeof store.addRecord({kind: 'never-throws'}) === 'boolean');
  check('无论哪种模式，readRecords 都必须返回数组',
    Array.isArray(store.readRecords()));
  check('无论哪种模式，loadCache 都必须返回 Map',
    store.loadCache() instanceof Map);
}

if (failures.length) {
  console.log(`存储兜底：${passed} 项通过，${failures.length} 项失败`);
  for (const line of failures) console.log('  ✗ ' + line);
  process.exitCode = 1;
} else {
  console.log(`存储兜底：${passed} 项全部通过（只读文件系统 / 非法路径 / 降级模式都不会让服务起不来）。未联网。`);
}
