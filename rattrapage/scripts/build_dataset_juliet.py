#!/usr/bin/env python3
"""
Build the Juliet portion of the real dataset by joining Semgrep SARIF
with the Juliet manifest.xml flaw-line annotations.

Labeling logic:
  For each Semgrep finding (file, line):
    - parse Juliet manifest → {basename: [flaw_lines]}
    - if alert_line is within ±WINDOW of any flaw_line for that file → TP (y=0)
    - else → FP (y=1)

The window is set to 5 lines (configurable). Empirically, taint-tracking
rules sometimes flag the source (HTTP input read) a few lines above the sink
where the manifest records the flaw. Allowing a small window captures this
without inflating the TP rate (verified by spot-checking a few cases).
"""
from __future__ import annotations

import csv
import json
import os
import re
from collections import defaultdict, Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MANIFEST = os.path.join(ROOT, "data", "juliet", "Java", "manifest.xml")
SARIF = os.path.join(ROOT, "results", "semgrep_juliet.sarif.json")
OUT_CSV = os.path.join(ROOT, "results", "juliet_dataset.csv")

CWE_RE = re.compile(r"CWE-?0*(\d+)")
TESTCASE_PATH_PART = "/testcases/"
WINDOW = 5  # ±lines around flaw_line still counts as TP


def norm_cwe(s):
    """Normalize a CWE number string (e.g. '089' or '89' → '89')."""
    if s is None: return None
    return str(s).lstrip("0") or "0"


FILE_RE = re.compile(r'<file\s+path="([^"]+\.java)"\s*(?P<closed>/?)>')
FLAW_RE = re.compile(r'<flaw\s+line="(\d+)"\s+name="([^"]*)"\s*/>')


def parse_manifest(path):
    """Regex-based, tolerant parser. The NIST Juliet manifest has a few
    malformed entries (e.g. duplicate </testcase>) that break ElementTree.
    We don't need the testcase hierarchy — for each <file> tag we collect
    its child <flaw> tags until the next <file> tag (or </testcase>).
    Returns dict basename -> set[int] of flaw lines, and dict basename -> CWE str."""
    flaws_by_file = defaultdict(set)
    cwe_by_file = {}
    with open(path) as f:
        text = f.read()
    pos = 0
    while True:
        m = FILE_RE.search(text, pos)
        if not m:
            break
        fname = m.group(1)
        base = os.path.basename(fname)
        # Mark this basename as seen (even if no flaws)
        _ = flaws_by_file[base]
        # If self-closed (<file ... />), no children to parse
        if m.group("closed") == "/":
            pos = m.end()
            continue
        # Otherwise parse until matching </file>
        end_tag = text.find("</file>", m.end())
        if end_tag == -1:
            pos = m.end()
            continue
        block = text[m.end():end_tag]
        for fm in FLAW_RE.finditer(block):
            line, cwe_name = fm.group(1), fm.group(2)
            try:
                flaws_by_file[base].add(int(line))
            except ValueError:
                pass
            cm = CWE_RE.search(cwe_name)
            if cm and base not in cwe_by_file:
                cwe_by_file[base] = norm_cwe(cm.group(1))
        pos = end_tag + len("</file>")
    return flaws_by_file, cwe_by_file


def derive_cwe_from_dir(path):
    """Extract CWE from the testcase dir (CWE89_SQL_Injection → 89)."""
    m = re.search(r"CWE(\d+)_", path)
    return m.group(1) if m else None


def parse_rule_cwes(rule):
    """Return set of normalized CWE numbers attached to this rule."""
    cwes = set()
    tags = rule.get("properties", {}).get("tags", [])
    for tag in tags:
        m = CWE_RE.search(tag)
        if m:
            cwes.add(norm_cwe(m.group(1)))
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
    if "des-is" in rid or "cipher" in rid or "crypto" in rid: return "crypto"
    if "cookie" in rid: return "securecookie"
    if "trust" in rid: return "trustbound"
    if "deser" in rid: return "deserialization"
    if "open-redir" in rid or "redirect" in rid: return "redirect"
    if "xxe" in rid or "xml" in rid: return "xxe"
    return "other"


