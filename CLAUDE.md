# DClinPsy Equality: instructions for Claude

- Before any analysis, chart or prose, read `RULES.md`. It overrides any habit or default. On a purely statistical point, `docs/STATS_RULES.md` is the authority behind it.
- The data is `data/equalopps_merged.csv` (built by `pipeline/00_merge_raw.R`). Never compute from the raw spreadsheets directly without merging and running the checks in `README.md`.
- Charts: `source("R/dclinpsy_style.R")`, `+ theme_dclinpsy()`, `save_chart()`. Percentage points only on the blog; Wilson and Newcombe intervals; BH within the frozen families listed in `RULES.md`.
- Suppressed acceptances are never zero: drop the whole row.
- Language: "disparities" and "gaps", never "discrimination"; "DEI", never "EDI"; no em dashes, use colons; "pp" for percentage points.
- New post work goes in `posts/next/`. Do not touch `site/` folder names (the live explorer deploys from it).
- Open decisions are listed in `RULES.md` Part C. Ask rather than decide them.
