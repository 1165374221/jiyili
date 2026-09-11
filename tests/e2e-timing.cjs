// 步骤 4b 的时序安全验证。
//
//   npx electron tests/e2e-timing.cjs
//
// 4b 把生成从「同步本地」改成「防抖 200ms + fetch」，由此引入了一类新风险：
// 防抖窗口内 command 还是上一版。而「下发命令」会把它推到【现场交换机】上。
// 这不是界面小瑕疵，是把过期配置写进生产设备。
//
// 「下发命令」要求 SSH 已连真实设备，测试里造不出来；但下发与复制走的是同一个
// flush()，所以这里用【复制】做代理 —— 改完值立刻点复制，拿到的必须是新命令。
// 这直接证明 flush 生效，而下发正是靠它。
//
// 关于剪贴板：这里【拦截】 navigator.clipboard.writeText 而不是真写剪贴板。
// 原因是被测对象是「复制路径算出的是哪条命令」，不是「Chromium 写不写得进剪贴板」，
// 而隐藏窗口没有焦点，真的 writeText 会 reject，于是走进 execCommand 兜底路径，
// 测出来的是兜底逻辑而不是 flush。拦截点正好在两者分叉之前。若哪天要连兜底一起
// 验，用 E2E_SHOW=1 带窗口跑。
//
// 最后一段会在运行中掐掉后端，用来验证「失败时保留最后一条成功命令」。
// 因此跑完这个脚本后端是停的，外部需要重新拉起。
const { app, BrowserWindow } = require('electron');
const { execSync } = require('node:child_process');

