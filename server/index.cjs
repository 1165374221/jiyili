const http = require('http');
const express = require('express');
const { Client } = require('ssh2');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const path = require('path');

// 兼容老旧网络设备（如 H3C Comware 5/7、华为 VRP 老版本）的算法集。
// 这些设备通常只支持 ssh-rsa / aes128-cbc / group14-sha1 / hmac-sha1，
// 而 ssh2 默认算法集已不含 aes128-cbc，会导致握手失败"连上就断"。
const LEGACY_ALGORITHMS = {
  kex: [
    'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521',
    'diffie-hellman-group-exchange-sha256',
    'diffie-hellman-group14-sha256', 'diffie-hellman-group16-sha512', 'diffie-hellman-group18-sha512',
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha1',
    'diffie-hellman-group1-sha1',
  ],
  cipher: [
    'chacha20-poly1305@openssh.com',
    'aes128-gcm@openssh.com', 'aes256-gcm@openssh.com',
    'aes128-ctr', 'aes192-ctr', 'aes256-ctr',
    'aes128-cbc', 'aes192-cbc', 'aes256-cbc', '3des-cbc',
  ],
  serverHostKey: [
    'ssh-ed25519',
    'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521',
    'rsa-sha2-512', 'rsa-sha2-256',
    'ssh-rsa', 'ssh-dss',
  ],
  hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1', 'hmac-md5'],
};

function sshConnectOpts({ host, port, username, password }) {
  return {
    host, port, username, password,
    readyTimeout: 15000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3,
    algorithms: LEGACY_ALGORITHMS,
    tryKeyboard: true,
  };
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend static files
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

const server = http.createServer(app);

// ---- WebSocket server for interactive shell ----
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const mode = url.searchParams.get('mode') || 'ssh';

  // Serial mode
  if (mode === 'serial') {
    console.log('[SERIAL] Client connected');
    const portPath = url.searchParams.get('path') || 'COM1';
    const baudRate = parseInt(url.searchParams.get('baudRate') || '9600');
    handleSerialWS(ws, portPath, baudRate);
    return;
  }

  // SSH mode (default)
  console.log('WebSocket client connected');
  const host = url.searchParams.get('host') || '192.168.1.1';
  const port = parseInt(url.searchParams.get('port') || '22');
  const username = url.searchParams.get('username') || 'admin';
  const password = url.searchParams.get('password') || '';

  const ssh = new Client();

  ssh.on('ready', () => {
    ws.send('\r\n\x1b[32m=== 已连接到 ' + host + ' ===\x1b[0m\r\n\r\n');

    ssh.shell({ rows: 40, cols: 120, term: 'vt100' }, (err, stream) => {
      if (err) {
        ws.send('\r\n\x1b[31mShell 创建失败: ' + err.message + '\x1b[0m\r\n');
        ws.close();
        return;
      }

      // H3C 等设备 shell 建立后不会主动推送提示符，发个回车唤醒
      setTimeout(() => { try { stream.write('\r\n'); } catch {} }, 300);

      // SSH output -> WebSocket
      stream.on('data', (data) => {
        if (ws.readyState === 1) {
          ws.send(data.toString());
        }
      });

      stream.stderr.on('data', (data) => {
        if (ws.readyState === 1) {
          ws.send(data.toString());
        }
      });

      // WebSocket input -> SSH
      ws.on('message', (msg) => {
        try {
          const { type, data } = JSON.parse(msg.toString());
          if (type === 'input') {
            stream.write(data);
          } else if (type === 'resize') {
            stream.setWindow(data.rows, data.cols);
          }
        } catch {
          // raw input
          stream.write(msg.toString());
        }
      });

      ws.on('close', () => {
        stream.close();
        ssh.end();
      });

      stream.on('close', () => {
        ssh.end();
        ws.close();
      });
    });
  });

  ssh.on('error', (err) => {
    ws.send('\r\n\x1b[31m连接失败: ' + err.message + '\x1b[0m\r\n');
    ws.close();
  });

  ssh.on('close', () => {
    if (ws.readyState === 1) {
      ws.send('\r\n\x1b[33m=== 连接已断开 ===\x1b[0m\r\n');
      ws.close();
    }
  });

  ws.on('close', () => {
    try { ssh.end(); } catch {}
  });

  ssh.on('keyboard-interactive', (_n, _i, _l, _p, finish) => finish([password]));

  ssh.connect(sshConnectOpts({ host, port, username, password }));
});

