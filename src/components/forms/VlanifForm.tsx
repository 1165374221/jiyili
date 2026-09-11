import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { VlanifParams } from '../../types';

const defaultParams: VlanifParams = {
  vlanId: 100,
  ip: '192.168.1.1',
  mask: 24,
  description: '',
};

interface Props {
  onChange: (cmd: string) => void;
}

export default function VlanifForm({ onChange }: Props) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<VlanifParams>(defaultParams);

  const update = (patch: Partial<VlanifParams>) => {
    const next = { ...p, ...patch };
    setP(next);
    onChange(vendorInstance.generateVlanifConfig(next));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">VLAN 接口配置</h2>

      <div>
        <label className="block text-sm text-slate-600 mb-1">VLAN ID</label>
        <input
          type="number"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={p.vlanId}
          onChange={(e) => update({ vlanId: Number(e.target.value) })}
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm text-slate-600 mb-1">IP 地址</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={p.ip}
            onChange={(e) => update({ ip: e.target.value })}
          />
        </div>
        <div className="w-24">
          <label className="block text-sm text-slate-600 mb-1">掩码位</label>
          <input
            type="number"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={p.mask}
            onChange={(e) => update({ mask: Number(e.target.value) })}
            min={0}
            max={32}
          />
        </div>
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
