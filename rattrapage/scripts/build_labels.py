#!/usr/bin/env python3
"""
Build owasp_labels.csv from OWASP Benchmark's expectedresults-1.2.csv.

Output columns:
    test_name      -- e.g. BenchmarkTest00001
    file_path      -- relative path to the Java file
    category       -- OWASP category (pathtraver, sqli, crypto, ...)
    cwe            -- CWE number
    is_vulnerable  -- True if the file actually contains the vulnerability
"""
import csv
import os

BENCH_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "data", "BenchmarkJava"
)
EXPECTED = os.path.join(BENCH_DIR, "expectedresults-1.2.csv")
OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "results", "owasp_labels.csv"
)

JAVA_BASE = "src/main/java/org/owasp/benchmark/testcode"


def main():
    rows_out = []
    with open(EXPECTED) as f:
        reader = csv.reader(f)
        header = next(reader)  # skip header
        for row in reader:
            if len(row) < 4:
                continue
            test_name, category, real_vuln, cwe = row[0].strip(), row[1].strip(), row[2].strip(), row[3].strip()
            if not test_name.startswith("BenchmarkTest"):
                continue
            file_path = f"{JAVA_BASE}/{test_name}.java"
            rows_out.append({
                "test_name": test_name,
                "file_path": file_path,
                "category": category,
                "cwe": cwe,
                "is_vulnerable": real_vuln.lower() == "true",
            })

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["test_name", "file_path", "category", "cwe", "is_vulnerable"])
        w.writeheader()
        w.writerows(rows_out)

    n_vuln = sum(1 for r in rows_out if r["is_vulnerable"])
    n_safe = sum(1 for r in rows_out if not r["is_vulnerable"])
    print(f"Wrote {len(rows_out)} labels to {OUT}")
    print(f"  vulnerable: {n_vuln} ({n_vuln/len(rows_out):.1%})")
    print(f"  safe:       {n_safe} ({n_safe/len(rows_out):.1%})")
    cats = {}
    for r in rows_out:
        cats[r["category"]] = cats.get(r["category"], 0) + 1
    print(f"  categories: {len(cats)}")
    for c, n in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"    {c:15s} {n}")


if __name__ == "__main__":
    main()
