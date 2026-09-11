// 服务端命令生成核心。
//
// 这个文件是 src/App.tsx 里聚合逻辑的服务端等价物。搬过来的唯一目的是让
// src/vendors/**（2127 行厂商 CLI 知识）+ src/parser.ts 不再随前端 bundle
// 发到客户机器上——客户按 F12 就能读走的东西，现在留在 Node 进程里。
//
// 与原实现的【有意差异】只有一处：厂商由入参显式指定，不再靠命令字符串
// 猜（原 App.tsx:39 的 detectVendor）。这是 bug #3 的修复，会改变个别
// composite 用例的输出，已在 tests/golden.baseline.json 里逐条标注。
import type { Vendor } from '../../src/types';
import { DEVICE_MODELS } from '../../src/types';
import type { VendorCommands } from './vendors/base';
import { CiscoCommands } from './vendors/cisco';
import { H3cCommands } from './vendors/h3c';
import { HuaweiCommands } from './vendors/huawei';
import { RuijieCommands } from './vendors/ruijie';
import { parseAndGenerate } from './parser';

const VENDOR_CLASSES: Record<Vendor, new () => VendorCommands> = {
  huawei: HuaweiCommands,
  h3c: H3cCommands,
  cisco: CiscoCommands,
  ruijie: RuijieCommands,
};

export const VENDORS = Object.keys(VENDOR_CLASSES) as Vendor[];

export function isVendor(x: unknown): x is Vendor {
  return typeof x === 'string' && Object.hasOwn(VENDOR_CLASSES, x);
}

/**
 * 把型号 id 解析成端口前缀。
 *
 * 返回 null 表示「这个型号 id 在当前厂商下不存在」——调用方此时【不要】调
 * setPortPrefix，让厂商类保留自己的初始前缀。这不是随手兜底：初始前缀与
 * DEVICE_MODELS[vendor][0].ports 目前四家全都相等，所以不调用 == 修复前的
 * 行为，逐字节一致。于是型号非法时退化成旧行为，而不是报错或产出半成品。
 *
 * 型号表是白名单，客户端不能直传 portPrefix（否则可注入任意前缀）。
 */
export function resolvePortPrefix(vendor: Vendor, modelId: unknown): string | null {
  if (typeof modelId !== 'string') return null;
  const models = DEVICE_MODELS[vendor];
  if (!models) return null;
  const m = models.find((x) => x.id === modelId);
  return m ? m.ports : null;
}

/** 一个待生成的配置段。payload 在 quickcmd 时是原始文本，其余是表单参数对象。 */
export interface GenerateBlock {
  type: string;
  payload: unknown;
}

export interface GenerateResult {
  command: string;
  /** 真正产出了命令的段，按入参顺序。前端「已配置」那行直接用这个，不必自己再算。 */
  applied: string[];
}

// 21 个方法的参数类型各不相同，没法用一张表精确表达，所以这里用 any。
// 参数来自 JSON，边界上本就是 unknown，用 any 不假装比实际知道得更多。
type Generator = (v: VendorCommands, p: any) => string;

// 21 种配置类型 → 厂商类方法。quickcmd 不在这张表里，它走 parser。
const GENERATORS: Record<string, Generator> = {
  vlan: (v, p) => v.generateVlanConfig(p),
  vlanif: (v, p) => v.generateVlanifConfig(p),
  acl: (v, p) => v.generateAclConfig(p),
  routing: (v, p) => v.generateRoutingConfig(p),
  linkagg: (v, p) => v.generateLinkAggConfig(p),
  stp: (v, p) => v.generateStpConfig(p),
  aaa: (v, p) => v.generateAaaConfig(p),
  nat: (v, p) => v.generateNatConfig(p),
  qos: (v, p) => v.generateQosConfig(p),
  vxlan: (v, p) => v.generateVxlanConfig(p),
  stack: (v, p) => v.generateStackConfig(p),
  vrrp: (v, p) => v.generateVrrpConfig(p),
  dhcp: (v, p) => v.generateDhcpConfig(p),
  fwpolicy: (v, p) => v.generateFwPolicyConfig(p),
  iface: (v, p) => v.generateIfaceConfig(p),
  portsec: (v, p) => v.generatePortSecConfig(p),
  snmp: (v, p) => v.generateSnmpConfig(p),
  ntp: (v, p) => v.generateNtpConfig(p),
  syslog: (v, p) => v.generateSyslogConfig(p),
  lldp: (v, p) => v.generateLldpConfig(p),
  qinq: (v, p) => v.generateQinqConfig(p),
};

export const CONFIG_TYPES = Object.keys(GENERATORS);

// 逐字照抄 src/App.tsx:31-37。不要"顺手修好"：
//  h3c/huawei 的段尾是 ' quit'，不是 'end'，所以这里吃不掉它，
//  quit 会留在段内、end 提到最外层——这是现有输出的一部分。
function stripWrapper(cmd: string): string {
  let lines = cmd.split('\n');
  if (lines[0] === 'system-view' || lines[0] === 'configure terminal') lines = lines.slice(1);
  const last = lines[lines.length - 1];
  if (last === 'end') lines = lines.slice(0, -1);
  return lines.join('\n').trim();
}

/**
 * 聚合多个配置段成一份可下发脚本。
 *
 * blocks 的顺序有意义，且必须由客户端按「用户首次触碰各表单的顺序」给出——
 * 原实现用 bag 对象的插入序，而给已有 key 重新赋值不会改变其位置。
 *
 * 每请求 new 一个厂商实例：portPrefix 是实例状态，复用会让一个请求的型号
 * 影响另一个请求。
 */
export function generateAll(
  vendor: Vendor,
  modelId: unknown,
  blocks: GenerateBlock[],
): GenerateResult {
  const Ctor = VENDOR_CLASSES[vendor];
  if (!Ctor) throw new Error(`未知厂商：${String(vendor)}`);

  const v = new Ctor();
  const prefix = resolvePortPrefix(vendor, modelId);
  if (prefix !== null) v.setPortPrefix(prefix);

  const applied: string[] = [];
  const bodies: string[] = [];

  for (const b of blocks) {
    const raw = b.type === 'quickcmd'
      ? parseAndGenerate(typeof b.payload === 'string' ? b.payload : '', v)
      : generateOne(v, b);
    // 与原实现一致：空命令不计入「已配置」，也不进正文。
    if (!raw) continue;
    applied.push(b.type);
    bodies.push(stripWrapper(raw));
  }

  if (bodies.length === 0) return { command: '', applied: [] };

  // exit 对 h3c/huawei 是 ''、对 cisco/ruijie 才是 'end'——原样保留这个不对称。
  const hw = vendor === 'huawei' || vendor === 'h3c';
  const enter = hw ? 'system-view' : 'configure terminal';
  const exit = hw ? '' : 'end';

  return {
    command: enter + '\n' + bodies.join('\n') + (exit ? '\n' + exit : ''),
    applied,
  };
}

function generateOne(v: VendorCommands, b: GenerateBlock): string {
  const gen = GENERATORS[b.type];
  if (!gen) throw new Error(`未知配置类型：${String(b.type)}`);
  return gen(v, b.payload);
}
