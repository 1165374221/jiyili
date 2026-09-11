import { useState, useRef, useCallback } from 'react';

interface Device {
  id: number;
  type: 'switch' | 'router' | 'firewall';
  x: number;
  y: number;
  label: string;
}

interface Link {
  from: number;
  to: number;
  fromIface: string;
  toIface: string;
}

interface Annotation {
  id: number;
  x: number;
  y: number;
  text: string;
}

const WIDTH = 900;
const HEIGHT = 550;

const deviceColors: Record<string, string> = { switch: '#3b82f6', router: '#f59e0b', firewall: '#ef4444' };

function getDefaultIface(type: string): string {
  if (type === 'switch') return 'GigabitEthernet0/0/1';
  if (type === 'router') return 'GigabitEthernet0/0/0';
  return 'GigabitEthernet1/0/1';
}
function renderDeviceShape(type: string, x: number, y: number, size: number) {
  const r = size / 2;
  switch (type) {
    case 'router':
      return <circle cx={x} cy={y} r={r} />;
    case 'firewall':
      return <polygon points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`} />;
    default:
      return <rect x={x - r} y={y - r} width={size} height={size} rx={4} />;
  }
}

export default function TopoForm() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [selectedType, setSelectedType] = useState<'switch' | 'router' | 'firewall'>('switch');
  const [mode, setMode] = useState<'add' | 'connect' | 'move'>('add');
  const [connectFrom, setConnectFrom] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragAnnotation, setDragAnnotation] = useState<number | null>(null);
  const [nextId, setNextId] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const getMousePos = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (mode !== 'add') return;
    const pos = getMousePos(e);
    setDevices((prev) => [...prev, { id: nextId, type: selectedType, x: pos.x, y: pos.y, label: `${selectedType}${nextId}` }]);
    setNextId((n) => n + 1);
  };

  const handleCanvasDblClick = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    const text = prompt('注释内容：', 'VLAN 100 / 10.0.0.0/24');
    if (text) {
      setAnnotations((prev) => [...prev, { id: nextId, x: pos.x, y: pos.y, text }]);
      setNextId((n) => n + 1);
    }
  };

  const handleDeviceClick = (_e: React.MouseEvent, devId: number) => {
    _e.stopPropagation();
    if (mode === 'connect') {
      if (connectFrom === null) { setConnectFrom(devId); }
      else if (connectFrom !== devId) {
        const fromDev = findDevice(connectFrom);
        const toDev = findDevice(devId);
        const fromIface = prompt(`[${fromDev?.label}] 接口名：`, getDefaultIface(fromDev?.type || 'switch')) || 'Gi0/0/1';
        const toIface = prompt(`[${toDev?.label}] 接口名：`, getDefaultIface(toDev?.type || 'switch')) || 'Gi0/0/1';
        setLinks((prev) => [...prev, { from: connectFrom, to: devId, fromIface, toIface }]);
        setConnectFrom(null);
      } else { setConnectFrom(null); }
    }
  };

  const handleMouseDown = (_e: React.MouseEvent, devId: number) => {
    if (mode === 'move') { setDragging(devId); }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    if (dragging !== null && mode === 'move') {
      setDevices((prev) => prev.map((d) => (d.id === dragging ? { ...d, x: pos.x, y: pos.y } : d)));
    }
    if (dragAnnotation !== null) {
      setAnnotations((prev) => prev.map((a) => (a.id === dragAnnotation ? { ...a, x: pos.x, y: pos.y } : a)));
    }
  };

  const handleMouseUp = () => { setDragging(null); setDragAnnotation(null); };

  const deleteDevice = (id: number) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
    setLinks((prev) => prev.filter((l) => l.from !== id && l.to !== id));
    setConnectFrom(null);
  };

  const findDevice = (id: number) => devices.find((d) => d.id === id);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-800">网络拓扑</h2>

      {/* Toolbar */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm text-slate-600 mr-2">设备类型：</span>
        {(['switch', 'router', 'firewall'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setSelectedType(t); setMode('add'); setConnectFrom(null); }}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              selectedType === t && mode === 'add'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
            style={{ borderLeftWidth: '4px', borderLeftColor: deviceColors[t] }}
          >
            {t === 'switch' ? '交换机' : t === 'router' ? '路由器' : '防火墙'}
          </button>
        ))}
        <span className="text-slate-300 mx-1">|</span>
        {(['add', 'connect', 'move'] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setConnectFrom(null); }}
            className={`px-3 py-1.5 text-xs rounded border ${
              mode === m ? 'bg-slate-700 text-white border-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {m === 'add' ? '➕ 放置' : m === 'connect' ? '🔗 连线' : '✋ 移动'}
          </button>
        ))}
        <button
          onClick={() => { setDevices([]); setLinks([]); setAnnotations([]); setConnectFrom(null); }}
          className="px-3 py-1.5 text-xs border border-red-300 text-red-500 rounded hover:bg-red-50 ml-auto"
        >
          清空
        </button>
        {connectFrom !== null && (
          <span className="text-xs text-amber-600">
            请点击目标设备完成连线（当前选中：{findDevice(connectFrom)?.label}）
          </span>
        )}
      </div>

      {/* Canvas */}
      <svg
        ref={svgRef}
        width={WIDTH}
        height={HEIGHT}
        className="border border-slate-300 rounded-lg bg-slate-50 cursor-crosshair"
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDblClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid */}
        {Array.from({ length: Math.floor(WIDTH / 40) }, (_, i) => (
          <line key={`gv${i}`} x1={i * 40} y1={0} x2={i * 40} y2={HEIGHT} stroke="#e5e7eb" strokeWidth={0.5} />
        ))}
        {Array.from({ length: Math.floor(HEIGHT / 40) }, (_, i) => (
          <line key={`gh${i}`} x1={0} y1={i * 40} x2={WIDTH} y2={i * 40} stroke="#e5e7eb" strokeWidth={0.5} />
        ))}

        {/* Links */}
        {links.map((l, i) => {
          const from = findDevice(l.from);
          const to = findDevice(l.to);
          if (!from || !to) return null;
          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2;
          return (
            <g key={`link-${i}`}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#94a3b8" strokeWidth={2} />
              <text x={mx} y={my - 6} textAnchor="middle" fill="#64748b" fontSize="9">
                {l.fromIface} → {l.toIface}
              </text>
            </g>
          );
        })}

        {/* Annotations */}
        {annotations.map((a) => (
          <g key={`ann-${a.id}`}
            onMouseDown={() => setDragAnnotation(a.id)}
            style={{ cursor: 'move' }}
          >
            <rect x={a.x - 4} y={a.y - 4} width={a.text.length * 7 + 16} height={22} rx={3} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1} opacity={0.9} />
            <text
              x={a.x + 4} y={a.y + 11}
              fill="#92400e" fontSize="11"
              onDoubleClick={() => {
                const t = prompt('修改注释：', a.text);
                if (t) setAnnotations((prev) => prev.map((x) => (x.id === a.id ? { ...x, text: t } : x)));
              }}
            >
              {a.text}
            </text>
          </g>
        ))}

        {/* Devices */}
        {devices.map((d) => (
          <g
            key={d.id}
            onClick={(e) => handleDeviceClick(e, d.id)}
            onDoubleClick={() => {
              const name = prompt('设备名称：', d.label);
              if (name) setDevices((prev) => prev.map((x) => (x.id === d.id ? { ...x, label: name } : x)));
            }}
            onMouseDown={(e) => handleMouseDown(e, d.id)}
            className="cursor-pointer select-none"
            style={{ opacity: connectFrom !== null && connectFrom !== d.id ? 0.4 : 1 }}
          >
            {renderDeviceShape(d.type, d.x, d.y, 28)}
            <text x={d.x} y={d.y + 4} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
              {d.type === 'switch' ? 'S' : d.type === 'router' ? 'R' : 'F'}
            </text>
            <text x={d.x} y={d.y + 28} textAnchor="middle" fill="#475569" fontSize="11">
              {d.label}
            </text>
          </g>
        ))}

        {/* Connection highlight */}
        {connectFrom !== null && (() => {
          const from = findDevice(connectFrom);
          if (!from) return null;
          return <circle cx={from.x} cy={from.y} r={20} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4,2" />;
        })()}

        {/* Hint text */}
        {devices.length === 0 && (
          <text x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle" fill="#cbd5e1" fontSize="14">
            点击放置设备 · 双击空白处添加注释
          </text>
        )}
      </svg>

      {/* Device table */}
      {devices.length > 0 && (
        <div className="text-xs text-slate-500">
          <table className="w-full">
            <thead><tr className="text-left border-b"><th className="py-1">设备</th><th>类型</th><th>连接</th><th></th></tr></thead>
            <tbody>
              {devices.map((d) => {
                const connLinks = links.filter((l) => l.from === d.id || l.to === d.id);
                return (
                  <tr key={d.id} className="border-b border-slate-100">
                    <td className="py-1 font-medium">{d.label}</td>
                    <td>{d.type === 'switch' ? '交换机' : d.type === 'router' ? '路由器' : '防火墙'}</td>
                    <td>
                      {connLinks.map((l) => {
                        const localIface = l.from === d.id ? l.fromIface : l.toIface;
                        const other = l.from === d.id ? findDevice(l.to) : findDevice(l.from);
                        return other ? (
                          <span key={other.id} className="mr-2 inline-block">
                            {localIface} ↔ {other.label}
                          </span>
                        ) : null;
                      })}
                    </td>
                    <td>
                      <button onClick={() => deleteDevice(d.id)} className="text-red-400 hover:underline">删除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
