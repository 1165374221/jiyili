// 比对两份全表单扫描结果。
//   node tests/compare-forms.mjs tests/forms-baseline.json tests/forms-current.json
import { readFileSync } from 'node:fs';

const [aPath, bPath] = process.argv.slice(2);
const a = JSON.parse(readFileSync(aPath, 'utf8'));
const b = JSON.parse(readFileSync(bPath, 'utf8'));

let diffs = 0;
const FIELDS = ['reached', 'filled', 'vendor', 'model', 'preview', 'badge', 'applied', 'error'];

for (const phase of ['isolated', 'cumulative']) {
  const A = a[phase] ?? [];
  const B = b[phase] ?? [];
  if (A.length !== B.length) {
    console.log(`❌ ${phase}：用例数不同 ${A.length} vs ${B.length}`);
    diffs++;
    continue;
  }
  let phaseDiffs = 0;
  for (let i = 0; i < A.length; i++) {
    const ka = A[i], kb = B[i];
    if (ka.key !== kb.key) { console.log(`❌ ${phase}[${i}] 用例顺序不同：${ka.key} vs ${kb.key}`); diffs++; phaseDiffs++; continue; }
    for (const f of FIELDS) {
      const va = JSON.stringify(ka[f]), vb = JSON.stringify(kb[f]);
      if (va !== vb) {
        diffs++; phaseDiffs++;
        console.log(`❌ ${phase} / ${ka.key} / ${f}`);
        console.log(`     基线: ${String(va).slice(0, 200)}`);
        console.log(`     现在: ${String(vb).slice(0, 200)}`);
      }
    }
  }
  if (!phaseDiffs) console.log(`✅ ${phase}：${A.length} 个用例逐字段一致`);
}

console.log(diffs === 0 ? '\n✅ 两份扫描完全一致' : `\n❌ 共 ${diffs} 处差异`);
process.exitCode = diffs === 0 ? 0 : 1;
