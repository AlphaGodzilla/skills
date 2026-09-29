# 底座：frontend-admin（前端管理后台）

`frontend-admin` 从一个已验证的前端技术底座生成可构建、可运行、带门禁的管理后台骨架。适用范围：面向运营与内部使用的后台界面（列表、详情、表单、工作台）。不适用：面向公网的营销页 / SEO 站点（需要 SSR 或静态站点生成器）、需要组件库自研的设计系统。

底座不含业务：唯一带业务形状的模块是 `src/pages/sample/`（列表页 + 详情页 + 服务层 + 纯逻辑模块 + 契约测试），落地时整体删除。底座也不含部署阶段：产物是 `dist/`，托管方式由部署方决定。

## 一、组成

`base/` 下 77 个文件，按目录分组：

| 路径 | 职责 |
| --- | --- |
| `package.json` | 依赖与 npm 脚本（`start` / `dev` / `test` / `test:coverage` / `tsc` / `format` / `verify` / `crap` / `build` / `mutation`） |
| `.npmrc` | `legacy-peer-deps=true`（React 19 与部分上游 peer 声明的现实） |
| `tsconfig.json` | TS 7（tsgo）配置：`strict`、`module: esnext`、`moduleResolution: bundler`、`@/*` 别名 |
| `biome.json` | 格式化与 lint 的唯一配置（含 Tailwind 指令与忽略清单） |
| `vitest.config.ts` | happy-dom、`tests/setupTests.ts`、覆盖率四项阈值（从 `gate.config.json` 读） |
| `gate.config.json` | **门禁阈值单一来源**：覆盖率四项、`crap.max`、变异门禁三项 |
| `stryker.config.json` | 变异测试：vitest runner、变异范围（见第八节）、报告落点 |
| `.editorconfig`、`.gitignore` | 编辑器与忽略约定（`dist`、`coverage`、`reports`、`.umi*`、`.codegraph`、`.env`） |
| `.env.example` | 本机覆盖项（`API_TARGET`）；复制为 `.env`（已 gitignore） |
| `config/config.ts` | umi 配置总入口：路由、插件、代理、构建器 |
| `config/routes.ts` | 路由与菜单的唯一来源；`name` 即 `menu.<name>` 文案 key |
| `config/proxy.ts` | 开发期 `/api/**` 代理目标（默认 `{{api_target}}`，可用 `API_TARGET` 覆盖） |
| `config/defaultSettings.ts` | ProLayout 默认外观（标题、主题、主色、布局） |
| `src/app.tsx` | 运行时装配：`getInitialState` / `layout` / `request` / `rootContainer` |
| `src/requestErrorConfig.ts` | 全局错误处理：解析 RFC 7807 错误体 → 用户可读提示 |
| `src/global.tsx`、`src/loading.tsx` | umi 约定文件：全局副作用、路由级懒加载占位 |
| `src/components/` | 跨页面组件：`AntdMessageBridge`（把 `<App>` 的 message 实例交给非组件代码）、`ErrorBoundary`（渲染期兜底 + chunk 失效重试）、`OfflineBanner`（断网横幅） |
| `src/pages/Welcome.tsx` | 落地页（指路卡片） |
| `src/pages/sample/list/` | 列表页：`index.tsx`（ProTable 装配）+ `listQuery.ts`（分页/关键字归一化，纯函数）+ `listQuery.test.ts` + `index.test.tsx` |
| `src/pages/sample/detail/` | 详情页：`index.tsx`（ProDescriptions 装配 + `useParams`）+ `index.test.tsx` |
| `src/pages/exception/404/` | 兜底页（`layout: false`） |
| `src/services/sample.ts` | 服务层样例：一个资源一个文件，只做「路径 + 方法 + 参数」 |
| `src/utils/format.ts` | 纯函数工具样例：时间格式化、截断、数量折算、关键字归一化 |
| `src/locales/{zh-CN,en-US}/` | 文案：按 `menu` / `pages` / `network` 分组 |
| `src/typings.d.ts` | 静态资源模块声明 |
| `mock/sample.ts` | 开发期假数据（仅 `npm start` 生效；返回体含 RFC 7807 形状的错误体） |
| `public/scripts/loading.js` | 首屏占位脚本（构建时进 HTML，不打包） |
| `tailwind.css`、`tailwind.config.js` | Tailwind 4 入口与内容范围 |
| `tests/setupTests.ts` | 全局测试环境补充：localStorage、`matchMedia`、`ResizeObserver` |
| `tests/architecture.test.ts` | 分层依赖守护（方向 + 跨层别名 + 空转检测） |
| `scripts/qa-gate.sh` | 提交前验收：五道门禁 + 失败定位引导 |
| `scripts/antd-lint-gate.mjs` | antd 用法检查的包装（原生命令有违规也返回 0，见第七节） |
| `scripts/mutation-gate.sh` | 可选的变异测试门禁（默认只变异变更文件） |
| `scripts/format-gate.mjs` | 格式与静态检查的 ratchet 包装 |
| `scripts/changed-files.mjs` | 「相对基线的改动文件」的统一口径（格式门禁与变异门禁共用） |
| `scripts/crap-report.mjs` | CRAP 逐函数计算与门禁 |
| `scripts/stryker-ts-compat-hooks.mjs`、`scripts/stryker-ts-compat-register.mjs` | 只给 Stryker 进程提供 TS 的 JS 编译器 API（见第八节） |
| `scripts/dev-test.sh`、`scripts/dev-run.sh`、`scripts/create-tag.sh` | 日常辅助脚本 |
| `AGENTS.md`、`CLAUDE.md`、`docs/scaffold/*.md` | 给 agent 的渐进式指令：入口只放硬约束与「文档地图」，细节分三篇按需读 |
| `README.md` | 面向人的项目说明（agent 指令里的最后一档） |
| `.pi/sandbox.json` | git worktree 场景的沙箱放行（见 `docs/scaffold/development.md`） |
| `.pi/skills/antd/`、`.pi/skills/pro-upgrade/` | 项目级 skill（pi 自动发现）：antd 的查询/用法检查/迁移，与 Pro 框架升级流程（见第七节） |

