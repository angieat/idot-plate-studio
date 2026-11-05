# Update your existing GitHub repository to Plate Studio v3.1

## Which files changed

| File | What changed |
|---|---|
| `src/design.js` | Separate `starting` and `final` volume accounting; per-well final volume and actual concentrations; optional stock-to-MIC conversion; physical well-volume check; manifest fields; legacy defaults |
| `src/app.js` | Read/store new form settings, show actual volume and MIC results, prevent top-up in starting mode, maintain old JSON project support, and update ZIP notes |
| `index.html` | Add volume mode selector, dynamic starting/final volume label, optional stock MIC multiple and updated volume-limit description |
| `tests/starting-medium.test.js` | Regression tests for six 1× MIC drugs into 2 mL, mixed combinations, no top-up, source/target calculations and 16-column export |
| `scripts/build-standalone.js` | Build/check the offline Mac HTML from repository source, without external dependencies |
| `dist/I.DOT_Plate_Studio_v3_1_for_Mac.html` | Newly built standalone app, synced with source code |
| `examples/six-antibiotic-2000uL-starting-medium-config.json` | Example six-antibiotic configuration with 1,000× MIC stocks and prefilled medium |
| `README.md`, `docs/RANDOMIZATION.md`, this guide | Usage instructions and dosing conventions |
| `.github/workflows/test.yml`, `.gitlab-ci.yml` | Test that the committed standalone file matches source |

## Apply the provided patch to your existing GitHub checkout

1. Put `IDOT_Plate_Studio_v3_to_v3_1.patch` in your Mac's `~/Downloads` folder.
2. Open Terminal and switch to the existing cloned repository directory (the one containing `index.html` and `src/`).
3. Ensure no uncommitted changes will be overwritten; commit or stash your work first.
4. Apply and test:

```bash
cd /path/to/your/idot-plate-studio

git status
git pull --ff-only origin main

git apply --check ~/Downloads/IDOT_Plate_Studio_v3_to_v3_1.patch
git apply ~/Downloads/IDOT_Plate_Studio_v3_to_v3_1.patch

node --test tests/*.test.js
node scripts/build-standalone.js --check

git status
git add .
git commit -m "Add fixed starting-medium dosing and actual MIC calculations"
git push origin main
```

If `git apply --check` fails, your local files may differ from the original v3 ZIP. **Do not force the patch.** Compare changes with your current branch (`git diff`) or copy the updated files from the v3.1 ZIP and review them before committing.

## Example: prefilled 2,000 µL of medium

Set **Volume calculation mode** to **Fixed starting medium + antibiotic additions**, specify **2000** as starting medium, set **All stocks at × MIC** to **1000**, and enter each stock in µM plus dose levels in the same units.

For a drug with stock = 1000× MIC and nominal target = 1× MIC:

```text
Transfer = target / stock × starting_medium
         = 1 / 1000 × 2000 = 2 µL
```

For six 1× MIC antibiotics added to one prefilled well:

```text
Starting medium = 2,000 µL
Total antibiotic = 6 × 2 µL = 12 µL
Final volume = 2,012 µL
Actual multiple = 1,000 × 2 / 2,012 = 0.994036× MIC
External top-up = 0 µL
```

The I.DOT CSV contains **only antibiotic addition tasks**; no medium preparation step is generated. A destination plate genuinely limited to **2,000 µL** cannot accommodate this 2,012 µL example. A compatible larger vessel/labware and its verified headspace are required.

## I.DOT export scope

The application is still **unofficial**, and a candidate Assay Studio CSV still requires a matching manufacturer-exported template and review in Assay Studio before physical dispensing. The original user-supplied 384/1536 CSV fixtures were *not* added to this repository. In particular, the 96-well geometry exists but 96-well instrument export still needs a genuine 96-well template.
