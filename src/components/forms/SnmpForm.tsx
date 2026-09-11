import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { SnmpParams } from '../../types';

const d: SnmpParams = { version: 'v2c', community: 'public', location: 'ServerRoom', contact: 'admin@example.com' };

export default function SnmpForm({ onChange }: { onChange: (c: string) => void }) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<SnmpParams>(d);
  const emit = (n: Partial<SnmpParams>) => { const next = { ...p, ...n }; setP(next); onChange(vendorInstance.generateSnmpConfig(next)); };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">SNMP 配置</h2>
      <div className="flex gap-4">
        <div className="w-32"><label className="block text-sm text-slate-600 mb-1">版本</label><select className="w-full border rounded px-3 py-2 text-sm" value={p.version} onChange={(e) => emit({ version: e.target.value as 'v2c' | 'v3' })}><option value="v2c">v2c</option><option value="v3">v3</option></select></div>
        <div className="flex-1"><label className="block text-sm text-slate-600 mb-1">Community</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.community} onChange={(e) => emit({ community: e.target.value })} /></div>
      </div>
      <div><label className="block text-sm text-slate-600 mb-1">设备位置</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.location || ''} onChange={(e) => emit({ location: e.target.value })} /></div>
      <div><label className="block text-sm text-slate-600 mb-1">联系人</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.contact || ''} onChange={(e) => emit({ contact: e.target.value })} /></div>
      <div><label className="block text-sm text-slate-600 mb-1">Trap 服务器</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.trapServer || ''} onChange={(e) => emit({ trapServer: e.target.value })} /></div>
    </div>
  );
}
