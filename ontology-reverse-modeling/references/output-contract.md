# 输出、证据与覆盖清单

本文件供逆向执行者组织可追溯的现状模型。标准 YAML 只承载 OMF 语义，范围、源码证据、提取状态和差异统一在独立清单中维护。全文分为目录、人工文档、机器清单和更新规则。

## 输出目录

目录契约复用 `ontology-modeling/SKILL.md` 的「输出目录与版本管理」：默认根目录为 `docs/model/`，标准信息包、模型文件、评审目录与索引保持原名。用户确认另存现状时只替换根目录前缀，内部结构不变；现状标识写在范围卡和索引中，不改成另一套目录或模型文件名。

```text
docs/model/
├── README.md                     # 标准索引、阶段状态与现状标识
├── intake/
│   ├── scope.md                  # 标准范围卡
│   ├── glossary.md               # 标准名词表
│   ├── ddd-extraction.md         # 标准 DDD 中间结果与取数索引
│   ├── object-cards.md           # 标准对象卡
│   ├── scenario-list.md          # 标准场景清单
│   ├── actor-permission.md       # 标准角色权限表
│   ├── flow-catalog.md           # 标准流程目录
│   ├── open-questions.md         # 标准待确认清单，引用 GAP ID
│   ├── repository-map.md         # 逆向扩展：源码与入口索引
│   ├── extraction-map.md         # 逆向扩展：候选项、调用链与证据
│   └── reverse-manifest.yaml     # 逆向扩展：证据、覆盖与差异权威清单
├── yaml/                         # 模型文件，正文为块状 YAML
│   ├── m1-object-model.yaml
│   ├── m2-behavior-model.yaml
│   ├── m3-rule-model.yaml
│   ├── me-event-model.yaml
│   ├── m4-scenario-model.yaml
│   ├── m5-actor-model.yaml
│   ├── m6-flow-model.yaml
│   ├── m7-report-model.yaml
│   ├── m-mapping-model.yaml
│   ├── mi-interface-model.yaml
│   └── mu-ui-model.yaml          # 仅 include_mu=true 时
├── diagrams/                     # 可选可视化产物
├── reviews/                      # 执行者撰写的评审记录；机器报告不写入
└── CHANGELOG.md                  # 标准跨模型变更记录
```

标准信息包、模型源文件与持久化证据须一起保存在输出根目录；`reviews/` 必须保留，`diagrams/` 无可视化产物时可以不创建。这些文件不是临时抓取或机器报告；临时文件、缓存和校验报告必须在 `/tmp`。不自动创建源代码、迁移、项目工具脚本或 CI。`CHANGELOG.md` 只保存真实发生的模型变更事件，不混写使用说明；首次新建可保留标题但无变更条目，不虚构历史。

## 人工文档

