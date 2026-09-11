// 二进制泄漏扫描：确认标志性命令模板没有以明文留在构建产物里。
//
// 不依赖 binutils 的 strings（Git Bash 没带），直接按 ASCII / UTF-16 在
// buffer 里找关键词——V8 的常量池原样保存字符串字面量（只做池内去重），
// 所以 bytenode 的 .jsc 会在这里露馅，这正是步骤 0.2 弃用它的依据。
//
//   node scripts/scan-core.mjs                    扫 server/core/index.cjs
//   node scripts/scan-core.mjs a.cjs b.cjs        扫指定文件
//
// 有任何一条命中就退出码 1——它同时是交付前的闸门。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEEDLES } from './needles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function count(buf, needle, enc) {
  const n = Buffer.from(needle, enc);
  let c = 0;
  let at = 0;
  while ((at = buf.indexOf(n, at)) !== -1) { c++; at += n.length; }
  return c;
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [path.join(root, 'server/core/index.cjs')];

let failed = false;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`--- ${file} ---`);
    console.log('  ❌ 文件不存在');
    failed = true;
    continue;
  }
  const buf = fs.readFileSync(file);
  console.log(`--- ${path.relative(root, file)} (${buf.length} bytes) ---`);

  let leaked = 0;
  for (const needle of NEEDLES) {
    const ascii = count(buf, needle, 'utf8');
    const utf16 = count(buf, needle, 'utf16le');
    const total = ascii + utf16;
    if (total > 0) leaked++;
    const mark = total > 0 ? '❌ 泄漏' : '✅ 未找到';
    console.log(`  ${mark}  ${String(total).padStart(3)}x  ${needle}${utf16 > 0 ? `  (UTF-16: ${utf16})` : ''}`);
  }
  console.log(`  => ${leaked}/${NEEDLES.length} 个标志性模板可被直接读出`);
  if (leaked > 0) failed = true;
  console.log('');
}

if (failed) {
  console.log('❌ 有明文模板泄漏，不能交付。');
  process.exit(1);
}
console.log('✅ 全部标志性模板均未以明文出现。');
