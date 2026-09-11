// 步骤0.3 golden 语料生成器。
// 用【当前未改动的】src/vendors + src/parser 产出基准，供改造后逐步逐字节比对。
//
// 重点：
//  - 21 种配置 × 4 厂商全覆盖，确保文件搬运/import 修复不改变任何输出
//  - 含边界值（掩码 0/32/33），暴露 cidrToMask(0) 这个既有 bug
//  - 含 composite 聚合用例，覆盖 stripWrapper/detectVendor 的不对称行为
import { CiscoCommands } from '../server/core/vendors/cisco';
import { HuaweiCommands } from '../server/core/vendors/huawei';
import { H3cCommands } from '../server/core/vendors/h3c';
import { RuijieCommands } from '../server/core/vendors/ruijie';
import type { VendorCommands } from '../server/core/vendors/base';
import { parseAndGenerate } from '../server/core/parser';
import { generateAll } from '../server/core/index';
import type { GenerateBlock } from '../server/core/index';
import type { Vendor } from '../src/types';
import { DEVICE_MODELS } from '../src/types';

// ---------- App.tsx:31-41 的原样复刻（聚合语义的基准）----------
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

function aggregate(bag: Record<string, string>): string {
  const blocks = Object.entries(bag)
    .filter(([, v]) => v)
    .map(([, v]) => stripWrapper(v));
  if (blocks.length === 0) return '';
  const first = Object.values(bag).find(Boolean)!;
  const v = detectVendor(first);
  const enter = v === 'hw' ? 'system-view' : 'configure terminal';
  const exit = v === 'hw' ? '' : 'end';
  const body = blocks.join('\n');
  return enter + '\n' + body + (exit ? '\n' + exit : '');
}

// ---------- 语料 ----------
type Case = { type: string; name: string; params: unknown };

