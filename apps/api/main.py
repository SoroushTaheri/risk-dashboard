from __future__ import annotations

import csv
import gzip
import json
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from actuarial.collective_risk import fit_frequency
from actuarial.data_pipeline import assert_reconciled, default_paths
from actuarial.individual_risk import approximation_quantiles, bernoulli_portfolio
from actuarial.risk_measures import bootstrap_var, empirical_var_tvar, evt_var_tvar, normal_var_tvar, retained_losses
from actuarial.utility_reinsurance import stop_loss, theoretical_entropic_availability, utility_certainty_equivalent, utility_reinsurance_premium

ROOT = Path(__file__).resolve().parents[2]
APP_VERSION = "2.1.0"
Coverage = Literal["total", "own_damage", "third_party_liability"]


class RiskRequest(BaseModel):
    coverage: Coverage = "total"
    confidence: float = Field(0.95, gt=0, lt=1)
    method: Literal["empirical", "normal", "evt"] = "empirical"
    threshold_quantile: float = Field(0.9, gt=0, lt=1)
    retention: float | None = Field(None, ge=0)
    bootstrap_replications: int = Field(400, ge=100, le=10_000)
    seed: int = 1405


class UtilityRequest(BaseModel):
    coverage: Coverage = "total"
    wealth: float = Field(10_000, gt=0)
    risk_aversion: float = Field(5 / 110_000, gt=0, le=1)
    utility: Literal["exponential", "logarithmic", "power"] = "exponential"
    retention: float = Field(4_000, ge=0)
    severity_model: Literal["empirical", "lognormal", "pareto"] = "empirical"


class IndividualRequest(BaseModel):
    portfolio_size: int = Field(500, ge=2, le=17_000)
    coverage: Literal["all", "own_damage", "third_party_liability"] = "all"
    segment: Literal["all", "standard", "preferred", "commercial"] = "all"
    confidence: float = Field(0.95, gt=0, lt=1)


class CollectiveRequest(BaseModel):
    coverage: Coverage = "total"
    confidence: float = Field(0.95, gt=0, lt=1)


class RuinRequest(BaseModel):
    coverage: Coverage = "total"
    initial_capital: float = Field(15_000, ge=0)
    safety_loading: float = Field(0.2, gt=-1, le=5)
    horizon: int = Field(24, ge=1, le=240)
    paths: int = Field(10_000, ge=500, le=100_000)
    retention: float | None = Field(None, gt=0)
    seed: int = 1405


