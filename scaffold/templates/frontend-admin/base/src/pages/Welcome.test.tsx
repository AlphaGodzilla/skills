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

import Welcome from './Welcome';

describe('Welcome', () => {
  it('渲染标题、说明与两张指路卡片', () => {
    render(<Welcome />);

    expect(screen.getByText('欢迎使用')).toBeInTheDocument();
    expect(screen.getByText('分层样例')).toBeInTheDocument();
    expect(screen.getByText('工程约定')).toBeInTheDocument();
  });
});
