export type Vendor = 'huawei' | 'h3c' | 'cisco' | 'ruijie';

export interface DeviceModel {
  id: string;
  name: string;
  ports: string; // e.g. "GigabitEthernet0/0/"
}

export const DEVICE_MODELS: Record<Vendor, DeviceModel[]> = {
  huawei: [
    { id: 's5700', name: 'S5700 接入', ports: 'GigabitEthernet0/0/' },
    { id: 's6700', name: 'S6700 汇聚', ports: 'XGigabitEthernet0/0/' },
    { id: 'ce6800', name: 'CE6800 数据中心', ports: '25GE0/0/' },
    { id: 'ce12800', name: 'CE12800 核心', ports: '100GE0/0/' },
    { id: 'ar1200', name: 'AR1200 路由器', ports: 'GigabitEthernet0/0/' },
  ],
  h3c: [
    { id: 's5500', name: 'S5500 接入', ports: 'GigabitEthernet1/0/' },
    { id: 's6800', name: 'S6800 汇聚', ports: 'Ten-GigabitEthernet1/0/' },
    { id: 's12500', name: 'S12500 核心', ports: 'HundredGigE1/0/' },
    { id: 'msr3600', name: 'MSR3600 路由器', ports: 'GigabitEthernet0/0/' },
  ],
  cisco: [
    { id: 'c2960', name: 'Catalyst 2960', ports: 'GigabitEthernet0/' },
    { id: 'c9300', name: 'Catalyst 9300', ports: 'TenGigabitEthernet1/0/' },
    { id: 'c3850', name: 'Catalyst 3850', ports: 'GigabitEthernet1/0/' },
    { id: 'nexus9k', name: 'Nexus 9000', ports: 'Ethernet1/' },
    { id: 'isr4300', name: 'ISR 4300 路由器', ports: 'GigabitEthernet0/0/' },
  ],
  ruijie: [
    { id: 'rg-s2900', name: 'RG-S2900 接入', ports: 'GigabitEthernet 0/' },
    { id: 'rg-s6000', name: 'RG-S6000 汇聚', ports: 'TenGigabitEthernet 0/' },
    { id: 'rg-n18000', name: 'RG-N18000 核心', ports: 'HundredGigE 0/' },
    { id: 'rg-rsr', name: 'RG-RSR 路由器', ports: 'GigabitEthernet 0/0/' },
  ],
};

export type ConfigType = 'quickcmd' | 'vlan' | 'vlanif' | 'acl' | 'routing' | 'linkagg' | 'stp' | 'aaa' | 'nat' | 'qos' | 'vxlan' | 'stack' | 'vrrp' | 'dhcp' | 'fwpolicy' | 'iface' | 'portsec' | 'snmp' | 'ntp' | 'syslog' | 'lldp' | 'topo' | 'qinq';

export interface VlanParams {
  vlanIds: number[];
  ports: string;
  portMode: 'access' | 'trunk' | 'hybrid';
  description?: string;
}

export type AclCategory = 'basic' | 'advanced' | 'layer2' | 'named' | 'user';

export interface AclRule {
  ruleId: number;
  action: 'permit' | 'deny';
  protocol: 'ip' | 'tcp' | 'udp' | 'icmp';
  sourceIp: string;
  sourceWildcard: string;
  destIp: string;
  destWildcard: string;
  srcPort?: number;
  dstPort?: number;
  sourceMac?: string;
  sourceMacMask?: string;
  destMac?: string;
  destMacMask?: string;
}

export interface AclParams {
  aclNumber: number;
  aclType: AclCategory;
  aclName?: string;
  timeRange?: string;
  rules: AclRule[];
  applyInterface?: string;
  applyDirection?: 'inbound' | 'outbound';
}

export interface StaticRoute {
  destination: string;
  mask: string;
  nextHop: string;
  preference?: number;
  blackhole?: boolean;
}

export interface OspfNetwork {
  network: string;
  wildcard: string;
  area?: string;
  /**
   * 接口名（如 GigabitEthernet0/0/1）。
   *
   * 这个字段是为了补上一个真实存在的模型缺口：**OSPF 有相当一部分配置是接口级的**，
   * 而原来这里只有 {网络地址, 通配符}，于是思科那条分支只能拿网络地址当接口名用，
   * 生成出 `interface 2001:db8::` 这种命令。
   *
   * - OSPFv3：**必填**。v3 没有 network 语句，协议是挂在接口上的。
   * - OSPFv2：可选。思科/锐捷的认证密钥和网络类型是接口级命令，下到它上面；
   *   华为/H3C 的认证在进程/区域视图，不需要它。
   */
  iface?: string;
}

export interface OspfConfig {
  processId: number;
  routerId: string;
  area: string;
  networks: OspfNetwork[];
  networkType?: 'broadcast' | 'nbma' | 'p2p' | 'p2mp';
  cost?: number;
  authMode?: 'none' | 'simple' | 'md5';
  authKey?: string;
  passiveInterfaces?: string;
  defaultOriginate: boolean;
  defaultMetric?: number;
  redistribute?: string[];
  isV3?: boolean;
}

export interface RipConfig {
  version: 1 | 2;
  networks: string[];
  authMode?: 'none' | 'simple' | 'md5';
  authKey?: string;
  /**
   * 应用认证的接口名，逗号或空格分隔（如 GigabitEthernet0/0/1, GigabitEthernet0/0/2）。
   * - 思科/锐捷：**需要**。IOS/RGOS 的 RIP 认证没有进程级命令，只能先建 key chain
   *   再在每个接口上引用；不填就只有一条没人引用的 key chain，认证不生效。
   * - 华为/H3C：不需要。它们的 `authentication-mode` 就在 rip 进程视图里，是全局的。
   * ⚠️ 别拿 passiveInterfaces 当这个用：静默接口恰恰是【不跑 RIP 邻居】的那些，
   * 语义正好相反。
   */
  authInterfaces?: string;
  passiveInterfaces?: string;
  defaultOriginate: boolean;
  redistribute?: string[];
}

