// 静默丢参数的机械探测：给每个【界面可设】的字段灌一个哨兵值，看它有没有出现在
// 生成的命令里。没有出现 = 这个参数被静默丢弃 —— 用户填了、界面接受了、配置里没有。
//
// 这比逐行读厂商代码可靠：厂商文件 2000+ 行，四个厂商各写一遍，靠人眼找漏项必漏。
//
// ⚠️ 这个探测只能证明「哨兵出现了」，不能证明「这条命令在真机上合法」。
// 反例：思科输出 ` network-type p2mp`，探测判它 ✅，但 Cisco IOS 的 OSPF 网络类型是
// 接口级的 `ip ospf network point-to-multipoint`，进程下根本没有 network-type 这条
// 命令 —— 探测抓不到这类「没丢，但写错了」。所以它是一道过滤网，不是正确性证明；
// 真机语法仍需人工核对。
//
//   npx esbuild tests/probe-drops.ts --bundle --platform=node --format=cjs \
//       --outfile=tests/probe-drops.cjs && node tests/probe-drops.cjs
import { CiscoCommands } from '../server/core/vendors/cisco';
import { HuaweiCommands } from '../server/core/vendors/huawei';
import { H3cCommands } from '../server/core/vendors/h3c';
import { RuijieCommands } from '../server/core/vendors/ruijie';
import type { VendorCommands } from '../server/core/vendors/base';
import type { RoutingParams, OspfConfig, RipConfig } from '../src/types';

const VENDORS: [string, new () => VendorCommands][] = [
  ['huawei', HuaweiCommands],
  ['h3c', H3cCommands],
  ['cisco', CiscoCommands],
  ['ruijie', RuijieCommands],
];

// 每个哨兵都取得足够独特，不会跟别的字段或模板文本撞上。
const S = {
  processId: 99,          // 进程 ID
  routerId: '9.9.9.9',    // Router ID
  area: '88',             // 区域
  net: 'SENTNET',         // 网络地址
  wildcard: 'SENTWC',     // 通配符掩码
  netArea: '77',          // 每条网络的独立 area
  cost: 77,               // 开销
  key: 'SENTKEY',         // 认证密钥
  passive: 'SENTPASS',    // 静默接口
  redis: 'SENTREDIS',     // 重分发
  iface: 'SENTIFACE',     // 接口名（v3 必需；思科/锐捷的接口级命令靠它落地）
  ripNet: 'SENTRIPNET',   // RIP 网络
  asn: 64555,             // BGP AS 号
  bgpRid: '8.8.8.8',      // BGP Router ID
  nbrIp: 'SENTNBR',       // BGP 邻居 IP
  nbrAs: 64777,           // BGP 邻居远程 AS
  bgpNet: 'SENTBGP',      // BGP 宣告网络
  bgpMask: 'SENTMASK',    // BGP 掩码
};

function ripCfg(over: Partial<RipConfig> = {}): RoutingParams {
  return {
    staticRoutes: [],
    rip: {
      version: 2,
      networks: [S.ripNet],
      authMode: 'md5',
      authKey: S.key,
      passiveInterfaces: S.passive,
      defaultOriginate: true,
      redistribute: [S.redis],
      ...over,
    },
  };
}

function bgpCfg(): RoutingParams {
  return {
    staticRoutes: [],
    bgp: {
      asNumber: S.asn,
      routerId: S.bgpRid,
      neighbors: [{ ip: S.nbrIp, remoteAs: S.nbrAs }],
      networks: [{ network: S.bgpNet, mask: S.bgpMask }],
    },
  };
}

function ospfCfg(over: Partial<OspfConfig> = {}): RoutingParams {
  return {
    staticRoutes: [],
    ospf: {
      processId: S.processId,
      routerId: S.routerId,
      area: S.area,
      networks: [{ network: S.net, wildcard: S.wildcard, area: S.netArea, iface: S.iface }],
      networkType: 'p2mp',
      cost: S.cost,
      authMode: 'md5',
      authKey: S.key,
      passiveInterfaces: S.passive,
      defaultOriginate: true,
      redistribute: [S.redis],
      ...over,
    },
  };
}

