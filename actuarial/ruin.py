"""
Academic provenance
-------------------
Adapted from: Students Work/Ch4/files/insurance_ruin_analysis.py
Contributors: ابوالفضل اقراری، حامد اشراقی

Integration changes:
- makes finite horizon, seed, and premium assumptions explicit;
- adds bounded-retention handling shared with reinsurance modules;
- refuses adjustment-coefficient methods for unbounded Pareto losses;
- reports first-ruin timing and Monte Carlo uncertainty.
"""

from __future__ import annotations

import numpy as np
from scipy import optimize

from .common import ActuarialResult


def simulate_discrete_ruin(
    initial_capital: float,
    monthly_mean_loss: float,
    safety_loading: float,
    horizon: int = 24,
    paths: int = 10_000,
    severity_model: str = "lognormal",
    shape: float = 1.0,
    retention: float | None = None,
    seed: int = 1405,
) -> ActuarialResult:
    if initial_capital < 0 or monthly_mean_loss <= 0 or safety_loading <= -1:
        raise ValueError("capital, mean loss, and safety loading are outside valid domains")
    if not 1 <= horizon <= 240 or not 500 <= paths <= 100_000:
        raise ValueError("horizon must be 1..240 and paths 500..100,000")
    if shape <= 0:
        raise ValueError("shape must be positive")
    rng = np.random.default_rng(seed)
    severity_model = severity_model.lower()
    if severity_model == "lognormal":
        mu = np.log(monthly_mean_loss) - shape**2 / 2
        losses = rng.lognormal(mu, shape, size=(paths, horizon))
    elif severity_model == "gamma":
        losses = rng.gamma(shape, monthly_mean_loss / shape, size=(paths, horizon))
    elif severity_model == "pareto":
        if shape <= 1:
            raise ValueError("Pareto shape must exceed one for a finite mean")
        scale = monthly_mean_loss * (shape - 1) / shape
        losses = scale * (1 + rng.pareto(shape, size=(paths, horizon)))
    else:
        raise ValueError("severity_model must be lognormal, gamma, or pareto")
    if retention is not None:
        if retention <= 0:
            raise ValueError("retention must be positive")
        retained = np.minimum(losses, retention)
        expected_retained = float(retained.mean())
    else:
        retained = losses
        expected_retained = monthly_mean_loss
    premium = (1 + safety_loading) * expected_retained
    surplus = initial_capital + np.cumsum(premium - retained, axis=1)
    ruined = surplus < 0
    ever_ruined = ruined.any(axis=1)
    probability = float(ever_ruined.mean())
    standard_error = float(np.sqrt(probability * (1 - probability) / paths))
    first = np.where(ever_ruined, ruined.argmax(axis=1) + 1, 0)
    return ActuarialResult(
        values={
            "finite_horizon_ruin_probability": probability,
            "standard_error": standard_error,
            "confidence_interval_95": [max(0.0, probability - 1.96 * standard_error), min(1.0, probability + 1.96 * standard_error)],
            "mean_first_ruin_month": float(first[first > 0].mean()) if ever_ruined.any() else None,
            "premium_per_month": premium,
            "expected_retained_loss": expected_retained,
            "sample_paths": surplus[: min(paths, 12)].tolist(),
        },
        result_type="simulated",
        assumptions=["Independent monthly aggregate losses.", "Finite-horizon discrete-time surplus process.", "Premium is based on expected retained loss."],
        message="This is a finite-horizon estimate, not an ultimate ruin probability.",
        convergence="fixed_size_monte_carlo",
    )


def adjustment_coefficient_exponential(mean_claim: float, safety_loading: float) -> ActuarialResult:
    if mean_claim <= 0 or safety_loading <= 0:
        raise ValueError("mean_claim and safety_loading must be positive")
    coefficient = safety_loading / ((1 + safety_loading) * mean_claim)
    return ActuarialResult(
        values={"adjustment_coefficient": coefficient},
        result_type="textbook_scenario",
        assumptions=["Compound Poisson model with exponential severity.", "Positive safety loading."],
        convergence="analytical",
    )


def adjustment_coefficient_bounded_sample(losses, premium: float) -> ActuarialResult:
    sample = np.asarray(losses, dtype=float)
    if sample.ndim != 1 or sample.size == 0 or np.any(sample < 0):
        raise ValueError("losses must be a non-negative sample")
    if premium <= sample.mean():
        raise ValueError("premium must exceed expected loss for a positive adjustment coefficient")
    if not np.isfinite(sample.max()):
        raise ValueError("sample must be finite")

    def equation(r: float) -> float:
        scaled = r * sample
        return float(np.exp(scaled - scaled.max()).mean() * np.exp(scaled.max()) - np.exp(r * premium))

    upper = min(1.0 / max(sample.max(), 1.0), 0.1)
    while equation(upper) <= 0 and upper < 10 / max(sample.max(), 1.0):
        upper *= 2
    root = float(optimize.brentq(equation, 1e-12, upper))
    return ActuarialResult(
        values={"adjustment_coefficient": root},
        result_type="empirical",
        assumptions=["Bounded empirical monthly loss distribution.", "Positive premium drift."],
        convergence="root_converged",
    )


def lundberg_bound(initial_capital: float, adjustment_coefficient: float) -> ActuarialResult:
    if initial_capital < 0 or adjustment_coefficient <= 0:
        raise ValueError("capital must be non-negative and coefficient positive")
    return ActuarialResult(
        values={"upper_bound": float(np.exp(-adjustment_coefficient * initial_capital))},
        result_type="approximate",
        assumptions=["A valid positive adjustment coefficient exists.", "Classical ultimate-ruin model assumptions hold."],
    )

