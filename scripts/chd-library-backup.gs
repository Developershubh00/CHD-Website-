/**
 * CHD DESIGN LIBRARY -> GOOGLE DRIVE BACKUP  (Google Apps Script)
 *
 * Copies the whole design library (about 1,400 designs, 4,600 pictures, 2 GB) from the
 * public GitHub repo into YOUR Google Drive, in a clean layout, and then keeps it up to
 * date every night. Paste it once, approve it once, and it runs by itself.
 *
 * ONE-TIME SETUP (about 5 minutes)
 *   1. Open https://script.google.com and click  New project.
 *   2. Delete the sample code, paste this WHOLE file into Code.gs, and save.
 *      (Rename the project to "CHD Library Backup" if you like.)
 *   3. Click the gear icon (Project Settings) and tick
 *      "Show appsscript.json manifest file in editor". Go back to the editor, open
 *      appsscript.json, replace everything in it with the contents of
 *      scripts/chd-library-backup.appsscript.json from the repo, and save.
 *   4. In the toolbar pick the function  setup  and press Run.
 *   5. A consent screen appears. Choose your Google account, press "Advanced" ->
 *      "Go to CHD Library Backup (unsafe)" -> Allow (it is your own script; Google
 *      shows this for every script that has not been through its review). The list asks for
 *      Drive and Sheets (to create the backup folders, files and the Catalog), connecting to
 *      external services (to read GitHub), managing triggers (the nightly job), sending
 *      email (the summary mail to you) and your email address (to know where to send it).
 *      If the run stopped at the consent screen, press Run on  setup  once more.
 *   Done. setup() checks connectivity, creates the Drive folder, installs the nightly
 *   job (about 3 AM India time) and starts the first copy. Watch it in the "Execution log"
 *   panel at the bottom of the editor (or "Executions" in the left sidebar), or run  status
 *   any time to see progress.
 *
 * WHAT IT CREATES (all inside ONE Drive folder "CHD Design Library (Backup)" in My Drive)
 *   <Root>/<Category name>/<style folder>/<style folder>_<original file name> ...
 *                                        + design.json  (specs + file list + source)
 *   <Root>/Catalog              Google Sheet, one row per design, with Drive links
 *   <Root>/README.txt           what the layout is and how to restore the website from it
 *   <Root>/_sync-state.json     the script's own progress file (please leave it alone)
 *   The same layout is produced by the repo's export tool, so either can restore the site.
 *   Share the Drive link of <Root> to share everything at once.
 *   (To use a folder you already made, put its id in ROOT_FOLDER_ID below before setup.
 *   Pick one that does not already hold a sheet called "Catalog": that sheet gets rewritten.)
 *
 * MOVING OR COPYING THE BACKUP
 *   Dragging <Root> to another place in Drive needs no change: the script finds it by id.
 *   To keep a SECOND, separate copy elsewhere: create an empty Drive folder, put its id in
 *   ROOT_FOLDER_ID, save and run setup(). The new folder gets its own full copy, its own
 *   Catalog and state file; the old folder is left exactly as it was. To go back, clear
 *   ROOT_FOLDER_ID (the folder it finds or creates by name is then used again).
 *
 * HOW LONG IT TAKES / QUOTAS
 *   Google lets a script run 6 minutes at a time, so it works in ~4.5 minute slices and
 *   re-starts itself a minute later until everything is copied. The first copy is roughly
 *   2 to 6 hours of script time (an estimate: it depends on how fast Drive accepts files;
 *   it needs about 2.1 GB of free Drive space). Google's daily limits depend on the
 *   account and change over time. When this was written Google listed about 90 minutes of
 *   trigger run time per day for a free account and 6 hours for Workspace, 20,000 / 100,000
 *   UrlFetch calls per day (this script makes about one per picture) and 250 / 1,500 "documents
 *   created" per day (Google does not say whether saving a picture counts against that;
 *   this copy needs about 6,000 creates). So the first copy can take several days, and
 *   if file creation is capped it may do so even on Workspace. Nothing is lost by that: when
 *   a daily limit is hit the script stops cleanly and the 3 AM job carries on the next night,
 *   where it stopped. The log line of every run says how many files it created.
 *   After the first copy a normal night is a quick check (a few seconds) plus copies of
 *   only what is new or changed.
 *   You get ONE email when the first full copy is complete, and one email if three runs
 *   in a row fail.
 *
 * FUNCTIONS YOU CAN RUN (toolbar function picker)
 *   setup()          one-time install (see above). Safe to run again.
 *   sync()           copy what is missing/changed now. Safe to run any time.
 *   selfTest()       read-only check of internet, GitHub, Drive space, mail quota.
 *   status()         prints progress: designs done / total, files, bytes, last error.
 *   rebuildCatalog() rewrites the Catalog sheet from the current state.
 *   recheckAll()     make the next sync re-inspect every folder in Drive (use it if you
 *                    deleted or moved things by hand; nothing is re-downloaded unless missing).
 *   stopAll()        switches the backup off: removes every trigger this script created and
 *                    tells any run in progress to stop. Nothing else is touched.
 *
 * HOW TO STOP IT: run  stopAll.  If a slice is running at that moment it finishes the design
 *   it is copying (normally well under a minute), schedules nothing more and ends; stopAll
 *   waits for that for a few minutes and says so. Until you run setup() again, sync() does
 *   nothing. (Deleting the triggers by hand under the clock icon is NOT enough while a slice
 *   is running: that slice would schedule the next one.)
 *
 * SAFETY: it never permanently deletes anything. It only changes items with its own exact
 * names inside its own backup folder (the category and style folders, the pictures it saved,
 * design.json, README.txt, _sync-state.json and the Catalog sheet); everything else in Drive
 * is left alone, and files in the backup that are no longer in the library are left in place.
 * The only things it moves to the Drive Trash (recoverable for 30 days) are older copies of a
 * picture, with the same name but a different size than the library says, after the current
 * picture was saved next to them. If you edit design.json, README.txt or the Catalog by hand,
 * your edits are replaced by the next sync (README.txt is written once and then left alone).
 * No password or key is stored anywhere; the GitHub repo is public and is only read.
 */

// ===================================== SETTINGS =====================================

/** Optional: id of an existing Drive folder to use as the backup root. Empty = create/find one. */
var ROOT_FOLDER_ID = '';
var ROOT_FOLDER_NAME = 'CHD Design Library (Backup)';
var REPO = 'Developershubh00/CHD-Website-';
var BRANCH = 'main';
var SITE_BASE = 'https://www.creativehomedecorllp.com';
var CATALOG_NAME = 'Catalog';
var STATE_FILE_NAME = '_sync-state.json';
var README_NAME = 'README.txt';

var TIME_BUDGET_MS = 270000;   // stop starting new work after this (Apps Script kills a run at 360 s)
var HARD_STOP_EXTRA_MS = 50000; // a design already being written may finish up to this much later
var CONTINUE_AFTER_MS = 60000; // next slice starts this long after a slice that ran out of time
var SAFETY_AFTER_MS = 540000;  // a run that gets killed (6-minute limit, hung call) never reaches its end; this trigger, armed at its start, restarts it
var STOP_WAIT_MS = 240000;     // stopAll() waits this long for a running slice to end
var STOP_CHECK_MS = 10000;     // a running slice looks for a stop request at most this often
var RETRY_DELAYS_MIN = [5, 15]; // pause before re-trying after the 1st / 2nd failed run in a row
var DAILY_HOUR = 3;
var FETCH_BATCH = 8;           // parallel downloads per fetchAll call
var MAX_ATTEMPTS = 3;          // tries per picture per source for transient errors
var BACKOFF_MS = 1500;
var DRIVE_RETRIES = 3;
var SAVE_EVERY = 20;           // save the state file every N designs
var PROGRESS_EVERY = 25;       // log a progress line every N designs
var LOCK_WAIT_MS = 3000;
var FAIL_MAIL_AFTER = 3;       // consecutive failed runs before the "it is failing" email
var ABORT_AFTER_FAILS = 6;     // stop a run after this many designs fail in a row (systemic problem)
var DEMOTE_SOURCE_AFTER = 6;   // a picture source that failed this many files in a row is tried last
var CATALOG_MIN_MS = 45000;    // time needed to rebuild the catalog inside a run
var SIG_VERSION = 1;           // bump to force every design to be re-inspected
var SOURCES = ['raw', 'site', 'cdn'];

// ================================== ENTRY POINTS ====================================

