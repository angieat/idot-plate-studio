# Assay Studio 2.3.2.6 instrument CSV format — reference-based specification

The following was deduced from two instrument-uploadable examples supplied by the researcher. Do not interpret the CSV structure as a manufacturer's universal file-format guarantee.

## Encoding / structure

- UTF-8 **BOM** (`EF BB BF`), CRLF (`\r\n`) newlines.
- Line 1: `sep=,`
- Line 2: protocol name, software version, user label, date, time (five CSV columns).
- Line 3: seven comma-separated instrument setting expressions, such as `DispenseToWaste=False`, `OptimizationLevel=ReorderAndParallel`, `SaveLiquids=Never`. This line is **preserved from an imported template** in template-based mode; in new-CSV mode Plate Studio generates a 2.3.2.6 header from the user-selected settings and reference defaults.
- Line 4: blank.
- Line 5: the exact sixteen-column header shown below.
- Line 6 onward: 16-column dispense records. One row is one dispense. Multiple rows can target the same well. Plate identity is a field in each row, rather than one protocol file per plate.

```csv
Target Plate,Target Plate Type,Target Plate Barcode,Target Well,Waste Well,Source Plate,Source Plate Type,Source Plate Barcode,Source Well,Volume [uL],Liquid Name,Additional Volume Per Source Well,Liquid Class Name,X Offset,Y Offset,Spot Array
```

## Sixteen dispense fields

| # | Header | Observed content / v3 behavior |
|---|---|---|
| 1 | Target Plate | `Target Plate 1` through `Target Plate 6` observed; new multi-plate designs use sequential target-plate identifiers |
| 2 | Target Plate Type | `384-Well`, `1536-Well` observed; generated geometry matches the selected target format; the 96-well output has not been verified in Assay Studio |
| 3 | Target Plate Barcode | Empty in both references; preserved for imported rows |
| 4 | Target Well | `A01`–`P24` (384); `Aa01`–`Hd48` (1536) |
| 5 | Waste Well | `Waste Tube` observed; inherited or editable for new rows |
| 6 | Source Plate | `Source Plate 1` observed; editable for new rows |
| 7 | Source Plate Type | `L.100 Plate` observed; editable for new rows |
| 8 | Source Plate Barcode | Empty in both references |
| 9 | Source Well | `A01` etc. Reference source wells fit a 96-well coordinate system |
| 10 | Volume [uL] | Scientific notation such as `2e0` or `2e-1` |
| 11 | Liquid Name | Specific reagent name, **not** its liquid class |
| 12 | Additional Volume Per Source Well | `177e-1` and `0e0` were observed. Existing imported values are preserved; **0** is used for new rows unless changed |
| 13 | Liquid Class Name | `VSCY 1 mPa*s (H2O)` observed. New experiments require independent liquid-class review |
| 14 | X Offset | Empty in both references, preserved for imported rows |
| 15 | Y Offset | Empty in both references, preserved for imported rows |
| 16 | Spot Array | Empty in both references, preserved for imported rows |

For 1536-well coordinates, the 32 physical rows use **uppercase A–H** followed by **lowercase a–d**, in row-major blocks of eight: `A1` (grid row 1) → `Aa01`, `H1` (row 8) → `Ha01`, `I1` (row 9) → `Ab01`, `AF48` (row 32) → `Hd48`.

## Verification results

| Reference | Dispensing rows | Target plates | Software version | Re-export result |
|---|---:|---:|---|---|
| `plate384_6_liquids_different_targets.csv` | 2,304 | 6 × 384-well | 2.3.2.6 | **Byte-for-byte identical** when re-exported unchanged |
| `plate1536_8liquid_test.csv` | 960 | 1 × 1536-well | 2.3.2.6 | **Byte-for-byte identical** when re-exported unchanged |

The examples themselves are **not bundled into the public source ZIP**; the test suite has standalone synthetic templates and optional tests that use the uploaded examples if available in the parent working directory.

### What this does *not* prove

Byte-for-byte round trips demonstrate parser/serializer fidelity only for the two supplied examples. A newly randomized CSV might still be rejected by Assay Studio due to version-specific rules, incorrect liquid classes, absent liquid library entries, source plate compatibility, numeric/volume constraints, timing, and dispensing setup. The program does **not** independently authenticate vendor settings or check instrument readiness. Always test an actual **Assay Studio import and preview** before attempting a real run.

## v3.2.2: generate from scratch or use template

**Generate new Assay Studio CSV (default)** creates the same five metadata/header rows and sixteen transfer columns without an uploaded CSV. The second metadata field is always software version `2.3.2.6`, which is the only observed reference version. The protocol name is taken from the UI, user label is editable (`Plate Studio` initially), and date/time come from the local clock. The third metadata row uses the values observed in the supplied 1536-well example by default, with explicit UI controls for dispense-to-waste, deionisation, and save-liquids. The template created by `IDotV23.createDefaultTemplate(targetFormat,sourceFormat,options)` is passed through the existing strict 16-column exporter.

**Use imported Assay Studio CSV as template (optional)** preserves the original five header rows and per-liquid metadata from a compatible instrument-exported CSV. Importing **as a template** never changes the current randomized or manual dispensing assignments. An existing CSV can separately be **opened for editing** to adopt its transfer rows.

**Limitations:** These reference-based header defaults are NOT confirmed to be manufacturer-approved. There is no actual 96-well Assay Studio instrument fixture in this repository; the program generates `96-Well` and coordinates such as `A01` based on the existing plate grammar. The application does not check liquid-class library entries, wash/deionisation/waste hardware, source dead volume, source consumable compatibility, physical plate capacity, or real I.DOT import success. Always inspect newly generated files in genuine Assay Studio before dispensing.
