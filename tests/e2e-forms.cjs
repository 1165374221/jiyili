// 前端全表单输出扫描：21 个表单逐个填值，抓下预览文本，落成 JSON。
//
//   npx electron tests/e2e-forms.cjs --out tests/forms-baseline.json
//
// 用途是给步骤 4b（本地生成 → fetch /api/generate）做【切换前基线】：
// 同一份脚本在改动前后各跑一次，逐字节比对两份 JSON。这替代了原计划里的人工
// 点选 21 个表单 —— 手点做不到逐字节、不可重复、也没法当回归。
//
// 填值走通用启发式而不是逐个表单写脚本：把所有文本框/数字框/下拉/复选框设成确定
// 值，再点掉所有「+ 添加」按钮。不需要理解每个表单的语义，新增表单自动被覆盖。
// 产出的命令不一定「合理」，要的是【前后一致】，不是正确。
//
// 两轮抓取，各管一件事：
//   isolated   —— 每个表单先「清空」再填，量的是这个表单【自己】产出什么。
//                 没这轮的话，某个表单的改动会被后面所有用例重复反映，定位变难。
//   cumulative —— 全程不清空，把所有表单依次碰一遍，量的是累积后的聚合结果。
//                 4b 要把 bag 顺序经 JSON 传到服务端，段序是明确的风险点，
//                 这轮专门盯它（段数应当从 1 单调爬到 23）。
//
// 服务端那 204 个 golden 用例已经证明了 generateAll 本身没变；这里验证的是前端
// 这一段管路：表单上报的 params 经过 JSON 往返、并发与顺序处理后，
// 预览区看到的仍是同一个东西。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const URL = process.env.E2E_URL || 'http://localhost:5173/';
const outArg = process.argv.indexOf('--out');
const OUT = path.join(__dirname, outArg >= 0 ? path.basename(process.argv[outArg + 1]) : 'forms-current.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// textContent 是图标+文字，用完整字符串精确匹配，避免 'VLAN / 端口' 与
// 'VLAN 接口' 互相串台。
const SWITCH_ITEMS = [
  ['⚡快速命令', 'quickcmd'], ['📶堆叠', 'stack'], ['🔀VLAN / 端口', 'vlan'],
  ['🖧VLAN 接口', 'vlanif'], ['🔗链路聚合', 'linkagg'], ['🌳STP 生成树', 'stp'],
  ['☁️VXLAN', 'vxlan'], ['🏷QINQ', 'qinq'], ['🔁VRRP', 'vrrp'], ['🏠DHCP', 'dhcp'],
  ['📡路由协议', 'routing'], ['🛡ACL 访问控制', 'acl'], ['📊QoS 流策略', 'qos'],
  ['🔒端口安全', 'portsec'], ['⚙️接口配置', 'iface'], ['📈SNMP', 'snmp'],
  ['🕐NTP 时间', 'ntp'], ['📋Syslog 日志', 'syslog'], ['👁LLDP', 'lldp'],
  ['🔐AAA 认证', 'aaa'],
];
// 拓扑、NAT、防火墙策略分别在三个【默认折叠】的分组里，得先展开。
const FOLDED = [
  ['拓扑', '🗺网络拓扑', 'topo'],
  ['路由器', '🔄NAT 地址转换', 'nat'],
  ['防火墙', '🔥安全策略', 'fwpolicy'],
];
const ALL_ITEMS = [...SWITCH_ITEMS, ...FOLDED.map(([, label, key]) => [label, key])];

const FILL_HELPER = `
window.__setNative = (el, value) => {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  desc.set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
// ⚠️ 已知覆盖盲区（实测确认，2026-09-11）：这个函数在【一个同步 tick 里点掉所有
// 「+」按钮】，而每个表单的 handler 都捕获了同一份 stale state —— addOspfNet /
// addRip / addBgp 各自从同一个 p 派生出新对象，后一个把前一个整个覆盖掉。
// 结果：只有 DOM 里【最后一个】「+」按钮的效果存活。
//
// 实测（路由表单）：批量点完后控件数 7，OSPF 面板没打开，只有 BGP 在。所以路由
// 表单的扫描【从来没覆盖 OSPF / RIP，也没覆盖静态路由】。
//
// 影响：任何带多个「+」按钮的表单，扫描都只覆盖最后一个面板；这些表单的
// 「逐字段一致」是「没走到那块」的一致，不是「走过了没变」的一致。
// 补覆盖要改成【点一个、等 re-render、再点下一个】，并重新固化 baseline。
// 路由表单的实际覆盖目前由 tests/e2e-routing-ui.cjs 承担（那里是逐个点击的）。
window.__clickAdders = () => {
  const adders = [...document.querySelectorAll('button')].filter((b) => /^\\s*\\+/.test(b.textContent));
  adders.forEach((b) => b.click());
  return adders.length;
};
window.__fillAll = () => {
  let n = 0;
  document.querySelectorAll('input, textarea').forEach((el) => {
    if (el.type === 'checkbox' || el.type === 'radio') return;
    let v;
    if (el.tagName === 'TEXTAREA') v = 'vlan 100 port 1-10 access';
    else if (el.type === 'number') v = '10';
    else if (el.placeholder && el.placeholder.length <= 24 && !el.placeholder.startsWith('如')) v = el.placeholder;
    else v = '10';
    window.__setNative(el, v);
    n++;
  });
  // 跳过前两个 select —— 那是 Header 里的【厂商】和【型号】。让它们保持默认
  // （华为 / S5700），这样扫的是最有代表性的状态；否则启发式会把厂商拨到最后一
  // 项（锐捷），而厂商决定了大半输出，等于只覆盖了一家。厂商/型号切换另有专项
  // 用例（它牵涉 bug #5 和 4b 的防抖 deps），不靠这里顺手测。
  [...document.querySelectorAll('select')].slice(2).forEach((el) => {
    if (el.options.length > 1) { window.__setNative(el, el.options[el.options.length - 1].value); n++; }
  });
  document.querySelectorAll('input[type=checkbox]').forEach((el) => {
    if (!el.checked) { el.click(); n++; }
  });
  return n;
};
window.__snapshot = () => {
  const pre = document.querySelector('pre');
  const body = document.body.innerText;
  // Header 在最前，所以前两个 select 是厂商和型号 —— 记下来，便于确认这轮
  // 是哪个厂商状态下跑的（填值启发式会把它们拨到最后一个选项）。
  const sels = [...document.querySelectorAll('select')];
  return {
    vendor: sels[0] ? sels[0].options[sels[0].selectedIndex].text : null,
    model: sels[1] ? sels[1].options[sels[1].selectedIndex].text : null,
    preview: pre ? pre.innerText : null,
    badge: (body.match(/(\\d+) 段/) || [])[1] || null,
    applied: (body.match(/已配置：[^\\n]*/) || [''])[0].replace('已配置：', ''),
    error: (body.match(/生成失败：[^\\n]*/) || [''])[0],
    inputs: document.querySelectorAll('input, textarea, select').length,
  };
};
window.__clear = () => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '清空');
  if (b) { b.click(); return true; }
  return false;
};
// executeJavaScript 会把最后一条语句的值序列化回主进程，而上面最后一条是
// 【函数赋值】，函数不可结构化克隆 → "An object could not be cloned"。
// 补一个可克隆的字面量收尾。
true;
`;

async function goTo(win, label) {
  return win.webContents.executeJavaScript(
    `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === ${JSON.stringify(label)}); if (b) { b.click(); return true; } return false; })()`,
  );
}

// 分组标题按钮的 textContent 是「▶/▼ + 图标 + 名称」（箭头是独立 span），所以
// 不能用精确匹配。用「含箭头 span」把它和普通条目区分开 —— 条目没有箭头，
// 否则 '🗺网络拓扑'（条目）会和 '🗺拓扑'（分组）互相命中。
async function expandGroup(win, label) {
  return win.webContents.executeJavaScript(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => {
      if (!x.textContent.includes(${JSON.stringify(label)})) return false;
      return [...x.querySelectorAll('span')].some((s) => s.textContent === '▶' || s.textContent === '▼');
    });
    if (!b) return false;
    if (b.textContent.includes('▶')) b.click();   // 已展开则不再点，免得又收起来
    return true;
  })()`);
}

app.whenReady().then(async () => {
  // show: false —— 这个脚本只读 DOM，不截图，没必要在用户桌面上弹窗。
  // 需要肉眼看时用 E2E_SHOW=1。
  const win = new BrowserWindow({ width: 1500, height: 1000, show: process.env.E2E_SHOW === '1' });
  await win.loadURL(URL);
  await sleep(1500);
  await win.webContents.executeJavaScript(FILL_HELPER);

  // 先把折叠分组展开一次，后面两轮就都能直接点到条目了。
  for (const [groupLabel] of FOLDED) await expandGroup(win, groupLabel);
  await sleep(200);

  const isolated = [];
  const cumulative = [];

  const fillAndSnap = async (key, label) => {
    const ok = await goTo(win, label);
    if (!ok) return { key, label, reached: false };
    await sleep(350);
    // 先点「+ 添加」造出几行，再统一填值：新加的行也要被填到。
    await win.webContents.executeJavaScript('window.__clickAdders()');
    await sleep(150);
    await win.webContents.executeJavaScript('window.__clickAdders()');
    await sleep(150);
    const filled = await win.webContents.executeJavaScript('window.__fillAll()');
    await sleep(600);   // 给防抖（4b 之后）留余量
    const snap = await win.webContents.executeJavaScript('window.__snapshot()');
    return { key, label, reached: true, filled, ...snap };
  };

  // 第一轮：每个表单独立。清空 → 进表单 → 填 → 抓。
  for (const [label, key] of ALL_ITEMS) {
    await win.webContents.executeJavaScript('window.__clear()');
    await sleep(250);
    isolated.push(await fillAndSnap(key, label));
  }

  // 第二轮：全程不清空，累积。
  await win.webContents.executeJavaScript('window.__clear()');
  await sleep(250);
  for (const [label, key] of ALL_ITEMS) cumulative.push(await fillAndSnap(key, label));

  fs.writeFileSync(OUT, JSON.stringify({ isolated, cumulative }, null, 2));
  const bad = [...isolated, ...cumulative].filter((r) => !r.reached);
  const emptyIso = isolated.filter((r) => r.reached && !r.preview);
  console.log(`已写入 ${OUT}`);
  console.log(`isolated ${isolated.length} 个（空预览 ${emptyIso.length}）；cumulative ${cumulative.length} 个；未到达 ${bad.length}`);
  console.log(`厂商/型号状态：${isolated[0]?.vendor} / ${isolated[0]?.model}`);
  console.log(`累积段数序列：${cumulative.map((r) => r.badge ?? '-').join(' → ')}`);
  if (bad.length) console.log('  未到达：' + bad.map((r) => `${r.key}(${r.label})`).join(', '));
  if (emptyIso.length) console.log('  空预览：' + emptyIso.map((r) => r.key).join(', '));
  app.exit(bad.length ? 1 : 0);
});

setTimeout(() => { console.error('超时强退'); app.exit(2); }, 240000).unref?.();
