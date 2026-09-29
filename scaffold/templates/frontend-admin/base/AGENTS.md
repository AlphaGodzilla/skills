# AGENTS.md

本文件是在本仓库工作的 agent 的入口：只写「仓库是什么」「什么不许做」「去哪读细节」。细节按需读，不要一次全读。
[`README.md`](README.md) 是面向人的项目说明，**默认不用读**；确实需要背景、配置细节或脚本参数的逐条说明时，按下面的「文档地图」取用。

## 仓库

order-admin：Ant Design Pro v6（Umi Max 4 + React 19 + antd 6 + ProComponents 3）的前端管理后台，TypeScript 严格模式，Biome 管格式与静态检查，Vitest 管测试。开发期 `/api/**` 默认代理到 `http://localhost:8080`。

底座不含业务：唯一带业务形状的模块是 `sample`（分层样例：列表页 + 详情页 + 服务层 + 纯逻辑模块 + 契约测试），落地时整体删除。

## 硬约束

1. **分层**：`utils` 与 `locales` 不得依赖任何上层；`services` 不得依赖视图层；`components` 不得依赖 `pages`；跨层引用必须用 `@/` 别名而不是相对路径。由 [`tests/architecture.test.ts`](tests/architecture.test.ts) 守护，违反会让 `scripts/qa-gate.sh` 失败。
2. **文案只走 i18n**：组件里用 `useIntl().formatMessage({ id, defaultMessage })`，不要 `import` `src/locales/`；新增文案要同时补 `zh-CN` 与 `en-US`。
3. **路由即菜单**：`config/routes.ts` 的 `name` 是 i18n key（`menu.<name>`），新增路由必须同时补三处：`routes.ts`、`src/locales/*/menu.ts`、页面组件。
4. **页面只做装配**：请求写在 `src/services/`（配契约测试），页面里的纯逻辑抽到同目录的 `*Query.ts` / `*Form.ts` 并单测；不要在页面里手写 `useEffect` 拉数据，列表用 `ProTable` 的 `request`、详情用 `ProDescriptions` 的 `request`。
5. **不要在 `sample` 上堆业务代码**：新增业务另建模块目录，并按 [`docs/scaffold/structure.md`](docs/scaffold/structure.md) 的分层规则摆放。
6. **格式与静态检查由 Biome 拥有**：用 `npm run format` 修，不要手工调缩进、引号或 import 顺序；不要引入 ESLint / Prettier（两套风格会互相打架）。
7. **不要为了迁就工具降级 TypeScript**：项目用 `typescript` 7（tsgo）。变异测试要用的 JS 编译器 API 由 `scripts/stryker-ts-compat-*.mjs` 的解析钩子 + `typescript-classic`（官方过渡兼容包）单独提供，见 [`docs/scaffold/development.md`](docs/scaffold/development.md)。
8. **测试不许依赖真实后端**：服务层测试 mock `request`，页面测试 mock `@umijs/max` 与 services；需要真实后端的验证用 `scripts/dev-run.sh --no-mock` 手工确认。
9. **本仓库不负责部署阶段**：不要添加镜像构建、编排、网关或环境清单文件；构建产物是 `dist/`，托管方式与生产配置由部署方决定。
10. **不许为了让门禁变绿而改测试或门禁本身**：测试代码、断言、`vi.mock`、`vitest` 的排除项、门禁阈值（`gate.config.json` 的 `coverage` / `crap` / `mutation` 段）、`stryker.config.json` 的排除规则，都不得为了让 `scripts/qa-gate.sh` 或 `scripts/mutation-gate.sh` 通过而修改。门禁失败只能靠**改被测代码或补测试**解决；确需放宽阈值时，单独提交并写明理由。

## 文档地图

只在需要时读对应的一篇，不要全部读：

| 要做什么 | 先读 |
| --- | --- |
| 跑测试、启动开发服务器、判断该跑哪一层测试、跑门禁（含可选的变异测试） | [`docs/scaffold/development.md`](docs/scaffold/development.md) |
| 在 git worktree / 沙箱里跑命令，git 报 `not a git repository` | [`docs/scaffold/development.md`](docs/scaffold/development.md)（「在 git worktree 里跑命令」一节） |
| 判断一段代码该放哪个目录、新增页面或路由 | [`docs/scaffold/structure.md`](docs/scaffold/structure.md) |
| 改请求层、mock、错误提示、分页与状态管理 | [`docs/scaffold/data-and-api.md`](docs/scaffold/data-and-api.md) |
| 需要项目背景、技术选型理由、配置项或脚本参数的逐条说明（面向人的完整文档） | [`README.md`](README.md) |

最短路径：日常改完跑 `npm test`（不需要后端，也不判覆盖率）；**提交前必须过 `scripts/qa-gate.sh`**（格式与静态检查 + 类型检查 + 测试与覆盖率 + CRAP，不通过时脚本会指出往哪查）。