## 二、参数与占位符

| 参数 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--name` | 是 | — | 项目名（kebab-case），同时作为目录名与 npm 包名 |
| `--title` | 否 | 由项目名推导 | 站点标题（浏览器标题、布局标题、菜单标题） |
| `--api-target` | 否 | `http://localhost:8080` | 开发期 `/api/**` 的代理目标 |
| `--skip-codegraph` | 否 | — | 不执行 `codegraph init` |

`--title` 的推导规则：按 `-`/`_`/`.` 切分后逐段首字母大写，`ui` / `api` / `id` / `url` / `crm` / `erp` / `wms` / `bpm` 全大写（`admin-web` → `Admin Web`，`crm-api` → `CRM API`）。

可用占位符：`{{project_name}}`、`{{title}}`、`{{api_target}}`。模板里 `{{title}}` 出现在 `config/config.ts`、`config/defaultSettings.ts`、`package.json` 的描述与 `README.md`；`{{api_target}}` 出现在 `config/proxy.ts`。
渲染后由生成器自检：占位符残留、YAML / TOML / **JSON** 可解析、以及「块注释里提前出现的 `*/`」（模板注释里若写出形如 `src/locales/<星号>/menu.ts` 的路径片段，就会把块注释提前闭合，剩下半个路径变成代码——这类笔误只在生成后才会炸，所以放在自检里拦）。

**渲染前**还有一项占位符完整性检查：`template.py` 的 `PLACEHOLDERS` 声明「每个占位符至少出现多少次」（前端底座是 `project_name: 6`、`title: 4`、`api_target: 3`；按**出现次数**而不是文件数，因此某个文件里只被改掉一处也能查出），引擎按整棵模板树（含未选中的能力组件）统计，不达标即拒绝生成。它专门拦一类事故：把「渲染后的结果」反向同步回模板目录、占位符被真实值覆盖——那种模板渲染照样能跑，却会把上一个项目的名字与标题带进下一个项目，而且要等到别人生成时才暴露。覆盖任意一处——包括「一个文件里有 121 处 `{{package}}`、只被改掉其中 1 处」——都会被查出来（报错会给出实测次数与声明值）。

