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
import { QUICK_ALL_VARIANTS } from '../src/quickRef';

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
  // ⚠️ 这几条是补出来的。在此之前 routing 只覆盖了静态路由，OSPF/RIP/BGP 一条没有 ——
  // 所以 OSPFv3 在 H3C 上被整个忽略、思科把网络地址当接口名，golden 全绿。
  // 语料没覆盖的配置，坏了也没人知道。
  { type: 'routing', name: 'OSPFv2(认证+静默+网络类型+接口)', params: { staticRoutes: [], ospf: { processId: 1, routerId: '1.1.1.1', area: '0', networks: [{ network: '192.168.1.0', wildcard: '0.0.0.255', area: '0', iface: 'GigabitEthernet0/0/1' }], networkType: 'p2mp', cost: 100, authMode: 'md5', authKey: 'ospfkey', passiveInterfaces: 'GigabitEthernet0/0/2', defaultOriginate: true, redistribute: ['static'] } } },
  { type: 'routing', name: 'OSPFv2(明文认证)', params: { staticRoutes: [], ospf: { processId: 2, routerId: '2.2.2.2', area: '1', networks: [{ network: '10.0.0.0', wildcard: '0.0.0.255', iface: 'GigabitEthernet0/0/5' }], authMode: 'simple', authKey: 'plainkey', defaultOriginate: false } } },
  // v3 只带接口，不带 networkType/authMode —— 那两个控件在界面上勾了 OSPFv3 就隐藏了，
  // 所以「v3 + 认证」是界面产生不出来的组合（API 直连可以，但那是另一条路径）。
  { type: 'routing', name: 'OSPFv3(接口级)', params: { staticRoutes: [], ospf: { processId: 1, routerId: '3.3.3.3', area: '0', networks: [{ network: '', wildcard: '', iface: 'GigabitEthernet0/0/1' }], cost: 100, defaultOriginate: true, redistribute: ['static'], isV3: true } } },
  { type: 'routing', name: 'OSPFv3(多接口多区域)', params: { staticRoutes: [], ospf: { processId: 10, routerId: '4.4.4.4', area: '0', networks: [{ network: '', wildcard: '', iface: 'GigabitEthernet0/0/2' }, { network: '', wildcard: '', area: '2', iface: 'GigabitEthernet0/0/3' }], defaultOriginate: false, isV3: true } } },
  { type: 'routing', name: 'BGP', params: { staticRoutes: [], bgp: { asNumber: 65001, routerId: '5.5.5.5', neighbors: [{ ip: '10.0.0.2', remoteAs: 65002 }], networks: [{ network: '192.168.1.0', mask: '255.255.255.0' }] } } },
  { type: 'routing', name: 'RIPv2', params: { staticRoutes: [], rip: { version: 2, networks: ['192.168.1.0'], passiveInterfaces: 'GigabitEthernet0/0/1', defaultOriginate: true, redistribute: ['static'] } } },
  // RIP 认证：四家分两种形状 —— 华为/H3C 在 rip 进程视图里一条 authentication-mode
  // 搞定，思科/锐捷要 key chain + 逐接口引用。这两条用例正是用来钉住这个分叉的。
  { type: 'routing', name: 'RIP认证MD5(带接口)', params: { staticRoutes: [], rip: { version: 2, networks: ['192.168.1.0'], authMode: 'md5', authKey: 'ripkey', authInterfaces: 'GigabitEthernet0/0/1,GigabitEthernet0/0/2', passiveInterfaces: 'GigabitEthernet0/0/9', defaultOriginate: false } } },
  { type: 'routing', name: 'RIP认证明文(带接口)', params: { staticRoutes: [], rip: { version: 2, networks: ['10.0.0.0'], authMode: 'simple', authKey: 'plainrip', authInterfaces: 'GigabitEthernet0/0/3', defaultOriginate: false } } },
  // 勾了认证但没填接口：思科/锐捷只出 key chain（合法，但没人引用 = 认证不生效）。
  // 钉住这个「部分生效」的行为，免得以后有人以为它是完整的。
  { type: 'routing', name: 'RIP认证(缺接口)', params: { staticRoutes: [], rip: { version: 2, networks: ['172.16.0.0'], authMode: 'md5', authKey: 'ripkey', defaultOriginate: false } } },
  // authMode 显式 'none'：'none' 是非空字符串、真值，不能只判 truthy —— 这条用例
  // 就是防止有人把条件写成 `if (p.rip.authMode)` 而给「无认证」也下发认证。
  { type: 'routing', name: 'RIP无认证(none)', params: { staticRoutes: [], rip: { version: 2, networks: ['172.16.0.0'], authMode: 'none', authKey: 'shouldnotappear', defaultOriginate: false } } },
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

