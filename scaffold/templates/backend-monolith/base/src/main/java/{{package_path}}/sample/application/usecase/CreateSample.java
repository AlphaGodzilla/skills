package {{package}}.sample.application.usecase;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.springframework.stereotype.Service;

import {{package}}.sample.application.dto.SampleView;
import {{package}}.sample.domain.model.Sample;
import {{package}}.sample.domain.model.SampleId;
import {{package}}.sample.domain.model.SampleName;
import {{package}}.sample.domain.repository.SampleRepository;
import {{package}}.sample.domain.service.SampleNamingPolicy;

/**
 * 新建样本。
 *
 * <p>用例的固定顺序：先构造值对象做字段校验 → 再过领域策略（名称唯一性）→ 最后写入。
 * 字段校验的唯一真相在领域值对象里，用例不重复校验。
 *
 * <p>时间在这里进入领域对象（领域不读时钟）。截断到毫秒：与关系库 / BSON 的日期精度一致，
 * 创建响应与之后回读的 ISO 字符串因此完全相同。
 */
@Service
public class CreateSample {

    private final SampleRepository repository;
    private final SampleNamingPolicy namingPolicy;

    public CreateSample(SampleRepository repository, SampleNamingPolicy namingPolicy) {
        this.repository = repository;
        this.namingPolicy = namingPolicy;
    }

    public SampleView handle(Command command) {
        SampleName name = SampleName.of(command.name());
        namingPolicy.ensureNameAvailable(name);

        Sample sample = Sample.create(SampleId.generate(), name, command.description(), now());
        repository.save(sample);
        return SampleView.of(sample);
    }

    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS);
    }

    /** 原始输入（REST 反序列化后未校验）；校验发生在值对象构造器里。 */
    public record Command(String name, String description) {}
}
