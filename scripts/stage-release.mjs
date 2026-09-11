// 组装交付目录 release/，并在最后跑一组硬断言。
//
//   node scripts/stage-release.mjs
//
// 为什么这个脚本必须存在（计划里那句「没有发布目录，整个改造收益为零」）：
// 把 src/vendors/*.ts 搬到 server/core/vendors/ 之后，它仍然是明文 .ts，而且
// 和 server\index.cjs 在同一个会被整体拷给客户的目录树里。esbuild 的中间产物
// plain.cjs 更是比 dist 的 bundle 还好读（没有 React 噪音）。
// 没有「只放该放的、并断言不该放的没混进来」这一步，前面所有工作都白做。
//
// 交付形态：客户机已有 Node，双击 start.bat → node server\index.cjs → 浏览器开
// localhost:3001。**不随包发 node.exe，不锁 Node 版本，客户机不需要 npm install**。
//
// 断言分三类，任何一条不过就退出码 1、不产出可交付目录：
//   A. 目录内容：不得含 .ts/.tsx、plain.cjs、*.bundle.*、*.jsc、src/、devDependencies
//   B. 核心产物：server/core/index.cjs 存在，且 8 个模板 0 泄漏
//   C. **前端 bundle：dist/**/*.js 里 8 个模板也必须 0 泄漏**
// C 是整个改造的验收点。以前只验 B，等于只验了「搬过去的那份是加密的」，
// 没验「原来那份已经不在了」—— 而后者才是「客户 F12 读不到源码」的真正含义。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NEEDLES } from './needles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = path.join(root, 'release');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// 不该出现在交付包里的 devDependency —— 体积大，且每一个都带着构建期源码/工具。
// electron 一家就有几百 MB，typescript/vite/esbuild 则等同于把工具链送出去。
const FORBIDDEN_DEPS = [
  'electron', 'electron-builder', 'typescript', 'vite', 'esbuild',
  'javascript-obfuscator', 'eslint', 'tailwindcss', '@types', '@vitejs',
  '@eslint', 'typescript-eslint', 'globals',
];

const problems = [];
const fail = (msg) => { problems.push(msg); console.log(`  ❌ ${msg}`); };
const ok = (msg) => console.log(`  ✅ ${msg}`);

