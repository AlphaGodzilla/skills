#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["PyYAML>=6.0"]
# ///
"""复用 OMF 校验器，并检查源码逆向的文件范围、证据、追溯与覆盖清单。"""

import argparse
import hashlib
import importlib.util
from pathlib import Path, PurePosixPath
import re
import sys

sys.dont_write_bytecode = True
import yaml


PROFILE = "omf-v6-as-is"
MANDATORY_MODELS = {"m1", "m2", "m3", "me", "m4", "m5", "m6", "m7", "mm", "mi"}
MODEL_TYPES = {
    "m1": "OBJECT", "m2": "BEHAVIOR", "m3": "RULE", "me": "EVENT", "m4": "SCENARIO",
    "m5": "ACTOR", "m6": "FLOW", "m7": "REPORT", "mu": "UI", "mm": "MAPPING", "mi": "INTERFACE",
}

STANDARD_DOCUMENTS = ("README.md", "CHANGELOG.md") + tuple(
    f"intake/{name}.md" for name in (
        "scope", "glossary", "ddd-extraction", "object-cards", "scenario-list",
        "actor-permission", "flow-catalog", "open-questions",
    )
)
REVERSE_DOCUMENTS = ("intake/repository-map.md", "intake/extraction-map.md")
SOURCE_KINDS = {"IMPLEMENTATION", "DECLARATION", "TEST", "DOCUMENT"}
GAP_KINDS = {"UNKNOWN", "CONFLICT", "OMF_DEVIATION", "UNREPRESENTABLE", "SOURCE_UNAVAILABLE"}
COVERAGE_KINDS = {"ENTRY", "OBJECT", "RULE", "EVENT", "SECURITY", "WORKFLOW", "QUERY", "PERSISTENCE", "UI", "TECHNICAL"}
DENIED_PARTS = {
    ".git", ".ssh", ".aws", ".gnupg", ".kube", ".docker", ".npm", ".m2",
    "secrets", "credentials", "keychains", "cookies",
}
DENIED_NAMES = {".gitconfig", ".npmrc", ".netrc", ".pgpass", "auth.json", "id_rsa", "id_ed25519"}
DENIED_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".db", ".sqlite", ".sqlite3"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def nonempty_text(value, label):
    require(isinstance(value, str) and bool(value.strip()), f"{label} 必须为非空字符串")


def records(value, label):
    require(isinstance(value, list), f"{label} 必须为列表")
    require(all(isinstance(item, dict) for item in value), f"{label} 的每项必须为映射")
    return value


def unique_records(value, label):
    result = {}
    for item in records(value, label):
        ident = item.get("id")
        nonempty_text(ident, f"{label}.id")
        require(ident not in result, f"{label} 有重复 ID: {ident}")
        result[ident] = item
    return result


def relative_path(value):
    nonempty_text(value, "相对路径")
    require("\\" not in value and ":" not in value, "路径必须使用仓库相对的 POSIX 格式")
    parts = value.split("/")
    require(value == "." or all(part not in {"", ".", ".."} for part in parts), "路径含空段或越界段")
    path = PurePosixPath(value)
    require(not path.is_absolute(), "禁止绝对路径")
    lowered = {part.lower() for part in path.parts}
    name = path.name.lower()
    require(not (lowered & DENIED_PARTS), "禁止访问隐私或凭证目录")
    require(name not in DENIED_NAMES, "禁止访问凭证文件")
    require(not name.startswith((".env", "secrets.", "credentials.")), "禁止访问环境或凭证文件")
    require(path.suffix.lower() not in DENIED_SUFFIXES, "禁止访问密钥或数据库数据文件")
    return path


def safe_path(root, value):
    relative = relative_path(value)
    current = root
    for part in relative.parts:
        current = current / part
        require(not current.is_symlink(), "禁止跟随符号链接")
    require(current.resolve().is_relative_to(root), "路径越出仓库")
    return current


class UniqueKeyLoader(yaml.SafeLoader):
    """拒绝重复 YAML 键，避免证据或模型字段被静默覆盖。"""


