import type { VendorCommands } from './vendors/base';
import { cidrToMask } from './vendors/base';
import type {
  VlanParams, VlanifParams, AclParams, AclRule, RoutingParams, StaticRoute,
  VrrpParams, DhcpParams, StpParams, LinkAggParams, NatParams,
  IfaceParams, PortSecParams, SnmpParams,
} from '../../src/types';

function normalizeChinese(text: string): string {
  const map: [RegExp, string][] = [
    // Keywords
    //
    // ⚠️ 这张表是【顺序敏感】的朴素替换，长词必须排在它的前缀短词前面。
    // "端口安全" 曾经排在 "端口" 之后 —— "端口" 先把字吃掉，这条规则成了
    // 永不生效的死代码（帮助文本里一直宣传着这个用法，实际永远无法识别）。
    [/端口安全/g, 'port-sec'], // 端口安全
    [/端口/g, 'port'],           // 端口
    [/接入/g, 'access'],          // 接入
    [/干道/g, 'trunk'],           // 干道
    [/混合/g, 'hybrid'],          // 混合
    [/地址/g, 'ip'],              // 地址
    [/网关/g, 'gw'],              // 网关
    [/服务器/g, 'server'],    // 服务器
    [/静态路由/g, 'static'], // 静态路由
    [/黑洞/g, 'blackhole'],       // 黑洞
    [/堆叠/g, 'stack'],           // 堆叠
    [/安全策略/g, 'fwpolicy'], // 安全策略
    [/认证/g, 'aaa'],             // 认证
    [/日志/g, 'syslog'],          // 日志
    [/聚合/g, 'trunk'],           // 聚合
    [/邻居/g, 'lldp'],            // 邻居
    [/接口/g, 'interface'],       // 接口
    [/速率/g, 'speed'],           // 速率
    // 同上：这两条必须排在 "双工" 前面。而且不能只映射成 "full"/"half" ——
    // iface 正则要的是 `duplex\s+(full|half)` 这个整体，旧写法生成的 "全duplex"
    // 匹配不上可选组，于是 duplex 被【静默丢弃】：用户选了全双工，配置里没有。
    [/全双工/g, 'duplex full'],   // 全双工
    [/半双工/g, 'duplex half'],   // 半双工
    [/双工/g, 'duplex'],          // 双工
    [/描述/g, 'desc'],            // 描述
    [/到/g, 'to'],                    // 到
    [/优先级/g, 'pri'],       // 优先级
    [/中继/g, 'relay'],           // 中继
    [/信任/g, 'trust'],           // 信任
    [/根桥/g, 'root'],            // 根桥
    [/映射/g, 'server'],          // 映射
    [/开启/g, 'on'],              // 开启
    [/关闭/g, 'off'],             // 关闭
    [/权限/g, 'pri'],             // 权限
    [/转发/g, 'relay'],           // 转发
    [/最大/g, 'max'],             // 最大
    [/粘贴/g, 'sticky'],          // 粘帖
  ];
  let result = text;
  for (const [re, replacement] of map) {
    result = result.replace(re, replacement);
  }
  return result;
}

/**
 * 把一条简写命令解析成完整 CLI。
 *
 * 返回 null 表示「没识别出来」。这个 null 是刻意与「生成了空命令」区分开的
 * 语义，调用方按 falsy 一并跳过即可。
 *
 * ⚠️ 旧实现未识别时返回的是一段 19 行中文帮助文本，那是个真 bug，有两个后果：
 *   1. 前端把它当命令显示 —— 用户一边打字预览区一边刷满红字，分不清
 *      「还没输完」和「真输错了」。这正是「手动输入提示无法识别」的来源。
 *   2. 更严重：generateAll 认不出这是帮助文本，会把它当成一个正常配置段拼进
 *      正文。先碰快速命令再配 VLAN，生成的脚本里就夹着这段中文，随
 *      「下发命令」推到现场交换机上。
 * 帮助文本本身没有消失，而是搬到了前端 src/quickRef.ts —— 那里才是它该待的
 * 地方（它是 UI 文案，且与原语法表的可解析性由 golden 断言焊死）。
 */
