package {{package}}.sample.infrastructure.persistence;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Repository;

import {{package}}.sample.domain.error.SampleNameConflictException;
import {{package}}.sample.domain.model.Sample;
import {{package}}.sample.domain.model.SampleId;
import {{package}}.sample.domain.model.SampleName;
import {{package}}.sample.domain.repository.SampleRepository;

/**
 * 样本仓储的 MongoDB 实现（一个聚合 ↔ 一个文档）。
 *
 * <p>唯一索引在首次写入前建立，而不是用
 * {@code spring.data.mongodb.auto-index-creation} 声明式创建：后者会在上下文启动阶段就连接
 * MongoDB，无数据库 / 无凭据的环境（CI、纯单测）会直接启动失败。写入前建立保证任何成功写入的
 * 文档都受唯一约束保护。
 */
@Repository
public class SampleMongoRepository implements SampleRepository {

    /** 唯一索引：名称是业务唯一标识 */
    private static final Index NAME_UNIQUE_INDEX =
            new Index().on("name", Sort.Direction.ASC).unique();

    private final MongoTemplate mongoTemplate;
    private final AtomicBoolean nameIndexEnsured = new AtomicBoolean();

    public SampleMongoRepository(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public void save(Sample sample) {
        ensureNameUniqueIndex();
        try {
            mongoTemplate.save(SampleMapper.toDocument(sample));
        } catch (DuplicateKeyException e) {
            // 把存储细节翻译成领域异常：上层拿到的是「名称冲突」而不是 500
            throw new SampleNameConflictException(sample.name(), e);
        }
    }

    @Override
    public Optional<Sample> findById(SampleId id) {
        return Optional.ofNullable(mongoTemplate.findById(id.value(), SampleDocument.class))
                .map(SampleMapper::toDomain);
    }

    @Override
    public List<Sample> findPage(long offset, int limit) {
        // createdAt 只有毫秒精度，同刻记录靠 _id（ULID，天然唯一）定序，保证翻页确定性
        Query query = new Query()
                .with(Sort.by(Sort.Order.asc("createdAt"), Sort.Order.asc("_id")))
                .skip(offset)
                .limit(limit);
        return mongoTemplate.find(query, SampleDocument.class).stream()
                .map(SampleMapper::toDomain)
                .toList();
    }

    @Override
    public long count() {
        return mongoTemplate.count(new Query(), SampleDocument.class);
    }

    @Override
    public boolean existsByName(SampleName name) {
        return mongoTemplate.exists(Query.query(Criteria.where("name").is(name.value())), SampleDocument.class);
    }

    @Override
    public boolean deleteById(SampleId id) {
        return mongoTemplate
                        .remove(Query.query(Criteria.where("_id").is(id.value())), SampleDocument.class)
                        .getDeletedCount()
                > 0;
    }

    /** 幂等；失败时不置位，下次写入重试并把错误暴露在写入处 */
    private void ensureNameUniqueIndex() {
        if (nameIndexEnsured.get()) {
            return;
        }
        mongoTemplate.indexOps(SampleDocument.class).createIndex(NAME_UNIQUE_INDEX);
        nameIndexEnsured.set(true);
    }
}
