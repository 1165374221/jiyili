import type { VendorCommands } from './base';
import { cidrToMask } from './base';
import type { VlanParams, VlanifParams, AclParams, RoutingParams, LinkAggParams, StpParams, AaaParams, NatParams, QosParams, VxlanParams, StackParams, VrrpParams, DhcpParams, FwPolicyParams, IfaceParams, PortSecParams, SnmpParams, NtpParams, SyslogParams, LldpParams, QinqParams } from '../../../src/types';

export class RuijieCommands implements VendorCommands {
  name = '锐捷 Ruijie';
  portPrefix = 'GigabitEthernet 0/';

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
      cmds.push(' switchport mode trunk');
      cmds.push(` switchport trunk allowed vlan add ${p.vlanIds.join(',')}`);
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
      const ospfCmd = p.ospf.isV3 ? 'ipv6 router ospf' : 'router ospf';
      cmds.push(`${ospfCmd} ${p.ospf.processId}`);
      cmds.push(` router-id ${p.ospf.routerId}`);
      if (p.ospf.defaultOriginate) cmds.push(' default-information originate always');
      if (p.ospf.redistribute?.length) p.ospf.redistribute.forEach((r) => cmds.push(` redistribute ${r} subnets`));
      if (p.ospf.cost) cmds.push(` auto-cost reference-bandwidth ${p.ospf.cost}`);
      if (p.ospf.passiveInterfaces) cmds.push(' passive-interface default');
      if (p.ospf.authMode === 'md5') cmds.push(` area ${p.ospf.area} authentication message-digest`);
      p.ospf.networks.forEach((n) => cmds.push(` network ${n.network} ${n.wildcard} area ${n.area || p.ospf!.area}`));
      cmds.push(' exit');
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
    }

    cmds.push('end');
    return cmds.join('\n');
  }

  generateLinkAggConfig(p: LinkAggParams): string {
    const cmds: string[] = ['configure terminal'];
    const ports = p.ports.split(/[,\s]+/).filter(Boolean);

    cmds.push(`interface Port-channel ${p.groupId}`);
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

    const modeMap = { stp: 'stp', rstp: 'rstp', mstp: 'mstp' };
    cmds.push(`spanning-tree mode ${modeMap[p.mode]}`);

    if (p.rootBridge) {
      cmds.push('spanning-tree mst 0 root primary');
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
    }
    if (p.mode === 'snooping') cmds.push('ip dhcp snooping');
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
    cmds.push(' exit');
    cmds.push('end');
    return cmds.join('\n');
  }

  generateSnmpConfig(p: SnmpParams): string {
    const cmds: string[] = ['configure terminal'];
    cmds.push(`snmp-server community ${p.community} RO`);
    if (p.location) cmds.push(`snmp-server location ${p.location}`);
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
