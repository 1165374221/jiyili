import { useState } from 'react';
import { useApp } from '../../AppContext';
import type { LldpParams } from '../../types';

export default function LldpForm({ onChange }: { onChange: (c: string) => void }) {
  const { vendorInstance } = useApp();
  const [p, setP] = useState<LldpParams>({ enable: true });
  const toggle = () => { const next = { enable: !p.enable }; setP(next); onChange(vendorInstance.generateLldpConfig(next)); };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">LLDP 邻居发现</h2>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={p.enable} onChange={toggle} />
        启用 LLDP
      </label>
    </div>
  );
}
