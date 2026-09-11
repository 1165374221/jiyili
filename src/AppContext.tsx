import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import type { Vendor, ConfigType, DeviceModel } from './types';
import { DEVICE_MODELS } from './types';
// 步骤 4b：命令生成已全部搬到服务端，这里【不再 import 任何厂商代码】。
// 继续留着 import { generateAll } from '../server/core/index' 那座临时桥，就等于
// 把 2127 行厂商 CLI 知识照样打进发给客户的前端 bundle —— 整个改造的意义就是去掉它。
// GenerateBlock 只是类型，import type 编译期擦除，不会把实现带进 bundle。
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
  const [vendor, setVendorState] = useState<Vendor>('huawei');
  const [configType, setConfigType] = useState<ConfigType>('vlan');
  const [model, setModel] = useState<DeviceModel>(DEVICE_MODELS['huawei'][0]);

  // bug #5：切厂商必须同时重置型号。
  // 型号列表是【按厂商分别定义的】，不复位就会留住上一家的 DeviceModel 对象：
  // 界面右上角的“端口前缀”会显示别家的前缀，而这个 model 又会作为 modelId 参与
  // 生成（步骤 4b 之后 model.id 就是服务端解析端口前缀的依据）—— 于是生成出来的
  // 端口名与所选厂商对不上。旧实现里型号对生成毫无影响，所以这个 bug 一直没暴露。
  const setVendor = useCallback((v: Vendor) => {
    setVendorState(v);
    setModel(DEVICE_MODELS[v][0]);
  }, []);

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
  /** 防抖窗口内或在途请求中。界面据此显示「生成中」。 */
  generating: boolean;
  report: (type: ConfigType, params: unknown) => void;
  /**
   * 立刻结算挂起的生成，返回【最新】命令。
   *
   * 下发/复制之前必须先 await 这个，否则拿到的是上一次的结果。
   * 返回 null 表示这次生成失败 —— 调用方必须放弃下发，不能退回到旧命令。
   * 空串是合法值（确实什么都没配），由调用方自行判断要不要发。
   */
  flush: () => Promise<string | null>;
  clear: () => void;
}

const CommandContext = createContext<CommandState | null>(null);

// 防抖窗口。本地回环一次往返是毫秒级，这个值纯粹是为了少发请求：
// 用户连续敲键盘时每敲一下都发一次没有意义。
const DEBOUNCE_MS = 200;

interface Out { command: string; applied: string[]; error: string }

