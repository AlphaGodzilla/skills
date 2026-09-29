import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ params: {} as { id?: string } }));

vi.mock('@umijs/max', () => ({
  history: { back: vi.fn() },
  useParams: () => route.params,
  useIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage?: string }) =>
      defaultMessage,
  }),
}));

vi.mock('@/services/sample', () => ({
  getSample: vi.fn(),
}));

import { getSample, type SampleView } from '@/services/sample';
import SampleDetail from './index';

const mockedGet = vi.mocked(getSample);

const DETAIL: SampleView = {
  id: '01SAMPLE0001',
  name: '示例一',
  description: '第一条示例数据的说明',
  createdAt: '2026-01-02T08:30:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
};

describe('示例详情页', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockResolvedValue(DETAIL);
    route.params = { id: DETAIL.id };
  });

  it('按路由参数拉取并展示字段', async () => {
    render(<SampleDetail />);

    expect(await screen.findByText('示例一')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith(DETAIL.id);
  });

  it('说明为空时显示占位符，而不是空白', async () => {
    mockedGet.mockResolvedValue({ ...DETAIL, description: '' });

    render(<SampleDetail />);

    expect(await screen.findByText('—')).toBeInTheDocument();
  });

  it('缺少 id 时不发请求，给出可诊断的提示', () => {
    route.params = {};

    render(<SampleDetail />);

    expect(screen.getByText('缺少 id，无法加载详情。')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
