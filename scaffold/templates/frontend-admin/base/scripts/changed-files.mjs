#!/usr/bin/env node
/**
 * 列出「相对基线有改动」的文件。
 *
 * 格式门禁与变异门禁共用这一份口径，保证两处看到的是同一批文件——
 * 口径不一致会让人在「格式检查放过、变异测试却报错」之间来回猜。
 *
 * 基线依次尝试 `origin/main` → `origin/master` → `HEAD`：
 *   · 有远程主干时按「相对主干」算，因此这条命令在 CI 的 PR 里同样成立；
 *   · 只有本地提交时退回 HEAD，等价于「未提交的改动」；
 *   · 连 HEAD 都没有（刚 git init）时，未跟踪文件本身就是全部文件，于是自然退化成全量检查。
 *
 * 用法：
 *     node scripts/changed-files.mjs                      # 相对基线的改动文件
 *     node scripts/changed-files.mjs --all                # 全部纳入版本控制的文件
 *     node scripts/changed-files.mjs --base HEAD~1        # 指定基线
 *     node scripts/changed-files.mjs --filter '\.(ts|tsx)$'
 *     node scripts/changed-files.mjs --print-base         # 只打印最终采用的基线
 *
 * 输出：一行一个相对路径（已排序去重）。非 git 仓库时退化为「按目录遍历」，并往 stderr 打提示。
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined
    ? argv[index + 1]
    : fallback;
};

/** 目录遍历（非 git 仓库时的退路）时要跳过的目录。 */
const SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'reports',
  '.umi',
  '.umi-production',
  '.turbopack',
  '.stryker-tmp',
  '.codegraph',
  '.worktrees',
]);

function git(gitArgs) {
  try {
    return execFileSync('git', gitArgs, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

function linesOf(output) {
  return (output ?? '').split('\n').filter((line) => line.trim() !== '');
}

function isGitRepository() {
  return git(['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';
}

function resolveBase() {
  const explicit = option('--base', '');
  if (explicit) {
    return explicit;
  }
  for (const candidate of ['origin/main', 'origin/master']) {
    if (git(['rev-parse', '--verify', '--quiet', candidate]) !== undefined) {
      return candidate;
    }
  }
  if (git(['rev-parse', '--verify', '--quiet', 'HEAD']) !== undefined) {
    return 'HEAD';
  }
  return '';
}

/** 已提交与工作区的改动（含暂存），外加未跟踪的新文件。 */
function changedFiles(base) {
  const tracked = linesOf(
    git(['diff', '--name-only', '--diff-filter=ACMR', base]),
  );
  const untracked = linesOf(
    git(['ls-files', '--others', '--exclude-standard']),
  );
  return [...tracked, ...untracked];
}

/** 全部纳入版本控制的文件（`--all`）。 */
function allFiles() {
  return linesOf(
    git(['ls-files', '--cached', '--others', '--exclude-standard']),
  );
}

function walk(directory, collected) {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) {
      continue;
    }
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      walk(full, collected);
      continue;
    }
    collected.push(relative(ROOT, full));
  }
  return collected;
}

function collect() {
  if (!isGitRepository()) {
    process.stderr.write(
      '⚠️  当前目录不是 git 仓库，改为遍历工作目录（无法区分改动与存量），且不受 .gitignore 约束。\n',
    );
    return walk(ROOT, []);
  }
  if (hasFlag('--all')) {
    return allFiles();
  }
  const base = resolveBase();
  if (!base) {
    process.stderr.write(
      '⚠️  没有可用的基线（无 origin/main、origin/master 与 HEAD），按「全部文件」处理。\n',
    );
    return allFiles();
  }
  return changedFiles(base);
}

const filter = option('--filter', '');
const matcher = filter ? new RegExp(filter) : undefined;
const files = [...new Set(collect())].sort();

if (hasFlag('--print-base')) {
  process.stdout.write(
    isGitRepository() ? resolveBase() || '(无基线)' : '(非 git 仓库)',
  );
  process.stdout.write('\n');
  process.exit(0);
}

process.stdout.write(
  `${files.filter((file) => !matcher || matcher.test(file)).join('\n')}\n`,
);
