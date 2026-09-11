import { useState } from 'react';
import { useCommand } from '../../AppContext';
import { QUICK_EXAMPLES, QUICK_SYNTAX } from '../../quickRef';

export default function QuickCmdForm() {
  const { report, applied } = useCommand();
  const [text, setText] = useState('');
  const [showAll, setShowAll] = useState(false);

  // 原样上报文本即可：解析在服务端做（parser.ts 是受保护资产的一部分，
  // 不再随前端 bundle 发出）。空白输入会被 parser 解析成 null，
  // 由 generateAll 按「未产出命令不进正文」丢掉，与旧行为一致。
  const handleInput = (value: string) => {
    setText(value);
    report('quickcmd', value);
  };

  // 输入还没被识别出来时给一行中性提示。
  //
  // 这里问的是 applied —— 服务端算出来的「真正产出了命令的段」，而不是在前端
  // 自己猜。以前未识别时服务端返回一段 19 行帮助文本，前端把它当命令显示，
  // 于是用户每敲一个字预览区就刷满红字，看起来始终像出错了；实际只是还没输完。
  // 这正是「手动输入提示无法识别、复制粘贴却正常」那个反馈的来源。
  const pending = text.trim() !== '' && !applied.includes('quickcmd');

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">快速命令</h2>
      <p className="text-xs text-slate-500">输入简写命令，自动转换为完整 CLI</p>

      <div className="space-y-1.5">
        <textarea
          className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 min-h-[80px]"
          placeholder="如：vlan 100 port 1-10 access"
          value={text}
          onChange={(e) => handleInput(e.target.value)}
        />
        {pending && (
          <p className="text-xs text-amber-600">还没识别出命令，继续输入或点下方示例</p>
        )}
      </div>

      <div className="space-y-1">
        <span className="text-xs font-medium text-slate-500">示例（点击填入）：</span>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => handleInput(ex)}
              className="text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 rounded px-2 py-1 text-slate-600 transition-colors"
            >
              {ex.length > 35 ? ex.slice(0, 35) + '…' : ex}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
        >
          {showAll ? '▾ 收起完整语法表' : '▸ 查看全部支持的写法'}
        </button>
        {showAll && (
          <div className="border rounded divide-y text-xs">
            {QUICK_SYNTAX.map((s) => (
              <div key={s.label} className="flex gap-2 px-2 py-1.5">
                <span className="text-slate-500 shrink-0 w-32">{s.label}</span>
                <span className="font-mono text-slate-700 break-all">
                  {s.variants.join('  |  ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
