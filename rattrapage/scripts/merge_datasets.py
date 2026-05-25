#!/usr/bin/env python3
"""
Merge OWASP Benchmark and Juliet datasets into one unified CSV.
"""
import csv
import os
from collections import Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OWASP = os.path.join(ROOT, "results", "owasp_dataset.csv")
JULIET = os.path.join(ROOT, "results", "juliet_dataset.csv")
OUT = os.path.join(ROOT, "results", "real_dataset_v2.csv")


def main():
    all_rows = []
    for path, label in [(OWASP, "owasp"), (JULIET, "juliet")]:
        if not os.path.exists(path):
            print(f"WARNING: {path} does not exist — skipping")
            continue
        with open(path) as f:
            n = 0
            for row in csv.DictReader(f):
                all_rows.append(row)
                n += 1
        print(f"  {label}: +{n} alerts")

    n_fp = sum(1 for r in all_rows if r["is_fp"] in ("True", "1", True))
    n_tp = len(all_rows) - n_fp
    print(f"\n=== Merged dataset ===")
    print(f"  Total alerts: {len(all_rows)}")
    print(f"  FP: {n_fp} ({n_fp/max(len(all_rows),1):.1%})")
    print(f"  TP: {n_tp} ({n_tp/max(len(all_rows),1):.1%})")

    # By source
    src = Counter(r["source"] for r in all_rows)
    print(f"  By source: {dict(src)}")

    # By rule
    rc = Counter(r["rule_id"] for r in all_rows)
    print(f"  Unique rules: {len(rc)}")
    print(f"  Top 10 rules:")
    for rid, n in rc.most_common(10):
        fp = sum(1 for r in all_rows if r["rule_id"] == rid and r["is_fp"] in ("True", True))
        print(f"    {n:>5d}  fp={fp/n:.0%}  {rid[:75]}")

    fieldnames = list(all_rows[0].keys()) if all_rows else []
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(all_rows)
    print(f"\nSaved → {OUT}")


if __name__ == "__main__":
    main()