export interface BgpConfig {
  asNumber: number;
  routerId: string;
  neighbors: { ip: string; remoteAs: number }[];
  networks: { network: string; mask: string }[];
}

export interface RoutingParams {
  staticRoutes: StaticRoute[];
  ospf?: OspfConfig;
  bgp?: BgpConfig;
  rip?: RipConfig;
}

export interface LinkAggParams {
  groupId: number;
  mode: 'static' | 'lacp';
  ports: string;
  loadBalance?: string;
}

export interface VlanifParams {
  vlanId: number;
  ip: string;
  mask: number;
  description?: string;
}

export interface AaaLocalUser {
  username: string;
  password: string;
  privilege: number;
  serviceTypes: string[];
}

export interface AaaParams {
  authMode: 'local' | 'radius' | 'tacacs+';
  radiusServer?: string;
  radiusKey?: string;
  tacacsServer?: string;
  tacacsKey?: string;
  localUsers: AaaLocalUser[];
  enableTelnet: boolean;
  enableSsh: boolean;
}

export type NatType = 'static' | 'dynamic' | 'nat-server';

export interface NatStaticRule {
  insideIp: string;
  globalIp: string;
}

export interface NatServerRule {
  protocol: 'tcp' | 'udp';
  globalPort: number;
  insideIp: string;
  insidePort: number;
}

export interface NatParams {
  natType: NatType;
  aclNumber: number;
  addressPoolId: number;
  startIp: string;
  endIp: string;
  insideInterface: string;
  outsideInterface: string;
  staticRules: NatStaticRule[];
  serverRules: NatServerRule[];
}

export type MatchType = 'acl' | 'dscp' | 'precedence' | 'vlan-8021p' | 'any';

export interface ClassifierEntry {
  name: string;
  matchType: MatchType;
  aclNumber?: number;
  dscpValue?: string;
  precedenceValue?: number;
  vlan8021p?: number;
}

export interface BehaviorEntry {
  name: string;
  carRate?: number;
  carBurst?: number;
  remarkDscp?: string;
  remark8021p?: number;
  remarkPrecedence?: number;
  redirectInterface?: string;
}

export interface PolicyEntry {
  classifierName: string;
  behaviorName: string;
}

export interface VxlanVni {
  vniId: number;
  peerIps: string;
  bridgeDomainId?: number;
}

export interface StackMember {
  memberId: number;
  priority: number;
  domainId?: number;
}

export interface StackPort {
  portId: string;
  interfaces: string;
}

// VRRP
export interface VrrpParams {
  vrid: number;
  virtualIp: string;
  priority: number;
  interfaceName: string;
  preempt: boolean;
  authKey?: string;
}

// DHCP
export interface DhcpParams {
  mode: 'server' | 'relay' | 'snooping';
  poolName?: string;
  network?: string;
  mask?: number;
  gateway?: string;
  startIp?: string;
  endIp?: string;
  dnsServers?: string;
  relayServer?: string;
  trustInterfaces?: string;
}

// Firewall security policy
export interface FwPolicyRule {
  ruleId: number;
  action: 'permit' | 'deny';
  sourceZone: string;
  destZone: string;
  sourceIp: string;
  destIp: string;
  protocol: string;
  destPort?: number;
  description?: string;
}

export interface FwPolicyParams {
  rules: FwPolicyRule[];
  zones: string;
}

// Interface basic config
export interface IfaceParams {
  interfaceName: string;
  speed?: string;
  duplex?: string;
  description?: string;
  mtu?: number;
  ip?: string;
  mask?: number;
  secondaryIp?: string;
  secondaryMask?: number;
}

// Port security
export interface PortSecParams {
  interfaceName: string;
  maxMac: number;
  mode: 'restrict' | 'shutdown' | 'protect';
  sticky: boolean;
  staticMacs?: string;
}

// SNMP
export interface SnmpParams {
  version: 'v2c' | 'v3';
  community: string;
  location?: string;
  contact?: string;
  trapServer?: string;
}

// NTP
export interface NtpParams {
  serverIp: string;
  sourceInterface?: string;
}

// Syslog
export interface SyslogParams {
  serverIp: string;
  facility?: string;
  level?: string;
}

// LLDP
// QINQ
export interface QinqParams {
  interfaceName: string;
  outerVlan: number;
  innerVlans: string;
  mode: 'basic' | 'selective';
}

export interface LldpParams {
  enable: boolean;
}

export interface StackParams {
  members: StackMember[];
  stackPorts: StackPort[];
}

export interface VxlanParams {
  nveId: number;
  sourceIp: string;
  vnis: VxlanVni[];
}

export interface QosParams {
  classifiers: ClassifierEntry[];
  behaviors: BehaviorEntry[];
  policyName: string;
  policyRules: PolicyEntry[];
  applyInterface: string;
  applyDirection: 'inbound' | 'outbound';
  enableFlowControl: boolean;
  flowControlInterface: string;
}

export interface StpParams {
  mode: 'stp' | 'rstp' | 'mstp';
  rootBridge?: boolean;
  edgePorts?: string;
  bpduGuard?: boolean;
}
