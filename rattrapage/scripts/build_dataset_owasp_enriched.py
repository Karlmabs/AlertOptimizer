#!/usr/bin/env python3
"""
Rebuild the OWASP dataset from semgrep_owasp_enriched.sarif.json
(now produced with 6 rulesets and 194 firing rules, ~8043 findings).
"""
from __future__ import annotations

import csv
import json
import os
import re
from collections import Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SARIF = os.path.join(ROOT, "results", "semgrep_owasp_enriched.sarif.json")
LABELS = os.path.join(ROOT, "results", "owasp_labels.csv")
OUT_CSV = os.path.join(ROOT, "results", "owasp_dataset.csv")

# Same CWE families as before (built from OWASP Benchmark scorecard)
CATEGORY_CWE_FAMILY = {
    "sqli":          {"89"},
    "xss":           {"79", "80"},
    "pathtraver":    {"22", "23", "36"},
    "cmdi":          {"78", "77"},
    "ldapi":         {"90"},
    "xpathi":        {"643"},
    "crypto":        {"326", "327", "295", "780"},
    "hash":          {"328", "327", "916"},
    "weakrand":      {"330", "338", "331"},
    "trustbound":    {"501"},
    "securecookie":  {"614", "315", "1004"},
}

CWE_RE = re.compile(r"CWE-(\d+)")
TEST_NAME_RE = re.compile(r"(BenchmarkTest\d{5})")


def parse_rule_cwes(rule):
    cwes = set()
    for tag in rule.get("properties", {}).get("tags", []):
        m = CWE_RE.search(tag)
        if m: cwes.add(m.group(1))
    return cwes


def rule_category_hint(rule_id):
    rid = rule_id.lower()
    if "sqli" in rid or "tainted-sql" in rid: return "sqli"
    if "xss" in rid or "response-writer" in rid: return "xss"
    if "path-traversal" in rid or "pathtrav" in rid: return "pathtraver"
    if "cmd" in rid or "command-inj" in rid: return "cmdi"
    if "ldap" in rid: return "ldapi"
    if "xpath" in rid: return "xpathi"
    if "sha1" in rid or "md5" in rid or "hash" in rid: return "hash"
    if "random" in rid or "weakrand" in rid: return "weakrand"
    if "des" in rid or "cipher" in rid or "crypto" in rid: return "crypto"
    if "cookie" in rid: return "securecookie"
    if "trust" in rid: return "trustbound"
    if "deser" in rid: return "deserialization"
    if "open-redir" in rid or "redirect" in rid: return "redirect"
    if "xxe" in rid or "xml" in rid: return "xxe"
    return "other"


def main():
    labels = {}
    with open(LABELS) as f:
        for row in csv.DictReader(f):
            labels[row["test_name"]] = {
                "category": row["category"],
                "cwe": row["cwe"],
                "is_vulnerable": row["is_vulnerable"] == "True",
            }
    print(f"Loaded {len(labels)} OWASP labels")

    with open(SARIF) as f:
        sarif = json.load(f)
    run = sarif["runs"][0]
    tool_name = run["tool"]["driver"]["name"]
    rules_by_id = {r["id"]: r for r in run["tool"]["driver"].get("rules", [])}
    rule_cwe = {rid: parse_rule_cwes(r) for rid, r in rules_by_id.items()}

    findings = run["results"]
    print(f"{tool_name}: {len(findings)} findings")

    rows = []
    for f in findings:
        rule_id = f.get("ruleId", "")
        try:
            loc = f["locations"][0]["physicalLocation"]
            uri = loc["artifactLocation"]["uri"]
            start_line = int(loc["region"]["startLine"])
        except (KeyError, IndexError, ValueError):
            continue
        m = TEST_NAME_RE.search(uri)
        if not m: continue
        test_name = m.group(1)
        if test_name not in labels: continue
        test = labels[test_name]

        rule_cwes = rule_cwe.get(rule_id, set())
        cat_cwes = CATEGORY_CWE_FAMILY.get(test["category"], set())
        cwe_match = bool(rule_cwes & cat_cwes)
        # Loose category match: rule_id name hints at the same vulnerability family.
        # Used as a fallback when the rule is CWE-tagged with a precursor (e.g., CWE-20)
        # rather than the specific CWE of the vulnerability family. This matches the
        # standard OWASP Benchmark scoring convention for tools without official mapping.
        cat_hint_match = rule_category_hint(rule_id) == test["category"]
        is_fp = not (test["is_vulnerable"] and (cwe_match or cat_hint_match))

        level = rules_by_id.get(rule_id, {}).get("defaultConfiguration", {}).get("level", "warning")
        rows.append({
            "tool": tool_name,
            "rule_id": rule_id,
            "rule_category": rule_category_hint(rule_id),
            "level": level,
            "test_name": test_name,
            "test_category": test["category"],
            "test_cwe": test["cwe"],
            "test_is_vulnerable": test["is_vulnerable"],
            "file_path": uri,
            "start_line": start_line,
            "is_fp": is_fp,
            "source": "owasp_bench",
        })

    n_fp = sum(1 for r in rows if r["is_fp"])
    n_tp = len(rows) - n_fp
    print(f"\n=== OWASP enriched stats ===")
    print(f"  Retained: {len(rows)}  FP: {n_fp} ({n_fp/max(len(rows),1):.1%})  TP: {n_tp} ({n_tp/max(len(rows),1):.1%})")
    rc = Counter(r["rule_id"] for r in rows)
    print(f"  Unique rules fired: {len(rc)}")
    print(f"  Top 10 rules:")
    for rid, n in rc.most_common(10):
        fp = sum(1 for r in rows if r["rule_id"] == rid and r["is_fp"])
        print(f"    {n:>5d}  fp={fp/n:.0%}  {rid[:80]}")

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "tool", "rule_id", "rule_category", "level",
            "test_name", "test_category", "test_cwe", "test_is_vulnerable",
            "file_path", "start_line", "is_fp", "source",
        ])
        w.writeheader()
        w.writerows(rows)
    print(f"\nSaved → {OUT_CSV}")


if __name__ == "__main__":
    main()