export function parseAndGenerate(input: string, vendor: VendorCommands): string | null {
  const text = normalizeChinese(input).trim();
  if (!text) return null;

  // VLAN
  const vlanMatch = text.match(/vlan\s+([\d,]+)\s+port\s+([\d,\s\-]+)\s+(access|trunk|hybrid)/i);
  if (vlanMatch) {
    const vlanIds = vlanMatch[1].split(',').map(Number);
    const params: VlanParams = { vlanIds, ports: vlanMatch[2], portMode: vlanMatch[3] as VlanParams['portMode'] };
    return vendor.generateVlanConfig(params);
  }

  // VLANIF
  const vifMatch = text.match(/vlanif\s+(\d+)\s+ip\s+([\d.]+)\/(\d+)/i);
  if (vifMatch) {
    const params: VlanifParams = { vlanId: Number(vifMatch[1]), ip: vifMatch[2], mask: Number(vifMatch[3]) };
    return vendor.generateVlanifConfig(params);
  }

  // VRRP
  const vrrpMatch = text.match(/vrrp\s+(\d+)\s+vip\s+([\d.]+)\s+pri\s+(\d+)(?:\s+iface\s+(\S+))?/i);
  if (vrrpMatch) {
    const params: VrrpParams = { vrid: Number(vrrpMatch[1]), virtualIp: vrrpMatch[2], priority: Number(vrrpMatch[3]), interfaceName: vrrpMatch[4] || 'Vlanif100', preempt: true };
    return vendor.generateVrrpConfig(params);
  }

  // DHCP server
  const dhcpServer = text.match(/dhcp\s+server\s+pool\s+(\S+)\s+([\d.]+)\/(\d+)(?:\s+gw\s+([\d.]+))?(?:\s+dns\s+([\d.,]+))?/i);
  if (dhcpServer) {
    const params: DhcpParams = { mode: 'server', poolName: dhcpServer[1], network: dhcpServer[2], mask: Number(dhcpServer[3]), gateway: dhcpServer[4] || dhcpServer[2], dnsServers: dhcpServer[5] };
    return vendor.generateDhcpConfig(params);
  }

  // DHCP relay
  const dhcpRelay = text.match(/dhcp\s+relay\s+([\d.]+)/i);
  if (dhcpRelay) return vendor.generateDhcpConfig({ mode: 'relay', relayServer: dhcpRelay[1] });

  // DHCP snooping
  const dhcpSnoop = text.match(/dhcp\s+snooping(?:\s+trust\s+([\d,\s]+))?/i);
  if (dhcpSnoop) return vendor.generateDhcpConfig({ mode: 'snooping', trustInterfaces: dhcpSnoop[1] });

  // Static route
  const staticMatch = text.match(/static\s+([\d.]+)\/(\d+)\s+to\s+(\S+)(?:\s+pref\s+(\d+))?/i);
  if (staticMatch) {
    const mask = cidrToMask(Number(staticMatch[2]));
    const route: StaticRoute = { destination: staticMatch[1], mask, nextHop: staticMatch[3], preference: staticMatch[4] ? Number(staticMatch[4]) : undefined };
    return vendor.generateRoutingConfig({ staticRoutes: [route] });
  }

  // Blackhole
  const bhMatch = text.match(/blackhole\s+([\d.]+)\/(\d+)/i);
  if (bhMatch) {
    const route: StaticRoute = { destination: bhMatch[1], mask: cidrToMask(Number(bhMatch[2])), nextHop: 'NULL0', blackhole: true };
    return vendor.generateRoutingConfig({ staticRoutes: [route] });
  }

  // OSPF
  const ospfMatch = text.match(/ospf\s+(\d+)\s+rid\s+([\d.]+)\s+area\s+(\S+)\s+net\s+([\d.]+)\/(\d+)/i);
  if (ospfMatch) {
    const params: RoutingParams = {
      staticRoutes: [],
      ospf: { processId: Number(ospfMatch[1]), routerId: ospfMatch[2], area: ospfMatch[3], networks: [{ network: ospfMatch[4], wildcard: '0.0.0.255' }], defaultOriginate: false },
    };
    return vendor.generateRoutingConfig(params);
  }

  // ACL
  const aclMatch = text.match(/acl\s+(\d+)\s+(permit|deny)\s+(ip|tcp|udp|icmp)\s+([\d.]+)\/(\d+)(?:\s+port\s+(\d+))?/i);
  if (aclMatch) {
    const rule: AclRule = { ruleId: 5, action: aclMatch[2] as 'permit' | 'deny', protocol: aclMatch[3] as AclRule['protocol'], sourceIp: aclMatch[4], sourceWildcard: '0.0.0.255', destIp: '0.0.0.0', destWildcard: '255.255.255.255', dstPort: aclMatch[6] ? Number(aclMatch[6]) : undefined };
    const params: AclParams = { aclNumber: Number(aclMatch[1]), aclType: 'advanced', rules: [rule] };
    return vendor.generateAclConfig(params);
  }

  // NAT static
  const natStatic = text.match(/nat\s+static\s+([\d.]+)\s+([\d.]+)/i);
  if (natStatic) {
    const params: NatParams = { natType: 'static', aclNumber: 2000, addressPoolId: 1, startIp: natStatic[2], endIp: natStatic[2], insideInterface: 'Gi0/0/0', outsideInterface: 'Gi0/0/1', staticRules: [{ insideIp: natStatic[1], globalIp: natStatic[2] }], serverRules: [] };
    return vendor.generateNatConfig(params);
  }

  // NAT server
  const natServer = text.match(/nat\s+server\s+(tcp|udp)\s+(\d+)\s+([\d.]+)\s+(\d+)/i);
  if (natServer) {
    const params: NatParams = { natType: 'nat-server', aclNumber: 2000, addressPoolId: 1, startIp: '0.0.0.0', endIp: '0.0.0.0', insideInterface: 'Gi0/0/0', outsideInterface: 'Gi0/0/1', staticRules: [], serverRules: [{ protocol: natServer[1] as 'tcp' | 'udp', globalPort: Number(natServer[2]), insideIp: natServer[3], insidePort: Number(natServer[4]) }] };
    return vendor.generateNatConfig(params);
  }

  // STP
  const stpMatch = text.match(/stp\s+(stp|rstp|mstp)(?:\s+root)?/i);
  if (stpMatch) {
    const params: StpParams = { mode: stpMatch[1] as 'stp' | 'rstp' | 'mstp', rootBridge: /root/.test(text) };
    return vendor.generateStpConfig(params);
  }

  // LinkAgg
  const lagMatch = text.match(/(trunk|eth-trunk|lacp)\s+(\S+)\s+port\s+([\d,\s]+)/i);
  if (lagMatch) {
    const params: LinkAggParams = { groupId: Number(lagMatch[2].replace(/\D/g, '')), mode: lagMatch[1] === 'lacp' ? 'lacp' : 'static', ports: lagMatch[3] };
    return vendor.generateLinkAggConfig(params);
  }

  // Interface
  const ifaceMatch = text.match(/interface\s+(\S+)(?:\s+speed\s+(\d+))?(?:\s+duplex\s+(full|half))?(?:\s+desc\s+(.+))?/i);
  if (ifaceMatch) {
    const params: IfaceParams = { interfaceName: ifaceMatch[1], speed: ifaceMatch[2] || undefined, duplex: ifaceMatch[3] as IfaceParams['duplex'], description: ifaceMatch[4] || undefined };
    return vendor.generateIfaceConfig(params);
  }

  // Port security
  const psMatch = text.match(/port-sec\s+(\S+)(?:\s+max\s+(\d+))?(?:\s+sticky)?/i);
  if (psMatch) {
    const params: PortSecParams = { interfaceName: psMatch[1], maxMac: Number(psMatch[2] || 3), mode: 'shutdown', sticky: /sticky/.test(text) };
    return vendor.generatePortSecConfig(params);
  }

  // SNMP
  const snmpMatch = text.match(/snmp\s+community\s+(\S+)(?:\s+location\s+(.+))?/i);
  if (snmpMatch) {
    const params: SnmpParams = { version: 'v2c', community: snmpMatch[1], location: snmpMatch[2] };
    return vendor.generateSnmpConfig(params);
  }

  // NTP
  const ntpMatch = text.match(/ntp\s+([\d.]+)/i);
  if (ntpMatch) return vendor.generateNtpConfig({ serverIp: ntpMatch[1] });

  // Syslog
  const syslogMatch = text.match(/syslog\s+([\d.]+)/i);
  if (syslogMatch) return vendor.generateSyslogConfig({ serverIp: syslogMatch[1] });

  // LLDP
  if (/lldp\s+on/i.test(text)) return vendor.generateLldpConfig({ enable: true });
  if (/lldp\s+off/i.test(text)) return vendor.generateLldpConfig({ enable: false });

  return null;
}
