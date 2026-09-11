// 真实 Chromium 里验证「快速命令」未识别时的体验。
//
//   npx electron tests/e2e-quickcmd.cjs
//
// 一定要用真浏览器跑，不要靠读代码下结论：上一轮就是我先断言「已修好」，
// 用户回了一句「还是没解决掉」。真键盘事件走 sendInputEvent，让 React 的
// onChange 真的触发。
//
// ⚠️ 已知局限：sendInputEvent 的 char 事件【绕过输入法】。所以中文输入法特有的
// 问题（如「中文标点」模式打出全角字符）在这里复现不了，那部分由 golden 的
// 全角断言覆盖。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const shot = async (win, name) => {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, `e2e-${name}.png`), img.toPNG());
};

const URL = process.env.E2E_URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${cond ? '' : '\n       ' + detail}`);
}

async function typeInto(win, selector, text) {
  await win.webContents.executeJavaScript(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.focus(); el.select?.(); return !!el; })()`,
  );
  // 先清空
  await win.webContents.executeJavaScript(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value=''; return 1; })()`,
  );
  await sleep(50);
  for (const ch of text) {
    win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    await sleep(20);
  }
  await sleep(300);
}

const snapshot = (win) => win.webContents.executeJavaScript(`(() => {
  const pre = document.querySelector('pre');
  const ta = document.querySelector('textarea');
  const body = document.body.innerText;
  return {
    hint: body.includes('还没识别出命令'),
    textarea: ta ? ta.value : null,
    preview: pre ? pre.innerText : null,
    appliedLine: (body.match(/已配置：[^\\n]*/) || [''])[0],
    hasToggle: body.includes('查看全部支持的写法') || body.includes('收起完整语法表'),
    hasWall: body.includes('无法识别命令'),
  };
})()`);

app.whenReady().then(async () => {
  // 截图要求窗口可见：隐藏窗口不参与合成，capturePage 会返回打字之前的旧帧，
  // 截出来的图看着像「什么都没输入」，与 DOM 断言结果自相矛盾。
  // 但平时跑没必要占用户桌面，所以默认隐藏，要截图时 E2E_SHOW=1。
  const win = new BrowserWindow({ width: 1280, height: 900, show: process.env.E2E_SHOW === '1' });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    // 只收真正的 error（3）。level 2 的 warning 里混着 Electron 自己的开发期
    // 安全提示（CSP"unsafe-eval"），那是壳的告警不是应用的错，计入会让这条
    // 断言永远红着、也就永远没人看。
    if (level >= 3 && !message.includes('Electron Security Warning')) errors.push(message);
  });

  try {
    await win.loadURL(URL);
    await sleep(1200);

    // 侧边栏条目 textContent 是「⚡快速命令」，所以用 includes 而不是相等。
    const clicked = await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('快速命令'));
      if (b) { b.click(); return true; } return false;
    })()`);
    check('侧边栏「快速命令」可点击', clicked, '没找到按钮');
    await sleep(500);

    // --- 1. 未识别输入 ---
    await typeInto(win, 'textarea', 'zzz abc');
    await shot(win, 'junk');
    const junk = await snapshot(win);
    check('未识别：显示一行提示', junk.hint, JSON.stringify(junk));
    check('未识别：预览区不再出现帮助文本',
      !junk.hasWall && !(junk.preview || '').includes('无法识别'), JSON.stringify(junk));
    check('未识别：示例区仍然可见（提示里说的「下方示例」确实存在）',
      junk.hasToggle, JSON.stringify(junk));

    // --- 2. 敲成合法命令后提示应当消失 ---
    await typeInto(win, 'textarea', 'vlan 100 port 1-10 access');
    const good = await snapshot(win);
    check('合法命令：提示消失', !good.hint, JSON.stringify(good));
    check('合法命令：预览出现完整 CLI',
      (good.preview || '').includes('system-view') && (good.preview || '').includes('vlan 100'),
      JSON.stringify(good));
    check('合法命令：已配置记为 quickcmd', good.appliedLine.includes('quickcmd'), good.appliedLine);

    // --- 3. 中文写法也能识别（用户在意的「支持中英文」）---
    await typeInto(win, 'textarea', '端口安全 G0/0/1 最大 3 粘贴');
    const cn = await snapshot(win);
    check('中文写法：能识别，不显示提示', !cn.hint && (cn.preview || '').includes('port-security'),
      JSON.stringify(cn));

    // --- 4. 展开完整语法表 ---
    const toggled = await win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('查看全部支持的写法'));
      if (b) { b.click(); return true; } return false;
    })()`);
    await sleep(300);
    const expanded = await win.webContents.executeJavaScript(`document.body.innerText`);
    check('语法表可展开且列出全部 13 组', toggled && expanded.includes('VLAN 加端口') && expanded.includes('LLDP 邻居'),
      `toggled=${toggled}`);

    check('页面无 console 报错', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('测试执行未抛异常', false, err.message);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} 项通过，${failed} 项失败`);
  app.exit(failed ? 1 : 0);
});

// 兜底：任何情况下 60 秒后强退，别把 CI/终端挂住。
setTimeout(() => { console.error('超时强退'); app.exit(2); }, 60000).unref?.();