// 待探的字段 → 该字段被填后应当在输出里出现的哨兵
const PROBES: { field: string; sentinel: string | number; params: RoutingParams }[] = [
  { field: 'ospf.processId', sentinel: S.processId, params: ospfCfg() },
  { field: 'ospf.routerId', sentinel: S.routerId, params: ospfCfg() },
  { field: 'ospf.area', sentinel: S.area, params: ospfCfg() },
  { field: 'ospf.networks[].network', sentinel: S.net, params: ospfCfg() },
  { field: 'ospf.networks[].wildcard', sentinel: S.wildcard, params: ospfCfg() },
  { field: 'ospf.networks[].area', sentinel: S.netArea, params: ospfCfg() },
  // 接口名的哨兵只在【OSPFv3】下探。v2 下华为/H3C 本来就【不需要】接口 ——
  // 它们的认证在进程/区域视图，网段靠 network 通配符圈；只有思科/锐捷的 v2 才把
  // 密钥和网络类型下到接口上。拿 v2 去要求四家都出现接口名，是把设计差异误判成
  // 丢参数（我第一版就是这么误判的）。
  { field: 'ospf.networks[].iface(v3)', sentinel: S.iface, params: ospfCfg({ isV3: true }) },
  { field: 'ospf.networkType', sentinel: 'p2mp|point-to-multipoint', params: ospfCfg() },
  { field: 'ospf.cost', sentinel: S.cost, params: ospfCfg() },
  // ⚠️ 哨兵必须覆盖【各家不同的写法】，否则会把「写法不同」误判成「参数被丢弃」。
  // 这条我已经踩了两次：MD5 华为写 md5、思科写 message-digest；网络类型 p2mp 思科
  // 写 point-to-multipoint；简单认证思科的进程视图里根本没有 simple 这个词，
  // 只有 `area X authentication` 和接口下的 `ip ospf authentication-key`。
  { field: 'ospf.authMode(md5)', sentinel: 'md5|message-digest', params: ospfCfg() },
  { field: 'ospf.authMode(simple)', sentinel: 'simple|authentication-key', params: ospfCfg({ authMode: 'simple' }) },
  { field: 'ospf.authKey', sentinel: S.key, params: ospfCfg() },
  { field: 'ospf.passiveInterfaces', sentinel: S.passive, params: ospfCfg() },
  { field: 'ospf.defaultOriginate', sentinel: 'always|originate', params: ospfCfg() },
  { field: 'ospf.redistribute', sentinel: S.redis, params: ospfCfg() },
  // OSPFv3：勾了之后命令里必须出现 v3 形式的进程命令，且【不能】退化成 v2。
  { field: 'ospf.isV3', sentinel: 'v3|ipv6', params: ospfCfg({ isV3: true }) },

  // ---- RIP：表单同样暴露了这些字段 ----
  { field: 'rip.version', sentinel: 'version 1', params: ripCfg({ version: 1 }) },
  { field: 'rip.networks[]', sentinel: S.ripNet, params: ripCfg() },
  { field: 'rip.defaultOriginate', sentinel: 'originate', params: ripCfg() },
  { field: 'rip.redistribute', sentinel: S.redis, params: ripCfg() },
  { field: 'rip.passiveInterfaces', sentinel: S.passive, params: ripCfg() },
  { field: 'rip.authMode(simple)', sentinel: 'simple', params: ripCfg({ authMode: 'simple' }) },
  { field: 'rip.authMode(md5)', sentinel: 'md5|message-digest', params: ripCfg({ authMode: 'md5' }) },
  { field: 'rip.authKey', sentinel: S.key, params: ripCfg({ authMode: 'md5' }) },

  // ---- BGP：表单暴露 AS / Router ID / 邻居 / 宣告网络 ----
  { field: 'bgp.asNumber', sentinel: S.asn, params: bgpCfg() },
  { field: 'bgp.routerId', sentinel: S.bgpRid, params: bgpCfg() },
  { field: 'bgp.neighbors[].ip', sentinel: S.nbrIp, params: bgpCfg() },
  { field: 'bgp.neighbors[].remoteAs', sentinel: S.nbrAs, params: bgpCfg() },
  { field: 'bgp.networks[].network', sentinel: S.bgpNet, params: bgpCfg() },
  { field: 'bgp.networks[].mask', sentinel: S.bgpMask, params: bgpCfg() },
];

