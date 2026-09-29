import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 记录用到的 i18n key：mock 下文案都取 defaultMessage，
// 只有 key 不同，所以离线提示这类分支必须断言 key。
const intlKeys = vi.hoisted(() => ({ used: [] as string[] }));

vi.mock('@umijs/max', () => ({
  getIntl: () => ({
    formatMessage: ({
      id,
      defaultMessage,
    }: {
      id?: string;
      defaultMessage?: string;
    }) => {
      if (!id) {
        // 真实 react-intl 缺 id 时会抛错，mock 里照做，否则「漏写 id」会被测试放过
        throw new Error('i18n 调用缺少 id：react-intl 在真实运行时会直接抛错');
      }
      intlKeys.used.push(id);
      return defaultMessage;
    },
  }),
}));

// 提示通道：真身要挂在 antd <App> 里才有实例，这里换成可断言的替身
const bridge = vi.hoisted(() => ({ getAppMessage: vi.fn() }));
vi.mock('@/components/AntdMessageBridge', () => ({
  getAppMessage: bridge.getAppMessage,
}));

import {
  errorConfig,
  formatProblemMessage,
  formatResponseStatusMessage,
  parseProblemDetail,
} from './requestErrorConfig';

const handle = errorConfig.errorConfig?.errorHandler as (
  error: unknown,
  opts: { skipErrorHandler?: boolean },
) => void;

const setOnline = (online: boolean) => {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: online,
  });
};

describe('parseProblemDetail', () => {
  it('取出 response.data 里的错误体', () => {
    const problem = { status: 404, detail: '不存在' };
    expect(parseProblemDetail({ response: { data: problem } })).toBe(problem);
  });

  it('无响应 / 响应体不是对象时返回 undefined（网络层失败）', () => {
    expect(parseProblemDetail(new Error('Network Error'))).toBeUndefined();
    expect(parseProblemDetail({ response: { data: 'oops' } })).toBeUndefined();
    expect(parseProblemDetail({ response: { data: null } })).toBeUndefined();
    expect(parseProblemDetail(undefined)).toBeUndefined();
  });
});

describe('formatProblemMessage', () => {
  it('有 errors[] 时优先字段级原因，多项用分号连接', () => {
    const message = formatProblemMessage({
      detail: '参数校验失败',
      errors: [
        { field: 'name', message: '名称不能为空' },
        { field: 'size', message: '数量必须大于 0' },
      ],
    });
    expect(message).toBe('名称不能为空；数量必须大于 0');
  });

  it('字段级条目没有 message 时退回 field', () => {
    expect(
      formatProblemMessage({ errors: [{ field: 'name', message: '' }] }),
    ).toBe('name');
  });

  it('没有 errors[] 时用 detail，再退回 title', () => {
    expect(formatProblemMessage({ detail: '请求体格式错误' })).toBe(
      '请求体格式错误',
    );
    expect(formatProblemMessage({ title: 'Bad Request' })).toBe('Bad Request');
  });

  it('框架级错误（既无 errors[] 也无 detail/title）给兜底文案', () => {
    expect(formatProblemMessage({ status: 500 })).toBe('请求失败，请稍后重试');
  });

  it('errors 不是数组时按无字段级信息处理', () => {
    expect(formatProblemMessage({ detail: '失败', errors: undefined })).toBe(
      '失败',
    );
  });
});

describe('formatResponseStatusMessage', () => {
  it('带上状态码，便于与「后端无响应」区分', () => {
    expect(formatResponseStatusMessage(400)).toBe('请求失败（HTTP 400）');
  });
});

describe('errorConfig.errorHandler', () => {
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockReset();
    intlKeys.used.length = 0;
    bridge.getAppMessage.mockReturnValue({ error: notify });
    setOnline(true);
  });

  afterEach(() => {
    setOnline(true);
  });

  it('skipErrorHandler 时原样抛出，交给调用方处理', () => {
    const error = new Error('自己处理');
    expect(() => handle(error, { skipErrorHandler: true })).toThrow(error);
    expect(notify).not.toHaveBeenCalled();
  });

  it('调用方没传 opts 时不炸（opts 是可选约定，不能直接取属性）', () => {
    handle({ request: {} } as never, undefined as never);

    expect(notify).toHaveBeenCalledWith('后端无响应，请稍后重试');
  });

  it('领域错误展示字段级消息', () => {
    handle(
      {
        response: {
          data: { errors: [{ field: 'name', message: '名称不能为空' }] },
        },
      },
      {},
    );

    expect(notify).toHaveBeenCalledWith('名称不能为空');
  });

  it('离线时提示网络不可用（优先于状态码），文案取 app.request.offline', () => {
    setOnline(false);

    handle({ request: {} }, {});

    expect(intlKeys.used).toContain('app.request.offline');
    expect(notify).toHaveBeenCalledWith('网络不可用，请检查网络连接后重试。');
  });

  it('有响应但不是问题详情时带上状态码', () => {
    handle({ response: { status: 502, data: '<html>Bad Gateway</html>' } }, {});

    expect(notify).toHaveBeenCalledWith('请求失败（HTTP 502）');
  });

  it('有请求无响应时提示后端无响应', () => {
    handle({ request: {} }, {});

    expect(notify).toHaveBeenCalledWith('后端无响应，请稍后重试');
  });

  it('既无响应也无可诊断痕迹时给兜底文案（取值过程不能抛错）', () => {
    handle({}, {});

    expect(notify).toHaveBeenCalledWith('请求失败，请稍后重试');
  });

  it('error 本身为空时同样不抛错（属性访问必须走可选链）', () => {
    handle(undefined, {});
    handle(null, {});

    expect(notify).toHaveBeenNthCalledWith(1, '请求失败，请稍后重试');
    expect(notify).toHaveBeenNthCalledWith(2, '请求失败，请稍后重试');
  });

  it('其它失败给兜底文案', () => {
    handle(new Error('boom'), {});

    expect(notify).toHaveBeenCalledWith('请求失败，请稍后重试');
  });

  it('<App> 还没挂载时回落到 console.warn，不静默吞掉错误', () => {
    bridge.getAppMessage.mockReturnValue(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    handle({ response: { data: { detail: '失败了' } } }, {});

    expect(warn).toHaveBeenCalledWith(
      '[request] 错误提示在 <App> 挂载前触发：',
      '失败了',
    );
    expect(notify).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});
