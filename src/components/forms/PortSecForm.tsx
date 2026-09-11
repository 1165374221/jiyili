import { useState } from 'react';
import { useCommand } from '../../AppContext';
import type { PortSecParams } from '../../types';

const d: PortSecParams = { interfaceName: 'GigabitEthernet0/0/1', maxMac: 3, mode: 'shutdown', sticky: true };

export default function PortSecForm() {
  const { report } = useCommand();
  const [p, setP] = useState<PortSecParams>(d);
  const emit = (n: Partial<PortSecParams>) => { const next = { ...p, ...n }; setP(next); report('portsec', next); };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">端口安全配置</h2>
      <div><label className="block text-sm text-slate-600 mb-1">接口名</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.interfaceName} onChange={(e) => emit({ interfaceName: e.target.value })} /></div>
      <div className="flex gap-4">
        <div className="w-28"><label className="block text-sm text-slate-600 mb-1">最大MAC数</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={p.maxMac} onChange={(e) => emit({ maxMac: Number(e.target.value) })} /></div>
        <div className="w-36"><label className="block text-sm text-slate-600 mb-1">违规动作</label><select className="w-full border rounded px-3 py-2 text-sm" value={p.mode} onChange={(e) => emit({ mode: e.target.value as 'restrict' | 'shutdown' | 'protect' })}><option value="restrict">Restrict</option><option value="shutdown">Shutdown</option><option value="protect">Protect</option></select></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.sticky} onChange={(e) => emit({ sticky: e.target.checked })} />Sticky MAC</label>
      <div><label className="block text-sm text-slate-600 mb-1">静态MAC（逗号分隔）</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.staticMacs || ''} onChange={(e) => emit({ staticMacs: e.target.value })} /></div>
    </div>
  );
}
