package {{package}}.sample.application.dto;

import java.io.Serializable;
import java.util.List;

/**
 * 样本分页结果。
 *
 * <p>{@code page} 从 1 开始；{@code items} 不超过请求的 {@code size}；{@code total} 是全量计数。
 */
public record SamplePage(List<SampleView> items, long total, int page, int size) implements Serializable {

    private static final long serialVersionUID = 1L;
}
