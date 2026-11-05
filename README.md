# I.DOT Plate Studio v3
IA Primarily AI v1.0
**Offline macOS-compatible plate-layout and randomized experimental-design tool with Assay Studio 2.3.x CSV import/export.**

Open `index.html` in Safari, Firefox, or Chrome on a Mac. No Python, server, package installation, or online account is needed. Alternatively, use the standalone `dist/I.DOT_Plate_Studio_v3_for_Mac.html` distribution. The app **does not control the I.DOT hardware**.

> **Validation boundary:** The v3 16-column CSV importer/exporter is based on two genuine Assay Studio **2.3.2.6** examples, one with six 384-well target plates and another with one 1536-well target plate. Both files were round-tripped **byte-for-byte** in automated and browser tests, but new generated protocols **have not been imported into Assay Studio or run on a physical dispenser**. Validate the final CSV and all liquid classes, consumables and volumes inside Assay Studio before dispensing.

## Quick start

1. Open `index.html` locally on your Mac.
2. Import **one genuine Assay Studio 2.3.x CSV** under **Protocol setup → Import Assay Studio CSV**. Importing one of your known-working files enables the matching 16-column full-protocol exporter. You may import the 384-well reference for 384-well designs or the 1536-well reference for 1536-well designs.
3. For a manual layout, click destination wells and assign Source Well, Volume (µL), and Liquid Name. For randomized studies, configure six compounds (or fewer), stock concentrations, dose levels, assay volume and seed; choose **Balanced subset**, **Full factorial**, or **Randomized replicates** and generate the design.
4. Confirm **Source Plate Type**, **Liquid Class Name**, **Additional Volume Per Source Well** and **Waste Well**. These inputs apply to **new transfers**; pre-existing imported row metadata is retained. The defaults inferred from the examples (particularly the water-based liquid class) may **not** be appropriate for your compounds.
5. Review plate maps, transfer counts, target and source volumes, the design manifest and any external diluent top-up amounts.
6. Download **Assay Studio CSV** for the currently selected plate, **combined multi-plate CSV** for all target plates, or **All plates ZIP** for randomized designs (manifest + source map + configuration + candidate per-plate and combined protocols).
7. Open the candidate CSV in the real Assay Studio and review it before attempting to operate the I.DOT.

## What's new in v3

| Capability | Implementation |
|---|---|
| Instrument format | `sep=,` + 2.3.x metadata/settings + empty line + **16-column** dispensing header, from real instrument templates |
| Encoding | UTF-8 **with BOM**, CRLF line endings |
| 384-well wells | `A01` to `P24` |
| 1536-well wells | `Aa01` to `Hd48` (32 × 48). The on-screen grid uses normal `A1…AF48` labels and translates on export |
| Multi-plate protocols | One I.DOT file with `Target Plate 1` through `Target Plate N` in column 1 |
| Hardware metadata | Preserves existing template metadata, source plate type/barcodes, liquid class, waste well, overhead, offsets and spot array |
| Edited/new transfers | New rows use an explicitly configurable profile and the imported template's settings |
| Import | Reads and displays multi-plate 384-well or single 1536-well reference files; preserves source rows |
| Project saving | JSON v3 preserves generated design or imported multi-plate data; supports opening older v2 projects |
| Export extras | Four-column task-list CSV remains available **only as a planning format**; design manifest and source map are separate from instrument CSV |

## Randomized designs retained from v2

With six compounds at three levels each, a full factorial design has **3⁶ = 729** possible conditions, normally requiring at least **eight 96-well plates**, without controls or repeats. A 96-condition balanced subset attempts marginal balance and pairwise coverage without guaranteeing complete balance for all interactions. Seeded assignment is reproducible. Replicate mode allows repeated conditions at randomized positions. Set reserved control wells and user-selected min/max transfer limits.

In concentration mode:

```
transfer_uL = target_concentration / stock_concentration * final_assay_volume_uL
```

Dose level **0** creates no compound dispense. If you leave **Include top-up/diluent** unchecked, the randomized manifest's `external_top_up_uL` column represents volume **not included** in the generated I.DOT protocol. Add that volume with a separate validated step. Check source depletion, priming and dead volume: this app does not infer or verify actual dead-volume requirements from the source plate type.

## Compatibility and limitations

- The 2.3.x exporter **requires a genuine instrument CSV matching the selected target plate format**; it does not invent its own operational settings. The supplied 384-well reference is suitable as a format template for 384-well target plates, not 1536-well plates; vice versa for the 1536 example.
- The source selection defaults to a **96-well source-coordinate grid**, corresponding to the wells seen in the provided L.100 Plate examples. Verify that the configured labware is correct for your instrument.
- **Liquid Name** and **Liquid Class Name** are different columns. The existing reference files use `VSCY 1 mPa*s (H2O)` as a liquid class, but that does not establish suitability for any other reagent. **Additional Volume Per Source Well** defaults to **0 µL for new liquids**, without changing original imported row values.
- Plate CSV candidate files are **not** validated for instrument execution; v3 does not have a supported direct connection to I.DOT, automatic liquid calibration, acoustic/dispensing verification, automatic waste hardware setup, or a substitute for Assay Studio.
- 96-well output is supported by the editor's plate geometry but **has not been validated against a genuine 96-well Assay Studio 2.3.x sample**. Use a 96-well instrument-exported CSV if available.
- Input CSVs and project JSON stay local in your browser. The project makes no network calls or telemetry requests.

See [docs/ASSAY_STUDIO_2_3_FORMAT.md](docs/ASSAY_STUDIO_2_3_FORMAT.md) for the exact field definitions and reference testing.

## Development

```bash
node --test tests/*.test.js
```

Only Node.js is needed for tests; it is not required for the browser app. Tests include synthetic reference files, well conversion, full factorial design, randomized subset, metadata preservation and CSV serialization. Tests also perform byte-for-byte roundtrips on the researcher's real reference CSVs **when they are present in the parent working directory**, without packaging those source files into the repository.

This is a **GitLab- and GitHub-compatible Git repository**. `.gitlab-ci.yml` runs the Node tests and offers a manual GitLab Pages publication job; `.github/workflows/test.yml` runs them with GitHub Actions. Static GitHub Pages works by publishing `index.html` and `src/` from a normal Pages configuration (or by opening the standalone file locally).

### Push to GitLab

```bash
git init
git add .
git commit -m "I.DOT Plate Studio v3: 16-column Assay Studio 2.3.x CSV"
git branch -M main
git remote add origin https://gitlab.com/YOUR_NAMESPACE/idot-plate-studio.git
git push -u origin main
```

### Push to GitHub instead

```bash
git init
git add .
git commit -m "I.DOT Plate Studio v3: Assay Studio 2.3.x CSV"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/idot-plate-studio.git
git push -u origin main
```

**Not an official DISPENDIX/CYTENA product.This work was primarily AI-generated** This project is MIT-licensed (see `LICENSE`).
