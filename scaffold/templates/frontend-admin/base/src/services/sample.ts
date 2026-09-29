import { request } from '@umijs/max';

/**
 * 示例资源。字段与后端底座 `backend-monolith` 的 sample 上下文同形，
 * 换成真实业务时按同样形状改：**一个资源一个文件**，请求函数只做「路径 + 方法 + 参数」。
 */
export interface SampleView {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 分页响应的约定形状：`items` + `total`。
 *
 * 不用后端分页格式直接透传：页面需要的是「一页数据 + 总数」，
 * 由页面内的纯逻辑模块（如 `pages/sample/list/listQuery.ts`）负责转换与兜底。
 */
export interface SamplePage {
  items: SampleView[];
  total: number;
}

export interface ListSamplesParams {
  page?: number;
  size?: number;
  keyword?: string;
}

export interface CreateSampleBody {
  name: string;
  description?: string;
}

/** 列表：`GET /api/samples?page=&size=&keyword=` */
export async function listSamples(
  params: ListSamplesParams = {},
): Promise<SamplePage> {
  return request<SamplePage>('/api/samples', { method: 'GET', params });
}

/** 详情：`GET /api/samples/{id}` */
export async function getSample(id: string): Promise<SampleView> {
  return request<SampleView>(`/api/samples/${id}`, { method: 'GET' });
}

/** 创建：`POST /api/samples` */
export async function createSample(
  body: CreateSampleBody,
): Promise<SampleView> {
  return request<SampleView>('/api/samples', { method: 'POST', data: body });
}

/** 删除：`DELETE /api/samples/{id}` */
export async function deleteSample(id: string): Promise<void> {
  return request<void>(`/api/samples/${id}`, { method: 'DELETE' });
}
