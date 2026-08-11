"""Deterministic entity-first simulation for the motor-insurance laboratory.

Version 2 deliberately supersedes the student's ambiguous aggregate.  Physical
accidents, coverage-specific policies, claims, and paid-loss components are
generated first; the public month CSV is then derived from those entities.
All monetary values are synthetic Spring 1405 million tomans.
"""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np

GENERATOR_VERSION = "2.1.0"
# Keep the validated v2 random stream stable while changing only the public
# observation contract from scenario identifiers to synthetic month identifiers.
RNG_NAMESPACE_VERSION = "2.0.0"
MASTER_SEED = 1405
MONTH_COUNT = 1_000
VEHICLE_COUNT = 10_000
OWN_DAMAGE_POLICY_COUNT = 7_000
IN_PORTFOLIO_INJURED_PROBABILITY = 0.20
LIABILITY_CLAIM_PROBABILITY = 0.40
MONETARY_UNIT = "synthetic Spring 1405 million tomans"

SOURCE_COLUMNS = [
    "Month_ID",
    "Accident_Count",
    "At_Fault_Own_Damage_Claim_Count",
    "Injured_Party_Excess_Own_Damage_Claim_Count",
    "Third_Party_Liability_Claim_Count",
    "Total_Claim_Count",
    "Own_Damage_Paid_Million_Toman",
    "Third_Party_Property_Paid_Million_Toman",
    "Third_Party_Bodily_Paid_Million_Toman",
    "Total_Insurer_Paid_Loss_Million_Toman",
    "Uncovered_Property_Excess_Million_Toman",
]

INTEGER_COLUMNS = {
    "Accident_Count",
    "At_Fault_Own_Damage_Claim_Count",
    "Injured_Party_Excess_Own_Damage_Claim_Count",
    "Third_Party_Liability_Claim_Count",
    "Total_Claim_Count",
}

CALIBRATION_TARGETS = {
    "mean_accidents": 99.569,
    "mean_at_fault_own_claims": 69.763,
    "mean_liability_claims": 39.955,
    "mean_at_fault_own_paid": 26.6042780543,
    "mean_liability_paid": 85.7787984616,
}


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


def stable_seed(*parts: object) -> int:
    payload = "|".join([RNG_NAMESPACE_VERSION, str(MASTER_SEED), *map(str, parts)])
    return int.from_bytes(hashlib.sha256(payload.encode("utf-8")).digest()[:8], "big")


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


def _lognormal(rng: np.random.Generator, mean: float, sigma: float) -> float:
    return float(rng.lognormal(np.log(mean) - 0.5 * sigma**2, sigma))


def _portfolio() -> tuple[
    list[dict[str, object]],
    list[dict[str, object]],
    dict[str, str],
    dict[str, str],
    dict[str, dict[str, object]],
]:
    rng = np.random.default_rng(stable_seed("portfolio"))
    own_indices = set(rng.choice(VEHICLE_COUNT, size=OWN_DAMAGE_POLICY_COUNT, replace=False).tolist())
    segments = np.array(["standard", "preferred", "commercial"])
    vehicles: list[dict[str, object]] = []
    policies: list[dict[str, object]] = []
    tp_policy_by_vehicle: dict[str, str] = {}
    od_policy_by_vehicle: dict[str, str] = {}
    vehicle_by_id: dict[str, dict[str, object]] = {}

    for index in range(VEHICLE_COUNT):
        vehicle_id = f"V{index + 1:05d}"
        risk_score = float(np.clip(rng.lognormal(0.0, 0.34), 0.40, 3.20))
        insured_value = round(float(np.clip(_lognormal(rng, 850.0, 0.55), 250.0, 3_500.0)), 6)
        segment = str(rng.choice(segments, p=[0.62, 0.25, 0.13]))
        vehicle = {
            "vehicle_id": vehicle_id,
            "insured_value_million_toman": insured_value,
            "risk_score": round(risk_score, 8),
            "segment": segment,
            "has_own_damage_policy": index in own_indices,
            "record_type": "synthetic",
        }
        vehicles.append(vehicle)
        vehicle_by_id[vehicle_id] = vehicle

        tp_id = f"TP{index + 1:05d}"
        tp_policy_by_vehicle[vehicle_id] = tp_id
        policies.append(
            {
                "policy_id": tp_id,
                "vehicle_id": vehicle_id,
                "coverage_type": "third_party_liability",
                "property_limit_million_toman": float(rng.choice([100.0, 200.0, 400.0], p=[0.25, 0.55, 0.20])),
                "bodily_limit_million_toman": float(rng.choice([1_000.0, 1_500.0], p=[0.70, 0.30])),
                "insured_value_million_toman": "",
                "deductible_million_toman": 0.0,
                "one_month_exposure": 1.0,
                "risk_score": round(risk_score, 8),
                "segment": segment,
                "empirical_claim_probability": 0.0,
                "mean_paid_loss_million_toman": 0.0,
                "record_type": "synthetic",
            }
        )
        if index in own_indices:
            od_id = f"OD{index + 1:05d}"
            od_policy_by_vehicle[vehicle_id] = od_id
            policies.append(
                {
                    "policy_id": od_id,
                    "vehicle_id": vehicle_id,
                    "coverage_type": "own_damage",
                    "property_limit_million_toman": "",
                    "bodily_limit_million_toman": "",
                    "insured_value_million_toman": insured_value,
                    "deductible_million_toman": 5.0,
                    "one_month_exposure": 1.0,
                    "risk_score": round(risk_score, 8),
                    "segment": segment,
                    "empirical_claim_probability": 0.0,
                    "mean_paid_loss_million_toman": 0.0,
                    "record_type": "synthetic",
                }
            )
    return vehicles, policies, tp_policy_by_vehicle, od_policy_by_vehicle, vehicle_by_id


