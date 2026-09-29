import type {
  ListSamplesParams,
  SamplePage,
  SampleView,
} from '@/services/sample';
import { normalizeKeyword } from '@/utils/format';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** ProTable 查询表单里本项目用到的字段。 */
export interface ListFormValues {
  keyword?: string;
  current?: number;
  pageSize?: number;
}

/** 页码：缺省与非法值都算第 1 页，不允许出现 0 或负数页码。 */
export function toPageNumber(current?: number): number {
  // 只有一个判据：`undefined` 与 NaN 都过不了 Number.isFinite，不需要先单独判 undefined
  // （多一个判据就多一处「改掉它结果不变」的等价变异，门禁会永远亮红）。
  return Number.isFinite(current)
    ? Math.max(1, Math.floor(current as number))
    : 1;
}

/** 页大小：缺省用 DEFAULT_PAGE_SIZE，越界夹到 [1, MAX_PAGE_SIZE]。 */
export function toPageSize(size?: number): number {
  return Number.isFinite(size)
    ? Math.min(Math.max(Math.floor(size as number), 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
}

/**
 * 查询表单 → 服务层参数。
 *
 * 空关键字**不带**这个字段（而不是带空串）：后端因此能把「没筛」与「筛空串」区分开。
 */
export function toListParams(form: ListFormValues = {}): ListSamplesParams {
  const params: ListSamplesParams = {
    page: toPageNumber(form.current),
    size: toPageSize(form.pageSize),
  };
  const keyword = normalizeKeyword(form.keyword);
  if (keyword) {
    params.keyword = keyword;
  }
  return params;
}

/** 服务层分页响应 → ProTable 需要的形状；缺字段时兜底，避免表格崩在 undefined 上。 */
export function toTableResult(page: SamplePage | undefined): {
  data: SampleView[];
  total: number;
  success: boolean;
} {
  return {
    data: page?.items ?? [],
    total: page?.total ?? 0,
    success: true,
  };
}