/** One-time install: self-test, create the Drive folder, install the nightly trigger, start copying. */
function setup() {
  Logger.log('=== CHD library backup: setup ===');
  if (!selfTest()) {
    Logger.log('setup: the self-test found a blocking problem (see above). Fix it and run setup() again. Nothing was installed.');
    return;
  }
  PropertiesService.getScriptProperties().deleteProperty('STOPPED'); // setup() switches the backup on again after a stopAll()
  var root = resolveRoot_(true);
  Logger.log('Backup folder: ' + root.getUrl());
  installDailyTrigger_();
  Logger.log('Starting the first sync now; it keeps itself going until everything is copied.');
  sync();
}

/** The trigger target for the nightly run (kept separate so one-off continuation triggers are easy to tell apart). */
function syncDaily() {
  sync();
}

/** Copies whatever is missing or changed. Idempotent, resumable, never runs twice at once. */
function sync() {
  if (isStopped_()) {
    Logger.log('sync: the backup was switched off by stopAll(); run setup() to switch it on again.');
    return;
  }
  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(LOCK_WAIT_MS);
  } catch (e) {
    got = false;
  }
  if (!got) {
    Logger.log('sync: another run is in progress; exiting quietly.');
    return;
  }
  try {
    try {
      deleteTriggers_(['sync']); // the continuation that just fired (they are not auto-removed) and any stale ones
      // Safety net: if this run is killed (6-minute limit, a hung call) it never reaches finish_(),
      // so without this the copy would wait for the next nightly run. finish_() removes it again.
      ScriptApp.newTrigger('sync').timeBased().after(SAFETY_AFTER_MS).create();
    } catch (e0) {
      Logger.log('sync: could not manage triggers at the start: ' + errText_(e0));
    }
    runSync_();
  } catch (e) {
    Logger.log('sync: unexpected error: ' + errText_(e));
    try {
      deleteTriggers_(['sync']); // an error nobody planned for must not turn into a retry loop; the nightly run tries again
    } catch (e1) {
      // nothing more to do
    }
  } finally {
    try {
      lock.releaseLock();
    } catch (e2) {
      // nothing to do
    }
  }
}

/** Read-only health check. Returns true when nothing blocks the backup. Writes nothing to Drive. */
function selfTest() {
  Logger.log('--- selfTest (read-only) ---');
  var problems = [];
  var index = null;
  try {
    index = loadIndex_();
    var bytes = 0;
    index.designs.forEach(function (d) {
      d.files.forEach(function (f) {
        bytes += f.bytes;
      });
    });
    Logger.log('OK    library index: ' + index.designs.length + ' designs, ' + countFiles_(index) + ' files, ' + fmtBytes_(bytes));
  } catch (e) {
    problems.push('library index: ' + errText_(e));
    Logger.log('FAIL  library index: ' + errText_(e));
  }
  if (index) {
    var probe = smallestFile_(index);
    var working = 0;
    SOURCES.forEach(function (src) {
      if (!probe) return;
      var url = fileUrl_(index, src, probe.d, probe.f.name);
      try {
        var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
        var verdict = judge_(resp, probe.f.bytes);
        if (verdict.v === 'ok') working++;
        Logger.log((verdict.v === 'ok' ? 'OK    ' : 'WARN  ') + 'picture source ' + src + ': ' + (verdict.v === 'ok' ? 'reachable' : verdict.msg));
      } catch (e) {
        Logger.log('WARN  picture source ' + src + ': ' + errText_(e));
      }
    });
    if (probe && !working) problems.push('no picture source (GitHub raw / live site / jsDelivr) returned a valid file');
    try {
      var used = DriveApp.getStorageUsed();
      var limit = DriveApp.getStorageLimit();
      var need = totalBytes_(index);
      if (limit > 0 && limit - used < need) {
        Logger.log('WARN  Drive free space ' + fmtBytes_(limit - used) + ' is less than the library size ' + fmtBytes_(need) + ' (fine if part of it is already backed up)');
      } else {
        Logger.log('OK    Drive space: ' + (limit > 0 ? fmtBytes_(limit - used) + ' free' : 'no limit reported') + ', library needs up to ' + fmtBytes_(need));
      }
    } catch (e) {
      Logger.log('WARN  could not read Drive storage figures: ' + errText_(e));
    }
  }
  try {
    var root = findRoot_();
    Logger.log('OK    Drive access; backup folder: ' + (root ? root.getUrl() : 'not created yet (setup creates it)'));
  } catch (e) {
    problems.push('Drive: ' + errText_(e));
    Logger.log('FAIL  Drive: ' + errText_(e));
  }
  try {
    Logger.log('INFO  mail quota left today: ' + MailApp.getRemainingDailyQuota() + '; notifications go to ' + (ownerEmail_() || '(unknown)'));
  } catch (e) {
    Logger.log('WARN  mail quota unavailable: ' + errText_(e));
  }
  try {
    var triggers = ScriptApp.getProjectTriggers().map(function (t) {
      return t.getHandlerFunction();
    });
    Logger.log('INFO  triggers installed: ' + (triggers.length ? triggers.join(', ') : 'none'));
  } catch (e) {
    problems.push('triggers: ' + errText_(e));
    Logger.log('FAIL  triggers: ' + errText_(e));
  }
  if (isStopped_()) Logger.log('INFO  the backup is switched off (stopAll() was run); setup() switches it on again.');
  Logger.log(problems.length ? 'RESULT: PROBLEMS FOUND: ' + problems.join(' | ') : 'RESULT: all good');
  return problems.length === 0;
}

/** Prints progress: designs done/total, files, bytes, last error. */
function status() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('PROGRESS');
  Logger.log('--- CHD library backup status ---');
  if (!raw) {
    Logger.log('No sync has run yet. Run setup() first.');
  } else {
    var p = JSON.parse(raw);
    Logger.log('Designs backed up: ' + p.done + ' / ' + p.total + (p.total ? ' (' + Math.floor((100 * p.done) / p.total) + '%)' : ''));
    Logger.log('Pictures backed up: ' + p.files + ', ' + fmtBytes_(p.bytes));
    Logger.log('Waiting/failed designs: ' + p.pending);
    Logger.log('Last run: ' + p.at + ' -> ' + p.kind + ' (' + p.completed + ' designs this run, ' + (p.created || 0) + ' files created, ' + p.failed + ' failed, ' + p.elapsedS + ' s)');
    Logger.log('Last error: ' + (p.error || 'none'));
    Logger.log('Runs failed in a row: ' + p.streak);
  }
  var stopped = props.getProperty('STOPPED');
  if (stopped) Logger.log('SWITCHED OFF by stopAll() at ' + stopped + '. Run setup() to switch the backup on again.');
  var rootId = props.getProperty('ROOT_ID') || ROOT_FOLDER_ID;
  if (rootId) Logger.log('Backup folder: https://drive.google.com/drive/folders/' + rootId);
  var cat = props.getProperty('CATALOG_ID');
  if (cat) Logger.log('Catalog sheet: https://docs.google.com/spreadsheets/d/' + cat);
  Logger.log('Triggers: ' + (ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction();
  }).join(', ') || 'none'));
}

/** Rewrites the Catalog sheet from the saved state (and the current library index). */
function rebuildCatalog() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log('rebuildCatalog: a sync is running; try again in a few minutes.');
    return;
  }
  try {
    var ctx = newCtx_();
    ctx.index = loadIndex_();
    ctx.root = resolveRoot_(true);
    ctx.state = loadState_(ctx);
    var url = buildCatalog_(ctx);
    Logger.log('Catalog rebuilt: ' + url);
    if (ctx.state.catalogDirty) {
      ctx.state.catalogDirty = false;
      ctx.dirty = true;
      saveState_(ctx);
    }
  } catch (e) {
    Logger.log('rebuildCatalog failed: ' + errText_(e));
  } finally {
    lock.releaseLock();
  }
}

/** Makes the next sync re-inspect every design folder in Drive (nothing is re-downloaded unless it is missing). */
function recheckAll() {
  if (isStopped_()) {
    Logger.log('recheckAll: the backup was switched off by stopAll(); run setup() to switch it on again.');
    return;
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log('recheckAll: a sync is running; try again in a few minutes.');
    return;
  }
  try {
    var ctx = newCtx_();
    ctx.root = resolveRoot_(true);
    ctx.state = loadState_(ctx);
    var n = 0;
    Object.keys(ctx.state.designs).forEach(function (k) {
      ctx.state.designs[k].sig = '';
      n++;
    });
    ctx.state.pass.done = true;
    ctx.state.catalogDirty = true;
    ctx.dirty = true;
    saveState_(ctx);
    Logger.log('recheckAll: ' + n + ' designs will be re-inspected by the next sync.');
  } catch (e) {
    Logger.log('recheckAll failed: ' + errText_(e));
    return;
  } finally {
    lock.releaseLock();
  }
  sync();
}

