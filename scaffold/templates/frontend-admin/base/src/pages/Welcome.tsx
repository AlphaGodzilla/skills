import { Link, useIntl } from '@umijs/max';
import { Card, Typography } from 'antd';
import { createStyles } from 'antd-style';
import React from 'react';

const useStyles = createStyles(({ token, css }) => ({
  page: css`
    padding: ${token.paddingLG}px;
  `,
  grid: css`
    display: grid;
    gap: ${token.margin}px;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    margin-top: ${token.marginLG}px;
  `,
}));

/**
 * 落地页：只做指路，不放业务。
 *
 * 真实项目通常会把这里换成工作台（指标卡 + 待办列表），届时把本文件整体替换即可。
 */
const Welcome: React.FC = () => {
  const { styles } = useStyles();
  const intl = useIntl();

  const sampleCard = (
    <Card
      title={intl.formatMessage({
        id: 'page.welcome.card.sample',
        defaultMessage: '分层样例',
      })}
      hoverable
    >
      <Typography.Paragraph type="secondary">
        {intl.formatMessage({
          id: 'page.welcome.card.sample.desc',
          defaultMessage: '列表 + 详情 + 服务层 + 纯逻辑模块 + 契约测试',
        })}
      </Typography.Paragraph>
    </Card>
  );

  return (
    <div className={styles.page}>
      <Typography.Title level={3}>
        {intl.formatMessage({
          id: 'page.welcome.title',
          defaultMessage: '欢迎使用',
        })}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {intl.formatMessage({
          id: 'page.welcome.description',
          defaultMessage: '这是底座自带的骨架页。',
        })}
      </Typography.Paragraph>

      <div className={styles.grid}>
        {/* 整卡可点：列表页的入口，也演示「卡片 + 路由跳转」这一最常见写法 */}
        <Link to="/samples">{sampleCard}</Link>
        <Card
          title={intl.formatMessage({
            id: 'page.welcome.card.docs',
            defaultMessage: '工程约定',
          })}
        >
          <Typography.Paragraph type="secondary">
            {intl.formatMessage({
              id: 'page.welcome.card.docs.desc',
              defaultMessage:
                '命令、测试分层、门禁与目录职责都在 docs/scaffold/ 下',
            })}
          </Typography.Paragraph>
        </Card>
      </div>
    </div>
  );
};

export default Welcome;
