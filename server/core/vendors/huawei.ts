import type { VendorCommands } from './base';
import type { VlanParams, VlanifParams, AclParams, RoutingParams, LinkAggParams, StpParams, AaaParams, NatParams, QosParams, VxlanParams, StackParams, VrrpParams, DhcpParams, FwPolicyParams, IfaceParams, PortSecParams, SnmpParams, NtpParams, SyslogParams, LldpParams, QinqParams } from '../../../src/types';

export class HuaweiCommands implements VendorCommands {
  name = '华为 Huawei';
  portPrefix = 'GigabitEthernet0/0/';

  setPortPrefix(prefix: string) { this.portPrefix = prefix; }

  portFormat(port: string): string {
    return this.portPrefix + port;
  }

  generateVlanConfig(p: VlanParams): string {
    const cmds: string[] = ['system-view'];
    const ports = p.ports.split(/[,\s]+/).filter(Boolean);

    p.vlanIds.forEach((id) => {
      const sub: string[] = [];
      if (p.description) sub.push(` description ${p.description}`);
      cmds.push(`vlan ${id}`);
      cmds.push(...sub);
      if (sub.length > 0) cmds.push(' quit');
    });

    ports.forEach((pt) => {
      const iface = this.portFormat(pt);
      cmds.push(`interface ${iface}`);
      if (p.portMode === 'hybrid') {
        cmds.push(` port link-type hybrid`);
        p.vlanIds.forEach((id) => cmds.push(` port hybrid untagged vlan ${id}`));
      } else if (p.portMode === 'trunk') {
        cmds.push(` port link-type trunk`);
        cmds.push(` port trunk allow-pass vlan ${p.vlanIds.join(' ')}`);
      } else {
        cmds.push(` port link-type access`);
        cmds.push(` port default vlan ${p.vlanIds[0]}`);
      }
      cmds.push(' quit');
    });

    // return
    return cmds.join('\n');
  }

  generateVlanifConfig(p: VlanifParams): string {
    const cmds: string[] = ['system-view'];
    cmds.push(`interface Vlanif ${p.vlanId}`);
    cmds.push(` ip address ${p.ip} ${p.mask}`);
    if (p.description) cmds.push(` description ${p.description}`);
    cmds.push(' quit');
    // return
    return cmds.join('\n');
  }

  generateAclConfig(p: AclParams): string {
    const cmds: string[] = ['system-view'];

    // Time-range
    if (p.timeRange) {
      cmds.push(`time-range ${p.timeRange} 09:00 to 18:00 working-day`);
    }

    // ACL header
    if (p.aclType === 'layer2') {
      cmds.push(`acl ${p.aclNumber}`);
    } else if (p.aclType === 'named') {
      cmds.push(`acl name ${p.aclName || 'MYACL'} advanced`);
    } else if (p.aclType === 'user') {
      cmds.push(`acl ${p.aclNumber}`);
    } else {
      const t = p.aclType === 'advanced' ? 'advanced' : 'basic';
      cmds.push(`acl ${t} ${p.aclNumber}`);
    }

    // Rules
    p.rules.forEach((r) => {
      if (p.aclType === 'layer2') {
        let rule = ` rule ${r.ruleId} ${r.action}`;
        if (r.sourceMac) rule += ` source-mac ${r.sourceMac} ${r.sourceMacMask || 'ffff-ffff-ffff'}`;
        if (r.destMac) rule += ` destination-mac ${r.destMac} ${r.destMacMask || 'ffff-ffff-ffff'}`;
        cmds.push(rule);
      } else {
        let rule = ` rule ${r.ruleId} ${r.action} ${r.protocol}`;
        rule += ` source ${r.sourceIp} ${r.sourceWildcard}`;
        if (r.destIp && p.aclType !== 'basic') rule += ` destination ${r.destIp} ${r.destWildcard}`;
        if (r.srcPort) rule += ` source-port eq ${r.srcPort}`;
        if (r.dstPort) rule += ` destination-port eq ${r.dstPort}`;
        if (p.timeRange) rule += ` time-range ${p.timeRange}`;
        cmds.push(rule);
      }
    });

    cmds.push(' quit');

    // Apply to interface
    if (p.applyInterface) {
      cmds.push(`interface ${p.applyInterface}`);
      const dir = p.applyDirection === 'outbound' ? 'outbound' : 'inbound';
      const aclRef = p.aclType === 'named' ? `acl name ${p.aclName || 'MYACL'}` : `acl ${p.aclNumber}`;
      cmds.push(` traffic-filter ${dir} ${aclRef}`);
      cmds.push(' quit');
    }

    // return
    return cmds.join('\n');
  }

