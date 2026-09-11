import { useState } from 'react';
import { useCommand } from '../../AppContext';
import type { LinkAggParams } from '../../types';

const defaultParams: LinkAggParams = {
  groupId: 1,
  mode: 'static',
  ports: '1,2',
  loadBalance: '',
};

export default function LinkAggForm() {
  const { report } = useCommand();
  const [p, setP] = useState<LinkAggParams>(defaultParams);

  const update = (patch: Partial<LinkAggParams>) => {
    const next = { ...p, ...patch };
    setP(next);
    report('linkagg', next);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">链路聚合配置</h2>

      <div className="flex gap-4">
        <div className="w-32">
          <label className="block text-sm text-slate-600 mb-1">聚合组 ID</label>
          <input
            type="number"
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={p.groupId}
            onChange={(e) => update({ groupId: Number(e.target.value) })}
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm text-slate-600 mb-1">模式</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={p.mode}
            onChange={(e) => update({ mode: e.target.value as 'static' | 'lacp' })}
          >
            <option value="static">Static 静态</option>
            <option value="lacp">LACP 动态</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">成员端口（逗号分隔）</label>
        <input
          type="text"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={p.ports}
          onChange={(e) => update({ ports: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm text-slate-600 mb-1">负载分担模式（可选）</label>
        <input
          type="text"
          className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="如 src-dst-ip, src-dst-mac"
          value={p.loadBalance || ''}
          onChange={(e) => update({ loadBalance: e.target.value })}
        />
      </div>
    </div>
  );
}
