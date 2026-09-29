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

import Welcome from './Welcome';

describe('Welcome', () => {
  it('渲染标题、说明与两张指路卡片', () => {
    render(<Welcome />);

    expect(screen.getByText('欢迎使用')).toBeInTheDocument();
    expect(screen.getByText('分层样例')).toBeInTheDocument();
    expect(screen.getByText('工程约定')).toBeInTheDocument();
  });
});
