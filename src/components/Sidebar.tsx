import { useState } from 'react';
import { useApp } from '../AppContext';
import type { ConfigType } from '../types';

interface MenuGroup {
  key: string;
  label: string;
  icon: string;
  items: { key: ConfigType; label: string; icon: string }[];
}

const extraMenu: MenuGroup[] = [
  {
    key: 'topo',
    label: '拓扑',
    icon: '🗺',
    items: [
      { key: 'topo', label: '网络拓扑', icon: '🗺' },
    ],
  },
];

const mainMenu: MenuGroup[] = [
  {
    key: 'switch',
    label: '交换机',
    icon: '🔧',
    items: [
      { key: 'quickcmd', label: '快速命令', icon: '⚡' },
      { key: 'stack', label: '堆叠', icon: '📶' },
      { key: 'vlan', label: 'VLAN / 端口', icon: '🔀' },
      { key: 'vlanif', label: 'VLAN 接口', icon: '🖧' },
      { key: 'linkagg', label: '链路聚合', icon: '🔗' },
      { key: 'stp', label: 'STP 生成树', icon: '🌳' },
      { key: 'vxlan', label: 'VXLAN', icon: '☁️' },
      { key: 'qinq', label: 'QINQ', icon: '🏷' },
      { key: 'vrrp', label: 'VRRP', icon: '🔁' },
      { key: 'dhcp', label: 'DHCP', icon: '🏠' },
      { key: 'routing', label: '路由协议', icon: '📡' },
      { key: 'acl', label: 'ACL 访问控制', icon: '🛡' },
      { key: 'qos', label: 'QoS 流策略', icon: '📊' },
      { key: 'portsec', label: '端口安全', icon: '🔒' },
      { key: 'iface', label: '接口配置', icon: '⚙️' },
      { key: 'snmp', label: 'SNMP', icon: '📈' },
      { key: 'ntp', label: 'NTP 时间', icon: '🕐' },
      { key: 'syslog', label: 'Syslog 日志', icon: '📋' },
      { key: 'lldp', label: 'LLDP', icon: '👁' },
      { key: 'aaa', label: 'AAA 认证', icon: '🔐' },
    ],
  },
  {
    key: 'router',
    label: '路由器',
    icon: '🌐',
    items: [
      { key: 'quickcmd', label: '快速命令', icon: '⚡' },
      { key: 'vrrp', label: 'VRRP', icon: '🔁' },
      { key: 'routing', label: '路由协议', icon: '📡' },
      { key: 'dhcp', label: 'DHCP', icon: '🏠' },
      { key: 'nat', label: 'NAT 地址转换', icon: '🔄' },
      { key: 'acl', label: 'ACL 访问控制', icon: '🛡' },
      { key: 'qos', label: 'QoS 流策略', icon: '📊' },
      { key: 'iface', label: '接口配置', icon: '⚙️' },
      { key: 'snmp', label: 'SNMP', icon: '📈' },
      { key: 'ntp', label: 'NTP 时间', icon: '🕐' },
      { key: 'syslog', label: 'Syslog 日志', icon: '📋' },
      { key: 'lldp', label: 'LLDP', icon: '👁' },
      { key: 'aaa', label: 'AAA 认证', icon: '🔐' },
    ],
  },
  {
    key: 'firewall',
    label: '防火墙',
    icon: '🛡',
    items: [
      { key: 'fwpolicy', label: '安全策略', icon: '🔥' },
      { key: 'acl', label: 'ACL 访问控制', icon: '🛡' },
      { key: 'nat', label: 'NAT 策略', icon: '🔄' },
      { key: 'aaa', label: 'AAA 认证', icon: '🔐' },
      { key: 'snmp', label: 'SNMP', icon: '📈' },
      { key: 'syslog', label: 'Syslog 日志', icon: '📋' },
    ],
  },
];

export default function Sidebar() {
  const { configType, setConfigType } = useApp();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    switch: true,
    router: false,
    firewall: false,
  });

  const toggle = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <nav className="w-48 bg-slate-100 shrink-0 flex flex-col overflow-y-auto">
      {[...mainMenu, ...extraMenu].map((group) => (
        <div key={group.key}>
          <button
            onClick={() => toggle(group.key)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors border-b border-slate-200"
          >
            <span className="text-xs w-3 text-center">
              {openGroups[group.key] ? '▼' : '▶'}
            </span>
            <span>{group.icon}</span>
            <span>{group.label}</span>
          </button>
          {openGroups[group.key] && (
            <div className="flex flex-col">
              {group.items.map((item) => (
                <button
                  key={`${group.key}-${item.key}`}
                  onClick={() => setConfigType(item.key)}
                  className={`text-left pl-8 pr-4 py-1.5 text-xs transition-colors border-l-3 ${
                    configType === item.key
                      ? 'bg-white border-blue-500 text-blue-700 font-medium'
                      : 'border-transparent text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span className="mr-1">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