## 三、分层与依赖规则

六层，方向由 `tests/architecture.test.ts` 守护：

| 层 | 目录 | 允许依赖 |
| --- | --- | --- |
| 工具层 | `src/utils/` | 只依赖自己与第三方包 |
| 文案层 | `src/locales/` | 只依赖自己 |
| 服务层 | `src/services/` | `utils` + 第三方包 |
| 组件层 | `src/components/` | `services`、`utils` + 第三方包 |
| 页面层 | `src/pages/` | `components`、`services`、`utils` + 第三方包 |
| 装配层 | `src/*.ts(x)` | 以上全部 + `config/` |

三条规则：**方向**（未列出的依赖一律禁止）、**别名**（跨层必须用 `@/`，同层用相对路径）、**文案**（任何层都不得直接 `import` `src/locales/`）。

守护用正则抽取 import 说明符，**刻意不依赖 TypeScript 的编译器 API**：项目用的是 TS 7（tsgo），那套 JS API 已被移除（见第十一节）。代价是注释与字符串里形如 `from '...'` 的文本会被误判，因此代码里不要那样写注释。守护另含「空转检测」：某个层没有文件被扫到即失败。

## 四、质量门禁

`scripts/qa-gate.sh` 依次跑五道门禁，全部通过才算验收通过；阈值集中在 `gate.config.json`：

| 门禁 | 命令 | 守护什么 |
| --- | --- | --- |
| 格式与静态检查 | `node scripts/format-gate.mjs` | Biome 的格式化与 lint；**ratchet**：只查相对基线（`origin/main` → `origin/master` → `HEAD`）的改动文件 |
| 类型检查 | `npm run tsc` | TS 7 严格模式 |
| antd 用法检查 | `npm run antd:lint` | 检 deprecated / a11y / usage / performance（见第七节）；单次约 0.3 秒 |
| 测试与覆盖率 | `npm run test:coverage` | Vitest + v8 provider，行/分支/函数/语句四项下限（默认 80） |
| CRAP | `node scripts/crap-report.mjs` | `复杂度² × (1 − 覆盖率)³ + 复杂度` 逐函数，上限 `crap.max`（默认 30） |

`crap-report.mjs` 只用 `coverage/coverage-final.json`（istanbul 格式：`fnMap` 取函数范围、`branchMap` 估复杂度、`statementMap` / `s` 取覆盖），因此**与 TypeScript 版本无关**。代价：嵌套函数范围内的分支会被外层函数一并计入，复杂度是上界估计（偏保守）。

ratchet 的口径与 backend 底座的 Spotless `ratchetFrom HEAD` 同源，但基线放宽到「相对主干」：有 `origin/main` 时按 PR 差异算，因此同一条命令在 CI 里同样成立；连 `HEAD` 都没有（刚 `git init`）时自然退化为全量检查。`scripts/changed-files.mjs` 是这两个门禁共用的唯一口径，避免「格式放过、变异报错」这种口径不一致的怪象。

## 五、运行与配置

```bash
npm install            # 首次安装；prepare 会自动执行 max setup 生成 src/.umi
npm start              # 开发服务器（带 mock，无需后端）
npm run dev            # 开发服务器（MOCK=none，走代理打真实后端）
npm run build          # 生产构建（utoopack），产物在 dist/
scripts/dev-run.sh --no-mock      # 等价 npm run dev，且回显代理目标
```