def unique_mapping(loader, node):
    loader.flatten_mapping(node)
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=True)
        require(key not in result, "YAML 含重复键")
        result[key] = loader.construct_object(value_node, deep=True)
    return result


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def read_mapping(path):
    doc = yaml.load(path.read_text(encoding="utf-8"), Loader=UniqueKeyLoader)
    require(isinstance(doc, dict), f"{path.name} 必须为 YAML 映射")
    return doc


def load_validator(path):
    require(path.is_file(), "缺少 ontology-modeling 的可信校验脚本")
    spec = importlib.util.spec_from_file_location("omf_shared_validator", path)
    require(spec is not None and spec.loader is not None, "无法加载可信校验脚本")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for name in ("MODEL_FILES", "ROOTS", "main"):
        require(hasattr(module, name), f"共享校验器缺少 {name}，请确认依赖版本")
    return module


def pointer_value(doc, pointer):
    nonempty_text(pointer, "JSON Pointer")
    require(pointer.startswith("/"), "JSON Pointer 必须以 / 开头")
    node = doc
    for encoded in pointer[1:].split("/"):
        require(re.search(r"~(?![01])", encoded) is None, "JSON Pointer 转义非法")
        token = encoded.replace("~1", "/").replace("~0", "~")
        if isinstance(node, list):
            require(re.fullmatch(r"0|[1-9][0-9]*", token) is not None, "列表 Pointer 索引非法")
            index = int(token)
            require(index < len(node), "JSON Pointer 列表索引不存在")
            node = node[index]
        else:
            require(isinstance(node, dict) and token in node, "JSON Pointer 字段不存在")
            node = node[token]
    return node


def source_refs(value, sources, label):
    require(isinstance(value, list) and bool(value), f"{label} 必须有源码证据 ID")
    require(all(isinstance(ref, str) for ref in value), f"{label} 必须为字符串列表")
    require(len(value) == len(set(value)), f"{label} 证据重复")
    require(all(ref in sources for ref in value), f"{label} 引用了不存在的证据")
    return value


