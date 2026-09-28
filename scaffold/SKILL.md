---
name: scaffold
description: 从内置技术底座生成新项目骨架，替代每次新建项目重复做框架与组件选型。当前底座 backend-monolith 为后端单体应用（Spring Boot 4 + Java 21 + 六边形分层），数据能力可选 mongodb / postgres / mysql，缓存能力可选 caffeine / redis。触发场景：用户说"新建项目""起一个后端""搭个骨架""初始化工程"，或要求创建后端服务但没有指定技术栈时。
---

# 项目脚手架（scaffold）

本 skill 让模型从一个已验证的技术底座直接生成可构建、可运行的新项目，读者是负责创建新项目的模型。要解决的问题是：新建项目时反复询问并重新决定框架、分层、构建、错误体、测试与部署形态，导致每次从零拼装且质量不稳定。读完能收齐四个参数、一条命令生成项目、跑通验证，并按清单完成生成后收尾。全文分：底座清单、触发边界、铁律、生成流程、生成后收尾、自检。

## 底座清单

| 底座 | 形态 | 可选组件 | 一句话说明 |
| --- | --- | --- | --- |
| `backend-monolith` | 后端单体应用 | 数据能力：`mongodb` / `postgres` / `mysql`；缓存能力：`caffeine` / `redis` | Spring Boot 4.1 + Java 21，Gradle Kotlin DSL，六边形分层，RFC 7807 错误体，ArchUnit 架构守护 |

底座的结构、分层规则、各组件行为与已验证范围见 `references/backend-monolith.md`。

## 触发与不触发

适用：

- 用户要求新建后端项目、服务、骨架或工程，且未指定技术栈或只指定了其中一部分。
- 用户要求"用我们那套底座起一个新项目"。

不适用：

- 在已有项目里加功能或改模块：直接改代码，不生成新项目。
- 用户明确要求与底座不同的技术栈（Node、Go 等）：按用户要求执行，并说明本底座不适用。
- 只写设计文档或做需求建模：改用 `doc-writing-conventions` 或 `ontology-modeling`。

## 铁律

1. **禁止重新选型**：框架版本、分层、构建、错误体、测试与部署形态已由底座固定。禁止就这些内容询问用户，也禁止把生成结果替换成别的框架。
2. **只问四件事**：项目名（kebab-case）、基础 Java 包名、数据能力、缓存能力。用户未给出数据能力或缓存能力时，取默认值 `mongodb` 与 `caffeine` 并在报告里说明；用户已给出线索（"要 MySQL""用 Redis"）时直接采用，不再确认。
3. **必须用生成器**：通过 `scripts/scaffold.py` 渲染。禁止手工复制模板或手写骨架——手工路径会漏掉条件块与占位符替换，生成物无法构建。
4. **生成后必须验证**：在生成目录执行 `./gradlew build`（测试 + ArchUnit 架构守护 + 格式检查 + 覆盖率与 CRAP 门禁），通过后才算完成。失败时修模板并重新生成，禁止把失败结果交付给用户。
5. **禁止把业务写进底座**：底座里的 `sample` 上下文只是分层样例。真实业务另建上下文，禁止直接在 `sample` 上堆业务代码。

## 生成流程

1. **收齐参数**：项目名、包名、数据能力、缓存能力。缺后两项时按默认值补，不再追问。
2. **定目标目录**：默认在当前工作目录下建同名子目录；用户给了路径就用它。
3. **执行生成**（`<skill 目录>` 是本 skill 所在目录）：

```bash
uv run <skill 目录>/scripts/scaffold.py \
  --template backend-monolith \
  --name <项目名> --package <包名> \
  --db <mongodb|postgres|mysql> --cache <caffeine|redis> \
  --out <父目录>
```

生成器渲染底座与所选两个能力组件、生成 Gradle wrapper，并打印下一步命令。可选参数：`--skip-wrapper`（不生成 wrapper）、`--force`（目标目录已存在时清空重建）、`--gradle-version`。

脚本是 PEP 723 单文件脚本：`uv run` 按内联元数据建隔离环境（依赖 PyYAML 做渲染自检），不污染全局 Python；没有 uv 时用系统 `python3` 也能跑，只是跳过 YAML 自检。

生成器在渲染后立即自检产物：占位符是否残留、`*.yml` 能否被 PyYAML 解析、`*.toml` 能否被 tomllib 解析。自检失败会返回非 0 并指出问题文件——那是模板问题，修模板后重跑，禁止把失败结果交付给用户。

随后生成 Gradle wrapper（本机有 `gradle` 时），并执行 `codegraph init --yes <项目>` 建立代码索引：**未安装 `codegraph` CLI 时静默跳过**（不执行、不打印提示），已安装但索引失败时只警告、不阻断交付。`--skip-wrapper` / `--skip-codegraph` 可显式跳过这两步。

4. **验证**：`cd <项目目录> && scripts/qa-gate.sh`（等价于 `./gradlew build`：测试 + 架构守护 + 格式 + 覆盖率与 CRAP 门禁，失败时打印定位引导）。通过后进行收尾。
5. **报告**：写明生成路径、所选数据能力与缓存能力、验证结果，以及下面两项收尾提醒。

## 生成后收尾

必须提醒用户（用户明确要求时代做）：

1. 删除 `sample` 上下文与它的测试，按同样形状建真实限界上下文；在 `IdPrefix` 登记两位前缀，在 `ArchitectureTest.CONTEXTS` 登记上下文名。
2. 用 `adr-writing` 把底座选型记成 ADR：框架版本、数据能力、缓存能力、分层约定各记一条或合并成一条。

底座已包含、无需用户再做的部分：Gradle 构建与 wrapper、Spotless 代码格式化（`ratchetFrom HEAD`，只格式化未提交的改动）、六边形分层骨架、RFC 7807 错误体、ULID id 生成、ArchUnit 架构守护、健康端点、API 文档站（springdoc + knife4j）、不依赖外部依赖的单元/契约测试 profile、集成测试脚手架（`@Tag("integration")` + `scripts/dev-it.sh`：podman 起容器并在结束时删除）、覆盖率与 CRAP 门禁（JaCoCo 覆盖率下限 + 从 JaCoCo XML 逐方法现算的 CRAP 上限，阈值在 `gradle.properties`）、CodeGraph 索引（本机装了 CLI 时生成器已执行 `codegraph init -y`）、给 agent 的渐进式指令（入口 `AGENTS.md` 只放硬约束与「文档地图」，细节章节在 `docs/scaffold/` 下按需读；`CLAUDE.md` 只指向入口）。**底座不覆盖部署阶段**：不要生成镜像构建、编排或环境清单文件。

提交前验收脚本 `scripts/qa-gate.sh` 也在底座里：它跑上述门禁，失败时打印「哪一道门禁失败、证据文件、下一步命令」，并在输出里重申上述禁止改测试与阈值的约束。

## 自检

- [ ] 四个参数齐全，数据能力与缓存能力取值在允许集合内
- [ ] 生成目录结构符合 `references/backend-monolith.md` 的描述
- [ ] `./gradlew build` 通过（含覆盖率与 CRAP 门禁）
- [ ] 报告写明数据能力与缓存能力，并给出两项收尾提醒
- [ ] 未就框架、分层或构建形态向用户提问