/**
 * Switches the backup off: removes every trigger this script created (nightly job and any pending
 * continuation) and raises the STOPPED flag, so a slice that is running right now ends after the
 * design it is copying and schedules nothing. setup() clears the flag.
 */
function stopAll() {
  var props = PropertiesService.getScriptProperties();
  try {
    props.setProperty('STOPPED', new Date().toISOString());
  } catch (e) {
    Logger.log('stopAll: could not set the stop flag (' + errText_(e) + '); a running slice may schedule one more run.');
  }
  var n = deleteTriggers_(['sync', 'syncDaily']); // at once, so nothing new starts while we wait
  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(STOP_WAIT_MS); // a running slice holds the lock until it has ended
  } catch (e2) {
    got = false;
  }
  if (got) {
    try {
      n += deleteTriggers_(['sync', 'syncDaily']); // anything created in the meantime
    } finally {
      lock.releaseLock();
    }
    Logger.log('stopAll: stopped; removed ' + n + ' trigger(s) and nothing is running. Run setup() to start again.');
  } else {
    Logger.log('stopAll: removed ' + n + ' trigger(s). A slice is still running; it will end after the design it is copying and schedule nothing more. Run status() in a few minutes to check, setup() to start again.');
  }
}

/** True once stopAll() has been run (until setup() clears it). */
function isStopped_() {
  try {
    return !!PropertiesService.getScriptProperties().getProperty('STOPPED');
  } catch (e) {
    return false;
  }
}

/** For the copy loop: true when stopAll() was run during this slice (looked up at most every STOP_CHECK_MS). */
function stopRequested_(ctx) {
  var now = Date.now();
  if (!ctx.stopped && now - ctx.lastStopCheck >= STOP_CHECK_MS) {
    ctx.lastStopCheck = now;
    ctx.stopped = isStopped_();
  }
  return ctx.stopped;
}

// ===================================== MAIN RUN =====================================

function newCtx_() {
  var t = Date.now();
  return {
    started: t,
    deadline: t + TIME_BUDGET_MS,
    hardStop: t + TIME_BUDGET_MS + HARD_STOP_EXTRA_MS,
    index: null,
    root: null,
    state: null,
    stateFile: null,
    dirty: false,
    sinceSave: 0,
    catFolders: {},
    srcFail: { raw: 0, site: 0, cdn: 0 },
    completed: 0,
    failed: 0,
    kept: 0,
    stopped: false,
    lastStopCheck: t,
    catalogDeferred: false,
    catalogFailed: false,
    totals: { done: 0, files: 0, bytes: 0 },
    stats: { created: 0, replaced: 0, reused: 0, fetched: 0, bytes: 0 },
    error: '',
  };
}

function runSync_() {
  var ctx = newCtx_();
  var kind;
  try {
    ctx.index = loadIndex_();
    ctx.root = resolveRoot_(true);
    ctx.state = loadState_(ctx);
    ensureReadme_(ctx);
    kind = syncDesigns_(ctx);
  } catch (e) {
    ctx.error = errText_(e);
    if (e && e.tag === 'QUOTA') kind = 'quota';
    else if (e && e.tag === 'TIMEUP') kind = 'partial';
    else kind = 'failed';
    Logger.log('sync: ' + (kind === 'failed' ? 'FAILED: ' : 'stopped: ') + ctx.error);
    try {
      saveState_(ctx);
    } catch (e2) {
      Logger.log('sync: could not save state: ' + errText_(e2));
    }
  }
  finish_(ctx, kind);
}

/** The per-design loop. Returns 'complete' | 'incomplete' | 'partial' | 'quota' | 'stalled'. */
function syncDesigns_(ctx) {
  var idx = ctx.index;
  var st = ctx.state;
  var total = idx.designs.length;
  var consecutiveFails = 0;
  var kind = '';
  var failedNow = st.pass.done ? {} : st.pass.failed;
  try {
    for (var i = 0; i < total; i++) {
      var d = idx.designs[i];
      var key = keyOf_(d);
      var sig = designSig_(idx, d);
      var entry = st.designs[key];
      if (entry && entry.sig === sig) {
        // unchanged since the last time: no Drive call at all
        ctx.totals.done++;
        ctx.totals.files += d.files.length;
        ctx.totals.bytes += designBytes_(d);
        continue;
      }
      if (ctx.index.fromFallback && entry && entry.sig) {
        // The index came from the jsDelivr cache, which can be hours old: it must not replace pictures that
        // were saved from a newer index. A later run with the GitHub index sorts out real changes.
        ctx.totals.done++;
        ctx.totals.files += d.files.length;
        ctx.totals.bytes += designBytes_(d);
        continue;
      }
      if (failedNow[key]) continue; // already failed in this pass; tried again in the next pass
      if (Date.now() >= ctx.deadline) {
        kind = 'partial';
        break;
      }
      if (stopRequested_(ctx)) {
        Logger.log('sync: stopAll() was run; ending this slice.');
        kind = 'stopped';
        break;
      }
      try {
        var complete = processDesign_(ctx, d, key, sig);
        consecutiveFails = 0;
        ctx.completed++;
        if (complete) {
          ctx.totals.done++;
          ctx.totals.files += d.files.length;
          ctx.totals.bytes += designBytes_(d);
        }
        if (ctx.completed % PROGRESS_EVERY === 0) {
          Logger.log('progress: ' + ctx.completed + ' designs copied this run (design ' + (i + 1) + ' of ' + total + '), ' + ctx.stats.created + ' files created, ' + ctx.stats.replaced + ' replaced, ' + fmtBytes_(ctx.stats.bytes) + ', ' + Math.round((Date.now() - ctx.started) / 1000) + ' s');
        }
      } catch (err) {
        if (err && err.tag === 'QUOTA') {
          ctx.error = errText_(err);
          Logger.log('sync: daily quota reached (' + ctx.error + '); will continue at the next nightly run.');
          kind = 'quota';
          break;
        }
        if (err && err.tag === 'TIMEUP') {
          kind = 'partial';
          break;
        }
        var pass = activePass_(ctx);
        failedNow = pass.failed;
        pass.failed[key] = errText_(err).slice(0, 160);
        ctx.dirty = true;
        ctx.failed++;
        ctx.error = key + ': ' + errText_(err);
        Logger.log('ERROR ' + key + ' (' + d.folder + '): ' + errText_(err));
        consecutiveFails++;
        if (consecutiveFails >= ABORT_AFTER_FAILS) {
          Logger.log('sync: ' + consecutiveFails + ' designs failed in a row; stopping this run.');
          kind = 'stalled';
          break;
        }
      }
      if (++ctx.sinceSave >= SAVE_EVERY) saveState_(ctx);
    }

    if (!kind) {
      // The pass reached the end of the index.
      if (!st.pass.done) {
        st.pass.done = true;
        ctx.dirty = true;
      }
      if (st.catalogDirty || !PropertiesService.getScriptProperties().getProperty('CATALOG_ID')) {
        if (ctx.hardStop - Date.now() < CATALOG_MIN_MS) {
          kind = 'partial'; // not enough time left in this slice; the next one writes the catalog
          ctx.catalogDeferred = true;
        } else {
          try {
            buildCatalog_(ctx);
            st.catalogDirty = false;
            ctx.dirty = true;
          } catch (e) {
            ctx.error = 'catalog: ' + errText_(e);
            ctx.catalogFailed = true;
            Logger.log('sync: catalog not written (' + errText_(e) + '); will retry next run.');
            if (e && e.tag === 'QUOTA') kind = 'quota';
          }
        }
      }
      if (!kind) kind = total - ctx.totals.done > 0 || ctx.catalogFailed ? 'incomplete' : 'complete'; // "complete" includes a written Catalog
    }
  } finally {
    // one save at the end (a crash or running out of time loses at most the last few designs)
    try {
      saveState_(ctx);
    } catch (e) {
      Logger.log('sync: could not save state: ' + errText_(e));
      if (!ctx.error) ctx.error = 'state save: ' + errText_(e);
    }
  }
  return kind;
}

