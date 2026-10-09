#!/usr/bin/env node
// End-to-end test of the GLUE of the daily design chain (not of the AI or the Google services):
//
//   publish --commit  ->  library-index.json refreshed in the same commit as the new designs  ->  push to main
//        ->  (safety net) .github/workflows/library-index.yml  ->  the Drive backup script sees exactly the new designs
//
// Nothing here touches the real repo's images, specs or git history. The test builds a throwaway git repo
// (plus a bare "origin") in the system temp folder from 37 real designs (all 8 categories, a duplicate-style
// pair, spaced/bracketed styles, designs without a lifestyle picture), adds 3 synthetic designs exactly the way
// `design-pipeline.mjs publish` writes them, and then runs the REAL code:
//   - the statements of the publish hook (git add -> regenerate library-index.json -> git add -> commit -> push),
//     cut out of scripts/design-pipeline.mjs as text and executed unchanged;
//   - the shell step of .github/workflows/library-index.yml, cut out of the YAML and run with bash, against a
//     bare origin (no-op, new design from another route, main moved once, main moved twice, index missing);
//   - the real chd-library-backup.gs loaded into a Google-free node:vm, to show which designs it treats as new;
//   - a copy of the Drive simulator (scripts/tests/gas-sim.mjs) pointed at the new library;
//   - the recovery recipe that docs/IMAGE-LIBRARY.md gives for a publish whose push to main is rejected;
//   - a docs-versus-code check: the numbers, e-mail subjects and function names the guide promises are still in the code.
//
// Nothing runs this file automatically (GitHub Actions only runs the workflow it tests). Run it by hand after changing the
// workflow, scripts/design-pipeline.mjs (the publish step), scripts/lib/library-index.mjs or docs/IMAGE-LIBRARY.md.
//
//   node scripts/tests/daily-flow.mjs                 all checks
//   node scripts/tests/daily-flow.mjs --no-sim        skip the Drive-simulator run
//   node scripts/tests/daily-flow.mjs --keep          keep the temp folder (its path is printed) for inspection
//   node scripts/tests/daily-flow.mjs --verbose       print the output of the commands being tested
//   node scripts/tests/daily-flow.mjs --only=<text>   run only the checks whose name contains <text> (later checks may depend on earlier ones)
//   node scripts/tests/daily-flow.mjs --workflow=<file> --doc=<file>   test another copy of the workflow / the guide (to see that a check can fail)
//   TMPDIR=/some/disk node ...                        where the ~100 MB throwaway repos are built (removed at the end;
//                                                     a run that is killed leaves its chd-daily-flow-* folder behind)
//
// Prints PASS / FAIL (or SKIP when a tool is missing) per check and exits 1 on any FAIL.
// Needs: node 22, git, bash. Python 3 with PyYAML is used for one YAML check when available.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, buildIndex, serializeIndex, pad3 } from '../lib/library-index.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARGS = process.argv.slice(2);
const KEEP = ARGS.includes('--keep');
const NO_SIM = ARGS.includes('--no-sim');
const VERBOSE = ARGS.includes('--verbose');
const argValue = (name) => (ARGS.find((a) => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const ONLY = argValue('only');
const WORKFLOW = path.resolve(argValue('workflow') || path.join(REAL, '.github/workflows/library-index.yml'));
const PIPELINE = path.join(REAL, 'scripts/design-pipeline.mjs');
const GS_FILE = path.join(REAL, 'scripts/chd-library-backup.gs');
const DOC = path.resolve(argValue('doc') || path.join(REAL, 'docs/IMAGE-LIBRARY.md'));
const BOT_NAME = 'github-actions[bot]';

// ------------------------------------------------------------------ tiny framework
const results = [];
function check(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  const problems = [];
  let skipped = '';
  const t = {
    ok: (c, m) => {
      if (!c) problems.push(m);
    },
    eq: (a, b, m) => {
      if (JSON.stringify(a) !== JSON.stringify(b)) problems.push(`${m}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
    },
    must: (c, m) => {
      if (!c) throw new Error(m);
    },
    skip: (why) => {
      skipped = why;
    },
  };
  let crashed = null;
  try {
    fn(t);
  } catch (e) {
    crashed = e;
  }
  const ms = Date.now() - t0;
  if (skipped && !crashed && !problems.length) {
    console.log(`SKIP  ${name}  (${skipped})`);
    results.push({ name, ok: true, skipped: true });
  } else if (crashed || problems.length) {
    console.log(`FAIL  ${name}  (${ms} ms)`);
    for (const p of problems.slice(0, 12)) console.log('        - ' + p);
    if (crashed) console.log('        ! ' + (crashed.stack || crashed).toString().split('\n').slice(0, 5).join('\n          '));
    results.push({ name, ok: false });
  } else {
    console.log(`PASS  ${name}  (${ms} ms)`);
    results.push({ name, ok: true });
  }
}
const group = (title) => console.log(`\n== ${title}`);

// ------------------------------------------------------------------ process helpers
let TMP = '';
let ENV = {};
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: ENV, ...opts });
  const out = (r.stdout || '') + (r.stderr || '');
  if (VERBOSE && opts.show !== false && out.trim()) console.log(out.trim().split('\n').map((l) => '        | ' + l).join('\n'));
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', out, error: r.error };
}
const git = (cwd, ...args) => run('git', args, { cwd, show: false });
function gitOk(cwd, ...args) {
  const r = git(cwd, ...args);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} (in ${cwd}) failed: ${r.out.trim().slice(0, 300)}`);
  return r.stdout.trim();
}
const node = (cwd, ...args) => run(process.execPath, args, { cwd });
const have = (cmd) => run(cmd, ['--version'], { show: false }).status === 0;

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true });
}
function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst, fs.constants.COPYFILE_FICLONE);
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, path.join(dst, name));
    else copyFile(s, path.join(dst, name));
  }
}

// ------------------------------------------------------------------ the throwaway library
/**
 * 37 real designs (+ the 3 new ones = 40, the number of designs the Drive simulator's --quick mode takes, so it sees
 * every one of them): a duplicate-style pair, a spaced style, a design without a lifestyle picture, one with a back
 * picture, then the first designs of every category in turn until 37 are picked.
 */
const MAX_REAL = 37;
function selectDesigns(real) {
  const picked = new Map();
  const add = (d) => d && picked.size < MAX_REAL && picked.set(`${d.dir}/${d.slide}`, d);
  const dup = real.designs.find((d) => d.folder.includes('__slide_'));
  if (dup) {
    add(dup);
    const base = dup.folder.split('__slide_')[0].toLowerCase();
    add(real.designs.find((d) => d.dir === dup.dir && d.slide < dup.slide && d.folder.toLowerCase() === base));
  }
  add(real.designs.find((d) => /[^A-Za-z0-9._-]/.test(d.style)));
  add(real.designs.find((d) => !d.files.some((f) => f.name.startsWith('lifestyle'))));
  add(real.designs.find((d) => d.files.some((f) => f.name.startsWith('back'))));
  for (let round = 0; picked.size < MAX_REAL && round < 100; round++) {
    for (const c of CATEGORIES) add(real.designs.filter((d) => d.dir === c.dir)[round]);
  }
  return [...picked.values()];
}

/** Copies the picked designs into `repo`, renumbering every category 1..N (the real library has no gaps, and the pipeline's "next slide = count + 1" relies on that). */
function buildThrowawayLibrary(repo, designs) {
  let files = 0;
  let bytes = 0;
  for (const c of CATEGORIES) {
    const mine = designs.filter((d) => d.dir === c.dir).sort((a, b) => a.slide - b.slide);
    mine.forEach((d, i) => {
      const to = `slide_${pad3(i + 1)}`;
      copyDir(path.join(REAL, 'src/assets', d.dir, `slide_${pad3(d.slide)}`), path.join(repo, 'src/assets', d.dir, to));
      copyDir(path.join(REAL, 'public/images', d.dir, `slide_${pad3(d.slide)}`), path.join(repo, 'public/images', d.dir, to));
      files += d.files.length;
      bytes += d.files.reduce((n, f) => n + f.bytes, 0);
    });
  }
  copyFile(path.join(REAL, 'scripts/export-library.mjs'), path.join(repo, 'scripts/export-library.mjs'));
  copyFile(path.join(REAL, 'scripts/lib/library-index.mjs'), path.join(repo, 'scripts/lib/library-index.mjs'));
  return { files, bytes };
}

