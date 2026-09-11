import type { VendorCommands } from './base';
import { cidrToMask } from './base';
import type { VlanParams, VlanifParams, AclParams, RoutingParams, LinkAggParams, StpParams, AaaParams, NatParams, QosParams, VxlanParams, StackParams, VrrpParams, DhcpParams, FwPolicyParams, IfaceParams, PortSecParams, SnmpParams, NtpParams, SyslogParams, LldpParams, QinqParams } from '../../../src/types';

// OSPF 网络类型在本产品里的取值 → Cisco IOS 的接口级写法。
// 注意 NBMA：Cisco 没有 `nbma` 这个关键字，对应的是 `non-broadcast`。
const CISCO_NETWORK_TYPE: Record<string, string> = {
  broadcast: 'broadcast',
  nbma: 'non-broadcast',
  p2p: 'point-to-point',
  p2mp: 'point-to-multipoint',
};

// 静默接口：逐条下发用户点名的那几个接口。
// 不要写成 `passive-interface default` —— 那条是「所有接口都静默」，语义正好相反。
function ciscoPassiveInterfaces(cmds: string[], list?: string) {
  if (!list) return;
  list.split(/[,\s]+/).filter(Boolean).forEach((i) => cmds.push(` passive-interface ${i}`));
}

// IOS 的 RIP 认证没有进程级命令，只有「建 key chain」+「在接口上引用」两步。
// 链名是固定的 —— 本工具一次只配一套 RIP 认证，用户没有给链取名的入口，
// 随机/派生名字只会让配置更难读。
const RIP_KEY_CHAIN = 'RIP-AUTH';

/**
 * 生成 RIP 认证配置。参数用到的 authMode 已排除 'none'/'none' 空值，见调用处。
 * `simple` 在 IOS 上的关键字是 `text`（不是 simple），所以这里必须映射一次。
 */
function ciscoRipAuth(mode: 'simple' | 'md5', key: string, interfaces?: string): string[] {
  const out: string[] = [];
  out.push(`key chain ${RIP_KEY_CHAIN}`);
  out.push(' key 1');
  out.push(`  key-string ${key}`);
  out.push(' exit');
  out.push(' exit');
  // 没给接口就只留 key chain：它是合法配置，也是「用户想配认证」的痕迹，
  // 但【认证并不生效】—— 没有任何接口引用它。界面上这一栏有明确提示。
  if (!interfaces) return out;
  interfaces.split(/[,\s]+/).filter(Boolean).forEach((iface) => {
    out.push(`interface ${iface}`);
    out.push(` ip rip authentication key-chain ${RIP_KEY_CHAIN}`);
    out.push(` ip rip authentication mode ${mode === 'md5' ? 'md5' : 'text'}`);
    out.push(' exit');
  });
  return out;
}

export class CiscoCommands implements VendorCommands {
  name = 'Cisco 思科';
  portPrefix = 'GigabitEthernet0/';

  setPortPrefix(prefix: string) { this.portPrefix = prefix; }

  portFormat(port: string): string {
    return this.portPrefix + port;
  }

  generateVlanConfig(p: VlanParams): string {
    const cmds: string[] = ['configure terminal'];
    const ports = p.ports.split(/[,\s]+/).filter(Boolean);

    p.vlanIds.forEach((id) => {
      const sub: string[] = [];
      if (p.description) sub.push(` name ${p.description}`);
      cmds.push(`vlan ${id}`);
      cmds.push(...sub);
      if (sub.length > 0) cmds.push(' exit');
    });

    // Interface range if multiple ports
    if (ports.length > 1) {
      const portList = ports.map((pt) => this.portFormat(pt)).join(', ');
      cmds.push(`interface range ${portList}`);
    } else {
      cmds.push(`interface ${this.portFormat(ports[0])}`);
    }

    if (p.portMode === 'trunk') {
      cmds.push(' switchport trunk encapsulation dot1q');
      cmds.push(' switchport mode trunk');
      cmds.push(` switchport trunk allowed vlan ${p.vlanIds.join(',')}`);
    } else {
      cmds.push(' switchport mode access');
      cmds.push(` switchport access vlan ${p.vlanIds[0]}`);
    }
    cmds.push(' exit');

    cmds.push('end');
    return cmds.join('\n');
  }

