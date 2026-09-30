---
name: scaffold
description: 从内置技术底座生成新项目骨架，替代每次新建项目重复做框架与组件选型。当前底座：backend-monolith（Spring Boot 4 + Java 21 + 六边形分层后端单体，数据能力 mongodb/postgres/mysql，缓存能力 caffeine/redis）、frontend-admin（Ant Design Pro v6 + Umi Max 4 + React 19 + antd 6 前端管理后台，含 Biome/Vitest/覆盖率/CRAP 门禁与可选变异测试门禁）。触发场景：用户说"新建项目""起一个后端""起一个管理后台""搭个骨架""初始化工程"，或要求创建后端服务 / 前端后台但没有指定技术栈时。
---

# 项目脚手架（scaffold）

本 skill 让模型从一个已验证的技术底座直接生成可构建、可运行的新项目，读者是负责创建新项目的模型。要解决的问题是：新建项目时反复询问并重新决定框架、分层、构建、错误体、测试与部署形态，导致每次从零拼装且质量不稳定。读完能收齐参数、一条命令生成项目、跑通验证，并按清单完成生成后收尾。全文分：底座清单、触发边界、铁律、生成流程、生成后收尾、自检。

## 底座清单

| 底座 | 形态 | 该底座声明的参数（除项目名外） | 一句话说明 |
| --- | --- | --- | --- |
| `backend-monolith` | 后端单体应用 | 基础包名（必填）；数据能力 `mongodb` / `postgres` / `mysql`；缓存能力 `caffeine` / `redis` | Spring Boot 4.1 + Java 21，Gradle Kotlin DSL，六边形分层，RFC 7807 错误体，ArchUnit 架构守护 |
| `frontend-admin` | 前端管理后台 | 站点标题（可选，默认由项目名推导）；开发期后端代理目标（可选，默认 `http://localhost:8080`） | Ant Design Pro v6（Umi Max 4 + React 19 + antd 6），TypeScript 7，Biome 管格式与静态检查，Vitest + 覆盖率 + CRAP 门禁 |

每个底座的结构、分层规则、参数、脚本与已验证范围见 `references/backend-monolith.md` 与 `references/frontend-admin.md`。

## 触发与不触发

适用：

- 用户要求新建后端项目、服务、骨架或工程，且未指定技术栈或只指定了其中一部分。
- 用户要求新建前端管理后台 / 中后台 / 运营后台，且未指定技术栈或只指定了其中一部分。
- 用户要求"用我们那套底座起一个新项目"。

不适用：

- 在已有项目里加功能或改模块：直接改代码，不生成新项目。
- 用户明确要求与底座不同的技术栈（Vue / Angular / Svelte、Go 后端等）：按用户要求执行，并说明本底座不适用。
- 只写设计文档或做需求建模：改用 `doc-writing-conventions` 或 `ontology-modeling`。

## 铁律

1. **禁止重新选型**：框架版本、分层、构建、错误体、测试与部署形态已由底座固定。禁止就这些内容询问用户，也禁止把生成结果替换成别的框架。
2. **只问该底座声明的参数**：`templates/<底座名>/template.py` 里的 `PARAMS` 就是全部可问项。有默认值的按默认值取，并在报告里说明；用户已给出线索（"要 MySQL""标题叫订单后台""后端在 9090"）时直接采用，不再确认。
3. **必须用生成器**：通过 `scripts/scaffold.py` 渲染。禁止手工复制模板或手写骨架——手工路径会漏掉条件块与占位符替换，生成物无法构建。
4. **生成后必须验证**：在生成目录跑该底座对应的验收命令（见「生成流程」第 4 步），通过后才算完成。失败时修模板并重新生成，禁止把失败结果交付给用户。
5. **禁止把业务写进底座**：底座里的 `sample` 只是分层样例（后端是 `sample` 限界上下文，前端是 `src/pages/sample/`）。真实业务另建模块，禁止直接在样例上堆业务代码。
6. **不要为了迁就工具而降级底座选型**：前端底座的 TypeScript 7 与 StrykerJS 的兼容层已经就位（`scripts/stryker-ts-compat-*` + `typescript-classic`），禁止把 `typescript` 降级来绕过工具兼容问题。

