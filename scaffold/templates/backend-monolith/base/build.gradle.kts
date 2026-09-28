import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element

plugins {
    java
    jacoco
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.spotless)
}

group = "{{package}}"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(libs.versions.java.get().toInt())
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation(platform(libs.spring.boot.dependencies))

    implementation(libs.spring.boot.starter.web)
    implementation(libs.spring.boot.starter.actuator)
    implementation(libs.spring.boot.starter.cache)
    // API 文档站：springdoc 生成 OAS 3.1，knife4j starter 只提供 UI 与服务端增强。
    // knife4j 4.4.0 传递的 springdoc 2.x 与 Boot 4 冲突，必须 exclude 后自引 Boot 4 专用线
    implementation(libs.springdoc.openapi.starter.webmvc.ui)
    implementation(libs.knife4j.openapi3.jakarta.spring.boot.starter) {
        exclude(group = "org.springdoc")
    }

    //?if db == "mongodb"
    implementation(libs.spring.boot.starter.data.mongodb)
    //?endif
    //?if db == "postgres" or db == "mysql"
    implementation(libs.spring.boot.starter.data.jpa)
    implementation(libs.spring.boot.starter.flyway)
    //?if db == "postgres"
    runtimeOnly(libs.postgresql)
    runtimeOnly(libs.flyway.database.postgresql)
    //?endif
    //?if db == "mysql"
    runtimeOnly(libs.mysql.connector.j)
    runtimeOnly(libs.flyway.mysql)
    //?endif
    // 测试用内存库：JPA 底座的测试 profile 用它，免去外部数据库
    testRuntimeOnly(libs.h2)
    //?endif
    //?if cache == "caffeine"
    implementation(libs.caffeine)
    //?endif
    //?if cache == "redis"
    implementation(libs.spring.boot.starter.data.redis)
    //?endif

    testImplementation(libs.spring.boot.starter.test)
    testImplementation(libs.archunit.junit5)
}

tasks.withType<JavaCompile>().configureEach {
    // 源码与配置含中文注释，固定 UTF-8，避免平台默认编码漂移
    options.encoding = "UTF-8"
    // 保留方法参数名：Spring 的 @PathVariable / @RequestParam 与 SpEL 的 #参数名 都依赖它
    options.compilerArgs.add("-parameters")
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform {
        // 集成测试（@Tag("integration")）需要真实数据库容器，由 scripts/dev-it.sh 用 podman 起；
        // 默认排除它们，保证 ./gradlew test 与 ./gradlew build 不依赖任何外部依赖。
        if (!providers.gradleProperty("includeIntegration").isPresent) {
            excludeTags("integration")
        }
    }
    testLogging {
        events("failed")
    }
}

// ── 代码格式化（Spotless）────────────────────────────────
// 只格式化「相对 HEAD 有改动」的文件（含新增未跟踪文件）：已提交的文件不再进入检查范围，
// 因此不会对既有代码做无差别重排。
//
// ⚠️ ratchet 需要能解析 HEAD：不在 git 仓库内会报 "Cannot find git repository in any parent
//    directory"，git 仓库尚无提交时会报 "No such reference 'HEAD'"，两种都是构建硬失败。
//    因此这里先探测 HEAD 是否存在：探测不到就不启用 ratchet，退化为全量检查 —— 底座源码本身
//    是格式化干净的，所以首次提交前 ./gradlew build 同样能通过。
val gitHeadExists: Boolean = runCatching {
    providers.exec {
        commandLine("git", "rev-parse", "--verify", "--quiet", "HEAD")
        isIgnoreExitValue = true
    }.result.get().exitValue == 0
}.getOrDefault(false)

