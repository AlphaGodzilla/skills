#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = ["PyYAML>=6.0"]
# ///
"""OMF v6 模型结构完整性与跨模型引用校验器。

用法（推荐用 uv 隔离环境，不污染全局 Python）：
  uv run scripts/omf_validate.py --dir docs/model
  uv run scripts/omf_validate.py --dir docs/model --strict
  uv run scripts/omf_validate.py --dir docs/model --impact Contract_Submit
  uv run scripts/omf_validate.py --dir docs/model --report build/model-validation.md

也可直接用系统 Python 运行（无 PyYAML 时回退 ruby）：
  python3 scripts/omf_validate.py --dir docs/model

检查内容：
  1. 结构：文件存在、根键、必需字段、枚举取值、重复 ID。
  2. 引用：跨模型 ID 是否可解析（悬空引用）。
  3. 同步：M2/M7 一对一、M3 与 ME 订阅双向一致、ME 生产者与 M2/M3 双向一致、
     M4 事件链、M6 角色/子流程/网关/可达性。
  4. 影响面：--impact 打印某 ID 在各文件中的引用位置，用于同步修改。

退出码：0 通过；1 有错误（--strict 时警告亦算错误）；2 环境或必需文件缺失。
YAML 解析优先用 PyYAML，缺失时回退到系统 ruby 的 psych（标准库，无第三方依赖）。
用 `uv run` 时依赖安装在 uv 的隔离环境，不污染全局 Python。
"""
import argparse
import json
import os
import re
import subprocess
import sys

try:
    import yaml as _pyyaml
except Exception:
    _pyyaml = None


MODEL_FILES = {
    "m1": ("m1-object-model.yaml", True),
    "m2": ("m2-behavior-model.yaml", True),
    "m3": ("m3-rule-model.yaml", True),
    "me": ("me-event-model.yaml", True),
    "m4": ("m4-scenario-model.yaml", True),
    "m5": ("m5-actor-model.yaml", True),
    "m6": ("m6-flow-model.yaml", True),
    "m7": ("m7-report-model.yaml", False),
    "mu": ("mu-ui-model.yaml", False),
    "mm": ("m-mapping-model.yaml", False),
    "mi": ("mi-interface-model.yaml", False),
}

ROOTS = {
    "m1": ["aggregates", "data_dictionaries", "aggregate_associations"],
    "m2": ["behaviors"],
    "m3": ["rules"],
    "me": ["events"],
    "m4": ["event_scenarios"],
    "m5": ["actors", "roles", "permissions"],
    "m6": ["flows"],
    "m7": ["query_reports"],
    "mu": ["screens", "cross_cutting"],
    "mm": ["mappings"],
    "mi": ["interfaces"],
}

REQUIRED = {
    "aggregates": ["id", "name", "alias"],
    "behaviors": ["id", "name", "ownerEntity", "behaviorType", "triggerType"],
    "rules": ["id", "name", "ruleType"],
    "events": ["eventId", "eventName", "producerType"],
    "event_scenarios": ["id", "name", "triggerEventRef", "steps"],
    "actors": ["actorId", "actorType"],
    "roles": ["roleId", "name"],
    "permissions": ["permissionId", "targetType", "targetRef"],
    "flows": ["id", "name", "flowType", "startActivity", "endActivities", "activities"],
    "query_reports": ["id", "name", "objectType"],
    "screens": ["screenId", "name", "elements"],
    "mappings": ["id", "objectRef", "tableMappings"],
    "interfaces": ["interfaceId", "name", "interfaceType"],
}

ID_FIELD = {
    "events": "eventId",
    "actors": "actorId",
    "roles": "roleId",
    "permissions": "permissionId",
    "screens": "screenId",
    "interfaces": "interfaceId",
}

