#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["PyYAML>=6.0"]
# ///
"""把技术底座模板渲染成一个可直接构建的新项目。

用法（推荐用 uv 隔离环境，不污染全局 Python；uv 会按上面的内联元数据建临时环境）：

    uv run scripts/scaffold.py --template backend-monolith \
        --name order-service --package com.acme.order \
        --db postgres --cache redis --out /path/to/parent

也可直接用系统 Python 运行：PyYAML 缺失时跳过 YAML 自检，其余功能不受影响。

渲染之外还会做三件事：自检产物（占位符残留、YAML / TOML 可解析）、生成 Gradle wrapper（本机有 `gradle` 时）、
执行 `codegraph init --yes` 建立代码索引（本机装了 `codegraph` CLI 时；未装则静默跳过，不打印提示）。

模板约定见 ../references/backend-monolith.md 与 SKILL.md。
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

# 自检用的解析器：由 PEP 723 的 dependencies 提供；用系统 Python 直接跑时允许缺席
try:
    import yaml  # type: ignore[import-untyped]
except ImportError:
    yaml = None

try:
    import tomllib  # Python 3.11+
except ImportError:
    tomllib = None

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

# 组件目录名相对模板根目录。底座是唯一的应用模板，数据库与缓存是它的两个可选能力组件；
# postgres 与 mysql 共用 data-jpa 组件，靠变量与条件块区分。
DATA_COMPONENTS = {
    "mongodb": "components/data-mongodb",
    "postgres": "components/data-jpa",
    "mysql": "components/data-jpa",
}
CACHE_COMPONENTS = {"caffeine": "components/cache-caffeine", "redis": "components/cache-redis"}
DB_CHOICES = tuple(DATA_COMPONENTS)
CACHE_CHOICES = tuple(CACHE_COMPONENTS)

# 指令行：可选注释前缀 + `?if/elif/else/endif`，其余部分是要保留的内容（指令行本身被丢弃）。
# 注释前缀覆盖 // # -- /* * <!--，使模板在多数语言里仍可被当作合法注释阅读；
# 另允许前导与尾随的 markdown 表格竖线（`|?if ...`），用于在表格中间条件化某一行。
DIRECTIVE = re.compile(
    r"^\s*\|?\s*(?:(?://|#|--|/\*|\*|<!--)\s*)?\?(if|elif|else|endif)\b\s*(.*?)\s*(?:\*/|-->)?\s*\|?\s*$"
)
PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")


def app_class_of(name: str) -> str:
    """`order-service` → `OrderServiceApplication`。"""
    parts = [p for p in re.split(r"[-_.\s]+", name) if p]
    if not parts:
        raise SystemExit("--name 不能为空")
    return "".join(p[:1].upper() + p[1:] for p in parts) + "Application"


def build_variables(name: str, package: str, db: str, cache: str) -> dict[str, str]:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*", package):
        raise SystemExit(f"--package 不是合法 Java 包名：{package}")
    db_name = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "app"
    variables = {
        "project_name": name,
        "package": package,
        "package_path": package.replace(".", "/"),
        "app_class": app_class_of(name),
        "db": db,
        "cache": cache,
        "db_name": db_name,
        # 关系库的应用账号：postgres 用超级用户 postgres；mysql 不能用 root ——
        # 官方 mysql 镜像明确拒绝 MYSQL_USER=root（entrypoint 直接退出），因此改用普通账号 app
        "db_user": "postgres" if db == "postgres" else ("app" if db == "mysql" else ""),
        "db_password": "postgres" if db == "postgres" else ("app" if db == "mysql" else ""),
    }
    if db == "postgres":
        variables.update(
            {
                "db_platform": "postgresql",
                "jdbc_driver": "org.postgresql.Driver",
                "jdbc_url": f"jdbc:postgresql://localhost:5432/{db_name}",
                "hibernate_dialect": "org.hibernate.dialect.PostgreSQLDialect",
                "db_port": "5432",
            }
        )
    elif db == "mysql":
        variables.update(
            {
                "db_platform": "mysql",
                "jdbc_driver": "com.mysql.cj.jdbc.Driver",
                "jdbc_url": (
                    f"jdbc:mysql://localhost:3306/{db_name}"
                    "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC&characterEncoding=utf8"
                ),
                "hibernate_dialect": "org.hibernate.dialect.MySQLDialect",
                "db_port": "3306",
            }
        )
    else:  # mongodb
        variables.update(
            {
                "db_platform": "",
                "jdbc_driver": "",
                "jdbc_url": "",
                "hibernate_dialect": "",
                "db_port": "27017",
            }
        )
    return variables


def evaluate(expression: str, variables: dict[str, str]) -> bool:
    """条件表达式：只允许 == != in and or not 与变量名，模板由本人维护，用受限 eval 求值。"""
    allowed_names = {"__builtins__": {}}
    try:
        return bool(eval(expression, allowed_names, dict(variables)))  # noqa: S307
    except Exception as exc:  # noqa: BLE001 - 模板写错时要给出可定位的报错
        raise SystemExit(f"条件表达式无法求值：?if {expression} → {exc}") from exc


def substitute(line: str, variables: dict[str, str], where: str) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in variables:
            raise SystemExit(f"{where}：模板变量 {{{{{key}}}}} 未定义")
        return variables[key]

    return PLACEHOLDER.sub(replace, line)


def render_text(text: str, variables: dict[str, str], where: str) -> str:
    """去掉指令行、按条件保留内容、替换占位符。"""
    output: list[str] = []
    stack: list[dict[str, bool]] = []

    def active() -> bool:
        return all(frame["active"] for frame in stack)

    for number, line in enumerate(text.split("\n"), start=1):
        match = DIRECTIVE.match(line)
        if not match:
            if active():
                output.append(substitute(line, variables, f"{where}:{number}"))
            continue

        kind, expression = match.group(1), match.group(2)
        if kind == "if":
            parent = active()
            condition = parent and evaluate(expression, variables)
            stack.append({"parent": parent, "taken": condition, "active": condition})
        elif kind == "elif":
            if not stack:
                raise SystemExit(f"{where}:{number}：?elif 没有对应的 ?if")
            frame = stack[-1]
            condition = frame["parent"] and not frame["taken"] and evaluate(expression, variables)
            frame["active"] = condition
            frame["taken"] = frame["taken"] or condition
        elif kind == "else":
            if not stack:
                raise SystemExit(f"{where}:{number}：?else 没有对应的 ?if")
            frame = stack[-1]
            frame["active"] = frame["parent"] and not frame["taken"]
            frame["taken"] = True
        else:  # endif
            if not stack:
                raise SystemExit(f"{where}:{number}：?endif 没有对应的 ?if")
            stack.pop()

    if stack:
        raise SystemExit(f"{where}：有 ?if 没有闭合（缺 ?endif）")
    return "\n".join(output)


def render_path(relative: Path, variables: dict[str, str], where: str) -> Path:
    parts = [substitute(part, variables, where) for part in relative.parts]
    return Path(*parts)


def component_names(db: str, cache: str) -> list[str]:
    """组装顺序：应用底座 + 数据能力组件 + 缓存能力组件。"""
    return [DATA_COMPONENTS[db], CACHE_COMPONENTS[cache]]


# 模板目录里不该出现的构建产物与编辑器目录：即使被本地构建污染也一并跳过
IGNORED_DIRECTORIES = {
    "bin",
    "build",
    "out",
    ".gradle",
    ".idea",
    ".git",
    ".codegraph",
    ".venv",
    "node_modules",
    "__pycache__",
}
IGNORED_FILES = {".DS_Store"}


def copy_overlay(overlay: Path, target: Path, variables: dict[str, str], written: set[Path]) -> None:
    for source in sorted(overlay.rglob("*")):
        if source.is_dir():
            continue
        relative = source.relative_to(overlay)
        if source.name in IGNORED_FILES or any(part in IGNORED_DIRECTORIES for part in relative.parts[:-1]):
            continue
        try:
            text = source.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            print(f"⚠️  跳过非文本模板文件：{source}")
            continue
        destination = target / render_path(relative, variables, str(source))
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(render_text(text, variables, str(source)), encoding="utf-8")
        # 可执行文件必须保留可执行位：gradlew 与仓库里的 shell 脚本
        if destination.name == "gradlew" or destination.suffix == ".sh":
            destination.chmod(0o755)
        written.add(destination)


CODEGRAPH_INDEXED = re.compile(r"Indexed\s+(\d+)\s+files")
CODEGRAPH_GRAPH = re.compile(r"(\d+)\s+nodes,\s*(\d+)\s+edges")
ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*m")


def init_codegraph(project_dir: Path) -> None:
    """为项目建立 CodeGraph 索引（`codegraph init --yes <项目>`）。

    未安装 codegraph CLI 时**静默跳过**：不执行、不打印任何提示。
    已安装但执行失败时只警告，不阻断——项目本身已经生成好了。
    `--yes` 让工具跳过所有交互，适合脚本；重复执行是幂等的（工具会报 Already initialized）。
    """
    executable = shutil.which("codegraph")
    if executable is None:
        return

    result = subprocess.run(
        [executable, "init", "--yes", str(project_dir)],
        capture_output=True,
        text=True,
        check=False,
    )
    output = ANSI_ESCAPE.sub("", f"{result.stdout}\n{result.stderr}").strip()

    if result.returncode != 0:
        print(f"⚠️  codegraph init 失败（退出码 {result.returncode}，不影响生成结果）：")
        for line in output.splitlines()[-8:]:
            print(f"    {line}")
        print("    可稍后在项目根手动重试：codegraph init -y")
        # 首次索引可能因扫描到超大文件等失败；提示用户后仍按成功交付项目
        return

    if "Already initialized" in output:
        print("CodeGraph 索引已存在（未重建；需要重建用 codegraph index）")
        return

    indexed = CODEGRAPH_INDEXED.search(output)
    graph = CODEGRAPH_GRAPH.search(output)
    if indexed and graph:
        detail = f"（{indexed.group(1)} 个文件 / {graph.group(1)} 节点 / {graph.group(2)} 边）"
    elif indexed:
        detail = f"（{indexed.group(1)} 个文件）"
    else:
        detail = ""
    print(f"已建立 CodeGraph 索引{detail}：{project_dir.name}/.codegraph/")

def generate_wrapper(project_dir: Path, gradle_version: str) -> None:
    gradle = shutil.which("gradle")
    if gradle is None:
        print("⚠️  未找到 gradle，跳过 wrapper 生成；请安装 Gradle 后在项目根执行：gradle wrapper")
        return
    result = subprocess.run(
        [gradle, "wrapper", "--gradle-version", gradle_version, "--no-daemon", "-q"],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print("⚠️  生成 Gradle wrapper 失败，请手动执行 `gradle wrapper`：")
        print(result.stderr.strip())
    else:
        print(f"已生成 Gradle wrapper（{gradle_version}）")



def self_check(project_dir: Path, written: set[Path]) -> list[str]:
    """渲染后自检：占位符残留、YAML / TOML 是否可解析。返回问题清单（空表示通过）。

    这些是模板编写错误，不是用户输入错误：宁可生成时立刻失败，也不要交付一个起不来的项目。
    """
    problems: list[str] = []
    for path in sorted(written):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue  # 非文本文件（理论上不会有，wrapper 在自检之后生成）

        leftover = PLACEHOLDER.search(text)
        if leftover:
            problems.append(f"{path.relative_to(project_dir)}: 残留占位符 {{{{{leftover.group(1)}}}}}")

        suffix = path.suffix.lower()
        if suffix in {".yml", ".yaml"} and yaml is not None:
            try:
                yaml.safe_load(text)
            except yaml.YAMLError as exc:
                problems.append(f"{path.relative_to(project_dir)}: YAML 解析失败：{exc}")
        elif suffix == ".toml" and tomllib is not None:
            try:
                tomllib.loads(text)
            except tomllib.TOMLDecodeError as exc:
                problems.append(f"{path.relative_to(project_dir)}: TOML 解析失败：{exc}")
    return problems

def main() -> int:
    parser = argparse.ArgumentParser(description="从技术底座模板渲染一个新项目")
    parser.add_argument("--template", default="backend-monolith", help="底座名（模板目录名）")
    parser.add_argument("--name", required=True, help="项目名，同时作为 Gradle 根项目名与目录名")
    parser.add_argument("--package", required=True, help="基础 Java 包名，如 com.acme.order")
    parser.add_argument("--db", choices=DB_CHOICES, required=True, help="数据能力组件：mongodb / postgres / mysql")
    parser.add_argument("--cache", choices=CACHE_CHOICES, required=True, help="缓存能力组件：caffeine / redis")
    parser.add_argument("--out", default=".", help="输出父目录（默认当前目录）")
    parser.add_argument("--gradle-version", default="8.14.3", help="生成的 wrapper 版本")
    parser.add_argument("--skip-wrapper", action="store_true", help="不生成 Gradle wrapper")
    parser.add_argument("--skip-codegraph", action="store_true", help="不执行 codegraph init")
    parser.add_argument("--force", action="store_true", help="目标目录已存在时清空重建")
    args = parser.parse_args()

    template_root = TEMPLATES_DIR / args.template
    if not template_root.is_dir():
        raise SystemExit(f"底座不存在：{args.template}（可选：{', '.join(p.name for p in TEMPLATES_DIR.iterdir())}）")

    target = Path(args.out).expanduser().resolve() / args.name
    if target.exists():
        if not args.force:
            raise SystemExit(f"目标目录已存在：{target}（加 --force 清空重建）")
        shutil.rmtree(target)

    variables = build_variables(args.name, args.package, args.db, args.cache)
    written: set[Path] = set()
    for overlay in ["base", *component_names(args.db, args.cache)]:
        directory = template_root / overlay
        if not directory.is_dir():
            raise SystemExit(f"模板缺少目录：{directory}")
        copy_overlay(directory, target, variables, written)

    print(f"已生成 {target}（{len(written)} 个文件）：db={args.db} cache={args.cache}")

    if yaml is None:
        print("提示：当前 Python 无 PyYAML，已跳过 YAML 自检；用 `uv run` 运行可获得完整自检")
    problems = self_check(target, written)
    if problems:
        print("❌ 生成结果自检未通过（模板问题，修模板后重跑）：", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    if not args.skip_wrapper:
        generate_wrapper(target, args.gradle_version)
    if not args.skip_codegraph:
        init_codegraph(target)
    print("下一步：")
    print(f"  cd {target}")
    print("  ./gradlew test        # 单元与契约测试（不需要任何外部依赖）")
    print("  ./gradlew build       # 完整验收：测试 + ArchUnit 架构守护 + 格式检查")
    print("  scripts/dev-it.sh     # 集成测试（podman 起真实数据库，跑完自动删容器）")
    print("  ./gradlew bootRun     # 启动服务")
    return 0


if __name__ == "__main__":
    sys.exit(main())
