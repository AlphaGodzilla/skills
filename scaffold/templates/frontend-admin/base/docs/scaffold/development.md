# 命令、测试分层与门禁

本文件是 [`AGENTS.md`](../../AGENTS.md) 的按需章节：只在要跑命令、判断该跑哪一层测试，或要跑门禁时读。

## 常用命令

```bash
npm install           # 首次安装（prepare 会自动执行 max setup，生成 src/.umi 类型与入口）
npm start             # 开发服务器，带 mock：无需后端即可点通页面
npm run dev           # 开发服务器，关掉 mock：/api/** 走 config/proxy.ts 代理到真实后端
npm test              # 单元 / 组件 / 服务契约测试（不需要后端，不判覆盖率）
npm run test:coverage # 同上 + 覆盖率门禁
npm run tsc           # 类型检查（tsc --noEmit，TS 7 / tsgo）
npm run lint          # biome lint + tsc（提交前的快速自查）
npm run antd:lint     # antd 用法检查（deprecated / a11y / usage / performance）
npm run format        # 格式化并自动修复改动文件（biome check --write）
npm run verify        # 完整验收：格式与静态检查 + 类型 + 测试与覆盖率 + CRAP
npm run build         # 生产构建（产物在 dist/）
npm run preview       # 本地预览构建产物（:8000）
scripts/qa-gate.sh    # 提交前验收（等价 npm run verify；失败时打印哪道门禁失败、证据与下一步）
scripts/mutation-gate.sh   # 变异测试门禁（可选，慢；默认只变异相对基线的变更文件）
```

`npm run verify` 与 `scripts/qa-gate.sh` 覆盖同样的五道门禁，差别只在输出：前者失败即停，后者跑完所有门禁再告诉你「哪一道失败、证据在哪、下一步查什么」。

## 测试分层

| 层 | 位置 | 该测什么 | 不该测什么 |
| --- | --- | --- | --- |
| 单元测试 | `src/**/*.test.ts` | 纯函数与纯逻辑模块（`utils/`、页面的 `*Query.ts` / `*Form.ts`）：边界值、空值、非法值、单位换算 | 组件渲染 |
| 组件测试 | `src/components/**/*.test.tsx`、`src/pages/**/*.test.tsx` | 渲染与交互：什么条件下出现什么文案 / 按钮 / 提示，分支是否走对 | 具体样式、antd 内部实现 |
| 服务契约测试 | `src/services/*.test.ts` | **请求长什么样**：路径、方法、参数位置（`params` 还是 `data`）、响应是否原样返回 | 后端返回什么 |
| 跨模块守护 | `tests/architecture.test.ts` | 分层依赖方向与别名规则 | 业务逻辑 |
| 手工验证 | `scripts/dev-run.sh --no-mock` | 与真实后端联调、肉眼确认交互 | 一切可以自动化的断言 |

三条实践约定：

1. **页面只做装配，逻辑抽出来测**。页面的 `index.tsx` 负责拼列定义与传 `request`；分页归一化、表单转换、字段映射这类判断放在同目录的纯逻辑模块里，用单元测试覆盖边界。
2. **服务层测试断言请求形状**。这一层最容易写错的是路径、方法、参数位置，而页面测试看不出这类错误（页面只看返回值）。
3. **测试不依赖真实后端**：页面与组件测试 mock `@umijs/max`（`Link` / `useIntl` / `useParams` / `history`）与 `@/services/*`。断言 i18n 时优先断言 **key**（mock 里记录 `id`），因为同一条文案在 mock 下都取 `defaultMessage`。

## 五道门禁

`scripts/qa-gate.sh` 依次跑，全部通过才算验收通过：

| 门禁 | 命令 | 阈值来源 | 说明 |
| --- | --- | --- | --- |
| 格式与静态检查 | `node scripts/format-gate.mjs` | `biome.json` | **ratchet**：只检查相对基线（`origin/main` → `origin/master` → `HEAD`）有改动的文件，存量文件不会立刻报错，但新改动必须合规 |
| 类型检查 | `npm run tsc` | `tsconfig.json`（strict） | TS 7（tsgo）；类型错误一律不能放过 |
| antd 用法检查 | `npm run antd:lint` | `@ant-design/cli` 的内置规则 | 检 deprecated / a11y / usage / performance；原生命令有违规也返回 0，所以由 `scripts/antd-lint-gate.mjs` 包成非 0 退出 |
| 测试与覆盖率 | `npm run test:coverage` | `gate.config.json` 的 `coverage` | v8 provider；行/分支/函数/语句四项都设了下限，任一不达标即失败 |
| CRAP | `node scripts/crap-report.mjs` | `gate.config.json` 的 `crap.max` | `复杂度² × (1 − 覆盖率)³ + 复杂度`；补的是「跑到了但没断言」的风险。数据只用 `coverage/coverage-final.json`，不依赖 TS 的编译器 API |

阈值集中在 [`gate.config.json`](../../gate.config.json)，覆盖率与 CRAP 共用一份，避免两处不一致。日志与证据落点：`reports/qa-gate/<门禁>.log`、`coverage/index.html`、`reports/crap/crap.txt`。

## antd 用法检查与自带 skill

本仓库自带两个**项目级 skill**（pi 从 `.pi/skills/` 自动发现）。antd 相关的事都走它们，不要凭记忆写 API：

