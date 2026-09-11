import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { QinqParams } from '../../types';

const d: QinqParams = { interfaceName: 'GigabitEthernet0/0/1', outerVlan: 100, innerVlans: '10,20,30', mode: 'basic' };

export default function QinqForm({ onChange }: { onChange: (c: string) => void }) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<QinqParams>(d);
  const emit = (n: Partial<QinqParams>) => { const next = { ...p, ...n }; setP(next); onChange(vendorInstance.generateQinqConfig(next)); };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">QINQ VLAN 双层标签</h2>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm text-slate-600 mb-1">接口</label>
          <input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.interfaceName} onChange={(e) => emit({ interfaceName: e.target.value })} />
        </div>
        <div className="w-28">
          <label className="block text-sm text-slate-600 mb-1">外层 VLAN</label>
          <input type="number" className="w-full border rounded px-3 py-2 text-sm" value={p.outerVlan} onChange={(e) => emit({ outerVlan: Number(e.target.value) })} />
        </div>
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">模式</label>
        <select className="w-48 border rounded px-3 py-2 text-sm" value={p.mode} onChange={(e) => emit({ mode: e.target.value as 'basic' | 'selective' })}>
          <option value="basic">Basic — 基本 dot1q-tunnel</option>
          <option value="selective">Selective — 选择 VLAN 映射</option>
        </select>
      </div>

      {p.mode === 'selective' && (
        <div>
          <label className="block text-sm text-slate-600 mb-1">内层 VLAN（逗号分隔）</label>
          <input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.innerVlans} onChange={(e) => emit({ innerVlans: e.target.value })} placeholder="如 10,20,30" />
        </div>
      )}
    </div>
  );
}
