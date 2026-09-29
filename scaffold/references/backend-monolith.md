# 底座：backend-monolith（后端单体应用）

本文件是 `backend-monolith` 底座的说明书，读者是使用或维护该底座的模型。要解决的问题是：生成项目后不必再读模板源码，也能知道生成物长什么样、各组件做什么、边界在哪、怎么扩展。读完能按需改动生成物、新增限界上下文，或给底座加新组件。全文分：组成、分层规则、数据能力、缓存能力、运行与配置、新增上下文、扩展底座、选型与代价、已验证范围。

底座本身不含业务：唯一带代码的上下文是 `sample`（占位样例），落地时整体删除。

## 一、组成

生成物是一份完整的 Gradle 项目：

| 路径 | 内容 |
| --- | --- |
| `settings.gradle.kts`、`build.gradle.kts`、`gradle/libs.versions.toml`、`gradle.properties`、`gradlew*` | 构建：Gradle Kotlin DSL + version catalog；Boot 4 的插件不注入依赖管理，versionless 依赖全靠导入的 `spring-boot-dependencies` BOM 解析版本；代码格式化用 Spotless（见第六节） |
| `src/main/java/<pkg>/<App>Application.java` | 入口：`@SpringBootApplication` + `@EnableCaching` |
| `src/main/java/<pkg>/shared/` | 共享内核：`id/Ulid`（ULID 生成与校验）、`id/IdPrefix`（集合前缀表）。零框架依赖 |
| `src/main/java/<pkg>/platform/` | 跨上下文技术适配层：`cache/CacheNames`（缓存名常量）。不得依赖任何业务上下文 |
| `src/main/java/<pkg>/interfaces/` | 进程级入站适配：`HealthController`（`GET /api/health`） |
| `src/main/java/<pkg>/sample/` | 示例限界上下文，分层见下节 |
| `src/main/resources/application.yml` | 公共配置：应用名、`spring.config.import` 引入的两个能力组件配置文件、RFC 7807 开关、actuator、springdoc + knife4j |
| `src/main/resources/application-prod.yml` | 生产 profile：关闭 API 文档站（`knife4j.production: true`） |
| `src/test/resources/application-test.yml` | 测试 profile：不依赖任何外部数据库与缓存 |
| `src/test/java/<pkg>/ArchitectureTest.java` | 架构守护：四条规则，见第二节 |
| `src/test/java/<pkg>/ApplicationSmokeTest.java` | 冒烟：上下文能起、`/actuator/health` 为 `{"status":"UP"}` |
| `src/test/java/<pkg>/sample/**` | 分层测试样例：领域单测、用例单测（测试替身）、REST 契约测试，以及集成测试 `SampleIntegrationIT`（`@Tag("integration")`，跑真实数据库） |
| `.env.example` | 可选的本机覆盖项（端口冲突时的 `DB_HOST_PORT`、真实库凭据）；复制为 `.env`（已 gitignore） |
| `scripts/` | 开发辅助脚本：`qa-gate.sh`（提交前验收：跑门禁并在失败时给定位引导）、`mutation-gate.sh`（**可选**变异测试门禁：默认只变异相对基线的变更类，不参与 `./gradlew build`）、`dev-test.sh`（单元/契约测试）、`dev-it.sh`（集成测试：podman 起容器并在结束时删除）、`dev-run.sh`（本地起服务）、`create-tag.sh`（打 tag）、`podman-testcontainers.sh`（仅改用 Testcontainers 时需要）、`lib/*.sh`（供 source 的库）。用法见第五节 |
| `.codegraph/` | 本机 CodeGraph 索引（生成器在装了 CLI 时用 `codegraph init --yes` 建立，约 0.5s）。生成物已在项目 `.gitignore` 里忽略整个 `.codegraph/`，不入库；`codegraph status` 看统计，`codegraph index` 重建，`codegraph sync` 增量更新 |
| `.gitignore`、`.editorconfig`、`README.md` | 仓库约定与项目说明 |
| `.pi/sandbox.json` | git worktree 场景的沙箱放行。worktree 里的 `.git` 只是指向主仓库的文本文件，`git status`/`add`/`commit` 都要读写主仓库 `.git`（index、HEAD、objects、refs 都在那里），而沙箱默认只放行会话目录；模板里写成相对路径 `../{{project_name}}/.git`，渲染后即 `../<项目名>/.git`，主仓库与兄弟目录 worktree 两边解析到同一个 `.git`（相对路径的基准是 pi 进程的 cwd）。**前提**：主仓库目录名与项目名一致、worktree 建在兄弟目录（`git worktree add ../<项目名>-<分支>`）；把 worktree 放进 `<仓库>/.worktree/<名字>` 时该条目不匹配，需要另加 `../../.git` |
| `AGENTS.md`、`CLAUDE.md`、`docs/scaffold/*.md` | 给在本仓库工作的 agent 的指令，分入口与按需章节两层：`AGENTS.md` 只放仓库概述、硬约束与「文档地图」；细节放 `docs/scaffold/`（`development.md` 命令与测试分层、`structure.md` 目录职责与分层边界、`data-cache.md` 数据与缓存约定），由入口按任务分发，agent 只读相关的一篇。`CLAUDE.md` 只有一句指向 `AGENTS.md`。`README.md` 面向人，是 agent 指令里的**最后一档**：只在需要项目背景、技术选型理由、配置项或脚本参数的逐条说明时，才由地图路由过去读 |

