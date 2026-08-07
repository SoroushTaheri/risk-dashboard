from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

ResultKind = Literal[
    "source_data",
    "reconstructed",
    "empirical",
    "fitted",
    "approximate",
    "simulated",
    "textbook_scenario",
]


class ApplicabilityError(ValueError):
    """Raised when a mathematically invalid method is requested."""


@dataclass(frozen=True)
class ActuarialResult:
    values: dict[str, Any]
    result_type: ResultKind
    assumptions: list[str] = field(default_factory=list)
    applicable: bool = True
    message: str | None = None
    convergence: str = "not_applicable"

    def serializable(self) -> dict[str, Any]:
        return asdict(self)


def as_finite_sample(values: Any, *, name: str = "losses"):
    import numpy as np

    sample = np.asarray(values, dtype=float)
    if sample.ndim != 1 or sample.size == 0:
        raise ValueError(f"{name} must be a non-empty one-dimensional sample")
    if not np.all(np.isfinite(sample)):
        raise ValueError(f"{name} must contain only finite values")
    if np.any(sample < 0):
        raise ValueError(f"{name} must be non-negative")
    return sample


def validate_probability(value: float, *, name: str = "probability") -> float:
    value = float(value)
    if not 0 < value < 1:
        raise ValueError(f"{name} must be strictly between 0 and 1")
    return value

