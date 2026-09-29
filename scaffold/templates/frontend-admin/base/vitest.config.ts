import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// 门禁阈值集中在 gate.config.json，与 scripts/crap-report.mjs、scripts/mutation-gate.sh 共用一份
const gate = JSON.parse(
  readFileSync(join(__dirname, 'gate.config.json'), 'utf8'),
);

export default defineConfig({
  resolve: {
    alias: {
      '@': join(__dirname, 'src'),
      '@root': join(__dirname),
      '@@': join(__dirname, 'src', '.umi'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setupTests.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.umi',
      'src/.umi',
      'src/.umi-production',
      '.stryker-tmp',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/.umi/**',
        'src/.umi-production/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        'src/typings.d.ts',
      ],
      thresholds: {
        lines: gate.coverage.lines,
        branches: gate.coverage.branches,
        functions: gate.coverage.functions,
        statements: gate.coverage.statements,
      },
    },
    testTimeout: 15000,
  },
});