  generateVlanifConfig(p: VlanifParams): string {
    const cmds: string[] = ['configure terminal'];
    cmds.push(`interface Vlan ${p.vlanId}`);
    cmds.push(` ip address ${p.ip} ${cidrToMask(p.mask)}`);
    if (p.description) cmds.push(` description ${p.description}`);
    cmds.push(' exit');
    cmds.push('end');
    return cmds.join('\n');
  }

  generateAclConfig(p: AclParams): string {
    const cmds: string[] = ['configure terminal'];

    if (p.timeRange) {
      cmds.push(`time-range ${p.timeRange}`);
      cmds.push(' periodic weekdays 9:00 to 18:00');
    }

    if (p.aclType === 'layer2') {
      cmds.push(`mac access-list extended ${p.aclName || 'L2-MYACL'}`);
      p.rules.forEach((r) => {
        let cmd = ` ${r.action}`;
        cmd += ` ${r.sourceMac || '0000.0000.0000'} ${r.sourceMacMask?.replace(/-/g, '.') || '0000.0000.0000'}`;
        cmd += ` ${r.destMac || '0000.0000.0000'} ${r.destMacMask?.replace(/-/g, '.') || '0000.0000.0000'}`;
        cmds.push(cmd);
      });
      cmds.push(' exit');
    } else if (p.aclType === 'named') {
      cmds.push(`ip access-list extended ${p.aclName || 'MYACL'}`);
      p.rules.forEach((r) => {
        let cmd = ` ${r.action} ${r.protocol}`;
        cmd += ` ${r.sourceIp} ${r.sourceWildcard}`;
        if (r.srcPort) cmd += ` eq ${r.srcPort}`;
        cmd += ` ${r.destIp} ${r.destWildcard}`;
        if (r.dstPort) cmd += ` eq ${r.dstPort}`;
        if (p.timeRange) cmd += ` time-range ${p.timeRange}`;
        cmds.push(cmd);
      });
      cmds.push(' exit');
    } else {
      p.rules.forEach((r) => {
        let cmd = `access-list ${p.aclNumber} ${r.action} ${r.protocol}`;
        cmd += ` ${r.sourceIp} ${r.sourceWildcard}`;
        if (r.srcPort && p.aclType !== 'basic') cmd += ` eq ${r.srcPort}`;
        if (p.aclType !== 'basic') {
          cmd += ` ${r.destIp || 'any'} ${r.destIp ? r.destWildcard : ''}`.trimEnd();
          if (r.dstPort) cmd += ` eq ${r.dstPort}`;
        }
        if (p.timeRange) cmd += ` time-range ${p.timeRange}`;
        cmds.push(cmd.trimEnd());
      });
    }

    if (p.applyInterface) {
      cmds.push(`interface ${p.applyInterface}`);
      const groupRef = p.aclType === 'layer2'
        ? `${p.aclName || 'L2-MYACL'}`
        : p.aclType === 'named'
        ? `${p.aclName || 'MYACL'}`
        : `${p.aclNumber}`;
      cmds.push(` ip access-group ${groupRef} ${p.applyDirection === 'outbound' ? 'out' : 'in'}`);
      cmds.push(' exit');
    }

    cmds.push('end');
    return cmds.join('\n');
  }