/** Records the run, schedules (or clears) the continuation trigger and sends the notification emails. */
function finish_(ctx, kind) {
  var props = PropertiesService.getScriptProperties();
  var total = ctx.index ? ctx.index.designs.length : 0;
  var bad = kind === 'failed' || ((kind === 'quota' || kind === 'stalled' || kind === 'incomplete' || (kind === 'partial' && !ctx.catalogDeferred)) && ctx.completed === 0);
  var streak = parseInt(props.getProperty('FAIL_STREAK') || '0', 10) || 0;
  streak = bad ? streak + 1 : 0;
  var elapsedS = Math.round((Date.now() - ctx.started) / 1000);
  var progress = {
    at: new Date().toISOString(),
    kind: kind,
    total: total,
    done: ctx.totals.done,
    files: ctx.totals.files,
    bytes: ctx.totals.bytes,
    pending: total - ctx.totals.done,
    completed: ctx.completed,
    created: ctx.stats.created,
    replaced: ctx.stats.replaced,
    failed: ctx.failed,
    elapsedS: elapsedS,
    error: String(ctx.error || '').slice(0, 300),
    streak: streak,
  };
  if (ctx.index) {
    Logger.log('sync: ' + kind + ' | ' + ctx.totals.done + '/' + total + ' designs done | this run +' + ctx.completed + ' designs, ' + ctx.stats.created + ' files created, ' + ctx.stats.replaced + ' replaced, ' + ctx.stats.reused + ' already there, ' + ctx.failed + ' failed' + (ctx.kept ? ', ' + ctx.kept + ' left as they are (cached index)' : '') + ' | ' + elapsedS + ' s');
  }
  try {
    props.setProperty('FAIL_STREAK', String(streak));
    if (ctx.index) props.setProperty('PROGRESS', JSON.stringify(progress));
    else {
      var old = props.getProperty('PROGRESS');
      var merged = old ? JSON.parse(old) : { total: 0, done: 0, files: 0, bytes: 0, pending: 0, completed: 0, failed: 0 };
      merged.at = progress.at;
      merged.kind = kind;
      merged.error = progress.error;
      merged.streak = streak;
      merged.elapsedS = elapsedS;
      props.setProperty('PROGRESS', JSON.stringify(merged));
    }
  } catch (e) {
    Logger.log('sync: could not record progress: ' + errText_(e));
  }

  // continuation trigger: exactly one when more work remains, none otherwise (and none after stopAll())
  var stopped = kind === 'stopped' || isStopped_();
  var delay = 0;
  if (stopped) delay = 0;
  else if (kind === 'partial' && !bad) delay = CONTINUE_AFTER_MS;
  else if (kind === 'partial' || kind === 'failed' || kind === 'stalled') {
    var i = bad ? streak - 1 : 0;
    if (i < RETRY_DELAYS_MIN.length) delay = RETRY_DELAYS_MIN[i] * 60000;
  }
  try {
    deleteTriggers_(['sync']); // also removes the safety trigger this run armed at its start
    if (delay) {
      ScriptApp.newTrigger('sync').timeBased().after(delay).create();
      Logger.log('sync: next slice in ' + Math.round(delay / 1000) + ' s.');
    } else if (stopped) {
      Logger.log('sync: switched off by stopAll(); nothing more is scheduled. Run setup() to switch it on again.');
    } else if (kind !== 'complete') {
      Logger.log('sync: no more runs scheduled today; the nightly trigger will pick up from here.');
    }
  } catch (e) {
    Logger.log('sync: could not manage triggers: ' + errText_(e));
  }

  // emails (never allowed to fail the sync; a mail that could not be sent is tried again next run)
  try {
    if (kind === 'complete' && !props.getProperty('MAIL_DONE')) {
      var catId = props.getProperty('CATALOG_ID');
      var sent = sendMail_('CHD design library backup is complete',
        'The first full backup of the CHD design library is finished.\n\n' +
        'Designs: ' + ctx.totals.done + ' of ' + total + '\n' +
        'Pictures: ' + ctx.totals.files + ' (' + fmtBytes_(ctx.totals.bytes) + ')\n\n' +
        'Backup folder: https://drive.google.com/drive/folders/' + ctx.root.getId() + '\n' +
        (catId ? 'Catalog sheet: https://docs.google.com/spreadsheets/d/' + catId + '\n' : '') +
        '\nIt now re-checks every night (about 3 AM) and copies anything new. No action needed.');
      if (sent) props.setProperty('MAIL_DONE', new Date().toISOString());
    }
    if (bad && streak >= FAIL_MAIL_AFTER && !props.getProperty('FAIL_MAILED')) {
      var sentFail = sendMail_('CHD design library backup is failing',
        'The Drive backup has failed ' + streak + ' times in a row.\n\nLast problem: ' + (ctx.error || kind) + '\n\n' +
        'Open the Apps Script project and run status() or selfTest() for details. It keeps trying every night.');
      if (sentFail) props.setProperty('FAIL_MAILED', new Date().toISOString());
    }
    if (!bad) props.deleteProperty('FAIL_MAILED');
  } catch (e) {
    Logger.log('sync: notification problem: ' + errText_(e));
  }
}

// ================================= ONE DESIGN =======================================

/**
 * Copies one design into Drive. Returns true when the design is complete there. It returns false only in
 * "additive" mode (the library index came from the jsDelivr cache, which can be hours old): a picture that
 * already exists with another size is then left alone instead of being replaced, and the design is not
 * marked complete, so the next run with the GitHub index decides which size is right.
 */
function processDesign_(ctx, d, key, sig) {
  var idx = ctx.index;
  var st = ctx.state;
  var additive = !!idx.fromFallback;
  var catFolder = categoryFolder_(ctx, d);
  var fo = retry_(function () {
    return findOrCreateFolder_(catFolder, d.folder);
  });
  var have = fo.isNew ? Object.create(null) : listFolder_(fo.folder);
  var entry = { sig: '', folderId: fo.folder.getId(), at: '', files: {} };
  var need = [];
  var leftovers = []; // same-named copies of another size next to a copy of the right size (a run died between saving the new copy and trashing the old one)
  var kept = 0;
  d.files.forEach(function (f) {
    var bname = backupName_(d, f.name);
    var cands = have[bname] || [];
    var same = null;
    for (var j = 0; j < cands.length; j++) {
      if (cands[j].size === f.bytes) {
        same = cands[j];
        break;
      }
    }
    if (same) {
      entry.files[bname] = same.id;
      ctx.stats.reused++;
      if (!additive) {
        cands.forEach(function (c) {
          if (c.size !== f.bytes) leftovers.push(c);
        });
      }
    } else if (additive && cands.length) {
      entry.files[bname] = cands[0].id;
      kept++;
      Logger.log('WARN  ' + key + ' file ' + f.name + ': the copy in Drive has another size than the cached index says; left as it is for now.');
    } else {
      need.push({ f: f, bname: bname, stale: cands });
    }
  });
  st.designs[key] = entry; // partial progress is visible to the catalog; sig stays '' until complete
  activePass_(ctx);
  markChanged_(ctx);

  var problems = [];
  if (need.length) {
    var got = downloadFiles_(ctx, d, need);
    need.forEach(function (n) {
      var resp = got.ok[n.bname];
      if (!resp) {
        problems.push(n.f.name + ' [' + got.why[n.bname] + ']');
        Logger.log('ERROR ' + key + ' file ' + n.f.name + ': ' + got.why[n.bname]);
        return;
      }
      checkTime_(ctx, true);
      // new copy first, then trash only the superseded copy of this very file
      entry.files[n.bname] = createBackupFile_(fo.folder, n.bname, resp, n.f.bytes);
      ctx.stats.created++;
      ctx.stats.bytes += n.f.bytes;
      if (n.stale.length) {
        n.stale.forEach(function (c) {
          retry_(function () {
            c.file.setTrashed(true);
          });
        });
        ctx.stats.replaced++;
      }
      markChanged_(ctx);
    });
  }
  if (problems.length) throw new Error('not copied: ' + problems.join('; '));

  leftovers.forEach(function (c) {
    retry_(function () {
      c.file.setTrashed(true);
    });
    ctx.stats.replaced++;
    markChanged_(ctx);
  });

  entry.files['design.json'] = writeDesignJson_(fo.folder, have, designJson_(idx, d), additive);
  markChanged_(ctx);
  if (kept) {
    ctx.kept++;
    return false;
  }
  entry.sig = sig;
  entry.at = isoDate_();
  return true;
}

function markChanged_(ctx) {
  ctx.dirty = true;
  ctx.state.catalogDirty = true;
}