## 生成流程

1. **收齐参数**：读 `templates/<底座名>/template.py` 的 `PARAMS`，缺的按默认值补，不再追问。
2. **定目标目录**：默认在当前工作目录下建同名子目录；用户给了路径就用它。
3. **执行生成**（`<skill 目录>` 是本 skill 所在目录）：

```bash
# 后端单体
uv run <skill 目录>/scripts/scaffold.py \
  --template backend-monolith \
  --name <项目名> --package <包名> \
  --db <mongodb|postgres|mysql> --cache <caffeine|redis> \
  --out <父目录>

# 前端管理后台
uv run <skill 目录>/scripts/scaffold.py \
  --template frontend-admin \
  --name <项目名> --title "<站点标题>" --api-target <后端地址> \
  --out <父目录>
```

公共可选参数：`--force`（目标目录已存在时清空重建）、`--skip-codegraph`。后端另有 `--skip-wrapper` 与 `--gradle-version`。

脚本是 PEP 723 单文件脚本：`uv run` 按内联元数据建隔离环境（依赖 PyYAML 做渲染自检），不污染全局 Python；没有 uv 时用系统 `python3` 也能跑，只是跳过 YAML 自检。

生成器在渲染后立即自检产物：占位符是否残留、`*.yml` / `*.toml` / `*.json` 能否被解析、以及「**块注释的延续行**里提前出现的 `*/`」（模板笔误会让生成的源码提前闭合注释，这类问题只有自检能拦在生成阶段；判定要求该行确实处于块注释内，因此 markdown 项目符号与 `.gitignore` 的 glob 不会被误判，单行注释不在覆盖范围内）。**渲染前**还会做一项检查：每个底座在 `template.py` 里声明的 `PLACEHOLDERS`（占位符 → 至少出现多少次，路径名与文件内容都算）必须成立——它拦的是「把渲染结果同步回模板目录、把占位符覆盖成真实值」这类事故，那种模板渲染照样能跑，却会把上一个项目的名字带进新项目。自检失败会返回非 0 并指出问题文件——那是模板问题，修模板后重跑，禁止把失败结果交付给用户。

随后的后置步骤由各底座自己声明：`backend-monolith` 生成 Gradle wrapper（本机有 `gradle` 时）；两者都会执行 `codegraph init --yes <项目>` 建立代码索引（**未安装 `codegraph` CLI 时静默跳过**，已安装但索引失败时只警告、不阻断交付）。

4. **验证**：

| 底座 | 验收命令 | 覆盖 |
| --- | --- | --- |
| `backend-monolith` | `cd <项目目录> && scripts/qa-gate.sh` | 测试 + ArchUnit 架构守护 + 格式检查 + 覆盖率与 CRAP 门禁 |
| `frontend-admin` | `cd <项目目录> && npm install && scripts/qa-gate.sh` | 格式与静态检查 + 类型检查 + 测试与覆盖率 + CRAP |

前端必须先 `npm install`（`prepare` 会执行 `max setup` 生成 `src/.umi`，类型检查与 dev server 都依赖它）。通过后进行收尾。

5. **报告**：写明生成路径、所选参数与取值来源（默认值还是用户指定）、验证结果，以及下面三项收尾提醒。

## 生成后收尾

必须提醒用户（用户明确要求时代做）：

1. **删除 `sample` 样例**：
   - 后端：删 `sample` 限界上下文与它的测试，按同样形状建真实上下文；在 `IdPrefix` 登记两位前缀，在 `ArchitectureTest.CONTEXTS` 登记上下文名。
   - 前端：删 `src/pages/sample/`、`src/services/sample.{ts,test.ts}`、`mock/sample.ts`，并从 `config/routes.ts` 与 `src/locales/*/menu.ts` 移除 `sample-list` / `sample-detail`。
