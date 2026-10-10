---
status: accepted
date: 2026-10-10
decision-makers: 用户（要求逆向输出兼容 ontology-modeling）
---

# 对齐逆向与需求建模的输出目录契约

## Context and Problem Statement

[ADR-0001](0001-add-reverse-skill-and-reuse-omf.md) 确定源码逆向 skill 复用 `ontology-modeling` 的模板与通用校验器。目录核对发现，逆向输出只包含标准 YAML 和源码取证扩展，缺少需求建模 skill 约定的完整信息包与评审目录。用户明确要求逆向输出目录兼容 `ontology-modeling`，需要统一交接件而非只保证 YAML 可被校验器读取。

## Decision Drivers

* 用户明确提出输出目录兼容要求。
* `ontology-modeling/SKILL.md` 的「输出目录与版本管理」定义标准信息包、模型、索引、评审与变更记录的固定位置。
* 后续建模应能直接读取逆向信息包，不依赖文件搬移、改名或临时转换。
* 源码现状与目标设计仍须区分，不能为了填满标准文档而虚构事件、流程或领域边界。

## Considered Options

* 完整复用标准目录与信息包，源码证据和差异作为同目录的附加文件。
* 仅对齐 YAML 文件集合，继续使用专用的逆向信息包，交接时再转换。

## Decision Outcome

选择“完整复用标准目录与信息包，并附加逆向证据”，满足用户的兼容要求。默认模型根目录沿用 `docs/model/`，标准文件与子目录保持原名；用户确认另存现状时只替换根目录前缀，不改变内部交接结构。

逆向扩展保存在 `intake/`，不替代共享信息包；模型字段与文件名继续使用共享模板。标准文档从源码证据提取内容，未知项和已证明的框架偏差保留缺口，不通过补造目标设计实现目录兼容。本决策补充 ADR-0001，不取代其独立入口与共享依赖的选择。

### Consequences

* Good, because 两个 skill 使用同一套标准交接文件，后续读取和一致性检查无需重排目录。
* Good, because 源码证据与差异仍有独立权威清单，不污染标准模型字段。
* Bad, because 标准信息包与证据清单需要同步，执行者必须防止问题状态、模型 ID 和取数索引漂移。
* Bad, because 文件存在性检查不能证明内容语义兼容，仍须人工核对信息包、模型和源码。

### Confirmation

配套检查验证非空标准信息包、索引与日志、评审目录和可选图形目录；回归测试从共享 skill 的目录声明提取标准文件集合，与逆向目录门禁对账，并检查自定义根目录的内部结构不变。人工评审核对共享表格骨架、用户确认状态、DDD 取数索引和源码证据。

## More Information

* 依赖目录契约：`ontology-modeling/SKILL.md`。
* 信息包和 DDD 交接骨架：`ontology-modeling/references/reverse-elicitation.md` 第四节、`ontology-modeling/references/event-storming-extraction.md` 第九节。
* 当前输出说明：[输出、证据与覆盖清单](../../ontology-reverse-modeling/references/output-contract.md)。