| 配置 | 位置 | 说明 |
| --- | --- | --- |
| 代理目标 | `API_TARGET` 环境变量或项目根 `.env` | 默认 `{{api_target}}`；只影响 dev server |
| 标题 | `config/config.ts` 的 `title`、`config/defaultSettings.ts` | 与 `--title` 一致 |
| 主题 | `config/defaultSettings.ts` | ProLayout 的主题项（`navTheme` / `colorPrimary` / `layout` / `token`） |
| 路由与菜单 | `config/routes.ts` | `name` 是文案 key，`hideInMenu` 控制侧栏可见性 |
| 覆盖率 / CRAP 阈值 | `gate.config.json` | 改动前先想清楚理由 |
| 变异范围 / 阈值 | `stryker.config.json` / `gate.config.json` 的 `mutation` | 见第八节 |

开发辅助脚本（`scripts/`）：

| 脚本 | 用途 |
| --- | --- |
| `qa-gate.sh` | 提交前验收；失败时打印「哪道门禁失败、证据文件、下一步」，并重申禁止改测试与阈值的约束 |
| `mutation-gate.sh` | 可选变异门禁；`--all` / `--file` / `--base` / `--max-survivors` / `--min-score` / `--allow-no-coverage` / `--incremental` |
| `dev-test.sh` | 跑测试（支持 `--watch`、单文件、`-t` 过滤） |
| `dev-run.sh` | 启动开发服务器（`--no-mock` 打真实后端） |
| `create-tag.sh` | 交互式创建 `<type>/vX.Y.Z` tag（需要交互终端） |

## 六、代码格式（Biome）

Biome 同时承担格式化与 lint，因此**不引入 ESLint / Prettier**（两套风格会互相打架）。约定：

- 修格式用 `npm run format`（`biome check --write`）；全量检查用 `npm run format:all`；
- 提交前检查走 `scripts/format-gate.mjs` 的 ratchet（只查改动文件）；
- `biome.json` 的 `files.includes` 排除生成物（`.umi*`、`dist`、`coverage`、`reports`）与 `tailwind.css` / `package-lock.json`；
- 实测 ratchet 语义：干净树跳过（不报存量）、改动文件与未跟踪新文件都会被检查，非 git 仓库时退化为全量并给出提示。

## 七、antd 工具链与自带 skill

底座把上游 Ant Design Pro 自带的两个 skill 一并搬了进来，放在 `base/.pi/skills/`（pi 的项目级 skill 目录，生成后即被自动发现）：

| skill | 覆盖什么 | 关键动作 |
| --- | --- | --- |
| `.pi/skills/antd/` | 写/改 antd 组件、查 props / token / demo / doc、排查报错、单组件跨版本迁移、bug 上报（`antd bug` / `antd bug-cli`） | 先 `npx antd info <组件> --format json` 再写代码；改完 `npm run antd:lint` |
| `.pi/skills/pro-upgrade/` | 把整个 Pro 框架升到最新上游模板 | 拉上游模板 → 分类框架/业务文件 → 差异合并 → 验证；框架文件清单与验证命令已按本底座改写 |

两者正文与上游保持一致（便于日后与上游 `skills add` 对齐），只在开头加了「本仓库的差异」一节，写明本底座的命令名与门禁接线。生成出来的项目里，`AGENTS.md` 有两条硬约束与两行「文档地图」指向它们，`docs/scaffold/development.md` 有专节，`README.md` 有「自带 skill」一节。

CLI 是 devDependency `@ant-design/cli`（antd 元数据随包发布，v3~v6 全离线）。常用命令：

| 命令 | 用途 |
| --- | --- |
| `npx antd info <组件> --format json` | 有哪些 props（写代码前必查，别凭记忆） |
| `npx antd demo <组件> <示例> --format json` | 可直接用的示例代码 |
| `npx antd token <组件> --format json`、`npx antd semantic <组件> --format json` | 组件级设计令牌、语义化 classNames（主题与样式相关时用） |
| `npx antd usage ./src --format json` | 项目里 antd 组件的使用统计 |
| `npx antd migrate <旧> <新> --format json` | 跨大版本迁移清单 |
| `npx antd env --format json` | 环境快照（报 bug 时附上） |

