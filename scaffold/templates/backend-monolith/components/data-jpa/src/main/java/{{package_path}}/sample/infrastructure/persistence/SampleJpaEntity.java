package {{package}}.sample.infrastructure.persistence;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 样本表（{@code samples}）的 JPA 实体。
 *
 * <p>实体是持久化形状，不是领域模型：不可变性与业务规则由 {@code Sample} 承担，本类只负责列的
 * 读写。字段类型与 {@code V1__init.sql} 的列类型必须一致（启动时由 {@code ddl-auto: validate} 核对）。
 */
@Entity
@Table(name = "samples", uniqueConstraints = @UniqueConstraint(name = "uq_samples_name", columnNames = "name"))
public class SampleJpaEntity {

    @Id
    @Column(name = "id", length = 32, nullable = false)
    private String id;

    @Column(name = "name", length = 64, nullable = false)
    private String name;

    @Column(name = "description", length = 1024, nullable = false)
    private String description;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** JPA 要求的无参构造；业务侧不要用它 new 对象。 */
    protected SampleJpaEntity() {}

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