`sample` 上下文的分层（六边形）：

| 层 | 内容 | 依赖方向 |
| --- | --- | --- |
| `domain/model`、`domain/service`、`domain/repository`、`domain/error` | 聚合根、值对象、领域服务、仓储端口、领域异常 | 零框架依赖；不读时钟，时间由应用层传入 |
| `application/dto`、`application/usecase` | 对外 DTO、用例（`@Service`） | 依赖本上下文 domain 与共享内核 |
| `infrastructure/persistence`、`infrastructure/*Configuration` | 仓储端口的实现、领域服务的 bean 装配 | 依赖本上下文 domain 与框架 |
| `interfaces/rest` | REST 控制器与 `*ProblemHandler` | 只依赖本上下文 `application` 与 `domain.error` |

## 二、分层与依赖规则

`ArchitectureTest` 用 ArchUnit 守住四条规则，违反即测试失败：

1. `..domain..` 与 `..shared..` 不得依赖 Spring、MongoDB、BSON、JPA、Hibernate、Servlet、Jackson。
2. 上下文之间只允许依赖白名单内的已发布出口。白名单是 `PUBLISHED_CROSS_CONTEXT_PORTS`，默认为空；新增跨上下文出口时必须显式登记。
3. 上下文的 `interfaces` 层不得依赖本上下文的 `domain.model` / `domain.service` / `domain.repository` / `infrastructure`，也不得直接依赖其它上下文；允许依赖本上下文 `application`、`domain.error`、同层与 `shared`。
4. `platform` 不得依赖任何业务上下文。

上下文可以依赖 `shared` 与 `platform`：前者是零框架的领域词汇，后者是不含业务的跨上下文技术能力。

## 三、数据能力组件

生成时二选一。`postgres` 与 `mysql` 共用 `data-jpa` 组件，靠变量与条件块区分驱动、连接串与迁移脚本。

| 组件 | 落点 | 行为 |
| --- | --- | --- |
| `data-mongodb` | `sample/infrastructure/persistence/{SampleDocument,SampleMapper,SampleMongoRepository}` + `application-db.yml` | 用 `MongoTemplate` 读写；首次写入前建立名称唯一索引；`DuplicateKeyException` 翻译为领域冲突异常 |
| `data-jpa` | `sample/infrastructure/persistence/{SampleJpaEntity,SampleJpaMapper,SampleJpaRepository,SampleJpaAdapter}` + `application-db.yml` + `db/migration/V1__init.sql` | 实体与领域模型分开，Spring Data 只出现在 `infrastructure`；`saveAndFlush` 让唯一约束当场生效并把 `DataIntegrityViolationException` 翻译为领域冲突异常；表结构由 Flyway 拥有，`ddl-auto: validate` 启动时核对 |