  generateRoutingConfig(p: RoutingParams): string {
    const cmds: string[] = ['system-view'];

    p.staticRoutes.forEach((r) => {
      const pref = r.preference ? ` preference ${r.preference}` : '';
      const nh = r.blackhole ? 'NULL0' : r.nextHop;
      cmds.push(`ip route-static ${r.destination} ${r.mask} ${nh}${pref}`);
    });

    if (p.ospf) {
      const pid = p.ospf.processId;
      if (p.ospf.isV3) {
        // OSPFv3 下【没有 network 语句】——协议是挂在接口上的。旧实现在这里照抄 v2 的
        // `area` + `network`，真机上不成立（华为/H3C 的 v3 都是接口级）。
        // 所以分两段：先起进程写进程级设置，再逐接口把接口挂进区域。
        cmds.push(`ospfv3 ${pid} router-id ${p.ospf.routerId}`);
        if (p.ospf.defaultOriginate) cmds.push(' default-route-advertise always');
        if (p.ospf.redistribute?.length) p.ospf.redistribute.forEach((r) => cmds.push(` import-route ${r}`));
        if (p.ospf.cost) cmds.push(` default cost ${p.ospf.cost}`);
        if (p.ospf.passiveInterfaces) {
          p.ospf.passiveInterfaces.split(/[,\s]+/).filter(Boolean).forEach((i) => cmds.push(` silent-interface ${i}`));
        }
        cmds.push(' quit');

        p.ospf.networks.forEach((n) => {
          // 只认 iface。不拿 network 兜底：network 是【网络地址】不是接口名，
          // 兜底就等于把思科那个 `interface 2001:db8::` 的错误复制到华为这边。
          const iface = n.iface;
          if (!iface) return;
          cmds.push(`interface ${iface}`);
          cmds.push(` ospfv3 ${pid} area ${n.area || p.ospf!.area}`);
          cmds.push(' quit');
        });
      } else {
        // v2 分支本次【未改动】。VRP 的 network-type 到底在接口视图还是进程视图，
        // 我没有把握（见 tests/probe-drops.ts 顶部关于「探测只看有没有丢、
        // 看不出语法对不对」的说明），在没法核对真机前不动它 —— 改错的代价是
        // 把本来能用的配置改坏。
        cmds.push(`ospf ${pid} router-id ${p.ospf.routerId}`);
        if (p.ospf.defaultOriginate) cmds.push(' default-route-advertise always');
        if (p.ospf.redistribute?.length) p.ospf.redistribute.forEach((r) => cmds.push(` import-route ${r}`));
        if (p.ospf.networkType) cmds.push(` network-type ${p.ospf.networkType}`);
        if (p.ospf.cost) cmds.push(` default cost ${p.ospf.cost}`);
        if (p.ospf.passiveInterfaces) {
          const ifs = p.ospf.passiveInterfaces.split(/[,\s]+/).filter(Boolean);
          ifs.forEach((iface) => cmds.push(` silent-interface ${iface}`));
        }
        cmds.push(` area ${p.ospf.area}`);
        if (p.ospf.authMode === 'simple') cmds.push(`  authentication-mode simple cipher ${p.ospf.authKey || '123'}`);
        else if (p.ospf.authMode === 'md5') cmds.push(`  authentication-mode md5 1 cipher ${p.ospf.authKey || '123'}`);
        p.ospf.networks.forEach((n) => {
          cmds.push(`  network ${n.network} ${n.wildcard}`);
        });
        cmds.push(' quit');
      }
    }

    if (p.bgp) {
      cmds.push(`bgp ${p.bgp.asNumber}`);
      cmds.push(` router-id ${p.bgp.routerId}`);
      p.bgp.neighbors.forEach((n) => {
        cmds.push(` peer ${n.ip} as-number ${n.remoteAs}`);
      });
      p.bgp.networks.forEach((nw) => {
        cmds.push(` network ${nw.network} ${nw.mask}`);
      });
      cmds.push(' quit');
    }

    if (p.rip) {
      cmds.push(`rip 1`);
      cmds.push(` version ${p.rip.version}`);
      p.rip.networks.forEach((n) => cmds.push(` network ${n}`));
      if (p.rip.defaultOriginate) cmds.push(' default-route originate');
      if (p.rip.redistribute?.length) p.rip.redistribute.forEach((r) => cmds.push(` import-route ${r}`));
      if (p.rip.passiveInterfaces) {
        p.rip.passiveInterfaces.split(/[,\s]+/).filter(Boolean).forEach((iface) => cmds.push(` silent-interface ${iface}`));
      }
      // ⚠️⚠️ 已知缺陷：下面两行放在 rip 进程视图里是【错的】，真机会拒绝执行。
      // 详见根目录 KNOWN-ISSUES.md 第 1 条。保留错误实现是【有意】的决策
      // （2026-09-11 用户选择「先记为已知问题，本轮先交付」），不是漏改。
      //
      // 这行【改造前就存在】（基线 5e87d05 里就有），不是本次重构引入的。
      // 正确形态是【接口视图 + rip 前缀】：
      //   interface Vlanif10
      //    rip authentication-mode md5 usual cipher <密码>
      //    rip authentication-mode simple cipher <密码>
      // 注意 VRP 的 md5 变体关键字是 usual/nonstandard，和 H3C 的
      // rfc2453/rfc2082 【不是同一套】，别把两家的修正互相抄。
      //
      // ⚠️ 'none' 是非空字符串、真值，不能只判 truthy。
      if (p.rip.authMode === 'simple') cmds.push(` authentication-mode simple ${p.rip.authKey || '123'}`);
      else if (p.rip.authMode === 'md5') cmds.push(` authentication-mode md5 usual ${p.rip.authKey || '123'}`);
      cmds.push(' quit');
    }

    // return
    return cmds.join('\n');
  }

