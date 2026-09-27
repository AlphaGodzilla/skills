# 模型文件模板与命名规范

本文件给出 OMF v6 各模型的根键、核心字段、ID 规范与最小 YAML 骨架。用法：产出模型时按骨架填字段，字段取值口径以上游规范为准；M1–M6 为默认交付，M7/MU/MM/MI 仅在用户要求时产出。

## 目录

1. [命名与 ID 规范](#一命名与-id-规范)
2. [文件与根键](#二文件与根键)
3. [M1 对象模型](#三m1-对象模型)
4. [M2 行为模型](#四m2-行为模型)
5. [M3 规则模型](#五m3-规则模型)
6. [ME 事件模型](#六me-事件模型)
7. [M4 场景模型](#七m4-场景模型)
8. [M5 主体模型](#八m5-主体模型)
9. [M6 流程模型](#九m6-流程模型)
10. [M7 查询统计与报表模型（可选）](#十m7-查询统计与报表模型可选)
11. [MU UI 模型（可选）](#十一mu-ui-模型可选)
12. [MM 对象-数据表映射模型（可选）](#十二mm-对象-数据表映射模型可选)
13. [MI 接口模型（可选）](#十三mi-接口模型可选)
14. [建模顺序与依赖](#十四建模顺序与依赖)

---

## 一、命名与 ID 规范

| 模型 | ID 格式 | 示例 |
| --- | --- | --- |
| M1 聚合根 | `AGG-{NAME}-{NNN}` | `AGG-CONTRACT-001` |
| M1 聚合关联 | `ASSOC-{NNN}` | `ASSOC-001` |
| M1 数据字典 | `DICT-{NAME}` | `DICT-CONTRACT-BASE` |
| M2 行为 | `{EntityAlias}_{ActionName}` | `Contract_Submit` |
| M3 规则 | `RULE-{DOMAIN}-{SEQ}` | `RULE-CONTRACT-CLOSE-CHECK` |
| ME 事件 | `{Entity}.{State}_{Past}` | `Contract.Submitted` |
| M4 场景 | `SCN-{DOMAIN}-{NNN}` | `SCN-CONTRACT-001` |
| M5 参与者 | `ACTOR-{NAME}` | `ACTOR-FINANCE-MANAGER` |
| M5 角色 | `ROLE-{NAME}` | `ROLE-FINANCE-MANAGER` |
| M5 权限 | `PERM-{Domain}-{Action}` | `PERM-CONTRACT-APPROVE` |
| M6 流程 | `FLOW-{DOMAIN}-{NNN}` | `FLOW-CONTRACT-001` |
| M6 活动 | `A{NN}` 或 `P{NN}` | `A01`、`P05` |
| M7 查询 | `QR-{DOMAIN}-{NNN}` | `QR-CONTRACT-EXECUTION-001` |
| M7 报表 | `RPT-{DOMAIN}-{NNN}` | `RPT-CONTRACT-SUMMARY-001` |
| MU 屏幕 | `frm{Name}` | `frmContract` |
| MU 事件 | `{screenId}.{控件事件}` | `frmContract.tbrMenu_ButtonClick.SAVE` |
| MM 映射 | `M-MAP-{对象代码}-{NNN}` | `M-MAP-ORDER-001` |
| MI 接口 | `INT-{NNN}` | `INT-001` |

硬性约束：

- 事件名必须用过去时，格式 `{Entity}.{State}_{Past}`；禁止用动词原形或进行时。
- ID 一旦分配禁止复用；重命名或删除前必须做跨模型影响分析。
- 跨模型引用一律写 ID，禁止凭名称猜测。
- 聚合根 `name` 用中文且唯一，`alias` 用英文标识符。

## 二、文件与根键

| 文件 | 根键 | `model_type` |
| --- | --- | --- |
| `m1-object-model.yaml` | `aggregates`、`data_dictionaries`、`aggregate_associations` | `OBJECT` |
| `m2-behavior-model.yaml` | `behaviors` | `BEHAVIOR` |
| `m3-rule-model.yaml` | `rules` | `RULE` |
| `me-event-model.yaml` | `events` | `EVENT` |
| `m4-scenario-model.yaml` | `event_scenarios` | `SCENARIO` |
| `m5-actor-model.yaml` | `actors`、`roles`、`permissions` | `ACTOR` |
| `m6-flow-model.yaml` | `flows` | `FLOW` |
| `m7-report-model.yaml` | `query_reports` | `REPORT` |
| `mu-ui-model.yaml` | `screens`、`cross_cutting` | `UI` |
| `m-mapping-model.yaml` | `mappings` | `MAPPING` |
| `mi-interface-model.yaml` | `interfaces` | `INTERFACE` |

每个文件头部含 `model_type`、`version`、`domain`。模型文件统一放 `docs/model/yaml/`，与 `docs/model/intake/`、`docs/model/CHANGELOG.md` 同级：

```
docs/model/yaml/
├── m1-object-model.yaml
├── m2-behavior-model.yaml
├── m3-rule-model.yaml
├── me-event-model.yaml
├── m4-scenario-model.yaml
├── m5-actor-model.yaml
├── m6-flow-model.yaml
├── m7-report-model.yaml           # 可选
├── mu-ui-model.yaml               # 可选
├── m-mapping-model.yaml           # 可选
└── mi-interface-model.yaml        # 可选
```

`docs/model/` 下除 `yaml/` 外还有 `intake/`（需求与 DDD 中间结果）、`diagrams/`（可视化，可选）、`README.md`（索引与阶段状态）与 `CHANGELOG.md`；完整目录与版本管理规则见 `SKILL.md` 的「输出目录与版本管理」节。

## 三、M1 对象模型

聚合根字段：`id`、`name`、`alias`、`aggregateType: AGGREGATE_ROOT`、`description`、`lifecycle[]`、`tags[]`、`attributes[]`、`entities[]`、`valueObjects[]`、`invariants[]`。

```yaml
aggregates:
  - id: AGG-CONTRACT-001
    name: 合同
    alias: Contract
    aggregateType: AGGREGATE_ROOT
    description: 客户签订的销售合同，含标的明细与付款条款
    lifecycle: [草稿, 已提交, 审批中, 已生效, 已关闭, 已终止]
    tags: [核心域]
    attributes:
      - name: contractNo
        label: 合同编号
        type: String
        required: true
        unique: true
      - name: totalAmount
        label: 合同金额
        type: Decimal
        required: true
        refRules:
          - name: 合同金额必须为正数
            expression: "value > 0"
            violationMessage: 合同金额必须大于0
            enforcedAt: ALWAYS
      - name: customerId
        label: 客户ID
        type: AggregateRootRef
        targetAggregate: AGG-CUSTOMER-001
        required: true
      - name: status
        label: 合同状态
        type: Enum
        enumValues: [草稿, 已提交, 审批中, 已生效, 已关闭, 已终止]
        required: true
    entities:
      - name: 合同标的明细
        alias: ContractItem
        localId: itemId
        cardinality: ONE_OR_MORE
        cascadeDelete: true
        attributes:
          - {name: itemId, label: 明细ID, type: String, required: true}
          - {name: quantity, label: 数量, type: Integer, required: true}
    valueObjects:
      - name: 付款条款
        alias: PaymentTerm
        immutable: true
        equalityFields: [termNo, termType]
        attributes:
          - {name: termNo, label: 条款号, type: String, required: true}
    invariants:
      - name: 明细金额合计一致
        expression: "totalAmount == SUM(items.subtotal)"
        violationMessage: 合同总额必须等于明细小计之和
        enforcedAt: ALWAYS

data_dictionaries:
  - id: DICT-CONTRACT-BASE
    name: 合同基础字典
    types:
      - typeCode: CONTRACT_TYPE
        typeName: 合同类型
        items:
          - {code: SALES, label: 销售合同, enabled: true, sortOrder: 10}

aggregate_associations:
  - id: ASSOC-001
    sourceAggregate: AGG-CONTRACT-001
    targetAggregate: AGG-CUSTOMER-001
    associationType: REFERENCE
    sourceRole: 所属客户
    targetRole: 客户合同
    cardinality: MANY_TO_ONE
    referenceField: customerId
```

约束规则判定顺序：能用内置字段（`required`/`unique`/枚举/字典）表达的，用内置字段；只依赖本属性的用 `refRules`；依赖同一聚合多属性或子实体的用 `invariants`；其余才进 M3。

## 四、M2 行为模型

行为字段：`id`、`name`、`ownerEntity`、`behaviorType`（`COMMAND`/`QUERY`/`EVENT_HANDLER`）、`triggerType`（`USER_ACTION`/`SYSTEM`/`EVENT`/`EXTERNAL`）、`preconditions[]`、`postconditions[]`、`appliedRules[]`、`requiredPermissions[]`、`producedEvents[]`、`queryReportRef`。

```yaml
behaviors:
  - id: Contract_Submit
    name: 提交合同
    ownerEntity: AGG-CONTRACT-001
    behaviorType: COMMAND
    triggerType: USER_ACTION
    preconditions:
      - "contract.status == '草稿'"
    postconditions:
      - {field: contract.status, setValue: "已提交"}
      - {field: contract.submittedAt, setValue: NOW()}
    appliedRules: [RULE-CONTRACT-REQ-001]
    requiredPermissions: [PERM-CONTRACT-SUBMIT]
    producedEvents: [Contract.Submitted]

  - id: Contract_QueryExecution
    name: 查询合同执行情况
    ownerEntity: AGG-CONTRACT-001
    behaviorType: QUERY
    triggerType: USER_ACTION
    preconditions: []
    postconditions: []
    appliedRules: []
    requiredPermissions: [PERM-CONTRACT-QUERY]
    producedEvents: []
    queryReportRef: QR-CONTRACT-EXECUTION-001
```

约束：`producedEvents` 只写事件 ID，完整定义在 ME；`queryReportRef` 只出现在 `behaviorType=QUERY` 且与 M7 `behaviorRef` 严格一对一。

## 五、M3 规则模型

通用规则字段：`id`、`name`、`ruleType`（`VALIDATION`/`CALCULATION`/`DERIVATION`/`TRANSFORMATION`/`RISK`/`EVENT_DRIVEN`）、`description`、`inputParams[]`、`outputType`、`expression`、`reusedBy[]`、`externalEngine`、`version`。

事件驱动规则追加：`triggerType: EVENT`、`subscribedEvents[]`、`triggeredBehaviors[]`、`producedEvents[]`（可选）、`eventTriggerCondition`、`executionMode`（`SYNC`/`ASYNC`）、`timeout`。

```yaml
rules:
  - id: RULE-CONTRACT-CLOSE-CHECK
    name: 合同关闭资格校验
    ruleType: EVENT_DRIVEN
    description: 收款记录后判断合同是否满足关闭条件
    triggerType: EVENT
    subscribedEvents: [Payment.Recorded]
    inputParams:
      - {name: contractId, type: String, sourceField: event.payload.contractId, required: true}
      - {name: receivedAmount, type: Decimal, sourceField: event.payload.receivedAmount, required: true}
    expression: |
      contractAmount = ContractService.getTotalAmount(contractId)
      RETURN { canClose: receivedAmount >= contractAmount }
    outputType: Object
    triggeredBehaviors: [Contract_Close]
    executionMode: SYNC
    version: "1.0"

  - id: RULE-PAY-001
    name: 支付金额一致性验证
    ruleType: VALIDATION
    inputParams:
      - {name: paymentAmount, type: Decimal, sourceField: Payment.amount, required: true}
      - {name: orderAmount, type: Decimal, sourceField: Order.totalAmount, required: true}
    outputType: Boolean
    expression: "ABS(paymentAmount - orderAmount) <= 0.01"
    reusedBy: [Order_ConfirmPayment]
    version: "1.2"
```

约束：规则表达式必须无副作用；事件驱动规则的 `subscribedEvents` 必须与 ME 事件 `subscribers` 双向一致。

## 六、ME 事件模型

事件字段：`eventId`、`eventName`、`description`、`producerType`（`BEHAVIOR`/`RULE`）、`producerBehaviorRef` / `producerRuleRef`、`producerEntityRef`、`triggerCondition`、`payload[]`、`subscribers[]`、`ordering`（`AT_LEAST_ONCE`/`EXACTLY_ONCE`/`BEST_EFFORT`）、`version`。

```yaml
events:
  - eventId: Contract.Submitted
    eventName: 合同已提交
    description: 合同提交行为成功后形成的业务事实
    producerType: BEHAVIOR
    producerBehaviorRef: Contract_Submit
    producerEntityRef: AGG-CONTRACT-001
    triggerCondition: "postcondition.success == true"
    payload:
      - {name: contractId, type: String, required: true, sourceField: contract.contractId}
      - {name: totalAmount, type: Decimal, required: true, sourceField: contract.totalAmount}
    subscribers:
      - subscriberType: BEHAVIOR
        subscriberBehaviorRef: Flow_StartContractApproval
        subscriberEntityRef: AGG-FLOW-INSTANCE-001
        priority: 1
    ordering: AT_LEAST_ONCE
    version: "1.0"
```

约束：每个事件有且仅有一个生产者；事件命名用过去时；`triggerCondition` 只描述生产行为成功或源对象已变化，禁止写入业务资格判断。

## 七、M4 场景模型

场景字段：`id`、`name`、`description`、`sourceObjectRef`、`targetObjectRefs[]`、`triggerEventRef`、`preconditions[]`、`postconditions[]`、`steps[]`；步骤字段：`stepId`、`stepType`（`BEHAVIOR_CALL`/`EVENT_EMIT`/`RULE_EVALUATE`）、`behaviorRef`、`eventRef`、`ruleRef`、`nextSteps[]`。

```yaml
event_scenarios:
  - id: SCN-CONTRACT-001
    name: 收款完成驱动合同关闭
    description: 收款录入后经事实事件与资格校验驱动合同关闭
    sourceObjectRef: AGG-PAYMENT-001
    targetObjectRefs: [AGG-CONTRACT-001]
    triggerEventRef: Payment.Recorded
    preconditions: ["收款记录已成功保存"]
    postconditions: ["满足条件时合同状态变为已关闭"]
    steps:
      - {stepId: S01, stepType: BEHAVIOR_CALL, behaviorRef: Payment_Record, nextSteps: [S02]}
      - {stepId: S02, stepType: EVENT_EMIT, eventRef: Payment.Recorded, nextSteps: [S03]}
      - {stepId: S03, stepType: RULE_EVALUATE, ruleRef: RULE-CONTRACT-CLOSE-CHECK, nextSteps: [S04]}
      - {stepId: S04, stepType: BEHAVIOR_CALL, behaviorRef: Contract_Close, nextSteps: []}
```

约束：场景只允许三类步骤；禁止出现 `GATEWAY`、`USER_TASK`、`APPROVAL_TASK`、`SUB_FLOW_CALL`；`EVENT_EMIT` 前的 `BEHAVIOR_CALL` 必须等于该事件的生产行为；无条件协同可省略 `RULE_EVALUATE`。

## 八、M5 主体模型

```yaml
actors:
  - actorId: ACTOR-FINANCE-MANAGER
    name: 财务经理
    actorType: HUMAN
    roles: [ROLE-FINANCE-MANAGER]

roles:
  - roleId: ROLE-FINANCE-MANAGER
    name: 财务经理
    inheritsFrom: []
    permissions: [PERM-CONTRACT-APPROVE-FINANCE]

permissions:
  - permissionId: PERM-CONTRACT-APPROVE-FINANCE
    targetType: BEHAVIOR
    targetRef: Contract_ApproveFinance
    dataScope: ALL
    abacCondition: "actor.dept == contract.dept"
```

`actorType` 取 `HUMAN`/`SYSTEM`/`EXTERNAL`；`EXTERNAL` 参与者必须填 `externalContract`（`protocol`/`dataFormat`/`authMethod`/`timeoutMs`）。`dataScope` 取 `ALL`/`OWN`/`DEPT`/`CUSTOM`。角色是 M6 人工活动的唯一参与人类型。

## 九、M6 流程模型

流程字段：`id`、`name`、`flowType`（`COLLABORATION`/`APPROVAL`）、`description`、`businessObjectRefs[]`、`roleRefs[]`、`trigger`、`preconditions[]`、`postconditions[]`、`startActivity`、`endActivities[]`、`activities[]`、`version`。

活动字段：`activityId`、`name`、`activityType`、`roleRef`、`behaviorRef`、`scenarioRef`、`subFlowRef`、`ruleRef`、`conditionExpression`、`approvalOutcomes[]`、`eventRef`、`timeout`、`nextActivities[]`、`branches[]`。

`activityType` 取 `START`/`END`/`USER_TASK`/`APPROVAL_TASK`/`SYSTEM_TASK`/`BEHAVIOR_CALL`/`SCENARIO_CALL`/`SUB_FLOW_CALL`/`GATEWAY`/`EVENT_WAIT`；`trigger.triggerType` 取 `MANUAL`/`BEHAVIOR`/`EVENT`/`SCHEDULE`/`SUB_FLOW`。

```yaml
flows:
  - id: FLOW-CONTRACT-APPROVAL-001
    name: 合同审批流
    flowType: APPROVAL
    businessObjectRefs: [AGG-CONTRACT-001]
    roleRefs: [ROLE-FINANCE-MANAGER, ROLE-GENERAL-MANAGER]
    trigger:
      triggerType: BEHAVIOR
      behaviorRef: Contract_Submit
    postconditions: ["合同审批通过、驳回或退回修改"]
    startActivity: P01
    endActivities: [P07, P08]
    activities:
      - {activityId: P01, name: 开始, activityType: START, nextActivities: [P02]}
      - activityId: P02
        name: 财务经理审批
        activityType: APPROVAL_TASK
        roleRef: ROLE-FINANCE-MANAGER
        behaviorRef: Contract_ApproveFinance
        approvalOutcomes: [APPROVE, REJECT, RETURN]
        nextActivities: [P03]
      - activityId: P03
        name: 财务审批结果判断
        activityType: GATEWAY
        branches:
          - {branchName: 驳回或退回, conditionExpression: "approval.outcome IN ['REJECT','RETURN']", targetActivity: P08, isDefault: false}
          - {branchName: 财务审批通过, conditionExpression: "approval.outcome == 'APPROVE'", targetActivity: P04, isDefault: true}
      - {activityId: P04, name: 标记审批通过, activityType: BEHAVIOR_CALL, behaviorRef: Contract_MarkApproved, nextActivities: [P07]}
      - {activityId: P07, name: 审批通过结束, activityType: END, nextActivities: []}
      - {activityId: P08, name: 驳回或退回结束, activityType: END, nextActivities: []}
    version: "1.0"
```

约束：每条流程有且仅有一个开始活动与至少一个结束活动；人工活动的 `roleRef` 必须属于流程 `roleRefs`；网关至少两个分支、最多一个默认分支；`SUB_FLOW_CALL` 调用图无环；审批流必须覆盖通过、驳回、退回。

## 十、M7 查询统计与报表模型（可选）

对象字段：`id`、`name`、`alias`、`objectType`（`DETAIL_QUERY`/`LIST_QUERY`/`STATISTICAL_QUERY`/`REPORT`）、`description`、`behaviorRef`、`sourceObjects[]`、`joins[]`、`parameters[]`、`conditions[]`、`resultColumns[]`、`groupBy[]`、`having[]`、`orderBy[]`、`pagination`、`reportOptions`、`referenceSql`、`version`。

```yaml
query_reports:
  - id: QR-CONTRACT-EXECUTION-001
    name: 合同执行情况分析
    alias: contractExecution
    objectType: LIST_QUERY
    description: 按合同查询开票与收款执行情况
    behaviorRef: Contract_QueryExecution
    sourceObjects:
      - {objectRef: AGG-CONTRACT-001, alias: contract, primary: true}
      - {objectRef: AGG-INVOICE-001, alias: invoice, primary: false}
    joins:
      - {joinId: J01, joinType: LEFT, leftSource: contract, rightSource: invoice,
         conditionExpression: "invoice.contractId == contract.contractId"}
    parameters:
      - {name: contractNo, label: 合同编号, dataType: String, required: false, allowedOperators: [EQ, LIKE]}
    conditions:
      - {conditionId: C01, leftExpression: "contract.contractNo", operator: LIKE,
         parameterRef: contractNo, logicalConnector: AND, skipWhenParameterEmpty: true}
    resultColumns:
      - {name: contractNo, label: 合同编号, dataType: String, sourceExpression: "contract.contractNo", aggregateFunction: NONE}
      - {name: invoicedAmount, label: 已开票金额, dataType: Decimal,
         sourceExpression: "SUM(invoice.amount)", aggregateFunction: SUM}
    version: "1.0"
```

约束：M7 只直接引用 M1 对象字段与唯一 M2 `QUERY` 行为；禁止引用规则、事件、场景、权限、流程；每个对象有且仅有一个主来源；多个一对多来源同时参与聚合时必须先按关联键预聚合。

## 十一、MU UI 模型（可选）

屏幕字段：`screenId`、`name`、`screenRef`、`layout`、`elements[]`、`navigation[]`、`events[]`；事件字段：`eventId`、`name`、`source`、`permissions[]`、`preConditions[]`、`callChain[]`；调用链步骤 `step` 取 `VALIDATE`/`BEHAVIOR_CALL`/`EVENT_EMIT`/`SCENARIO_CALL`/`REPORT_CALL`/`QUERY_REPORT`/`NAVIGATE`/`CLOSE_MODAL`/`EXIT`/`DEVICE_SETUP`/`TOGGLE_INPUT`。

```yaml
screens:
  - screenId: frmContract
    name: 合同登记
    elements:
      - {id: txtContractNo, type: TEXTBOX, label: 合同编号, io: I, required: true, dataBinding: Contract.contractNo}
      - {id: tbrMenu, type: TOOLBAR, label: SAVE | SUBMIT}
    navigation:
      - {to: frmDashboard, trigger: 关闭 / Esc}
    events:
      - eventId: frmContract.tbrMenu_ButtonClick.SAVE
        name: 保存合同
        source: 工具栏 SAVE / Ctrl+S
        permissions: [PERM-CONTRACT-CREATE]
        callChain:
          - {step: VALIDATE, rules: [RULE-CONTRACT-REQ-001]}
          - {step: BEHAVIOR_CALL, behaviorRef: Contract_SaveContract}
          - {step: EVENT_EMIT, eventRef: Contract.Saved}
```

调用链顺序：`VALIDATE` 在 `BEHAVIOR_CALL` 之前；`EVENT_EMIT` 紧跟生产该事件的行为；`SCENARIO_CALL` 在触发事件之后；`REPORT_CALL`/`QUERY_REPORT` 在行为之后；`NAVIGATE` 收尾。`layout` 用 ASCII 绘制，元素 ID 必须与 `elements` 一致。

## 十二、MM 对象-数据表映射模型（可选）

```yaml
mappings:
  - id: M-MAP-CONTRACT-001
    objectRef: AGG-CONTRACT-001
    objectRole: AGGREGATE_ROOT
    objectName: 合同
    tableMappings:
      - tableName: contracts
        tableRole: MASTER
        primaryKey: contract_id
        columnMappings:
          - {attributeRef: "Contract.contractNo", column: contract_no, columnType: "VARCHAR2(32)",
             nullable: false, unique: true, isPrimaryKey: false}
          - {attributeRef: "Contract.customerId", column: customer_id, columnType: "VARCHAR2(32)",
             isForeignKey: true, fkTargetTable: customers, fkTargetColumn: customer_id}
      - tableName: contract_items
        tableRole: DETAIL
        foreignKeys:
          - {fkName: fk_contract_item, localColumn: contract_id, targetTable: contracts,
             targetColumn: contract_id, associationRef: ASSOC-001}
    mappingNote: 合同标的明细映射到从表；付款条款按前缀平铺到主表
```

约束：每个持久化聚合根与子实体至少一张表映射；`DictionaryRef` 映射为存 code 的列；`AggregateRootRef` 映射为目标聚合根主表外键列；索引、分区、迁移脚本禁止进 MM。

## 十三、MI 接口模型（可选）

字段：`interfaceId`、`name`、`interfaceType`（`PROVIDED`/`DEPENDENT`）、`providerSystem`、`consumerSystem`、`interfaceCategory`（`QUERY`/`COMMAND`/`NOTIFICATION`）、`businessPurpose`、`invokeScenario`、`inputParameters[]`、`outputResult[]`、`returnRule[]`、`relatedBehaviorRef[]`、`relatedEntityRef[]`、`relatedReportRef[]`、`relatedEventRef[]`、`relatedExternalEntityRef[]`、`protocol`、`dataFormat`、`authMethod`、`timeoutMs`、`idempotency`、`contractNote`。

```yaml
interfaces:
  - interfaceId: INT-001
    name: 合同信息查询接口
    interfaceType: PROVIDED
    providerSystem: 合同管理系统
    consumerSystem: 集团财务系统
    interfaceCategory: QUERY
    businessPurpose: 供外部系统按合同编号查询合同基本信息
    invokeScenario: 财务系统对账时调用
    inputParameters:
      - {name: contractNo, label: 合同编号, dataType: String, required: true, sourceField: Contract.contractNo}
    outputResult:
      - {name: contractName, label: 合同名称, dataType: String, required: true, sourceField: Contract.contractName}
      - {name: totalAmount, label: 合同金额, dataType: Decimal, required: true, sourceField: Contract.totalAmount}
    returnRule:
      - 无记录时返回空结果集
      - 参数缺失时返回参数错误
    relatedBehaviorRef: [Contract_QueryInfo]
    relatedEntityRef: [AGG-CONTRACT-001]
    protocol: REST
    dataFormat: JSON
    authMethod: OAuth2
    idempotency: IDEMPOTENT
```

约束：`QUERY` 类接口禁止改变对象状态；`PROVIDED` 接口必须有 M2 `EXTERNAL_CALL` 行为承接；事件型接口通过 `relatedEventRef` 复用 ME 载荷语义；字段口径与 M1 属性或 M7 结果列对齐。

## 十四、建模顺序与依赖

| 阶段 | 建模对象 | 依赖 |
| --- | --- | --- |
| 1 | M1 对象模型 | 无 |
| 2 | M5 参与方与角色 | M1 |
| 3 | M3 规则模型 | M1 |
| 4 | M2 行为模型 | M1、M3、M5 |
| 5 | M7 查询报表（可选） | M1、M2 `QUERY` |
| 6 | ME 事件模型 | M2、M3 |
| 7 | M5 权限 | M2 |
| 8 | M4 场景模型 | M1、M2、M3、ME |
| 9 | M6 流程模型 | M1、M2、M3、ME、M4、M5 |
| 10 | MU UI 模型（可选） | M1–M7、ME |
| 11 | MM 映射模型（可选） | M1、DDL |
| 12 | MI 接口模型（可选） | M1、M2、M7、M5、ME |

核心依赖链：`M3 → M2 → ME → M4 → M6`；`M1` 是全部模型的基础；`MU` 只引用不重定义；`MM` 以 M1 与 DDL 为准；`MI` 是系统边界契约层。M4 禁止反向引用 M6。