// quickcmd 走 parser，不是 params 对象。
//
// expectUnrecognized 是必须显式标注的：语料里「未识别」的用例，在旧实现下记录的
// 是那段帮助文本，看起来和正常用例一样有内容，于是**冒充了覆盖率**。本文件里原来
// 那条名为「中文vlan」、实际写 `端口1加入vlan 10` 的用例就是如此 —— parser 里没有
// 「加入」规则，它从来没被识别过，却一直以「中文写法已覆盖」的姿态存在。
// 标了标记之后，下面的断言会分别要求「能识别的必须非 null」「标了未识别的必须 null」。
const QUICK: { name: string; text: string; expectUnrecognized?: boolean }[] = [
  { name: '中文vlan', text: 'vlan 100 端口 1-10 接入' },
  { name: '英文vlan', text: 'vlan 100 port 1-10 access' },
  { name: 'vlanif', text: 'vlanif 100 地址 192.168.1.1/24' },
  { name: '静态路由', text: '静态路由 10.0.0.0/8 到 192.168.1.1' },
  { name: 'snmp', text: 'snmp community public' },
  // 下面两条是 normalizeChinese 顺序 bug 的回归锁。它们此前分别是
  // 【完全无法识别】和【识别了但静默丢掉 duplex 参数】，而帮助文本一直在
  // 宣传这两种写法 —— 没有语料就没人会发现。加进来是为了锁住修复。
  { name: '端口安全（顺序bug）', text: '端口安全 G0/0/1 最大 3 粘贴' },
  { name: '全双工（顺序bug）', text: '接口 G0/0/1 速率 1000 全双工 描述 myport' },
  { name: '未识别', text: 'zzz 这不是一条能识别的命令', expectUnrecognized: true },
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
  // 这两条原本是 bug #3（detectVendor 拿未识别的帮助文本当第一条命令来猜厂商）
  // 的复现用例。bug 已修（厂商显式传入）、且未识别不再返回帮助文本，所以它们
  // 现在退化成一件事：确认「未识别段」在旧路径和新路径下都被同样地丢掉。
  { name: 'quickcmd未识别+vlan', order: ['quickcmd', 'vlan'], picks: {} },
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
        // parseAndGenerate 现在对未识别返回 null。这里统一成空串，好让下面这份
        // 旧路径复刻（aggregate 的 filter(([,v]) => v)）与新路径 generateAll 的
        // if (!raw) continue 语义对齐 —— 两条路径都应当「未识别 == 不产出任何东西」。
        bag[t] = parseAndGenerate(text, v) ?? '';
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

// ---- 全角归一化（bug #6）----
//
// 中文输入法在「中文标点」模式下会把 - 打成全角 －(U+FF0D)，字母数字也可能是全角。
// generateAll 入口要把它归一化回半角，否则 parser 的正则失配——表现为「手动输入
// 提示无法识别，复制粘贴却正常」；更糟的是表单里的 IP/端口列表会被原样拼进命令，
// 再经「下发命令」推到现场交换机上。
//
// 这里把 TYPICAL 的每一种参数整体转成全角，断言输出与半角【逐字节相同】。
// 只断言、不 push 快照：快照会忠实记录下错误的输出，而「相等」才是要守的性质。
//
// 注意：状态信息一律走 stderr。check-golden.sh 把 stdout 重定向进
// golden.current.json，任何 console.log 都会污染语料。
function toFullWidth(text: string): string {
  let s = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (code === 0x20) s += '　';                                   // 空格 → 全角空格
    else if (code >= 0x21 && code <= 0x7e) s += String.fromCharCode(code + 0xfee0);
    else s += ch;                                                       // 汉字原样保留
  }
  return s;
}

function toFullWidthDeep(value: unknown): unknown {
  if (typeof value === 'string') return toFullWidth(value);
  if (Array.isArray(value)) return value.map(toFullWidthDeep);
  if (value !== null && typeof value === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) o[k] = toFullWidthDeep(v);
    return o;
  }
  return value;
}

const widthFailures: string[] = [];