### 为什么把 `antd lint` 包成了 `npm run antd:lint`

`npx antd lint` **发现违规也返回 0**（实测：注入一处 deprecated 用法后退出码仍是 0），直接当门禁用会永远通过；它默认还只打印文本、不落报告。`scripts/antd-lint-gate.mjs` 改用 `--format json` 取结构化结果、落盘 `reports/qa-gate/antd-lint.json`、按 `summary.total` 判定，并把它接成 `scripts/qa-gate.sh` 的第 3 道门禁。原生输出里语法坏掉的文件会被 skip，这类文件由类型检查与 Biome 负责报错，脚本只做提示。

规则四类：`deprecated`（如 antd 6 里 `Alert` 的 `message` 已改名 `title`）、`a11y`、`usage`、`performance`。

## 八、变异测试门禁（可选）

### 范围：只变异「有判断的代码」

变异测试对**呈现层**没有性价比：列定义里的 `width: 180`、style 对象里的 `position: fixed`、`hoverable` 这类值被改掉，行为上观察不到差别，想杀掉它们只能「断言样式对象」——那是我明确不建议的脆测试。底座实测印证了这一点：全范围扫描时 415 个变异体里有 135 个存活，其中 87 个来自页面装配（`pages/**/index.tsx`，39 + 33）、`Welcome.tsx`（15）与 `OfflineBanner` 的 style 对象（11）。

所以 `stryker.config.json` 的范围收敛为「逻辑密集」的文件，排除项都写明了理由：

| 排除 | 理由 |
| --- | --- |
| `!src/**/*.test.{ts,tsx}`、`!src/**/*.d.ts`、`!src/typings.d.ts` | 测试与类型声明不是被测对象 |
| `!src/.umi/**`、`!src/.umi-production/**` | umi 生成代码 |
| `!src/app.tsx`、`!src/global.tsx`、`!src/loading.tsx` | 运行时装配与占位，没有判断 |
| `!src/locales/**` | 纯文案数据 |
| `!src/pages/**/index.tsx`、`!src/pages/Welcome.tsx` | 页面装配（列定义 + `request`）与落地页，行为由组件测试与人工确认覆盖 |
| `!src/components/**` | 跨页面组件的样式与状态初值（`AntdMessageBridge` / `ErrorBoundary` / `OfflineBanner`） |

收敛后的范围是：`src/utils/**`、`src/services/**`、`src/requestErrorConfig.ts`、页面的 `*Query.ts` / `*Form.ts` —— 也就是「新加判断逻辑时最该被变异测试盯住的地方」。

### 判据与用法

```bash
scripts/mutation-gate.sh                          # 只变异相对基线变更的源码文件（默认）
scripts/mutation-gate.sh --all                    # 范围内全量（本次实测 152 个变异体、23 秒）
scripts/mutation-gate.sh --file src/utils/format.ts
scripts/mutation-gate.sh --max-survivors 3 --min-score 80
scripts/mutation-gate.sh --incremental            # 复用上次结果（快，但结论可能过时）
```

范围写法：`--file` 接受文件或目录（目录自动展开为 `**/*.ts` / `**/*.tsx` 并带上测试与声明的排除条目——`--mutate` 会整体替换配置里的 mutate 清单，所以排除项必须自己带上）；路径带不带 `./` 都行。**范围内一个变异体都没产生即判失败**（路径写错，或文件被 mutate 排除），否则「什么都没测到」会显示成 100% 通过。

判据：存活变异体数 ≤ `mutation.survivorsMax`（默认 0）、得分 ≥ `mutation.scoreMin`（默认 0）、零覆盖变异体为 0。报告：`reports/mutation/index.html`、`reports/mutation/mutation.json`。门禁在启动 Stryker **之前先删掉旧报告**——否则 Stryker 因配置写错而启动失败时，会读到上一次的报告，把「上次通过」当成「这次通过」。

### TypeScript 7 × StrykerJS：不降级 TS 的兼容方案

