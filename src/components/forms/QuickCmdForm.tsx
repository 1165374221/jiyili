import { useState } from 'react';
import { useApp } from '../../AppContext';
import { parseAndGenerate } from '../../parser';

interface Props {
  onChange: (cmd: string) => void;
}

const examples = [
  'vlan 100 port 1-10 access',
  'vlan 100 端口 1-10 接入',
  'vlanif 100 地址 192.168.1.1/24',
  'dhcp 服务器 pool vlan100 192.168.1.0/24 网关 192.168.1.1',
  'acl 3000 deny tcp 192.168.1.0/24 端口 80',
  '静态路由 10.0.0.0/8 到 192.168.1.1',
  '黑洞 10.0.0.0/8',
  'nat 映射 tcp 80 192.168.1.100 80',
  '接口 G0/0/1 速率 1000 全双工',
  'stp rstp 根桥',
];

export default function QuickCmdForm({ onChange }: Props) {
  const { vendorInstance } = useApp();
  const [text, setText] = useState('');

  const handleInput = (value: string) => {
    setText(value);
    if (value.trim()) {
      const result = parseAndGenerate(value, vendorInstance);
      onChange(result);
    } else {
      onChange('');
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">快速命令</h2>
      <p className="text-xs text-slate-500">输入简写命令，自动转换为完整 CLI</p>

      <textarea
        className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 min-h-[80px]"
        placeholder="如：vlan 100 port 1-10 access"
        value={text}
        onChange={(e) => handleInput(e.target.value)}
      />

      <div className="space-y-1">
        <span className="text-xs font-medium text-slate-500">示例（点击填入）：</span>
        <div className="flex flex-wrap gap-1.5">
          {examples.map((ex) => (
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
    </div>
  );
}