spotless {
    if (gitHeadExists) {
        ratchetFrom("HEAD")
    }

    java {
        target("src/*/java/**/*.java")
        palantirJavaFormat()
        // 固定 import 分组（java → javax/jakarta → org → 其它第三方 → 本项目）：
        // 不固定的话，palantir 按字母序排，本项目包名会插进第三方中间，格式随包名变化，
        // 模板就无法预先格式化干净。未匹配任何前缀的 import（本项目自己的类）落在最后一组。
        importOrder("java", "javax", "jakarta", "org", "com.tngtech")
        removeUnusedImports()
        trimTrailingWhitespace()
        endWithNewline()
    }

    format("misc") {
        target(
            "*.md", "docs/**/*.md", "*.yml", "*.yaml", "*.toml", "*.sql", "*.kts", "*.sh",
            "**/*.sh", ".env.example", ".gitignore", ".editorconfig")
        targetExclude("build/**")
        trimTrailingWhitespace()
        endWithNewline()
    }
}

// Boot 插件默认与 bootJar 并存产出 -plain.jar；容器构建用 build/libs/*.jar 复制时会多源失效
tasks.named<Jar>("jar") { enabled = false }

// ── 覆盖率与 CRAP 质量门禁 ────────────────────────────────
// 覆盖率由 JaCoCo 采集并落成 XML / HTML 报告；CRAP 分数由下面的 crapReport 任务从 XML 现算：
//     CRAP(m) = comp(m)^2 × (1 - cov(m))^3 + comp(m)
// comp 是方法的圈复杂度（JaCoCo 的 COMPLEXITY 计数器，missed + covered），cov 是方法的行覆盖率。
// 圈复杂度越高、越缺测试，分数上升越快：comp=6 且零覆盖就有 42 分，正是该指标要暴露的风险。
// 阈值来自 gradle.properties，命令行可用 -P 覆盖：./gradlew build -PcrapMax=50
val coverageLineMin = providers.gradleProperty("coverageLineMin").getOrElse("0.65")
val coverageBranchMin = providers.gradleProperty("coverageBranchMin").getOrElse("0.65")
val crapMaxScore = providers.gradleProperty("crapMax").getOrElse("30")

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports {
        // XML 是 CRAP 的计算输入；HTML 供人阅读（build/reports/jacoco/test/html/index.html）
        xml.required = true
        html.required = true
        csv.required = false
    }
}

// 覆盖率下限：低于阈值即让 build 失败。口径是整个 bundle（main 的全部类）的覆盖比值。
tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.test)
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = coverageLineMin.toBigDecimal()
            }
            limit {
                counter = "BRANCH"
                value = "COVEREDRATIO"
                minimum = coverageBranchMin.toBigDecimal()
            }
        }
    }
}

/** 一个方法的 CRAP 记录：method 是「全限定类名.方法名」，coverage 是行覆盖率（0~1）。 */
data class CrapRow(val method: String, val complexity: Int, val coverage: Double, val score: Double)

/** CRAP 公式：复杂度平方 × 未覆盖比例的三次方 + 复杂度。 */
fun crapScore(complexity: Int, coverage: Double): Double {
    val uncovered = 1.0 - coverage
    return complexity.toDouble() * complexity * uncovered * uncovered * uncovered + complexity
}

/** 读 JaCoCo XML，逐方法算 CRAP，按分数降序返回。无行可覆盖的方法（抽象方法等）按全覆盖计。 */
fun readCrapRows(xml: File): List<CrapRow> {
    if (!xml.isFile) {
        throw GradleException("找不到 JaCoCo 报告 ${xml.path}；先跑 ./gradlew jacocoTestReport")
    }
    // JaCoCo 的 XML 带 DOCTYPE（外部 DTD）：必须关掉外部实体加载，否则解析器会去磁盘找 report.dtd 并失败
    val factory = DocumentBuilderFactory.newInstance().apply {
        setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false)
        setFeature("http://xml.org/sax/features/external-general-entities", false)
        setFeature("http://xml.org/sax/features/external-parameter-entities", false)
    }
    val document = factory.newDocumentBuilder().parse(xml)
    val classes = document.getElementsByTagName("class")
    val rows = mutableListOf<CrapRow>()
    for (i in 0 until classes.length) {
        val owner = classes.item(i) as Element
        val className = owner.getAttribute("name").replace('/', '.')
        val methods = owner.getElementsByTagName("method")
        for (j in 0 until methods.length) {
            val method = methods.item(j) as Element
            var complexity = 0
            var uncoveredLines = 0
            var coveredLines = 0
            val counters = method.getElementsByTagName("counter")
            for (k in 0 until counters.length) {
                val counter = counters.item(k) as Element
                when (counter.getAttribute("type")) {
                    "COMPLEXITY" -> complexity = counter.getAttribute("missed").toInt() + counter.getAttribute("covered").toInt()
                    "LINE" -> {
                        uncoveredLines = counter.getAttribute("missed").toInt()
                        coveredLines = counter.getAttribute("covered").toInt()
                    }
                }
            }
            val lines = uncoveredLines + coveredLines
            val coverage = if (lines == 0) 1.0 else coveredLines.toDouble() / lines
            val name = "${className}.${method.getAttribute("name")}"
            rows += CrapRow(name, complexity, coverage, crapScore(complexity, coverage))
        }
    }
    return rows.sortedByDescending { it.score }
}

