# AGENTS.md

本文件是给在本仓库工作的 agent 的入口指令：只写「在哪做什么、怎么验证、什么不许做」。项目介绍与配置细节见 [`README.md`](README.md)。

## 技术栈

{{project_name}}：Spring Boot 4.1 + Java 21 的后端单体应用，六边形分层，数据能力 `{{db}}`，缓存能力 `{{cache}}`。

## 常用命令

| 目的 | 命令 |
| --- | --- |
| 跑单元与契约测试（不需要任何外部依赖） | `./gradlew test`，或 `scripts/dev-test.sh` |
| 跑集成测试（用 podman 起真实数据库，跑完自动删容器） | `scripts/dev-it.sh` |
| 单个单元 / 契约测试类 | `scripts/dev-test.sh --tests '{{package}}.shared.id.UlidTest'` |
| 完整验收：测试 + ArchUnit 架构守护 + 格式检查 | `./gradlew build` |
| 格式化（只作用于相对 HEAD 有改动的文件） | `./gradlew spotlessApply` |
| 启动服务 | `scripts/dev-run.sh`（应用参数放 `--` 之后），或 `./gradlew bootRun` |

**测试分两层，不要混**：

- 单元 / 用例 / REST 契约测试：测试 profile 用 H2 与测试替身，**不碰容器**。改动后先跑通它。
- 集成测试（`@Tag("integration")`、类名以 `IT` 结尾，如 `SampleIntegrationIT`）：跑真实数据库，只由 `scripts/dev-it.sh` 触发。`test` 任务默认排除它们，因此 `./gradlew build` 不需要 podman。

podman 只出现在集成测试阶段（`dev-it.sh` 内部），容器在脚本退出时被删除。**本脚手架不负责部署阶段**：不要添加镜像构建或编排文件，运行形态与生产凭据由部署方决定。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `src/main/java/{{package_path}}/{{app_class}}.java` | 应用入口（`@SpringBootApplication` + `@EnableCaching`） |
| `src/main/java/{{package_path}}/shared/` | 共享内核（零框架依赖）：ULID 生成、id 前缀表 |
| `src/main/java/{{package_path}}/platform/` | 跨上下文技术适配层（缓存名等），不得依赖任何业务上下文 |
| `src/main/java/{{package_path}}/interfaces/` | 进程级入站适配：健康端点 |
| `src/main/java/{{package_path}}/sample/` | 示例限界上下文（占位）：`domain`（聚合/值对象/仓储端口/领域异常）、`application`（用例/DTO）、`infrastructure`（仓储实现与装配）、`interfaces`（REST 控制器与错误映射） |
| `src/main/resources/application.yml` | 公共配置；`application-db.yml`、`application-cache.yml` 由它按所选能力组件引入 |
| `src/main/resources/application-prod.yml` | 生产 profile：关闭 API 文档站 |
|?if db == "postgres" or db == "mysql"
| `src/main/resources/db/migration/` | Flyway 迁移脚本：表结构的唯一来源 |
|?endif
| `src/test/java/` | `ArchitectureTest`（架构守护）、领域与用例单测、REST 契约测试、集成测试 |
| `.env.example` | 可选的本机覆盖项（端口冲突时的 `DB_HOST_PORT`、真实库凭据）；复制为 `.env`（已 gitignore） |
| `scripts/` | 开发辅助脚本（见下） |
| `.codegraph/` | 本机 CodeGraph 索引：生成器在装了 `codegraph` CLI 时执行 `codegraph init --yes` 建立。已在项目 `.gitignore` 里忽略整个目录，不入库；重建用 `codegraph index`，增量用 `codegraph sync` |

## 硬约束

