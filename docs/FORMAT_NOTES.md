# File formats and export types

**Instrument-targeted export (new v3):** Assay Studio 2.3.x 16-column CSV using an uploaded genuine instrument template, with BOM and CRLF. See [ASSAY_STUDIO_2_3_FORMAT.md](ASSAY_STUDIO_2_3_FORMAT.md).

**Task list (planning only):** A four-column CSV with `Source Well, Target Well, Volume [µL], Liquid Name`. Do **not** upload this planning file to the instrument as a complete protocol.

**Experimental design manifest:** One row per assigned or reserved target well, with plate identifier, combination ID, replicate, compound levels, per-compound transfer volumes and separate external top-up volume.

**Source map:** Source well, compound and required total volume for each plate, plus an optional illustrative estimate of 5% extra plus 1 µL. That estimate is **not** a manufacturer-validated dead-volume requirement.

**Project JSON:** v3 contains instrument settings, template, imported multi-plate dispensing rows and/or a deterministic randomized plan. New versions open v2 projects as well.

No I.DOT hardware command or manufacturer license is included.
