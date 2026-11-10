# Two Assay Studio CSV export methods (I.DOT Plate Studio v3.2.2)

## Method A: Generate new CSV (default)

No instrument CSV upload is necessary. Under **Section 6 → Review and export**, keep **Generate new Assay Studio CSV — no upload needed** selected. The output includes:

- BOM / CRLF encoding, the `sep=,` delimiter declaration, five metadata/header lines, and exactly 16 columns for each transfer
- Protocol name from Section 1, fixed software version **2.3.2.6**, user label (editable), and locally generated date and time
- Seven instrument-setting expressions in the third line (reference-derived defaults listed below)
- Source plate, source well, destination plate, destination well, dispensing volumes, and relevant liquid metadata

The observed 2.3.2.6 reference default third line is:

```
DispenseToWaste=False,DispenseToWasteCycles=3,DispenseToWasteVolume=1e-7,UseDeionisation=True,OptimizationLevel=ReorderAndParallel,WasteErrorHandlingLevel=Ask,SaveLiquids=Never
```

**This is a candidate CSV, not a verified instrument protocol.** Waste, deionisation, save-liquids, and liquid-class settings must be confirmed for your instrument and experiment. Plate Studio offers editable controls for the first, fourth, and seventh expressions above. The other four match a provided reference file; the app does not validate their hardware implications.

## Method B: Use existing CSV as a template (optional)

1. Select **Use imported Assay Studio CSV as template** in Section 6.
2. Under Section 1, select **Load CSV as export template (optional)** and choose a real Assay Studio CSV.
3. The app keeps your existing well assignments and copies the instrument file's five-line header and liquid profiles. The template's source and destination plate formats must match your design.
4. Export normally. Imported rows keep their individual metadata where applicable; new transfers use your selected instrument settings and imported profile defaults.

To open a real Assay Studio file for **editing its transfers**, use the separate **Open Assay Studio protocol for editing** button in Section 1, which replaces the manually edited transfer table after confirmation. Opening another protocol is disabled while a randomized design is active.

## Exports and validation

- **Download Assay Studio CSV**: selected target plate
- **Download combined multi-plate CSV**: all target plates in one instrument CSV
- **Download all plates ZIP**: design manifest, source map, sparse model matrix, and individual and combined candidate instrument CSVs where dispensing tasks exist
- **Download task list CSV**: 4-column planner file; NOT an Assay Studio instrument CSV

**Instrument compatibility limit:** Verified examples cover 384-well and 1536-well destination plates at 2.3.2.6; there is no direct real 96-well example. New `96-Well` output passed internal round-trip parsing and browser download tests, but **has not been imported into actual Assay Studio**. Check destination capacity (300 µL prefill plus drug transfers may exceed a standard 96-well plate), actual stock concentrations, liquid classes, vehicle controls, and device-specific dispense limits before experimental use.

## GitHub

A cumulative patch from the original v3.1 release is available, so no intermediate v3.2/v3.2.1 installation is needed. See `docs/GITHUB_V3_1_TO_V3_2_2.md`.
