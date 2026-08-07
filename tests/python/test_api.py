from fastapi.testclient import TestClient

from apps.api.main import app

client = TestClient(app)


def test_health_readiness_and_source():
    assert client.get("/api/health").status_code == 200
    readiness = client.get("/api/readiness")
    assert readiness.status_code == 200
    assert readiness.json()["reconciliation"]["critical_checks_pass"] is True
    assert len(client.get("/api/source").json()["sha256"]) == 64


def test_portfolio_and_month_lineage():
    summary = client.get("/api/portfolio/summary").json()
    assert summary["months"] == 1000
    lineage = client.get("/api/portfolio/month/M0001").json()
    assert lineage["reconstructed"]["accident_count"] == lineage["source_month"]["Total_Accidents"]
    assert lineage["lineage"] == ["monthly aggregate", "accidents", "claims", "policies"]


def test_risk_endpoint_and_validation():
    response = client.post("/api/risk-measures", json={"confidence": 0.95, "method": "empirical"})
    assert response.status_code == 200
    assert response.json()["values"]["tvar"] >= response.json()["values"]["var"]
    invalid = client.post("/api/risk-measures", json={"confidence": 2})
    assert invalid.status_code == 422


def test_heavy_tail_ruin_disables_invalid_theory():
    response = client.post(
        "/api/ruin",
        json={
            "initial_capital": 30_000_000,
            "monthly_mean_loss": 10_000_000,
            "safety_loading": 0.2,
            "horizon": 12,
            "paths": 1000,
            "severity_model": "pareto",
            "shape": 1.5,
        },
    )
    assert response.status_code == 200
    assert response.json()["theory"]["applicable"] is False