  generateRoutingConfig(p: RoutingParams): string {
    const cmds: string[] = ['configure terminal'];

    p.staticRoutes.forEach((r) => {
      const nh = r.blackhole ? 'Null0' : r.nextHop;
      cmds.push(`ip route ${r.destination} ${r.mask} ${nh}${r.preference ? ` ${r.preference}` : ''}`);
    });

    if (p.ospf) {
      const pid = p.ospf.processId;
      if (p.ospf.isV3) {
        // 旧实现在这里出的是 `interface ${n.network}` —— 把【网络地址】当接口名用，
        // 于是生成了 `interface 2001:db8::` 这种命令。根因是数据模型只有
        // {网络地址, 通配符}，而 v3 是接口级协议。现在读 n.iface，并且【不回落】到
        // network —— 回落就等于把这个 bug 原样带回来（见下面的展开说明）。
        cmds.push('ipv6 unicast-routing');   // 起 ipv6 router ospf 的前提
        cmds.push(`ipv6 router ospf ${pid}`);
        cmds.push(` router-id ${p.ospf.routerId}`);
        if (p.ospf.defaultOriginate) cmds.push(' default-information originate always');
        if (p.ospf.redistribute?.length) p.ospf.redistribute.forEach((r) => cmds.push(` redistribute ${r}`));
        ciscoPassiveInterfaces(cmds, p.ospf.passiveInterfaces);
        cmds.push(' exit');

        p.ospf.networks.forEach((n) => {
          // 只认 iface，不拿 network 兜底：network 是【网络地址】不是接口名，
          // 兜底就等于继续产出 `interface 2001:db8::`。留空就是留空。
          const iface = n.iface;
          if (!iface) return;
          cmds.push(`interface ${iface}`);
          cmds.push(` ipv6 ospf ${pid} area ${n.area || p.ospf!.area}`);
          cmds.push(' exit');
        });
      } else {
        cmds.push(`router ospf ${pid}`);
        cmds.push(` router-id ${p.ospf.routerId}`);
        if (p.ospf.defaultOriginate) cmds.push(' default-information originate always');
        if (p.ospf.redistribute?.length) p.ospf.redistribute.forEach((r) => cmds.push(` redistribute ${r} subnets`));
        if (p.ospf.cost) cmds.push(` auto-cost reference-bandwidth ${p.ospf.cost}`);
        // 旧实现无条件写 `passive-interface default`，它表示【所有】接口都静默，
        // 跟用户点名的那几个正好相反 —— 用户想静默 2 个口，结果整个 OSPF 都不跑。
        ciscoPassiveInterfaces(cmds, p.ospf.passiveInterfaces);
        if (p.ospf.authMode === 'md5') cmds.push(` area ${p.ospf.area} authentication message-digest`);
        else if (p.ospf.authMode === 'simple') cmds.push(` area ${p.ospf.area} authentication`);
        p.ospf.networks.forEach((n) => {
          cmds.push(` network ${n.network} ${n.wildcard} area ${n.area || p.ospf!.area}`);
        });
        cmds.push(' exit');

        // 认证密钥和网络类型在 IOS 上都是【接口级】命令，进程视图里没有。
        // 旧的 ` network-type p2mp` 就是这么来的：参数没丢，但那条命令不存在。
        p.ospf.networks.forEach((n) => {
          if (!n.iface) return;
          const lines: string[] = [];
          if (p.ospf!.authKey && p.ospf!.authMode === 'md5') lines.push(` ip ospf message-digest-key 1 md5 ${p.ospf!.authKey}`);
          else if (p.ospf!.authKey && p.ospf!.authMode === 'simple') lines.push(` ip ospf authentication-key ${p.ospf!.authKey}`);
          if (p.ospf!.networkType) lines.push(` ip ospf network ${CISCO_NETWORK_TYPE[p.ospf!.networkType]}`);
          if (!lines.length) return;
          cmds.push(`interface ${n.iface}`);
          cmds.push(...lines);
          cmds.push(' exit');
        });
      }
    }

    if (p.bgp) {
      cmds.push(`router bgp ${p.bgp.asNumber}`);
      cmds.push(` bgp router-id ${p.bgp.routerId}`);
      p.bgp.neighbors.forEach((n) => cmds.push(` neighbor ${n.ip} remote-as ${n.remoteAs}`));
      p.bgp.networks.forEach((nw) => cmds.push(` network ${nw.network} mask ${nw.mask}`));
      cmds.push(' exit');
    }

    if (p.rip) {
      cmds.push('router rip');
      cmds.push(` version ${p.rip.version}`);
      if (p.rip.defaultOriginate) cmds.push(' default-information originate');
      if (p.rip.redistribute?.length) p.rip.redistribute.forEach((r) => cmds.push(` redistribute ${r}`));
      p.rip.networks.forEach((n) => cmds.push(` network ${n}`));
      if (p.rip.passiveInterfaces) p.rip.passiveInterfaces.split(/[,\s]+/).filter(Boolean).forEach((iface) => cmds.push(` passive-interface ${iface}`));
      cmds.push(' exit');

      // 旧实现把 authMode/authKey 整个丢掉了：用户勾了认证、界面收下了、生成的
      // 配置里一个字都没有，交换机照常明文跑 RIP。
      // ⚠️ 这里不能写 `if (p.rip.authMode)`：'none' 是【非空字符串】，真值。
      const ripAuth = p.rip.authMode;
      if ((ripAuth === 'simple' || ripAuth === 'md5') && p.rip.authKey) {
        cmds.push(...ciscoRipAuth(ripAuth, p.rip.authKey, p.rip.authInterfaces));
      }
    }

    cmds.push('end');
    return cmds.join('\n');
  }

