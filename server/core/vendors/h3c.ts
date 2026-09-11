import type { VendorCommands } from './base';
import type { VlanParams, VlanifParams, AclParams, RoutingParams, LinkAggParams, StpParams, AaaParams, NatParams, QosParams, VxlanParams, StackParams, VrrpParams, DhcpParams, FwPolicyParams, IfaceParams, PortSecParams, SnmpParams, NtpParams, SyslogParams, LldpParams, QinqParams } from '../../../src/types';

export class H3cCommands implements VendorCommands {
  name = 'H3C 华三';
  portPrefix = 'GigabitEthernet1/0/';

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
        p.vlanIds.forEach((id) => cmds.push(` port hybrid vlan ${id} untagged`));
      } else if (p.portMode === 'trunk') {
        cmds.push(` port link-type trunk`);
        cmds.push(` port trunk permit vlan ${p.vlanIds.join(' ')}`);
      } else {
        cmds.push(` port link-type access`);
        cmds.push(` port access vlan ${p.vlanIds[0]}`);
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

    if (p.timeRange) {
      cmds.push(`time-range ${p.timeRange} 09:00 to 18:00 working-day`);
    }

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

    if (p.applyInterface) {
      cmds.push(`interface ${p.applyInterface}`);
      const dir = p.applyDirection === 'outbound' ? 'outbound' : 'inbound';
      const aclRef = p.aclType === 'named' ? `name ${p.aclName || 'MYACL'}` : `${p.aclNumber}`;
      cmds.push(` packet-filter ${aclRef} ${dir}`);
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
        // 【本次新加的整条分支】。在此之前 H3C 根本没有 v3 分支：界面上勾了
        // 「OSPFv3」，这里照样出 `ospf <pid>`，用户拿到一份 OSPFv2 配置，
        // 而且没有任何提示 —— 这是本次三个 bug 里最隐蔽的一个。
        // Comware 的 v3 与华为 VRP 同构：进程视图起 ospfv3，接口视图挂区域。
        cmds.push(`ospfv3 ${pid} router-id ${p.ospf.routerId}`);
        if (p.ospf.defaultOriginate) cmds.push(' default-route-advertise always');
        if (p.ospf.redistribute?.length) p.ospf.redistribute.forEach((r) => cmds.push(` import-route ${r}`));
        if (p.ospf.cost) cmds.push(` default cost ${p.ospf.cost}`);
        if (p.ospf.passiveInterfaces) {
          p.ospf.passiveInterfaces.split(/[,\s]+/).filter(Boolean).forEach((i) => cmds.push(` silent-interface ${i}`));
        }
        cmds.push(' quit');

        p.ospf.networks.forEach((n) => {
          // 只认 iface，不拿 network 兜底（network 是网络地址，不是接口名）。
          const iface = n.iface;
          if (!iface) return;
          cmds.push(`interface ${iface}`);
          cmds.push(` ospfv3 ${pid} area ${n.area || p.ospf!.area}`);
          cmds.push(' quit');
        });
      } else {
        // v2 分支本次未改动（原因同 huawei.ts：network-type 的视图归属没把握）。
        cmds.push(`ospf ${pid} router-id ${p.ospf.routerId}`);
        if (p.ospf.defaultOriginate) cmds.push(' default-route-advertise always');
        if (p.ospf.redistribute?.length) p.ospf.redistribute.forEach((r) => cmds.push(` import-route ${r}`));
        if (p.ospf.networkType) cmds.push(` network-type ${p.ospf.networkType}`);
        if (p.ospf.cost) cmds.push(` default cost ${p.ospf.cost}`);
        if (p.ospf.passiveInterfaces) {
          p.ospf.passiveInterfaces.split(/[,\s]+/).filter(Boolean).forEach((iface) => cmds.push(` silent-interface ${iface}`));
        }
        cmds.push(` area ${p.ospf.area}`);
        if (p.ospf.authMode === 'simple') cmds.push(`  authentication-mode simple cipher ${p.ospf.authKey || '123'}`);
        else if (p.ospf.authMode === 'md5') cmds.push(`  authentication-mode md5 1 cipher ${p.ospf.authKey || '123'}`);
        p.ospf.networks.forEach((n) => cmds.push(`  network ${n.network} ${n.wildcard}`));
        cmds.push(' quit');
      }
    }

    if (p.bgp) {
      cmds.push(`bgp ${p.bgp.asNumber}`);
      cmds.push(` router-id ${p.bgp.routerId}`);
      p.bgp.neighbors.forEach((n) => cmds.push(` peer ${n.ip} as-number ${n.remoteAs}`));
      p.bgp.networks.forEach((nw) => cmds.push(` network ${nw.network} ${nw.mask}`));
      cmds.push(' quit');
    }

    if (p.rip) {
      cmds.push('rip 1');
      cmds.push(` version ${p.rip.version}`);
      p.rip.networks.forEach((n) => cmds.push(` network ${n}`));
      if (p.rip.defaultOriginate) cmds.push(' default-route originate');
      if (p.rip.redistribute?.length) p.rip.redistribute.forEach((r) => cmds.push(` import-route ${r}`));
      if (p.rip.passiveInterfaces) p.rip.passiveInterfaces.split(/[,\s]+/).filter(Boolean).forEach((iface) => cmds.push(` silent-interface ${iface}`));
      // ⚠️⚠️ 已知缺陷：下面两行放在 rip 进程视图里是【错的】，真机会拒绝执行。
      // 详见根目录 KNOWN-ISSUES.md 第 1 条。这里保留错误实现是【有意】的决策
      // （2026-09-11 用户选择「先记为已知问题，本轮先交付」），不是漏改。
      //
      // 正确形态是【接口视图 + rip 前缀】：
      //   interface Vlan-interface10
      //    rip authentication-mode md5 rfc2453 plain <密码>      ← 按 Comware V7
      //    rip authentication-mode simple plain <密码>
      // 依据：把 V7 命令参考里全部 39 条 RIP 视图命令、V5 的 35 条逐条枚举过，
      // 【两个版本都没有任何认证命令存在于 RIP 视图】。所以这行不是「写法过时」，
      // 是「视图就不对」，交换机只会报未知命令。
      //
      // 此注释上一版写的是「Comware 的 RIP 认证在 rip 进程视图里，是全局的
      // （和华为同一套写法）」—— 两半都是错的，是我照着华为那份同样有问题的
      // 实现抄的。教训：探针当时只检查「命令里出现了某个 needle」，而 needle
      // 对「视图放错了」这类错误完全无感。present ≠ valid。
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

    cmds.push(`interface Bridge-Aggregation ${p.groupId}`);
    cmds.push(` link-aggregation mode ${p.mode === 'lacp' ? 'dynamic' : 'static'}`);
    if (p.loadBalance) cmds.push(` link-aggregation load-sharing mode ${p.loadBalance}`);
    cmds.push(' quit');

    ports.forEach((pt) => {
      const iface = this.portFormat(pt);
      cmds.push(`interface ${iface}`);
      cmds.push(` port link-aggregation group ${p.groupId}`);
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
        cmds.push(' stp edged-port');
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

    if (p.authMode === 'radius' && p.radiusServer) {
      cmds.push(`radius scheme default`);
      if (p.radiusKey) cmds.push(` key authentication cipher ${p.radiusKey}`);
      cmds.push(` primary authentication ${p.radiusServer}`);
      cmds.push(' quit');
    }

    if (p.authMode === 'tacacs+' && p.tacacsServer) {
      cmds.push(`hwtacacs scheme default`);
      if (p.tacacsKey) cmds.push(` key authentication cipher ${p.tacacsKey}`);
      cmds.push(` primary authentication ${p.tacacsServer}`);
      cmds.push(' quit');
    }

    p.localUsers.forEach((u) => {
      cmds.push(`local-user ${u.username} password cipher ${u.password}`);
      const role = u.privilege >= 15 ? 'network-admin' : `level-${u.privilege}`;
      cmds.push(`local-user ${u.username} authorization-attribute user-role ${role}`);
      cmds.push(`local-user ${u.username} service-type ${u.serviceTypes.join(' ')}`);
    });

    if (p.enableTelnet) {
      cmds.push('user-interface vty 0 4');
      cmds.push(' authentication-mode scheme');
      cmds.push(' protocol inbound all');
      cmds.push(' quit');
    }

    if (p.enableSsh) {
      cmds.push('ssh server enable');
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

    cmds.push(`traffic policy ${p.policyName}`);
    p.policyRules.forEach((pr) => {
      cmds.push(` classifier ${pr.classifierName} behavior ${pr.behaviorName}`);
    });
    cmds.push(' quit');

    if (p.applyInterface) {
      cmds.push(`interface ${p.applyInterface}`);
      cmds.push(` traffic-policy ${p.policyName} ${p.applyDirection}`);
      cmds.push(' quit');
    }

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

    cmds.push(`interface Nve${p.nveId}`);
    cmds.push(` source ${p.sourceIp}`);
    cmds.push(' quit');

    p.vnis.forEach((v) => {
      const peers = v.peerIps.split(/[,\s]+/).filter(Boolean);
      cmds.push(`vxlan tunnel ${v.vniId}`);
      cmds.push(` source ${p.sourceIp}`);
      peers.forEach((peer) => {
        cmds.push(` destination ${peer}`);
      });
      cmds.push(' quit');
    });

    // return
    return cmds.join('\n');
  }

  generateStackConfig(p: StackParams): string {
    const cmds: string[] = ['system-view'];

    p.members.forEach((m) => {
      cmds.push(`irf member ${m.memberId} priority ${m.priority}`);
      if (m.domainId) cmds.push(`irf member ${m.memberId} domain ${m.domainId}`);
    });

    p.stackPorts.forEach((sp) => {
      const ifaces = sp.interfaces.split(/[,\s]+/).filter(Boolean);
      cmds.push(`interface irf-port ${sp.portId}`);
      ifaces.forEach((iface) => {
        cmds.push(` port group interface ${iface}`);
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
    cmds.push(' quit');
    // return
    return cmds.join('\n');
  }

  generateDhcpConfig(p: DhcpParams): string {
    const cmds: string[] = ['system-view'];
    if (p.mode === 'server' && p.poolName && p.network) {
      cmds.push('dhcp enable');
      cmds.push(`dhcp server ip-pool ${p.poolName}`);
      cmds.push(` gateway-list ${p.gateway || p.network}`);
      cmds.push(` network ${p.network} mask ${p.mask || 24}`);
      if (p.dnsServers) cmds.push(` dns-list ${p.dnsServers}`);
      cmds.push(' quit');
    } else if (p.mode === 'relay' && p.relayServer) {
      cmds.push('dhcp enable');
      cmds.push(`dhcp relay server-address ${p.relayServer}`);
    }
    if (p.mode === 'snooping') {
      cmds.push('dhcp snooping enable');
    }
    if (p.trustInterfaces) {
      const ifaces = p.trustInterfaces.split(/[,\s]+/).filter(Boolean);
      ifaces.forEach((iface) => {
        cmds.push(`interface ${iface}`);
        cmds.push(' dhcp snooping trust');
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
      cmds.push(`security-zone name ${z}`);
      cmds.push(` priority ${10 + zones.indexOf(z) * 5}`);
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
    cmds.push(' port-security enable');
    cmds.push(` port-security max-mac-num ${p.maxMac}`);
    const modeMap = { restrict: 'restrict', shutdown: 'shutdown', protect: 'protect' };
    cmds.push(` port-security violation ${modeMap[p.mode]}`);
    if (p.sticky) cmds.push(' port-security mac-address sticky');
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
      cmds.push('snmp-agent sys-info version v3');
    }
    if (p.location) cmds.push(`snmp-agent sys-info location ${p.location}`);
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
    cmds.push(`info-center loghost ${p.serverIp} facility ${p.facility || 'local0'}`);
    // return
    return cmds.join('\n');
  }

  generateLldpConfig(p: LldpParams): string {
    const cmds: string[] = ['system-view'];
    cmds.push(p.enable ? 'lldp enable' : 'undo lldp enable');
    // return
    return cmds.join('\n');
  }

  generateQinqConfig(p: QinqParams): string {
    const cmds: string[] = ['system-view'];
    cmds.push(`interface ${p.interfaceName}`);
    cmds.push(' qinq enable');
    if (p.mode === 'selective') {
      const innerVlans = p.innerVlans.split(/[,\s]+/).filter(Boolean);
      innerVlans.forEach((v) => {
        cmds.push(` qinq transparent-vlan ${v}`);
      });
    }
    cmds.push(` qinq vid ${p.outerVlan}`);
    cmds.push(' quit');
    return cmds.join('\n');
  }
}
