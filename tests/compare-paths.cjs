// 成对比较 composite（旧：App.tsx 客户端聚合，detectVendor 猜厂商）
// 与 composite-api（新：服务端 generateAll，厂商显式传入）的输出。
// 步骤 2 的验收工具：差异必须【全部】能归因到 bug #3 的修复。
const cases = require('./golden.current.json').cases;

const oldOnes = cases.filter((c) => c.kind === 'composite');
const newOnes = cases.filter((c) => c.kind === 'composite-api');
const key = (c) => c.vendor + ' | ' + c.name;

const newByKey = new Map(newOnes.map((c) => [key(c), c]));

let same = 0;
const diffs = [];
for (const o of oldOnes) {
  const n = newByKey.get(key(o));
  if (!n) { diffs.push({ name: key(o), missing: true }); continue; }
  if (o.command === n.command) same++;
  else diffs.push({ name: key(o), old: o.command, now: n.command });
}

console.log(`composite 用例共 ${oldOnes.length} 组：逐字节相同 ${same} 组，不同 ${diffs.length} 组`);
console.log('');
for (const d of diffs) {
  console.log('=== ' + d.name);
  console.log('  [旧] ' + JSON.stringify(d.old));
  console.log('  [新] ' + JSON.stringify(d.now));
  console.log('');
}
