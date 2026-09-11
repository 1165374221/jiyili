// 把 server/core/**.ts（厂商 CLI 生成 + parser，2127+ 行核心资产）打成
// server/core/index.cjs，供 server/index.cjs 在 Node 侧 require。
//
// 为什么必须打包：src/ 从未编译成 JS（noEmit + moduleResolution:"bundler"），
// 而且核心代码 import 了 ../../src/types 的运行时常量 DEVICE_MODELS。
// esbuild 能解析无扩展名 import、正确擦除 import type、把常量内联进来。
//
//   node scripts/build-core.mjs          交付用：esbuild → 混淆 → 删中间产物
//   node scripts/build-core.mjs --dev    开发用：只 esbuild，产物【未混淆】
//
// 混淆参数来自步骤 0.2 的实测：对真实的 4 厂商 + parser 代码，8 个标志性命令
// 模板 0/8 泄漏、输出与未混淆版逐字节一致。bytenode 在同一实测里泄漏 7/8，
// 已弃用。
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const JavaScriptObfuscator = require('javascript-obfuscator');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = path.join(root, 'server/core/index.ts');
const OUT = path.join(root, 'server/core/index.cjs');
// 中间产物：未混淆的完整 bundle，比 dist 的 React bundle 还好读（没有 React 噪音）。
// 一旦漏进交付目录就等于没保护，所以混淆后必须立刻删掉。
const PLAIN = path.join(root, 'server/core/plain.cjs');

const dev = process.argv.includes('--dev');

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: dev ? OUT : PLAIN,
  // 核心代码无第三方依赖，不需要任何 --external。
  logLevel: 'warning',
  metafile: true,
});

const inputs = Object.keys(result.metafile.inputs).filter((f) => !f.includes('node_modules'));
console.log(`esbuild: ${inputs.length} 个模块 → ${path.relative(root, dev ? OUT : PLAIN)}`);
console.log('  ' + inputs.map((f) => f.replace(/\\/g, '/')).join('\n  '));

if (dev) {
  console.log('');
  console.log('⚠️  --dev 产出的是【未混淆】的 index.cjs，仅供本机调试。');
  console.log('    交付前必须跑: npm run build:core');
  process.exit(0);
}

const plain = fs.readFileSync(PLAIN, 'utf8');
const obfuscated = JavaScriptObfuscator.obfuscate(plain, {
  stringArray: true,
  // rc4 让字符串不再以明文出现在二进制里。诚实说明：密钥嵌在同一个文件内，
  // 有决心的人仍可提取密钥解密——这是抬高成本，不是绝对防护。
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 1,
  splitStrings: true,
  controlFlowFlattening: true,
  deadCodeInjection: true,
  compact: true,
}).getObfuscatedCode();

fs.writeFileSync(OUT, obfuscated);
fs.unlinkSync(PLAIN);

const kb = (n) => (n / 1024).toFixed(0) + 'KB';
console.log(`混淆: ${kb(plain.length)} → ${kb(obfuscated.length)}  (${path.relative(root, OUT)})`);
console.log(`已删除中间产物 ${path.relative(root, PLAIN)}`);
console.log('');
console.log('下一步自检: node scripts/scan-core.mjs');
