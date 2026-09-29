import type { ProDescriptionsItemProps } from '@ant-design/pro-components';
import { ProDescriptions } from '@ant-design/pro-components';
import { history, useIntl, useParams } from '@umijs/max';
import { Button, Card, Typography } from 'antd';
import React from 'react';

import { getSample, type SampleView } from '@/services/sample';
import { formatDateTime } from '@/utils/format';

/**
 * 详情页：与列表页同样只做装配。
 *
 * 数据加载交给 ProDescriptions 的 `request`（组件自己管 loading 与重试），
 * 不在这里写 useEffect —— 页面上手写请求是这类后台最常见的技术债来源。
 */
const SampleDetail: React.FC = () => {
  const intl = useIntl();
  const { id } = useParams<{ id: string }>();

  const columns: ProDescriptionsItemProps<SampleView>[] = [
    {
      title: intl.formatMessage({
        id: 'page.sample.detail.id',
        defaultMessage: 'ID',
      }),
      dataIndex: 'id',
      copyable: true,
    },
    {
      title: intl.formatMessage({
        id: 'page.sample.detail.name',
        defaultMessage: '名称',
      }),
      dataIndex: 'name',
    },
    {
      title: intl.formatMessage({
        id: 'page.sample.detail.description',
        defaultMessage: '说明',
      }),
      dataIndex: 'description',
      render: (_, record) => record.description || '—',
    },
    {
      title: intl.formatMessage({
        id: 'page.sample.detail.createdAt',
        defaultMessage: '创建时间',
      }),
      dataIndex: 'createdAt',
      render: (_, record) => formatDateTime(record.createdAt),
    },
    {
      title: intl.formatMessage({
        id: 'page.sample.detail.updatedAt',
        defaultMessage: '更新时间',
      }),
      dataIndex: 'updatedAt',
      render: (_, record) => formatDateTime(record.updatedAt),
    },
  ];

  return (
    <Card
      title={intl.formatMessage({
        id: 'page.sample.detail.title',
        defaultMessage: '示例详情',
      })}
      extra={
        <Button onClick={() => history.back()}>
          {intl.formatMessage({
            id: 'page.sample.detail.back',
            defaultMessage: '返回列表',
          })}
        </Button>
      }
    >
      {id ? (
        <ProDescriptions<SampleView>
          column={1}
          request={async () => {
            const data = await getSample(id);
            return { data, success: true };
          }}
          columns={columns}
        />
      ) : (
        <Typography.Text type="warning">
          {intl.formatMessage({
            id: 'page.sample.detail.missingId',
            defaultMessage: '缺少 id，无法加载详情。',
          })}
        </Typography.Text>
      )}
    </Card>
  );
};

export default SampleDetail;
