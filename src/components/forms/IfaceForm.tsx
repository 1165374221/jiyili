import { useState } from 'react';
import { useCommand } from '../../AppContext';
import type { IfaceParams } from '../../types';

const d: IfaceParams = { interfaceName: 'GigabitEthernet0/0/1', speed: '1000', duplex: 'full', mtu: 1500 };

export default function IfaceForm() {
  const { report } = useCommand();
  const [p, setP] = useState<IfaceParams>(d);
  const emit = (n: Partial<IfaceParams>) => { const next = { ...p, ...n }; setP(next); report('iface', next); };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">接口配置</h2>

      <div><label className="block text-sm text-slate-600 mb-1">接口名</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.interfaceName} onChange={(e) => emit({ interfaceName: e.target.value })} /></div>
      <div><label className="block text-sm text-slate-600 mb-1">描述</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.description || ''} onChange={(e) => emit({ description: e.target.value })} /></div>

      {/* IP configuration */}
      <div className="border-t pt-4 space-y-3">
        <span className="text-sm font-medium text-slate-700">IP 地址</span>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm text-slate-600 mb-1">主 IP 地址</label>
            <input type="text" className="w-full border rounded px-3 py-2 text-sm" placeholder="192.168.1.1" value={p.ip || ''} onChange={(e) => emit({ ip: e.target.value })} />
          </div>
          <div className="w-20">
            <label className="block text-sm text-slate-600 mb-1">掩码</label>
            <input type="number" className="w-full border rounded px-3 py-2 text-sm" placeholder="24" value={p.mask || ''} onChange={(e) => emit({ mask: Number(e.target.value) })} min={0} max={32} />
          </div>
        </div>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm text-slate-600 mb-1">从 IP 地址（可选）</label>
            <input type="text" className="w-full border rounded px-3 py-2 text-sm" placeholder="10.0.0.1" value={p.secondaryIp || ''} onChange={(e) => emit({ secondaryIp: e.target.value })} />
          </div>
          <div className="w-20">
            <label className="block text-sm text-slate-600 mb-1">掩码</label>
            <input type="number" className="w-full border rounded px-3 py-2 text-sm" placeholder="24" value={p.secondaryMask || ''} onChange={(e) => emit({ secondaryMask: Number(e.target.value) })} min={0} max={32} />
          </div>
        </div>
      </div>

      {/* Basic settings */}
      <div className="border-t pt-4">
        <span className="text-sm font-medium text-slate-700">链路参数</span>
        <div className="flex gap-4 mt-3">
          <div className="flex-1"><label className="block text-sm text-slate-600 mb-1">速率</label><select className="w-full border rounded px-3 py-2 text-sm" value={p.speed || ''} onChange={(e) => emit({ speed: e.target.value })}><option value="">自动</option><option value="10">10M</option><option value="100">100M</option><option value="1000">1000M</option><option value="10000">10G</option></select></div>
          <div className="flex-1"><label className="block text-sm text-slate-600 mb-1">双工</label><select className="w-full border rounded px-3 py-2 text-sm" value={p.duplex || ''} onChange={(e) => emit({ duplex: e.target.value })}><option value="">自动</option><option value="full">Full</option><option value="half">Half</option></select></div>
          <div className="w-24"><label className="block text-sm text-slate-600 mb-1">MTU</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={p.mtu || ''} onChange={(e) => emit({ mtu: Number(e.target.value) })} /></div>
        </div>
      </div>
    </div>
  );
}
