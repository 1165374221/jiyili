import { useApp } from '../AppContext';
import { DEVICE_MODELS } from '../types';

export default function Header() {
  const { vendor, model, vendorList, setVendor, setModel } = useApp();
  const models = DEVICE_MODELS[vendor];

  return (
    <header className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between shrink-0">
      <h1 className="text-lg font-bold tracking-wide">交换机命令生成工具</h1>
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-300">厂商：</label>
        <select
          value={vendor}
          onChange={(e) => setVendor(e.target.value as typeof vendor)}
          className="bg-slate-700 text-white border border-slate-600 rounded px-3 py-1 text-sm focus:outline-none focus:border-blue-400"
        >
          {vendorList.map((v) => (
            <option key={v.key} value={v.key}>{v.name}</option>
          ))}
        </select>

        <label className="text-sm text-slate-300">型号：</label>
        <select
          value={model.id}
          onChange={(e) => {
            const m = models.find((x) => x.id === e.target.value);
            if (m) setModel(m);
          }}
          className="bg-slate-700 text-white border border-slate-600 rounded px-3 py-1 text-sm focus:outline-none focus:border-blue-400 min-w-[160px]"
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        <span className="text-xs text-slate-400 font-mono">端口前缀：{model.ports}</span>
      </div>
    </header>
  );
}
