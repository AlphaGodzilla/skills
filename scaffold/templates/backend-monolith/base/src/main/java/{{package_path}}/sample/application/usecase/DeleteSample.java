package {{package}}.sample.application.usecase;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;

import {{package}}.platform.cache.CacheNames;
import {{package}}.sample.domain.error.SampleNotFoundException;
import {{package}}.sample.domain.model.SampleId;
import {{package}}.sample.domain.repository.SampleRepository;

/**
 * 删除样本。
 *
 * <p>写路径必须清掉读路径写下的缓存，否则删完再读会拿到已删数据的副本。
 *
 * <p>删除失败（id 不存在）时抛 {@link SampleNotFoundException} → REST 层映射为 {@code 404}。
 */
@Service
public class DeleteSample {

    private final SampleRepository repository;

    public DeleteSample(SampleRepository repository) {
        this.repository = repository;
    }

    @CacheEvict(cacheNames = CacheNames.SAMPLES, key = "#command.sampleId()")
    public void handle(Command command) {
        SampleId id = SampleId.of(command.sampleId());
        if (!repository.deleteById(id)) {
            throw new SampleNotFoundException(id);
        }
    }

    /** 原始输入（REST 路径参数未校验）；校验发生在值对象构造器里。 */
    public record Command(String sampleId) {}
}
