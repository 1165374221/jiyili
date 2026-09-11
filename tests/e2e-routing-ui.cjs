// 路由表单改动的界面接线验证。
//
//   npx electron tests/e2e-routing-ui.cjs
//
// 为什么要单独测：这轮给 OSPF 的每条网络加了「接口」字段，并在 v3 下把
// 「网络地址/通配符」换成「接口名」、把网络类型/认证控件整个隐藏。
// 生成逻辑那头有 probe-drops 和 golden 兜着，但**界面接线没有任何东西覆盖**：
// 表单扫的 23 个用例根本没打开过 OSPF 面板（要连点两次按钮才会出现网络行），
// 所以「表单扫描逐字节一致」对这次改动**不构成证据**。
//
// 接线错了会是什么样：用户填了接口名，emit 时 setNet 的闭包捕错了 index，
// 改第 2 行的值写进了第 1 行 —— 生成侧完全正确，而用户拿到的是错配置。
// 这类错误只有把值敲进真实 DOM 再读回预览才能发现。
//
// 断言分三层：
//   1. 控件在/不在 —— v2 三个框，v3 只剩接口名（结构保证「填了不会不生效」）
//   2. 值跨切换存活 —— v2 填的接口名切到 v3 后还在（否则用户要重填）
//   3. 值落进命令 —— 预览里出现 `ip ospf message-digest-key ... <接口>`，
//      以及 v3 的 `ospfv3`，证明 emit 的 index 没错位
const { app, BrowserWindow } = require('electron');

const URL = process.env.E2E_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${cond ? '' : '\n       ' + detail}`);
}

const HELPERS = `
window.__setNative = (el, value) => {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
window.__clickText = (t) => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t));
  if (!b) return false;
  b.click();
  return true;
};
// OSPFv3 是 label 里的 checkbox，不是 button —— __clickText 找不到它。
// （第一版就用 __clickText 点它，返回 false 但没检查，后面 6 条断言全跟着挂，
//   看起来像 v3 分支没实现。断言失败时先确认【前置动作真的发生了】。）
window.__toggleCheckbox = (labelText) => {
  const lab = [...document.querySelectorAll('label')]
    .find((l) => l.textContent.trim() === labelText);
  if (!lab) return false;
  const cb = lab.querySelector('input[type=checkbox]');
  if (!cb) return false;
  cb.click();
  return true;
};
// 按 placeholder 前缀找输入框。路由表单里同类控件多（网络地址/通配符/接口），
// 靠 placeholder 比靠顺序稳。
window.__setByPlaceholder = (prefix, value) => {
  const el = [...document.querySelectorAll('input')]
    .find((i) => (i.placeholder || '').startsWith(prefix));
  if (!el) return false;
  window.__setNative(el, value);
  return true;
};
window.__hasPlaceholder = (prefix) =>
  [...document.querySelectorAll('input')].some((i) => (i.placeholder || '').startsWith(prefix));
window.__getPlaceholder = (prefix) => {
  const el = [...document.querySelectorAll('input')]
    .find((i) => (i.placeholder || '').startsWith(prefix));
  return el ? el.value : null;
};
// 路由表单是单页面表单，不是每块一个 select —— Header 的两个 select 永远在最前。
window.__vendorSelect = () => document.querySelectorAll('header select')[0];
window.__setVendor = (key) => { window.__setNative(window.__vendorSelect(), key); return true; };
window.__preview = () => { const p = document.querySelector('pre'); return p ? p.innerText : null; };
// 认证下拉是「无认证/明文/MD5」那个；页面上的 select 顺序在切厂商时会变
// （型号列表重建），所以按选项文本定位。
window.__setSelectByOption = (optionText, value) => {
  const sel = [...document.querySelectorAll('select')].find((s) =>
    [...s.options].some((o) => o.textContent.trim() === optionText));
  if (!sel) return false;
  window.__setNative(sel, value);
  return true;
};
window.__hasSelectWithOption = (t) =>
  [...document.querySelectorAll('select')].some((s) =>
    [...s.options].some((o) => o.textContent.trim() === t));
