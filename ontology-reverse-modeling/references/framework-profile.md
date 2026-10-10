# 框架口径与现状表示边界

本文件供源码逆向执行者确定 OMF v6 模型职责与标准序列化口径。先按下表理解职责，再读取依赖 skill 的完整模板；本文不维护第二套模型 schema。全文分为文件集合、口径冲突、现状与规范的分离。

## 文件集合与职责

所有文件位于已确认输出目录的 `yaml/` 下；`MM` 的文件名是 `m-mapping-model.yaml`，不是 `mm-mapping-model.yaml`。

| 模型 | 文件名 | `model_type` | 根键 | 逆向职责 |
| --- | --- | --- | --- | --- |
| M1 | `m1-object-model.yaml` | `OBJECT` | `aggregates`、`data_dictionaries`、`aggregate_associations` | 业务对象、属性、边界与局部约束 |
| M2 | `m2-behavior-model.yaml` | `BEHAVIOR` | `behaviors` | 实际命令、查询、事件处理、前后置条件与副作用 |
| M3 | `m3-rule-model.yaml` | `RULE` | `rules` | 跨对象、复用或事件驱动的业务判断、计算和决策 |
| ME | `me-event-model.yaml` | `EVENT` | `events` | 真实事件、生产者、载荷、订阅者和投递语义 |
| M4 | `m4-scenario-model.yaml` | `SCENARIO` | `event_scenarios` | 已实现的跨对象事件协同链 |
| M5 | `m5-actor-model.yaml` | `ACTOR` | `actors`、`roles`、`permissions` | 主体类型、角色、权限、数据范围与外部参与者 |
| M6 | `m6-flow-model.yaml` | `FLOW` | `flows` | 已实现的端到端协同与人工审批流程 |
| M7 | `m7-report-model.yaml` | `REPORT` | `query_reports` | 跨对象查询、统计与固定报表口径 |
| MM | `m-mapping-model.yaml` | `MAPPING` | `mappings` | M1 对象/属性到真实表/列的映射 |
| MI | `mi-interface-model.yaml` | `INTERFACE` | `interfaces` | 系统提供和依赖的接口契约 |
| MU（可选） | `mu-ui-model.yaml` | `UI` | `screens`、`cross_cutting` | 已有 UI 的屏幕、控件、导航和调用链追溯 |

ID 与全部字段复用 `ontology-modeling/references/model-templates.md`；只抽取源码证实的取值，禁止照抄其合同、订单和审批示例。每个文件必须显式保留所有列表根键；空集合写 `[]`，不是 `null` 或缺省。

`version` 是模型文件的版本，不是必须填写为 `6.0` 的框架版本。新文件按目标项目已确认的版本策略填写；已有文件保留独立版本及稳定 ID。

## 上游口径冲突的处理

以用户提供的 [OMF v6 原文](https://github.com/sharptoolbox/ontology_modeling_framework/blob/main/ontology_modeling_framework_v6.md) 为来源；下列口径适用于本 skill，不修改依赖 skill 的既有文档。

### 外部调用使用 `triggerType: EXTERNAL`

原文 §3.2.1 的 M2 `behaviorType` 只有 `COMMAND / QUERY / EVENT_HANDLER`，`triggerType` 只有 `USER_ACTION / SYSTEM / EVENT / EXTERNAL`。§12.1、§12.3、§12.5 同样以 `EXTERNAL` 或查询行为承接接口；§12.6 和部分检查清单却写成 `EXTERNAL_CALL`。

本 skill 采用正式枚举 `EXTERNAL`，不创造 `behaviorType: EXTERNAL_CALL` 或 `triggerType: EXTERNAL_CALL`。接口执行仍按实际语义选择 `COMMAND` 或 `QUERY`。依赖外部接口的行为不因此自动成为 `EXTERNAL`：其触发来源可能是定时任务、领域事件或用户动作。

同一实现被多个不同来源触发时，记录全部入口证据；标准单值 `triggerType` 无法忠实表达时登记表示缺口并询问，禁止只选一个来源、虚构多个执行单元或把所有 HTTP 请求等同外部业务集成。

### M5 外部实体落在 `actors`

原文 §7.3 和共享 YAML 模板将外部参与者序列化为 `actors[].actorType: EXTERNAL`，ID 为 `actorId`；虽然 MI 文字使用 `ExternalEntity`，不得另造 `externalEntities` 根集合。MI 的 `relatedExternalEntityRef` 引用该 `actorId`。

### 目录与文件数量按范围卡执行

原文 §14.3 的 `onto-cs/model/{projectId}/yaml/` 是建模平台托管目录，不是必须修改目标仓库结构的要求；本文使用用户确认的输出目录。原文部分文字提及“十二类固定文件”，列出的模型文件实际为 11 个；本 skill 的默认集合为 10 个，加 MU 后为 11 个，不补造第十二个模型。

## 现状与规范必须分离

OMF 的单聚合行为、纯规则、事件解耦、流程角色和查询统计约束是表示与设计规范，不是关于目标代码的既成事实。

| 源码现状 | 允许的表示 | 禁止的处理 |
| --- | --- | --- |
| 同步调用直接修改另一个独立对象 | 保存真实调用、全部读写和事务边界；能表示的 M2 部分加独立差异记录，不能表示的片段进入缺口清单 | 编造事件、订阅者、异步边界或假想 M4 场景 |
| 代码将审批任务绑定具体用户而无角色 | 记录实际选人条件、流程和角色约束偏差；缺少必要角色引用的流程不伪装成完整标准流程 | 从职位名推断 M5 角色，或替实际用户造角色 |
| 判断方法同时写状态 | 原始副作用归入行为证据，逻辑与行为关系在提取表记录；不能独立表达的部分登记缺口 | 把整个有副作用方法写成纯 M3 表达式 |
| 查询存在重复聚合或口径错误 | 记录实际表达式与已证明的重复路径，指出 OMF 偏差 | 自动预聚合、修 SQL、用目标查询替换当前查询 |
| ORM 推导的表名依赖命名策略但策略缺失 | 暂停表名结论，询问或补充策略源码 | 使用常见蛇形命名猜表名 |
| 只有文档定义事件或外部消费者 | 保留声明线索与缺口，区分未看到实现和不存在 | 当作发布、订阅或投递保证已经实现 |
| 无关系数据库、事件、报表或审批功能 | 相应集合为空，模型状态和搜索判据在清单说明 | 为凑文件内容引入数据库表、事件总线或业务报表 |

一个已知偏差可以与可信现状模型共存，但不得因此宣称“符合 OMF”。不能同时忠实表示与保持合法引用时，保留已证明的可表示子集和原始现状差异；未表示的入口必须标 `GAP`，该模型标 `PARTIAL`。禁止输出悬空占位引用，也禁止把子集描述成全系统完整模型。

发现新的上游自相矛盾、工具误报或与用户已确认规则冲突时，必须给出出处并询问；不以本文件的已确认口径裁定无关冲突。
