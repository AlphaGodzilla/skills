package {{package}}.sample.application.usecase;

import java.util.List;

import org.springframework.stereotype.Service;

import {{package}}.sample.application.dto.SamplePage;
import {{package}}.sample.application.dto.SampleView;
import {{package}}.sample.domain.repository.SampleRepository;

/**
 * 分页列出样本。
 *
 * <p>分页参数的归一化在应用层：页码从 1 起，页大小缺省与上限由本类定，越界值夹到合法区间，
 * 领域与持久化层因此只面对合法入参。
 */
@Service
public class ListSamples {

    static final int DEFAULT_SIZE = 20;
    static final int MAX_SIZE = 100;

    private final SampleRepository repository;

    public ListSamples(SampleRepository repository) {
        this.repository = repository;
    }

    public SamplePage handle(Query query) {
        int page = query.page() == null || query.page() < 1 ? 1 : query.page();
        int size = query.size() == null || query.size() < 1 ? DEFAULT_SIZE : Math.min(query.size(), MAX_SIZE);

        long offset = (long) (page - 1) * size;
        List<SampleView> items =
                repository.findPage(offset, size).stream().map(SampleView::of).toList();
        return new SamplePage(items, repository.count(), page, size);
    }

    /** 原始分页入参（可空）；归一化在本用例内完成。 */
    public record Query(Integer page, Integer size) {}
}
