# {{project_name}}

{{title}} —— 基于 Ant Design Pro v6 的前端管理后台。本仓库由脚手架 `frontend-admin` 底座生成，自带分层骨架、质量门禁与给 agent 的渐进式指令。

- **定位**：后台管理界面（列表、详情、表单、工作台）。面向运营与内部使用，不做面向公网的营销页。
- **不含业务**：唯一的业务形状是 `sample` 模块（分层样例），落地时整体删除。
- **不含部署**：构建产物是 `dist/`，托管方式、网关与生产配置由部署方决定。

## 技术栈

| 方面 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Umi Max 4（`@umijs/max`） | 路由、插件、构建一体化；配置集中在 `config/config.ts` |
| UI | React 19 + antd 6 + ProComponents 3 | 布局与列表/详情/表单用 ProComponents，通用组件用 antd |
| 样式 | Tailwind CSS 4 + antd-style | 布局用 Tailwind，主题相关样式用 `createStyles` 取 token |
| 语言/类型 | TypeScript 7（tsgo），`strict` | 类型检查是门禁的一部分 |
| 格式与静态检查 | Biome 2 | 同时承担格式化与 lint；不引入 ESLint / Prettier |
| antd 工具链 | `@ant-design/cli`（离线元数据） | 写 antd 代码前查 API、改完查违规；由自带 skill `.pi/skills/antd/` 使用 |
| 测试 | Vitest 4 + Testing Library + happy-dom | 单元 / 组件 / 服务契约三层，全部离线可跑 |
| 变异测试 | StrykerJS 10（可选门禁） | 需要 TS 的 JS 编译器 API，由兼容层单独提供（见下） |
| 构建器 | utoopack（Turbopack 内核） | `npm run build`，产物在 `dist/` |

## 快速开始

```bash
npm install            # 首次安装；prepare 会自动执行 max setup
npm start              # 开发服务器（带 mock，无需后端即可点通页面）
```

打开 <http://localhost:8000> 即可看到骨架页与「示例列表 / 示例详情」。

接真实后端：

```bash
API_TARGET=http://localhost:9090 npm run dev    # 关掉 mock，/api/** 代理到后端
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm start` | 开发服务器（带 mock） |
| `npm run dev` | 开发服务器（`MOCK=none`，走代理打真实后端） |
| `npm test` | 单元 / 组件 / 服务契约测试（不判覆盖率） |
| `npm run test:coverage` | 同上 + 覆盖率门禁 |
| `npm run tsc` | 类型检查 |
| `npm run format` | 用 Biome 格式化并修复改动文件 |
| `npm run verify` | 完整验收：格式与静态检查 + 类型 + 测试与覆盖率 + CRAP |
| `npm run crap` | 只看 CRAP 分数（需要先跑过 `test:coverage`） |
| `npm run build` | 生产构建 |
| `npm run preview` | 本地预览构建产物（:8000） |
| `npm run lint` | biome lint + tsc（快速自查） |
| `npm run antd:lint` | antd 用法检查（deprecated / a11y / usage / performance） |
| `npm run mutation` | 变异测试（可选，慢；等价于 `stryker run`） |
| `scripts/qa-gate.sh` | **提交前验收**：跑五道门禁，失败时打印哪道失败、证据与下一步 |
| `scripts/mutation-gate.sh` | 变异测试门禁（可选；默认只变异相对基线的变更文件） |
| `scripts/dev-test.sh` | 跑测试的小工具（支持 `--watch`、单文件、`-t` 过滤） |
| `scripts/dev-run.sh` | 启动开发服务器（`--no-mock` 打真实后端） |
| `scripts/create-tag.sh` | 交互式创建 SemVer tag |

## 目录结构

