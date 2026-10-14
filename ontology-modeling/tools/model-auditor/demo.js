export const DEMO = [
['m1-object-model.yaml', `model_type: OBJECT
version: "1.0"
domain: 合同示例（非真实业务）
aggregates:
  - id: AGG-CONTRACT-001
    name: 合同
    alias: Contract
    description: 示例模型，用于体验跨模型审计。
    lifecycle: [草稿, 已提交, 已关闭]
    attributes:
      - {name: contractId, label: 合同 ID, type: String, required: true, unique: true}
      - {name: totalAmount, label: 合同金额, type: Decimal, required: true}
      - {name: status, label: 合同状态, type: Enum, enumValues: [草稿, 已提交, 已关闭]}
    invariants:
      - name: 金额必须为正
        expression: totalAmount > 0
    entities: []
    valueObjects: []
  - id: AGG-PAYMENT-001
    name: 收款
    alias: Payment
    lifecycle: [已记录]
    attributes:
      - {name: contractId, type: AggregateRootRef, targetAggregate: AGG-CONTRACT-001}
      - {name: receivedAmount, type: Decimal, required: true}
`],
['m2-behavior-model.yaml', `model_type: BEHAVIOR
version: "1.0"
domain: 合同示例（非真实业务）
behaviors:
  - id: Contract_Submit
    name: 提交合同
    ownerEntity: AGG-CONTRACT-001
    behaviorType: COMMAND
    triggerType: USER_ACTION
    preconditions: ["contract.status == '草稿'"]
    postconditions: [{field: contract.status, setValue: 已提交}]
    requiredPermissions: [PERM-CONTRACT-SUBMIT]
    producedEvents: [Contract.Submitted]
  - id: Payment_Record
    name: 记录收款
    ownerEntity: AGG-PAYMENT-001
    behaviorType: COMMAND
    triggerType: USER_ACTION
    preconditions: ["receivedAmount > 0"]
    producedEvents: [Payment.Recorded]
  - id: Contract_Close
    name: 关闭合同
    ownerEntity: AGG-CONTRACT-001
    behaviorType: EVENT_HANDLER
    triggerType: EVENT
    preconditions: ["contract.status == '已提交'"]
    postconditions: [{field: contract.status, setValue: 已关闭}]
    producedEvents: []
`],
['m3-rule-model.yaml', `model_type: RULE
version: "1.0"
domain: 合同示例（非真实业务）
rules:
  - id: RULE-CONTRACT-CLOSE
    name: 收款足额校验
    ruleType: EVENT_DRIVEN
    triggerType: EVENT
    subscribedEvents: [Payment.Recorded]
    expression: |
      RETURN event.payload.receivedAmount >= contract.totalAmount
    triggeredBehaviors: [Contract_Close]
    executionMode: ASYNC
`],
['me-event-model.yaml', `model_type: EVENT
version: "1.0"
domain: 合同示例（非真实业务）
events:
  - eventId: Contract.Submitted
    eventName: 合同已提交
    producerType: BEHAVIOR
    producerBehaviorRef: Contract_Submit
    producerEntityRef: AGG-CONTRACT-001
    triggerCondition: postcondition.success == true
    payload: [{name: contractId, type: String, required: true}]
    subscribers: []
  - eventId: Payment.Recorded
    eventName: 收款已记录
    producerType: BEHAVIOR
    producerBehaviorRef: Payment_Record
    producerEntityRef: AGG-PAYMENT-001
    triggerCondition: postcondition.success == true
    payload:
      - {name: contractId, type: String, required: true}
      - {name: receivedAmount, type: Decimal, required: true}
    subscribers: [{subscriberType: RULE, subscriberRuleRef: RULE-CONTRACT-CLOSE}]
`]
];
DEMO.push(
['m4-scenario-model.yaml', `model_type: SCENARIO
version: "1.0"
domain: 合同示例（非真实业务）
event_scenarios:
  - id: SCN-CONTRACT-CLOSE
    name: 收款驱动合同关闭
    sourceObjectRef: AGG-PAYMENT-001
    targetObjectRefs: [AGG-CONTRACT-001]
    triggerEventRef: Payment.Recorded
    preconditions: [收款已成功保存]
    postconditions: [满足足额条件时关闭合同]
    steps:
      - {stepId: S01, stepType: BEHAVIOR_CALL, behaviorRef: Payment_Record, nextSteps: [S02]}
      - {stepId: S02, stepType: EVENT_EMIT, eventRef: Payment.Recorded, nextSteps: [S03]}
      - {stepId: S03, stepType: RULE_EVALUATE, ruleRef: RULE-CONTRACT-CLOSE, nextSteps: [S04]}
      - {stepId: S04, stepType: BEHAVIOR_CALL, behaviorRef: Contract_Close, nextSteps: []}
`],
['m5-actor-model.yaml', `model_type: ACTOR
version: "1.0"
domain: 合同示例（非真实业务）
actors:
  - {actorId: ACTOR-SALES, name: 销售人员, actorType: HUMAN, roles: [ROLE-SALES]}
roles:
  - roleId: ROLE-SALES
    name: 销售角色
    permissions: [PERM-CONTRACT-SUBMIT]
    inheritsFrom: []
permissions:
  - permissionId: PERM-CONTRACT-SUBMIT
    targetType: BEHAVIOR
    targetRef: Contract_Submit
    dataScope: OWN
    abacCondition: actor.id == contract.ownerId
`],
['m6-flow-model.yaml', `model_type: FLOW
version: "1.0"
domain: 合同示例（非真实业务）
flows:
  - id: FLOW-CONTRACT-SUBMIT
    name: 合同提交流程
    flowType: COLLABORATION
    businessObjectRefs: [AGG-CONTRACT-001]
    roleRefs: [ROLE-SALES]
    trigger: {triggerType: MANUAL}
    startActivity: A01
    endActivities: [A03]
    activities:
      - {activityId: A01, name: 开始, activityType: START, nextActivities: [A02]}
      - {activityId: A02, name: 销售提交, activityType: USER_TASK, roleRef: ROLE-SALES, behaviorRef: Contract_Submit, nextActivities: [A03]}
      - {activityId: A03, name: 结束, activityType: END, nextActivities: []}
`]
);