  generateLinkAggConfig(p: LinkAggParams): string {
    const cmds: string[] = ['system-view'];
    const ports = p.ports.split(/[,\s]+/).filter(Boolean);

    cmds.push(`interface Eth-Trunk ${p.groupId}`);
    cmds.push(` mode ${p.mode === 'lacp' ? 'lacp' : 'manual load-balance'}`);
    if (p.loadBalance) cmds.push(` load-balance ${p.loadBalance}`);
    cmds.push(' quit');

    ports.forEach((pt) => {
      const iface = this.portFormat(pt);
      cmds.push(`interface ${iface}`);
      cmds.push(` eth-trunk ${p.groupId}`);
      cmds.push(' quit');
    });

    // return
    return cmds.join('\n');
  }

  generateStpConfig(p: StpParams): string {
    const cmds: string[] = ['system-view'];
    const modeMap = { stp: 'stp', rstp: 'rstp', mstp: 'mstp' };
    cmds.push(`stp mode ${modeMap[p.mode]}`);

    if (p.rootBridge) {
      cmds.push('stp root primary');
    }

    if (p.edgePorts) {
      const ports = p.edgePorts.split(/[,\s]+/).filter(Boolean);
      ports.forEach((pt) => {
        cmds.push(`interface ${this.portFormat(pt)}`);
        cmds.push(' stp edged-port enable');
        cmds.push(' quit');
      });
    }

    if (p.bpduGuard) {
      cmds.push('stp bpdu-protection');
    }

    // return
    return cmds.join('\n');
  }

  generateAaaConfig(p: AaaParams): string {
    const cmds: string[] = ['system-view'];
    cmds.push('aaa');

    // Auth scheme
    cmds.push(' authentication-scheme default');
    if (p.authMode === 'local') {
      cmds.push('  authentication-mode local');
    } else if (p.authMode === 'radius') {
      cmds.push('  authentication-mode radius');
    } else {
      cmds.push('  authentication-mode hwtacacs');
    }

    cmds.push(' authorization-scheme default');
    cmds.push(`  authorization-mode ${p.authMode === 'local' ? 'local' : 'hwtacacs'}`);

    cmds.push(' accounting-scheme default');
    cmds.push('  accounting-mode none');

    cmds.push(' quit');

    // RADIUS
    if (p.authMode === 'radius' && p.radiusServer) {
      cmds.push(`radius-server template default`);
      if (p.radiusKey) cmds.push(` radius-server shared-key cipher ${p.radiusKey}`);
      cmds.push(` radius-server ${p.radiusServer} 1812`);
      cmds.push(' quit');
    }

    // TACACS+
    if (p.authMode === 'tacacs+' && p.tacacsServer) {
      cmds.push(`hwtacacs-server template default`);
      if (p.tacacsKey) cmds.push(` hwtacacs-server shared-key cipher ${p.tacacsKey}`);
      cmds.push(` hwtacacs-server ${p.tacacsServer}`);
      cmds.push(' quit');
    }

    // Local users
    p.localUsers.forEach((u) => {
      cmds.push(`local-user ${u.username} password cipher ${u.password}`);
      cmds.push(`local-user ${u.username} privilege level ${u.privilege}`);
      cmds.push(`local-user ${u.username} service-type ${u.serviceTypes.join(' ')}`);
    });

    // Telnet
    if (p.enableTelnet) {
      cmds.push('user-interface vty 0 4');
      cmds.push(' authentication-mode aaa');
      cmds.push(' protocol inbound all');
      cmds.push(' quit');
    }

    // SSH
    if (p.enableSsh) {
      cmds.push('stelnet server enable');
      p.localUsers.forEach((u) => {
        cmds.push(`ssh user ${u.username} authentication-type password`);
        cmds.push(`ssh user ${u.username} service-type stelnet`);
      });
    }

    // return
    return cmds.join('\n');
  }

