import { Link, useIntl } from '@umijs/max';
import { Button, Result } from 'antd';
import React from 'react';

/** 兜底页：不套 ProLayout（见 `config/routes.ts` 的 `layout: false`）。 */
const NotFound: React.FC = () => {
  const intl = useIntl();

  return (
    <Result
      status="404"
      title={intl.formatMessage({
        id: 'page.404.title',
        defaultMessage: '404',
      })}
      subTitle={intl.formatMessage({
        id: 'page.404.description',
        defaultMessage: '这个地址不存在，可能是链接过期或输入有误。',
      })}
      extra={
        <Link to="/">
          <Button type="primary">
            {intl.formatMessage({
              id: 'page.404.back',
              defaultMessage: '返回首页',
            })}
          </Button>
        </Link>
      }
    />
  );
};

export default NotFound;
