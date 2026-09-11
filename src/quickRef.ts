// 「快速命令」对外展示的语法参考。
//
// 单独抽成一个模块，是因为它有两个互相对齐的消费方：
//   1. QuickCmdForm 用它渲染示例按钮和可展开的完整语法表；
//   2. tests/golden.ts 把它喂给 parseAndGenerate，断言【每一条对外宣传的
//      写法都真的能被解析】。
//
// 以前这份清单是硬编码在 parser.ts 的「无法识别」帮助文本里的，和实际能解析
// 的语法没有任何机制保证一致 —— 结果就是帮助文本里的 2 条写法一直是坏的
// （`端口安全` 永远匹配不上、`全双工` 静默丢参数），宣传了很久没人发现。
// 现在靠 golden 断言把「宣传」和「能跑」焊死：改坏了就红。

export interface QuickSyntax {
  /** 语法表里那一行的中文说明 */
  label: string;
  /**
   * 这条语法的等价写法。第一条同时被用作示例按钮。
   * 全部写法都会被 golden 断言「必须能解析出命令」。
   */
  variants: string[];
}

export const QUICK_SYNTAX: QuickSyntax[] = [
  { label: 'VLAN 加端口', variants: ['vlan 100 port 1-10 access', 'vlan 100 端口 1-10 接入'] },
  { label: 'VLAN 接口地址', variants: ['vlanif 100 地址 192.168.1.1/24'] },
  { label: 'VRRP', variants: ['vrrp 1 vip 10.0.0.1 优先级 120 接口 Vlanif100'] },
  { label: 'DHCP 服务器', variants: ['dhcp 服务器 pool vlan100 192.168.1.0/24 网关 192.168.1.1'] },
  { label: 'ACL', variants: ['acl 3000 deny tcp 192.168.1.0/24 端口 80'] },
  { label: '静态路由 / 黑洞路由', variants: ['静态路由 10.0.0.0/8 到 192.168.1.1', '黑洞 10.0.0.0/8'] },
  { label: 'OSPF', variants: ['ospf 1 rid 1.1.1.1 area 0 net 192.168.1.0/24'] },
  { label: 'NAT 端口映射', variants: ['nat 映射 tcp 80 192.168.1.100 80'] },
  { label: '生成树 / 链路聚合', variants: ['stp rstp 根桥', '聚合 Eth-Trunk1 端口 1 2 3'] },
  { label: '接口属性', variants: ['接口 G0/0/1 速率 1000 全双工 描述 myport'] },
  { label: '端口安全', variants: ['端口安全 G0/0/1 最大 3 粘贴'] },
  { label: 'SNMP / NTP / 日志', variants: ['snmp community public', 'ntp 10.0.0.1', '日志 10.0.0.100'] },
  { label: 'LLDP 邻居', variants: ['邻居 开启', '邻居 关闭'] },
];

/** 示例按钮：每条语法取第一条写法。 */
export const QUICK_EXAMPLES: string[] = QUICK_SYNTAX.map((s) => s.variants[0]);

/** 展开后的全部写法，供 golden 断言。 */
export const QUICK_ALL_VARIANTS: string[] = QUICK_SYNTAX.flatMap((s) => s.variants);
