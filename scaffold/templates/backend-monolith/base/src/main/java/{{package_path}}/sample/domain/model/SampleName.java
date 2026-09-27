package {{package}}.sample.domain.model;

import {{package}}.sample.domain.error.InvalidSampleFieldException;

/**
 * 样本名称：非空、去首尾空白、长度上限 {@value #MAX_LENGTH}。
 *
 * <p>长度上限是实现取值（可调整）：防止界面与列表被超长文本撑坏。
 */
public record SampleName(String value) {

    public static final int MAX_LENGTH = 64;

    public SampleName {
        // raw 只用于错误信息：rejectedValue 保持调用方原样输入
        String raw = value;
        value = value == null ? null : value.strip();
        if (value == null || value.isBlank()) {
            throw new InvalidSampleFieldException("name", raw, "样本名称不能为空");
        }
        if (value.length() > MAX_LENGTH) {
            throw new InvalidSampleFieldException(
                    "name", raw, "样本名称最长 " + MAX_LENGTH + " 个字符，当前 " + value.length() + " 个");
        }
    }

    public static SampleName of(String raw) {
        return new SampleName(raw);
    }
}
