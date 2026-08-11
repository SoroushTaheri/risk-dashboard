import csv
import gzip
import hashlib
import json
from collections import Counter, defaultdict

import pytest

from actuarial.data_pipeline import SOURCE_COLUMNS, assert_reconciled, default_paths, generate, load_source


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def read_gzip(path):
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def test_source_v2_is_locked_and_has_1000_months():
    rows, checksum = load_source(default_paths())
    manifest = json.loads((default_paths().manifests / "source.json").read_text(encoding="utf-8"))
    assert len(rows) == 1000
    assert manifest["contract_version"] == 2
    assert manifest["sha256"] == checksum
    assert manifest["schema"] == SOURCE_COLUMNS
    assert "Total_Loss_Cases" not in SOURCE_COLUMNS


def test_every_month_reconciles_and_calibrates():
    summary = assert_reconciled()
    assert summary["status"] == "pass"
    assert summary["months_checked"] == 1000
    assert summary["failed_months"] == []
    assert all(summary["entity_checks"].values())
    assert all(item["passed"] for item in summary["calibration"].values())
    assert summary["maximum_absolute_difference"] < 1e-7
    rows = read_csv(default_paths().validation / "reconciliation.csv")
    assert len(rows) == 1000
    assert all(row["passed"] == "True" for row in rows)


def test_separate_policy_contract_and_compatible_claim_links():
    policies = read_csv(default_paths().derived / "policies.csv")
    vehicles = read_csv(default_paths().derived / "vehicles.csv")
    claims = read_gzip(default_paths().derived / "claims.csv.gz")
    accidents = read_gzip(default_paths().derived / "accidents.csv.gz")
    policy_by_id = {row["policy_id"]: row for row in policies}
    accident_ids = {row["accident_id"] for row in accidents}
    accident_by_id = {row["accident_id"]: row for row in accidents}
    liability_by_vehicle = Counter(
        row["vehicle_id"] for row in policies if row["coverage_type"] == "third_party_liability"
    )
    own_damage_by_vehicle = Counter(
        row["vehicle_id"] for row in policies if row["coverage_type"] == "own_damage"
    )

    assert len(vehicles) == 10_000
    assert len(policies) == 17_000
    assert set(liability_by_vehicle.values()) == {1}
    assert len(liability_by_vehicle) == 10_000
    assert len(own_damage_by_vehicle) == 7_000
    assert set(own_damage_by_vehicle.values()) == {1}
    assert all(row["coverage_type"] in {"own_damage", "third_party_liability"} for row in policies)
    assert all(claim["accident_id"] in accident_ids for claim in claims)
    assert all(policy_by_id[claim["policy_id"]]["coverage_type"] == claim["coverage_type"] for claim in claims)
    for claim in claims:
        policy = policy_by_id[claim["policy_id"]]
        accident = accident_by_id[claim["accident_id"]]
        if claim["claim_role"] in {"at_fault_own_vehicle", "injured_third_party"}:
            assert policy["vehicle_id"] == accident["at_fault_vehicle_id"]
        else:
            assert claim["claim_role"] == "injured_party_property_excess"
            assert accident["injured_party_type"] == "portfolio_vehicle"
            assert policy["vehicle_id"] == accident["injured_vehicle_id"]


def test_components_respect_limits_deductibles_and_claim_identities():
    claims = read_gzip(default_paths().derived / "claims.csv.gz")
    components = read_gzip(default_paths().derived / "claim_components.csv.gz")
    by_claim = defaultdict(list)
    for component in components:
        by_claim[component["claim_id"]].append(component)
        gross = float(component["gross_damage_million_toman"])
        limit = float(component["applicable_limit_million_toman"])
        deductible = float(component["deductible_million_toman"])
        paid = float(component["insurer_paid_million_toman"])
        uncovered = float(component["uncovered_after_component_million_toman"])
        assert paid >= 0
        assert paid <= max(limit - deductible, 0) + 1e-9
        assert gross == pytest.approx(paid + deductible + uncovered, abs=1e-7)

    for claim in claims:
        linked = by_claim[claim["claim_id"]]
        assert linked
        assert sum(float(row["gross_damage_million_toman"]) for row in linked) == pytest.approx(
            float(claim["gross_damage_million_toman"]), abs=1e-7
        )
        assert sum(float(row["insurer_paid_million_toman"]) for row in linked) == pytest.approx(
            float(claim["insurer_paid_million_toman"]), abs=1e-7
        )
        if claim["claim_role"] == "injured_party_property_excess":
            assert claim["coverage_type"] == "own_damage"
            assert float(claim["deductible_million_toman"]) > 0


def test_accidents_can_create_distinct_policy_claims_and_month_totals_reconcile():
    claims = read_gzip(default_paths().derived / "claims.csv.gz")
    months = {row["month_id"]: row for row in read_csv(default_paths().derived / "months.csv")}
    claims_by_accident = defaultdict(list)
    claims_by_month = defaultdict(list)
    for claim in claims:
        claims_by_accident[claim["accident_id"]].append(claim)
        claims_by_month[claim["month_id"]].append(claim)
    assert any(len(rows) > 1 and len({row["policy_id"] for row in rows}) > 1 for rows in claims_by_accident.values())

    for month_id, month in months.items():
        linked = claims_by_month[month_id]
        paid = sum(float(row["insurer_paid_million_toman"]) for row in linked)
        assert len(linked) == int(month["total_claim_count"])
        assert paid == pytest.approx(float(month["total_insurer_paid_loss_million_toman"]), abs=1e-7)
        assert float(month["uncovered_property_excess_million_toman"]) >= 0


def test_regeneration_is_byte_deterministic():
    paths = default_paths()
    tracked = [
        paths.source,
        paths.derived / "vehicles.csv",
        paths.derived / "policies.csv",
        paths.derived / "months.csv",
        paths.derived / "accidents.csv.gz",
        paths.derived / "claims.csv.gz",
        paths.derived / "claim_components.csv.gz",
        paths.validation / "reconciliation.csv",
    ]
    before = {path.name: digest(path) for path in tracked}
    generate()
    after = {path.name: digest(path) for path in tracked}
    assert after == before
