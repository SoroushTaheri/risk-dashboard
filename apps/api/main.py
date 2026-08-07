from __future__ import annotations

import csv
import gzip
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

from actuarial.collective_risk import fit_frequency, simulate_compound_poisson
from actuarial.data_pipeline import EXPECTED_COLUMNS, assert_reconciled, default_paths
from actuarial.individual_risk import approximation_quantiles, bernoulli_portfolio
from actuarial.risk_measures import bootstrap_var, empirical_var_tvar, evt_var_tvar, normal_var_tvar, retained_losses
from actuarial.ruin import adjustment_coefficient_exponential, lundberg_bound, simulate_discrete_ruin
from actuarial.utility_reinsurance import exponential_certainty_equivalent, stop_loss, theoretical_entropic_availability

ROOT = Path(__file__).resolve().parents[2]
APP_VERSION = "1.0.0"


class RiskRequest(BaseModel):
    coverage: Literal["total", "own_damage", "third_party"] = "total"
    confidence: float = Field(0.95, gt=0, lt=1)
    method: Literal["empirical", "normal", "evt"] = "empirical"
    threshold_quantile: float = Field(0.9, gt=0, lt=1)
    retention: float | None = Field(None, ge=0)
    bootstrap_replications: int = Field(400, ge=100, le=10_000)
    seed: int = 1405


class UtilityRequest(BaseModel):
    coverage: Literal["total", "own_damage", "third_party"] = "total"
    wealth: float = Field(100_000_000, gt=0)
    risk_aversion: float = Field(1e-8, gt=0, le=1)
    retention: float = Field(10_000_000, ge=0)
    severity_model: Literal["empirical", "lognormal", "pareto"] = "empirical"


class IndividualRequest(BaseModel):
    portfolio_size: int = Field(100, ge=2, le=500)
    confidence: float = Field(0.95, gt=0, lt=1)


class CollectiveRequest(BaseModel):
    frequency_mean: float = Field(100, gt=0, le=2_000)
    severity_mean: float = Field(80_000, gt=0)
    severity_sigma: float = Field(0.8, gt=0, le=3)
    simulations: int = Field(10_000, ge=500, le=100_000)
    seed: int = 1405


class RuinRequest(BaseModel):
    initial_capital: float = Field(30_000_000, ge=0)
    monthly_mean_loss: float = Field(10_000_000, gt=0)
    safety_loading: float = Field(0.2, gt=-1, le=5)
    horizon: int = Field(24, ge=1, le=240)
    paths: int = Field(10_000, ge=500, le=100_000)
    severity_model: Literal["lognormal", "gamma", "pareto"] = "lognormal"
    shape: float = Field(1.5, gt=0, le=20)
    retention: float | None = Field(None, gt=0)
    seed: int = 1405

    @model_validator(mode="after")
    def valid_pareto(self):
        if self.severity_model == "pareto" and self.shape <= 1:
            raise ValueError("Pareto shape must exceed one for finite expected loss")
        return self


app = FastAPI(
    title="Actuarial Risk Theory Laboratory API",
    version=APP_VERSION,
    description="Validated calculations over a reconciled synthetic motor-insurance portfolio.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@lru_cache(maxsize=1)
def monthly_rows() -> list[dict[str, float | int | str]]:
    assert_reconciled()
    path = default_paths().derived / "monthly_portfolio.csv"
    with path.open("r", encoding="utf-8", newline="") as handle:
        rows = []
        for raw in csv.DictReader(handle):
            rows.append(
                {
                    "month_id": raw["month_id"],
                    **{
                        column: int(raw[column]) if column in set(EXPECTED_COLUMNS[:4]) else float(raw[column])
                        for column in EXPECTED_COLUMNS
                    },
                }
            )
        return rows


def coverage_losses(coverage: str) -> np.ndarray:
    field = {
        "total": "Total_Payout_Amount",
        "own_damage": "Total_Own_Damage_Amount",
        "third_party": "Total_Third_Party_Amount",
    }[coverage]
    return np.array([float(row[field]) for row in monthly_rows()])


def serialize(result):
    return result.serializable()


@app.exception_handler(ValueError)
async def value_error_handler(_, exc: ValueError):
    return __import__("fastapi").responses.JSONResponse(
        status_code=422,
        content={"error": {"code": "INVALID_SCENARIO", "message": str(exc), "recoverable": True}},
    )


@app.get("/api/health")
def health():
    return {"status": "ok", "version": APP_VERSION}


@app.get("/api/readiness")
def readiness():
    try:
        summary = assert_reconciled()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"status": "ready", "reconciliation": summary}


@app.get("/api/version")
def version():
    generation = json.loads((ROOT / "data" / "manifests" / "generation.json").read_text(encoding="utf-8"))
    return {"application": APP_VERSION, "generator": generation["generator_version"]}


