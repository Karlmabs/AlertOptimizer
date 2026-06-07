#!/usr/bin/env python3
"""
Aggregate per-rule statistics from real_dataset_v2.csv into a small JSON
consumed by the UI's /rules page. We only need: rule_id, n alerts, FP rate,
source breakdown, primary category.
"""
import csv
import json
import os
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "results", "real_dataset_v2.csv")
OUT = os.path.join(ROOT, "ui", "frontend", "public", "data", "per_rule.json")


def main():
    by_rule = defaultdict(lambda: {
        "n": 0, "n_fp": 0, "categories": defaultdict(int), "sources": defaultdict(int),
        "level": defaultdict(int),
    })
    with open(SRC) as f:
        for row in csv.DictReader(f):
            r = by_rule[row["rule_id"]]
            r["n"] += 1
            if row["is_fp"] in ("True", "1"):
                r["n_fp"] += 1
            r["categories"][row.get("test_category") or "other"] += 1
            r["sources"][row["source"]] += 1
            r["level"][row["level"]] += 1

    rows = []
    for rule_id, d in by_rule.items():
        n = d["n"]
        n_fp = d["n_fp"]
        primary_cat = max(d["categories"].items(), key=lambda x: x[1])[0]
        primary_src = max(d["sources"].items(), key=lambda x: x[1])[0]
        primary_lvl = max(d["level"].items(), key=lambda x: x[1])[0]
        rows.append({
            "rule_id": rule_id,
            "n": n,
            "fp_rate": round(n_fp / max(n, 1), 4),
            "primary_category": primary_cat,
            "primary_source": primary_src,
            "primary_level": primary_lvl,
        })
    rows.sort(key=lambda x: -x["n"])
    with open(OUT, "w") as f:
        json.dump(rows, f, indent=2)
    print(f"Wrote {len(rows)} rules to {OUT}")


if __name__ == "__main__":
    main()
