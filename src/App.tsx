import { useState, useCallback, useRef } from 'react';
import { AppProvider, ConsoleProvider, useApp } from './AppContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import VlanForm from './components/forms/VlanForm';
import VlanifForm from './components/forms/VlanifForm';
import AclForm from './components/forms/AclForm';
import RoutingForm from './components/forms/RoutingForm';
import LinkAggForm from './components/forms/LinkAggForm';
import StpForm from './components/forms/StpForm';
import AaaForm from './components/forms/AaaForm';
import NatForm from './components/forms/NatForm';
import QosForm from './components/forms/QosForm';
import VxlanForm from './components/forms/VxlanForm';
import StackForm from './components/forms/StackForm';
import VrrpForm from './components/forms/VrrpForm';
import DhcpForm from './components/forms/DhcpForm';
import FwPolicyForm from './components/forms/FwPolicyForm';
import IfaceForm from './components/forms/IfaceForm';
import PortSecForm from './components/forms/PortSecForm';
import SnmpForm from './components/forms/SnmpForm';
import NtpForm from './components/forms/NtpForm';
import SyslogForm from './components/forms/SyslogForm';
import LldpForm from './components/forms/LldpForm';
import QuickCmdForm from './components/forms/QuickCmdForm';
import TopoForm from './components/forms/TopoForm';
import CommandPreview from './components/CommandPreview';
import SwitchPanel from './components/SwitchPanel';
import ConsoleTerminal from './components/ConsoleTerminal';

function stripWrapper(cmd: string): string {
  let lines = cmd.split('\n');
  if (lines[0] === 'system-view' || lines[0] === 'configure terminal') lines = lines.slice(1);
  const last = lines[lines.length - 1];
  if (last === 'end') lines = lines.slice(0, -1);
  return lines.join('\n').trim();
}

function detectVendor(cmd: string): 'hw' | 'cisco' {
  return cmd.startsWith('system-view') ? 'hw' : 'cisco';
}

function FormArea() {
  const { configType } = useApp();
  const bag = useRef<Record<string, string>>({});
  const [command, setCommand] = useState('');

  const handleChange = useCallback((configType: string) => (cmd: string) => {
    bag.current[configType] = cmd;
    const blocks = Object.entries(bag.current)
      .filter(([, v]) => v)
      .map(([, v]) => stripWrapper(v));
    if (blocks.length === 0) { setCommand(''); return; }
    const first = Object.values(bag.current).find(Boolean)!;
    const v = detectVendor(first);
    const enter = v === 'hw' ? 'system-view' : 'configure terminal';
    const exit = v === 'hw' ? '' : 'end';
    const body = blocks.join('\n');
    setCommand(enter + '\n' + body + (exit ? '\n' + exit : ''));
  }, []);

  const clearAll = () => {
    bag.current = {};
    setCommand('');
  };

  const forms: Record<string, React.FC<{ onChange: (cmd: string) => void }>> = {
    vlan: VlanForm,
    vlanif: VlanifForm,
    acl: AclForm,
    routing: RoutingForm,
    linkagg: LinkAggForm,
    stp: StpForm,
    aaa: AaaForm,
    nat: NatForm,
    qos: QosForm,
    vxlan: VxlanForm,
    stack: StackForm,
    vrrp: VrrpForm,
    dhcp: DhcpForm,
    fwpolicy: FwPolicyForm,
    iface: IfaceForm,
    portsec: PortSecForm,
    snmp: SnmpForm,
    ntp: NtpForm,
    syslog: SyslogForm,
    lldp: LldpForm,
    quickcmd: QuickCmdForm,
    topo: TopoForm,
  };

  const FormComponent = forms[configType];

  const entries = Object.entries(bag.current).filter(([, v]) => v);

  return (
    <div className="flex-1 flex gap-0 overflow-hidden min-w-0">
      {/* Main content: form + console terminal */}
      <div className="flex-1 p-6 overflow-y-auto min-w-0 flex flex-col gap-4">
        <div className="flex-1">
          <FormComponent onChange={handleChange(configType)} />
        </div>
        <div className="shrink-0 space-y-4">
          <SwitchPanel command={command} />
          <ConsoleTerminal />
        </div>
      </div>

      {/* Right sidebar: command preview only */}
      <div className="w-[420px] shrink-0 p-4 border-l border-slate-200 bg-white overflow-y-auto flex flex-col gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">命令预览</span>
          <span className="text-xs bg-slate-200 text-slate-600 rounded px-1.5 py-0.5">
            {entries.length} 段
          </span>
          <button
            onClick={clearAll}
            className="text-xs text-red-500 hover:underline ml-auto"
          >
            清空
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <CommandPreview command={command} />
        </div>

        {entries.length > 0 && (
          <div className="text-xs text-slate-400 border-t pt-2 shrink-0">
            已配置：{entries.map(([k]) => k).join(' → ')}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <ConsoleProvider>
        <div className="h-screen flex flex-col">
          <Header />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <FormArea />
          </div>
        </div>
      </ConsoleProvider>
    </AppProvider>
  );
}

export default App;
