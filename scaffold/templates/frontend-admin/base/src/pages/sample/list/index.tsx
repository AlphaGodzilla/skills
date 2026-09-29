import type { ProColumns } from '@ant-design/pro-components';
import { ProTable } from '@ant-design/pro-components';
import { Link, useIntl } from '@umijs/max';
import React from 'react';

import { listSamples, type SampleView } from '@/services/sample';
import { formatDateTime, truncate } from '@/utils/format';
import { DEFAULT_PAGE_SIZE, toListParams, toTableResult } from './listQuery';

const DESCRIPTION_MAX = 24;

/**
 * 列表页：**只做装配**——列定义 + 把查询交给 ProTable。
 *
 * 分页/关键字的归一化在 `./listQuery.ts`（纯函数，可单测），
 * 请求形状在 `@/services/sample`（契约测试），这里不需要也不应该再有业务判断。
 */
const SampleList: React.FC = () => {
  const intl = useIntl();

  const columns: ProColumns<SampleView>[] = [
    {
      title: intl.formatMessage({
        id: 'page.sample.list.id',
        defaultMessage: 'ID',
      }),
      dataIndex: 'id',
      copyable: true,
      width: 180,
      search: false,
    },
    {
      title: intl.formatMessage({
        id: 'page.sample.list.name',
        defaultMessage: '名称',
      }),
      dataIndex: 'name',
      render: (_, record) => (
        <Link to={`/samples/${record.id}`}>{record.name}</Link>
      ),
    },
    {
      // 虚拟列：只作为查询条件出现在表单里，不出现在表格中
      title: intl.formatMessage({
        id: 'page.sample.list.keyword',
        defaultMessage: '名称或说明',
      }),
      dataIndex: 'keyword',
      hideInTable: true,
    },
    {
      title: intl.formatMessage({
        id: 'page.sample.list.description',
        defaultMessage: '说明',
      }),
      dataIndex: 'description',
      search: false,
      render: (_, record) =>
        truncate(record.description || '—', DESCRIPTION_MAX),
    },
    {
      title: intl.formatMessage({
        id: 'page.sample.list.createdAt',
        defaultMessage: '创建时间',
      }),
      dataIndex: 'createdAt',
      search: false,
      render: (_, record) => formatDateTime(record.createdAt),
    },
  ];

  return (
    <ProTable<SampleView>
      headerTitle={intl.formatMessage({
        id: 'page.sample.list.title',
        defaultMessage: '示例列表',
      })}
      rowKey="id"
      columns={columns}
      request={async (params) => {
        const page = await listSamples(toListParams(params));
        return toTableResult(page);
      }}
      pagination={{ defaultPageSize: DEFAULT_PAGE_SIZE, showSizeChanger: true }}
      search={{ labelWidth: 'auto' }}
    />
  );
};

export default SampleList;
