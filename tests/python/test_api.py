import csv

import pytest
from fastapi.testclient import TestClient

from actuarial.data_pipeline import default_paths
from apps.api.main import app

client = TestClient(app)


def test_health_readiness_source_and_version_two():
    assert client.get("/api/health").json()["version"] == "2.1.0"
    readiness = client.get("/api/readiness")
    assert readiness.status_code == 200
    assert readiness.json()["reconciliation"]["critical_checks_pass"] is True
    source = client.get("/api/source").json()
    assert source["contract_version"] == 2
    assert len(source["sha256"]) == 64


def test_portfolio_month_lineage_and_month_migration_response():
    summary = client.get("/api/portfolio/summary").json()
    assert summary["months"] == 1000
    assert summary["vehicles"] == 10_000
    assert summary["total_policies"] == 17_000
    lineage = client.get("/api/portfolio/month/M0001")
    assert lineage.status_code == 200
    body = lineage.json()
    assert body["entities"]["accident_count"] == body["month"]["Accident_Count"]
    assert body["entities"]["claim_count"] == body["month"]["Total_Claim_Count"]
    obsolete = client.get("/api/portfolio/scenario/S0001")
    assert obsolete.status_code == 410
    assert "/api/portfolio/month/M0001" in obsolete.json()["detail"]


def test_risk_endpoint_is_coverage_selectable_and_validated():
    total = client.post("/api/risk-measures", json={"coverage": "total", "confidence": 0.95, "method": "empirical"})
    own = client.post("/api/risk-measures", json={"coverage": "own_damage", "confidence": 0.95, "method": "empirical"})
    assert total.status_code == own.status_code == 200
    assert total.json()["values"]["tvar"] >= total.json()["values"]["var"]
    assert total.json()["values"]["var"] > own.json()["values"]["var"]
    assert client.post("/api/risk-measures", json={"confidence": 2}).status_code == 422


def test_utility_reinsurance_returns_a_layer_specific_budget():
    response = client.post(
        "/api/utility-reinsurance",
        json={"coverage": "total", "retention": 5_000, "wealth": 10_000, "risk_aversion": 5 / 110_000, "utility": "power"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reinsurance"]["values"]["retained_sd"] >= 0
    assert body["reinsurance_budget"]["values"]["maximum_acceptable_premium"] >= body["reinsurance_budget"]["values"]["expected_ceded_loss"]
    assert body["utility"] == "power"
    assert [row["utility"] for row in body["comparison"]] == ["exponential", "logarithmic", "power"]
    assert len({round(row["maximum_acceptable_premium"], 8) for row in body["comparison"]}) == 3
    assert all(row["absolute_risk_aversion_at_wealth"] == pytest.approx(5 / 110_000) for row in body["comparison"])


def test_individual_risk_uses_the_same_policy_probabilities_as_generated_rows():
    request = {"portfolio_size": 25, "coverage": "own_damage", "segment": "preferred", "confidence": 0.95}
    response = client.post("/api/individual-risk", json=request)
    assert response.status_code == 200
    body = response.json()
    with (default_paths().derived / "policies.csv").open(encoding="utf-8", newline="") as handle:
        eligible = [
            row for row in csv.DictReader(handle)
            if row["coverage_type"] == "own_damage" and row["segment"] == "preferred"
        ][:25]
    expected = sum(float(row["empirical_claim_probability"]) * float(row["mean_paid_loss_million_toman"]) for row in eligible)
    assert body["policy_count"] == 25
    assert body["independent_moments"]["values"]["mean"] == pytest.approx(expected)
    assert body["shared_accident_empirical"]["mean"] >= 0


def test_frequency_and_collective_units_reconcile():
    accident = client.get("/api/frequency-fit", params={"unit": "accident", "coverage": "total"})
    claim = client.get("/api/frequency-fit", params={"unit": "claim", "coverage": "own_damage"})
    invalid = client.get("/api/frequency-fit", params={"unit": "accident", "coverage": "own_damage"})
    assert accident.json()["unit"] == "accident"
    assert claim.json()["unit"] == "claim"
    assert invalid.status_code == 422
    collective = client.post("/api/collective-risk", json={"coverage": "total"}).json()
    assert collective["frequency_unit"] == "claims"
    assert len(collective["components"]) == 2
    assert collective["identity_relative_error"] < 1e-12
    assert collective["component_expected_aggregate_loss"] == pytest.approx(collective["empirical_mean_aggregate_loss"])


def test_ruin_uses_retained_month_loss_and_matching_premium_basis():
    body = client.post(
        "/api/ruin",
        json={"coverage": "total", "initial_capital": 15_000, "safety_loading": 0.2, "horizon": 12, "paths": 1000, "retention": 5_000, "seed": 1405},
    ).json()
    assert body["loss_basis"] == "retained month-level insurer-paid loss"
    assert body["premium_per_period"] == pytest.approx(body["mean_retained_loss"] * 1.2)
    assert 0 <= body["finite_horizon_ruin_probability"] <= 1
    assert body["theory"]["applicable"] is False
