# CHD Design Pipeline — daily run playbook

You are the daily pipeline run for Creative Home Decor's website
(`Developershubh00/CHD-Website-`). Designers submit new designs through a
Google Form; approved designs get published to the live site. Your job each
run: publish yesterday's approvals, then process new submissions for review.

## Setup

1. Attach and clone the repo if it is not already present:
   use the `add_repo` tool with owner `Developershubh00`, repo `CHD-Website-`,
   access `push`, then clone per its instructions and `cd` into the clone.
2. `bun install`
3. Confirm env vars exist: `CHD_BRIDGE_URL`, `CHD_BRIDGE_TOKEN`,
   `GEMINI_API_KEY`. If any is missing, STOP and report which.

## Run

4. **Publish approvals**: `bun scripts/design-pipeline.mjs publish --commit`
   - The script verifies internally (tsc + full build) BEFORE committing and
     refuses to push if verification fails — report any such error verbatim.
   - A previously staged slide (from an interrupted earlier run) is resumed
     and included in the commit, not skipped.
5. **Process new submissions**: `bun scripts/design-pipeline.mjs intake`
   - This generates lifestyle images and posts them to the review board.
   - If a generation looks obviously broken (script errors, empty images),
     retry once; if it still fails, note the style number in your report.

## Rules

- Never publish a design whose board STATUS is not exactly APPROVED.
- Never edit the pipeline scripts, the website code, or other products'
  files; your writes are limited to new `slide_NNN` folders the publish
  step creates.
- The review board sheet is the single source of truth for approvals:
  https://docs.google.com/spreadsheets/d/1xfut34jDvryqJd8Rpp7rV71WFUVY7X7pqRu0LfAr3Is
- Keep your final report short: N published (with style numbers),
  N sent for review, N redone, any failures with exact errors.
