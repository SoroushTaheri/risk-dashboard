"""
Deterministic reconstruction of the synthetic motor portfolio.

Academic provenance
-------------------
Source data: Students Work/Data/insurance_simulated_data.csv
Contributor: علی تیموری

Integration changes:
- preserves the aggregate source and assigns non-calendar month identifiers;
- reconstructs accident, claim, policy, and exposure records deterministically;
- adds strict lineage and reconciliation checks required by the dashboard;
- labels reconstructed records so they cannot be mistaken for observations.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np

GENERATOR_VERSION = "1.0.0"
MASTER_SEED = 1405
EXPECTED_COLUMNS = [
    "Total_Accidents",
    "Own_Damage_Accidents",
    "Third_Party_Accidents",
    "Total_Loss_Cases",
    "Mean_Own_Damage_Severity",
    "Mean_Third_Party_Severity",
    "Total_Own_Damage_Amount",
    "Total_Third_Party_Amount",
    "Total_Payout_Amount",
]
INTEGER_COLUMNS = set(EXPECTED_COLUMNS[:4])


@dataclass(frozen=True)
class PipelinePaths:
    source: Path
    root: Path

    @property
    def derived(self) -> Path:
        return self.root / "data" / "derived"

    @property
    def manifests(self) -> Path:
        return self.root / "data" / "manifests"

    @property
    def validation(self) -> Path:
        return self.root / "data" / "validation"


def default_paths() -> PipelinePaths:
    root = Path(__file__).resolve().parents[1]
    return PipelinePaths(
        source=root.parent / "Students Work" / "Data" / "insurance_simulated_data.csv",
        root=root,
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_seed(checksum: str, *parts: object) -> int:
    payload = "|".join([checksum, GENERATOR_VERSION, str(MASTER_SEED), *map(str, parts)])
    return int.from_bytes(hashlib.sha256(payload.encode("utf-8")).digest()[:8], "big")


def load_source(paths: PipelinePaths) -> tuple[list[dict[str, int | float]], str]:
    if not paths.source.exists():
        raise FileNotFoundError(f"Authoritative source CSV not found: {paths.source}")
    checksum = sha256_file(paths.source)
    lock_path = paths.manifests / "source.json"
    if lock_path.exists():
        locked = json.loads(lock_path.read_text(encoding="utf-8"))
        if locked["sha256"] != checksum:
            raise RuntimeError("Source checksum changed; review and deliberately update the source manifest")

    with paths.source.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != EXPECTED_COLUMNS:
            raise RuntimeError(f"Unexpected source schema: {reader.fieldnames}")
        rows: list[dict[str, int | float]] = []
        for raw in reader:
            row = {
                column: int(raw[column]) if column in INTEGER_COLUMNS else float(raw[column])
                for column in EXPECTED_COLUMNS
            }
            if any(value < 0 for value in row.values()):
                raise RuntimeError("Source contains a negative count or amount")
            rows.append(row)
    if len(rows) != 1000:
        raise RuntimeError(f"Expected 1,000 independent months, found {len(rows)}")
    return rows, checksum


def _write_csv(path: Path, columns: list[str], records: Iterable[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(records)


def _write_gzip_csv(path: Path, columns: list[str], records: Iterable[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as zipped:
            with io.TextIOWrapper(zipped, encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=columns, lineterminator="\n")
                writer.writeheader()
                writer.writerows(records)


def _policies(checksum: str, count: int = 500) -> list[dict[str, object]]:
    rng = np.random.default_rng(stable_seed(checksum, "policies"))
    segments = np.array(["standard", "preferred", "commercial"])
    coverages = np.array(["both", "own_damage", "third_party"])
    records = []
    for index in range(count):
        risk = float(np.clip(rng.lognormal(mean=0, sigma=0.42), 0.35, 3.5))
        records.append(
            {
                "policy_id": f"P{index + 1:05d}",
                "coverage_selection": str(rng.choice(coverages, p=[0.72, 0.13, 0.15])),
                "annual_exposure": round(float(rng.uniform(0.55, 1.0)), 6),
                "risk_score": round(risk, 8),
                "claim_probability": round(float(np.clip(0.045 * risk, 0.005, 0.35)), 8),
                "benefit_proxy": round(float(rng.choice([250_000, 500_000, 1_000_000, 2_000_000])), 2),
                "segment": str(rng.choice(segments, p=[0.58, 0.28, 0.14])),
                "record_type": "reconstructed",
            }
        )
    return records


def _claim_amounts(total: float, count: int, rng: np.random.Generator, coverage: str) -> np.ndarray:
    if count == 0:
        if not np.isclose(total, 0.0, atol=1e-9):
            raise RuntimeError("A positive source total cannot be reconciled to zero claims")
        return np.array([], dtype=float)
    weights = (
        rng.lognormal(mean=0.0, sigma=0.72, size=count)
        if coverage == "own_damage"
        else 1.0 + rng.pareto(a=2.35, size=count)
    )
    amounts = weights / weights.sum() * total
    amounts[-1] += total - float(amounts.sum())
    return amounts


def generate(paths: PipelinePaths | None = None) -> dict[str, object]:
    paths = paths or default_paths()
    for directory in (paths.derived, paths.manifests, paths.validation):
        directory.mkdir(parents=True, exist_ok=True)

    source_rows, checksum = load_source(paths)
    policies = _policies(checksum)
    policy_ids = np.array([record["policy_id"] for record in policies])
    policy_weights = np.array([record["risk_score"] for record in policies], dtype=float)
    policy_weights /= policy_weights.sum()

    monthly: list[dict[str, object]] = []
    accidents: list[dict[str, object]] = []
    claims: list[dict[str, object]] = []
    exposures: list[dict[str, object]] = []
    reconciliation: list[dict[str, object]] = []
    overlap_by_month: dict[str, int] = {}

    for row_number, source in enumerate(source_rows, start=1):
        month_id = f"M{row_number:04d}"
        monthly.append(
            {
                "month_id": month_id,
                **source,
                "source_row_number": row_number,
                "source_sha256": checksum,
                "critical_checks_pass": True,
            }
        )
        month_rng = np.random.default_rng(stable_seed(checksum, month_id, "accidents"))
        total = int(source["Total_Accidents"])
        own = int(source["Own_Damage_Accidents"])
        third = int(source["Third_Party_Accidents"])
        lower, upper = max(0, own + third - total), min(own, third)
        overlap = int(month_rng.integers(lower, upper + 1)) if upper > lower else lower
        overlap_by_month[month_id] = overlap
        categories = np.array(
            ["both"] * overlap
            + ["own_damage_only"] * (own - overlap)
            + ["third_party_only"] * (third - overlap)
            + ["neither"] * (total - own - third + overlap),
            dtype=object,
        )
        month_rng.shuffle(categories)
        total_loss_indices = set(
            month_rng.choice(total, size=int(source["Total_Loss_Cases"]), replace=False).tolist()
        )
        assigned_policies = month_rng.choice(policy_ids, size=total, replace=True, p=policy_weights)
        month_accidents: list[dict[str, object]] = []
        for index, category in enumerate(categories):
            accident = {
                "accident_id": f"{month_id}-A{index + 1:04d}",
                "month_id": month_id,
                "policy_id": str(assigned_policies[index]),
                "coverage_outcome": str(category),
                "own_damage": category in {"both", "own_damage_only"},
                "third_party": category in {"both", "third_party_only"},
                "total_loss_assigned": index in total_loss_indices,
                "record_type": "reconstructed",
            }
            accidents.append(accident)
            month_accidents.append(accident)

        for policy in policies:
            exposure_rng = np.random.default_rng(stable_seed(checksum, month_id, policy["policy_id"]))
            exposures.append(
                {
                    "month_id": month_id,
                    "policy_id": policy["policy_id"],
                    "exposure": round(float(policy["annual_exposure"]) / 12 * exposure_rng.uniform(0.94, 1.0), 8),
                    "record_type": "reconstructed",
                }
            )

        generated_totals: dict[str, float] = {}
        generated_means: dict[str, float] = {}
        for coverage, count_key, total_key, mean_key, eligible_key in (
            ("own_damage", "Own_Damage_Accidents", "Total_Own_Damage_Amount", "Mean_Own_Damage_Severity", "own_damage"),
            ("third_party", "Third_Party_Accidents", "Total_Third_Party_Amount", "Mean_Third_Party_Severity", "third_party"),
        ):
            eligible = [accident for accident in month_accidents if accident[eligible_key]]
            count = int(source[count_key])
            if len(eligible) != count:
                raise RuntimeError(f"Coverage allocation failed for {month_id} {coverage}")
            rng = np.random.default_rng(stable_seed(checksum, month_id, coverage))
            amounts = _claim_amounts(float(source[total_key]), count, rng, coverage)
            for index, (accident, amount) in enumerate(zip(eligible, amounts, strict=True)):
                claims.append(
                    {
                        "claim_id": f"{month_id}-{coverage[:1].upper()}C{index + 1:04d}",
                        "month_id": month_id,
                        "accident_id": accident["accident_id"],
                        "policy_id": accident["policy_id"],
                        "coverage": coverage,
                        "amount": repr(float(amount)),
                        "severity_shape": "lognormal" if coverage == "own_damage" else "pareto",
                        "record_type": "reconstructed",
                    }
                )
            generated_totals[coverage] = float(amounts.sum())
            generated_means[coverage] = float(amounts.mean()) if count else 0.0

        differences = [
            abs(generated_totals["own_damage"] - float(source["Total_Own_Damage_Amount"])),
            abs(generated_totals["third_party"] - float(source["Total_Third_Party_Amount"])),
            abs(generated_means["own_damage"] - float(source["Mean_Own_Damage_Severity"])),
            abs(generated_means["third_party"] - float(source["Mean_Third_Party_Severity"])),
            abs(
                generated_totals["own_damage"]
                + generated_totals["third_party"]
                - float(source["Total_Payout_Amount"])
            ),
        ]
        scale = max(float(source["Total_Payout_Amount"]), 1.0)
        passed = max(differences) <= max(1e-7, scale * 1e-12)
        reconciliation.append(
            {
                "month_id": month_id,
                "expected_accidents": total,
                "generated_accidents": len(month_accidents),
                "expected_own_damage_claims": own,
                "generated_own_damage_claims": sum(a["own_damage"] for a in month_accidents),
                "expected_third_party_claims": third,
                "generated_third_party_claims": sum(a["third_party"] for a in month_accidents),
                "expected_total_loss_cases": int(source["Total_Loss_Cases"]),
                "generated_total_loss_cases": sum(a["total_loss_assigned"] for a in month_accidents),
                "expected_payout": float(source["Total_Payout_Amount"]),
                "generated_payout": generated_totals["own_damage"] + generated_totals["third_party"],
                "maximum_absolute_difference": max(differences),
                "maximum_relative_difference": max(differences) / scale,
                "policy_links_valid": all(a["policy_id"] in policy_ids for a in month_accidents),
                "seed": stable_seed(checksum, month_id),
                "generator_version": GENERATOR_VERSION,
                "passed": bool(passed),
            }
        )

    all_passed = all(item["passed"] and item["policy_links_valid"] for item in reconciliation)
    source_manifest = {
        "source": "Students Work/Data/insurance_simulated_data.csv",
        "sha256": checksum,
        "rows": len(source_rows),
        "schema": EXPECTED_COLUMNS,
        "interpretation": "Each row is one independent synthetic month; row order is not a real calendar.",
        "immutable": True,
    }
    assumptions = {
        "generator_version": GENERATOR_VERSION,
        "master_seed": MASTER_SEED,
        "record_label": "reconstructed",
        "overlap_rule": "Seeded uniform integer within the mathematically feasible overlap interval.",
        "total_loss_rule": "Total_Loss_Cases is a seeded subset of monthly accidents; the source does not document its relationship to coverages.",
        "claim_severity_rule": "Positive lognormal-shaped own-damage weights and Pareto-shaped third-party weights are normalized to exact source totals.",
        "policy_rule": "Synthetic risk weights allocate conditioned events without changing source counts or amounts.",
    }
    validation = {
        "status": "pass" if all_passed else "fail",
        "critical_checks_pass": all_passed,
        "months_checked": len(reconciliation),
        "failed_months": [item["month_id"] for item in reconciliation if not item["passed"]],
        "source_sha256": checksum,
        "generator_version": GENERATOR_VERSION,
        "max_absolute_difference": max(item["maximum_absolute_difference"] for item in reconciliation),
        "max_relative_difference": max(item["maximum_relative_difference"] for item in reconciliation),
    }

    _write_csv(paths.derived / "monthly_portfolio.csv", ["month_id", *EXPECTED_COLUMNS, "source_row_number", "source_sha256", "critical_checks_pass"], monthly)
    _write_gzip_csv(paths.derived / "accidents.csv.gz", list(accidents[0]), accidents)
    _write_gzip_csv(paths.derived / "claims.csv.gz", list(claims[0]), claims)
    _write_csv(paths.derived / "policies.csv", list(policies[0]), policies)
    _write_gzip_csv(paths.derived / "policy_exposures.csv.gz", list(exposures[0]), exposures)
    _write_csv(paths.validation / "reconciliation.csv", list(reconciliation[0]), reconciliation)
    for target, payload in (
        (paths.manifests / "source.json", source_manifest),
        (paths.manifests / "generation.json", assumptions),
        (paths.validation / "summary.json", validation),
    ):
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    public_data = paths.root / "public" / "data"
    public_data.mkdir(parents=True, exist_ok=True)
    browser_monthly = [
        {
            "month_id": row["month_id"],
            "accidents": row["Total_Accidents"],
            "own_claims": row["Own_Damage_Accidents"],
            "third_claims": row["Third_Party_Accidents"],
            "total_loss_cases": row["Total_Loss_Cases"],
            "overlap_accidents": overlap_by_month[str(row["month_id"])],
            "own_amount": row["Total_Own_Damage_Amount"],
            "third_amount": row["Total_Third_Party_Amount"],
            "payout": row["Total_Payout_Amount"],
        }
        for row in monthly
    ]
    payout_values = np.array([float(row["Total_Payout_Amount"]) for row in source_rows])
    summary = {
        "months": len(monthly),
        "total_payout": float(payout_values.sum()),
        "mean_payout": float(payout_values.mean()),
        "p95_payout": float(np.quantile(payout_values, 0.95, method="inverted_cdf")),
        "max_payout": float(payout_values.max()),
        "source_sha256": checksum,
        "reconciliation_status": validation["status"],
        "max_relative_difference": validation["max_relative_difference"],
        "generator_version": GENERATOR_VERSION,
    }
    (public_data / "monthly.json").write_text(json.dumps(browser_monthly, separators=(",", ":")) + "\n", encoding="utf-8")
    (public_data / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return validation


def assert_reconciled(paths: PipelinePaths | None = None) -> dict[str, object]:
    paths = paths or default_paths()
    summary_path = paths.validation / "summary.json"
    if not summary_path.exists():
        raise RuntimeError("Derived data have not been generated")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    _, checksum = load_source(paths)
    if summary.get("source_sha256") != checksum or not summary.get("critical_checks_pass"):
        raise RuntimeError("Derived data failed the reconciliation gate")
    return summary


if __name__ == "__main__":
    print(json.dumps(generate(), indent=2))