/** Starts a new pass (a pass = one walk over the index; designs that fail are retried in the next pass). */
function activePass_(ctx) {
  var st = ctx.state;
  if (st.pass.done) {
    st.pass = { id: st.pass.id + 1, done: false, failed: {} };
    ctx.dirty = true;
  }
  return st.pass;
}

function categoryFolder_(ctx, d) {
  var name = categoryName_(ctx.index, d);
  if (!ctx.catFolders[name]) {
    ctx.catFolders[name] = retry_(function () {
      return findOrCreateFolder_(ctx.root, name).folder;
    });
  }
  return ctx.catFolders[name];
}

function findOrCreateFolder_(parent, name) {
  var found = firstLive_(parent.getFoldersByName(name));
  if (found) return { folder: found, isNew: false };
  return { folder: parent.createFolder(name), isNew: true };
}

/** First item of a Drive iterator that is not in the Trash (iterators can include trashed items). */
function firstLive_(it, accept) {
  while (it.hasNext()) {
    var x = it.next();
    if (!x.isTrashed() && (!accept || accept(x))) return x;
  }
  return null;
}

/** name -> [{file, id, size}] for the (non-trashed) files directly inside a folder. */
function listFolder_(folder) {
  return retry_(function () {
    var out = Object.create(null);
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (f.isTrashed()) continue;
      var n = f.getName();
      if (!out[n]) out[n] = [];
      out[n].push({ file: f, id: f.getId(), size: f.getSize() });
    }
    return out;
  });
}

function createBackupFile_(folder, name, resp, bytes) {
  var blob = resp.getBlob().setName(name).setContentType(mimeFor_(name));
  var f = retry_(
    function () {
      return folder.createFile(blob);
    },
    function () {
      // a failed attempt may still have created the file: reuse it instead of making a duplicate
      return firstLive_(folder.getFilesByName(name), function (c) {
        return c.getSize() === bytes;
      });
    }
  );
  return f.getId();
}

/** Writes design.json only when it is missing or its text differs (additive mode: only when it is missing). Returns the file id. */
function writeDesignJson_(folder, have, text, onlyIfMissing) {
  var cands = have['design.json'] || [];
  if (cands.length) {
    if (onlyIfMissing) return cands[0].id;
    var cur = cands[0].file;
    var same = retry_(function () {
      return cur.getBlob().getDataAsString() === text;
    });
    if (!same) {
      retry_(function () {
        cur.setContent(text);
      });
    }
    return cands[0].id;
  }
  var blob = Utilities.newBlob(text).setContentType('application/json').setName('design.json');
  var f = retry_(
    function () {
      return folder.createFile(blob);
    },
    function () {
      return firstLive_(folder.getFilesByName('design.json'));
    }
  );
  return f.getId();
}

function designJson_(index, d) {
  var obj = {
    category: d.cat,
    categoryName: categoryName_(index, d),
    dir: d.dir,
    slide: d.slide,
    style: d.style,
    folder: d.folder,
    specs: d.specs,
    files: d.files.map(function (f) {
      return { original: f.name, backup: backupName_(d, f.name), bytes: f.bytes };
    }),
    source: { repo: index.repo, branch: index.branch, path: 'public/images/' + d.dir + '/slide_' + pad3_(d.slide) },
  };
  return JSON.stringify(obj, null, 2) + '\n';
}

// ================================== DOWNLOADING =====================================

/**
 * Downloads the wanted files, trying GitHub raw, then the live site, then jsDelivr.
 * A response is accepted ONLY if its byte length equals the index's size.
 * Returns { ok: {backupName: HTTPResponse}, why: {backupName: reason} }.
 */
function downloadFiles_(ctx, d, need) {
  var ok = {};
  var why = {};
  var remaining = need.slice();
  var order = sourceOrder_(ctx);
  for (var s = 0; s < order.length && remaining.length; s++) {
    var src = order[s];
    var toTry = remaining.slice();
    var last = {};
    for (var attempt = 1; attempt <= MAX_ATTEMPTS && toTry.length; attempt++) {
      checkTime_(ctx, false);
      var retryNext = [];
      for (var off = 0; off < toTry.length; off += FETCH_BATCH) {
        if (off > 0) checkTime_(ctx, false);
        var chunk = toTry.slice(off, off + FETCH_BATCH);
        var resps = fetchBatch_(ctx, chunk.map(function (n) {
          return fileUrl_(ctx.index, src, d, n.f.name);
        }));
        ctx.stats.fetched += chunk.length;
        for (var k = 0; k < chunk.length; k++) {
          var verdict = judge_(resps[k], chunk[k].f.bytes);
          if (verdict.v === 'ok') {
            ok[chunk[k].bname] = resps[k];
            ctx.srcFail[src] = 0;
          } else {
            last[chunk[k].bname] = verdict.msg;
            if (verdict.v === 'retry') retryNext.push(chunk[k]);
          }
        }
      }
      toTry = retryNext;
      if (toTry.length && attempt < MAX_ATTEMPTS) Utilities.sleep(BACKOFF_MS * Math.pow(2, attempt - 1));
    }
    remaining = remaining.filter(function (n) {
      if (ok[n.bname]) return false;
      why[n.bname] = (why[n.bname] ? why[n.bname] + '; ' : '') + src + ' ' + (last[n.bname] || '?');
      ctx.srcFail[src]++;
      return true;
    });
  }
  return { ok: ok, why: why };
}

/** Sources in preference order; one that has failed many files in a row is moved to the end for this run. */
function sourceOrder_(ctx) {
  var good = [];
  var bad = [];
  SOURCES.forEach(function (s) {
    (ctx.srcFail[s] >= DEMOTE_SOURCE_AFTER ? bad : good).push(s);
  });
  return good.concat(bad);
}

/**
 * fetchAll in one go; if one request throws (DNS, timeout) the whole call throws, so redo them one by one.
 * That fallback stops at the time budget (the rest come back as errors and the caller then ends the slice),
 * so a string of slow or hung requests cannot run the slice into Google's 6-minute limit.
 */
function fetchBatch_(ctx, urls) {
  var reqs = urls.map(function (u) {
    return { url: u, method: 'get', muteHttpExceptions: true, followRedirects: true };
  });
  try {
    return UrlFetchApp.fetchAll(reqs);
  } catch (e) {
    if (errKind_(e) === 'quota') throw tag_(e, 'QUOTA');
    return urls.map(function (u) {
      if (Date.now() >= ctx.deadline) return { error: 'time budget reached' };
      try {
        return UrlFetchApp.fetch(u, { muteHttpExceptions: true, followRedirects: true });
      } catch (e2) {
        if (errKind_(e2) === 'quota') throw tag_(e2, 'QUOTA');
        return { error: errText_(e2) };
      }
    });
  }
}

/** v: 'ok' | 'retry' (transient: 429, 5xx, HTML error page, network) | 'next' (try the next source). */
function judge_(resp, expectedBytes) {
  if (!resp || resp.error) return { v: 'retry', msg: 'network error' + (resp && resp.error ? ' (' + String(resp.error).slice(0, 80) + ')' : '') };
  var code = resp.getResponseCode();
  if (code === 200) {
    var n = resp.getContent().length;
    if (n === expectedBytes) return { v: 'ok', msg: '' };
    if (/html/i.test(contentType_(resp))) return { v: 'retry', msg: 'got an HTML page instead of the file' };
    return { v: 'next', msg: 'wrong size ' + n + ' (expected ' + expectedBytes + ')' };
  }
  if (code === 429 || code === 408 || code >= 500) return { v: 'retry', msg: 'HTTP ' + code };
  return { v: 'next', msg: 'HTTP ' + code };
}

function contentType_(resp) {
  var h = resp.getHeaders() || {};
  for (var k in h) {
    if (String(k).toLowerCase() === 'content-type') return String(h[k]);
  }
  return '';
}

