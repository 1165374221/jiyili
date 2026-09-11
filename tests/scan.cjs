// 二进制泄漏扫描器。
// 不依赖 binutils 的 strings（Git Bash 没带），直接按 ASCII/UTF-16 在 buffer 里找关键词。
// 用法: node scan.cjs <文件> [标签]
const fs = require('fs');

const file = process.argv[2];
const label = process.argv[3] || file;
const buf = fs.readFileSync(file);

// 取自真实厂商代码的标志性命令模板。能在二进制里找到 = 模板可被直接读走。
const NEEDLES = [
  'system-view',
  'configure terminal',
  'switchport mode dot1q-tunnel',
  'stp region-configuration',
  'interface range',
  'GigabitEthernet0/0/',
  'ip address',
  'port-security',
];

function findAscii(needle) {
  const n = Buffer.from(needle, 'utf8');
  let count = 0, at = 0;
  while ((at = buf.indexOf(n, at)) !== -1) { count++; at += n.length; }
  return count;
}

function findUtf16(needle) {
  const n = Buffer.from(needle, 'utf16le');
  let count = 0, at = 0;
  while ((at = buf.indexOf(n, at)) !== -1) { count++; at += n.length; }
  return count;
}

console.log(`--- ${label} (${buf.length} bytes) ---`);
let leaked = 0;
for (const needle of NEEDLES) {
  const a = findAscii(needle);
  const u = findUtf16(needle);
  const total = a + u;
  if (total > 0) leaked++;
  const mark = total > 0 ? '❌ 泄漏' : '✅ 未找到';
  console.log(`  ${mark}  ${String(total).padStart(3)}x  ${needle}${u > 0 ? `  (UTF-16: ${u})` : ''}`);
}
console.log(`  => ${leaked}/${NEEDLES.length} 个标志性模板可被直接读出`);
