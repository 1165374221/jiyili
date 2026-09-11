import { AppProvider, CommandProvider, ConsoleProvider, useApp, useCommand } from './AppContext';
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
import QinqForm from './components/forms/QinqForm';
import CommandPreview from './components/CommandPreview';
import SwitchPanel from './components/SwitchPanel';
import ConsoleTerminal from './components/ConsoleTerminal';

// 表单不再接收任何 props：参数由表单自己通过 useCommand().report 上报，命令在
// CommandProvider 里统一生成。这样也不用再给这个 map 标注
// React.FC<{onChange:(cmd:string)=>void}> —— 21 个表单各自有不同的 params 类型，
// 那个签名在 strictFunctionTypes 下根本表达不了。
const forms: Record<string, React.FC> = {
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
  // bug #4：QinqForm 一直没注册进这张表，点侧边栏 QINQ 直接白屏。
  // 四个厂商的 generateQinqConfig 都有完整实现，接进来就能用。
  qinq: QinqForm,
};

function FormArea() {
  const { configType } = useApp();
  const { command, applied, error, clear } = useCommand();

  const FormComponent = forms[configType];

  // 兜底：漏注册的表单不再白屏，而是明确说一句。
  if (!FormComponent) {
    return <div className="flex-1 p-6 text-sm text-red-600">未注册的配置类型：{configType}</div>;
  }

  return (
    <div className="flex-1 flex gap-0 overflow-hidden min-w-0">
      {/* Main content: form + console terminal */}
      <div className="flex-1 p-6 overflow-y-auto min-w-0 flex flex-col gap-4">
        <div className="flex-1">
          <FormComponent />
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
            {applied.length} 段
          </span>
          <button
            onClick={clear}
            className="text-xs text-red-500 hover:underline ml-auto"
          >
            清空
          </button>
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 shrink-0">
            生成失败：{error}
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col">
          <CommandPreview command={command} />
        </div>

        {applied.length > 0 && (
          <div className="text-xs text-slate-400 border-t pt-2 shrink-0">
            已配置：{applied.join(' → ')}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <CommandProvider>
        <ConsoleProvider>
          <div className="h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
              <Sidebar />
              <FormArea />
            </div>
          </div>
        </ConsoleProvider>
      </CommandProvider>
    </AppProvider>
  );
}

export default App;
