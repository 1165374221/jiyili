// 全角字符 / 不可见字符归一化。
//
// 起因是一个真实故障：中文输入法在「中文标点」模式下，敲 `-` 出来的是全角
// `－`(U+FF0D)，敲字母数字也可能是全角。这些字符肉眼几乎看不出差别，但：
//
//   1. parser 的正则用的是半角字符类（[\d,\s\-] 之类），全角一律匹配不上，
//      于是「手动输入提示无法识别，复制粘贴却正常」——因为粘贴保留半角。
//   2. 更危险的是表单里的自由文本（IP、端口列表、ACL 网段）会被【原样】拼进
//      命令，再经「下发命令」推到现场交换机上——等于往生产设备写坏配置。
//
// 所以归一化放在 generateAll 入口、对 params 递归做一遍，而不是只修 parser：
// 前者一处覆盖全部 23 个表单 + 快速命令，后者只盖住快速命令。
//
// 只转换全角 ASCII 形近区（U+FF01–U+FF5E）与全角空格。汉字从 U+4E00 起，
// 不在该区间内，所以中文描述、中文参数不会被改动。

const FULLWIDTH_MIN = 0xff01;
const FULLWIDTH_MAX = 0xff5e;
const FULLWIDTH_OFFSET = 0xfee0;
const IDEOGRAPHIC_SPACE = 0x3000;

// 零宽 / 不可见格式字符。它们在 CLI 里没有任何合法用途，却会让正则莫名其妙
// 匹配不上，且用户在输入框里根本看不见自己多打了一个。
const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0xfeff]);

export function toHalfWidth(text: string): string {
  let out = '';
  // 按码点遍历，避免把代理对拆成两半。
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (code >= FULLWIDTH_MIN && code <= FULLWIDTH_MAX) {
      out += String.fromCharCode(code - FULLWIDTH_OFFSET);
    } else if (code === IDEOGRAPHIC_SPACE) {
      out += ' ';
    } else if (!ZERO_WIDTH.has(code)) {
      out += ch;
    }
  }
  return out;
}

/**
 * 递归归一化 params 里的所有字符串。
 *
 * 必须递归：表单参数是嵌套的（acl.rules[]、routing.staticRoutes[]、
 * dhcp 的 pool 等），只处理顶层会漏掉大部分实际字段。
 *
 * 返回新对象，不改动入参——调用方可能还持有原始 params。
 */
export function normalizeDeep<T>(value: T): T {
  if (typeof value === 'string') return toHalfWidth(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => normalizeDeep(item)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = normalizeDeep(item);
    return out as T;
  }
  return value;
}