const run = (cmd, label) => {
  console.log(`\n▶ ${label}\n  $ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
};

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

const count = (buf, needle, enc) => {
  const n = Buffer.from(needle, enc);
  let c = 0, at = 0;
  while ((at = buf.indexOf(n, at)) !== -1) { c++; at += n.length; }
  return c;
};
const leaks = (file) => {
  const buf = fs.readFileSync(file);
  return NEEDLES.filter((n) => count(buf, n, 'utf8') + count(buf, n, 'utf16le') > 0);
};

// ---------- 1. 构建 ----------
// 顺序有讲究：先 build:core。它是唯一会写 server/core/index.cjs 的步骤，
// 而 server/index.cjs 在运行时要 require 它 —— 拷贝之前必须先是最新的。
run('node scripts/build-core.mjs', '构建并混淆核心（厂商逻辑 + parser）');
run('npx tsc -b', '类型检查');
run('npx vite build', '构建前端');

if (!fs.existsSync(path.join(root, 'server/core/index.cjs'))) {
  console.error('\n❌ server/core/index.cjs 不存在，构建失败，中止。');
  process.exit(1);
}

// ---------- 2. 清空并重建 release/ ----------
console.log('\n▶ 组装 release/');
fs.rmSync(RELEASE, { recursive: true, force: true });
fs.mkdirSync(path.join(RELEASE, 'server', 'core'), { recursive: true });

const copy = (from, to) => fs.cpSync(from, to, { recursive: true });
copy(path.join(root, 'dist'), path.join(RELEASE, 'dist'));
ok('dist/（前端，已构建）');

fs.copyFileSync(path.join(root, 'server/index.cjs'), path.join(RELEASE, 'server/index.cjs'));
ok('server/index.cjs（明文，只有 SSH/串口管道，不含厂商逻辑）');

fs.copyFileSync(path.join(root, 'server/core/index.cjs'), path.join(RELEASE, 'server/core/index.cjs'));
ok('server/core/index.cjs（混淆产物）');

for (const f of ['start.bat', 'stop.bat']) {
  if (fs.existsSync(path.join(root, f))) {
    fs.copyFileSync(path.join(root, f), path.join(RELEASE, f));
    ok(f);
  }
}

// 生产依赖。用 npm ls 从锁文件解析出【生产】树再逐个目录拷贝，而不是跑
// npm install —— 客户机不许装、构建机也不该为此联网。react/react-dom/@xterm
// 其实已被 vite 打进 dist，拷进来是无用的冗余，但留着不影响正确性；
// 相比「手工裁剪少拷一个传递依赖导致客户机启动即崩」，宁可多几 MB。
const lsOut = execSync('npm ls --omit=dev --parseable --all', { cwd: root, encoding: 'utf8' });
const depDirs = lsOut.split(/\r?\n/).map((s) => s.trim())
  .filter((s) => s.includes('node_modules') && fs.existsSync(s));
let copied = 0;
for (const abs of depDirs) {
  const rel = path.relative(root, abs);
  const dest = path.join(RELEASE, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  copy(abs, dest);
  copied++;
}
ok(`node_modules：${copied} 个生产依赖目录（无 devDependencies）`);

// 交付包自带 package.json，写明形态。不是运行必需（.cjs 不受 type 影响），
// 但缺了它这个目录看起来不像一个完整的包。
fs.writeFileSync(path.join(RELEASE, 'package.json'), JSON.stringify({
  name: pkg.name,
  version: pkg.version,
  private: true,
  description: '技毅力 - 交换机命令生成工具（交付包，无需 npm install）',
}, null, 2) + '\n');
ok('package.json（精简）');

// ---------- 3. 断言 ----------
console.log('\n▶ 交付断言');

const files = walk(RELEASE);
const rel = (f) => path.relative(RELEASE, f).replace(/\\/g, '/');

// A. 目录内容
//
// 只查【我们自己的】文件，不查 node_modules 里的。断言的意图是「我们的源码不能
// 随包发出去」，而第三方包自带 .d.ts（类型声明）甚至 .ts 源码是常态、也与我们
// 的资产无关。第一版没区分，结果被 247 个 node_modules 里的 .d.ts 直接拦下 ——
// 那是断言写错了，不是包里真有我们的源码。把它放宽到只查非 node_modules，
// 同时下面单独确认 src/ 整个不存在、以及没有任何 vendor 模板泄漏。
const ownFiles = files.filter((f) => !rel(f).startsWith('node_modules/'));
const badExt = ownFiles.filter((f) => /\.(ts|tsx|mts|cts)$/i.test(f));
badExt.length ? fail(`含我们自己的 TypeScript 源文件 ${badExt.length} 个，首个：${rel(badExt[0])}`)
              : ok(`不含我们自己的 .ts/.tsx（node_modules 里第三方自带 ${files.length - ownFiles.length} 项，不计）`);

const plain = files.filter((f) => /(^|\/)plain\.cjs$/i.test(rel(f)));
plain.length ? fail(`含 esbuild 中间产物 plain.cjs：${plain.map(rel).join(', ')}`)
             : ok('不含 plain.cjs（中间产物）');

const bundles = files.filter((f) => /\.bundle\./i.test(rel(f)));
bundles.length ? fail(`含 .bundle.* 中间产物：${bundles.map(rel).join(', ')}`)
               : ok('不含 *.bundle.*');

const jsc = files.filter((f) => /\.jsc$/i.test(f));
jsc.length ? fail(`含 bytenode 产物 .jsc：${jsc.map(rel).join(', ')}`)
           : ok('不含 *.jsc');

fs.existsSync(path.join(RELEASE, 'src'))
  ? fail('含 src/ 目录 —— 源码被整体拷进去了')
  : ok('不含 src/');

for (const d of FORBIDDEN_DEPS) {
  if (fs.existsSync(path.join(RELEASE, 'node_modules', d))) fail(`含 devDependency：node_modules/${d}`);
}
ok(`不含 ${FORBIDDEN_DEPS.length} 个已知 devDependency`);

// B. 核心产物
const core = path.join(RELEASE, 'server/core/index.cjs');
if (!fs.existsSync(core)) {
  fail('server/core/index.cjs 不存在');
} else {
  const l = leaks(core);
  l.length ? fail(`核心产物泄漏 ${l.length}/${NEEDLES.length} 个模板：${l.join('、')}`)
           : ok(`核心产物：${NEEDLES.length} 个标志性模板 0 泄漏`);
}

// C. 前端 bundle —— 整个改造的验收点
const distJs = files.filter((f) => rel(f).startsWith('dist/') && /\.(js|mjs|cjs)$/i.test(f));
if (distJs.length === 0) {
  fail('dist/ 下没有找到任何 .js —— 前端没构建成功？');
} else {
  let worst = null, worstN = 0;
  for (const f of distJs) {
    const l = leaks(f);
    if (l.length > worstN) { worstN = l.length; worst = { f, l }; }
  }
  if (worst) {
    fail(`前端 bundle 泄漏 ${worstN}/${NEEDLES.length} 个模板（${rel(worst.f)}）：${worst.l.join('、')}`);
    fail('厂商逻辑仍在随前端发布 —— 客户 F12 就能读走，改造目标未达成');
  } else {
    ok(`前端 bundle（${distJs.length} 个 .js）：${NEEDLES.length} 个标志性模板 0 泄漏`);
  }
}

// ---------- 4. 体积 ----------
const total = files.reduce((s, f) => s + fs.statSync(f).size, 0);
const mb = (n) => (n / 1024 / 1024).toFixed(1) + 'MB';
console.log(`\n▶ 体积：${files.length} 个文件，${mb(total)}`);
console.log(`   release/ 路径：${RELEASE}`);

if (problems.length) {
  console.log(`\n❌ ${problems.length} 条断言未通过，release/ 不可交付。`);
  process.exit(1);
}
console.log('\n✅ 全部断言通过，release/ 可交付。');
console.log('   客户机上双击 start.bat 即可（需已装 Node，无需 npm install）。');
