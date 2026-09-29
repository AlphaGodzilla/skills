---
name: pro-upgrade
description: >
  Use when the user wants to upgrade their Ant Design Pro project to the latest version.
  Triggers on: upgrade pro, pro upgrade, migrate pro, update pro, 升级, 迁移项目,
  "how to upgrade", "update to latest", "keep project up to date".
allowed-tools:
  - Bash(git clone *)
  - Bash(diff *)
  - Bash(npm install)
  - Bash(npm run lint*)
  - Bash(npm run build*)
  - Bash(npm run tsc*)
  - Bash(npm run verify*)
  - Bash(npx antd *)
  - Bash(rm -rf /tmp/ant-design-pro-upgrade*)
  - Read
  - Edit
  - Write
  - Glob
  - Grep
---

# Ant Design Pro Upgrade Skill

You are an Ant Design Pro upgrade assistant. Your task is to help users upgrade their Pro-based project to the latest version by comparing it against the official template and intelligently merging changes.

## 本仓库的差异（先读这一节）

本 skill 来自 [ant-design/ant-design-pro](https://github.com/ant-design/ant-design-pro) 自带技能，流程与上游一致；以下是本仓库的落地差异，涉及命令与文件清单时以本节为准：

- **验收命令**：本仓库用 `npm run verify`（格式与静态检查 + 类型 + antd 用法检查 + 测试与覆盖率 + CRAP）与 `scripts/qa-gate.sh`（同样五道门禁，失败时给定位引导）；上游的 `npm run lint` 在本仓库也存在，等价于 `biome lint + tsc --noEmit`，只覆盖前两道。
- **antd 用法检查**：`npm run antd:lint`（`npx antd lint` 有违规也返回 0，所以包了一层）。
- **框架文件清单**见下方表格，已按本仓库实际文件调整：没有 `.husky/`、`commitlint.config.*`，也没有 `src/services/ant-design-pro/` 与 `npm run openapi`。
- **自带两个 skill**：`.pi/skills/antd/` 与 `.pi/skills/pro-upgrade/`。升级时它们属于框架文件——**直接采用上游版本**，不要留下本地改写（若有本地补充，放到 `docs/scaffold/` 或 `AGENTS.md` 里，别改 skill 正文）。

## Preflight

Before starting, confirm:

1. The user has committed or stashed all changes (`git status` should be clean or they confirm it's OK to proceed).
2. If not clean, remind them to commit or stash their changes first (e.g., "Please commit or stash your changes — the upgrade process will modify multiple files.") and wait for them to confirm.

## Upgrade Flow

### Step 1 — Fetch the latest template

```bash
rm -rf /tmp/ant-design-pro-upgrade
git clone --depth=1 https://github.com/ant-design/ant-design-pro.git /tmp/ant-design-pro-upgrade
```

Read the template's `package.json` to confirm its version.

### Step 2 — Classify files

Separate the user's project files into **framework files** (Pro-owned, rarely customized) and **business files** (user-written, must be preserved).

**Framework files** — diff these against the template:

| Path | Notes |
|---|---|
| `package.json` | dependencies, scripts, devDependencies only |
| `config/config.ts` | framework config（插件与构建器配置） |
| `config/routes.ts` | structure only — preserve user-added routes |
| `config/defaultSettings.ts` | layout/theme defaults |
| `config/proxy.ts` | structure only — preserve user targets |
| `src/app.tsx` | runtime config（`getInitialState` / `layout` / `request` / `rootContainer`） |
| `src/global.tsx` | global side effects |
| `src/loading.tsx` | route-level loading component |
| `src/requestErrorConfig.ts` | request error handling（RFC 7807） |
| `src/typings.d.ts` | global type declarations |
| `src/components/` | 底座自带组件（`AntdMessageBridge` / `ErrorBoundary` / `OfflineBanner`）；用户自己加的组件属于业务文件 |
| `tsconfig.json` | TypeScript config |
| `biome.json` | formatter + linter config |
| `vitest.config.ts`、`tests/setupTests.ts`、`tests/architecture.test.ts` | 测试环境与分层守护 |
| `gate.config.json` | 门禁阈值（覆盖率 / CRAP / 变异） |
| `stryker.config.json` | 变异测试范围与报告 |
| `scripts/` | 开发与门禁脚本（含 `qa-gate.sh`、`mutation-gate.sh`、`stryker-ts-compat-*`） |
| `docs/scaffold/`、`AGENTS.md`、`CLAUDE.md`、`README.md` | 给 agent 的指令与项目说明 |
| `.pi/skills/` | 自带 skill：**直接采用上游版本** |
| `tailwind.css`、`tailwind.config.js`、`public/scripts/loading.js` | 样式入口与首屏占位 |
| `.npmrc`、`.editorconfig` | 仓库级约定 |

**Business files** — preserve these, only adjust imports/APIs if needed:

- `src/pages/**` — user pages（`sample/` 是底座样例，可整体删除）
- `src/services/**` — user service files（`sample.ts` 是样例）
- `src/utils/**` — user utilities（`format.ts` 是样例）
- `src/components/**` — 用户自己新增的组件
- `src/locales/**` — user translations（框架 key 可能需要更新，业务 key 必须保留）
- `mock/**` — user mocks
- 其它未列出的文件

### Step 3 — Diff framework files

For each framework file, read both the user's version and the template version. Identify:

- **New dependencies** or version bumps in `package.json`
- **New/changed config options** in `config/` files
- **Import path changes** (e.g., `from 'umi'` → `from '@umijs/max'`)
- **API changes** in `src/app.tsx`, `src/requestErrorConfig.ts`, etc.
- **New files** that exist in template but not in user's project（例如新增的门禁脚本或 skill）

### Step 4 — Merge intelligently

Apply changes with these rules:

**Framework files — adopt template structure, preserve user customizations:**

- `package.json`: update dependency versions to match the template. Keep any extra deps the user added. If a dependency exists in the user's project but not in the template, assume it is a user customization and preserve it.
- `config/routes.ts`: adopt the template's route structure for framework pages, but keep all user-added routes intact.
- `config/proxy.ts`: adopt structure, preserve user's proxy targets.
- `gate.config.json` / `biome.json` / `stryker.config.json`: 采用模板的**结构**；用户为通过门禁而放宽过阈值时，**不要静默沿用**，在总结里单独列出并请用户确认（阈值被放宽本身就是需要复核的事）。
- `.pi/skills/`、`scripts/`：直接采用模板版本——这些是工具，不承载业务逻辑。
- Other framework files: adopt the template version, preserving any user customizations that are clearly intentional (comments, extra exports, business logic mixed in).

**Business files — minimal changes only:**

- Update import paths if framework modules moved (e.g., `'umi'` → `'@umijs/max'`).
- Update deprecated API calls if the template shows a new pattern.
- Never rewrite business logic, restructure components, or change styling approaches unless the old approach is broken.

### Step 5 — Antd-specific migration checks

Run these commands to catch antd API changes:

```bash
npx antd env --format json
npm run antd:lint
npx antd lint ./src --format json --only deprecated   # 需要明细时用原生命令
```

If the user is upgrading across major antd versions, also run:

```bash
npx antd migrate <current_major> <target_major> --format json
```

Detect the current major version from the user's `package.json` and the target from the template's.

Address any findings by updating the flagged code. 写 antd 代码前先查 API、排查组件级问题时走 `.pi/skills/antd/SKILL.md`。

### Step 6 — Install and verify

```bash
npm install
npm run lint        # biome lint + tsc（快，先看这个）
npm run verify      # 完整门禁：格式与静态检查 + 类型 + 测试与覆盖率 + CRAP + antd 用法检查
npm run build
```

Fix any errors. Common post-upgrade issues:

- Type errors from changed APIs → check `npx antd info <Component>` for current APIs
- New lint rules from Biome config changes → run `npm run format` to auto-fix
- Missing peer dependencies → check `npm install` warnings
- 新增的门禁失败（覆盖率 / CRAP / antd 用法）→ 按 `scripts/qa-gate.sh` 的引导修被测代码，不要放宽阈值

### Step 7 — Cleanup and summarize

```bash
rm -rf /tmp/ant-design-pro-upgrade
```

Output a summary of all changes made, grouped by category:

1. **Dependencies updated** — list version changes
2. **Config changes** — what changed in config files
3. **Code patterns migrated** — import path changes, API updates
4. **New files added** — any files from the template that didn't exist before
5. **Manual review needed** — anything you're unsure about or that requires user action（含被放宽过的门禁阈值）

Remind the user to:
- 跑一遍 `scripts/qa-gate.sh` 确认五道门禁全绿
- Test their application thoroughly
- Commit the changes

## Key Principles

- **No hardcoded versions** — this skill works regardless of the version gap between the user's project and the latest template.
- **Preserve business code** — only modify what's necessary for framework compatibility.
- **Conservative merging** — when uncertain whether a change is a user customization or an outdated pattern, ask the user instead of guessing.
- **Leverage `@ant-design/cli`** — use `antd migrate`, `antd lint`, `antd info` for antd-specific checks; don't guess APIs from memory.
- **Clean up** — always remove the temporary clone directory.