// 每种配置的典型参数
const TYPICAL: Case[] = [
  { type: 'vlan', name: '典型', params: { vlanIds: [10, 20], ports: '1-5', portMode: 'access', description: '办公区' } },
  { type: 'vlan', name: 'trunk模式', params: { vlanIds: [30], ports: '24', portMode: 'trunk' } },
  { type: 'vlanif', name: '典型', params: { vlanId: 10, ip: '192.168.10.1', mask: 24, description: '网关' } },
  { type: 'acl', name: '典型', params: { aclNumber: 3000, aclType: 'advanced', rules: [{ ruleId: 5, action: 'permit', protocol: 'tcp', sourceIp: '192.168.1.0', sourceWildcard: '0.0.0.255', destIp: '10.0.0.0', destWildcard: '0.0.0.255', dstPort: 80 }], applyInterface: 'GigabitEthernet0/0/1', applyDirection: 'inbound' } },
  { type: 'routing', name: '静态路由', params: { staticRoutes: [{ destination: '10.0.0.0', mask: '255.0.0.0', nextHop: '192.168.1.254', preference: 60 }] } },
  { type: 'routing', name: '黑洞路由', params: { staticRoutes: [{ destination: '172.16.0.0', mask: '255.255.0.0', nextHop: '', blackhole: true }] } },
  { type: 'linkagg', name: 'lacp', params: { groupId: 1, mode: 'lacp', ports: '1-4', loadBalance: 'src-dst-ip' } },
  { type: 'stp', name: 'mstp根桥', params: { mode: 'mstp', rootBridge: true, edgePorts: '1-5', bpduGuard: true } },
  { type: 'aaa', name: '本地用户', params: { authMode: 'local', localUsers: [{ username: 'admin', password: 'Admin@123', privilege: 15, serviceTypes: ['ssh', 'telnet'] }], enableTelnet: true, enableSsh: true } },
  { type: 'nat', name: 'nat-server', params: { natType: 'nat-server', aclNumber: 2000, addressPoolId: 1, startIp: '202.1.1.1', endIp: '202.1.1.10', insideInterface: 'Vlanif10', outsideInterface: 'GigabitEthernet0/0/0', staticRules: [{ insideIp: '192.168.1.100', globalIp: '202.1.1.100' }], serverRules: [{ protocol: 'tcp', globalPort: 80, insideIp: '192.168.1.100', insidePort: 80 }] } },
  { type: 'qos', name: '典型', params: { classifiers: [{ name: 'c1', matchType: 'acl', aclNumber: 3000 }], behaviors: [{ name: 'b1', carRate: 1000, carBurst: 100 }], policyName: 'p1', policyRules: [{ classifierName: 'c1', behaviorName: 'b1' }], applyInterface: 'GigabitEthernet0/0/1', applyDirection: 'inbound', enableFlowControl: false, flowControlInterface: '' } },
  { type: 'vxlan', name: '典型', params: { nveId: 1, sourceIp: '10.0.0.1', vnis: [{ vniId: 10000, peerIps: '10.0.0.2', bridgeDomainId: 100 }] } },
  { type: 'stack', name: '典型', params: { members: [{ memberId: 1, priority: 150, domainId: 10 }], stackPorts: [{ portId: '1', interfaces: 'XGE0/0/1' }] } },
  { type: 'vrrp', name: '典型', params: { vrid: 1, virtualIp: '192.168.10.254', priority: 120, interfaceName: 'Vlanif10', preempt: true, authKey: 'abc123' } },
  { type: 'dhcp', name: 'server', params: { mode: 'server', poolName: 'vlan10', network: '192.168.10.0', mask: 24, gateway: '192.168.10.1', startIp: '192.168.10.100', endIp: '192.168.10.200', dnsServers: '8.8.8.8' } },
  { type: 'fwpolicy', name: '典型', params: { rules: [{ ruleId: 1, action: 'permit', sourceZone: 'trust', destZone: 'untrust', sourceIp: '192.168.1.0/24', destIp: 'any', protocol: 'tcp', destPort: 80 }], zones: 'trust,untrust' } },
  { type: 'iface', name: '典型', params: { interfaceName: 'GigabitEthernet0/0/1', speed: '1000', duplex: 'full', description: '上行', mtu: 1500, ip: '10.1.1.1', mask: 30, secondaryIp: '10.1.1.5', secondaryMask: 29 } },
  { type: 'portsec', name: '典型', params: { interfaceName: 'GigabitEthernet0/0/2', maxMac: 3, mode: 'restrict', sticky: true, staticMacs: '0011-2233-4455' } },
  { type: 'snmp', name: 'v2c', params: { version: 'v2c', community: 'public', location: '机房A', contact: 'admin@test.com', trapServer: '10.0.0.100' } },
  { type: 'ntp', name: '典型', params: { serverIp: '10.0.0.1', sourceInterface: 'Vlanif10' } },
  { type: 'syslog', name: '典型', params: { serverIp: '10.0.0.100', facility: 'local0', level: 'informational' } },
  { type: 'lldp', name: '开启', params: { enable: true } },
  { type: 'lldp', name: '关闭', params: { enable: false } },
  { type: 'qinq', name: '典型', params: { interfaceName: 'GigabitEthernet0/0/3', outerVlan: 100, innerVlans: '10,20', mode: 'basic' } },
];

// 边界值：掩码 0/32/33 直击 cidrToMask 的移位 bug（只影响 cisco/ruijie）
const EDGE: Case[] = [
  { type: 'vlanif', name: '掩码0', params: { vlanId: 10, ip: '192.168.10.1', mask: 0 } },
  { type: 'vlanif', name: '掩码32', params: { vlanId: 10, ip: '192.168.10.1', mask: 32 } },
  { type: 'vlanif', name: '掩码33', params: { vlanId: 10, ip: '192.168.10.1', mask: 33 } },
  { type: 'vlanif', name: '掩码空描述', params: { vlanId: 10, ip: '192.168.10.1', mask: 24, description: '' } },
  { type: 'iface', name: '从IP掩码0', params: { interfaceName: 'GigabitEthernet0/0/1', ip: '10.1.1.1', mask: 30, secondaryIp: '10.1.1.5', secondaryMask: 0 } },
  { type: 'dhcp', name: '掩码缺省', params: { mode: 'server', poolName: 'p', network: '192.168.1.0', gateway: '192.168.1.1' } },
  { type: 'vlan', name: '空端口', params: { vlanIds: [1], ports: '', portMode: 'access' } },
];

const METHOD: Record<string, keyof VendorCommands> = {
  vlan: 'generateVlanConfig', vlanif: 'generateVlanifConfig', acl: 'generateAclConfig',
  routing: 'generateRoutingConfig', linkagg: 'generateLinkAggConfig', stp: 'generateStpConfig',
  aaa: 'generateAaaConfig', nat: 'generateNatConfig', qos: 'generateQosConfig',
  vxlan: 'generateVxlanConfig', stack: 'generateStackConfig', vrrp: 'generateVrrpConfig',
  dhcp: 'generateDhcpConfig', fwpolicy: 'generateFwPolicyConfig', iface: 'generateIfaceConfig',
  portsec: 'generatePortSecConfig', snmp: 'generateSnmpConfig', ntp: 'generateNtpConfig',
  syslog: 'generateSyslogConfig', lldp: 'generateLldpConfig', qinq: 'generateQinqConfig',
};

