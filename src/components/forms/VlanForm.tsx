import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { VlanParams } from '../../types';

const defaultParams: VlanParams = {
  vlanIds: [100],
  ports: '1',
  portMode: 'access',
  description: '',
};

interface Props {
  onChange: (cmd: string) => void;
}

export default function VlanForm({ onChange }: Props) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<VlanParams>(defaultParams);

  const update = (patch: Partial<VlanParams>) => {
    const next = { ...p, ...patch };
    setP(next);
    onChange(vendorInstance.generateVlanConfig(next));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">VLAN / 端口配置</h2>

      <div>
        <label className="block text-sm text-slate-600 mb-1">VLAN ID（逗号分隔）</label>
        <input
          type="text"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={p.vlanIds.join(',')}
          onChange={(e) => {
            const ids = e.target.value.split(',').map(Number).filter((n) => !isNaN(n));
            update({ vlanIds: ids.length ? ids : [1] });
          }}
        />
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">端口（逗号分隔）</label>
        <input
          type="text"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={p.ports}
          onChange={(e) => update({ ports: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">端口模式</label>
        <select
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={p.portMode}
          onChange={(e) => update({ portMode: e.target.value as VlanParams['portMode'] })}
        >
          <option value="access">Access</option>
          <option value="trunk">Trunk</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">描述（可选）</label>
        <input
          type="text"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={p.description || ''}
          onChange={(e) => update({ description: e.target.value })}
        />
      </div>
    </div>
  );
}
