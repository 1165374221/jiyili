import { useState } from 'react';

interface Props {
  command: string;
}

export default function CommandPreview({ command }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for environments without clipboard API
      const ta = document.createElement('textarea');
      ta.value = command;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 shrink-0 gap-2">
        <h2 className="text-base font-semibold text-slate-800">命令预览</h2>
        <button
          onClick={copy}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors shrink-0"
        >
          {copied ? '已复制 ✓' : '复制命令'}
        </button>
      </div>
      <pre className="flex-1 min-h-[160px] bg-slate-900 text-green-400 p-3 rounded-lg text-xs font-mono overflow-auto whitespace-pre-wrap break-all">
        {command || '请填写配置参数'}
      </pre>
    </div>
  );
}
