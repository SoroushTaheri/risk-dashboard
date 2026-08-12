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
from scipy import optimize, stats

from .common import ActuarialResult, as_finite_sample


def fit_frequency(counts, model: str = "poisson") -> ActuarialResult:
    sample = as_finite_sample(counts, name="counts")
    if not np.allclose(sample, np.round(sample)):
        raise ValueError("counts must be integer-valued")
    observed_mean = float(sample.mean())
    observed_variance = float(sample.var(ddof=1))
    observed_dispersion = observed_variance / observed_mean if observed_mean > 0 else 0.0
    model = model.lower()
    support = np.arange(0, int(sample.max()) + 1)
    observed_frequency = np.bincount(sample.astype(int), minlength=support.size)
    if model == "poisson":
        parameters = {"lambda": observed_mean}
        fitted_mean = observed_mean
        fitted_variance = observed_mean
        fitted_pmf = stats.poisson.pmf(support, parameters["lambda"])
        loglik = float(np.sum(stats.poisson.logpmf(sample, parameters["lambda"])))
        warning = "Observed variance materially exceeds observed mean; Poisson forces fitted variance to equal fitted mean, so a negative-binomial fit may be more appropriate." if observed_dispersion > 1.25 else None
        convergence = "maximum_likelihood"
    elif model in {"negative_binomial", "negative-binomial"}:
        if observed_mean <= 0:
            raise ValueError("negative-binomial fitting requires a positive sample mean")
        if observed_variance > observed_mean:
            # Profiling p = r / (r + sample mean) leaves a stable one-dimensional
            # maximum-likelihood optimization for r. This is equivalent to the
            # two-parameter likelihood used in the students' Section 3.9 code.
            def negative_log_likelihood(log_size: float) -> float:
                candidate_size = float(np.exp(log_size))
                candidate_probability = candidate_size / (candidate_size + observed_mean)
                return -float(np.sum(stats.nbinom.logpmf(sample, candidate_size, candidate_probability)))

            optimization = optimize.minimize_scalar(
                negative_log_likelihood,
                bounds=(np.log(1e-4), np.log(1e8)),
                method="bounded",
                options={"xatol": 1e-10},
            )
            if not optimization.success:
                raise RuntimeError("negative-binomial maximum-likelihood fitting did not converge")
            size = float(np.exp(optimization.x))
            warning = None
            convergence = "maximum_likelihood"
        else:
            # The NB family cannot represent underdispersion.  Its likelihood
            # approaches the Poisson likelihood as size tends to infinity.
            size = 1_000_000.0
            warning = "The sample is not overdispersed; the negative-binomial fit is shown at its Poisson limit."
            convergence = "poisson_limit"
        parameters = {"size": size, "probability": size / (size + observed_mean)}
        fitted_mean = size * (1.0 - parameters["probability"]) / parameters["probability"]
        fitted_variance = size * (1.0 - parameters["probability"]) / parameters["probability"]**2
        fitted_pmf = stats.nbinom.pmf(support, size, parameters["probability"])
        loglik = float(np.sum(stats.nbinom.logpmf(sample, size, parameters["probability"])))
    else:
        raise ValueError("model must be poisson or negative_binomial")
    return ActuarialResult(
        values={
            "model": model,
            # Explicit observed/fitted fields prevent the sample diagnostics
            # from being mistaken for moments implied by the selected model.
            "observed_mean": observed_mean,
            "observed_variance": observed_variance,
            "observed_dispersion_index": observed_dispersion,
            "fitted_mean": fitted_mean,
            "fitted_variance": fitted_variance,
            "fitted_dispersion_index": fitted_variance / fitted_mean if fitted_mean > 0 else 0.0,
            # Backward-compatible aliases retain their original observed meaning.
            "mean": observed_mean,
            "variance": observed_variance,
            "dispersion_index": observed_dispersion,
            "parameters": parameters,
            "log_likelihood": loglik,
            "aic": 2 * len(parameters) - 2 * loglik,
            "support": support.tolist(),
            "observed_frequency": observed_frequency.astype(int).tolist(),
            "fitted_expected_frequency": (sample.size * fitted_pmf).tolist(),
        },
        result_type="fitted",
        assumptions=["Synthetic monthly claim counts are identically distributed draws from the stationary portfolio model."],
        message=warning,
        convergence=convergence,
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
        parameter_count = 2
    elif model == "lognormal":
        sigma, _, scale = stats.lognorm.fit(sample, floc=0)
        params = {"sigma": float(sigma), "scale": float(scale)}
        loglik = float(np.sum(stats.lognorm.logpdf(sample, sigma, loc=0, scale=scale)))
        parameter_count = 2
    elif model == "pareto":
        shape, _, scale = stats.pareto.fit(sample, floc=0)
        params = {"shape": float(shape), "scale": float(scale), "finite_mean": bool(shape > 1)}
        loglik = float(np.sum(stats.pareto.logpdf(sample, shape, loc=0, scale=scale)))
        parameter_count = 2
    elif model in {"inverse_gaussian", "inverse-gaussian"}:
        scipy_shape, _, scale = stats.invgauss.fit(sample, floc=0)
        params = {"mean": float(scipy_shape * scale), "shape": float(scale)}
        loglik = float(np.sum(stats.invgauss.logpdf(sample, scipy_shape, loc=0, scale=scale)))
        parameter_count = 2
    elif model in {"exponential_mixture", "exponential-mixture"}:
        mixture_weight = 0.5
        rate_one = 2.0 / float(sample.mean())
        rate_two = 2.0 / (3.0 * float(sample.mean()))
        previous = -np.inf
        for _ in range(500):
            first = mixture_weight * rate_one * np.exp(-rate_one * sample)
            second = (1.0 - mixture_weight) * rate_two * np.exp(-rate_two * sample)
            responsibility = first / np.maximum(first + second, 1e-300)
            mixture_weight = float(responsibility.mean())
            rate_one = float(responsibility.sum() / np.sum(responsibility * sample))
            rate_two = float((1.0 - responsibility).sum() / np.sum((1.0 - responsibility) * sample))
            loglik = float(np.sum(np.log(np.maximum(
                mixture_weight * rate_one * np.exp(-rate_one * sample)
                + (1.0 - mixture_weight) * rate_two * np.exp(-rate_two * sample),
                1e-300,
            ))))
            if abs(loglik - previous) < 1e-8:
                break
            previous = loglik
        params = {"weight": mixture_weight, "rate_one": rate_one, "rate_two": rate_two}
        parameter_count = 3
    else:
        raise ValueError("model must be gamma, inverse_gaussian, exponential_mixture, lognormal, or pareto")
    return ActuarialResult(
        values={"model": model, "parameters": params, "aic": 2 * parameter_count - 2 * loglik, "sample_size": int(sample.size)},
        result_type="fitted",
        assumptions=["Claim severities are positive and independent conditional on the selected model."],
        convergence="maximum_likelihood",
    )


def _frequency_pgf(z, model: str, parameters: dict[str, float]):
    if model == "poisson":
        return np.exp(parameters["lambda"] * (z - 1.0))
    if model in {"negative_binomial", "negative-binomial"}:
        size = parameters["size"]
        probability = parameters["probability"]
        return (probability / (1.0 - (1.0 - probability) * z)) ** size
    raise ValueError("model must be poisson or negative_binomial")


def _panjer_parameters(model: str, parameters: dict[str, float]) -> tuple[float, float]:
    if model == "poisson":
        return 0.0, parameters["lambda"]
    if model in {"negative_binomial", "negative-binomial"}:
        probability = parameters["probability"]
        return 1.0 - probability, (parameters["size"] - 1.0) * (1.0 - probability)
    raise ValueError("model must be poisson or negative_binomial")


def panjer_compound(
    severity_pmf,
    frequency_model: str,
    frequency_parameters: dict[str, float],
    max_loss: int,
) -> ActuarialResult:
    """Panjer recursion for Poisson or negative-binomial claim counts."""
    f = np.asarray(severity_pmf, dtype=float)
    if f.ndim != 1 or f.size < 2 or np.any(f < 0) or not np.isclose(f.sum(), 1, atol=1e-10):
        raise ValueError("severity_pmf must be a normalized vector including mass at zero")
    if not 1 <= max_loss <= 100_000:
        raise ValueError("max_loss must be between 1 and 100,000")
    a, b = _panjer_parameters(frequency_model, frequency_parameters)
    aggregate = np.zeros(max_loss + 1)
    aggregate[0] = float(_frequency_pgf(f[0], frequency_model, frequency_parameters))
    denominator = 1.0 - a * f[0]
    for loss in range(1, max_loss + 1):
        upper = min(loss, f.size - 1)
        indices = np.arange(1, upper + 1)
        aggregate[loss] = np.sum(
            (a + b * indices / loss) * f[indices] * aggregate[loss - indices]
        ) / denominator
    represented_mass = float(aggregate.sum())
    return ActuarialResult(
        values={
            "probability_mass": aggregate.tolist(),
            "represented_mass": represented_mass,
            "truncation_error": max(0.0, 1.0 - represented_mass),
        },
        result_type="approximate",
        assumptions=[
            "The fitted frequency belongs to the Panjer (a,b,0) class.",
            "Claim severity is discretized on the displayed loss grid.",
        ],
        convergence="recursion_complete",
    )


def compound_fft(
    severity_pmf,
    frequency_model: str,
    frequency_parameters: dict[str, float],
    grid_size: int = 2048,
) -> ActuarialResult:
    """FFT inversion of a compound Poisson or negative-binomial pgf."""
    f = np.asarray(severity_pmf, dtype=float)
    if f.ndim != 1 or np.any(f < 0) or not np.isclose(f.sum(), 1, atol=1e-10):
        raise ValueError("severity_pmf must be normalized")
    if grid_size < f.size:
        raise ValueError("grid_size must cover severity support")
    padded = np.zeros(grid_size)
    padded[: f.size] = f
    aggregate = np.fft.ifft(_frequency_pgf(np.fft.fft(padded), frequency_model, frequency_parameters)).real
    aggregate = np.clip(aggregate, 0, None)
    normalization = float(aggregate.sum())
    if normalization <= 0:
        raise ValueError("FFT inversion produced zero probability mass")
    aggregate /= normalization
    return ActuarialResult(
        values={"probability_mass": aggregate.tolist(), "represented_mass": 1.0, "normalization": float(aggregate.sum())},
        result_type="approximate",
        assumptions=[
            "Claim severity is discretized on the displayed loss grid.",
            "The FFT grid is sufficiently wide to make circular wrap-around negligible.",
        ],
        convergence="fft_complete",
    )


def _discretize_empirical_severity(severities, grid_width: float, grid_size: int) -> np.ndarray:
    sample = as_finite_sample(severities, name="severities")
    if grid_width <= 0 or grid_size < 2:
        raise ValueError("grid_width must be positive and grid_size must be at least 2")
    position = np.clip(sample / grid_width, 0, grid_size - 1)
    lower = np.floor(position).astype(int)
    upper = np.minimum(lower + 1, grid_size - 1)
    upper_weight = position - lower
    pmf = np.bincount(lower, weights=1.0 - upper_weight, minlength=grid_size)
    pmf += np.bincount(upper, weights=upper_weight, minlength=grid_size)
    pmf /= pmf.sum()
    last = int(np.max(np.flatnonzero(pmf)))
    return pmf[: last + 1]


def compound_empirical_model(
    counts,
    severities,
    frequency_model: str,
    method: str,
    grid_width: float,
    grid_size: int = 2048,
    simulations: int = 20_000,
    seed: int = 1405,
) -> ActuarialResult:
    """Fit N, retain the empirical X distribution, and calculate compound S."""
    count_sample = as_finite_sample(counts, name="counts")
    severity_sample = as_finite_sample(severities, name="severities")
    fit = fit_frequency(count_sample, frequency_model)
    parameters = fit.values["parameters"]
    severity_pmf = _discretize_empirical_severity(severity_sample, grid_width, grid_size)
    method = method.lower().replace("-", "_")
    if method == "panjer":
        compound = panjer_compound(severity_pmf, frequency_model, parameters, grid_size - 1)
    elif method == "fft":
        compound = compound_fft(severity_pmf, frequency_model, parameters, grid_size)
    elif method == "monte_carlo":
        if not 500 <= simulations <= 100_000:
            raise ValueError("simulations must be between 500 and 100,000")
        rng = np.random.default_rng(seed)
        if frequency_model == "poisson":
            simulated_counts = rng.poisson(parameters["lambda"], size=simulations)
        else:
            simulated_counts = rng.negative_binomial(
                parameters["size"], parameters["probability"], size=simulations
            )
        owner = np.repeat(np.arange(simulations), simulated_counts)
        draws = rng.choice(severity_sample, size=owner.size, replace=True)
        aggregate_draws = np.bincount(owner, weights=draws, minlength=simulations)
        indices = np.rint(aggregate_draws / grid_width).astype(int)
        represented = indices < grid_size
        probability_mass = np.bincount(indices[represented], minlength=grid_size) / simulations
        compound = ActuarialResult(
            values={
                "probability_mass": probability_mass.tolist(),
                "represented_mass": float(represented.mean()),
                "truncation_error": float(1.0 - represented.mean()),
            },
            result_type="simulated",
            assumptions=["Fitted claim frequency and empirical claim-severity resampling."],
            convergence="fixed_size_monte_carlo",
        )
    else:
        raise ValueError("method must be monte_carlo, panjer, or fft")

    frequency_mean = float(fit.values["fitted_mean"])
    frequency_variance = float(fit.values["fitted_variance"])
    severity_mean = float(severity_sample.mean())
    severity_variance = float(severity_sample.var(ddof=0))
    model_mean = frequency_mean * severity_mean
    model_variance = frequency_mean * severity_variance + frequency_variance * severity_mean**2
    return ActuarialResult(
        values={
            **compound.values,
            "grid_width": grid_width,
            "model_mean": model_mean,
            "model_variance": model_variance,
            "frequency_mean": frequency_mean,
            "frequency_variance": frequency_variance,
            "severity_mean": severity_mean,
            "severity_variance": severity_variance,
            "frequency_fit": fit.serializable(),
        },
        result_type=compound.result_type,
        assumptions=compound.assumptions,
        applicable=compound.applicable,
        message=fit.message,
        convergence=compound.convergence,
    )


def panjer_poisson(severity_pmf, frequency_mean: float, max_loss: int | None = None) -> ActuarialResult:
    f = np.asarray(severity_pmf, dtype=float)
    if frequency_mean <= 0:
        raise ValueError("frequency_mean must be positive")
    max_loss = max_loss or max(100, (f.size - 1) * int(np.ceil(frequency_mean * 4)))
    return panjer_compound(f, "poisson", {"lambda": frequency_mean}, max_loss)


def compound_poisson_fft(severity_pmf, frequency_mean: float, grid_size: int = 2048) -> ActuarialResult:
    if frequency_mean <= 0:
        raise ValueError("frequency_mean must be positive")
    return compound_fft(severity_pmf, "poisson", {"lambda": frequency_mean}, grid_size)


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
