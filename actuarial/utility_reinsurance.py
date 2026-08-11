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

from typing import Literal

import numpy as np

from .common import ActuarialResult, ApplicabilityError, as_finite_sample


UtilityName = Literal["exponential", "logarithmic", "power"]


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
            "retained_sd": float(retained.std(ddof=1)),
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


def exponential_reinsurance_premium(losses, retention: float, wealth: float, risk_aversion: float) -> ActuarialResult:
    """Maximum premium for replacing gross loss X with retained loss X_R."""
    sample = as_finite_sample(losses)
    if wealth <= 0:
        raise ValueError("wealth must be positive")
    if risk_aversion <= 0:
        raise ValueError("risk_aversion must be positive")
    if retention < 0:
        raise ValueError("retention must be non-negative")

    retained = np.minimum(sample, retention)

    def entropic_premium(values):
        scaled = risk_aversion * values
        pivot = float(scaled.max())
        return (pivot + float(np.log(np.exp(scaled - pivot).mean()))) / risk_aversion

    gross_ce = entropic_premium(sample)
    retained_ce = entropic_premium(retained)
    maximum_premium = gross_ce - retained_ce
    return ActuarialResult(
        values={
            "maximum_acceptable_premium": float(maximum_premium),
            "gross_certainty_equivalent_loss": float(gross_ce),
            "retained_certainty_equivalent_loss": float(retained_ce),
            "expected_ceded_loss": float((sample - retained).mean()),
        },
        result_type="empirical",
        assumptions=[
            "CARA exponential utility for the ceding insurer.",
            "The premium is the utility value of replacing X with X_R plus reinsurance.",
            "Finite-sample entropic estimates use all supplied monthly losses.",
        ],
        convergence="analytical_sample",
    )


def calibrated_utility_parameters(utility: UtilityName, wealth: float, risk_aversion: float) -> dict[str, float]:
    """Match each textbook utility at the same local absolute risk aversion r(w)."""
    if wealth <= 0:
        raise ValueError("wealth must be positive")
    if risk_aversion <= 0:
        raise ValueError("risk_aversion must be positive")
    if utility == "exponential":
        return {"alpha": risk_aversion}
    if utility == "logarithmic":
        return {"alpha": (1.0 / risk_aversion) - wealth}
    if utility == "power":
        exponent = 1.0 - risk_aversion * wealth
        if not 0 < exponent <= 1:
            raise ApplicabilityError("power utility calibration requires 0 < risk_aversion * wealth < 1")
        return {"c": exponent}
    raise ValueError(f"unknown utility function: {utility}")


def _utility_values(
    terminal_wealth: np.ndarray,
    utility: UtilityName,
    parameters: dict[str, float],
) -> np.ndarray:
    if utility == "exponential":
        alpha = parameters["alpha"]
        return -alpha * np.exp(-alpha * terminal_wealth)
    if utility == "logarithmic":
        shifted = parameters["alpha"] + terminal_wealth
        if np.any(shifted <= 0):
            raise ApplicabilityError("logarithmic utility requires alpha + terminal wealth to stay positive")
        return np.log(shifted)
    if utility == "power":
        if np.any(terminal_wealth <= 0):
            raise ApplicabilityError("power utility requires terminal wealth to stay positive")
        return terminal_wealth ** parameters["c"]
    raise ValueError(f"unknown utility function: {utility}")


def _certainty_wealth(expected_utility: float, utility: UtilityName, parameters: dict[str, float]) -> float:
    if utility == "exponential":
        alpha = parameters["alpha"]
        return -np.log(-expected_utility / alpha) / alpha
    if utility == "logarithmic":
        return float(np.exp(expected_utility) - parameters["alpha"])
    if utility == "power":
        return float(expected_utility ** (1.0 / parameters["c"]))
    raise ValueError(f"unknown utility function: {utility}")


def absolute_risk_aversion(
    utility: UtilityName,
    terminal_wealth: float,
    parameters: dict[str, float],
) -> float:
    if utility == "exponential":
        return parameters["alpha"]
    if utility == "logarithmic":
        denominator = parameters["alpha"] + terminal_wealth
        if denominator <= 0:
            raise ApplicabilityError("logarithmic risk aversion is outside its wealth domain")
        return 1.0 / denominator
    if utility == "power":
        if terminal_wealth <= 0:
            raise ApplicabilityError("power risk aversion requires positive wealth")
        return (1.0 - parameters["c"]) / terminal_wealth
    raise ValueError(f"unknown utility function: {utility}")


