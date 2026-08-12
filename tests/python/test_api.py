import csv
import gzip

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


def test_individual_risk_uses_full_policy_month_losses_and_reconciles_the_mean():
    request = {"portfolio_size": 25, "coverage": "own_damage", "segment": "preferred", "confidence": 0.95}
    response = client.post("/api/individual-risk", json=request)
    assert response.status_code == 200
    body = response.json()
    with (default_paths().derived / "policies.csv").open(encoding="utf-8", newline="") as handle:
        eligible = [
            row for row in csv.DictReader(handle)
            if row["coverage_type"] == "own_damage" and row["segment"] == "preferred"
        ][:25]
    selected_ids = {row["policy_id"] for row in eligible}
    with gzip.open(default_paths().derived / "claims.csv.gz", "rt", encoding="utf-8", newline="") as handle:
        expected = sum(
            float(row["insurer_paid_million_toman"])
            for row in csv.DictReader(handle)
            if row["policy_id"] in selected_ids
        ) / 1_000
    assert body["policy_count"] == 25
    assert body["independent_moments"]["values"]["mean"] == pytest.approx(expected)
    assert body["independent_moments"]["values"]["mean"] == pytest.approx(body["shared_accident_empirical"]["mean"])
    assert body["independent_moments"]["values"]["mean_positive_policy_month_loss"] > 0
    assert body["months_per_policy"] == 1_000
    assert body["dependence_effect"]["mean_reconciliation_error"] == pytest.approx(0, abs=1e-10)


@pytest.mark.parametrize(
    ("portfolio_size", "coverage", "segment", "confidence"),
    [
        (20, "all", "all", 0.80),
        (300, "own_damage", "preferred", 0.99),
        (800, "third_party_liability", "standard", 0.90),
        (200, "third_party_liability", "commercial", 0.95),
    ],
)
def test_individual_risk_mean_identity_holds_for_every_control_selection(
    portfolio_size, coverage, segment, confidence
):
    body = client.post(
        "/api/individual-risk",
        json={
            "portfolio_size": portfolio_size,
            "coverage": coverage,
            "segment": segment,
            "confidence": confidence,
        },
    ).json()
    assert body["independent_moments"]["values"]["mean"] == pytest.approx(
        body["shared_accident_empirical"]["mean"], abs=1e-10
    )
    assert body["dependence_effect"]["mean_reconciliation_error"] == pytest.approx(0, abs=1e-10)


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


def test_collective_controls_recalculate_fitted_curves_and_numerical_routes():
    poisson = client.get("/api/frequency-fit", params={"model": "poisson", "unit": "claim", "coverage": "total"}).json()
    negative_binomial = client.get("/api/frequency-fit", params={"model": "negative_binomial", "unit": "claim", "coverage": "total"}).json()
    assert poisson["values"]["observed_mean"] == pytest.approx(negative_binomial["values"]["observed_mean"])
    assert poisson["values"]["observed_variance"] == pytest.approx(negative_binomial["values"]["observed_variance"])
    assert poisson["values"]["fitted_variance"] == pytest.approx(poisson["values"]["fitted_mean"])
    assert negative_binomial["values"]["fitted_variance"] > negative_binomial["values"]["fitted_mean"]
    assert poisson["values"]["fitted_expected_frequency"] != pytest.approx(
        negative_binomial["values"]["fitted_expected_frequency"]
    )

    results = {}
    for method in ("monte_carlo", "panjer", "fft"):
        response = client.post(
            "/api/collective-risk",
            json={"coverage": "total", "frequency_model": "negative_binomial", "method": method, "confidence": 0.95},
        )
        assert response.status_code == 200
        results[method] = response.json()
        assert len(results[method]["aggregate_distribution"]["losses"]) == 56
        assert len(results[method]["aggregate_distribution"]["model_probability"]) == 56
        assert results[method]["represented_mass"] > 0.999
        assert results[method]["model_quantile"] > 0

    assert results["monte_carlo"]["aggregate_distribution"]["model_probability"] != pytest.approx(
        results["panjer"]["aggregate_distribution"]["model_probability"]
    )
    assert results["panjer"]["model_quantile"] == pytest.approx(results["fft"]["model_quantile"])


def test_ruin_uses_retained_month_loss_and_matching_premium_basis():
    body = client.post(
        "/api/ruin",
        json={"coverage": "total", "initial_capital": 15_000, "safety_loading": 0.2, "horizon": 12, "paths": 1000, "retention": 5_000, "seed": 1405},
    ).json()
    assert body["loss_basis"] == "retained month-level insurer-paid loss"
    assert body["premium_per_period"] == pytest.approx(body["mean_retained_loss"] * 1.2)
    assert 0 <= body["finite_horizon_ruin_probability"] <= 1
    assert body["ruined_paths"] == round(body["finite_horizon_ruin_probability"] * 1000)
    assert body["mean_first_ruin_month"] is None or 1 <= body["mean_first_ruin_month"] <= 12
    assert body["theory"]["applicable"] is False