```
config/                 umi 配置：config.ts（总入口）、routes.ts（路由=菜单）、proxy.ts（开发代理）、defaultSettings.ts（布局外观）
src/
  app.tsx               运行时装配：初始状态、ProLayout、请求全局配置、全局兜底挂载点
  requestErrorConfig.ts 错误提示：解析后端 RFC 7807 错误体
  components/           跨页面复用组件
  pages/                页面（一个目录一个页面；页面私有逻辑留在目录内）
  services/             后端接口层（一个资源一个文件）
  utils/                纯函数工具
  locales/              文案（zh-CN / en-US）
  global.tsx            全局副作用（引入 tailwind.css）
  loading.tsx           路由级懒加载占位
mock/                   开发期假数据（仅 npm start 生效）
tests/                  全局测试环境 + 分层依赖守护
scripts/                开发与门禁脚本
docs/scaffold/          给 agent 的按需章节（开发流程、目录职责、请求层约定）
public/scripts/loading.js  首屏占位脚本（构建时进 HTML）
.pi/skills/            项目级 skill：antd（antd 查询与用法检查）、pro-upgrade（antd 与 Pro 框架升级）
```

## 质量门禁

提交前必须过 `scripts/qa-gate.sh`，它依次跑五道门禁：

| 门禁 | 判据 | 阈值位置 |
| --- | --- | --- |
| 格式与静态检查 | Biome；**ratchet**：只检查相对基线的改动文件 | `biome.json` |
| 类型检查 | `tsc --noEmit`（strict） | `tsconfig.json` |
| antd 用法检查 | `@ant-design/cli` 的内置规则（deprecated / a11y / usage / performance） | 规则随 CLI 版本 |
| 测试与覆盖率 | Vitest + v8 覆盖率，行/分支/函数/语句四项 | `gate.config.json` 的 `coverage` |
| CRAP | `复杂度² × (1 − 覆盖率)³ + 复杂度`，逐函数检查 | `gate.config.json` 的 `crap.max` |

另有**可选的变异测试门禁** `scripts/mutation-gate.sh`：它默认不参与验收（慢），默认只变异相对基线的变更文件，判据是「存活变异体 ≤ `mutation.survivorsMax`（默认 0）、得分 ≥ `mutation.scoreMin`、零覆盖变异体为 0」。报告在 `reports/mutation/`。

**门禁失败时的正确修法是改被测代码或补测试**，不要改测试套件、门禁阈值或排除规则。`scripts/qa-gate.sh` 失败时会直接告诉你证据文件与下一步。

## 自带 skill（面向 agent）

仓库自带两个项目级 skill，pi 从 `.pi/skills/` 自动发现；人也可以直接照它们的命令用：

| skill | 用途 | 常用命令 |
| --- | --- | --- |
| [`.pi/skills/antd/SKILL.md`](.pi/skills/antd/SKILL.md) | antd 的 API/token/demo 查询、用法检查、单组件跨版本迁移、bug 上报 | `npx antd info Button --format json`、`npm run antd:lint` |
| [`.pi/skills/pro-upgrade/SKILL.md`](.pi/skills/pro-upgrade/SKILL.md) | 把项目升到最新 Ant Design Pro 模板（含 antd 大版本迁移检查） | 按 skill 内的「拉模板 → 分类框架/业务文件 → 差异合并 → 验证」流程 |

