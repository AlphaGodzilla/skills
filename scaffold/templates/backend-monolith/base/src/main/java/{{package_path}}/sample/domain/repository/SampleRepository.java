package {{package}}.sample.domain.repository;

import java.util.List;
import java.util.Optional;

import {{package}}.sample.domain.model.Sample;
import {{package}}.sample.domain.model.SampleId;
import {{package}}.sample.domain.model.SampleName;

/**
 * 样本仓储（端口）。实现由 {@code infrastructure} 提供（MongoDB 或 JPA），领域层只认这个接口。
 *
 * <p>写入语义：{@link #save} 按 id upsert；名称撞上唯一约束时，实现必须翻译为
 * {@link {{package}}.sample.domain.error.SampleNameConflictException}（领域异常），不得让
 * {@code DuplicateKeyException} / {@code DataIntegrityViolationException} 这类存储细节漏到上层 ——
 * 那会变成 500 而不是结构化冲突错误。
 *
 * <p>{@link #findPage} 的排序必须确定（见各实现的注释）：确定性顺序是翻页不重不漏的前提。
 */
public interface SampleRepository {

    void save(Sample sample);

    Optional<Sample> findById(SampleId id);

    /** 从 offset 起、最多 limit 条，按创建时间升序、同刻以 id 升序。 */
    List<Sample> findPage(long offset, int limit);

    long count();

    boolean existsByName(SampleName name);

    /** @return 是否真的删除了一个样本（用于把「删到不存在的样本」判为 404） */
    boolean deleteById(SampleId id);
}
