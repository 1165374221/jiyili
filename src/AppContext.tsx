import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import type { Vendor, ConfigType, DeviceModel } from './types';
import { DEVICE_MODELS } from './types';
// 仍是客户端本地生成，但已经是"参数上行、命令下行"：21 个表单只上报 params，
// 命令统一在 CommandProvider 里生成。步骤 4b 会把这一处换成 fetch /api/generate，
// 届时前端不再 import 任何厂商代码。
import { generateAll } from '../server/core/index';
import type { GenerateBlock } from '../server/core/index';

interface AppState {
  vendor: Vendor;
  configType: ConfigType;
  model: DeviceModel;
  setVendor: (v: Vendor) => void;
  setConfigType: (t: ConfigType) => void;
  setModel: (m: DeviceModel) => void;
  vendorList: { key: Vendor; name: string }[];
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [vendor, setVendor] = useState<Vendor>('huawei');
  const [configType, setConfigType] = useState<ConfigType>('vlan');
  const [model, setModel] = useState<DeviceModel>(DEVICE_MODELS['huawei'][0]);

  const vendorList: { key: Vendor; name: string }[] = [
    { key: 'huawei', name: '华为 Huawei' },
    { key: 'h3c', name: 'H3C 华三' },
    { key: 'cisco', name: 'Cisco 思科' },
    { key: 'ruijie', name: '锐捷 Ruijie' },
  ];

