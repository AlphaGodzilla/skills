# skills

本仓库收录 agentless 的通用 skill。读者是使用这些 skill 的人与模型。要解决的问题是快速判断"当前任务该加载哪个 skill"。读完能按 skill 索引定位目录、触发场景与入口文件。全文分：定位、skill 索引、各 skill 说明、使用方式、目录约定。

## 定位

这些是 **agentless 的通用 skill**：与具体 agent 实现无关，不绑定任何运行时、模型厂商或平台。

依赖面只有一条约定：一个目录 + 入口 `SKILL.md` + frontmatter（`name`、`description`）。任一支持该约定的 agent 均可按 `description` 判断是否加载；人类也可以直接阅读 `SKILL.md` 按流程执行。

skill 之间除显式声明外互不依赖，可单独复制到任意仓库使用。

## skill 索引

| skill | 作用 | 触发场景 | 目录 |
| --- | --- | --- | --- |
| `firecrawl` | 在会话中获取网页数据：搜索、抓取、交互、文档解析、页面监控与科研索引 | 需要实时网页数据、抓取指定 URL、解析本地 PDF/DOCX、监控页面变化 | [`firecrawl/`](firecrawl/SKILL.md) |
| `ontology-modeling` | 把业务需求转成 OMF v6 本体驱动建模框架的模型文件 M1~M6（可选 M7/MU/MM/MI） | 用户要求"按本体建模""生成 M1~M6""输出九大模型""做需求建模"，或给出一段业务需求要求产出这些模型 | [`ontology-modeling/`](ontology-modeling/SKILL.md) |
| `doc-writing-conventions` | 撰写或修改 skill、AGENTS.md/CLAUDE.md、ADR 三类文档时的中文行文规范 | 新建或编辑 skill、写项目代理指令文件、记录架构决策 | [`doc-writing-conventions/`](doc-writing-conventions/SKILL.md) |
| `adr-writing` | 创建、更新与维护架构决策记录（ADR），模板基于 MADR 4.0.0 中文版 | 用户说"写 ADR""沉淀决策""更新/取代 ADR"，或刚拍板技术选型、持久化方案、部署形态、模块边界等决策 | [`adr-writing/`](adr-writing/SKILL.md) |
| `scaffold` | 从内置技术底座生成新项目骨架，替代重复选型（当前底座：后端单体应用、前端管理后台） | 用户说"新建项目""起一个后端""起一个管理后台""搭个骨架""初始化工程"，或要求创建后端服务 / 前端后台但未指定技术栈 | [`scaffold/`](scaffold/SKILL.md) |

## firecrawl

让 agent 在本轮会话中把网页变成可用上下文，或在应用代码里接入 Firecrawl。它按任务路由到不同路径：会话内取数据、应用集成、成品交付物、账号授权、免安装 REST 调用、无密钥免费额度。

上游来源：Firecrawl 官方 CLI 安装的 skill（`firecrawl/cli`、`firecrawl/firecrawl-workflows`）。本目录中的 `SKILL.md` 是安装产物，改动应当回上游，不在此处维护。

## ontology-modeling

把模糊的业务需求变成可版本管理的设计文档与模型文件。核心是一条倒推链：

```
成品模型（M1~M6） → 每个模型需要的输入事实 → 中间产物（建模信息包） → 追问 → 正向建模
```

流程要点：

1. 事件风暴提取领域事件，反推触发命令与领域模型，再按高内聚低耦合划分限界上下文。
2. 以对象生命周期与功能列表为索引，主动追问补出用户未声明的跨对象联动、审批分支、异常路径与数据范围。
3. 按依赖顺序产出 M1 → M5（角色）→ M3 → M2 → M7 → ME → M5（权限）→ M4 → M6 → MU → MM → MI。
4. 全部文档写入 `docs/model/`，随代码提交，并用校验脚本守住结构完整性与跨模型引用。

内置资源：

| 路径 | 作用 |
| --- | --- |
| `SKILL.md` | 铁律、原则、倒推流程、场景补全追问、输出目录与版本管理、自检 |
| `references/reverse-elicitation.md` | 反向信息需求表、场景补全追问清单、提问轮次与分批规则、信息包结构 |
| `references/event-storming-extraction.md` | 四步提取法：领域事件、命令与领域模型、限界上下文、汇总表 |
| `references/model-templates.md` | ID 规范、根键表、各模型 YAML 骨架、建模顺序 |
| `references/consistency-gates.md` | 逐模型门禁、跨模型门禁、变更影响分析、交付前总检 |
| `references/sync-and-validation.md` | 变更同步矩阵、校验脚本用法、CI 集成与回滚 |
| `scripts/omf_validate.py` | 结构与跨模型引用校验器（PEP 723，uv 隔离运行） |

