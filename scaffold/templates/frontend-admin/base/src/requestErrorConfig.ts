import type { RequestConfig } from '@umijs/max';
import { getIntl } from '@umijs/max';

import { getAppMessage } from '@/components/AntdMessageBridge';

/**
 * 后端字段级错误条目（RFC 7807 的 `errors[]`）。
 *
 * 与后端底座 `backend-monolith` 的 `ProblemDetail` 约定一致：领域错误带 `errors[]`，
 * 框架级错误（非法 JSON、类型不匹配、参数解析失败）只有 `status`/`title`/`detail`。
 */
export interface FieldViolation {
  field: string;
  message: string;
  rejectedValue?: unknown;
}

/** 后端错误体（RFC 7807 Problem Details）。 */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: FieldViolation[];
}

/** 取出请求失败响应里的后端错误体；网络层失败（无响应 / 响应非对象）返回 undefined。 */
export function parseProblemDetail(error: unknown): ProblemDetail | undefined {
  const data = (error as { response?: { data?: unknown } } | undefined)
    ?.response?.data;
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  return data as ProblemDetail;
}

/**
 * 错误体 → 用户可见消息。
 *
 * 字段级错误优先（`errors[].message` 能定位到具体字段，比 detail 更有用）；
 * 没有字段级信息时（含全部框架级错误）退回通用 `detail`/`title`。
 */
export function formatProblemMessage(problem: ProblemDetail): string {
  const violations = Array.isArray(problem.errors) ? problem.errors : [];
  if (violations.length > 0) {
    return violations
      .map((violation) => violation.message || violation.field)
      .join('；');
  }
  return problem.detail ?? problem.title ?? '请求失败，请稍后重试';
}

/**
 * 有响应、但响应体不是 RFC 7807 对象时的提示。
 *
 * 典型场景：网关或连接器在应用之前就拒绝了请求（如超长 URL、请求体过大），返回 HTML 错误页。
 * 这时状态码是唯一可用信息，必须带上——否则会与「后端无响应」混淆。
 */
export function formatResponseStatusMessage(status: number): string {
  return `请求失败（HTTP ${status}）`;
}

/**
 * 走 `<App>` 上下文里的 message，主题与语言因此生效；
 * 桥未挂载时（极早期失败）回落到 antd 静态方法兜底。
 */
function notifyError(content: string): void {
  const appMessage = getAppMessage();
  if (appMessage) {
    appMessage.error(content);
    return;
  }
  console.warn('[request] 错误提示在 <App> 挂载前触发：', content);
}

/**
 * @name 错误处理
 * @description 对接后端 RFC 7807 契约：请求失败先展示错误体，领域错误与框架级错误由此区分；
 *   网络层失败按离线 / 无响应 / 其它分别提示。
 * @doc https://umijs.org/docs/max/request#配置
 */
export const errorConfig: RequestConfig = {
  errorConfig: {
    errorHandler: (error: unknown, opts: { skipErrorHandler?: boolean }) => {
      if (opts?.skipErrorHandler) {
        throw error;
      }

      const problem = parseProblemDetail(error);
      if (problem) {
        notifyError(formatProblemMessage(problem));
        return;
      }

      // 纯浏览器应用（无 SSR），不需要 typeof navigator 兜底：那是永远走不到的死分支
      if (!navigator.onLine) {
        notifyError(
          getIntl().formatMessage({
            id: 'app.request.offline',
            defaultMessage: '网络不可用，请检查网络连接后重试。',
          }),
        );
        return;
      }

      const status = (error as { response?: { status?: unknown } } | undefined)
        ?.response?.status;
      if (typeof status === 'number') {
        notifyError(formatResponseStatusMessage(status));
        return;
      }

      if ((error as { request?: unknown } | undefined)?.request) {
        notifyError('后端无响应，请稍后重试');
        return;
      }

      notifyError('请求失败，请稍后重试');
    },
  },
};
