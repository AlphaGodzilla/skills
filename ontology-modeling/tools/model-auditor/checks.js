export function runChecks(index) {
  const {records,addIssue}=index;
  const arr=v=>Array.isArray(v)?v:[];
  const unique=(section,id)=>{const list=index.definitions.get(JSON.stringify([section,id]))||[];return list.length===1?list[0]:null;};
  for (const r of records) {
    const d=r.data, issue=(message,path=[])=>addIssue('check',message,r,path);
    if (r.section==='aggregates'&&!arr(d.lifecycle).length) issue('对象未声明非空 lifecycle；请人工核查生命周期。');
    if (r.section==='behaviors'&&!d.ownerEntity) issue('行为缺少 ownerEntity。');
    if (r.section==='events') {
      const producers=[d.producerBehaviorRef,d.producerRuleRef].filter(Boolean);
      if (producers.length!==1) issue('事件必须且只能声明一个生产者引用。');
      const section=d.producerType==='BEHAVIOR'?'behaviors':d.producerType==='RULE'?'rules':null;
      if (!section) issue('事件 producerType 应为 BEHAVIOR 或 RULE。');
      const id=section==='behaviors'?d.producerBehaviorRef:d.producerRuleRef;
      if (section&&!id) issue('生产者类型与引用字段不匹配。');
      const producer=section&&unique(section,id);
      if (producer&&!arr(producer.data.producedEvents).includes(r.id)) issue('ME 生产者与源定义 producedEvents 不一致。');
      for (const [i,s] of arr(d.subscribers).entries()) {
        if (s?.subscriberType!=='RULE') continue;
        const rule=unique('rules',s.subscriberRuleRef);
        if (rule&&!arr(rule.data.subscribedEvents).includes(r.id)) issue('ME 订阅规则未在 subscribedEvents 中声明本事件。',['subscribers',i]);
      }
    }
    if (['behaviors','rules'].includes(r.section)) for (const id of arr(d.producedEvents)) {
      const event=unique('events',id);
      const field=r.section==='behaviors'?'producerBehaviorRef':'producerRuleRef';
      if (event&&event.data[field]!==r.id) issue('producedEvents 与 ME 生产者引用不一致。',['producedEvents']);
    }
    if (r.section==='rules') for (const id of arr(d.subscribedEvents)) {
      const event=unique('events',id);
      if (event&&!arr(event.data.subscribers).some(s=>s?.subscriberType==='RULE'&&s.subscriberRuleRef===r.id)) issue('规则订阅事件未在 ME subscribers 中镜像声明。',['subscribedEvents']);
    }
    if (r.section==='event_scenarios') for (const [i,s] of arr(d.steps).entries()) {
      if (!['BEHAVIOR_CALL','EVENT_EMIT','RULE_EVALUATE'].includes(s?.stepType)) issue('M4 只允许 BEHAVIOR_CALL / EVENT_EMIT / RULE_EVALUATE。',['steps',i]);
    }
    if (r.section==='flows') {
      if (!d.startActivity||!arr(d.endActivities).length) issue('流程需要 startActivity 和至少一个 endActivities。');
      const activities=arr(d.activities);
      if (activities.filter(a=>a?.activityType==='START').length!==1) issue('流程需要唯一 START 活动。');
      const start=activities.find(a=>a?.activityId===d.startActivity);
      if (start&&start.activityType!=='START') issue('startActivity 未指向 START。');
      for (const id of arr(d.endActivities)) {
        const end=activities.find(a=>a?.activityId===id);
        if (end&&end.activityType!=='END') issue('endActivities 包含非 END 活动。');
      }
      for (const [i,a] of activities.entries()) {
        if (!a) continue;
        if (['USER_TASK','APPROVAL_TASK'].includes(a.activityType)&&!a.roleRef) issue('人工活动缺少 M5 roleRef。',['activities',i]);
        if (a.roleRef&&arr(d.roleRefs).length&&!d.roleRefs.includes(a.roleRef)) issue('活动角色未声明在流程 roleRefs。',['activities',i,'roleRef']);
        for (const [j,b] of arr(a.branches).entries()) if (b&&!b.isDefault&&!b.conditionExpression) issue('非默认分支缺少 conditionExpression。',['activities',i,'branches',j]);
      }
    }
    if (r.section==='query_reports') {
      const behavior=unique('behaviors',d.behaviorRef);
      if (behavior&&(behavior.data.behaviorType!=='QUERY'||behavior.data.queryReportRef!==r.id)) issue('M7 与 M2 QUERY 行为未形成一对一双向引用。');
    }
    if (r.section==='behaviors'&&d.queryReportRef) {
      const report=unique('query_reports',d.queryReportRef);
      if (d.behaviorType!=='QUERY'||(report&&report.data.behaviorRef!==r.id)) issue('queryReportRef 仅适用于 QUERY，且应与 M7 双向一致。');
    }
  }
  return index;
}