app = FastAPI(
    title="Actuarial Risk Theory Laboratory API",
    version=APP_VERSION,
    description="Validated calculations over a reconciled entity-first synthetic motor-insurance portfolio.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _read_gzip_csv(path: Path) -> list[dict[str, str]]:
    with gzip.open(path, "rt", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


@lru_cache(maxsize=1)
def month_rows() -> list[dict[str, float | int | str]]:
    assert_reconciled()
    rows: list[dict[str, float | int | str]] = []
    for raw in _read_csv(default_paths().derived / "months.csv"):
        rows.append(
            {
                "Month_ID": raw["month_id"],
                "Accident_Count": int(raw["accident_count"]),
                "At_Fault_Own_Damage_Claim_Count": int(raw["at_fault_own_damage_claim_count"]),
                "Injured_Party_Excess_Own_Damage_Claim_Count": int(
                    raw["injured_party_excess_own_damage_claim_count"]
                ),
                "Third_Party_Liability_Claim_Count": int(raw["third_party_liability_claim_count"]),
                "Total_Claim_Count": int(raw["total_claim_count"]),
                "Own_Damage_Paid_Million_Toman": float(raw["own_damage_paid_million_toman"]),
                "Third_Party_Property_Paid_Million_Toman": float(
                    raw["third_party_property_paid_million_toman"]
                ),
                "Third_Party_Bodily_Paid_Million_Toman": float(
                    raw["third_party_bodily_paid_million_toman"]
                ),
                "Total_Insurer_Paid_Loss_Million_Toman": float(
                    raw["total_insurer_paid_loss_million_toman"]
                ),
                "Uncovered_Property_Excess_Million_Toman": float(
                    raw["uncovered_property_excess_million_toman"]
                ),
            }
        )
    return rows


@lru_cache(maxsize=1)
def policies() -> list[dict[str, str]]:
    assert_reconciled()
    return _read_csv(default_paths().derived / "policies.csv")


@lru_cache(maxsize=1)
def claims() -> list[dict[str, str]]:
    assert_reconciled()
    return _read_gzip_csv(default_paths().derived / "claims.csv.gz")


def coverage_losses(coverage: str) -> np.ndarray:
    rows = month_rows()
    if coverage == "total":
        return np.array([float(row["Total_Insurer_Paid_Loss_Million_Toman"]) for row in rows])
    if coverage == "own_damage":
        return np.array([float(row["Own_Damage_Paid_Million_Toman"]) for row in rows])
    if coverage == "third_party_liability":
        return np.array(
            [
                float(row["Third_Party_Property_Paid_Million_Toman"])
                + float(row["Third_Party_Bodily_Paid_Million_Toman"])
                for row in rows
            ]
        )
    raise ValueError("unknown coverage")


def serialize(result):
    return result.serializable()


@app.exception_handler(ValueError)
async def value_error_handler(_, exc: ValueError):
    return __import__("fastapi").responses.JSONResponse(
        status_code=422,
        content={"error": {"code": "INVALID_MONTH", "message": str(exc), "recoverable": True}},
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
    summary = json.loads((ROOT / "public" / "data" / "summary.json").read_text(encoding="utf-8"))
    return {
        "result_type": "simulated",
        **summary,
        "assumptions": [
            "Each row is one synthetic month of the stationary portfolio; M identifiers preserve order but are not real calendar dates.",
            "Own-damage and third-party liability are separate policies.",
            "Uncovered property excess is excluded from insurer-paid loss.",
        ],
    }


@app.get("/api/portfolio/month/{month_id}")
def month_lineage(month_id: str):
    if not month_id.startswith("M") or len(month_id) != 5:
        raise HTTPException(status_code=404, detail="Unknown month identifier")
    row = next((item for item in month_rows() if item["Month_ID"] == month_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Unknown month identifier")
    month_accidents = [
        item
        for item in _read_gzip_csv(default_paths().derived / "accidents.csv.gz")
        if item["month_id"] == month_id
    ]
    month_claims = [item for item in claims() if item["month_id"] == month_id]
    return {
        "month": row,
        "entities": {
            "accident_count": len(month_accidents),
            "claim_count": len(month_claims),
            "linked_policy_count": len({item["policy_id"] for item in month_claims}),
            "insurer_paid_loss": sum(float(item["insurer_paid_million_toman"]) for item in month_claims),
        },
        "result_type": "simulated",
        "lineage": ["vehicles", "separate policies", "accidents", "claims", "paid-loss components"],
    }


@app.get("/api/portfolio/scenario/{scenario_id}", status_code=410)
def obsolete_scenario_route(scenario_id: str):
    raise HTTPException(
        status_code=410,
        detail=f"{scenario_id} used the superseded scenario contract; use /api/portfolio/month/M0001.",
    )


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
    result["coverage"] = request.coverage
    result["monetary_unit"] = "synthetic Spring 1405 million tomans"
    result["bootstrap"] = serialize(
        bootstrap_var(losses, request.confidence, request.bootstrap_replications, request.seed)
    )
    return result


@app.post("/api/utility-reinsurance")
def utility_reinsurance(request: UtilityRequest):
    losses = coverage_losses(request.coverage)
    comparison = []
    for utility in ("exponential", "logarithmic", "power"):
        budget = utility_reinsurance_premium(
            losses, request.retention, request.wealth, request.risk_aversion, utility
        )
        comparison.append(
            {
                "utility": utility,
                "maximum_acceptable_premium": budget.values["maximum_acceptable_premium"],
                "expected_ceded_loss": budget.values["expected_ceded_loss"],
                "absolute_risk_aversion_at_wealth": budget.values["absolute_risk_aversion_at_wealth"],
                "absolute_risk_aversion_after_expected_loss": budget.values[
                    "absolute_risk_aversion_after_expected_loss"
                ],
            }
        )
    return {
        "coverage": request.coverage,
        "utility": request.utility,
        "certainty_equivalent": serialize(
            utility_certainty_equivalent(losses, request.wealth, request.risk_aversion, request.utility)
        ),
        "reinsurance": serialize(stop_loss(losses, request.retention)),
        "reinsurance_budget": serialize(
            utility_reinsurance_premium(
                losses, request.retention, request.wealth, request.risk_aversion, request.utility
            )
        ),
        "comparison": comparison,
        "theoretical_entropic": serialize(
            theoretical_entropic_availability(request.severity_model, request.retention)
        ),
    }


@app.post("/api/individual-risk")
def individual_risk(request: IndividualRequest):
    eligible = [
        policy
        for policy in policies()
        if (request.coverage == "all" or policy["coverage_type"] == request.coverage)
        and (request.segment == "all" or policy["segment"] == request.segment)
    ]
    selected = eligible[: request.portfolio_size]
    if len(selected) < 2:
        raise ValueError("selected policy set must contain at least two policies")
    selected_ids = {item["policy_id"] for item in selected}
    q = [float(item["empirical_claim_probability"]) for item in selected]
    b = [float(item["mean_paid_loss_million_toman"]) for item in selected]
    if not any(q) or not any(b):
        raise ValueError("selected policy set has no simulated claims")
    empirical_by_month: dict[str, float] = defaultdict(float)
    for claim in claims():
        if claim["policy_id"] in selected_ids:
            empirical_by_month[claim["month_id"]] += float(claim["insurer_paid_million_toman"])
    sample = np.array(
        [empirical_by_month.get(f"M{index + 1:04d}", 0.0) for index in range(1_000)],
        dtype=float,
    )
    return {
        "policy_count": len(selected),
        "coverage": request.coverage,
        "segment": request.segment,
        "independent_moments": serialize(bernoulli_portfolio(q, b)),
        "independent_approximations": serialize(approximation_quantiles(q, b, request.confidence)),
        "shared_accident_empirical": {
            "result_type": "simulated",
            "mean": float(sample.mean()),
            "variance": float(sample.var(ddof=1)),
            "standard_deviation": float(sample.std(ddof=1)),
            "quantile": float(np.quantile(sample, request.confidence, method="inverted_cdf")),
            "month_losses": sample.tolist(),
        },
    }


@app.get("/api/frequency-fit")
def frequency_fit(
    model: Literal["poisson", "negative_binomial"] = Query("poisson"),
    unit: Literal["accident", "claim"] = Query("claim"),
    coverage: Coverage = Query("total"),
):
    if unit == "accident":
        if coverage != "total":
            raise ValueError("accident frequency has no policy coverage; use coverage=total")
        counts = [int(row["Accident_Count"]) for row in month_rows()]
    elif coverage == "own_damage":
        counts = [
            int(row["At_Fault_Own_Damage_Claim_Count"])
            + int(row["Injured_Party_Excess_Own_Damage_Claim_Count"])
            for row in month_rows()
        ]
    elif coverage == "third_party_liability":
        counts = [int(row["Third_Party_Liability_Claim_Count"]) for row in month_rows()]
    else:
        counts = [int(row["Total_Claim_Count"]) for row in month_rows()]
    result = serialize(fit_frequency(counts, model))
    result["unit"] = unit
    result["coverage"] = coverage
    return result


@app.post("/api/collective-risk")
def collective_risk(request: CollectiveRequest):
    month_claims: dict[str, list[dict[str, str]]] = defaultdict(list)
    eligible_claims = []
    for claim in claims():
        if request.coverage == "total" or claim["coverage_type"] == request.coverage:
            month_claims[claim["month_id"]].append(claim)
            eligible_claims.append(claim)
    counts = np.array([len(month_claims.get(f"M{index + 1:04d}", [])) for index in range(1_000)])
    severities = np.array([float(item["insurer_paid_million_toman"]) for item in eligible_claims])
    aggregate = coverage_losses(request.coverage)

    def component(coverage: str):
        selected = [item for item in claims() if item["coverage_type"] == coverage]
        count_by_month: dict[str, int] = defaultdict(int)
        for item in selected:
            count_by_month[item["month_id"]] += 1
        component_counts = np.array([count_by_month.get(f"M{index + 1:04d}", 0) for index in range(1_000)])
        component_severity = np.array([float(item["insurer_paid_million_toman"]) for item in selected])
        return {
            "coverage": coverage,
            "mean_frequency": float(component_counts.mean()),
            "mean_severity": float(component_severity.mean()),
            "expected_aggregate_loss": float(component_counts.mean() * component_severity.mean()),
        }

    components = (
        [component("own_damage"), component("third_party_liability")]
        if request.coverage == "total"
        else [component(request.coverage)]
    )
    expected_from_components = sum(item["expected_aggregate_loss"] for item in components)
    return {
        "result_type": "simulated",
        "coverage": request.coverage,
        "frequency_unit": "claims",
        "mean_frequency": float(counts.mean()),
        "mean_severity": float(severities.mean()),
        "empirical_mean_aggregate_loss": float(aggregate.mean()),
        "component_expected_aggregate_loss": expected_from_components,
        "identity_relative_error": abs(expected_from_components / float(aggregate.mean()) - 1.0),
        "p95_aggregate_loss": float(np.quantile(aggregate, request.confidence, method="inverted_cdf")),
        "components": components,
    }


@app.post("/api/ruin")
def ruin(request: RuinRequest):
    gross = coverage_losses(request.coverage)
    retained = np.minimum(gross, request.retention) if request.retention is not None else gross
    mean_retained = float(retained.mean())
    premium = mean_retained * (1.0 + request.safety_loading)
    rng = np.random.default_rng(request.seed)
    draws = rng.choice(retained, size=(request.paths, request.horizon), replace=True)
    surplus = request.initial_capital + np.cumsum(premium - draws, axis=1)
    ruined = np.any(surplus < 0, axis=1)
    probability = float(ruined.mean())
    standard_error = float(np.sqrt(probability * (1.0 - probability) / request.paths))
    return {
        "result_type": "simulated",
        "coverage": request.coverage,
        "loss_basis": "retained month-level insurer-paid loss",
        "mean_retained_loss": mean_retained,
        "premium_per_period": premium,
        "retention": request.retention,
        "finite_horizon_ruin_probability": probability,
        "monte_carlo_standard_error": standard_error,
        "horizon": request.horizon,
        "paths": request.paths,
        "seed": request.seed,
        "theory": {
            "applicable": False,
            "message": "No ultimate-ruin or Lundberg result is inferred from the empirical month distribution.",
        },
    }