def generate(paths: PipelinePaths | None = None) -> dict[str, object]:
    paths = paths or default_paths()
    for directory in (paths.derived, paths.manifests, paths.validation, paths.source.parent):
        directory.mkdir(parents=True, exist_ok=True)

    vehicles, policies, tp_by_vehicle, od_by_vehicle, vehicle_by_id = _portfolio()
    vehicle_ids = np.array([record["vehicle_id"] for record in vehicles])
    vehicle_weights = np.array([record["risk_score"] for record in vehicles], dtype=float)
    vehicle_weights /= vehicle_weights.sum()
    policy_by_id = {str(policy["policy_id"]): policy for policy in policies}

    accidents: list[dict[str, object]] = []
    claims: list[dict[str, object]] = []
    components: list[dict[str, object]] = []
    source_rows: list[dict[str, object]] = []
    claim_months_by_policy: dict[str, set[str]] = defaultdict(set)
    paid_by_policy: dict[str, float] = defaultdict(float)
    claim_count_by_policy: dict[str, int] = defaultdict(int)

    total_at_fault_own_paid = 0.0
    total_at_fault_own_claims = 0
    total_liability_paid = 0.0
    total_liability_claims = 0

    for month_index in range(MONTH_COUNT):
        month_id = f"M{month_index + 1:04d}"
        # Preserve the previously validated draws; only the public identifier
        # changes from Sxxxx to Mxxxx.
        rng = np.random.default_rng(stable_seed(f"S{month_index + 1:04d}"))
        accident_count = int(rng.poisson(100.0))
        at_fault_ids = rng.choice(
            vehicle_ids,
            size=accident_count,
            replace=False,
            p=vehicle_weights,
        )

        month_claim_start = len(claims)
        month_component_start = len(components)
        month_accident_start = len(accidents)
        at_fault_own_claims = 0
        injured_excess_claims = 0
        liability_claims = 0
        month_uncovered = 0.0

        for accident_index, at_fault_raw in enumerate(at_fault_ids):
            at_fault_vehicle = str(at_fault_raw)
            accident_id = f"{month_id}-A{accident_index + 1:04d}"
            injured_in_portfolio = bool(rng.random() < IN_PORTFOLIO_INJURED_PROBABILITY)
            injured_vehicle = ""
            if injured_in_portfolio:
                injured_index = int(rng.integers(0, VEHICLE_COUNT - 1))
                candidate = str(vehicle_ids[injured_index])
                if candidate == at_fault_vehicle:
                    candidate = str(vehicle_ids[-1]) if at_fault_vehicle != str(vehicle_ids[-1]) else str(vehicle_ids[-2])
                injured_vehicle = candidate

            claim_ids: dict[str, str] = {"own": "", "liability": "", "excess": ""}
            liability_property_gross = 0.0
            liability_bodily_gross = 0.0
            final_uncovered = 0.0

            def add_claim(
                *,
                policy_id: str,
                coverage_type: str,
                role: str,
                claim_components: list[dict[str, float | str]],
            ) -> str:
                claim_id = f"{month_id}-C{len(claims) - month_claim_start + 1:05d}"
                gross = float(sum(float(item["gross_damage"]) for item in claim_components))
                paid = float(sum(float(item["insurer_paid"]) for item in claim_components))
                deductible = float(sum(float(item["deductible"]) for item in claim_components))
                staged_uncovered = float(sum(float(item["uncovered_after_component"]) for item in claim_components))
                claims.append(
                    {
                        "claim_id": claim_id,
                        "month_id": month_id,
                        "accident_id": accident_id,
                        "policy_id": policy_id,
                        "coverage_type": coverage_type,
                        "claim_role": role,
                        "gross_damage_million_toman": repr(gross),
                        "deductible_million_toman": repr(deductible),
                        "insurer_paid_million_toman": repr(paid),
                        "staged_uncovered_million_toman": repr(staged_uncovered),
                        "record_type": "synthetic",
                    }
                )
                for item in claim_components:
                    components.append(
                        {
                            "component_id": f"{claim_id}-K{len(components) - month_component_start + 1:05d}",
                            "claim_id": claim_id,
                            "month_id": month_id,
                            "accident_id": accident_id,
                            "damage_type": item["damage_type"],
                            "gross_damage_million_toman": repr(float(item["gross_damage"])),
                            "applicable_limit_million_toman": repr(float(item["applicable_limit"])),
                            "deductible_million_toman": repr(float(item["deductible"])),
                            "insurer_paid_million_toman": repr(float(item["insurer_paid"])),
                            "uncovered_after_component_million_toman": repr(float(item["uncovered_after_component"])),
                            "record_type": "synthetic",
                        }
                    )
                claim_months_by_policy[policy_id].add(month_id)
                paid_by_policy[policy_id] += paid
                claim_count_by_policy[policy_id] += 1
                return claim_id

            own_policy_id = od_by_vehicle.get(at_fault_vehicle)
            if own_policy_id:
                policy = policy_by_id[own_policy_id]
                gross = _lognormal(rng, 31.6, 0.595)
                deductible = float(policy["deductible_million_toman"])
                insured_value = float(policy["insured_value_million_toman"])
                paid = min(max(gross - deductible, 0.0), max(insured_value - deductible, 0.0))
                if paid > 0:
                    claim_ids["own"] = add_claim(
                        policy_id=own_policy_id,
                        coverage_type="own_damage",
                        role="at_fault_own_vehicle",
                        claim_components=[
                            {
                                "damage_type": "at_fault_vehicle_property",
                                "gross_damage": gross,
                                "applicable_limit": insured_value,
                                "deductible": deductible,
                                "insurer_paid": paid,
                                "uncovered_after_component": max(gross - deductible - paid, 0.0),
                            }
                        ],
                    )
                    at_fault_own_claims += 1
                    total_at_fault_own_claims += 1
                    total_at_fault_own_paid += paid

            if rng.random() < LIABILITY_CLAIM_PROBABILITY:
                has_property = bool(rng.random() < 0.90)
                has_bodily = bool(rng.random() < 0.15)
                if not has_property and not has_bodily:
                    has_property = True
                tp_policy_id = tp_by_vehicle[at_fault_vehicle]
                tp_policy = policy_by_id[tp_policy_id]
                claim_components: list[dict[str, float | str]] = []
                property_excess = 0.0
                if has_property:
                    liability_property_gross = _lognormal(rng, 70.0, 0.80)
                    property_limit = float(tp_policy["property_limit_million_toman"])
                    property_paid = min(liability_property_gross, property_limit)
                    property_excess = max(liability_property_gross - property_paid, 0.0)
                    claim_components.append(
                        {
                            "damage_type": "third_party_property",
                            "gross_damage": liability_property_gross,
                            "applicable_limit": property_limit,
                            "deductible": 0.0,
                            "insurer_paid": property_paid,
                            "uncovered_after_component": property_excess,
                        }
                    )
                if has_bodily:
                    bodily_shape = 2.40
                    bodily_mean = 150.0
                    bodily_scale = bodily_mean * (bodily_shape - 1.0) / bodily_shape
                    liability_bodily_gross = float((rng.pareto(bodily_shape) + 1.0) * bodily_scale)
                    bodily_limit = float(tp_policy["bodily_limit_million_toman"])
                    bodily_paid = min(liability_bodily_gross, bodily_limit)
                    claim_components.append(
                        {
                            "damage_type": "third_party_bodily",
                            "gross_damage": liability_bodily_gross,
                            "applicable_limit": bodily_limit,
                            "deductible": 0.0,
                            "insurer_paid": bodily_paid,
                            "uncovered_after_component": max(liability_bodily_gross - bodily_paid, 0.0),
                        }
                    )
                claim_ids["liability"] = add_claim(
                    policy_id=tp_policy_id,
                    coverage_type="third_party_liability",
                    role="injured_third_party",
                    claim_components=claim_components,
                )
                liability_claims += 1
                total_liability_claims += 1
                total_liability_paid += sum(float(item["insurer_paid"]) for item in claim_components)

                excess_paid = 0.0
                injured_od_policy = od_by_vehicle.get(injured_vehicle) if injured_vehicle else None
                if property_excess > 0 and injured_od_policy:
                    policy = policy_by_id[injured_od_policy]
                    deductible = float(policy["deductible_million_toman"])
                    insured_value = float(policy["insured_value_million_toman"])
                    excess_paid = min(
                        max(property_excess - deductible, 0.0),
                        max(insured_value - deductible, 0.0),
                    )
                    if excess_paid > 0:
                        final_uncovered = max(property_excess - deductible - excess_paid, 0.0)
                        claim_ids["excess"] = add_claim(
                            policy_id=injured_od_policy,
                            coverage_type="own_damage",
                            role="injured_party_property_excess",
                            claim_components=[
                                {
                                    "damage_type": "injured_vehicle_property_excess",
                                    "gross_damage": property_excess,
                                    "applicable_limit": insured_value,
                                    "deductible": deductible,
                                    "insurer_paid": excess_paid,
                                    "uncovered_after_component": final_uncovered,
                                }
                            ],
                        )
                        injured_excess_claims += 1
                    else:
                        final_uncovered = property_excess
                else:
                    final_uncovered = property_excess
                month_uncovered += final_uncovered

            accidents.append(
                {
                    "accident_id": accident_id,
                    "month_id": month_id,
                    "at_fault_vehicle_id": at_fault_vehicle,
                    "injured_party_type": "portfolio_vehicle" if injured_vehicle else "external_party",
                    "injured_vehicle_id": injured_vehicle,
                    "at_fault_own_claim_id": claim_ids["own"],
                    "liability_claim_id": claim_ids["liability"],
                    "injured_excess_claim_id": claim_ids["excess"],
                    "liability_property_gross_million_toman": repr(liability_property_gross),
                    "liability_bodily_gross_million_toman": repr(liability_bodily_gross),
                    "final_uncovered_property_excess_million_toman": repr(final_uncovered),
                    "record_type": "synthetic",
                }
            )

        month_claims = claims[month_claim_start:]
        month_components = components[month_component_start:]
        own_paid = sum(
            float(claim["insurer_paid_million_toman"])
            for claim in month_claims
            if claim["coverage_type"] == "own_damage"
        )
        tp_property_paid = sum(
            float(component["insurer_paid_million_toman"])
            for component in month_components
            if component["damage_type"] == "third_party_property"
        )
        tp_bodily_paid = sum(
            float(component["insurer_paid_million_toman"])
            for component in month_components
            if component["damage_type"] == "third_party_bodily"
        )
        total_paid = own_paid + tp_property_paid + tp_bodily_paid
        source_rows.append(
            {
                "Month_ID": month_id,
                "Accident_Count": accident_count,
                "At_Fault_Own_Damage_Claim_Count": at_fault_own_claims,
                "Injured_Party_Excess_Own_Damage_Claim_Count": injured_excess_claims,
                "Third_Party_Liability_Claim_Count": liability_claims,
                "Total_Claim_Count": len(month_claims),
                "Own_Damage_Paid_Million_Toman": repr(own_paid),
                "Third_Party_Property_Paid_Million_Toman": repr(tp_property_paid),
                "Third_Party_Bodily_Paid_Million_Toman": repr(tp_bodily_paid),
                "Total_Insurer_Paid_Loss_Million_Toman": repr(total_paid),
                "Uncovered_Property_Excess_Million_Toman": repr(month_uncovered),
            }
        )

        if len(accidents) - month_accident_start != accident_count:
            raise RuntimeError(f"Accident generation failed for {month_id}")

    for policy in policies:
        policy_id = str(policy["policy_id"])
        claim_count = claim_count_by_policy[policy_id]
        policy["empirical_claim_probability"] = round(
            len(claim_months_by_policy[policy_id]) / MONTH_COUNT,
            8,
        )
        policy["mean_paid_loss_million_toman"] = round(
            paid_by_policy[policy_id] / claim_count if claim_count else 0.0,
            8,
        )

    _write_csv(paths.source, SOURCE_COLUMNS, source_rows)
    source_checksum = sha256_file(paths.source)

    month_by_id = {str(row["Month_ID"]): row for row in source_rows}
    claims_by_month: dict[str, list[dict[str, object]]] = defaultdict(list)
    components_by_month: dict[str, list[dict[str, object]]] = defaultdict(list)
    components_by_claim: dict[str, list[dict[str, object]]] = defaultdict(list)
    accidents_by_month: dict[str, list[dict[str, object]]] = defaultdict(list)
    for claim in claims:
        claims_by_month[str(claim["month_id"])].append(claim)
    for component in components:
        components_by_month[str(component["month_id"])].append(component)
        components_by_claim[str(component["claim_id"])].append(component)
    for accident in accidents:
        accidents_by_month[str(accident["month_id"])].append(accident)
    accident_by_id = {str(accident["accident_id"]): accident for accident in accidents}

    def role_link_valid(claim: dict[str, object]) -> bool:
        accident = accident_by_id[str(claim["accident_id"])]
        policy = policy_by_id[str(claim["policy_id"])]
        if claim["claim_role"] == "at_fault_own_vehicle":
            return policy["vehicle_id"] == accident["at_fault_vehicle_id"] and policy["coverage_type"] == "own_damage"
        if claim["claim_role"] == "injured_third_party":
            return policy["vehicle_id"] == accident["at_fault_vehicle_id"] and policy["coverage_type"] == "third_party_liability"
        if claim["claim_role"] == "injured_party_property_excess":
            return (
                accident["injured_party_type"] == "portfolio_vehicle"
                and bool(accident["injured_vehicle_id"])
                and policy["vehicle_id"] == accident["injured_vehicle_id"]
                and policy["coverage_type"] == "own_damage"
                and float(claim["gross_damage_million_toman"]) > float(claim["deductible_million_toman"])
                and float(claim["insurer_paid_million_toman"]) > 0
            )
        return False

    def claim_component_identity_valid(claim: dict[str, object]) -> bool:
        linked = components_by_claim[str(claim["claim_id"])]
        if not linked:
            return False
        coverage_types_valid = all(
            (
                claim["coverage_type"] == "third_party_liability"
                and component["damage_type"] in {"third_party_property", "third_party_bodily"}
            )
            or (
                claim["coverage_type"] == "own_damage"
                and component["damage_type"] in {"at_fault_vehicle_property", "injured_vehicle_property_excess"}
            )
            for component in linked
        )
        component_identities_valid = all(
            abs(
                float(component["gross_damage_million_toman"])
                - float(component["deductible_million_toman"])
                - float(component["insurer_paid_million_toman"])
                - float(component["uncovered_after_component_million_toman"])
            )
            <= 1e-7
            for component in linked
        )
        claim_totals_valid = all(
            abs(sum(float(component[field]) for component in linked) - float(claim[claim_field])) <= 1e-7
            for field, claim_field in (
                ("gross_damage_million_toman", "gross_damage_million_toman"),
                ("deductible_million_toman", "deductible_million_toman"),
                ("insurer_paid_million_toman", "insurer_paid_million_toman"),
                ("uncovered_after_component_million_toman", "staged_uncovered_million_toman"),
            )
        )
        return coverage_types_valid and component_identities_valid and claim_totals_valid

    reconciliation: list[dict[str, object]] = []
    for month_id, source in month_by_id.items():
        month_claims = claims_by_month[month_id]
        month_components = components_by_month[month_id]
        month_accidents = accidents_by_month[month_id]
        generated_own = sum(
            float(item["insurer_paid_million_toman"])
            for item in month_claims
            if item["coverage_type"] == "own_damage"
        )
        generated_property = sum(
            float(item["insurer_paid_million_toman"])
            for item in month_components
            if item["damage_type"] == "third_party_property"
        )
        generated_bodily = sum(
            float(item["insurer_paid_million_toman"])
            for item in month_components
            if item["damage_type"] == "third_party_bodily"
        )
        generated_uncovered = sum(
            float(item["final_uncovered_property_excess_million_toman"])
            for item in month_accidents
        )
        differences = [
            abs(generated_own - float(source["Own_Damage_Paid_Million_Toman"])),
            abs(generated_property - float(source["Third_Party_Property_Paid_Million_Toman"])),
            abs(generated_bodily - float(source["Third_Party_Bodily_Paid_Million_Toman"])),
            abs(generated_uncovered - float(source["Uncovered_Property_Excess_Million_Toman"])),
            abs(
                generated_own
                + generated_property
                + generated_bodily
                - float(source["Total_Insurer_Paid_Loss_Million_Toman"])
            ),
        ]
        coverage_links_valid = all(
            policy_by_id[str(claim["policy_id"])]["coverage_type"] == claim["coverage_type"]
            for claim in month_claims
        )
        role_links_valid = all(role_link_valid(claim) for claim in month_claims)
        component_identities_valid = all(claim_component_identity_valid(claim) for claim in month_claims)
        limits_valid = all(
            float(item["insurer_paid_million_toman"])
            <= max(float(item["applicable_limit_million_toman"]) - float(item["deductible_million_toman"]), 0.0)
            + 1e-9
            for item in month_components
        )
        counts_valid = (
            len(month_accidents) == int(source["Accident_Count"])
            and len(month_claims) == int(source["Total_Claim_Count"])
            and sum(item["claim_role"] == "at_fault_own_vehicle" for item in month_claims)
            == int(source["At_Fault_Own_Damage_Claim_Count"])
            and sum(item["claim_role"] == "injured_party_property_excess" for item in month_claims)
            == int(source["Injured_Party_Excess_Own_Damage_Claim_Count"])
            and sum(item["coverage_type"] == "third_party_liability" for item in month_claims)
            == int(source["Third_Party_Liability_Claim_Count"])
        )
        max_difference = max(differences)
        passed = (
            counts_valid
            and coverage_links_valid
            and role_links_valid
            and component_identities_valid
            and limits_valid
            and max_difference <= 1e-7
        )
        reconciliation.append(
            {
                "month_id": month_id,
                "accident_count_valid": counts_valid,
                "policy_coverage_links_valid": coverage_links_valid,
                "claim_role_vehicle_links_valid": role_links_valid,
                "claim_component_identities_valid": component_identities_valid,
                "component_limits_valid": limits_valid,
                "maximum_absolute_difference": max_difference,
                "seed": stable_seed(f"S{month_id[1:]}"),
                "generator_version": GENERATOR_VERSION,
                "passed": passed,
            }
        )

    calibration_actuals = {
        "mean_accidents": float(np.mean([int(row["Accident_Count"]) for row in source_rows])),
        "mean_at_fault_own_claims": float(
            np.mean([int(row["At_Fault_Own_Damage_Claim_Count"]) for row in source_rows])
        ),
        "mean_liability_claims": float(
            np.mean([int(row["Third_Party_Liability_Claim_Count"]) for row in source_rows])
        ),
        "mean_at_fault_own_paid": total_at_fault_own_paid / total_at_fault_own_claims,
        "mean_liability_paid": total_liability_paid / total_liability_claims,
    }
    calibration = {
        key: {
            "target": CALIBRATION_TARGETS[key],
            "actual": actual,
            "relative_difference": abs(actual / CALIBRATION_TARGETS[key] - 1.0),
            "passed": abs(actual / CALIBRATION_TARGETS[key] - 1.0) <= 0.05,
        }
        for key, actual in calibration_actuals.items()
    }
    entity_checks = {
        "exactly_one_liability_policy_per_vehicle": len(tp_by_vehicle) == VEHICLE_COUNT,
        "separate_own_damage_policies": len(od_by_vehicle) == OWN_DAMAGE_POLICY_COUNT,
        "no_combined_policy": all(policy["coverage_type"] != "both" for policy in policies),
        "claim_policy_coverage_compatible": all(
            policy_by_id[str(claim["policy_id"])]["coverage_type"] == claim["coverage_type"]
            for claim in claims
        ),
        "claim_role_vehicle_links_valid": all(role_link_valid(claim) for claim in claims),
        "claim_component_identities_valid": all(claim_component_identity_valid(claim) for claim in claims),
        "all_claims_link_to_accidents": {claim["accident_id"] for claim in claims}.issubset(
            {accident["accident_id"] for accident in accidents}
        ),
        "nonzero_limit_excess_examples": any(
            float(row["Uncovered_Property_Excess_Million_Toman"]) > 0 for row in source_rows
        )
        and any(claim["claim_role"] == "injured_party_property_excess" for claim in claims),
    }
    all_passed = (
        all(item["passed"] for item in reconciliation)
        and all(entity_checks.values())
        and all(item["passed"] for item in calibration.values())
    )

    month_records = [
        {
            "month_id": row["Month_ID"],
            "accident_count": row["Accident_Count"],
            "at_fault_own_damage_claim_count": row["At_Fault_Own_Damage_Claim_Count"],
            "injured_party_excess_own_damage_claim_count": row[
                "Injured_Party_Excess_Own_Damage_Claim_Count"
            ],
            "third_party_liability_claim_count": row["Third_Party_Liability_Claim_Count"],
            "total_claim_count": row["Total_Claim_Count"],
            "own_damage_paid_million_toman": row["Own_Damage_Paid_Million_Toman"],
            "third_party_property_paid_million_toman": row[
                "Third_Party_Property_Paid_Million_Toman"
            ],
            "third_party_bodily_paid_million_toman": row[
                "Third_Party_Bodily_Paid_Million_Toman"
            ],
            "total_insurer_paid_loss_million_toman": row[
                "Total_Insurer_Paid_Loss_Million_Toman"
            ],
            "uncovered_property_excess_million_toman": row[
                "Uncovered_Property_Excess_Million_Toman"
            ],
            "source_row_number": index + 1,
            "source_sha256": source_checksum,
            "critical_checks_pass": all_passed,
        }
        for index, row in enumerate(source_rows)
    ]

    for obsolete in (
        paths.derived / "monthly_portfolio.csv",
        paths.derived / "policy_exposures.csv.gz",
        paths.derived / "scenarios.csv",
        paths.root / "public" / "data" / "monthly.json",
        paths.root / "public" / "data" / "scenarios.json",
    ):
        if obsolete.exists():
            obsolete.unlink()

    _write_csv(paths.derived / "vehicles.csv", list(vehicles[0]), vehicles)
    _write_csv(paths.derived / "policies.csv", list(policies[0]), policies)
    _write_csv(paths.derived / "months.csv", list(month_records[0]), month_records)
    _write_gzip_csv(paths.derived / "accidents.csv.gz", list(accidents[0]), accidents)
    _write_gzip_csv(paths.derived / "claims.csv.gz", list(claims[0]), claims)
    _write_gzip_csv(paths.derived / "claim_components.csv.gz", list(components[0]), components)
    _write_csv(paths.validation / "reconciliation.csv", list(reconciliation[0]), reconciliation)

    source_manifest = {
        "contract_version": 2,
        "source": "Students Work/Data/insurance_simulated_data.csv",
        "sha256": source_checksum,
        "rows": len(source_rows),
        "schema": SOURCE_COLUMNS,
        "interpretation": "Each row is one synthetic monthly observation of the same stationary portfolio. M0001-M1000 preserve month order but are not real calendar dates and do not imply seasonality.",
        "authoritative": True,
        "regeneration_locked": True,
        "generated_entity_first": True,
        "superseded_sha256": "51F3C6760F42ACBE76DDA42ED2CCFAC04F744E32C97D93A446EA51B9438ECC8F",
        "monetary_unit": MONETARY_UNIT,
    }
    generation_manifest = {
        "contract_version": 2,
        "generator_version": GENERATOR_VERSION,
        "rng_namespace_version": RNG_NAMESPACE_VERSION,
        "master_seed": MASTER_SEED,
        "month_count": MONTH_COUNT,
        "vehicle_count": VEHICLE_COUNT,
        "third_party_liability_policy_count": VEHICLE_COUNT,
        "own_damage_policy_count": OWN_DAMAGE_POLICY_COUNT,
        "injured_party_population": "mixed portfolio and external market",
        "in_portfolio_injured_probability": IN_PORTFOLIO_INJURED_PROBABILITY,
        "liability_claim_probability_per_accident": LIABILITY_CLAIM_PROBABILITY,
        "monetary_unit": MONETARY_UNIT,
        "portfolio_parameters": {
            "own_damage_policy_share": 0.70,
            "segment_probabilities": {"standard": 0.62, "preferred": 0.25, "commercial": 0.13},
            "vehicle_risk_score": {"distribution": "lognormal", "log_mean": 0.0, "log_sigma": 0.34, "minimum": 0.40, "maximum": 3.20},
            "insured_value": {"distribution": "lognormal", "mean": 850.0, "log_sigma": 0.55, "minimum": 250.0, "maximum": 3500.0},
            "own_damage_deductible": 5.0,
            "liability_property_limits": {"values": [100.0, 200.0, 400.0], "probabilities": [0.25, 0.55, 0.20]},
            "liability_bodily_limits": {"values": [1000.0, 1500.0], "probabilities": [0.70, 0.30]},
        },
        "event_and_severity_parameters": {
            "accident_frequency": {"distribution": "Poisson", "mean": 100.0},
            "at_fault_own_damage": {"distribution": "lognormal", "gross_mean": 31.6, "log_sigma": 0.595},
            "liability_property_presence_probability": 0.90,
            "liability_property": {"distribution": "lognormal", "gross_mean": 70.0, "log_sigma": 0.80},
            "liability_bodily_presence_probability": 0.15,
            "liability_bodily": {"distribution": "Pareto type I", "shape": 2.40, "gross_mean": 150.0},
        },
        "claim_rules": [
            "Every policy covers exactly one product.",
            "One physical accident may create claims under separate policies.",
            "Liability property and bodily components respect their own policy limits.",
            "Eligible property excess may create a separate injured-party own-damage claim.",
            "Uncovered amounts are never included in insurer-paid loss.",
        ],
        "calibration": calibration,
    }
    validation = {
        "status": "pass" if all_passed else "fail",
        "critical_checks_pass": all_passed,
        "months_checked": len(reconciliation),
        "failed_months": [item["month_id"] for item in reconciliation if not item["passed"]],
        "source_sha256": source_checksum,
        "generator_version": GENERATOR_VERSION,
        "entity_checks": entity_checks,
        "calibration": calibration,
        "maximum_absolute_difference": max(item["maximum_absolute_difference"] for item in reconciliation),
    }
    for target, payload in (
        (paths.manifests / "source.json", source_manifest),
        (paths.manifests / "generation.json", generation_manifest),
        (paths.validation / "summary.json", validation),
    ):
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    browser_months = [
        {
            "month_id": row["Month_ID"],
            "accidents": row["Accident_Count"],
            "at_fault_own_claims": row["At_Fault_Own_Damage_Claim_Count"],
            "injured_excess_claims": row["Injured_Party_Excess_Own_Damage_Claim_Count"],
            "own_claims": int(row["At_Fault_Own_Damage_Claim_Count"])
            + int(row["Injured_Party_Excess_Own_Damage_Claim_Count"]),
            "liability_claims": row["Third_Party_Liability_Claim_Count"],
            "total_claims": row["Total_Claim_Count"],
            "own_amount": float(row["Own_Damage_Paid_Million_Toman"]),
            "third_property_amount": float(row["Third_Party_Property_Paid_Million_Toman"]),
            "third_bodily_amount": float(row["Third_Party_Bodily_Paid_Million_Toman"]),
            "third_amount": float(row["Third_Party_Property_Paid_Million_Toman"])
            + float(row["Third_Party_Bodily_Paid_Million_Toman"]),
            "payout": float(row["Total_Insurer_Paid_Loss_Million_Toman"]),
            "uncovered_property_excess": float(row["Uncovered_Property_Excess_Million_Toman"]),
        }
        for row in source_rows
    ]
    payouts = np.array([row["payout"] for row in browser_months], dtype=float)
    policy_models: dict[str, dict[str, float | int]] = {}
    for coverage in ("all", "own_damage", "third_party_liability"):
        for segment in ("all", "standard", "preferred", "commercial"):
            selected = [
                policy
                for policy in policies
                if (coverage == "all" or policy["coverage_type"] == coverage)
                and (segment == "all" or policy["segment"] == segment)
            ]
            policy_models[f"{coverage}:{segment}"] = {
                "policy_count": len(selected),
                "mean_claim_probability": float(
                    np.mean([float(policy["empirical_claim_probability"]) for policy in selected])
                ),
                "mean_paid_loss": float(
                    np.mean([float(policy["mean_paid_loss_million_toman"]) for policy in selected])
                ),
            }
    summary = {
        "months": MONTH_COUNT,
        "vehicles": VEHICLE_COUNT,
        "third_party_policies": VEHICLE_COUNT,
        "own_damage_policies": OWN_DAMAGE_POLICY_COUNT,
        "total_policies": len(policies),
        "total_accidents_across_months": len(accidents),
        "total_claims_across_months": len(claims),
        "at_fault_own_damage_claims_across_months": sum(row["at_fault_own_claims"] for row in browser_months),
        "injured_party_excess_claims_across_months": sum(row["injured_excess_claims"] for row in browser_months),
        "liability_claims_across_months": sum(row["liability_claims"] for row in browser_months),
        "own_damage_paid_across_months": float(sum(row["own_amount"] for row in browser_months)),
        "liability_paid_across_months": float(sum(row["third_amount"] for row in browser_months)),
        "uncovered_property_excess_across_months": float(sum(row["uncovered_property_excess"] for row in browser_months)),
        "months_with_uncovered_property_excess": sum(row["uncovered_property_excess"] > 0 for row in browser_months),
        "mean_accidents": calibration_actuals["mean_accidents"],
        "mean_claims": float(np.mean([row["total_claims"] for row in browser_months])),
        "mean_payout": float(payouts.mean()),
        "p95_payout": float(np.quantile(payouts, 0.95, method="inverted_cdf")),
        "max_payout": float(payouts.max()),
        "source_sha256": source_checksum,
        "reconciliation_status": validation["status"],
        "generator_version": GENERATOR_VERSION,
        "monetary_unit": MONETARY_UNIT,
        "policy_models": policy_models,
    }
    public_data = paths.root / "public" / "data"
    public_data.mkdir(parents=True, exist_ok=True)
    (public_data / "months.json").write_text(
        json.dumps(browser_months, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    (public_data / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return validation


def load_source(paths: PipelinePaths | None = None) -> tuple[list[dict[str, int | float | str]], str]:
    paths = paths or default_paths()
    if not paths.source.exists():
        raise FileNotFoundError(f"Authoritative month CSV not found: {paths.source}")
    checksum = sha256_file(paths.source)
    with paths.source.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != SOURCE_COLUMNS:
            raise RuntimeError(f"Unexpected v2 source schema: {reader.fieldnames}")
        rows: list[dict[str, int | float | str]] = []
        for raw in reader:
            row: dict[str, int | float | str] = {"Month_ID": raw["Month_ID"]}
            for column in SOURCE_COLUMNS[1:]:
                row[column] = int(raw[column]) if column in INTEGER_COLUMNS else float(raw[column])
            if any(float(value) < 0 for key, value in row.items() if key != "Month_ID"):
                raise RuntimeError("Source contains a negative count or amount")
            rows.append(row)
    if len(rows) != MONTH_COUNT:
        raise RuntimeError(f"Expected {MONTH_COUNT} months, found {len(rows)}")
    return rows, checksum


def assert_reconciled(paths: PipelinePaths | None = None) -> dict[str, object]:
    paths = paths or default_paths()
    summary_path = paths.validation / "summary.json"
    if not summary_path.exists():
        raise RuntimeError("Derived data have not been generated")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    _, checksum = load_source(paths)
    if summary.get("source_sha256") != checksum or not summary.get("critical_checks_pass"):
        raise RuntimeError("Version 2 entity data failed the reconciliation gate")
    return summary


if __name__ == "__main__":
    print(json.dumps(generate(), indent=2))
