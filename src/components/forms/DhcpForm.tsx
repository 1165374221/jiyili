import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { DhcpParams } from '../../types';

const d: DhcpParams = { mode: 'server', poolName: 'vlan100', network: '192.168.1.0', mask: 24, gateway: '192.168.1.1', dnsServers: '8.8.8.8', startIp: '192.168.1.10', endIp: '192.168.1.200' };

export default function DhcpForm({ onChange }: { onChange: (c: string) => void }) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<DhcpParams>(d);
  const emit = (n: Partial<DhcpParams>) => { const next = { ...p, ...n }; setP(next); onChange(vendorInstance.generateDhcpConfig(next)); };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">DHCP 配置</h2>
      <div><label className="block text-sm text-slate-600 mb-1">模式</label>
        <select className="w-48 border rounded px-3 py-2 text-sm" value={p.mode} onChange={(e) => emit({ mode: e.target.value as 'server' | 'relay' | 'snooping' })}>
          <option value="server">Server</option><option value="relay">Relay</option><option value="snooping">Snooping</option>
        </select>
      </div>
      {p.mode === 'server' && (
        <div className="space-y-3">
          <div className="flex gap-4">
            <div className="flex-1"><label className="block text-sm text-slate-600 mb-1">地址池名称</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.poolName || ''} onChange={(e) => emit({ poolName: e.target.value })} /></div>
            <div className="flex-1"><label className="block text-sm text-slate-600 mb-1">网段</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.network || ''} onChange={(e) => emit({ network: e.target.value })} /></div>
            <div className="w-20"><label className="block text-sm text-slate-600 mb-1">掩码</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={p.mask || 24} onChange={(e) => emit({ mask: Number(e.target.value) })} /></div>
          </div>
          <div><label className="block text-sm text-slate-600 mb-1">网关</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.gateway || ''} onChange={(e) => emit({ gateway: e.target.value })} /></div>
          <div><label className="block text-sm text-slate-600 mb-1">DNS</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.dnsServers || ''} onChange={(e) => emit({ dnsServers: e.target.value })} /></div>
          <div className="flex gap-4">
            <div className="flex-1"><label className="block text-sm text-slate-600 mb-1">起始 IP</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.startIp || ''} onChange={(e) => emit({ startIp: e.target.value })} /></div>
            <div className="flex-1"><label className="block text-sm text-slate-600 mb-1">结束 IP</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.endIp || ''} onChange={(e) => emit({ endIp: e.target.value })} /></div>
          </div>
        </div>
      )}
      {p.mode === 'relay' && <div><label className="block text-sm text-slate-600 mb-1">中继服务器 IP</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.relayServer || ''} onChange={(e) => emit({ relayServer: e.target.value })} /></div>}
      {(p.mode === 'snooping' || p.mode === 'relay') && <div><label className="block text-sm text-slate-600 mb-1">信任接口（逗号分隔）</label><input type="text" className="w-full border rounded px-3 py-2 text-sm" value={p.trustInterfaces || ''} onChange={(e) => emit({ trustInterfaces: e.target.value })} /></div>}
    </div>
  );
}
