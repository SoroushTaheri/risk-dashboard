import numpy as np
import pytest

from actuarial.collective_risk import (
    compound_fft,
    compound_poisson_fft,
    fit_frequency,
    panjer_compound,
    panjer_poisson,
    simulate_compound_poisson,
)
from actuarial.individual_risk import (
    bernoulli_portfolio,
    exact_integer_convolution,
    independent_policy_moments,
)
from actuarial.risk_measures import empirical_var_tvar, evt_var_tvar, retained_losses
from actuarial.ruin import adjustment_coefficient_exponential, lundberg_bound, simulate_discrete_ruin
from actuarial.utility_reinsurance import (
    absolute_risk_aversion,
    calibrated_utility_parameters,
    exponential_reinsurance_premium,
    stop_loss,
    theoretical_entropic_availability,
    utility_reinsurance_premium,
)


def test_var_monotonicity_and_tvar_relation():
    sample = np.arange(1, 1001, dtype=float)
    low = empirical_var_tvar(sample, 0.9).values
    high = empirical_var_tvar(sample, 0.99).values
    assert high["var"] >= low["var"]
    assert low["tvar"] >= low["var"]
    assert high["tvar"] >= high["var"]


def test_evt_rejects_invalid_threshold():
    with pytest.raises(ValueError, match="confidence"):
        evt_var_tvar(np.arange(1, 101), confidence=0.9, threshold_quantile=0.95)


def test_retained_ceded_identity_and_stop_loss_monotonicity():
    losses = np.array([0, 2, 5, 10, 30], dtype=float)
    retained, ceded = retained_losses(losses, 7)
    np.testing.assert_allclose(retained + ceded, losses)
    low = stop_loss(losses, 3).values["net_stop_loss_premium"]
    high = stop_loss(losses, 12).values["net_stop_loss_premium"]
    assert low >= high


def test_reinsurance_budget_is_for_the_ceded_layer():
    losses = np.array([0, 2, 5, 10, 30], dtype=float)
    result = exponential_reinsurance_premium(losses, retention=7, wealth=100, risk_aversion=0.01)
    retained = np.minimum(losses, 7)
    assert result.values["maximum_acceptable_premium"] > result.values["expected_ceded_loss"]
    assert result.values["maximum_acceptable_premium"] == pytest.approx(
        result.values["gross_certainty_equivalent_loss"]
        - result.values["retained_certainty_equivalent_loss"]
    )


def test_retained_sd_is_zero_below_the_smallest_loss():
    losses = np.array([10, 14, 25, 40], dtype=float)
    result = stop_loss(losses, retention=7).values
    assert result["retained_sd"] == pytest.approx(0)
    assert result["retained_mean"] == pytest.approx(7)


def test_reinsurance_layer_and_budget_vanish_at_maximum_loss():
    losses = np.array([10, 14, 25, 40], dtype=float)
    stop_loss_result = stop_loss(losses, retention=40).values
    utility_result = exponential_reinsurance_premium(losses, retention=40, wealth=100, risk_aversion=0.01).values
    assert stop_loss_result["net_stop_loss_premium"] == pytest.approx(0)
    assert utility_result["expected_ceded_loss"] == pytest.approx(0)
    assert utility_result["maximum_acceptable_premium"] == pytest.approx(0)


def test_textbook_utilities_are_locally_matched_but_produce_different_premiums():
    losses = np.array([0, 2, 5, 10, 30], dtype=float)
    wealth = 100.0
    local_risk_aversion = 0.005
    premiums = []
    for utility in ("exponential", "logarithmic", "power"):
        parameters = calibrated_utility_parameters(utility, wealth, local_risk_aversion)
        assert absolute_risk_aversion(utility, wealth, parameters) == pytest.approx(local_risk_aversion)
        result = utility_reinsurance_premium(
            losses, retention=7, wealth=wealth, risk_aversion=local_risk_aversion, utility=utility
        ).values
        assert result["maximum_acceptable_premium"] > result["expected_ceded_loss"]
        assert result["absolute_risk_aversion_after_expected_loss"] >= local_risk_aversion
        premiums.append(result["maximum_acceptable_premium"])
    assert len({round(value, 8) for value in premiums}) == 3


def test_logarithmic_and_power_premiums_solve_expected_utility_equilibrium():
    losses = np.array([1, 4, 8, 20], dtype=float)
    retained = np.minimum(losses, 6)
    wealth = 100.0
    local_risk_aversion = 0.004
    for utility in ("logarithmic", "power"):
        parameters = calibrated_utility_parameters(utility, wealth, local_risk_aversion)
        premium = utility_reinsurance_premium(
            losses, retention=6, wealth=wealth, risk_aversion=local_risk_aversion, utility=utility
        ).values["maximum_acceptable_premium"]
        if utility == "logarithmic":
            gross_utility = np.mean(np.log(parameters["alpha"] + wealth - losses))
            insured_utility = np.mean(np.log(parameters["alpha"] + wealth - premium - retained))
        else:
            gross_utility = np.mean((wealth - losses) ** parameters["c"])
            insured_utility = np.mean((wealth - premium - retained) ** parameters["c"])
        assert insured_utility == pytest.approx(gross_utility, abs=1e-12)


