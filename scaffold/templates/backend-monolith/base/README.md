# {{project_name}}

后端单体应用：Spring Boot 4 + Java 21，六边形分层，按限界上下文组织包。

在本仓库工作的 agent 先读 [`AGENTS.md`](AGENTS.md)：常用命令、目录职责与硬约束都在那里。

生成时的技术选型：

| 维度 | 取值 |
| --- | --- |
| 数据能力 | `{{db}}` |
| 缓存能力 | `{{cache}}` |
| 构建 | Gradle（Kotlin DSL）+ version catalog |
| 代码格式 | Spotless（`ratchetFrom HEAD`，只格式化未提交的改动） |
| 架构守护 | ArchUnit（`ArchitectureTest`） |
| API 文档 | springdoc 3.1.1 + knife4j 4.4.0（`/doc.html`） |

## 快速开始

```bash
./gradlew test        # 单元与契约测试：不需要任何外部依赖
./gradlew build       # 完整验收：上面的测试 + ArchUnit 架构守护 + 格式检查
./gradlew bootRun     # 启动服务（或 scripts/dev-run.sh，带彩色日志与环境变量）
```

集成测试需要真实数据库，由 `scripts/dev-it.sh` 用 podman 起容器、跑完自动删除：

```bash
scripts/dev-it.sh                                                    # 跑全部集成测试
scripts/dev-it.sh --tests 'com.acme.app.sample.SampleIntegrationIT'  # 跑一个类
```

本脚手架**不负责部署阶段**：仓库里没有镜像构建与编排文件，运行形态与生产凭据由部署方决定。

## 测试分层

| 层 | 依赖 | 怎么跑 |
| --- | --- | --- |
| 领域单测、用例单测、REST 契约测试 | 无（测试 profile 用 H2 与测试替身） | `./gradlew test` / `scripts/dev-test.sh` |
| 集成测试（`@Tag("integration")`，如 `SampleIntegrationIT`） | podman 容器里的真实数据库（缓存为 redis 时另起 redis） | `scripts/dev-it.sh` |

默认的 `test` 任务**排除**集成测试，所以 `./gradlew build` 永远不依赖外部依赖；只有 `dev-it.sh`
会带上 `-PincludeIntegration` 并保证容器在结束时被删除（成功、失败、Ctrl-C 都算）。

## 目录结构

```
src/main/java/{{package_path}}/
├── {{app_class}}.java        应用入口（@SpringBootApplication + @EnableCaching）
├── shared/                   共享内核：零框架依赖的基础类型（ULID、id 前缀表）
├── platform/                 跨上下文技术适配层（缓存名等）
├── interfaces/               进程级入站适配（健康端点）
└── sample/                   示例限界上下文（占位，落地时整体替换）
    ├── domain/               聚合、值对象、领域服务、仓储端口、领域异常
    ├── application/          用例与对外 DTO
    ├── infrastructure/       仓储实现与显式装配
    └── interfaces/           REST 控制器与异常映射
```

仓库根还有 `scripts/`（开发辅助脚本，见下）、`.env.example`（可选的本机覆盖项，如端口冲突时的
`DB_HOST_PORT`）、`AGENTS.md` / `CLAUDE.md`（给 agent 的入口指令）。若本机装了 `codegraph` CLI，
生成器已执行 `codegraph init --yes` 建立 `.codegraph/` 代码索引（已在 `.gitignore` 中忽略，不入库）。

## 分层与边界约束

- `domain` 与 `shared` 零框架依赖；`interfaces` 不得向上依赖本上下文的 `domain.model` / `domain.service` / `domain.repository` / `infrastructure`；`platform` 不得依赖任何业务上下文。
- 上下文之间只允许依赖目标上下文的已发布出口；出口登记在 `ArchitectureTest.PUBLISHED_CROSS_CONTEXT_PORTS`，未登记即测试变红。
- 错误体统一为 RFC 7807 Problem Details：领域异常在各上下文的 `*ProblemHandler` 里映射为 4xx，`application.yml` 打开 `spring.mvc.problemdetails` 兜住框架级错误。
- 领域对象不读时钟：时间由应用层传入，领域因此可在无容器、无数据库的环境里做单测。

以上全部由 `ArchitectureTest` 与各层测试守护。

## 代码格式（Spotless）

```bash
./gradlew spotlessApply     # 格式化
./gradlew spotlessCheck     # 只检查；已挂在 check 上，./gradlew build 会跑
```

格式化只作用于**相对 HEAD 有改动的文件**（含新增未跟踪文件）：已提交的文件不再进入检查范围，因此不会对既有代码做无差别重排，只有提交后的下一次改动会被检查。

- Java：palantir-java-format（4 空格缩进、120 列），import 固定分组 `java → javax/jakarta → org → 其它第三方 → 本项目`，删除未使用的 import。
- 其它文本（`*.md` / `*.yml` / `*.sql` / `*.toml` / `*.kts` / `*.sh` / `.env.example` / `.gitignore` / `.editorconfig`）：去行尾空白、末尾补换行。

⚠️ 项目还没 `git init` 或还没有首次提交时，Spotless 解析不到 HEAD，此时自动退化为全量检查（不会构建失败）；有了提交之后就只检查改动过的文件。

