# 目录职责与分层边界

本文件是 [`AGENTS.md`](../../AGENTS.md) 的按需章节：只在要确认某段代码放哪、或要新增限界上下文时读。

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
| `scripts/` | 开发辅助脚本，用法见 [`development.md`](development.md) |
| `docs/scaffold/` | 本目录：给 agent 的按需章节，由 [`AGENTS.md`](../../AGENTS.md) 按任务分发 |
| `.codegraph/` | 本机 CodeGraph 索引（生成器在装了 CLI 时执行 `codegraph init --yes` 建立）：已在 `.gitignore` 里忽略整个目录，不入库；重建用 `codegraph index`，增量用 `codegraph sync` |
| `.mcp.json` | 项目级 MCP 配置：把 CodeGraph 配成 MCP server（`codegraph serve --mcp`；`--skip-codegraph` 只跳过 `codegraph init`，不影响本文件） |

限界上下文内部的分层（六边形）：

| 层 | 内容 | 依赖方向 |
| --- | --- | --- |
| `domain/model`、`domain/service`、`domain/repository`、`domain/error` | 聚合根、值对象、领域服务、仓储端口、领域异常 | 零框架依赖；不读时钟，时间由应用层传入 |
| `application/dto`、`application/usecase` | 对外 DTO、用例（`@Service`） | 依赖本上下文 domain 与共享内核 |
| `infrastructure/persistence`、`infrastructure/*Configuration` | 仓储端口的实现、领域服务的 bean 装配 | 依赖本上下文 domain 与框架 |
| `interfaces/rest` | REST 控制器与 `*ProblemHandler` | 只依赖本上下文 `application` 与 `domain.error` |

## 分层与依赖规则

`ArchitectureTest` 用 ArchUnit 守住四条规则，违反即构建失败：

1. `..domain..` 与 `..shared..` 不得依赖 Spring、MongoDB、BSON、JPA、Hibernate、Servlet、Jackson。
2. 上下文之间只允许依赖白名单内的已发布出口。白名单是 `PUBLISHED_CROSS_CONTEXT_PORTS`，默认为空；新增跨上下文出口时必须显式登记。
3. 上下文的 `interfaces` 层不得依赖本上下文的 `domain.model` / `domain.service` / `domain.repository` / `infrastructure`，也不得直接依赖其它上下文；允许依赖本上下文 `application`、`domain.error`、同层与 `shared`。
4. `platform` 不得依赖任何业务上下文。

上下文可以依赖 `shared` 与 `platform`：前者是零框架的领域词汇，后者是不含业务的跨上下文技术能力。

## 新增限界上下文

1. 复制 `sample` 的目录形状（`domain` / `application` / `infrastructure` / `interfaces` + `package-info.java`）并改成真实业务名。
2. 在 `shared/id/IdPrefix` 登记该上下文的两位前缀；id 值对象照 `SampleId` 的形状写（规范化、校验前缀、校验 ULID）。
3. 在 `ArchitectureTest.CONTEXTS` 登记上下文名；要与别的上下文协作时，先定义它的应用层端口并登记进 `PUBLISHED_CROSS_CONTEXT_PORTS`。
4. 用缓存时在 `platform/cache/CacheNames` 登记该上下文的缓存名。
5. 删除 `sample` 包与 `src/test/java` 下对应的测试。
6. 在本文件「目录职责」表补一行说明该上下文，并写明它的出口（若有）。