  generateLinkAggConfig(p: LinkAggParams): string {
    const cmds: string[] = ['configure terminal'];
    const ports = p.ports.split(/[,\s]+/).filter(Boolean);

    cmds.push(`interface Port-channel ${p.groupId}`);
    cmds.push(` switchport`);
    if (p.loadBalance) cmds.push(` port-channel load-balance ${p.loadBalance}`);
    cmds.push(' exit');

    const portList = ports.map((pt) => this.portFormat(pt)).join(', ');
    if (ports.length > 1) {
      cmds.push(`interface range ${portList}`);
    } else {
      cmds.push(`interface ${this.portFormat(ports[0])}`);
    }
    cmds.push(` channel-group ${p.groupId} mode ${p.mode === 'lacp' ? 'active' : 'on'}`);
    cmds.push(' exit');

    cmds.push('end');
    return cmds.join('\n');
  }

  generateStpConfig(p: StpParams): string {
    const cmds: string[] = ['configure terminal'];

    const modeMap = { stp: 'pvst', rstp: 'rapid-pvst', mstp: 'mst' };
    cmds.push(`spanning-tree mode ${modeMap[p.mode]}`);

    if (p.rootBridge) {
      cmds.push('spanning-tree vlan 1 root primary');
    }

    if (p.edgePorts) {
      const ports = p.edgePorts.split(/[,\s]+/).filter(Boolean);
      const portList = ports.map((pt) => this.portFormat(pt)).join(', ');
      if (ports.length > 1) {
        cmds.push(`interface range ${portList}`);
      } else {
        cmds.push(`interface ${this.portFormat(ports[0])}`);
      }
      cmds.push(' spanning-tree portfast');
      if (p.bpduGuard) cmds.push(' spanning-tree bpduguard enable');
      cmds.push(' exit');
    }

    cmds.push('end');
    return cmds.join('\n');
  }

