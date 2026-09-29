import { describe, expect, it } from 'vitest';

import type { SamplePage } from '@/services/sample';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  toListParams,
  toPageNumber,
  toPageSize,
  toTableResult,
} from './listQuery';

describe('toPageNumber', () => {
  it('缺省算第 1 页', () => {
    expect(toPageNumber()).toBe(1);
  });

  it('0 与负数都算第 1 页', () => {
    expect(toPageNumber(0)).toBe(1);
    expect(toPageNumber(-5)).toBe(1);
  });

  it('小数向下取整', () => {
    expect(toPageNumber(3.9)).toBe(3);
  });

  it('NaN 与 Infinity 算第 1 页', () => {
    expect(toPageNumber(Number.NaN)).toBe(1);
    expect(toPageNumber(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('toPageSize', () => {
  it('缺省与非法值用默认页大小', () => {
    expect(toPageSize()).toBe(DEFAULT_PAGE_SIZE);
    expect(toPageSize(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('上界夹到 MAX_PAGE_SIZE', () => {
    expect(toPageSize(MAX_PAGE_SIZE + 1)).toBe(MAX_PAGE_SIZE);
    expect(toPageSize(1000)).toBe(MAX_PAGE_SIZE);
  });

  it('下界夹到 1（0 与负数不允许静默变成默认值）', () => {
    expect(toPageSize(0)).toBe(1);
    expect(toPageSize(-10)).toBe(1);
  });

  it('界内原样使用', () => {
    expect(toPageSize(50)).toBe(50);
  });
});

describe('toListParams', () => {
  it('空表单给默认分页，且不带 keyword 字段', () => {
    expect(toListParams()).toEqual({ page: 1, size: DEFAULT_PAGE_SIZE });
    expect('keyword' in toListParams()).toBe(false);
  });

  it('关键字去空白后带上', () => {
    expect(toListParams({ keyword: '  订单  ' })).toEqual({
      page: 1,
      size: DEFAULT_PAGE_SIZE,
      keyword: '订单',
    });
  });

  it('全空白关键字仍然不带字段', () => {
    expect('keyword' in toListParams({ keyword: '   ' })).toBe(false);
  });

  it('表单值一并归一化（页码、页大小都过一遍边界）', () => {
    expect(toListParams({ current: 0, pageSize: 9999 })).toEqual({
      page: 1,
      size: MAX_PAGE_SIZE,
    });
  });
});

describe('toTableResult', () => {
  it('正常响应原样透出，success 恒为 true', () => {
    const page: SamplePage = { items: [], total: 0 };
    expect(toTableResult(page)).toEqual({ data: [], total: 0, success: true });
  });

  it('响应缺字段时兜底为空表，而不是把 undefined 交给 ProTable', () => {
    expect(toTableResult(undefined)).toEqual({
      data: [],
      total: 0,
      success: true,
    });
    expect(toTableResult({} as SamplePage)).toEqual({
      data: [],
      total: 0,
      success: true,
    });
  });
});