// quickcmd 走 parser，不是 params 对象
const QUICK: { name: string; text: string }[] = [
  { name: '中文vlan', text: '端口1加入vlan 10' },
  { name: '英文vlan', text: 'vlan 100 port 1-10 access' },
  { name: 'vlanif', text: 'vlanif 100 地址 192.168.1.1/24' },
  { name: '静态路由', text: '静态路由 10.0.0.0/8 到 192.168.1.1' },
  { name: 'snmp', text: 'snmp community public' },
  { name: '未识别', text: 'zzz 这不是一条能识别的命令' },
];

const vendors: Record<string, VendorCommands> = {
  huawei: new HuaweiCommands(),
  h3c: new H3cCommands(),
  cisco: new CiscoCommands(),
  ruijie: new RuijieCommands(),
};

const out: unknown[] = [];

// 单段生成
for (const [vendorName, v] of Object.entries(vendors)) {
  for (const c of [...TYPICAL, ...EDGE]) {
    const fn = v[METHOD[c.type]] as (p: unknown) => string;
    out.push({ kind: 'single', vendor: vendorName, type: c.type, name: c.name, params: c.params, command: fn.call(v, c.params) });
  }
  for (const q of QUICK) {
    out.push({ kind: 'quick', vendor: vendorName, type: 'quickcmd', name: q.name, params: q.text, command: parseAndGenerate(q.text, v) });
  }
}

// composite 聚合：覆盖 stripWrapper / detectVendor 的不对称行为
const COMPOSITES: { name: string; order: string[]; picks: Record<string, number> }[] = [
  { name: 'vlan+acl', order: ['vlan', 'acl'], picks: {} },
  { name: 'vlan+linkagg+stp（走portFormat）', order: ['vlan', 'linkagg', 'stp'], picks: {} },
  { name: 'acl+vlanif', order: ['acl', 'vlanif'], picks: {} },
  { name: 'vlanif掩码0+acl', order: ['vlanif', 'acl'], picks: { vlanif: 1 } },
  // detectVendor bug：先碰 quickcmd（未识别返回帮助文本），再碰 vlan
  { name: 'quickcmd未识别+vlan（detectVendor bug）', order: ['quickcmd', 'vlan'], picks: {} },
  { name: 'vlan+quickcmd未识别', order: ['vlan', 'quickcmd'], picks: {} },
];

for (const [vendorName, v] of Object.entries(vendors)) {
  for (const comp of COMPOSITES) {
    const bag: Record<string, string> = {};
    // 与 bag 同序的 blocks：generateAll 需要显式顺序，因为它拿不到插入序。
    const blocks: GenerateBlock[] = [];

    for (const t of comp.order) {
      if (t === 'quickcmd') {
        const text = 'zzz 这不是一条能识别的命令';
        bag[t] = parseAndGenerate(text, v);
        blocks.push({ type: 'quickcmd', params: text });
      } else {
        const pool = [...TYPICAL, ...EDGE].filter((c) => c.type === t);
        const picked = pool[comp.picks[t] ?? 0];
        const fn = v[METHOD[t]] as (p: unknown) => string;
        bag[t] = fn.call(v, picked.params);
        blocks.push({ type: t, params: picked.params });
      }
    }

    // 旧路径：App.tsx 的客户端聚合（靠 detectVendor 猜厂商）
    out.push({ kind: 'composite', vendor: vendorName, type: comp.order.join('+'), name: comp.name, params: comp.order, command: aggregate(bag) });

    // 新路径：服务端 generateAll（厂商显式传入）。默认型号的 ports 与厂商类
    // 初始 portPrefix 四家全相等，所以这里除了 bug #3 的用例应当逐字节相同。
    const defaultModelId = DEVICE_MODELS[vendorName as Vendor][0].id;
    out.push({ kind: 'composite-api', vendor: vendorName, type: comp.order.join('+'), name: comp.name, params: comp.order, command: generateAll(vendorName as Vendor, defaultModelId, blocks).command });
  }
}

console.log(JSON.stringify({ generatedBy: 'spike/golden.ts (改造前基线)', cases: out }, null, 2));