def test_unbounded_pareto_refuses_positive_mgf_method():
    result = theoretical_entropic_availability("pareto")
    assert result.applicable is False
    assert "MGF" in result.message
    assert theoretical_entropic_availability("pareto", retention=100).applicable is True


def test_bernoulli_moments_and_convolution_normalize():
    result = bernoulli_portfolio([0.2, 0.5], [10, 20]).values
    assert result["mean"] == pytest.approx(12)
    assert result["variance"] == pytest.approx(116)
    convolution = exact_integer_convolution([[0.5, 0.5], [0.25, 0.75]]).values["probability_mass"]
    assert sum(convolution) == pytest.approx(1)
    assert convolution == pytest.approx([0.125, 0.5, 0.375])


def test_independent_policy_moments_keep_each_policy_empirical_severity_distribution():
    losses = np.array([
        [0.0, 10.0, 30.0, 0.0],
        [0.0, 0.0, 20.0, 40.0],
    ])
    result = independent_policy_moments(losses).values
    assert result["mean"] == pytest.approx(losses.sum(axis=0).mean())
    assert result["variance"] == pytest.approx(losses[0].var(ddof=1) + losses[1].var(ddof=1))
    assert result["standard_deviation"] == pytest.approx(result["variance"] ** 0.5)
    assert result["mean_nonzero_probability"] == pytest.approx(0.5)
    assert result["mean_positive_policy_month_loss"] == pytest.approx(25.0)


def test_panjer_and_fft_agree_on_controlled_example():
    severity = [0.0, 0.65, 0.35]
    panjer = np.array(panjer_poisson(severity, 1.2, max_loss=100).values["probability_mass"])
    fft = np.array(compound_poisson_fft(severity, 1.2, grid_size=512).values["probability_mass"])
    np.testing.assert_allclose(panjer[:60], fft[:60], atol=1e-10)
    assert panjer.sum() == pytest.approx(1, abs=1e-10)


def test_negative_binomial_panjer_and_fft_agree():
    severity = [0.0, 0.65, 0.35]
    parameters = {"size": 2.5, "probability": 0.6}
    panjer = np.array(panjer_compound(severity, "negative_binomial", parameters, 120).values["probability_mass"])
    fft = np.array(compound_fft(severity, "negative_binomial", parameters, grid_size=512).values["probability_mass"])
    np.testing.assert_allclose(panjer[:80], fft[:80], atol=1e-10)
    assert panjer.sum() == pytest.approx(1, abs=1e-10)


def test_frequency_fit_returns_observed_and_fitted_plot_series():
    counts = np.array([0, 0, 1, 1, 1, 2, 2, 4, 6, 8])
    poisson = fit_frequency(counts, "poisson")
    negative_binomial = fit_frequency(counts, "negative_binomial")
    assert poisson.values["observed_mean"] == pytest.approx(negative_binomial.values["observed_mean"])
    assert poisson.values["observed_variance"] == pytest.approx(negative_binomial.values["observed_variance"])
    assert poisson.values["fitted_variance"] == pytest.approx(poisson.values["fitted_mean"])
    assert negative_binomial.values["fitted_variance"] > negative_binomial.values["fitted_mean"]
    assert negative_binomial.values["fitted_variance"] != pytest.approx(poisson.values["fitted_variance"])
    assert negative_binomial.convergence == "maximum_likelihood"
    assert sum(poisson.values["observed_frequency"]) == counts.size
    assert len(poisson.values["support"]) == len(poisson.values["fitted_expected_frequency"])
    assert poisson.values["fitted_expected_frequency"] != pytest.approx(
        negative_binomial.values["fitted_expected_frequency"]
    )


def test_compound_simulation_matches_theoretical_moment():
    result = simulate_compound_poisson(3, 100, 0.5, simulations=50_000, seed=9).values
    assert result["mean"] == pytest.approx(result["theoretical_mean"], rel=0.025)
    assert result["variance"] == pytest.approx(result["theoretical_variance"], rel=0.06)


def test_ruin_reproducibility_capital_monotonicity_and_bound():
    args = dict(monthly_mean_loss=100, safety_loading=0.2, horizon=36, paths=20_000, seed=7)
    low = simulate_discrete_ruin(initial_capital=100, **args).values["finite_horizon_ruin_probability"]
    repeat = simulate_discrete_ruin(initial_capital=100, **args).values["finite_horizon_ruin_probability"]
    high = simulate_discrete_ruin(initial_capital=500, **args).values["finite_horizon_ruin_probability"]
    assert low == repeat
    assert high <= low
    coefficient = adjustment_coefficient_exponential(100, 0.2).values["adjustment_coefficient"]
    assert lundberg_bound(500, coefficient).values["upper_bound"] < 1
