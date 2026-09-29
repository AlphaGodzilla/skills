import { describe, expect, it } from 'vitest';

import {
  EMPTY_PLACEHOLDER,
  formatCount,
  formatDateTime,
  normalizeKeyword,
  truncate,
} from './format';

describe('formatDateTime', () => {
  it('空值占位符是用户可见文案，锁住字面量本身', () => {
    // 断常量而不是断字面量，会把「常量值被改错」这类缺陷漏掉
    expect(EMPTY_PLACEHOLDER).toBe('—');
  });

  it('ISO 串转成本地「年-月-日 时:分」', () => {
    expect(formatDateTime('2026-01-02T08:30:00.000Z')).toMatch(
      /^2026-01-02 \d{2}:\d{2}$/,
    );
  });

  it('空值与缺省值给占位符', () => {
    expect(formatDateTime()).toBe(EMPTY_PLACEHOLDER);
    expect(formatDateTime(null)).toBe(EMPTY_PLACEHOLDER);
    expect(formatDateTime('')).toBe(EMPTY_PLACEHOLDER);
  });

  it('非法时间串给占位符，不抛错也不显示 Invalid Date', () => {
    expect(formatDateTime('不是时间')).toBe(EMPTY_PLACEHOLDER);
  });

  it('占位符可覆盖', () => {
    expect(formatDateTime(undefined, '未填写')).toBe('未填写');
  });
});

describe('truncate', () => {
  it('不超过上限时原样返回', () => {
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('超过上限时截断并补省略号，总长度等于上限', () => {
    const result = truncate('abcdefgh', 5);
    expect(result).toBe('abcd…');
    expect(result.length).toBe(5);
  });

  it('上限为 1 时只留省略号', () => {
    expect(truncate('abcdefgh', 1)).toBe('…');
  });

  it('上限为 0 或负数时不返回原串（退化为省略号）', () => {
    expect(truncate('abc', 0)).toBe('…');
    expect(truncate('abc', -3)).toBe('…');
  });

  it('中文按 1 个字符算', () => {
    expect(truncate('订单履约流程', 3)).toBe('订单…');
  });
});

describe('formatCount', () => {
  it('一万以下原样输出', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(9999)).toBe('9999');
  });

  it('一万起折成「万」，边界值本身走新档位', () => {
    expect(formatCount(10000)).toBe('1.0万');
    expect(formatCount(12345)).toBe('1.2万');
  });

  it('一亿起折成「亿」', () => {
    expect(formatCount(100000000)).toBe('1.0亿');
    expect(formatCount(99999999)).toBe('10000.0万');
  });

  it('负数与非有限值给占位符', () => {
    expect(formatCount(-1)).toBe(EMPTY_PLACEHOLDER);
    expect(formatCount(Number.NaN)).toBe(EMPTY_PLACEHOLDER);
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe(EMPTY_PLACEHOLDER);
  });
});

describe('normalizeKeyword', () => {
  it('去掉首尾空白', () => {
    expect(normalizeKeyword('  订单  ')).toBe('订单');
  });

  it('非字符串与全空白视为没填', () => {
    expect(normalizeKeyword(undefined)).toBeUndefined();
    expect(normalizeKeyword(null)).toBeUndefined();
    expect(normalizeKeyword(42)).toBeUndefined();
    expect(normalizeKeyword('   ')).toBeUndefined();
    expect(normalizeKeyword('')).toBeUndefined();
  });

  it('超长时截到上限', () => {
    expect(normalizeKeyword('a'.repeat(80))).toHaveLength(50);
    expect(normalizeKeyword('a'.repeat(80), 3)).toBe('aaa');
  });

  it('截断在去空白之后（不会因为截断把空白留在末尾）', () => {
    expect(normalizeKeyword('  ab  ', 2)).toBe('ab');
  });
});