StrykerJS 的 sandbox 预处理要调用 `ts.parseConfigFileTextToJson`，而 TS 7（tsgo）**移除了整个 JavaScript 编译器 API**（`main` 只是 `./lib/version.cjs`），因此直接跑会崩在 `ts.parseConfigFileTextToJson is not a function`。

实测排除过的方案：

- 「关掉 checker / `disableTypeChecks` / 用 `buildCommand` 交给外部 `tsc`」——**不可行**：崩点在 sandbox 预处理阶段，与 checker、`disableTypeChecks`、`buildCommand` 是三条独立路径，三者全开也照崩（`--all` 与单文件都复现过）。
- 「把 `typescript` 整体降到 5.x / 6.x」——可行但要牺牲项目自身的编译器版本，不划算。

采用的方案是**双轨**：项目继续用 TS 7，只给 Stryker 进程换一个带 JS API 的内核。

| 组成 | 作用 |
| --- | --- |
| `devDependencies.typescript-classic` = `npm:@typescript/typescript6@^6.0.2` | 微软发布的过渡兼容包（`main: ./lib/typescript.js`，内含完整 JS API，另带 `tsc6` bin） |
| `scripts/stryker-ts-compat-hooks.mjs` | Node 模块解析钩子：把 `typescript` 改指到 `typescript-classic` |
| `scripts/stryker-ts-compat-register.mjs` | 用 `register()` 注册钩子，由 `node --import` 引入（`mutation-gate.sh` 与 `npm run mutation` 都用它启动 Stryker） |

钩子只在变异测试进程内生效：项目自身、`npm run tsc`、vitest 仍然用 TS 7。实测验证：项目内 `require('typescript/package.json').version` 是 `7.0.2`，而 Stryker 进程里解析到的是 `6.0.3`（带 `parseConfigFileTextToJson` / `createSourceFile`）。

版本选择：`@stryker-mutator/core@10.0.0` + `@stryker-mutator/vitest-runner@10.0.0`（peer `vitest >= 2`，与项目的 vitest 4 兼容）。10.x 依赖 Babel 8 系包，冷缓存安装正常；若遇到 `No matching version found for @babel/...`，那是本地 npm packument 缓存陈旧，用 `npm install --prefer-online` 即可。9.6.1 亦实测可用，作为退路。

### 增量：默认关掉

Stryker 开源版的 `incremental` 是**跨次累加**的：上一次范围外的结果会被合并进本次报告，而且实测出现过「同一个文件、测试已经补过，复用的旧结果仍报存活」——门禁的结论必须可复现，所以默认清掉缓存跑本次范围（`--incremental` 仅供本地快速迭代）。JSON 报告另有一道保险：解析时按本次范围过滤，范围外的历史结果不计入判据。

## 九、新增页面 / 模块

1. 建目录 `src/pages/<模块>/`（列表 `list/index.tsx`、详情 `detail/index.tsx`）。
2. 纯逻辑放同目录的 `<名字>Query.ts` / `<名字>Form.ts`，配 `<名字>.test.ts`。
3. 请求函数加到 `src/services/<资源>.ts`，配契约测试。
4. 在 `config/routes.ts` 注册路由（`name` + `icon`）。
5. 在 `src/locales/{zh-CN,en-US}/menu.ts` 补 `menu.<name>`。
6. 补页面测试（mock `@umijs/max` 与 services），跑 `scripts/qa-gate.sh`。

删掉样例模块时：删 `src/pages/sample/`、`src/services/sample.{ts,test.ts}`、`mock/sample.ts`，并从 `config/routes.ts` 与两处 `menu.ts` 里移除 `sample-list` / `sample-detail`。`src/utils/format.ts` 与 `src/components/` 是框架级代码，建议保留。

## 十、扩展底座

