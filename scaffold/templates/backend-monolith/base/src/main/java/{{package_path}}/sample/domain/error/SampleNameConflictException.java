package {{package}}.sample.domain.error;

import java.util.Objects;

import {{package}}.sample.domain.model.SampleName;

/**
 * 两个样本使用了相同名称：名称是业务唯一标识，必须阻断而不是覆盖。
 *
 * <p>由两道闸门抛出同一异常：{@code SampleNamingPolicy}（领域服务，先查）与持久化适配器命中
 * 唯一约束后的翻译（并发窗口）。REST 层统一映射为 {@code 409 Conflict}。
 */
public final class SampleNameConflictException extends RuntimeException {

    private final SampleName name;

    public SampleNameConflictException(SampleName name) {
        this(name, null);
    }

    public SampleNameConflictException(SampleName name, Throwable cause) {
        super("名称「%s」已被占用".formatted(name.value()), cause);
        this.name = Objects.requireNonNull(name, "name");
    }

    /**
     * 名称的字符串投影（不带 {@link SampleName} 类型）。
     *
     * <p>字段存的是领域值对象，但对外只暴露字符串：interfaces 层映射 409 错误体时因此不必触碰
     * 领域模型类型。
     */
    public String nameValue() {
        return name.value();
    }
}
