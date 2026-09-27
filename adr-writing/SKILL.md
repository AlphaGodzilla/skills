---
name: adr-writing
description: 创建、更新与维护架构决策记录（ADR）。触发场景：用户说「写 ADR」「把这个决策记下来」「沉淀决策」「更新/取代 ADR」「这个决定被推翻了」，或刚拍板技术选型、持久化方案、部署形态、模块边界等架构显著决策之后。关键词：ADR、architecture decision record、MADR、supersede、决策记录。
---

# ADR 写作

本 skill 面向需要记录架构决策的人与模型。它解决一个问题：让未来的人与 AI 查到某个结构、依赖或部署形态「为什么这么选、放弃了什么」。读完本 skill 能完成三件事：判断该不该建 ADR、按模板写出一条合规的 ADR、正确地新增或取代既有 ADR。全文分：项目约定、适用边界、原则、流程、索引与提交、自检、红旗；模板全文与状态流转见 `references/madr-4.0.0-zh.md`。

行文遵循 skill `doc-writing-conventions`（若可用）。

## 项目约定

动笔前按下表取值；与项目实际情况不符时以项目为准，并在同一次提交里把改动同步到本表。

| 项 | 默认值 | 约束 |
| --- | --- | --- |
| ADR 目录 | `docs/adr/` | |
| 模板 | `docs/adr/adr-template.md` | 只复制出实例，禁止修改模板本身 |
| 索引 | `docs/adr/README.md` | 编号/标题/状态的唯一真相源 |
| 文件名 | `NNNN-<kebab-case-english-title>.md` | 四位补零；标题用「动词 + 对象」，如 `0012-two-phase-evolution-design-workbench-to-runtime.md` |
| 编号 | 索引中最大编号 + 1 | 禁止复用任何旧编号 |
| 正文语言 | 简体中文，技术名词保留英文 | |
| 章节标题 | 保留 MADR 英文原名 | 项目另有风格要求时跟随项目 |

模板或目录不存在时：停下，向用户确认放置位置与格式。禁止自造第二套命名或模板。

## 适用与不适用

适用：

- 用户明确要求写或更新 ADR，或说「把这个决策沉淀一下」「记录为什么这么选」
- 用户拍板了此前只在讨论、评审或提案中出现的某项决策
- 刚做出影响结构、非功能特性、依赖、接口或构建方式的选择：技术栈、数据库、部署形态、模块边界、一致性策略
- 发现已生效但从未记录的决策（补录）
- 需要推翻或替换一条 `accepted` 的 ADR

不适用：

- 还没做决定、只是在征集方案：改用 RFC 或提案文档
- 细节设计、接口定义、数据模型：写入实现代码、API 文档或注释，不写 ADR
- 一次性实现笔记

## 原则

1. **一条 ADR 只记录一个决策**：相关但可独立演化的选择必须拆成多条。
2. **只增不改**：ADR 文件永不删除；`accepted` 的 Decision、Context、Options 正文永不改写。唯一允许的改动是 `status` 与 `date`。
3. **理由与代价同时在场**：Consequences 必须同时给出 Good 与 Bad；备选必须包含真实被否决项及否决理由。
4. **不编造**：记不清的写 `UNCONFIRMED:`，禁止虚构理由、数据或「当时讨论过」的内容。
5. **索引唯一**：编号、标题、状态、日期只维护在 `docs/adr/README.md`，其它文档只放链接。
6. **决策与细节分离**：禁止把细节设计、接口定义、大段 schema 复制进 ADR（Mega-ADR 反模式）；细节留在实现处或代码注释。

## 流程

### 新建一条 ADR

1. **查重**：读索引与现有 ADR，确认没有重复或可合并的既有记录。
2. **定性**：确认这是一条决策，且属于架构显著决策。
3. **取号**：索引最大编号 + 1，复制模板为 `NNNN-<kebab-title>.md`。
4. **填写**：按 Context 与 Drivers（已知事实与来源）→ Considered Options（真实备选）→ Decision Outcome 与 Consequences 的顺序写。
5. **置状态**：先写 `proposed`；用户确认后才改为 `accepted`。
6. **同步**：更新索引。

### 取代既有 ADR

1. 新建 `NNNN-<new-title>.md`，Context 中引用旧 ADR 编号与为何需要新决策。
2. 旧 ADR 只改 `status: superseded by ADR-NNNN` 与 `date`。
3. 双向引用：新 ADR 在 Decision Outcome 或 More Information 写 `Supersedes ADR-NNNN` 并链接旧文件。
4. 更新索引的旧条目与新条目。

只有用户明确要求时，才允许修正旧 ADR 的笔误或失效链接（不触及决策内容），并在提交信息中说明。

`rejected` 只用于重要到值得防止重复辩论的否决方案；与本次决策无关的普通选项不必建 ADR。

## 索引维护

每次新增或状态变更后同步 `docs/adr/README.md`：

```markdown
| 编号 | 标题 | 状态 | 日期 |
| --- | --- | --- | --- |
| [0014](./0014-adopt-springdoc-openapi.md) | API 文档站采用 springdoc-openapi | accepted | 2026-01-18 |
```

索引行必须与文件真实状态一致；索引失真按错误处理，立即修复。

## 与提交的关联

- 一个决策一次提交或一个 PR，ADR 与实现代码同行。
- 提交信息样例：`docs(adr): add ADR-0014 adopt springdoc-openapi`、`feat(persistence): ... (ADR-0004)`、`docs(adr): supersede ADR-0005 with ADR-0012`

## 自检

- [ ] 一条 ADR 只记录一个决策，编号未复用
- [ ] 文件名 `NNNN-kebab-title.md` 与索引一致
- [ ] frontmatter 的 `status` 与 `date` 已填且真实，`decision-makers` 未写入 AI 自己
- [ ] Context 说明了「为什么现在必须做这个决策」与影响面
- [ ] 备选 ≥2 且抽象层级一致，含被否决项及否决理由
- [ ] Decision Outcome 的理由对齐某个 driver 或硬性约束，不是空话
- [ ] Consequences 同时包含 Good 与 Bad
- [ ] 所有事实性声明都有出处，或标注 `UNCONFIRMED:`；无营销式形容词
- [ ] `docs/adr/README.md` 已同步
- [ ] 未改写任何 `accepted` ADR 的决策正文

## 红旗 —— 立即停下

- 想把多条决策塞进一个文件：拆成多条 ADR。
- 想写「以后怎么做」的完整实现步骤：那是实现说明，不是 ADR。
- 只有优点没有代价，或备选是明显不可行的凑数项：补齐真实权衡后再写。
- 决策还没被用户确认却想写 `accepted`：保持 `proposed` 并向用户确认。
- 想直接修改旧 ADR 的结论以「保持最新」：改为新建 ADR 并 supersede。
- 记不清当时的理由、想靠推测补全：标注 `UNCONFIRMED:`，不要虚构。
- 写完 ADR 没更新索引：补齐后再交付。
