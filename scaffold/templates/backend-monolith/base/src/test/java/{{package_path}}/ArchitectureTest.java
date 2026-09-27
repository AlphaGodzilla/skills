package {{package}};

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;

/**
 * 架构守护：分层与上下文边界的硬约束在这里成为可回归的测试。
 *
 * <p>四条规则：
 * <ol>
 *   <li>领域层与共享内核零框架依赖；</li>
 *   <li>上下文之间只经已发布出口白名单依赖（默认白名单为空，新增出口时显式登记）；</li>
 *   <li>上下文内 interfaces 层不得向上依赖本上下文的 domain.model / domain.service /
 *       domain.repository / infrastructure，也不得直接依赖其它上下文；</li>
 *   <li>platform 跨上下文技术适配层不得依赖任何限界上下文。</li>
 * </ol>
 *
 * <p>新增限界上下文时，把它加进 {@link #CONTEXTS}；上下文对它的跨上下文出口加进
 * {@link #PUBLISHED_CROSS_CONTEXT_PORTS}。
 */
@AnalyzeClasses(packages = ArchitectureTest.ROOT_PACKAGE, importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    static final String ROOT_PACKAGE = "{{package}}";

    private static final String SHARED_KERNEL = "shared";

    private static final String PLATFORM = "platform";

    /** 限界上下文（含共享内核）；顶层 {@code interfaces} 与 {@code platform} 不是上下文 */
    private static final List<String> CONTEXTS = List.of(SHARED_KERNEL, "sample");

    private static final String[] CONTEXT_PACKAGES = CONTEXTS.stream()
            .map(context -> ROOT_PACKAGE + "." + context + "..")
            .toArray(String[]::new);

    /** 业务上下文（不含共享内核），用于约束 platform 不得依赖它们 */
    private static final String[] BUSINESS_CONTEXT_PACKAGES = CONTEXTS.stream()
            .filter(context -> !SHARED_KERNEL.equals(context))
            .map(context -> ROOT_PACKAGE + "." + context + "..")
            .toArray(String[]::new);

    private static final String[] CONTEXT_INTERFACES_PACKAGES = CONTEXTS.stream()
            .map(context -> ROOT_PACKAGE + "." + context + ".interfaces..")
            .toArray(String[]::new);

    /**
     * 允许跨上下文依赖的已发布出口白名单：显式、可 grep、变更即契约变更。
     *
     * <p>默认空。新增跨上下文出口时在这里登记接口的顶层全限定名，并在实现类上写清「为什么这是出口」。
     */
    private static final Set<String> PUBLISHED_CROSS_CONTEXT_PORTS = Set.of();

    @ArchTest
    static final ArchRule domainAndSharedKernelShouldNotDependOnFrameworks = noClasses()
            .that()
            .resideInAnyPackage("..domain..", ROOT_PACKAGE + ".shared..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                    "org.springframework..",
                    "com.mongodb..",
                    "org.bson..",
                    "jakarta.persistence..",
                    "org.hibernate..",
                    "jakarta.servlet..",
                    "com.fasterxml.jackson..",
                    "tools.jackson..")
            .because("domain 包必须能在无容器、无数据库的环境里 new 出对象做单测；shared 共享内核" + "被所有上下文依赖，引入框架会把框架泄漏到全部上下文")
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule contextsShouldOnlyCommunicateThroughPublishedPorts = classes()
            .that()
            .resideInAnyPackage(CONTEXT_PACKAGES)
            .should(onlyDependOnOwnContextSharedKernelPlatformOrPublishedPorts())
            .because("上下文之间不得直接依赖：跨上下文只经目标上下文的已发布出口白名单")
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule interfacesShouldOnlyDependOnOwnApplicationDomainErrorsInterfacesOrSharedKernel = classes()
            .that()
            .resideInAnyPackage(CONTEXT_INTERFACES_PACKAGES)
            .should(onlyDependOnOwnApplicationDomainErrorsInterfacesOrSharedKernel())
            .because("interfaces 层只做协议转换：可依赖本上下文 application、本上下文 domain.error、"
                    + "本上下文 interfaces 同层与 shared 内核；不得向上依赖本上下文的 domain.model /"
                    + " domain.service / domain.repository / infrastructure，也不得直接依赖其它上下文");

    @ArchTest
    static final ArchRule platformShouldNotDependOnBusinessContexts = noClasses()
            .that()
            .resideInAPackage(ROOT_PACKAGE + "." + PLATFORM + "..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(BUSINESS_CONTEXT_PACKAGES)
            .because("platform 只装跨上下文的技术能力（缓存策略等），不认识任何业务")
            .allowEmptyShould(true);

    private static ArchCondition<JavaClass> onlyDependOnOwnContextSharedKernelPlatformOrPublishedPorts() {
        return new ArchCondition<>("只依赖本上下文、shared 共享内核、platform 技术适配层或白名单内的跨上下文出口") {
            @Override
            public void check(JavaClass origin, ConditionEvents events) {
                String originContext = contextOf(origin);
                if (originContext == null) {
                    return;
                }
                String reason = SHARED_KERNEL.equals(originContext)
                        ? "共享内核不得依赖任何限界上下文或 platform"
                        : "上下文之间只允许依赖白名单内的已发布出口；若这是有意的出口，" + "请把它加入 ArchitectureTest.PUBLISHED_CROSS_CONTEXT_PORTS";
                Set<String> violations = new LinkedHashSet<>();
                for (Dependency dependency : origin.getDirectDependenciesFromSelf()) {
                    JavaClass target = dependency.getTargetClass();
                    if (isAllowedDependency(originContext, target)) {
                        continue;
                    }
                    violations.add(String.format(
                            "类 %s 依赖了 %s（包 %s）：%s",
                            origin.getName(), target.getName(), target.getPackageName(), reason));
                }
                violations.forEach(violation -> events.add(SimpleConditionEvent.violated(origin, violation)));
            }
        };
    }

    private static ArchCondition<JavaClass> onlyDependOnOwnApplicationDomainErrorsInterfacesOrSharedKernel() {
        return new ArchCondition<>("只依赖本上下文 application / domain.error / interfaces 与 shared 内核") {
            @Override
            public void check(JavaClass origin, ConditionEvents events) {
                String originContext = contextOf(origin);
                if (originContext == null) {
                    return;
                }
                String reason = "interfaces 不得向上依赖本上下文的 domain.model / domain.service /"
                        + " domain.repository / infrastructure，也不得直接依赖其它上下文";
                Set<String> violations = new LinkedHashSet<>();
                for (Dependency dependency : origin.getDirectDependenciesFromSelf()) {
                    JavaClass target = dependency.getTargetClass();
                    if (isAllowedInterfacesDependency(originContext, target)) {
                        continue;
                    }
                    violations.add(String.format(
                            "类 %s 依赖了 %s（包 %s）：%s ｜ 依赖来源：%s",
                            origin.getName(),
                            target.getName(),
                            target.getPackageName(),
                            reason,
                            dependency.getDescription()));
                }
                violations.forEach(violation -> events.add(SimpleConditionEvent.violated(origin, violation)));
            }
        };
    }

    /** interfaces 类允许的依赖：ROOT 之外的 JDK / 框架、shared 内核、本上下文的 application / domain.error / interfaces。 */
    private static boolean isAllowedInterfacesDependency(String originContext, JavaClass target) {
        String targetTopLevelPackage = topLevelPackageOf(target);
        if (targetTopLevelPackage == null || SHARED_KERNEL.equals(targetTopLevelPackage)) {
            return true;
        }
        if (!targetTopLevelPackage.equals(originContext)) {
            return false;
        }
        String contextPackage = ROOT_PACKAGE + "." + originContext;
        return isInPackage(target, contextPackage + ".application")
                || isInPackage(target, contextPackage + ".domain.error")
                || isInPackage(target, contextPackage + ".interfaces");
    }

    /**
     * 上下文类允许的依赖：ROOT 之外的 JDK / 框架、本上下文；非 shared 上下文另可依赖 shared 内核、
     * platform 与白名单内的跨上下文出口；shared 内核自身不得依赖任何上下文或 platform。
     */
    private static boolean isAllowedDependency(String originContext, JavaClass target) {
        String targetTopLevelPackage = topLevelPackageOf(target);
        if (targetTopLevelPackage == null || targetTopLevelPackage.equals(originContext)) {
            return true;
        }
        if (SHARED_KERNEL.equals(originContext)) {
            return false;
        }
        return targetTopLevelPackage.equals(SHARED_KERNEL)
                || targetTopLevelPackage.equals(PLATFORM)
                || (CONTEXTS.contains(targetTopLevelPackage) && isPublishedCrossContextPort(target));
    }

    /** 限界上下文的顶层包名（ROOT_PACKAGE 之外的类返回 {@code null}） */
    private static String topLevelPackageOf(JavaClass javaClass) {
        String packageName = javaClass.getPackageName();
        if (!packageName.startsWith(ROOT_PACKAGE + ".")) {
            return null;
        }
        String remainder = packageName.substring(ROOT_PACKAGE.length() + 1);
        int firstDot = remainder.indexOf('.');
        return firstDot < 0 ? remainder : remainder.substring(0, firstDot);
    }

    /** 类所属的限界上下文；不在已知上下文内返回 {@code null} */
    private static String contextOf(JavaClass javaClass) {
        String topLevelPackage = topLevelPackageOf(javaClass);
        return CONTEXTS.contains(topLevelPackage) ? topLevelPackage : null;
    }

    /**
     * 目标类是否为白名单内的已发布出口（或其嵌套类型）。ArchUnit 对嵌套类返回
     * {@code Outer$Inner}，因此只按 {@code $} 判定。
     */
    private static boolean isPublishedCrossContextPort(JavaClass target) {
        return PUBLISHED_CROSS_CONTEXT_PORTS.stream()
                .anyMatch(published ->
                        target.getName().equals(published) || target.getName().startsWith(published + "$"));
    }

    /** 目标类是否位于指定包或其子包 */
    private static boolean isInPackage(JavaClass javaClass, String packageName) {
        String actualPackage = javaClass.getPackageName();
        return actualPackage.equals(packageName) || actualPackage.startsWith(packageName + ".");
    }
}
