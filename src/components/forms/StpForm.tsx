import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { StpParams } from '../../types';

const defaultParams: StpParams = {
  mode: 'rstp',
  rootBridge: false,
  edgePorts: '',
  bpduGuard: false,
};

interface Props {
  onChange: (cmd: string) => void;
}

export default function StpForm({ onChange }: Props) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<StpParams>(defaultParams);

  const update = (patch: Partial<StpParams>) => {
    const next = { ...p, ...patch };
    setP(next);
    onChange(vendorInstance.generateStpConfig(next));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">STP 生成树配置</h2>

      <div>
        <label className="block text-sm text-slate-600 mb-1">STP 模式</label>
        <select
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={p.mode}
          onChange={(e) => update({ mode: e.target.value as StpParams['mode'] })}
        >
          <option value="stp">STP</option>
          <option value="rstp">RSTP</option>
          <option value="mstp">MSTP</option>
        </select>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={p.rootBridge}
            onChange={(e) => update({ rootBridge: e.target.checked })}
          />
          设为根桥
        </label>
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">边缘端口（逗号分隔，可选）</label>
        <input
          type="text"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="如 1,2,3"
          value={p.edgePorts || ''}
          onChange={(e) => update({ edgePorts: e.target.value })}
        />
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={p.bpduGuard}
            onChange={(e) => update({ bpduGuard: e.target.checked })}
          />
          启用 BPDU Guard
        </label>
      </div>
    </div>
  );
}