ENUMS = {
    "behaviorType": {"COMMAND", "QUERY", "EVENT_HANDLER"},
    "triggerType": {"USER_ACTION", "SYSTEM", "EVENT", "EXTERNAL"},
    "ruleType": {"VALIDATION", "CALCULATION", "DERIVATION", "TRANSFORMATION", "RISK", "EVENT_DRIVEN"},
    "ordering": {"AT_LEAST_ONCE", "EXACTLY_ONCE", "BEST_EFFORT"},
    "actorType": {"HUMAN", "SYSTEM", "EXTERNAL"},
    "targetType": {"BEHAVIOR", "ENTITY"},
    "dataScope": {"ALL", "OWN", "DEPT", "CUSTOM"},
    "flowType": {"COLLABORATION", "APPROVAL"},
    "activityType": {"START", "END", "USER_TASK", "APPROVAL_TASK", "SYSTEM_TASK", "BEHAVIOR_CALL",
                     "SCENARIO_CALL", "SUB_FLOW_CALL", "GATEWAY", "EVENT_WAIT"},
    "objectType": {"DETAIL_QUERY", "LIST_QUERY", "STATISTICAL_QUERY", "REPORT"},
    "interfaceType": {"PROVIDED", "DEPENDENT"},
    "interfaceCategory": {"QUERY", "COMMAND", "NOTIFICATION"},
}

STEP_TYPES = {"BEHAVIOR_CALL", "EVENT_EMIT", "RULE_EVALUATE"}
FLOW_TRIGGERS = {"MANUAL", "BEHAVIOR", "EVENT", "SCHEDULE", "SUB_FLOW"}


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.infos = []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def info(self, msg):
        self.infos.append(msg)


def as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def load_yaml(path):
    text = open(path, encoding="utf-8").read()
    if _pyyaml is not None:
        return _pyyaml.safe_load(text)
    return _ruby_load(text)


