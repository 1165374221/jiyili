import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { SyslogParams } from '../../types';

const d: SyslogParams = { serverIp: '10.0.0.100', facility: 'local0', level: 'informational' };

export default function SyslogForm({ onChange }: { onChange: (c: string) => void }) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<SyslogParams>(d);
  const emit = (n: Partial<SyslogParams>) => { const next = { ...p, ...n }; setP(next); onChange(vendorInstance.generateSyslogConfig(next)); };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Syslog 日志</h2>
      <div><label className="block text-sm text-slate-600 mb-1">日志服务器 IP</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.serverIp} onChange={(e) => emit({ serverIp: e.target.value })} /></div>
      <div className="flex gap-4">
        <div className="flex-1"><label className="block text-sm text-slate-600 mb-1">Facility</label><select className="w-full border rounded px-3 py-2 text-sm" value={p.facility || ''} onChange={(e) => emit({ facility: e.target.value })}><option value="local0">local0</option><option value="local1">local1</option><option value="local7">local7</option></select></div>
        <div className="flex-1"><label className="block text-sm text-slate-600 mb-1">级别</label><select className="w-full border rounded px-3 py-2 text-sm" value={p.level || ''} onChange={(e) => emit({ level: e.target.value })}><option value="debugging">Debug</option><option value="informational">Info</option><option value="warning">Warning</option><option value="error">Error</option></select></div>
      </div>
    </div>
  );
}