两个组件都遵守同一条契约：**存储细节不得漏到上层**。唯一约束冲突必须变成领域异常（→ 409），库内数据损坏必须变成 `IllegalStateException`（→ 500），且不能把领域异常挂进 cause 链（否则会被 REST advice 认领成 400）。

关系库组件的连接与迁移：

- 连接参数只经环境变量注入：`SPRING_DATASOURCE_URL` / `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD`；文件内默认值只用于本机开发。
- `spring-boot-starter-flyway` 是必需的：Boot 4 把 Flyway 的自动配置拆进了 `spring-boot-flyway` 模块，只加裸 `flyway-core` 时迁移不会执行，JPA 校验会因缺表而启动失败。
- 已提交的迁移脚本不得修改，结构变更新增 `V2__*.sql`。

## 四、缓存能力组件

生成时二选一。缓存走 Spring Cache 抽象：用例上标 `@Cacheable` / `@CacheEvict`，缓存名引用 `platform.cache.CacheNames`，实现由 `spring.cache.type` 决定。组件只提供 `src/main/resources/application-cache.yml`，由 `application.yml` 的 `spring.config.import` 引入。

| 组件 | 配置 | 代价 |
| --- | --- | --- |
| `cache-caffeine` | `type: caffeine` + `spring.cache.caffeine.spec`（容量与写后过期） | 进程内：无网络开销；多实例各自缓存，读放大 |
| `cache-redis` | `type: redis` + `spring.cache.redis.time-to-live` | 分布式一致；默认 JDK 序列化，**被缓存的返回值必须实现 `java.io.Serializable`**（`SampleView` 已实现） |

测试 profile 把缓存强制为 `simple`（进程内 Map），因此 `./gradlew test` 不需要 Redis。

## 五、运行与配置

公共配置在 `application.yml`，能力组件的配置由它引入：

```yaml
spring:
  config:
    import: "classpath:application-db.yml,classpath:application-cache.yml"
```

两个文件必须存在（生成器按所选组件放入），缺失时启动直接失败而不是静默降级。

常用命令：

```bash
./gradlew test        # 单元与契约测试：不需要任何外部依赖
./gradlew build       # 完整验收：测试 + ArchUnit 架构守护 + 格式检查 + 覆盖率与 CRAP 门禁
scripts/qa-gate.sh   # 提交前验收（等价于 ./gradlew build；失败时打印哪道门禁失败、证据与下一步）
scripts/mutation-gate.sh  # 变异测试门禁（可选，慢）：默认只变异相对基线的变更类；--all 为全量
./gradlew bootRun     # 启动服务（或 scripts/dev-run.sh）
scripts/dev-it.sh     # 集成测试：podman 起真实数据库，跑完自动删容器
```

`./gradlew build` 除测试、架构守护与格式检查外，还强制两项质量门禁（任一不达标即失败）：覆盖率为 JaCoCo 采集的 bundle 覆盖比值，下限由 `gradle.properties` 的 `coverageLineMin` / `coverageBranchMin` 给出；CRAP 由 `build.gradle.kts` 里的 `crapReport` / `crapCheck` 从 JaCoCo XML 逐方法现算，上限为 `crapMax`。报告落点：`build/reports/jacoco/test/html/index.html`（覆盖率）、`build/reports/crap/crap.txt`（CRAP 明细）。

变异测试是**可选门禁**，默认不参与 `./gradlew build`：PIT 依赖挂在独立的 `pitestCli` configuration 上，日常构建不解析，因此底座默认构建保持零外部依赖。它由 `./gradlew pitest` 或 `scripts/mutation-gate.sh` 显式触发，判据为存活变异体数 ≤ `mutationSurvivorsMax`（默认 0）、变异得分 ≥ `mutationScoreMin`（默认 0）、以及零覆盖变异体数（`mutationFailOnNoCoverage=true` 时判失败）；报告落点为 `build/reports/pitest/index.html` 与 `build/reports/pitest/mutations.xml`。注意 OSS 版 PIT 的增量历史（`--withHistory`）需要 Arcmutate 插件，核心版没有，因此增量只靠「只变异变更类」实现。

