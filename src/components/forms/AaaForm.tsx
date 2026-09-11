import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { AaaParams, AaaLocalUser } from '../../types';

const defaultUser: AaaLocalUser = {
  username: 'admin',
  password: 'Admin@123',
  privilege: 15,
  serviceTypes: ['telnet', 'ssh'],
};

const defaultParams: AaaParams = {
  authMode: 'local',
  localUsers: [defaultUser],
  enableTelnet: true,
  enableSsh: true,
};

interface Props {
  onChange: (cmd: string) => void;
}

export default function AaaForm({ onChange }: Props) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<AaaParams>(defaultParams);

  const emit = (next: AaaParams) => {
    setP(next);
    onChange(vendorInstance.generateAaaConfig(next));
  };

  const updateUser = (idx: number, patch: Partial<AaaLocalUser>) => {
    const users = [...p.localUsers];
    users[idx] = { ...users[idx], ...patch };
    emit({ ...p, localUsers: users });
  };

  const addUser = () => {
    emit({
      ...p,
      localUsers: [...p.localUsers, { ...defaultUser, username: `user${p.localUsers.length + 1}` }],
    });
  };

  const removeUser = (idx: number) => {
    emit({ ...p, localUsers: p.localUsers.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">AAA 认证配置</h2>

      <div>
        <label className="block text-sm text-slate-600 mb-1">认证模式</label>
        <select
          className="w-48 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={p.authMode}
          onChange={(e) => emit({ ...p, authMode: e.target.value as AaaParams['authMode'] })}
        >
          <option value="local">Local 本地</option>
          <option value="radius">RADIUS</option>
          <option value="tacacs+">TACACS+</option>
        </select>
      </div>

      {p.authMode === 'radius' && (
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-slate-600 mb-1">RADIUS 服务器 IP</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={p.radiusServer || ''}
              onChange={(e) => emit({ ...p, radiusServer: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-slate-600 mb-1">共享密钥</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={p.radiusKey || ''}
              onChange={(e) => emit({ ...p, radiusKey: e.target.value })}
            />
          </div>
        </div>
      )}

      {p.authMode === 'tacacs+' && (
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm text-slate-600 mb-1">TACACS+ 服务器 IP</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={p.tacacsServer || ''}
              onChange={(e) => emit({ ...p, tacacsServer: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-slate-600 mb-1">共享密钥</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={p.tacacsKey || ''}
              onChange={(e) => emit({ ...p, tacacsKey: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">本地用户</span>
          <button onClick={addUser} className="text-sm text-blue-600 hover:underline">
            + 添加用户
          </button>
        </div>

        {p.localUsers.map((u, i) => (
          <fieldset key={i} className="border rounded p-3 text-sm space-y-2">
            <div className="flex gap-2 items-center">
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                placeholder="用户名"
                value={u.username}
                onChange={(e) => updateUser(i, { username: e.target.value })}
              />
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                placeholder="密码"
                value={u.password}
                onChange={(e) => updateUser(i, { password: e.target.value })}
              />
              <select
                className="w-28 border rounded px-2 py-1 text-sm"
                value={u.privilege}
                onChange={(e) => updateUser(i, { privilege: Number(e.target.value) })}
                title="权限等级"
              >
                <option value={0}>Level 0 — 访问级</option>
                <option value={1}>Level 1 — 监控级</option>
                <option value={2}>Level 2 — 配置级</option>
                <option value={3}>Level 3 — 管理级</option>
                <option value={15}>Level 15 — 超级管理员</option>
              </select>
              {p.localUsers.length > 1 && (
                <button onClick={() => removeUser(i)} className="text-red-500 hover:underline text-xs">
                  删除
                </button>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-500 mr-2">服务类型：</label>
              {['telnet', 'ssh', 'http', 'https', 'terminal'].map((s) => (
                <label key={s} className="inline-flex items-center gap-1 mr-3 text-xs">
                  <input
                    type="checkbox"
                    checked={u.serviceTypes.includes(s)}
                    onChange={(e) => {
                      const types = e.target.checked
                        ? [...u.serviceTypes, s]
                        : u.serviceTypes.filter((t) => t !== s);
                      updateUser(i, { serviceTypes: types });
                    }}
                  />
                  {s}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={p.enableTelnet}
            onChange={(e) => emit({ ...p, enableTelnet: e.target.checked })}
          />
          启用 Telnet
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={p.enableSsh}
            onChange={(e) => emit({ ...p, enableSsh: e.target.checked })}
          />
          启用 SSH
        </label>
      </div>
    </div>
  );
}
