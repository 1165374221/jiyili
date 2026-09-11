import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { VxlanParams, VxlanVni } from '../../types';

const defaultVni: VxlanVni = {
  vniId: 5010,
  peerIps: '2.2.2.2',
  bridgeDomainId: 10,
};

const defaultParams: VxlanParams = {
  nveId: 1,
  sourceIp: '1.1.1.1',
  vnis: [defaultVni],
};

interface Props {
  onChange: (cmd: string) => void;
}

export default function VxlanForm({ onChange }: Props) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<VxlanParams>(defaultParams);

  const emit = (next: VxlanParams) => {
    setP(next);
    onChange(vendorInstance.generateVxlanConfig(next));
  };

  const updateVni = (idx: number, patch: Partial<VxlanVni>) => {
    const vnis = [...p.vnis];
    vnis[idx] = { ...vnis[idx], ...patch };
    emit({ ...p, vnis });
  };

  const addVni = () => {
    emit({
      ...p,
      vnis: [...p.vnis, { ...defaultVni, vniId: p.vnis.length ? p.vnis[p.vnis.length - 1].vniId + 10 : 5020 }],
    });
  };

  const removeVni = (idx: number) => {
    emit({ ...p, vnis: p.vnis.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">VXLAN 配置</h2>

      <div className="flex gap-4">
        <div className="w-28">
          <label className="block text-sm text-slate-600 mb-1">NVE 编号</label>
          <input
            type="number"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={p.nveId}
            onChange={(e) => emit({ ...p, nveId: Number(e.target.value) })}
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm text-slate-600 mb-1">VTEP 源 IP</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={p.sourceIp}
            onChange={(e) => emit({ ...p, sourceIp: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">VNI 列表</span>
          <button onClick={addVni} className="text-sm text-blue-600 hover:underline">
            + 添加 VNI
          </button>
        </div>

        {p.vnis.map((v, i) => (
          <fieldset key={i} className="border rounded p-3 text-sm space-y-2">
            <div className="flex gap-2 items-center">
              <label className="text-xs text-slate-500 w-12">VNI ID:</label>
              <input
                className="w-24 border rounded px-2 py-1 text-sm"
                type="number"
                value={v.vniId}
                onChange={(e) => updateVni(i, { vniId: Number(e.target.value) })}
              />
              <label className="text-xs text-slate-500 w-12">BD ID:</label>
              <input
                className="w-24 border rounded px-2 py-1 text-sm"
                type="number"
                placeholder="Bridge Domain"
                value={v.bridgeDomainId || ''}
                onChange={(e) =>
                  updateVni(i, { bridgeDomainId: e.target.value ? Number(e.target.value) : undefined })
                }
              />
              {p.vnis.length > 1 && (
                <button onClick={() => removeVni(i)} className="text-red-500 text-xs hover:underline ml-auto">
                  删除
                </button>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">
                远端 VTEP IP（逗号分隔）
              </label>
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="如 2.2.2.2, 3.3.3.3"
                value={v.peerIps}
                onChange={(e) => updateVni(i, { peerIps: e.target.value })}
              />
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
