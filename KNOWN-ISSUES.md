# 已知问题清单

本文件记录**已确认存在、但本轮有意不修**的问题。每条都写清：症状、证据强度、
是谁引入的、以及修的时候该往哪走。

「不修」是一个决策，不是疏忽——所以每条都注明决策时间与理由。**别把这里的
条目当成待办清单直接开干**：第 1 条会改变默认厂商的输出，动之前先跟用户确认。

---

## 1. 华为 / H3C 的 RIP 认证命令视图错误（真机会拒绝执行）

**严重度**：高——客户勾了认证、生成的配置里那条命令交换机不认，认证不生效，
RIP 报文仍是明文。功能上等于「配了但没配上」。

**症状**。当前四家都往 `rip 1` 进程视图里塞认证命令：

```
rip 1
 version 2
 network 10.0.0.0
 authentication-mode md5 usual 123      ← 华为/H3C 真机会拒绝这一行
 quit
```

正确形态是**接口视图 + `rip` 前缀**：

```
# 华为 VRP
interface Vlanif10
 rip authentication-mode md5 usual cipher <密码>
 rip authentication-mode simple cipher <密码>

# H3C Comware V7
interface Vlan-interface10
 rip authentication-mode md5 rfc2453 plain <密码>
 rip authentication-mode simple plain <密码>
```

**证据强度：两家不一样，别当成同等可靠。**

- **H3C：已核实（强）**。把 Comware **V7** 命令参考里全部 **39 条** RIP 视图命令、
  **V5** 里全部 **35 条**逐条枚举了 `View` 字段——**两个版本都没有任何认证命令
  存在于 RIP 视图**。所以这不是「写法过时」，是视图根本不对。
- **华为：高置信但未拿到官方原页**（弱于 H3C）。`support.huawei.com` / `.cn` 有
  JS 反爬，抓不到正文，结论来自多页搜索摘要——所有示例都在 `[HUAWEI-Vlanif10]`
  下，且 VRP 里 `rip` 前缀本身就是接口级命令的命名约定。未亲眼看到官方
  `Views` 字段。**修之前建议用真机或官方文档坐实这一条。**

**关键字两家不是同一套，别互相抄**：

| | 视图 | 命令 | MD5 变体 | cipher/plain |
|---|---|---|---|---|
| 华为 VRP | 接口 | `rip authentication-mode` | `usual` / `nonstandard` | 可选 |
| H3C V5 | 接口 | `rip authentication-mode` | `rfc2082` / `rfc2453` | 只认可选的 `[cipher]` |
| H3C V7 | 接口 | `rip authentication-mode` | `rfc2082` / `rfc2453` | `{cipher\|plain}` **必填** |

两个坑：

1. **`usual` 是华为专有**，H3C 没有这个关键字。同一行不可能对两家都合法。
2. **H3C 的 `cipher` 不是「加密传输」的意思，而是「我给你的这个串已经是密文」**
   （要求 33–53 字符）。生成器必须吐 `plain <明文密码>`。华为的 `cipher` 语义不同，
   别混。
3. 带 key-id 的是 `md5 nonstandard`(华为) / `md5 rfc2082`(H3C)；`usual`/`rfc2453`
   不带 key-id。

**引入来源（诚实版）**：

- `huawei.ts` 那两行**改造前就有**（基线 `5e87d05` 里存在），是**既有缺陷**。
- `h3c.ts` 那两行**是本次重构加的**（提交 `b544a4a`）。当时我写的注释断言
  「Comware 的 RIP 认证在 rip 进程视图里，是全局的（和华为同一套写法）」——
  **两半都是错的**，我照着华为那份同样有问题的实现抄了一遍，没有独立核实。

**为什么当时的探针没抓到**：探针只断言「输出里出现了某个 needle」。而
`authentication-mode` 这个串**确实出现了**——错的是它所在的**视图**。
`present ≠ valid`：靠字符串存在性可以抓「命令整个丢了」，抓不到「命令放错地方」。

**修的时候要一并处理的连带影响**：

- 认证挪到接口后，**四家全变成接口级**（思科/锐捷本来就在接口上引用 key chain），
  于是 `RipConfig.authInterfaces` 从「思科/锐捷必填」变成**四家都必填**。