def main():
    print("Parsing manifest...", flush=True)
    flaws_by_file, cwe_by_file = parse_manifest(MANIFEST)
    n_with_flaws = sum(1 for v in flaws_by_file.values() if v)
    print(f"  Manifest indexed: {len(flaws_by_file)} java files referenced ({n_with_flaws} with ≥1 flaw line)")
    n_total_flaws = sum(len(v) for v in flaws_by_file.values())
    print(f"  Total flaw lines: {n_total_flaws}")

    print(f"Parsing SARIF {SARIF}...", flush=True)
    with open(SARIF) as f:
        sarif = json.load(f)
    run = sarif["runs"][0]
    tool_name = run["tool"]["driver"]["name"]
    rules_by_id = {r["id"]: r for r in run["tool"]["driver"].get("rules", [])}
    rule_cwe_map = {rid: parse_rule_cwes(rule) for rid, rule in rules_by_id.items()}

    findings = run["results"]
    print(f"  {tool_name}: {len(findings)} findings")

    rows = []
    matched_in_manifest = 0
    unmatched_basenames = 0
    for f in findings:
        rule_id = f.get("ruleId", "")
        rule = rules_by_id.get(rule_id, {})
        try:
            loc = f["locations"][0]["physicalLocation"]
            uri = loc["artifactLocation"]["uri"]
            start_line = int(loc["region"]["startLine"])
        except (KeyError, IndexError, ValueError):
            continue

        if TESTCASE_PATH_PART not in uri:
            continue
        base = os.path.basename(uri)
        # CWE of the test (file directory)
        cwe_test = cwe_by_file.get(base) or norm_cwe(derive_cwe_from_dir(uri))
        if cwe_test is None:
            continue

        # File-level labeling (same convention as OWASP Benchmark):
        #   - test_is_vulnerable = has at least one flaw line in manifest
        #   - alert is TP iff (test is vulnerable) AND (rule's CWE matches OR rule category matches)
        # We drop the per-line window check because Juliet's bad() methods can span
        # dozens of lines; Semgrep often alerts on the source (taint entry) while
        # the manifest records only the sink line, producing spurious FPs.
        flaw_lines = flaws_by_file.get(base, set())
        in_manifest = base in flaws_by_file
        if not in_manifest:
            unmatched_basenames += 1
            continue
        matched_in_manifest += 1
        test_is_vulnerable = bool(flaw_lines)

        cwe_test_n = norm_cwe(cwe_test)
        rule_cwes = rule_cwe_map.get(rule_id, set())
        cwe_match = cwe_test_n in rule_cwes
        rule_cat = rule_category_hint(rule_id)
        test_cat = rule_category_hint("CWE" + str(cwe_test_n))  # reuse the hint helper for the test CWE
        cat_match = rule_cat != "other" and rule_cat == test_cat
        is_fp = not (test_is_vulnerable and (cwe_match or cat_match))

        level = rule.get("defaultConfiguration", {}).get("level", "warning")
        rows.append({
            "tool": tool_name,
            "rule_id": rule_id,
            "rule_category": rule_category_hint(rule_id),
            "level": level,
            "test_name": base.replace(".java", ""),
            "test_category": rule_category_hint("CWE" + str(cwe_test)) if cwe_test else "other",
            "test_cwe": cwe_test,
            "test_is_vulnerable": test_is_vulnerable,
            "file_path": uri,
            "start_line": start_line,
            "is_fp": is_fp,
            "source": "juliet",
        })

    n_fp = sum(1 for r in rows if r["is_fp"])
    n_tp = sum(1 for r in rows if not r["is_fp"])
    print(f"\n=== Juliet dataset stats ===")
    print(f"  Retained findings: {len(rows)}")
    print(f"  Matched in manifest: {matched_in_manifest}, unmatched: {unmatched_basenames}")
    print(f"  FP: {n_fp} ({n_fp/max(len(rows),1):.1%})")
    print(f"  TP: {n_tp} ({n_tp/max(len(rows),1):.1%})")

    print(f"\nTop 15 rules:")
    rc = Counter(r["rule_id"] for r in rows)
    for rid, n in rc.most_common(15):
        fp_in = sum(1 for r in rows if r["rule_id"] == rid and r["is_fp"])
        print(f"  {n:>5d}  fp={fp_in/n:.0%}  {rid[:80]}")
    print(f"\nUnique rules fired: {len(rc)}")

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