  generateAaaConfig(p: AaaParams): string {
    const cmds: string[] = ['configure terminal'];
    cmds.push('aaa new-model');

    if (p.authMode === 'local') {
      cmds.push('aaa authentication login default local');
      cmds.push('aaa authorization exec default local');
    } else if (p.authMode === 'radius') {
      cmds.push('aaa authentication login default group radius local');
      cmds.push('aaa authorization exec default group radius local');
    } else {
      cmds.push('aaa authentication login default group tacacs+ local');
      cmds.push('aaa authorization exec default group tacacs+ local');
    }
    cmds.push('aaa accounting exec default start-stop group tacacs+');

    if (p.authMode === 'radius' && p.radiusServer) {
      cmds.push(`radius-server host ${p.radiusServer}`);
      if (p.radiusKey) cmds.push(`radius-server key ${p.radiusKey}`);
    }

    if (p.authMode === 'tacacs+' && p.tacacsServer) {
      cmds.push(`tacacs-server host ${p.tacacsServer}`);
      if (p.tacacsKey) cmds.push(`tacacs-server key ${p.tacacsKey}`);
    }

    p.localUsers.forEach((u) => {
      cmds.push(`username ${u.username} privilege ${u.privilege} secret ${u.password}`);
    });

    if (p.enableTelnet || p.enableSsh) {
      cmds.push('line vty 0 4');
      cmds.push(' login authentication default');
      if (p.enableSsh) {
        cmds.push(' transport input ssh');
        cmds.push(' exit');
        cmds.push('ip domain-name example.local');
        cmds.push('crypto key generate rsa 2048');
        cmds.push('ip ssh version 2');
      } else {
        cmds.push(' transport input all');
        cmds.push(' exit');
      }
    }

    cmds.push('end');
    return cmds.join('\n');
  }

  generateNatConfig(p: NatParams): string {
    const cmds: string[] = ['configure terminal'];

    if (p.insideInterface) {
      cmds.push(`interface ${p.insideInterface}`);
      cmds.push(' ip nat inside');
      cmds.push(' exit');
    }
    if (p.outsideInterface) {
      cmds.push(`interface ${p.outsideInterface}`);
      cmds.push(' ip nat outside');
      cmds.push(' exit');
    }

    if (p.natType === 'static') {
      p.staticRules.forEach((r) => {
        cmds.push(`ip nat inside source static ${r.insideIp} ${r.globalIp}`);
      });
    }

    if (p.natType === 'dynamic') {
      cmds.push(`ip nat pool NATPOOL ${p.startIp} ${p.endIp} netmask 255.255.255.0`);
      cmds.push(`access-list ${p.aclNumber || 1} permit ${p.startIp || '192.168.1.0'} 0.0.0.255`);
      cmds.push(`ip nat inside source list ${p.aclNumber || 1} pool NATPOOL`);
    }

    if (p.natType === 'nat-server') {
      p.serverRules.forEach((r) => {
        cmds.push(`ip nat inside source static ${r.protocol} ${r.insideIp} ${r.insidePort} ${p.startIp || 'interface'} ${r.globalPort}`);
      });
    }

    cmds.push('end');
    return cmds.join('\n');
  }

  generateQosConfig(p: QosParams): string {
    const cmds: string[] = ['configure terminal'];

    p.classifiers.forEach((c) => {
      cmds.push(`class-map match-all ${c.name}`);
      if (c.matchType === 'acl' && c.aclNumber) {
        cmds.push(` match access-group ${c.aclNumber}`);
      } else if (c.matchType === 'dscp' && c.dscpValue) {
        cmds.push(` match ip dscp ${c.dscpValue}`);
      } else if (c.matchType === 'precedence' && c.precedenceValue !== undefined) {
        cmds.push(` match ip precedence ${c.precedenceValue}`);
      } else if (c.matchType === 'vlan-8021p' && c.vlan8021p !== undefined) {
        cmds.push(` match cos ${c.vlan8021p}`);
      } else if (c.matchType === 'any') {
        cmds.push(' match any');
      }
      cmds.push(' exit');
    });

    cmds.push(`policy-map ${p.policyName}`);
    p.policyRules.forEach((pr) => {
      const beh = p.behaviors.find((b) => b.name === pr.behaviorName);
      cmds.push(` class ${pr.classifierName}`);
      if (beh?.carRate) {
        cmds.push(`  police cir ${beh.carRate * 1000} conform-action transmit exceed-action drop`);
      }
      if (beh?.remarkDscp) cmds.push(`  set ip dscp ${beh.remarkDscp}`);
      if (beh?.remarkPrecedence !== undefined) cmds.push(`  set ip precedence ${beh.remarkPrecedence}`);
      if (beh?.remark8021p !== undefined) cmds.push(`  set cos ${beh.remark8021p}`);
      cmds.push('  exit');
    });
    cmds.push(' exit');

    if (p.applyInterface) {
      cmds.push(`interface ${p.applyInterface}`);
      cmds.push(` service-policy ${p.applyDirection === 'outbound' ? 'output' : 'input'} ${p.policyName}`);
      cmds.push(' exit');
    }

    if (p.enableFlowControl && p.flowControlInterface) {
      cmds.push(`interface ${p.flowControlInterface}`);
      cmds.push(' flowcontrol send on');
      cmds.push(' exit');
    }

    cmds.push('end');
    return cmds.join('\n');
  }