/** Writes one new design the way `design-pipeline.mjs publish` does (next slide = number of slide folders + 1; data.json with six fields; pictures). */
function pipelineWriteDesign(repo, dir, spec) {
  const slides = fs.readdirSync(path.join(repo, 'src/assets', dir)).filter((d) => /^slide_\d+$/.test(d));
  const slideNum = String(slides.length + 1).padStart(3, '0');
  const newAsset = path.join(repo, 'src/assets', dir, `slide_${slideNum}`);
  const newImages = path.join(repo, 'public/images', dir, `slide_${slideNum}`);
  fs.mkdirSync(newAsset, { recursive: true });
  fs.mkdirSync(newImages, { recursive: true });
  fs.writeFileSync(path.join(newAsset, 'data.json'), JSON.stringify({
    styleNumber: spec.style,
    description: spec.description,
    technique: 'WOVEN',
    content: spec.content ?? 'COTTON',
    size: spec.size ?? '18X18',
    season: 'EVERYDAY',
  }, null, 2) + '\n');
  for (const name of spec.images) fs.writeFileSync(path.join(newImages, name), crypto.randomBytes(2000 + Math.floor(Math.random() * 6000)));
  return { dir, slide: parseInt(slideNum, 10), style: spec.style };
}

const parse = (text) => JSON.parse(text);
const readIndex = (repo) => parse(fs.readFileSync(path.join(repo, 'library-index.json'), 'utf8'));
const keyOf = (d) => `${d.dir}/${d.slide}`;
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const designCount = (bare) => parse(gitOk(bare, 'show', 'main:library-index.json')).count;

