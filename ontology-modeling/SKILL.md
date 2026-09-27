---
name: ontology-modeling
description: 把模糊的业务需求转成 OMF v6 本体驱动建模框架的模型文件（M1 对象、M2 行为、M3 规则、ME 事件、M4 场景、M5 主体、M6 流程，可选 M7 报表、MU 界面、MM 映射、MI 接口）。当用户说"按本体建模""生成 M1~M6""输出九大模型""用 ontology_modeling_framework 建模""做需求建模"，或给出一段业务需求要求产出这些模型时使用。内置倒推取证与场景补全追问，专门挖出用户未声明的跨对象联动、审批分支、异常路径、数据范围与报表/接口需求。
---

# 本体驱动建模（OMF v6）

## 做什么

本 skill 把一段业务需求变成 OMF v6 框架的模型文件，读者是负责需求建模的模型（agent）。要解决的问题是：用户通常只描述"有哪些功能"，不描述对象生命周期、跨对象联动、审批分支、异常路径与数据范围，直接建模必然漏模型。读完能按倒推流程，先建一份"建模信息包"，再产出 M1～M6（用户要求时追加 M7/MU/MM/MI），并在过程中主动追问补出用户未声明的业务场景。全文分：铁律、适用边界、原则、倒推流程、输出目录与版本管理、场景补全追问、同步与校验、自检。

上游规范：`https://github.com/sharptoolbox/ontology_modeling_framework/blob/main/ontology_modeling_framework_v6.md`。本 skill 只描述流程与追问法；字段与模板见 `references/model-templates.md`，评审门禁见 `references/consistency-gates.md`，变更同步与结构校验见 `references/sync-and-validation.md`。

## 铁律

1. **业务建模阶段禁止输出代码**：本 skill 的全部工作只产出文档与模型文件，禁止新增或修改任何源代码、SQL 脚本、DDL、构建配置、脚手架、测试代码或接口实现。
   - 禁止：`.java`/`.py`/`.ts`/`.go` 等源码文件、数据库迁移脚本、OpenAPI 服务端实现、ORM 映射代码、单元测试代码。
   - 允许：`docs/model/` 下的 markdown 与 YAML 模型文件；模型字段中规范定义的表达式与伪代码（M2 `preconditions`/`postconditions`、M3 `expression`、M6 `conditionExpression`）与 M7 `referenceSql`，这些是模型语义而非实现代码。
   - 用户要求生成代码时：停下并说明本阶段只交付模型，代码生成属于实现层，另开任务。

## 何时适用 / 何时不适用

适用：

- 用户给出业务需求描述，要求"按本体建模""生成 M1~M6""输出九大模型""用 ontology_modeling_framework 建模"。
- 用户已有部分 `m*-*.yaml` 模型文件，要求补全、对齐或做一致性检查。
- 用户要求把现有系统、原型或旧数据库逆向成本体模型。

不适用：

- 只写需求文档、不产出模型文件：改用 `doc-writing-conventions`。
- 只做数据库设计或 UI 原型：这属于实现层，MM/MU 只作引用，不替代 DDL 与设计系统。
- 只讨论框架本身、不产出模型文件：直接回答即可，不进入本流程。
- 要求生成实现代码（实体类、Controller、DDL、脚手架等）：本阶段只交付模型文件，代码生成属于实现层，另开任务。

## 原则

1. **倒推取证**：先由目标模型列出"必须由用户确认的事实"，再向用户取证；禁止先画模型再补信息。
2. **事件优先、边界先行**：先把业务流程拆成"已经发生的事实"，再由事实反推命令与领域模型，最后按高内聚低耦合划分限界上下文；禁止从功能列表直接跳到模型。
3. **信息包先行**：全部模型从同一份"建模信息包"产出；信息包中未确认的事实标 `待确认`，禁止臆造业务事实。
4. **一轮一问、每批 ≤5 题**：按依赖顺序把问题分批提出，每批不超过 5 个，给每题编号与推荐答案；等用户回答完当前批再生成下一批，禁止一次性抛出全部问题。
5. **语义三分**：事件只回答"发生了什么"，规则只回答"条件是否满足"，行为只回答"改变什么状态"；禁止合并表达。
6. **跨对象必解耦**：源对象完成增删改或状态变更后，若还要改变另一个独立对象，必须拆成"源行为 → 事实事件 → 订阅者"；禁止源行为直接跨聚合写入。
7. **人工活动只认角色**：M6 的 `USER_TASK` 与 `APPROVAL_TASK` 的 `roleRef` 只能引用 M5 `roleId`；禁止填写具体用户或"财务经理"这类自由文本。
8. **引用用 ID**：跨模型引用一律用稳定 ID；ID 一旦分配不得复用，重命名前必须做影响分析。
9. **文档入版本库**：全部建模文档保存在 `docs/model/`，随代码一并提交；禁止把模型文档留在版本库外或临时目录。
10. **同步与校验**：任何模型变更必须同步全部引用文件，并运行结构校验；悬空引用或未同步的镜像字段禁止提交。

