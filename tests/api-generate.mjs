// POST /api/generate 的接口测试。
// 自己拉起 server/index.cjs，跑完再杀掉——不依赖外部已启动的服务。
//
//   node tests/api-generate.mjs
//
// 重点覆盖两类：参数校验（恶意/畸形输入不能让进程倒），以及 bug #1
// ——型号必须真的改变生成的端口名。
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:3001';

const server = spawn(process.execPath, [path.join(root, 'server/index.cjs')], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d.toString(); });
server.stderr.on('data', (d) => { serverLog += d.toString(); });

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/api/status`);
      if (r.ok) return;
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('服务未能在 10 秒内就绪。日志:\n' + serverLog);
}

const post = (body) =>
  fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

let pass = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { failures.push(name); console.log(`  ❌ ${name}\n       ${detail}`); }
}

try {
  await waitReady();
  console.log('服务已就绪，开始测试\n');

  // 1. 正常路径
  const ok = await post({
    vendor: 'huawei', modelId: 's5700',
    blocks: [
      { type: 'vlan', params: { vlanIds: [10], ports: '1-5', portMode: 'access' } },
      { type: 'quickcmd', params: 'vlanif 100 地址 192.168.1.1/24' },
    ],
  });
  check('正常生成返回 success', ok.success === true, JSON.stringify(ok));
  check('applied 按入参顺序', JSON.stringify(ok.applied) === '["vlan","quickcmd"]', JSON.stringify(ok.applied));
  check('华为外壳是 system-view 且无 end',
    ok.command.startsWith('system-view\n') && !ok.command.endsWith('\nend'), JSON.stringify(ok.command));

  // 2. 未知厂商
  const badVendor = await post({ vendor: 'juniper', modelId: 'x', blocks: [] });
  check('未知厂商被拒', badVendor.success === false, JSON.stringify(badVendor));

  // 3. 未知配置类型
  const badType = await post({ vendor: 'huawei', modelId: 's5700', blocks: [{ type: 'nope', params: {} }] });
  check('未知配置类型被拒', badType.success === false && /未知配置类型/.test(badType.message), JSON.stringify(badType));

  // 4. 参数形状错误 —— 关键：进程必须活着
  const badParams = await post({ vendor: 'huawei', modelId: 's5700', blocks: [{ type: 'vlan', params: null }] });
  check('params=null 返回失败而非崩溃', badParams.success === false, JSON.stringify(badParams));

  // 5. 超长 quickcmd
  const tooLong = await post({ vendor: 'huawei', modelId: 's5700', blocks: [{ type: 'quickcmd', params: 'a'.repeat(2001) }] });
  check('超长 quickcmd 被拒', tooLong.success === false && /过长/.test(tooLong.message), JSON.stringify(tooLong));

  // 6. 非法 modelId 退回类内默认前缀（与改造前逐字节一致），不报错
  const badModel = await post({
    vendor: 'huawei', modelId: '不存在的型号',
    blocks: [{ type: 'vlan', params: { vlanIds: [10], ports: '1-5', portMode: 'access' } }],
  });
  const defModel = await post({
    vendor: 'huawei', modelId: 's5700',
    blocks: [{ type: 'vlan', params: { vlanIds: [10], ports: '1-5', portMode: 'access' } }],
  });
  check('非法 modelId 退回默认前缀且不报错',
    badModel.success === true && badModel.command === defModel.command,
    JSON.stringify({ badModel, defModel }));

  // 7. bug #1：型号必须真的改变端口名。ce6800 的 ports 是 25GE0/0/
  const ce6800 = await post({
    vendor: 'huawei', modelId: 'ce6800',
    blocks: [{ type: 'vlan', params: { vlanIds: [10], ports: '1-5', portMode: 'access' } }],
  });
  check('型号生效：ce6800 产出 25GE0/0/ 端口',
    ce6800.command.includes('25GE0/0/1-5'), JSON.stringify(ce6800.command));
  check('型号生效后不再出现默认前缀',
    !ce6800.command.includes('GigabitEthernet0/0/'), JSON.stringify(ce6800.command));

  // 8. bug #3：厂商显式传入，华为不再被包上 configure terminal
  const hw = await post({
    vendor: 'huawei', modelId: 's5700',
    blocks: [{ type: 'quickcmd', params: 'zzz 无法识别' }, { type: 'vlan', params: { vlanIds: [10], ports: '1-5', portMode: 'access' } }],
  });
  check('bug #3：华为不被误包 configure terminal',
    hw.command.startsWith('system-view\n'), JSON.stringify(hw.command.slice(0, 60)));

  // 9. 无有效段
  const empty = await post({ vendor: 'huawei', modelId: 's5700', blocks: [] });
  check('空 blocks 返回空命令', empty.success === true && empty.command === '', JSON.stringify(empty));

  // 10. 跑完上面这些，进程还得活着
  const stillAlive = await fetch(`${BASE}/api/status`).then((r) => r.ok).catch(() => false);
  check('畸形输入之后进程仍然存活', stillAlive === true, '进程已死');

  console.log(`\n${pass} 项通过，${failures.length} 项失败`);
  if (failures.length) { console.log('失败项:\n  ' + failures.join('\n  ')); process.exitCode = 1; }
} catch (err) {
  console.error('测试异常:', err.message);
  process.exitCode = 1;
} finally {
  server.kill();
}