两个 skill 都来自上游 [ant-design/ant-design-pro](https://github.com/ant-design/ant-design-pro)，正文与上游保持一致；本地差异（命令名、门禁接线）写在各 skill 开头的「本仓库的差异」一节。

> 注意：`npx antd lint` 发现违规也返回 0，所以仓库把它包成了 `npm run antd:lint`（有违规即非 0 退出）。

### 关于 TypeScript 7 与变异测试

项目用 `typescript` 7（tsgo），这一版为了原生性能**移除了 JavaScript 编译器 API**（`ts.parseConfigFileTextToJson` 等），而 StrykerJS 的 sandbox 预处理要调用它。

本项目**不因此降级 TypeScript**，而是只给变异测试进程喂一个带 JS API 的内核：

- `devDependencies.typescript-classic` = `npm:@typescript/typescript6@^6.0.2`（微软提供的过渡兼容包）；
- `scripts/stryker-ts-compat-hooks.mjs` + `scripts/stryker-ts-compat-register.mjs`：用 Node 的模块解析钩子把 `typescript` 改指到该兼容包，仅对变异测试进程生效。

项目自身、`npm run tsc`、Vitest 仍然用 TS 7。

## 开发约定（要点）

完整规则见 [`AGENTS.md`](AGENTS.md) 与 [`docs/scaffold/`](docs/scaffold/)：

- **分层**：`utils` / `locales` 不依赖上层；`services` 不依赖视图；`components` 不依赖 `pages`；跨层引用用 `@/` 别名。由 `tests/architecture.test.ts` 守护。
- **页面只做装配**：请求进 `src/services/`，纯逻辑抽成同目录的 `*Query.ts` / `*Form.ts` 并单测；列表/详情用 ProComponents 的 `request`，不要手写 `useEffect` 拉数据。
- **文案走 i18n**：`useIntl().formatMessage({ id, defaultMessage })`，新增 key 同时补 `zh-CN` 与 `en-US`。
- **路由即菜单**：`config/routes.ts` 的 `name` 是 `menu.<name>` 文案 key，新增路由要同时补路由、文案与页面。
- **格式归 Biome**：用 `npm run format`，不要手工调格式，也不要引入 ESLint / Prettier。

## 配置项

| 配置 | 位置 | 说明 |
| --- | --- | --- |
| 后端代理目标 | 环境变量 `API_TARGET` 或 `.env`（见 `.env.example`） | 默认 `{{api_target}}`；只在 `npm start` / `npm run dev` 生效 |
| 站点标题 | `config/defaultSettings.ts` 与 `config/config.ts` 的 `title` | 浏览器标题、布局标题、菜单标题 |
| 主色与主题 | `config/defaultSettings.ts` 的 `token` / `navTheme` | ProLayout 支持的主题项都在这里 |
| 路由与菜单 | `config/routes.ts` | `hideInMenu` 控制是否出现在侧栏 |
| 覆盖率与 CRAP 阈值 | `gate.config.json` | 改动前请先想清楚为什么需要改 |
| 变异测试范围与阈值 | `stryker.config.json`（范围）、`gate.config.json` 的 `mutation`（阈值） | |

## 常见问题

**首屏白屏 / 页面卡在「正在加载…」**：`public/scripts/loading.js` 是首屏占位，若它没被替换说明 React 没接管——先看控制台报错；`src/.umi` 是生成目录，异常时删掉它重启开发服务器。

**点菜单报「页面资源加载失败」**：多见于发版后仍开着旧页面（旧 chunk 已被替换）。全局兜底（`src/components/ErrorBoundary`）会给出「重试」，它通过重挂载子树重新加载 chunk。

**接口 404 / 跨域**：先确认 `npm start`（带 mock）还是 `npm run dev`（打真实后端）；后者要保证 `API_TARGET` 指向的服务在跑，且路径前缀与 `src/services/` 里的 `/api` 一致。

**覆盖率或 CRAP 失败**：`scripts/qa-gate.sh` 会列出未覆盖最多的文件与超限的函数；补测试或把复杂函数拆小。不要调低 `gate.config.json`。

**变异测试报「零覆盖变异体」**：说明这段代码没有被任何测试执行到；如果是框架装配或生成代码，在 `stryker.config.json` 的 `mutate` 里排除它，而不是降低阈值。

**`--withHistory` / 增量历史**：那是 Stryker 商业版（Arcmutate）能力。开源版的 `incremental` 实测可能复用出过时结果，所以门禁默认清缓存跑本次范围，`--incremental` 仅供本地快速迭代。

## 不包含什么

- **部署阶段**：镜像、编排、网关、CDN、环境清单都不在本仓库范围内。
- **端到端测试**：底座只覆盖单元 / 组件 / 服务契约三层。需要浏览器级验证时自行接入 Playwright，并把它放在独立的门禁里（慢，且需要可用的后端）。
- **鉴权与权限**：骨架未接登录。接法是在 `src/app.tsx` 的 `getInitialState` 拉当前用户，再按 umi 的 `access` 约定加 `src/access.ts`。
