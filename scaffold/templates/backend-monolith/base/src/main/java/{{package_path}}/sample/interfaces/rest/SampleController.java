package {{package}}.sample.interfaces.rest;

import java.net.URI;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import {{package}}.sample.application.dto.SamplePage;
import {{package}}.sample.application.dto.SampleView;
import {{package}}.sample.application.usecase.CreateSample;
import {{package}}.sample.application.usecase.DeleteSample;
import {{package}}.sample.application.usecase.GetSample;
import {{package}}.sample.application.usecase.ListSamples;

/**
 * 样本的 REST 入口。
 *
 * <p>本控制器只做协议转换：请求模型 → 用例命令、用例结果 → 响应模型。字段校验在领域值对象里做，
 * 错误体由 {@link SampleProblemHandler} 统一映射为 RFC 7807 Problem Details。
 */
@RestController
@RequestMapping("/api/samples")
public class SampleController {

    private final CreateSample createSample;
    private final GetSample getSample;
    private final ListSamples listSamples;
    private final DeleteSample deleteSample;

    public SampleController(
            CreateSample createSample, GetSample getSample, ListSamples listSamples, DeleteSample deleteSample) {
        this.createSample = createSample;
        this.getSample = getSample;
        this.listSamples = listSamples;
        this.deleteSample = deleteSample;
    }

    @PostMapping
    public ResponseEntity<SampleView> create(@RequestBody CreateSampleRequest request) {
        SampleView created = createSample.handle(new CreateSample.Command(request.name(), request.description()));
        return ResponseEntity.created(URI.create("/api/samples/" + created.id()))
                .body(created);
    }

    @GetMapping
    public SamplePage list(@RequestParam(required = false) Integer page, @RequestParam(required = false) Integer size) {
        return listSamples.handle(new ListSamples.Query(page, size));
    }

    @GetMapping("/{id}")
    public SampleView get(@PathVariable String id) {
        return getSample.handle(new GetSample.Command(id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        deleteSample.handle(new DeleteSample.Command(id));
        return ResponseEntity.noContent().build();
    }

    /** 请求模型只承载原始输入，不带校验注解：校验的唯一真相在领域值对象。 */
    public record CreateSampleRequest(String name, String description) {}
}