2. 用 `adr-writing` 把底座选型记成 ADR：框架版本、分层约定、门禁策略各记一条或合并成一条。
3. 确保 `.pi/sandbox.json` 随首次提交入库：它是 worktree 会话里 git 可用（读写主仓库 `.git`）的前提，未入库则新 worktree 拿不到这个文件（未跟踪文件不会被 `git worktree add` 带过去）。

两个底座已包含、无需用户再做的部分：

- `backend-monolith`：Gradle 构建与 wrapper、Spotless 格式化（`ratchetFrom HEAD`）、六边形分层骨架、RFC 7807 错误体、ULID id 生成、ArchUnit 架构守护、健康端点、API 文档站（springdoc + knife4j）、离线可跑的单元/契约测试 profile、集成测试脚手架（`@Tag("integration")` + `scripts/dev-it.sh`）、覆盖率与 CRAP 门禁、**可选变异测试门禁**（`scripts/mutation-gate.sh` + `./gradlew pitest`，PIT 依赖挂独立 configuration，不参与 `./gradlew build`）、CodeGraph 索引与项目级 MCP 配置（`.mcp.json`：`codegraph serve --mcp`）、给 agent 的渐进式指令。
- `frontend-admin`：依赖清单与 npm 脚本、TS 7 严格配置、Biome 格式化与静态检查、Umi Max 路由/布局/请求/i18n 装配、ProLayout 外观、RFC 7807 错误处理、断网横幅与渲染期兜底（含发版后 chunk 失效的重试）、Tailwind 与 antd-style 入口、开发期 mock、分层依赖守护（`tests/architecture.test.ts`）、覆盖率门禁、CRAP 门禁（只用 istanbul 覆盖率数据，与 TS 版本无关）、**antd 用法门禁**（`npm run antd:lint`：`npx antd lint` 有违规也返回 0，故包成非 0 退出）、**上游自带的两个项目级 skill**（`.pi/skills/antd/` 与 `.pi/skills/pro-upgrade/`，pi 自动发现，`AGENTS.md` 与 `docs/scaffold/` 均有指向它们的引导）、**可选变异测试门禁**（StrykerJS + 只给 Stryker 进程用的 TS 兼容内核）、CodeGraph 索引与项目级 MCP 配置（`.mcp.json`：`codegraph serve --mcp`）、给 agent 的渐进式指令。

两个底座都**不覆盖部署阶段**：不要生成镜像构建、编排或环境清单文件。

提交前验收脚本 `scripts/qa-gate.sh` 也在两个底座里：它跑上述门禁，失败时打印「哪一道门禁失败、证据文件、下一步命令」，并在输出里重申禁止改测试与阈值的约束。变异测试是**可选门禁**，不在验收路径里，由 `scripts/mutation-gate.sh` 显式触发（前端默认只变异变更文件，后端默认只变异变更类）。

## 自检

- [ ] 参数齐全，取值在 `template.py` 的 `PARAMS` 允许集合内（默认值已按规则补齐并说明）
- [ ] 生成目录结构符合对应 `references/<底座>.md` 的描述
- [ ] 后端：`./gradlew build` 通过（含覆盖率与 CRAP 门禁），且 `pitest` 未被 `build` 触发
- [ ] 前端：`npm install` 成功、`scripts/qa-gate.sh` 五道门禁全绿
- [ ] 各自的变异测试门禁可跑通：前端 `mutation-gate.sh --file <源文件>`、后端 `mutation-gate.sh --class <全限定类名>`，都能给出存活/零覆盖明细
- [ ] **改过模板**时：用**不同的**项目名/标题/包名再渲染一次，确认生成物里带的是新参数、旧参数值没有残留（占位符没被上一次的渲染结果覆盖）
- [ ] 报告写明所选参数与取值来源，并给出三项收尾提醒
- [ ] 未就框架、分层或构建形态向用户提问
