---
status: accepted
date: 2026-10-15
decision-makers: [用户]
consulted: []
informed: []
---

# 采用 SharedWorker 管理离线审计工作区

## Context and Problem Statement

用户要求 Cmd + 点击全部内容导航时打开浏览器新标签页，且结论和备注在页面之间共享同步。现有 `app.js` 的模型和审阅状态仅存在单页内存中；给按钮附加开窗行为不能向新页提供同一工作区。

用户已选择允许离线本地服务及 SharedWorker 共享内存方案，并确认在工具内建立 MADR 4.0 中文架构记录。此决策只确定运行形态与共享状态所有权；功能与协议细节见独立设计提案，不代表已经实现。

## Decision Drivers

* 普通链接的浏览器原生语义：Cmd／Ctrl／中键／右键打开无需依赖主页面的窗口句柄。
* 模型、审阅和更新顺序有单一权威源，不通过多页面抢占主节点维护一致性。
* 关闭创建工作区的页面不能使其他仍接入的页面失去同步能力。
* 完全离线处理；不上传模型，不在服务端或浏览器存储 API 持久化业务内容。
* 保留既有单 HTML 单页能力，明确区分共享模式的运行要求和失效边界。

## Considered Options

* localhost 静态服务 + SharedWorker 内存工作区，各页面通过 MessagePort 接入。
* 直接打开单 HTML，以原页面为协调节点，通过页面消息通道共享状态。
* localhost 静态服务 + BroadcastChannel 多副本同步。

## Decision Outcome

选择「localhost 静态服务 + SharedWorker 内存工作区」。worker 持有权威模型与审阅状态，页面持有阅读状态与只读副本；服务只提供静态资源，不接收用户模型或审阅内容。

此方案使新标签页不依赖 opener 或创建工作区的某一个页面，也不需要在浏览器页面之间实现主节点切换。普通内容链接可由浏览器原生打开，新页按工作区凭证接入相同 worker。直接打开 HTML 仍为显式单页模式，不自动伪装成共享模式。

### Consequences

* Good, because 共享状态与提交顺序集中在 worker，各页可独立导航；关闭任意单页不要求迁移主页面。
* Good, because 模型解析和检查不进入静态服务，沿用本地只读审计、无业务持久化的边界。
* Bad, because 多页共享需要本地 HTTP 服务、独立 worker 产物、版本匹配与真实浏览器兼容性验收，不能再只分发一个 HTML 就宣称支持该功能。
* Bad, because worker 仍是易失内存；全部页面关闭、浏览器回收或崩溃后不能承诺恢复，各页副本也增加内存占用。
* Bad, because 需要定义草稿冲突、全局导入／清空、快照导出和失联协议，并维护单页／共享模式的回归。

### Confirmation

在真实浏览器验证原生 Cmd + 点击、新页无需重导入、原页关闭后继续同步、独立阅读位置、同字段冲突、全局变更和失联处理。检查 HTTP 仅有允许的静态资源请求，无模型或备注上传，无业务持久化；按设计提案的验收表记录浏览器实际版本与结果。

## Pros and Cons of the Options

### localhost 静态服务 + SharedWorker

* Good, because 同 origin 的页面可接入同一命名 worker；不依赖页面之间的 opener 关系。
* Bad, because 增加启动要求与资源发布约束，且不能把浏览器对 worker 的寿命管理当成持久化保证。

### 单 HTML + 原页面协调

* Good, because 保留直接双击文件、没有静态服务的使用形式。
* Bad, because 原页面关闭／冻结影响协调；原生开窗接入、`file://` 权限与页面间通道还需专项验证。用户选择了不承担主页面依赖的本地服务方案。

### localhost + BroadcastChannel 多副本

* Good, because 可通过广播传递变化，阅读页面之间不要求持有窗口句柄。
* Bad, because 广播本身不提供权威状态、加入快照、写入仲裁或冲突解决；仍需额外设计这些机制。本设计选择集中式内存权威源而非多写副本。

## More Information

* 功能与一致性设计：[浏览器多标签页审计设计](../design/browser-tabs.md)。其中待实现细节不因本 ADR 获批而成为现有能力。
* 事实来源：工具根目录 `app.js`、`render.js`、`importer.js`、`indexer.js`、`shell.html` 与 `build.mjs`；现有入口、内存状态、uid 分配、CSP 和构建形态均可从源码核对。
* 选择依据：用户已确认浏览器标签页、全部内容导航、共享同步、允许离线本地服务和工具内架构记录。浏览器兼容性和 worker 生命周期尚无本功能的实测结论。
* 若重新要求纯单 HTML 共享、无服务启动或退出后恢复，必须重新评估运行与持久化边界，而不是静默改变本决策。
