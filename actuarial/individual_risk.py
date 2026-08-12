"""
Academic provenance
-------------------
Chapter reference: Modern Actuarial Risk Theory, Chapter 2
Student method source: Students Work/Ch2/files/approximation.R
Contributor: نجمه زارع

Integration changes:
- represents each policy by its full 1,000-month empirical loss distribution;
- applies the Chapter 2 independent-policy moment identities without replacing
  variable claim amounts by a fixed Bernoulli benefit;
- ports the submitted Normal, Normal Power and translated-gamma approximations
  to validated Python;
- distinguishes the independent-policy approximation from the same-month
  empirical aggregate that retains shared-accident dependence.

The separately submitted convolution file combines two aggregate
accident-count distributions. It is retained as provenance, but is not used
here because its unit is not an individual policy loss.
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from .common import ActuarialResult, validate_probability


def bernoulli_portfolio(probabilities, benefits) -> ActuarialResult:
    q = np.asarray(probabilities, dtype=float)
    b = np.asarray(benefits, dtype=float)
    if q.ndim != 1 or b.ndim != 1 or q.size == 0 or q.shape != b.shape:
        raise ValueError("probabilities and benefits must be equal non-empty vectors")
    if np.any((q < 0) | (q > 1)) or np.any(b < 0):
        raise ValueError("probabilities must be in [0,1] and benefits non-negative")
    mean = float(np.sum(q * b))
    variance = float(np.sum(q * (1 - q) * b**2))
    third_central = float(np.sum(q * (1 - q) * (1 - 2 * q) * b**3))
    return ActuarialResult(
        values={"mean": mean, "variance": variance, "standard_deviation": variance**0.5, "third_central_moment": third_central},
        result_type="reconstructed",
        assumptions=["Policy losses are independent Bernoulli benefit risks.", "Probabilities and benefits are synthetic policy-model quantities."],
    )


def independent_policy_moments(policy_month_losses) -> ActuarialResult:
    """Aggregate empirical policy marginals after setting cross-policy covariance to zero."""
    losses = np.asarray(policy_month_losses, dtype=float)
    if losses.ndim != 2 or losses.shape[0] == 0 or losses.shape[1] < 2:
        raise ValueError("policy_month_losses must be a non-empty policy-by-month matrix")
    if np.any(~np.isfinite(losses)) or np.any(losses < 0):
        raise ValueError("policy month losses must be finite and non-negative")

    policy_means = losses.mean(axis=1)
    policy_variances = losses.var(axis=1, ddof=1)
    centered = losses - policy_means[:, None]
    policy_third_central = np.mean(centered**3, axis=1)
    positive = losses[losses > 0]

    mean = float(policy_means.sum())
    variance = float(policy_variances.sum())
    return ActuarialResult(
        values={
            "mean": mean,
            "variance": variance,
            "standard_deviation": variance**0.5,
            "third_central_moment": float(policy_third_central.sum()),
            "mean_nonzero_probability": float(np.mean(np.count_nonzero(losses, axis=1) / losses.shape[1])),
            "mean_positive_policy_month_loss": float(positive.mean()) if positive.size else 0.0,
            "policy_count": int(losses.shape[0]),
            "months_per_policy": int(losses.shape[1]),
        },
        result_type="reconstructed",
        assumptions=[
            "Each row is one policy's empirical monthly paid-loss distribution, including zero-loss months.",
            "Policy marginal means, variances, and skewness are retained.",
            "Cross-policy covariance is set to zero only when aggregating the independent benchmark.",
        ],
    )


def exact_integer_convolution(probability_vectors: list[list[float]]) -> ActuarialResult:
    if not probability_vectors:
        raise ValueError("at least one probability vector is required")
    aggregate = np.array([1.0])
    for raw in probability_vectors:
        vector = np.asarray(raw, dtype=float)
        if vector.ndim != 1 or vector.size == 0 or np.any(vector < 0):
            raise ValueError("probability vectors must be one-dimensional and non-negative")
        if not np.isclose(vector.sum(), 1.0, atol=1e-10):
            raise ValueError("each probability vector must sum to one")
        aggregate = np.convolve(aggregate, vector)
    aggregate /= aggregate.sum()
    return ActuarialResult(
        values={"probability_mass": aggregate.tolist(), "support": list(range(aggregate.size))},
        result_type="textbook_scenario",
        assumptions=["All component risks are independent.", "Loss amounts lie on a common integer grid."],
    )


def approximation_quantiles_from_moments(
    mean: float,
    variance: float,
    third_central_moment: float,
    confidence: float = 0.95,
) -> ActuarialResult:
    confidence = validate_probability(confidence, name="confidence")
    if not np.isfinite(mean) or not np.isfinite(variance) or not np.isfinite(third_central_moment):
        raise ValueError("moments must be finite")
    if variance <= 0:
        raise ValueError("approximation requires positive variance")
    sd = variance**0.5
    z = float(stats.norm.ppf(confidence))
    skew = third_central_moment / sd**3
    normal = mean + z * sd
    normal_power = mean + sd * (z + skew * (z**2 - 1) / 6)
    if third_central_moment > 0:
        alpha = 4 / skew**2
        scale = sd / np.sqrt(alpha)
        shift = mean - alpha * scale
        translated_gamma = shift + float(stats.gamma.ppf(confidence, a=alpha, scale=scale))
    else:
        translated_gamma = normal
    return ActuarialResult(
        values={"normal": normal, "normal_power": normal_power, "translated_gamma": translated_gamma, "skewness": skew},
        result_type="approximate",
        assumptions=[
            "Approximations use the first three moments of the independent-policy aggregate.",
            "Normal Power and translated-gamma retain the aggregate skewness correction described in Chapter 2.",
        ],
    )


def approximation_quantiles(probabilities, benefits, confidence: float = 0.95) -> ActuarialResult:
    """Textbook fixed-benefit special case kept for controlled examples."""
    moments = bernoulli_portfolio(probabilities, benefits).values
    return approximation_quantiles_from_moments(
        moments["mean"],
        moments["variance"],
        moments["third_central_moment"],
        confidence,
    )
