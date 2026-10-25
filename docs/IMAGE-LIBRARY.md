# Design image library: where everything lives, how it is backed up, how to reuse it

For the business owner (sections 1 to 6) and for developers (sections 7 to 9).
The numbers below come from `library-index.json` and were true when this guide was written; the index is
regenerated whenever designs are published (and, as a safety net, whenever pictures or specs change on `main`,
section 4), so they only grow.

## 1. In one minute

The website's product library is **1,382 designs in 8 categories, 4,621 picture files, about 2 GB**.
Every design is one folder of pictures plus one small file of specs (style number, description, technique,
content, size, season).

There are four copies of it, all with the same content:

| Where | What it is | Address |
|---|---|---|
| The repo (GitHub) | The master. The website is built from it. | `Developershubh00/CHD-Website-`, branch `main` |
| The live website | What customers see | `https://www.creativehomedecorllp.com/images/<dir>/slide_NNN/<file>` |
| Google Drive | The backup, one tidy folder per design, kept up to date every day (about 3 PM India time, after the website's 1:30 PM publish) | folder **CHD Design Library (Backup)** in your My Drive (sections 4 and 6) |
| An export | The same tidy layout on any disk or USB stick, made on demand | `node scripts/export-library.mjs export --out DIR` (section 7) |

The Drive folder and an export have the **same layout**, so anything you can do with one you can do with the other.

## 2. Where the files are in the repo

For design number `NNN` (three digits, `001`, `002`, ...) of a category whose repo folder is `<dir>`:

- Pictures: `public/images/<dir>/slide_NNN/` (`lifestyle.png`, `image_01.jpg`, `image_02.jpg`, ...)
- Specs: `src/assets/<dir>/slide_NNN/data.json`
- `public/images/<dir>/slide_NNN/card.webp` is a small square copy of the lifestyle picture used on category
  cards. It is **derived** (made by the pipeline and by `node scripts/build-card-images.mjs`), so it is not backed up.

A higher slide number means the design was added later. The publish run gives a new design the number *(how many
slide folders the category has) + 1*, so the slides of a category must stay numbered 1, 2, ... N with no gap.

**Never delete or move a design folder by hand without renumbering the ones after it** (commit `9761e5a`, which moved a
design to another category and closed the gap it left, is the example to follow), and run
`node scripts/export-library.mjs index` afterwards. After a gap the "next" number belongs to a design that already
exists. If that design has its specs and a lifestyle picture, the publish run takes it for one it staged earlier
("resuming previously staged"), writes nothing for the new design, still marks the board row as published and sends the
"now LIVE" email, so the new design never reaches the website, the index or Drive. If that design has no lifestyle
picture, the new design is written over it instead and the old one is gone from the repo.

| Category (name used in the backup) | Site id (`/category/<id>`) | Repo folder `<dir>` | Designs | Picture files |
|---|---|---|---:|---:|
| Rugs | `rugs` | `rugs` | 274 | 1,016 |
| Placemats | `placemats` | `placemat` | 102 | 331 |
| Table Runners | `runners` | `TableRunner` | 53 | 178 |
| Cushions | `cushions` | `cushion` | 556 | 1,705 |
| Throws | `throws` | `throw` | 147 | 443 |
| Bedding | `bedding` | `bedding` | 40 | 160 |
| Bath Mats | `bathmats` | `bathmat` | 164 | 641 |
| Tote Bags | `chairpads` | `totebag` | 46 | 147 |
| **Total** | | | **1,382** | **4,621** (2,141,839,487 bytes) |

What the pictures are: `lifestyle` is the product shown in a room or scene; `image_01` is the front picture of the
design and `image_02` the close-up (this is how the design pipeline stores them); `back` (2 designs) is the back
side; `image_03` (31 designs) and `image_04` (14 designs) are extra pictures. Four designs have no lifestyle
picture. For 473 designs a copy of the specs, also named `data.json`, sits among the pictures; it is backed up like a
picture (as `<folder>_data.json`). Two Tote Bag designs have both `image_01.jpg` and `image_01.png`; both are kept.

## 3. How a new design gets into all four places

1. A designer submits the form; `design-pipeline.mjs intake` makes the lifestyle picture; the team approves it.
2. `design-pipeline.mjs publish --commit` writes `public/images/<dir>/slide_NNN/` and
   `src/assets/<dir>/slide_NNN/data.json`, stages them, **regenerates `library-index.json` and stages it too**
   (a failure there only prints a warning and never stops the publish), commits and pushes to `main`.
   Plain `publish` without `--commit` only writes the new files into the working tree and does not touch the index.
3. The push makes Vercel rebuild the website (the live address above).
4. The Drive script (section 6) runs every day at about 3 PM India time, reads `library-index.json` from GitHub, and
   copies whatever is new or changed into the Drive folder and, on a day that brought new designs, emails you the
   list of them. Nothing to do by hand. Section 4 has the whole day, hour by hour.
5. An export is only made when you ask for one.

`library-index.json` is the list of every design (style, specs, file names and sizes, backup folder name). It
contains no dates, so regenerating it when nothing changed gives the identical file. Check it any time:

```
node scripts/export-library.mjs index --check    # exit 0 = up to date, exit 1 = stale (and says what differs)
node scripts/export-library.mjs index            # rewrite it
```

## 4. Every day: how a new design reaches the backup

One design's day, in India time. The only human step is approving; the rest runs by itself.

| When | What happens | Where the design is afterwards |
|---|---|---|
| Any time | A designer submits the Google Form. | The full-size original pictures stay in the Drive folder **CHD Design Uploads**. |
| 9 PM | The intake run (`design-pipeline.mjs intake`) makes the lifestyle picture. An 11 AM recheck run picks up anything submitted late. | Review copies go into the Drive folder **CHD Lifestyle Review**, with a row on the review board. |
| By 1 PM next day | The team sets the row's STATUS to APPROVED (or REDO, with remarks). | Nothing is published unless it says exactly APPROVED. |
| 1:30 PM | The publish run (`design-pipeline.mjs publish --commit`) writes the pictures and specs, refreshes `library-index.json`, checks that the website still builds, and pushes it all to `main` in one commit. | The website (rebuilt after the push), GitHub, and the new `library-index.json`. The team gets the "now LIVE" email. |
| About 3 PM | The Drive script's daily job reads `library-index.json` from GitHub and copies the day's new designs into the same folder tree. Google starts it at some point within the 3 PM hour. | **CHD Design Library (Backup)**: the design's folder inside its category folder, and a new row in the **Catalog** sheet (at the end of that category's rows) with today's date in its *Backed up* column. If any design was new, you get one summary email naming it. |

