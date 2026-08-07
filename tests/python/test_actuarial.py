import numpy as np
import pytest

from actuarial.collective_risk import compound_poisson_fft, panjer_poisson, simulate_compound_poisson
from actuarial.individual_risk import bernoulli_portfolio, exact_integer_convolution
from actuarial.risk_measures import empirical_var_tvar, evt_var_tvar, retained_losses
from actuarial.ruin import adjustment_coefficient_exponential, lundberg_bound, simulate_discrete_ruin
from actuarial.utility_reinsurance import stop_loss, theoretical_entropic_availability


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


def test_panjer_and_fft_agree_on_controlled_example():
    severity = [0.0, 0.65, 0.35]
    panjer = np.array(panjer_poisson(severity, 1.2, max_loss=100).values["probability_mass"])
    fft = np.array(compound_poisson_fft(severity, 1.2, grid_size=512).values["probability_mass"])
    np.testing.assert_allclose(panjer[:60], fft[:60], atol=1e-10)
    assert panjer.sum() == pytest.approx(1, abs=1e-10)


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

