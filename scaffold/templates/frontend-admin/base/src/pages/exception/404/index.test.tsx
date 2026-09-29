import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@umijs/max', () => ({
  Link: ({ children }: { children?: React.ReactNode }) => children,
  useIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage?: string }) =>
      defaultMessage,
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
