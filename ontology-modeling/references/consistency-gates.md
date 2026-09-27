# 一致性门禁与评审清单

本文件给出每个模型产出后必须跑过的校验项。用法：模型落盘后立即跑该模型的门禁，全部通过再进入下一个模型；交付前跑跨模型门禁与变更影响检查。

## 目录

1. [逐模型门禁](#一逐模型门禁)
2. [跨模型门禁](#二跨模型门禁)
3. [变更影响分析](#三变更影响分析)
4. [交付前总检](#四交付前总检)

---

## 一、逐模型门禁

### M1 对象模型

- [ ] 每个聚合根代表一个完整的业务概念，边界清晰。
- [ ] 聚合内子实体确实与聚合根同生共死，子实体不超过 3～5 个。
- [ ] 聚合之间通过 ID 引用，无对象引用。
- [ ] 不存在应独立为聚合根的子实体（有独立生命周期或被子实体被多个聚合引用）。
- [ ] 聚合不变性覆盖了业务完整性约束。
- [ ] 值对象不可变且按值相等判断。
- [ ] 必填、唯一、类型、枚举、字典优先用属性内置字段表达。
- [ ] 只依赖当前属性值的约束进 `refRules`，表达式只引用 `value`。
- [ ] 依赖同一聚合多属性或子实体的约束进 `invariants`。
- [ ] `DictionaryRef` 不同时声明 `enumValues`；`AggregateRootRef` 写明 `targetAggregate`。

### M2 行为模型

- [ ] 每个行为原子化，只操作一个对象。
- [ ] 前置条件覆盖行为可执行的业务前提。
- [ ] 后置状态变更完整描述全部副作用。
- [ ] `producedEvents` 只写事件 ID 引用。
- [ ] `queryReportRef` 只出现在 `behaviorType=QUERY` 的行为上，且与 M7 `behaviorRef` 双向一致、严格一对一。
- [ ] `triggerType=USER_ACTION` 的行为能被至少一个 MU 事件追溯（产出 MU 时检查）。
- [ ] `triggerType=EVENT` 的行为是某 ME 事件的订阅者。

### M3 规则模型

- [ ] 未包含可由属性内置字段、`refRules` 或 `invariants` 表达的对象内部规则。
- [ ] 每条规则至少涉及跨对象、跨行为、事件驱动、外部决策或独立复用中的一种。
- [ ] 规则表达式无副作用。
- [ ] 规则版本独立管理，与行为版本解耦。
- [ ] 事件驱动规则的 `subscribedEvents` 与 ME 事件 `subscribers` 双向一致。

### ME 事件模型

- [ ] 每个事件有明确且唯一的生产者。
- [ ] 事件命名为过去时；`description` 只解释事实本身，不含资格判断与后续结论。
- [ ] `triggerCondition` 只描述生产行为成功或源对象已变化。
- [ ] 事件载荷包含订阅者所需的核心业务数据，且不含敏感信息。
- [ ] 订阅者之间相互独立，无隐式依赖与顺序假设。
- [ ] 跨聚合的增删改或状态变化均已通过事件解耦，源行为未直接写入目标聚合。
- [ ] 无条件下游由行为直接订阅；需条件判断的下游由规则订阅并经 `triggeredBehaviors` 触发行为。
- [ ] `AT_LEAST_ONCE` 与 `EXACTLY_ONCE` 的订阅者实现了幂等性。
- [ ] 事件链清晰可追溯（生产者 → 事件 → 订阅者）。

### M4 场景模型

- [ ] 每个场景确实存在跨对象状态影响与事件解耦，而非普通顺序流程。
- [ ] 根集合为 `event_scenarios`，无流程或用例层。
- [ ] 每个 `BEHAVIOR_CALL` 引用已存在的 M2 行为。
- [ ] 每个 `EVENT_EMIT` 引用已存在的 ME 事实事件，且 `EVENT_EMIT` 前的 `BEHAVIOR_CALL` 等于该事件的生产行为。
- [ ] 每个 `RULE_EVALUATE` 引用已存在的 M3 规则，且该规则订阅了对应事件。
- [ ] `RULE_EVALUATE` 后的行为包含在规则 `triggeredBehaviors` 中。
- [ ] 场景未包含角色任务、审批活动、网关或端到端业务阶段。
- [ ] 场景前后置条件与 M2 行为的前后置条件不矛盾。
- [ ] `triggerEventRef` 与场景内对应 `EVENT_EMIT.eventRef` 一致。
- [ ] `sourceObjectRef` 与 `targetObjectRefs` 是 M1 中不同的聚合根。

### M5 主体模型

- [ ] 外部系统定义了接口契约（协议、超时、认证）。
- [ ] ABAC 条件覆盖数据隔离需求（如多租户、按部门）。
- [ ] 角色继承符合最小权限原则。
- [ ] 权限同时约束行为执行与界面可用性，两者一致（产出 MU 时检查）。

### M6 流程模型

- [ ] 每条流程明确标记为 `COLLABORATION` 或 `APPROVAL`。
- [ ] 有且仅有一个开始活动，至少一个结束活动；结束活动都指向 `END`。
- [ ] `USER_TASK` 与 `APPROVAL_TASK` 只引用已存在的 M5 `roleId`，无 Actor 与自由文本。
- [ ] 活动 `roleRef` 同时包含在流程 `roleRefs` 中。
- [ ] `BEHAVIOR_CALL`、`SCENARIO_CALL`、`SUB_FLOW_CALL` 引用存在且类型正确。
- [ ] 协同流调用审批流使用 `subFlowRef`，未复制审批活动。
- [ ] 网关至少两个分支、最多一个默认分支，非默认分支都有 `ruleRef`、`conditionExpression` 或 `approvalOutcome`。
- [ ] 审批流覆盖通过、驳回、退回等真实结果，不只有成功路径。
- [ ] 子流程调用图无循环。
- [ ] 所有非结束活动可从开始节点到达，并最终存在通往结束节点的路径。
- [ ] `SCENARIO_CALL` 从被引用场景的 `triggerEventRef` 衔接，未重复执行场景中记录的来源行为。

### M7 查询统计与报表模型（可选）

- [ ] 每个对象仅直接引用 M1 对象字段与唯一 M2 `QUERY` 行为。
- [ ] 未定义权限、角色、规则、事件、场景或流程引用。
- [ ] 有且仅有一个主查询来源，所有别名与 Join 引用有效。
- [ ] 参数、条件、结果列、分组、排序、分页完整表达查询口径。
- [ ] 多个一对多来源同时参与聚合时先按关联键预聚合，未用 `SUM(DISTINCT ...)` 规避重复行。
- [ ] `REPORT` 定义固定列、分组与合计及导出格式，其他类型不带 `reportOptions`。
- [ ] 参考 SQL 的参数与结果映射与语义定义一致。
- [ ] 未引入事实表、维度表、宽表、Cube 或 ETL 语义。

### MU UI 模型（可选）

- [ ] 每个屏幕声明 `elements` 与 `navigation`。
- [ ] 每个事件的 `callChain` 按 `VALIDATE → BEHAVIOR_CALL → [EVENT_EMIT/SCENARIO_CALL] → [REPORT_CALL/QUERY_REPORT] → NAVIGATE` 顺序。
- [ ] 每个 `BEHAVIOR_CALL` 引用的 M2 行为存在且 `triggerType` 匹配。
- [ ] 每个 `VALIDATE` 引用的 M3 规则存在且无副作用。
- [ ] 每个 `EVENT_EMIT` 的前序行为等于该事件 `producerBehaviorRef`。
- [ ] 每个 `SCENARIO_CALL` 从 `triggerEventRef` 衔接，未重复执行上游行为。
- [ ] 每个 `REPORT_CALL`/`QUERY_REPORT` 引用的 M7 对象存在。
- [ ] 元素 `permissionRef` 与 M5 权限、M2 `requiredPermissions` 一致，无"可见但拒绝"。
- [ ] 所有 `USER_ACTION` 行为都能从某 MU 事件反向追溯（`uiEventRefs` 一致）。
- [ ] `layout` 中出现的 elementId 都存在于 `elements`，`io` 与 `required` 标注一致。
- [ ] 视觉样式未混入 MU。

### MM 对象-数据表映射模型（可选）

- [ ] 每个需要持久化的聚合根与实体至少有一张表映射。
- [ ] `objectRef`、`attributeRef` 可解析到 M1 已存在的对象与属性。
- [ ] 复合对象映射多张表时，`DETAIL`/`EXT` 表通过外键指向 `MASTER` 表，外键归属与 M1 一致。
- [ ] 值对象二选一（前缀平铺或 JSON 列）并在 `mappingNote` 说明。
- [ ] `DictionaryRef` 映射为存储字典 code 的列；`AggregateRootRef` 映射为目标聚合根主表外键列。
- [ ] 索引、分区、约束实现、迁移脚本未混入 MM。
- [ ] M7 参考 SQL 的物理表名与列名与 MM 对齐。

### MI 接口模型（可选）

- [ ] 覆盖 `PROVIDED` 与 `DEPENDENT` 两类接口。
- [ ] `interfaceId` 全局唯一且与外部需求编号体系对齐。
- [ ] 每个接口定义了名称、方向、输入、输出与返回规则。
- [ ] 输入输出字段的名称、类型与口径与 M1 对象属性或 M7 结果列一致。
- [ ] `PROVIDED` 接口有 M2 `EXTERNAL_CALL` 行为承接；`DEPENDENT` 接口由 M2 行为调用并引用 M5 外部实体。
- [ ] `QUERY` 类接口不改变任何业务对象状态。
- [ ] 事件型接口通过 `relatedEventRef` 复用 ME 载荷语义，未重复定义载荷。
- [ ] 协议、格式、认证与 M5 `externalContract` 一致；网关与中间件等实现细节未混入 MI。

---

## 二、跨模型门禁

引用完整性：

- [ ] 所有跨模型引用（行为 `ownerEntity`、事件生产者与订阅者、规则 `reusedBy`、M4 场景链、M6 流程引用、M2/M7 一对一、M5 权限绑定）都可解析，无悬空引用。
- [ ] ID 变更时展示影响范围并级联更新或阻止保存。

事件风暴可追溯：

- [ ] 领域事件表每个事件对应 ME 的一条事件，命名与事件 ID 一致，均为过去时事实。
- [ ] 每个事件都能反推到一条命令；追不到命令的事件已确认为补偿、定时或附带事实。
- [ ] 每个命令的发起者已确定为 M5 角色或 M2 `triggerType`（`SYSTEM`/`EVENT`/`EXTERNAL`）。
- [ ] 汇总表中跨聚合根的事件已建立"生产者行为 → 事件 → 订阅者"结构。

事件链完整性：

- [ ] 从任意行为可追踪其产生的事件链路，从任意事件可追踪生产者与全部订阅者。
- [ ] `M2.producedEvents` 中的事件 ID 与 ME 事件的 `producerBehaviorRef` 双向一致。
- [ ] `M3` 事件驱动规则的 `subscribedEvents` 与 ME `subscribers` 双向一致。
- [ ] M4 场景链与 ME 订阅关系一致。

流程与角色：

- [ ] M6 引用的角色、行为、规则、事件、场景、子流程全部存在且类型正确。
- [ ] 角色变更时检查所有 M6 `roleRefs` 与活动 `roleRef`。
- [ ] M6 流程可达性与子流程无环。

读写分离：

- [ ] 查询类链只到 `QUERY_REPORT` 或 `BEHAVIOR_CALL(QUERY)` 结束，不产生事件、不进场景。
- [ ] M7 不直接引用 M3、ME、M4、M5、M6。

UI 反向追溯（产出 MU 时）：

- [ ] MU `uiEventRefs`、`uiValidationRefs`、`uiScreenRefs` 反向可追溯。
- [ ] 每个 `triggerType=USER_ACTION` 的行为、被 `uiControlledElements` 引用的权限、被 `uiScreenRefs` 引用的 M7 对象都能反向找到对应 MU 事件或元素。

接口对齐（产出 MI 时）：

- [ ] `relatedBehaviorRef`、`relatedEntityRef`、`relatedReportRef`、`relatedExternalEntityRef`、`relatedEventRef` 全部可解析。

---

## 三、变更影响分析

改动某模型前，按下表检查下游影响面。破坏性变更必须记入 `docs/model/CHANGELOG.md`。

自动化的同步定位与结构校验见 `references/sync-and-validation.md`；下表用于人工核对检查范围。

| 变更 | 必须检查 |
| --- | --- |
| M1 对象或属性 | M2、M3、ME、M4、M6、M7，以及 MM 映射 |
| M2 查询行为 | M7 一对一绑定是否仍成立 |
| M2 行为删除或签名变更 | 引用它的 ME 生产者与订阅者、M4 场景步骤、M6 活动、MU 调用链 |
| M3 规则 | 引用它的 M2 行为、ME 事件驱动规则、M4 步骤、M6 网关、MU 校验 |
| ME 事件载荷 | 订阅者所需字段是否仍满足；载荷变更保持向后兼容，增量添加而非改现有字段 |
| M5 角色 | 所有 M6 `roleRefs` 与活动 `roleRef`；`uiControlledElements` |
| M6 流程 | 子流程调用图是否成环；M4 场景仍只被引用不被复制 |
| M7 查询报表 | M2 `QUERY` 绑定；MM 参考 SQL 表名列名 |
| MU 事件 | 其调用的 M2 行为、M3 规则、ME 事件、M4 场景、M7 报表；执行 §10.4 调用链一致性校验 |
| MM 表名列名 | M7 参考 SQL；执行 MM 映射一致性校验 |
| MI 接口 | 关联的 M2 行为、M1 对象、M7 报表、M5 外部实体；执行 MI 接口一致性校验 |

版本管理约定：

- 每个元文件维护自己的 `version`。
- 规则模型与事件模型支持独立版本与热更新。
- 跨模型破坏性变更（实体删除、行为签名变更、事件载荷变更、MU 事件变更、MM 表列调整、MI 接口口径调整）必须记入 `docs/model/CHANGELOG.md`。

---

## 四、交付前总检

- [ ] 交付范围与用户要求一致，M7/MU/MM/MI 的取舍已在范围卡中记录。
- [ ] 上位门禁全部通过，悬空引用为零。
- [ ] 每个"源对象变更后影响另一独立对象"都拆成事件链，无跨聚合直接写入。
- [ ] 每条流程的可达性与分支完整性通过。
- [ ] 信息包中的全部条目都有 `已确认` 或 `边界外` 标记，无遗留 `待确认`。
- [ ] M1~M6 每个元素都能追溯到 `docs/model/intake/ddd-extraction.md` 的一行，无无来源的元素。
- [ ] 每个聚合根归属且仅归属一个限界上下文，跨上下文交互已落成 MI 接口或 ME 事件。
- [ ] `docs/model/CHANGELOG.md` 已记录全部破坏性变更，`docs/model/` 已纳入 git。
