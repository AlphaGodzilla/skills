import dayjs from 'dayjs';

/** 空值/非法值的统一占位符，避免界面出现空串或 Invalid Date。 */
export const EMPTY_PLACEHOLDER = '—';

/** 时间：ISO 串 → `YYYY-MM-DD HH:mm`；空值或非法值给占位符。 */
export function formatDateTime(
  value?: string | null,
  fallback: string = EMPTY_PLACEHOLDER,
): string {
  if (!value) {
    return fallback;
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : fallback;
}

/**
 * 文本截断：超过 `max` 个字符时截掉并补一个省略号。
 * 长度按字符数算（中文按 1 个字符），`max` 是**含省略号在内**的总长度。
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  // max ≤ 1 时 slice(0, 0) 得空串，结果只有一个省略号；不额外分支，省掉一处等价变异
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** 数量：一万以上折成「万」，一亿以上折成「亿」，保留一位小数；负数与非有限值给占位符。 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return EMPTY_PLACEHOLDER;
  }
  if (value < 10000) {
    return String(value);
  }
  if (value < 100000000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return `${(value / 100000000).toFixed(1)}亿`;
}

/**
 * 查询关键字归一化：非字符串与全空白视为「没填」，填了就截到 `maxLength`。
 * 返回 `undefined` 表示「这个条件不该出现在请求里」，调用方据此决定是否带参数。
 */
export function normalizeKeyword(
  raw: unknown,
  maxLength = 50,
): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, maxLength);
}