| 想加什么 | 怎么做 |
| --- | --- |
| 登录与权限 | 在 `src/app.tsx` 的 `getInitialState` 拉当前用户，加 `src/access.ts`，在路由上写 `access` 字段 |
| 复杂服务端状态 | 引入 `@tanstack/react-query`（umi 有对应插件），把多页面共享、需要失效/重试的数据迁过去；此前先用 ProTable / ProDescriptions 的 `request` |
| 端到端测试 | 独立接 Playwright，单独一条门禁（慢且需要可用后端），不要混进 `qa-gate.sh` |
| 组件库 / 设计令牌 | 用 `antd-style` 的 `createStyles` 取 token；全局主题改 `config/defaultSettings.ts` 与 `createGlobalStyle` |
| 包管理器换成 pnpm | 把 `package-lock.json` 换掉、`scripts/*` 里的 `npm` 换成 `pnpm`，并同步文档与 `.npmrc`；底座默认 npm（与上游一致） |

底座自身的扩展点（`scaffold` skill 内部）：新增底座只需在 `templates/<名字>/` 下提供 `base/` 与 `template.py`（声明 `DESCRIPTION` / `PARAMS` / `OPTIONS` / `variables` / `overlays` / `summary` / `post_generate` / `next_steps`），通用渲染引擎会自动挂上参数、做产物自检并渲染。

## 十一、选型与代价

| 选择 | 代价 / 理由 |
| --- | --- |
| Ant Design Pro v6（Umi Max 4 + antd 6 + ProComponents 3） | 后台界面一次到位（布局、列表、详情、表单、国际化）；代价是版本较新（在 utoopack 上构建），上游小版本变化需要留意 |
| TypeScript 7（tsgo） | 编译快，但**移除了 JS 编译器 API**：架构守护与 CRAP 因此都改成不依赖 AST 的实现，Stryker 需要一个兼容内核 |
| Biome 单工具 | 配置与速度都好，一套规则同时管格式化与 lint；代价是插件生态不如 ESLint（需要 ESLint 专属规则时再单独引入） |
| Tailwind 4 + antd-style 并存 | 布局用 Tailwind、主题相关用 token；代价是两套样式入口，约定是「布局用 Tailwind，与主题相关的用 createStyles」 |
| 覆盖率 + CRAP 双门禁 | CRAP 能抓「跑到了但没断言」，比单看覆盖率更接近风险；代价是复杂函数更难凑过门禁（这是好事） |
| 变异测试只覆盖逻辑密集文件 | 呈现层不纳入，避免逼出断言样式的脆测试；代价是呈现层依赖组件测试与人工确认 |
| 不接 E2E | 骨架阶段保持门禁快（几秒级）；代价是跨页面流程没有自动验证 |

## 十二、已验证范围

验证环境：macOS（arm64）、Node 22.19、npm 11.19、Java 无关；每次生成后都在新目录实跑。

生成与安装：

- 生成：`uv run scripts/scaffold.py --template frontend-admin --name admin-web --title "订单管理后台" --api-target http://localhost:9090`，产出 77 个文件；占位符全部替换，JSON / TOML / YAML / 块注释自检通过。
- 自带 skill：两个 skill 随生成物写入 `.pi/skills/`（pi 的项目级 skill 目录，见 pi 文档 `docs/configuration.md`）；skill 里出现的命令与 `package.json` 脚本逐条对齐（`npm run antd:lint` / `npm run verify` / `scripts/qa-gate.sh`）。
- `codegraph init`：53 个文件 / 358 节点 / 711 边（TS 项目可索引）；未安装 CLI 时静默跳过。
- `npm install`：冷缓存约 80 秒，命中缓存约 10~20 秒；`prepare` 的 `max setup` 正常生成 `src/.umi`。

测试、构建与门禁：

- `npm run lint`（`biome lint + tsc`）：58 个文件、约 0.1 秒通过。
- `npm test`：14 个测试文件 / 89 个用例全部通过，约 3 秒（不需要后端）。
- `npm run test:coverage`：语句 97.5% / 分支 98.9% / 函数 94.7% / 行 97.4%（阈值 80）。
- `npm run build`：5.4 秒，产出 `dist/index.html`、`dist/samples/index.html`、`dist/samples/:id/index.html`、`dist/404.html`。
- `scripts/qa-gate.sh`：五道门禁全绿（格式与静态检查、类型检查、antd 用法检查、测试与覆盖率、CRAP）；CRAP 统计 57 个函数，最高 10.0，上限 30。

