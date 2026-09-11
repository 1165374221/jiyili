import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react';
import type { Vendor, ConfigType, DeviceModel } from './types';
import { DEVICE_MODELS } from './types';
import type { VendorCommands } from '../server/core/vendors/base';
import { HuaweiCommands } from '../server/core/vendors/huawei';
import { H3cCommands } from '../server/core/vendors/h3c';
import { CiscoCommands } from '../server/core/vendors/cisco';
import { RuijieCommands } from '../server/core/vendors/ruijie';

const vendors: Record<Vendor, VendorCommands> = {
  huawei: new HuaweiCommands(),
  h3c: new H3cCommands(),
  cisco: new CiscoCommands(),
  ruijie: new RuijieCommands(),
};

interface AppState {
  vendor: Vendor;
  configType: ConfigType;
  model: DeviceModel;
  vendorInstance: VendorCommands;
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
        vendorInstance: vendors[vendor],
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