| skill | 什么时候用 | 关键动作 |
| --- | --- | --- |
| [`.pi/skills/antd/SKILL.md`](../../.pi/skills/antd/SKILL.md) | 写/改 antd 组件、查 props/token/demo、排查 antd 报错、单个组件跨版本迁移 | `npx antd info <组件> --format json` → 再写代码；改完 `npm run antd:lint` |
| [`.pi/skills/pro-upgrade/SKILL.md`](../../.pi/skills/pro-upgrade/SKILL.md) | 升级 antd 版本，或把整个 Pro 框架升到最新上游模板 | 按其「拉上游模板 → 分类框架/业务文件 → 差异合并 → 验证」流程走 |

`npx antd ...` 用的是 devDependency 里的 `@ant-design/cli`，**离线可用**（antd 元数据随包发布，覆盖 v3~v6）。常用查询：

```bash
npx antd info Button --format json      # 有哪些 props（写代码前先查）
npx antd demo Button basic --format json # 可直接用的示例
npx antd token Button --format json      # 组件级设计令牌（主题相关样式用）
npx antd migrate 6 7 --format json       # 跨大版本迁移清单
npx antd env --format json               # 环境快照（报 bug 时附上）
```

一个必须知道的坑：`npx antd lint` **发现违规也返回 0**（实测），所以别把它直接当门禁。仓库把它包成了 `npm run antd:lint`：解析 JSON 报告、有违规即非 0 退出，报告落在 `reports/qa-gate/antd-lint.json`。

## 变异测试（可选门禁）

变异测试回答的是「测试有没有真正断言到行为」，补的是覆盖率看不到的那一半：一段代码即使被跑过，只要又复杂又没断言，风险依然高。

**它默认不参与验收**（慢），只在显式调用时执行：

```bash
scripts/mutation-gate.sh                      # 只变异「相对基线变更的源码文件」（推荐日常用）
scripts/mutation-gate.sh --all                # 全量（夜间或大改时；几分钟级）
scripts/mutation-gate.sh --file src/utils/format.ts   # 单个文件
scripts/mutation-gate.sh --max-survivors 3 --min-score 80   # 覆盖阈值
scripts/mutation-gate.sh --incremental        # 复用上次结果（快，但结论可能过时，只用于本地迭代）
```

判据（只针对本次范围内的文件）：存活变异体数 ≤ `mutation.survivorsMax`（默认 0）、变异得分 ≥ `mutation.scoreMin`（默认 0）、零覆盖变异体数为 0（`mutation.failOnNoCoverage=true`）。报告：`reports/mutation/index.html`（人读）、`reports/mutation/mutation.json`（agent 解析）。

### 为什么需要 `scripts/stryker-ts-compat-*`

项目用的是 `typescript` 7（tsgo），这一版**移除了 JavaScript 编译器 API**（`ts.parseConfigFileTextToJson` 等），而 StrykerJS 的 sandbox 预处理要调用它，直接跑会崩在 `ts.parseConfigFileTextToJson is not a function`。

解法不是降级 TypeScript，而是**只给 Stryker 进程喂一个带 JS API 的内核**：

- `devDependencies.typescript-classic` = `npm:@typescript/typescript6@^6.0.2`（微软的过渡兼容包，提供完整 JS API）；
- `scripts/stryker-ts-compat-hooks.mjs` 用 Node 的模块解析钩子把 `typescript` 改指到它；
- `scripts/stryker-ts-compat-register.mjs` 用 `node --import` 注册该钩子，只作用于变异测试进程。

项目自身、`npm run tsc` 与 vitest 仍然用 TS 7。注意：`--withHistory` 式的增量历史是 Stryker 商业版（Arcmutate）能力，开源版只有 `incremental`，而实测它可能给出过时结果（同一个文件、测试已补过，复用的旧结果仍报存活），所以门禁默认清掉缓存跑本次范围，`--incremental` 仅供本地快速迭代。

### 读到结果后怎么修

- **存活（Survived）**：测试执行到了，但没断言住这个行为 → 给对应函数补断言。
- **边界类存活**（如 `<=` 被改成 `<`）：补边界值用例（边界、边界±1）。
- **零覆盖（NoCoverage）**：这段代码没被测到 → 补用例；确实是框架装配或生成代码时，在 `stryker.config.json` 的 `mutate` 里排除它，而不是降低阈值。
- **等价变异**：某些变异体在行为上与原代码等价（例如「无 SSR 的客户端组件里的 `typeof navigator` 兜底分支」）——**正确的修法是简化代码**（把死分支删掉），而不是放宽门禁。本底座的 `ErrorBoundary` 与 `format.ts` 就是按这个原则改过的。

## 在 git worktree 里跑命令

在 worktree 里 `git status` 报 `not a git repository` / 沙箱拒绝写 `.git` 时，是沙箱只放行了会话目录导致的。`.pi/sandbox.json` 已把主仓库的 `.git` 放行（写成相对路径 `../order-admin/.git`）：**主仓库目录名要与项目名一致、worktree 建在兄弟目录**（`git worktree add ../order-admin-<分支>`）。把 worktree 放进 `<仓库>/.worktree/<名字>` 时该条目不匹配，需要另加 `../../.git`。这个文件必须随首次提交入库——未跟踪文件不会被 `git worktree add` 带过去。