true;
`;

const goTo = (win, label) => win.webContents.executeJavaScript(
  `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent===${JSON.stringify(label)}); if(b){b.click();return true;} return false; })()`,
);
const js = (win, code) => win.webContents.executeJavaScript(code);
const preview = (win) => js(win, 'window.__preview()');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 950, show: process.env.E2E_SHOW === '1' });
  await win.loadURL(URL);
  await sleep(1500);
  await js(win, HELPERS);

  try {
    const nav = await goTo(win, '📡路由协议');
    check('能进入路由协议表单', nav, '侧边栏没找到「📡路由协议」按钮');
    await sleep(400);

    // ---------- 1. 开启 OSPF，出现网络行 ----------
    // 前置动作一律断言。这一步就是为了不再重演「点击没生效，被当成功能坏了」。
    check('前置：点到了「+ 启用 OSPF」和「+ 添加网络」',
      (await js(win, `window.__clickText('+ 启用 OSPF')`)) && (await js(win, `window.__clickText('+ 添加网络')`)),
      'OSPF 面板没打开，后面的断言都不成立');
    await sleep(300);
    check('v2 下网络行有三个框：网络地址 / 通配符掩码 / 接口',
      await js(win, `window.__hasPlaceholder('网络地址') && window.__hasPlaceholder('通配符掩码') && window.__hasPlaceholder('接口')`),
      'v2 行没有渲染出预期的三个输入框');
    check('v2 下网络类型与认证控件可见（不是被 v3 的隐藏逻辑误伤）',
      await js(win, `window.__hasSelectWithOption('Broadcast') && window.__hasSelectWithOption('MD5')`),
      'v2 下网络类型/认证下拉不见了');

    // ---------- 2. 填 v2 值，接口名要真的落进思科的命令 ----------
    await js(win, `window.__setByPlaceholder('网络地址', '10.0.0.0')`);
    await js(win, `window.__setByPlaceholder('通配符掩码', '0.0.0.255')`);
    await js(win, `window.__setByPlaceholder('接口', 'GigabitEthernet0/0/1')`);
    await js(win, `window.__setSelectByOption('MD5', 'md5')`);
    await sleep(300);
    await js(win, `window.__setByPlaceholder('密钥', 'SENTKEY')`);
    await js(win, `window.__setVendor('cisco')`);
    await sleep(1200);
    const v2out = await preview(win);
    check('思科 v2：接口名落进接口视图，认证密钥下到该接口',
      v2out && v2out.includes('ip ospf message-digest-key 1 md5 SENTKEY')
        && /interface GigabitEthernet0\/0\/1[\s\S]*ip ospf message-digest-key/.test(v2out),
      `预览：\n${(v2out || '').split('\n').map((l) => '       ' + l).join('\n')}`);
    check('思科 v2：不再输出进程级的 network-type（真机无此命令）',
      v2out && !/^\s*network-type\s/m.test(v2out),
      `预览里仍有 network-type：\n${(v2out || '').split('\n').filter((l) => l.includes('network-type')).join('\n')}`);

    // ---------- 3. 切到 OSPFv3：控件结构要跟着换 ----------
    check('前置：勾上了 OSPFv3（它是 label 里的 checkbox，不是 button）',
      await js(win, `window.__toggleCheckbox('OSPFv3')`),
      '没找到 OSPFv3 复选框');
    await sleep(800);
    check('v3 下「网络地址」框消失，只剩「接口名」',
      (await js(win, `window.__hasPlaceholder('接口名')`))
        && !(await js(win, `window.__hasPlaceholder('网络地址')`))
        && !(await js(win, `window.__hasPlaceholder('通配符掩码')`)),
      'v3 下仍然显示 v2 的网络地址/通配符框，或缺少接口名框');
    check('v3 下网络类型/认证控件被隐藏（填了不会生效的控件不该在）',
      !(await js(win, `window.__hasSelectWithOption('Broadcast')`))
        && !(await js(win, `window.__hasSelectWithOption('MD5')`))
        && !(await js(win, `window.__hasPlaceholder('密钥')`)),
      'v3 下仍能看到网络类型/认证控件 —— 用户会以为填了有用');
    check('v2 填的接口名切到 v3 后仍在（不用重填）',
      (await js(win, `window.__getPlaceholder('接口名')`)) === 'GigabitEthernet0/0/1',
      `实际值：${JSON.stringify(await js(win, `window.__getPlaceholder('接口名')`))}`);

    const v3cisco = await preview(win);
    check('思科 v3：接口级 ipv6 ospf，且不再有 v2 的 network 语句',
      v3cisco && v3cisco.includes('ipv6 router ospf 1')
        && /interface GigabitEthernet0\/0\/1[\s\S]*ipv6 ospf 1 area/.test(v3cisco)
        && !v3cisco.includes('0.0.0.255'),
      `预览：\n${(v3cisco || '').split('\n').map((l) => '       ' + l).join('\n')}`);

    // ---------- 4. 换华为：v3 要用 VRP 的写法 ----------
    await js(win, `window.__setVendor('huawei')`);
    await sleep(1200);
    const v3huawei = await preview(win);
    check('华为 v3：ospfv3 挂在接口上，接口名是刚填的那个',
      v3huawei && /interface GigabitEthernet0\/0\/1[\s\S]*ospfv3 1 area/.test(v3huawei)
        && !v3huawei.includes('2001:db8'),
      `预览：\n${(v3huawei || '').split('\n').map((l) => '       ' + l).join('\n')}`);

    // ---------- 5. 多行不错位 ----------
    // setNet 用闭包捕 i，如果捕错（比如捕成外层最后一次迭代的 i），改第 2 行会写到
    // 第 1 行。加第二行、改第二行的接口名，第 1 行必须原封不动。
    await js(win, `window.__clickText('+ 添加网络')`);
    await sleep(400);
    await js(win, `(() => {
      const els = [...document.querySelectorAll('input')].filter((i) => (i.placeholder || '').startsWith('接口名'));
      if (els[1]) window.__setNative(els[1], 'GigabitEthernet0/0/2');
      return els.length;
    })()`);
    await sleep(1200);
    const two = await preview(win);
    check('两行接口各自成段，改第 2 行不污染第 1 行',
      two && /interface GigabitEthernet0\/0\/1[\s\S]*ospfv3 1 area/.test(two)
        && /interface GigabitEthernet0\/0\/2[\s\S]*ospfv3 1 area/.test(two),
      `预览：\n${(two || '').split('\n').map((l) => '       ' + l).join('\n')}`);
  } catch (e) {
    check('测试脚本自身未抛异常', false, String(e && e.stack || e));
  }

  const bad = results.filter((r) => !r.ok);
  console.log(`\n${bad.length ? '❌' : '✅'} 路由表单界面接线：${results.length - bad.length}/${results.length} 通过`);
  app.exit(bad.length ? 1 : 0);
});