端点：`GET /api/health`（轻量探活）、`GET /actuator/health`（进程级健康）、`GET /doc.html`（knife4j 文档站）、`GET /v3/api-docs`（OAS 文档）。

文档站默认开启（`knife4j.enable: true`）；`prod` profile 下 `knife4j.production: true` 让它返回拒绝页而业务接口不受影响。knife4j 4.4.0 传递 springdoc 2.x，与 Boot 4 冲突，因此 `build.gradle.kts` 里对 knife4j starter 做了 `exclude(group = "org.springdoc")` 并自引 springdoc 3.1.x —— 去掉这个 exclude 会让文档站与 OAS 版本一起回退。

### 集成测试与 podman

测试分两层，唯一的 podman 使用点在第一层的边界上：

| 层 | 依赖 | 怎么跑 |
| --- | --- | --- |
| 单元 / 用例 / REST 契约测试 | 无（测试 profile 用 H2 与测试替身） | `./gradlew test`，或 `scripts/dev-test.sh` |
| 集成测试（`@Tag("integration")`、类名 `*IT`） | podman 容器里的真实数据库（缓存为 redis 时另起 redis） | `scripts/dev-it.sh` |

`test` 任务默认用 `excludeTags("integration")` 排除集成测试，所以 `./gradlew build` 永远不需要 podman；`dev-it.sh` 会带上 `-PincludeIntegration` 并把连接信息经环境变量交给测试 JVM（`org.gradle.daemon=false` 保证单次 JVM 能读到）。

**容器清理是硬要求**：`dev-it.sh` 用 `trap ... EXIT` 删除容器，成功、失败、Ctrl-C 三种路径都清；容器另外带 `--rm`，即使脚本被 `kill -9` 也不会长期残留。上一次异常退出留下的同名容器由脚本开头的预清理与 `scripts/dev-it.sh clean` 兜住。

**本底座不负责部署阶段**：没有镜像构建、没有编排文件、没有环境清单；运行形态与生产凭据由部署方决定。因此 podman 只作为「集成测试的临时依赖」出现，不承担本地常驻服务。

### 开发辅助脚本（`scripts/`）

| 脚本 | 什么时候用 | 怎么用 |
| --- | --- | --- |
| `dev-test.sh` | 跑单元与契约测试（不碰容器） | `scripts/dev-test.sh [--tests <FQCN>]` |
| `dev-it.sh` | 跑集成测试：podman 起容器 → 跑 `-PincludeIntegration` → 删除容器 | `scripts/dev-it.sh`；`--keep` 保留容器调试，`clean` 清理遗留容器 |
| `dev-run.sh` | 本地起服务，要彩色日志与自动加载环境变量 | `scripts/dev-run.sh`；应用参数放 `--` 之后（`-- --server.port=9090`） |
| `create-tag.sh` | 交互式打 `<type>/vX.Y.Z` tag | `scripts/create-tag.sh`，需要交互终端 |
| `podman-testcontainers.sh` | 仅改用 Testcontainers 写集成测试后：暴露 podman machine 的 Docker-compat socket | `export DOCKER_HOST="$(scripts/podman-testcontainers.sh host)"` 再 `./gradlew test --no-daemon` |
| `lib/load-env.sh` | 被上面几个脚本 source | `load_env <项目根>`，读项目根 `.env`（可选） |
| `lib/resolve-image-tag.sh` | 发布脚本里从 tag 解析镜像环境与版本 | `source` 后 `resolve_image_tag release/v1.2.3` |

脚本对缺失的环境文件只提示不报错。`podman-testcontainers.sh` 在本底座默认无用：测试用 H2 与测试替身，不依赖容器，只有引入 Testcontainers 集成测试后才需要。

## 六、代码格式（Spotless）

```bash
./gradlew spotlessApply     # 格式化
./gradlew spotlessCheck     # 只检查；已挂在 check 上，./gradlew build 会跑
```

**格式化范围由 git 决定**：`ratchetFrom("HEAD")` 让 Spotless 只处理相对 HEAD 有改动的文件，含新增未跟踪文件。已提交的文件不进入检查范围，因此不会对既有代码做无差别重排，只有提交后的下一次改动会被检查。不启用 ratchet 的话，第一次接入就会把整个仓库重排一遍。