## 倒推流程

倒推链：`成品（M1–M6） → 每个模型需要的输入事实 → 中间产物（信息包） → 向用户追问 → 正向建模`。每个模型的输入事实与引导问题见 `references/reverse-elicitation.md` 第一节。

1. **定范围**：确认交付哪些模型（默认 M1–M6，逐项问 M7/MU/MM/MI 是否要）、领域边界、资料清单（需求文档、原型、旧系统、接口清单）。产出范围卡。
2. **事件风暴提取**：按 `references/event-storming-extraction.md` 执行四步——提领域事件、反推命令与领域模型、划分限界上下文、填汇总表。产出并交付 `docs/model/intake/ddd-extraction.md`（四张表 + 限界上下文映射 + M1~M6 取数索引 + 缺口清单）；用户描述模糊时按该文件第六节追问时间线、异常分支与副作用。
3. **建对象卡**：以领域模型表为骨架，逐个对象确认业务身份、属性、生命周期状态、明细与引用、局部约束（必填、唯一、枚举、字典、属性规则、聚合不变性）。产出对象卡，可直接落成 M1 草稿。
4. **挖场景**：以对象卡的生命周期与功能列表为索引，逐条执行下文"场景补全追问"，把结果记入场景清单。这一步负责补出用户未声明的业务场景，是本流程的核心。
5. **补角色与权限**：确认内部角色、外部参与方、每类操作的数据范围（全部、本部门、本人）与审批角色。
6. **编流程目录**：确认端到端协同流的业务阶段、审批流的层级与驳回、退回、超时路径。
7. **合信息包并查缺口**：把对象卡、场景清单、角色权限表、流程目录汇总为"建模信息包"，逐项标注 `已确认 / 待确认`；对每个 `待确认` 再追问一轮。
8. **按依赖顺序产出模型**：从 `docs/model/intake/ddd-extraction.md` 的取数索引逐行取数，按 M1 → M5（角色）→ M3 → M2 → 可选 M7 → ME → M5（权限）→ M4 → M6 → 可选 MU → MM → MI 产出到 `docs/model/yaml/`；每个模型落盘后立即跑该模型的校验门禁（`references/consistency-gates.md`）。
9. **收尾**：跑自检清单，把破坏性变更写入 `docs/model/CHANGELOG.md`，更新 `docs/model/README.md` 的阶段状态，确认 `docs/model/` 已纳入 git。
10. **同步与校验**：模型变更时按 `references/sync-and-validation.md` 的同步矩阵更新全部受影响文件，运行 `uv run scripts/omf_validate.py --dir docs/model --strict`（项目内 vendoring 到 `tools/omf_validate.py`）；错误清零前禁止提交。

## 输出目录与版本管理

全部建模文档保存在项目仓库的 `docs/model/`，作为项目设计文档随代码同步演进。目录固定如下：

```
docs/model/
├── README.md                     # 索引：交付范围、阶段状态、模型清单、追溯入口
├── intake/                       # 需求与 DDD 中间结果
│   ├── scope.md                  # 范围卡
│   ├── glossary.md               # 名词表
│   ├── ddd-extraction.md         # 领域事件表 | 领域模型表 | 限界上下文表 | 事件-命令-模型汇总表
│   ├── object-cards.md           # 对象卡
│   ├── scenario-list.md          # 场景清单
│   ├── actor-permission.md       # 角色权限表
│   ├── flow-catalog.md           # 流程目录
│   └── open-questions.md         # 待确认清单
├── yaml/                         # 模型文件
│   ├── m1-object-model.yaml
│   ├── m2-behavior-model.yaml
│   ├── m3-rule-model.yaml
│   ├── me-event-model.yaml
│   ├── m4-scenario-model.yaml
│   ├── m5-actor-model.yaml
│   ├── m6-flow-model.yaml
│   ├── m7-report-model.yaml      # 可选
│   ├── mu-ui-model.yaml          # 可选
│   ├── m-mapping-model.yaml      # 可选
│   └── mi-interface-model.yaml   # 可选
├── diagrams/                     # 可视化产物（可选）
├── reviews/                      # 评审记录（人工撰写并入库；机器报告 validation*.md 忽略）
└── CHANGELOG.md                  # 跨模型变更记录
```

每步的输出：

