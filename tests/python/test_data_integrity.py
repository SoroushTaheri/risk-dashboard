import csv
import gzip
import hashlib
import json

from actuarial.data_pipeline import EXPECTED_COLUMNS, assert_reconciled, default_paths, generate, load_source


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_source_is_locked_and_has_1000_months():
    rows, checksum = load_source(default_paths())
    manifest = json.loads((default_paths().manifests / "source.json").read_text(encoding="utf-8"))
    assert len(rows) == 1000
    assert manifest["sha256"] == checksum
    assert manifest["schema"] == EXPECTED_COLUMNS
    assert manifest["immutable"] is True


def test_every_month_reconciles():
    summary = assert_reconciled()
    assert summary["status"] == "pass"
    assert summary["months_checked"] == 1000
    assert summary["failed_months"] == []
    with (default_paths().validation / "reconciliation.csv").open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 1000
    assert all(row["passed"] == "True" for row in rows)
    assert all(row["policy_links_valid"] == "True" for row in rows)


def test_claim_and_accident_lineage_and_counts():
    with gzip.open(default_paths().derived / "accidents.csv.gz", "rt", encoding="utf-8", newline="") as handle:
        accidents = list(csv.DictReader(handle))
    accident_ids = {row["accident_id"] for row in accidents}
    policy_ids = {row["policy_id"] for row in accidents}
    with gzip.open(default_paths().derived / "claims.csv.gz", "rt", encoding="utf-8", newline="") as handle:
        claims = list(csv.DictReader(handle))
    assert len(accident_ids) == len(accidents)
    assert all(row["accident_id"] in accident_ids for row in claims)
    assert all(row["policy_id"] in policy_ids for row in claims)
    assert all(float(row["amount"]) > 0 for row in claims)


def test_regeneration_is_byte_deterministic():
    paths = default_paths()
    tracked = [
        paths.derived / "monthly_portfolio.csv",
        paths.derived / "accidents.csv.gz",
        paths.derived / "claims.csv.gz",
        paths.derived / "policies.csv",
        paths.derived / "policy_exposures.csv.gz",
        paths.validation / "reconciliation.csv",
    ]
    before = {path.name: digest(path) for path in tracked}
    generate()
    after = {path.name: digest(path) for path in tracked}
    assert after == before

