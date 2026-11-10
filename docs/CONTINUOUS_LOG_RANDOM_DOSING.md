# Continuous log-uniform concentration + independent inclusion (v3.2.3)

This optional design mode differs from the existing **sparse-recovery sampling** and **discrete log-spaced** design modes. It independently samples whether to include each source liquid in each treatment well, and then independently samples a continuous positive concentration for each included liquid.

## User interface

1. In **Section 2 → Design mode**, select **Independent 50/50 inclusion + continuous log doses**.
2. Set **Treatment wells to generate** (e.g. 72), **Probability per source** (`0.5` for 50/50), **Random seed** (`1701`), and **Starting medium already in each well** (`300 µL` if appropriate).
3. Choosing this mode automatically switches every source row to **Continuous log-uniform**. Set its **stock concentration**, **minimum positive target concentration**, and **maximum positive target concentration**. Concentration units must match. Points are **not** used in continuous mode.
4. Optionally set **12 untreated** and **12 vehicle controls**. These control positions are mixed with treatments in a seeded shuffle; they are **not** subjected to the 50/50 source-inclusion draws. Leave `Reserved wells` empty to use all 96 positions.
5. Generate the randomized plate. Review the manifest, the source volume totals and physical plate capacity; export a candidate Assay Studio 2.3.2.6 CSV using **Generate new CSV** without a template, or optionally use **Import as template**.

## Mathematical rule

For each source `i` and each **treatment well** `w`:

- Draw an independent `B[i,w] ~ Bernoulli(p)` (default `p=0.5`).
- If `B=0`, requested target concentration is zero and no antibiotic dispensing task is generated for that source/well.
- If `B=1`, independently draw `U[i,w] ~ Uniform(0,1)` and compute

  `C[i,w] = Cmin[i] * (Cmax[i]/Cmin[i]) ** U[i,w]`.

This is *log-uniform*: `ln(C)` is uniform between the logs of the positive endpoints. It does **not** produce a finite dose grid. However, computers and actual I.DOT instruments operate at finite numeric and physical dispensing precision. A printed decimal in the CSV does not guarantee the instrument can reproduce that volume exactly.

With six drugs at `p=0.5`, the number of antibiotics assigned to a treatment well has a Binomial(6, 0.5) distribution: expected mean three, with all-zero assignments possible (probability `1/64`). A stochastic all-zero treatment assignment is still labeled `treatment`, *not* an explicit untreated control. Explicit controls remain distinguishable in the manifest.

The *nominal target* in **fixed starting medium** mode uses the starting-medium volume in the concentration-to-volume formula:

`dispense_uL = (nominal_target_concentration / stock_concentration) * starting_medium_uL`.

Because antibiotics are added on top, the *actual mixture concentration* is slightly lower; the manifest includes the corrected values using the actual resulting final volume.

## Model matrix and analysis

Unlike the discrete-dose modes, this mode exports numeric features that encode both presence and log dose:

- `main__i__presence`: 0/1 drug inclusion.
- `main__i__logdose`: normalized log target dose from 0 to 1 for present drugs, zero when absent.
- `pair__i__j__presence`: product of the two drug inclusion indicators.
- `pair__i__j__logdose`: product of the two normalized log doses.

The matrix, feature legend, manifest and measurements template are included in **Download all plates ZIP**. The existing `analysis/fit_sparse_effects.py` analyzes these columns with cross-validated LASSO; the fit is an exploratory effect model, not proof of antibiotic synergy or exact reconstruction of untested combinations. The independent 50/50 design is **not** an algorithmically optimized compressed-sensing matrix; use independent follow-up experiments to validate any discovered effects.

## Practical safeguards

- **Positive endpoints must satisfy** `0 < min < max <= stock concentration` in the selected unit. A transfer based on the minimum concentration must meet the configured **minimum transfer volume**, and the maximum must not exceed the configured maximum transfer volume.
- The app still checks total source-well usable volumes and optional physical destination-well capacity. Source checks exclude dead volume and priming.
- A fixed `300 µL` starting volume *plus* additions may exceed a standard 96-well plate's validated capacity. Confirm actual labware and headspace before dispensing.
- Keep the source liquid classes, stock concentrations, and vehicle compositions compatible with the physical setup. Vehicle-only controls don't automatically match solvent contributions from all antibiotic stocks.
- A generated **Assay Studio 2.3.2.6 CSV remains a candidate** until successfully imported and inspected in Assay Studio on your instrument.

## Developer verification

From the repository root:

```bash
node --test
node scripts/build-standalone.js --check
```

Use the prepared example project `I.DOT_Plate_Studio_v3_2_3_300uL_50_50_Example_Project.json` to inspect 72 randomized treatment wells and 24 randomized control wells.
