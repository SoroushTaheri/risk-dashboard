"""
Academic provenance
-------------------
Adapted from: Students Work/PCh2/files/Risk_Measures_and_Risk_Comparison.py
Contributors: محمدرضا سعیدخانی، محمد مهدوی نسب، علی جهانبان، محمد اشکوری
Related nonlinear contribution: نجمه زارع

Integration changes:
- separated empirical, normal, and EVT methods;
- corrected quantile/tail conventions and added threshold validation;
- generalized retention and bootstrap comparisons;
- labels delta-gamma as a constructed exposure rather than raw portfolio loss.
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from .common import ActuarialResult, as_finite_sample, validate_probability


def empirical_var_tvar(losses, confidence: float = 0.95) -> ActuarialResult:
    sample = as_finite_sample(losses)
    confidence = validate_probability(confidence, name="confidence")
    var = float(np.quantile(sample, confidence, method="inverted_cdf"))
    tail = sample[sample >= var]
    tvar = float(tail.mean())
    return ActuarialResult(
        values={"var": var, "tvar": tvar, "tail_count": int(tail.size), "sample_size": int(sample.size)},
        result_type="empirical",
        assumptions=["Each supplied loss receives equal empirical weight.", "TVaR uses the inclusive empirical tail at VaR."],
    )


def normal_var_tvar(losses, confidence: float = 0.95) -> ActuarialResult:
    sample = as_finite_sample(losses)
    confidence = validate_probability(confidence, name="confidence")
    mean, sigma = float(sample.mean()), float(sample.std(ddof=1))
    if sigma <= 0:
        raise ValueError("normal approximation requires positive sample variance")
    z = float(stats.norm.ppf(confidence))
    var = mean + sigma * z
    tvar = mean + sigma * float(stats.norm.pdf(z)) / (1 - confidence)
    return ActuarialResult(
        values={"var": var, "tvar": tvar, "mean": mean, "standard_deviation": sigma},
        result_type="approximate",
        assumptions=["Losses are approximated by a normal distribution.", "The upper tail is light and symmetric enough for this approximation."],
        message="Normal VaR can understate the heavy right tail of motor losses.",
    )


def evt_var_tvar(losses, confidence: float = 0.99, threshold_quantile: float = 0.9) -> ActuarialResult:
    sample = as_finite_sample(losses)
    confidence = validate_probability(confidence, name="confidence")
    threshold_quantile = validate_probability(threshold_quantile, name="threshold_quantile")
    if confidence <= threshold_quantile:
        raise ValueError("EVT confidence must exceed the threshold quantile")
    threshold = float(np.quantile(sample, threshold_quantile))
    excesses = sample[sample > threshold] - threshold
    if excesses.size < 25:
        raise ValueError("EVT threshold leaves fewer than 25 exceedances")
    shape, _, scale = stats.genpareto.fit(excesses, floc=0)
    if scale <= 0 or shape >= 1:
        raise ValueError("fitted EVT tail has no finite mean or invalid scale")
    exceedance_probability = excesses.size / sample.size
    tail_probability = (1 - confidence) / exceedance_probability
    if abs(shape) < 1e-9:
        var = threshold - scale * np.log(tail_probability)
    else:
        var = threshold + scale / shape * (tail_probability ** (-shape) - 1)
    tvar = (var + scale - shape * threshold) / (1 - shape)
    return ActuarialResult(
        values={
            "var": float(var),
            "tvar": float(tvar),
            "threshold": threshold,
            "exceedances": int(excesses.size),
            "shape": float(shape),
            "scale": float(scale),
        },
        result_type="fitted",
        assumptions=["Threshold exceedances follow a generalized Pareto distribution.", "Synthetic monthly portfolio losses are identically distributed draws from the stationary model."],
        convergence="converged",
        message="Tail estimates are sensitive to the selected threshold.",
    )


def retained_losses(losses, retention: float):
    sample = as_finite_sample(losses)
    if retention < 0:
        raise ValueError("retention must be non-negative")
    retained = np.minimum(sample, float(retention))
    ceded = np.maximum(sample - float(retention), 0)
    return retained, ceded


def bootstrap_var(losses, confidence: float = 0.95, replications: int = 400, seed: int = 1405) -> ActuarialResult:
    sample = as_finite_sample(losses)
    validate_probability(confidence, name="confidence")
    if not 100 <= replications <= 10_000:
        raise ValueError("replications must be between 100 and 10,000")
    rng = np.random.default_rng(seed)
    estimates = np.quantile(
        rng.choice(sample, size=(replications, sample.size), replace=True),
        confidence,
        axis=1,
        method="inverted_cdf",
    )
    return ActuarialResult(
        values={
            "estimate": float(np.quantile(sample, confidence, method="inverted_cdf")),
            "lower": float(np.quantile(estimates, 0.025)),
            "upper": float(np.quantile(estimates, 0.975)),
            "replications": replications,
        },
        result_type="simulated",
        assumptions=["Non-parametric bootstrap of the synthetic monthly portfolio-loss sample."],
    )
