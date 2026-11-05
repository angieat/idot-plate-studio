# How randomization works

A **condition** is a combination of one dose level for each compound. If each of six compounds has three possible levels (`0`, `1`, `5`), there are `3^6 = 729` unique combinations. A level of zero means the compound is absent. The app treats combinations as six-tuples of level indices and assigns stable `combination_id` values based on enumeration order. **The IDs are labels, not plate positions.**

## Full factorial

Enumerates all combinations, shuffles them with the supplied PRNG seed, then places them into a separately shuffled list of available wells per plate. A plate has `plate_well_count − reserved_wells` available positions. The example of 729 conditions requires 8 × 96-well plates (without reserved wells) or 2 × 384-well plates.

## Balanced randomized subset

Uses a seeded greedy algorithm to select the requested number of **unique** combinations without replacement. At each selection it minimizes an incremental score based on how often that compound's dose level has already been used, plus a smaller penalty for how often each pair of dose levels has already appeared. After choosing combinations, it shuffles their order and available physical well addresses. The 96-condition default with six three-level compounds produces 32 assignments per level for each compound and complete nine-of-nine pair-level coverage for all compound pairs for the default seed (`1701`). Other seeds, levels, or sample sizes may vary.

This is **heuristic** balance, not a mathematically optimal fractional factorial array. It does not guarantee independence among all effects, pairwise orthogonality, or balance of higher-order interactions. Review the displayed level counts and pairwise coverage and confirm that a subset is appropriate for your statistical model. To guarantee coverage of every condition, use full factorial instead.

## Randomized replicates

Selects a unique balanced subset, repeats each condition `replicates` times, then shuffles assignments across the available wells. Each replicate has its own `replicate` number in the manifest, and a combination may occur on different plates. All replicas are technical layout repeats unless the experiment's sample preparation explicitly makes them biological replicates.

## Reproducibility

`seed` is a string hashed into a deterministic 32-bit PRNG state. The generated project saves mode, dose levels, seed, source/target formats, reserved wells, and full assignment tables; reloading independently regenerates the design and verifies that the stored assignments match. Export `experiment_config.json` or project JSON to retain provenance.

## Final volume and dosing

- **Final concentration mode:** `volume_uL = target / stock × final_assay_volume_uL`, with matching stock/target units.
- **Direct volume mode:** entered dose levels are dispense volumes in µL. Concentrations are not inferred.
- **Zero levels:** no compound dispense task is added; a zero-dose control still receives a row in the manifest.
- **Fixed final volume:** `external_top_up_uL = final_assay_volume_uL − sum(compound_dispense_uL)` by default. *External top-up does not appear as an I.DOT dispense task.*
- **Optional internal diluent:** if enabled, add a diluent transfer from a separate source well for the calculated remaining volume. The usable source volume and per-transfer limits are enforced on generated plans, but real device dead-volume, priming, and model-specific limits still need verification.
- **Source consumable limit:** the configured check is per source well, **per plate**, and counts requested dispensing volume only. It is not an instrument priming/fill-volume simulation.

## Experiment integrity

Random assignment does not automatically correct positional effects, edge effects, batch effects, solvent-related confounding, plate-to-plate variation, or liquid incompatibility. Reserve wells for controls deliberately and verify the number of control/vehicle wells the assay requires. If conditions are chemically incompatible, exclude or redesign those combinations **before** dispensing; the app does not model compound interactions or solubility.

The maximum design size is 25,000 assignments and 200 destination plates as a browser safety limit. The dose-level input supports 2–5 levels per compound. The UI initially provides exactly six compound rows to match the example experiment; the design engine itself supports 1–12 compounds.