| 文件 | 必须说明的内容 |
| --- | --- |
| `intake/scope.md` | 已确认代码库、系统/模块边界、业务域、快照、允许读取的目录、明确排除项、输出位置、MU 取舍、现状模型标识、不能验证的运行环境 |
| `intake/glossary.md` | 按共享信息包的「名词、候选类型、定型结果、依据」组织；名称与源码符号对应，附证据 ID，未知业务含义不猜测 |
| `intake/ddd-extraction.md` | 复用共享 DDD 交付骨架：四张表、上下文映射、M1～M6 取数索引、缺口清单与「模型元素 ID → DDD 行」追溯；只登记已取证的事件、对象与边界，补充 M7/MM/MI 的信息入口 |
| `intake/object-cards.md` | 已证明的身份、属性、生命周期、子实体、引用、约束及证据；无法确定的聚合边界或迁移关联 GAP ID |
| `intake/scenario-list.md` | 保留共享场景表的源对象、触发、目标对象、条件、下游、落点模型；区分实际事件协同与不能落 M4 的同步调用，后者关联原始链和差异 |
| `intake/actor-permission.md` | 真实参与者/角色、数据范围、可用行为、审批角色及鉴权证据；不得用岗位名或测试账号补造角色 |
| `intake/flow-catalog.md` | 实际流程的阶段、角色、网关条件、驳回/退回/超时；无流程时写明搜索范围及不存在判据 |
| `intake/open-questions.md` | 按共享「问题、影响模型、状态」整理当前待确认项和开放差异，附 GAP ID、证据入口与清单状态；由 `reverse-manifest.yaml.gaps` 同步，不单独维护问题闭环 |
| `intake/repository-map.md` | 技术栈、模块职责、源码位置、各类入口与注册机制、持久化/鉴权/消息/流程/查询位置、未可见依赖 |
| `intake/extraction-map.md` | 每个候选业务对象/行为等的源码符号、依赖和证据 ID；聚合判定理由、原始调用链、无法标准表示的实际读写与分支 |
| `README.md` | 当前范围和源码快照、标准信息包与模型索引、`未开始 / 进行中 / 已交付` 阶段状态、独立模型完整性状态、覆盖入口、开放缺口、实际验收结果及边界 |
| `reviews/review-{date}.md` | 实际完成的语义评审项、依据、结论和未通过原因；不得伪称用户或其他人已评审。没有评审记录时可用 `reviews/README.md` 说明当前状态，使目录随文档保存 |

原始代码片段不是必需，优先引用精确符号和行范围，避免复制敏感内容。差异清单的权威数据在 `reverse-manifest.yaml.gaps`；README 只提供索引或当前摘要，不维护第二套独立问题状态。

## 与需求建模输出的衔接

1. 标准信息包的文件、内容分类和基本列复用 `ontology-modeling/references/reverse-elicitation.md` 第四节；DDD 表格和取数索引复用 `ontology-modeling/references/event-storming-extraction.md` 第九节，不维护第二套模板。
2. 标准文档都必须存在且非空。没有事件或审批时保留相应表头并说明已检查范围和不存在判据；证据不足时写 `待确认` 和 GAP ID，禁止用空文件、虚构事件或目标边界凑齐文档。
3. 用户确认状态沿用 `已确认 / 待确认 / 边界外`；源码是否已取证另列证据 ID，不把静态取证冒充用户答复。问题已回答不等于 OMF 偏差已消失，`OPEN / RESOLVED` 仍以差异清单为准。
4. `ontology-modeling` 可直接从同一模型根目录读取标准信息包与 `yaml/`，继续补全、建模或一致性检查，无需搬移或重命名文件。逆向扩展只补充证据，不替代标准信息包；标准模型字段保持共享模板格式。
5. 继续做目标设计时必须明确切换事实口径和输出位置。不能因目录兼容就覆盖已确认的现状模型，或把未实现的解耦、审批和规则当成源码事实。

## 机器清单 `reverse-manifest.yaml`

必需根字段：`profile`、`include_mu`、`source_roots`、`sources`、`model_status`、`traces`、`coverage`、`gaps`。`snapshot` 可保存提交标识和工作区状态；机器检查以文件 SHA-256 为依据，不调用 Git、不读取 Git 配置、不证明提交标识真实。

### 范围与源码快照

```yaml
profile: omf-v6-as-is
include_mu: false
source_roots: [src, db/migrations]   # 实际存在且已授权的目录，仓库相对路径
snapshot:
  revision: "<实际提交标识，非 Git 仓库使用 null>"
  worktree_dirty: "<实际布尔值，无法确认使用 null>"
  framework_url: https://github.com/sharptoolbox/ontology_modeling_framework/blob/main/ontology_modeling_framework_v6.md
```

代码块仅演示字段，尖括号占位符必须替换为事实，布尔值和 `null` 不加引号。必须按范围卡限制扫描，而不是把 `source_roots: [.]` 当默认授权。脚本只验证声明的范围和文件，不执行递归源码扫描。

