"""
Academic provenance
-------------------
Adapted from: Students Work/Ch2/files/پیچش.R and approximation.R
Contributor: نجمه زارع

Integration changes:
- ports convolution and moment approximations to validated Python;
- corrects sparse probability-vector handling;
- distinguishes exact independent aggregation from dependent scenarios;
- adds normal and translated-gamma distribution summaries.
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


def approximation_quantiles(probabilities, benefits, confidence: float = 0.95) -> ActuarialResult:
    confidence = validate_probability(confidence, name="confidence")
    moments = bernoulli_portfolio(probabilities, benefits).values
    mean, variance = moments["mean"], moments["variance"]
    sd = variance**0.5
    if sd <= 0:
        raise ValueError("approximation requires positive variance")
    z = float(stats.norm.ppf(confidence))
    skew = moments["third_central_moment"] / sd**3
    normal = mean + z * sd
    normal_power = mean + sd * (z + skew * (z**2 - 1) / 6)
    if moments["third_central_moment"] > 0:
        alpha = 4 / skew**2
        scale = sd / np.sqrt(alpha)
        shift = mean - alpha * scale
        translated_gamma = shift + float(stats.gamma.ppf(confidence, a=alpha, scale=scale))
    else:
        translated_gamma = normal
    return ActuarialResult(
        values={"normal": normal, "normal_power": normal_power, "translated_gamma": translated_gamma, "skewness": skew},
        result_type="approximate",
        assumptions=["Policy risks are independent.", "Approximations match the first moments of the synthetic portfolio."],
    )

