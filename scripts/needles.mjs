// 标志性命令模板清单 —— 交付前泄漏扫描的判据。
//
// 单独成文件是为了让【两个】扫描点共用同一份清单，不会各自漂移：
//   1. scripts/scan-core.mjs      扫 server/core/index.cjs（混淆产物）
//   2. scripts/stage-release.mjs  扫 release/ 里的 dist/**/*.js（前端 bundle）
//
// 第 2 条才是整个改造的验收点：厂商逻辑搬走之后，前端 bundle 里【必须】再也
// 找不到这些模板。只有第 1 条等于只验了「搬过去的那份是加密的」，
// 没验「原来那份已经不在了」—— 而后者才是「客户 F12 读不到源码」的真正含义。
//
// 这些串全是 ASCII，所以按 UTF-8 和 UTF-16LE 两种编码找。
//
// ⚠️ 选词标准：必须是【只有命令生成逻辑才会产出】的串。
//
// 曾经把 'GigabitEthernet0/0/' 放进这个清单，它在重建后的前端 bundle 里报了
// 1/8 泄漏。逐处查过那 18 次出现，全部是界面本身合法需要的：
//   - DEVICE_MODELS 里各型号的 ports 字段（型号选择器要显示、要按它取前缀）——
//     这是计划里【有意】让前后端共享的单一事实源；
//   - 表单 placeholder（如 `如 GigabitEthernet0/0/1`）；
//   - 表单默认参数值（interfaceName 等）。
// 也就是说它是【接口名格式】，是公开常识，任何让用户填接口名的界面都会有，
// 不是被保护的资产。把它留在清单里只有两个后果：要么交付被误拦，
// 要么有人为了让门禁变绿去删掉一条真检查。所以换成下面这些真模板。
export const NEEDLES = [
  // 四家的入口视图
  'system-view',                 // 华为 / H3C
  'configure terminal',          // 思科 / 锐捷
  // 二层与隧道
  'switchport mode dot1q-tunnel',
  'port link-type',              // 华为 / H3C（access/trunk/hybrid）
  'switchport access vlan',      // 思科 / 锐捷
  // 生成树
  'stp region-configuration',
  'stp edged-port',              // 华为 / H3C
  // 接口批量与地址
  'interface range',             // 思科 / 锐捷
  'ip address',
  // 路由：静默接口两家写法不同，正好各钉一个
  'silent-interface',            // 华为 / H3C
  'passive-interface',           // 思科 / 锐捷
  'ip route-static',             // 华为 / H3C 静态路由
  'ip ospf network',             // 思科 / 锐捷（本轮新加的接口级网络类型）
  // 接入安全
  'port-security',
];