换格式化器：把 `build.gradle.kts` 的 `palantirJavaFormat()` 换成 `googleJavaFormat()`（Google 风格是 2 空格 / 100 列，会重排现有代码）。

## 开发辅助脚本（`scripts/`）

| 脚本 | 什么时候用 | 怎么用 |
| --- | --- | --- |
| `dev-test.sh` | 跑单元与契约测试（日常最常用） | `scripts/dev-test.sh`、`scripts/dev-test.sh --tests 'com.acme.app.shared.id.UlidTest'` |
| `dev-it.sh` | 跑集成测试（需要真实数据库） | `scripts/dev-it.sh`；跑完自动删容器；`--keep` 保留容器调试；`clean` 清理遗留容器 |
| `dev-run.sh` | 本地起服务联调 | `scripts/dev-run.sh`；应用参数放 `--` 之后：`scripts/dev-run.sh -- --server.port=9090`；`APP_LOG_LEVEL=DEBUG` / `SQL_LOG_LEVEL=DEBUG` 调日志 |
| `create-tag.sh` | 发布前打版本 tag（交互式） | `scripts/create-tag.sh`；类型默认取当前分支名 |
| `podman-testcontainers.sh` | **仅在改用 Testcontainers 写集成测试时才需要**：macOS 上把 podman machine 的 Docker-compat socket 暴露给 Testcontainers | `export DOCKER_HOST="$(scripts/podman-testcontainers.sh host)"` 再 `./gradlew test --no-daemon`。当前集成测试由 `dev-it.sh` 自己管容器，不需要它 |
| `lib/load-env.sh` | 由上面几个脚本 source，通常不必直接调用 | `load_env <项目根>`：读项目根 `.env`（可选）并 export |
| `lib/resolve-image-tag.sh` | 发布脚本里从 git tag 解析镜像环境与版本 | `source scripts/lib/resolve-image-tag.sh` 后 `resolve_image_tag release/v1.2.3` |

脚本对缺失的 `.env` 只提示、不报错：不建 `.env` 时用 `application-db.yml` 与 `dev-it.sh` 的内置默认值。

⚠️ 应用参数必须放在 `--` 之后：`bootRun` 不接受裸的 `--server.port=9090`，Gradle 会把它当成自己的选项并报 `Unknown command-line option`。

## 数据能力：`{{db}}`

<!--?if db == "mongodb"-->
连接串来自 `application-db.yml`，可经环境变量覆盖：

```bash
export SPRING_DATA_MONGODB_URI="mongodb://user:password@localhost:27017/{{db_name}}"
```

仓储适配在 `sample/infrastructure/persistence/SampleMongoRepository`：用 `MongoTemplate` 读写，并在首次写入前建立名称唯一索引。

<!--?endif-->
<!--?if db == "postgres" or db == "mysql"-->
连接参数来自 `application-db.yml`，可经环境变量覆盖：

```bash
export SPRING_DATASOURCE_URL="{{jdbc_url}}"
export SPRING_DATASOURCE_USERNAME="{{db_user}}"
export SPRING_DATASOURCE_PASSWORD="change-me"
```

仓储适配在 `sample/infrastructure/persistence/SampleJpaAdapter`：实体与领域模型分开，Spring Data 只出现在 `infrastructure`。

表结构由 `src/main/resources/db/migration/` 下的 Flyway 脚本拥有（`V1__init.sql` 建 `samples` 表），
`ddl-auto: validate` 在启动时核对实体与库结构，不一致直接启动失败。已提交的迁移脚本不得修改，结构变更新增 `V2__*.sql`。

<!--?endif-->

## 缓存能力：`{{cache}}`

缓存走 Spring Cache 抽象：用例上标 `@Cacheable` / `@CacheEvict`，缓存名引用 `platform.cache.CacheNames`，实现由 `spring.cache.type` 决定。

<!--?if cache == "caffeine"-->
`caffeine` 为进程内缓存，规格见 `application-cache.yml` 的 `spring.cache.caffeine.spec`（容量与写后过期）。
多实例部署时各实例缓存独立，读放大但无网络开销。

<!--?endif-->
<!--?if cache == "redis"-->
`redis` 为分布式缓存，连接经 `SPRING_DATA_REDIS_HOST` / `SPRING_DATA_REDIS_PORT` 覆盖。
Spring 的 `RedisCacheManager` 默认用 JDK 序列化缓存值，**被缓存的返回值必须实现 `java.io.Serializable`**，
`SampleView` 已经实现。集成测试由 `dev-it.sh` 顺带起一个 redis 容器。

<!--?endif-->

## 下一步

1. 删除 `sample` 包与它的测试，按同样形状新增真实限界上下文：在 `IdPrefix` 登记两位前缀，在 `ArchitectureTest.CONTEXTS` 登记上下文名，并补 `AGENTS.md` 的「目录职责」一行。
2. 用 `adr-writing` 把底座选型（框架版本、数据能力、缓存能力、分层约定）记成 ADR，后续每个技术决策单独记一条。
3. 需要跨上下文调用时，先定义对方的应用层端口，再登记进 `ArchitectureTest.PUBLISHED_CROSS_CONTEXT_PORTS`。
