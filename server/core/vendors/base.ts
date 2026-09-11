import type {
  VlanParams,
  VlanifParams,
  AclParams,
  RoutingParams,
  LinkAggParams,
  StpParams,
  AaaParams,
  NatParams,
  QosParams,
  VxlanParams,
  StackParams,
  VrrpParams,
  DhcpParams,
  FwPolicyParams,
  IfaceParams,
  PortSecParams,
  SnmpParams,
  NtpParams,
  SyslogParams,
  LldpParams,
  QinqParams,
} from '../../../src/types';

// 掩码 0 必须走守卫返回 0.0.0.0：JS 的移位计数按模 32 取值，
// ~0 << (32 - 0) 实际是 ~0 << 0 === -1，会错算成 255.255.255.255。
// 这不是理论边界——VlanifForm 的掩码输入是 min={0}，且 Number('') === 0，
// 所以 /0 在界面上可达，cisco/ruijie 会因此输出错误掩码。
export function cidrToMask(bits: number): string {
  if (bits <= 0 || bits > 32) return '0.0.0.0';
  const u = ~0 << (32 - bits);
  return [(u >>> 24) & 255, (u >>> 16) & 255, (u >>> 8) & 255, u & 255].join('.');
}

export interface VendorCommands {
  name: string;
  portPrefix: string;
  setPortPrefix(prefix: string): void;
  portFormat(port: string): string;
  generateVlanConfig(params: VlanParams): string;
  generateVlanifConfig(params: VlanifParams): string;
  generateAclConfig(params: AclParams): string;
  generateRoutingConfig(params: RoutingParams): string;
  generateLinkAggConfig(params: LinkAggParams): string;
  generateStpConfig(params: StpParams): string;
  generateAaaConfig(params: AaaParams): string;
  generateNatConfig(params: NatParams): string;
  generateQosConfig(params: QosParams): string;
  generateVxlanConfig(params: VxlanParams): string;
  generateStackConfig(params: StackParams): string;
  generateVrrpConfig(params: VrrpParams): string;
  generateDhcpConfig(params: DhcpParams): string;
  generateFwPolicyConfig(params: FwPolicyParams): string;
  generateIfaceConfig(params: IfaceParams): string;
  generatePortSecConfig(params: PortSecParams): string;
  generateSnmpConfig(params: SnmpParams): string;
  generateNtpConfig(params: NtpParams): string;
  generateSyslogConfig(params: SyslogParams): string;
  generateLldpConfig(params: LldpParams): string;
  generateQinqConfig(params: QinqParams): string;
}