ratchet 需要能解析 HEAD，两种情况会让 Spotless 硬失败：不在 git 仓库内（`Cannot find git repository in any parent directory`）、git 仓库尚无提交（`No such reference 'HEAD'`）。`build.gradle.kts` 因此先用 `git rev-parse --verify --quiet HEAD` 探测，探测不到就不启用 ratchet，退化为全量检查 —— 底座源码本身是格式化干净的，所以 `git init` 之前 `./gradlew build` 同样通过。

格式化规则：

| 目标 | 规则 |
| --- | --- |
| `src/*/java/**/*.java` | palantir-java-format（4 空格、120 列）；import 固定分组 `java → javax/jakarta → org → 其它第三方 → 本项目`；删除未使用的 import；去行尾空白、末尾补换行 |
| `*.md`、`docs/**/*.md`、`*.yml`、`*.yaml`、`*.toml`、`*.sql`、`*.kts`、`*.sh`、`.env.example`、`.gitignore`、`.editorconfig` | 去行尾空白、末尾补换行 |

import 分组必须显式固定：palantir 默认按字母序排全部 import，本项目包名（如 `com.acme.order`）会插进第三方中间，于是同一份模板在不同包名下格式化结果不同，模板无法预先格式化干净。固定分组后未匹配任何前缀的 import 落在最后一组，格式与包名无关。

换格式化器：把 `palantirJavaFormat()` 换成 `googleJavaFormat()`。Google 风格是 2 空格 / 100 列，会重排现有代码。

## 七、新增限界上下文

1. 复制 `sample` 的目录形状（`domain` / `application` / `infrastructure` / `interfaces` + `package-info.java`），换成真实业务名称。
2. 在 `IdPrefix` 登记该上下文的两位前缀；id 值对象照 `SampleId` 的形状写（规范化、校验前缀、校验 ULID）。
3. 在 `ArchitectureTest.CONTEXTS` 登记上下文名；若该上下文要与别的上下文协作，先定义它的应用层端口并登记进 `PUBLISHED_CROSS_CONTEXT_PORTS`。
4. 在 `CacheNames` 登记该上下文的缓存名（若使用缓存）。
5. 删除 `sample` 包与 `src/test/java` 下对应的测试。
6. 在 `docs/scaffold/structure.md` 的「目录职责」表补一行说明该上下文，并在「分层与依赖规则」下补充它的出口（若有）；`AGENTS.md` 与 `CLAUDE.md` 不用动。

## 八、扩展底座

模板目录 `templates/backend-monolith/` 的结构：

```
base/                        # 应用底座，唯一
components/data-mongodb/     # 数据能力组件
components/data-jpa/         # 数据能力组件（postgres / mysql 共用）
components/cache-caffeine/   # 缓存能力组件
components/cache-redis/      # 缓存能力组件
```

生成器按 `base` → 数据能力组件 → 缓存能力组件 的顺序叠加渲染，后写入的同名文件覆盖先写入的。

模板语法两条：

- 占位符 `{{变量}}`，可用变量：`project_name`、`package`、`package_path`、`app_class`、`db`、`cache`、`db_name`、`db_user`、`db_password`、`db_platform`、`jdbc_driver`、`jdbc_url`、`hibernate_dialect`、`db_port`。
- 条件块，指令行本身会被删除：

```
//?if db == "mongodb"
...仅在 mongodb 时保留...
//?elif db == "mysql"
...
//?else
...
//?endif
```

指令行的注释前缀可以是 `//`、`#`、`--`、`/*`、`*`、`<!--`，因此模板在多数语言里仍可当合法注释阅读。表达式支持 `==`、`!=`、`in`、`and`、`or`、`not`。

要在 markdown 表格中间条件化某一行，指令写成 `|?if ...` / `|?endif`（允许前导与尾随竖线）：指令行在渲染时被删除，输出仍是连续表格。⚠️ 不要用独立的 `?if` 段来条件化表格行 —— 那会把表格切断。同理，条件段之间的空行要在两个分支里都存在，否则某个分支渲染出来会缺空行（把内容做成表内条件行可以完全回避这个问题，`docs/scaffold/structure.md` 与 `docs/scaffold/data-cache.md` 即如此）。