function fileUrl_(index, src, d, name) {
  var rel = 'public/images/' + d.dir + '/slide_' + pad3_(d.slide) + '/' + encodeURIComponent(name);
  if (src === 'raw') return 'https://raw.githubusercontent.com/' + index.repo + '/' + index.branch + '/' + rel;
  if (src === 'site') return index.siteBase + '/' + rel.replace(/^public\//, '');
  return 'https://cdn.jsdelivr.net/gh/' + index.repo + '@' + index.branch + '/' + rel;
}

// ==================================== THE INDEX =====================================

function indexUrls_() {
  return [
    'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/library-index.json',
    'https://cdn.jsdelivr.net/gh/' + REPO + '@' + BRANCH + '/library-index.json',
  ];
}

/** Fetches and validates library-index.json (GitHub raw first, jsDelivr as fallback). */
function loadIndex_() {
  var urls = indexUrls_();
  var lastErr = '';
  for (var i = 0; i < urls.length; i++) {
    for (var attempt = 1; attempt <= 2; attempt++) {
      var transient = false;
      try {
        var resp = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true, followRedirects: true });
        var code = resp.getResponseCode();
        if (code === 200) {
          var idx = JSON.parse(resp.getContentText());
          var bad = validateIndex_(idx);
          if (!bad) {
            idx = normalizeIndex_(idx);
            idx.fromFallback = i > 0;
            Logger.log('index: ' + idx.designs.length + ' designs from ' + (i > 0 ? 'jsDelivr (a cached copy that can be hours old: pictures already saved are not replaced from it)' : 'GitHub raw'));
            return idx;
          }
          lastErr = urls[i] + ' -> ' + bad;
        } else {
          lastErr = urls[i] + ' -> HTTP ' + code;
          transient = code === 429 || code === 408 || code >= 500;
        }
      } catch (e) {
        if (errKind_(e) === 'quota') throw tag_(e, 'QUOTA');
        lastErr = urls[i] + ' -> ' + errText_(e);
        transient = !(e instanceof SyntaxError);
      }
      if (!transient) break;
      if (attempt < 2) Utilities.sleep(BACKOFF_MS);
    }
  }
  throw new Error('could not load a valid library-index.json: ' + lastErr);
}

/** Returns '' when the index is usable, otherwise why not. */
function validateIndex_(idx) {
  if (!idx || typeof idx !== 'object') return 'not a JSON object';
  if (idx.version !== 1) return 'unsupported version ' + idx.version;
  if (!Array.isArray(idx.designs) || idx.designs.length < 1 || idx.designs.length > 50000) return 'designs list missing or empty';
  if (idx.count !== undefined && idx.count !== idx.designs.length) return 'count ' + idx.count + ' does not match ' + idx.designs.length + ' designs (truncated?)';
  var safe = /^[A-Za-z0-9._-]+$/;
  var seen = {};
  for (var i = 0; i < idx.designs.length; i++) {
    var d = idx.designs[i];
    var at = 'design #' + i;
    if (!d || typeof d !== 'object') return at + ' is not an object';
    if (typeof d.cat !== 'string' || !d.cat) return at + ' has no cat';
    if (typeof d.dir !== 'string' || !safe.test(d.dir) || /^\.+$/.test(d.dir)) return at + ' has a bad dir';
    if (typeof d.slide !== 'number' || d.slide % 1 !== 0 || d.slide < 0) return at + ' has a bad slide';
    if (typeof d.folder !== 'string' || !safe.test(d.folder) || /^\.+$/.test(d.folder)) return at + ' has a bad folder name';
    if (!Array.isArray(d.files)) return at + ' has no files list';
    var names = {};
    for (var j = 0; j < d.files.length; j++) {
      var f = d.files[j];
      if (!f || typeof f.name !== 'string' || !safe.test(f.name) || /^\.+$/.test(f.name)) return at + ' has a bad file name';
      if (typeof f.bytes !== 'number' || f.bytes % 1 !== 0 || f.bytes < 0) return at + ' file ' + f.name + ' has bad bytes';
      if (names[f.name]) return at + ' lists ' + f.name + ' twice';
      names[f.name] = true;
    }
    var k = d.dir + '/' + d.folder.toLowerCase();
    if (seen[k]) return 'two designs share the folder ' + k;
    seen[k] = true;
    if (d.specs !== undefined && (d.specs === null || typeof d.specs !== 'object')) return at + ' has bad specs';
  }
  return '';
}

function normalizeIndex_(idx) {
  // Where pictures are fetched from is decided by the constants at the top of this script, never by the
  // downloaded index: a changed index must not be able to point this script at some other host.
  if ((idx.repo !== undefined && idx.repo !== REPO) || (idx.branch !== undefined && idx.branch !== BRANCH) || (idx.siteBase !== undefined && idx.siteBase !== SITE_BASE)) {
    Logger.log('WARN  index names ' + idx.repo + ' / ' + idx.branch + ' / ' + idx.siteBase + ' but this script uses ' + REPO + ' / ' + BRANCH + ' / ' + SITE_BASE + '; using the script\'s own settings.');
  }
  idx.repo = REPO;
  idx.branch = BRANCH;
  idx.siteBase = SITE_BASE;
  if (!Array.isArray(idx.categories)) idx.categories = [];
  idx.designs.forEach(function (d) {
    if (!d.specs) d.specs = {};
    if (typeof d.style !== 'string') d.style = String(d.style === undefined || d.style === null ? '' : d.style);
  });
  return idx;
}

// =============================== STATE, ROOT, CATALOG ===============================

function findRoot_() {
  var id = ROOT_FOLDER_ID || PropertiesService.getScriptProperties().getProperty('ROOT_ID') || '';
  if (id) return openFolder_(id);
  return firstLive_(DriveApp.getRootFolder().getFoldersByName(ROOT_FOLDER_NAME));
}

function openFolder_(id) {
  var folder;
  try {
    folder = DriveApp.getFolderById(id);
  } catch (e) {
    throw new Error('backup folder ' + id + ' cannot be opened (' + errText_(e) + '). If you removed it on purpose, delete the ROOT_ID script property (Project Settings) and clear ROOT_FOLDER_ID, then run setup() again.');
  }
  if (folder.isTrashed()) throw new Error('backup folder ' + id + ' is in the Drive Trash. Restore it, or delete the ROOT_ID script property and run setup() again to start a fresh copy.');
  return folder;
}

/** The backup root: ROOT_FOLDER_ID, else the saved id, else a folder with the standard name in My Drive (created if asked). */
function resolveRoot_(create) {
  var props = PropertiesService.getScriptProperties();
  var folder = findRoot_();
  if (!folder) {
    if (!create) return null;
    folder = DriveApp.getRootFolder().createFolder(ROOT_FOLDER_NAME);
    Logger.log('Created the backup folder: ' + folder.getUrl());
  }
  if (create && props.getProperty('ROOT_ID') !== folder.getId()) props.setProperty('ROOT_ID', folder.getId());
  return folder;
}

/**
 * Script properties that remember the id of a file in the backup root (the Catalog sheet, the state file) also
 * remember which root it belongs to, so after the root changes (another ROOT_FOLDER_ID) the old root's files
 * are never reused for the new one.
 */
function savedId_(key, rootId) {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty(key + '_ROOT') === rootId ? props.getProperty(key) || '' : '';
}

function saveId_(key, id, rootId) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(key, id);
  props.setProperty(key + '_ROOT', rootId);
}

function emptyState_() {
  return { v: 1, savedAt: '', pass: { id: 0, done: true, failed: {} }, catalogDirty: false, designs: {} };
}

/** Reads _sync-state.json from the root. If it is missing or unreadable the sync converges by inspecting Drive. */
function loadState_(ctx) {
  ctx.stateFile = findStateFile_(ctx);
  if (!ctx.stateFile) {
    Logger.log('state: no ' + STATE_FILE_NAME + ' yet; starting from what is already in Drive.');
    return emptyState_();
  }
  try {
    var st = JSON.parse(ctx.stateFile.getBlob().getDataAsString());
    if (!st || st.v !== 1 || !st.designs || typeof st.designs !== 'object') throw new Error('unexpected format');
    if (!st.pass || typeof st.pass !== 'object') st.pass = { id: 0, done: true, failed: {} };
    if (!st.pass.failed) st.pass.failed = {};
    return st;
  } catch (e) {
    Logger.log('state: ' + STATE_FILE_NAME + ' is unreadable (' + errText_(e) + '); rebuilding it from Drive.');
    return emptyState_();
  }
}

function saveState_(ctx) {
  if (!ctx.dirty) return;
  ctx.state.savedAt = new Date().toISOString();
  var text = JSON.stringify(ctx.state);
  retry_(function () {
    if (!ctx.stateFile) ctx.stateFile = findStateFile_(ctx); // a failed create may have made it
    if (ctx.stateFile) ctx.stateFile.setContent(text);
    else ctx.stateFile = ctx.root.createFile(Utilities.newBlob(text).setContentType('application/json').setName(STATE_FILE_NAME));
  });
  try {
    if (savedId_('STATE_ID', ctx.root.getId()) !== ctx.stateFile.getId()) saveId_('STATE_ID', ctx.stateFile.getId(), ctx.root.getId());
  } catch (e) {
    Logger.log('state: could not remember the state file id: ' + errText_(e)); // harmless: it is found by name next time
  }
  ctx.dirty = false;
  ctx.sinceSave = 0;
}

