import { useState } from 'react';
import { useCommand } from '../AppContext';

interface Props {
  command: string;
}

export default function CommandPreview({ command }: Props) {
  const { flush } = useCommand();
  const [copied, setCopied] = useState(false);

  // 同 SwitchPanel 的下发：生成是防抖的，直接复制 command 属性可能拿到上一版。
  // 复制出去的东西多半要被粘进设备，所以同样先结算。
  // flush 返回 null（生成失败）时不复制 —— 错误提示已由 Provider 显示，
  // 此时复制一份过期的命令只会让人以为是最新的。
  const copy = async () => {
    const fresh = await flush();
    if (fresh === null) return;
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for environments without clipboard API
      const ta = document.createElement('textarea');
      ta.value = fresh;
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
