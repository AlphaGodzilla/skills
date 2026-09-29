# AGENTS.md

本文件是在本仓库工作的 agent 的入口：只写「仓库是什么」「什么不许做」「去哪读细节」。细节按需读，不要一次全读。
[`README.md`](README.md) 是面向人的项目说明，**默认不用读**；确实需要背景、配置细节或脚本参数的逐条说明时，按下面的「文档地图」取用。

## 仓库

{{project_name}}：Spring Boot 4.1 + Java 21 的后端单体应用，Gradle Kotlin DSL，六边形分层，按限界上下文分包。数据能力 `{{db}}`，缓存能力 `{{cache}}`。

底座不含业务：唯一带代码的上下文是 `sample`（分层样例），落地时整体删除。

## 硬约束

1. **分层**：`domain` 与 `shared` 零框架依赖；上下文内 `interfaces` 不得依赖本上下文的 `domain.model` / `domain.service` / `domain.repository` / `infrastructure`；`platform` 不得依赖业务上下文。以上由 `ArchitectureTest` 守护，违反会让 `./gradlew build` 失败。
2. **跨上下文**：只经目标上下文的已发布出口通信，出口必须登记进 `ArchitectureTest.PUBLISHED_CROSS_CONTEXT_PORTS`。
3. **不要在 `sample` 上堆业务代码**：新增业务另建上下文，并按 [`docs/scaffold/structure.md`](docs/scaffold/structure.md) 的清单登记前缀、上下文名与目录职责。
4. **错误体统一为 RFC 7807**：领域异常由各上下文的 `*ProblemHandler` 映射成 4xx；存储异常不得直接漏成 500。
5. **格式由 Spotless 拥有**：用 `./gradlew spotlessApply` 格式化，不要手工调缩进与 import 顺序。
6. **测试不许引入隐式外部依赖**：新增单元 / 契约测试必须能离线跑；需要真实数据库的断言放进集成测试（`@Tag("integration")` + `IT` 后缀），由 `scripts/dev-it.sh` 起容器执行。
7. **本仓库不负责部署阶段**：不要添加镜像构建、编排或环境清单文件；运行形态与生产凭据由部署方决定。
8. **不许为了让门禁变绿而改测试或门禁本身**：测试代码、测试资源与测试配置（断言、`excludeTags`、测试 profile）、门禁阈值（`gradle.properties` 的 `coverageLineMin` / `coverageBranchMin` / `crapMax` / `mutationSurvivorsMax` / `mutationScoreMin`）、排除规则，都不得为了让 `scripts/qa-gate.sh` 或 `scripts/mutation-gate.sh` 通过而修改；用 `-x` / `--rerun-tasks` 之类绕过同样不行。门禁失败只能靠**改被测代码或补测试**解决；确需放宽阈值时，单独提交并写明理由。

## 文档地图

只在需要时读对应的一篇，不要全部读：

| 要做什么 | 先读 |
| --- | --- |
| 跑测试、跑服务、看接口文档，判断该跑哪一层测试 | [`docs/scaffold/development.md`](docs/scaffold/development.md) |
| 在 git worktree / 沙箱里跑命令，git 报 `not a git repository` | [`docs/scaffold/development.md`](docs/scaffold/development.md)（「在 git worktree 里跑命令」一节） |
| 判断一段代码该放哪个包、新增限界上下文 | [`docs/scaffold/structure.md`](docs/scaffold/structure.md) |
| 改仓储实现、迁移脚本、缓存用法 | [`docs/scaffold/data-cache.md`](docs/scaffold/data-cache.md) |
| 需要项目背景、技术选型理由、配置项或脚本参数的逐条说明（面向人的完整文档） | [`README.md`](README.md) |

最短路径：日常改完跑 `./gradlew test`（不需要任何外部依赖）；**提交前必须过 `scripts/qa-gate.sh`**（测试 + 架构守护 + 格式检查 + 覆盖率与 CRAP 门禁，不通过时脚本会指出往哪查）。
