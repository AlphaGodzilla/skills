---
status: accepted
date: 2026-10-10
decision-makers: 用户（本次会话确认）
---

# 新建源码逆向 skill 并复用建模规范

## Context and Problem Statement

用户要求根据 OMF v6，从已有代码库逆向生成 M1～M7、MM、MI 模型文件。决策时仓库已有 `ontology-modeling`，包含需求取证流程、模型模板与通用校验器；该流程要求补齐业务场景并将跨聚合写入拆成事件链，不能直接作为忠实描述源码现状的完整执行流程。

需要决定源码逆向流程如何组织，以及模型字段和通用校验是否与已有 skill 分开维护。用户在本次会话选择“新建逆向 skill，显式复用现有模板与校验器”，并确认输出为现状模型加差异清单。

## Decision Drivers

* 用户要求可重复使用的源码逆向入口，而不是一次性模型交付。
* 用户确认默认范围为 M1～M7、ME、MM、MI，MU 按需；不能假定所有项目有前端、事件或审批。
* 需求补全与源码取证的事实口径不同，不能把未实现的目标结构混入现状模型。
* 既有字段与通用引用校验应共享，避免维护两套逐渐漂移的模型规范。

## Considered Options

* 新建 `ontology-reverse-modeling`，显式依赖 `ontology-modeling` 的模板与通用校验器。
* 扩展 `ontology-modeling`，在同一 skill 内组合需求建模与源码逆向流程。
* 新建可独立复制的完整逆向包，包含另一份模型模板与校验工具。

## Decision Outcome

选择“新建 `ontology-reverse-modeling` 并显式复用已有规范”，以独立入口区分源码现状与需求设计，同时保留单一模板和通用校验依赖。用户已确认该选择及仓库 `docs/adr/` 的记录位置。

逆向流程只序列化可证明的实现事实；未知项、OMF 偏差及不能标准表示的实现保存在独立证据与覆盖清单。配套逆向检查调用已有通用校验器，补查交付集合、源码引用与覆盖清单，不复制通用事件、流程或跨模型引用检查逻辑。

### Consequences

* Good, because 源码逆向有独立触发入口和事实约束，不需要改写需求建模流程。
* Good, because 模型字段与通用校验复用既有资源，减少相同语义的重复维护。
* Bad, because 新 skill 不能单独复制运行，使用者必须同时安装并正确定位 `ontology-modeling`。
* Bad, because 既有通用校验器不覆盖完整语义、MM/MI 契约和源码完整性，交付仍需配套证据检查与人工门禁。

### Confirmation

通过 `ontology-reverse-modeling/tests/test_reverse_check.py` 核对共享文件/根键兼容性、无 MU 和空事件/流程模型、证据与覆盖错误，以及共享校验器失败传播。核对 `SKILL.md` 中显式依赖与现状约束，确认没有复制完整模型 schema 或将目标设计写成源码事实。

## Pros and Cons of the Options

### 新建逆向 skill 并复用规范

* Good, because 入口和事实口径独立，字段与通用关系校验共享。
* Bad, because 引入显式的跨 skill 安装与版本兼容要求。

### 扩展现有 skill

* Good, because 安装入口集中，已有资源可以直接使用。
* Bad, because 需求补全与源码忠实提取需要两套相反的边界约束，组合后更容易把设计要求误用于现状提取。用户没有选择该方案。

### 独立完整逆向包

* Good, because 可单独复制使用，无跨 skill 依赖。
* Bad, because 复制模板和通用校验会形成第二套维护面。用户没有选择该方案。

## More Information

* 上游来源：[OMF v6](https://github.com/sharptoolbox/ontology_modeling_framework/blob/main/ontology_modeling_framework_v6.md)。
* 依赖资源：`ontology-modeling/references/model-templates.md`、`ontology-modeling/scripts/omf_validate.py`。
* 当前使用入口：[源码逆向本体建模](../../ontology-reverse-modeling/SKILL.md)。
* 用户同时确认 M2 外部调用按正式 `triggerType: EXTERNAL` 枚举表达；原文部分位置的 `EXTERNAL_CALL` 口径冲突在 skill 的框架口径说明中明确，不新增枚举值。
