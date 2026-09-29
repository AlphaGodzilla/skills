import { request } from '@umijs/max';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSample, deleteSample, getSample, listSamples } from './sample';

vi.mock('@umijs/max', () => ({
  request: vi.fn(),
}));

const mockedRequest = vi.mocked(request);

beforeEach(() => {
  mockedRequest.mockReset();
  mockedRequest.mockResolvedValue(undefined as never);
});

/**
 * 服务层契约测试：断言的是「请求长什么样」，不是「后端返回什么」。
 *
 * 这一层最容易出的错是路径、方法、参数位置（params 还是 data）写错，
 * 而这类错误在页面测试里看不出来（页面只看返回值），所以必须单独锁住。
 */
describe('sample 服务契约', () => {
  it('列表：GET /api/samples，查询条件放在 params', async () => {
    await listSamples({ page: 2, size: 20, keyword: '订单' });

    expect(mockedRequest).toHaveBeenCalledWith('/api/samples', {
      method: 'GET',
      params: { page: 2, size: 20, keyword: '订单' },
    });
  });

  it('列表：不传条件时仍然发请求（默认分页由调用方决定）', async () => {
    await listSamples();

    expect(mockedRequest).toHaveBeenCalledWith('/api/samples', {
      method: 'GET',
      params: {},
    });
  });

  it('列表：响应原样返回，不在服务层做形状转换', async () => {
    const page = { items: [], total: 0 };
    mockedRequest.mockResolvedValue(page);

    await expect(listSamples()).resolves.toBe(page);
  });

  it('详情：GET /api/samples/{id}，id 拼进路径', async () => {
    await getSample('01SAMPLE0001');

    expect(mockedRequest).toHaveBeenCalledWith('/api/samples/01SAMPLE0001', {
      method: 'GET',
    });
  });

  it('创建：POST /api/samples，请求体放在 data', async () => {
    await createSample({ name: '新示例', description: '说明' });

    expect(mockedRequest).toHaveBeenCalledWith('/api/samples', {
      method: 'POST',
      data: { name: '新示例', description: '说明' },
    });
  });

  it('删除：DELETE /api/samples/{id}，无请求体', async () => {
    await deleteSample('01SAMPLE0002');

    expect(mockedRequest).toHaveBeenCalledWith('/api/samples/01SAMPLE0002', {
      method: 'DELETE',
    });
  });
});
