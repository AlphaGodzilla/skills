# skills

本仓库收录 pi agent 使用的 skill。读者是使用 pi 的人与模型。要解决的问题是快速判断"当前任务该加载哪个 skill"。读完能按 skill 索引定位目录、触发场景与入口文件。全文分：skill 索引、各 skill 说明、使用方式、目录约定。

## skill 索引

| skill | 作用 | 触发场景 | 目录 |
| --- | --- | --- | --- |
| `firecrawl` | 在会话中获取网页数据：搜索、抓取、交互、文档解析、页面监控与科研索引 | 需要实时网页数据、抓取指定 URL、解析本地 PDF/DOCX、监控页面变化 | [`firecrawl/`](firecrawl/SKILL.md) |
| `ontology-modeling` | 把业务需求转成 OMF v6 本体驱动建模框架的模型文件 M1~M6（可选 M7/MU/MM/MI） | 用户要求"按本体建模""生成 M1~M6""输出九大模型""做需求建模"，或给出一段业务需求要求产出这些模型 | [`ontology-modeling/`](ontology-modeling/SKILL.md) |

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

## 使用方式

pi 依据每个 `SKILL.md` 的 frontmatter `description` 判断是否加载，`name` 必须与目录名一致。

校验模型文件（在目标项目中，脚本 vendoring 到 `tools/`）：

```bash
uv run tools/omf_validate.py --dir docs/model --strict
uv run tools/omf_validate.py --dir docs/model --impact Contract_Submit
```

## 目录约定

- 一个 skill 一个目录，入口固定为 `SKILL.md`。
- `SKILL.md` 只保留触发、原则、流程与自检；长清单与模板下沉到 `references/`。
- 需要执行的脚本放 `scripts/`；Python 脚本用 PEP 723 内联依赖，经 `uv run` 隔离执行，不污染全局环境。