门禁的拦截能力（都用反例实测）：

- **CRAP**：注入一个圈复杂度 9、零覆盖的函数后报 `1 个函数超过 crapMax=30`（该函数 CRAP 90.0），退出码 1。
- **格式 ratchet**：干净树跳过；改动一个文件 + 新增一个未跟踪文件时，`changed-files.mjs` 精确列出这两个文件，`format-gate.mjs` 报出两处违规。
- **antd 用法检查**：`npx antd lint ./src` 干净时 0.3 秒；注入一处 deprecated 用法（antd 6 里 `<Alert message="..." />`，已改名 `title`）后，**原生命令退出码仍是 0**，而 `npm run antd:lint` 报出 `file:line [deprecated] Alert \`message\` is deprecated...` 并退出 1——这正是把它包一层的原因。
- **占位符完整性守卫**：正例是 6 个后端组合 + 前端全部生成成功；反例三处都实测拦下——抹掉前端 3 处 `{{title}}` 中的 1 处、抹掉后端**未选中组件**里的 `{{db_name}}`、以及把渲染结果同步回模板（真实踩到过：反向 rsync 让 7 个文件里的占位符全被覆盖成上一个项目的名字，当时没有守卫，是靠人工比对才发现）。
- **变异测试**：范围内全量 152 个变异体、killed 152、得分 100%、23 秒；单文件（`src/utils/format.ts`）52 个变异体、100%、约 14 秒；`npm run mutation` 直接跑 Stryker 亦通（52 个、10 秒）。
- **变异门禁的假通过/假失败都反例实测过**：`--file ./src/utils/format.ts`（`./` 前缀）、`--file src/utils`（目录）都要能正常比中 52 个；`--file src/locales/zh-CN.ts`（落在 mutate 排除项里）与 `--file src/nope.ts`（路径不存在）必须**明确失败**并指出原因，不能报「0 个变异体 / 100% 通过」。
- **陈旧报告防护**：把 `stryker.config.json` 改坏后跑门禁，脚本报「未产出报告」并贴出日志尾部，而不是读到上一次的报告误判通过。

变异测试真的抓到了样例代码里的缺口，并按「补断言或简化代码」修掉：

| 抓到的缺口 | 修法 |
| --- | --- |
| `format.ts` 的 `truncate` 里 `max <= 1` 分支与主分支行为等价 | 删掉冗余分支，用 `Math.max(0, max - 1)` 统一表达 |
| `EMPTY_PLACEHOLDER` 的值被改掉仍全绿（测试断的是常量不是字面量） | 补一条断言字面量的用例 |
| `isChunkLoadError` 只按消息匹配的分支被绕过 | 补「按 `error.name === 'ChunkLoadError'` 识别」的用例 |
| `ErrorBoundary` 的 online / offline 事件处理未被覆盖 | 补 rerender + 事件驱动的用例 |
| `toPageNumber` / `toPageSize` 里 `current === undefined ||` 与 `!Number.isFinite` 重叠，产生等价变异 | 合并为一个判据 |
| `requestErrorConfig` 的离线文案 key、`console.warn` 首参、`error` 为空时的可选链未被断言 | 断言 i18n key、断言 warn 入参、补 `error` 为 `null` / `undefined` 的用例 |
| 客户端组件里的 `typeof navigator !== 'undefined'` SSR 兜底是死分支（两处） | 删掉死分支（无 SSR） |

模板自检的新增项也用反例确认过：把 `src/locales/*/menu.ts` 这样的文本写进块注释会让生成的 `config/routes.ts` 提前闭合注释，引擎的自检项「块注释里提前出现的 `*/`」会把这类笔误拦在生成阶段（真实踩到过一次，故补上）。
