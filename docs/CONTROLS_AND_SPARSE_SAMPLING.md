# Random controls and sparse-recovery-oriented sampling (v3.2)

## Two separate functions

**Randomly distributed controls:** Specify untreated controls, vehicle-only controls,
optional reference single-antibiotic controls *per plate*. Every plate gets that many
controls. All treatments and controls are assigned to available positions using one
stored random seed. No control-only rows are required. Empty controls have no I.DOT
transfer but are present in the manifest and measurements template.

**Sparse sampling:** `Sparse-recovery sampling` draws *unique* treatment combinations
from the factorial space by a seeded greedy heuristic. It balances main and pair-dose
coverage while penalizing repeated activation of the same model features. This is an
experimental-design heuristic, **not a guarantee** of restricted isometry, sparse recovery,
identifiability or synergy discovery. It is not the same as just spreading control wells.

## Suggested 96-well *example* (not a validated biological protocol)

- 6 compounds, each with 0, 0.5×, 1× MIC levels, supplied from stocks 1,000× MIC.
- Target plate 96-well, 300 µL of medium already present in each well.
- Fixed starting-medium plus additions, without media top-up.
- Design mode **Sparse-recovery sampling**, unique combinations **72**, replicates **not used in this mode**.
- Random controls per plate: untreated **12**, vehicle-only **12**, reference **0**.
- Reserved wells: **blank**. Generate -> 72 treatment wells + 24 controls = 96 total.
- Vehicle source e.g. `H12`, vehicle liquid name matching a source profile or verified
  liquid class, volume appropriate for the actual solvent-control experiment.
- Confirm the source consumable's usable volume and any priming/dead volume.
- Assay Studio 96-well instrument protocol compatibility remains **unverified** without
  a genuine 96-well Assay Studio reference template; this app is an experimental planner.

### Reference controls

Reference controls consist of a **single** selected antibiotic at one of its
configured nonzero levels. Enter the exact compound name and its exact dose
value (in the same unit as the compound row). All other antibiotics are zero.
A reference control may carry a solvent itself; its vehicle balance is not
computed automatically.

### Control caveats

Do **not** assume a generic vehicle-only control matches the DMSO, water, or other
solvents carried by all six antibiotic working stocks. The I.DOT liquid name is
not automatically the correct dispense **liquid class**; review Assay Studio
source metadata, viscosity, instrument settings, and physical source labware.
The plate planner does not add media to negative controls when starting-medium
mode is on. All wells are assumed to contain the configured medium already.

### Sparse design matrices and analysis

`Download all plates ZIP` contains:

- `design_manifest.csv`: status (`assigned`, `control`, `reserved`), role,
  actual volumes, treatment doses, `control_type` (`untreated`, `vehicle`, `reference`)
- `sparse_model_matrix.csv`: one row per treatment/control well, with 0/1 main-dose
  columns and pair-dose interaction columns. Model assumes effects are approximately
  additive plus a sparse set of pairwise interactions. No higher-order interaction
  effects are fitted.
- `sparse_feature_legend.csv`: maps model-feature IDs to compound names and doses
- `measurements_template.csv`: fill `response` with measured phenotype per well
- `source_map.csv` and I.DOT task CSVs; instrument protocol only with matching template

To do exploratory sparse regression after reading the plate, fill the
`response` column in `measurements_template.csv`, and run:

```bash
python3 -m pip install numpy pandas scikit-learn
python3 analysis/fit_sparse_effects.py \
  --matrix sparse_model_matrix.csv \
  --measurements measurements_template.csv \
  --outdir analysis_output
```

Optional `--baseline vehicle` or `--baseline untreated` subtracts the mean of
that control type **per plate**, before fitting; use only when the controls are
biologically appropriate. The model fits **treatment** wells, using
`GroupKFold` to avoid separating replicates of the same combination in train/test.
Report held-out metrics and validate promising treatments with confirmatory
replicates. Coefficients are contrasts to the absent-dose reference, *not* an
established pharmacologic synergy score. Confounding, nonlinearity, and noise may
invalidate compressed sensing recovery.

## Design caution

With 6 drugs at 3 levels, the complete factorial has **729** combinations.
An additive + all pairwise nonzero-dose model has 12 main-effect and 60
pair-effect columns = **72** predictors, even before nuisance factors. A sparse
72-treatment screen is *not* guaranteed to recover all 72 effects: recovery
requires that only a small subset meaningfully affect the measured response.
Adding treatment replicates reduces the number of independently sampled
combinations on a fixed plate. If reliable interaction attribution is essential,
use additional plates and confirm with independently randomized replicates.