硬性约定：业务建模阶段禁止输出任何代码；模型变更必须同步全部引用文件并跑校验，错误清零前禁止提交。

## doc-writing-conventions

规定 skill、AGENTS.md/CLAUDE.md、ADR 三类文档的中文行文规范。要解决的问题是：文档写了，读者只读一遍仍不知道该不该照做、每步做什么。

两条总原则：

1. **结构约束**决定信息出现的顺序：开篇给图景，再给骨架，最后给细节。
2. **语言约束**决定单句能否被唯一理解：中文优先、删冗余、消除分词歧义。

核心内容：开篇四问、由浅入深的骨架、删句判据、中文分词歧义六类改写表、三类文档的结构差异与自检清单。可直接套用的骨架见 `references/templates.md`。

## adr-writing

记录架构决策，回答"为什么这么选、放弃了什么"。ADR 落在 `docs/adr/`，模板与状态流转基于 MADR 4.0.0 中文版，全文见其 `references/madr-4.0.0-zh.md`。

硬性约定：

- 一条 ADR 只记录一个决策；编号禁止复用。
- 只增不改：`accepted` 的 Decision、Context、Options 正文永不改写，仅允许改 `status` 与 `date`。
- 备选必须包含真实被否决项及否决理由；Consequences 必须同时给出 Good 与 Bad。
- 不编造：记不清的内容标注 `UNCONFIRMED:`。
- 编号、标题、状态只维护在 `docs/adr/README.md`，其它文档只放链接。

行文遵循 `doc-writing-conventions`；一个决策一次提交，ADR 与实现代码同行。

## scaffold

把"新建项目"从一次性选型变成一次渲染。底座是已经跑通过的技术骨架，模型按用户给出的参数渲染出可构建、可运行的项目，不再就框架与组件向用户提问。

当前底座：

| 底座 | 形态 | 该底座声明的参数（除项目名外） |
| --- | --- | --- |
| `backend-monolith` | 后端单体应用（Spring Boot 4.1 + Java 21 + 六边形分层 + ArchUnit 守护） | 基础包名（必填）；数据能力 `mongodb` / `postgres` / `mysql`；缓存能力 `caffeine` / `redis` |
| `frontend-admin` | 前端管理后台（Ant Design Pro v6 + Umi Max 4 + React 19 + antd 6） | 站点标题（默认由项目名推导）；开发期后端代理目标（默认 `http://localhost:8080`） |
流程要点：

1. 只问该底座声明的参数：后端是项目名、包名、数据能力、缓存能力（后两项缺省取 `mongodb` 与 `caffeine`）；前端是项目名、站点标题、代理目标（后两项都有默认值）。
2. 用 `uv run scripts/scaffold.py --template <底座名> ...` 渲染，参数按各底座 `template.py` 的 `PARAMS` 收集。
3. 生成后必须让对应验收命令通过才算完成：后端 `scripts/qa-gate.sh`（等价 `./gradlew build`），前端 `npm install && scripts/qa-gate.sh`。

硬性约定：禁止重新选型；禁止手工复制模板（会漏掉条件块与占位符替换）；禁止把业务代码写进底座的 `sample` 占位模块；禁止为了让工具跑起来而降级底座选型（前端底座的 TS 7 × StrykerJS 兼容层已就位）。两个底座的说明、组件行为与已验证范围见 [`references/backend-monolith.md`](scaffold/references/backend-monolith.md) 与 [`references/frontend-admin.md`](scaffold/references/frontend-admin.md)。

## 使用方式

任一支持 skill 约定的 agent（含 pi）依据 `SKILL.md` 的 frontmatter `description` 判断是否加载；`name` 必须与目录名一致。

校验模型文件（在目标项目中，脚本 vendoring 到 `tools/`）：

```bash
uv run tools/omf_validate.py --dir docs/model --strict
uv run tools/omf_validate.py --dir docs/model --impact Contract_Submit
```

## 目录约定

- 一个 skill 一个目录，入口固定为 `SKILL.md`。
- `SKILL.md` 只保留触发、原则、流程与自检；长清单与模板下沉到 `references/`。
- 需要执行的脚本放 `scripts/`；Python 脚本用 PEP 723 内联依赖，经 `uv run` 隔离执行，不污染全局环境；一次性工具用 `uvx <tool>`（入口名与包名不一致时用 `uvx --from <包> <入口>`）临时执行，不写进依赖。
- 项目脚手架类 skill 额外有 `templates/<底座>/`：`base/` 是应用本体，`components/*` 是可组装的能力组件（如后端的数据库与缓存能力），`template.py` 声明该底座的参数、后置步骤与下一步提示；通用渲染引擎是 `scripts/scaffold.py`。模板用 `{{变量}}` 占位与 `?if` 条件块。