  generateVxlanConfig(p: VxlanParams): string {
    const cmds: string[] = ['configure terminal'];

    cmds.push(`interface nve${p.nveId}`);
    cmds.push(' no shutdown');
    cmds.push(` source-interface ${p.sourceIp}`);
    p.vnis.forEach((v) => {
      cmds.push(` member vni ${v.vniId}`);
      cmds.push('  ingress-replication protocol static');
      const peers = v.peerIps.split(/[,\s]+/).filter(Boolean);
      peers.forEach((peer) => {
        cmds.push(`  peer-ip ${peer}`);
      });
    });
    cmds.push(' exit');

    cmds.push('end');
    return cmds.join('\n');
  }

  generateStackConfig(p: StackParams): string {
    const cmds: string[] = ['configure terminal'];

    p.members.forEach((m) => {
      cmds.push(`switch ${m.memberId} priority ${m.priority}`);
    });

    if (p.stackPorts.length > 0) {
      const ifaces = p.stackPorts.flatMap((sp) =>
        sp.interfaces.split(/[,\s]+/).filter(Boolean)
      );
      cmds.push(`switch ${p.members[0]?.memberId || 1} provision`);
      ifaces.forEach((iface) => {
        cmds.push(` stack-port ${iface}`);
      });
    }

    cmds.push('end');
    return cmds.join('\n');
  }

  generateVrrpConfig(p: VrrpParams): string {
    const cmds: string[] = ['configure terminal'];
    cmds.push(`interface ${p.interfaceName}`);
    cmds.push(` vrrp ${p.vrid} ip ${p.virtualIp}`);
    cmds.push(` vrrp ${p.vrid} priority ${p.priority}`);
    if (p.preempt) cmds.push(` vrrp ${p.vrid} preempt`);
    cmds.push(' exit');
    cmds.push('end');
    return cmds.join('\n');
  }

  generateDhcpConfig(p: DhcpParams): string {
    const cmds: string[] = ['configure terminal'];
    if (p.mode === 'server' && p.poolName && p.network) {
      cmds.push(`ip dhcp pool ${p.poolName}`);
      cmds.push(` network ${p.network} ${cidrToMask(p.mask || 24)}`);
      if (p.gateway) cmds.push(` default-router ${p.gateway}`);
      if (p.dnsServers) cmds.push(` dns-server ${p.dnsServers}`);
      cmds.push(' exit');
    } else if (p.mode === 'relay' && p.relayServer) {
      cmds.push(`ip helper-address ${p.relayServer}`);
    }
    if (p.mode === 'snooping') {
      cmds.push('ip dhcp snooping');
    }
    if (p.trustInterfaces) {
      const ifaces = p.trustInterfaces.split(/[,\s]+/).filter(Boolean);
      ifaces.forEach((iface) => {
        cmds.push(`interface ${iface}`);
        cmds.push(' ip dhcp snooping trust');
        cmds.push(' exit');
      });
    }
    cmds.push('end');
    return cmds.join('\n');
  }

