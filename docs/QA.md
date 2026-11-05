# QA — v3

## Automated

`node --test tests/*.test.js`

- v2 plate geometry, task import, randomization, seed determinism, manifests, ZIP.
- Native 1536-well coordinates (`Aa01` through `Hd48`).
- 16-column v2.3.2.6 header and per-row metadata.
- UTF-8 BOM, CRLF, scientific volumes, sequential multiple target plates.
- Synthetic 384-/1536-well protocol round trips.
- Optional real-reference tests (files are **not** included in public repository) assert byte-for-byte equality of each original after import/export.

## Browser checks performed during development

- Opened app in Chromium using document/script injection because the test environment disallowed direct URL navigation (not a limitation of the final app).
- Imported the real six-target-plate 384-well protocol; navigated among all six plates; exported one combined protocol **byte-identical** to the uploaded source.
- Imported the real 1536-well example; exported it byte-identical.
- Generated a 96-condition balanced subset on a 1536-well grid and exported a complete candidate protocol.
- No JavaScript page errors observed.

## Required physical verification (not yet performed)

1. Load candidate file in actual Assay Studio 2.3.2.6 and confirm import succeeds.
2. Check target/source consumable type, barcode, liquid-library definitions, source fill volume, per-source additional volume, well position and dispense volume.
3. Compare Assay Studio's visual plate preview to design manifest for each target plate.
4. Validate with a noncritical water/dye test and your normal lab's procedures before deploying real assays.

The project remains **unverified on physical I.DOT hardware**.