  return (
    <AppContext.Provider
      value={{
        vendor,
        configType,
        model,
        setVendor,
        setConfigType,
        setModel,
        vendorList,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}

// ---- Command context（参数上行、命令下行）----
//
// 旧实现是每个表单在自己的 onChange 里同步调 vendorInstance.generateXxxConfig，
// 21 个调用点各自算一份命令文本。改成表单只上报 params、命令在这里统一生成，
// 是因为步骤 4b 要在这里做防抖 + 竞态保护，而且「下发前必须先 flush 挂起的
// 生成请求」也需要一个单一入口——散在 21 个表单里做不到。
interface CommandState {
  command: string;
  applied: string[];
  error: string;
  report: (type: ConfigType, params: unknown) => void;
  clear: () => void;
}

const CommandContext = createContext<CommandState | null>(null);

export function CommandProvider({ children }: { children: ReactNode }) {
  const { vendor, model } = useApp();

  // 用户「碰过」的表单 → 最新 params，按首次触碰顺序。给已有 key 赋值不会改变
  // 它的位置，所以这个顺序与旧实现 bag 对象的插入序一致——而顺序是有意义的，
  // 段的先后决定了生成出来的配置块先后。
  //
  // 语义提醒：这里的键是「用户碰过」，不是「有输出」。旧实现用
  // filter(([, v]) => v) 过滤的是生成出的命令文本是否为空，而 params 对象永远
  // 为真，所以那个过滤在改成 params 上行后会失效。哪些段真正产出了命令，以
  // applied（服务端算的）为准。
  const bag = useRef<Record<string, GenerateBlock>>({});

  const [out, setOut] = useState<{ command: string; applied: string[]; error: string }>({
    command: '', applied: [], error: '',
  });

  const regenerate = useCallback(() => {
    const blocks = Object.values(bag.current);
    if (blocks.length === 0) {
      // 返回同一个引用，避免空转时多一次渲染
      setOut((prev) => (prev.command === '' && prev.applied.length === 0 && prev.error === ''
        ? prev
        : { command: '', applied: [], error: '' }));
      return;
    }
    try {
      const r = generateAll(vendor, model.id, blocks);
      setOut({ command: r.command, applied: r.applied, error: '' });
    } catch (err) {
      // 保留上一条成功命令，只叠加错误提示。清空 command 会让用户对着空白预览
      // 点「下发命令」，把空配置推给现场设备。
      setOut((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [vendor, model.id]);

  const report = useCallback((type: ConfigType, params: unknown) => {
    bag.current[type] = { type, params };
    regenerate();
  }, [regenerate]);

  const clear = useCallback(() => {
    bag.current = {};
    setOut({ command: '', applied: [], error: '' });
  }, []);

  // 切厂商/型号后必须重算。旧实现靠 detectVendor 从命令文本猜厂商，切厂商
  // 根本不会重算（bug #3）；型号更是对生成结果毫无影响（bug #1）。
  useEffect(() => { regenerate(); }, [regenerate]);

  return (
    <CommandContext.Provider
      value={{ command: out.command, applied: out.applied, error: out.error, report, clear }}
    >
      {children}
    </CommandContext.Provider>
  );
}

export function useCommand() {
  const ctx = useContext(CommandContext);
  if (!ctx) throw new Error('useCommand must be inside CommandProvider');
  return ctx;
}

// ---- Console context (SSH / Serial WebSocket state) ----

function apiBase() {
  if (typeof window === 'undefined') return '';
  return window.location.port === '5173' ? 'http://localhost:3001' : '';
}
function wsBase() {
  if (typeof window === 'undefined') return 'ws://localhost:3001';
  return window.location.port === '5173' ? 'ws://localhost:3001' : `ws://${window.location.host}`;
}
const API = apiBase();
const WS_URL = `${wsBase()}/ws`;

interface ConsoleState {
  connMode: 'ssh' | 'serial';
  host: string;
  port: string;
  username: string;
  password: string;
  serialPath: string;
  serialBaud: string;
  connected: boolean;
  loading: boolean;
  status: string;
  output: string;
  consoleMode: boolean;
  inputLine: string;
  setConnMode: (m: 'ssh' | 'serial') => void;
  setHost: (v: string) => void;
  setPort: (v: string) => void;
  setUsername: (v: string) => void;
  setPassword: (v: string) => void;
  setSerialPath: (v: string) => void;
  setSerialBaud: (v: string) => void;
  setInputLine: (v: string) => void;
  connect: () => void;
  disconnect: () => void;
  sendFormCommand: (command: string) => void;
  openConsole: () => void;
  closeConsole: () => void;
  sendInput: () => void;
  sendKey: (data: string) => void;
  sendResize: (rows: number, cols: number) => void;
  onConsoleData: (cb: ((data: string) => void) | null) => void;
}

const ConsoleContext = createContext<ConsoleState | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [connMode, setConnMode] = useState<'ssh' | 'serial'>('serial');
  const [host, setHost] = useState('192.168.1.1');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@123');
  const [serialPath, setSerialPath] = useState('COM3');
  const [serialBaud, setSerialBaud] = useState('9600');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [output, setOutput] = useState('');
  const [consoleMode, setConsoleMode] = useState(false);
  const [inputLine, setInputLine] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const dataHandlerRef = useRef<((data: string) => void) | null>(null);

  const api = useCallback(async (path: string, body?: object) => {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    setStatus('连接中...');
    const result = await api('/api/connect', {
      host, port: Number(port), username, password,
    });
    setConnected(result.success);
    setStatus(result.message);
    setLoading(false);
  }, [host, port, username, password, api]);

  const disconnect = useCallback(async () => {
    setLoading(true);
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setConsoleMode(false);
    const result = await api('/api/disconnect');
    setConnected(false);
    setStatus(result.message);
    setOutput('');
    setLoading(false);
  }, [api]);

  const sendFormCommand = useCallback(async (command: string) => {
    if (!command.trim()) { setStatus('没有可发送的命令'); return; }
    setLoading(true);
    setStatus('执行中...');
    const result = await api('/api/execute', { command });
    setStatus(result.message);
    setOutput(result.output || '');
    setLoading(false);
  }, [api]);

  const openConsole = useCallback(() => {
    if (wsRef.current) return;
    setConsoleMode(true);

    const wsUrl = connMode === 'serial'
      ? `${WS_URL}?mode=serial&path=${encodeURIComponent(serialPath)}&baudRate=${encodeURIComponent(serialBaud)}`
      : `${WS_URL}?host=${encodeURIComponent(host)}&port=${port}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      wsRef.current = ws;
      setStatus('Console 已连接');
    };

    ws.onmessage = (e) => {
      dataHandlerRef.current?.(typeof e.data === 'string' ? e.data : '');
    };

    ws.onerror = () => {
      dataHandlerRef.current?.('\r\n\x1b[31m[WebSocket 错误]\x1b[0m\r\n');
    };

    ws.onclose = () => {
      wsRef.current = null;
      dataHandlerRef.current?.('\r\n\x1b[33m--- Console 已断开 ---\x1b[0m\r\n');
      setStatus('Console 已断开');
    };
  }, [connMode, host, port, username, password, serialPath, serialBaud]);

  const closeConsole = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConsoleMode(false);
  }, []);

  const sendInput = useCallback(() => {
    if (!wsRef.current || !inputLine) return;
    wsRef.current.send(JSON.stringify({ type: 'input', data: inputLine + '\r\n' }));
    setInputLine('');
  }, [inputLine]);

  const sendKey = useCallback((data: string) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'input', data }));
  }, []);

  const sendResize = useCallback((rows: number, cols: number) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'resize', data: { rows, cols } }));
  }, []);

  const onConsoleData = useCallback((cb: ((data: string) => void) | null) => {
    dataHandlerRef.current = cb;
  }, []);

  return (
    <ConsoleContext.Provider
      value={{
        connMode, host, port, username, password,
        serialPath, serialBaud,
        connected, loading, status, output,
        consoleMode, inputLine,
        setConnMode, setHost, setPort, setUsername, setPassword,
        setSerialPath, setSerialBaud, setInputLine,
        connect, disconnect, sendFormCommand,
        openConsole, closeConsole, sendInput, sendKey,
        sendResize, onConsoleData,
      }}
    >
      {children}
    </ConsoleContext.Provider>
  );
}

export function useConsole() {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error('useConsole must be inside ConsoleProvider');
  return ctx;
}