def _ruby_load(text):
    code = "begin; print JSON.generate(YAML.safe_load(STDIN.read)); rescue => e; STDERR.puts e.message; exit 1; end"
    proc = subprocess.run(["ruby", "-ryaml", "-rjson", "-e", code],
                          input=text.encode("utf-8"), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError("ruby YAML 解析失败: " + proc.stderr.decode("utf-8", "replace"))
    return json.loads(proc.stdout.decode("utf-8"))


def load_models(root, rep):
    docs = {}
    ydir = os.path.join(root, "yaml")
    if not os.path.isdir(ydir):
        rep.error("缺少模型目录: " + ydir)
        return docs
    for key, (fname, required) in MODEL_FILES.items():
        path = os.path.join(ydir, fname)
        if not os.path.exists(path):
            if required:
                rep.error("缺少必需模型文件: " + path)
            else:
                rep.info("可选模型文件不存在（跳过）: " + fname)
            continue
        try:
            docs[key] = load_yaml(path) or {}
        except Exception as exc:
            rep.error("解析失败 %s: %s" % (fname, exc))
    return docs


def ids_of(items, key):
    out = set()
    for it in as_list(items):
        if isinstance(it, dict) and it.get(key):
            out.add(str(it[key]))
    return out


def check_duplicates(rep, name, items, key):
    seen = {}
    for it in as_list(items):
        if not isinstance(it, dict) or not it.get(key):
            continue
        ident = str(it[key])
        seen[ident] = seen.get(ident, 0) + 1
    for ident, n in sorted(seen.items()):
        if n > 1:
            rep.error("%s: 重复 ID %s（出现 %d 次）" % (name, ident, n))


def check_structure(rep, key, doc):
    for rootkey in ROOTS.get(key, []):
        if rootkey not in doc:
            continue
        items = doc.get(rootkey)
        if items is not None and not isinstance(items, list):
            rep.error("%s.%s 必须是列表" % (key, rootkey))
            continue
        for idx, it in enumerate(as_list(items)):
            loc = "%s.%s[%d]" % (key, rootkey, idx)
            if not isinstance(it, dict):
                rep.error("%s 必须是映射" % loc)
                continue
            for field in REQUIRED.get(rootkey, []):
                if it.get(field) in (None, "", []):
                    rep.error("%s 缺少必需字段 %s" % (loc, field))
            check_enum_fields(rep, loc, it)
            check_nested_structure(rep, loc, rootkey, it)


def check_enum_fields(rep, loc, obj):
    for field, allowed in ENUMS.items():
        if field in obj and obj[field] is not None:
            for v in as_list(obj[field]):
                if isinstance(v, str) and v not in allowed:
                    rep.error("%s.%s 非法取值 %s，允许 %s" % (loc, field, v, sorted(allowed)))


def check_nested_structure(rep, loc, rootkey, obj):
    if rootkey == "behaviors":
        if obj.get("queryReportRef") and obj.get("behaviorType") != "QUERY":
            rep.error("%s: queryReportRef 只允许出现在 behaviorType=QUERY" % loc)
    if rootkey == "rules":
        for p in as_list(obj.get("inputParams")):
            if isinstance(p, dict) and not p.get("name"):
                rep.error("%s.inputParams 缺 name" % loc)
    if rootkey == "events":
        ptype = obj.get("producerType")
        if ptype == "BEHAVIOR" and not obj.get("producerBehaviorRef"):
            rep.error("%s: producerType=BEHAVIOR 必须有 producerBehaviorRef" % loc)
        if ptype == "RULE" and not obj.get("producerRuleRef"):
            rep.error("%s: producerType=RULE 必须有 producerRuleRef" % loc)
        for s in as_list(obj.get("subscribers")):
            if not isinstance(s, dict):
                continue
            st = s.get("subscriberType")
            if st == "BEHAVIOR" and not s.get("subscriberBehaviorRef"):
                rep.error("%s.subscribers: BEHAVIOR 订阅者缺 subscriberBehaviorRef" % loc)
            if st == "RULE" and not s.get("subscriberRuleRef"):
                rep.error("%s.subscribers: RULE 订阅者缺 subscriberRuleRef" % loc)
    if rootkey == "event_scenarios":
        for i, step in enumerate(as_list(obj.get("steps"))):
            if not isinstance(step, dict):
                continue
            st = step.get("stepType")
            if st not in STEP_TYPES:
                rep.error("%s.steps[%d]: stepType 非法 %s" % (loc, i, st))
            if st == "BEHAVIOR_CALL" and not step.get("behaviorRef"):
                rep.error("%s.steps[%d]: BEHAVIOR_CALL 缺 behaviorRef" % (loc, i))
            if st == "EVENT_EMIT" and not step.get("eventRef"):
                rep.error("%s.steps[%d]: EVENT_EMIT 缺 eventRef" % (loc, i))
            if st == "RULE_EVALUATE" and not step.get("ruleRef"):
                rep.error("%s.steps[%d]: RULE_EVALUATE 缺 ruleRef" % (loc, i))
    if rootkey == "flows":
        acts = as_list(obj.get("activities"))
        act_ids = {a.get("activityId") for a in acts if isinstance(a, dict)}
        if obj.get("startActivity") not in act_ids:
            rep.error("%s: startActivity 不在 activities 中" % loc)
        for e in as_list(obj.get("endActivities")):
            if e not in act_ids:
                rep.error("%s: endActivities 含不存在活动 %s" % (loc, e))
        role_refs = set(as_list(obj.get("roleRefs")))
        for a in acts:
            if not isinstance(a, dict):
                continue
            aloc = "%s.activities[%s]" % (loc, a.get("activityId"))
            at = a.get("activityType")
            if at in ("USER_TASK", "APPROVAL_TASK"):
                if not a.get("roleRef"):
                    rep.error("%s: %s 必须填 roleRef" % (aloc, at))
                elif a.get("roleRef") not in role_refs:
                    rep.error("%s: roleRef %s 不在 flow.roleRefs" % (aloc, a.get("roleRef")))
            if at == "GATEWAY":
                branches = as_list(a.get("branches"))
                if len(branches) < 2:
                    rep.error("%s: GATEWAY 至少两个分支" % aloc)
                defaults = [b for b in branches if isinstance(b, dict) and b.get("isDefault")]
                if len(defaults) > 1:
                    rep.error("%s: GATEWAY 最多一个默认分支" % aloc)
                for b in branches:
                    if not isinstance(b, dict):
                        continue
                    if not b.get("isDefault") and not (b.get("ruleRef") or b.get("conditionExpression")
                                                       or b.get("approvalOutcome")):
                        rep.error("%s: 非默认分支 %s 缺少条件" % (aloc, b.get("branchName")))
                    if b.get("targetActivity") not in act_ids:
                        rep.error("%s: 分支目标不存在 %s" % (aloc, b.get("targetActivity")))
            for nxt in as_list(a.get("nextActivities")):
                if nxt not in act_ids:
                    rep.error("%s: nextActivities 含不存在活动 %s" % (aloc, nxt))
        check_flow_cycles(rep, loc, obj)


def check_flow_cycles(rep, loc, flow):
    graph = {}
    for a in as_list(flow.get("activities")):
        if isinstance(a, dict) and a.get("activityType") == "SUB_FLOW_CALL" and a.get("subFlowRef"):
            graph.setdefault(flow.get("id"), set()).add(a["subFlowRef"])
    stack = [flow.get("id")]
    visiting = set()
    visited = set()

    def dfs(node):
        if node in visiting:
            rep.error("%s: SUB_FLOW_CALL 存在循环调用 %s" % (loc, node))
            return
        if node in visited:
            return
        visiting.add(node)
        for nxt in graph.get(node, ()):
            dfs(nxt)
        visiting.discard(node)
        visited.add(node)

    dfs(flow.get("id"))


def collect_ids(docs):
    return {
        "agg": ids_of(docs.get("m1", {}).get("aggregates"), "id"),
        "behavior": ids_of(docs.get("m2", {}).get("behaviors"), "id"),
        "rule": ids_of(docs.get("m3", {}).get("rules"), "id"),
        "event": ids_of(docs.get("me", {}).get("events"), "eventId"),
        "scenario": ids_of(docs.get("m4", {}).get("event_scenarios"), "id"),
        "actor": ids_of(docs.get("m5", {}).get("actors"), "actorId"),
        "role": ids_of(docs.get("m5", {}).get("roles"), "roleId"),
        "perm": ids_of(docs.get("m5", {}).get("permissions"), "permissionId"),
        "flow": ids_of(docs.get("m6", {}).get("flows"), "id"),
        "qr": ids_of(docs.get("m7", {}).get("query_reports"), "id"),
        "screen": ids_of(docs.get("mu", {}).get("screens"), "screenId"),
    }


def ref_error(rep, loc, label, value, idset, optional=False):
    if value in (None, "", []):
        if not optional:
            rep.error("%s: 缺少 %s" % (loc, label))
        return
    for v in as_list(value):
        if not isinstance(v, str):
            continue
        if v not in idset:
            rep.error("%s: %s 引用不存在 -> %s" % (loc, label, v))


def check_references(rep, docs, ids):
    # M1 关联
    for a in as_list(docs.get("m1", {}).get("aggregate_associations")):
        if isinstance(a, dict):
            loc = "m1.assoc[%s]" % a.get("id")
            ref_error(rep, loc, "sourceAggregate", a.get("sourceAggregate"), ids["agg"])
            ref_error(rep, loc, "targetAggregate", a.get("targetAggregate"), ids["agg"])
    for agg in as_list(docs.get("m1", {}).get("aggregates")):
        if not isinstance(agg, dict):
            continue
        for attr in as_list(agg.get("attributes")):
            if isinstance(attr, dict) and attr.get("type") == "AggregateRootRef":
                ref_error(rep, "m1.%s.%s" % (agg.get("id"), attr.get("name")),
                          "targetAggregate", attr.get("targetAggregate"), ids["agg"])

    # M2
    for b in as_list(docs.get("m2", {}).get("behaviors")):
        if not isinstance(b, dict):
            continue
        loc = "m2.%s" % b.get("id")
        ref_error(rep, loc, "ownerEntity", b.get("ownerEntity"), ids["agg"])
        ref_error(rep, loc, "appliedRules", b.get("appliedRules"), ids["rule"], optional=True)
        ref_error(rep, loc, "requiredPermissions", b.get("requiredPermissions"), ids["perm"], optional=True)
        ref_error(rep, loc, "producedEvents", b.get("producedEvents"), ids["event"], optional=True)
        ref_error(rep, loc, "queryReportRef", b.get("queryReportRef"), ids["qr"], optional=True)

    # M3
    for r in as_list(docs.get("m3", {}).get("rules")):
        if not isinstance(r, dict):
            continue
        loc = "m3.%s" % r.get("id")
        ref_error(rep, loc, "reusedBy", r.get("reusedBy"), ids["behavior"], optional=True)
        ref_error(rep, loc, "subscribedEvents", r.get("subscribedEvents"), ids["event"], optional=True)
        ref_error(rep, loc, "triggeredBehaviors", r.get("triggeredBehaviors"), ids["behavior"], optional=True)
        ref_error(rep, loc, "producedEvents", r.get("producedEvents"), ids["event"], optional=True)

    # ME
    for e in as_list(docs.get("me", {}).get("events")):
        if not isinstance(e, dict):
            continue
        loc = "me.%s" % e.get("eventId")
        ref_error(rep, loc, "producerEntityRef", e.get("producerEntityRef"), ids["agg"], optional=True)
        if e.get("producerType") == "BEHAVIOR":
            ref_error(rep, loc, "producerBehaviorRef", e.get("producerBehaviorRef"), ids["behavior"])
        if e.get("producerType") == "RULE":
            ref_error(rep, loc, "producerRuleRef", e.get("producerRuleRef"), ids["rule"])
        for s in as_list(e.get("subscribers")):
            if not isinstance(s, dict):
                continue
            if s.get("subscriberType") == "BEHAVIOR":
                ref_error(rep, loc, "subscriberBehaviorRef", s.get("subscriberBehaviorRef"), ids["behavior"])
            if s.get("subscriberType") == "RULE":
                ref_error(rep, loc, "subscriberRuleRef", s.get("subscriberRuleRef"), ids["rule"])
            ref_error(rep, loc, "subscriberEntityRef", s.get("subscriberEntityRef"), ids["agg"], optional=True)

    # M4
    for s in as_list(docs.get("m4", {}).get("event_scenarios")):
        if not isinstance(s, dict):
            continue
        loc = "m4.%s" % s.get("id")
        ref_error(rep, loc, "sourceObjectRef", s.get("sourceObjectRef"), ids["agg"])
        ref_error(rep, loc, "targetObjectRefs", s.get("targetObjectRefs"), ids["agg"])
        ref_error(rep, loc, "triggerEventRef", s.get("triggerEventRef"), ids["event"])
        for i, step in enumerate(as_list(s.get("steps"))):
            if not isinstance(step, dict):
                continue
            sloc = "%s.steps[%d]" % (loc, i)
            ref_error(rep, sloc, "behaviorRef", step.get("behaviorRef"), ids["behavior"], optional=True)
            ref_error(rep, sloc, "eventRef", step.get("eventRef"), ids["event"], optional=True)
            ref_error(rep, sloc, "ruleRef", step.get("ruleRef"), ids["rule"], optional=True)

    # M5
    for a in as_list(docs.get("m5", {}).get("actors")):
        if isinstance(a, dict):
            ref_error(rep, "m5.%s" % a.get("actorId"), "roles", a.get("roles"), ids["role"], optional=True)
    for r in as_list(docs.get("m5", {}).get("roles")):
        if isinstance(r, dict):
            loc = "m5.%s" % r.get("roleId")
            ref_error(rep, loc, "inheritsFrom", r.get("inheritsFrom"), ids["role"], optional=True)
            ref_error(rep, loc, "permissions", r.get("permissions"), ids["perm"], optional=True)
    for p in as_list(docs.get("m5", {}).get("permissions")):
        if isinstance(p, dict) and p.get("targetType") == "BEHAVIOR":
            ref_error(rep, "m5.%s" % p.get("permissionId"), "targetRef", p.get("targetRef"), ids["behavior"])

    # M6
    for f in as_list(docs.get("m6", {}).get("flows")):
        if not isinstance(f, dict):
            continue
        loc = "m6.%s" % f.get("id")
        ref_error(rep, loc, "businessObjectRefs", f.get("businessObjectRefs"), ids["agg"], optional=True)
        ref_error(rep, loc, "roleRefs", f.get("roleRefs"), ids["role"], optional=True)
        trig = f.get("trigger") or {}
        if isinstance(trig, dict) and trig.get("triggerType") not in (None, "") and trig["triggerType"] not in FLOW_TRIGGERS:
            rep.error("%s: trigger.triggerType 非法 %s" % (loc, trig["triggerType"]))
        if isinstance(trig, dict):
            ref_error(rep, loc, "trigger.behaviorRef", trig.get("behaviorRef"), ids["behavior"], optional=True)
            ref_error(rep, loc, "trigger.eventRef", trig.get("eventRef"), ids["event"], optional=True)
        for a in as_list(f.get("activities")):
            if not isinstance(a, dict):
                continue
            aloc = "%s.activities[%s]" % (loc, a.get("activityId"))
            ref_error(rep, aloc, "roleRef", a.get("roleRef"), ids["role"], optional=True)
            ref_error(rep, aloc, "behaviorRef", a.get("behaviorRef"), ids["behavior"], optional=True)
            ref_error(rep, aloc, "scenarioRef", a.get("scenarioRef"), ids["scenario"], optional=True)
            ref_error(rep, aloc, "subFlowRef", a.get("subFlowRef"), ids["flow"], optional=True)
            ref_error(rep, aloc, "ruleRef", a.get("ruleRef"), ids["rule"], optional=True)
            ref_error(rep, aloc, "eventRef", a.get("eventRef"), ids["event"], optional=True)
            for b in as_list(a.get("branches")):
                if isinstance(b, dict):
                    ref_error(rep, aloc + ".branch", "ruleRef", b.get("ruleRef"), ids["rule"], optional=True)

    # M7
    for q in as_list(docs.get("m7", {}).get("query_reports")):
        if not isinstance(q, dict):
            continue
        loc = "m7.%s" % q.get("id")
        ref_error(rep, loc, "behaviorRef", q.get("behaviorRef"), ids["behavior"])
        for s in as_list(q.get("sourceObjects")):
            if isinstance(s, dict):
                ref_error(rep, loc, "sourceObjectRef", s.get("objectRef"), ids["agg"])

    # MU
    for s in as_list(docs.get("mu", {}).get("screens")):
        if not isinstance(s, dict):
            continue
        loc = "mu.%s" % s.get("screenId")
        for nav in as_list(s.get("navigation")):
            if isinstance(nav, dict) and nav.get("to") not in (None, "EXIT") and nav.get("to") not in ids["screen"]:
                rep.error("%s: navigation.to 引用不存在 -> %s" % (loc, nav.get("to")))
        for ev in as_list(s.get("events")):
            if not isinstance(ev, dict):
                continue
            eloc = "%s.events[%s]" % (loc, ev.get("eventId"))
            for step in as_list(ev.get("callChain")):
                if not isinstance(step, dict):
                    continue
                ref_error(rep, eloc, "rules", step.get("rules"), ids["rule"], optional=True)
                ref_error(rep, eloc, "behaviorRef", step.get("behaviorRef"), ids["behavior"], optional=True)
                ref_error(rep, eloc, "eventRef", step.get("eventRef"), ids["event"], optional=True)
                ref_error(rep, eloc, "scenarioRef", step.get("scenarioRef"), ids["scenario"], optional=True)
                ref_error(rep, eloc, "reportRef", step.get("reportRef"), ids["qr"], optional=True)
                ref_error(rep, eloc, "queryRef", step.get("queryRef"), ids["qr"], optional=True)

    # MI
    for it in as_list(docs.get("mi", {}).get("interfaces")):
        if not isinstance(it, dict):
            continue
        loc = "mi.%s" % it.get("interfaceId")
        ref_error(rep, loc, "relatedBehaviorRef", it.get("relatedBehaviorRef"), ids["behavior"], optional=True)
        ref_error(rep, loc, "relatedEntityRef", it.get("relatedEntityRef"), ids["agg"], optional=True)
        ref_error(rep, loc, "relatedReportRef", it.get("relatedReportRef"), ids["qr"], optional=True)
        ref_error(rep, loc, "relatedEventRef", it.get("relatedEventRef"), ids["event"], optional=True)


def check_sync(rep, docs, ids):
    # M2 与 M7 一对一
    qr = {q.get("id"): q for q in as_list(docs.get("m7", {}).get("query_reports")) if isinstance(q, dict)}
    for b in as_list(docs.get("m2", {}).get("behaviors")):
        if not isinstance(b, dict):
            continue
        q = b.get("queryReportRef")
        if q:
            if q not in qr:
                continue
            if qr[q].get("behaviorRef") != b.get("id"):
                rep.error("同步: m2.%s.queryReportRef=%s 与 m7.%s.behaviorRef=%s 不一致"
                          % (b.get("id"), q, q, qr[q].get("behaviorRef")))
    for qid, q in qr.items():
        bref = q.get("behaviorRef")
        if bref not in ids["behavior"]:
            continue
        owner = next((b for b in as_list(docs.get("m2", {}).get("behaviors"))
                      if isinstance(b, dict) and b.get("id") == bref), None)
        if owner is not None and owner.get("queryReportRef") != qid:
            rep.error("同步: m7.%s.behaviorRef=%s 未在 m2.%s.queryReportRef 回指" % (qid, bref, bref))
        if owner is not None and owner.get("behaviorType") != "QUERY":
            rep.error("同步: m7.%s 绑定的行为 %s 不是 QUERY" % (qid, bref))

    # M3 事件驱动规则 与 ME 订阅 双向一致
    rule_map = {r.get("id"): r for r in as_list(docs.get("m3", {}).get("rules")) if isinstance(r, dict)}
    ev_map = {e.get("eventId"): e for e in as_list(docs.get("me", {}).get("events")) if isinstance(e, dict)}
    for rid, r in rule_map.items():
        for ev in as_list(r.get("subscribedEvents")):
            e = ev_map.get(ev)
            if e is None:
                continue
            subs = [s.get("subscriberRuleRef") for s in as_list(e.get("subscribers"))
                    if isinstance(s, dict) and s.get("subscriberType") == "RULE"]
            if rid not in subs:
                rep.error("同步: m3.%s 订阅 %s，但 me.%s 的 subscribers 未反向包含该规则" % (rid, ev, ev))
    for eid, e in ev_map.items():
        for s in as_list(e.get("subscribers")):
            if isinstance(s, dict) and s.get("subscriberType") == "RULE":
                rr = rule_map.get(s.get("subscriberRuleRef"))
                if rr is not None and eid not in as_list(rr.get("subscribedEvents")):
                    rep.error("同步: me.%s 订阅规则 %s，但该规则 subscribedEvents 未包含本事件"
                              % (eid, s.get("subscriberRuleRef")))

    # ME 生产者 与 M2/M3 双向一致
    be_map = {b.get("id"): b for b in as_list(docs.get("m2", {}).get("behaviors")) if isinstance(b, dict)}
    for eid, e in ev_map.items():
        if e.get("producerType") == "BEHAVIOR":
            b = be_map.get(e.get("producerBehaviorRef"))
            if b is not None and eid not in as_list(b.get("producedEvents")):
                rep.error("同步: me.%s 生产者 %s 未在 m2 的 producedEvents 中声明" % (eid, e.get("producerBehaviorRef")))
        if e.get("producerType") == "RULE":
            r = rule_map.get(e.get("producerRuleRef"))
            if r is not None and eid not in as_list(r.get("producedEvents")):
                rep.error("同步: me.%s 生产者规则 %s 未在 m3 的 producedEvents 中声明" % (eid, e.get("producerRuleRef")))
    for bid, b in be_map.items():
        for ev in as_list(b.get("producedEvents")):
            e = ev_map.get(ev)
            if e is not None and e.get("producerBehaviorRef") != bid:
                rep.error("同步: m2.%s.producedEvents 含 %s，但该事件生产者是 %s"
                          % (bid, ev, e.get("producerBehaviorRef")))

    # M4 事件链
    for s in as_list(docs.get("m4", {}).get("event_scenarios")):
        if not isinstance(s, dict):
            continue
        loc = "m4.%s" % s.get("id")
        emitted = [st.get("eventRef") for st in as_list(s.get("steps"))
                   if isinstance(st, dict) and st.get("stepType") == "EVENT_EMIT"]
        calls = [st.get("behaviorRef") for st in as_list(s.get("steps"))
                 if isinstance(st, dict) and st.get("stepType") == "BEHAVIOR_CALL"]
        if s.get("triggerEventRef") not in emitted:
            rep.error("%s: triggerEventRef 未在 steps 中 EVENT_EMIT" % loc)
        for ev in emitted:
            e = ev_map.get(ev)
            if e is not None and e.get("producerBehaviorRef") not in calls:
                rep.error("%s: 事件 %s 的生产行为 %s 未出现在场景 BEHAVIOR_CALL 中"
                          % (loc, ev, e.get("producerBehaviorRef")))
        for st in as_list(s.get("steps")):
            if isinstance(st, dict) and st.get("stepType") == "RULE_EVALUATE":
                r = rule_map.get(st.get("ruleRef"))
                if r is not None and not (set(as_list(r.get("subscribedEvents"))) & set(emitted)):
                    rep.error("%s: 规则 %s 未订阅场景中任何事件" % (loc, st.get("ruleRef")))


def check_changelog(rep, root):
    cl = os.path.join(root, "CHANGELOG.md")
    if not os.path.exists(cl):
        rep.warn("缺少 %s（模型变更需记录）" % cl)
    readme = os.path.join(root, "README.md")
    if not os.path.exists(readme):
        rep.warn("缺少 %s（阶段与交付范围索引）" % readme)


def impact(docs, target):
    hits = []

    def walk(node, path):
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, path + "." + str(k))
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, path + "[%d]" % i)
        else:
            if node == target:
                hits.append(path)

    for key, doc in docs.items():
        walk(doc, key)
    return hits