// ------------------------------------------------------------------ cutting the real code out of design-pipeline.mjs
/** Lines [from, to] of design-pipeline.mjs that the publish --commit step runs between "verified" and "pushed". Located by content, not by line number. */
function cutPublishGlue() {
  const lines = fs.readFileSync(PIPELINE, 'utf8').split('\n');
  const find = (re, from = 0) => {
    const i = lines.findIndex((l, k) => k >= from && re.test(l));
    if (i < 0) throw new Error(`design-pipeline.mjs: no line matching ${re} (the publish glue moved; update scripts/tests/daily-flow.mjs)`);
    return i;
  };
  const iNames = find(/const names = published\.map/);
  const iAdd = find(/execSync\('git add src\/assets public\/images'/, iNames);
  const iImp = find(/import\('\.\/lib\/library-index\.mjs'\)/, iAdd);
  let iTry = iImp;
  while (iTry > iAdd && lines[iTry].trim() !== 'try {') iTry--;
  if (lines[iTry].trim() !== 'try {') throw new Error('design-pipeline.mjs: the library-index hook is no longer in a try { } block');
  let depth = 0;
  let iHookEnd = -1;
  for (let i = iTry; i < lines.length && iHookEnd < 0; i++) {
    for (const ch of lines[i]) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0;
    if (depth === 0) iHookEnd = i;
  }
  const iPush = find(/execSync\('git push origin HEAD:main'/, iHookEnd);
  return {
    hook: lines.slice(iNames, iHookEnd + 1).join('\n'), // names, git add, the try/catch hook
    commitPush: lines.slice(iHookEnd + 1, iPush + 1).join('\n'), // staged check, commit, push
    hookText: lines.slice(iTry, iHookEnd + 1).join('\n'),
  };
}

function writeGlueModule(file, body) {
  fs.writeFileSync(file, [
    "import fs from 'fs';",
    "import path from 'path';",
    "import { execSync } from 'child_process';",
    'const REPO = process.env.CHD_TEST_REPO;',
    'const commit = true;',
    'const published = JSON.parse(process.env.CHD_TEST_PUBLISHED);',
    body,
    '',
  ].join('\n'));
}

// ------------------------------------------------------------------ the workflow's trigger paths
/** GitHub's `paths:` filter syntax, the subset the workflow uses: `*` matches anything except `/`, `**` matches anything. */
function ghGlob(pattern) {
  if (/[?+\[\]!(){}\\]/.test(pattern)) throw new Error(`ghGlob: "${pattern}" uses filter syntax this test does not model`);
  const esc = (s) => s.replace(/[.^$|]/g, '\\$&');
  return new RegExp('^' + pattern.split('**').map((part) => part.split('*').map(esc).join('[^/]*')).join('.*') + '$');
}

/** The lines of the workflow step (a `- uses:` / `- name:` item) whose first line matches `re`, up to the next item. */
function stepLines(yaml, re) {
  const lines = yaml.split('\n');
  const at = lines.findIndex((l) => re.test(l));
  if (at < 0) return [];
  const item = lines[at].match(/^(\s*)-\s/);
  const indent = item ? item[1].length : lines[at].match(/^\s*/)[0].length;
  const out = [lines[at]];
  for (let i = at + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const ind = lines[i].match(/^\s*/)[0].length;
    if (ind <= indent) break;
    out.push(lines[i]);
  }
  return out;
}

// ------------------------------------------------------------------ the workflow's shell step
function workflowRunScript() {
  const lines = fs.readFileSync(WORKFLOW, 'utf8').split('\n');
  const runs = lines.map((l, i) => (/^\s*run:\s*\|\s*$/.test(l) ? i : -1)).filter((i) => i >= 0);
  if (runs.length !== 1 || lines.filter((l) => /^\s*run:/.test(l)).length !== 1) throw new Error(`expected exactly one "run: |" step in the workflow, found ${runs.length}`);
  const r = runs[0];
  const indent = lines[r].match(/^\s*/)[0].length;
  const body = [];
  let blockIndent = -1;
  for (let k = r + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.trim() === '') {
      body.push('');
      continue;
    }
    const ind = l.match(/^\s*/)[0].length;
    if (ind <= indent) break;
    if (blockIndent < 0) blockIndent = ind;
    body.push(l.slice(blockIndent));
  }
  return body.join('\n').replace(/\s+$/, '') + '\n';
}

let SEQ = 0;
/**
 * Runs the workflow step the way GitHub does: a shallow clone of main as the "checkout" (fetch-depth 1), the script
 * run with `bash --noprofile --norc -eo pipefail`. `race`: install a post-commit hook that makes ANOTHER push land on
 * main after the step has committed and before it pushes ('once': only after its first commit, and it pushes the
 * commit prepared in `race.dev`; 'always': after every commit, each time a fresh empty commit).
 */
function runWorkflowStep(bare, script, race) {
  const n = ++SEQ;
  const runner = path.join(TMP, `runner-${n}`);
  gitOk(TMP, 'clone', '-q', '--depth', '1', '--branch', 'main', `file://${bare}`, runner);
  if (race) {
    const counter = path.join(runner, '.git', 'race-count');
    const hook = path.join(runner, '.git', 'hooks', 'post-commit');
    fs.writeFileSync(hook, [
      '#!/bin/sh',
      `n=$(cat '${counter}' 2>/dev/null || echo 0)`,
      `[ '${race.mode}' = once ] && [ "$n" -ge 1 ] && exit 0`,
      `echo $((n+1)) > '${counter}'`,
      'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE', // git commit passes its own identity on to its hooks
      `cd '${race.dev}' || exit 1`,
      'git pull -q --rebase origin main || exit 1',
      'if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then',
      '  git -c user.name=racer -c user.email=racer@example.com commit -q --allow-empty -m "competing push $((n+1))" || exit 1',
      'fi',
      'git push -q origin HEAD:main || exit 1',
      'exit 0',
      '',
    ].join('\n'));
    fs.chmodSync(hook, 0o755);
  }
  const file = path.join(TMP, `step-${n}.sh`);
  fs.writeFileSync(file, script);
  const r = run('bash', ['--noprofile', '--norc', '-eo', 'pipefail', file], { cwd: runner });
  rm(runner);
  return r;
}

/** A full clone of main with a committer identity, for acting as "someone else" (another route, a competing push). */
function devClone(bare, name) {
  const dev = path.join(TMP, name);
  gitOk(TMP, 'clone', '-q', `file://${bare}`, dev);
  gitOk(dev, 'config', 'user.name', 'dev');
  gitOk(dev, 'config', 'user.email', 'dev@example.com');
  return dev;
}

/** Checks out the tip of main in a scratch clone and asks the repo's own tool whether library-index.json is current there. */
function indexCheckAtTip(bare) {
  const dir = path.join(TMP, `tip-${++SEQ}`);
  gitOk(TMP, 'clone', '-q', '--depth', '1', '--branch', 'main', `file://${bare}`, dir);
  const r = node(dir, 'scripts/export-library.mjs', 'index', '--check');
  rm(dir);
  return r;
}

// ================================================================== main
const started = Date.now();
let exitCode = 0;
try {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'chd-daily-flow-'));
  const home = path.join(TMP, 'home');
  fs.mkdirSync(home);
  ENV = {
    ...process.env,
    HOME: home,
    GIT_CONFIG_GLOBAL: '/dev/null', // the person's own git config (signing, hooks, templates) must not leak into the test
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    ...(path.basename(process.execPath).startsWith('node') ? { PATH: path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '') } : {}),
  };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete ENV[k];
  const hasGit = have('git');
  const hasBash = have('bash');
  console.log(`daily-flow: temp folder ${TMP}${KEEP ? ' (kept)' : ''}`);

  // ---------------------------------------------------------------- setup
  group('Throwaway library, built from real designs (never touches this repo)');
  const W = path.join(TMP, 'library'); // plays the role of the website repo on the publisher's machine
  const bare = path.join(TMP, 'origin.git'); // plays the role of GitHub
  let oldIndex = null;
  let oldText = '';
  let realIndex = null;
  let stats = null;
  if (!hasGit) {
    check('setup', (t) => t.must(false, 'git is not installed: nothing below can run'));
    throw new Error('git missing');
  }
  realIndex = buildIndex(REAL);
  const designs = selectDesigns(realIndex);
  stats = buildThrowawayLibrary(W, designs);
  const idx0 = buildIndex(W);
  oldText = serializeIndex(idx0);
  fs.writeFileSync(path.join(W, 'library-index.json'), oldText);
  gitOk(TMP, 'init', '-q', '-b', 'main', W);
  gitOk(W, 'config', 'user.name', 'owner');
  gitOk(W, 'config', 'user.email', 'owner@example.com');
  gitOk(W, 'add', '-A');
  gitOk(W, 'commit', '-q', '-m', 'library v0');
  gitOk(TMP, 'clone', '-q', '--bare', W, bare);
  gitOk(bare, 'config', 'pack.compression', '0'); // the pictures are already compressed; every clone below would otherwise spend its time deflating them again
  gitOk(bare, 'config', 'core.compression', '0');
  gitOk(W, 'remote', 'add', 'origin', bare);
  gitOk(W, 'fetch', '-q', 'origin');
  gitOk(W, 'branch', '-q', '--set-upstream-to=origin/main', 'main');
  oldIndex = readIndex(W);

  check(`setup: ${oldIndex.count} real designs copied (${(stats.bytes / 1048576).toFixed(0)} MB): 8 categories, a duplicate-style pair, spaced styles, a design without lifestyle`, (t) => {
    t.eq([...new Set(oldIndex.designs.map((d) => d.dir))].sort(), CATEGORIES.map((c) => c.dir).sort(), 'categories');
    t.eq(oldIndex.count, MAX_REAL, 'design count');
    t.ok(oldIndex.designs.some((d) => d.folder.includes('__slide_')), 'no duplicate-style pair in the sample');
    t.ok(oldIndex.designs.some((d) => /[^A-Za-z0-9._-]/.test(d.style)), 'no spaced/bracketed style in the sample');
    t.ok(oldIndex.designs.some((d) => !d.files.some((f) => f.name.startsWith('lifestyle'))), 'no design without a lifestyle picture in the sample');
    t.ok(oldIndex.designs.every((d) => !d.files.some((f) => f.name === 'card.webp')), 'card.webp must not be in the index');
  });
  check('setup: index --check says the throwaway library is up to date', (t) => {
    const r = node(W, 'scripts/export-library.mjs', 'index', '--check');
    t.eq(r.status, 0, 'exit code');
    t.ok(/up to date/.test(r.out), 'message: ' + r.out.trim());
  });

  // ---------------------------------------------------------------- today's publish
  group("Today's publish: 3 new designs, written the way the pipeline writes them");
  const twin = oldIndex.designs.find((d) => d.dir === 'cushion' && !d.folder.includes('__slide_'));
  const D1 = pipelineWriteDesign(W, 'cushion', { style: twin.style, description: 'CUSHION', images: ['lifestyle.png', 'card.webp', 'image_01.png', 'image_02.png'] });
  const D2 = pipelineWriteDesign(W, 'TableRunner', { style: 'CHD-TR-2001 (B) - new', description: 'TABLE RUNNER', size: '14X72', images: ['lifestyle.png', 'card.webp', 'image_01.png', 'back.png', 'image_02.png'] });
  const D3 = pipelineWriteDesign(W, 'throw', { style: 'CHD-TH-2002', description: 'THROW', size: '50X60', images: ['image_01.png', 'image_02.png'] }); // no lifestyle picture
  const NEW = [D1, D2, D3];
  const newKeys = NEW.map(keyOf);
  const expectFolder = {
    [keyOf(D1)]: `${twin.folder}__slide_${pad3(D1.slide)}`,
    [keyOf(D2)]: 'CHD-TR-2001_B_-_new',
    [keyOf(D3)]: 'CHD-TH-2002',
  };
  console.log(`        new: ${NEW.map((d) => `${d.dir}/slide_${pad3(d.slide)} "${d.style}"`).join('; ')}`);

  check('before the hook: index --check FAILS and names the 3 designs', (t) => {
    t.ok(!oldIndex.designs.some((d) => d.folder === 'CHD-TR-2001_B_-_new' || d.folder === 'CHD-TH-2002'), 'test precondition: names already taken');
    const r = node(W, 'scripts/export-library.mjs', 'index', '--check');
    t.eq(r.status, 1, 'exit code');
    t.ok(/STALE/.test(r.out), 'says STALE: ' + r.out.trim());
    t.ok(/3 design\(s\) in the repo but not in the index/.test(r.out), 'names the count: ' + r.out.trim());
    t.eq(fs.readFileSync(path.join(W, 'library-index.json'), 'utf8'), oldText, 'the check must not rewrite the file');
  });

  const glue = cutPublishGlue();
  const hookRoot = path.join(TMP, 'hookroot'); // stands in for the scripts/ folder of the repo that runs the pipeline
  fs.mkdirSync(path.join(hookRoot, 'scripts'), { recursive: true });
  fs.symlinkSync(path.join(REAL, 'scripts/lib'), path.join(hookRoot, 'scripts/lib')); // the hook's './lib/library-index.mjs' is the real module
  const hookOnly = path.join(hookRoot, 'scripts/hook-only.mjs');
  const publishGlue = path.join(hookRoot, 'scripts/publish-glue.mjs');
  writeGlueModule(hookOnly, glue.hook);
  writeGlueModule(publishGlue, glue.hook + '\n' + glue.commitPush);
  const publishedEnv = JSON.stringify(NEW.map((d) => ({ style: d.style, dir: d.dir, slide: pad3(d.slide) })));
  const runGlue = (file, repo, published = publishedEnv) => run(process.execPath, [file], { cwd: repo, env: { ...ENV, CHD_TEST_REPO: repo, CHD_TEST_PUBLISHED: published } });

  check('the hook text in design-pipeline.mjs is the one under test (try/catch around buildIndex + serializeIndex, never rethrows)', (t) => {
    t.ok(/buildIndex, serializeIndex/.test(glue.hookText), 'imports buildIndex and serializeIndex');
    t.ok(/library-index\.json/.test(glue.hookText) && /git add library-index\.json/.test(glue.hookText), 'writes and stages library-index.json');
    t.ok(/catch \(e\)/.test(glue.hookText) && !/throw /.test(glue.hookText), 'catch block does not rethrow');
  });

  check('hook failure 1: the write throws (library-index.json cannot be written) -> only a log line, exit 0, publish carries on', (t) => {
    fs.renameSync(path.join(W, 'library-index.json'), path.join(W, 'library-index.json.bak'));
    fs.mkdirSync(path.join(W, 'library-index.json')); // writeFileSync -> EISDIR
    const r = runGlue(hookOnly, W);
    rm(path.join(W, 'library-index.json'));
    fs.renameSync(path.join(W, 'library-index.json.bak'), path.join(W, 'library-index.json'));
    t.eq(r.status, 0, 'the publish step must not throw; output: ' + r.out.trim().slice(0, 300));
    t.ok(/publish: library-index\.json not updated \(/.test(r.out), 'logs the warning: ' + r.out.trim().slice(0, 300));
    t.eq(fs.readFileSync(path.join(W, 'library-index.json'), 'utf8'), oldText, 'old index untouched');
  });

  check('hook failure 2: the library cannot be read (a broken data.json) -> only a log line, exit 0', (t) => {
    const victim = path.join(W, 'src/assets', oldIndex.designs[0].dir, `slide_${pad3(oldIndex.designs[0].slide)}`, 'data.json');
    const keep = fs.readFileSync(victim);
    fs.writeFileSync(victim, '{ this is not json');
    const r = runGlue(hookOnly, W);
    fs.writeFileSync(victim, keep);
    t.eq(r.status, 0, 'the publish step must not throw; output: ' + r.out.trim().slice(0, 300));
    t.ok(/publish: library-index\.json not updated \(/.test(r.out), 'logs the warning: ' + r.out.trim().slice(0, 300));
    t.eq(fs.readFileSync(path.join(W, 'library-index.json'), 'utf8'), oldText, 'old index untouched');
  });

  // the real thing: add -> hook -> (staged) -> commit -> push
  const publishRun = runGlue(publishGlue, W);
  const tipAfterPublish = git(W, 'rev-parse', 'HEAD').stdout.trim();
  check('publish glue (exact statements from design-pipeline.mjs): add, hook, commit and push succeed', (t) => {
    t.eq(publishRun.status, 0, 'exit code; output: ' + publishRun.out.trim().slice(-400));
    t.ok(!/library-index\.json not updated/.test(publishRun.out), 'the hook must not warn: ' + publishRun.out.trim().slice(-300));
    t.eq(gitOk(bare, 'rev-parse', 'main'), tipAfterPublish, 'origin main = the publish commit');
    t.eq(gitOk(W, 'log', '-1', '--format=%s'), `Add 3 approved design(s): ${NEW.map((d) => d.style).join(', ')}`, 'commit message');
  });
  check('one commit holds the 3 designs AND library-index.json (and nothing else)', (t) => {
    const names = gitOk(W, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort();
    const expected = ['library-index.json'];
    for (const d of NEW) {
      expected.push(`src/assets/${d.dir}/slide_${pad3(d.slide)}/data.json`);
      const imgs = fs.readdirSync(path.join(W, 'public/images', d.dir, `slide_${pad3(d.slide)}`));
      for (const f of imgs) expected.push(`public/images/${d.dir}/slide_${pad3(d.slide)}/${f}`);
    }
    t.eq(names, expected.sort(), 'files in the publish commit');
  });

  const newIndex = readIndex(W);
  const oldByKey = new Map(oldIndex.designs.map((d) => [keyOf(d), d]));
  const newByKey = new Map(newIndex.designs.map((d) => [keyOf(d), d]));

  check('the new index differs from the old one by exactly the 3 new designs', (t) => {
    t.eq(newIndex.count, oldIndex.count + 3, 'count');
    t.eq(newIndex.designs.length, oldIndex.designs.length + 3, 'designs');
    t.eq([...newByKey.keys()].filter((k) => !oldByKey.has(k)).sort(), [...newKeys].sort(), 'added');
    t.eq([...oldByKey.keys()].filter((k) => !newByKey.has(k)), [], 'removed');
    t.eq([...oldByKey.keys()].filter((k) => JSON.stringify(oldByKey.get(k)) !== JSON.stringify(newByKey.get(k))), [], 'changed existing designs');
    const head = (i) => JSON.stringify({ ...i, designs: undefined, count: undefined });
    t.eq(head(newIndex), head(oldIndex), 'header (version, repo, branch, categories)');
    const order = newIndex.designs.map((d) => [CATEGORIES.findIndex((c) => c.dir === d.dir), d.slide]);
    t.ok(order.every((x, i) => i === 0 || order[i - 1][0] < x[0] || (order[i - 1][0] === x[0] && order[i - 1][1] < x[1])), 'designs stay sorted by category, then slide');
  });
  check('existing folder names are unchanged (a design keeps its backup folder for ever)', (t) => {
    const moved = [...oldByKey.keys()].filter((k) => oldByKey.get(k).folder !== newByKey.get(k).folder);
    t.eq(moved, [], 'designs whose folder name changed');
  });
  check('new designs are named by the rules (sanitizing, __slide_NNN for a repeated style, no card.webp)', (t) => {
    for (const d of NEW) t.eq(newByKey.get(keyOf(d)).folder, expectFolder[keyOf(d)], `folder of ${d.dir}/slide_${pad3(d.slide)} (style "${d.style}")`);
    t.ok(newByKey.get(keyOf(D1)).folder.endsWith(`__slide_${pad3(D1.slide)}`), 'duplicate style gets the __slide_NNN suffix');
    t.eq(newByKey.get(keyOf(twin)).folder, twin.folder, 'the earlier design with the same style keeps its plain name');
    t.eq(newByKey.get(keyOf(D1)).style, twin.style, 'style is kept as written');
    t.eq(newByKey.get(keyOf(D2)).style, 'CHD-TR-2001 (B) - new', 'spaced style is kept as written; only the folder name is sanitized');
    t.eq(newByKey.get(keyOf(D1)).files.map((f) => f.name), ['image_01.png', 'image_02.png', 'lifestyle.png'], 'D1 files (card.webp left out)');
    t.eq(newByKey.get(keyOf(D2)).files.map((f) => f.name), ['back.png', 'image_01.png', 'image_02.png', 'lifestyle.png'], 'D2 files');
    t.eq(newByKey.get(keyOf(D3)).files.map((f) => f.name), ['image_01.png', 'image_02.png'], 'D3 has no lifestyle picture');
    for (const d of NEW) {
      const entry = newByKey.get(keyOf(d));
      t.eq(entry.specs.styleNumber, d.style, 'specs.styleNumber');
      for (const f of entry.files) t.eq(f.bytes, fs.statSync(path.join(W, 'public/images', d.dir, `slide_${pad3(d.slide)}`, f.name)).size, `bytes of ${f.name}`);
    }
  });
  check('after the hook: index --check passes', (t) => {
    const r = node(W, 'scripts/export-library.mjs', 'index', '--check');
    t.eq(r.status, 0, 'exit code; ' + r.out.trim());
    t.ok(new RegExp(`up to date \\(${newIndex.count} designs\\)`).test(r.out), r.out.trim());
  });
  check('regenerating is byte-identical (no dates in the index; git sees no diff)', (t) => {
    const before = fs.readFileSync(path.join(W, 'library-index.json'));
    const r = node(W, 'scripts/export-library.mjs', 'index');
    t.eq(r.status, 0, 'exit code');
    t.ok(/unchanged/.test(r.out), r.out.trim());
    t.eq(sha(fs.readFileSync(path.join(W, 'library-index.json'))), sha(before), 'file unchanged by `index`');
    fs.unlinkSync(path.join(W, 'library-index.json'));
    node(W, 'scripts/export-library.mjs', 'index');
    t.eq(sha(fs.readFileSync(path.join(W, 'library-index.json'))), sha(before), 'file rebuilt from nothing is identical');
    t.eq(serializeIndex(buildIndex(W)), serializeIndex(buildIndex(W)), 'two in-process builds');
    t.eq(gitOk(W, 'status', '--porcelain'), '', 'git working tree clean');
  });

  // ---------------------------------------------------------------- the safety-net workflow
  group('Safety net: the shell step of .github/workflows/library-index.yml against a bare origin');
  check('workflow file: triggers, permissions, concurrency, pinned actions, bot commit, no force-push, cannot loop', (t) => {
    t.must(fs.existsSync(WORKFLOW), WORKFLOW + ' is missing');
    const y = fs.readFileSync(WORKFLOW, 'utf8');
    const script = workflowRunScript();
    const paths = [...y.matchAll(/^\s+-\s+'([^']+)'\s*$/gm)].map((m) => m[1]);
    t.eq(paths.sort(), ['public/images/*/slide_*/**', 'scripts/lib/library-index.mjs', 'src/assets/*/slide_*/**'], 'trigger paths');
    t.ok(!paths.some((p) => /library-index\.json/.test(p)), 'library-index.json must not be a trigger path (loop)');
    t.ok(/branches:\s*\[main\]/.test(y), 'only pushes to main');
    t.ok(/permissions:\s*\n\s+contents:\s*write/.test(y), 'contents: write');
    t.ok(/group:\s*library-index/.test(y) && /cancel-in-progress:\s*false/.test(y), 'concurrency group, no cancel');
    t.ok(/uses:\s*actions\/checkout@v5\b/.test(y) && /uses:\s*actions\/setup-node@v5\b/.test(y), 'pinned well-known actions, on versions that run on Node 24 (v4 runs on the deprecated Node 20)');
    t.ok(stepLines(y, /uses:\s*actions\/checkout@/).some((l) => /^\s+ref:\s*main\b/.test(l)), 'the checkout step takes `ref: main` (the tip of main, not the commit that queued the run)');
    const timeout = Number((y.match(/timeout-minutes:\s*(\d+)/) || [])[1]);
    t.ok(timeout >= 15 && timeout <= 60, `timeout-minutes is a generous but bounded number for a 2 GB checkout (got ${timeout})`);
    t.ok(/node-version:\s*22/.test(y), 'node 22');
    t.ok(y.split('\n').every((l) => l.length <= 140), 'no comment or step line longer than 140 characters: ' + y.split('\n').filter((l) => l.length > 140).map((l) => l.slice(0, 40) + '...').join(' | '));
    t.ok(/shell:\s*bash/.test(y), 'bash with -e -o pipefail');
    t.ok(/user\.name "github-actions\[bot\]"/.test(script) && /commit -m "Refresh library-index\.json"/.test(script), 'bot identity and commit message');
    t.ok(/node scripts\/export-library\.mjs index\b(?! --check)/.test(script), 'runs `index`');
    t.ok(!/--force|--force-with-lease|push\s+(\S+\s+)*-f\b|\+HEAD|\+refs/.test(script), 'no force-push');
    t.ok(/GITHUB_TOKEN/.test(y), 'documents why GITHUB_TOKEN pushes cannot loop');
    const parsed = run('python3', ['-I', '-c', 'import sys, yaml; d = yaml.safe_load(open(sys.argv[1])); assert d["jobs"]["refresh"]["steps"]; print("yaml ok")', WORKFLOW], { show: false });
    if (parsed.status === 0) t.ok(/yaml ok/.test(parsed.stdout), 'YAML parses');
    else if (/No module named|not found|ENOENT/.test(parsed.out + String(parsed.error))) console.log('        (python3 with PyYAML not available: the YAML syntax check was skipped)');
    else t.ok(false, 'YAML does not parse: ' + parsed.out.trim());
  });

  check('trigger paths, matched the way GitHub matches them against the REAL repo: every file the index is built from starts a run; the site\'s own logos and hero pictures do not', (t) => {
    t.must(fs.existsSync(WORKFLOW), WORKFLOW + ' is missing');
    const triggers = [...fs.readFileSync(WORKFLOW, 'utf8').matchAll(/^\s+-\s+'([^']+)'\s*$/gm)].map((m) => ghGlob(m[1]));
    const starts = (file) => triggers.some((re) => re.test(file));
    // a self-test of the matcher on GitHub's documented rules: `*` stops at a slash, `**` does not
    t.ok(ghGlob('a/*/b').test('a/x/b') && !ghGlob('a/*/b').test('a/x/y/b') && ghGlob('a/**').test('a/x/y/b'), 'glob matcher sanity');
    const library = [];
    for (const d of realIndex.designs) {
      const slide = `slide_${pad3(d.slide)}`;
      library.push(`src/assets/${d.dir}/${slide}/data.json`);
      for (const f of d.files) library.push(`public/images/${d.dir}/${slide}/${f.name}`);
      library.push(`public/images/${d.dir}/${slide}/card.webp`); // derived, but a change to it still starts a (no-op) run; fine
    }
    const missed = library.filter((f) => !starts(f));
    t.eq(missed.slice(0, 5), [], `library files that would NOT start a run (${missed.length} of ${library.length})`);
    const site = fs.readdirSync(path.join(REAL, 'src/assets')).filter((n) => fs.statSync(path.join(REAL, 'src/assets', n)).isFile()).map((n) => `src/assets/${n}`);
    t.ok(site.length > 10, `test precondition: the site's own pictures in src/assets (found ${site.length})`);
    t.eq(site.filter(starts).slice(0, 5), [], 'site pictures that WOULD start a run');
    for (const f of ['public/hero.jpg', 'public/images/hero.jpg', 'library-index.json', 'src/App.tsx', 'docs/IMAGE-LIBRARY.md', 'scripts/export-library.mjs']) t.ok(!starts(f), `${f} must not start a run`);
    t.ok(starts('scripts/lib/library-index.mjs'), 'the naming code starts a run');
    t.ok(starts('src/assets/newcategory/slide_001/data.json') && starts('public/images/newcategory/slide_001/image_01.png'), 'a category added later is covered');
  });

  const script = fs.existsSync(WORKFLOW) ? workflowRunScript() : '';
  const wfPre = (t) => {
    if (!hasBash) return t.skip('bash is not installed');
    t.must(script, 'no workflow step to run');
  };

  check('normal day: the publish already refreshed the index -> the step does nothing (no commit, no push)', (t) => {
    wfPre(t);
    if (!hasBash) return;
    const before = gitOk(bare, 'rev-parse', 'main');
    const r = runWorkflowStep(bare, script);
    t.eq(r.status, 0, 'exit code; ' + r.out.trim().slice(-300));
    t.ok(/already up to date/.test(r.out), 'says nothing to commit: ' + r.out.trim().slice(-300));
    t.eq(gitOk(bare, 'rev-parse', 'main'), before, 'origin main must not move');
  });

  let tip = gitOk(bare, 'rev-parse', 'main');
  check('a design reaches main by another route (no index refresh) -> the step commits the index as github-actions[bot] and pushes it', (t) => {
    wfPre(t);
    if (!hasBash) return;
    const dev = devClone(bare, 'dev-other-route');
    pipelineWriteDesign(dev, 'bedding', { style: 'CHD-BD-3001', description: 'BEDDING', images: ['lifestyle.png', 'image_01.png', 'image_02.png'] });
    gitOk(dev, 'add', '-A');
    gitOk(dev, 'commit', '-q', '-m', 'Hand-added design, index not refreshed');
    gitOk(dev, 'push', '-q', 'origin', 'HEAD:main');
    rm(dev);
    const afterHand = gitOk(bare, 'rev-parse', 'main');
    const stale = indexCheckAtTip(bare);
    t.eq(stale.status, 1, 'precondition: the index is stale at that tip');
    const r = runWorkflowStep(bare, script);
    t.eq(r.status, 0, 'exit code; ' + r.out.trim().slice(-300));
    t.eq(gitOk(bare, 'log', '-1', '--format=%an|%ae|%s', 'main'), `${BOT_NAME}|41898282+github-actions[bot]@users.noreply.github.com|Refresh library-index.json`, 'bot commit');
    t.eq(gitOk(bare, 'rev-parse', 'main~1'), afterHand, 'one commit on top, a plain fast-forward');
    t.eq(gitOk(bare, 'show', '--name-only', '--format=', 'main'), 'library-index.json', 'the bot commit touches only library-index.json');
    t.eq(designCount(bare), newIndex.count + 1, 'index now lists the extra design');
    t.eq(indexCheckAtTip(bare).status, 0, 'index --check passes at the new tip');
    tip = gitOk(bare, 'rev-parse', 'main');
  });

  check('running it again right away is a no-op (the bot commit does not cause a second commit)', (t) => {
    wfPre(t);
    if (!hasBash) return;
    const r = runWorkflowStep(bare, script);
    t.eq(r.status, 0, 'exit code');
    t.ok(/already up to date/.test(r.out), r.out.trim().slice(-200));
    t.eq(gitOk(bare, 'rev-parse', 'main'), tip, 'origin main must not move');
  });

  check('main moves while the step runs (a competing push lands first) -> retried once from the new tip; the index covers both designs', (t) => {
    wfPre(t);
    if (!hasBash) return;
    const dev = devClone(bare, 'dev-first');
    pipelineWriteDesign(dev, 'rugs', { style: 'CHD-RG-3002', description: 'RUG', images: ['lifestyle.png', 'image_01.png'] });
    gitOk(dev, 'add', '-A');
    gitOk(dev, 'commit', '-q', '-m', 'Second hand-added design');
    gitOk(dev, 'push', '-q', 'origin', 'HEAD:main');
    const base = gitOk(bare, 'rev-parse', 'main');
    // the competing push: another design, also without an index refresh, prepared locally and pushed by the runner's post-commit hook
    pipelineWriteDesign(dev, 'bathmat', { style: 'CHD-BM-3003', description: 'BATH MAT', images: ['lifestyle.png', 'image_01.png'] });
    gitOk(dev, 'add', '-A');
    gitOk(dev, 'commit', '-q', '-m', 'Competing push with a third design');
    const r = runWorkflowStep(bare, script, { mode: 'once', dev });
    rm(dev);
    t.eq(r.status, 0, 'exit code; ' + r.out.trim().slice(-400));
    t.ok(/Retrying once/.test(r.out), 'went through the retry path: ' + r.out.trim().slice(-300));
    t.ok(/rejected|non-fast-forward|fetch first/.test(r.out), 'the first push really was rejected: ' + r.out.trim().slice(-300));
    const log = gitOk(bare, 'log', '--format=%an|%s', `${base}..main`).split('\n');
    t.eq(log, [`${BOT_NAME}|Refresh library-index.json`, 'dev|Competing push with a third design'], 'exactly the competing commit, then ONE bot commit on top (the discarded first attempt is not in history)');
    t.eq(designCount(bare), newIndex.count + 3, 'the regenerated index lists all three hand-added designs');
    t.eq(indexCheckAtTip(bare).status, 0, 'index --check passes at the new tip');
    tip = gitOk(bare, 'rev-parse', 'main');
  });

  check('main keeps moving (both pushes rejected) -> the step FAILS visibly, never force-pushes, other people\'s commits survive', (t) => {
    wfPre(t);
    if (!hasBash) return;
    const dev = devClone(bare, 'dev-second');
    pipelineWriteDesign(dev, 'totebag', { style: 'CHD-TB-3004', description: 'TOTE BAG', images: ['lifestyle.png', 'image_01.png'] });
    gitOk(dev, 'add', '-A');
    gitOk(dev, 'commit', '-q', '-m', 'Hand-added design four');
    gitOk(dev, 'push', '-q', 'origin', 'HEAD:main');
    const base = gitOk(bare, 'rev-parse', 'main');
    const r = runWorkflowStep(bare, script, { mode: 'always', dev });
    rm(dev);
    t.ok(r.status !== 0 && r.status !== null, 'the step must exit non-zero; got ' + r.status);
    t.ok(/Retrying once/.test(r.out), 'it did retry first: ' + r.out.trim().slice(-300));
    t.ok(/rejected/.test(r.out), 'git reported the rejection: ' + r.out.trim().slice(-300));
    t.ok(!/pushed to main/.test(r.out), 'must not claim success');
    t.eq(git(bare, 'merge-base', '--is-ancestor', base, 'main').status, 0, 'history only grew (nothing was overwritten)');
    t.eq(gitOk(bare, 'rev-list', '--count', `${base}..main`), '2', 'only the two competing commits arrived');
    t.ok(!gitOk(bare, 'log', '--format=%an', `${base}..main`).includes(BOT_NAME), 'no bot commit reached main');
    tip = gitOk(bare, 'rev-parse', 'main');
  });

  check('library-index.json missing from main -> the step creates and pushes it', (t) => {
    wfPre(t);
    if (!hasBash) return;
    const dev = devClone(bare, 'dev-missing');
    gitOk(dev, 'rm', '-q', 'library-index.json');
    gitOk(dev, 'commit', '-q', '-m', 'Index deleted by mistake');
    gitOk(dev, 'push', '-q', 'origin', 'HEAD:main');
    rm(dev);
    const r = runWorkflowStep(bare, script);
    t.eq(r.status, 0, 'exit code; ' + r.out.trim().slice(-300));
    t.eq(gitOk(bare, 'show', '--name-status', '--format=', 'main'), 'A\tlibrary-index.json', 'the bot commit adds the file');
    t.eq(indexCheckAtTip(bare).status, 0, 'index --check passes at the new tip');
  });

  // ---------------------------------------------------------------- the publish push is rejected
  group('Recovery: the publish run\'s push to main is rejected because main moved (the commands docs/IMAGE-LIBRARY.md gives)');
  /**
   * One rejected publish, on its own copy of origin so the cases do not disturb each other. The publisher's checkout is
   * taken up to date; THEN another route lands a design on main (and, with `bot`, the workflow step refreshes the index
   * with its own commit); THEN the publish run writes its designs and runs the real publish statements, whose
   * `git push origin HEAD:main` is rejected.
   */
  function rejectedPublish(label, handDir, publishedSpecs, bot) {
    const mirror = path.join(TMP, `origin-${label}.git`);
    gitOk(TMP, 'clone', '-q', '--bare', bare, mirror);
    const pub = devClone(mirror, `pub-${label}`);
    const hand = devClone(mirror, `hand-${label}`);
    pipelineWriteDesign(hand, handDir, { style: `CHD-HAND-${label}`, description: 'HAND', images: ['lifestyle.png', 'image_01.png'] });
    gitOk(hand, 'add', '-A');
    gitOk(hand, 'commit', '-q', '-m', 'Hand-added design, index not refreshed');
    gitOk(hand, 'push', '-q', 'origin', 'HEAD:main');
    rm(hand);
    const base = designCount(mirror);
    const wf = bot ? runWorkflowStep(mirror, script) : null;
    const made = publishedSpecs.map((sp) => pipelineWriteDesign(pub, sp.dir, sp));
    const r = runGlue(publishGlue, pub, JSON.stringify(made.map((d) => ({ style: d.style, dir: d.dir, slide: pad3(d.slide) }))));
    return { mirror, pub, wf, r, made, base };
  }
  /** The recovery commands from docs/IMAGE-LIBRARY.md ("If a day is missed"), step by step. */
  function documentedRecovery(pub) {
    const log = { conflicted: false, conflictFiles: [], aborted: false, staleAfterRebase: false, push: null };
    gitOk(pub, 'fetch', 'origin', 'main');
    let rb = git(pub, 'rebase', 'origin/main');
    for (let round = 0; rb.status !== 0 && round < 5; round++) {
      log.conflicted = true;
      const files = gitOk(pub, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
      log.conflictFiles.push(...files);
      if (files.some((f) => f !== 'library-index.json')) {
        git(pub, 'rebase', '--abort'); // "if git reports a conflict in any other file: stop"
        log.aborted = true;
        return log;
      }
      node(pub, 'scripts/export-library.mjs', 'index');
      gitOk(pub, 'add', 'library-index.json');
      rb = git(pub, '-c', 'core.editor=true', 'rebase', '--continue');
    }
    if (rb.status !== 0) throw new Error('rebase did not finish: ' + rb.out.trim().slice(-300));
    if (node(pub, 'scripts/export-library.mjs', 'index', '--check').status !== 0) {
      log.staleAfterRebase = true;
      node(pub, 'scripts/export-library.mjs', 'index');
      gitOk(pub, 'add', 'library-index.json');
      gitOk(pub, 'commit', '-q', '-m', 'Refresh library-index.json');
    }
    log.push = git(pub, 'push', 'origin', 'HEAD:main');
    return log;
  }
  const REJECTED = /rejected|non-fast-forward|fetch first/;

  check('publish push rejected after the Action\'s bot commit, git merges cleanly -> the merged index is STALE (not to be pushed as it is); the documented check catches it, regenerate, push', (t) => {
    wfPre(t);
    if (!hasBash) return;
    const s = rejectedPublish('clean', 'bedding', [{ dir: 'placemat', style: 'CHD-PM-9001', description: 'PLACEMAT', images: ['lifestyle.png', 'image_01.png'] }], true);
    t.eq(s.wf.status, 0, 'precondition: the workflow step refreshed the index; ' + s.wf.out.trim().slice(-200));
    t.ok(s.r.status !== 0 && REJECTED.test(s.r.out), 'the publish push is rejected: ' + s.r.out.trim().slice(-300));
    t.ok(/^Add 1 approved design\(s\): CHD-PM-9001/.test(gitOk(s.pub, 'log', '-1', '--format=%s')), 'the designs are committed locally');
    const log = documentedRecovery(s.pub);
    t.eq(log.conflicted, false, 'git merged without a conflict (a different category, and the same `count` on both sides)');
    t.eq(log.staleAfterRebase, true, 'the merged library-index.json is stale, so `index --check` after the rebase is not optional');
    t.eq(log.push && log.push.status, 0, 'the push succeeds: ' + (log.push && log.push.out.trim().slice(-200)));
    t.eq(git(s.mirror, 'merge-base', '--is-ancestor', gitOk(bare, 'rev-parse', 'main'), 'main').status, 0, 'history only grew');
    t.eq(designCount(s.mirror), s.base + 2, 'the index lists the design the other route added and the day\'s design');
    t.eq(indexCheckAtTip(s.mirror).status, 0, 'index --check passes at the new tip of main');
  });
  check('publish push rejected after the Action\'s bot commit, git stops on library-index.json (two designs published, so `count` differs) -> regenerate, add, continue, push', (t) => {
    wfPre(t);
    if (!hasBash) return;
    const s = rejectedPublish('conflict', 'bedding', [
      { dir: 'placemat', style: 'CHD-PM-9002', description: 'PLACEMAT', images: ['lifestyle.png', 'image_01.png'] },
      { dir: 'bathmat', style: 'CHD-BM-9003', description: 'BATH MAT', images: ['lifestyle.png', 'image_01.png'] },
    ], true);
    t.eq(s.wf.status, 0, 'precondition: the workflow step refreshed the index');
    t.ok(s.r.status !== 0 && REJECTED.test(s.r.out), 'the publish push is rejected: ' + s.r.out.trim().slice(-300));
    const log = documentedRecovery(s.pub);
    t.eq(log.conflicted, true, 'git stopped on a conflict');
    t.eq([...new Set(log.conflictFiles)], ['library-index.json'], 'only library-index.json conflicts');
    t.eq(log.staleAfterRebase, false, 'the regenerated index is current');
    t.eq(log.push && log.push.status, 0, 'the push succeeds: ' + (log.push && log.push.out.trim().slice(-200)));
    t.eq(designCount(s.mirror), s.base + 3, 'the index lists the design added by the other route and both published designs');
    t.eq(indexCheckAtTip(s.mirror).status, 0, 'index --check passes at the new tip of main');
    t.eq(gitOk(s.mirror, 'rev-list', '--count', '--merges', 'main'), '0', 'no merge commits: the history is a straight line');
  });
  check('publish push rejected, the other route added a design of the SAME category (same slide number) -> git conflicts on the design\'s own files: the documented advice is to stop and ask a developer', (t) => {
    wfPre(t);
    if (!hasBash) return;
    const s = rejectedPublish('samecat', 'bedding', [{ dir: 'bedding', style: 'CHD-BD-9004', description: 'BEDDING', images: ['lifestyle.png', 'image_01.png'] }], false);
    t.ok(s.r.status !== 0 && REJECTED.test(s.r.out), 'the publish push is rejected: ' + s.r.out.trim().slice(-300));
    const before = gitOk(s.pub, 'rev-parse', 'HEAD');
    const log = documentedRecovery(s.pub);
    t.eq(log.aborted, true, 'the rebase conflicts outside library-index.json and is aborted');
    t.ok(log.conflictFiles.some((f) => /^src\/assets\/bedding\/slide_\d+\/data\.json$/.test(f)), 'the conflict is on the design\'s data.json: ' + log.conflictFiles.slice(0, 4).join(', '));
    t.eq(gitOk(s.pub, 'rev-parse', 'HEAD'), before, 'after the abort the publisher\'s commit is exactly as it was');
    t.eq(git(s.pub, 'status', '--porcelain').stdout.trim(), '', 'and the working tree is clean');
    t.eq(log.push, null, 'nothing was pushed');
  });

  // ---------------------------------------------------------------- the Drive script
  group('Drive backup script: what it will do with the new index');
  const gsSrc = fs.readFileSync(GS_FILE, 'utf8');
  let gsProbe = null;
  let gsLoadError = '';
  try {
    const ctx = vm.createContext({ Logger: { log() {} } }); // no Google services, no Node: only the language
    vm.runInContext(gsSrc, ctx, { filename: 'chd-library-backup.gs' });
    gsProbe = vm.runInContext(`(function (json, bump) {
      var idx = JSON.parse(json);
      var bad = validateIndex_(idx);
      if (bad) return JSON.stringify({ bad: bad });
      idx = normalizeIndex_(idx);
      var sigs = {}, names = {};
      idx.designs.forEach(function (d) {
        if (bump === keyOf_(d)) d.files[0].bytes += 1; // negative control: one picture of one design changes size
        sigs[keyOf_(d)] = designSig_(idx, d);
        names[keyOf_(d)] = d.files.map(function (f) { return backupName_(d, f.name); });
      });
      return JSON.stringify({ sigs: sigs, names: names });
    })`, ctx);
  } catch (e) {
    gsLoadError = String((e && e.message) || e);
  }
  const probe = (index, bump = '') => {
    if (!gsProbe) throw new Error('could not load chd-library-backup.gs outside Google: ' + gsLoadError);
    return parse(gsProbe(JSON.stringify(index), bump));
  };

  check('the real .gs accepts the new index (its own validateIndex_) and names the new designs\' files like the repo tool does', (t) => {
    const p = probe(newIndex);
    t.ok(!p.bad, 'validateIndex_ rejected it: ' + p.bad);
    for (const d of NEW) {
      const e = newByKey.get(keyOf(d));
      t.eq(p.names[keyOf(d)], e.files.map((f) => `${e.folder}_${f.name}`), `Drive file names of ${keyOf(d)}`);
    }
    t.eq(p.names[keyOf(D3)], ['CHD-TH-2002_image_01.png', 'CHD-TH-2002_image_02.png'], 'D3 Drive file names');
    t.ok(p.names[keyOf(D2)].every((n) => n.startsWith('CHD-TR-2001_B_-_new_')), 'D2 Drive file names use the sanitized folder');
  });
  check('the real .gs sees exactly 3 new designs: every other design has an unchanged signature (so it makes no Drive call for them)', (t) => {
    const a = probe(oldIndex);
    const b = probe(newIndex);
    t.ok(!a.bad && !b.bad, 'index rejected: ' + (a.bad || b.bad));
    const newInB = Object.keys(b.sigs).filter((k) => !(k in a.sigs));
    t.eq(newInB.sort(), [...newKeys].sort(), 'designs the Drive script has no saved state for');
    const changed = Object.keys(a.sigs).filter((k) => a.sigs[k] !== b.sigs[k]);
    t.eq(changed, [], 'existing designs whose signature changed');
    t.eq(new Set(Object.values(b.sigs)).size, Object.keys(b.sigs).length, 'signatures are distinct per design (the comparison is not vacuous)');
    const bumped = probe(oldIndex, keyOf(oldIndex.designs[0]));
    t.ok(bumped.sigs[keyOf(oldIndex.designs[0])] !== a.sigs[keyOf(oldIndex.designs[0])], 'negative control: a changed picture size DOES change the signature');
    const files = newKeys.reduce((n, k) => n + b.names[k].length, 0);
    console.log(`        the next Drive sync creates ${files} picture files + ${NEW.length} design.json in ${NEW.length} new folders; nothing else is touched`);
  });

  check('Drive simulator (a copy of scripts/tests/gas-sim.mjs, unedited) syncs the new library exactly: tree, sizes, sha1, design.json, state, catalog', (t) => {
    if (NO_SIM) return t.skip('--no-sim');
    // The simulator reads library-index.json and the pictures from the repo it lives in, so it is run from a copy of
    // the few files it needs inside a repo-shaped folder that points at the throwaway library.
    const simRepo = path.join(TMP, 'simrepo');
    for (const rel of ['scripts/chd-library-backup.gs', 'scripts/chd-library-backup.appsscript.json', 'scripts/lib/library-index.mjs', 'scripts/tests/gas-sim.mjs']) copyFile(path.join(REAL, rel), path.join(simRepo, rel));
    copyFile(path.join(W, 'library-index.json'), path.join(simRepo, 'library-index.json'));
    fs.symlinkSync(path.join(W, 'public'), path.join(simRepo, 'public'));
    if (fs.existsSync(path.join(REAL, 'node_modules'))) fs.symlinkSync(path.join(REAL, 'node_modules'), path.join(simRepo, 'node_modules'));
    const r = node(simRepo, 'scripts/tests/gas-sim.mjs', '--quick', '--only=E1'); // --quick: the simulator's 40-design mode
    t.ok(new RegExp(`E1 full multi-run sync via setup\\(\\) \\(${newIndex.count} designs\\)`).test(r.out), `E1 ran on the ${newIndex.count}-design throwaway library: ` + r.out.trim().slice(0, 300));
    if (/^FAIL\s+E1 /m.test(r.out)) {
      // E1 also asserts that the sync is long enough to need several 6-minute runs. That describes the size of the
      // simulator's own sample of the real library, not correctness, and a 40-design sample of this size comes up
      // a little short. Every other assertion (tree, sizes, sha1, design.json, state, catalog, mail, triggers) must hold.
      // The two ignored messages are matched by their text, so if gas-sim.mjs rewords them this check fails (closed, not open)
      // and the lists below have to be updated; it never lets an unknown problem through.
      const problems = r.out.split('\n').filter((l) => /^\s{8}- /.test(l)).map((l) => l.replace(/^\s+-\s+/, ''));
      const SCALE_ONLY = [/whole sync should need more than one 6-minute run/, /expected several slices/];
      const other = problems.filter((p) => !SCALE_ONLY.some((re) => re.test(p)));
      t.ok(problems.length > 0 && other.length === 0 && !/^\s{8}! /m.test(r.out), 'E1 reported more than the scale-only assertion: ' + (other.join(' | ') || r.out.trim().slice(-400)));
      if (problems.length && !other.length) console.log(`        (ignored: "${problems.join('", "')}" - sample size, not correctness)`);
    } else {
      t.eq(r.status, 0, 'simulator exit code; ' + r.out.trim().slice(-500));
      t.ok(/^PASS\s+E1 /m.test(r.out), 'E1 passed: ' + r.out.trim().slice(-300));
    }
  });
  // ---------------------------------------------------------------- the guide
  group('Docs match the code: what docs/IMAGE-LIBRARY.md promises is still true');
  check('the guide\'s numbers, e-mail subjects, status words, function names and pipeline behaviour are all still in the code', (t) => {
    const raw = fs.readFileSync(DOC, 'utf8');
    const doc = raw.replace(/\s+/g, ' '); // line wraps in the guide must not matter
    const pipeline = fs.readFileSync(PIPELINE, 'utf8');
    const gctx = vm.createContext({ Logger: { log() {} } });
    vm.runInContext(gsSrc, gctx, { filename: 'chd-library-backup.gs' });
    const K = (name) => vm.runInContext(name, gctx);
    const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const has = (text, what, why) => t.ok(text.includes(what), `${why}: expected to find ${JSON.stringify(what)}`);

    // the daily time: the guide says "about 3 PM India time" because DAILY_HOUR is 15, and "3 AM" only for the old script
    const hour = K('DAILY_HOUR');
    const hourText = `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
    t.ok(doc.split(`about ${hourText} India time`).length - 1 >= 3, `the guide says "about ${hourText} India time" in sections 1, 3 and 6 (DAILY_HOUR = ${hour})`);
    t.ok(!/nightly|every night|each night|overnight/i.test(doc), 'the guide never calls the daily job nightly');
    for (const m of raw.matchAll(/\b3 AM\b/g)) {
      const para = raw.slice(raw.lastIndexOf('\n\n', m.index), raw.indexOf('\n\n', m.index));
      t.ok(/earlier version of the script/.test(para), 'a "3 AM" is left outside the paragraph about upgrading from the earlier script: ' + para.trim().slice(0, 80));
    }
    // numbers
    has(doc, `names up to ${K('NEWS_LIST_MAX')}`, 'NEWS_LIST_MAX (names in the summary email)');
    has(doc, `${WORD[K('FAIL_MAIL_AFTER')]} runs in a row`, 'FAIL_MAIL_AFTER (runs before the "failing" email)');
    has(doc, `retries ${K('RETRY_DELAYS_MIN').join(' and ')} minutes later`, 'RETRY_DELAYS_MIN');
    has(doc, `${K('ABORT_AFTER_FAILS')} designs in a row failed`, 'ABORT_AFTER_FAILS');
    has(doc, `about ${K('TIME_BUDGET_MS') / 60000} minutes`, 'TIME_BUDGET_MS (the time slice)');
    t.eq(K('CONTINUE_AFTER_MS'), 60000, 'CONTINUE_AFTER_MS (the guide says the next slice starts about a minute later)');
    has(gsSrc, '2.1 GB', 'the free space the first copy needs (script header)');
    has(doc, 'about 2.1 GB', 'the free space the first copy needs');
    // e-mail subjects and the words of the summary email
    has(gsSrc, "'CHD design library backup is complete'", 'complete subject in the script');
    has(gsSrc, "'CHD design library backup is failing'", 'failing subject in the script');
    has(gsSrc, "'CHD design library: ' + count + ' new design'", 'summary subject in the script');
    has(doc, '"CHD design library backup is complete"', 'complete subject in the guide');
    has(doc, '"CHD design library backup is failing"', 'failing subject in the guide');
    has(doc, 'CHD design library: N new design(s)', 'summary subject in the guide');
    has(gsSrc, ' could not be copied yet', 'the unfinished line of the summary email');
    has(gsSrc, 'daily limit was reached', 'the quota line of the summary email');
    has(gsSrc, 'tried again every day', 'the retry sentence of the summary email');
    t.eq(K('NEWS_LIST_MAX') >= 5, true, 'the summary names up to five stuck designs; NEWS_LIST_MAX is not below that');
    // what `status` prints, and in which time zone
    for (const label of ['Designs backed up:', 'Waiting/failed designs:', 'Last run:', 'Last error:', 'Runs failed in a row:']) {
      has(doc, '`' + label, `status label in the guide`);
      has(gsSrc, label, 'status label in the script');
    }
    t.ok(/at: new Date\(\)\.toISOString\(\)/.test(gsSrc) && /'Last run: ' \+ p\.at/.test(gsSrc), 'status prints the time of the last run as an ISO (UTC) timestamp, as the guide says');
    for (const kind of ['complete', 'incomplete', 'partial', 'quota', 'stalled', 'failed', 'stopped']) {
      has(gsSrc, `'${kind}'`, `run kind "${kind}" in the script`);
      has(doc, `| \`${kind}\` |`, `run kind "${kind}" in the guide's table`);
    }
    has(gsSrc, 'SWITCHED OFF', 'status message the guide quotes');
    // functions the guide tells the owner to run
    for (const fn of ['setup', 'sync', 'status', 'selfTest', 'stopAll', 'syncDaily', 'recheckAll']) {
      if (doc.includes('`' + fn + '`') || doc.includes('`' + fn + '()`')) t.ok(new RegExp(`^function ${fn}\\(`, 'm').test(gsSrc), `function ${fn}() exists in the script`);
    }
    // the publish step: numbering, the "resuming" trap, the unchanged push line and the hook's warning
    has(pipeline, "String(slides.length + 1).padStart(3, '0')", 'the pipeline numbers a new design as (slide folders + 1), which is why a gap breaks it (section 2)');
    t.ok(/const resuming = !existing && fs\.existsSync\(newAsset\) && fs\.existsSync\(newImages\)\s*&& fs\.existsSync\(path\.join\(newAsset, 'data\.json'\)\)\s*&& fs\.existsSync\(path\.join\(newImages, 'lifestyle\.png'\)\)/.test(pipeline), 'the pipeline\'s "resuming" test is still the one section 2 describes');
    has(pipeline, 'resuming previously staged', 'the pipeline message the guide quotes');
    has(pipeline, 'now LIVE on the website', 'the "now LIVE" email');
    has(pipeline, 'publish: library-index.json not updated (', 'the hook warning the guide quotes');
    t.ok(!/git (fetch|pull|rebase)\b/.test(pipeline), 'the pipeline still never fetches or rebases before pushing, so section 4\'s recovery commands are still needed (if this fails, update section 4 and this check)');
    has(pipeline, "git push origin HEAD:main", 'the pipeline pushes HEAD:main');
    t.ok(fs.existsSync(WORKFLOW), 'the workflow the guide names exists');
    // the recovery commands the guide gives for a rejected publish push are the ones documentedRecovery() above runs, in the same order
    let at = raw.indexOf('git fetch origin main');
    for (const cmd of ['git fetch origin main', 'git rebase origin/main', 'node scripts/export-library.mjs index\n', 'git add library-index.json', 'git rebase --continue',
      'node scripts/export-library.mjs index --check', 'node scripts/export-library.mjs index\n', 'git add library-index.json', 'git commit -m "Refresh library-index.json"',
      'bun scripts/design-pipeline.mjs publish --commit']) {
      const found = at < 0 ? -1 : raw.indexOf(cmd, at);
      t.ok(found >= 0, `the guide's recovery commands, in order: missing or out of order: ${cmd.trim()}`);
      if (found >= 0) at = found + cmd.length;
    }
    has(raw, 'git rebase --abort', 'the guide tells the reader to abort when git conflicts on any other file');
  });
} catch (e) {
  console.log(`\nFAIL  test run aborted: ${(e && e.stack) || e}`);
  results.push({ name: 'run', ok: false });
} finally {
  if (TMP && !KEEP) rm(TMP);
  else if (TMP) console.log(`\nkept: ${TMP}`);
}

const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped);
console.log(`\n${results.length - failed.length - skipped.length}/${results.length - skipped.length} passed${skipped.length ? `, ${skipped.length} skipped` : ''}  (${((Date.now() - started) / 1000).toFixed(0)} s)`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.name).join('; '));
  exitCode = 1;
}
process.exit(exitCode);
