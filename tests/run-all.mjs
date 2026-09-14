// 跑 tests/ 下所有 *.test.mjs。每个文件是独立进程，互不影响。
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(name => name.endsWith('.test.mjs')).sort();

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, [join(dir, file)], {stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8'});
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const ok = result.status === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${file}`);
  if (output) {
    for (const line of output.split('\n')) console.log(`      ${line}`);
  }
}

console.log('');
console.log(failed ? `${files.length} 个测试文件里有 ${failed} 个失败。` : `${files.length} 个测试文件全部通过。`);
process.exitCode = failed ? 1 : 0;