1. **分层**：`domain` 与 `shared` 零框架依赖；上下文内 `interfaces` 不得依赖本上下文的 `domain.model` / `domain.service` / `domain.repository` / `infrastructure`；`platform` 不得依赖业务上下文。以上由 `ArchitectureTest` 守护，违反会让 `./gradlew build` 失败。
2. **跨上下文**：只经目标上下文的已发布出口通信，出口必须登记进 `ArchitectureTest.PUBLISHED_CROSS_CONTEXT_PORTS`。
3. **`sample` 是分层样例**：新增业务请另建上下文，并在 `IdPrefix` 登记两位前缀、在 `ArchitectureTest.CONTEXTS` 登记上下文名，同时补本文件「目录职责」一行；不要在 `sample` 上堆业务代码。
4. **错误体统一为 RFC 7807**：领域异常由各上下文的 `*ProblemHandler` 映射成 4xx；不得让存储异常直接漏成 500。
5. **格式由 Spotless 拥有**：用 `./gradlew spotlessApply` 格式化，不要手工调缩进与 import 顺序。
6. **测试不许引入隐式外部依赖**：新增单元 / 契约测试必须能离线跑；需要真实数据库的断言放进集成测试（`@Tag("integration")` + `IT` 后缀），由 `scripts/dev-it.sh` 起容器执行。

## 脚本（`scripts/`）

| 脚本 | 作用 | 什么情况下用 |
| --- | --- | --- |
| `dev-test.sh` | 加载可选 `.env` 后跑 `gradle test`（默认排除集成测试） | 日常跑单元与契约测试：默认就该用它，它不碰容器、可离线跑 |
| `dev-it.sh` | 用 podman 起真实数据库容器（缓存为 redis 时另起 redis）、把连接信息经 `IT_*` 环境变量交给测试（不用 `SPRING_*`，避免盖掉离线测试的 H2 配置）、跑带 `-PincludeIntegration` 的测试，**退出时删除容器** | 改了仓储适配、迁移脚本、唯一约束等只有真实库能验证的东西时。`--tests '<FQCN>'` 跑单个类，`--keep` 保留容器调试，`clean` 清理上次异常退出留下的容器 |
| `dev-run.sh` | 加载可选 `.env` + 彩色日志后 `bootRun`；`APP_LOG_LEVEL` / `SQL_LOG_LEVEL` 可临时调日志级别 | 本地起服务联调时用它而不是裸 `bootRun`；应用参数放 `--` 之后（`-- --server.port=9090`） |
| `create-tag.sh` | 交互式创建 `<type>/vX.Y.Z` tag，可选推送 | 发布前打版本 tag（需要交互终端） |
| `podman-testcontainers.sh` | 打印 podman machine 的 Docker-compat socket，供 Testcontainers 当 `DOCKER_HOST` | **仅当你把集成测试改成 Testcontainers 时才需要**；当前由 `dev-it.sh` 自己管容器，用不到它 |
| `lib/load-env.sh` | 被上面几个脚本 source 的库：读项目根 `.env`（可选）并 export | 不直接调用 |
| `lib/resolve-image-tag.sh` | 从 tag 解析 `IMAGE_ENV` / `IMAGE_TAG` / `GIT_TAG` | 写发布脚本时 source 使用 |

## 数据与缓存

| 事项 | 约定 |
| --- | --- |
| 连接配置 | `src/main/resources/application-db.yml`；凭据只经环境变量注入，不写进配置文件 |
| 缓存用法 | 用例上标 `@Cacheable` / `@CacheEvict`，缓存名引用 `platform.cache.CacheNames`，不写字面量 |
|?if db == "mongodb"
| 唯一索引 | 首次写入前显式建立（见 `SampleMongoRepository`），不要依赖 `auto-index-creation` |
|?endif
|?if db == "postgres" or db == "mysql"
| 表结构 | 由 Flyway 迁移脚本拥有：**禁止修改已提交脚本**，结构变更新增 `V2__*.sql`；`ddl-auto: validate` 在启动时核对实体与库结构，不一致直接启动失败 |
|?endif
|?if cache == "redis"
| 缓存序列化 | `RedisCacheManager` 默认 JDK 序列化，**被缓存的返回值必须实现 `java.io.Serializable`** |
|?endif

## 文档站

`GET /doc.html`（knife4j）、`GET /v3/api-docs`（OAS）。`prod` profile 下文档站被关闭，业务接口不受影响。