  generateFwPolicyConfig(p: FwPolicyParams): string {
    const cmds: string[] = ['configure terminal'];
    const zones = p.zones.split(/[,\s]+/).filter(Boolean);
    zones.forEach((z) => cmds.push(`zone security ${z}`));
    p.rules.forEach((r) => {
      cmds.push(`policy-map type inspect ${r.sourceZone}_to_${r.destZone}`);
      cmds.push(` class type inspect ${r.sourceZone}_class`);
      cmds.push(`  inspect`);
      cmds.push(`  ${r.action === 'deny' ? 'drop' : 'pass'}`);
    });
    cmds.push('end');
    return cmds.join('\n');
  }

  generateIfaceConfig(p: IfaceParams): string {
    const cmds: string[] = ['configure terminal'];
    cmds.push(`interface ${p.interfaceName}`);
    if (p.description) cmds.push(` description ${p.description}`);
    if (p.speed) cmds.push(` speed ${p.speed}`);
    if (p.duplex) cmds.push(` duplex ${p.duplex}`);
    if (p.mtu) cmds.push(` mtu ${p.mtu}`);
    if (p.ip && p.mask) cmds.push(` ip address ${p.ip} ${cidrToMask(p.mask)}`);
    if (p.secondaryIp && p.secondaryMask) cmds.push(` ip address ${p.secondaryIp} ${cidrToMask(p.secondaryMask)} secondary`);
    cmds.push(' exit');
    cmds.push('end');
    return cmds.join('\n');
  }

  generatePortSecConfig(p: PortSecParams): string {
    const cmds: string[] = ['configure terminal'];
    cmds.push(`interface ${p.interfaceName}`);
    cmds.push(' switchport port-security');
    cmds.push(` switchport port-security maximum ${p.maxMac}`);
    cmds.push(` switchport port-security violation ${p.mode}`);
    if (p.sticky) cmds.push(' switchport port-security mac-address sticky');
    if (p.staticMacs) {
      const macs = p.staticMacs.split(/[,\s]+/).filter(Boolean);
      macs.forEach((m) => cmds.push(` switchport port-security mac-address ${m}`));
    }
    cmds.push(' exit');
    cmds.push('end');
    return cmds.join('\n');
  }

  generateSnmpConfig(p: SnmpParams): string {
    const cmds: string[] = ['configure terminal'];
    if (p.version === 'v2c') {
      cmds.push(`snmp-server community ${p.community} RO`);
    } else {
      cmds.push(`snmp-server group v3group v3 priv`);
      cmds.push(`snmp-server user ${p.community} v3group v3`);
    }
    if (p.location) cmds.push(`snmp-server location ${p.location}`);
    if (p.contact) cmds.push(`snmp-server contact ${p.contact}`);
    if (p.trapServer) cmds.push(`snmp-server host ${p.trapServer} ${p.community}`);
    cmds.push('end');
    return cmds.join('\n');
  }

  generateNtpConfig(p: NtpParams): string {
    const cmds: string[] = ['configure terminal'];
    cmds.push(`ntp server ${p.serverIp}`);
    cmds.push('end');
    return cmds.join('\n');
  }

  generateSyslogConfig(p: SyslogParams): string {
    const cmds: string[] = ['configure terminal'];
    cmds.push(`logging host ${p.serverIp}`);
    if (p.level) cmds.push(`logging trap ${p.level}`);
    cmds.push('end');
    return cmds.join('\n');
  }

  generateLldpConfig(p: LldpParams): string {
    const cmds: string[] = ['configure terminal'];
    cmds.push(p.enable ? 'lldp run' : 'no lldp run');
    cmds.push('end');
    return cmds.join('\n');
  }

  generateQinqConfig(p: QinqParams): string {
    const cmds: string[] = ['configure terminal'];
    cmds.push(`interface ${p.interfaceName}`);
    cmds.push(' switchport mode dot1q-tunnel');
    cmds.push(` switchport access vlan ${p.outerVlan}`);
    cmds.push(' exit');
    cmds.push('end');
    return cmds.join('\n');
  }
}
