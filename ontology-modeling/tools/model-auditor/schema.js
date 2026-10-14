export const SECTIONS = [
  ['aggregates','M1','对象','id'], ['data_dictionaries','M1','字典','id'],
  ['aggregate_associations','M1','关联','id'], ['behaviors','M2','行为','id'],
  ['rules','M3','规则','id'], ['events','ME','事件','eventId'],
  ['event_scenarios','M4','场景','id'], ['actors','M5','参与者','actorId'],
  ['roles','M5','角色','roleId'], ['permissions','M5','权限','permissionId'],
  ['flows','M6','流程','id'], ['query_reports','M7','查询报表','id'],
  ['screens','MU','界面','screenId'], ['mappings','MM','映射','id'],
  ['interfaces','MI','接口','interfaceId']
];
export const BY_SECTION = new Map(SECTIONS.map(row => [row[0], row]));
export const REFS = {
  ownerEntity:'aggregates', targetAggregate:'aggregates', sourceAggregate:'aggregates',
  producerEntityRef:'aggregates', subscriberEntityRef:'aggregates',
  sourceObjectRef:'aggregates', targetObjectRefs:'aggregates',
  businessObjectRefs:'aggregates', objectRef:'aggregates', relatedEntityRef:'aggregates',
  appliedRules:'rules', ruleRef:'rules', rules:'rules',
  producedEvents:'events', subscribedEvents:'events', eventRef:'events',
  triggerEventRef:'events', relatedEventRef:'events',
  producerBehaviorRef:'behaviors', subscriberBehaviorRef:'behaviors',
  behaviorRef:'behaviors', relatedBehaviorRef:'behaviors', triggeredBehaviors:'behaviors',
  reusedBy:'behaviors', producerRuleRef:'rules', subscriberRuleRef:'rules',
  scenarioRef:'event_scenarios', subFlowRef:'flows', flowRef:'flows',
  roleRef:'roles', roleRefs:'roles', roles:'roles', inheritsFrom:'roles',
  requiredPermissions:'permissions', permissions:'permissions',
  queryReportRef:'query_reports', reportRef:'query_reports', relatedReportRef:'query_reports',
  screenRef:'screens', associationRef:'aggregate_associations',
  relatedExternalEntityRef:'actors'
};
export const LOCAL_REFS = {
  nextSteps:'step', nextActivities:'activity', startActivity:'activity',
  endActivities:'activity', targetActivity:'activity'
};
export const LABELS = {
  attributes:'属性', entities:'子实体', valueObjects:'值对象', invariants:'聚合不变性',
  lifecycle:'生命周期状态', preconditions:'前置条件', preConditions:'前置条件',
  postconditions:'后置条件', expression:'规则表达式', eventTriggerCondition:'事件触发条件',
  triggerCondition:'生产条件', payload:'事件载荷', subscribers:'订阅者',
  steps:'场景步骤', activities:'流程活动', trigger:'触发方式', branches:'分支',
  requiredPermissions:'所需权限', appliedRules:'应用规则', producedEvents:'生产事件',
  subscribedEvents:'订阅事件', triggeredBehaviors:'触发行为', reusedBy:'复用方',
  parameters:'查询参数', conditions:'查询条件', resultColumns:'结果列',
  referenceSql:'参考 SQL（只读，不执行）', inputParams:'输入参数',
  inputParameters:'接口输入', outputResult:'接口输出', returnRule:'返回规则',
  callChain:'调用链', elements:'界面元素', navigation:'界面导航',
  tableMappings:'表映射', permissions:'权限', roles:'角色', inheritsFrom:'继承角色',
  targetRef:'权限目标', dataScope:'数据范围', abacCondition:'ABAC 条件',
  ordering:'投递语义', executionMode:'执行模式', timeout:'超时',
  name:'名称', id:'ID', ownerEntity:'所属对象', behaviorType:'行为类型',
  ruleType:'规则类型', description:'说明', sourceObjects:'查询来源',
  joins:'关联条件', approvalOutcomes:'审批结果', conditionExpression:'分支条件',
  eventId:'事件 ID', activityId:'活动 ID', stepId:'步骤 ID'
};
export const label = key => Object.hasOwn(LABELS,key) ? LABELS[key] : key;
export const esc = value => (value!==null&&typeof value==='object'?JSON.stringify(value):String(value ?? '')).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const LIMITS = {fileBytes:12*1024*1024, totalBytes:40*1024*1024,
  files:80, nodes:250000, depth:70};
