# Motor-insurance data model v2 audit

## Superseded student aggregate

- Path: `Students Work/Data/insurance_simulated_data.csv`
- SHA-256: `51F3C6760F42ACBE76DDA42ED2CCFAC04F744E32C97D93A446EA51B9438ECC8F`
- Shape: 1,000 rows, 9 columns
- Totals: 99,569 accidents; 69,763 own-damage event counts; 39,955 third-party event counts; 4,867 `Total_Loss_Cases`
- Monetary identities: own-damage amount equaled own count times mean severity; third-party amount equaled third-party count times mean severity; total payout equaled both coverage amounts.

## Defects requiring replacement

- The source mixed physical accidents, coverage-specific claim counts, severities, and paid amounts without an entity contract.
- `Total_Loss_Cases` was generated independently, did not affect paid loss, and had no documented coverage meaning.
- Coverage counts were valid as overlapping accident subsets, but the overlap was not recorded and therefore could not be observed directly.
- The first reconstruction created combined policies even though own-damage and third-party liability are separate contracts.
- 16,674 reconstructed claims (15.2%) were linked to a policy whose declared coverage did not include the claim.
- 1,485 reconstructed total-loss flags were assigned to accidents with no own-damage claim.
- The collective-risk page used accident frequency with blended claim severity, understating mean aggregate loss by 9.25%.
- The first v2 implementation interpreted the 1,000 rows as alternative scenarios. The project owner clarified that the intended aggregate contract remains one row per synthetic month.
- Currency was undocumented. Dividing the supplied amounts by 1,000 gives a plausible teaching scale in synthetic million tomans, but this is a project convention rather than market evidence.

## Approved replacement

The submitted aggregate is deliberately superseded by a deterministic entity-first simulation. It models separate coverage-specific policies, physical accidents, compatible claims, liability property/bodily components, policy limits, eligible injured-party own-damage excess, and exact paid-loss reconciliation. The replacement retains only the broad frequency and severity shape of the old data; no original row is treated as a market observation.

The current aggregate contract contains 1,000 synthetic monthly observations identified `M0001`–`M1000`. Those months are the shared empirical basis for all chapters. Their identifiers preserve order but do not represent real dates or justify seasonality claims. The selected month in the dashboard is a lineage drill-down, not a separate calculation basis.

- Current authoritative SHA-256: `277B20E8EB55E0C656B9EF524D3B4BFB42D59C20116E83AD6D0B8D2F83E039E6`
- Current schema: 1,000 rows and 11 explicit monthly fields.
- Generator revision: `2.1.0`; random-stream namespace: `2.0.0` so the validated accident and severity draws were preserved while identifiers changed.

The superseded interim scenario-labelled v2 source had SHA-256 `8BEC157C3362837FC1F314FA00EC80C7521F06EE69C2389F41D4769C773B75C`; it is retained here only as provenance for the semantic correction.
