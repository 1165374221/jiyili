import { useState } from 'react';
import { useCommand, useConsole } from '../AppContext';

interface Props {
  command: string;
}

export default function SwitchPanel({ command }: Props) {
  const { flush, generating } = useCommand();
  const [sending, setSending] = useState(false);

  // ★ 时序安全：必须先把挂起的生成结算掉，再发。
  //
  // 生成是防抖的（200ms）。用户改完最后一个数字【立刻】点下发时，防抖还没触发，
  // 此时 command 属性仍是上一版 —— 直接把旧配置推给现场交换机，是在动生产设备。
  // 这里 await flush() 拿到的一定是基于当前 params 现算的结果。
  //
  // flush 返回 null 表示这次生成【失败】。此时必须直接放弃下发，绝不能退回到
  // 传进来的 command：那正是"把旧配置发出去"的路径，而且用户刚改的参数还没生效。
  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      const fresh = await flush();
      if (fresh === null) return;          // 生成失败：不发，错误提示已由 Provider 显示
      await sendFormCommand(fresh);
    } finally {
      setSending(false);
    }
  };

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
          <button
            onClick={handleSend}
            disabled={loading || sending || !command.trim()}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? '下发中…' : '下发命令'}
          </button>
        )}
        {generating && !sending && <span className="text-xs text-slate-400">生成中…</span>}
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
