package {{package}}.sample.interfaces.rest;

import java.net.URI;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import {{package}}.sample.domain.error.InvalidSampleFieldException;
import {{package}}.sample.domain.error.SampleNameConflictException;
import {{package}}.sample.domain.error.SampleNotFoundException;

/**
 * 领域异常 → RFC 7807 Problem Details。
 *
 * <p>{@code assignableTypes} 限定只拦本上下文的控制器，避免越界影响其它上下文与进程级端点。
 * 三种映射：字段校验失败 {@code 400}（带 {@code errors[]} 三要素）、名称冲突 {@code 409}、
 * 样本不存在 {@code 404}；领域异常路径上没有一种会落成 500。
 *
 * <p>这里直接引用本上下文的领域异常类型，是分层约定明确认可的例外：{@code interfaces} 可依赖本
 * 上下文的 {@code domain.error}，由领域异常直接映射为 HTTP 状态，不引入额外的异常翻译层。
 */
@RestControllerAdvice(assignableTypes = SampleController.class)
public class SampleProblemHandler {

    @ExceptionHandler(InvalidSampleFieldException.class)
    public ProblemDetail onInvalidField(InvalidSampleFieldException e, HttpServletRequest request) {
        return problem(
                HttpStatus.BAD_REQUEST,
                "请求参数不合法",
                e.getMessage(),
                request,
                List.of(new FieldViolation(e.field(), e.getMessage(), e.rejectedValue())));
    }

    @ExceptionHandler(SampleNameConflictException.class)
    public ProblemDetail onNameConflict(SampleNameConflictException e, HttpServletRequest request) {
        return problem(
                HttpStatus.CONFLICT,
                "样本名称冲突",
                e.getMessage(),
                request,
                List.of(new FieldViolation("name", e.getMessage(), e.nameValue())));
    }

    @ExceptionHandler(SampleNotFoundException.class)
    public ProblemDetail onNotFound(SampleNotFoundException e, HttpServletRequest request) {
        return problem(HttpStatus.NOT_FOUND, "样本不存在", e.getMessage(), request, List.of());
    }

    private static ProblemDetail problem(
            HttpStatus status, String title, String detail, HttpServletRequest request, List<FieldViolation> errors) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        // Spring 的 type 默认是 null，会被序列化时省掉；显式写成 RFC 7807 的默认值 about:blank
        problem.setType(URI.create("about:blank"));
        problem.setTitle(title);
        problem.setInstance(URI.create(request.getRequestURI()));
        problem.setProperty("errors", errors);
        return problem;
    }

    /** 字段级错误项：前端表单与调用方修正都靠这三要素定位问题 */
    record FieldViolation(String field, String message, Object rejectedValue) {}
}