  generateNatConfig(p: NatParams): string {
    const cmds: string[] = ['system-view'];

    if (p.natType === 'static') {
      p.staticRules.forEach((r) => {
        cmds.push(`nat static global ${r.globalIp} inside ${r.insideIp}`);
      });
    }

    if (p.natType === 'dynamic') {
      cmds.push(`nat address-group ${p.addressPoolId} ${p.startIp} ${p.endIp}`);
      cmds.push(`acl 2000`);
      cmds.push(` rule 5 permit source ${p.aclNumber || '192.168.1.0'} 0.0.0.255`);
      cmds.push(' quit');
    }

    if (p.natType === 'nat-server') {
      p.serverRules.forEach((r) => {
        cmds.push(`nat server protocol ${r.protocol} global ${p.startIp || '0.0.0.0'} ${r.globalPort} inside ${r.insideIp} ${r.insidePort}`);
      });
    }

    if (p.outsideInterface) {
      cmds.push(`interface ${p.outsideInterface}`);
      if (p.natType === 'dynamic') {
        cmds.push(` nat outbound ${p.aclNumber || 2000} address-group ${p.addressPoolId}`);
      } else if (p.natType === 'static') {
        cmds.push(' nat static enable');
      } else if (p.natType === 'nat-server') {
        cmds.push(' nat server enable');
      }
      cmds.push(' quit');
    }

    // return
    return cmds.join('\n');
  }

  generateQosConfig(p: QosParams): string {
    const cmds: string[] = ['system-view'];

    // Classifiers
    p.classifiers.forEach((c) => {
      cmds.push(`traffic classifier ${c.name} operator and`);
      if (c.matchType === 'acl' && c.aclNumber) {
        cmds.push(` if-match acl ${c.aclNumber}`);
      } else if (c.matchType === 'dscp' && c.dscpValue) {
        cmds.push(` if-match dscp ${c.dscpValue}`);
      } else if (c.matchType === 'precedence' && c.precedenceValue !== undefined) {
        cmds.push(` if-match ip-precedence ${c.precedenceValue}`);
      } else if (c.matchType === 'vlan-8021p' && c.vlan8021p !== undefined) {
        cmds.push(` if-match 8021p ${c.vlan8021p}`);
      } else if (c.matchType === 'any') {
        cmds.push(' if-match any');
      }
      cmds.push(' quit');
    });

    // Behaviors
    p.behaviors.forEach((b) => {
      cmds.push(`traffic behavior ${b.name}`);
      if (b.carRate) {
        const burst = b.carBurst || b.carRate * 500;
        cmds.push(` car cir ${b.carRate} cbs ${burst} green pass red discard`);
      }
      if (b.remarkDscp) cmds.push(` remark dscp ${b.remarkDscp}`);
      if (b.remark8021p !== undefined) cmds.push(` remark 8021p ${b.remark8021p}`);
      if (b.remarkPrecedence !== undefined) cmds.push(` remark ip-precedence ${b.remarkPrecedence}`);
      if (b.redirectInterface) cmds.push(` redirect interface ${b.redirectInterface}`);
      cmds.push(' quit');
    });

    // Policy
    cmds.push(`traffic policy ${p.policyName}`);
    p.policyRules.forEach((pr) => {
      cmds.push(` classifier ${pr.classifierName} behavior ${pr.behaviorName}`);
    });
    cmds.push(' quit');

    // Apply
    if (p.applyInterface) {
      cmds.push(`interface ${p.applyInterface}`);
      cmds.push(` traffic-policy ${p.policyName} ${p.applyDirection}`);
      cmds.push(' quit');
    }

    // Flow control
    if (p.enableFlowControl && p.flowControlInterface) {
      cmds.push(`interface ${p.flowControlInterface}`);
      cmds.push(' flow-control');
      cmds.push(' quit');
    }

    // return
    return cmds.join('\n');
  }

