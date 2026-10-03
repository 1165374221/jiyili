// 技毅力 —— Electron 主进程（打包成 exe 时由 electron-builder 作为入口）
//
// 它只做四件事：
//   1. 单实例：第二次双击时把已有窗口叫到前台，而不是让两个进程抢 3001 端口
//   2. 在【同一个进程里】require 后端 server/index.cjs（它自己会 listen 3001）
//   3. 开一个窗口加载 http://127.0.0.1:3001
//   4. 关窗即退出，并把 http server 关掉（否则端口要等进程完全退出才释放）
//
// 为什么后端跑在同一个进程里，而不是 spawn 一个子进程：
//   - 打包后没有独立的 node 可执行文件，spawn 得借 `process.execPath` +
//     ELECTRON_RUN_AS_NODE，还要处理 asar 内的路径、就绪探测、退出时杀子进程，
//     复杂度陡增；
//   - 后端本身是单进程 express + ws，没有需要隔离的东西，且 generate/execute
//     这些入口都已经用 try/catch 兜住（server/index.cjs 里有注释说明为什么）。
//   代价：后端真的崩了会带走整个 app。对一个本地工具来说，这个代价可以接受 ——
//   而且崩溃会立刻被用户看到，比"界面还在但命令生成失效"更好排查。
//
// 冒烟自检：设 JIYILI_SMOKE=1 启动 → 不显示窗口，等窗口加载完成后打印一行
// 结果并退出。这样在没有图形界面的环境（CI、远程会话）也能验证主进程链路。

const { app, BrowserWindow, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');

const PORT = 3001;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SERVER_ENTRY = path.join(__dirname, '..', 'server', 'index.cjs');
const CORE_ENTRY = path.join(__dirname, '..', 'server', 'core', 'index.cjs');

const SMOKE = process.env.JIYILI_SMOKE === '1';
const IS_DEV = !app.isPackaged;

/** 端口是否已经被别人占着（比如用户同时开着"浏览器 + start.bat"那套） */
function isPortBusy(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (busy) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** 轮询 /api/status 直到后端真的能应答（listen 是异步的，直接 loadURL 会白屏） */
function waitForServer(deadlineMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${BASE_URL}/api/status`, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - started > deadlineMs) reject(new Error('后端 15 秒内没有就绪'));
        else setTimeout(tick, 250);
      });
      req.setTimeout(1000, () => req.destroy());
    };
    tick();
  });
}

function fail(title, detail) {
  if (SMOKE) {
    console.error(`[smoke] ✗ ${title}\n${detail}`);
    app.exit(1);
    return;
  }
  dialog.showErrorBox(title, detail);
  app.exit(1);
}

function startServer() {
  // 核心未构建时 server/index.cjs 会 process.exit(1) —— 在 Electron 里那等于
  // 整个 app 静默消失，用户只看到"双击没反应"。所以先自己检查并给出可操作的提示。
  if (!require('node:fs').existsSync(CORE_ENTRY)) {
    fail(
      '技毅力无法启动：缺少命令生成核心',
      [
        '缺少文件：server/core/index.cjs',
        '',
        '这是个构建产物，交付包里应该有。若你在开发机上从源码运行：',
        '    npm run build:core        （交付用：esbuild + 混淆）',
        '    npm run build:core:dev    （本机调试：不混淆）',
      ].join('\n'),
    );
    return false;
  }
  require(SERVER_ENTRY);
  return true;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false, // 先隐藏，等 ready-to-show 再显示，避免白屏一闪
    backgroundColor: '#10141a',
    autoHideMenuBar: true,
    title: '技毅力',
    webPreferences: {
      // 渲染层就是我们自己的本地网页，它通过 HTTP / WebSocket 跟后端说话，
      // 不需要任何 Node 能力。这三条是 Electron 的安全底线，别为了图方便打开。
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // 生产包关掉 devtools：不然 F12 就能看前端源码（前端不含核心逻辑，
      // 但也没必要白送）。开发模式下留着方便调试。
      devTools: IS_DEV,
    },
  });

  Menu.setApplicationMenu(null); // 默认菜单里有 devtools/reload，本地工具不需要

  // 任何 window.open / target=_blank 都交给系统浏览器，不在 app 里开新窗口。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 窗口只允许停在本地服务上；点了外链就走系统浏览器（防止窗口被导航走、
  // 也防止本地页面变成某个远程站点的壳）。
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(BASE_URL)) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.once('ready-to-show', () => {
    if (!SMOKE) win.show();
  });

  return win;
}

async function bootstrap() {
  // ---- 后端 ----
  if (await isPortBusy(PORT)) {
    fail(
      `技毅力无法启动：端口 ${PORT} 已被占用`,
      [
        `127.0.0.1:${PORT} 上已经有程序在监听。`,
        '',
        '常见原因：另一个技毅力窗口还在后台运行（先关掉它），',
        '或者你用 start.bat 那套方式开着浏览器版（先停掉那个命令行窗口）。',
        '',
        '也可以在命令行执行 netstat -ano | findstr :3001 看看是谁占着。',
      ].join('\n'),
    );
    return;
  }
  if (!startServer()) return;

  try {
    await waitForServer();
  } catch (err) {
    fail('技毅力无法启动：后端没有就绪', String(err));
    return;
  }

  const win = createWindow();

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    // 本地页面加载失败基本只有一个原因：后端没起来。把错误显示出来，
    // 比留一个白窗口强。
    console.error(`[load-failed] ${code} ${desc} ${url}`);
  });

  win.loadURL(BASE_URL);

  if (SMOKE) {
    win.webContents.once('did-finish-load', async () => {
      const title = win.webContents.getTitle();
      const status = await new Promise((resolve) => {
        http
          .get(`${BASE_URL}/api/status`, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve(body.trim()));
          })
          .on('error', () => resolve('(取不到)'));
      });
      console.log(`[smoke] ✅ 主进程链路 OK`);
      console.log(`[smoke]    窗口标题 = ${title}`);
      console.log(`[smoke]    /api/status = ${status}`);
      app.exit(0);
    });
  }
}

// 单实例：第二次双击时不再开新进程，而是把已有窗口叫到前台。
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // Windows 任务栏图标归组用，和 build.appId 保持一致。
  app.setAppUserModelId('com.jiyili.switch-tool');

  app.whenReady().then(bootstrap);

  // 关掉窗口就退出（这是单窗口工具，不是 macOS 那种"关窗留进程"的应用）。
  app.on('window-all-closed', () => app.quit());
}
