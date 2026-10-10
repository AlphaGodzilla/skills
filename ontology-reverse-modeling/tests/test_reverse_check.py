#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["PyYAML>=6.0"]
# ///
"""用 /tmp 内的合成夹具验证逆向机械检查，不提取真实业务语义。"""

import contextlib
import copy
import hashlib
import importlib.util
import io
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
import yaml


SKILL = Path(__file__).resolve().parents[1]
SHARED = SKILL.parent / "ontology-modeling" / "scripts" / "omf_validate.py"
SPEC = importlib.util.spec_from_file_location("reverse_check", SKILL / "scripts" / "omf_reverse_check.py")
REVERSE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REVERSE)
VALIDATOR = REVERSE.load_validator(SHARED)


class ReverseCheckTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="omf-reverse-test-", dir="/tmp")
        self.addCleanup(self.temp.cleanup)
        self.repo = (Path(self.temp.name) / "repo").resolve()
        self.root = self.repo / "docs" / "model"
        self.ydir = self.root / "yaml"
        self.ydir.mkdir(parents=True)
        (self.root / "intake").mkdir()
        self.source = self.repo / "src" / "item.py"
        self.source.parent.mkdir()
        self.source.write_text("class Item:\n    def __init__(self, item_id):\n        self.item_id = item_id\n\ndef query_item(item_id):\n    return {'itemId': item_id}\n", encoding="utf-8")
        self.docs = {}
        for model in sorted(REVERSE.MANDATORY_MODELS):
            self.docs[model] = {
                "model_type": REVERSE.MODEL_TYPES[model], "version": "1.0", "domain": "合成测试域",
                **{root: [] for root in VALIDATOR.ROOTS[model]},
            }
        self.docs["m1"]["aggregates"] = [{"id": "AGG-ITEM-001", "name": "条目", "alias": "Item", "attributes": []}]
        self.docs["m2"]["behaviors"] = [{
            "id": "Item_Query", "name": "查询条目", "ownerEntity": "AGG-ITEM-001",
            "behaviorType": "QUERY", "triggerType": "EXTERNAL", "producedEvents": [],
        }]
        self.docs["mi"]["interfaces"] = [{
            "interfaceId": "INT-001", "name": "合成条目查询契约", "interfaceType": "PROVIDED",
            "interfaceCategory": "QUERY", "relatedBehaviorRef": ["Item_Query"],
            "relatedEntityRef": ["AGG-ITEM-001"], "inputParameters": [], "outputResult": [], "returnRule": [],
        }]
        self.manifest = {
            "profile": REVERSE.PROFILE, "include_mu": False, "source_roots": ["src"],
            "sources": [{
                "id": "EV-001", "path": "src/item.py", "symbol": "Item/query_item",
                "start_line": 1, "end_line": 6, "sha256": hashlib.sha256(self.source.read_bytes()).hexdigest(),
                "kind": "IMPLEMENTATION",
            }],
            "model_status": {}, "traces": [], "coverage": [], "gaps": [],
        }
        for model, doc in self.docs.items():
            present = any(doc[key] for key in VALIDATOR.ROOTS[model])
            self.manifest["model_status"][model] = self.status(present)
            for collection in VALIDATOR.ROOTS[model]:
                for index in range(len(doc[collection])):
                    pointer = f"/{collection}/{index}"
                    self.manifest["traces"].append({"model": model, "pointer": pointer, "source_ids": ["EV-001"], "note": "合成证据引用，只用于机械测试"})
                    self.manifest["coverage"].append({
                        "id": f"COV-{model}-{index}", "kind": "ENTRY", "source_ids": ["EV-001"],
                        "disposition": "MODELED", "model_refs": [{"model": model, "pointer": pointer}],
                    })
        (self.root / "reviews").mkdir()
        for relative in REVERSE.STANDARD_DOCUMENTS + REVERSE.REVERSE_DOCUMENTS:
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(f"# 合成测试文档 {relative}\n", encoding="utf-8")
        self.save()

    def status(self, present):
        result = {"status": "PRESENT" if present else "ABSENT", "reason": "合成夹具状态"}
        if not present:
            result["absence_checks"] = [{"path": "src", "query": "完整合成夹具中无此机制", "result": "无对应实现"}]
        return result

    def save(self):
        for model, doc in self.docs.items():
            (self.ydir / VALIDATOR.MODEL_FILES[model][0]).write_text(yaml.safe_dump(doc, allow_unicode=True), encoding="utf-8")
        self.manifest_path = self.root / "intake" / "reverse-manifest.yaml"
        self.manifest_path.write_text(yaml.safe_dump(self.manifest, allow_unicode=True), encoding="utf-8")

    def check(self):
        self.save()
        return REVERSE.check_reverse(self.repo, self.root, VALIDATOR)

    def run_main(self):
        self.save()
        with contextlib.redirect_stdout(io.StringIO()):
            return REVERSE.main(["--repo", str(self.repo), "--dir", "docs/model", "--validator", str(SHARED)])

    def add_gap(self, status="OPEN", *, kind="UNKNOWN", models=("m2",), ident="GAP-001"):
        gap = {"id": ident, "kind": kind, "status": status, "models": list(models), "source_ids": ["EV-001"], "detail": "合成检查问题"}
        gap["question" if status == "OPEN" else "resolution"] = "合成确认记录"
        self.manifest["gaps"].append(gap)
        self.manifest["coverage"].append({"id": f"COV-{ident}", "kind": "ENTRY", "source_ids": ["EV-001"], "disposition": "GAP", "gap_ids": [ident], "reason": "合成问题"})

    def test_happy_path_without_ui_events_approvals_or_reports(self):
        self.assertEqual(self.run_main(), 0)
        self.assertFalse((self.ydir / "mu-ui-model.yaml").exists())
        self.assertEqual(self.docs["me"]["events"], [])
        self.assertEqual(self.docs["m6"]["flows"], [])

    def test_standard_information_package_is_required(self):
        for relative in REVERSE.STANDARD_DOCUMENTS + REVERSE.REVERSE_DOCUMENTS:
            with self.subTest(path=relative):
                path = self.root / relative
                content = path.read_text(encoding="utf-8")
                path.unlink()
                try:
                    with self.assertRaisesRegex(ValueError, "缺少兼容交付文档"):
                        self.check()
                finally:
                    path.write_text(content, encoding="utf-8")

    def test_blank_standard_document_is_rejected(self):
        (self.root / "intake" / "glossary.md").write_text(" \n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "正文 必须为非空"):
            self.check()

    def test_standard_document_symlink_is_rejected(self):
        outside = self.repo.parent / "outside.md"
        outside.write_text("# 合成外部文档\n", encoding="utf-8")
        path = self.root / "intake" / "glossary.md"
        path.unlink()
        path.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "符号链接"):
            self.check()

    def test_reviews_directory_is_required(self):
        (self.root / "reviews").rmdir()
        with self.assertRaisesRegex(ValueError, "缺少兼容评审目录"):
            self.check()

    def test_diagrams_directory_is_optional(self):
        self.assertFalse((self.root / "diagrams").exists())
        (self.root / "diagrams").mkdir()
        self.assertEqual(self.run_main(), 0)

    def test_diagrams_path_cannot_be_file(self):
        (self.root / "diagrams").write_text("合成错误路径", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "diagrams/ 必须为目录"):
            self.check()

    def test_alternate_root_preserves_compatible_layout(self):
        alternate = self.repo / "docs" / "model-as-is"
        self.root.rename(alternate)
        with contextlib.redirect_stdout(io.StringIO()):
            result = REVERSE.main(["--repo", str(self.repo), "--dir", "docs/model-as-is", "--validator", str(SHARED)])
        self.assertEqual(result, 0)
        self.assertTrue((alternate / "intake" / "ddd-extraction.md").is_file())
        self.assertTrue((alternate / "reviews").is_dir())

    def test_cli_entrypoint(self):
        result = subprocess.run(
            [sys.executable, str(SKILL / "scripts" / "omf_reverse_check.py"),
             "--repo", str(self.repo), "--dir", "docs/model", "--validator", str(SHARED)],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("逆向机械检查通过", result.stdout)
        self.assertIn("不证明业务语义正确", result.stdout)

    def test_opt_in_empty_mu(self):
        self.manifest["include_mu"] = True
        self.docs["mu"] = {"model_type": "UI", "version": "1.0", "domain": "合成测试域", "screens": [], "cross_cutting": []}
        self.manifest["model_status"]["mu"] = self.status(False)
        self.assertEqual(self.run_main(), 0)

    def test_opt_in_mu_must_exist(self):
        self.manifest["include_mu"] = True
        with self.assertRaisesRegex(ValueError, "mu-ui-model"):
            self.check()

    def test_unrequested_mu_not_silently_ignored(self):
        (self.ydir / "mu-ui-model.yaml").write_text("screens: []\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "存在 MU"):
            self.check()

    def test_m7_mm_mi_are_required(self):
        for model in ("m7", "mm", "mi"):
            with self.subTest(model=model):
                self.save()
                (self.ydir / VALIDATOR.MODEL_FILES[model][0]).unlink()
                with self.assertRaisesRegex(ValueError, "缺少逆向交付"):
                    REVERSE.check_reverse(self.repo, self.root, VALIDATOR)

    def test_missing_root_is_error(self):
        del self.docs["m3"]["rules"]
        with self.assertRaisesRegex(ValueError, "rules 必须为列表"):
            self.check()

    def test_null_root_is_error(self):
        self.docs["m3"]["rules"] = None
        with self.assertRaisesRegex(ValueError, "必须为列表"):
            self.check()

    def test_header_type_must_match(self):
        self.docs["mm"]["model_type"] = "OBJECT"
        with self.assertRaisesRegex(ValueError, "model_type 不匹配"):
            self.check()

    def test_stale_source_hash(self):
        self.source.write_text("# changed\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "源码已变化"):
            self.check()

    def test_out_of_range_source_lines(self):
        self.manifest["sources"][0]["end_line"] = 999
        with self.assertRaisesRegex(ValueError, "行范围超出"):
            self.check()

    def test_duplicate_source_id(self):
        self.manifest["sources"].append(copy.deepcopy(self.manifest["sources"][0]))
        with self.assertRaisesRegex(ValueError, "重复 ID"):
            self.check()

    def test_all_unsafe_paths_rejected_before_source_read(self):
        outside = self.repo.parent / "outside.py"
        unsafe = (
            (".env", "环境或凭证文件"), ("src/.env.production", "环境或凭证文件"),
            ("src/id_rsa", "凭证文件"), ("../outside.py", "越界段"),
            (str(outside), "越界段|绝对路径"), ("src/secret.pem", "密钥或数据库数据文件"),
            ("src/credentials/data.json", "隐私或凭证目录"), ("src/a\\b.py", "POSIX 格式"),
        )
        content = b"synthetic non-sensitive fixture\n"
        self.manifest["source_roots"] = ["."]
        original = copy.deepcopy(self.manifest["sources"][0])
        for path, message in unsafe:
            with self.subTest(path=path):
                fixture = self.repo / path
                fixture.parent.mkdir(parents=True, exist_ok=True)
                fixture.write_bytes(content)
                second = copy.deepcopy(original)
                second.update(id="EV-UNSAFE", path=path, symbol="synthetic_fixture", start_line=1, end_line=1,
                              sha256=hashlib.sha256(content).hexdigest())
                self.manifest["sources"] = [original, second]
                self.save()
                with patch.object(Path, "read_bytes", side_effect=AssertionError("不应读取任何源码")):
                    with self.assertRaisesRegex(ValueError, message):
                        REVERSE.check_reverse(self.repo, self.root, VALIDATOR)

    def test_source_symlink_is_rejected(self):
        link = self.source.parent / "link.py"
        link.symlink_to(self.source)
        self.manifest["sources"][0]["path"] = "src/link.py"
        with self.assertRaisesRegex(ValueError, "符号链接"):
            self.check()

    def test_source_outside_declared_roots(self):
        (self.repo / "other").mkdir()
        self.manifest["source_roots"] = ["other"]
        with self.assertRaisesRegex(ValueError, "不在授权源码"):
            self.check()

    def test_generated_models_cannot_prove_themselves(self):
        self.manifest["source_roots"] = ["."]
        self.manifest["sources"][0]["path"] = "docs/model/yaml/m1-object-model.yaml"
        with self.assertRaisesRegex(ValueError, "生成模型"):
            self.check()

    def test_test_document_evidence_not_sufficient(self):
        for kind in ("TEST", "DOCUMENT"):
            with self.subTest(kind=kind):
                self.manifest["sources"][0]["kind"] = kind
                with self.assertRaisesRegex(ValueError, "唯一证据"):
                    self.check()

    def test_missing_element_trace(self):
        self.manifest["traces"].pop()
        with self.assertRaisesRegex(ValueError, "缺少元素级"):
            self.check()

    def test_duplicate_trace(self):
        self.manifest["traces"].append(copy.deepcopy(self.manifest["traces"][0]))
        with self.assertRaisesRegex(ValueError, "重复的模型追溯"):
            self.check()

    def test_nonexistent_pointer(self):
        trace = next(trace for trace in self.manifest["traces"] if trace["model"] == "m1")
        trace["pointer"] = "/aggregates/999"
        with self.assertRaisesRegex(ValueError, "索引不存在"):
            self.check()

    def test_missing_source_reference(self):
        self.manifest["traces"][0]["source_ids"] = ["EV-MISSING"]
        with self.assertRaisesRegex(ValueError, "不存在的证据"):
            self.check()

    def test_missing_model_status(self):
        del self.manifest["model_status"]["mm"]
        with self.assertRaisesRegex(ValueError, "model_status 必须覆盖"):
            self.check()

    def test_absent_model_requires_search_basis(self):
        del self.manifest["model_status"]["me"]["absence_checks"]
        with self.assertRaisesRegex(ValueError, "absence_checks"):
            self.check()

    def test_present_model_cannot_be_empty(self):
        self.manifest["model_status"]["me"] = self.status(True)
        with self.assertRaisesRegex(ValueError, "无模型元素"):
            self.check()

    def test_absent_model_with_unavailable_source_is_rejected(self):
        self.add_gap(kind="SOURCE_UNAVAILABLE", models=["me"])
        with self.assertRaisesRegex(ValueError, "me.*SOURCE_UNAVAILABLE.*PARTIAL"):
            self.check()

    def test_present_model_with_unavailable_source_is_rejected(self):
        self.add_gap(kind="SOURCE_UNAVAILABLE", models=["m2"])
        with self.assertRaisesRegex(ValueError, "m2.*SOURCE_UNAVAILABLE.*PARTIAL"):
            self.check()

    def test_unavailable_source_requires_partial_even_when_empty(self):
        self.add_gap(kind="SOURCE_UNAVAILABLE", models=["me"])
        self.manifest["model_status"]["me"] = {"status": "PARTIAL", "reason": "合成消费方源码不可见", "gap_ids": ["GAP-001"]}
        self.assertEqual(self.run_main(), 3)

    def test_partial_cannot_reference_only_an_unrelated_open_gap(self):
        self.add_gap(kind="SOURCE_UNAVAILABLE", models=["me"])
        self.add_gap(models=["me"], ident="GAP-002")
        self.manifest["model_status"]["me"] = {"status": "PARTIAL", "reason": "合成不完整取证", "gap_ids": ["GAP-002"]}
        with self.assertRaisesRegex(ValueError, "未引用全部开放 SOURCE_UNAVAILABLE"):
            self.check()

    def test_partial_must_include_all_unavailable_source_gaps(self):
        self.add_gap(kind="SOURCE_UNAVAILABLE", models=["me"])
        self.add_gap(kind="SOURCE_UNAVAILABLE", models=["me"], ident="GAP-002")
        self.manifest["model_status"]["me"] = {"status": "PARTIAL", "reason": "合成多个不可见实现", "gap_ids": ["GAP-001"]}
        with self.assertRaisesRegex(ValueError, "未引用全部开放 SOURCE_UNAVAILABLE"):
            self.check()

    def test_unavailable_source_constrains_every_affected_model(self):
        self.add_gap(kind="SOURCE_UNAVAILABLE", models=["me", "m4"])
        self.manifest["model_status"]["me"] = {"status": "PARTIAL", "reason": "合成事件取证未完成", "gap_ids": ["GAP-001"]}
        with self.assertRaisesRegex(ValueError, "m4.*SOURCE_UNAVAILABLE.*PARTIAL"):
            self.check()

    def test_resolved_unavailable_source_allows_proven_absence(self):
        self.add_gap("RESOLVED", kind="SOURCE_UNAVAILABLE", models=["me"])
        self.assertEqual(self.run_main(), 0)

    def test_known_omf_deviation_does_not_invalidate_proven_absence(self):
        self.add_gap(kind="OMF_DEVIATION", models=["me"])
        self.assertEqual(self.run_main(), 3)

    def test_partial_model_requires_open_matching_gap(self):
        self.manifest["model_status"]["m2"] = {"status": "PARTIAL", "reason": "合成部分提取", "gap_ids": ["GAP-MISSING"]}
        with self.assertRaisesRegex(ValueError, "缺口引用非法"):
            self.check()

    def test_coverage_must_include_all_traces(self):
        self.manifest["coverage"].pop()
        with self.assertRaisesRegex(ValueError, "未进入覆盖清单"):
            self.check()

    def test_excluded_entry_needs_reason(self):
        self.manifest["coverage"].append({"id": "EXCLUDED-001", "kind": "TECHNICAL", "source_ids": ["EV-001"], "disposition": "EXCLUDED"})
        with self.assertRaisesRegex(ValueError, "reason 必须"):
            self.check()

    def test_open_gap_returns_three(self):
        self.add_gap()
        self.assertEqual(self.run_main(), 3)

    def test_resolved_gap_returns_zero(self):
        self.add_gap("RESOLVED")
        self.assertEqual(self.run_main(), 0)

    def test_uncovered_gap_fails(self):
        self.add_gap()
        self.manifest["coverage"].pop()
        with self.assertRaisesRegex(ValueError, "有缺口未进入"):
            self.check()

    def test_shared_reference_failure_is_propagated(self):
        self.docs["m2"]["behaviors"][0]["ownerEntity"] = "AGG-MISSING"
        self.assertEqual(self.run_main(), 1)

    def test_duplicate_yaml_key_is_rejected(self):
        self.manifest_path.write_text("profile: omf-v6-as-is\nprofile: omf-v6-as-is\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "重复键"):
            REVERSE.check_reverse(self.repo, self.root, VALIDATOR)

    def test_json_model_content_is_rejected(self):
        path = self.ydir / VALIDATOR.MODEL_FILES["me"][0]
        path.write_text('{"model_type": "EVENT", "version": "1.0", "domain": "合成测试域", "events": []}\n', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "块状 YAML"):
            REVERSE.check_reverse(self.repo, self.root, VALIDATOR)

    def test_shared_validator_reports_json_model_content(self):
        path = self.ydir / VALIDATOR.MODEL_FILES["me"][0]
        path.write_text('{\n  "model_type": "EVENT",\n  "events": []\n}\n', encoding="utf-8")
        report = VALIDATOR.Report()
        VALIDATOR.load_models(str(self.root), report)
        self.assertTrue(any("块状 YAML" in message for message in report.errors))

    def test_block_yaml_with_flow_values_is_accepted(self):
        path = self.ydir / VALIDATOR.MODEL_FILES["me"][0]
        path.write_text('model_type: EVENT\nversion: "1.0"\ndomain: 合成测试域\nevents: [{"eventId": "Item.Changed"}]\n', encoding="utf-8")
        report = VALIDATOR.Report()
        VALIDATOR.load_models(str(self.root), report)
        self.assertEqual([], [message for message in report.errors if "块状 YAML" in message])

    def test_json_pointer_escaping(self):
        self.assertEqual(REVERSE.pointer_value({"a/b": {"~key": [42]}}, "/a~1b/~0key/0"), 42)
        for pointer in ("/a~2b", "/a~1b/~0key/-1", "/a~1b/~0key/00"):
            with self.subTest(pointer=pointer):
                with self.assertRaises(ValueError):
                    REVERSE.pointer_value({"a/b": {"~key": [42]}}, pointer)


class SkillContractTests(unittest.TestCase):
    def test_sensitive_path_test_detects_disabled_name_filter(self):
        case = ReverseCheckTests("test_all_unsafe_paths_rejected_before_source_read")
        result = unittest.TestResult()
        with patch.object(REVERSE, "relative_path", side_effect=lambda value: PurePosixPath(value)):
            case.run(result)
        self.assertFalse(result.wasSuccessful(), "关闭路径名过滤后，安全回归测试不得仍通过")

    def test_frontmatter_and_reference_files(self):
        text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        frontmatter = yaml.safe_load(text.split("---", 2)[1])
        self.assertEqual(frontmatter["name"], SKILL.name)
        self.assertLessEqual(len(frontmatter["description"]), 1024)
        for name in ("framework-profile", "code-evidence", "output-contract", "validation"):
            path = f"references/{name}.md"
            self.assertIn(path, text)
            self.assertTrue((SKILL / path).is_file())

    def test_shared_output_directory_contract_compatible(self):
        shared_skill = (SKILL.parent / "ontology-modeling" / "SKILL.md").read_text(encoding="utf-8")
        layout = shared_skill.split("## 输出目录与版本管理", 1)[1].split("每步的输出", 1)[0]
        intake = layout.split("├── intake/", 1)[1].split("├── yaml/", 1)[0]
        names = re.findall(r"(?:├──|└──) ([a-z-]+\.md)", intake)
        self.assertEqual(len(names), 8)
        expected = {"README.md", "CHANGELOG.md", *(f"intake/{name}" for name in names)}
        self.assertEqual(set(REVERSE.STANDARD_DOCUMENTS), expected)
        output = (SKILL / "references" / "output-contract.md").read_text(encoding="utf-8")
        for relative in expected:
            self.assertIn(Path(relative).name, output)
        for directory in ("intake/", "yaml/", "reviews/", "diagrams/"):
            self.assertIn(directory, output)

    def test_shared_model_metadata_compatible(self):
        self.assertEqual(set(VALIDATOR.MODEL_FILES), set(REVERSE.MODEL_TYPES))
        self.assertEqual(VALIDATOR.MODEL_FILES["mm"][0], "m-mapping-model.yaml")
        self.assertEqual(VALIDATOR.ROOTS["mi"], ["interfaces"])
        self.assertEqual(len(REVERSE.MANDATORY_MODELS), 10)


if __name__ == "__main__":
    unittest.main(verbosity=2)
