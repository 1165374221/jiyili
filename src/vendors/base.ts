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
} from '../types';

export function cidrToMask(bits: number): string {
  if (bits < 0 || bits > 32) return '0.0.0.0';
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