val crapXmlReport = layout.buildDirectory.file("reports/jacoco/test/jacocoTestReport.xml")
val crapTextReport = layout.buildDirectory.file("reports/crap/crap.txt")

/** 生成 CRAP 报告文件并在控制台列出分数最高的方法（只报告，不判定）。 */
val crapReport by tasks.registering {
    group = "verification"
    description = "从 JaCoCo 报告计算逐方法 CRAP 分数并写出 build/reports/crap/crap.txt"
    dependsOn(tasks.jacocoTestReport)
    val xml = crapXmlReport
    val target = crapTextReport
    val threshold = crapMaxScore
    doLast {
        val rows = readCrapRows(xml.get().asFile)
        val content = buildString {
            appendLine("CRAP 报告 —— CRAP(m) = comp(m)^2 × (1 - cov(m))^3 + comp(m)")
            appendLine("阈值 crapMax = $threshold；方法总数 ${rows.size}；按 CRAP 降序")
            appendLine()
            appendLine("CRAP    复杂度  行覆盖   方法")
            rows.forEach {
                appendLine("%8.1f %6d %7.1f%%   %s".format(it.score, it.complexity, it.coverage * 100, it.method))
            }
        }
        target.get().asFile.apply { parentFile.mkdirs() }.writeText(content)
        println("CRAP 报告已写入 ${target.get().asFile}")
        println("分数最高的方法（阈值 crapMax = $threshold）：")
        rows.take(10).forEach {
            println("  %8.1f  复杂度 %-3d 行覆盖 %5.1f%%  %s".format(it.score, it.complexity, it.coverage * 100, it.method))
        }
    }
}

/** CRAP 门禁：任一方法分数超过 crapMax 即失败，并列出越界方法与调阈值的办法。 */
val crapCheck by tasks.registering {
    group = "verification"
    description = "CRAP 门禁：任一方法分数超过 crapMax 即失败"
    dependsOn(crapReport)
    val xml = crapXmlReport
    val threshold = crapMaxScore
    doLast {
        val rows = readCrapRows(xml.get().asFile)
        val overLimit = rows.filter { it.score > threshold.toDouble() }
        if (overLimit.isNotEmpty()) {
            val detail = overLimit.joinToString("\n") {
                "  %8.1f  复杂度 %-3d 行覆盖 %5.1f%%  %s".format(it.score, it.complexity, it.coverage * 100, it.method)
            }
            throw GradleException(
                "CRAP 门禁未通过：${overLimit.size} 个方法超过 crapMax=$threshold\n$detail\n" +
                    "修法：为这些方法补单元测试（提高行覆盖），或拆小圈复杂度；" +
                    "确需放宽时用 -PcrapMax=<新阈值>，并同步改 gradle.properties"
            )
        }
        println("CRAP 门禁通过：最高 ${rows.firstOrNull()?.let { "%.1f".format(it.score) } ?: "0.0"}（阈值 $threshold，共 ${rows.size} 个方法）")
    }
}

// 覆盖率下限与 CRAP 门禁都挂在 check 上，因此 ./gradlew build 会强制它们。
tasks.named("check") {
    dependsOn(tasks.jacocoTestCoverageVerification, crapCheck)
}
