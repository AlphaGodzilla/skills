package {{package}}.sample.domain.error;

import java.util.Objects;

import {{package}}.sample.domain.model.SampleId;

/** 按 id 找不到样本：REST 层映射为 {@code 404}。 */
public final class SampleNotFoundException extends RuntimeException {

    private final SampleId id;

    public SampleNotFoundException(SampleId id) {
        super("样本不存在：" + id.value());
        this.id = Objects.requireNonNull(id, "id");
    }

    public SampleId id() {
        return id;
    }
}
