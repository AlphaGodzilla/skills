import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

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

import NotFound from './index';

describe('404 页', () => {
  it('给出 404 说明与回首页入口', () => {
    render(<NotFound />);

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(
      screen.getByText('这个地址不存在，可能是链接过期或输入有误。'),
    ).toBeInTheDocument();
    expect(screen.getByText('返回首页')).toBeInTheDocument();
  });
});
