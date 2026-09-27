package {{package}}.sample.infrastructure.persistence;

import java.util.List;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;

import {{package}}.sample.domain.error.SampleNameConflictException;
import {{package}}.sample.domain.model.Sample;
import {{package}}.sample.domain.model.SampleId;
import {{package}}.sample.domain.model.SampleName;
import {{package}}.sample.domain.repository.SampleRepository;

/**
 * 样本仓储的关系库实现：把 Spring Data 的实体操作翻译成领域对象的读写。
 *
 * <p>写入用 {@code saveAndFlush} 立即落库，让唯一约束在这里当场生效，从而把
 * {@link DataIntegrityViolationException} 翻译成领域异常 —— 这是「领域服务先查 + 唯一约束兜底」
 * 双保险的第二道，兜住并发窗口。
 */
@Repository
public class SampleJpaAdapter implements SampleRepository {

    /** 主排序键 createdAt，同刻以 id（ULID，天然唯一）作稳定 tiebreak，保证翻页确定性 */
    private static final Sort STABLE_ORDER = Sort.by(Sort.Order.asc("createdAt"), Sort.Order.asc("id"));

    private final SampleJpaRepository repository;

    public SampleJpaAdapter(SampleJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    public void save(Sample sample) {
        try {
            repository.saveAndFlush(SampleJpaMapper.toEntity(sample));
        } catch (DataIntegrityViolationException e) {
            // 把存储细节翻译成领域异常：上层拿到的是「名称冲突」而不是 500
            throw new SampleNameConflictException(sample.name(), e);
        }
    }

    @Override
    public Optional<Sample> findById(SampleId id) {
        return repository.findById(id.value()).map(SampleJpaMapper::toDomain);
    }

    @Override
    public List<Sample> findPage(long offset, int limit) {
        if (limit <= 0) {
            return List.of();
        }
        // 端口给的是 offset + limit；调用方按 (page-1)*size 计算，因此整除成立
        int page = Math.toIntExact(offset / limit);
        return repository.findAll(PageRequest.of(page, limit, STABLE_ORDER)).getContent().stream()
                .map(SampleJpaMapper::toDomain)
                .toList();
    }

    @Override
    public long count() {
        return repository.count();
    }

    @Override
    public boolean existsByName(SampleName name) {
        return repository.existsByName(name.value());
    }

    @Override
    public boolean deleteById(SampleId id) {
        if (!repository.existsById(id.value())) {
            return false;
        }
        repository.deleteById(id.value());
        return true;
    }
}