export function CommandProvider({ children }: { children: ReactNode }) {
  const { vendor, model } = useApp();

  // 用户「碰过」的表单 → 最新 params，按首次触碰顺序。给已有 key 赋值不会改变
  // 它的位置，所以这个顺序与旧实现 bag 对象的插入序一致——而顺序是有意义的，
  // 段的先后决定了生成出来的配置块先后。这个顺序现在原样作为 blocks 数组发给
  // 服务端，服务端不再有机会自己重排。
  //
  // 语义提醒：这里的键是「用户碰过」，不是「有输出」。旧实现用
  // filter(([, v]) => v) 过滤的是生成出的命令文本是否为空，而 params 对象永远
  // 为真，所以那个过滤在改成 params 上行后会失效。哪些段真正产出了命令，以
  // applied（服务端算的）为准。
  const bag = useRef<Record<string, GenerateBlock>>({});

  const [out, setOut] = useState<Out>({ command: '', applied: [], error: '' });
  const [generating, setGenerating] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 乱序防护用两道，因为两道各自都不够：
  //  - AbortController 取消在途请求，省掉一次无用的响应；
  //  - 序号比对兜住「取消已经来不及、响应仍在路上」的窗口。
  // 只靠 abort 时，被取消的响应有可能先于新响应到达并覆盖结果。
  const seq = useRef(0);
  const ctrl = useRef<AbortController | null>(null);
  // 最后一次【成功】的结果。生成失败时要退回到它，而不是退回到空。
  const lastOk = useRef<{ command: string; applied: string[] }>({ command: '', applied: [] });
  // params 是否比 out.command 新。flush 靠它决定要不要真的跑一趟。
  const dirty = useRef(false);

  const cancelPending = useCallback(() => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  /**
   * 立即生成一次（取消挂起的防抖与在途请求）。
   *
   * 返回值语义严格：成功返回命令（可能是空串），失败返回 null。
   * 调用方永远不能把 null 当成"用上一次的" —— 那正是会把旧配置推给现场设备的路径。
   */
  const generate = useCallback(async (): Promise<string | null> => {
    cancelPending();
    const blocks = Object.values(bag.current);
    const mySeq = ++seq.current;
    ctrl.current?.abort();

    if (blocks.length === 0) {
      lastOk.current = { command: '', applied: [] };
      dirty.current = false;
      setOut({ command: '', applied: [], error: '' });
      setGenerating(false);
      return '';
    }

    const ac = new AbortController();
    ctrl.current = ac;
    setGenerating(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor, modelId: model.id, blocks }),
        signal: ac.signal,
      });
      // 后端没起来时，vite 代理拿到的是空响应，直接 res.json() 会抛
      // "Unexpected end of JSON input" —— 对着这句话，客户无从判断是哪里出了问题。
      // 这两种情况在客户现场（start.bat 没起来 / 端口被占）都真实会发生。
      if (!res.ok) throw new Error(`生成服务无响应（HTTP ${res.status}），请确认后端已启动`);
      let data: { success?: boolean; message?: string; command?: string; applied?: string[] };
      try {
        data = await res.json();
      } catch {
        throw new Error('生成服务无响应，请确认后端已启动');
      }
      if (mySeq !== seq.current) return null;          // 已有更新的请求在跑，丢弃本次
      if (!data.success) throw new Error(data.message || '生成失败');
      lastOk.current = { command: data.command ?? '', applied: data.applied ?? [] };
      dirty.current = false;
      setOut({ command: data.command ?? '', applied: data.applied ?? [], error: '' });
      setGenerating(false);
      return data.command ?? '';
    } catch (err) {
      if (ac.signal.aborted || mySeq !== seq.current) return null;
      // 保留上一条成功命令，只叠加错误提示。清空 command 会让用户对着空白预览
      // 点「下发命令」，把空配置推给现场设备。
      setOut((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }));
      setGenerating(false);
      return null;
    }
  }, [vendor, model.id, cancelPending]);

  const schedule = useCallback(() => {
    dirty.current = true;
    cancelPending();
    setGenerating(true);   // 防抖窗口内也算「生成中」，界面别显示成已完成
    timer.current = setTimeout(() => { void generate(); }, DEBOUNCE_MS);
  }, [generate, cancelPending]);

  const report = useCallback((type: ConfigType, params: unknown) => {
    bag.current[type] = { type, params };
    schedule();
  }, [schedule]);

  const flush = useCallback(async (): Promise<string | null> => {
    if (!dirty.current) return lastOk.current.command;   // 已经是最新的，省一次往返
    return generate();
  }, [generate]);

  const clear = useCallback(() => {
    bag.current = {};
    cancelPending();
    seq.current++;              // 让在途响应作废
    ctrl.current?.abort();
    lastOk.current = { command: '', applied: [] };
    dirty.current = false;
    setOut({ command: '', applied: [], error: '' });
    setGenerating(false);
  }, [cancelPending]);

  // 切厂商/型号后必须重算。旧实现靠 detectVendor 从命令文本猜厂商，切厂商
  // 根本不会重算（bug #3）；型号更是对生成结果毫无影响（bug #1）。
  // generate 的依赖里有 vendor 和 model.id，所以它一变，这个 effect 就重跑。
  useEffect(() => { schedule(); }, [schedule]);

  return (
    <CommandContext.Provider
      value={{
        command: out.command, applied: out.applied, error: out.error,
        generating, report, flush, clear,
      }}
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

// 一律同源，不再靠端口号猜后端在哪。
//
// 旧实现是「端口是 5173（vite 开发服务器）就写死 http://localhost:3001，否则
// 用当前 host」——把开发期的拓扑硬编码进了产品代码，且只在 5173 这一个端口上
// 碰巧成立。改成同源之后，开发期由 vite 的 proxy 把 /api、/ws 转发到 3001
// （见 vite.config.ts），生产期本来就是 3001 自己，两条路径同一套代码。
function wsBase() {
  if (typeof window === 'undefined') return '';
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
}
const API = '';
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
