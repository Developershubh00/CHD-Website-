# Design image library: where everything lives, how it is backed up, how to reuse it

For the business owner (sections 1 to 5) and for developers (sections 6 to 8).
The numbers below come from `library-index.json` and were true when this guide was written; the index is
regenerated whenever designs are published, so they only grow.

## 1. In one minute

The website's product library is **1,382 designs in 8 categories, 4,621 picture files, about 2 GB**.
Every design is one folder of pictures plus one small file of specs (style number, description, technique,
content, size, season).

There are four copies of it, all with the same content:

| Where | What it is | Address |
|---|---|---|
| The repo (GitHub) | The master. The website is built from it. | `Developershubh00/CHD-Website-`, branch `main` |
| The live website | What customers see | `https://www.creativehomedecorllp.com/images/<dir>/slide_NNN/<file>` |
| Google Drive | The backup, one tidy folder per design, kept up to date every night | folder **CHD Design Library (Backup)** in your My Drive (section 5) |
| An export | The same tidy layout on any disk or USB stick, made on demand | `node scripts/export-library.mjs export --out DIR` (section 6) |

The Drive folder and an export have the **same layout**, so anything you can do with one you can do with the other.

## 2. Where the files are in the repo

For design number `NNN` (three digits, `001`, `002`, ...) of a category whose repo folder is `<dir>`:

- Pictures: `public/images/<dir>/slide_NNN/` (`lifestyle.png`, `image_01.jpg`, `image_02.jpg`, ...)
- Specs: `src/assets/<dir>/slide_NNN/data.json`
- `public/images/<dir>/slide_NNN/card.webp` is a small square copy of the lifestyle picture used on category
  cards. It is **derived** (made by the pipeline and by `node scripts/build-card-images.mjs`), so it is not backed up.

A higher slide number means the design was added later; new designs always get the next number.

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
4. The Drive script (section 5) runs every night, reads `library-index.json` from GitHub, and copies whatever is new
   or changed into the Drive folder. Nothing to do by hand.
5. An export is only made when you ask for one.

`library-index.json` is the list of every design (style, specs, file names and sizes, backup folder name). It
contains no dates, so regenerating it when nothing changed gives the identical file. Check it any time:

```
node scripts/export-library.mjs index --check    # exit 0 = up to date, exit 1 = stale (and says what differs)
node scripts/export-library.mjs index            # rewrite it
```

## 4. The backup layout and naming rules

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

## 5. Google Drive backup (set up once)

The Drive side is a Google Apps Script, `scripts/chd-library-backup.gs`. Its header has the full, step by step
instructions (read it before you start). In five lines:

1. Go to https://script.google.com, click **New project**.
2. Paste the whole of `scripts/chd-library-backup.gs` into `Code.gs`; show the manifest file (Project Settings) and
   paste `scripts/chd-library-backup.appsscript.json` into it.
3. Pick the function **setup** and press **Run**.
4. Approve the Google consent screen (your own script; Advanced, then Go to the project, then Allow). If it stopped at
   the consent screen, press Run on `setup` once more.
5. Done. It creates the folder **CHD Design Library (Backup)**, copies everything (the first copy runs for hours, see
   the header for the quotas), then re-checks every night at about 3 AM India time. Run `status` to see progress;
   the folder link is printed in the log, share that one link to share everything.

It never deletes anything permanently; designs removed from the repo simply stay in Drive.

## 6. Using the export to upload designs somewhere else

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

An export contains the layout from section 4 plus:

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

## 7. Restoring (for example if GitHub were ever lost)

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

## 8. Quick reference for developers

| Command | What it does | Exit code |
|---|---|---|
| `index [--check]` | Rewrites (or only checks) `library-index.json` using `scripts/lib/library-index.mjs`, the single source of truth for folder and file names | `--check`: 0 up to date, 1 stale |
| `export --out DIR [--category a,b] [--zip] [--force]` | Builds the layout, `catalog.csv`, `catalog.json`, `README.txt`; refuses `--out` inside the repo or non-empty without `--force`; checks the size of every copied file | 0 ok, 1 refused or failed, 2 bad usage |
| `restore --from DIR [--apply] [--force] [--verbose]` | Dry run by default, see section 7 | 0 ok, 1 problems or something kept |
| `verify --from DIR [--deep] [--category a,b] [--verbose]` | Compares a backup with the repo, see section 7 | 0 ok, 1 any problem |

Category names accepted by `--category`: the site ids (`rugs`, `placemats`, `runners`, `cushions`, `throws`,
`bedding`, `bathmats`, `chairpads`), the repo folder names or the display names. Long lists are cut after 25 lines
unless `--verbose` is given. Names read from a `design.json` become file paths, so `restore` rejects any name that
contains a slash or is `.` or `..`, and any category folder it does not know.

Limits worth knowing: the index and the export are built from `src/assets/<dir>/slide_NNN` (a picture folder without
a matching specs folder is not part of the library); `verify` without `--deep` compares sizes only; `card.webp` is
never backed up.
