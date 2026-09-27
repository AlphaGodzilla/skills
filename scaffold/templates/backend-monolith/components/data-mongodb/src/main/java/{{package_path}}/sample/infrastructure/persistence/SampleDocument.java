package {{package}}.sample.infrastructure.persistence;

import java.time.Instant;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * 样本文档（集合 {@code samples}）。
 *
 * <p>文档类用可变 POJO 而不是 record：Spring Data 的反序列化语义（无参构造 + setter）不引入属性
 * 填充顺序的坑；不可变与不变性由领域模型承担，文档只是持久化形状。
 *
 * <p>字段名与 REST JSON 契约一致，不做映射。
 */
@Document(collection = SampleDocument.COLLECTION)
public class SampleDocument {

    public static final String COLLECTION = "samples";

    @Id
    private String id;

    private String name;

    private String description;

    private Instant createdAt;

    private Instant updatedAt;

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
