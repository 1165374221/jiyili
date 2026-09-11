import { useConsole } from '../AppContext';

interface Props {
  command: string;
}

export default function SwitchPanel({ command }: Props) {
  const {
    connMode, setConnMode,
    host, setHost, port, setPort,
    username, setUsername, password, setPassword,
    serialPath, setSerialPath, serialBaud, setSerialBaud,
    connected, loading, status, output,
    consoleMode,
    connect, disconnect, sendFormCommand,
    openConsole,
  } = useConsole();

  return (
    <div className="border-t border-slate-200 pt-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">设备连接</h3>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">方式：</span>
        <select
          className="border rounded px-2 py-1 text-xs flex-1"
          value={connMode}
          onChange={(e) => setConnMode(e.target.value as 'ssh' | 'serial')}
          disabled={connected || consoleMode}
        >
          <option value="ssh">SSH</option>
          <option value="serial">串口 Serial</option>
        </select>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {connMode === 'ssh' ? (
          <>
            <input className="flex-1 min-w-[80px] border rounded px-2 py-1 text-xs" placeholder="IP" value={host} onChange={(e) => setHost(e.target.value)} disabled={connected || consoleMode} />
            <input className="w-12 border rounded px-2 py-1 text-xs" placeholder="端口" value={port} onChange={(e) => setPort(e.target.value)} disabled={connected || consoleMode} />
            <input className="w-16 border rounded px-2 py-1 text-xs" placeholder="用户" value={username} onChange={(e) => setUsername(e.target.value)} disabled={connected || consoleMode} />
            <input className="w-20 border rounded px-2 py-1 text-xs" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} disabled={connected || consoleMode} />
          </>
        ) : (
          <>
            <input className="flex-1 min-w-[60px] border rounded px-2 py-1 text-xs" placeholder="COM口" value={serialPath} onChange={(e) => setSerialPath(e.target.value)} disabled={connected || consoleMode} />
            <input className="w-16 border rounded px-2 py-1 text-xs" placeholder="波特率" value={serialBaud} onChange={(e) => setSerialBaud(e.target.value)} disabled={connected || consoleMode} />
          </>
        )}
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        {connMode === 'ssh' && !connected && (
          <button onClick={connect} disabled={loading} className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">连接</button>
        )}
        {connected && (
          <button onClick={disconnect} disabled={loading} className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">断开</button>
        )}
        {!consoleMode && (
          <button onClick={openConsole} disabled={loading} className="px-3 py-1 text-xs bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50">命令终端</button>
        )}
        {connected && connMode === 'ssh' && (
          <button onClick={() => sendFormCommand(command)} disabled={loading || !command.trim()} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">下发命令</button>
        )}
        {connected && <span className="text-xs text-green-600">● 已连接</span>}
        {consoleMode && <span className="text-xs text-cyan-600">◉ 终端已打开</span>}
      </div>

      {status && !consoleMode && (
        <p className={`text-xs ${connected ? 'text-green-600' : status.includes('失败') ? 'text-red-500' : 'text-slate-500'}`}>{status}</p>
      )}

      {output && !consoleMode && (
        <pre className="bg-slate-900 text-green-400 p-3 rounded text-xs font-mono overflow-auto max-h-48 whitespace-pre-wrap">{output}</pre>
      )}
    </div>
  );
}
