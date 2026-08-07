"""
Academic provenance
-------------------
Adapted from: Students Work/Ch1/files/Chapter1.ipynb.json
Contributors: ابوالفضل اقراری، حامد اشراقی

Integration changes:
- converted raw notebook functions into validated reusable calculations;
- makes utility parameters explicit and enforces wealth domains;
- reports entropic premiums as finite-sample estimates;
- shares one retained/ceded definition with risk and ruin modules.
"""

from __future__ import annotations

import numpy as np

from .common import ActuarialResult, ApplicabilityError, as_finite_sample


def stop_loss(losses, retention: float) -> ActuarialResult:
    sample = as_finite_sample(losses)
    if retention < 0:
        raise ValueError("retention must be non-negative")
    retained = np.minimum(sample, retention)
    ceded = sample - retained
    return ActuarialResult(
        values={
            "gross_mean": float(sample.mean()),
            "retained_mean": float(retained.mean()),
            "retained_variance": float(retained.var(ddof=1)),
            "net_stop_loss_premium": float(ceded.mean()),
            "ceded_mean": float(ceded.mean()),
            "identity_max_error": float(np.max(np.abs(sample - retained - ceded))),
        },
        result_type="empirical",
        assumptions=["Per-loss excess-of-loss retention.", "No expense or reinsurer loading in the net premium."],
    )


def exponential_certainty_equivalent(losses, wealth: float, risk_aversion: float) -> ActuarialResult:
    sample = as_finite_sample(losses)
    if wealth <= 0:
        raise ValueError("wealth must be positive")
    if risk_aversion <= 0:
        raise ValueError("risk_aversion must be positive")
    scaled = risk_aversion * sample
    pivot = float(scaled.max())
    log_mean_exp = pivot + float(np.log(np.exp(scaled - pivot).mean()))
    premium = log_mean_exp / risk_aversion
    return ActuarialResult(
        values={
            "certainty_equivalent_wealth": wealth - premium,
            "maximum_acceptable_premium": premium,
            "expected_loss": float(sample.mean()),
            "risk_loading": premium - float(sample.mean()),
        },
        result_type="empirical",
        assumptions=["CARA exponential utility.", "Premium is a finite-sample entropic estimate, not a theoretical Pareto MGF."],
        convergence="analytical_sample",
    )


def power_utility_certainty_equivalent(losses, wealth: float, gamma: float) -> ActuarialResult:
    sample = as_finite_sample(losses)
    terminal = wealth - sample
    if wealth <= 0 or np.any(terminal <= 0):
        raise ApplicabilityError("power utility requires positive wealth after every sampled loss")
    if gamma <= 0 or np.isclose(gamma, 1):
        raise ValueError("gamma must be positive and different from 1")
    expected_utility = float(np.mean(terminal ** (1 - gamma) / (1 - gamma)))
    certainty_wealth = float(((1 - gamma) * expected_utility) ** (1 / (1 - gamma)))
    return ActuarialResult(
        values={"certainty_equivalent_wealth": certainty_wealth, "maximum_acceptable_premium": wealth - certainty_wealth},
        result_type="empirical",
        assumptions=["CRRA power utility.", "All terminal wealth outcomes remain strictly positive."],
    )


def theoretical_entropic_availability(severity_model: str, retention: float | None = None) -> ActuarialResult:
    heavy_tail = severity_model.lower() == "pareto"
    bounded = retention is not None and np.isfinite(retention)
    if heavy_tail and not bounded:
        return ActuarialResult(
            values={},
            result_type="fitted",
            applicable=False,
            message="A positive theoretical MGF does not exist for unbounded Pareto severity; use finite-horizon simulation or bounded retention.",
            assumptions=["Unbounded Pareto severity."],
        )
    return ActuarialResult(
        values={"available": True},
        result_type="fitted",
        assumptions=["The selected severity is light-tailed or bounded by retention."],
    )

