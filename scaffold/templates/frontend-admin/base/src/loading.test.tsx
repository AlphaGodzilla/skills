import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import Loading from './loading';

describe('loading', () => {
  it('渲染骨架屏占位（路由切换期间的等待界面）', () => {
    const { container } = render(<Loading />);

    expect(container.querySelector('.ant-skeleton')).not.toBeNull();
  });
});