### `sources`：已读取的证据

每条证据包含 `id`、`path`、`symbol`、`start_line`、`end_line`、`sha256`、`kind`。

```yaml
sources:
  - id: EV-001
    path: src/domain/item.py
    symbol: Item.activate
    start_line: 12
    end_line: 20
    sha256: "<整个文件当前字节内容的 64 位小写 SHA-256>"
    kind: IMPLEMENTATION
```

- 行号从 1 开始，范围包含首尾；同一文件的多条证据使用同一个文件哈希。
- `kind` 为 `IMPLEMENTATION / DECLARATION / TEST / DOCUMENT`。实际实现和项目执行/持久化/协议声明可作为模型证据；测试、文档不能是模型现状的唯一证据。
- 证据路径必须处于 `source_roots`，不允许绝对路径、`..`、符号链接、凭证/隐私路径或模型输出目录。禁止用 README 和生成模型证明自身。
- SHA-256 和行范围只能证明引用未漂移，不能证明结论正确。符号和内容的解释需人工复核，不能将任意安全文件哈希作为别处实现的证据。
- `SOURCE_UNAVAILABLE` 缺口引用可见的调用方/注册声明等证据，不能指向未读取的文件或凭空构造证据 ID。完全无可读材料时先询问，不产出假清单。

### `model_status`：模型状态

必须恰好包含 `m1,m2,m3,me,m4,m5,m6,m7,mm,mi`；`include_mu=true` 时再包含 `mu`。每个值有 `status` 与 `reason`。

| 状态 | 含义与必需字段 |
| --- | --- |
| `PRESENT` | 有至少一个已取证元素；不能用此状态证明扫描完整 |
| `ABSENT` | 范围内已检查且无对应语义，所有标准根集合为空；必须有非空 `absence_checks` |
| `PARTIAL` | 证据、范围或标准表示尚有缺口，可保存已证明的元素；必须有非空 `gap_ids`，指向本模型的开放缺口 |

存在涉及本模型的开放 `SOURCE_UNAVAILABLE` 时，必须标为 `PARTIAL`，且 `gap_ids` 引用本模型全部此类开放缺口；即使集合为空并填写了 `absence_checks`，也不得标为 `ABSENT`。已闭环的取证缺口不触发该约束；已充分取证的 `OMF_DEVIATION` 本身也不等于源码不可见，不能据此一律否定不存在判据。

```yaml
model_status:
  m1:
    status: PRESENT
    reason: "<已证明的对象范围>"
  me:
    status: ABSENT
    reason: "<已检查范围内无业务事件发布或消费>"
    absence_checks:
      - path: src
        query: "<实际检查的发布/注册机制与搜索条件>"
        result: "<实际结果及仓库外限制>"
  mm:
    status: PARTIAL
    reason: "<已知持久化但标准表映射不能完整表达>"
    gap_ids: [GAP-001]
```

这只是部分状态的写法，不是可直接交付的完整清单。不存在判据须来自实际搜索、调用图与注册机制核对；脚本不会运行 `query`，也不会验证“无匹配”声明。

### `traces`：模型到源码

每条追溯包含 `model`、`pointer`、`source_ids`、`note`。`model` 使用小写模型键；`pointer` 为该模型文件内部的 JSON Pointer。

```yaml
traces:
  - model: m1
    pointer: /aggregates/0
    source_ids: [EV-001, EV-002]
    note: "<独立身份、访问入口和生命周期的证据如何支持这个聚合>"
  - model: m1
    pointer: /aggregates/0/attributes/0/required
    source_ids: [EV-002]
    note: "<必填在什么路径生效，是否属于无条件对象约束>"
```

必须为每个标准根集合条目提供元素级记录，例如 `/aggregates/0`、`/roles/0`、`/interfaces/0`。机器检查该要求；元素记录不足以代替关键字段取证。属性约束、表达式、载荷、角色条件、查询列/参数、表列和接口返回分支必须另有字段级记录，人工检查是否完整。