def check_reverse(repo, model_root, validator):
    require(repo.is_dir(), "代码库目录不存在")
    require(model_root.is_relative_to(repo), "模型目录必须位于已授权代码库内")
    model_relative = model_root.relative_to(repo).as_posix()
    require(safe_path(repo, model_relative) == model_root, "模型目录不安全")
    for filename in STANDARD_DOCUMENTS + REVERSE_DOCUMENTS:
        path = safe_path(repo, f"{model_relative}/{filename}")
        require(path.is_file(), f"缺少兼容交付文档: {filename}")
        nonempty_text(path.read_text(encoding="utf-8"), f"{filename} 正文")
    reviews = safe_path(repo, f"{model_relative}/reviews")
    require(reviews.is_dir(), "缺少兼容评审目录: reviews/")
    diagrams = safe_path(repo, f"{model_relative}/diagrams")
    require(not diagrams.exists() or diagrams.is_dir(), "diagrams/ 必须为目录（可选）")
    manifest_path = safe_path(repo, f"{model_relative}/intake/reverse-manifest.yaml")
    manifest = read_mapping(manifest_path)
    require(manifest.get("profile") == PROFILE, "逆向 profile 不匹配")
    include_mu = manifest.get("include_mu")
    require(type(include_mu) is bool, "include_mu 必须显式为布尔值")
    expected = MANDATORY_MODELS | ({"mu"} if include_mu else set())

    roots = manifest.get("source_roots")
    require(isinstance(roots, list) and bool(roots), "必须声明已授权的 source_roots")
    root_paths = [safe_path(repo, value) for value in roots]
    require(all(path.is_dir() for path in root_paths), "source_roots 中有不存在的目录")
    sources = unique_records(manifest.get("sources"), "sources")
    paths = {}
    for ident, source in sources.items():
        path = safe_path(repo, source.get("path"))
        require(any(path.is_relative_to(root) for root in root_paths), f"{ident} 不在授权源码范围内")
        require(not path.is_relative_to(model_root), "禁止用生成模型作为源码证据")
        require(path.is_file(), f"{ident} 的源码文件不存在")
        require(source.get("kind") in SOURCE_KINDS, f"{ident} 的证据类型非法")
        nonempty_text(source.get("symbol"), f"{ident}.symbol")
        require(re.fullmatch(r"[0-9a-f]{64}", str(source.get("sha256"))) is not None, f"{ident}.sha256 非法")
        start, end = source.get("start_line"), source.get("end_line")
        require(type(start) is int and type(end) is int and 1 <= start <= end, f"{ident} 行范围非法")
        paths[ident] = path

    # 全部路径通过检查后才读取源码，不打印源码正文。
    snapshots = {}
    for ident, source in sources.items():
        path = paths[ident]
        if path not in snapshots:
            content = path.read_bytes()
            snapshots[path] = (hashlib.sha256(content).hexdigest(), len(content.decode("utf-8").splitlines()))
        digest, line_count = snapshots[path]
        require(source["sha256"] == digest, f"{ident} 的源码已变化，必须重新取证")
        require(source["end_line"] <= line_count, f"{ident} 行范围超出源码")

    docs = {}
    for model in sorted(expected):
        filename = validator.MODEL_FILES[model][0]
        path = safe_path(repo, f"{model_relative}/yaml/{filename}")
        require(path.is_file(), f"缺少逆向交付必需文件: {filename}")
        docs[model] = read_mapping(path)
        for field in ("model_type", "version", "domain"):
            nonempty_text(docs[model].get(field), f"{filename}.{field}")
        require(docs[model]["model_type"] == MODEL_TYPES[model], f"{filename}.model_type 不匹配")
        for collection in validator.ROOTS[model]:
            records(docs[model].get(collection), f"{filename}.{collection}")
    if not include_mu:
        mu_file = safe_path(repo, f"{model_relative}/yaml/{validator.MODEL_FILES['mu'][0]}")
        require(not mu_file.exists(), "include_mu=false，但目录内存在 MU；请确认范围，禁止静默忽略")

    gaps = unique_records(manifest.get("gaps"), "gaps")
    for ident, gap in gaps.items():
        require(gap.get("kind") in GAP_KINDS, f"{ident}.kind 非法")
        require(gap.get("status") in {"OPEN", "RESOLVED"}, f"{ident}.status 非法")
        nonempty_text(gap.get("detail"), f"{ident}.detail")
        affected = gap.get("models")
        require(isinstance(affected, list) and bool(affected), f"{ident}.models 必须为非空列表")
        require(all(model in expected for model in affected), f"{ident}.models 超出交付范围")
        source_refs(gap.get("source_ids"), sources, f"{ident}.source_ids")
        field = "question" if gap["status"] == "OPEN" else "resolution"
        nonempty_text(gap.get(field), f"{ident}.{field}")

    traces = {}
    for trace in records(manifest.get("traces"), "traces"):
        model, pointer = trace.get("model"), trace.get("pointer")
        require(isinstance(model, str) and model in expected, "追溯引用了范围外模型")
        pointer_value(docs[model], pointer)
        key = (model, pointer)
        require(key not in traces, "重复的模型追溯 Pointer")
        refs = source_refs(trace.get("source_ids"), sources, "trace.source_ids")
        require(any(sources[ref]["kind"] in {"IMPLEMENTATION", "DECLARATION"} for ref in refs), "测试或文档不能是现状模型的唯一证据")
        nonempty_text(trace.get("note"), "trace.note")
        traces[key] = trace
    for model, doc in docs.items():
        for collection in validator.ROOTS[model]:
            for index in range(len(doc[collection])):
                require((model, f"/{collection}/{index}") in traces, f"{model}.{collection}[{index}] 缺少元素级源码追溯")

    statuses = manifest.get("model_status")
    require(isinstance(statuses, dict) and set(statuses) == expected, "model_status 必须覆盖且仅覆盖交付模型")
    for model, status in statuses.items():
        require(isinstance(status, dict), f"{model} 状态必须为映射")
        state = status.get("status")
        require(state in {"PRESENT", "ABSENT", "PARTIAL"}, f"{model} 状态非法")
        nonempty_text(status.get("reason"), f"{model}.reason")
        unavailable = {
            ident for ident, gap in gaps.items()
            if gap["status"] == "OPEN" and gap["kind"] == "SOURCE_UNAVAILABLE" and model in gap["models"]
        }
        require(not unavailable or state == "PARTIAL", f"{model} 有开放 SOURCE_UNAVAILABLE，必须标为 PARTIAL")
        size = sum(len(docs[model][key]) for key in validator.ROOTS[model])
        if state == "PRESENT":
            require(size > 0, f"{model} 为 PRESENT，但无模型元素")
        if state == "ABSENT":
            require(size == 0, f"{model} 为 ABSENT，但含模型元素")
            checks = records(status.get("absence_checks"), f"{model}.absence_checks")
            require(bool(checks), f"{model} 缺少不存在判据")
            for check in checks:
                checked = safe_path(repo, check.get("path"))
                require(checked.exists(), "不存在判据中的搜索范围不存在")
                require(any(checked.is_relative_to(root) for root in root_paths), "不存在判据超出授权源码范围")
                nonempty_text(check.get("query"), "absence_check.query")
                nonempty_text(check.get("result"), "absence_check.result")
        if state == "PARTIAL":
            refs = status.get("gap_ids")
            require(isinstance(refs, list) and bool(refs), f"{model} PARTIAL 必须指向缺口")
            require(all(ref in gaps and gaps[ref]["status"] == "OPEN" and model in gaps[ref]["models"] for ref in refs), f"{model} PARTIAL 缺口引用非法")
            require(unavailable.issubset(refs), f"{model} PARTIAL 未引用全部开放 SOURCE_UNAVAILABLE 缺口")

    coverage = unique_records(manifest.get("coverage"), "coverage")
    require(bool(coverage), "coverage 不能为空")
    covered_traces, covered_gaps = set(), set()
    for ident, entry in coverage.items():
        require(entry.get("kind") in COVERAGE_KINDS, f"{ident}.kind 非法")
        source_refs(entry.get("source_ids"), sources, f"{ident}.source_ids")
        disposition = entry.get("disposition")
        require(disposition in {"MODELED", "GAP", "EXCLUDED"}, f"{ident}.disposition 非法")
        refs = records(entry.get("model_refs", []), f"{ident}.model_refs")
        for ref in refs:
            key = (ref.get("model"), ref.get("pointer"))
            require(key in traces, f"{ident} 引用了没有追溯的模型位置")
            covered_traces.add(key)
        gap_refs = entry.get("gap_ids", [])
        require(isinstance(gap_refs, list) and all(ref in gaps for ref in gap_refs), f"{ident} 的缺口引用非法")
        covered_gaps.update(gap_refs)
        if disposition == "MODELED":
            require(bool(refs), f"{ident} MODELED 没有模型引用")
        else:
            nonempty_text(entry.get("reason"), f"{ident}.reason")
        if disposition == "GAP":
            require(bool(gap_refs), f"{ident} GAP 没有缺口引用")
        if disposition == "EXCLUDED":
            require(not refs and not gap_refs, f"{ident} EXCLUDED 不得同时声明模型或缺口")
    require(set(traces) <= covered_traces, "有模型追溯未进入覆盖清单")
    require(set(gaps) <= covered_gaps, "有缺口未进入覆盖清单")
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path, help="已授权的代码库根目录")
    parser.add_argument("--dir", default="docs/model", help="相对于代码库的模型目录")
    parser.add_argument("--validator", required=True, type=Path, help="可信 ontology-modeling/scripts/omf_validate.py")
    args = parser.parse_args(argv)
    repo = args.repo.resolve(strict=True)
    model_root = safe_path(repo, args.dir)
    validator = load_validator(args.validator.resolve(strict=True))
    manifest = check_reverse(repo, model_root, validator)
    result = validator.main(["--dir", str(model_root), "--strict"])
    if result:
        return result
    open_gaps = [gap for gap in manifest["gaps"] if gap["status"] == "OPEN"]
    print(f"逆向机械检查通过；源码证据 {len(manifest['sources'])}，追溯位置 {len(manifest['traces'])}，覆盖项 {len(manifest['coverage'])}，未闭环缺口 {len(open_gaps)}")
    print("检查不证明业务语义正确或扫描完整；仍须人工复核提取结果与入口清单。")
    return 3 if open_gaps else 0


if __name__ == "__main__":
    sys.exit(main())