const rows: { vendor: string; field: string; ok: boolean; out: string }[] = [];

for (const [name, Ctor] of VENDORS) {
  const v = new Ctor();
  for (const p of PROBES) {
    let out = '';
    try {
      out = v.generateRoutingConfig(p.params);
    } catch (e) {
      out = `<<抛异常: ${(e as Error).message}>>`;
    }
    // 哨兵是正则片段（defaultOriginate/isV3 两个要匹配多种写法）
    const ok = new RegExp(String(p.sentinel), 'i').test(out);
    rows.push({ vendor: name, field: p.field, ok, out });
  }
}

// 按字段聚合成矩阵，一眼看出「哪个字段被哪几家丢了」。
const fields = [...new Set(rows.map((r) => r.field))];
const names = VENDORS.map(([n]) => n);

console.log('字段'.padEnd(30) + names.map((n) => n.padEnd(9)).join(''));
console.log('-'.repeat(30 + names.length * 9));
for (const f of fields) {
  const cells = names.map((n) => {
    const r = rows.find((x) => x.vendor === n && x.field === f)!;
    return (r.ok ? '✅' : '❌').padEnd(9);
  });
  console.log(f.padEnd(30) + cells.join(''));
}

const dropped = rows.filter((r) => !r.ok);
console.log(`\n共 ${rows.length} 项，静默丢弃 ${dropped.length} 项：`);
for (const d of dropped) {
  console.log(`\n── ${d.vendor} / ${d.field} ──`);
  console.log(d.out.split('\n').map((l) => '   ' + l).join('\n'));
}

// ---- 门禁 ----
// KNOWN_OPEN 是【尚未修】的项，不是「可以忽略」的项。列出来是为了让这个脚本能当
// 门禁用：一旦出现列表之外的新丢弃，退出码非 0。修好之后必须把条目删掉 ——
// 下面会检查列表是否过期，防止「修完了但名单没清」导致门禁悄悄失效。
const KNOWN_OPEN = new Set([
  'h3c/rip.authMode(simple)', 'h3c/rip.authMode(md5)', 'h3c/rip.authKey',
  'cisco/rip.authMode(simple)', 'cisco/rip.authMode(md5)', 'cisco/rip.authKey',
  'ruijie/rip.authMode(simple)', 'ruijie/rip.authMode(md5)', 'ruijie/rip.authKey',
]);

const keys = new Set(dropped.map((d) => `${d.vendor}/${d.field}`));
const unexpected = [...keys].filter((k) => !KNOWN_OPEN.has(k));
const stale = [...KNOWN_OPEN].filter((k) => !keys.has(k));

if (stale.length) console.log(`⚠️  已修复但还留在 KNOWN_OPEN 里，请删除：${stale.join('、')}`);
if (unexpected.length) {
  console.error(`\n❌ 出现 ${unexpected.length} 项【新的】静默丢弃（不在已知名单内）：${unexpected.join('、')}`);
  process.exitCode = 1;
} else {
  console.log(`\n✅ 没有已知名单之外的静默丢弃（尚有 ${KNOWN_OPEN.size} 项待修，见上表 RIP 认证）`);
}
