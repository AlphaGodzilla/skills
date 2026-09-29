import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@umijs/max', () => ({
  Link: ({ children }: { children?: React.ReactNode }) => children,
  useIntl: () => ({
    // 严格 mock：真实 react-intl 在缺 id 时会抛错，这里照做，否则「漏写 id」会被测试放过
    formatMessage: ({
      id,
      defaultMessage,
    }: {
      id?: string;
      defaultMessage?: string;
    }) => {
      if (!id) {
        throw new Error('i18n 调用缺少 id：react-intl 在真实运行时会直接抛错');
      }
      return defaultMessage;
    },
  }),
}));

vi.mock('@/services/sample', () => ({
  listSamples: vi.fn(),
}));

import { listSamples, type SampleView } from '@/services/sample';
import SampleList from './index';
import { DEFAULT_PAGE_SIZE } from './listQuery';

const mockedList = vi.mocked(listSamples);

const ROW: SampleView = {
  id: '01SAMPLE0001',
  name: '示例一',
  description: '第一条示例数据的说明',
  createdAt: '2026-01-02T08:30:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
};

describe('示例列表页', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedList.mockResolvedValue({ items: [], total: 0 });
  });

  it('把服务层返回的行渲染成表格', async () => {
    mockedList.mockResolvedValue({ items: [ROW], total: 1 });

    render(<SampleList />);

    expect(await screen.findByText('示例一')).toBeInTheDocument();
  });

  it('没有数据时不报错（空表也是正常结果）', async () => {
    render(<SampleList />);

    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    expect(screen.queryByText('示例一')).toBeNull();
  });

  it('首次加载把默认分页归一化后交给服务层', async () => {
    render(<SampleList />);

    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    expect(mockedList.mock.calls[0][0]).toEqual({
      page: 1,
      size: DEFAULT_PAGE_SIZE,
    });
  });
});
