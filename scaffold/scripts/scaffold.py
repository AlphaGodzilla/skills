#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["PyYAML>=6.0"]
# ///
"""把技术底座模板渲染成一个可直接构建的新项目。

用法（推荐用 uv 隔离环境，不污染全局 Python；uv 会按上面的内联元数据建临时环境）：

    # 后端单体应用
    uv run scripts/scaffold.py --template backend-monolith \
        --name order-service --package com.acme.order \
        --db postgres --cache redis --out /path/to/parent

    # 前端管理后台
    uv run scripts/scaffold.py --template frontend-admin \
        --name admin-web --title "订单后台" --api-target http://localhost:8080 \
        --out /path/to/parent

也可直接用系统 Python 运行：PyYAML 缺失时跳过 YAML 自检，其余功能不受影响。

每个底座在 `templates/<底座名>/template.py` 里声明自己的参数、能力组件、渲染后步骤与下一步提示，
每个底座在 `templates/<底座名>/template.py` 里声明自己的参数、能力组件、后置步骤、下一步提示，
以及**必须出现在模板里的占位符清单 `PLACEHOLDERS`**（渲染前先查，防止模板被上一次的渲染结果覆盖）。
本脚本只做通用工作：条件块求值、占位符替换、产物自检、渲染后处理。

模板约定见 ../references/*.md 与 SKILL.md。
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

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

# 不传 --template 时的底座：保持与只有一个底座时一致的行为
DEFAULT_TEMPLATE = "backend-monolith"

# 指令行：可选注释前缀 + `?if/elif/else/endif`，其余部分是要保留的内容（指令行本身被丢弃）。
# 注释前缀覆盖 // # -- /* * <!--，使模板在多数语言里仍可被当作合法注释阅读；
# 另允许前导与尾随的 markdown 表格竖线（`|?if ...`），用于在表格中间条件化某一行。
DIRECTIVE = re.compile(
    r"^\s*\|?\s*(?:(?://|#|--|/\*|\*|<!--)\s*)?\?(if|elif|else|endif)\b\s*(.*?)\s*(?:\*/|-->)?\s*\|?\s*$"
)
PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")

# 模板目录里不该出现的构建产物与编辑器目录：即使被本地构建污染也一并跳过
IGNORED_DIRECTORIES = {
    # 通用
    ".git",
    ".idea",
    ".vscode",
    ".worktrees",
    ".codegraph",
    ".venv",
    "__pycache__",
    "node_modules",
    # JVM（backend-monolith）
    "bin",
    "build",
    "out",
    "target",
    ".gradle",
    # 前端（frontend-admin）
    "dist",
    "coverage",
    ".umi",
    ".umi-production",
    ".umi-test",
    ".umi-test-production",
    ".turbopack",
    # 变异测试
    "reports",
    ".stryker-tmp",
}
IGNORED_FILES = {".DS_Store"}


ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*m")
CODEGRAPH_INDEXED = re.compile(r"Indexed\s+(\d+)\s+files")
CODEGRAPH_GRAPH = re.compile(r"(\d+)\s+nodes,\s*(\d+)\s+edges")


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


class Helpers:
    """渲染后步骤可用的通用能力，避免每个底座重复实现。"""

    which = staticmethod(shutil.which)
    init_codegraph = staticmethod(init_codegraph)

    @staticmethod
    def run(command: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=False)

    @staticmethod
    def warn(message: str) -> None:
        print(message)


def template_overlay_dirs(template_root: Path) -> list[Path]:
    """模板目录下所有可能参与渲染的目录（`base` 与全部能力组件）。

    占位符检查针对**整棵模板树**而不是本次选中的组合：模板污染是模板本身的问题，
    与这次选了哪个数据/缓存能力无关。
    """
    return [
        directory
        for directory in sorted(template_root.iterdir())
        if directory.is_dir() and directory.name not in IGNORED_DIRECTORIES
    ]


def count_placeholders(overlay_dirs: list[Path], names: set[str]) -> dict[str, int]:
    """统计每个占位符在模板里出现的**总次数**（路径名与文件内容都算）。

    用总次数而不是「涉及多少个文件」：某个文件里只被覆盖一部分同样会体现在差值上，
    因此「一个文件里 7 处 `{{package}}` 被改掉 1 处」也拦得住。
    """
    counts = dict.fromkeys(names, 0)
    for directory in overlay_dirs:
        for source in directory.rglob("*"):
            if source.is_dir() or source.name in IGNORED_FILES:
                continue
            relative = source.relative_to(directory)
            if any(part in IGNORED_DIRECTORIES for part in relative.parts[:-1]):
                continue

            found: list[str] = []
            for part in relative.parts:  # 占位符也可能用在目录名/文件名里（后端的 {{package_path}}）
                found.extend(PLACEHOLDER.findall(part))
            try:
                found.extend(PLACEHOLDER.findall(source.read_text(encoding="utf-8")))
            except (UnicodeDecodeError, OSError):
                pass

            for name in found:
                if name in counts:
                    counts[name] += 1
    return counts


def require_placeholders(template: ModuleType, overlay_dirs: list[Path]) -> None:
    """检查底座声明的占位符还在模板里，且总出现次数不低于声明值。

    这条检查专门拦一类事故：把「渲染后的结果」反向同步回模板目录，占位符被真实值覆盖。
    覆盖之后渲染照样能跑（只是再没有占位符），生成物会带着上一个项目的名字与标题，
    而且要等到下一个人生成时才暴露。声明 PLACEHOLDERS 后，这种污染在生成时立刻报错。
    """
    declared = dict(getattr(template, "PLACEHOLDERS", {}) or {})
    if not declared:
        raise SystemExit("底座没有声明 PLACEHOLDERS（占位符 → 至少出现多少次）")

    counts = count_placeholders(overlay_dirs, set(declared))
    short = {
        name: (counts[name], minimum)
        for name, minimum in declared.items()
        if counts[name] < minimum
    }
    if not short:
        return

    details = "\n".join(
        f"    {{{{{name}}}}}：模板里只出现 {found} 次，声明要求至少 {minimum} 次"
        for name, (found, minimum) in short.items()
    )
    raise SystemExit(
        "模板的占位符不完整：\n"
        f"{details}\n"
        "  八成是模板被「渲染结果」覆盖过（占位符被替换成了真实值）。\n"
        "  修法：把模板里对应位置改回占位符，再用**不同的参数**渲染一次验证；\n"
        "        若确实是有意删掉某处占位符，同步下调 template.py 里 PLACEHOLDERS 的数字。"
    )


def load_template(name: str) -> tuple[Path, ModuleType]:
    """加载底座目录与它的 template.py。"""
    root = TEMPLATES_DIR / name
    if not root.is_dir():
        available = ", ".join(sorted(p.name for p in TEMPLATES_DIR.iterdir() if p.is_dir()))
        raise SystemExit(f"底座不存在：{name}（可选：{available}）")

    module_path = root / "template.py"
    if not module_path.is_file():
        raise SystemExit(f"底座缺少 template.py：{module_path}")

    spec = importlib.util.spec_from_file_location(f"scaffold_template_{name}", module_path)
    if spec is None or spec.loader is None:  # pragma: no cover - 正常文件系统不会走到
        raise SystemExit(f"无法加载底座定义：{module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return root, module


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


def copy_overlay(overlay: Path, target: Path, variables: dict[str, str], written: set[Path]) -> None:
    for source in sorted(overlay.rglob("*")):
        if source.is_dir():
            continue
        relative = source.relative_to(overlay)
        if source.name in IGNORED_FILES or any(
            part in IGNORED_DIRECTORIES for part in relative.parts[:-1]
        ):
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


def block_comment_open_at_end_of(line: str, in_comment: bool) -> bool:
    """扫过一行，返回该行结束时是否仍处于块注释内。

    只认真正的 `/*` … `*/` 配对，不做字符串字面量识别——模板里用不着那么精确，
    而「必须真的在块注释里」这一点足以排掉 markdown 项目符号与 glob。
    """
    index = 0
    while index < len(line):
        if in_comment:
            end = line.find("*/", index)
            if end == -1:
                return True
            in_comment = False
            index = end + 2
        else:
            start = line.find("/*", index)
            if start == -1:
                return False
            in_comment = True
            index = start + 2
    return in_comment


def stray_comment_ends(text: str) -> list[int]:
    """找出「块注释里提前闭合的 */」所在行号。

    块注释里出现 `*/`（例如文档里写 `src/locales/*/menu.ts`）会提前结束注释，
    后面剩下的内容被当成代码——这是一类只在生成后才炸的模板笔误，所以在自检里拦住。

    判定条件：**该行处于块注释内**、以 `*` 开头（`*` 后是空白或行尾）的延续行里出现 `*/`，
    且其后还有非空白内容。「处于块注释内」这个前提是必要的：markdown 的项目符号
    （形如「* 通配符 `*/` 后面还有内容」的项目符号）与 `.gitignore` 的 glob（`**/node_modules`、`*.log`）
    也都以 `*` 开头，但它们不是注释，不该被算进来。
    局限：单行注释（`/* 见 a/*/b.ts */`）不检——无法与「注释后接代码」的正常写法区分，
    强行检会误伤 `int a = 1; /* 说明 */` 这类正常行。
    """
    lines: list[int] = []
    in_comment = False
    for number, line in enumerate(text.split("\n"), start=1):
        stripped = line.strip()
        if (
            in_comment
            and stripped.startswith("*")
            and (len(stripped) == 1 or stripped[1].isspace())
        ):
            index = stripped[1:].find("*/")
            if index != -1 and stripped[1:][index + 2 :].strip():
                lines.append(number)
        in_comment = block_comment_open_at_end_of(line, in_comment)
    return lines

def self_check(project_dir: Path, written: set[Path]) -> list[str]:
    """渲染后自检：占位符残留、YAML / TOML / JSON 是否可解析、块注释是否被提前闭合。
    返回问题清单（空表示通过）。

    这些是模板编写错误，不是用户输入错误：宁可生成时立刻失败，也不要交付一个起不来的项目。
    """
    problems: list[str] = []
    for path in sorted(written):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue  # 非文本文件（理论上不会有，wrapper 在自检之后生成）
        relative = path.relative_to(project_dir)

        leftover = PLACEHOLDER.search(text)
        if leftover:
            problems.append(f"{relative}: 残留占位符 {{{{{leftover.group(1)}}}}}")

        # 块注释里提前出现的 `*/` 会把注释截断，剩下的半截变成代码（例如注释里写 `src/locales/*/menu.ts`）。
        # 这类笔误只在生成后、甚至只在运行时才暴露，所以在自检里拦。
        for number in stray_comment_ends(text):
            problems.append(
                f"{relative}:{number}: 块注释里出现提前闭合的 `*/`（其后还有内容，注释会被截断、剩余内容变成代码）"
            )

        suffix = path.suffix.lower()
        if suffix in {".yml", ".yaml"} and yaml is not None:
            try:
                yaml.safe_load(text)
            except yaml.YAMLError as exc:
                problems.append(f"{relative}: YAML 解析失败：{exc}")
        elif suffix == ".toml" and tomllib is not None:
            try:
                tomllib.loads(text)
            except tomllib.TOMLDecodeError as exc:
                problems.append(f"{relative}: TOML 解析失败：{exc}")
        elif suffix == ".json":
            try:
                json.loads(text)
            except json.JSONDecodeError as exc:
                problems.append(f"{relative}: JSON 解析失败：{exc}")
    return problems


def default_flag(name: str) -> str:
    return "--" + name.replace("_", "-")


def add_param(parser: argparse.ArgumentParser, spec: dict[str, Any]) -> None:
    """模板变量参数：`--<名字>`，可要求必填、限定取值、限定格式。"""
    kwargs: dict[str, Any] = {"help": spec.get("help", "")}
    if spec.get("choices"):
        kwargs["choices"] = spec["choices"]
    kwargs["required"] = bool(spec.get("required"))
    kwargs["default"] = spec.get("default")
    parser.add_argument(spec.get("flag") or default_flag(spec["name"]), **kwargs)


def add_option(parser: argparse.ArgumentParser, spec: dict[str, Any]) -> None:
    """模板专属开关：如 `--skip-codegraph`。"""
    kwargs: dict[str, Any] = {"help": spec.get("help", "")}
    if spec.get("action"):
        kwargs["action"] = spec["action"]
    elif spec.get("choices"):
        kwargs["choices"] = spec["choices"]
    if "default" in spec:
        kwargs["default"] = spec["default"]
    parser.add_argument(spec.get("flag") or default_flag(spec["name"]), **kwargs)


def validate_params(specs: list[dict[str, Any]], options: argparse.Namespace) -> None:
    for spec in specs:
        pattern = spec.get("pattern")
        if not pattern:
            continue
        value = getattr(options, spec["name"])
        if value and not re.fullmatch(pattern, value):
            raise SystemExit(spec.get("pattern_error", "参数不合法：{value}").format(value=value))


def build_parser(template: ModuleType) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=f"从技术底座模板渲染一个新项目（{template.DESCRIPTION}）"
    )
    parser.add_argument(
        "--template", default=DEFAULT_TEMPLATE, help="底座名（templates/ 下的目录名）"
    )
    parser.add_argument("--name", required=True, help="项目名（kebab-case），同时作为目录名")
    parser.add_argument("--out", default=".", help="输出父目录（默认当前目录）")
    for spec in template.PARAMS:
        add_param(parser, spec)
    for spec in template.OPTIONS:
        add_option(parser, spec)
    parser.add_argument("--force", action="store_true", help="目标目录已存在时清空重建")
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = sys.argv[1:] if argv is None else argv

    # --help 之外，先只解析 --template：底座名决定后面要挂哪些参数
    prescan = argparse.ArgumentParser(add_help=False)
    prescan.add_argument("--template", default=DEFAULT_TEMPLATE)
    known, _ = prescan.parse_known_args(arguments)

    template_root, template = load_template(known.template)
    parser = build_parser(template)
    options = parser.parse_args(arguments)
    validate_params(template.PARAMS, options)

    target = Path(options.out).expanduser().resolve() / options.name
    if target.exists():
        if not options.force:
            raise SystemExit(f"目标目录已存在：{target}（加 --force 清空重建）")
        shutil.rmtree(target)

    overlay_dirs = [template_root / name for name in ["base", *template.overlays(options)]]
    for directory in overlay_dirs:
        if not directory.is_dir():
            raise SystemExit(f"模板缺少目录：{directory}")
    # 先查占位符再落盘：模板被渲染结果污染时要立刻失败，而不是产出一个带旧名字的项目。
    # 检查覆盖整棵模板树（含未选中的能力组件），因此数字与本次组合无关。
    require_placeholders(template, template_overlay_dirs(template_root))

    variables = template.variables(options)
    written: set[Path] = set()
    for directory in overlay_dirs:
        copy_overlay(directory, target, variables, written)

    print(f"已生成 {target}（{len(written)} 个文件）：{template.summary(options)}")

    if yaml is None:
        print("提示：当前 Python 无 PyYAML，已跳过 YAML 自检；用 `uv run` 运行可获得完整自检")
    problems = self_check(target, written)
    if problems:
        print("❌ 生成结果自检未通过（模板问题，修模板后重跑）：", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    template.post_generate(target, options, Helpers)

    print("下一步：")
    print(f"  cd {target}")
    for line in template.next_steps(options):
        print(f"  {line}")
    return 0


def run(argv: list[str] | None = None) -> int:
    return main(argv)


if __name__ == "__main__":
    sys.exit(main())
