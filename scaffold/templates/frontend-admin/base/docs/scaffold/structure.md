# 目录职责与分层边界

本文件是 [`AGENTS.md`](../../AGENTS.md) 的按需章节：只在要确认某段代码放哪、或要新增页面与路由时读。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `config/config.ts` | umi 配置的**唯一入口**：路由、插件、代理、构建器都在这里汇总 |
| `config/routes.ts` | 路由与菜单的唯一来源；`name` 即 i18n key（`menu.<name>`），`hideInMenu` 控制是否出现在侧栏 |
| `config/proxy.ts` | 开发期 `/api/**` 的代理目标（只在 `npm start` / `npm run dev` 生效，生产构建不含代理） |
| `config/defaultSettings.ts` | ProLayout 的默认外观（标题、主题、主色、布局） |
| `src/app.tsx` | 运行时装配：`getInitialState`（初始状态）、`layout`（ProLayout 配置）、`request`（请求全局配置）、`rootContainer`（全局兜底与断网横幅挂载点） |
| `src/global.tsx` | 全局副作用入口（当前只引入 `tailwind.css`） |
| `src/loading.tsx` | 路由级懒加载占位（首屏占位是 `public/scripts/loading.js`，两者分工不同） |
| `src/requestErrorConfig.ts` | 全局错误处理：解析后端 RFC 7807 错误体并决定提示文案 |
| `src/components/` | **跨页面**复用组件（被两个以上页面用到才放这里）；`index.ts` 是统一出口 |
| `src/pages/` | 页面；一个目录一个页面（`index.tsx`），页面私有的组件与纯逻辑留在页面目录内 |
| `src/services/` | 后端接口层：一个资源一个文件，只做「路径 + 方法 + 参数」 |
| `src/utils/` | 纯函数工具：无副作用、不依赖 React、不依赖服务层 |
| `src/locales/` | 文案：`zh-CN` / `en-US`，按 `menu` / `pages` / `network` 分组 |
| `src/typings.d.ts` | 静态资源（css/图片等）的模块声明 |
| `mock/` | 开发期假数据（只在 `npm start` 生效；`npm run dev` 用 `MOCK=none` 关掉） |
| `tests/` | 全局测试环境（`setupTests.ts`）与跨模块守护（`architecture.test.ts`） |
| `scripts/` | 开发与门禁脚本，用法见 [`development.md`](development.md) |
| `docs/scaffold/` | 本目录：给 agent 的按需章节，由 [`AGENTS.md`](../../AGENTS.md) 按任务分发 |
| `.codegraph/` | 本机 CodeGraph 索引（生成器在装了 CLI 时执行 `codegraph init --yes` 建立）：已在 `.gitignore` 里忽略整个目录，不入库；重建用 `codegraph index`，增量用 `codegraph sync` |

## 分层与依赖规则

`tests/architecture.test.ts` 用正则抽取 import 说明符来守护分层的方向（不依赖 TypeScript 的编译器 API —— 项目用的是 TS 7，那套 JS API 已被移除）：

| 层 | 目录 | 允许依赖 |
| --- | --- | --- |
| 工具层 | `src/utils/` | 只依赖自己与第三方包 |
| 文案层 | `src/locales/` | 只依赖自己 |
| 服务层 | `src/services/` | `utils` + 第三方包 |
| 组件层 | `src/components/` | `services`、`utils` + 第三方包 |
| 页面层 | `src/pages/` | `components`、`services`、`utils` + 第三方包 |
| 装配层 | `src/*.ts(x)`（`app.tsx`、`global.tsx`、`loading.tsx`、`requestErrorConfig.ts`） | 以上全部 + `config/` |

三条规则：

1. **方向**：上表中未列出的依赖一律禁止。典型违规是 `utils` 里 `import` 服务层、或 `components` 里 `import` 某个页面。
2. **别名**：跨层引用必须写成 `@/services/sample` 这样的别名，不要用 `../../services/sample`。同层引用用相对路径即可。这样依赖图可检索，移动目录时也不会漏改。
3. **文案**：任何层都不得直接 `import` `src/locales/`（文案经 `useIntl()` 取用）；`locales` 自身也只依赖自己。

守护本身有「空转检测」：如果某个层一个文件都没被扫到，测试会失败——避免规则写错却看起来一路绿灯。

## 新增一个页面时的清单

1. 建目录 `src/pages/<模块>/`（列表页 `list/index.tsx`、详情页 `detail/index.tsx` 是约定俗成的形状）。
2. 纯逻辑放同目录的 `<名字>Query.ts` / `<名字>Form.ts`，并写 `<名字>.test.ts`。
3. 请求函数加到 `src/services/<资源>.ts`，并补契约测试。
4. 在 `config/routes.ts` 注册路由（含 `name` 与 `icon`）。
5. 在 `src/locales/zh-CN/menu.ts` 与 `src/locales/en-US/menu.ts` 补 `menu.<name>`。
6. 补页面测试（mock `@umijs/max` 与 services），跑 `scripts/qa-gate.sh`。
