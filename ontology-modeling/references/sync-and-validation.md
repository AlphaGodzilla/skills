# 模型变更同步与结构完整性校验

本文件规定模型变更时如何保持 `docs/model/` 下各文件同步，以及如何运行结构完整性校验。用法：改动任一模型文件前先查影响面，改完后按同步矩阵更新全部引用文件，再跑校验脚本，错误清零后提交。

## 目录

1. [同步矩阵](#一同步矩阵)
2. [同步操作步骤](#二同步操作步骤)
3. [结构完整性校验](#三结构完整性校验)
4. [CI 集成](#四ci-集成)
5. [同步失败与回滚](#五同步失败与回滚)

---

## 一、同步矩阵

改动左列对象时，必须同时检查并更新中列文件；右列命令用于定位全部引用位置。

| 变更对象 | 必须同步的文件 | 定位命令 |
| --- | --- | --- |
| M1 聚合/属性/生命周期 | M2、M3、ME、M4、M6、M7、MM，以及 `intake/object-cards.md` | `--impact <AGG-ID>` |
| M2 行为新增/删除/签名 | ME（生产者/订阅者）、M4、M6、MU、MI，以及 `intake/scenario-list.md` | `--impact <Behavior_ID>` |
| M2 查询行为 | M7（一对一绑定） | `--impact <Behavior_ID>` |
| M3 规则 | M2（`appliedRules`）、ME（事件驱动订阅）、M4、M6（`ruleRef`）、MU（`VALIDATE`） | `--impact <RULE-ID>` |
| ME 事件或载荷字段 | M2（`producedEvents`）、M3（`subscribedEvents`）、M4、M6（`EVENT_WAIT`）、MU（`EVENT_EMIT`）、MI（`relatedEventRef`） | `--impact <Entity.Event>` |
| M4 场景 | M6（`SCENARIO_CALL`）、ME、MU（`SCENARIO_CALL`） | `--impact <SCN-ID>` |
| M5 角色/权限 | M2（`requiredPermissions`）、M6（`roleRefs`/`roleRef`）、MU（`permissionRef`） | `--impact <ROLE-ID>` |
| M5 外部参与方 | MI（`relatedExternalEntityRef`）、M2（`triggerType=EXTERNAL`） | `--impact <ACTOR-ID>` |
| M6 流程 | MU（`screenRef`）、ME（`trigger.eventRef`）；M4 禁止反向引用 M6 | `--impact <FLOW-ID>` |
| M7 查询报表 | M2（`queryReportRef`）、MM（参考 SQL 表列）、MU（`dataSource`） | `--impact <QR-ID>` |
| MU 屏幕/元素/事件 | M1（`uiBindings`）、M2（`uiEventRefs`）、M3（`uiValidationRefs`）、ME（`uiEventPath`）、M4（`uiTriggerScreen`）、M5（`uiControlledElements`）、M6（`screenRef`）、M7（`uiScreenRefs`） | `--impact <screenId>` |
| MM 表名/列名 | M7 参考 SQL | `--impact <table_or_column>` |
| MI 接口口径 | M2（`EXTERNAL` 行为）、M1/M7（字段口径）、M5（`externalContract`） | `--impact <INT-ID>` |

同步的是**引用与镜像字段**，不是语义定义：例如事件载荷变更后，M4/M6/MU 引用事件的位置核对字段是否仍满足；语义仍只在一处定义。

---

## 二、同步操作步骤

1. **查影响面**：运行 `--impact <ID>`，列出该 ID 在各文件中的全部引用位置。
2. **改源文件**：修改权威定义所在文件，一次只改一个语义单元。
3. **改引用文件**：按同步矩阵逐个更新引用与镜像字段；删除 ID 前先清空全部引用。
4. **跑校验**：`uv run tools/omf_validate.py --dir docs/model --strict`。
5. **修到零错误**：错误必须清零；警告逐条判断，能修则修。
6. **记录变更**：破坏性变更写入 `docs/model/CHANGELOG.md`。
7. **更新索引**：刷新 `docs/model/README.md` 的阶段状态。
8. **单独提交**：同一次变更一次提交，提交信息写明模型文件、元素 ID 与原因。

禁止事项：禁止只改定义文件不改引用文件；禁止在同一提交里混入不相关变更；禁止跳过第 4 步直接提交。

---

## 三、结构完整性校验

脚本：`scripts/omf_validate.py`（本 skill 内置，带 PEP 723 内联依赖声明）。项目内建议 vendoring 到 `tools/omf_validate.py`，使 CI 不依赖 skill 路径；内联声明随文件复制，命令不变。

运行环境：用 `uv run` 在隔离环境执行，依赖只装在 uv 的临时环境里，不污染全局 Python。安装 uv：`brew install uv` 或 `curl -LsSf https://astral.sh/uv/install.sh | sh`。脚本也支持直接用系统 `python3` 运行，此时优先用系统 PyYAML，缺失则回退 `ruby` 的 psych。

命令：

```bash
uv run tools/omf_validate.py --dir docs/model
uv run tools/omf_validate.py --dir docs/model --strict
uv run tools/omf_validate.py --dir docs/model --impact Contract_Submit
uv run tools/omf_validate.py --dir docs/model --report build/model-validation.md
```

退出码：`0` 通过；`1` 有错误（`--strict` 时警告也算错误）；`2` 环境或必需文件缺失。

检查项：

| 类别 | 检查内容 |
| --- | --- |
| 结构 | 必需文件存在、根键存在且为列表、必需字段齐全、枚举取值合法、ID 无重复 |
| 引用 | 全部跨模型 ID 可解析（悬空引用为零） |
| 同步 | M2/M7 一对一双向一致；M3 事件驱动规则与 ME 订阅双向一致；ME 生产者与 M2/M3 `producedEvents` 双向一致；M4 事件链（触发事件已发布、生产行为在场景内、规则订阅场景事件）；M6 角色归属、网关分支、分支目标、子流程无环 |
| 索引 | `README.md` 与 `CHANGELOG.md` 存在 |

报告性质：校验报告是派生产物，不是建模源文件。

- 默认输出 stdout，CI 日志即为通过证据。
- 需要留档时用 `--report build/model-validation.md`，`build/` 不纳入版本库。
- `docs/model/reviews/` 只提交人工撰写的评审记录（如 `review-2026-03-01.md`）。
- 若把报告写进 `docs/model/reviews/`，必须在 `.gitignore` 忽略：`docs/model/reviews/validation*.md`。

---

## 四、CI 集成

GitHub Actions：

```yaml
name: model-check
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv run tools/omf_validate.py --dir docs/model --strict --report build/model-validation.md
      - if: always()
        uses: actions/upload-artifact@v4
        with: {name: model-validation, path: build/model-validation.md}
```

本地 git 钩子（`.git/hooks/pre-commit`）：

```sh
#!/bin/sh
uv run tools/omf_validate.py --dir docs/model --strict || exit 1
```

把校验失败挡在提交之前，保证模型与代码同步演进。

---

## 五、同步失败与回滚

- 校验报错后禁止提交；先修引用，再决定是否回滚定义。
- 回滚定义时，同步回滚全部引用文件与 `CHANGELOG.md`。
- 已提交的模型错误通过新提交修复，禁止改写历史。
- 同一 ID 的语义复用禁止：废弃 ID 在 `CHANGELOG.md` 标注，新语义分配新 ID。
