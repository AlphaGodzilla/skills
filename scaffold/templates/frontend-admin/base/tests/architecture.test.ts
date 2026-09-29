import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 分层依赖守护（对应后端底座的 ArchUnit 架构测试）。
 *
 * 为什么不用依赖分析库：这里要守的是**几条稳定的方向性规则**，用正则抽取 import 说明符
 * 足够，而且不依赖 TypeScript 的 JS 编译器 API —— 项目用的是 TS 7（tsgo），那套 API 已被移除。
 * 代价：注释与字符串里形如 `from '...'` 的文本会被误判，因此代码里不要那样写注释。
 */

const SRC = resolve(__dirname, '..', 'src');

type Layer =
  | 'utils'
  | 'locales'
  | 'services'
  | 'components'
  | 'pages'
  | 'runtime';
type LayerOrOutside = Layer | 'outside';

/** 每层**禁止**依赖的层。没列出的层即可依赖（如 pages 可依赖 components/services/utils）。 */
const FORBIDDEN: Record<Layer, Layer[]> = {
  utils: ['locales', 'services', 'components', 'pages', 'runtime'],
  locales: ['services', 'components', 'pages', 'runtime'],
  services: ['locales', 'components', 'pages', 'runtime'],
  components: ['locales', 'pages', 'runtime'],
  pages: ['locales'],
  runtime: [],
};

const IMPORT_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /^\s*import\s*['"]([^'"]+)['"]/gm,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

interface Violation {
  kind: 'direction' | 'alias' | 'outside';
  file: string;
  specifier: string;
  resolved: string;
  reason: string;
}

function listSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry.startsWith('.umi') || entry === '__mocks__') {
        continue;
      }
      found.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) {
      continue;
    }
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry) || entry.endsWith('.d.ts')) {
      continue;
    }
    found.push(full);
  }
  return found;
}

function layerOf(absolutePath: string): LayerOrOutside {
  const rel = relative(SRC, absolutePath);
  if (rel.startsWith('..')) {
    return 'outside';
  }
  const first = rel.split(sep)[0];
  if (first === 'utils' || first === 'locales' || first === 'services') {
    return first;
  }
  if (first === 'components' || first === 'pages') {
    return first;
  }
  return 'runtime';
}

function importsOf(code: string): string[] {
  const found = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      found.add(match[1]);
    }
  }
  return [...found];
}

/** 解析说明符到项目内路径；`undefined` 表示第三方包（不参与分层检查）。 */
function resolveSpecifier(
  specifier: string,
  fromFile: string,
): string | undefined {
  if (specifier.startsWith('@/')) {
    return join(SRC, specifier.slice(2));
  }
  if (specifier.startsWith('@root/')) {
    return join(SRC, '..', specifier.slice('@root/'.length));
  }
  if (specifier.startsWith('.')) {
    return resolve(dirname(fromFile), specifier);
  }
  return undefined;
}

function collectViolations(files: string[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const importerLayer = layerOf(file);
    if (importerLayer === 'outside') {
      continue; // 文件都取自 src 之内，这里只为类型收窄
    }
    const code = readFileSync(file, 'utf8');
    for (const specifier of importsOf(code)) {
      const resolved = resolveSpecifier(specifier, file);
      if (resolved === undefined) {
        continue;
      }
      const importedLayer = layerOf(resolved);
      const label = relative(SRC, file);

      if (importedLayer === 'outside') {
        if (importerLayer !== 'runtime') {
          violations.push({
            kind: 'outside',
            file: label,
            specifier,
            resolved,
            reason:
              '只有 runtime 层（app.tsx 等装配文件）可以引用 src 之外的模块',
          });
        }
        continue;
      }

      if (
        importerLayer !== 'runtime' &&
        FORBIDDEN[importerLayer].includes(importedLayer)
      ) {
        violations.push({
          kind: 'direction',
          file: label,
          specifier,
          resolved,
          reason: `${importerLayer} 层不允许依赖 ${importedLayer} 层`,
        });
      }

      if (importerLayer !== importedLayer && !specifier.startsWith('@/')) {
        violations.push({
          kind: 'alias',
          file: label,
          specifier,
          resolved,
          reason: `跨层引用必须用 @/ 别名（${importerLayer} → ${importedLayer}）`,
        });
      }
    }
  }
  return violations;
}

const files = listSourceFiles(SRC);
const violations = collectViolations(files);

const render = (violation: Violation) =>
  `${violation.file} → ${violation.specifier}（${violation.reason}）`;

describe('分层依赖守护', () => {
  it('分层方向正确：utils / locales 不依赖上层，services 不依赖视图层，components 不依赖页面', () => {
    expect(
      violations.filter((item) => item.kind === 'direction').map(render),
    ).toEqual([]);
  });

  it('跨层引用走 @/ 别名而不是相对路径（依赖图可检索，移动目录不会漏改）', () => {
    expect(
      violations.filter((item) => item.kind === 'alias').map(render),
    ).toEqual([]);
  });

  it('只有 runtime 层可以引用 src 之外的模块（config/ 等）', () => {
    expect(
      violations.filter((item) => item.kind === 'outside').map(render),
    ).toEqual([]);
  });

  it('守护本身没有空转：各层都有被检查的文件', () => {
    expect(files.length).toBeGreaterThan(10);
    for (const layer of [
      'pages',
      'components',
      'services',
      'utils',
      'locales',
    ] as const) {
      const count = files.filter((file) => layerOf(file) === layer).length;
      expect(count, `${layer} 层没有被检查到任何文件`).toBeGreaterThan(0);
    }
  });
});
