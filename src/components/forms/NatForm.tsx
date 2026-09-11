import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { NatParams, NatStaticRule, NatServerRule, NatType } from '../../types';

const defaultStatic: NatStaticRule = { insideIp: '192.168.1.10', globalIp: '202.1.1.1' };
const defaultServer: NatServerRule = { protocol: 'tcp', globalPort: 80, insideIp: '192.168.1.100', insidePort: 80 };

const defaultParams: NatParams = {
  natType: 'static',
  aclNumber: 2000,
  addressPoolId: 1,
  startIp: '202.1.1.1',
  endIp: '202.1.1.10',
  insideInterface: 'GigabitEthernet0/0/0',
  outsideInterface: 'GigabitEthernet0/0/1',
  staticRules: [defaultStatic],
  serverRules: [defaultServer],
};

interface Props {
  onChange: (cmd: string) => void;
}

export default function NatForm({ onChange }: Props) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<NatParams>(defaultParams);

  const emit = (next: NatParams) => {
    setP(next);
    onChange(vendorInstance.generateNatConfig(next));
  };

  const setType = (t: NatType) => emit({ ...p, natType: t });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">NAT 地址转换配置</h2>

      <div>
        <label className="block text-sm text-slate-600 mb-1">NAT 类型</label>
        <select
          className="w-48 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={p.natType}
          onChange={(e) => setType(e.target.value as NatType)}
        >
          <option value="static">Static 静态 NAT</option>
          <option value="dynamic">Dynamic 动态 NAT</option>
          <option value="nat-server">NAT Server 端口映射</option>
        </select>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm text-slate-600 mb-1">内网接口</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={p.insideInterface}
            onChange={(e) => emit({ ...p, insideInterface: e.target.value })}
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm text-slate-600 mb-1">外网接口</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={p.outsideInterface}
            onChange={(e) => emit({ ...p, outsideInterface: e.target.value })}
          />
        </div>
      </div>

      {p.natType === 'static' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">静态映射规则</span>
            <button
              onClick={() => emit({ ...p, staticRules: [...p.staticRules, { ...defaultStatic }] })}
              className="text-sm text-blue-600 hover:underline"
            >
              + 添加
            </button>
          </div>
          {p.staticRules.map((r, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                placeholder="内网 IP"
                value={r.insideIp}
                onChange={(e) => {
                  const rules = [...p.staticRules];
                  rules[i] = { ...rules[i], insideIp: e.target.value };
                  emit({ ...p, staticRules: rules });
                }}
              />
              <span className="text-slate-400">→</span>
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                placeholder="公网 IP"
                value={r.globalIp}
                onChange={(e) => {
                  const rules = [...p.staticRules];
                  rules[i] = { ...rules[i], globalIp: e.target.value };
                  emit({ ...p, staticRules: rules });
                }}
              />
              {p.staticRules.length > 1 && (
                <button
                  onClick={() => emit({ ...p, staticRules: p.staticRules.filter((_, j) => j !== i) })}
                  className="text-red-500 text-xs hover:underline"
                >
                  删除
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {p.natType === 'dynamic' && (
        <div className="space-y-3">
          <div className="flex gap-4">
            <div className="w-32">
              <label className="block text-sm text-slate-600 mb-1">地址池 ID</label>
              <input
                type="number"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={p.addressPoolId}
                onChange={(e) => emit({ ...p, addressPoolId: Number(e.target.value) })}
              />
            </div>
            <div className="w-32">
              <label className="block text-sm text-slate-600 mb-1">ACL 编号</label>
              <input
                type="number"
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={p.aclNumber}
                onChange={(e) => emit({ ...p, aclNumber: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="起始公网 IP"
              value={p.startIp}
              onChange={(e) => emit({ ...p, startIp: e.target.value })}
            />
            <span className="text-slate-400 self-center">~</span>
            <input
              className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="结束公网 IP"
              value={p.endIp}
              onChange={(e) => emit({ ...p, endIp: e.target.value })}
            />
          </div>
        </div>
      )}

      {p.natType === 'nat-server' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="公网 IP (留空=接口地址)"
              value={p.startIp}
              onChange={(e) => emit({ ...p, startIp: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">端口映射规则</span>
            <button
              onClick={() => emit({ ...p, serverRules: [...p.serverRules, { ...defaultServer }] })}
              className="text-sm text-blue-600 hover:underline"
            >
              + 添加
            </button>
          </div>
          {p.serverRules.map((r, i) => (
            <div key={i} className="flex gap-2 items-center flex-wrap">
              <select
                className="border rounded px-2 py-1 text-sm"
                value={r.protocol}
                onChange={(e) => {
                  const rules = [...p.serverRules];
                  rules[i] = { ...rules[i], protocol: e.target.value as 'tcp' | 'udp' };
                  emit({ ...p, serverRules: rules });
                }}
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
              <span className="text-xs text-slate-500">公网端口</span>
              <input
                className="w-20 border rounded px-2 py-1 text-sm"
                type="number"
                value={r.globalPort}
                onChange={(e) => {
                  const rules = [...p.serverRules];
                  rules[i] = { ...rules[i], globalPort: Number(e.target.value) };
                  emit({ ...p, serverRules: rules });
                }}
              />
              <span className="text-slate-400">→</span>
              <input
                className="w-36 border rounded px-2 py-1 text-sm"
                placeholder="内网 IP"
                value={r.insideIp}
                onChange={(e) => {
                  const rules = [...p.serverRules];
                  rules[i] = { ...rules[i], insideIp: e.target.value };
                  emit({ ...p, serverRules: rules });
                }}
              />
              <span className="text-xs text-slate-500">端口</span>
              <input
                className="w-20 border rounded px-2 py-1 text-sm"
                type="number"
                value={r.insidePort}
                onChange={(e) => {
                  const rules = [...p.serverRules];
                  rules[i] = { ...rules[i], insidePort: Number(e.target.value) };
                  emit({ ...p, serverRules: rules });
                }}
              />
              {p.serverRules.length > 1 && (
                <button
                  onClick={() => emit({ ...p, serverRules: p.serverRules.filter((_, j) => j !== i) })}
                  className="text-red-500 text-xs hover:underline"
                >
                  删除
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