生成器对 `gradlew` 与 `*.sh` 会设置可执行位（`0o755`）：模板里 `scripts/` 下的脚本拷进新项目后必须能直接执行。

生成器是 PEP 723 单文件脚本（`scripts/scaffold.py`）：用 `uv run scripts/scaffold.py ...` 执行，uv 按内联元数据（`requires-python = ">=3.11"`、`dependencies = ["PyYAML>=6.0"]`）建隔离环境，不污染全局 Python；用系统 `python3` 直接跑也能工作，PyYAML 缺失时只跳过 YAML 自检并给出提示。

每次渲染后生成器自检产物：占位符是否残留、`*.yml` 能否被 PyYAML 解析、`*.toml` 能否被 tomllib 解析；发现问题返回非 0 并列出问题文件，此时不要交付，先修模板。改模板后建议至少跑一次全组合渲染，确认自检与 `./gradlew spotlessCheck` 都过。

需要一次性工具时用 `uvx` 临时执行，不装全局、不写进依赖。例如给 `scripts/` 下的 shell 脚本做静态检查：

```bash
uvx --from shellcheck-py shellcheck -S warning -x scripts/*.sh scripts/lib/*.sh
```

加新组件：在 `components/` 下新建目录（如 `cache-caffeine` 的形状），在 `scripts/scaffold.py` 的 `DATA_COMPONENTS` / `CACHE_COMPONENTS` 里登记名称与目录。加新底座：在 `templates/` 下新建目录，至少含 `base/`，在 `SKILL.md` 的底座清单里加一行，并写一份对应的 `references/<底座>.md`。

维护提醒：模板目录里出现 `bin/`、`build/`、`.gradle/`、`.idea/` 时说明有人就地构建过；生成器会跳过这些目录，仓库 `.gitignore` 也已忽略，但应当清理。改命令、脚本行为或数据 / 缓存约定时，同步更新 `README.md` 与 `docs/scaffold/` 下对应的那一篇，`AGENTS.md` 只在硬约束或文档地图变化时动。

## 九、选型与代价

| 选型 | 理由 | 代价 |
| --- | --- | --- |
| Spring Boot 4.1 + Java 21 | 与参考实现同线；Boot 4 的 starter 与自动配置已按技术拆分 | Boot 4 的自动配置按模块拆分，加技术要认 starter 而不是裸库（Flyway 即一例） |
| Gradle Kotlin DSL + version catalog | 依赖版本集中一处，条件块只写在 `build.gradle.kts` | 无 |
| 六边形分层 + ArchUnit | 边界可回归，评审不靠人记 | 新增跨上下文调用要先开端口并登记白名单 |
| ULID + 集合前缀 | 字典序即时间序，无需协调分配；id 归属一眼可辨 | 前缀表要人工维护，新增上下文需登记 |
| RFC 7807 Problem Details | 领域异常与框架错误共用一种错误体 | 领域异常类型必须由各上下文的 advice 显式映射 |
| Flyway 拥有表结构 | 迁移可审计；`validate` 让实体与库结构不一致时启动即失败 | 改结构要写迁移，不能靠 `ddl-auto: update` |
| Spring Cache 抽象 | 业务代码不感知缓存实现，切换只换组件与配置 | Redis 默认 JDK 序列化，被缓存的值必须可序列化 |
| Spotless + palantir-java-format | 4 空格 / 120 列，与本底座既有风格一致，格式化后改动面小；配合 ratchet 不重排既有代码 | 换 Google 风格是一行改动，但会重排全部既有代码 |
| springdoc 3.1.1 + knife4j 4.4.0 | 与参考实现同款文档站；knife4j 提供中文 UI 与接口分组 | knife4j 停更于 4.4.0（Boot 3.x 线），必须排除它传递的 springdoc 2.x 并自引 3.1.x；已接受其 OAS 3.1 渲染风险 |

## 十、已验证范围

