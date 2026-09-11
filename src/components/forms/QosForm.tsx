import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { QosParams, MatchType } from '../../types';

const defaultParams: QosParams = {
  classifiers: [{ name: 'c1', matchType: 'any' }],
  behaviors: [{ name: 'b1', carRate: 1024 }],
  policyName: 'p1',
  policyRules: [{ classifierName: 'c1', behaviorName: 'b1' }],
  applyInterface: 'GigabitEthernet0/0/1',
  applyDirection: 'inbound',
  enableFlowControl: false,
  flowControlInterface: 'GigabitEthernet0/0/1',
};

interface Props {
  onChange: (cmd: string) => void;
}

export default function QosForm({ onChange }: Props) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<QosParams>(defaultParams);

  const emit = (next: QosParams) => {
    setP(next);
    onChange(vendorInstance.generateQosConfig(next));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-800">QoS 流策略 & 流控制</h2>

      {/* Classifiers */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">流分类 Classifier</span>
          <button
            onClick={() => emit({ ...p, classifiers: [...p.classifiers, { name: `c${p.classifiers.length + 1}`, matchType: 'any' }] })}
            className="text-sm text-blue-600 hover:underline"
          >
            + 添加
          </button>
        </div>
        {p.classifiers.map((c, i) => (
          <div key={i} className="flex gap-2 items-center flex-wrap border rounded p-2">
            <input
              className="w-24 border rounded px-2 py-1 text-sm"
              placeholder="名称"
              value={c.name}
              onChange={(e) => {
                const list = [...p.classifiers];
                list[i] = { ...list[i], name: e.target.value };
                emit({ ...p, classifiers: list });
              }}
            />
            <select
              className="border rounded px-2 py-1 text-sm"
              value={c.matchType}
              onChange={(e) => {
                const list = [...p.classifiers];
                list[i] = { ...list[i], matchType: e.target.value as MatchType };
                emit({ ...p, classifiers: list });
              }}
            >
              <option value="any">Any</option>
              <option value="acl">ACL</option>
              <option value="dscp">DSCP</option>
              <option value="precedence">IP Precedence</option>
              <option value="vlan-8021p">802.1p</option>
            </select>
            {c.matchType === 'acl' && (
              <input
                className="w-24 border rounded px-2 py-1 text-sm"
                placeholder="ACL编号"
                type="number"
                value={c.aclNumber || ''}
                onChange={(e) => {
                  const list = [...p.classifiers];
                  list[i] = { ...list[i], aclNumber: Number(e.target.value) };
                  emit({ ...p, classifiers: list });
                }}
              />
            )}
            {c.matchType === 'dscp' && (
              <input
                className="w-24 border rounded px-2 py-1 text-sm"
                placeholder="如 af41"
                value={c.dscpValue || ''}
                onChange={(e) => {
                  const list = [...p.classifiers];
                  list[i] = { ...list[i], dscpValue: e.target.value };
                  emit({ ...p, classifiers: list });
                }}
              />
            )}
            {c.matchType === 'precedence' && (
              <input
                className="w-16 border rounded px-2 py-1 text-sm"
                placeholder="0-7"
                type="number"
                value={c.precedenceValue ?? ''}
                onChange={(e) => {
                  const list = [...p.classifiers];
                  list[i] = { ...list[i], precedenceValue: Number(e.target.value) };
                  emit({ ...p, classifiers: list });
                }}
              />
            )}
            {c.matchType === 'vlan-8021p' && (
              <input
                className="w-16 border rounded px-2 py-1 text-sm"
                placeholder="0-7"
                type="number"
                value={c.vlan8021p ?? ''}
                onChange={(e) => {
                  const list = [...p.classifiers];
                  list[i] = { ...list[i], vlan8021p: Number(e.target.value) };
                  emit({ ...p, classifiers: list });
                }}
              />
            )}
            {p.classifiers.length > 1 && (
              <button
                onClick={() => emit({ ...p, classifiers: p.classifiers.filter((_, j) => j !== i) })}
                className="text-red-500 text-xs hover:underline"
              >
                删除
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Behaviors */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">流行为 Behavior</span>
          <button
            onClick={() => emit({ ...p, behaviors: [...p.behaviors, { name: `b${p.behaviors.length + 1}` }] })}
            className="text-sm text-blue-600 hover:underline"
          >
            + 添加
          </button>
        </div>
        {p.behaviors.map((b, i) => (
          <div key={i} className="border rounded p-3 text-sm space-y-2">
            <div className="flex gap-2 items-center">
              <input
                className="w-24 border rounded px-2 py-1 text-sm"
                placeholder="名称"
                value={b.name}
                onChange={(e) => {
                  const list = [...p.behaviors];
                  list[i] = { ...list[i], name: e.target.value };
                  emit({ ...p, behaviors: list });
                }}
              />
              {p.behaviors.length > 1 && (
                <button
                  onClick={() => emit({ ...p, behaviors: p.behaviors.filter((_, j) => j !== i) })}
                  className="text-red-500 text-xs hover:underline"
                >
                  删除
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <label className="text-xs text-slate-500 shrink-0">限速(kbps):</label>
              <input
                className="w-20 border rounded px-2 py-1 text-sm"
                type="number"
                placeholder="CIR"
                value={b.carRate || ''}
                onChange={(e) => {
                  const list = [...p.behaviors];
                  list[i] = { ...list[i], carRate: Number(e.target.value) };
                  emit({ ...p, behaviors: list });
                }}
              />
              <label className="text-xs text-slate-500 shrink-0">突发:</label>
              <input
                className="w-20 border rounded px-2 py-1 text-sm"
                type="number"
                placeholder="CBS"
                value={b.carBurst || ''}
                onChange={(e) => {
                  const list = [...p.behaviors];
                  list[i] = { ...list[i], carBurst: Number(e.target.value) };
                  emit({ ...p, behaviors: list });
                }}
              />
              <label className="text-xs text-slate-500 shrink-0">DSCP:</label>
              <input
                className="w-20 border rounded px-2 py-1 text-sm"
                placeholder="af41"
                value={b.remarkDscp || ''}
                onChange={(e) => {
                  const list = [...p.behaviors];
                  list[i] = { ...list[i], remarkDscp: e.target.value };
                  emit({ ...p, behaviors: list });
                }}
              />
              <label className="text-xs text-slate-500 shrink-0">802.1p:</label>
              <input
                className="w-14 border rounded px-2 py-1 text-sm"
                placeholder="0-7"
                type="number"
                value={b.remark8021p ?? ''}
                onChange={(e) => {
                  const list = [...p.behaviors];
                  list[i] = { ...list[i], remark8021p: Number(e.target.value) };
                  emit({ ...p, behaviors: list });
                }}
              />
              <label className="text-xs text-slate-500 shrink-0">重定向:</label>
              <input
                className="flex-1 min-w-[120px] border rounded px-2 py-1 text-sm"
                placeholder="接口名"
                value={b.redirectInterface || ''}
                onChange={(e) => {
                  const list = [...p.behaviors];
                  list[i] = { ...list[i], redirectInterface: e.target.value };
                  emit({ ...p, behaviors: list });
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Policy rules */}
      <div className="space-y-2">
        <span className="text-sm font-medium text-slate-700">策略绑定</span>
        <div className="flex gap-2 items-center">
          <label className="text-xs text-slate-500">策略名:</label>
          <input
            className="w-24 border rounded px-2 py-1 text-sm"
            value={p.policyName}
            onChange={(e) => emit({ ...p, policyName: e.target.value })}
          />
        </div>
        {p.policyRules.map((pr, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-xs text-slate-500">classifier</span>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={pr.classifierName}
              onChange={(e) => {
                const list = [...p.policyRules];
                list[i] = { ...list[i], classifierName: e.target.value };
                emit({ ...p, policyRules: list });
              }}
            >
              {p.classifiers.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500">→ behavior</span>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={pr.behaviorName}
              onChange={(e) => {
                const list = [...p.policyRules];
                list[i] = { ...list[i], behaviorName: e.target.value };
                emit({ ...p, policyRules: list });
              }}
            >
              {p.behaviors.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
            {p.policyRules.length > 1 && (
              <button
                onClick={() => emit({ ...p, policyRules: p.policyRules.filter((_, j) => j !== i) })}
                className="text-red-500 text-xs hover:underline"
              >
                删除
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => {
            const cName = p.classifiers[0]?.name || 'c1';
            const bName = p.behaviors[0]?.name || 'b1';
            emit({ ...p, policyRules: [...p.policyRules, { classifierName: cName, behaviorName: bName }] });
          }}
          className="text-sm text-blue-600 hover:underline"
        >
          + 添加绑定
        </button>
      </div>

      {/* Apply */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm text-slate-600 mb-1">应用接口</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={p.applyInterface}
            onChange={(e) => emit({ ...p, applyInterface: e.target.value })}
          />
        </div>
        <div className="w-32">
          <label className="block text-sm text-slate-600 mb-1">方向</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={p.applyDirection}
            onChange={(e) => emit({ ...p, applyDirection: e.target.value as 'inbound' | 'outbound' })}
          >
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>
      </div>

      {/* Flow control */}
      <div className="border-t pt-4 space-y-3">
        <span className="text-sm font-medium text-slate-700">接口流控制 (802.3x)</span>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={p.enableFlowControl}
            onChange={(e) => emit({ ...p, enableFlowControl: e.target.checked })}
          />
          启用 Flow Control
        </label>
        {p.enableFlowControl && (
          <div>
            <label className="block text-sm text-slate-600 mb-1">流控接口</label>
            <input
              type="text"
              className="w-72 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={p.flowControlInterface}
              onChange={(e) => emit({ ...p, flowControlInterface: e.target.value })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
