package {{package}}.sample.application.usecase;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import {{package}}.platform.cache.CacheNames;
import {{package}}.sample.application.dto.SampleView;
import {{package}}.sample.domain.error.SampleNotFoundException;
import {{package}}.sample.domain.model.SampleId;
import {{package}}.sample.domain.repository.SampleRepository;

/**
 * 读取单个样本。
 *
 * <p>缓存用法样例：读路径用 {@link Cacheable}，键取业务 id。写路径（{@code DeleteSample}）用
 * {@code @CacheEvict} 清同键。缓存名引用 {@code CacheNames} 常量，不写字面量。
 *
 * <p>缓存的具体实现由 {@code spring.cache.type} 决定（caffeine / redis），本类不感知。
 */
@Service
public class GetSample {

    private final SampleRepository repository;

    public GetSample(SampleRepository repository) {
        this.repository = repository;
    }

    @Cacheable(cacheNames = CacheNames.SAMPLES, key = "#command.sampleId()")
    public SampleView handle(Command command) {
        SampleId id = SampleId.of(command.sampleId());
        return repository.findById(id).map(SampleView::of).orElseThrow(() -> new SampleNotFoundException(id));
    }

    /** 原始输入（REST 路径参数未校验）；校验发生在值对象构造器里。 */
    public record Command(String sampleId) {}
}