六个数据 / 缓存组合全部实跑 `./gradlew test` 通过（每个 22 个测试）。其中三个组合另外对真实数据库启动了服务，完成创建 / 读取 / 列表 / 重名 409 / 删除 204 / 删除后 404：

| 组合 | 额外确认 |
| --- | --- |
| `mongodb` + `caffeine` | 名称唯一索引已建立；`_id` 为业务 id |
| `postgres` + `redis` | Flyway 迁移成功、`ddl-auto: validate` 通过；Redis 出现 `samples::<id>` 缓存键；删除后缓存被清 |
| `mysql` + `caffeine` | Flyway 迁移成功、`validate` 通过；列类型为 `varchar(32/64/1024)` 与 `datetime(6)` |

`mongodb` + `redis`、`postgres` + `caffeine`、`mysql` + `redis` 三个组合只跑过测试，未单独对真实数据库启动；它们由上述已验证的组件组成。

文档站另在 `mongodb` + `caffeine` 上实跑确认：`/doc.html` 返回 knife4j UI（`text/html`），`/v3/api-docs/default` 返回 OAS 3.1.0 且含 `/api/**` 分组的全部接口，`/swagger-ui/index.html` 同时可用；`prod` profile 下 `/doc.html` 返回拒绝页而 `/api/health` 仍为 200。

代码格式：六个组合与三种包名（`zz.qq`、46 字符长包名、`io.github.alphagodzilla.someapp`）的 `./gradlew spotlessCheck` 全部通过。ratchet 语义用对照实验确认：提交时已存在的不合规文件既不被检查也不被改写，提交后修改的文件与新增未跟踪文件都被检查并改写；`git init` 但尚无提交时不再报 `No such reference 'HEAD'`。

覆盖率与 CRAP 门禁：六个组合实跑 `./gradlew build` 全部通过，实测行覆盖 70.6%（`mongodb`）~ 72.5%（`postgres` / `mysql`）、分支覆盖 74.1%，89 个方法里最高 CRAP 6.1；删除 `sample` 占位上下文后骨架自身行覆盖 87.5%。门禁的拦截能力用反例确认：注入一个圈复杂度 9、零覆盖的方法后 `crapCheck` 报 `CRAP 门禁未通过：1 个方法超过 crapMax=30`（该方法 90.0 分），`-PcoverageLineMin=0.95` 时 `jacocoTestCoverageVerification` 报 `lines covered ratio is 0.72, but expected minimum is 0.95`。合并两层覆盖率另在 `mongodb` + `redis` 上用 `scripts/dev-it.sh build` 实测：行覆盖 70.6% → 92.2%、分支覆盖 74.1% → 79.6%，跑完容器 0 残留。

`scripts/qa-gate.sh` 在六个组合上实跑通过（成功路径打印测试类/用例数、覆盖率与最高 CRAP）。它的失败引导按场景逐个实测：编译错误（列出 `文件:行: 错误` 并去重）、测试失败（类 + 用例 + 反转义后的断言消息，每类最多 5 条）、架构违规（额外指向 `docs/scaffold/structure.md` 的分层规则）、Spotless 违规（列出违规文件）、覆盖率不足（`Rule violated` 原文 + 未覆盖行最多的 5 个类及其源码路径）、CRAP 越界（方法 + 源码路径）；**覆盖率门禁先失败导致 `crap.txt` 未生成时，脚本会补跑一次 `crapReport` 以拿到 CRAP 明细**（该路径单独实测）。脚本经 `bash -n` 与 `shellcheck -S warning -x` 检查无告警，渲染后与模板逐字节一致。

变异测试门禁：PIT 1.30.0 + pitest-junit5-plugin 1.2.3，`scripts/mutation-gate.sh` 实跑通过。全量（`--all`，4 线程）实测 114 个变异体：killed 59、survived 25、零覆盖 30，得分 51.8%，耗时 38 秒；单类（`--class ...Sample`）实测 11 个变异体、10 killed、1 survived，脚本准确定位到 `Sample.normalizeDescription:64` 的 `ConditionalsBoundaryMutator` 并按阈值退出 1。`./gradlew build` 实测不含 `pitest` 任务（可选门禁成立）。
