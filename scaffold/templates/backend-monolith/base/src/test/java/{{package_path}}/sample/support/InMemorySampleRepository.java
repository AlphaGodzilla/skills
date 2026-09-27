package {{package}}.sample.support;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import {{package}}.sample.domain.error.SampleNameConflictException;
import {{package}}.sample.domain.model.Sample;
import {{package}}.sample.domain.model.SampleId;
import {{package}}.sample.domain.model.SampleName;
import {{package}}.sample.domain.repository.SampleRepository;

/**
 * 测试替身：无数据库的环境下也能验证完整用例链路（REST 契约测试与领域单测共用）。
 *
 * <p>行为有意贴近真实实现，避免替身「太宽容」而掩盖 bug：
 * <ul>
 *   <li>读写都做快照拷贝 —— 用例改了聚合却忘记 save 时，测试必须能发现；</li>
 *   <li>{@code save} 按名称查重并抛同一个领域异常，模拟唯一约束那道保险。</li>
 * </ul>
 */
public class InMemorySampleRepository implements SampleRepository {

    private final Map<String, Sample> byId = new LinkedHashMap<>();

    @Override
    public synchronized void save(Sample sample) {
        boolean nameTaken = byId.values().stream()
                .anyMatch(stored ->
                        !stored.id().equals(sample.id()) && stored.name().equals(sample.name()));
        if (nameTaken) {
            throw new SampleNameConflictException(sample.name());
        }
        byId.put(sample.id().value(), copy(sample));
    }

    @Override
    public synchronized Optional<Sample> findById(SampleId id) {
        return Optional.ofNullable(byId.get(id.value())).map(InMemorySampleRepository::copy);
    }

    @Override
    public synchronized List<Sample> findPage(long offset, int limit) {
        return byId.values().stream()
                .sorted(Comparator.comparing(Sample::createdAt)
                        .thenComparing(sample -> sample.id().value()))
                .skip(offset)
                .limit(limit)
                .map(InMemorySampleRepository::copy)
                .toList();
    }

    @Override
    public synchronized long count() {
        return byId.size();
    }

    @Override
    public synchronized boolean existsByName(SampleName name) {
        return byId.values().stream().anyMatch(stored -> stored.name().equals(name));
    }

    @Override
    public synchronized boolean deleteById(SampleId id) {
        return byId.remove(id.value()) != null;
    }

    private static Sample copy(Sample sample) {
        return Sample.reconstitute(
                sample.id(), sample.name(), sample.description(), sample.createdAt(), sample.updatedAt());
    }

    /** 清空：测试方法之间互不影响（单例 bean 会跨方法复用）。 */
    public synchronized void clear() {
        byId.clear();
    }
}