def main(argv=None):
    ap = argparse.ArgumentParser(description="OMF v6 模型结构完整性与跨模型引用校验")
    ap.add_argument("--dir", default="docs/model", help="建模文档根目录（默认 docs/model）")
    ap.add_argument("--strict", action="store_true", help="警告也视为失败")
    ap.add_argument("--impact", metavar="ID", help="打印该 ID 在各模型文件中的全部引用位置")
    ap.add_argument("--report", metavar="PATH", help="把校验报告写入文件（派生产物，勿提交版本库）")
    args = ap.parse_args(argv)

    rep = Report()
    docs = load_models(args.dir, rep)

    if docs:
        for key in docs:
            check_structure(rep, key, docs[key])
            for rk in ROOTS.get(key, []):
                check_duplicates(rep, "%s.%s" % (key, rk), docs[key].get(rk), ID_FIELD.get(rk, "id"))
        ids = collect_ids(docs)
        check_references(rep, docs, ids)
        check_sync(rep, docs, ids)
        check_changelog(rep, args.dir)

    if args.impact:
        hits = impact(docs, args.impact)
        print("== 影响面: %s ==" % args.impact)
        if hits:
            for h in hits:
                print("  " + h)
        else:
            print("  无引用")
        return 0

    backend = "PyYAML" if _pyyaml is not None else "ruby/psych"
    lines = ["# 模型校验报告", "", "- 目录: `%s`" % args.dir, "- YAML 解析后端: %s" % backend,
             "- 错误: %d" % len(rep.errors), "- 警告: %d" % len(rep.warnings),
             "- 信息: %d" % len(rep.infos), ""]
    for e in rep.errors:
        lines.append("- [错误] " + e)
    for w in rep.warnings:
        lines.append("- [警告] " + w)
    for i in rep.infos:
        lines.append("- [信息] " + i)
    text = "\n".join(lines) + "\n"
    sys.stdout.write(text)
    if args.report:
        os.makedirs(os.path.dirname(os.path.abspath(args.report)), exist_ok=True)
        open(args.report, "w", encoding="utf-8").write(text)

    if rep.errors or (args.strict and rep.warnings):
        return 1
    if not docs:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
