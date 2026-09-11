import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { AclParams, AclRule, AclCategory } from '../../types';

function emptyRule(id: number, aclType: AclCategory): AclRule {
  const base: AclRule = {
    ruleId: id,
    action: 'permit',
    protocol: 'ip',
    sourceIp: '192.168.1.0',
    sourceWildcard: '0.0.0.255',
    destIp: '0.0.0.0',
    destWildcard: '255.255.255.255',
  };
  if (aclType === 'layer2') {
    base.sourceMac = '0001-0001-0001';
    base.sourceMacMask = 'ffff-ffff-ffff';
  }
  return base;
}

function defaultParams(): AclParams {
  return {
    aclNumber: 3000,
    aclType: 'advanced',
    rules: [emptyRule(5, 'advanced')],
    applyInterface: '',
    applyDirection: 'inbound',
  };
}

interface Props {
  onChange: (cmd: string) => void;
}

export default function AclForm({ onChange }: Props) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<AclParams>(defaultParams());

  const emit = (next: AclParams) => {
    setP(next);
    onChange(vendorInstance.generateAclConfig(next));
  };

  const setType = (t: AclCategory) => {
    const rules = [emptyRule(5, t)];
    let number = p.aclNumber;
    if (t === 'layer2') number = 4000;
    else if (t === 'user') number = 6000;
    else if (t === 'named') number = 0;
    emit({ ...p, aclType: t, aclNumber: number, rules, aclName: '' });
  };

  const updateRule = (idx: number, patch: Partial<AclRule>) => {
    const rules = [...p.rules];
    rules[idx] = { ...rules[idx], ...patch };
    emit({ ...p, rules });
  };

  const addRule = () => {
    const lastId = p.rules.length ? p.rules[p.rules.length - 1].ruleId : 0;
    emit({ ...p, rules: [...p.rules, emptyRule(lastId + 5, p.aclType)] });
  };

  const removeRule = (idx: number) => {
    emit({ ...p, rules: p.rules.filter((_, i) => i !== idx) });
  };

  const isL2 = p.aclType === 'layer2';
  const isNamed = p.aclType === 'named';
  const isBasic = p.aclType === 'basic';
  const showDest = !isBasic && !isL2;
  const showPort = !isL2 && !isBasic;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">ACL 访问控制配置</h2>

      <div className="flex gap-4 flex-wrap">
        {isNamed ? (
          <div className="flex-1 min-w-[160px]">
            <label className="block text-sm text-slate-600 mb-1">ACL 名称</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={p.aclName || ''}
              onChange={(e) => emit({ ...p, aclName: e.target.value })}
              placeholder="如 MYACL"
            />
          </div>
        ) : (
          <div className="w-32">
            <label className="block text-sm text-slate-600 mb-1">ACL 编号</label>
            <input
              type="number"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={p.aclNumber}
              onChange={(e) => emit({ ...p, aclNumber: Number(e.target.value) })}
            />
          </div>
        )}
        <div className="w-40">
          <label className="block text-sm text-slate-600 mb-1">ACL 类型</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={p.aclType}
            onChange={(e) => setType(e.target.value as AclCategory)}
          >
            <option value="basic">基本 ACL</option>
            <option value="advanced">高级 ACL</option>
            <option value="layer2">二层 MAC ACL</option>
            <option value="named">命名 ACL</option>
            <option value="user">用户 ACL</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">时间段名称（可选）</label>
        <input
          type="text"
          className="w-60 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="如 WORKTIME"
          value={p.timeRange || ''}
          onChange={(e) => emit({ ...p, timeRange: e.target.value })}
        />
        <p className="text-xs text-slate-400 mt-1">填写后自动生成 09:00-18:00 工作日 time-range</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">规则列表</span>
          <button onClick={addRule} className="text-sm text-blue-600 hover:underline">
            + 添加规则
          </button>
        </div>

        {p.rules.map((r, i) => (
          <fieldset key={i} className="border rounded p-3 text-sm space-y-2">
            <div className="flex gap-2 items-center">
              <input
                type="number"
                className="w-16 border rounded px-2 py-1 text-sm"
                value={r.ruleId}
                onChange={(e) => updateRule(i, { ruleId: Number(e.target.value) })}
                title="规则编号"
              />
              <select
                className="border rounded px-2 py-1 text-sm"
                value={r.action}
                onChange={(e) => updateRule(i, { action: e.target.value as 'permit' | 'deny' })}
              >
                <option value="permit">Permit</option>
                <option value="deny">Deny</option>
              </select>
              {isL2 ? (
                <div className="flex gap-2 flex-wrap w-full">
                  <input
                    className="flex-1 min-w-[140px] border rounded px-2 py-1 text-sm font-mono"
                    placeholder="源 MAC"
                    value={r.sourceMac || ''}
                    onChange={(e) => updateRule(i, { sourceMac: e.target.value })}
                  />
                  <input
                    className="flex-1 min-w-[140px] border rounded px-2 py-1 text-sm font-mono"
                    placeholder="源 MAC 掩码"
                    value={r.sourceMacMask || ''}
                    onChange={(e) => updateRule(i, { sourceMacMask: e.target.value })}
                  />
                  <input
                    className="flex-1 min-w-[140px] border rounded px-2 py-1 text-sm font-mono"
                    placeholder="目的 MAC"
                    value={r.destMac || ''}
                    onChange={(e) => updateRule(i, { destMac: e.target.value })}
                  />
                  <input
                    className="flex-1 min-w-[140px] border rounded px-2 py-1 text-sm font-mono"
                    placeholder="目的 MAC 掩码"
                    value={r.destMacMask || ''}
                    onChange={(e) => updateRule(i, { destMacMask: e.target.value })}
                  />
                </div>
              ) : (
                <>
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={r.protocol}
                    onChange={(e) => updateRule(i, { protocol: e.target.value as AclRule['protocol'] })}
                  >
                    <option value="ip">IP</option>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="icmp">ICMP</option>
                  </select>
                </>
              )}
              {p.rules.length > 1 && (
                <button onClick={() => removeRule(i)} className="text-red-500 hover:underline ml-auto text-xs">
                  删除
                </button>
              )}
            </div>

            {!isL2 && (
              <div className="flex gap-2 flex-wrap">
                <input
                  className="flex-1 min-w-[120px] border rounded px-2 py-1 text-sm"
                  placeholder="源 IP"
                  value={r.sourceIp}
                  onChange={(e) => updateRule(i, { sourceIp: e.target.value })}
                />
                <input
                  className="flex-1 min-w-[110px] border rounded px-2 py-1 text-sm"
                  placeholder="源通配符"
                  value={r.sourceWildcard}
                  onChange={(e) => updateRule(i, { sourceWildcard: e.target.value })}
                />
                {showDest && (
                  <>
                    <input
                      className="flex-1 min-w-[120px] border rounded px-2 py-1 text-sm"
                      placeholder="目的 IP"
                      value={r.destIp}
                      onChange={(e) => updateRule(i, { destIp: e.target.value })}
                    />
                    <input
                      className="flex-1 min-w-[110px] border rounded px-2 py-1 text-sm"
                      placeholder="目的通配符"
                      value={r.destWildcard}
                      onChange={(e) => updateRule(i, { destWildcard: e.target.value })}
                    />
                  </>
                )}
                {showPort && r.protocol !== 'ip' && r.protocol !== 'icmp' && (
                  <>
                    <input
                      className="w-20 border rounded px-2 py-1 text-sm"
                      placeholder="源端口"
                      type="number"
                      value={r.srcPort || ''}
                      onChange={(e) => updateRule(i, { srcPort: e.target.value ? Number(e.target.value) : undefined })}
                    />
                    <input
                      className="w-20 border rounded px-2 py-1 text-sm"
                      placeholder="目的端口"
                      type="number"
                      value={r.dstPort || ''}
                      onChange={(e) => updateRule(i, { dstPort: e.target.value ? Number(e.target.value) : undefined })}
                    />
                  </>
                )}
              </div>
            )}
          </fieldset>
        ))}
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm text-slate-600 mb-1">应用到接口（可选）</label>
          <input
            type="text"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="如 GigabitEthernet0/0/1"
            value={p.applyInterface || ''}
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
    </div>
  );
}