// ---- Serial port helper ----
const { SerialPort } = require('serialport');

function handleSerialWS(ws, portPath, baudRate) {
  console.log('[SERIAL] Opening', portPath, '@', baudRate);

  let serial = null;
  try {
    serial = new SerialPort({ path: portPath, baudRate, autoOpen: false });
  } catch (err) {
    console.log('[SERIAL] Constructor error:', err.message);
    ws.send('\r\n\x1b[31m串口创建失败: ' + err.message + '\x1b[0m\r\n', () => ws.close(1000));
    return;
  }

  // Register WebSocket message handler early (before port is open)
  const msgQueue = [];
  let portReady = false;

  ws.on('message', (msg) => {
    let data;
    try {
      const parsed = JSON.parse(msg.toString());
      data = parsed.data || msg.toString();
    } catch {
      data = msg.toString();
    }

    console.log('[SERIAL] WS -> Serial:', JSON.stringify(data));
    if (portReady && serial && serial.isOpen) {
      serial.write(data);
    } else {
      msgQueue.push(data);
    }
  });

  ws.on('close', () => {
    console.log('[SERIAL] WS closed');
    if (serial && serial.isOpen) serial.close();
  });

  serial.open((err) => {
    if (err) {
      console.log('[SERIAL] Open error:', err.message);
      ws.send('\r\n\x1b[31m串口打开失败: ' + err.message + '\x1b[0m\r\n', () => ws.close(1000));
      return;
    }
    console.log('[SERIAL] Port opened');
    portReady = true;

    // Flush queued messages
    if (msgQueue.length > 0) {
      console.log('[SERIAL] Flushing', msgQueue.length, 'queued messages');
      msgQueue.forEach((d) => serial.write(d));
      msgQueue.length = 0;
    }

    ws.send('\r\n\x1b[32m=== 已连接到 ' + portPath + ' @ ' + baudRate + ' ===\x1b[0m\r\n\r\n');

    let buf = '';
    let flushTimer = null;
    serial.on('data', (data) => {
      buf += data.toString();
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        const chunk = buf;
        buf = '';
        console.log('[SERIAL] Serial -> WS chunk:', chunk.length, 'chars');
        if (ws.readyState === 1) ws.send(chunk);
      }, 50);
    });

    serial.on('error', (err) => {
      console.log('[SERIAL] Error:', err.message);
      if (ws.readyState === 1) ws.send('\r\n\x1b[31m串口错误: ' + err.message + '\x1b[0m\r\n');
    });

    serial.on('close', () => {
      console.log('[SERIAL] Port closed');
      if (flushTimer) clearTimeout(flushTimer);
      if (buf && ws.readyState === 1) ws.send(buf);
      buf = '';
      if (ws.readyState === 1) {
        ws.send('\r\n\x1b[33m=== 串口已断开 ===\x1b[0m\r\n', () => ws.close(1000));
      }
    });
  });
}

// ---- REST API for form command execution ----
let sshClient = null;
let sshConnected = false;

app.post('/api/connect', (req, res) => {
  const { host, port, username, password } = req.body;

  if (sshClient) {
    try { sshClient.end(); } catch {}
    sshClient = null;
    sshConnected = false;
  }

  sshClient = new Client();
  let responded = false;

  sshClient.on('ready', () => {
    sshConnected = true;
    if (!responded) { responded = true; res.json({ success: true, message: `已连接到 ${host}` }); }
  });

  sshClient.on('error', (err) => {
    sshConnected = false;
    if (!responded) { responded = true; res.json({ success: false, message: `连接失败: ${err.message}` }); }
  });

  sshClient.on('close', () => {
    sshConnected = false;
    sshClient = null;
  });

  sshClient.on('keyboard-interactive', (_n, _i, _l, _p, finish) => finish([password]));

  sshClient.connect(sshConnectOpts({ host, port: port || 22, username: username || 'admin', password }));
});

