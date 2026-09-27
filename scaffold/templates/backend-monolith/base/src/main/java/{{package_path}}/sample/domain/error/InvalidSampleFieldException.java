package {{package}}.sample.domain.error;

import java.util.Objects;

/**
 * 字段级校验失败：值对象在构造时抛出，REST 层映射为 {@code 400} + {@code errors[]}。
 *
 * <p>携带 {@code field} 与 {@code rejectedValue} 是为了让错误可自我修正：调用方据此知道
 * 「哪个字段、什么值、为什么」。
 */
public final class InvalidSampleFieldException extends RuntimeException {

    private final String field;
    private final Object rejectedValue;

    public InvalidSampleFieldException(String field, Object rejectedValue, String reason) {
        super(reason);
        this.field = Objects.requireNonNull(field, "field");
        this.rejectedValue = rejectedValue;
    }

    /** JSON 字段名（与 REST 请求体的命名一致） */
    public String field() {
        return field;
    }

    /** 触发拒绝的原值（调用方输入的原样，不是归一化后的值） */
    public Object rejectedValue() {
        return rejectedValue;
    }
}
