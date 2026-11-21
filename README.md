# DClinPsy Equality

Everything for the Non Cogito posts on the Clearing House equal-opportunities data, and the interactive explorer (https://dclinequality.pages.dev). Open `DClinPsy Equality.Rproj` in RStudio; every path below is relative to this folder.

**Read `RULES.md` before any analysis or chart.** It is the one rulebook: statistics (Part A), chart style (Part B), settled and open decisions (Part C).

## Layout

```
RULES.md                  the rulebook
CLAUDE.md                 tells Claude to follow RULES.md
data/
  equalopps_merged.csv    the one dataset, 2015 to 2025 (tidy long format),
                          built from the raw files by pipeline/00_merge_raw.R
  raw/clearing_house/     Clearing House equal-opportunities spreadsheets, 2015 to 2025 (not in git)
  raw/contextual_admissions/  Contextual admissions spreadsheets (POLAR), 2023 to 2025
  raw/pooled_cells.csv    a decision for every pooled cell in the source (RULES.md C8)
  raw/census/             Census 2021 and ONS benchmark files used by the explorer
pipeline/                 R: load, clean, statistics, export, verification
R/dclinpsy_style.R        chart theme, palette, save_chart(), wilson_ci(), newcombe_ci()
R/fonts/                  Inter, for offline use of the style file
site/                     the explorer (deployed from GitHub, do not rename)
posts/
  2026-05-20 biggest equity gap/    post 1 (saved draft page + chart)
  2026-05-28 devil in the detail/   post 2 (final PDF, charts, surviving chart code)
  2026-06-11 dashboard/             post 3 (launch of the explorer)
  next/                   work for the next post goes here
docs/                     source rule documents, explorer docs, project history
archive/                  old working files kept for reference (not in git)
```

## Writing a new post

1. Read `RULES.md`, including the open questions in Part C.
2. Add any new year's spreadsheets: the equal-opportunities file to `data/raw/clearing_house/` and the contextual admissions file to `data/raw/contextual_admissions/`. Run `source("pipeline/00_merge_raw.R")`. If it stops on a pooled cell, record a decision for it in `data/raw/pooled_cells.csv` (the script header explains the options). Then rerun the checks below.
3. Work in `posts/next/`: put chart scripts in `posts/next/code/` and start each with `source("R/dclinpsy_style.R")`.
4. Save charts with `save_chart()` into `posts/next/charts/`.
5. When published, rename `posts/next/` to `posts/<date> <short title>/` and make a new empty `next/`.

## Checks (run from this folder)

```r
source("pipeline/04_export.R")          # rebuild the explorer data, prints its own checks
```

```powershell
& "C:\Program Files\R\R-4.3.1\bin\Rscript.exe" pipeline/verify_all.R
& "C:\Program Files\R\R-4.3.1\bin\Rscript.exe" pipeline/verify_families.R
node site/test/test_stats.js
```

All three must report a pass before any number is quoted. Explorer details: `docs/EXPLORER.md`.
