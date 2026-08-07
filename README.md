# Actuarial Risk Theory Laboratory

An interactive final project for the Risk Theory course in the M.Sc. Actuarial Sciences program at Shahid Beheshti University, Spring 1405.

The laboratory follows one synthetic motor insurer through portfolio lineage, risk measures, utility and reinsurance, individual and collective aggregate-loss models, and finite-horizon ruin. Results are explicitly labeled as source, reconstructed, empirical, fitted, approximate, simulated, or textbook scenarios.

The interface is fully bilingual in English and Persian. Each chapter view names its course reference, shows mathematical symbols beside adjustable parameters, explains how its charts implement the textbook formulas, and credits the students whose work contributes to the displayed calculations. The Persian risk-measures source is identified throughout as **Chapter 2 - Dr. Payandeh**.

## Integrity first

`../Students Work/Data/insurance_simulated_data.csv` is authoritative and immutable. The generator assigns `M0001`–`M1000` identifiers without inventing dates, reconstructs deterministic accident/claim/policy/exposure companions, and writes a reconciliation report. The API refuses derived data unless every critical check passes.

Original student files are never imported as production code. Ported modules retain academic-provenance headers, and `provenance/contributions.json` maps contributors, source evidence, adaptations, and integrated modules.

## Local development

Requirements: Node 22.19+, Python 3.11+ (3.13 tested), and Docker for the production rehearsal.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
.\.venv\Scripts\python.exe scripts\generate_companion_data.py
npm ci
npm run dev
```

Run FastAPI separately when exercising live analytical endpoints:

```powershell
.\.venv\Scripts\python.exe -m uvicorn apps.api.main:app --reload --port 8000
```

The dashboard is at `http://localhost:3000`; OpenAPI is at `http://localhost:8000/docs`. Scenario controls write shareable parameters into each page URL.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest
npm run lint
npm run build
npm test
```

Python tests cover deterministic regeneration, lineage, exact reconciliation, VaR/TVaR properties, utility and stop-loss identities, convolution, Panjer/FFT agreement, moment checks, heavy-tail refusal, ruin monotonicity, API schemas, and simulation limits.

## Containers

`docker compose up --build` starts a single public web origin and an internal FastAPI service. See `docs/DEPLOYMENT.md` for the local reverse-proxy rehearsal, security checklist, and rollback notes. No public deployment is performed by this project.