- 界面那个 placeholder「认证接口（思科/锐捷必填，逗号分隔）」**现在就是错的**，
  要么改文案，要么等修的时候一起改。
- 华为是**默认厂商**，所以这条修完，**开箱默认输出会变**。
- `tests/golden.ts` 里 4 个 RIP 认证用例的期望值全部要重新固化。

**决策**：2026-09-11，用户选择「先记为已知问题，本轮先交付」。同次确认：
**将来修 H3C 侧按 Comware V7 生成**（即写 `plain` 关键字）。

---

## 2. 认证密钥为空时兜底成 `'123'`（弱默认口令）

华为/H3C 共 8 处：`${p.rip.authKey || '123'}` / `${p.ospf.authKey || '123'}`。

界面允许「选了认证方式但密钥留空」，此时生成 `'123'`。**这意味着客户会拿一个
可猜的口令上线**，比「认证配错了」更隐蔽——命令合法、设备接受、但形同虚设。

其中华为 OSPF 那两处是**改造前就有**的；我上次修 H3C 时**刻意把它镜像了过来**
（保持两家一致），没有改成报错或省略。这属于「照抄了既有行为」，不是判断它正确。

**该往哪走**：验证层应该拦——选了认证就必须填密钥，而不是悄悄用 `'123'`。
在服务端 `generateAll` 入口校验最合适（前端校验可被绕过）。

---

## 3. `OspfConfig.defaultMetric` 声明了但全项目没用

`src/types/index.ts:112` 有 `defaultMetric?: number`，`grep` 全仓库**零引用**，
界面也没暴露。属于死字段：要么接上（`default-cost`），要么删掉。

不痛，但留着会让人以为 OSPF 支持配度量值。

---

## 4. 表单扫描对多「+」按钮的表单只覆盖最后一个面板

`tests/e2e-forms.cjs` 的 `__clickAdders` 在**一个同步 tick 里点掉所有 「+」按钮**，
而每个 handler 都捕获同一份 stale state，后一个覆盖前一个——**只有最后一个
按钮的效果存活**。实测路由表单批量点完后 OSPF 面板没打开，只有 BGP 在。

**影响**：凡是带多个「+」的表单，扫描里的「逐字段一致」是**「没走到那块」的一致**，
不是「走过了没变」的一致。路由表单的真实覆盖改由
`tests/e2e-routing-ui.cjs` 承担（那里是逐个点击的）。

**补覆盖要改**成「点一个 → 等 re-render → 再点下一个」，**并重新固化
`forms-baseline.json`**——所以不是顺手能改的小事，单独立项。

---

## 5. Electron 打包这条链路已经断了

`package.json` 的 `main` 指向 `electron/main.cjs`，但 **`electron/` 目录不存在**，
所以 `npm run electron:dev` / `electron:build` 都跑不通。

当前交付形态是**客户机双击 `start.bat` + 已装 Node**（见 `scripts/stage-release.mjs`），
不依赖 Electron，**不影响交付**。

本次把 electron-builder 的 `build.directories.output` 从 `release` 改成
`dist-electron`：它原本和交付目录**撞名**，`electron:build` 会把安装包写进
`release/`，而 `release/` 是要整个拷给客户的。改名只是**给将来留位**，
不代表 Electron 打包可用。

**待决**：到底恢复 Electron 打包，还是就以 `start.bat` + Node 交付？没定。

---

## 6. 华为/H3C 的 OSPFv2 `network-type` 视图归属未核实

`huawei.ts:143` 与 `h3c.ts:139` 附近，v2 分支的
`if (p.ospf.networkType) cmds.push(' network-type ...')` **位置没把握**——
VRP/Comware 的 `network-type` 到底在接口视图还是进程视图，当时没查清，
所以 v2 分支本轮**有意未改动**，代码里留了注释。

思科侧不同：`cisco.ts:210` 那段注释记录了旧实现凭空生成过
`network-type p2mp`（**参数没丢，但那条命令不存在**），已修。

**这条与第 1 条是同一类错误**（视图/命令存在性靠猜），建议一起核实。