  generateVxlanConfig(p: VxlanParams): string {
    const cmds: string[] = ['system-view'];

    p.vnis.forEach((v) => {
      cmds.push(`bridge-domain ${v.bridgeDomainId || v.vniId}`);
      cmds.push(` vxlan vni ${v.vniId}`);
      cmds.push(' quit');
    });

    cmds.push(`interface Nve${p.nveId}`);
    cmds.push(` source ${p.sourceIp}`);
    p.vnis.forEach((v) => {
      const peers = v.peerIps.split(/[,\s]+/).filter(Boolean);
      peers.forEach((peer) => {
        cmds.push(` vni ${v.vniId} head-end peer-list ${peer}`);
      });
    });
    cmds.push(' quit');

    // return
    return cmds.join('\n');
  }

  generateStackConfig(p: StackParams): string {
    const cmds: string[] = ['system-view'];

    p.members.forEach((m) => {
      cmds.push(`stack member ${m.memberId} priority ${m.priority}`);
      if (m.domainId) cmds.push(`stack member ${m.memberId} domain ${m.domainId}`);
    });

    p.stackPorts.forEach((sp) => {
      const ifaces = sp.interfaces.split(/[,\s]+/).filter(Boolean);
      cmds.push(`interface stack-port ${sp.portId}`);
      ifaces.forEach((iface) => {
        cmds.push(` port member-group interface ${iface}`);
      });
      cmds.push(' quit');
    });

    // return
    return cmds.join('\n');
  }

  generateVrrpConfig(p: VrrpParams): string {
    const cmds: string[] = ['system-view'];
    cmds.push(`interface ${p.interfaceName}`);
    cmds.push(` vrrp vrid ${p.vrid} virtual-ip ${p.virtualIp}`);
    cmds.push(` vrrp vrid ${p.vrid} priority ${p.priority}`);
    if (p.preempt) cmds.push(` vrrp vrid ${p.vrid} preempt-mode timer delay 0`);
    if (p.authKey) cmds.push(` vrrp vrid ${p.vrid} authentication-mode simple cipher ${p.authKey}`);
    cmds.push(' quit');
    // return
    return cmds.join('\n');
  }

  generateDhcpConfig(p: DhcpParams): string {
    const cmds: string[] = ['system-view'];
    if (p.mode === 'server' && p.poolName && p.network) {
      cmds.push('dhcp enable');
      cmds.push(`ip pool ${p.poolName}`);
      cmds.push(` gateway-list ${p.gateway || p.network}`);
      cmds.push(` network ${p.network} mask ${p.mask || 24}`);
      if (p.dnsServers) cmds.push(` dns-list ${p.dnsServers}`);
      cmds.push(` address range ${p.startIp || p.network} ${p.endIp || ''}`);
      cmds.push(' quit');
    } else if (p.mode === 'relay' && p.relayServer) {
      cmds.push('dhcp enable');
      cmds.push(`dhcp relay server-select ${p.relayServer}`);
    }
    if (p.mode === 'snooping') {
      cmds.push('dhcp enable');
      cmds.push('dhcp snooping enable');
    }
    if (p.trustInterfaces) {
      const ifaces = p.trustInterfaces.split(/[,\s]+/).filter(Boolean);
      ifaces.forEach((iface) => {
        cmds.push(`interface ${iface}`);
        cmds.push(' dhcp snooping trusted');
        cmds.push(' quit');
      });
    }
    // return
    return cmds.join('\n');
  }

  generateFwPolicyConfig(p: FwPolicyParams): string {
    const cmds: string[] = ['system-view'];
    const zones = p.zones.split(/[,\s]+/).filter(Boolean);
    zones.forEach((z) => {
      cmds.push(`firewall zone name ${z}`);
      cmds.push(` set priority ${10 + zones.indexOf(z) * 5}`);
      cmds.push(' quit');
    });
    p.rules.forEach((r) => {
      cmds.push(`security-policy`);
      cmds.push(` rule name policy_${r.ruleId}`);
      cmds.push(`  source-zone ${r.sourceZone}`);
      cmds.push(`  destination-zone ${r.destZone}`);
      cmds.push(`  source-address ${r.sourceIp}`);
      cmds.push(`  destination-address ${r.destIp}`);
      cmds.push(`  service ${r.protocol}${r.destPort ? ` destination-port ${r.destPort}` : ''}`);
      cmds.push(`  action ${r.action}`);
      if (r.description) cmds.push(`  description ${r.description}`);
      cmds.push(' quit');
    });
    // return
    return cmds.join('\n');
  }