const URL = process.env.E2E_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${cond ? '' : '\n       ' + detail}`);
}

// 页面内工具。__setNative 走原型上的 value setter —— React 会劫持 input.value
// 的赋值，直接 el.value = x 不会触发 onChange。
const HELPERS = `
window.__setNative = (el, value) => {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
// 按 label 文本定位控件。比 input[type=number] 这类猜测稳：VLAN 表单的 ID 框
// 其实是 type="text"，而页面上还有设备连接的 IP/端口等一堆别的输入框。
window.__setByLabel = (labelText, value) => {
  const lab = [...document.querySelectorAll('label')]
    .find((l) => l.textContent.trim().startsWith(labelText));
  if (!lab) return false;
  const el = lab.parentElement.querySelector('input, select, textarea');
  if (!el) return false;
  window.__setNative(el, value);
  return true;
};
// 从这一刻起把「复制到剪贴板」的内容扣在页面里，供主进程读取。
window.__captureCopy = () => {
  window.__copied = null;
  navigator.clipboard.writeText = async (t) => { window.__copied = t; };
};
window.__snapshot = () => {
  const pre = document.querySelector('pre');
  const sels = [...document.querySelectorAll('select')];
  return {
    vendor: sels[0] ? sels[0].options[sels[0].selectedIndex].text : null,
    model: sels[1] ? sels[1].options[sels[1].selectedIndex].text : null,
    preview: pre ? pre.innerText : null,
    badge: (document.body.innerText.match(/(\\d+) 段/) || [])[1] || null,
    error: (document.body.innerText.match(/生成失败：[^\\n]*/) || [''])[0],
  };
};
window.__clickCopy = () => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('复制命令'));
  if (!b) return false;
  b.click();
  return true;
};
// executeJavaScript 会把最后一条语句的值序列化回主进程，函数不可结构化克隆，
// 所以补一个可克隆的字面量收尾。
true;
`;

const goTo = (win, label) => win.webContents.executeJavaScript(
  `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent===${JSON.stringify(label)}); if(b){b.click();return true;} return false; })()`,
);
const snap = (win) => win.webContents.executeJavaScript('window.__snapshot()');
const copied = (win) => win.webContents.executeJavaScript('window.__copied');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 950, show: process.env.E2E_SHOW === '1' });
  await win.loadURL(URL);
  await sleep(1500);
  await win.webContents.executeJavaScript(HELPERS);
  await win.webContents.executeJavaScript('window.__captureCopy()');

  try {
    // ---------- 1. 复制前 flush：改完立刻复制，拿到的必须是新版 ----------
    await goTo(win, '🔀VLAN / 端口');
    await sleep(400);
    await win.webContents.executeJavaScript(`window.__setByLabel('VLAN ID', '55')`);
    await sleep(900);                                   // 让防抖结算完
    const before = await snap(win);
    check('前置：改完 VLAN ID 后已生成，且用的是所选型号的端口前缀',
      before.preview && before.preview.includes('vlan 55') && before.preview.includes('GigabitEthernet0/0/1'),
      JSON.stringify(before));

    // 关键一步：改完【不等防抖】（200ms），立刻点复制。
    // 旧实现此时拿到的是上一版（vlan 55），新实现应当现算出 vlan 777。
    await win.webContents.executeJavaScript(`window.__setByLabel('VLAN ID', '777')`);
    await win.webContents.executeJavaScript('window.__clickCopy()');
    await sleep(1200);
    const got = await copied(win);
    check('改完立刻复制 → 拿到的是【新】命令，不是上一版',
      typeof got === 'string' && got.includes('vlan 777') && !got.includes('vlan 55'),
      `实际复制内容：${JSON.stringify(got && got.slice(0, 160))}`);
    check('复制到的确实是完整配置块（不是空串或错误文本）',
      typeof got === 'string' && got.includes('system-view') && got.includes('interface'),
      `实际复制内容：${JSON.stringify(got && got.slice(0, 160))}`);

    // ---------- 2. 连打后收敛到最后一次输入 ----------
    for (const v of ['11', '22', '33', '44', '55']) {
      await win.webContents.executeJavaScript(`window.__setByLabel('VLAN ID', ${JSON.stringify(v)})`);
      await sleep(30);                                  // 远小于 200ms 防抖窗口，制造连打
    }
    await sleep(1000);
    const settled = await snap(win);
    check('连打 5 次后收敛到最后一次输入（55），不是中间值',
      settled.preview && settled.preview.includes('vlan 55') && !settled.preview.includes('vlan 44'),
      JSON.stringify(settled.preview && settled.preview.slice(0, 200)));

    // ---------- 3. 切厂商必须重算 ----------
    const hw = await snap(win);
    await win.webContents.executeJavaScript(
      `window.__setNative([...document.querySelectorAll('select')][0], 'ruijie')`);
    await sleep(1000);
    const rj = await snap(win);
    check('切厂商后重算，端口前缀随之改变（锐捷是带空格的 GigabitEthernet 0/）',
      rj.preview && rj.preview.includes('GigabitEthernet 0/1') && !rj.preview.includes('GigabitEthernet0/0/'),
      `华为：${JSON.stringify(hw.preview && hw.preview.slice(0, 90))}\n       锐捷：${JSON.stringify(rj.preview && rj.preview.slice(0, 90))}`);

    // ---------- 4. bug #5：切厂商要重置型号 ----------
    check('切厂商后型号被重置为该厂商的默认型号，而不是留着上一家的',
      rj.model !== hw.model && rj.vendor.includes('锐捷') && rj.model.includes('RG-S2900'),
      `切前 厂商/型号=${hw.vendor}/${hw.model}；切后=${rj.vendor}/${rj.model}`);

    // ---------- 5. 失败路径：保留最后一条成功命令，且不复制过期内容 ----------
    const good = await snap(win);
    check('前置：断开后端前有一条成功命令', good.badge !== '0' && good.preview.length > 0, JSON.stringify(good));

    const pid = execSync('netstat -ano | findstr LISTENING | findstr :3001',
      { encoding: 'utf8', shell: 'cmd.exe' }).trim().split(/\s+/).pop();
    execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', shell: 'cmd.exe' });
    await sleep(600);

    await win.webContents.executeJavaScript(`window.__setByLabel('VLAN ID', '9')`);
    await sleep(1500);

    const broken = await snap(win);
    check('后端挂掉后：显示错误提示', broken.error.includes('生成失败'), JSON.stringify(broken.error));
    check('后端挂掉后：【保留】最后一条成功命令，不清空预览',
      broken.preview === good.preview && broken.preview.length > 0,
      `断前 ${JSON.stringify(good.preview.slice(0, 100))}\n       断后 ${JSON.stringify(broken.preview.slice(0, 100))}`);
    check('后端挂掉后：提示是可读中文，不是 JSON 解析异常',
      broken.error.includes('请确认后端已启动') && !/Unexpected|JSON/.test(broken.error),
      JSON.stringify(broken.error));

    // 生成失败时点复制：绝不能把上一版命令复制出去 —— 那正是会下发到设备的路径。
    await win.webContents.executeJavaScript('window.__captureCopy()');   // 清掉上次捕获
    await win.webContents.executeJavaScript('window.__clickCopy()');
    await sleep(800);
    const stale = await copied(win);
    check('后端挂掉后点复制 → 什么都不写，绝不复制过期命令',
      stale === null,
      `实际复制内容：${JSON.stringify(stale && stale.slice(0, 120))}`);
  } catch (err) {
    check('测试执行未抛异常', false, err.stack || err.message);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} 项通过，${failed} 项失败`);
  console.log('注意：本脚本最后会掐掉 3001 后端，跑完需自行重新拉起。');
  app.exit(failed ? 1 : 0);
});

setTimeout(() => { console.error('超时强退'); app.exit(2); }, 180000).unref?.();
