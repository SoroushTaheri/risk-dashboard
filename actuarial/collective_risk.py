"""
Academic provenance
-------------------
Adapted from Chapter 3 submissions: 3.5.ipynb, 3.6.ipynb, 3.7.ipynb,
Section_3.8.py, 3.9.py, 3.9-improved.py, and Section_3.10.py.
Contributors: محمد مهدوی نسب، علی جهانبان، محمدرضا سعیدخانی، محمد اشکوری

Integration changes:
- consolidates Panjer, FFT, fitting, approximation, and stop-loss logic;
- repairs sparse-vector normalization and validates domains;
- provides deterministic compound simulation and moment diagnostics;
- keeps textbook examples separate from portfolio-based fitted results.
"""

from __future__ import annotations

import numpy as np
from scipy import stats

from .common import ActuarialResult, as_finite_sample


def fit_frequency(counts, model: str = "poisson") -> ActuarialResult:
    sample = as_finite_sample(counts, name="counts")
    if not np.allclose(sample, np.round(sample)):
        raise ValueError("counts must be integer-valued")
    mean, variance = float(sample.mean()), float(sample.var(ddof=1))
    dispersion = variance / mean if mean > 0 else 0.0
    model = model.lower()
    if model == "poisson":
        parameters = {"lambda": mean}
        warning = "Variance materially exceeds the mean." if dispersion > 1.25 else None
    elif model in {"negative_binomial", "negative-binomial"}:
        if variance <= mean:
            raise ValueError("negative-binomial moment fit requires variance greater than mean")
        size = mean**2 / (variance - mean)
        parameters = {"size": size, "probability": size / (size + mean)}
        warning = None
    else:
        raise ValueError("model must be poisson or negative_binomial")
    return ActuarialResult(
        values={"model": model, "mean": mean, "variance": variance, "dispersion_index": dispersion, "parameters": parameters},
        result_type="fitted",
        assumptions=["Synthetic monthly claim counts are identically distributed draws from the stationary portfolio model."],
        message=warning,
        convergence="moment_fit",
    )


def fit_severity(losses, model: str = "lognormal") -> ActuarialResult:
    sample = as_finite_sample(losses)
    if np.any(sample <= 0):
        raise ValueError("severity fitting requires strictly positive losses")
    model = model.lower()
    if model == "gamma":
        shape, _, scale = stats.gamma.fit(sample, floc=0)
        params = {"shape": float(shape), "scale": float(scale)}
        loglik = float(np.sum(stats.gamma.logpdf(sample, shape, loc=0, scale=scale)))
    elif model == "lognormal":
        sigma, _, scale = stats.lognorm.fit(sample, floc=0)
        params = {"sigma": float(sigma), "scale": float(scale)}
        loglik = float(np.sum(stats.lognorm.logpdf(sample, sigma, loc=0, scale=scale)))
    elif model == "pareto":
        shape, _, scale = stats.pareto.fit(sample, floc=0)
        params = {"shape": float(shape), "scale": float(scale), "finite_mean": bool(shape > 1)}
        loglik = float(np.sum(stats.pareto.logpdf(sample, shape, loc=0, scale=scale)))
    else:
        raise ValueError("model must be gamma, lognormal, or pareto")
    return ActuarialResult(
        values={"model": model, "parameters": params, "aic": 4 - 2 * loglik, "sample_size": int(sample.size)},
        result_type="fitted",
        assumptions=["Claim severities are positive and independent conditional on the selected model."],
        convergence="maximum_likelihood",
    )


def panjer_poisson(severity_pmf, frequency_mean: float, max_loss: int | None = None) -> ActuarialResult:
    f = np.asarray(severity_pmf, dtype=float)
    if f.ndim != 1 or f.size < 2 or np.any(f < 0) or not np.isclose(f.sum(), 1, atol=1e-10):
        raise ValueError("severity_pmf must be a normalized vector including mass at zero")
    if frequency_mean <= 0:
        raise ValueError("frequency_mean must be positive")
    max_loss = max_loss or max(100, (f.size - 1) * int(np.ceil(frequency_mean * 4)))
    if not 1 <= max_loss <= 100_000:
        raise ValueError("max_loss must be between 1 and 100,000")
    g = np.zeros(max_loss + 1)
    g[0] = np.exp(frequency_mean * (f[0] - 1))
    for k in range(1, max_loss + 1):
        upper = min(k, f.size - 1)
        indices = np.arange(1, upper + 1)
        g[k] = frequency_mean / k * np.sum(indices * f[indices] * g[k - indices])
    represented_mass = float(g.sum())
    return ActuarialResult(
        values={"probability_mass": g.tolist(), "represented_mass": represented_mass, "truncation_error": 1 - represented_mass},
        result_type="approximate",
        assumptions=["Poisson claim count.", "Independent identically distributed severity on an integer grid."],
        convergence="recursion_complete",
    )


def compound_poisson_fft(severity_pmf, frequency_mean: float, grid_size: int = 2048) -> ActuarialResult:
    f = np.asarray(severity_pmf, dtype=float)
    if f.ndim != 1 or np.any(f < 0) or not np.isclose(f.sum(), 1, atol=1e-10):
        raise ValueError("severity_pmf must be normalized")
    if frequency_mean <= 0 or grid_size < f.size:
        raise ValueError("frequency_mean must be positive and grid_size cover severity support")
    padded = np.zeros(grid_size)
    padded[: f.size] = f
    aggregate = np.fft.ifft(np.exp(frequency_mean * (np.fft.fft(padded) - 1))).real
    aggregate = np.clip(aggregate, 0, None)
    aggregate /= aggregate.sum()
    return ActuarialResult(
        values={"probability_mass": aggregate.tolist(), "normalization": float(aggregate.sum())},
        result_type="approximate",
        assumptions=["Poisson frequency.", "FFT grid is sufficiently wide to make wrap-around negligible."],
        convergence="fft_complete",
    )


def simulate_compound_poisson(
    frequency_mean: float,
    severity_mean: float,
    severity_sigma: float,
    simulations: int = 10_000,
    seed: int = 1405,
) -> ActuarialResult:
    if frequency_mean <= 0 or severity_mean <= 0 or severity_sigma <= 0:
        raise ValueError("frequency and severity parameters must be positive")
    if not 500 <= simulations <= 100_000:
        raise ValueError("simulations must be between 500 and 100,000")
    rng = np.random.default_rng(seed)
    counts = rng.poisson(frequency_mean, size=simulations)
    mu = np.log(severity_mean) - severity_sigma**2 / 2
    aggregate = np.zeros(simulations)
    for index, count in enumerate(counts):
        if count:
            aggregate[index] = rng.lognormal(mu, severity_sigma, size=count).sum()
    theoretical_mean = frequency_mean * severity_mean
    severity_second = severity_mean**2 * np.exp(severity_sigma**2)
    theoretical_variance = frequency_mean * severity_second
    return ActuarialResult(
        values={
            "mean": float(aggregate.mean()),
            "variance": float(aggregate.var(ddof=1)),
            "theoretical_mean": theoretical_mean,
            "theoretical_variance": theoretical_variance,
            "p95": float(np.quantile(aggregate, 0.95)),
        },
        result_type="simulated",
        assumptions=["Poisson frequency and independent lognormal severity."],
        convergence="fixed_size_monte_carlo",
    )