- **Why 3 PM.** It is at least 90 minutes after the publish run starts, so a design published today is in Drive
  today. If a publish is ever still running at 3 PM, the Drive job finds nothing new that day and picks the design
  up on the next day's run, or you can run `sync` (below) once the publish has landed. Nothing is lost either way.
- **What the backup holds.** The pictures exactly as they are on the website: the publish run shrinks every upload to
  at most 2400 pixels on the long edge and compresses it. The print-size originals are not in the backup; they stay
  in **CHD Design Uploads**, so keep that folder.
- **A design sent back and approved again** is updated in place (same slide number). Drive copies what changed, and a
  picture of the same name that changed size is replaced (the old copy goes to the Drive Trash). The Backed up date
  changes; it is not listed as a new design in the email.
- **The very first copy** of the whole library does not send these emails (it would name every design). It sends its
  own single "backup is complete" email, and the daily summaries start after it.

### The safety nets (so no design can be missed)

1. **The publish hook.** `publish --commit` rewrites `library-index.json` and puts it in the same commit as the new
   designs. If that step ever fails, the publish still goes ahead and prints `publish: library-index.json not
   updated (...)`; the next two nets cover it.
2. **The GitHub Action** `.github/workflows/library-index.yml`, "Refresh library-index.json". It runs after every
   push to `main` that touches a design folder (`src/assets/<dir>/slide_NNN/` or `public/images/<dir>/slide_NNN/`) or
   `scripts/lib/library-index.mjs` (the site's own logos and hero pictures do not start it), rebuilds the index with
   `node scripts/export-library.mjs index`, and only if the file came out different commits it to `main` as
   `github-actions[bot]` with the message "Refresh library-index.json". On a normal day the publish already included
   the index, so it finds nothing to do and changes nothing. It exists for every other way designs can reach `main`
   (a hand edit, a merged pull request, a restore, a publish whose index step failed): without it the Drive script
   would never hear about them. It cannot trigger itself (`library-index.json` is not a watched path, and GitHub does
   not start workflows for pushes made with its built-in token). Runs never overlap; if `main` moved while one was
   running it tries once more from the newest `main`, and if that also fails the run is shown as failed (red cross)
   in the repository's **Actions** tab. It never force-pushes. A commit by the Action is a push to `main`, so Vercel
   builds the site once more on those (rare) days; nothing on the site changes. You can also start the Action by hand
   in the Actions tab (Run workflow); on an up-to-date index that does nothing. Its shell step is tested against
   throwaway git repositories by `scripts/tests/daily-flow.mjs`; only GitHub itself can run the whole workflow, so
   after the first publish that follows its introduction, look in the Actions tab for a green run.
3. **`node scripts/export-library.mjs index --check`** tells you any time whether the index matches the repo
   (exit 0 up to date, exit 1 stale, and it names the designs that differ).

### How to tell it is working

- **The summary email.** On each day that new designs were backed up, one email arrives at the address of the Google
  account that owns the script (the one that ran `setup`), with the subject `CHD design library: N new design(s)
  backed up`. It gives the style number and category of each new design (it names up to 25 and counts the rest), how
  many designs the backup holds, and links to the backup folder and the Catalog. It is sent even when the run could not
  copy everything: one added line then says what is left (for example `1 design could not be copied yet (CHD-RG-1234)`
  and that it is tried again every day, or that Google's daily limit was reached), so one stuck design does not hide
  the designs that did arrive. A day with no new design sends no email, which is normal (a quiet day, or a day with
  only re-approved designs); to be sure the job ran on such a day, use `status` below.
- **The two other emails.** "CHD design library backup is complete" (once, after the first full copy) and "CHD design
  library backup is failing" (see *If something looks wrong*).
- **The Catalog sheet's last column, *Backed up (ISO date)*.** The date (YYYY-MM-DD) the design was last copied
  completely; a new design shows the day it arrived. Sort that column to see the latest arrivals. An empty cell means
  that design is not completely in Drive yet.
- **`status` in Apps Script.** Pick `status` and press Run. It prints `Designs backed up: N / N` (N should equal the
  `count` at the top of `library-index.json`), `Waiting/failed designs:`, `Last run:` with the time and how it ended,
  `Last error:`, `Runs failed in a row:` and the list of installed triggers, which should include `syncDaily`.
  **The time after `Last run:` is UTC** (it ends in `Z`): add 5 hours 30 minutes for India time, so
  `2026-10-09T09:40:12.345Z` is 3:10 PM on 9 October. What the word after the time means:

| `Last run:` says | What happened | What happens next |
|---|---|---|
| `complete` | Everything in the index is in Drive and the Catalog is written. | Nothing to do. |
| `incomplete` | The run went through the whole index, but at least one design (or the Catalog) is not done. `Last error:` names a design and says why. Other designs may have been copied. | Tried again at the next daily run (not earlier). |
| `partial` | The run used up its time slice (about 4.5 minutes). On a normal day this only happens when many designs are new. | The next slice starts about a minute later, by itself. |
| `quota` | Google's daily limit was reached. | The next daily run carries on. |
| `stalled` | 6 designs in a row failed, so the run stopped early. | Tried again 5 minutes later, then 15 minutes after that if it fails again, then at the next daily run. |
| `failed` | The run hit an error it could not get past, typically that the index could not be read from GitHub or the Drive folder could not be opened. | Tried again 5 minutes later, then 15 minutes after that if it fails again, then at the next daily run. |
| `stopped` | `stopAll` was run. | Nothing until `setup` is run. |

### If something looks wrong

- **The team got a "now LIVE" email for a new design, but no "new design(s) backed up" email by about 5 PM.** Run
  `status` in Apps Script and read the lines:
  - No `syncDaily` in the trigger list, or "SWITCHED OFF": run `setup`.
  - `Last run:` is from an earlier day (mind that the time is UTC): the daily job did not fire. Run `sync`.
  - `Last run:` says `complete` and `0 designs this run`: the index on GitHub does not list the design. On a computer
    with the repo, update `main` and run `node scripts/export-library.mjs index --check`; if it says STALE, follow
    *If a day is missed* below, then run `sync`.
  - `Last run:` says `incomplete`, `quota` or `stalled`: the summary email still comes for the designs that were
    copied, with a line on what is left. If the new design is itself the one that could not be copied, there is
    nothing to report yet and no summary comes. `Last error:` then names it as `<dir>/<slide number>` (for example
    `cushion/6`; `<dir>` is the repo folder from section 2) and `Waiting/failed designs:` is above 0. Look at its
    pictures on GitHub, then run `sync`. After three such days the "backup is failing" email follows.
  - If the mail itself could not be sent, the list of new designs is kept and sent by a later run.
- **The "now LIVE" email names only designs that were approved again** (sent back with remarks earlier). Nothing is
  wrong: the Drive summary names first-time designs only, so a day with re-approvals only sends no Drive email. To
  check, look at the design's *Backed up* date in the Catalog: it moves to the day its pictures changed and were
  copied again.
- **An email "CHD design library backup is failing".** It means three runs in a row ended badly; its text gives the
  last problem. A run counts as bad when the index or Drive could not be reached, when nothing could be copied, or when
  a design (or the Catalog) is still not done at the end (`incomplete`), even if other designs were copied. An
  outage of GitHub or Google that lasts 20 minutes or more around 3 PM is enough to cause it, because after a failed
  run the script retries 5 and 15 minutes later and those retries count as runs. Often nothing needs doing: the next
  daily run usually succeeds, and the email is not repeated until a good run has happened in between. To check, run
  `selfTest` (read-only; it prints OK, WARN or FAIL lines for the library index, the picture sources, Drive and mail),
  then `status` for `Last error:`, then `sync`. A design that stays stuck shows up in `Last error:` and, whenever a summary email is sent, in its
  "could not be copied yet" line (which names up to five); look at its pictures on GitHub.
- **Runs fail or stop, and `selfTest` prints a `WARN` that the Drive free space is less than the library size.** The
  Google account that owns the script may be out of Drive space. The first copy needs about 2.1 GB, and Google
  counts the Drive Trash until it is emptied. Free up space in that account or buy more storage, then run `sync`; it
  carries on where it stopped. (This has not been tried against a real full Drive: the simulator has no storage-full
  case, so Google's exact error text is not known here.)
- **The *Backed up* column is empty for some designs.** They are not completely in Drive yet. `status` shows how many
  are waiting; run `sync`.

### If a day is missed

- **Run `sync`** in the Apps Script project (pick `sync`, press Run). It is safe at any time: it copies whatever is
  missing or changed and changes nothing if everything is already there. When it finishes, the summary email names
  the designs added since the last summary.
- **If `status` shows no `syncDaily` trigger, or "SWITCHED OFF by stopAll()"**, run `setup`. It puts back exactly one
  daily job at 3 PM and keeps the existing backup folder and progress.
- **If designs were added to `main` by some route other than the daily publish** and the Action did not fix the index
  (check the Actions tab), do it by hand, then run `sync`:

```
git switch main && git pull                      # a checkout of main, up to date
node scripts/export-library.mjs index --check    # says what is missing from the index
node scripts/export-library.mjs index            # rewrite library-index.json
git add library-index.json
git commit -m "Refresh library-index.json"
git push origin HEAD:main
```

- **If the 1:30 PM publish itself did not happen,** there is nothing to fix on the Drive side: the next daily run
  copies the designs once they are published.
- **If the publish run's push to `main` was rejected** (its output says `rejected`, `fetch first` or
  `non-fast-forward`): `main` moved while the publish was working, for example a pull request was merged or the Action
  committed a refreshed index. The designs are committed on the publish computer but not on `main`, the board rows are
  not stamped and no "now LIVE" email went out. Nothing is lost, but it does not fix itself: the next day's publish
  would be rejected again for the same reason. In the repo of the publish run:

```
git fetch origin main
git rebase origin/main
# If git stops with a conflict in library-index.json ONLY (git says which files):
node scripts/export-library.mjs index
git add library-index.json
git rebase --continue
# Then, whether or not it stopped, check the index BEFORE pushing anything:
node scripts/export-library.mjs index --check    # "up to date"? carry on. "STALE"? run the next three lines:
node scripts/export-library.mjs index
git add library-index.json
git commit -m "Refresh library-index.json"
# Then run the publish again: it finds the designs already in the repo, pushes, marks the board and sends the email.
bun scripts/design-pipeline.mjs publish --commit
```

  The check matters: git can merge two versions of `library-index.json` without complaint and still produce an index
  that is wrong (for example a `count` that no longer matches the list), which the Drive script then refuses to read.
  If git reports a conflict in **any other file**, two designs were given the same slide number: run
  `git rebase --abort` and ask a developer.

## 5. The backup layout and naming rules

```
<Root>/
  Rugs/
    CHD-RG-1120/
      CHD-RG-1120_lifestyle.png
      CHD-RG-1120_image_01.jpg
      CHD-RG-1120_image_02.jpg
      CHD-RG-1120_data.json        (only for designs that have one among their pictures)
      design.json                  (this design's specs and file list)
  Placemats/ ... Table Runners/ ... Cushions/ ... Throws/ ... Bedding/ ... Bath Mats/ ... Tote Bags/ ...
  Catalog                          (a Google Sheet in Drive)   |   catalog.csv, catalog.json, README.txt in an export
```

- **Folder name** = the style number made safe for file names: every run of characters other than letters, digits,
  `.` `_` `-` becomes `_`. Real examples: `CHD-TR-1018 (A)` becomes `CHD-TR-1018_A`, `CHD-PM-1011 - A` becomes
  `CHD-PM-1011_-_A`, `CHD-RG-3171 -B` becomes `CHD-RG-3171_-B`, `CHD-TR-1466 B` becomes `CHD-TR-1466_B`.
- **Duplicate style numbers.** 29 designs repeat the style number of an earlier design. The first (lowest slide
  number) keeps the plain name; later ones end in `__slide_NNN`, for example `CHD-RG-1337` (slide 28) and
  `CHD-RG-1337__slide_072` (slide 72). Names are compared ignoring upper/lower case. Because designs are only ever
  added, a folder name does not change once it exists (unless the earlier of two duplicates is deleted from the repo).
- **File name** = `<folder>_<original file name>`, so a picture stays identifiable after it leaves its folder.
- **design.json** holds, in this order: `category`, `categoryName`, `dir`, `slide`, `style`, `folder`, `specs` (exactly as
  in `data.json`), `files` (a list of `original`, `backup`, `bytes`) and `source` (`repo`, `branch`, `path`). It is
  everything needed to restore a design or to read its specs without opening any other file.

## 6. Google Drive backup (set up once)

The Drive side is a Google Apps Script, `scripts/chd-library-backup.gs`. Its header has the full, step by step
instructions (read it before you start). In five lines:

1. Go to https://script.google.com, click **New project**.
2. Paste the whole of `scripts/chd-library-backup.gs` into `Code.gs`; show the manifest file (Project Settings) and
   paste `scripts/chd-library-backup.appsscript.json` into it (it also sets the script's time zone to India, which
   the 3 PM job goes by).
3. Pick the function **setup** and press **Run**.
4. Approve the Google consent screen (your own script; Advanced, then Go to the project, then Allow). If it stopped at
   the consent screen, press Run on `setup` once more.
5. Done. It creates the folder **CHD Design Library (Backup)**, copies everything (the first copy runs for hours, see
   the header for the quotas), then checks again every day at about 3 PM India time, shortly after the website's
   1:30 PM publish (section 4). Run `status` to see progress; the folder link is printed in the log, share that one
   link to share everything.

You get one email when the first full copy is complete, then one on each day that new designs were backed up
(section 4).

If you installed the earlier version of the script (the one that ran at 3 AM): paste the new `Code.gs` over the old
one and run **setup** once. It replaces the 3 AM job with one at 3 PM and keeps the existing backup folder and
progress. (If the first copy had already finished, the first run after the update sends no summary email; the daily
ones start after it.)

It never deletes anything permanently; designs removed from the repo simply stay in Drive. The Catalog sheet lists the
designs that are in the repo, so a removed design keeps its Drive folder but loses its Catalog row the next time the
Catalog is rewritten (see the warning about deleting design folders in section 2).

## 7. Using the export to upload designs somewhere else

```
node scripts/export-library.mjs export --out ../library-export                       # everything
node scripts/export-library.mjs export --out ../rugs-only --category rugs,throws     # some categories
node scripts/export-library.mjs export --out ../library-export --zip                 # plus one zip per category
```

(`bun scripts/export-library.mjs ...` works too.) The folder must be **outside** the repo (the tool refuses an
`--out` inside it; `/library-export/` and `/library-export-*/` are in `.gitignore` only as a safety net in case
someone makes such a folder by hand) and empty (or add `--force`, which overwrites same-named files and deletes
nothing). It needs about 2 GB of free space for everything, and about the same again with `--zip` (the pictures are
already compressed, so a zip is about as big as its folder). Copies are made with copy-on-write where the disk
supports it. `--zip` uses the system `zip` command, else Python 3's `zipfile`; if neither exists it says so and
still leaves the folders complete.

An export contains the layout from section 5 plus:

- **`catalog.csv`**: one row per design (1,382 for a full export), UTF-8 with a byte-order mark so Excel opens it
  correctly, columns in this order:

| Column | Content |
|---|---|
| Category | Category name (also the top folder) |
| Style No. | The style number as written in the specs (not the sanitized folder name) |
| Slide | The design's slide number |
| Description, Technique, Content, Size, Season | From the specs; empty where the design has none |
| Country | From the specs if the design has one (none have today), otherwise empty |
| Files | Number of picture files in the design's folder (counts `image_03`, `image_04` and a `data.json` too, not `design.json`) |
| Folder (relative path) | `<Category>/<folder>` inside the export |
| Lifestyle, Image 1, Back, Image 2 | Path of that picture inside the export; empty if the design has none |
| Website image URL | The live address of the lifestyle picture (or of `image_01` when there is no lifestyle picture) |

  A spec text that starts with `=`, `+`, `-` or `@` gets one leading space so Excel does not read it as a formula (the
  Drive `Catalog` sheet does the same, so the two stay identical); no spec in the library needs it today.

- **`catalog.json`**: the same, complete, for programs. For every picture it also gives the website URL and the
  GitHub (raw) URL.
- **`README.txt`**: a short explanation to hand to whoever receives the folder.

To upload a design to a marketplace or another site: find its row in `catalog.csv`, take the specs from the spec
columns, upload the pictures from its folder (names are unique inside a category), or give the tool the Website image
URL if it fetches pictures by link. The Drive folder works the same way; its `Catalog` sheet has the same columns in
the same order, except that the path columns hold Drive links (`Folder link`, `Lifestyle link`, `Image 1 link`,
`Back link`, `Image 2 link`), and it adds a last column, `Backed up (ISO date)`.

## 8. Restoring (for example if GitHub were ever lost)

You need Node.js 22 (or bun), `scripts/export-library.mjs` and `scripts/lib/library-index.mjs`, and the backup
folder: an export, or a **download of the Drive folder**. The tool finds every `design.json` below the folder you
name, however deep.

- **The two scripts are not inside the backup** (neither in an export nor in Drive). If GitHub and every local copy
  of the repo were lost, you would have the pictures and specs but not the tool. So keep a copy of both files next to
  the backup, at the same two paths (`scripts/export-library.mjs`, `scripts/lib/library-index.mjs`). For Drive, make
  a folder such as `_restore-tools` in the backup folder's top level and put a `scripts` folder with those two files
  in it (the Drive script only looks up its own category folders, `Catalog` and `_sync-state.json` by name, and
  leaves anything else alone). Every export's `README.txt` says the same.
- **A download of the Drive folder** of this size may well arrive as several zip files. Unzip them **all into the
  same folder** (say yes when asked to merge folders), then run the tool on that one folder. If the files of one
  design ended up in different folders, that design is skipped and listed (missing picture) instead of being
  restored half-way, and you can fix the folders and run it again. How Drive splits a download has not been tried
  here (no access to Google), so this advice is the safe general rule, not something observed.

```
node scripts/export-library.mjs restore --from "<backup folder>"            # dry run: prints the plan, writes nothing
node scripts/export-library.mjs restore --from "<backup folder>" --apply    # writes the files
node scripts/build-card-images.mjs                                          # then rebuild the card images
```

Run these in the website repo (or a copy of it), or in an empty folder that holds just the two scripts. The last
line needs a repo copy with its packages installed (`bun install`; it uses `sharp`), so if you restored into a bare
folder, copy its `public/` and `src/` into a repo copy first. The tool prints the same hint when it finishes.

- It checks that every file listed in a `design.json` exists with the right size; a design with a missing or
  wrong-sized file is skipped as a whole and listed.
- It writes `public/images/<dir>/slide_NNN/<original name>` and `src/assets/<dir>/slide_NNN/data.json` (2-space
  indented JSON), creating folders as needed. A `data.json` that already holds the same specs counts as identical
  even if it is formatted differently.
- It **never overwrites** a file that has different content unless you add `--force`; differences are listed instead.
  It never deletes anything.
- Exit code 1 means the backup itself had problems or, with `--apply`, that something was skipped or kept; otherwise 0.
- `--repo-root DIR` (every mode) points the tool at another copy of the repo instead of the one it lives in.

To check a backup against the repo at any time:

```
node scripts/export-library.mjs verify --from "<backup folder>"           # every design and file present, sizes equal
node scripts/export-library.mjs verify --from "<backup folder>" --deep    # also compares the content (sha1)
node scripts/export-library.mjs verify --from "<backup folder>" --category bedding   # only some categories
```

It lists exactly what is missing or different and exits 1 on any problem. Designs that exist only in the backup
(removed from the repo since) are shown as notes, not failures.

## 9. Quick reference for developers

| Command | What it does | Exit code |
|---|---|---|
| `index [--check]` | Rewrites (or only checks) `library-index.json` using `scripts/lib/library-index.mjs`, the single source of truth for folder and file names | `--check`: 0 up to date, 1 stale |
| `export --out DIR [--category a,b] [--zip] [--force]` | Builds the layout, `catalog.csv`, `catalog.json`, `README.txt`; refuses `--out` inside the repo or non-empty without `--force`; checks the size of every copied file | 0 ok, 1 refused or failed, 2 bad usage |
| `restore --from DIR [--apply] [--force] [--verbose]` | Dry run by default, see section 8 | 0 ok, 1 problems or something kept |
| `verify --from DIR [--deep] [--category a,b] [--verbose]` | Compares a backup with the repo, see section 8 | 0 ok, 1 any problem |

Category names accepted by `--category`: the site ids (`rugs`, `placemats`, `runners`, `cushions`, `throws`,
`bedding`, `bathmats`, `chairpads`), the repo folder names or the display names. Long lists are cut after 25 lines
unless `--verbose` is given. Names read from a `design.json` become file paths, so `restore` rejects any name that
contains a slash or is `.` or `..`, and any category folder it does not know.

Limits worth knowing: the index and the export are built from `src/assets/<dir>/slide_NNN` (a picture folder without
a matching specs folder is not part of the library); `verify` without `--deep` compares sizes only; `card.webp` is
never backed up.

Tests for the daily chain (section 4), run from the repo root:

| Command | What it checks |
|---|---|
| `node scripts/tests/daily-flow.mjs` | The glue, end to end, on a throwaway copy of 37 real designs plus 3 new ones (about 100 MB in the system temp folder, removed afterwards; needs `git` and `bash`; about one to two minutes): the publish hook's exact statements from `design-pipeline.mjs`, the GitHub Action (its trigger paths matched against the real repo, and its shell step against a local bare repository: nothing to do, design added by another route, `main` moved once, `main` moved twice, index missing), the recovery commands of section 4 for a publish whose push was rejected, what the Drive script and its simulator make of the new index, and whether the numbers, e-mail subjects and function names this guide promises are still in the code. `--no-sim` skips the simulator, `--keep` keeps the temp folder. Nothing runs it automatically: run it after changing the workflow, the publish step, `scripts/lib/library-index.mjs` or this guide. |
| `node scripts/tests/gemini-image.mjs` | Not part of the daily chain: which Gemini image model the intake uses and which part of a reply is the finished picture (pure logic: no network, no spend, under a second). The Pro image model is preferred and Flash is only a logged fallback, a typo in `GEMINI_IMAGE_MODEL` is refused, interim "thought" drafts are never shipped, an ordinary quota 429 is not mistaken for "credits depleted", and the model name stays inside the `[auto-check ...]` tag of the board remark. Run it after changing `scripts/lib/gemini-image.mjs` or the model / retry code in `scripts/design-pipeline.mjs`. |
| `node scripts/tests/intake-stub.mjs` | Not part of the daily chain: the real `intake` run end to end against a stub (a fake `curl` answers the Google bridge and Gemini from scripted scenarios; nothing touches the network, spends credits or writes to a sheet; about 15 seconds; needs `bun`). It covers the model that is picked and logged, the fall-back to Flash and its e-mail note, the billing STOP (log, alert e-mail, exit code 2, silent on the 11 AM recheck), Google Drive refusing uploads (stop after the first generated picture, alert e-mail, exit code 4), a mistyped `GEMINI_IMAGE_MODEL` (exit code 3), the Gemini key never appearing in output, the busy back-off, keeping an earlier attempt when a later one fails, and the stop after three overloaded designs in a row. Run it after changing the intake, model-selection or retry code. |
| `node scripts/tests/gas-sim.mjs` | The Drive script itself, loaded into a sandbox with mock Google services (`--quick` for a short run). |
