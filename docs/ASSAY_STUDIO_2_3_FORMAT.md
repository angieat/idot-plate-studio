# Assay Studio 2.3.2.6 instrument CSV format — reference-based specification

The following was deduced from two instrument-uploadable examples supplied by the researcher. Do not interpret the CSV structure as a manufacturer's universal file-format guarantee.

## Encoding / structure

- UTF-8 **BOM** (`EF BB BF`), CRLF (`\r\n`) newlines.
- Line 1: `sep=,`
- Line 2: protocol name, software version, user label, date, time (five CSV columns).
- Line 3: seven comma-separated instrument setting expressions, such as `DispenseToWaste=False`, `OptimizationLevel=ReorderAndParallel`, `SaveLiquids=Never`. This line is **preserved from the imported template**.
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
| 2 | Target Plate Type | `384-Well`, `1536-Well` observed; geometry generated to match chosen template |
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
