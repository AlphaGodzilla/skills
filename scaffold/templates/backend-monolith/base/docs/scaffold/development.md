# 开发命令与验证

本文件是 [`AGENTS.md`](../../AGENTS.md) 的按需章节：只在要跑命令、判断该跑哪一层测试时读。

## 常用命令

| 目的 | 命令 |
| --- | --- |
| 跑单元与契约测试（不需要任何外部依赖） | `./gradlew test`，或 `scripts/dev-test.sh` |
| 跑单个单元 / 契约测试类 | `scripts/dev-test.sh --tests '{{package}}.shared.id.UlidTest'` |
| 跑集成测试（用 podman 起真实数据库，跑完自动删容器） | `scripts/dev-it.sh` |
| 完整验收（提交前必过）：测试 + ArchUnit 架构守护 + 格式检查 + 覆盖率与 CRAP 门禁 | `scripts/qa-gate.sh`（等价于 `./gradlew build`，失败时给定位引导） |
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

## 其余脚本

`scripts/` 下还有 `create-tag.sh`（交互式打版本 tag）、`podman-testcontainers.sh`（**仅当把集成测试改成 Testcontainers 时才需要**）、`lib/*.sh`（供脚本 source 的库）。用不到就不用管；真要用其中某个时，再读 [`README.md`](../../README.md) 的「开发辅助脚本」一节（逐条用法与参数在那里）。

## 端点

| 端点 | 说明 |
| --- | --- |
| `GET /api/health` | 轻量探活 |
| `GET /actuator/health` | 进程级健康 |
| `GET /doc.html`（knife4j）、`GET /v3/api-docs` | API 文档站；`prod` profile 下被关闭，业务接口不受影响 |
