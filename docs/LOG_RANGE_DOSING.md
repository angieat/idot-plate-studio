# Per-source log-spaced dose ranges (v3.2.1)

## Usage

1. Set **Dose interpretation** to concentration, **Volume calculation mode** to *Fixed starting medium + antibiotic additions* and starting medium to `300` µL.
2. Under *Compounds and dose levels*, set any compound’s **Dose scheme** to *Log-spaced range*.
3. Set its **Min (>0)** and **Max (>min)** concentration in the same unit as its stock concentration; choose 2–4 **Positive points**. Check **Include 0** for optional absence. Repeat with separate bounds for each source.
4. Keep **Dose scheme = Manual levels** for compounds where you already have fixed levels.
5. Select sparse-recovery sampling (or another design mode), input random seed, control counts, and generate. Record the exported dose manifest and model matrix.

## Calculation

For `n` positive levels, `dose_i = exp(log(min) + i*(log(max)-log(min))/(n-1))`, for `i=0..n-1`. Include zero as a separate categorical absence state. A value of zero is never included in a logarithm. Endpoints are exact.

These **discrete** log-spaced levels are randomized among well assignments; they are **not** draws from a continuous log-uniform distribution. Sparse design uses the generated levels as categories for the main-effect and pairwise feature matrix. Do not claim guaranteed compressed-sensing recovery.

For concentration mode, transfer volume = target dose × nominal volume / stock concentration. In fixed-starting-medium mode, actual final concentration = stock concentration × volume / (starting medium + sum of additions). See `design_manifest.csv`.

## Checks

- Positive min strictly smaller than max; 2–4 positive points per source.
- Max dose must not exceed stock concentration.
- Every source needs an explicit zero level when randomized antibiotic-free controls are used.
- Min/max dispense volumes, source capacity, and physical well-volume limit remain enforced.
- Multiple sources need independent liquid-class verification, including solvents and dispenses near low-volume limits.
- The 96-well I.DOT instrument CSV is not physically validated.