Pointer 从 0 编号，转义 `/` 为 `~1`、`~` 为 `~0`。模型排序、删除或插入会改变索引，必须同步更新 Pointer。业务关联仍用稳定 ID，不用 Pointer 替代 OMF 跨模型引用。

### `coverage`：源码到模型或缺口

每条覆盖项包含 `id`、`kind`、非空 `source_ids` 和 `disposition`；`kind` 为 `ENTRY / OBJECT / RULE / EVENT / SECURITY / WORKFLOW / QUERY / PERSISTENCE / UI / TECHNICAL`。

| `disposition` | 必需信息 |
| --- | --- |
| `MODELED` | 非空 `model_refs`，每项有 `model`、`pointer`，且已在 `traces` 中登记；可同时引用已知缺口 |
| `GAP` | 非空 `gap_ids` 与 `reason`；已表示的子集也可附 `model_refs` |
| `EXCLUDED` | 明确 `reason`，无模型引用和缺口引用；仅用于已确认的边界外或纯技术项，不用于隐藏未理解的业务 |

```yaml
coverage:
  - id: ENTRY-001
    kind: ENTRY
    source_ids: [EV-001]
    disposition: MODELED
    model_refs:
      - {model: m2, pointer: /behaviors/0}
      - {model: mi, pointer: /interfaces/0}
  - id: PERSISTENCE-001
    kind: PERSISTENCE
    source_ids: [EV-003]
    disposition: GAP
    model_refs: []
    gap_ids: [GAP-001]
    reason: "<当前持久化确已实现，但部分结构不能标准表示>"
```

必须从源码入口清单建立覆盖项，而不是从已生成模型建立“完整性”证明。每条 `traces`、每个 `gaps` ID 都必须被至少一项覆盖记录引用；新增字段级追溯也需加进相应 `model_refs`。脚本只能检查已登记项之间的完整性，无法发现从未登记的入口。

### `gaps`：未知、差异与工具限制

每个问题包含 `id`、`kind`、`status`、`models`、非空 `source_ids`、`detail`，开放问题还需 `question`，已闭环问题还需 `resolution`。

| `kind` | 判据 |
| --- | --- |
| `UNKNOWN` | 需要业务含义、边界或运行选择才能确定结论 |
| `CONFLICT` | 两处实现/声明或实现与已确认规则相互冲突 |
| `OMF_DEVIATION` | 已证明的实现与框架语义约束不一致 |
| `UNREPRESENTABLE` | 标准模型或现有工具无法忠实表达已证明的信息 |
| `SOURCE_UNAVAILABLE` | 调用目标、运行声明或其他关键源码不可读取 |

```yaml
gaps:
  - id: GAP-001
    kind: OMF_DEVIATION
    status: OPEN
    models: [m2, me, m4]
    source_ids: [EV-004, EV-005]
    detail: "<真实同步跨聚合调用与写入范围；关联 extraction-map 中的原始链>"
    question: "<需要补证、确认事实或另开目标建模任务的问题>"
```

`status` 为 `OPEN / RESOLVED`。仍存在的规范偏差不能仅因用户知情而标 `RESOLVED`；可标记“事实已确认”，但偏差保持开放，交付注明现状包含差异。表示限制和校验器误报也不得用修改业务事实闭环。

## 更新与交付

更新证据必须重新读取变化文件、重做依赖判断、同步模型和所有清单引用，不能只更新哈希。用户确认作为命名或边界说明记录在 `scope.md`/`extraction-map.md`，不能代替未实现功能的源码证据。

README 必须分别列机器结果和人工结果；存在 `PARTIAL`、未检查模块或开放缺口时不得称为“全量符合 OMF”。没有开放缺口也只有在初始入口清单对账和人工门禁完成后才能称为本次授权范围内逆向完成。
