# Actuarial Risk Theory Laboratory

An interactive final project for the Risk Theory course in the M.Sc. Actuarial Sciences program at Shahid Beheshti University, Spring 1405.

The laboratory follows one synthetic motor insurer through portfolio lineage, risk measures, utility and reinsurance, individual and collective aggregate-loss models, and finite-horizon ruin. The interface is bilingual in English and Persian, and each calculation states its model, unit, assumptions, and academic provenance.

## Data contract v2

`../Students Work/Data/insurance_simulated_data.csv` is the authoritative derived summary of 1,000 synthetic monthly observations for one stationary portfolio. `M0001`–`M1000` preserve month order, but they are not real calendar dates and do not imply seasonality. Amounts are synthetic Spring 1405 **million tomans**.

The generator creates entities before aggregates:

`10,000 vehicles → 17,000 separate policies → physical accidents → compatible claims → paid-loss components → month summaries`

- Every vehicle has exactly one third-party liability policy.
- Exactly 7,000 vehicles also have a separate own-damage policy.
- No policy record combines the products.
- One accident may trigger claims under multiple distinct policies.
- Property, bodily, deductibles, policy limits, eligible own-damage excess, and final uncovered property excess are explicit.
- Uncovered amounts never enter insurer-paid loss.
- `Total_Loss_Cases` was removed because it had no supported coverage or payout meaning.

The superseded student CSV is preserved by checksum and audit statistics in `provenance/adaptation-notes/data-model-v2.md`. Its useful broad frequency and corrected-unit severity shape are retained only as calibration targets. The v2 source checksum, schema, parameters, seed, and calibration results are recorded under `data/manifests/`.

Readiness fails unless policy separation, claim coverage compatibility, accident links, limits, deductibles, aggregate identities, deterministic regeneration, and ±5% calibration tolerances all pass.

## Calculations

- Risk measures, utility, and reinsurance use month-level insurer-paid losses selectable by total, own-damage, or liability coverage.
- Individual risk uses generated coverage-specific policy probabilities and benefits. Its shared-accident view preserves dependence between separate contracts.
- Collective risk pairs claim frequency with claim-level severity. The combined book adds separately modeled own-damage and liability aggregate losses.
- Ruin resamples the same retained month loss distribution and uses the same premium basis as reinsurance.
- Python/FastAPI is the authoritative calculation layer; the browser does not invent proxy variance or quantile multipliers.

The API and data contract are version 2 (generator revision 2.1.0). Use `/api/portfolio/month/{id}`. The obsolete `/api/portfolio/scenario/{id}` endpoint returns HTTP 410 with migration guidance.

## Local development

Requirements: Node 22.19+ and Python 3.11+.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
.\.venv\Scripts\python.exe scripts\generate_companion_data.py
npm ci
npm run dev
```

Run FastAPI separately for live analytical endpoints:

```powershell
.\.venv\Scripts\python.exe -m uvicorn apps.api.main:app --reload --port 8000
```

The dashboard is at `http://localhost:3000`; OpenAPI is at `http://localhost:8000/docs`.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest
npm exec tsc -- --noEmit
npm run lint
npm run build
npm test
```

Tests cover deterministic regeneration, entity compatibility, limits and deductibles, exact month reconciliation, calibration, coverage-selectable API results, individual-risk consistency, the collective identity `E[S] = E[N]E[X]` on matching claim units, retained-loss ruin inputs, and rendered routes.

## Containers

`docker compose up --build` is reserved for a later local runtime rehearsal. See `docs/DEPLOYMENT.md`. No public deployment is performed by this implementation.
