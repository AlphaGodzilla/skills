package {{package}}.shared.id;

/**
 * 集合语义前缀：id 开头的两位，让「这个 id 属于哪个集合」零成本可判。
 *
 * <p>本表是前缀的唯一真相源：各上下文 id 值对象的生成与校验都从这里取。新增限界上下文时在这里
 * 登记一个两位前缀，保证前缀两两不同。
 *
 * <p>前缀恰好两位且互不相同；取值避开 Crockford Base32 的字符表（ULID 排除 I、L、O、U），
 * 因此前缀之后的部分不会与前缀混淆。
 */
public final class IdPrefix {

    /** 示例上下文（sample）的 id 前缀。 */
    public static final String SAMPLE = "SM";

    private IdPrefix() {}
}