@app.get("/api/source")
def source():
    return json.loads((ROOT / "data" / "manifests" / "source.json").read_text(encoding="utf-8"))


@app.get("/api/reconciliation")
def reconciliation():
    return assert_reconciled()


@app.get("/api/contributors")
def contributors():
    return json.loads((ROOT / "provenance" / "contributions.json").read_text(encoding="utf-8"))


@app.get("/api/portfolio/summary")
def portfolio_summary():
    rows = monthly_rows()
    payouts = coverage_losses("total")
    return {
        "result_type": "source_data",
        "months": len(rows),
        "total_payout": float(payouts.sum()),
        "mean_payout": float(payouts.mean()),
        "p95_payout": float(np.quantile(payouts, 0.95, method="inverted_cdf")),
        "maximum_payout": float(payouts.max()),
        "assumptions": ["Rows are independent synthetic months, not calendar history."],
    }


@app.get("/api/portfolio/month/{month_id}")
def month_lineage(month_id: str):
    if not month_id.startswith("M") or len(month_id) != 5:
        raise HTTPException(status_code=404, detail="Unknown month identifier")
    row = next((item for item in monthly_rows() if item["month_id"] == month_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Unknown month identifier")
    accident_path = default_paths().derived / "accidents.csv.gz"
    claim_path = default_paths().derived / "claims.csv.gz"
    with gzip.open(accident_path, "rt", encoding="utf-8", newline="") as handle:
        accidents = [item for item in csv.DictReader(handle) if item["month_id"] == month_id]
    with gzip.open(claim_path, "rt", encoding="utf-8", newline="") as handle:
        claims = [item for item in csv.DictReader(handle) if item["month_id"] == month_id]
    return {
        "source_month": row,
        "reconstructed": {
            "accident_count": len(accidents),
            "claim_count": len(claims),
            "linked_policy_count": len({item["policy_id"] for item in accidents}),
            "claim_total": sum(float(item["amount"]) for item in claims),
        },
        "result_type": "reconstructed",
        "lineage": ["monthly aggregate", "accidents", "claims", "policies"],
    }


@app.post("/api/risk-measures")
def risk_measures(request: RiskRequest):
    losses = coverage_losses(request.coverage)
    if request.retention is not None:
        losses, _ = retained_losses(losses, request.retention)
    method = {
        "empirical": lambda: empirical_var_tvar(losses, request.confidence),
        "normal": lambda: normal_var_tvar(losses, request.confidence),
        "evt": lambda: evt_var_tvar(losses, request.confidence, request.threshold_quantile),
    }[request.method]
    result = method().serializable()
    result["bootstrap"] = serialize(bootstrap_var(losses, request.confidence, request.bootstrap_replications, request.seed))
    return result


@app.post("/api/utility-reinsurance")
def utility_reinsurance(request: UtilityRequest):
    losses = coverage_losses(request.coverage)
    return {
        "certainty_equivalent": serialize(exponential_certainty_equivalent(losses, request.wealth, request.risk_aversion)),
        "reinsurance": serialize(stop_loss(losses, request.retention)),
        "theoretical_entropic": serialize(theoretical_entropic_availability(request.severity_model, request.retention)),
    }


@app.post("/api/individual-risk")
def individual_risk(request: IndividualRequest):
    policy_path = default_paths().derived / "policies.csv"
    with policy_path.open("r", encoding="utf-8", newline="") as handle:
        policies = list(csv.DictReader(handle))[: request.portfolio_size]
    q = [float(item["claim_probability"]) for item in policies]
    b = [float(item["benefit_proxy"]) for item in policies]
    return {
        "moments": serialize(bernoulli_portfolio(q, b)),
        "approximations": serialize(approximation_quantiles(q, b, request.confidence)),
    }


@app.get("/api/frequency-fit")
def frequency_fit(model: Literal["poisson", "negative_binomial"] = Query("poisson")):
    counts = [row["Total_Accidents"] for row in monthly_rows()]
    return serialize(fit_frequency(counts, model))


@app.post("/api/collective-risk")
def collective_risk(request: CollectiveRequest):
    return serialize(simulate_compound_poisson(**request.model_dump()))


@app.post("/api/ruin")
def ruin(request: RuinRequest):
    simulated = simulate_discrete_ruin(**request.model_dump())
    response = {"simulation": serialize(simulated), "theory": None}
    if request.severity_model == "pareto" and request.retention is None:
        response["theory"] = {
            "applicable": False,
            "message": "Unbounded Pareto losses have no positive MGF, so adjustment-coefficient and Lundberg results are disabled.",
        }
    else:
        coefficient = adjustment_coefficient_exponential(request.monthly_mean_loss, max(request.safety_loading, 1e-9))
        response["theory"] = {
            "coefficient": serialize(coefficient),
            "lundberg": serialize(lundberg_bound(request.initial_capital, coefficient.values["adjustment_coefficient"])),
        }
    return response

