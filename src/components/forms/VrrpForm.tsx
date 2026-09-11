import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { VrrpParams } from '../../types';

const d: VrrpParams = { vrid: 1, virtualIp: '10.0.0.1', priority: 120, interfaceName: 'Vlanif 100', preempt: true };

export default function VrrpForm({ onChange }: { onChange: (c: string) => void }) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<VrrpParams>(d);
  const emit = (n: Partial<VrrpParams>) => { const next = { ...p, ...n }; setP(next); onChange(vendorInstance.generateVrrpConfig(next)); };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">VRRP 配置</h2>
      <div className="flex gap-4">
        <div className="w-24"><label className="block text-sm text-slate-600 mb-1">VRID</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={p.vrid} onChange={(e) => emit({ vrid: Number(e.target.value) })} /></div>
        <div className="flex-1"><label className="block text-sm text-slate-600 mb-1">虚拟 IP</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.virtualIp} onChange={(e) => emit({ virtualIp: e.target.value })} /></div>
        <div className="w-24"><label className="block text-sm text-slate-600 mb-1">优先级</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={p.priority} onChange={(e) => emit({ priority: Number(e.target.value) })} /></div>
      </div>
      <div><label className="block text-sm text-slate-600 mb-1">接口</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.interfaceName} onChange={(e) => emit({ interfaceName: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.preempt} onChange={(e) => emit({ preempt: e.target.checked })} />抢占模式</label>
      <div><label className="block text-sm text-slate-600 mb-1">认证密钥（可选）</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.authKey || ''} onChange={(e) => emit({ authKey: e.target.value })} /></div>
    </div>
  );
}
