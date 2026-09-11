import { useState } from 'react';
import { useCommand } from '../../AppContext';
import type { FwPolicyParams } from '../../types';

const presetZones = ['Local', 'trust', 'untrust', 'DMZ', 'mgmt'];

const d: FwPolicyParams = {
  zones: 'Local,trust,untrust,DMZ',
  rules: [{ ruleId: 1, action: 'permit', sourceZone: 'trust', destZone: 'untrust', sourceIp: '192.168.1.0 0.0.0.255', destIp: 'any', protocol: 'ip' }],
};

export default function FwPolicyForm() {
  const { report } = useCommand();
  const [p, setP] = useState<FwPolicyParams>(d);
  const [customZone, setCustomZone] = useState('');

  const zoneList = p.zones.split(/[,\s]+/).filter(Boolean);

  const emit = (n: FwPolicyParams) => { setP(n); report('fwpolicy', n); };

  const toggleZone = (zone: string) => {
    let newList: string[];
    if (zoneList.includes(zone)) {
      newList = zoneList.filter((z) => z !== zone);
    } else {
      newList = [...zoneList, zone];
    }
    const newZones = newList.join(',');
    const rules = p.rules.map((r) => ({
      ...r,
      sourceZone: newList.includes(r.sourceZone) ? r.sourceZone : (newList[0] || ''),
      destZone: newList.includes(r.destZone) ? r.destZone : (newList[1] || newList[0] || ''),
    }));
    emit({ ...p, zones: newZones, rules });
  };

  const addCustomZone = () => {
    const z = customZone.trim();
    if (!z || zoneList.includes(z)) { setCustomZone(''); return; }
    toggleZone(z);
    setCustomZone('');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">防火墙安全策略</h2>

      {/* Zone selection */}
      <div className="border rounded p-3 space-y-2">
        <span className="text-sm font-medium text-slate-700">安全域</span>
        <div className="flex gap-3 flex-wrap">
          {presetZones.map((z) => (
            <label key={z} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={zoneList.includes(z)}
                onChange={() => toggleZone(z)}
              />
              <span className={zoneList.includes(z) ? 'text-blue-700 font-medium' : 'text-slate-600'}>{z}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input
            className="w-36 border rounded px-2 py-1 text-xs"
            placeholder="自定义域名称"
            value={customZone}
            onChange={(e) => setCustomZone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCustomZone(); }}
          />
          <button onClick={addCustomZone} className="text-xs text-blue-600 hover:underline">添加</button>
          {zoneList.filter((z) => !presetZones.includes(z)).length > 0 && (
            <span className="text-xs text-slate-400">
              自定义：{zoneList.filter((z) => !presetZones.includes(z)).join(', ')}
              <button
                onClick={() => {
                  zoneList.filter((z) => !presetZones.includes(z)).forEach((z) => toggleZone(z));
                }}
                className="ml-2 text-red-400 hover:underline"
              >
                清除
              </button>
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400">已选 {zoneList.length} 个：{zoneList.join(', ')}</p>
      </div>

      {/* Rules */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">策略规则</span>
          <button
            onClick={() =>
              emit({
                ...p,
                rules: [...p.rules, {
                  ruleId: p.rules.length + 1,
                  action: 'permit',
                  sourceZone: zoneList[0] || '',
                  destZone: zoneList[1] || zoneList[0] || '',
                  sourceIp: 'any',
                  destIp: 'any',
                  protocol: 'ip',
                }],
              })
            }
            className="text-sm text-blue-600 hover:underline"
          >
            + 添加规则
          </button>
        </div>

        {p.rules.map((r, i) => {
          const update = (patch: Partial<typeof r>) => {
            const l = [...p.rules];
            l[i] = { ...l[i], ...patch };
            emit({ ...p, rules: l });
          };

          return (
            <fieldset key={i} className="border rounded p-3 text-sm space-y-2">
              <div className="flex gap-2 items-center flex-wrap">
                <span className="text-xs text-slate-500 font-mono">#{r.ruleId}</span>
                <select className="border rounded px-2 py-1 text-sm" value={r.action} onChange={(e) => update({ action: e.target.value as 'permit' | 'deny' })}>
                  <option value="permit">Permit</option><option value="deny">Deny</option>
                </select>
                <select className="border rounded px-2 py-1 text-sm" value={r.protocol} onChange={(e) => update({ protocol: e.target.value })}>
                  <option value="ip">IP</option><option value="tcp">TCP</option><option value="udp">UDP</option><option value="icmp">ICMP</option>
                </select>
                {(r.protocol === 'tcp' || r.protocol === 'udp') && (
                  <input className="w-20 border rounded px-2 py-1 text-sm" type="number" placeholder="端口" value={r.destPort || ''} onChange={(e) => update({ destPort: Number(e.target.value) })} />
                )}
                {p.rules.length > 1 && (
                  <button onClick={() => emit({ ...p, rules: p.rules.filter((_, j) => j !== i) })} className="text-red-500 text-xs hover:underline ml-auto">删除</button>
                )}
              </div>

              <div className="flex gap-2 items-center flex-wrap">
                <span className="text-xs text-slate-500 shrink-0">源域</span>
                <select className="flex-1 min-w-[90px] border rounded px-2 py-1 text-sm" value={r.sourceZone} onChange={(e) => update({ sourceZone: e.target.value })}>
                  {zoneList.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
                <span className="text-xs text-slate-500 shrink-0">目的域</span>
                <select className="flex-1 min-w-[90px] border rounded px-2 py-1 text-sm" value={r.destZone} onChange={(e) => update({ destZone: e.target.value })}>
                  {zoneList.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
                <span className="text-xs text-slate-500 shrink-0">源IP</span>
                <input className="flex-1 min-w-[100px] border rounded px-2 py-1 text-sm" placeholder="any" value={r.sourceIp} onChange={(e) => update({ sourceIp: e.target.value })} />
                <span className="text-xs text-slate-500 shrink-0">目的IP</span>
                <input className="flex-1 min-w-[100px] border rounded px-2 py-1 text-sm" placeholder="any" value={r.destIp} onChange={(e) => update({ destIp: e.target.value })} />
              </div>

              <input className="w-full border rounded px-2 py-1 text-xs" placeholder="规则描述（可选）" value={r.description || ''} onChange={(e) => update({ description: e.target.value })} />
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