/** The state file: by the id remembered for this root, else by name (it is never searched for by name once its id is known). */
function findStateFile_(ctx) {
  var id = savedId_('STATE_ID', ctx.root.getId());
  if (id) {
    try {
      var f = DriveApp.getFileById(id);
      if (!f.isTrashed()) return f;
    } catch (e) {
      // gone for good: look by name
    }
  }
  return findFile_(ctx.root, STATE_FILE_NAME);
}

function findFile_(folder, name) {
  return firstLive_(folder.getFilesByName(name));
}

var CATALOG_HEADER = ['Category', 'Style No.', 'Slide', 'Description', 'Technique', 'Content', 'Size', 'Season', 'Country', 'Files', 'Folder link', 'Lifestyle link', 'Image 1 link', 'Back link', 'Image 2 link', 'Website image URL', 'Backed up (ISO date)'];

/** (Re)writes the Catalog sheet in one setValues call. Returns its URL. */
function buildCatalog_(ctx) {
  var idx = ctx.index;
  var st = ctx.state;
  var rows = [CATALOG_HEADER];
  idx.designs.forEach(function (d) {
    rows.push(catalogRow_(idx, st, d));
  });
  var ss = openCatalog_(ctx.root);
  var sh = ss.getSheets()[0];
  sh.clearContents();
  if (sh.getMaxRows() < rows.length) sh.insertRowsAfter(sh.getMaxRows(), rows.length - sh.getMaxRows());
  if (sh.getMaxColumns() < CATALOG_HEADER.length) sh.insertColumnsAfter(sh.getMaxColumns(), CATALOG_HEADER.length - sh.getMaxColumns());
  // Plain text for the text columns before the values go in, so Sheets keeps "007" as 007 and "5/8" as 5/8
  // instead of turning them into a number or a date. Slide and Files stay numbers; the links stay links.
  sh.getRange(1, 1, rows.length, 2).setNumberFormat('@'); // Category, Style No.
  sh.getRange(1, 4, rows.length, 6).setNumberFormat('@'); // Description .. Country
  sh.getRange(1, 17, rows.length, 1).setNumberFormat('@'); // Backed up (ISO date)
  sh.getRange(1, 1, rows.length, CATALOG_HEADER.length).setValues(rows);
  sh.getRange(1, 1, 1, CATALOG_HEADER.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  Logger.log('catalog: wrote ' + (rows.length - 1) + ' rows.');
  return ss.getUrl();
}

function catalogRow_(idx, st, d) {
  var e = st.designs[keyOf_(d)] || null;
  var s = d.specs || {};
  var linkOf = function (re) {
    if (!e) return '';
    for (var i = 0; i < d.files.length; i++) {
      if (re.test(d.files[i].name)) {
        var id = e.files[backupName_(d, d.files[i].name)];
        return id ? 'https://drive.google.com/file/d/' + id + '/view' : '';
      }
    }
    return '';
  };
  var web = '';
  var pick = d.files.filter(function (f) {
    return /^lifestyle\./i.test(f.name);
  })[0] || d.files.filter(function (f) {
    return /^image_01\./i.test(f.name);
  })[0] || d.files.filter(function (f) {
    return !/\.json$/i.test(f.name);
  })[0];
  if (pick) web = fileUrl_(idx, 'site', d, pick.name);
  var done = e && e.sig === designSig_(idx, d);
  return [
    categoryName_(idx, d), cell_(d.style), d.slide, cell_(s.description), cell_(s.technique), cell_(s.content), cell_(s.size), cell_(s.season), cell_(s.country),
    d.files.length,
    e && e.folderId ? 'https://drive.google.com/drive/folders/' + e.folderId : '',
    linkOf(/^lifestyle\./i), linkOf(/^image_01\./i), linkOf(/^back\./i), linkOf(/^image_02\./i),
    web,
    done ? e.at : '',
  ];
}

/** Spreadsheet cell value: text starting with = + - @ would be read as a formula, so it gets a leading space. */
function cell_(v) {
  if (v === undefined || v === null) return '';
  var t = String(v);
  return /^[=+\-@]/.test(t) ? ' ' + t : t;
}

/**
 * The Catalog sheet of this root: the remembered one (if it belongs to this root), else a sheet of that name
 * in the root, else a new one. A new sheet is created in My Drive and then moved into the root; if the move
 * fails it is retried on every later run (CATALOG_MOVE) until it is inside the backup folder.
 */
function openCatalog_(root) {
  var props = PropertiesService.getScriptProperties();
  var rootId = root.getId();
  var id = savedId_('CATALOG_ID', rootId);
  var file = null;
  if (id) {
    try {
      file = DriveApp.getFileById(id);
      if (file.isTrashed()) file = null;
    } catch (e) {
      file = null;
    }
  }
  if (!file) {
    file = firstLive_(root.getFilesByName(CATALOG_NAME), function (c) {
      return c.getMimeType() === MimeType.GOOGLE_SHEETS;
    });
  }
  var ss;
  if (file) {
    ss = SpreadsheetApp.openById(file.getId());
    saveId_('CATALOG_ID', ss.getId(), rootId);
  } else {
    ss = SpreadsheetApp.create(CATALOG_NAME);
    saveId_('CATALOG_ID', ss.getId(), rootId);
    props.setProperty('CATALOG_MOVE', ss.getId());
  }
  if (props.getProperty('CATALOG_MOVE') === ss.getId()) {
    retry_(function () {
      DriveApp.getFileById(ss.getId()).moveTo(root);
    });
    props.deleteProperty('CATALOG_MOVE');
  }
  var sheet = ss.getSheets()[0];
  if (sheet.getName() !== CATALOG_NAME) sheet.setName(CATALOG_NAME);
  return ss;
}

/** Writes README.txt into the backup root once (afterwards it is left alone, so notes added to it stay). */
function ensureReadme_(ctx) {
  var st = ctx.state;
  if (st.readme) return;
  try {
    var existing = findFile_(ctx.root, README_NAME);
    if (existing) {
      st.readme = existing.getId();
    } else {
      var blob = Utilities.newBlob(readmeText_(ctx.index)).setContentType('text/plain').setName(README_NAME);
      var f = retry_(
        function () {
          return ctx.root.createFile(blob);
        },
        function () {
          return findFile_(ctx.root, README_NAME);
        }
      );
      st.readme = f.getId();
    }
    ctx.dirty = true;
  } catch (e) {
    if (e && e.tag === 'QUOTA') throw e;
    Logger.log('README.txt not written (' + errText_(e) + '); will retry next run.');
  }
}

function readmeText_(index) {
  var L = [];
  L.push('CHD DESIGN LIBRARY - BACKUP IN GOOGLE DRIVE');
  L.push('==========================================');
  L.push('Source : github.com/' + index.repo + ' (branch ' + index.branch + '), website ' + index.siteBase);
  L.push('Kept up to date every night by the Apps Script "CHD Library Backup". It only adds and');
  L.push('replaces; it never deletes. Please leave _sync-state.json (its progress file) alone.');
  L.push('');
  L.push('WHAT THIS IS');
  L.push('  Every product design of the Creative Home Decor website library: one folder per');
  L.push('  design with its pictures and its specs (description, technique, content, size,');
  L.push('  season) side by side. It needs no website or GitHub to be used.');
  L.push('');
  L.push('LAYOUT');
  L.push('  <Category>/<Style folder>/<Style folder>_<picture name>   the pictures');
  L.push('  <Category>/<Style folder>/design.json                     the specs + file list of that design');
  L.push('  Catalog        Google Sheet, one row per design, with links to its folder and pictures');
  L.push('  README.txt     this file');
  L.push('');
  L.push('NAMING RULES');
  L.push('  Style folder  = the style number made safe for file names: every run of characters other');
  L.push('                  than letters, digits, . _ - becomes "_" (so "CHD-TR-1018 (A)" is the');
  L.push('                  folder CHD-TR-1018_A).');
  L.push('  Same style published twice: the first keeps the plain name, later ones end in');
  L.push('                  __slide_NNN (for example CHD-RG-1337__slide_072).');
  L.push('  Every picture starts with its folder name (CHD-RG-1120_lifestyle.png), so it stays');
  L.push('                  identifiable after it leaves its folder.');
  L.push('  Pictures      = lifestyle (the product shown in a room or scene), image_01 (front picture),');
  L.push('                  image_02 (close-up), back (back side, a few designs), image_03 / image_04');
  L.push('                  (extra pictures, a few designs). Some folders also hold a <name>_data.json,');
  L.push('                  a spec file that was stored among the pictures; design.json has the specs.');
  L.push('  Some designs have no lifestyle picture; their Lifestyle link in the Catalog is empty.');
  L.push('');
  L.push('USING IT TO UPLOAD DESIGNS SOMEWHERE ELSE (marketplace, another website)');
  L.push('  1. Open the Catalog sheet and find the design by Style No. (filter by Category if needed).');
  L.push('  2. Specs: the Description, Technique, Content, Size, Season and Country columns.');
  L.push('  3. Pictures: the Lifestyle, Image 1, Back and Image 2 links open the picture in Drive;');
  L.push('     "Folder link" opens the whole design folder. Download from there and upload.');
  L.push('  4. "Website image URL" is the live picture on the website, for tools that fetch pictures by link.');
  L.push('  5. Programs: read design.json (one design).');
  L.push('');
  L.push('RESTORING THE WEBSITE FOLDERS (e.g. if GitHub were ever lost)');
  L.push('  Download this folder from Drive (if it arrives as several zip files, unzip them all into');
  L.push('  one and the same folder). You need Node.js 22 (or bun) and two small files of the website');
  L.push('  repo (github.com/' + index.repo + '): scripts/export-library.mjs and scripts/lib/library-index.mjs.');
  L.push('  This backup does not contain them, so keep a copy of both next to it, for example in a');
  L.push('  folder called _restore-tools here (the backup script leaves other folders alone), at the');
  L.push('  same two paths, in case GitHub is not there later. Then, in the website repo or in an');
  L.push('  empty folder that holds just those two files:');
  L.push('    node scripts/export-library.mjs restore --from "<downloaded folder>"          (dry run: shows the plan)');
  L.push('    node scripts/export-library.mjs restore --from "<downloaded folder>" --apply  (writes the files)');
  L.push('  It recreates public/images/<category>/slide_NNN/ (pictures) and');
  L.push('  src/assets/<category>/slide_NNN/data.json (specs), and never overwrites a different');
  L.push('  file unless you add --force. The small card pictures (card.webp) are not part of the');
  L.push('  backup: node scripts/build-card-images.mjs makes them again.');
  L.push('');
  return L.join('\n') + '\n';
}

// ================================= SMALL HELPERS ====================================

function keyOf_(d) {
  return d.dir + '/' + d.slide;
}

function pad3_(n) {
  return n < 10 ? '00' + n : n < 100 ? '0' + n : String(n);
}

function backupName_(d, fileName) {
  return d.folder + '_' + fileName;
}

function categoryName_(index, d) {
  for (var i = 0; i < index.categories.length; i++) {
    if (index.categories[i].id === d.cat && index.categories[i].name) return index.categories[i].name;
  }
  return d.cat;
}

/** What a design should look like in Drive: changes when its folder, files, sizes or specs change. */
function designSig_(index, d) {
  var parts = [SIG_VERSION, d.cat, categoryName_(index, d), d.dir, d.slide, d.folder, d.style, JSON.stringify(d.specs || {})];
  d.files.forEach(function (f) {
    parts.push(f.name + ':' + f.bytes);
  });
  var s = parts.join('|');
  return hash53_(s, 0).toString(16) + hash53_(s, 7).toString(16);
}

/** Small fast non-cryptographic hash (cyrb53); plenty to notice that a design changed. */
function hash53_(str, seed) {
  var h1 = 0xdeadbeef ^ seed;
  var h2 = 0x41c6ce57 ^ seed;
  for (var i = 0; i < str.length; i++) {
    var ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function designBytes_(d) {
  var n = 0;
  d.files.forEach(function (f) {
    n += f.bytes;
  });
  return n;
}

function countFiles_(index) {
  var n = 0;
  index.designs.forEach(function (d) {
    n += d.files.length;
  });
  return n;
}

function totalBytes_(index) {
  var n = 0;
  index.designs.forEach(function (d) {
    n += designBytes_(d);
  });
  return n;
}

function smallestFile_(index) {
  var best = null;
  index.designs.forEach(function (d) {
    d.files.forEach(function (f) {
      if (!best || f.bytes < best.f.bytes) best = { d: d, f: f };
    });
  });
  return best;
}

function mimeFor_(name) {
  var m = /\.([A-Za-z0-9]+)$/.exec(name);
  var ext = m ? m[1].toLowerCase() : '';
  var types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', json: 'application/json', svg: 'image/svg+xml' };
  return types[ext] || 'application/octet-stream';
}

function isoDate_() {
  return new Date().toISOString().slice(0, 10);
}

function fmtBytes_(n) {
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

function errText_(e) {
  var m = e && e.message ? e.message : String(e);
  return String(m).replace(/\s+/g, ' ').slice(0, 300);
}

function tag_(e, tag) {
  var t = new Error(errText_(e));
  t.tag = tag;
  return t;
}

/** 'quota' (daily limit: stop for today), 'rate' / 'transient' (back off and retry), 'other'. */
function errKind_(e) {
  if (e && e.tag === 'QUOTA') return 'quota';
  var m = errText_(e);
  if (/too many times in a short time|rate limit|try utilities\.sleep/i.test(m)) return 'rate';
  if (/for one day|per day|daily|quota|limit exceeded|too much computer time/i.test(m)) return 'quota';
  // "Unexpected error while getting the method or property X on object DriveApp..." is what Drive says for an ordinary
  // backend hiccup as well as for a bad id; a bad id never reaches retry_ (openFolder_ and the catalog lookup catch it themselves).
  if (/service error|internal error|server error|backend|temporar|try again|unavailable|timed? ?out|timeout|network|unexpected error while getting the method or property/i.test(m)) return 'transient';
  return 'other';
}

/**
 * Runs a Drive call with back-off on short-term rate limits and transient service errors.
 * A daily-quota error is re-thrown tagged 'QUOTA'. `recover` (optional) may return an
 * already-created result after a failed attempt so a create is never repeated.
 */
function retry_(fn, recover) {
  for (var attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (e) {
      var kind = errKind_(e);
      if (kind === 'quota') throw tag_(e, 'QUOTA');
      if (kind === 'other' || attempt >= DRIVE_RETRIES) throw e;
      Utilities.sleep(1000 * Math.pow(2, attempt + 1));
      if (recover) {
        var found = null;
        var looked = false;
        for (var r = 0; r < 3 && !looked; r++) {
          try {
            found = recover();
            looked = true;
          } catch (e2) {
            if (errKind_(e2) === 'quota') throw tag_(e2, 'QUOTA');
            if (errKind_(e2) === 'other') break;
            Utilities.sleep(1000 * (r + 1));
          }
        }
        if (!looked) throw e; // cannot tell whether the failed call went through: better to fail this design than to risk a duplicate
        if (found) return found;
      }
    }
  }
}

/** Throws when the time budget is used up. hard=true only after the hard stop (used while writing a design that is already downloaded). */
function checkTime_(ctx, hard) {
  if (Date.now() >= (hard ? ctx.hardStop : ctx.deadline)) throw tag_(new Error('time budget reached'), 'TIMEUP');
}

function deleteTriggers_(handlers) {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return n;
}

function installDailyTrigger_() {
  var have = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'syncDaily';
  });
  if (have.length) {
    Logger.log('Nightly trigger already installed.');
    for (var i = 1; i < have.length; i++) ScriptApp.deleteTrigger(have[i]);
    return;
  }
  ScriptApp.newTrigger('syncDaily').timeBased().everyDays(1).atHour(DAILY_HOUR).create();
  Logger.log('Nightly trigger installed (about ' + DAILY_HOUR + ' AM, script time zone).');
}

function ownerEmail_() {
  try {
    var e = Session.getEffectiveUser().getEmail();
    if (e) return e;
  } catch (err) {
    // fall through
  }
  try {
    var o = DriveApp.getRootFolder().getOwner();
    if (o && o.getEmail()) return o.getEmail();
  } catch (err2) {
    // fall through
  }
  return '';
}

function sendMail_(subject, body) {
  try {
    var to = ownerEmail_();
    if (!to) {
      Logger.log('mail: no recipient address available; skipped "' + subject + '".');
      return false;
    }
    MailApp.sendEmail(to, subject, body);
    Logger.log('mail: sent "' + subject + '" to ' + to);
    return true;
  } catch (e) {
    Logger.log('mail: could not send "' + subject + '": ' + errText_(e));
    return false;
  }
}