  generateIfaceConfig(p: IfaceParams): string {
    const cmds: string[] = ['system-view'];
    cmds.push(`interface ${p.interfaceName}`);
    if (p.description) cmds.push(` description ${p.description}`);
    if (p.speed) cmds.push(` speed ${p.speed}`);
    if (p.duplex) cmds.push(` duplex ${p.duplex}`);
    if (p.mtu) cmds.push(` mtu ${p.mtu}`);
    if (p.ip && p.mask) cmds.push(` ip address ${p.ip} ${p.mask}`);
    if (p.secondaryIp && p.secondaryMask) cmds.push(` ip address ${p.secondaryIp} ${p.secondaryMask} sub`);
    cmds.push(' quit');
    // return
    return cmds.join('\n');
  }

  generatePortSecConfig(p: PortSecParams): string {
    const cmds: string[] = ['system-view'];
    cmds.push(`interface ${p.interfaceName}`);
    cmds.push(` port-security enable`);
    cmds.push(` port-security max-mac-num ${p.maxMac}`);
    const modeMap = { restrict: 'restrict', shutdown: 'shutdown', protect: 'protect' };
    cmds.push(` port-security protect-action ${modeMap[p.mode]}`);
    if (p.sticky) cmds.push(' port-security mac-address sticky');
    if (p.staticMacs) {
      const macs = p.staticMacs.split(/[,\s]+/).filter(Boolean);
      macs.forEach((m) => cmds.push(` port-security mac-address ${m} vlan 1`));
    }
    cmds.push(' quit');
    // return
    return cmds.join('\n');
  }

  generateSnmpConfig(p: SnmpParams): string {
    const cmds: string[] = ['system-view'];
    cmds.push('snmp-agent');
    if (p.version === 'v2c') {
      cmds.push(`snmp-agent community read ${p.community}`);
    } else {
      cmds.push(`snmp-agent sys-info version v3`);
      cmds.push(`snmp-agent group v3 ${p.community} read-view ViewDefault`);
    }
    if (p.location) cmds.push(`snmp-agent sys-info location ${p.location}`);
    if (p.contact) cmds.push(`snmp-agent sys-info contact ${p.contact}`);
    if (p.trapServer) cmds.push(`snmp-agent target-host trap address udp ${p.trapServer} params securityname ${p.community}`);
    // return
    return cmds.join('\n');
  }

  generateNtpConfig(p: NtpParams): string {
    const cmds: string[] = ['system-view'];
    cmds.push(`ntp-service unicast-server ${p.serverIp}`);
    if (p.sourceInterface) cmds.push(`ntp-service source-interface ${p.sourceInterface}`);
    // return
    return cmds.join('\n');
  }

  generateSyslogConfig(p: SyslogParams): string {
    const cmds: string[] = ['system-view'];
    cmds.push('info-center enable');
    cmds.push(`info-center loghost ${p.serverIp} facility ${p.facility || 'local0'} language english`);
    if (p.level) cmds.push(`info-center source default channel loghost log level ${p.level}`);
    // return
    return cmds.join('\n');
  }

  generateLldpConfig(p: LldpParams): string {
    const cmds: string[] = ['system-view'];
    if (p.enable) {
      cmds.push('lldp enable');
    } else {
      cmds.push('undo lldp enable');
    }
    // return
    return cmds.join('\n');
  }

  generateQinqConfig(p: QinqParams): string {
    const cmds: string[] = ['system-view'];
    cmds.push(`interface ${p.interfaceName}`);
    if (p.mode === 'basic') {
      cmds.push(' port link-type dot1q-tunnel');
      cmds.push(` port default vlan ${p.outerVlan}`);
    } else {
      const innerVlans = p.innerVlans.split(/[,\s]+/).filter(Boolean);
      cmds.push(' port link-type hybrid');
      cmds.push(' qinq vlan-translation enable');
      cmds.push(` port hybrid tagged vlan ${p.outerVlan}`);
      innerVlans.forEach((v) => {
        cmds.push(` port vlan-stacking vlan ${v} stack-vlan ${p.outerVlan}`);
      });
    }
    cmds.push(' quit');
    return cmds.join('\n');
  }
}
