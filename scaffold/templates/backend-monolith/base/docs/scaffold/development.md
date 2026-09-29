# 开发命令与验证

本文件是 [`AGENTS.md`](../../AGENTS.md) 的按需章节：只在要跑命令、判断该跑哪一层测试时读。

## 常用命令

| 目的 | 命令 |
| --- | --- |
| 跑单元与契约测试（不需要任何外部依赖） | `./gradlew test`，或 `scripts/dev-test.sh` |
| 跑单个单元 / 契约测试类 | `scripts/dev-test.sh --tests '{{package}}.shared.id.UlidTest'` |
| 跑集成测试（用 podman 起真实数据库，跑完自动删容器） | `scripts/dev-it.sh` |
| 完整验收（提交前必过）：测试 + ArchUnit 架构守护 + 格式检查 + 覆盖率与 CRAP 门禁 | `scripts/qa-gate.sh`（等价于 `./gradlew build`，失败时给定位引导） |
| 变异测试门禁（**可选**，不属于 `./gradlew build`） | `scripts/mutation-gate.sh`（默认只变异相对基线的变更类）；也可 `./gradlew pitest` |
| 格式化（只作用于相对 HEAD 有改动的文件） | `./gradlew spotlessApply` |
| 启动服务 | `scripts/dev-run.sh`（应用参数放 `--` 之后），或 `./gradlew bootRun` |

## 测试分两层，不要混

- 单元 / 用例 / REST 契约测试：测试 profile 用 H2 与测试替身，**不碰容器**。改动后先跑通它。
- 集成测试（`@Tag("integration")`、类名以 `IT` 结尾，如 `SampleIntegrationIT`）：跑真实数据库，只由 `scripts/dev-it.sh` 触发。`test` 任务默认排除它们，因此 `./gradlew build` 不需要 podman。

只有改到「只有真实库能验证」的东西（仓储适配、迁移脚本、唯一约束）才需要跑集成测试，其余改动用 `./gradlew test` 就够。

podman 只出现在集成测试阶段（`dev-it.sh` 内部），容器在脚本退出时被删除。**本脚手架不负责部署阶段**：不要添加镜像构建或编排文件。

## 覆盖率与 CRAP 门禁

`./gradlew build` 会强制两项门禁，任一不达标即构建失败：覆盖率下限（`jacocoTestCoverageVerification`，阈值 `coverageLineMin` / `coverageBranchMin`）与单方法 CRAP 上限（`crapCheck`，阈值 `crapMax`）。阈值都在 [`gradle.properties`](../../gradle.properties)，可临时覆盖：`./gradlew build -PcrapMax=50`。

CRAP = `comp^2 × (1 - cov)^3 + comp`（comp 是方法圈复杂度，cov 是行覆盖率）。它罚的是「圈复杂度高又缺测试」，所以拆小方法常比堆测试更划算。看分数用 `./gradlew crapReport`；CRAP 明细在 `build/reports/crap/crap.txt`，覆盖率报告在 `build/reports/jacoco/test/html/index.html`。

默认运行排除集成测试，因此**只由集成测试覆盖的代码（仓储适配等）覆盖率为 0、CRAP 偏高**。需要合并两层数字时用 `scripts/dev-it.sh build`。

提交前用 `scripts/qa-gate.sh`：它跑的就是上面这些门禁，失败时不只报「失败」，而是打印**哪一道门禁失败、证据在哪个文件、下一步跑什么**——测试失败列出类与断言消息、格式违规列出文件、覆盖率不足列出未覆盖行最多的类、CRAP 越界列出方法及其源码路径。完整构建日志落在 `build/qa-gate.log`。

门禁失败只有两种修法：**改被测代码，或补测试**。不要改测试代码 / 断言 / 测试配置，也不要调低 `gradle.properties` 的阈值或加排除规则——那是把问题藏起来（见 [`AGENTS.md`](../../AGENTS.md) 硬约束 8）。

## 变异测试门禁（可选）

变异测试回答的是「测试有没有真正断言到行为」，补的是覆盖率看不到的那一半。它**慢**（全量约 40 秒到数分钟），因此**默认不参与 `./gradlew build`**，只在显式调用时执行：

```bash
scripts/mutation-gate.sh                          # 只变异「相对基线变更的类」（推荐日常用）
scripts/mutation-gate.sh --all                    # 全量（夜间或核心域大改时）
scripts/mutation-gate.sh --class {{package}}.shared.id.Ulid   # 单个类
```

判据（只针对本次被变异的类）：存活变异体数 ≤ `mutationSurvivorsMax`（默认 0）、变异得分 ≥ `mutationScoreMin`（默认 0）、以及零覆盖变异体数（`mutationFailOnNoCoverage=true` 时判失败）。阈值在 [`gradle.properties`](../../gradle.properties)，命令行用 `-PmutationSurvivorsMax=` / `-PmutationScoreMin=` 覆盖。

报告：`build/reports/pitest/index.html`（人读，逐变异体给状态、算子、行号）、`build/reports/pitest/mutations.xml`（agent 解析）。日志：`build/mutation-gate.log`。

读结果时的两个区分：**存活（SURVIVED）**表示测试执行到了但没有断言住这个行为，要给对应方法补断言或补边界值用例；**零覆盖（NO_COVERAGE）**表示这段代码根本没被测到，其中 `infrastructure/persistence` 的适配器在默认运行里就是零覆盖（只由集成测试覆盖），属预期，应通过 `-PpitestExcludedClasses` 排除而不是降低阈值。


## 其余脚本

`scripts/` 下还有 `create-tag.sh`（交互式打版本 tag）、`podman-testcontainers.sh`（**仅当把集成测试改成 Testcontainers 时才需要**）、`lib/*.sh`（供脚本 source 的库）。用不到就不用管；真要用其中某个时，再读 [`README.md`](../../README.md) 的「开发辅助脚本」一节（逐条用法与参数在那里）。

## 在 git worktree 里跑命令

worktree 里的 `.git` 是指向主仓库的文本文件，`git status` / `add` / `commit` 都要读写主仓库的 `.git`（index、HEAD、objects、refs 都在那里），而沙箱默认只放行会话目录。仓库根目录的 `.pi/sandbox.json` 已放行相对路径 `../{{project_name}}/.git`，所以在沙箱下于兄弟目录的 worktree 里跑 git 不会再报 `fatal: not a git repository`。

两条前提：worktree 建在主仓库的兄弟目录（`git worktree add ../{{project_name}}-<分支>`），且主仓库目录名与项目名一致。把 worktree 放进 `<仓库>/.worktree/<名字>` 时该条目不匹配，需要按同样的形状另加一条 `../../.git`。没启用 pi-sandbox 扩展时这个文件不参与，可忽略。

## 端点

| 端点 | 说明 |
| --- | --- |
| `GET /api/health` | 轻量探活 |
| `GET /actuator/health` | 进程级健康 |
| `GET /doc.html`（knife4j）、`GET /v3/api-docs` | API 文档站；`prod` profile 下被关闭，业务接口不受影响 |