app.post('/api/disconnect', (req, res) => {
  if (sshClient) { sshClient.end(); sshClient = null; sshConnected = false; }
  res.json({ success: true, message: '已断开连接' });
});

app.post('/api/execute', (req, res) => {
  const { command } = req.body;
  if (!sshClient || !sshConnected) {
    return res.json({ success: false, message: '未连接设备，请先连接' });
  }

  const commands = command.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (commands.length === 0) {
    return res.json({ success: false, message: '没有可执行的命令' });
  }

  sshClient.exec(commands.join('\n') + '\n', (err, stream) => {
    if (err) return res.json({ success: false, message: `执行失败: ${err.message}` });

    let output = '', errOutput = '';
    stream.on('data', (data) => { output += data.toString(); });
    stream.stderr.on('data', (data) => { errOutput += data.toString(); });
    stream.on('close', () => {
      res.json({
        success: true,
        message: '命令已执行',
        output: (output + errOutput).trim() || '(无输出)',
      });
    });
  });
});

// ---- 命令生成核心 ----
// 厂商 CLI 生成逻辑（原 src/vendors/** 2127 行 + src/parser.ts）已下沉到
// server/core/，前端 bundle 里不再有明文命令模板。index.cjs 是构建产物
// （npm run build:core），不入版本库。
let core;
try {
  core = require('./core/index.cjs');
} catch {
  console.error('');
  console.error('  [启动失败] 缺少 server/core/index.cjs —— 命令生成核心未构建。');
  console.error('  开发机:   npm run build:core');
  console.error('  客户机:   交付包不完整（漏了 server/core/index.cjs），请重新打包。');
  console.error('');
  process.exit(1);
}

const MAX_BLOCKS = 64;

// parseAndGenerate 里的正则以 \S+ 起头，回溯代价随输入长度上升。单段 2000
// 字符已远超任何真实命令，却能把最坏情况压到微秒级。这不是洁癖：本进程同时
// 挂着 SSH / 串口的 WebSocket，一次主线程卡顿会把客户正在操作的交换机终端
// 一起僵住。
const MAX_QUICK_LEN = 2000;

app.post('/api/generate', (req, res) => {
  const { vendor, modelId, blocks } = req.body || {};

  if (!core.isVendor(vendor)) {
    return res.json({ success: false, message: `未知厂商：${vendor}` });
  }
  if (!Array.isArray(blocks)) {
    return res.json({ success: false, message: 'blocks 必须是数组' });
  }
  if (blocks.length > MAX_BLOCKS) {
    return res.json({ success: false, message: `配置段过多（上限 ${MAX_BLOCKS} 段）` });
  }
  for (const b of blocks) {
    if (!b || typeof b.type !== 'string') {
      return res.json({ success: false, message: '每个配置段都必须带字符串 type' });
    }
    if (b.type === 'quickcmd') {
      if (typeof b.params !== 'string') {
        return res.json({ success: false, message: 'quickcmd 段的 params 必须是字符串' });
      }
      if (b.params.length > MAX_QUICK_LEN) {
        return res.json({ success: false, message: `快速命令过长（上限 ${MAX_QUICK_LEN} 字符）` });
      }
    }
  }

  // modelId 交给 generateAll 按 DEVICE_MODELS[vendor] 白名单解析成 portPrefix。
  // 不接受客户端直传前缀——那等于允许注入任意端口名。型号查不到时退回厂商类
  // 初始前缀（与改造前逐字节一致），不报错。
  try {
    const r = core.generateAll(vendor, modelId, blocks);
    res.json({ success: true, command: r.command, applied: r.applied });
  } catch (err) {
    // 参数形状不对（比如 vlan 段给了 null）在这里兜住，绝不能掀翻进程——
    // 同一进程里还挂着客户正在用的 SSH / 串口连接。
    res.json({ success: false, message: `生成失败：${err.message}` });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ connected: sshConnected });
});

const os = require('os');
const PORT = 3001;
server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  let lanIp = '127.0.0.1';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { lanIp = net.address; break; }
    }
    if (lanIp !== '127.0.0.1') break;
  }
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   技毅力 - 服务已启动                ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log('  ║  本机: http://localhost:3001         ║');
  console.log(`  ║  局域网: http://${lanIp}:3001   ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});
