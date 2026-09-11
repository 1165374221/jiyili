import { useState } from 'react';
import { useCommand } from '../../AppContext';
import type { StackParams, StackMember, StackPort } from '../../types';

const defaultMember: StackMember = { memberId: 1, priority: 150, domainId: 10 };
const defaultPort: StackPort = { portId: '1/1', interfaces: 'GigabitEthernet0/0/1' };

const defaultParams: StackParams = {
  members: [{ ...defaultMember }],
  stackPorts: [{ ...defaultPort }],
};

export default function StackForm() {
  const { report } = useCommand();
  const [p, setP] = useState<StackParams>(defaultParams);

  const emit = (next: StackParams) => {
    setP(next);
    report('stack', next);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">堆叠配置</h2>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">成员设备</span>
          <button
            onClick={() =>
              emit({
                ...p,
                members: [
                  ...p.members,
                  { ...defaultMember, memberId: p.members.length + 1 },
                ],
              })
            }
            className="text-sm text-blue-600 hover:underline"
          >
            + 添加成员
          </button>
        </div>
        {p.members.map((m, i) => (
          <div key={i} className="flex gap-2 items-center flex-wrap border rounded p-2">
            <label className="text-xs text-slate-500">ID:</label>
            <input
              className="w-16 border rounded px-2 py-1 text-sm"
              type="number"
              value={m.memberId}
              onChange={(e) => {
                const list = [...p.members];
                list[i] = { ...list[i], memberId: Number(e.target.value) };
                emit({ ...p, members: list });
              }}
            />
            <label className="text-xs text-slate-500">优先级:</label>
            <input
              className="w-20 border rounded px-2 py-1 text-sm"
              type="number"
              value={m.priority}
              onChange={(e) => {
                const list = [...p.members];
                list[i] = { ...list[i], priority: Number(e.target.value) };
                emit({ ...p, members: list });
              }}
            />
            <label className="text-xs text-slate-500">域ID:</label>
            <input
              className="w-16 border rounded px-2 py-1 text-sm"
              type="number"
              value={m.domainId || ''}
              onChange={(e) => {
                const list = [...p.members];
                list[i] = { ...list[i], domainId: e.target.value ? Number(e.target.value) : undefined };
                emit({ ...p, members: list });
              }}
            />
            {p.members.length > 1 && (
              <button
                onClick={() => emit({ ...p, members: p.members.filter((_, j) => j !== i) })}
                className="text-red-500 text-xs hover:underline"
              >
                删除
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">堆叠口</span>
          <button
            onClick={() =>
              emit({
                ...p,
                stackPorts: [...p.stackPorts, { ...defaultPort, portId: `1/${p.stackPorts.length + 1}` }],
              })
            }
            className="text-sm text-blue-600 hover:underline"
          >
            + 添加堆叠口
          </button>
        </div>
        {p.stackPorts.map((sp, i) => (
          <div key={i} className="flex gap-2 items-center flex-wrap border rounded p-2">
            <label className="text-xs text-slate-500">端口ID:</label>
            <input
              className="w-20 border rounded px-2 py-1 text-sm"
              value={sp.portId}
              onChange={(e) => {
                const list = [...p.stackPorts];
                list[i] = { ...list[i], portId: e.target.value };
                emit({ ...p, stackPorts: list });
              }}
            />
            <label className="text-xs text-slate-500">物理接口:</label>
            <input
              className="flex-1 min-w-[200px] border rounded px-2 py-1 text-sm"
              placeholder="如 GigabitEthernet0/0/1"
              value={sp.interfaces}
              onChange={(e) => {
                const list = [...p.stackPorts];
                list[i] = { ...list[i], interfaces: e.target.value };
                emit({ ...p, stackPorts: list });
              }}
            />
            {p.stackPorts.length > 1 && (
              <button
                onClick={() => emit({ ...p, stackPorts: p.stackPorts.filter((_, j) => j !== i) })}
                className="text-red-500 text-xs hover:underline"
              >
                删除
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
