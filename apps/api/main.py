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
from scipy import stats

from actuarial.collective_risk import compound_empirical_model, fit_frequency, fit_severity
from actuarial.data_pipeline import assert_reconciled, default_paths
from actuarial.individual_risk import approximation_quantiles_from_moments, independent_policy_moments
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
    portfolio_size: int = Field(500, ge=2, le=5_000)
    coverage: Literal["all", "own_damage", "third_party_liability"] = "all"
    segment: Literal["all", "standard", "preferred", "commercial"] = "all"
    confidence: float = Field(0.95, gt=0, lt=1)


class CollectiveRequest(BaseModel):
    coverage: Coverage = "total"
    confidence: float = Field(0.95, gt=0, lt=1)
    frequency_model: Literal["poisson", "negative_binomial"] = "poisson"
    method: Literal["monte_carlo", "panjer", "fft"] = "monte_carlo"


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
    policy_index = {item["policy_id"]: index for index, item in enumerate(selected)}
    month_ids = [str(row["Month_ID"]) for row in month_rows()]
    month_index = {month_id: index for index, month_id in enumerate(month_ids)}
    policy_month_losses = np.zeros((len(selected), len(month_ids)), dtype=float)
    for claim in claims():
        row_index = policy_index.get(claim["policy_id"])
        column_index = month_index.get(claim["month_id"])
        if row_index is not None and column_index is not None:
            policy_month_losses[row_index, column_index] += float(claim["insurer_paid_million_toman"])
    if not np.any(policy_month_losses):
        raise ValueError("selected policy set has no simulated claims")

    moments = independent_policy_moments(policy_month_losses)
    moment_values = moments.values
    approximations = approximation_quantiles_from_moments(
        moment_values["mean"],
        moment_values["variance"],
        moment_values["third_central_moment"],
        request.confidence,
    )
    sample = policy_month_losses.sum(axis=0)
    shared_variance = float(sample.var(ddof=1))
    return {
        "policy_count": len(selected),
        "coverage": request.coverage,
        "segment": request.segment,
        "observation_unit": "one policy's insurer-paid loss in one synthetic month",
        "months_per_policy": len(month_ids),
        "independent_moments": serialize(moments),
        "independent_approximations": serialize(approximations),
        "shared_accident_empirical": {
            "result_type": "simulated",
            "mean": float(sample.mean()),
            "variance": shared_variance,
            "standard_deviation": shared_variance**0.5,
            "quantile": float(np.quantile(sample, request.confidence, method="inverted_cdf")),
            "month_losses": sample.tolist(),
        },
        "dependence_effect": {
            "covariance_contribution_to_variance": shared_variance - float(moment_values["variance"]),
            "mean_reconciliation_error": float(sample.mean()) - float(moment_values["mean"]),
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


def _claim_sample(coverage: str) -> tuple[np.ndarray, np.ndarray]:
    selected = [item for item in claims() if item["coverage_type"] == coverage]
    count_by_month: dict[str, int] = defaultdict(int)
    for item in selected:
        count_by_month[item["month_id"]] += 1
    counts = np.array([count_by_month.get(f"M{index + 1:04d}", 0) for index in range(1_000)])
    severities = np.array([float(item["insurer_paid_million_toman"]) for item in selected])
    return counts, severities


@lru_cache(maxsize=24)
def _collective_model(coverage: str, frequency_model: str, method: str) -> dict:
    aggregate = coverage_losses(coverage)
    grid_size = 2048
    grid_width = max(0.25, float(aggregate.max()) * 1.5 / (grid_size - 1))
    component_coverages = (
        ["own_damage", "third_party_liability"]
        if coverage == "total"
        else [coverage]
    )
    component_models = []
    components = []
    all_severities = []
    for index, component_coverage in enumerate(component_coverages):
        component_counts, component_severities = _claim_sample(component_coverage)
        model = compound_empirical_model(
            component_counts,
            component_severities,
            frequency_model,
            method,
            grid_width,
            grid_size=grid_size,
            simulations=20_000,
            seed=1405 + index * 101,
        )
        component_models.append(model)
        all_severities.append(component_severities)
        components.append({
            "coverage": component_coverage,
            "mean_frequency": float(component_counts.mean()),
            "mean_severity": float(component_severities.mean()),
            "expected_aggregate_loss": float(component_counts.mean() * component_severities.mean()),
            "fitted_frequency_variance": model.values["frequency_variance"],
            "fit_message": model.message,
        })

    probability_mass = np.array(component_models[0].values["probability_mass"], dtype=float)
    for component_model in component_models[1:]:
        probability_mass = np.convolve(
            probability_mass,
            np.array(component_model.values["probability_mass"], dtype=float),
        )[:grid_size]
    if probability_mass.size < grid_size:
        probability_mass = np.pad(probability_mass, (0, grid_size - probability_mass.size))

    model_mean = float(sum(item.values["model_mean"] for item in component_models))
    model_variance = float(sum(item.values["model_variance"] for item in component_models))
    represented_mass = float(probability_mass.sum())
    model_cdf = np.cumsum(probability_mass)
    chart_upper_index = min(
        grid_size - 1,
        max(
            int(np.ceil(float(aggregate.max()) / grid_width)),
            int(np.searchsorted(model_cdf, min(0.995, represented_mass), side="left")),
        ),
    )
    loss_edges = np.linspace(0, (chart_upper_index + 1) * grid_width, 57)
    empirical_probability, _ = np.histogram(aggregate, bins=loss_edges)
    empirical_probability = empirical_probability / aggregate.size
    grid_losses = np.arange(grid_size) * grid_width
    model_bins = np.digitize(grid_losses, loss_edges, right=False) - 1
    model_probability = np.array([
        probability_mass[model_bins == index].sum() for index in range(loss_edges.size - 1)
    ])
    chart_losses = ((loss_edges[:-1] + loss_edges[1:]) / 2).tolist()

    severity_sample = np.concatenate(all_severities)
    severity_fits = []
    for severity_model in ("gamma", "inverse_gaussian", "exponential_mixture", "lognormal", "pareto"):
        fitted = fit_severity(severity_sample, severity_model)
        severity_fits.append({
            "model": severity_model,
            "aic": fitted.values["aic"],
            "parameters": fitted.values["parameters"],
        })
    best_aic = min(item["aic"] for item in severity_fits)
    for item in severity_fits:
        item["delta_aic"] = item["aic"] - best_aic

    all_counts = np.sum([_claim_sample(item)[0] for item in component_coverages], axis=0)
    all_severity_mean = float(severity_sample.mean())
    expected_from_components = sum(item["expected_aggregate_loss"] for item in components)
    return {
        "result_type": "simulated" if method == "monte_carlo" else "approximate",
        "coverage": coverage,
        "frequency_model": frequency_model,
        "method": method,
        "frequency_unit": "claims",
        "mean_frequency": float(all_counts.mean()),
        "mean_severity": all_severity_mean,
        "empirical_mean_aggregate_loss": float(aggregate.mean()),
        "component_expected_aggregate_loss": expected_from_components,
        "identity_relative_error": abs(expected_from_components / float(aggregate.mean()) - 1.0),
        "components": components,
        "model_mean": model_mean,
        "model_variance": model_variance,
        "represented_mass": represented_mass,
        "grid_width": grid_width,
        "probability_mass": probability_mass.tolist(),
        "aggregate_distribution": {
            "losses": chart_losses,
            "empirical_probability": empirical_probability.tolist(),
            "model_probability": model_probability.tolist(),
        },
        "severity_fits": severity_fits,
    }


@app.post("/api/collective-risk")
def collective_risk(request: CollectiveRequest):
    base = _collective_model(request.coverage, request.frequency_model, request.method)
    probability_mass = np.array(base["probability_mass"], dtype=float)
    cdf = np.cumsum(probability_mass)
    quantile_index = int(np.searchsorted(cdf, request.confidence, side="left"))
    quantile_index = min(quantile_index, probability_mass.size - 1)
    aggregate = coverage_losses(request.coverage)
    response = {key: value for key, value in base.items() if key != "probability_mass"}
    response.update({
        "model_quantile": quantile_index * base["grid_width"],
        "empirical_quantile": float(np.quantile(aggregate, request.confidence, method="inverted_cdf")),
        "normal_approximation_quantile": float(
            base["model_mean"] + np.sqrt(base["model_variance"]) * stats.norm.ppf(request.confidence)
        ),
    })
    return response


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
    first_ruin_month = np.where(ruined, np.argmax(surplus < 0, axis=1) + 1, 0)
    return {
        "result_type": "simulated",
        "coverage": request.coverage,
        "loss_basis": "retained month-level insurer-paid loss",
        "mean_retained_loss": mean_retained,
        "premium_per_period": premium,
        "retention": request.retention,
        "finite_horizon_ruin_probability": probability,
        "monte_carlo_standard_error": standard_error,
        "ruined_paths": int(ruined.sum()),
        "mean_first_ruin_month": float(first_ruin_month[ruined].mean()) if ruined.any() else None,
        "horizon": request.horizon,
        "paths": request.paths,
        "seed": request.seed,
        "theory": {
            "applicable": False,
            "message": "No ultimate-ruin or Lundberg result is inferred from the empirical month distribution.",
        },
    }
