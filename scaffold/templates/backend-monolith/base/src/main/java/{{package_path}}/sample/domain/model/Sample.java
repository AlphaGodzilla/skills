package {{package}}.sample.domain.model;

import java.time.Instant;
import java.util.Objects;

import {{package}}.sample.domain.error.InvalidSampleFieldException;

/**
 * 样本（示例聚合根）。
 *
 * <p>三条聚合约定，新建聚合照抄这个形状：
 * <ol>
 *   <li>时间由调用方传入（应用层给 {@code now}），聚合自身不读时钟 —— 领域对象因此能在无容器、
 *       无数据库的环境里用固定 {@link Instant} 做单测；</li>
 *   <li>变更入口只有业务动词方法（{@link #rename} / {@link #describe}），不暴露 setter；</li>
 *   <li>持久化重建走 {@link #reconstitute}，与业务构造分开，避免重建时二次加工。</li>
 * </ol>
 */
public final class Sample {

    /** 说明长度上限（实现取值）：超长说明在写入前被拒为结构化 400，而不是落库后在驱动层炸成 500。 */
    public static final int MAX_DESCRIPTION_LENGTH = 1024;

    private final SampleId id;
    private final Instant createdAt;

    private SampleName name;
    private String description;
    private Instant updatedAt;

    private Sample(SampleId id, SampleName name, String description, Instant createdAt, Instant updatedAt) {
        this.id = Objects.requireNonNull(id, "id");
        this.name = Objects.requireNonNull(name, "name");
        this.description = normalizeDescription(description);
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt");
        this.updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
    }

    /** 新建样本：id 由调用方生成（测试可注入固定 id），时间戳由应用层传入。 */
    public static Sample create(SampleId id, SampleName name, String description, Instant now) {
        return new Sample(id, name, description, now, now);
    }

    /** 从持久化状态重建（映射器专用）：不做业务规则加工，字段按库中值还原。 */
    public static Sample reconstitute(
            SampleId id, SampleName name, String description, Instant createdAt, Instant updatedAt) {
        return new Sample(id, name, description, createdAt, updatedAt);
    }

    /** 改名。 */
    public void rename(SampleName newName, Instant now) {
        this.name = Objects.requireNonNull(newName, "newName");
        this.updatedAt = Objects.requireNonNull(now, "now");
    }

    /** 改说明：说明可选，空白归一为 {@code ""}；超长抛 {@link InvalidSampleFieldException}。 */
    public void describe(String newDescription, Instant now) {
        this.description = normalizeDescription(newDescription);
        this.updatedAt = Objects.requireNonNull(now, "now");
    }

    private static String normalizeDescription(String raw) {
        String normalized = raw == null ? "" : raw.strip();
        if (normalized.length() > MAX_DESCRIPTION_LENGTH) {
            throw new InvalidSampleFieldException(
                    "description", raw, "样本说明最长 " + MAX_DESCRIPTION_LENGTH + " 个字符，当前 " + normalized.length() + " 个");
        }
        return normalized;
    }

    public SampleId id() {
        return id;
    }

    public SampleName name() {
        return name;
    }

    public String description() {
        return description;
    }

    public Instant createdAt() {
        return createdAt;
    }

    public Instant updatedAt() {
        return updatedAt;
    }
}
