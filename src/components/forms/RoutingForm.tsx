import { useState } from 'react';
import { useCommand } from '../../AppContext';
import type { RoutingParams, StaticRoute } from '../../types';

const defaultParams: RoutingParams = {
  staticRoutes: [],
  ospf: undefined,
  bgp: undefined,
};

export default function RoutingForm() {
  const { report } = useCommand();
  const [p, setP] = useState<RoutingParams>(defaultParams);

  const emit = (next: RoutingParams) => {
    setP(next);
    report('routing', next);
  };

  const addStatic = () => {
    emit({
      ...p,
      staticRoutes: [...p.staticRoutes, { destination: '', mask: '255.255.255.0', nextHop: '' }],
    });
  };

  const updateStatic = (idx: number, patch: Partial<StaticRoute>) => {
    const routes = [...p.staticRoutes];
    routes[idx] = { ...routes[idx], ...patch };
    emit({ ...p, staticRoutes: routes });
  };

  const addOspfNet = () => {
    if (!p.ospf) {
      emit({ ...p, ospf: { processId: 1, routerId: '1.1.1.1', area: '0', networks: [], defaultOriginate: false } });
    } else {
      emit({
        ...p,
        ospf: { ...p.ospf, networks: [...p.ospf.networks, { network: '', wildcard: '0.0.0.255' }] },
      });
    }
  };

  const addBgpNeighbor = () => {
    if (!p.bgp) {
      emit({ ...p, bgp: { asNumber: 65001, routerId: '1.1.1.1', neighbors: [], networks: [] } });
    } else {
      emit({
        ...p,
        bgp: { ...p.bgp, neighbors: [...p.bgp.neighbors, { ip: '', remoteAs: 65002 }] },
      });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-800">路由配置</h2>

      {/* Static Routes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">静态路由</span>
          <button onClick={addStatic} className="text-sm text-blue-600 hover:underline">+ 添加</button>
        </div>
        {p.staticRoutes.map((r, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              className="flex-1 border rounded px-2 py-1 text-sm"
              placeholder="目的网络"
              value={r.destination}
              onChange={(e) => updateStatic(i, { destination: e.target.value })}
            />
            <input
              className="w-36 border rounded px-2 py-1 text-sm"
              placeholder="掩码"
              value={r.mask}
              onChange={(e) => updateStatic(i, { mask: e.target.value })}
            />
            <input
              className="flex-1 border rounded px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
              placeholder={r.blackhole ? 'NULL0 (黑洞)' : '下一跳'}
              value={r.blackhole ? 'NULL0' : r.nextHop}
              disabled={r.blackhole}
              onChange={(e) => updateStatic(i, { nextHop: e.target.value })}
            />
            <input
              className="w-20 border rounded px-2 py-1 text-sm"
              placeholder="优先级"
              type="number"
              value={r.preference || ''}
              onChange={(e) =>
                updateStatic(i, { preference: e.target.value ? Number(e.target.value) : undefined })
              }
            />
            <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={r.blackhole || false}
                onChange={(e) => updateStatic(i, { blackhole: e.target.checked })}
              />
              黑洞
            </label>
            <button
              onClick={() =>
                emit({ ...p, staticRoutes: p.staticRoutes.filter((_, j) => j !== i) })
              }
              className="text-red-500 text-xs hover:underline"
            >
              删除
            </button>
          </div>
        ))}
      </div>

      {/* OSPF */}
      <div className="border-t pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">OSPF</span>
          <button onClick={addOspfNet} className="text-sm text-blue-600 hover:underline">
            {p.ospf ? '+ 添加网络' : '+ 启用 OSPF'}
          </button>
        </div>
        {p.ospf && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                className="w-24 border rounded px-2 py-1 text-sm"
                placeholder="进程ID"
                type="number"
                value={p.ospf.processId}
                onChange={(e) => emit({ ...p, ospf: { ...p.ospf!, processId: Number(e.target.value) } })}
              />
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                placeholder="Router ID"
                value={p.ospf.routerId}
                onChange={(e) => emit({ ...p, ospf: { ...p.ospf!, routerId: e.target.value } })}
              />
              <input
                className="w-24 border rounded px-2 py-1 text-sm"
                placeholder="Area"
                value={p.ospf.area}
                onChange={(e) => emit({ ...p, ospf: { ...p.ospf!, area: e.target.value } })}
              />
            </div>
            {p.ospf.networks.map((n, i) => (
              <div key={i} className="flex gap-2">
                <input className="flex-1 border rounded px-2 py-1 text-sm" placeholder="网络地址" value={n.network} onChange={(e) => { const nets = [...p.ospf!.networks]; nets[i] = { ...nets[i], network: e.target.value }; emit({ ...p, ospf: { ...p.ospf!, networks: nets } }); }} />
                <input className="flex-1 border rounded px-2 py-1 text-sm" placeholder="通配符掩码" value={n.wildcard} onChange={(e) => { const nets = [...p.ospf!.networks]; nets[i] = { ...nets[i], wildcard: e.target.value }; emit({ ...p, ospf: { ...p.ospf!, networks: nets } }); }} />
                <button onClick={() => { const nets = p.ospf!.networks.filter((_, j) => j !== i); emit({ ...p, ospf: { ...p.ospf!, networks: nets } }); }} className="text-red-500 text-xs hover:underline">删除</button>
              </div>
            ))}
            {/* OSPF advanced */}
            <div className="flex gap-2 flex-wrap items-center border-t pt-2 mt-1">
              <select className="w-24 border rounded px-2 py-1 text-xs" value={p.ospf.networkType || ''} onChange={(e) => emit({ ...p, ospf: { ...p.ospf!, networkType: e.target.value as any } })}>
                <option value="">网络类型</option><option value="broadcast">Broadcast</option><option value="nbma">NBMA</option><option value="p2p">P2P</option><option value="p2mp">P2MP</option>
              </select>
              <input className="w-16 border rounded px-2 py-1 text-xs" type="number" placeholder="开销" value={p.ospf.cost || ''} onChange={(e) => emit({ ...p, ospf: { ...p.ospf!, cost: Number(e.target.value) } })} />
              <select className="w-20 border rounded px-2 py-1 text-xs" value={p.ospf.authMode || ''} onChange={(e) => emit({ ...p, ospf: { ...p.ospf!, authMode: e.target.value as any } })}>
                <option value="">无认证</option><option value="simple">明文</option><option value="md5">MD5</option>
              </select>
              {p.ospf.authMode && <input className="w-20 border rounded px-2 py-1 text-xs" placeholder="密钥" value={p.ospf.authKey || ''} onChange={(e) => emit({ ...p, ospf: { ...p.ospf!, authKey: e.target.value } })} />}
              <input className="flex-1 min-w-[100px] border rounded px-2 py-1 text-xs" placeholder="静默接口(逗号分割)" value={p.ospf.passiveInterfaces || ''} onChange={(e) => emit({ ...p, ospf: { ...p.ospf!, passiveInterfaces: e.target.value } })} />
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={p.ospf.defaultOriginate} onChange={(e) => emit({ ...p, ospf: { ...p.ospf!, defaultOriginate: e.target.checked } })} />缺省路由</label>
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={p.ospf.isV3 || false} onChange={(e) => emit({ ...p, ospf: { ...p.ospf!, isV3: e.target.checked } })} />OSPFv3</label>
              <input className="w-28 border rounded px-2 py-1 text-xs" placeholder="重分发(static)" value={p.ospf.redistribute?.join(',') || ''} onChange={(e) => emit({ ...p, ospf: { ...p.ospf!, redistribute: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) } })} />
            </div>
          </div>
        )}
      </div>

      {/* RIP */}
      <div className="border-t pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">RIP</span>
          <button onClick={() => { if (!p.rip) emit({ ...p, rip: { version: 2, networks: [], defaultOriginate: false } }); else emit({ ...p, rip: { ...p.rip!, networks: [...p.rip!.networks, ''] } }); }} className="text-sm text-blue-600 hover:underline">
            {p.rip ? '+ 添加网络' : '+ 启用 RIP'}
          </button>
        </div>
        {p.rip && (
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <select className="w-20 border rounded px-2 py-1 text-sm" value={p.rip.version} onChange={(e) => emit({ ...p, rip: { ...p.rip!, version: Number(e.target.value) as 1 | 2 } })}><option value={1}>v1</option><option value={2}>v2</option></select>
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={p.rip.defaultOriginate} onChange={(e) => emit({ ...p, rip: { ...p.rip!, defaultOriginate: e.target.checked } })} />缺省路由</label>
              <input className="flex-1 min-w-[100px] border rounded px-2 py-1 text-xs" placeholder="静默接口" value={p.rip.passiveInterfaces || ''} onChange={(e) => emit({ ...p, rip: { ...p.rip!, passiveInterfaces: e.target.value } })} />
              <input className="w-24 border rounded px-2 py-1 text-xs" placeholder="重分发" value={p.rip.redistribute?.join(',') || ''} onChange={(e) => emit({ ...p, rip: { ...p.rip!, redistribute: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) } })} />
            </div>
            {p.rip.networks.map((n, i) => (
              <div key={i} className="flex gap-2">
                <input className="flex-1 border rounded px-2 py-1 text-sm" placeholder="网络地址 如 192.168.1.0" value={n} onChange={(e) => { const ns = [...p.rip!.networks]; ns[i] = e.target.value; emit({ ...p, rip: { ...p.rip!, networks: ns } }); }} />
                <button onClick={() => { const ns = p.rip!.networks.filter((_, j) => j !== i); emit({ ...p, rip: { ...p.rip!, networks: ns } }); }} className="text-red-500 text-xs hover:underline">删除</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BGP */}
      <div className="border-t pt-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">BGP</span>
          <button onClick={addBgpNeighbor} className="text-sm text-blue-600 hover:underline">
            {p.bgp ? '+ 添加邻居' : '+ 启用 BGP'}
          </button>
        </div>
        {p.bgp && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                className="w-28 border rounded px-2 py-1 text-sm"
                placeholder="AS 号"
                type="number"
                value={p.bgp.asNumber}
                onChange={(e) => emit({ ...p, bgp: { ...p.bgp!, asNumber: Number(e.target.value) } })}
              />
              <input
                className="flex-1 border rounded px-2 py-1 text-sm"
                placeholder="Router ID"
                value={p.bgp.routerId}
                onChange={(e) => emit({ ...p, bgp: { ...p.bgp!, routerId: e.target.value } })}
              />
            </div>
            <p className="text-xs text-slate-500">邻居</p>
            {p.bgp.neighbors.map((n, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="flex-1 border rounded px-2 py-1 text-sm"
                  placeholder="邻居 IP"
                  value={n.ip}
                  onChange={(e) => {
                    const nbrs = [...p.bgp!.neighbors];
                    nbrs[i] = { ...nbrs[i], ip: e.target.value };
                    emit({ ...p, bgp: { ...p.bgp!, neighbors: nbrs } });
                  }}
                />
                <input
                  className="w-28 border rounded px-2 py-1 text-sm"
                  placeholder="远程 AS"
                  type="number"
                  value={n.remoteAs}
                  onChange={(e) => {
                    const nbrs = [...p.bgp!.neighbors];
                    nbrs[i] = { ...nbrs[i], remoteAs: Number(e.target.value) };
                    emit({ ...p, bgp: { ...p.bgp!, neighbors: nbrs } });
                  }}
                />
                <button
                  onClick={() => {
                    const nbrs = p.bgp!.neighbors.filter((_, j) => j !== i);
                    emit({ ...p, bgp: { ...p.bgp!, neighbors: nbrs } });
                  }}
                  className="text-red-500 text-xs hover:underline"
                >
                  删除
                </button>
              </div>
            ))}
            <p className="text-xs text-slate-500">通告网络</p>
            {p.bgp.networks.map((nw, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="flex-1 border rounded px-2 py-1 text-sm"
                  placeholder="网络地址"
                  value={nw.network}
                  onChange={(e) => {
                    const nws = [...p.bgp!.networks];
                    nws[i] = { ...nws[i], network: e.target.value };
                    emit({ ...p, bgp: { ...p.bgp!, networks: nws } });
                  }}
                />
                <input
                  className="flex-1 border rounded px-2 py-1 text-sm"
                  placeholder="掩码"
                  value={nw.mask}
                  onChange={(e) => {
                    const nws = [...p.bgp!.networks];
                    nws[i] = { ...nws[i], mask: e.target.value };
                    emit({ ...p, bgp: { ...p.bgp!, networks: nws } });
                  }}
                />
                <button
                  onClick={() => {
                    const nws = p.bgp!.networks.filter((_, j) => j !== i);
                    emit({ ...p, bgp: { ...p.bgp!, networks: nws } });
                  }}
                  className="text-red-500 text-xs hover:underline"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
