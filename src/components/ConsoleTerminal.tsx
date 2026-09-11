import { useRef, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useConsole } from '../AppContext';

export default function ConsoleTerminal() {
  const { consoleMode, closeConsole, sendKey, sendResize, onConsoleData } = useConsole();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!consoleMode || !containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'Consolas, "Courier New", monospace',
      scrollback: 2000,
      theme: {
        background: '#0f172a',
        foreground: '#4ade80',
        cursor: '#22d3ee',
        cursorAccent: '#0f172a',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    term.focus();
    term.writeln('\x1b[2m正在连接...\x1b[0m');

    // 终端按键（含方向键/Tab/功能键）直接发给设备
    const dataSub = term.onData((data) => sendKey(data));

    // Ctrl+V 粘贴
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.ctrlKey && e.key.toLowerCase() === 'v') {
        navigator.clipboard.readText().then((t) => t && sendKey(t)).catch(() => {});
        return false;
      }
      return true;
    });

    // 设备输出写入终端
    onConsoleData((data) => term.write(data));

    // 终端尺寸变化时同步给服务端（SSH setWindow）
    const resizeSub = term.onResize(({ rows, cols }) => sendResize(rows, cols));
    const observer = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* 容器隐藏时忽略 */ }
    });
    observer.observe(containerRef.current);

    return () => {
      dataSub.dispose();
      resizeSub.dispose();
      observer.disconnect();
      onConsoleData(null);
      term.dispose();
    };
  }, [consoleMode, sendKey, sendResize, onConsoleData]);

  if (!consoleMode) return null;

  return (
    <div className="border-t border-slate-300 pt-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">
          命令终端 — 直接输入命令，支持 Tab 补全 / Ctrl+V 粘贴
        </span>
        <button onClick={closeConsole} className="text-xs text-red-500 hover:underline">关闭</button>
      </div>
      <div
        ref={containerRef}
        className="bg-slate-900 rounded h-80 p-1 overflow-hidden"
        onClick={() => containerRef.current?.querySelector('textarea')?.focus()}
      />
    </div>
  );
}
