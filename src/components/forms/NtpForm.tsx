import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { NtpParams } from '../../types';

const d: NtpParams = { serverIp: '10.0.0.1' };

export default function NtpForm({ onChange }: { onChange: (c: string) => void }) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<NtpParams>(d);
  const emit = (n: Partial<NtpParams>) => { const next = { ...p, ...n }; setP(next); onChange(vendorInstance.generateNtpConfig(next)); };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">NTP 时间同步</h2>
      <div><label className="block text-sm text-slate-600 mb-1">NTP 服务器 IP</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.serverIp} onChange={(e) => emit({ serverIp: e.target.value })} /></div>
      <div><label className="block text-sm text-slate-600 mb-1">源接口（可选）</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.sourceInterface || ''} onChange={(e) => emit({ sourceInterface: e.target.value })} /></div>
    </div>
  );
}