for (const vendorName of Object.keys(vendors)) {
  const vendor = vendorName as Vendor;
  const modelId = DEVICE_MODELS[vendor][0].id;

  for (const c of TYPICAL) {
    const half = generateAll(vendor, modelId, [{ type: c.type, params: c.params }]).command;
    const full = generateAll(vendor, modelId, [{ type: c.type, params: toFullWidthDeep(c.params) }]).command;
    if (half !== full) widthFailures.push(`${vendorName}/${c.type}/${c.name}`);
  }

  for (const q of QUICK) {
    const half = generateAll(vendor, modelId, [{ type: 'quickcmd', params: q.text }]).command;
    const full = generateAll(vendor, modelId, [{ type: 'quickcmd', params: toFullWidth(q.text) }]).command;
    if (half !== full) widthFailures.push(`${vendorName}/quickcmd/${q.name}`);
  }

  // 零宽字符：在输入框里完全看不见，却会让正则失配。
  const zeroWidth = generateAll(vendor, modelId, [{ type: 'quickcmd', params: 'vlan​ 100​ port 1-10 access' }]).command;
  const plain = generateAll(vendor, modelId, [{ type: 'quickcmd', params: 'vlan 100 port 1-10 access' }]).command;
  if (zeroWidth !== plain) widthFailures.push(`${vendorName}/quickcmd/零宽字符`);
}

if (widthFailures.length > 0) {
  console.error('❌ 全角归一化失败，以下用例的全角输入与半角输出不一致：');
  for (const f of widthFailures) console.error('   ' + f);
  process.exit(1);
}
console.error(
  `✅ 全角/零宽归一化：${Object.keys(vendors).length} 厂商 × (${TYPICAL.length} 类型 + ${QUICK.length} 快速命令 + 零宽) 与半角逐字节一致`,
);

// ---- 对外宣传的语法必须真的能解析（防「宣传与能力脱节」）----
//
// src/quickRef.ts 是「快速命令」面板展示给用户的全部写法。以前这份清单硬编码在
// parser 的帮助文本里，和实际语法没有任何一致性保证，于是 `端口安全` 和 `全双工`
// 两条坏写法被宣传了很久都没人发现。这里把它焊死：界面上列出来的每一条，都必须
// 在 4 个厂商下都解析出非空命令。
//
// 反向也断言：未识别必须返回 null，而不是一段文本——旧实现返回的 19 行帮助文本
// 会被 generateAll 当成正常配置段拼进正文，随「下发命令」推到现场交换机上。
const refFailures: string[] = [];

for (const vendorName of Object.keys(vendors)) {
  const v = vendors[vendorName];
  for (const text of QUICK_ALL_VARIANTS) {
    const cmd = parseAndGenerate(text, v);
    if (!cmd || cmd.startsWith('无法识别')) {
      refFailures.push(`${vendorName} 解析不出：${text}`);
    }
  }
}

// 语料自身的诚实性：标了「能识别」的必须真能识别，标了「未识别」的必须真未识别。
// 少了这一段，一条写错的语料会安静地退化成「记录帮助文本」，看着仍有内容。
for (const [vendorName, v] of Object.entries(vendors)) {
  for (const q of QUICK) {
    const cmd = parseAndGenerate(q.text, v);
    const recognized = cmd !== null;
    if (q.expectUnrecognized && recognized) {
      refFailures.push(`${vendorName} 「${q.name}」标为未识别，实际解析出了命令：${JSON.stringify(cmd)?.slice(0, 40)}`);
    }
    if (!q.expectUnrecognized && !recognized) {
      refFailures.push(`${vendorName} 「${q.name}」应当能识别，实际返回 null（输入：${q.text}）`);
    }
  }
}

for (const [vendorName, v] of Object.entries(vendors)) {
  const junk = parseAndGenerate('zzz 这不是一条能识别的命令', v);
  if (junk !== null) refFailures.push(`${vendorName} 未识别时应返回 null，实际返回：${JSON.stringify(junk)?.slice(0, 40)}`);
  if (parseAndGenerate('', v) !== null) refFailures.push(`${vendorName} 空输入应返回 null`);

  // 端到端：未识别段绝不能出现在最终下发的脚本里。
  const modelId = DEVICE_MODELS[vendorName as Vendor][0].id;
  const leaked = generateAll(vendorName as Vendor, modelId, [
    { type: 'quickcmd', params: 'zzz 这不是一条能识别的命令' },
    { type: 'vlan', params: TYPICAL[0].params },
  ]).command;
  if (/无法识别/.test(leaked)) refFailures.push(`${vendorName} 未识别文本被拼进了下发命令`);
}

if (refFailures.length > 0) {
  console.error('❌ 快速命令语法参考与实际解析能力不一致：');
  for (const f of refFailures) console.error('   ' + f);
  process.exit(1);
}
console.error(`✅ 语法参考可解析：${Object.keys(vendors).length} 厂商 × ${QUICK_ALL_VARIANTS.length} 条写法全部识别，且未识别返回 null`);

console.log(JSON.stringify({ generatedBy: 'spike/golden.ts (改造前基线)', cases: out }, null, 2));