| 步骤 | 输出文件 |
| --- | --- |
| 1 定范围 | `docs/model/intake/scope.md` |
| 2 事件风暴提取 | `docs/model/intake/glossary.md`、`docs/model/intake/ddd-extraction.md` |
| 3 建对象卡 | `docs/model/intake/object-cards.md` |
| 4 挖场景 | `docs/model/intake/scenario-list.md` |
| 5 角色与权限 | `docs/model/intake/actor-permission.md` |
| 6 流程目录 | `docs/model/intake/flow-catalog.md` |
| 7 合信息包 | `docs/model/intake/open-questions.md`、`docs/model/README.md` |
| 8 产出模型 | `docs/model/yaml/m*.yaml` |
| 9 收尾 | `docs/model/CHANGELOG.md` |
| 10 同步与校验 | `docs/model/reviews/review-{date}.md`（人工评审记录；机器报告不入库） |

版本管理规则：

1. `docs/model/` 下的建模源文件必须纳入 git，与代码同仓库；`.gitignore` 只允许忽略派生产物（如 `reviews/validation*.md`），禁止忽略源文件。
2. 每次模型变更单独提交，提交信息写明变更的模型文件、元素 ID 与原因。
3. 破坏性变更必须记入 `docs/model/CHANGELOG.md`。
4. 模型与代码同步演进：禁止只改代码不改模型，也禁止只改模型不提交。
5. `docs/model/README.md` 记录当前交付范围与各阶段状态（`未开始 / 进行中 / 已交付`）。
6. 派生产物不入库：`omf_validate.py --report` 生成的 `validation*.md` 写入 `.gitignore`；需要留档时作为 CI 构建产物上传。`docs/model/reviews/` 只提交人工撰写的评审记录。

## 场景补全追问

对每个对象、每条功能逐条执行以下九类探测；详细问题串见 `references/reverse-elicitation.md` 第二节，事件层面的时间线与异常追问见 `references/event-storming-extraction.md` 第六节。

1. **生命周期**：这个对象有哪几个状态？谁或什么把状态推进到下一格？有没有不允许倒回的状态？
2. **跨对象联动**：这次操作完成后，是否还要新增、修改、删除、归档或流转另一个独立对象？无条件执行还是有条件？
3. **审批**：这个动作要不要人工确认？由哪个角色？金额、类型或组织阈值分几级？
4. **异常路径**：失败、重复提交、并发、撤销、超时、驳回、退回时怎么走？
5. **权限与数据范围**：谁能看全部、本部门、本人？谁禁止看或禁止做？
6. **查询与报表**：要跨哪些对象看列表、统计、导出？参数、口径与导出格式是什么？
7. **外部接口**：与哪些外部系统交互？方向、输入、输出、返回规则与失败处理是什么？
8. **界面入口**：用户从哪个界面发起这些操作？关键控件与跳转是什么？
9. **边界外**：性能、部署、BI 数仓、视觉样式——记录在案但不建模。

每轮提问按依赖排序：对象未定型不问行为，行为未定型不问事件，事件未定型不问流程。每批问题不超过 5 个。提问格式：

```
❓ Q<n> - <问题标题>: <问题正文，含可选答案>

➡️ <推荐答案>
```

## 自检

- [ ] 交付范围已确认，M7/MU/MM/MI 的取舍已明确
- [ ] 信息包中无未标注的臆造事实，所有 `待确认` 已闭环
- [ ] 领域事件表每行都是过去时事实，命名符合 `[名词]+[动词过去时]`
- [ ] 每个事件都能反推到一条命令与至少一个领域模型；跨聚合事件已拆成事件链
- [ ] 每个聚合根有生命周期，每个子实体回答了"是否与聚合根同生共死"
- [ ] 每个"源对象变更后影响另一独立对象"都拆成事件链，无跨聚合直接写入
- [ ] 每条事件有唯一生产者，事件名为过去时，载荷含订阅者所需字段
- [ ] M4 只含 `BEHAVIOR_CALL / EVENT_EMIT / RULE_EVALUATE`，无人工任务与网关
- [ ] M6 每条流程有唯一开始活动与至少一个结束活动，人工活动仅引用 M5 `roleId`
- [ ] 审批流覆盖通过、驳回、退回，网关非默认分支都有条件
- [ ] 跨模型引用 ID 全部可解析，无悬空引用
- [ ] 全部建模文档已保存到 `docs/model/` 并纳入 git 版本控制
- [ ] 已把破坏性变更写入 `docs/model/CHANGELOG.md`
- [ ] 变更已按同步矩阵更新全部引用文件，`omf_validate.py --strict` 零错误
- [ ] 业务建模阶段未输出任何代码（源码、SQL 脚本、DDL、脚手架、测试代码）
- [ ] 提问按批交付，每批不超过 5 题，用户回答完当前批后才推进下一批
- [ ] `docs/model/` 只提交源文件与人工评审记录，`validation*.md` 等派生产物已忽略