def utility_certainty_equivalent(
    losses,
    wealth: float,
    risk_aversion: float,
    utility: UtilityName,
) -> ActuarialResult:
    sample = as_finite_sample(losses)
    parameters = calibrated_utility_parameters(utility, wealth, risk_aversion)
    terminal = wealth - sample
    expected_utility = float(_utility_values(terminal, utility, parameters).mean())
    certainty_wealth = _certainty_wealth(expected_utility, utility, parameters)
    expected_loss = float(sample.mean())
    return ActuarialResult(
        values={
            "certainty_equivalent_wealth": certainty_wealth,
            "maximum_acceptable_premium": wealth - certainty_wealth,
            "expected_loss": expected_loss,
            "risk_loading": wealth - certainty_wealth - expected_loss,
            "absolute_risk_aversion_at_wealth": absolute_risk_aversion(utility, wealth, parameters),
            "absolute_risk_aversion_after_expected_loss": absolute_risk_aversion(
                utility, wealth - expected_loss, parameters
            ),
            **parameters,
        },
        result_type="empirical",
        assumptions=[
            f"Textbook {utility} utility over terminal wealth.",
            "Utility parameters are calibrated to the selected absolute risk aversion at starting wealth.",
            "Expected utility uses every supplied monthly loss with equal weight.",
        ],
        convergence="analytical_sample",
    )


def utility_reinsurance_premium(
    losses,
    retention: float,
    wealth: float,
    risk_aversion: float,
    utility: UtilityName,
) -> ActuarialResult:
    """Solve E[u(w-X)] = E[u(w-P-X_R)] for the ceded-layer premium P."""
    sample = as_finite_sample(losses)
    if retention < 0:
        raise ValueError("retention must be non-negative")
    parameters = calibrated_utility_parameters(utility, wealth, risk_aversion)
    retained = np.minimum(sample, retention)
    target = float(_utility_values(wealth - sample, utility, parameters).mean())

    if utility == "exponential":
        result = exponential_reinsurance_premium(sample, retention, wealth, risk_aversion)
        result.values.update(
            {
                "absolute_risk_aversion_at_wealth": risk_aversion,
                "absolute_risk_aversion_after_expected_loss": risk_aversion,
                **parameters,
            }
        )
        return result

    if np.allclose(sample, retained):
        premium = 0.0
    else:
        if utility == "logarithmic":
            domain_cap = wealth + parameters["alpha"] - float(retained.max())
        else:
            domain_cap = wealth - float(retained.max())
        if domain_cap <= 0:
            raise ApplicabilityError(f"{utility} utility has no valid premium interval")
        low = 0.0
        high = float(np.nextafter(domain_cap, 0.0))
        if float(_utility_values(wealth - high - retained, utility, parameters).mean()) > target:
            raise ApplicabilityError(f"{utility} utility equilibrium lies outside its wealth domain")
        for _ in range(100):
            midpoint = (low + high) / 2.0
            candidate = float(_utility_values(wealth - midpoint - retained, utility, parameters).mean())
            if candidate > target:
                low = midpoint
            else:
                high = midpoint
        premium = (low + high) / 2.0

    expected_loss = float(sample.mean())
    certainty = utility_certainty_equivalent(sample, wealth, risk_aversion, utility)
    return ActuarialResult(
        values={
            "maximum_acceptable_premium": premium,
            "expected_ceded_loss": float((sample - retained).mean()),
            "absolute_risk_aversion_at_wealth": certainty.values["absolute_risk_aversion_at_wealth"],
            "absolute_risk_aversion_after_expected_loss": certainty.values[
                "absolute_risk_aversion_after_expected_loss"
            ],
            "expected_loss": expected_loss,
            **parameters,
        },
        result_type="empirical",
        assumptions=[
            f"Textbook {utility} utility for the ceding insurer.",
            "The premium exactly solves the finite-sample expected-utility equilibrium.",
            "Utility parameters are locally matched at starting wealth for a fair comparison.",
        ],
        convergence="bisection",
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
