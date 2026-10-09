#!/usr/bin/env node
// Simulator for scripts/chd-library-backup.gs.
//
// Loads the REAL .gs file into a node:vm sandbox that contains only hand-written
// in-memory mocks of the Google services (DriveApp, UrlFetchApp, SpreadsheetApp,
// ScriptApp, LockService, PropertiesService, MailApp, Session, Utilities, Logger)
// and NO Node globals (no require / process / Buffer / fetch / URL / setTimeout), so
// anything Apps Script would not have fails here too. The "internet" serves the real
// pictures from this checkout (GitHub raw, live site and jsDelivr URLs are mapped to
// local files) with switches to inject 429 / 500 / HTML pages / wrong sizes / quota
// errors. The mock Drive keeps only name, size, mime and a sha1 per file (never the
// bytes, except small .json files) so the 2 GB library does not fill memory. A fake
// clock advances with every fetch, Drive write and sleep so 6-minute slices, the
// continuation trigger and multi-run resumption behave like the real thing.
//
//   node scripts/tests/gas-sim.mjs            full run on the real index (all 1,382 designs)
//   node scripts/tests/gas-sim.mjs --quick    first ~40 designs (+ a few special ones)
//   --only=<text>   run only tests whose name contains <text>     --verbose   print script logs
//   --trashed-visible   mock Drive iterators also return trashed items (worst case; the script must ignore them)
//   --seeds=<n>     number of random scenarios in the chaos test F36 (default 6 quick, 24 full)
//   --gs=<file>     test another copy of the script (used to check that this simulator catches broken variants)
//
// The D tests cover the daily trigger (one, at 3 PM India time, corrected by setup() or by a daily run) and the "new
// designs" summary email (state fields initialDone / news; also sent by a run that could not finish everything, with
// the stuck design named; a run with a stuck design counts as failed for the "failing" email); D11 runs the same
// stories on deliberately broken copies of the script to prove those tests can fail.
//
// What the mocks can be made to do (beyond plain success): HTTP 429/500/HTML/wrong-size answers and slow or
// hung requests, Drive and Sheets errors of every kind, Drive search lag, a hard kill of a run at the 6-minute
// line (state is rolled back to that instant), stopAll() fired from inside a running slice, a manifest with
// missing OAuth scopes (every Google service refuses calls without its scope, like the real runtime), and Sheets
// reading "007" as a number and "5/8" as a date unless the column is plain text.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { backupFileName, pad3 } from '../lib/library-index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '../..');
const ARGS = process.argv.slice(2);
const GS_FILE = path.resolve((ARGS.find((a) => a.startsWith('--gs=')) || '').slice(5) || path.join(REPO_ROOT, 'scripts/chd-library-backup.gs'));
const MANIFEST_FILE = path.join(REPO_ROOT, 'scripts/chd-library-backup.appsscript.json');
const INDEX_FILE = path.join(REPO_ROOT, 'library-index.json');
const QUICK = ARGS.includes('--quick');
const VERBOSE = ARGS.includes('--verbose');
const TRASHED_VISIBLE = ARGS.includes('--trashed-visible'); // worst case: Drive iterators also return trashed items
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').slice(7);
const SEEDS = Number((ARGS.find((a) => a.startsWith('--seeds=')) || '').slice(8)) || (QUICK ? 6 : 24); // random scenarios of the chaos test

const GS_SRC = fs.readFileSync(GS_FILE, 'utf8');
const FULL_INDEX = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
const EMAIL = 'vikram@creativehomedecorllp.com';
const ROOT_NAME = 'CHD Design Library (Backup)';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const MB = 1048576;

// ------------------------------------------------------------------ helpers
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const clone = (o) => JSON.parse(JSON.stringify(o));
const relOf = (d, name) => `public/images/${d.dir}/slide_${pad3(d.slide)}/${name}`;

class Clock {
  constructor() {
    this.t = Date.UTC(2026, 9, 9, 21, 0, 0); // 02:30 IST
  }
  now() {
    return this.t;
  }
  advance(ms) {
    this.t += Math.max(0, ms);
    if (this.onAdvance) this.onAdvance(this.t);
  }
}

class GBlob {
  constructor(bytes, contentType = 'application/octet-stream', name = '') {
    this.bytes = bytes;
    this.contentType = contentType;
    this.name = name;
  }
  getBytes() {
    return this.bytes;
  }
  getName() {
    return this.name;
  }
  getContentType() {
    return this.contentType;
  }
  setName(n) {
    this.name = n;
    return this;
  }
  setContentType(c) {
    this.contentType = c;
    return this;
  }
  getDataAsString() {
    return Buffer.from(this.bytes).toString('utf8');
  }
}

class Iter {
  constructor(items) {
    this.items = items;
    this.i = 0;
  }
  hasNext() {
    return this.i < this.items.length;
  }
  next() {
    if (!this.hasNext()) throw new Error('Exception: Cannot retrieve the next object: iterator has reached the end.');
    return this.items[this.i++];
  }
}

// ------------------------------------------------------------------ the mock internet
const SITE = FULL_INDEX.siteBase;
function parseUrl(url) {
  let m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([^/]+)\/(.+)$/.exec(url);
  if (m) return { src: 'raw', repo: m[1], branch: m[2], rel: decodeURIComponent(m[3]) };
  m = /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/@]+\/[^/@]+)@([^/]+)\/(.+)$/.exec(url);
  if (m) return { src: 'cdn', repo: m[1], branch: m[2], rel: decodeURIComponent(m[3]) };
  if (url.startsWith(SITE + '/')) return { src: 'site', repo: '', branch: '', rel: 'public/' + decodeURIComponent(url.slice(SITE.length + 1)) };
  return null;
}

class World {
  constructor(clock, index) {
    this.clock = clock;
    this.index = index; // what library-index.json currently says
    this.overrides = new Map(); // rel path -> Buffer (files changed/added "in the repo")
    this.rules = []; // failure injections
    this.log = []; // {url, src, kind, status}
    this.maxBatch = 0;
    this.unmuted = 0;
    this.perUrl = new Map();
    this.sha1Cache = new Map();
    this.indexBySrc = {}; // src -> index object served instead of `index` (a stale jsDelivr copy)
    this.onFetchAll = null; // called with the 1-based number of the fetchAll call, before it is served
    this.fetchAllCalls = 0;
  }
  fileBytes(rel) {
    if (this.overrides.has(rel)) return this.overrides.get(rel);
    if (!rel.startsWith('public/images/')) return null;
    try {
      return fs.readFileSync(path.join(REPO_ROOT, rel));
    } catch {
      return null;
    }
  }
  fileSha1(rel) {
    if (this.overrides.has(rel)) return sha1(this.overrides.get(rel));
    if (!this.sha1Cache.has(rel)) this.sha1Cache.set(rel, sha1(fs.readFileSync(path.join(REPO_ROOT, rel))));
    return this.sha1Cache.get(rel);
  }
  /** rule: {src, kind:'file'|'index'|undefined, match(rel), mode, times, skip, perUrl} */
  inject(rule) {
    const r = { times: Infinity, skip: 0, ...rule, hits: 0 };
    this.rules.push(r);
    return r;
  }
  clearRules() {
    this.rules = [];
  }
  count(filter = () => true) {
    return this.log.filter(filter).length;
  }
  files() {
    return this.log.filter((l) => l.kind === 'file');
  }
  serve(url, params) {
    const info = parseUrl(url);
    if (!info) return { status: 404, body: Buffer.from('not found'), ct: 'text/plain' };
    const kind = info.rel === 'library-index.json' ? 'index' : 'file';
    let rule = null;
    for (const r of this.rules) {
      if (r.src && r.src !== info.src) continue;
      if (r.kind && r.kind !== kind) continue;
      if (r.match && !r.match(info.rel)) continue;
      if (r.perUrl) {
        const k = r.mode + '|' + url;
        const n = this.perUrl.get(k) || 0;
        if (n >= r.perUrl) continue;
        this.perUrl.set(k, n + 1);
      } else {
        if (r.skip > 0) {
          r.skip--;
          continue;
        }
        if (r.times <= 0) continue;
        r.times--;
      }
      r.hits++;
      rule = r;
      break;
    }
    const entry = { url, src: info.src, kind, rel: info.rel, status: 200, bytes: 0 };
    this.log.push(entry);
    const real = () => {
      if (kind === 'index') {
        const b = Buffer.from(JSON.stringify(this.indexBySrc[info.src] || this.index));
        return { status: 200, body: b, ct: 'text/plain; charset=utf-8' };
      }
      const b = this.fileBytes(info.rel);
      if (!b) return { status: 404, body: Buffer.from('404: Not Found'), ct: 'text/plain; charset=utf-8' };
      return { status: 200, body: b, ct: info.rel.endsWith('.json') ? 'text/plain; charset=utf-8' : 'image/png' };
    };
    let out;
    if (!rule) out = real();
    else if (rule.mode === 'slow') out = real();
    else if (rule.mode === 'throw') {
      entry.status = 'throw';
      throw new Error('Exception: DNS error: ' + url);
    } else if (rule.mode === 'quota') {
      entry.status = 'quota';
      throw new Error('Exception: Service invoked too many times for one day: urlfetch.');
    } else if (/^\d{3}$/.test(rule.mode)) out = { status: Number(rule.mode), body: Buffer.from('error ' + rule.mode), ct: 'text/plain' };
    else if (rule.mode === 'html') out = { status: 200, body: Buffer.from('<html><body>Please wait... blocked</body></html>'), ct: 'text/html; charset=utf-8' };
    else if (rule.mode === 'truncate') {
      const r = real();
      out = { ...r, body: r.body.subarray(0, Math.max(0, r.body.length - 1)) };
    } else if (rule.mode === 'pad') {
      const r = real();
      out = { ...r, body: Buffer.concat([r.body, Buffer.from('X')]) };
    } else if (rule.mode === 'badindex') out = { status: 200, body: Buffer.from(JSON.stringify({ ...this.index, version: 2 })), ct: 'text/plain' };
    else if (rule.mode === 'emptyindex') out = { status: 200, body: Buffer.from(JSON.stringify({ ...this.index, designs: [], count: 0 })), ct: 'text/plain' };
    else if (rule.mode === 'garbage') out = { status: 200, body: Buffer.from('<!DOCTYPE html><html>nope</html>'), ct: 'text/html' };
    else throw new Error('unknown rule mode ' + rule.mode);
    if (rule && rule.delay) out.delay = rule.delay; // extra fake milliseconds this request takes
    entry.status = out.status;
    entry.bytes = out.body.length;
    if (out.status >= 400 && !(params && params.muteHttpExceptions)) {
      this.unmuted++;
      throw new Error(`Exception: Request failed for ${url} returned code ${out.status}.`);
    }
    return out;
  }
}

class Resp {
  constructor(out) {
    this.out = out;
  }
  getResponseCode() {
    return this.out.status;
  }
  getContent() {
    return this.out.body;
  }
  getContentText() {
    return this.out.body.toString('utf8');
  }
  getHeaders() {
    return { 'Content-Type': this.out.ct, 'content-length': String(this.out.body.length) };
  }
  getBlob() {
    return new GBlob(this.out.body, this.out.ct);
  }
}

function makeUrlFetchApp(world, clock) {
  const cost = (out) => 250 + (out ? (out.body.length / MB) * 150 + (out.delay || 0) : 0);
  return {
    fetch(url, params) {
      const out = world.serve(url, params);
      clock.advance(cost(out));
      return new Resp(out);
    },
    fetchAll(requests) {
      if (!Array.isArray(requests) && !(requests && typeof requests.length === 'number')) throw new Error('fetchAll needs an array');
      world.maxBatch = Math.max(world.maxBatch, requests.length);
      if (world.onFetchAll) world.onFetchAll(++world.fetchAllCalls);
      const outs = [];
      let worst = 0;
      for (const r of requests) {
        const req = typeof r === 'string' ? { url: r } : r;
        const out = world.serve(req.url, req); // a throwing request makes the whole call throw, like Apps Script
        outs.push(new Resp(out));
        worst = Math.max(worst, cost(out));
      }
      clock.advance(worst + 50);
      return outs;
    },
  };
}

// ------------------------------------------------------------------ the mock Drive
class MockDrive {
  constructor(clock) {
    this.clock = clock;
    this.nodes = new Map();
    this.seq = 0;
    this.reads = 0;
    this.writes = 0;
    this.writeLog = [];
    this.faults = [];
    this.stateSnaps = []; // designs-with-signature in each saved copy of _sync-state.json
    this.speed = 1;
    this.storageLimit = 15 * 1024 * MB;
    this.ownerFails = false;
    this.searchLagMs = 0; // items younger than this are invisible to by-name searches (not to by-id lookups or listings)
    this.hideFromSearch = new Set(); // names that by-name searches never return (an index that is far behind)
    this.root = this._mk('folder', 'My Drive', null);
  }
  _mk(kind, name, parent, extra = {}) {
    const id = 'id' + (++this.seq).toString(36).padStart(7, '0') + 'Z';
    const n = { id, kind, name, parent, trashed: false, createdAt: this.clock.now(), size: 0, sha1: '', mime: kind === 'folder' ? 'application/vnd.google-apps.folder' : 'application/octet-stream', text: null, ...extra };
    this.nodes.set(id, n);
    return n;
  }
  cost(ms) {
    this.clock.advance(ms * this.speed);
  }
  read(ms = 120) {
    this.reads++;
    this.cost(ms);
  }
  logWrite(op, n, extra = {}) {
    if (this.onWrite) this.onWrite(op, n);
    this.writes++;
    if (n.name === '_sync-state.json' && n.text) this.stateSnaps.push(Object.values(JSON.parse(n.text.toString('utf8')).designs).filter((e) => e.sig).length);
    this.writeLog.push({ op, id: n.id, name: n.name, parent: n.parent, size: n.size, ...extra });
  }
  inject(fault) {
    const f = { times: Infinity, skip: 0, after: false, error: 'Exception: Service error: Drive', ...fault };
    this.faults.push(f);
    return f;
  }
  guard(op, name, action) {
    const f = this.faults.find((x) => x.op === op && x.times > 0 && (!x.match || x.match(name)));
    if (!f) return action();
    if (f.skip > 0) {
      f.skip--;
      return action();
    }
    f.times--;
    if (f.after) action();
    throw new Error(f.error);
  }
  children(parentId, kind) {
    const out = [];
    for (const n of this.nodes.values()) if (n.parent === parentId && (TRASHED_VISIBLE || !n.trashed) && (!kind || n.kind === kind || (kind === 'file' && n.kind === 'sheet'))) out.push(n);
    return out;
  }
  searchable(n) {
    return !this.hideFromSearch.has(n.name) && this.clock.now() - n.createdAt >= this.searchLagMs;
  }
  /** What is really in a folder (never trashed items), for the verification code. */
  liveChildren(parentId, kind) {
    return this.children(parentId, kind).filter((n) => !n.trashed);
  }
  fileObj(n) {
    return new MockFile(this, n);
  }
  folderObj(n) {
    return new MockFolder(this, n);
  }
  api() {
    const d = this;
    return {
      getRootFolder: () => {
        d.read(80);
        return d.folderObj(d.root);
      },
      getFolderById(id) {
        d.read();
        const n = d.nodes.get(id);
        if (!n || n.kind !== 'folder') throw new Error('Exception: Unexpected error while getting the method or property getFolderById on object DriveApp.');
        return d.folderObj(n);
      },
      getFileById(id) {
        d.read();
        const n = d.nodes.get(id);
        if (!n || n.kind === 'folder') throw new Error('Exception: Unexpected error while getting the method or property getFileById on object DriveApp.');
        return d.fileObj(n);
      },
      getStorageUsed() {
        d.read(80);
        let s = 0;
        for (const n of d.nodes.values()) s += n.size;
        return s;
      },
      getStorageLimit() {
        d.read(80);
        return d.storageLimit;
      },
    };
  }
}

class MockFile {
  constructor(drive, n) {
    this.d = drive;
    this.n = n;
  }
  getId() {
    return this.n.id;
  }
  getName() {
    return this.n.name;
  }
  getSize() {
    return this.n.size;
  }
  getUrl() {
    return 'https://drive.google.com/file/d/' + this.n.id + '/view';
  }
  getMimeType() {
    return this.n.mime;
  }
  isTrashed() {
    return this.n.trashed;
  }
  setTrashed(v) {
    this.d.guard('setTrashed', this.n.name, () => {
      this.d.cost(250);
      this.n.trashed = !!v;
      this.d.logWrite('setTrashed', this.n);
    });
    return this;
  }
  getBlob() {
    this.d.read(150);
    if (this.n.text === null) throw new Error('mock: bytes of ' + this.n.name + ' are not retained by the mock Drive (only small .json files are)');
    return new GBlob(this.n.text, this.n.mime, this.n.name);
  }
  setContent(s) {
    this.d.guard('setContent', this.n.name, () => {
      const buf = Buffer.from(String(s), 'utf8');
      this.d.cost(300 + (buf.length / MB) * 700);
      this.n.size = buf.length;
      this.n.sha1 = sha1(buf);
      this.n.text = buf;
      this.d.logWrite('setContent', this.n);
    });
    return this;
  }
  moveTo(folder) {
    this.d.guard('moveTo', this.n.name, () => {
      this.d.cost(300);
      this.n.parent = folder.getId();
      this.d.logWrite('moveTo', this.n);
    });
    return this;
  }
}

class MockFolder {
  constructor(drive, n) {
    this.d = drive;
    this.n = n;
  }
  getId() {
    return this.n.id;
  }
  getName() {
    return this.n.name;
  }
  getUrl() {
    return 'https://drive.google.com/drive/folders/' + this.n.id;
  }
  isTrashed() {
    return this.n.trashed;
  }
  getOwner() {
    if (this.d.ownerFails) throw new Error('Exception: no owner');
    return { getEmail: () => EMAIL };
  }
  getFoldersByName(name) {
    return this.d.guard('getFoldersByName', name, () => {
      this.d.read();
      return new Iter(this.d.children(this.n.id, 'folder').filter((c) => c.name === name && this.d.searchable(c)).map((c) => this.d.folderObj(c)));
    });
  }
  getFiles() {
    return this.d.guard('getFiles', this.n.name, () => {
      this.d.read(150);
      return new Iter(this.d.children(this.n.id, 'file').map((c) => this.d.fileObj(c)));
    });
  }
  getFilesByName(name) {
    return this.d.guard('getFilesByName', name, () => {
      this.d.read();
      return new Iter(this.d.children(this.n.id, 'file').filter((c) => c.name === name && this.d.searchable(c)).map((c) => this.d.fileObj(c)));
    });
  }
  createFolder(name) {
    return this.d.guard('createFolder', name, () => {
      this.d.cost(400);
      const n = this.d._mk('folder', name, this.n.id);
      this.d.logWrite('createFolder', n);
      return this.d.folderObj(n);
    });
  }
  createFile(blobOrName, content, mime) {
    let name;
    let bytes;
    let type;
    if (blobOrName && typeof blobOrName.getBytes === 'function') {
      name = blobOrName.getName();
      bytes = blobOrName.getBytes();
      type = blobOrName.getContentType();
    } else {
      name = blobOrName;
      bytes = Buffer.from(String(content), 'utf8');
      type = mime || 'text/plain';
    }
    if (!name) throw new Error('Exception: Blob has no name');
    return this.d.guard('createFile', name, () => {
      this.d.cost(600 + (bytes.length / MB) * 700);
      const keep = bytes.length <= 2 * MB && /\.(json|txt)$/i.test(name); // only small text files keep their bytes
      const n = this.d._mk('file', name, this.n.id, { size: bytes.length, sha1: sha1(bytes), mime: type, text: keep ? Buffer.from(bytes) : null });
      this.d.logWrite('createFile', n);
      return this.d.fileObj(n);
    });
  }
}

function makeSpreadsheetApp(drive) {
  const wrapSheet = (n, s) => ({
    getName: () => s.name,
    setName(v) {
      s.name = v;
      return this;
    },
    clearContents() {
      drive.cost(300);
      s.rows = [];
      s.clears++;
      drive.logWrite('sheet.clear', n);
      return this;
    },
    getMaxRows: () => s.maxRows,
    getMaxColumns: () => s.maxCols,
    insertRowsAfter(pos, k) {
      s.maxRows += k;
      drive.logWrite('sheet.insertRows', n);
    },
    insertColumnsAfter(pos, k) {
      s.maxCols += k;
      drive.logWrite('sheet.insertCols', n);
    },
    setFrozenRows(k) {
      s.frozen = k;
      drive.logWrite('sheet.freeze', n);
      return this;
    },
    getFrozenRows: () => s.frozen,
    getRange(r, c, nr, nc) {
      return {
        setNumberFormat(fmt) {
          if (r + nr - 1 > s.maxRows || c + nc - 1 > s.maxCols) throw new Error('Exception: The coordinates of the range are outside the dimensions of the sheet.');
          for (let j = 0; j < nc; j++) s.fmt[c + j] = fmt;
          drive.logWrite('sheet.format', n);
          return this;
        },
        setValues(values) {
          if (values.length !== nr || values.some((row) => row.length !== nc)) throw new Error('Exception: The number of rows/columns in the data does not match the number in the range.');
          for (const row of values)
            for (const v of row) {
              const t = typeof v;
              if (!(t === 'string' || t === 'number' || t === 'boolean')) throw new Error('Exception: Cannot convert ' + t + ' to a cell value');
            }
          if (r + nr - 1 > s.maxRows || c + nc - 1 > s.maxCols) throw new Error('Exception: The coordinates of the range are outside the dimensions of the sheet.');
          drive.cost(1500 + nr * 4);
          // Sheets reads a string as if it had been typed into the cell, unless the column is plain text ("@")
          const typed = (v, col) => {
            if (typeof v !== 'string' || s.fmt[col] === '@') return v;
            const t = v.trim();
            if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return Number(t);
            if (/^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/.test(t) || /^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(Date.UTC(2000, 0, 1)); // a date serial in real Sheets
            if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
            if (v.startsWith('=')) s.formulas++;
            return v;
          };
          for (let i = 0; i < nr; i++) s.rows[r - 1 + i] = values[i].map((v, j) => typed(v, c + j));
          s.setValuesCalls.push({ r, c, nr, nc });
          drive.logWrite('sheet.setValues', n, { rows: nr });
          return this;
        },
        setFontWeight(w) {
          s.bold = { r, c, nr, nc, w };
          drive.logWrite('sheet.bold', n);
          return this;
        },
      };
    },
  });
  const wrapSS = (n) => ({
    getId: () => n.id,
    getName: () => n.name,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + n.id + '/edit',
    getSheets: () => n.sheets.map((s) => wrapSheet(n, s)),
  });
  return {
    create(name) {
      return drive.guard('createSpreadsheet', name, () => {
        drive.cost(900);
        const n = drive._mk('file', name, drive.root.id, { mime: SHEET_MIME });
        n.sheets = [{ name: 'Sheet1', rows: [], maxRows: 1000, maxCols: 26, frozen: 0, clears: 0, formulas: 0, setValuesCalls: [], bold: null, fmt: {} }];
        drive.logWrite('createSpreadsheet', n);
        return wrapSS(n);
      });
    },
    openById(id) {
      return drive.guard('openSpreadsheet', id, () => {
        drive.read();
        const n = drive.nodes.get(id);
        if (!n || !n.sheets) throw new Error('Exception: Unexpected error while getting the method or property openById on object SpreadsheetApp.');
        return wrapSS(n);
      });
    },
  };
}

// ------------------------------------------------------------------ the sandbox
class Sim {
  constructor(index, opts = {}) {
    this.clock = new Clock();
    this.world = new World(this.clock, clone(index));
    this.drive = new MockDrive(this.clock);
    this.props = new Map();
    this.triggers = [];
    this.tseq = 0;
    this.logs = [];
    this.mails = [];
    this.runs = [];
    this.lockBusy = false;
    this.lockHeld = false;
    this.mailFails = false;
    this.effectiveEmailFails = false;
    this.triggerFault = null; // { handler, times }: creating a trigger for that handler throws that many times
    this.sleeps = [];
    this.build(opts);
  }

  build(opts) {
    const sim = this;
    const clock = this.clock;
    const driveApi = this.drive.api();
    const props = {
      getProperty: (k) => (sim.props.has(k) ? sim.props.get(k) : null),
      setProperty(k, v) {
        v = String(v);
        if (v.length > 9000) throw new Error('Exception: Property value too large (' + v.length + ' > 9KB)');
        sim.props.set(k, v);
        let tot = 0;
        for (const [a, b] of sim.props) tot += a.length + b.length;
        if (tot > 500000) throw new Error('Exception: total properties too large');
        return this;
      },
      deleteProperty(k) {
        sim.props.delete(k);
        return this;
      },
      getProperties: () => Object.fromEntries(sim.props),
      getKeys: () => [...sim.props.keys()],
    };
    const Utilities = {
      sleep(ms) {
        sim.sleeps.push(ms);
        clock.advance(ms);
      },
      newBlob(data, ct, name) {
        const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
        return new GBlob(bytes, ct || (typeof data === 'string' ? 'text/plain' : 'application/octet-stream'), name || '');
      },
      base64Encode: (b) => Buffer.from(b).toString('base64'),
      base64Decode: (s) => [...Buffer.from(s, 'base64')],
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { MD5: 'md5', SHA_1: 'sha1', SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, v) => [...crypto.createHash(alg).update(typeof v === 'string' ? Buffer.from(v) : Buffer.from(v)).digest()].map((x) => (x > 127 ? x - 256 : x)),
    };
    const ScriptApp = {
      getProjectTriggers: () => sim.triggers.filter((t) => !t.deleted).map((t) => t.api),
      deleteTrigger(api) {
        const t = sim.triggers.find((x) => x.api === api);
        if (!t || t.deleted) throw new Error('Exception: Trigger not found');
        t.deleted = true;
      },
      newTrigger(handler) {
        if (typeof sim.ctx[handler] !== 'function') throw new Error('Exception: Script function not found: ' + handler);
        return {
          timeBased() {
            const spec = { handler, kind: null, delay: 0, hour: null, createdAt: clock.now(), fired: false, deleted: false };
            const b = {
              after(ms) {
                if (typeof ms !== 'number' || ms < 1000) throw new Error('Exception: bad delay');
                spec.kind = 'after';
                spec.delay = ms;
                return b;
              },
              everyDays() {
                spec.kind = 'daily';
                return b;
              },
              atHour(h) {
                spec.hour = h;
                return b;
              },
              nearMinute: () => b,
              inTimezone: () => b,
              create() {
                if (!spec.kind) throw new Error('Exception: trigger needs a schedule');
                if (sim.triggerFault && sim.triggerFault.handler === handler && sim.triggerFault.times > 0) {
                  sim.triggerFault.times--;
                  throw new Error('Exception: Service invoked too many times in a short time: create trigger. Try waiting a few minutes before trying again.');
                }
                if (sim.triggers.filter((t) => !t.deleted).length >= 20) throw new Error('Exception: This script has too many triggers. Triggers must be deleted from the script before more can be added.');
                spec.id = 'trg' + ++sim.tseq;
                spec.api = {
                  getHandlerFunction: () => spec.handler,
                  getUniqueId: () => spec.id,
                  getEventType: () => 'CLOCK',
                  getTriggerSource: () => 'CLOCK',
                };
                sim.triggers.push(spec);
                return spec.api;
              },
            };
            return b;
          },
        };
      },
    };
    const LockService = {
      getScriptLock: () => ({
        tryLock(ms) {
          if (sim.lockBusy || sim.lockHeld) {
            clock.advance(Math.min(ms, 5000));
            return false;
          }
          sim.lockHeld = true;
          return true;
        },
        releaseLock() {
          sim.lockHeld = false;
        },
        hasLock: () => sim.lockHeld,
      }),
    };
    const MailApp = {
      sendEmail(...a) {
        if (sim.mailFails) throw new Error('Exception: Service invoked too many times for one day: email.');
        const m = typeof a[0] === 'object' ? a[0] : { to: a[0], subject: a[1], body: a[2] };
        sim.mails.push({ ...m, at: clock.now() });
      },
      getRemainingDailyQuota: () => 100 - sim.mails.length,
    };
    const Session = {
      getEffectiveUser: () => ({
        getEmail() {
          if (sim.effectiveEmailFails) throw new Error('Exception: Authorization is required to perform that action.');
          return EMAIL;
        },
      }),
      getActiveUser: () => ({ getEmail: () => '' }),
    };
    // Like the real runtime, a service refuses every call when the manifest does not list its OAuth scope.
    const granted = new Set(opts.scopes || JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).oauthScopes);
    const scoped = (service, scope, obj) =>
      new Proxy(obj, {
        get(target, prop) {
          const v = target[prop];
          if (typeof v !== 'function') return v;
          return (...a) => {
            if (!granted.has(scope)) throw new Error(`Exception: You do not have permission to call ${service}.${String(prop)}. Required permissions: ${scope}`);
            return v.apply(target, a);
          };
        },
      });
    const sandbox = {
      Logger: { log: (m) => sim.logs.push(String(m)) },
      DriveApp: scoped('DriveApp', 'https://www.googleapis.com/auth/drive', driveApi),
      UrlFetchApp: scoped('UrlFetchApp', 'https://www.googleapis.com/auth/script.external_request', makeUrlFetchApp(this.world, clock)),
      SpreadsheetApp: scoped('SpreadsheetApp', 'https://www.googleapis.com/auth/spreadsheets', makeSpreadsheetApp(this.drive)),
      ScriptApp: scoped('ScriptApp', 'https://www.googleapis.com/auth/script.scriptapp', ScriptApp),
      LockService,
      PropertiesService: { getScriptProperties: () => props },
      MailApp: scoped('MailApp', 'https://www.googleapis.com/auth/script.send_mail', MailApp),
      Session: scoped('Session', 'https://www.googleapis.com/auth/userinfo.email', Session),
      Utilities,
      MimeType: { GOOGLE_SHEETS: SHEET_MIME, PNG: 'image/png', JPEG: 'image/jpeg', PLAIN_TEXT: 'text/plain' },
      console: { log: (m) => sim.logs.push(String(m)) },
      __now: () => clock.now(),
    };
    this.ctx = vm.createContext(sandbox);
    vm.runInContext(
      'globalThis.Date = class extends Date { constructor(...a) { if (a.length === 0) super(__now()); else super(...a); } static now() { return __now(); } };',
      this.ctx
    );
    vm.runInContext(opts.src || GS_SRC, this.ctx, { filename: 'chd-library-backup.gs' });
    for (const [k, v] of Object.entries(opts.vars || {})) vm.runInContext(`${k} = ${JSON.stringify(v)};`, this.ctx);
  }

  setVar(name, value) {
    vm.runInContext(`${name} = ${JSON.stringify(value)};`, this.ctx);
  }
  getVar(name) {
    return vm.runInContext(name, this.ctx);
  }

  /**
   * Runs an entry point like Apps Script would; records the fake time it took.
   * killAfterS: Google kills the run that many seconds after it started. A script cannot catch a kill, so the
   * run is simply let finish here and then everything it did after that instant is rolled back (Drive, script
   * properties, triggers, mail, lock), which is exactly what a real kill leaves behind.
   */
  exec(fn, { killAfterS = 0 } = {}) {
    const t0 = this.clock.now();
    let error = null;
    let value;
    let snap = null;
    if (killAfterS) {
      this.clock.onAdvance = (t) => {
        if (!snap && t >= t0 + killAfterS * 1000) snap = this.snapshot();
      };
    }
    try {
      value = vm.runInContext(fn + '()', this.ctx);
    } catch (e) {
      error = e;
    }
    this.clock.onAdvance = null;
    if (snap) {
      this.restore(snap);
      this.clock.t = t0 + killAfterS * 1000;
      this.runs.push({ fn, secs: killAfterS, error: null, killed: true });
      return { value: undefined, error: null, killed: true };
    }
    this.runs.push({ fn, secs: (this.clock.now() - t0) / 1000, error: error ? String(error.message || error) : null });
    return { value, error };
  }

  snapshot() {
    return {
      nodes: new Map([...this.drive.nodes].map(([k, n]) => [k, { ...n, sheets: n.sheets ? clone(n.sheets) : undefined }])),
      seq: this.drive.seq,
      writes: this.drive.writes,
      writeLog: this.drive.writeLog.length,
      reads: this.drive.reads,
      stateSnaps: this.drive.stateSnaps.length,
      props: new Map(this.props),
      triggers: this.triggers.map((t) => [t, t.deleted, t.fired]),
      mails: this.mails.length,
      logs: this.logs.length,
      sleeps: this.sleeps.length,
      fetchLog: this.world.log.length,
    };
  }
  restore(z) {
    this.drive.nodes = z.nodes;
    this.drive.seq = z.seq;
    this.drive.writes = z.writes;
    this.drive.writeLog.length = z.writeLog;
    this.drive.reads = z.reads;
    this.drive.stateSnaps.length = z.stateSnaps;
    this.props = z.props;
    this.triggers.length = z.triggers.length;
    for (const [t, deleted, fired] of z.triggers) {
      t.deleted = deleted;
      t.fired = fired;
    }
    this.mails.length = z.mails;
    this.logs.length = z.logs;
    this.logs.push('[the run was killed here by the 6-minute limit]');
    this.sleeps.length = z.sleeps;
    this.world.log.length = z.fetchLog;
    this.lockHeld = false; // Google releases the lock of a run that is gone
  }

  syncTriggers() {
    return this.triggers.filter((t) => !t.deleted && t.handler === 'sync');
  }
  liveTriggers() {
    return this.triggers.filter((t) => !t.deleted);
  }
  addTrigger(handler, kind = 'after', delay = 60000, hour = 3) {
    const b = vm.runInContext(`ScriptApp.newTrigger(${JSON.stringify(handler)}).timeBased()`, this.ctx);
    if (kind === 'after') b.after(delay);
    else b.everyDays(1).atHour(hour);
    return b.create();
  }

  /** Fires pending continuation triggers (earliest first) until none is left. */
  drain(maxRuns = 400) {
    let n = 0;
    while (n++ < maxRuns) {
      const pending = this.triggers.filter((t) => !t.deleted && !t.fired && t.kind === 'after').sort((a, b) => a.createdAt + a.delay - (b.createdAt + b.delay))[0];
      if (!pending) return n - 1;
      pending.fired = true; // like Apps Script, a fired one-off trigger stays listed until the script deletes it
      this.clock.t = Math.max(this.clock.t, pending.createdAt + pending.delay);
      this.exec(pending.handler);
    }
    throw new Error('drain: still triggers after ' + maxRuns + ' runs (crash loop?)');
  }
  nextDay() {
    const t = new Date(this.clock.now());
    this.clock.t = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, 21, 30, 0);
  }

  mark() {
    return {
      fetches: this.world.log.length,
      files: this.world.files().length,
      reads: this.drive.reads,
      writes: this.drive.writes,
      wlog: this.drive.writeLog.length,
      mails: this.mails.length,
      logs: this.logs.length,
      sleeps: this.sleeps.length,
    };
  }
  since(m) {
    return {
      fetches: this.world.log.length - m.fetches,
      files: this.world.files().length - m.files,
      indexFetches: this.world.log.slice(m.fetches).filter((l) => l.kind === 'index').length,
      reads: this.drive.reads - m.reads,
      writes: this.drive.writes - m.writes,
      writeLog: this.drive.writeLog.slice(m.wlog),
      mails: this.mails.slice(m.mails),
      logs: this.logs.slice(m.logs),
      fetchLog: this.world.log.slice(m.fetches),
      sleeps: this.sleeps.slice(m.sleeps),
    };
  }
  logText() {
    return this.logs.join('\n');
  }
  maxRunSecs() {
    return Math.max(0, ...this.runs.map((r) => r.secs));
  }

  // ---- views of the mock Drive
  rootNode() {
    const roots = this.drive.liveChildren(this.drive.root.id, 'folder').filter((n) => n.name === ROOT_NAME);
    return roots.length === 1 ? roots[0] : null;
  }
  stateNode(rootId) {
    return this.drive.liveChildren(rootId, 'file').find((n) => n.name === '_sync-state.json') || null;
  }
  readState(rootId) {
    const n = this.stateNode(rootId);
    return n ? JSON.parse(n.text.toString('utf8')) : null;
  }
  catalogNode(rootId) {
    return this.drive.liveChildren(rootId, 'file').find((n) => n.name === 'Catalog' && n.mime === SHEET_MIME) || null;
  }
}

// ------------------------------------------------------------------ verification against the index
const EXT_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', json: 'application/json' };
const mimeFor = (name) => EXT_MIME[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

function expectedDesignJson(index, d) {
  const cat = index.categories.find((c) => c.id === d.cat);
  return (
    JSON.stringify(
      {
        category: d.cat,
        categoryName: cat ? cat.name : d.cat,
        dir: d.dir,
        slide: d.slide,
        style: d.style,
        folder: d.folder,
        specs: d.specs,
        files: d.files.map((f) => ({ original: f.name, backup: backupFileName(d, f.name), bytes: f.bytes })),
        source: { repo: index.repo, branch: index.branch, path: `public/images/${d.dir}/slide_${pad3(d.slide)}` },
      },
      null,
      2
    ) + '\n'
  );
}

/** Checks the whole Drive tree against what the index dictates. Returns a list of problems. */
function verifyDrive(sim, index, { checkSha = true, partial = new Set() } = {}) {
  const P = [];
  const add = (m) => P.length < 25 && P.push(m);
  const roots = sim.drive.liveChildren(sim.drive.root.id, 'folder').filter((n) => n.name === ROOT_NAME);
  if (roots.length !== 1) return [`expected exactly one "${ROOT_NAME}" folder in My Drive, found ${roots.length}`];
  const root = roots[0];
  const kids = (id) => sim.drive.liveChildren(id);
  const rootKids = kids(root.id);
  const wantCats = new Set(index.designs.map((d) => index.categories.find((c) => c.id === d.cat).name));
  for (const k of rootKids) {
    if (k.kind === 'folder') {
      if (!wantCats.has(k.name)) add(`unexpected folder in root: ${k.name}`);
    } else if (!['_sync-state.json', 'Catalog', 'README.txt'].includes(k.name)) add(`unexpected file in root: ${k.name}`);
  }
  for (const c of wantCats) {
    const n = rootKids.filter((k) => k.kind === 'folder' && k.name === c).length;
    if (n !== 1) add(`category folder "${c}" appears ${n} times`);
  }
  const catIds = new Map(rootKids.filter((k) => k.kind === 'folder').map((k) => [k.name, k.id]));
  let nFiles = 0;
  for (const d of index.designs) {
    const catName = index.categories.find((c) => c.id === d.cat).name;
    const cid = catIds.get(catName);
    if (!cid) continue;
    const dfs = kids(cid).filter((k) => k.kind === 'folder' && k.name === d.folder);
    if (dfs.length !== 1) {
      add(`${d.dir}/${d.folder}: design folder appears ${dfs.length} times`);
      continue;
    }
    const files = kids(dfs[0].id);
    const byName = new Map();
    for (const f of files) {
      if (f.kind === 'folder') add(`${d.folder}: unexpected subfolder ${f.name}`);
      if (byName.has(f.name)) add(`${d.folder}: DUPLICATE file ${f.name}`);
      byName.set(f.name, f);
    }
    const want = new Set(['design.json']);
    for (const f of d.files) {
      const bn = backupFileName(d, f.name);
      want.add(bn);
      const node = byName.get(bn);
      if (!node) {
        if (!partial.has(`${d.dir}/${d.slide}`)) add(`${d.folder}: missing ${bn}`);
        continue;
      }
      nFiles++;
      if (node.size !== f.bytes) add(`${d.folder}/${bn}: size ${node.size} != index ${f.bytes}`);
      else if (checkSha && node.sha1 !== sim.world.fileSha1(relOf(d, f.name))) add(`${d.folder}/${bn}: sha1 differs from the source file`);
      if (node.mime !== mimeFor(f.name)) add(`${d.folder}/${bn}: mime ${node.mime}`);
    }
    for (const n of byName.keys()) if (!want.has(n)) add(`${d.folder}: unexpected file ${n}`);
    const dj = byName.get('design.json');
    if (dj) {
      if (!dj.text || dj.text.toString('utf8') !== expectedDesignJson(index, d)) add(`${d.folder}/design.json differs from the spec`);
    } else if (!partial.has(`${d.dir}/${d.slide}`)) add(`${d.folder}: design.json missing`);
  }
  verifyDrive.lastFileCount = nFiles;
  return P;
}

function verifyState(sim, index, { allDone = true } = {}) {
  const P = [];
  const add = (m) => P.length < 25 && P.push(m);
  const root = sim.rootNode();
  if (!root) return ['no root'];
  const st = sim.readState(root.id);
  if (!st) return ['no _sync-state.json'];
  if (st.v !== 1) add('state.v != 1');
  for (const d of index.designs) {
    const key = `${d.dir}/${d.slide}`;
    const e = st.designs[key];
    if (!e) {
      if (allDone) add(`state has no entry for ${key}`);
      continue;
    }
    if (allDone && !e.sig) add(`${key}: no sig`);
    const catName = index.categories.find((c) => c.id === d.cat).name;
    const cat = sim.drive.liveChildren(root.id, 'folder').find((n) => n.name === catName);
    const df = cat && sim.drive.liveChildren(cat.id, 'folder').find((n) => n.name === d.folder);
    if (!df) {
      if (allDone) add(`${key}: folder missing`);
      continue;
    }
    if (e.folderId !== df.id) add(`${key}: state folderId ${e.folderId} != ${df.id}`);
    for (const [name, id] of Object.entries(e.files)) {
      const n = sim.drive.nodes.get(id);
      if (!n || n.trashed || n.name !== name || n.parent !== df.id) add(`${key}: state file ${name} -> ${id} is not the live file`);
    }
    if (e.sig) for (const f of d.files) if (!e.files[backupFileName(d, f.name)]) add(`${key}: state lacks ${f.name}`);
  }
  return P;
}

const CATALOG_HEADER = ['Category', 'Style No.', 'Slide', 'Description', 'Technique', 'Content', 'Size', 'Season', 'Country', 'Files', 'Folder link', 'Lifestyle link', 'Image 1 link', 'Back link', 'Image 2 link', 'Website image URL', 'Backed up (ISO date)'];

function verifyCatalog(sim, index, { allDone = true } = {}) {
  const P = [];
  const add = (m) => P.length < 25 && P.push(m);
  const root = sim.rootNode();
  const cats = sim.drive.liveChildren(root.id, 'file').filter((n) => n.name === 'Catalog' && n.mime === SHEET_MIME);
  if (cats.length !== 1) return [`expected one Catalog sheet in the root, found ${cats.length}`];
  const sh = cats[0].sheets[0];
  if (JSON.stringify(sh.rows[0]) !== JSON.stringify(CATALOG_HEADER)) add('header row differs: ' + JSON.stringify(sh.rows[0]));
  if (sh.frozen !== 1) add('header row is not frozen');
  if (sh.rows.length !== index.designs.length + 1) add(`rows ${sh.rows.length} != ${index.designs.length + 1}`);
  if (sh.formulas) add(`${sh.formulas} cells would be read as formulas`);
  const last = sh.setValuesCalls[sh.setValuesCalls.length - 1];
  if (!last || last.nr !== index.designs.length + 1) add('last rebuild was not one setValues call of all rows');
  const st = sim.readState(root.id);
  const url = (id) => `https://drive.google.com/file/d/${id}/view`;
  index.designs.forEach((d, i) => {
    const row = sh.rows[i + 1];
    if (!row) return add(`row ${i + 2} missing`);
    const s = d.specs;
    const catName = index.categories.find((c) => c.id === d.cat).name;
    const e = st.designs[`${d.dir}/${d.slide}`];
    const idOf = (re) => {
      const f = d.files.find((x) => re.test(x.name));
      return f && e ? e.files[backupFileName(d, f.name)] : null;
    };
    const lf = d.files.find((x) => /^lifestyle\./.test(x.name)) || d.files.find((x) => /^image_01\./.test(x.name)) || d.files.find((x) => !/\.json$/.test(x.name));
    const want = [
      catName, d.style, d.slide, s.description ?? '', s.technique ?? '', s.content ?? '', s.size ?? '', s.season ?? '', s.country ?? '', d.files.length,
      e && e.folderId ? `https://drive.google.com/drive/folders/${e.folderId}` : '',
      idOf(/^lifestyle\./) ? url(idOf(/^lifestyle\./)) : '',
      idOf(/^image_01\./) ? url(idOf(/^image_01\./)) : '',
      idOf(/^back\./) ? url(idOf(/^back\./)) : '',
      idOf(/^image_02\./) ? url(idOf(/^image_02\./)) : '',
      lf ? `${index.siteBase}/images/${d.dir}/slide_${pad3(d.slide)}/${encodeURIComponent(lf.name)}` : '',
    ];
    for (let c = 0; c < want.length; c++) if (typeof want[c] === 'string' && /^[=+\-@]/.test(want[c])) want[c] = ' ' + want[c]; // text that looks like a formula is stored with a leading space
    for (let c = 0; c < want.length; c++) if (String(row[c]) !== String(want[c])) add(`row ${i + 2} col "${CATALOG_HEADER[c]}": "${row[c]}" != "${want[c]}"`);
    if (allDone && !/^\d{4}-\d{2}-\d{2}$/.test(String(row[16]))) add(`row ${i + 2}: Backed up = "${row[16]}"`);
    // the folder and file links must point at things that really exist in Drive
    for (const c of [10, 11, 12, 13, 14]) {
      const m = /(?:folders|d)\/([^/]+)/.exec(String(row[c]));
      if (row[c] && !(m && sim.drive.nodes.get(m[1]) && !sim.drive.nodes.get(m[1]).trashed)) add(`row ${i + 2} col ${c}: link target missing`);
    }
  });
  return P;
}

// ------------------------------------------------------------------ choosing designs
function pickSubset(index, n) {
  const ds = index.designs;
  const picked = new Set();
  ds.slice(0, n).forEach((d) => picked.add(d));
  for (const c of index.categories) {
    const f = ds.find((d) => d.cat === c.id);
    if (f) picked.add(f);
  }
  [(d) => d.folder.includes('__slide_'), (d) => d.files.some((f) => f.name.startsWith('back')), (d) => !d.files.some((f) => f.name.startsWith('lifestyle')), (d) => d.files.some((f) => f.name === 'data.json'), (d) => d.files.some((f) => f.name.startsWith('image_03'))].forEach((p) => {
    const f = ds.find(p);
    if (f) picked.add(f);
  });
  const out = ds.filter((d) => picked.has(d));
  return { ...clone(index), count: out.length, designs: clone(out) };
}

const BIG_INDEX = QUICK ? pickSubset(FULL_INDEX, 40) : FULL_INDEX;
const SMALL_INDEX = pickSubset(FULL_INDEX, 12);

// ------------------------------------------------------------------ tiny test framework
const results = [];
function test(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  const t0 = Date.now();
  const problems = [];
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
    list: (arr, m) => {
      for (const x of arr.slice(0, 8)) problems.push(`${m}: ${x}`);
    },
  };
  let crashed = null;
  try {
    fn(t);
  } catch (e) {
    crashed = e;
  }
  const ms = Date.now() - t0;
  if (crashed || problems.length) {
    console.log(`FAIL  ${name}  (${ms} ms)`);
    for (const p of problems.slice(0, 12)) console.log('        - ' + p);
    if (crashed) console.log('        ! ' + (crashed.stack || crashed).toString().split('\n').slice(0, 6).join('\n          '));
  } else console.log(`PASS  ${name}  (${ms} ms)`);
  results.push({ name, ok: !(crashed || problems.length) });
}
const dump = (sim, n = 40) => {
  if (VERBOSE) console.log(sim.logs.slice(-n).map((l) => '        | ' + l).join('\n'));
};

function newSim(index = SMALL_INDEX, opts) {
  return new Sim(index, opts);
}
const mailsTo = (sim, re) => sim.mails.filter((m) => re.test(m.subject));
function maxElapsedOk(t, sim, label) {
  t.ok(sim.maxRunSecs() <= 330, `${label}: a run took ${sim.maxRunSecs().toFixed(0)} s of script time (limit is 360 s)`);
}
function runToCompletion(sim, first = 'setup') {
  sim.exec(first);
  sim.drain();
}

// ------------------------------------------------------------------ static checks
test('static: .gs is plain ES2020, no Node/ESM constructs, only allowed Google services', (t) => {
  const require = createRequire(import.meta.url);
  let acorn;
  try {
    acorn = require(path.join(REPO_ROOT, 'node_modules/acorn'));
  } catch {
    acorn = null;
  }
  if (acorn) {
    try {
      acorn.parse(GS_SRC, { ecmaVersion: 2020, sourceType: 'script' });
    } catch (e) {
      t.ok(false, 'does not parse as an ES2020 script: ' + e.message);
    }
    const toks = [];
    let prev = null;
    for (const tok of acorn.tokenizer(GS_SRC, { ecmaVersion: 2020 })) {
      if (tok.type.label === 'name' && !(prev && prev.type.label === '.')) toks.push(GS_SRC.slice(tok.start, tok.end));
      prev = tok;
    }
    const names = new Set(toks);
    for (const bad of ['require', 'process', 'Buffer', 'TextEncoder', 'TextDecoder', 'URL', 'URLSearchParams', 'fetch', 'setTimeout', 'setInterval', 'globalThis', 'window', 'module', 'exports', 'structuredClone', 'atob', 'btoa'])
      t.ok(!names.has(bad), `uses the non-Apps-Script identifier "${bad}"`);
    const services = ['DriveApp', 'SpreadsheetApp', 'UrlFetchApp', 'ScriptApp', 'MailApp', 'Session', 'GmailApp', 'DocumentApp', 'CalendarApp', 'SlidesApp', 'FormApp', 'ContentService', 'HtmlService', 'CacheService', 'Drive', 'Sheets', 'Gmail'];
    const scopeOf = { DriveApp: 'https://www.googleapis.com/auth/drive', SpreadsheetApp: 'https://www.googleapis.com/auth/spreadsheets', UrlFetchApp: 'https://www.googleapis.com/auth/script.external_request', ScriptApp: 'https://www.googleapis.com/auth/script.scriptapp', MailApp: 'https://www.googleapis.com/auth/script.send_mail', Session: 'https://www.googleapis.com/auth/userinfo.email' };
    const used = services.filter((s) => names.has(s));
    const needed = new Set(used.map((s) => scopeOf[s]));
    t.ok(used.every((s) => scopeOf[s]), 'uses a Google service this simulator has no scope mapping/mock for: ' + used.filter((s) => !scopeOf[s]).join(','));
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    t.eq([...needed].sort(), [...manifest.oauthScopes].sort(), 'manifest oauthScopes vs scopes the code needs');
  } else console.log('        (acorn not installed: ES2020/identifier scan skipped)');
  t.ok(!/\b(import|export)\s+[\w{*]/.test(GS_SRC.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'import/export statement found');
  const code = GS_SRC.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const re of [/\.replaceAll\(/, /\.at\(-?\d/, /Object\.hasOwn\(/, /\.findLast\(/, /\.flatMap\(/, /\?\?=|\|\|=|&&=/, /\bawait\b/, /\basync\b/]) t.ok(!re.test(code), 'uses a feature newer than the Apps Script V8 runtime guarantees: ' + re);
  t.ok(/ROOT_FOLDER_ID\s*=\s*''/.test(GS_SRC) || /ROOT_FOLDER_ID\s*=\s*'[A-Za-z0-9_-]+'/.test(GS_SRC), 'ROOT_FOLDER_ID constant missing');
});

test('static: appsscript.json manifest', (t) => {
  const m = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  t.eq(m.timeZone, 'Asia/Kolkata', 'timeZone');
  t.eq(m.runtimeVersion, 'V8', 'runtimeVersion');
  t.eq(m.exceptionLogging, 'STACKDRIVER', 'exceptionLogging');
  t.ok(Array.isArray(m.oauthScopes) && m.oauthScopes.length === 6 && new Set(m.oauthScopes).size === 6, 'six distinct scopes');
});

test('static: sandbox really has no Node globals', (t) => {
  const sim = newSim();
  for (const g of ['process', 'require', 'Buffer', 'fetch', 'URL', 'TextEncoder', 'setTimeout', 'module'])
    t.eq(vm.runInContext(`typeof ${g}`, sim.ctx), 'undefined', `typeof ${g} inside the sandbox`);
});

test('static: local pictures match the index byte counts (test fixture sanity)', (t) => {
  let bad = 0;
  for (const d of BIG_INDEX.designs)
    for (const f of d.files) {
      try {
        if (fs.statSync(path.join(REPO_ROOT, relOf(d, f.name))).size !== f.bytes) bad++;
      } catch {
        bad++;
      }
    }
  t.eq(bad, 0, 'index files missing or with different size locally');
});

// ------------------------------------------------------------------ the big end-to-end scenarios
const big = { sim: null, ready: false, index: null };

test(`E1 full multi-run sync via setup() (${BIG_INDEX.designs.length} designs): Drive tree, sizes, sha1, design.json, state, catalog`, (t) => {
  const sim = (big.sim = new Sim(BIG_INDEX, { vars: QUICK ? { TIME_BUDGET_MS: 45000 } : {} }));
  big.index = clone(BIG_INDEX);
  const m0 = sim.mark();
  const r = sim.exec('setup');
  t.must(!r.error, 'setup() threw: ' + (r.error && r.error.message));
  const runsAfterSetup = sim.syncTriggers().length;
  t.eq(runsAfterSetup, 1, 'exactly one continuation trigger after the first slice');
  const daily = sim.liveTriggers().filter((x) => x.handler === 'syncDaily');
  t.eq(daily.length, 1, 'daily trigger count');
  t.eq(daily[0] && daily[0].hour, 15, 'daily trigger hour (3 PM India time, about 90 minutes after the 1:30 PM publish)');
  const budgetS = sim.getVar('TIME_BUDGET_MS') / 1000;
  const first = sim.runs[0].secs;
  t.ok(first <= budgetS + 60 && first >= budgetS - 20, `first slice used ${first.toFixed(0)} s (expected to stop near the ${budgetS} s budget)`);
  sim.drain();
  const d = sim.since(m0);
  dump(sim);
  t.ok(sim.runs.length >= 2, 'expected several slices, got ' + sim.runs.length);
  t.eq(sim.runs.filter((x) => x.error).length, 0, 'runs that threw');
  maxElapsedOk(t, sim, 'E1');
  t.eq(sim.syncTriggers().length, 0, 'continuation triggers left after completion');
  t.eq(sim.liveTriggers().length, 1, 'only the daily trigger remains');
  t.ok(sim.world.maxBatch <= 8 && sim.world.maxBatch >= 2, 'fetchAll batch size was ' + sim.world.maxBatch);
  t.eq(sim.world.unmuted, 0, 'fetches without muteHttpExceptions that failed');
  const wantFiles = BIG_INDEX.designs.reduce((n, x) => n + x.files.length, 0);
  // setup() runs selfTest() first, which probes the smallest file on each of the 3 sources
  t.eq(d.files, wantFiles + 3, 'picture downloads (each file fetched exactly once + 3 self-test probes)');
  t.eq(d.fetchLog.filter((l) => l.kind === 'file' && l.src !== 'raw').length, 2, 'fetches that left GitHub raw (just the 2 self-test probes)');
  t.list(verifyDrive(sim, BIG_INDEX), 'drive');
  t.list(verifyState(sim, BIG_INDEX), 'state');
  t.list(verifyCatalog(sim, BIG_INDEX), 'catalog');
  const root = sim.rootNode();
  t.eq(sim.props.get('ROOT_ID'), root && root.id, 'root id persisted in script properties');
  const readmes = sim.drive.liveChildren(root.id, 'file').filter((n) => n.name === 'README.txt');
  t.eq(readmes.length, 1, 'README.txt files in the root');
  const rtext = readmes[0] && readmes[0].text ? readmes[0].text.toString('utf8') : '';
  t.ok(rtext.includes('RESTORING THE WEBSITE FOLDERS') && rtext.includes('github.com/' + BIG_INDEX.repo) && rtext.includes('_restore-tools'), 'README.txt content');
  t.eq(sim.readState(root.id).readme, readmes[0] && readmes[0].id, 'README id remembered in the state');
  t.eq(sim.props.get('STATE_ID'), sim.stateNode(root.id).id, 'state file id remembered');
  t.eq(sim.props.get('STATE_ID_ROOT'), root.id, 'state file id is tied to its root');
  t.eq(sim.props.get('CATALOG_ID_ROOT'), root.id, 'catalog id is tied to its root');
  const mails = mailsTo(sim, /complete/);
  t.eq(mails.length, 1, 'completion emails');
  t.ok(mails[0] && mails[0].to === EMAIL && mails[0].body.includes(root.id) && mails[0].body.includes(`${BIG_INDEX.designs.length} of ${BIG_INDEX.designs.length}`), 'completion email content');
  t.eq(sim.mails.length, 1, 'total emails');
  const st1 = sim.readState(root.id);
  t.eq([st1.v, st1.initialDone, st1.news, st1.newsMore], [1, true, [], 0], 'state after the first full copy: initialDone is set and no design is listed as new (no flood)');
  t.ok(!sim.logs.some((l) => /^ERROR/.test(l)), 'ERROR lines in the log: ' + sim.logs.filter((l) => /^ERROR/.test(l)).slice(0, 2).join(' | '));
  const perRun = sim.logs.map((l) => /^sync: \w+ \| .* this run \+(\d+) designs/.exec(l)).filter(Boolean).map((m) => Math.floor(Number(m[1]) / 25));
  t.eq(sim.logs.filter((l) => /^progress:/.test(l)).length, perRun.reduce((a, b) => a + b, 0), 'progress lines (one per 25 designs copied in a run)');
  // the fake clock really crossed the 6 minute line at least once, i.e. one run could never have done it all
  t.ok((sim.clock.now() - Date.UTC(2026, 9, 9, 21, 0, 0)) / 1000 > 400, 'whole sync should need more than one 6-minute run');
  big.ready = true;
  console.log(`        ${sim.runs.length} slices, ${((sim.clock.now() - Date.UTC(2026, 9, 9, 21, 0, 0)) / 60000).toFixed(0)} fake minutes, ${d.files} pictures, ${(sim.drive.writes)} Drive writes`);
});

test('E2 status() reports full progress and selfTest() is read-only after the backup', (t) => {
  t.must(big.ready, 'E1 did not finish');
  const sim = big.sim;
  const m = sim.mark();
  sim.exec('status');
  const log = sim.since(m).logs.join('\n');
  const n = BIG_INDEX.designs.length;
  t.ok(log.includes(`Designs backed up: ${n} / ${n} (100%)`), 'status shows all designs: ' + log.split('\n').slice(0, 3).join(' / '));
  t.ok(/Last error: none/.test(log), 'status last error');
  const props0 = JSON.stringify([...sim.props]);
  const m2 = sim.mark();
  const r = sim.exec('selfTest');
  const d = sim.since(m2);
  t.ok(!r.error && r.value === true, 'selfTest returned ' + r.value);
  t.eq(d.writes, 0, 'selfTest Drive writes');
  t.eq(JSON.stringify([...sim.props]), props0, 'selfTest changed script properties');
  t.eq(sim.mails.length, 1, 'selfTest sent mail');
  t.ok(d.logs.some((l) => /RESULT: all good/.test(l)), 'selfTest prints a clear result');
});

test('E3 second run is a no-op: 0 picture fetches, 0 Drive writes, no mail, no trigger', (t) => {
  t.must(big.ready, 'E1 did not finish');
  const sim = big.sim;
  sim.nextDay();
  const root = sim.rootNode();
  const stateBefore = sim.stateNode(root.id).text.toString('utf8');
  const m = sim.mark();
  const r = sim.exec('syncDaily');
  const d = sim.since(m);
  t.ok(!r.error, 'threw');
  t.eq(d.files, 0, 'picture fetches');
  t.eq(d.indexFetches, 1, 'index fetches');
  t.eq(d.writes, 0, 'Drive writes');
  t.ok(d.reads <= 8, `Drive reads (${d.reads}) must not depend on the number of designs`);
  t.eq(d.mails.length, 0, 'mails');
  t.eq(sim.liveTriggers().length, 1, 'triggers');
  t.eq(sim.stateNode(root.id).text.toString('utf8'), stateBefore, 'state file rewritten');
  t.ok(sim.runs[sim.runs.length - 1].secs < 30, 'no-op run should take seconds, took ' + sim.runs[sim.runs.length - 1].secs);
  t.ok(d.logs.some((l) => /sync: complete/.test(l)), 'run reports complete');
});

test('E4 one file changed in the index: only that file replaced, old copy trashed, design.json refreshed', (t) => {
  t.must(big.ready, 'E1 did not finish');
  const sim = big.sim;
  const idx = sim.world.index;
  const d = idx.designs[Math.floor(idx.designs.length / 2)];
  const f = d.files.find((x) => /^image_01\./.test(x.name));
  const rel = relOf(d, f.name);
  const orig = fs.readFileSync(path.join(REPO_ROOT, rel));
  const changed = Buffer.concat([orig.subarray(0, orig.length - 10), Buffer.from('CHANGED-IMAGE-BYTES')]);
  sim.world.overrides.set(rel, changed);
  f.bytes = changed.length;
  const root = sim.rootNode();
  const stBefore = sim.readState(root.id);
  const oldId = stBefore.designs[`${d.dir}/${d.slide}`].files[backupFileName(d, f.name)];
  const catNode = sim.drive.liveChildren(root.id, 'folder').find((n) => n.name === idx.categories.find((c) => c.id === d.cat).name);
  const folderNode = sim.drive.liveChildren(catNode.id, 'folder').find((n) => n.name === d.folder);
  sim.nextDay();
  const m = sim.mark();
  const r = sim.exec('syncDaily');
  const x = sim.since(m);
  t.ok(!r.error, 'threw');
  t.eq(x.files, 1, 'picture fetches');
  const creates = x.writeLog.filter((w) => w.op === 'createFile' && w.parent === folderNode.id);
  t.eq(creates.length, 1, 'files created in the design folder');
  t.eq(creates[0] && creates[0].name, backupFileName(d, f.name), 'created file name');
  t.eq(x.writeLog.filter((w) => w.op === 'createFile').length, 1, 'files created anywhere');
  t.eq(x.writeLog.filter((w) => w.op === 'createFolder').length, 0, 'folders created');
  const trashed = x.writeLog.filter((w) => w.op === 'setTrashed');
  t.eq(trashed.map((w) => w.id), [oldId], 'trashed ids');
  t.eq(sim.drive.nodes.get(oldId).trashed, true, 'old copy is in the trash');
  const djw = x.writeLog.filter((w) => w.op === 'setContent' && w.name === 'design.json');
  t.eq(djw.length, 1, 'design.json rewrites');
  t.eq(djw[0] && djw[0].parent, folderNode.id, 'which design.json');
  const stray = x.writeLog.filter((w) => !['sheet.clear', 'sheet.setValues', 'sheet.format', 'sheet.bold', 'sheet.freeze', 'sheet.insertRows', 'sheet.insertCols'].includes(w.op) && w.parent !== folderNode.id && w.name !== '_sync-state.json');
  t.eq(stray.length, 0, 'writes outside this design/state/catalog: ' + JSON.stringify(stray.slice(0, 2)));
  t.list(verifyDrive(sim, idx), 'drive');
  t.list(verifyState(sim, idx), 'state');
  t.list(verifyCatalog(sim, idx), 'catalog');
  t.eq(mailsTo(sim, /complete/).length, 1, 'no second completion mail');
  t.eq(sim.syncTriggers().length, 0, 'continuation left');
});

test('E5 a newly appended design: only its files (and folder) are created', (t) => {
  t.must(big.ready, 'E1 did not finish');
  const sim = big.sim;
  const idx = sim.world.index;
  const base = idx.designs.filter((d) => d.dir === 'cushion');
  const slide = Math.max(...base.map((d) => d.slide)) + 1;
  const mk = (name, n) => {
    const b = crypto.randomBytes(n);
    return { name, b };
  };
  const files = [mk('back.png', 3000), mk('image_01.jpg', 5000), mk('image_02.jpg', 7000), mk('lifestyle.png', 9000)];
  const nd = {
    cat: 'cushions', dir: 'cushion', slide, style: 'CHD-TEST-9001 (new)', folder: 'CHD-TEST-9001_new',
    specs: { styleNumber: 'CHD-TEST-9001 (new)', description: 'CUSHION', technique: 'WOVEN', content: '=COTTON', size: '18X18', season: 'SUMMER' },
    files: files.map((f) => ({ name: f.name, bytes: f.b.length })),
  };
  for (const f of files) sim.world.overrides.set(relOf(nd, f.name), f.b);
  idx.designs.push(nd);
  idx.count = idx.designs.length;
  sim.nextDay();
  const m = sim.mark();
  const r = sim.exec('syncDaily');
  const x = sim.since(m);
  t.ok(!r.error, 'threw');
  t.eq(x.files, 4, 'picture fetches');
  const creates = x.writeLog.filter((w) => w.op === 'createFile');
  t.eq(creates.map((w) => w.name).sort(), [...files.map((f) => `CHD-TEST-9001_new_${f.name}`), 'design.json'].sort(), 'files created');
  t.eq(x.writeLog.filter((w) => w.op === 'createFolder').map((w) => w.name), ['CHD-TEST-9001_new'], 'folders created');
  t.eq(x.writeLog.filter((w) => w.op === 'setTrashed').length, 0, 'trashed');
  t.eq(x.writeLog.filter((w) => w.op === 'setContent' && w.name !== '_sync-state.json').length, 0, 'other rewrites');
  t.list(verifyDrive(sim, idx), 'drive');
  t.list(verifyState(sim, idx), 'state');
  t.list(verifyCatalog(sim, idx), 'catalog');
  const rows = sim.catalogNode(sim.rootNode().id).sheets[0].rows;
  t.eq(rows.length, idx.designs.length + 1, 'catalog rows');
  t.eq(rows[rows.length - 1][5], ' =COTTON', 'a spec starting with "=" is stored as text, not as a formula');
  t.eq(sim.catalogNode(sim.rootNode().id).sheets[0].formulas, 0, 'formula cells in the catalog');
  const sums = x.mails.filter((mm) => /new design/.test(mm.subject));
  t.eq(x.mails.length, 1, 'mails that day (just the summary)');
  t.ok(sums.length === 1 && sums[0].subject === 'CHD design library: 1 new design backed up' && sums[0].body.includes('  CHD-TEST-9001 (new) (Cushions)') && sums[0].body.includes(`The backup now holds ${idx.designs.length} designs.`), 'summary mail for the one new design: ' + JSON.stringify(sums[0] && [sums[0].subject, sums[0].body]));
  t.eq(sim.readState(sim.rootNode().id).news, [], 'list cleared after the mail');
  big.index = clone(idx);
});

test('E6 state file deleted: converges from Drive without duplicating files', (t) => {
  t.must(big.ready, 'E1 did not finish');
  const sim = big.sim;
  const idx = sim.world.index;
  const root = sim.rootNode();
  const before = JSON.stringify(sim.readState(root.id).designs);
  const fileCountBefore = [...sim.drive.nodes.values()].filter((n) => n.kind === 'file' && !n.trashed).length;
  sim.stateNode(root.id).trashed = true; // user deletes it
  sim.nextDay();
  const m = sim.mark();
  const r = sim.exec('syncDaily');
  sim.drain();
  const x = sim.since(m);
  t.ok(!r.error, 'threw');
  t.eq(x.files, 0, 'picture fetches');
  const creates = x.writeLog.filter((w) => w.op === 'createFile');
  t.eq(creates.map((w) => w.name), ['_sync-state.json'], 'files created');
  t.eq(x.writeLog.filter((w) => w.op === 'setTrashed' || w.op === 'createFolder').length, 0, 'trashed/created folders');
  t.eq(x.writeLog.filter((w) => w.op === 'setContent' && w.name === 'design.json').length, 0, 'design.json rewritten although unchanged');
  const fileCountAfter = [...sim.drive.nodes.values()].filter((n) => n.kind === 'file' && !n.trashed).length;
  t.eq(fileCountAfter, fileCountBefore, 'live file count (state file replaced 1:1)');
  t.list(verifyDrive(sim, idx), 'drive (no duplicates, nothing missing)');
  t.list(verifyState(sim, idx), 'state');
  t.list(verifyCatalog(sim, idx), 'catalog');
  const after = sim.readState(root.id).designs;
  let diff = 0;
  const sorted = (o) => JSON.stringify(Object.entries(o).sort());
  for (const [k, v] of Object.entries(JSON.parse(before))) if (sorted(v.files) !== sorted(after[k].files) || v.folderId !== after[k].folderId) diff++;
  t.eq(diff, 0, 'designs whose file ids differ from before (would mean re-created files)');
  t.eq(x.mails.length, 0, 'mails after the state was rebuilt from Drive (every design is "unknown" to the new state, none may be announced as new)');
  const rebuilt = sim.readState(root.id);
  t.eq([rebuilt.initialDone, rebuilt.news, rebuilt.newsMore], [true, [], 0], 'rebuilt state: copy counted as done again, nothing listed');
  maxElapsedOk(t, sim, 'E6');
  console.log(`        state-less recovery: ${x.reads} Drive reads, ${x.writes} Drive writes`);
});

// ------------------------------------------------------------------ focused scenarios on a small library
test('F1 source fallback: GitHub raw failing (500) -> live site; raw is demoted after repeated failures', (t) => {
  const sim = newSim();
  sim.world.inject({ src: 'raw', kind: 'file', mode: '500' });
  sim.exec('sync');
  sim.drain();
  const files = sim.world.files();
  const total = SMALL_INDEX.designs.reduce((n, d) => n + d.files.length, 0);
  const rawTries = files.filter((l) => l.src === 'raw').length;
  t.eq(files.filter((l) => l.src === 'site' && l.status === 200).length, total, 'files served by the live site');
  t.eq(files.filter((l) => l.src === 'cdn').length, 0, 'jsDelivr needed');
  t.ok(rawTries <= 6 * 3 + 12, `raw was tried ${rawTries} times for ${total} files (should be demoted after a few)`);
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive');
  t.ok(sim.sleeps.some((s) => s >= 1500), 'back-off sleeps happened');
  maxElapsedOk(t, sim, 'F1');
});
test('F2 source fallback: raw 404 + site HTML page -> jsDelivr; jsDelivr last', (t) => {
  const sim = newSim();
  sim.world.inject({ src: 'raw', kind: 'file', mode: '404' });
  sim.world.inject({ src: 'site', kind: 'file', mode: 'html' });
  sim.exec('sync');
  sim.drain();
  const total = SMALL_INDEX.designs.reduce((n, d) => n + d.files.length, 0);
  t.eq(sim.world.files().filter((l) => l.src === 'cdn' && l.status === 200).length, total, 'files served by jsDelivr');
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive');
  t.eq(sim.syncTriggers().length, 0, 'continuation left');
});

test('F3 index fallback: raw index is 404 / invalid -> jsDelivr copy is used', (t) => {
  for (const mode of ['404', 'badindex', 'garbage', 'emptyindex', '503']) {
    const sim = newSim();
    sim.world.inject({ src: 'raw', kind: 'index', mode });
    sim.exec('sync');
    sim.drain();
    t.eq(sim.world.log.filter((l) => l.kind === 'index' && l.src === 'cdn').length >= 1, true, `[${mode}] jsDelivr index fetched`);
    t.list(verifyDrive(sim, SMALL_INDEX), `drive [${mode}]`);
  }
});

test('F4 invalid index everywhere: refuses to do anything (zero Drive operations), fails clearly, no crash', (t) => {
  for (const mode of ['badindex', 'garbage', 'emptyindex']) {
    const sim = newSim();
    sim.world.inject({ kind: 'index', mode });
    const r = sim.exec('sync');
    t.ok(!r.error, `[${mode}] sync threw`);
    t.eq(sim.drive.writes, 0, `[${mode}] Drive writes`);
    t.eq(sim.drive.reads, 0, `[${mode}] Drive reads`);
    t.ok(sim.logs.some((l) => /FAILED: could not load a valid library-index.json/.test(l)), `[${mode}] clear failure line`);
  }
  // structurally bad designs inside an otherwise valid index
  const bad = clone(SMALL_INDEX);
  bad.designs[3].folder = '../evil';
  const sim = newSim(bad);
  sim.exec('sync');
  t.eq(sim.drive.writes, 0, 'path-traversal folder name: Drive writes');
  const dup = clone(SMALL_INDEX);
  dup.designs[2].folder = dup.designs[1].folder;
  const sim2 = newSim(dup);
  sim2.exec('sync');
  t.eq(sim2.drive.writes, 0, 'duplicate folder names: Drive writes');
  const sim3 = newSim({ ...clone(SMALL_INDEX), count: SMALL_INDEX.count + 5 });
  sim3.exec('sync');
  t.eq(sim3.drive.writes, 0, 'count mismatch (truncated index): Drive writes');
});

test('F5 transient errors are retried in the same source (429, HTML page, network error) and never stored wrong', (t) => {
  const sim = newSim();
  sim.world.inject({ src: 'raw', kind: 'file', mode: '429', perUrl: 2 });
  sim.exec('sync');
  sim.drain();
  const total = SMALL_INDEX.designs.reduce((n, d) => n + d.files.length, 0);
  const files = sim.world.files();
  t.eq(files.filter((l) => l.src === 'raw' && l.status === 200).length, total, 'files finally served by raw after retries');
  t.eq(files.filter((l) => l.src !== 'raw').length, 0, 'fell back although retries would have succeeded');
  t.eq(files.length, total * 3, 'attempts (2 failures + 1 success per file)');
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive');

  const sim2 = newSim();
  sim2.world.inject({ src: 'raw', kind: 'file', mode: 'html', perUrl: 1 });
  sim2.world.inject({ src: 'raw', kind: 'file', mode: '503', perUrl: 1 });
  sim2.exec('sync');
  sim2.drain();
  t.list(verifyDrive(sim2, SMALL_INDEX), 'drive (html + 503)');
  t.eq(sim2.world.files().filter((l) => l.src !== 'raw').length, 0, 'html/503 should be retried, not abandoned');

  // one request in a fetchAll throws (DNS-style error) -> that file is retried, the others still arrive
  const sim3 = newSim();
  sim3.world.inject({ src: 'raw', kind: 'file', mode: 'throw', perUrl: 1, match: (rel) => /image_01/.test(rel) });
  sim3.world.inject({ src: 'raw', kind: 'file', mode: '404', match: (rel) => /image_02/.test(rel) }); // an HTTP error inside the one-by-one fallback must not throw either
  sim3.exec('sync');
  sim3.drain();
  t.list(verifyDrive(sim3, SMALL_INDEX), 'drive (network errors)');
  t.eq(sim3.world.files().filter((l) => l.src !== 'raw' && !/image_02/.test(l.rel)).length, 0, 'network error should be retried on the same source');
  t.eq(sim3.world.unmuted, 0, 'HTTP errors seen by requests without muteHttpExceptions');
  t.eq([sim.world.unmuted, sim2.world.unmuted], [0, 0], 'unmuted HTTP errors');
});

test('F6 wrong-size downloads are never written; they fall through to the next source', (t) => {
  const idx = SMALL_INDEX;
  const target = idx.designs[4];
  const tf = target.files.find((f) => /^image_02\./.test(f.name));
  // (a) wrong everywhere -> not written, design incomplete, logged with key + file
  const sim = newSim();
  for (const mode of ['truncate', 'pad']) sim.world.inject({ kind: 'file', mode, match: (rel) => rel === relOf(target, tf.name), src: mode === 'truncate' ? 'raw' : undefined });
  sim.exec('sync');
  sim.drain();
  const root = sim.rootNode();
  const live = [...sim.drive.nodes.values()].filter((n) => n.kind === 'file' && !n.trashed && n.name === backupFileName(target, tf.name));
  t.eq(live.length, 0, 'wrong-size file was written to Drive');
  const wrongSized = [];
  for (const d of idx.designs)
    for (const f of d.files)
      for (const n of sim.drive.nodes.values()) if (n.kind === 'file' && n.name === backupFileName(d, f.name) && n.size !== f.bytes) wrongSized.push(n.name);
  t.eq(wrongSized, [], 'wrong-size files anywhere in Drive');
  t.list(verifyDrive(sim, idx, { partial: new Set([`${target.dir}/${target.slide}`]) }), 'drive');
  const st = sim.readState(root.id);
  t.ok(!st.designs[`${target.dir}/${target.slide}`].sig, 'incomplete design must not carry a signature');
  t.ok(sim.logs.some((l) => l.startsWith('ERROR') && l.includes(`${target.dir}/${target.slide}`) && l.includes(tf.name)), 'error line has design key + file');
  t.eq(sim.syncTriggers().length, 0, 'no continuation after a finished pass with a failure');
  const prog = JSON.parse(sim.props.get('PROGRESS'));
  t.eq([prog.kind, prog.pending, prog.done], ['incomplete', 1, idx.designs.length - 1], 'progress summary');
  t.eq(mailsTo(sim, /complete/).length, 0, 'completion mail must wait for a fully complete pass');
  // next day, source is fixed -> only that file is fetched and created
  sim.world.clearRules();
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  const x = sim.since(m);
  t.eq(x.files, 1, 'picture fetches on retry');
  t.eq(x.writeLog.filter((w) => w.op === 'createFile' && !['_sync-state.json'].includes(w.name)).map((w) => w.name).sort(), [backupFileName(target, tf.name), 'design.json'].sort(), 'files created on retry (the missing picture + the design.json it was waiting for)');
  t.list(verifyDrive(sim, idx), 'drive after fix');
  t.eq(mailsTo(sim, /complete/).length, 1, 'completion mail after the fix');
  // (b) wrong size only from raw -> site gives the right bytes, with no futile retries of the wrong one
  const sim2 = newSim();
  sim2.world.inject({ src: 'raw', kind: 'file', mode: 'truncate', match: (rel) => rel === relOf(target, tf.name) });
  sim2.exec('sync');
  sim2.drain();
  t.list(verifyDrive(sim2, idx), 'drive (b)');
  t.eq(sim2.world.files().filter((l) => l.rel === relOf(target, tf.name)).map((l) => l.src), ['raw', 'site'], 'sources tried for the file');
});

test('F7 lock contention: second run exits quietly (no fetch, no Drive call, no trigger change)', (t) => {
  const sim = newSim();
  sim.lockBusy = true;
  sim.addTrigger('syncDaily', 'daily');
  const m = sim.mark();
  const trg0 = sim.liveTriggers().length;
  const r = sim.exec('sync');
  const x = sim.since(m);
  t.ok(!r.error, 'threw');
  t.eq([x.fetches, x.reads, x.writes], [0, 0, 0], 'fetches/reads/writes');
  t.eq(sim.liveTriggers().length, trg0, 'trigger count');
  t.ok(x.logs.length <= 1 && x.logs.every((l) => /another run is in progress/.test(l)), 'quiet exit: ' + JSON.stringify(x.logs));
  t.eq(x.mails.length, 0, 'mail');
  sim.lockBusy = false;
  sim.exec('sync');
  sim.drain();
  t.eq(sim.lockHeld, false, 'lock released after a normal run');
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive after the lock freed');
  // lock is released even when a run blows up
  const sim2 = newSim();
  sim2.world.inject({ kind: 'index', mode: '500' });
  sim2.exec('sync');
  t.eq(sim2.lockHeld, false, 'lock released after a failed run');
});

test('F8 continuation triggers: stale ones are cleaned, exactly one is left mid-way, none at the end; the daily one untouched', (t) => {
  const sim = newSim(SMALL_INDEX, { vars: { TIME_BUDGET_MS: 30000 } });
  const daily = sim.addTrigger('syncDaily', 'daily', 0, 15);
  sim.props.set('DAILY_HOUR_SET', '15'); // as setup() leaves it: the daily run then has nothing to correct (D12 covers the case where it does)
  for (let i = 0; i < 4; i++) {
    sim.addTrigger('sync', 'after', 60000);
    sim.triggers[sim.triggers.length - 1].fired = i < 3; // three already fired (never auto-removed), one still pending
  }
  t.eq(sim.syncTriggers().length, 4, 'setup of the test');
  const r = sim.exec('syncDaily');
  t.ok(!r.error, 'threw');
  t.eq(sim.syncTriggers().length, 1, 'continuation triggers after a partial slice');
  t.eq(sim.syncTriggers()[0].delay, 60000, 'continuation delay');
  t.ok(sim.liveTriggers().includes(sim.triggers.find((x) => x.api === daily)), 'daily trigger kept');
  sim.drain();
  t.eq(sim.syncTriggers().length, 0, 'continuation triggers left at the end');
  t.eq(sim.liveTriggers().filter((x) => x.handler === 'syncDaily').length, 1, 'daily trigger count');
  t.ok(sim.runs.length >= 3, 'expected several slices with a 30 s budget, got ' + sim.runs.length);
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive');
  t.eq(mailsTo(sim, /complete/).length, 1, 'completion mails over all slices');
  maxElapsedOk(t, sim, 'F8');
  for (const x of sim.runs) t.ok(x.secs < 30 + 60, `slice of ${x.secs} s overran its 30 s budget by too much`);
});

test('F9 stopAll removes every trigger the script created (and nothing else breaks)', (t) => {
  const sim = newSim(SMALL_INDEX, { vars: { TIME_BUDGET_MS: 30000 } });
  sim.exec('setup');
  t.ok(sim.liveTriggers().length >= 2, 'precondition: daily + continuation, have ' + sim.liveTriggers().map((x) => x.handler));
  const r = sim.exec('stopAll');
  t.ok(!r.error, 'threw');
  t.eq(sim.liveTriggers().length, 0, 'triggers left');
  t.eq(sim.props.has('STOPPED'), true, 'stop flag set');
  t.ok(sim.logs.some((l) => /stopAll: stopped; removed 2 trigger\(s\) and nothing is running/.test(l)), 'says that nothing is running');
  sim.exec('stopAll');
  t.eq(sim.liveTriggers().length, 0, 'second stopAll');
  sim.exec('setup');
  t.eq(sim.props.has('STOPPED'), false, 'setup() clears the stop flag');
  t.ok(sim.liveTriggers().some((x) => x.handler === 'syncDaily'), 'setup() installs the daily trigger again');
});

test('F10 daily quota errors stop cleanly (no continuation, no hammering) and resume the next day', (t) => {
  // UrlFetch quota
  const sim = newSim();
  sim.world.inject({ kind: 'file', mode: 'quota', skip: 8 });
  const r = sim.exec('setup');
  t.ok(!r.error, 'threw');
  t.eq(sim.syncTriggers().length, 0, 'continuation trigger after a quota stop');
  t.eq(sim.world.log.filter((l) => l.status === 'quota').length, 1, 'fetches after the quota error');
  t.ok(sim.logs.some((l) => /daily quota reached/.test(l)), 'clear log line');
  const st = sim.readState(sim.rootNode().id);
  t.ok(Object.values(st.designs).filter((e) => e.sig).length >= 1, 'progress saved before stopping');
  t.eq(sim.liveTriggers().filter((x) => x.handler === 'syncDaily').length, 1, 'daily trigger still there');
  sim.world.clearRules();
  sim.nextDay();
  sim.exec('syncDaily');
  sim.drain();
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive after resuming');
  t.eq(mailsTo(sim, /complete/).length, 1, 'completion mail');
  // Drive quota
  const sim2 = newSim();
  sim2.drive.inject({ op: 'createFile', error: 'Exception: Service invoked too many times for one day: drive.', skip: 12 });
  sim2.exec('setup');
  t.eq(sim2.syncTriggers().length, 0, 'drive quota: continuation trigger');
  sim2.drive.faults.length = 0;
  sim2.nextDay();
  sim2.exec('syncDaily');
  sim2.drain();
  t.list(verifyDrive(sim2, SMALL_INDEX), 'drive after resuming (drive quota)');
});

test('F11 failures: backoff retries, ONE "failing" email after 3 failed runs, no crash loop, recovery clears it', (t) => {
  const sim = newSim();
  sim.world.inject({ kind: 'index', mode: '500' });
  sim.exec('syncDaily');
  sim.drain();
  t.eq(sim.runs.length, 3, 'runs before giving up for today');
  t.eq(sim.syncTriggers().length, 0, 'continuation left');
  t.eq(sim.runs.filter((x) => x.error).length, 0, 'runs that threw');
  t.eq(mailsTo(sim, /failing/).length, 1, 'failure emails');
  t.eq(sim.drive.writes, 0, 'Drive writes while the index is unreachable');
  const delays = sim.triggers.filter((x) => x.kind === 'after' && x.delay !== sim.getVar('SAFETY_AFTER_MS')).map((x) => x.delay / 60000);
  t.eq(delays, [5, 15], 'retry back-off in minutes');
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(mailsTo(sim, /failing/).length, 1, 'failure emails after a 4th failed run');
  sim.world.clearRules();
  sim.nextDay();
  sim.exec('syncDaily');
  sim.drain();
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive after recovery');
  t.eq(mailsTo(sim, /complete/).length, 1, 'completion mail');
  t.eq(sim.props.get('FAIL_STREAK'), '0', 'failure streak reset');
  t.eq(sim.props.has('FAIL_MAILED'), false, 'failure-mail flag reset');
  // a persistent per-design failure also ends up in a mail after 3 daily runs, but only once
  const sim2 = newSim();
  const dd = SMALL_INDEX.designs[2];
  sim2.world.inject({ kind: 'file', mode: '404', match: (rel) => rel.includes(`/slide_${pad3(dd.slide)}/`) && rel.includes(`/${dd.dir}/`) });
  for (let i = 0; i < 4; i++) {
    sim2.exec('syncDaily');
    sim2.drain();
    sim2.nextDay();
  }
  t.eq(mailsTo(sim2, /failing/).length, 1, 'persistent design failure: failure emails');
  t.eq(mailsTo(sim2, /complete/).length, 0, 'persistent design failure: completion email');
  t.eq(sim2.syncTriggers().length, 0, 'persistent design failure: continuation left');
});

test('F12 mail problems never fail the sync (and the completion mail is retried next run)', (t) => {
  const sim = newSim();
  sim.mailFails = true;
  const r = sim.exec('setup');
  sim.drain();
  t.ok(!r.error, 'threw');
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive');
  t.eq(sim.props.has('MAIL_DONE'), false, 'MAIL_DONE must stay unset when sending failed');
  sim.mailFails = false;
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(mailsTo(sim, /complete/).length, 1, 'completion mail sent once it can');
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(mailsTo(sim, /complete/).length, 1, 'and only once');
  // no effective-user email available -> falls back to the Drive owner
  const sim2 = newSim();
  sim2.effectiveEmailFails = true;
  sim2.exec('sync');
  t.eq(sim2.mails.map((m) => m.to), [EMAIL], 'fallback recipient');
});

test('F13 root folder: ROOT_FOLDER_ID is honoured; otherwise find-or-create by name; id persisted; setup() is idempotent', (t) => {
  const sim = newSim();
  const custom = sim.drive._mk('folder', 'My own folder', sim.drive.root.id);
  sim.setVar('ROOT_FOLDER_ID', custom.id);
  sim.exec('setup');
  sim.drain();
  t.eq(sim.drive.liveChildren(sim.drive.root.id, 'folder').map((n) => n.name), ['My own folder'], 'no extra root folder created');
  t.ok(sim.drive.liveChildren(custom.id).length >= SMALL_INDEX.categories.length - 1, 'content under the custom folder');
  t.eq(sim.props.get('ROOT_ID'), custom.id, 'persisted root id');
  t.ok(sim.stateNode(custom.id) && sim.catalogNode(custom.id), 'state + catalog in the custom root');
  // default: created once, reused by later setups
  const sim2 = newSim();
  sim2.exec('setup');
  sim2.drain();
  const id1 = sim2.rootNode().id;
  sim2.props.delete('ROOT_ID'); // even without the saved id it is found by name
  sim2.exec('setup');
  sim2.drain();
  t.eq(sim2.rootNode() && sim2.rootNode().id, id1, 'root folder reused (not duplicated)');
  t.eq(sim2.liveTriggers().filter((x) => x.handler === 'syncDaily').length, 1, 'daily triggers after two setups');
  // moving to another root later: everything (state, catalog) is created there, the old root is left alone
  const sim4 = newSim();
  sim4.exec('setup');
  sim4.drain();
  const oldRoot = sim4.rootNode();
  const newRoot = sim4.drive._mk('folder', 'Second root', sim4.drive.root.id);
  sim4.setVar('ROOT_FOLDER_ID', newRoot.id);
  sim4.nextDay();
  sim4.exec('syncDaily');
  sim4.drain();
  t.ok(sim4.catalogNode(newRoot.id) && sim4.stateNode(newRoot.id), 'state + catalog created in the new root');
  t.eq(sim4.drive.liveChildren(oldRoot.id, 'file').filter((n) => n.name === 'Catalog').length, 1, 'old Catalog untouched');
  t.eq(sim4.drive.liveChildren(newRoot.id, 'folder').length, 8, 'category folders copied into the new root');
  // a bad ROOT_FOLDER_ID fails loudly and touches nothing
  const sim3 = newSim();
  sim3.setVar('ROOT_FOLDER_ID', 'doesNotExist');
  const m = sim3.mark();
  sim3.exec('sync');
  t.eq(sim3.since(m).writes, 0, 'bad ROOT_FOLDER_ID: Drive writes');
  t.ok(sim3.logs.some((l) => /cannot be opened/.test(l)), 'bad ROOT_FOLDER_ID: clear message');
});

test('F14 selfTest is read-only and reports problems; setup() installs nothing when it fails', (t) => {
  const sim = newSim();
  const m = sim.mark();
  const props0 = JSON.stringify([...sim.props]);
  const r = sim.exec('selfTest');
  const x = sim.since(m);
  t.eq(r.value, true, 'selfTest result');
  t.eq(x.writes, 0, 'Drive writes');
  t.eq(JSON.stringify([...sim.props]), props0, 'properties changed');
  t.eq(sim.liveTriggers().length, 0, 'triggers created');
  t.eq(sim.rootNode(), null, 'root folder created by selfTest');
  t.ok(x.logs.some((l) => /RESULT: all good/.test(l)) && x.logs.some((l) => /picture source raw: reachable/.test(l)) && x.logs.some((l) => /Drive space/.test(l)), 'clear log lines');
  const sim2 = newSim();
  sim2.world.inject({ mode: '500' });
  const r2 = sim2.exec('selfTest');
  t.eq(r2.value, false, 'selfTest with everything down');
  t.ok(sim2.logs.some((l) => /FAIL {2}library index/.test(l)), 'says what failed');
  sim2.exec('setup');
  t.eq([sim2.drive.writes, sim2.liveTriggers().length], [0, 0], 'setup() with a failing self-test must install nothing');
  const sim3 = newSim();
  sim3.world.inject({ kind: 'file', mode: '404' });
  t.eq(sim3.exec('selfTest').value, false, 'no usable picture source -> blocking');
});

test('F15 design.json is rewritten only when its content changes (spec edit, no file change)', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const idx = sim.world.index;
  const d = idx.designs[5];
  d.specs.season = 'WINTER 2026';
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  const x = sim.since(m);
  t.eq(x.files, 0, 'picture fetches');
  const w = x.writeLog.filter((e) => e.op !== 'sheet.clear' && !e.op.startsWith('sheet.'));
  t.eq(w.map((e) => `${e.op}:${e.name}`).sort(), ['setContent:_sync-state.json', 'setContent:design.json'].sort(), 'Drive writes');
  t.list(verifyDrive(sim, idx), 'drive');
  t.list(verifyCatalog(sim, idx), 'catalog');
  const m2 = sim.mark();
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(sim.since(m2).writes, 0, 'writes on the following no-op run');
});

test('F16 rebuildCatalog() rewrites one Catalog sheet in a single setValues call; recheckAll() repairs a deleted file', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const root = sim.rootNode();
  const sheet = sim.catalogNode(root.id).sheets[0];
  sheet.rows = [];
  const m = sim.mark();
  sim.exec('rebuildCatalog');
  const x = sim.since(m);
  t.eq(x.writeLog.filter((w) => w.op === 'sheet.setValues').length, 1, 'setValues calls');
  t.eq(x.writeLog.filter((w) => w.op === 'createSpreadsheet').length, 0, 'new spreadsheet created');
  t.eq(x.writeLog.filter((w) => w.op === 'createFile').length, 0, 'files created');
  t.list(verifyCatalog(sim, SMALL_INDEX), 'catalog');
  // the owner trashes a picture by hand: a normal run does not notice (zero Drive calls) ...
  const d = SMALL_INDEX.designs[3];
  const f = d.files[0];
  const victim = [...sim.drive.nodes.values()].find((n) => n.name === backupFileName(d, f.name) && !n.trashed);
  victim.trashed = true;
  sim.nextDay();
  const m1 = sim.mark();
  sim.exec('syncDaily');
  t.eq(sim.since(m1).writes, 0, 'a normal run must not touch Drive');
  // ... recheckAll() makes it look again and re-create just that file
  const m2 = sim.mark();
  sim.exec('recheckAll');
  sim.drain();
  const y = sim.since(m2);
  t.eq(y.files, 1, 'picture fetches');
  t.eq(y.writeLog.filter((w) => w.op === 'createFile').map((w) => w.name).includes(backupFileName(d, f.name)), true, 'file re-created');
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive after recheckAll');
  t.list(verifyState(sim, SMALL_INDEX), 'state after recheckAll');
  t.list(verifyCatalog(sim, SMALL_INDEX), 'catalog after recheckAll');
});

test('F17 Drive hiccups: transient errors are retried, a create that failed after succeeding is not duplicated', (t) => {
  const sim = newSim();
  // createFile creates the file and THEN reports an error (twice) for one picture
  const target = SMALL_INDEX.designs[1];
  const tname = backupFileName(target, target.files[1].name);
  sim.drive.inject({ op: 'createFile', after: true, times: 2, match: (n) => n === tname, error: 'Exception: Service error: Drive' });
  sim.drive.inject({ op: 'createFile', times: 3, skip: 5, error: 'Exception: Service invoked too many times in a short time: drive. Try Utilities.sleep(1000) between calls.' });
  sim.drive.inject({ op: 'createFolder', times: 2, skip: 2, error: 'Exception: Server error occurred. Please try again.' });
  const r = sim.exec('setup');
  sim.drain();
  t.ok(!r.error, 'threw');
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive (duplicates would show here)');
  t.eq(mailsTo(sim, /complete/).length, 1, 'completed');
  t.ok(sim.sleeps.length > 0, 'slept between retries');
  // a persistent non-quota error on one design is isolated: the others still copy, run stops only after 6 in a row
  const sim2 = newSim();
  const t2 = SMALL_INDEX.designs[7];
  sim2.drive.inject({ op: 'createFolder', match: (n) => n === t2.folder, error: 'Exception: Something odd happened' });
  sim2.exec('sync');
  sim2.drain();
  t.list(verifyDrive(sim2, SMALL_INDEX, { partial: new Set([`${t2.dir}/${t2.slide}`]) }).filter((p) => !p.includes(t2.folder)), 'drive (all other designs)');
  t.eq(JSON.parse(sim2.props.get('PROGRESS')).pending, 1, 'one design pending');
  t.ok(sim2.logs.some((l) => l.startsWith('ERROR') && l.includes(`${t2.dir}/${t2.slide}`)), 'error names the design');
});

test('F18 systemic failure: aborts after 6 designs in a row instead of burning the budget', (t) => {
  const sim = newSim();
  sim.world.inject({ kind: 'file', mode: '404' });
  const r = sim.exec('sync');
  sim.drain();
  t.ok(!r.error, 'threw');
  const prog = JSON.parse(sim.props.get('PROGRESS'));
  t.ok(prog.kind === 'stalled' || prog.kind === 'incomplete', 'ended as ' + prog.kind);
  t.ok(sim.world.files().length <= 6 * 12 * 3, `file fetches before giving up: ${sim.world.files().length}`);
  t.ok(sim.runs.length <= 3, 'runs ' + sim.runs.length);
  t.eq(sim.syncTriggers().length, 0, 'continuation left');
});

test('F19 slow Drive: a slice never runs past the 6-minute limit', (t) => {
  const sim = newSim(SMALL_INDEX);
  sim.drive.speed = 12; // 12x slower Drive writes
  sim.exec('setup');
  sim.drain();
  maxElapsedOk(t, sim, 'F19');
  t.ok(sim.runs.length >= 3, 'needs several slices, got ' + sim.runs.length);
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive');
});

test('F20 design added then renamed folder / reorder in index does not duplicate; removed designs are left alone', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const before = [...sim.drive.nodes.values()].filter((n) => !n.trashed).length;
  const idx = sim.world.index;
  const removed = idx.designs.pop(); // design disappears from the index (e.g. unpublished)
  idx.count = idx.designs.length;
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  const x = sim.since(m);
  t.eq(x.writeLog.filter((w) => w.op === 'setTrashed' || w.op === 'createFile' && w.name !== '_sync-state.json').length, 0, 'trash/create on removal');
  t.eq([...sim.drive.nodes.values()].filter((n) => !n.trashed).length >= before, true, 'nothing deleted from Drive');
  const root = sim.rootNode();
  const st = sim.readState(root.id);
  t.ok(st.designs[`${removed.dir}/${removed.slide}`], 'state keeps the removed design');
});


test('F21 a design with more files than one fetchAll batch (11 files): batches stay <= 8, all files correct', (t) => {
  const sim = newSim(pickSubset(FULL_INDEX, 3));
  const idx = sim.world.index;
  const base = idx.designs[0];
  const files = [];
  for (let i = 0; i < 11; i++) {
    const name = i === 0 ? 'lifestyle.png' : `image_${String(i).padStart(2, '0')}.jpg`;
    files.push({ name, b: crypto.randomBytes(2000 + i * 321) });
  }
  const nd = { ...clone(base), slide: 900, style: 'CHD-WIDE-1', folder: 'CHD-WIDE-1', specs: { styleNumber: 'CHD-WIDE-1', description: 'RUG' }, files: files.map((f) => ({ name: f.name, bytes: f.b.length })) };
  for (const f of files) sim.world.overrides.set(relOf(nd, f.name), f.b);
  idx.designs.push(nd);
  idx.count = idx.designs.length;
  sim.world.inject({ src: 'raw', kind: 'file', mode: '429', perUrl: 1, match: (rel) => rel.includes('slide_900') && /image_0[3-9]/.test(rel) });
  sim.exec('sync');
  sim.drain();
  t.eq(sim.world.maxBatch, 8, 'largest fetchAll batch');
  t.list(verifyDrive(sim, idx), 'drive');
  t.eq(sim.world.unmuted, 0, 'unmuted errors');
  t.eq(sim.world.files().filter((l) => l.rel.includes('slide_900') && l.src !== 'raw').length, 0, 'retries stayed on raw');
});

test('F22 the state file is saved about every 20 designs (a crash loses little), once more at the end', (t) => {
  const idx = pickSubset(FULL_INDEX, 60);
  const sim = newSim(idx, { vars: { TIME_BUDGET_MS: 600000 } });
  sim.exec('sync');
  sim.drain();
  const snaps = sim.drive.stateSnaps;
  t.ok(idx.designs.length >= 60, 'fixture has ' + idx.designs.length + ' designs');
  t.ok(snaps.length >= Math.floor(idx.designs.length / 20), `state saved ${snaps.length} times for ${idx.designs.length} designs: ${snaps.join(',')}`);
  t.ok(snaps.length <= Math.ceil(idx.designs.length / 20) + 2, `state saved too often: ${snaps.length} times: ${snaps.join(',')}`);
  for (let i = 0; i < snaps.length; i++) t.ok(snaps[i] - (snaps[i - 1] || 0) <= 21, `${snaps[i] - (snaps[i - 1] || 0)} designs between saves ${i - 1} and ${i}`);
  t.eq(snaps[snaps.length - 1], idx.designs.length, 'final save has every design');
  t.list(verifyDrive(sim, idx), 'drive');
});

test('F23 recovery after an interrupted slice: second slice picks up from the saved state, copies nothing twice', (t) => {
  // slice 1 is cut short by a small budget; every file must be fetched exactly once over all slices
  const idx = pickSubset(FULL_INDEX, 30);
  const sim = newSim(idx, { vars: { TIME_BUDGET_MS: 25000 } });
  sim.exec('sync');
  t.eq(sim.syncTriggers().length, 1, 'continuation scheduled');
  sim.drain();
  const total = idx.designs.reduce((n, d) => n + d.files.length, 0);
  t.eq(sim.world.files().length, total, 'pictures fetched over all slices (no re-downloads)');
  t.eq(sim.drive.writeLog.filter((w) => w.op === 'createFile' && !['_sync-state.json', 'design.json', 'README.txt'].includes(w.name)).length, total, 'picture files created');
  t.eq(sim.drive.writeLog.filter((w) => w.op === 'setTrashed').length, 0, 'trashed');
  t.ok(sim.runs.length >= 3, 'slices: ' + sim.runs.length);
  t.list(verifyDrive(sim, idx), 'drive');
});

test('F24 a design that failed in an unfinished pass is retried on a later day (pass bookkeeping is persisted)', (t) => {
  const idx = SMALL_INDEX;
  const x = idx.designs[2];
  const sim = newSim();
  const isX = (rel) => rel.includes(`/${x.dir}/slide_${pad3(x.slide)}/`);
  sim.world.inject({ kind: 'file', mode: '404', match: isX });
  sim.world.inject({ kind: 'file', mode: 'quota', skip: 30, match: (rel) => !isX(rel) }); // day 1 is cut short by a daily quota right after X failed
  sim.exec('syncDaily');
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'quota', 'day 1 ended by quota');
  sim.world.rules.pop();
  sim.nextDay();
  sim.exec('syncDaily'); // day 2: everything else is done, X still fails
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'incomplete', 'day 2 ends with X still pending');
  sim.world.clearRules(); // X is fixed at the source
  sim.nextDay();
  sim.exec('syncDaily'); // day 3: X must be retried
  sim.drain();
  t.list(verifyDrive(sim, idx), 'drive after the fix (X must be retried)');
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'complete', 'day 3 completes');
  t.eq(mailsTo(sim, /complete/).length, 1, 'completion mail');
});

// ------------------------------------------------------------------ second review: stop, kill, scopes, stale index, catalog, README
const totalFiles = (ix) => ix.designs.reduce((n, d) => n + d.files.length, 0);
const liveNamed = (sim, name) => [...sim.drive.nodes.values()].filter((n) => n.kind === 'file' && !n.trashed && n.name === name);

/** Adds a design with `count` random pictures to the library the fake internet serves. */
function addWide(sim, slide, count, { front = false } = {}) {
  const idx = sim.world.index;
  const files = [];
  for (let i = 0; i < count; i++) files.push({ name: i === 0 ? 'lifestyle.png' : `image_${String(i).padStart(2, '0')}.jpg`, b: crypto.randomBytes(3000 + i * 111) });
  const nd = { ...clone(idx.designs[0]), slide, style: `CHD-WIDE-${slide}`, folder: `CHD-WIDE-${slide}`, specs: { styleNumber: `CHD-WIDE-${slide}`, description: 'RUG' }, files: files.map((f) => ({ name: f.name, bytes: f.b.length })) };
  for (const f of files) sim.world.overrides.set(relOf(nd, f.name), f.b);
  if (front) idx.designs.unshift(nd);
  else idx.designs.push(nd);
  idx.count = idx.designs.length;
  return nd;
}

/** Changes the bytes of one picture "in the repo" and in the index. Returns the design and the file entry. */
function changePicture(sim, d, pattern) {
  const f = d.files.find((x) => pattern.test(x.name));
  const rel = relOf(d, f.name);
  const orig = fs.readFileSync(path.join(REPO_ROOT, rel));
  const changed = Buffer.concat([orig.subarray(0, orig.length - 10), Buffer.from('CHANGED-IMAGE-BYTES!')]);
  sim.world.overrides.set(rel, changed);
  f.bytes = changed.length;
  return f;
}

test('F9b stopAll() while a slice is running: that slice ends after its current design, schedules nothing, nothing restarts', (t) => {
  const idx = pickSubset(FULL_INDEX, 40);
  const sim = newSim(idx, { vars: { TIME_BUDGET_MS: 600000 } }); // the budget alone would not end this slice
  sim.addTrigger('syncDaily', 'daily');
  let stopT = 0;
  let filesAtStop = 0;
  sim.world.onFetchAll = (n) => {
    if (n !== 6) return;
    stopT = sim.clock.now();
    filesAtStop = sim.world.files().length;
    sim.exec('stopAll'); // fired from inside the running slice, which holds the lock
  };
  const r = sim.exec('syncDaily');
  sim.world.onFetchAll = null;
  t.ok(!r.error, 'threw');
  t.ok(stopT > 0, 'the hook never fired (the slice was too short)');
  t.eq(sim.props.has('STOPPED'), true, 'stop flag');
  t.eq(sim.liveTriggers().map((x) => x.handler), [], 'triggers left (no continuation, no daily job, no safety trigger)');
  t.eq(sim.drain(), 0, 'runs that still fire');
  t.ok(sim.world.files().length < totalFiles(idx), 'the slice should have ended before copying everything');
  t.ok(sim.clock.now() - stopT <= sim.getVar('STOP_CHECK_MS') + 40000, `the slice kept running ${(sim.clock.now() - stopT) / 1000} s after stopAll`);
  t.ok(sim.world.files().length - filesAtStop <= 60, `${sim.world.files().length - filesAtStop} more pictures were fetched after stopAll`);
  t.ok(sim.logs.some((l) => /stopAll\(\) was run; ending this slice/.test(l)), 'log line says why the slice ended');
  t.ok(sim.logs.some((l) => /switched off by stopAll\(\); nothing more is scheduled/.test(l)), 'log line says nothing is scheduled');
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'stopped', 'progress kind');
  t.eq(sim.props.get('FAIL_STREAK'), '0', 'a stop is not a failure');
  const root = sim.rootNode();
  t.ok(Object.values(sim.readState(root.id).designs).filter((e) => e.sig).length >= 1, 'progress saved before ending');
  t.list(verifyState(sim, idx, { allDone: false }), 'state');
  t.eq(sim.mails.length, 0, 'mails');
  // until setup() is run again, nothing does any work
  const m = sim.mark();
  sim.exec('sync');
  sim.exec('syncDaily');
  sim.exec('recheckAll');
  const x = sim.since(m);
  t.eq([x.fetches, x.reads, x.writes], [0, 0, 0], 'fetches/reads/writes by sync/syncDaily/recheckAll after stopAll');
  t.eq(sim.liveTriggers().length, 0, 'triggers after those runs');
  t.ok(x.logs.some((l) => /switched off by stopAll/.test(l)), 'they say why they do nothing');
  t.ok(sim.exec('status').error === null && sim.logs.some((l) => /SWITCHED OFF by stopAll/.test(l)), 'status() says it is switched off');
  // setup() switches it on again and the copy finishes
  sim.exec('setup');
  sim.drain();
  t.eq(sim.props.has('STOPPED'), false, 'stop flag cleared by setup()');
  t.list(verifyDrive(sim, idx), 'drive after setup()');
  t.eq(mailsTo(sim, /complete/).length, 1, 'completion mail');
  t.eq(sim.liveTriggers().map((x) => x.handler), ['syncDaily'], 'only the daily trigger at the end');
});

test('F9c stopAll() arriving after the copy loop has looked for it for the last time still leaves no continuation behind', (t) => {
  const sim = newSim(SMALL_INDEX, { vars: { TIME_BUDGET_MS: 30000 } }); // the slice ends by its budget, as "partial"
  sim.addTrigger('syncDaily', 'daily');
  let fired = false;
  sim.drive.onWrite = (op, n) => {
    if (fired || n.name !== '_sync-state.json') return; // the first state save is the final one of this short slice
    fired = true;
    sim.exec('stopAll');
  };
  sim.exec('syncDaily');
  sim.drive.onWrite = null;
  t.ok(fired, 'the hook never fired');
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'partial', 'the slice ended by its time budget');
  t.eq(sim.liveTriggers().map((x) => x.handler), [], 'triggers left (finish_ must not schedule the next slice)');
  t.eq(sim.drain(), 0, 'runs that still fire');
});

test('F25 a slice killed by Google (a request hangs past the 6-minute limit) is restarted by the safety trigger, not by tomorrow\'s daily run', (t) => {
  const idx = pickSubset(FULL_INDEX, 30);
  const sim = newSim(idx); // default 270 s budget
  sim.addTrigger('syncDaily', 'daily');
  sim.world.inject({ src: 'raw', kind: 'file', mode: 'slow', delay: 500000, skip: 40, times: 1 }); // the 41st picture request hangs for 500 s
  const t0 = sim.clock.now();
  const r = sim.exec('syncDaily', { killAfterS: 360 });
  t.eq(r.killed, true, 'the run should have been killed (is the hang reached?)');
  const pending = sim.syncTriggers().filter((x) => !x.fired);
  t.eq(pending.length, 1, 'safety trigger left behind by the killed run');
  t.eq(pending[0] && pending[0].delay, sim.getVar('SAFETY_AFTER_MS'), 'its delay');
  t.eq(sim.liveTriggers().filter((x) => x.handler === 'syncDaily').length, 1, 'daily trigger kept');
  t.eq(sim.lockHeld, false, 'lock of the dead run');
  t.eq(sim.mails.length, 0, 'mails after a killed run');
  const killedAt = sim.clock.now();
  t.eq(sim.drain() >= 1, true, 'the safety trigger fires');
  t.eq(sim.syncTriggers().length, 0, 'triggers left at the end');
  t.ok(sim.clock.now() - killedAt < 3 * 3600 * 1000, 'restart came after ' + (sim.clock.now() - killedAt) / 60000 + ' fake minutes');
  t.ok(sim.clock.now() - t0 < 12 * 3600 * 1000, 'the copy was done long before the next daily run');
  t.list(verifyDrive(sim, idx), 'drive after the restart (no duplicates, nothing missing)');
  t.list(verifyState(sim, idx), 'state');
  t.list(verifyCatalog(sim, idx), 'catalog');
  t.eq(mailsTo(sim, /complete/).length, 1, 'completion mail');
  t.ok(sim.world.files().length <= totalFiles(idx) + 8, `${sim.world.files().length} pictures fetched for ${totalFiles(idx)} (only the hung batch may be fetched twice)`);
  t.eq(sim.liveTriggers().map((x) => x.handler), ['syncDaily'], 'triggers at the end');
});

test('F26 fetchAll fails and the one-by-one requests are slow: the slice ends at its time budget, not at the 6-minute limit', (t) => {
  const sim = newSim(pickSubset(FULL_INDEX, 3), { vars: { TIME_BUDGET_MS: 40000 } });
  const nd = addWide(sim, 901, 8, { front: true });
  sim.world.inject({ src: 'raw', kind: 'file', mode: 'throw', times: 1 }); // the first fetchAll throws as a whole
  sim.world.inject({ src: 'raw', kind: 'file', mode: 'slow', delay: 15000 }); // after that every request takes 15 s
  const r = sim.exec('sync');
  t.ok(!r.error, 'threw');
  t.ok(sim.runs[0].secs < 70, `the first slice took ${sim.runs[0].secs} s of script time for a 40 s budget`);
  t.ok(sim.world.files().length <= 5, `${sim.world.files().length} one-by-one requests were made for 8 pictures`);
  t.eq(sim.syncTriggers().length, 1, 'continuation scheduled');
  t.eq(sim.syncTriggers()[0].delay, sim.getVar('RETRY_DELAYS_MIN')[0] * 60000, 'a slice that copied nothing waits the first retry back-off (5 min) instead of hammering');
  t.eq(liveNamed(sim, `${nd.folder}_lifestyle.png`).filter((n) => n.size !== nd.files[0].bytes).length, 0, 'wrong-size file written');
  sim.world.clearRules();
  sim.drain();
  t.list(verifyDrive(sim, sim.world.index), 'drive after the network recovered');
  maxElapsedOk(t, sim, 'F26');
});

test('F27 Drive "Unexpected error while getting the method or property ..." is retried like any backend hiccup', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const idx = sim.world.index;
  changePicture(sim, idx.designs[4], /^image_02\./); // this design is inspected again: a folder listing and a create
  const text = (op) => `Exception: Unexpected error while getting the method or property ${op} on object DriveApp.Folder.`;
  sim.drive.inject({ op: 'getFiles', times: 2, error: text('getFiles') });
  sim.drive.inject({ op: 'createFile', times: 2, error: text('createFile') });
  sim.drive.inject({ op: 'getFilesByName', times: 1, error: text('getFilesByName') });
  const s0 = sim.sleeps.length;
  sim.nextDay();
  const r = sim.exec('syncDaily');
  t.ok(!r.error, 'threw');
  t.ok(sim.sleeps.length - s0 >= 3, 'retries with a pause: ' + (sim.sleeps.length - s0));
  t.ok(!sim.logs.some((l) => /^ERROR/.test(l)), 'ERROR lines: ' + sim.logs.filter((l) => /^ERROR/.test(l)).slice(0, 2).join(' | '));
  t.list(verifyDrive(sim, idx), 'drive');
  t.list(verifyState(sim, idx), 'state');
  // a bad folder id is not a hiccup: it fails at once and clearly, without writing anything
  const sim2 = newSim();
  sim2.setVar('ROOT_FOLDER_ID', 'nope');
  sim2.exec('sync');
  t.eq(sim2.drive.writes, 0, 'bad ROOT_FOLDER_ID: Drive writes');
  t.ok(sim2.logs.some((l) => /cannot be opened/.test(l)), 'bad ROOT_FOLDER_ID: clear message');
});

test('F28 the index came from the stale jsDelivr cache: pictures already saved are not replaced or trashed', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const idx = sim.world.index;
  const stale = clone(idx); // what jsDelivr still serves
  const d = idx.designs[6];
  const f = changePicture(sim, d, /^image_01\./);
  sim.nextDay();
  sim.exec('syncDaily'); // GitHub is fine: Drive gets the newer picture
  t.list(verifyDrive(sim, idx), 'drive after the normal run');
  const root = sim.rootNode();
  const newerId = sim.readState(root.id).designs[`${d.dir}/${d.slide}`].files[backupFileName(d, f.name)];
  // (a) GitHub raw cannot serve the index, jsDelivr serves the old one
  sim.world.indexBySrc.cdn = stale;
  sim.world.inject({ src: 'raw', kind: 'index', mode: '503' });
  sim.nextDay();
  const m = sim.mark();
  const r = sim.exec('syncDaily');
  const x = sim.since(m);
  t.ok(!r.error, 'threw');
  t.eq([x.files, x.writes], [0, 0], 'picture fetches / Drive writes with the stale index');
  t.ok(x.logs.some((l) => /index: \d+ designs from jsDelivr/.test(l)), 'the log says the index came from jsDelivr');
  t.list(verifyDrive(sim, idx), 'drive still holds the newer picture');
  t.eq(sim.drive.nodes.get(newerId).trashed, false, 'newer picture trashed');
  // (b) the same, but the state file is gone, so Drive itself has to be inspected
  sim.stateNode(root.id).trashed = true;
  sim.nextDay();
  const m2 = sim.mark();
  sim.exec('syncDaily');
  const y = sim.since(m2);
  t.eq(y.files, 0, 'picture fetches');
  t.eq(y.writeLog.filter((w) => w.op === 'setTrashed').length, 0, 'trashed');
  t.eq(y.writeLog.filter((w) => w.op === 'createFile').map((w) => w.name), ['_sync-state.json'], 'files created');
  t.ok(y.logs.some((l) => /^WARN .*another size than the cached index/.test(l)), 'warning for the picture that differs');
  const prog = JSON.parse(sim.props.get('PROGRESS'));
  t.eq([prog.kind, prog.pending], ['incomplete', 1], 'the design that differs is left open');
  t.list(verifyDrive(sim, idx), 'drive untouched');
  // (c) GitHub is back: the open design is settled from Drive, nothing is downloaded or replaced
  sim.world.clearRules();
  sim.world.indexBySrc = {};
  sim.nextDay();
  const m3 = sim.mark();
  sim.exec('syncDaily');
  const z = sim.since(m3);
  t.eq(z.files, 0, 'picture fetches');
  t.eq(z.writeLog.filter((w) => w.op === 'setTrashed' || (w.op === 'createFile' && w.name !== '_sync-state.json')).length, 0, 'trash/create');
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'complete', 'complete again');
  t.list(verifyDrive(sim, idx), 'drive');
  t.list(verifyState(sim, idx), 'state');
  t.list(verifyCatalog(sim, idx), 'catalog');
});

test('F29 a run that died between saving the new copy of a changed picture and trashing the old one: the next run trashes the old one', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const idx = sim.world.index;
  const d = idx.designs[3];
  const f = changePicture(sim, d, /^image_02\./);
  const bname = backupFileName(d, f.name);
  sim.drive.inject({ op: 'setTrashed', times: 1, error: 'Exception: Something odd happened' }); // not retried: the run stops right here
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(liveNamed(sim, bname).length, 2, 'precondition: both copies are in the folder');
  t.ok(sim.logs.some((l) => l.startsWith('ERROR') && l.includes(`${d.dir}/${d.slide}`)), 'the failure names the design');
  sim.drive.faults.length = 0;
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  const x = sim.since(m);
  t.eq(x.files, 0, 'picture fetches');
  t.eq(x.writeLog.filter((w) => w.op === 'createFile').length, 0, 'files created');
  t.eq(x.writeLog.filter((w) => w.op === 'setTrashed').length, 1, 'files trashed');
  t.eq(liveNamed(sim, bname).map((n) => n.size), [f.bytes], 'copies left under that name');
  t.list(verifyDrive(sim, idx), 'drive');
  t.list(verifyState(sim, idx), 'state');
  t.list(verifyCatalog(sim, idx), 'catalog');
  t.eq(mailsTo(sim, /complete/).length, 1, 'no second completion mail');
});

test('F30 the Catalog ends up inside the backup folder even if moving it fails; a changed ROOT_FOLDER_ID gets its own Catalog', (t) => {
  const spreadsheets = (sim) => [...sim.drive.nodes.values()].filter((n) => n.sheets && !n.trashed);
  // (a) one transient failure is retried
  const sim = newSim();
  sim.drive.inject({ op: 'moveTo', times: 1, error: 'Exception: Service error: Drive' });
  runToCompletion(sim);
  t.ok(sim.catalogNode(sim.rootNode().id), 'Catalog in the root');
  t.eq(spreadsheets(sim).length, 1, 'spreadsheets');
  // (b) a failure that is not retried: this run cannot finish, the next day completes the job without a second sheet
  const sim2 = newSim();
  sim2.drive.inject({ op: 'moveTo', times: 1, error: 'Exception: Something odd happened' });
  sim2.exec('setup');
  sim2.drain();
  t.eq(spreadsheets(sim2).length, 1, 'spreadsheets after the failed move');
  t.eq(spreadsheets(sim2)[0].parent, sim2.drive.root.id, 'sheet is still loose in My Drive');
  t.ok(sim2.logs.some((l) => /catalog not written/.test(l)), 'the log says so');
  t.eq(mailsTo(sim2, /complete/).length, 0, 'no completion mail while the Catalog is missing');
  t.eq(JSON.parse(sim2.props.get('PROGRESS')).kind, 'incomplete', 'run kind');
  sim2.nextDay();
  sim2.exec('syncDaily');
  sim2.drain();
  t.eq(spreadsheets(sim2).length, 1, 'spreadsheets after the next day');
  t.list(verifyCatalog(sim2, SMALL_INDEX), 'catalog');
  t.eq(mailsTo(sim2, /complete/).length, 1, 'completion mail once the Catalog is in place');
  t.list(verifyDrive(sim2, SMALL_INDEX), 'drive');
  // (c) the owner switches to another folder the way the error text says (ROOT_ID deleted, ROOT_FOLDER_ID set)
  const sim3 = newSim();
  runToCompletion(sim3);
  const oldRoot = sim3.rootNode();
  const oldSheet = sim3.catalogNode(oldRoot.id);
  const oldCalls = oldSheet.sheets[0].setValuesCalls.length;
  const oldState = sim3.stateNode(oldRoot.id).text.toString('utf8');
  const newRoot = sim3.drive._mk('folder', 'Second root', sim3.drive.root.id);
  sim3.props.delete('ROOT_ID');
  sim3.setVar('ROOT_FOLDER_ID', newRoot.id);
  sim3.nextDay();
  sim3.exec('syncDaily');
  sim3.drain();
  t.ok(sim3.catalogNode(newRoot.id), 'the new root has its own Catalog');
  t.eq(sim3.drive.liveChildren(oldRoot.id, 'file').filter((n) => n.name === 'Catalog').length, 1, 'old root still has its Catalog');
  t.eq(oldSheet.sheets[0].setValuesCalls.length, oldCalls, 'old Catalog rewritten');
  t.eq(sim3.stateNode(oldRoot.id).text.toString('utf8'), oldState, 'old state file rewritten');
  t.ok(sim3.stateNode(newRoot.id), 'the new root has its own state file');
  t.eq(sim3.drive.liveChildren(newRoot.id, 'file').filter((n) => n.name === 'README.txt').length, 1, 'the new root has a README.txt');
  t.eq(spreadsheets(sim3).length, 2, 'spreadsheets in total');
});

test('F31 Catalog text columns stay text ("007", "5/8", "2026-10-09" are not turned into a number or a date)', (t) => {
  const idx = clone(SMALL_INDEX);
  idx.designs[0].style = '007';
  idx.designs[0].specs.size = '5/8';
  idx.designs[0].specs.season = '2026-10-09';
  idx.designs[1].specs.technique = '1E5';
  idx.designs[1].specs.description = 'TRUE';
  idx.designs[2].style = '393638';
  const sim = newSim(idx);
  runToCompletion(sim);
  t.list(verifyCatalog(sim, idx), 'catalog');
  const rows = sim.catalogNode(sim.rootNode().id).sheets[0].rows;
  t.eq([rows[1][1], rows[1][6], rows[1][7], rows[2][4], rows[2][3], rows[3][1]], ['007', '5/8', '2026-10-09', '1E5', 'TRUE', '393638'], 'cells');
  t.eq([typeof rows[3][1], typeof rows[1][2], typeof rows[1][9], typeof rows[1][16]], ['string', 'number', 'number', 'string'], 'cell types (style text, slide and files numbers, date text)');
  // control: without the plain-text format this simulator really does mangle those cells
  const bare = GS_SRC.replace(/^\s*sh\.getRange\(1, \d+, rows\.length, \d+\)\.setNumberFormat\('@'\);.*$/gm, '');
  t.ok(bare !== GS_SRC, 'control script differs from the real one');
  const sim2 = new Sim(idx, { src: bare });
  runToCompletion(sim2);
  t.ok(verifyCatalog(sim2, idx).length > 0, 'the simulator must notice mangled cells when the text format is missing');
});

test('F32 the downloaded index cannot redirect downloads: repo, branch and site come from the script', (t) => {
  const evil = clone(SMALL_INDEX);
  evil.repo = 'attacker/stolen';
  evil.branch = 'evil';
  evil.siteBase = 'https://evil.example.com';
  const sim = newSim(evil);
  runToCompletion(sim);
  t.eq(sim.world.log.filter((l) => /evil|attacker/.test(l.url)).length, 0, 'requests to the hostile addresses');
  t.eq(sim.world.log.filter((l) => !/^https:\/\/(raw\.githubusercontent\.com|cdn\.jsdelivr\.net|www\.creativehomedecorllp\.com)\//.test(l.url)).length, 0, 'requests to other hosts');
  t.ok(sim.logs.some((l) => /^WARN {2}index names attacker\/stolen/.test(l)), 'a warning names the mismatch');
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive');
  const rows = sim.catalogNode(sim.rootNode().id).sheets[0].rows;
  t.ok(rows.slice(1).every((r) => r[15] === '' || r[15].startsWith('https://www.creativehomedecorllp.com/images/')), 'website image URLs');
});

test('F33 README.txt: written once, an existing one is kept, no Drive call on a quiet day, never rewritten', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const root = sim.rootNode();
  const readme = sim.drive.liveChildren(root.id, 'file').find((n) => n.name === 'README.txt');
  t.ok(readme && readme.text.toString('utf8').startsWith('CHD DESIGN LIBRARY - BACKUP IN GOOGLE DRIVE'), 'README.txt written');
  readme.text = Buffer.from('my own notes');
  readme.size = 12;
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  t.eq(sim.since(m).writes, 0, 'Drive writes on a quiet day');
  t.eq(readme.text.toString('utf8'), 'my own notes', 'edited README.txt overwritten');
  readme.trashed = true; // the owner deletes it: it is not forced back
  sim.nextDay();
  const m2 = sim.mark();
  sim.exec('syncDaily');
  t.eq(sim.since(m2).writes, 0, 'Drive writes after the README was trashed');
  // a README.txt that already exists before the first run is adopted, not replaced
  const sim2 = newSim();
  const custom = sim2.drive._mk('folder', 'Mine', sim2.drive.root.id);
  sim2.drive._mk('file', 'README.txt', custom.id, { size: 4, text: Buffer.from('mine'), mime: 'text/plain' });
  sim2.setVar('ROOT_FOLDER_ID', custom.id);
  runToCompletion(sim2);
  const rs = sim2.drive.liveChildren(custom.id, 'file').filter((n) => n.name === 'README.txt');
  t.eq(rs.map((n) => n.text.toString('utf8')), ['mine'], 'pre-existing README.txt');
  t.ok(sim2.stateNode(custom.id) && sim2.readState(custom.id).readme, 'state remembers the adopted README');
});

test('F34 the state file is found by its id (a by-name search that is far behind cannot make a second one); Drive search lag is harmless', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const root = sim.rootNode();
  const stateId = sim.stateNode(root.id).id;
  sim.drive.hideFromSearch.add('_sync-state.json');
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  t.eq(sim.since(m).writes, 0, 'Drive writes');
  t.eq(liveNamed(sim, '_sync-state.json').map((n) => n.id), [stateId], 'state files');
  // the remembered id belongs to one root only
  sim.props.set('STATE_ID_ROOT', 'some-other-root');
  sim.drive.hideFromSearch.clear();
  sim.nextDay();
  const m2 = sim.mark();
  sim.exec('syncDaily');
  t.eq(sim.since(m2).writes, 0, 'Drive writes when the id has to be found by name again');
  t.eq(sim.props.get('STATE_ID_ROOT') === root.id || sim.props.get('STATE_ID_ROOT') === 'some-other-root', true, 'property sanity');
  // a normal multi-slice copy with a 20 s search lag: nothing is duplicated
  const sim2 = newSim(SMALL_INDEX, { vars: { TIME_BUDGET_MS: 30000 } });
  sim2.drive.searchLagMs = 20000;
  sim2.exec('setup');
  sim2.drain();
  t.ok(sim2.runs.length >= 3, 'slices: ' + sim2.runs.length);
  t.list(verifyDrive(sim2, SMALL_INDEX), 'drive with a 20 s search lag');
  for (const name of ['_sync-state.json', 'README.txt']) t.eq(liveNamed(sim2, name).length, 1, `${name} files`);
  t.list(verifyCatalog(sim2, SMALL_INDEX), 'catalog');
});

test('F35 OAuth scopes: userinfo.email is declared; without it the mail still reaches the owner; every other missing scope fails clearly', (t) => {
  const scopes = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')).oauthScopes;
  t.ok(scopes.includes('https://www.googleapis.com/auth/userinfo.email'), 'manifest lists userinfo.email');
  const sim = newSim(SMALL_INDEX, { scopes: scopes.filter((x) => !x.endsWith('userinfo.email')) });
  sim.exec('setup');
  sim.drain();
  t.eq(sim.mails.map((x) => x.to), [EMAIL], 'recipient without the Session scope (Drive owner fallback)');
  t.list(verifyDrive(sim, SMALL_INDEX), 'drive');
  for (const [missing, what] of [['/auth/drive', 'Drive'], ['script.scriptapp', 'ScriptApp'], ['script.external_request', 'UrlFetchApp']]) {
    const s2 = newSim(SMALL_INDEX, { scopes: scopes.filter((x) => !x.endsWith(missing)) });
    const ok = s2.exec('selfTest').value;
    const r = s2.exec('setup');
    t.ok(r.error === null, `setup() threw without ${what}`);
    t.eq(ok, false, `selfTest without ${what}`);
    t.ok(s2.logs.some((l) => /^FAIL /.test(l) && l.includes('Required permissions')), `selfTest names the missing permission (${what})`);
    t.eq([s2.drive.writes, s2.liveTriggers().length], [0, 0], `setup() without ${what} must install nothing`);
  }
});

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

test(`F36 chaos (${SEEDS} seeds): random kills, stops, Drive and network faults and a changing library never store a wrong-size picture and heal to an exact copy`, (t) => {
  const idx = pickSubset(FULL_INDEX, 30);
  const seeds = SEEDS;
  const driveErrors = ['Exception: Service error: Drive', 'Exception: Unexpected error while getting the method or property createFile on object DriveApp.Folder.', 'Exception: Something odd happened', 'Exception: Server error occurred. Please try again.'];
  let kills = 0;
  let stops = 0;
  let runs = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const rnd = mulberry32(seed * 7919);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const sim = newSim(idx, { vars: { TIME_BUDGET_MS: 20000 + Math.floor(rnd() * 120000) } });
    sim.drive.speed = 1 + rnd() * 3;
    sim.addTrigger('syncDaily', 'daily');
    // every size a picture has had in the index so far: a stored picture must always have one of them
    const allowed = new Map();
    const allow = (d, f) => {
      const k = backupFileName(d, f.name);
      if (!allowed.has(k)) allowed.set(k, new Set());
      allowed.get(k).add(f.bytes);
    };
    for (const d of idx.designs) for (const f of d.files) allow(d, f);
    const check = (when, noDuplicates) => {
      const seen = new Set();
      for (const n of sim.drive.nodes.values()) {
        if (n.trashed || n.sheets) continue;
        const key = n.parent + '/' + n.name;
        if (noDuplicates && seen.has(key)) t.ok(false, `seed ${seed} ${when}: duplicate "${n.name}" in one folder`);
        seen.add(key);
        if (n.kind === 'file' && allowed.has(n.name) && !allowed.get(n.name).has(n.size)) t.ok(false, `seed ${seed} ${when}: file ${n.name} has size ${n.size}, which no index ever asked for`);
      }
      t.ok(sim.liveTriggers().filter((x) => x.handler === 'sync').length <= 1, `seed ${seed} ${when}: more than one sync trigger`);
    };
    for (let day = 0; day < 6; day++) {
      sim.world.clearRules();
      sim.drive.faults.length = 0;
      sim.world.indexBySrc = {};
      // the library changes during the day: a picture gets other bytes (so there is real work on most days)
      const before = clone(sim.world.index);
      if (day > 0 && rnd() < 0.8) {
        for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
          const d = pick(sim.world.index.designs);
          const f = pick(d.files);
          const b = Buffer.alloc(1500 + Math.floor(rnd() * 4000), (seed + day + k) & 255);
          sim.world.overrides.set(relOf(d, f.name), b);
          f.bytes = b.length;
          allow(d, f);
        }
      }
      if (rnd() < 0.7) sim.world.inject({ src: pick(['raw', 'site', undefined]), kind: 'file', mode: pick(['429', '500', '503', 'html', 'truncate', 'pad', '404', 'throw', 'slow']), delay: 5000, times: 1 + Math.floor(rnd() * 25), skip: Math.floor(rnd() * 30) });
      if (rnd() < 0.6) sim.drive.inject({ op: pick(['createFile', 'createFolder', 'setContent', 'setTrashed', 'getFiles', 'getFilesByName', 'moveTo']), times: 1 + Math.floor(rnd() * 4), skip: Math.floor(rnd() * 40), after: rnd() < 0.3, error: pick(driveErrors) });
      if (rnd() < 0.25) {
        sim.world.inject({ src: 'raw', kind: 'index', mode: '503' });
        sim.world.indexBySrc.cdn = before; // jsDelivr still serves yesterday's index
      }
      const kill = rnd() < 0.5 ? 15 + Math.floor(rnd() * 150) : 0;
      if (rnd() < 0.15) {
        sim.world.onFetchAll = (n) => {
          if (n === 3) {
            stops++;
            sim.exec('stopAll');
          }
        };
      }
      const r = sim.exec(day === 0 ? 'setup' : 'syncDaily', kill ? { killAfterS: kill } : {});
      sim.world.onFetchAll = null;
      runs++;
      if (r.killed) kills++;
      t.ok(!r.error, `seed ${seed} day ${day}: run threw ${r.error && r.error.message}`);
      try {
        sim.drain(60);
      } catch (e) {
        t.ok(false, `seed ${seed} day ${day}: ${e.message}`);
      }
      check(`day ${day}`, false);
      if (sim.props.has('STOPPED') && rnd() < 0.5) sim.exec('setup');
      sim.nextDay();
    }
    // heal: everything works again; the owner switches it on again if it was switched off
    sim.world.clearRules();
    sim.world.indexBySrc = {};
    sim.drive.faults.length = 0;
    sim.drive.speed = 1;
    sim.setVar('TIME_BUDGET_MS', 270000);
    sim.exec('setup');
    sim.drain();
    for (let i = 0; i < 2; i++) {
      sim.nextDay();
      sim.exec('syncDaily');
      sim.drain();
    }
    check('after healing', true);
    t.list(verifyDrive(sim, sim.world.index), `seed ${seed}: drive`);
    t.list(verifyState(sim, sim.world.index), `seed ${seed}: state`);
    t.list(verifyCatalog(sim, sim.world.index), `seed ${seed}: catalog`);
    t.eq(sim.syncTriggers().length, 0, `seed ${seed}: continuation triggers left`);
    t.eq(sim.liveTriggers().filter((x) => x.handler === 'syncDaily').length, 1, `seed ${seed}: daily triggers`);
    t.eq(mailsTo(sim, /complete/).length, 1, `seed ${seed}: completion mails`);
    t.eq(mailsTo(sim, /new design/).length, 0, `seed ${seed}: "new designs" mails (the chaos only changes pictures of existing designs, so no design may ever be announced as new)`);
    t.eq(liveNamed(sim, 'README.txt').length, 1, `seed ${seed}: README.txt files`);
    t.eq(liveNamed(sim, '_sync-state.json').length, 1, `seed ${seed}: state files`);
  }
  console.log(`        ${seeds} seeds, ${runs} runs, ${kills} killed, ${stops} stopAll during a slice`);
});

// ------------------------------------------------------------------ daily schedule (3 PM) and the "new designs" email
/** Appends `count` brand-new designs (small random pictures) to the library the fake internet serves. Returns them. */
function addNewDesigns(sim, count, { cat = 'rugs', prefix = 'CHD-RG-', styles = null, files = 2, size = 1500 } = {}) {
  const idx = sim.world.index;
  const category = idx.categories.find((c) => c.id === cat);
  const out = [];
  for (let i = 0; i < count; i++) {
    sim.newSeq = (sim.newSeq || 0) + 1;
    const style = styles ? styles[i] : prefix + (9000 + sim.newSeq);
    const slide = Math.max(0, ...idx.designs.filter((x) => x.dir === category.dir).map((x) => x.slide)) + 1;
    const fl = ['lifestyle.png', 'image_01.jpg', 'image_02.jpg', 'back.png'].slice(0, files).map((name, k) => ({ name, b: crypto.randomBytes(size + k * 97 + sim.newSeq) }));
    const nd = {
      cat: category.id, dir: category.dir, slide, style,
      folder: style.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, ''),
      specs: { styleNumber: style, description: 'TEST DESIGN', technique: 'WOVEN' },
      files: fl.map((f) => ({ name: f.name, bytes: f.b.length })),
    };
    for (const f of fl) sim.world.overrides.set(relOf(nd, f.name), f.b);
    idx.designs.push(nd);
    out.push(nd);
  }
  idx.count = idx.designs.length;
  return out;
}
const isOneOf = (designs) => (rel) => designs.some((nd) => rel.includes(`/${nd.dir}/slide_${pad3(nd.slide)}/`));
const summariesOf = (sim) => mailsTo(sim, /new design/);
const listedIn = (mail) => mail.body.split('\n').filter((l) => /^ {2}\S/.test(l)); // the indented lines = the list of designs
/** Rewrites the saved state file the way an older version (or a damaged file) would have left it. */
function rewriteState(sim, change) {
  const node = sim.stateNode(sim.rootNode().id);
  const st = JSON.parse(node.text.toString('utf8'));
  change(st);
  node.text = Buffer.from(JSON.stringify(st), 'utf8');
  node.size = node.text.length;
}

test('static: every mention says "daily / about 3 PM" (no "night" or "3 AM" left in the script)', (t) => {
  const left = GS_SRC.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /night|3 AM|tonight/i.test(l));
  t.eq(left.map(([i, l]) => `${i}: ${l.trim().slice(0, 70)}`), [], 'lines that still say night / 3 AM');
  t.ok(/var DAILY_HOUR = 15;/.test(GS_SRC), 'DAILY_HOUR is 15 (3 PM India time, ~90 minutes after the 1:30 PM publish)');
  t.ok(/syncDaily/.test(GS_SRC) && /function syncDaily\(\)/.test(GS_SRC), 'the trigger handler is still called syncDaily');
  t.ok(/shortly after the website's 1:30 PM publish/.test(GS_SRC), 'header says why 3 PM');
});

test('D1 the daily trigger: exactly one, at 15:00; setup() again (or over an old 3 AM trigger and duplicates) always leaves one at the current hour', (t) => {
  const sim = newSim();
  t.eq(sim.getVar('DAILY_HOUR'), 15, 'DAILY_HOUR');
  const r = sim.exec('setup');
  t.ok(!r.error, 'setup() threw');
  sim.drain();
  const daily = () => sim.liveTriggers().filter((x) => x.handler === 'syncDaily');
  t.eq(daily().map((x) => [x.kind, x.hour]), [['daily', 15]], 'daily triggers after setup()');
  t.eq(sim.liveTriggers().map((x) => x.handler), ['syncDaily'], 'all live triggers (no continuation left)');
  t.ok(sim.logs.some((l) => /^Daily trigger installed: every day at about 3 PM/.test(l)), 'setup() says 3 PM');
  const firstId = daily()[0].id;
  sim.exec('setup');
  sim.drain();
  sim.exec('setup');
  sim.drain();
  t.eq(daily().map((x) => x.hour), [15], 'daily triggers after setup() three times');
  t.ok(daily()[0].id !== firstId, 're-running setup() replaces the trigger (so it is always corrected)');
  t.eq(sim.triggers.filter((x) => x.handler === 'syncDaily' && !x.deleted).length, 1, 'live daily triggers');
  // an older install (3 AM) and a doubled-up trigger are both replaced by one at 15:00
  const old = newSim();
  old.addTrigger('syncDaily', 'daily');
  old.addTrigger('syncDaily', 'daily');
  old.addTrigger('syncDaily', 'daily', 0, 9);
  t.eq(old.liveTriggers().map((x) => x.hour), [3, 3, 9], 'precondition: stale daily triggers');
  old.exec('setup');
  old.drain();
  t.eq(old.liveTriggers().map((x) => [x.handler, x.hour]), [['syncDaily', 15]], 'triggers after setup() over stale ones');
  t.ok(old.logs.some((l) => /Replaced 3 earlier daily trigger\(s\)/.test(l)), 'the log says what was replaced');
  // Google refuses to create the new trigger: setup() says so, and the old daily job is still there (the new one is made BEFORE the old ones go)
  const flaky = newSim();
  flaky.addTrigger('syncDaily', 'daily');
  flaky.triggerFault = { handler: 'syncDaily', times: 1 };
  const rf = flaky.exec('setup');
  t.ok(rf.error && /too many times/.test(String(rf.error.message || rf.error)), 'setup() surfaces the trigger error: ' + (rf.error && rf.error.message));
  t.eq(flaky.liveTriggers().map((x) => [x.handler, x.hour]), [['syncDaily', 3]], 'the old daily trigger is still live after the failed re-install');
  t.eq(flaky.props.has('DAILY_HOUR_SET'), false, 'the move is not recorded when it did not happen');
  flaky.exec('setup');
  flaky.drain();
  t.eq(flaky.liveTriggers().map((x) => [x.handler, x.hour]), [['syncDaily', 15]], 'setup() again finishes the move');
  // a changed DAILY_HOUR is applied by running setup() again; the wording follows it
  old.setVar('DAILY_HOUR', 9);
  old.exec('setup');
  old.drain();
  t.eq(old.liveTriggers().map((x) => x.hour), [9], 'hour after changing DAILY_HOUR and running setup()');
  t.ok(old.logs.some((l) => /every day at about 9 AM/.test(l)), 'wording follows DAILY_HOUR');
  t.eq([0, 9, 12, 15, 23].map((h) => (old.setVar('DAILY_HOUR', h), old.getVar('dailyTimeText_()'))), ['12 AM', '9 AM', '12 PM', '3 PM', '11 PM'], 'dailyTimeText_');
  // the texts that reach the owner say daily / 3 PM
  const sim2 = newSim();
  runToCompletion(sim2);
  const done = mailsTo(sim2, /complete/)[0];
  t.ok(done && /every day \(about 3 PM India time, shortly after the website's 1:30 PM publish\)/.test(done.body) && !/night|3 AM/i.test(done.body), 'completion email wording: ' + (done && done.body.split('\n').slice(-3).join(' / ')));
  const readme = sim2.drive.liveChildren(sim2.rootNode().id, 'file').find((n) => n.name === 'README.txt');
  const rt = readme.text.toString('utf8');
  t.ok(/Kept up to date every day .*\(about 3 PM India time, shortly after\nthe website's 1:30 PM publish\)/.test(rt) && !/night|3 AM/i.test(rt), 'README.txt wording');
  // a failing-backup mail says "every day" too
  const sim3 = newSim();
  sim3.world.inject({ kind: 'index', mode: '500' });
  sim3.exec('syncDaily');
  sim3.drain();
  const fail = mailsTo(sim3, /failing/)[0];
  t.ok(fail && /keeps trying every day/.test(fail.body), 'failing mail wording');
});

test('D2 the first full copy sends ONLY the "complete" email (also over many slices); nothing is listed as new while it runs', (t) => {
  for (const budget of [270000, 30000]) {
    const sim = newSim(SMALL_INDEX, { vars: { TIME_BUDGET_MS: budget } });
    sim.exec('setup');
    if (budget < 270000) {
      const mid = sim.readState(sim.rootNode().id);
      t.eq([mid.initialDone, mid.news], [false, []], `[${budget}] state in the middle of the first copy`);
      t.eq(sim.syncTriggers().length, 1, `[${budget}] first slice leaves a continuation`);
    }
    sim.drain();
    if (budget < 270000) t.ok(sim.runs.length >= 3, `[${budget}] several slices, got ${sim.runs.length}`);
    t.eq(sim.mails.map((x) => x.subject), ['CHD design library backup is complete'], `[${budget}] mails over the whole first copy`);
    const st = sim.readState(sim.rootNode().id);
    t.eq([st.v, st.initialDone, st.news, st.newsMore], [1, true, [], 0], `[${budget}] state after the first copy`);
    t.list(verifyDrive(sim, SMALL_INDEX), `[${budget}] drive`);
    sim.nextDay();
    sim.exec('syncDaily');
    t.eq(sim.mails.length, 1, `[${budget}] mails after a quiet day`);
  }
  // the first-complete email could not be sent: it is retried alone, a design that arrives meanwhile is announced afterwards
  const sim = newSim();
  sim.mailFails = true;
  runToCompletion(sim);
  t.eq(sim.mails.length, 0, 'precondition: the completion mail failed');
  addNewDesigns(sim, 1);
  sim.mailFails = false;
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(sim.mails.map((x) => x.subject), ['CHD design library backup is complete'], 'the retry day sends only the completion email');
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(sim.mails.map((x) => x.subject), ['CHD design library backup is complete', 'CHD design library: 1 new design backed up'], 'the next day announces the design that arrived in between');
});

test('D3 a day with new designs: exactly ONE summary with their style numbers, categories and the right totals; the next day sends nothing', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const root = sim.rootNode();
  t.eq(sim.mails.length, 1, 'mails after the first copy');
  const idx = sim.world.index;
  const before = idx.designs.length;
  addNewDesigns(sim, 1, { cat: 'rugs', styles: ['CHD-RG-3172'] });
  addNewDesigns(sim, 1, { cat: 'cushions', styles: ['CHD-CU-4410 (A)'], files: 3 });
  sim.nextDay();
  const m = sim.mark();
  const r = sim.exec('syncDaily');
  const x = sim.since(m);
  t.ok(!r.error, 'threw');
  t.eq(x.mails.length, 1, 'mails that day');
  const mail = x.mails[0] || { subject: '', body: '', to: '' };
  t.eq(mail.subject, 'CHD design library: 2 new designs backed up', 'subject');
  t.eq(mail.to, EMAIL, 'recipient');
  t.eq(listedIn(mail), ['  CHD-RG-3172 (Rugs)', '  CHD-CU-4410 (A) (Cushions)'], 'designs listed');
  t.ok(mail.body.includes(`The backup now holds ${before + 2} designs.`), 'total designs in the backup');
  t.ok(mail.body.includes(`Backup folder: https://drive.google.com/drive/folders/${root.id}`), 'Drive folder link');
  t.ok(mail.body.includes(`Catalog sheet: https://docs.google.com/spreadsheets/d/${sim.catalogNode(root.id).id}`), 'Catalog link');
  t.ok(mail.body.length < 700 && !/<[a-z]/i.test(mail.body) && !/night|3 AM/i.test(mail.body), 'short plain text (' + mail.body.length + ' characters)');
  t.ok(x.logs.some((l) => /^sync: complete \| .* this run \+2 designs \(2 new\), /.test(l)), 'the log line counts them: ' + x.logs.filter((l) => /^sync:/.test(l)).join(' | '));
  const st = sim.readState(root.id);
  t.eq([st.initialDone, st.news, st.newsMore], [true, [], 0], 'list cleared after the mail');
  t.list(verifyDrive(sim, idx), 'drive');
  t.list(verifyState(sim, idx), 'state');
  t.list(verifyCatalog(sim, idx), 'catalog');
  // the next day: nothing new, no mail, not even a state write
  sim.nextDay();
  const m2 = sim.mark();
  sim.exec('syncDaily');
  const y = sim.since(m2);
  t.eq([y.mails.length, y.writes], [0, 0], 'mails / Drive writes on the following quiet day');
  // one design the day after: a new summary for just that one (the earlier two are not repeated)
  addNewDesigns(sim, 1, { cat: 'throws', styles: ['CHD-TH-5001'] });
  sim.nextDay();
  const m3 = sim.mark();
  sim.exec('syncDaily');
  const z = sim.since(m3);
  t.eq(z.mails.map((e) => e.subject), ['CHD design library: 1 new design backed up'], 'singular subject');
  t.eq(listedIn(z.mails[0]), ['  CHD-TH-5001 (Throws)'], 'only the newest design');
  t.ok(z.mails[0].body.includes('1 new design was copied'), 'singular wording');
  t.eq(mailsTo(sim, /complete/).length, 1, 'still one completion mail');
});

test('D4 a summary mail that cannot be sent keeps the list, the next run retries it, and a mail problem never fails or changes the sync', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const idx = sim.world.index;
  addNewDesigns(sim, 2, { styles: ['CHD-RG-7001', 'CHD-RG-7002'] });
  sim.mailFails = true;
  sim.nextDay();
  const r = sim.exec('syncDaily');
  t.ok(!r.error, 'threw');
  const prog = JSON.parse(sim.props.get('PROGRESS'));
  t.eq([prog.kind, prog.pending, prog.failed], ['complete', 0, 0], 'the sync itself is unchanged');
  t.eq(sim.props.get('FAIL_STREAK'), '0', 'a mail problem is not a failed run');
  t.eq(sim.mails.length, 1, 'no new mail went out');
  t.list(verifyDrive(sim, idx), 'drive');
  t.eq(sim.readState(sim.rootNode().id).news.map((n) => n.s), ['CHD-RG-7001', 'CHD-RG-7002'], 'list kept in the state file');
  t.ok(sim.logs.some((l) => /list of 2 new design\(s\) is kept/.test(l)), 'the log says it is kept');
  // mail still broken the next day and another design arrives: the list grows
  addNewDesigns(sim, 1, { styles: ['CHD-RG-7003'] });
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(sim.readState(sim.rootNode().id).news.length, 3, 'list after a second failed day');
  // no recipient address at all behaves the same way
  sim.mailFails = false;
  sim.effectiveEmailFails = true;
  sim.drive.ownerFails = true;
  sim.nextDay();
  const r2 = sim.exec('syncDaily');
  t.ok(!r2.error && sim.mails.length === 1, 'no recipient: no mail and no crash');
  t.eq(sim.readState(sim.rootNode().id).news.length, 3, 'list kept when there is no recipient');
  // mail works again: ONE summary for everything that was waiting, then silence
  sim.effectiveEmailFails = false;
  sim.drive.ownerFails = false;
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  const x = sim.since(m);
  t.eq(x.mails.map((e) => e.subject), ['CHD design library: 3 new designs backed up'], 'the retry sends one mail');
  t.eq(listedIn(x.mails[0]), ['  CHD-RG-7001 (Rugs)', '  CHD-RG-7002 (Rugs)', '  CHD-RG-7003 (Rugs)'], 'all three named');
  t.eq(sim.readState(sim.rootNode().id).news, [], 'list cleared once the mail really went out');
  sim.nextDay();
  const m2 = sim.mark();
  sim.exec('syncDaily');
  t.eq(sim.since(m2).mails.length, 0, 'nothing is sent again');
  t.eq(sim.mails.length, 2, 'mails in total (completion + one summary)');
  // the mail went out but the state file cannot be saved afterwards: no crash, the outcome of the sync is unchanged
  const sim5 = newSim();
  runToCompletion(sim5);
  addNewDesigns(sim5, 1, { styles: ['CHD-RG-7500'] });
  sim5.drive.inject({ op: 'setContent', match: (n) => n === '_sync-state.json', skip: 1, times: 1, error: 'Exception: Something odd happened' }); // the 2nd save of the run = the one after the mail
  sim5.nextDay();
  const r5 = sim5.exec('syncDaily');
  t.ok(!r5.error, 'a failing state save after the mail: threw');
  t.eq(JSON.parse(sim5.props.get('PROGRESS')).kind, 'complete', 'a failing state save after the mail: outcome');
  t.eq(summariesOf(sim5).length, 1, 'the mail was sent');
  t.ok(sim5.logs.some((l) => /new-designs summary problem/.test(l)), 'the problem is logged, not thrown');
  t.list(verifyDrive(sim5, sim5.world.index), 'drive');
});

test('D5 state file lost (or unreadable) after the first copy: Drive is re-inspected, NO flood of "new design" mail, and new designs are announced again afterwards', (t) => {
  for (const how of ['trashed', 'garbage']) {
    const sim = newSim();
    runToCompletion(sim);
    const idx = sim.world.index;
    const root = sim.rootNode();
    const node = sim.stateNode(root.id);
    if (how === 'trashed') node.trashed = true;
    else {
      node.text = Buffer.from('{ this is not json', 'utf8');
      node.size = node.text.length;
    }
    sim.nextDay();
    const m = sim.mark();
    const r = sim.exec('syncDaily');
    sim.drain();
    const x = sim.since(m);
    t.ok(!r.error, `[${how}] threw`);
    t.ok(x.logs.some((l) => /state: .*(no _sync-state.json yet|unreadable)/.test(l)), `[${how}] the log says the state was rebuilt`);
    t.eq(x.files, 0, `[${how}] picture fetches`);
    t.eq(x.mails.length, 0, `[${how}] mails after rebuilding the state (none of the ${idx.designs.length} designs may be called new)`);
    const st = sim.readState(root.id);
    t.eq([st.initialDone, st.news, st.newsMore], [true, [], 0], `[${how}] rebuilt state`);
    t.list(verifyState(sim, idx), `[${how}] state`);
    // from then on a new design is announced as usual
    addNewDesigns(sim, 1, { styles: ['CHD-RG-7100'] });
    sim.nextDay();
    sim.exec('syncDaily');
    t.eq(summariesOf(sim).map((e) => listedIn(e)), [['  CHD-RG-7100 (Rugs)']], `[${how}] the next new design is announced`);
    t.eq(sim.mails.length, 2, `[${how}] mails in total`);
  }
});

test('D6 a design whose picture or specs were replaced/updated is NOT "new": normal day, recheckAll(), a signature bump, and a failed update that is repaired later', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const idx = sim.world.index;
  const root = sim.rootNode();
  changePicture(sim, idx.designs[4], /^image_02\./);
  idx.designs[5].specs.season = 'WINTER 2027';
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  const x = sim.since(m);
  t.eq(x.files, 1, 'picture fetches (the replaced picture)');
  t.ok(x.logs.some((l) => /^sync: complete \| .* this run \+2 designs, .* 1 replaced/.test(l)), 'the log mentions the replacement, not a new design: ' + x.logs.filter((l) => /^sync:/.test(l)).join(' | '));
  t.eq(x.mails.length, 0, 'mails after a replaced picture and a spec edit');
  t.eq(sim.readState(root.id).news, [], 'list');
  // recheckAll() blanks every signature and inspects every design again
  sim.exec('recheckAll');
  sim.drain();
  t.eq(sim.mails.length, 1, 'mails after recheckAll() (only the completion mail from the first copy)');
  // a new signature version re-inspects everything too
  sim.setVar('SIG_VERSION', 2);
  sim.nextDay();
  const m2 = sim.mark();
  sim.exec('syncDaily');
  const y = sim.since(m2);
  t.ok(y.reads > idx.designs.length, 'every design was inspected again (' + y.reads + ' reads)');
  t.eq(sim.mails.length, 1, 'mails after a signature bump');
  // an update that fails and is repaired later: the design had been complete before, so it is still not new
  const d = idx.designs[7];
  const f = changePicture(sim, d, /^image_01\./);
  sim.world.inject({ kind: 'file', mode: '404', match: (rel) => rel === relOf(d, f.name) });
  sim.nextDay();
  sim.exec('syncDaily');
  const key = `${d.dir}/${d.slide}`;
  const mid = sim.readState(root.id).designs[key];
  t.ok(JSON.parse(sim.props.get('PROGRESS')).kind === 'incomplete' && mid && mid.sig === '' && mid.at, 'precondition: the update failed and the design is open (its earlier backup date is kept): ' + JSON.stringify(mid && [mid.sig, mid.at]));
  sim.world.clearRules();
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'complete', 'repaired');
  t.eq(sim.mails.length, 1, 'mails after the repair');
  t.eq(sim.readState(root.id).news, [], 'list after the repair');
  t.list(verifyDrive(sim, idx), 'drive');
  t.list(verifyCatalog(sim, idx), 'catalog');
});

test('D7 a new design that failed to copy is not reported until it is copied; the others are announced the same day, with the stuck one named as waiting', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const idx = sim.world.index;
  const before = idx.designs.length;
  const [a, b] = addNewDesigns(sim, 2, { styles: ['CHD-RG-7201', 'CHD-RG-7202'] });
  sim.world.inject({ kind: 'file', mode: '404', match: isOneOf([a]) });
  sim.nextDay();
  const m1 = sim.mark();
  sim.exec('syncDaily');
  const x1 = sim.since(m1);
  const root = sim.rootNode();
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'incomplete', 'day 1: one design is still open');
  t.eq(x1.mails.map((e) => e.subject), ['CHD design library: 1 new design backed up'], 'day 1: the design that was copied is announced the same day');
  t.eq(listedIn(x1.mails[0]), ['  CHD-RG-7202 (Rugs)'], 'day 1: only the design that really was copied is listed');
  t.ok(x1.mails[0].body.includes('1 design could not be copied yet (CHD-RG-7201). It is tried again every day.'), 'day 1: the stuck design is named as waiting: ' + x1.mails[0].body.split('\n').slice(-8).join(' / '));
  t.ok(x1.mails[0].body.includes(`The backup now holds ${before + 1} designs.`), 'day 1: total counts the design that is in Drive, not the stuck one');
  t.eq(sim.readState(root.id).news, [], 'day 1: list cleared after the mail');
  sim.nextDay();
  const m2 = sim.mark();
  sim.exec('syncDaily');
  t.eq(sim.since(m2).mails.length, 0, 'day 2 (still failing, nothing new): no summary');
  sim.world.clearRules();
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  const x = sim.since(m);
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'complete', 'day 3: complete');
  t.eq(x.mails.map((e) => e.subject), ['CHD design library: 1 new design backed up'], 'day 3: one summary');
  t.eq(listedIn(x.mails[0]), ['  CHD-RG-7201 (Rugs)'], 'day 3: the design that was waiting, once (the other one is not repeated)');
  t.ok(!x.mails[0].body.includes('could not be copied'), 'day 3: nothing is waiting any more');
  t.ok(x.mails[0].body.includes(`The backup now holds ${before + 2} designs.`), 'day 3: total');
  t.eq(sim.props.get('FAIL_STREAK'), '0', 'day 3: the failed-run streak is back to 0');
  t.list(verifyDrive(sim, idx), 'drive');
  // a single new design that fails first: nothing at all until it is copied (nothing was copied, so there is nothing to announce), then exactly it
  const sim2 = newSim();
  runToCompletion(sim2);
  const [c] = addNewDesigns(sim2, 1, { styles: ['CHD-RG-7301'] });
  sim2.world.inject({ kind: 'file', mode: '404', match: isOneOf([c]) });
  sim2.nextDay();
  sim2.exec('syncDaily');
  sim2.world.clearRules();
  t.eq(sim2.mails.length, 1, 'single failing design: no summary on the failing day');
  sim2.nextDay();
  sim2.exec('syncDaily');
  t.eq(summariesOf(sim2).map((e) => listedIn(e)), [['  CHD-RG-7301 (Rugs)']], 'single failing design: announced the day it is copied');
});

test('D8 more than 25 new designs: the mail names 25 and says "... and N more"; the saved list is capped at NEWS_MAX but the count stays right', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const nds = addNewDesigns(sim, 30, { size: 600 });
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  sim.drain();
  const x = sim.since(m);
  t.eq(x.mails.length, 1, 'mails');
  const mail = x.mails[0] || { subject: '', body: '' };
  t.eq(mail.subject, 'CHD design library: 30 new designs backed up', 'subject counts all 30');
  const lines = listedIn(mail);
  t.eq(lines.length, 26, 'lines in the list (25 designs + the "and more" line)');
  t.eq(lines.slice(0, 25), nds.slice(0, 25).map((nd) => `  ${nd.style} (Rugs)`), 'the first 25 designs');
  t.eq(lines[25], '  ... and 5 more', 'the rest is counted');
  t.ok(!mail.body.includes(nds[25].style), 'the 26th style is not named');
  t.ok(mail.body.includes(`The backup now holds ${sim.world.index.designs.length} designs.`), 'total');
  // exactly 25 and exactly 26 (boundary)
  for (const [n, tail] of [[25, null], [26, '  ... and 1 more']]) {
    const s2 = newSim();
    runToCompletion(s2);
    addNewDesigns(s2, n, { size: 500, files: 1 });
    s2.nextDay();
    s2.exec('syncDaily');
    s2.drain();
    const l2 = listedIn(summariesOf(s2)[0]);
    t.eq([l2.length, l2[l2.length - 1]], tail ? [26, tail] : [25, '  CHD-RG-' + (9000 + n) + ' (Rugs)'], `${n} new designs`);
  }
  // the state file keeps at most NEWS_MAX names; the rest is only counted (here NEWS_MAX = 5, the mail is broken for a day)
  const run = (src) => {
    const s3 = new Sim(SMALL_INDEX, { src, vars: { NEWS_MAX: 5 } });
    runToCompletion(s3);
    addNewDesigns(s3, 8, { size: 500, files: 1 });
    s3.mailFails = true;
    s3.nextDay();
    s3.exec('syncDaily');
    return s3;
  };
  const s3 = run(undefined);
  const st = s3.readState(s3.rootNode().id);
  t.eq([st.news.length, st.newsMore], [5, 3], 'saved list: 5 names + 3 counted');
  s3.mailFails = false;
  s3.nextDay();
  s3.exec('syncDaily');
  const big8 = summariesOf(s3)[0] || { subject: '', body: '' };
  t.eq(big8.subject, 'CHD design library: 8 new designs backed up', 'subject still counts all 8');
  t.eq([listedIn(big8).length, listedIn(big8)[5]], [6, '  ... and 3 more'], 'list: 5 names + "and 3 more"');
  t.eq([s3.readState(s3.rootNode().id).news.length, s3.readState(s3.rootNode().id).newsMore], [0, 0], 'cleared after sending');
  // control: without the cap the simulator notices
  const uncapped = GS_SRC.replace('if (st.news.length < NEWS_MAX) {', 'if (true) {');
  t.ok(uncapped !== GS_SRC, 'control script differs from the real one');
  const s4 = run(uncapped);
  t.ok(s4.readState(s4.rootNode().id).news.length > 5, 'the simulator must notice a list without the NEWS_MAX cap');
});

test('D9 new designs found over several partial slices are collected in the state and sent ONCE, by the slice that completes', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const idx = sim.world.index;
  const nds = addNewDesigns(sim, 12, { files: 3, size: 3000 });
  sim.setVar('TIME_BUDGET_MS', 8000);
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  t.eq(sim.syncTriggers().length, 1, 'the first slice leaves a continuation (more to do)');
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'partial', 'first slice is partial');
  t.eq(sim.since(m).mails.length, 0, 'no mail after the first (partial) slice');
  const part = sim.readState(sim.rootNode().id).news;
  t.ok(part.length >= 1 && part.length < 12, `the list is saved while slices follow (${part.length} so far)`);
  sim.drain();
  const x = sim.since(m);
  t.ok(sim.runs.length >= 4, 'several slices were needed: ' + sim.runs.length);
  t.eq(x.mails.length, 1, 'mails over all slices');
  t.eq(x.mails[0] && x.mails[0].subject, 'CHD design library: 12 new designs backed up', 'subject');
  t.eq(listedIn(x.mails[0]), nds.map((nd) => `  ${nd.style} (Rugs)`).slice(0, 12), 'all 12 named, none twice');
  t.eq(sim.readState(sim.rootNode().id).news, [], 'cleared');
  t.list(verifyDrive(sim, idx), 'drive');
  t.list(verifyCatalog(sim, idx), 'catalog');
  maxElapsedOk(t, sim, 'D9');
  // a slice killed by the 6-minute limit in the middle of this does not announce anything twice or lose a design
  const sim2 = newSim();
  runToCompletion(sim2);
  const more = addNewDesigns(sim2, 6, { files: 2, size: 4000 });
  sim2.nextDay();
  sim2.exec('syncDaily', { killAfterS: 9 });
  sim2.drain();
  t.eq(summariesOf(sim2).map((e) => listedIn(e)), [more.map((nd) => `  ${nd.style} (Rugs)`)], 'after a kill: one mail, every design once');
  t.list(verifyDrive(sim2, sim2.world.index), 'drive after the kill');
});

test('D10 a state file written before the "new designs" email existed still loads (v stays 1); the upgrade day names nothing; a damaged list is repaired', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const idx = sim.world.index;
  rewriteState(sim, (st) => {
    delete st.initialDone;
    delete st.news;
    delete st.newsMore;
  });
  addNewDesigns(sim, 2, { styles: ['CHD-RG-7401', 'CHD-RG-7402'] });
  sim.nextDay();
  const m = sim.mark();
  const r = sim.exec('syncDaily');
  const x = sim.since(m);
  t.ok(!r.error, 'threw');
  t.ok(!x.logs.some((l) => /unreadable/.test(l)), 'the old state is accepted as it is (not rebuilt)');
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'complete', 'complete');
  t.eq(x.writeLog.filter((w) => w.op === 'createFile' && w.name === '_sync-state.json').length, 0, 'no second state file');
  t.eq(x.mails.length, 0, 'the first day on the new script names nothing (it cannot tell old from new yet)');
  const st = sim.readState(sim.rootNode().id);
  t.eq([st.v, st.initialDone, st.news, st.newsMore], [1, true, [], 0], 'state after that day');
  t.list(verifyDrive(sim, idx), 'drive (both designs were copied)');
  addNewDesigns(sim, 1, { styles: ['CHD-RG-7403'] });
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(summariesOf(sim).map((e) => listedIn(e)), [['  CHD-RG-7403 (Rugs)']], 'from the next day on new designs are announced');
  // a hand-damaged list: junk entries are dropped, good ones are used
  rewriteState(sim, (s) => {
    s.news = [null, 5, { s: 'CHD-OLD-1 (x)', c: 'Rugs' }, { c: 'no style' }, { s: 'CHD-OLD-2' }];
    s.newsMore = 'x';
  });
  sim.nextDay();
  const m2 = sim.mark();
  const r2 = sim.exec('syncDaily');
  t.ok(!r2.error, 'damaged list: threw');
  const x2 = sim.since(m2);
  t.eq(x2.mails.map((e) => e.subject), ['CHD design library: 2 new designs backed up'], 'damaged list: subject');
  t.eq(listedIn(x2.mails[0]), ['  CHD-OLD-1 (x) (Rugs)', '  CHD-OLD-2'], 'damaged list: names');
  // news that is not even an array, initialDone of the wrong type: treated like an old state (the first copy counts as not finished), nothing breaks
  rewriteState(sim, (s) => {
    s.news = 'oops';
    s.initialDone = 'yes';
  });
  addNewDesigns(sim, 1, { styles: ['CHD-RG-7404'] });
  sim.nextDay();
  const m3 = sim.mark();
  const r3 = sim.exec('syncDaily');
  t.ok(!r3.error && sim.since(m3).mails.length === 0, 'a news value of the wrong type does not break the run, and does not announce anything');
  const st3 = sim.readState(sim.rootNode().id);
  t.eq([st3.initialDone, st3.news], [true, []], 'state after that run');
});

/** One compact day-by-day story that a correct script passes cleanly; returns what went wrong. Used to prove that the checks catch broken variants. */
function dailyStory(src) {
  const P = [];
  const sim = new Sim(SMALL_INDEX, { src });
  sim.addTrigger('syncDaily', 'daily'); // an older install that ran at 3 AM
  sim.exec('setup');
  sim.drain();
  const daily = sim.liveTriggers().filter((x) => x.handler === 'syncDaily');
  if (daily.length !== 1 || daily[0].hour !== 15) P.push(`daily triggers after setup(): ${JSON.stringify(daily.map((x) => x.hour))}`);
  if (sim.mails.length !== 1) P.push(`mails after the first copy: ${sim.mails.length}`);
  const [a, b] = addNewDesigns(sim, 2, { styles: ['CHD-RG-8001', 'CHD-RG-8002'] });
  sim.world.inject({ kind: 'file', mode: '404', match: isOneOf([a]) });
  sim.nextDay();
  sim.exec('syncDaily'); // a fails, b is copied: the run is incomplete, but b is announced the same day and a is named as waiting
  const day1 = summariesOf(sim);
  if (day1.length !== 1 || JSON.stringify(listedIn(day1[0])) !== JSON.stringify([`  ${b.style} (Rugs)`])) P.push(`summary on the day one design failed: ${JSON.stringify(day1.map((e) => listedIn(e)))}`);
  else if (!day1[0].body.includes(`could not be copied yet (${a.style})`)) P.push('the design that could not be copied is not named in the summary');
  sim.world.clearRules();
  sim.mailFails = true;
  sim.nextDay();
  sim.exec('syncDaily'); // complete, but the mail cannot be sent
  const kept = sim.readState(sim.rootNode().id).news.map((n) => n.s);
  if (JSON.stringify(kept) !== JSON.stringify([a.style])) P.push(`list after a failed mail: ${JSON.stringify(kept)}`);
  sim.mailFails = false;
  sim.nextDay();
  sim.exec('syncDaily');
  if (summariesOf(sim).length !== 2 || !summariesOf(sim)[1].body.includes(a.style) || summariesOf(sim)[1].body.includes(b.style)) P.push(`summary after the mail works again: ${summariesOf(sim).length} mails`);
  sim.nextDay();
  sim.exec('syncDaily');
  if (summariesOf(sim).length !== 2) P.push('a mail on a day with nothing new');
  const d = sim.world.index.designs[4]; // a replaced picture whose update fails first
  const f = changePicture(sim, d, /^image_01\./);
  sim.world.inject({ kind: 'file', mode: '404', match: (rel) => rel === relOf(d, f.name) });
  sim.nextDay();
  sim.exec('syncDaily');
  sim.world.clearRules();
  sim.nextDay();
  sim.exec('syncDaily');
  if (summariesOf(sim).length !== 2) P.push('a replaced design was announced as new');
  return P;
}

/** The first-complete email must go out ALONE: a list that is waiting is kept for the next run that sends summaries. Returns what went wrong. */
function aloneStory(src) {
  const P = [];
  const sim = new Sim(SMALL_INDEX, { src });
  sim.exec('setup');
  sim.drain();
  sim.nextDay();
  rewriteState(sim, (st) => {
    st.news = [{ s: 'CHD-X-1', c: 'Rugs' }];
  });
  sim.props.delete('MAIL_DONE'); // as if the first-complete mail had not been sent yet
  sim.exec('syncDaily');
  if (summariesOf(sim).length) P.push('a summary was sent in the run that sends the first-complete mail');
  if (mailsTo(sim, /complete/).length !== 2) P.push(`first-complete mails: ${mailsTo(sim, /complete/).length}`);
  sim.nextDay();
  sim.exec('syncDaily');
  if (summariesOf(sim).length !== 1 || !summariesOf(sim)[0].body.includes('CHD-X-1 (Rugs)')) P.push('the waiting list was not sent by the next completing run');
  return P;
}

/** One design that never copies while new designs arrive every day: the summaries, the "failing" alert and an upgraded state must all still work. */
function stuckStory(src) {
  const P = [];
  const sim = new Sim(SMALL_INDEX, { src });
  sim.exec('setup');
  sim.drain();
  const d = sim.world.index.designs[4];
  const f = changePicture(sim, d, /^image_01\./);
  sim.world.inject({ kind: 'file', mode: '404', match: (rel) => rel === relOf(d, f.name) }); // an update that never works
  for (let day = 1; day <= 3; day++) {
    const [nd] = addNewDesigns(sim, 1, { styles: ['CHD-RG-' + (8100 + day)] });
    sim.nextDay();
    sim.exec('syncDaily');
    const s = summariesOf(sim);
    if (s.length !== day || !s[day - 1].body.includes(nd.style)) P.push(`day ${day}: ${s.length} summaries, the newest does not name ${nd.style}`);
    else if (!s[day - 1].body.includes('could not be copied yet')) P.push(`day ${day}: the summary does not say that a design is waiting`);
  }
  if (mailsTo(sim, /failing/).length !== 1) P.push(`"failing" mails after 3 days with a stuck design: ${mailsTo(sim, /failing/).length}`);
  // a state from before the feature (the completion mail went out long ago) with a stuck design: the summaries must still switch on
  const up = new Sim(SMALL_INDEX, { src });
  up.exec('setup');
  up.drain();
  rewriteState(up, (st) => {
    delete st.initialDone;
    delete st.news;
    delete st.newsMore;
  });
  const d2 = up.world.index.designs[4];
  const f2 = changePicture(up, d2, /^image_01\./);
  up.world.inject({ kind: 'file', mode: '404', match: (rel) => rel === relOf(d2, f2.name) });
  up.nextDay();
  up.exec('syncDaily');
  if (up.readState(up.rootNode().id).initialDone !== true) P.push('an upgraded state with a stuck design never switched the summaries on');
  addNewDesigns(up, 1, { styles: ['CHD-RG-8200'] });
  up.nextDay();
  up.exec('syncDaily');
  if (summariesOf(up).length !== 1) P.push(`summaries after the upgrade day: ${summariesOf(up).length}`);
  return P;
}

/** The daily trigger: never left without one, corrected by a daily run and recorded only when moved. */
function triggerStory(src) {
  const P = [];
  const sim = new Sim(SMALL_INDEX, { src });
  sim.addTrigger('syncDaily', 'daily'); // 3 AM from an older install
  sim.triggerFault = { handler: 'syncDaily', times: 1 };
  sim.exec('setup');
  const left = sim.liveTriggers().filter((x) => x.handler === 'syncDaily').map((x) => x.hour);
  if (left.length !== 1 || left[0] !== 3) P.push(`daily triggers after Google refused the new one: ${JSON.stringify(left)}`);
  const sim2 = new Sim(SMALL_INDEX, { src });
  sim2.addTrigger('syncDaily', 'daily'); // new code pasted over an older install, setup() not run
  sim2.exec('syncDaily');
  sim2.drain();
  const now = sim2.liveTriggers().filter((x) => x.handler === 'syncDaily');
  if (now.length !== 1 || now[0].hour !== 15) P.push(`a daily run did not move the old trigger to 15:00: ${JSON.stringify(now.map((x) => x.hour))}`);
  const id = now[0] && now[0].id;
  sim2.nextDay();
  sim2.exec('syncDaily');
  const again = sim2.liveTriggers().filter((x) => x.handler === 'syncDaily');
  if (again.length !== 1 || again[0].id !== id) P.push('the daily trigger is replaced on every daily run');
  return P;
}

test('D11 mutation checks: the day-by-day stories pass on the real script and are caught on each broken variant (so the new tests can fail)', (t) => {
  t.eq(dailyStory(GS_SRC), [], 'dailyStory on the real script');
  t.eq(aloneStory(GS_SRC), [], 'aloneStory on the real script');
  t.eq(stuckStory(GS_SRC), [], 'stuckStory on the real script');
  t.eq(triggerStory(GS_SRC), [], 'triggerStory on the real script');
  const once = (from, to) => {
    t.eq(GS_SRC.split(from).length - 1, 1, 'mutation anchor is unique: ' + from.slice(0, 50));
    return GS_SRC.replace(from, () => to);
  };
  const installNew = "  ScriptApp.newTrigger('syncDaily').timeBased().everyDays(1).atHour(DAILY_HOUR).create();\n";
  const installOld = "  old.forEach(function (t) {\n    ScriptApp.deleteTrigger(t);\n  });\n";
  const broken = {
    'install trigger returns early when one exists (old behaviour)': [dailyStory, once(installNew + '  old.forEach', '  if (old.length) return;\n' + installNew + '  old.forEach')],
    'trigger hour back at 3': [dailyStory, once('var DAILY_HOUR = 15;', 'var DAILY_HOUR = 3;')],
    'a failed mail still clears the list': [dailyStory, once("var sent = sendMail_('CHD design library: '", "var sent = true;\n    sendMail_('CHD design library: '")],
    'a mail on a day with nothing new': [dailyStory, once('|| !st.initialDone || !st.news.length) return;', '|| !st.initialDone) return;')],
    'a design that was complete before counts as new when its update fails once': [dailyStory, once('var known = !!(entry && (entry.sig || entry.at));', 'var known = !!(entry && entry.sig);')],
    'the first copy lists every design as new': [dailyStory, once('  if (!st.initialDone) return;\n  ctx.newDesigns++;', '  ctx.newDesigns++;').replace('        st.news = [];\n        st.newsMore = 0;\n        ctx.firstComplete = true;', '        ctx.firstComplete = true;')],
    'no summary after a run that could not finish (one stuck design silences everything)': [stuckStory, once("} else if (kind === 'complete' || kind === 'incomplete' || kind === 'quota' || kind === 'stalled') {", "} else if (kind === 'complete') {")],
    'the stuck design is not named in the summary': [stuckStory, once("  var open = ctx.index.designs.length - ctx.totals.done;\n", "  return '';\n  var open = ctx.index.designs.length - ctx.totals.done;\n")],
    'an incomplete run that copied something does not count as a failed run': [stuckStory, once("var bad = kind === 'failed' || kind === 'incomplete' || ((kind", "var bad = kind === 'failed' || ((kind")],
    'a stuck design on an upgraded state keeps the summaries off': [stuckStory, once("(kind === 'incomplete' && PropertiesService.getScriptProperties().getProperty('MAIL_DONE'))", 'false')],
    'old daily triggers are deleted before the new one is made': [triggerStory, once(installNew + installOld, installOld + installNew)],
    'a daily run no longer corrects the trigger hour': [triggerStory, once('  if (!isStopped_()) ensureDailyHour_();\n', '')],
    'the moved hour is never recorded (the trigger is replaced on every daily run)': [triggerStory, once("setProperty('DAILY_HOUR_SET', String(DAILY_HOUR))", "setProperty('DAILY_HOUR_SET', 'x')")],
  };
  for (const [what, [story, src]] of Object.entries(broken)) t.ok(story(src).length > 0, `the simulator must notice: ${what}`);
  const both = once("    } else if (kind === 'complete' || kind === 'incomplete' || kind === 'quota' || kind === 'stalled') {", "    }\n    if (kind === 'complete') {\n      ctx.firstComplete = false;");
  t.ok(aloneStory(both).length > 0, 'the simulator must notice: a summary sent together with the first-complete mail');
});

test('D12 one design that cannot be copied does not silence the daily proof: every day with new designs still gets its summary (with the stuck one named), and the "failing" email still comes, once', (t) => {
  const sim = newSim();
  runToCompletion(sim);
  const idx = sim.world.index;
  const stuck = idx.designs[6]; // an existing design whose picture was replaced and now never downloads
  const f = changePicture(sim, stuck, /^image_01\./);
  sim.world.inject({ kind: 'file', mode: '404', match: (rel) => rel === relOf(stuck, f.name) });
  const days = [2, 2, 2, 2, 2, 0, 0, 2]; // five weekdays with a publish, a weekend without one, then Monday
  const announced = [];
  const failingAt = [];
  days.forEach((n, i) => {
    const day = i + 1;
    const nds = n ? addNewDesigns(sim, n) : [];
    sim.nextDay();
    const m = sim.mark();
    const r = sim.exec('syncDaily');
    const x = sim.since(m);
    t.ok(!r.error, `day ${day}: threw`);
    t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'incomplete', `day ${day}: the run cannot finish`);
    t.eq(sim.props.get('FAIL_STREAK'), String(day), `day ${day}: failed-run streak`);
    const sums = x.mails.filter((e) => /new design/.test(e.subject));
    if (n) {
      t.eq(sums.length, 1, `day ${day}: summaries`);
      t.eq(listedIn(sums[0] || { body: '' }), nds.map((nd) => `  ${nd.style} (Rugs)`), `day ${day}: exactly that day's designs`);
      t.ok((sums[0] || { body: '' }).body.includes(`1 design could not be copied yet (${stuck.style}).`), `day ${day}: the stuck design is named`);
      t.ok((sums[0] || { body: '' }).body.includes(`The backup now holds ${idx.designs.length} designs.`), `day ${day}: total`);
      announced.push(...listedIn(sums[0] || { body: '' }));
    } else t.eq(sums.length, 0, `day ${day}: no summary on a day with nothing new`);
    if (x.mails.some((e) => /failing/.test(e.subject))) failingAt.push(day);
    t.eq(sim.readState(sim.rootNode().id).news, [], `day ${day}: list cleared`);
  });
  t.eq(failingAt, [3], 'the "backup is failing" email: sent once, on the 3rd failing day, never again');
  const fail = mailsTo(sim, /failing/)[0] || { body: '' };
  t.ok(fail.body.includes(`${stuck.dir}/${stuck.slide}`), 'the failing email names the design: ' + fail.body.split('\n').slice(0, 4).join(' / '));
  t.eq(announced.length, 12, 'designs announced in total');
  t.eq(new Set(announced).size, 12, 'every design announced once');
  // repaired: complete again, nothing to announce (the stuck design was an update, not new), streak and failing-mail flag reset
  sim.world.clearRules();
  sim.nextDay();
  const m = sim.mark();
  sim.exec('syncDaily');
  const y = sim.since(m);
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'complete', 'repaired: complete');
  t.eq(y.mails.length, 0, 'repaired: no summary for an update');
  t.eq([sim.props.get('FAIL_STREAK'), sim.props.has('FAIL_MAILED')], ['0', false], 'repaired: streak and failing flag reset');
  t.list(verifyDrive(sim, idx), 'drive');
  t.list(verifyCatalog(sim, idx), 'catalog');
  addNewDesigns(sim, 1, { styles: ['CHD-RG-7900'] });
  sim.nextDay();
  sim.exec('syncDaily');
  const last = summariesOf(sim).slice(-1)[0] || { body: '' };
  t.eq(listedIn(last), ['  CHD-RG-7900 (Rugs)'], 'the next new design is announced');
  t.ok(!last.body.includes('could not be copied'), 'and no design is waiting any more');
});

test('D13 a daily run puts a daily trigger at the wrong hour (or doubled) right by itself; a trigger that cannot be created never fails the sync', (t) => {
  // new code pasted over an old install and only sync run: the 3 AM trigger fires with the new code
  const sim = newSim();
  sim.addTrigger('syncDaily', 'daily');
  sim.addTrigger('syncDaily', 'daily');
  const r = sim.exec('syncDaily');
  sim.drain();
  t.ok(!r.error, 'threw');
  const daily = () => sim.liveTriggers().filter((x) => x.handler === 'syncDaily');
  t.eq(daily().map((x) => x.hour), [15], 'daily triggers after the first daily run');
  t.eq(sim.props.get('DAILY_HOUR_SET'), '15', 'the hour is remembered');
  t.ok(sim.logs.some((l) => /^Daily trigger installed: every day at about 3 PM.* Replaced 2 earlier daily trigger\(s\)/.test(l)), 'the log says what was replaced');
  t.list(verifyDrive(sim, SMALL_INDEX), 'the sync itself ran normally');
  t.eq(mailsTo(sim, /complete/).length, 1, 'completion mail');
  // from then on the daily run leaves it alone
  const id = daily()[0].id;
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(daily().map((x) => x.id), [id], 'the trigger is not touched again');
  // DAILY_HOUR edited in the code: the next daily run moves it
  sim.setVar('DAILY_HOUR', 9);
  sim.nextDay();
  sim.exec('syncDaily');
  t.eq(daily().map((x) => x.hour), [9], 'hour after DAILY_HOUR was edited');
  // after stopAll() a daily run (a manual one) switches nothing on
  sim.exec('stopAll');
  t.eq(sim.liveTriggers().length, 0, 'triggers after stopAll');
  sim.setVar('DAILY_HOUR', 10); // so that there would be something to correct
  sim.exec('syncDaily');
  t.eq(sim.liveTriggers().length, 0, 'a daily run after stopAll() creates no trigger');
  // Google refuses to create the trigger: the run goes on, the old trigger stays, the next daily run tries again
  const sim2 = newSim();
  sim2.addTrigger('syncDaily', 'daily');
  sim2.triggerFault = { handler: 'syncDaily', times: 1 };
  const r2 = sim2.exec('syncDaily');
  sim2.drain();
  t.ok(!r2.error, 'a failing trigger install: threw');
  t.ok(sim2.logs.some((l) => /could not move it to 3 PM.*run setup\(\) once/.test(l)), 'the log says what to do');
  t.eq(sim2.liveTriggers().filter((x) => x.handler === 'syncDaily').map((x) => x.hour), [3], 'the old trigger is still there');
  t.list(verifyDrive(sim2, SMALL_INDEX), 'a failing trigger install: the sync itself ran normally');
  sim2.nextDay();
  sim2.exec('syncDaily');
  t.eq(sim2.liveTriggers().filter((x) => x.handler === 'syncDaily').map((x) => x.hour), [15], 'the next daily run finishes the move');
});

test('D14 a run that ends early (daily limit, repeated errors) or cannot write the Catalog still sends the summary for what it copied, and says why', (t) => {
  // Google's daily file limit hits in the middle of a day with 10 new designs
  const sim = newSim();
  runToCompletion(sim);
  const before = sim.world.index.designs.length;
  const nds = addNewDesigns(sim, 10, { files: 2, size: 800 });
  sim.drive.inject({ op: 'createFile', error: 'Exception: Service invoked too many times for one day: drive.', skip: 9 });
  sim.nextDay();
  const m = sim.mark();
  const r = sim.exec('syncDaily');
  const x = sim.since(m);
  t.ok(!r.error, 'quota: threw');
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'quota', 'quota: kind');
  t.eq(x.mails.length, 1, 'quota: one summary');
  const first = listedIn(x.mails[0] || { body: '' });
  t.ok(first.length >= 1 && first.length < 10, `quota: some of the designs were copied (${first.length})`);
  t.eq(first, nds.slice(0, first.length).map((nd) => `  ${nd.style} (Rugs)`), 'quota: the designs that were copied, in order');
  t.ok((x.mails[0] || { body: '' }).body.includes(`The backup now holds ${before + first.length} designs.`), 'quota: total counts only what is in Drive');
  t.ok((x.mails[0] || { body: '' }).body.includes('Google\'s daily limit was reached'), 'quota: the summary says why it stopped');
  sim.drive.faults.length = 0;
  sim.nextDay();
  sim.exec('syncDaily');
  sim.drain();
  const second = listedIn(summariesOf(sim)[1] || { body: '' });
  t.eq(first.concat(second), nds.map((nd) => `  ${nd.style} (Rugs)`), 'quota: the next day announces the rest, nobody twice');
  t.eq(summariesOf(sim).length, 2, 'quota: two summaries in all');
  t.list(verifyDrive(sim, sim.world.index), 'quota: drive');
  // six designs in a row fail: the run stops, but the two that were copied first are announced
  const sim2 = newSim();
  runToCompletion(sim2);
  const bad = addNewDesigns(sim2, 8, { files: 1, size: 700 });
  sim2.world.inject({ kind: 'file', mode: '404', match: isOneOf(bad.slice(2)) });
  sim2.nextDay();
  sim2.exec('syncDaily');
  t.eq(JSON.parse(sim2.props.get('PROGRESS')).kind, 'stalled', 'stalled: kind');
  const s2 = summariesOf(sim2);
  t.eq(s2.length, 1, 'stalled: one summary');
  t.eq(listedIn(s2[0] || { body: '' }), bad.slice(0, 2).map((nd) => `  ${nd.style} (Rugs)`), 'stalled: the designs that were copied');
  t.ok((s2[0] || { body: '' }).body.includes('Several designs in a row could not be copied'), 'stalled: the summary says why it stopped');
  sim2.world.clearRules();
  for (let day = 0; day < 4 && JSON.parse(sim2.props.get('PROGRESS')).kind !== 'complete'; day++) {
    sim2.nextDay();
    sim2.exec('syncDaily');
    sim2.drain();
  }
  t.eq(JSON.parse(sim2.props.get('PROGRESS')).kind, 'complete', 'stalled: complete once the problem is gone');
  t.eq(summariesOf(sim2).map((e) => listedIn(e)).flat().sort(), bad.map((nd) => `  ${nd.style} (Rugs)`).sort(), 'stalled: every design announced once over the days');
  t.list(verifyDrive(sim2, sim2.world.index), 'stalled: drive');
  // only the Catalog cannot be written: the new designs are announced, the Catalog is named as the open item
  const sim3 = newSim();
  runToCompletion(sim3);
  addNewDesigns(sim3, 2, { styles: ['CHD-RG-7601', 'CHD-RG-7602'] });
  sim3.drive.inject({ op: 'openSpreadsheet', times: 1, error: 'Exception: Something odd happened' });
  sim3.nextDay();
  const m3 = sim3.mark();
  sim3.exec('syncDaily');
  const x3 = sim3.since(m3);
  t.eq(JSON.parse(sim3.props.get('PROGRESS')).kind, 'incomplete', 'catalog: kind');
  t.eq(x3.mails.map((e) => e.subject), ['CHD design library: 2 new designs backed up'], 'catalog: one summary');
  t.ok((x3.mails[0] || { body: '' }).body.includes('The Catalog sheet could not be written this time.') && !(x3.mails[0] || { body: '' }).body.includes('design could not be copied'), 'catalog: the Catalog is named, no design is');
  sim3.nextDay();
  const m4 = sim3.mark();
  sim3.exec('syncDaily');
  t.eq([JSON.parse(sim3.props.get('PROGRESS')).kind, sim3.since(m4).mails.length], ['complete', 0], 'catalog: written the next day, nothing more to say');
  t.list(verifyCatalog(sim3, sim3.world.index), 'catalog: sheet');
  // a run in the middle of a pass ('partial') never sends anything, and the list waits for the slice that ends the pass
  const sim4 = newSim();
  runToCompletion(sim4);
  addNewDesigns(sim4, 6, { files: 3, size: 3000 });
  sim4.setVar('TIME_BUDGET_MS', 6000);
  sim4.nextDay();
  sim4.exec('syncDaily');
  t.eq(JSON.parse(sim4.props.get('PROGRESS')).kind, 'partial', 'partial: kind');
  t.eq(summariesOf(sim4).length, 0, 'partial: nothing sent mid-pass');
});

test('D15 a state from before the "new designs" email with a design that never copies: summaries switch on anyway; a first copy that never finished does not (and does not flood later)', (t) => {
  // (a) the first copy was finished long ago (its completion mail exists), a design has been stuck since, and the new code arrives
  const sim = newSim();
  runToCompletion(sim);
  rewriteState(sim, (st) => {
    delete st.initialDone;
    delete st.news;
    delete st.newsMore;
  });
  const stuck = sim.world.index.designs[4];
  const f = changePicture(sim, stuck, /^image_01\./);
  sim.world.inject({ kind: 'file', mode: '404', match: (rel) => rel === relOf(stuck, f.name) });
  addNewDesigns(sim, 2, { styles: ['CHD-RG-7701', 'CHD-RG-7702'] });
  sim.nextDay();
  const m = sim.mark();
  const r = sim.exec('syncDaily');
  t.ok(!r.error, 'threw');
  t.eq(JSON.parse(sim.props.get('PROGRESS')).kind, 'incomplete', 'upgrade day: the run cannot finish');
  t.eq(sim.since(m).mails.length, 0, 'upgrade day: nothing is named (old and new cannot be told apart yet)');
  const st = sim.readState(sim.rootNode().id);
  t.eq([st.v, st.initialDone, st.news], [1, true, []], 'upgrade day: summaries are switched on although the run was incomplete');
  addNewDesigns(sim, 1, { styles: ['CHD-RG-7703'] });
  sim.nextDay();
  const m2 = sim.mark();
  sim.exec('syncDaily');
  const x2 = sim.since(m2);
  t.eq(x2.mails.map((e) => e.subject), ['CHD design library: 1 new design backed up'], 'next day: one summary');
  t.eq(listedIn(x2.mails[0]), ['  CHD-RG-7703 (Rugs)'], 'next day: just that design');
  t.ok(x2.mails[0].body.includes(`could not be copied yet (${stuck.style})`), 'next day: the stuck design is named');
  // (b) a first copy that has not finished (one design never copies): nothing is announced as new, and no flood when it finally finishes
  const sim2 = newSim();
  const never = SMALL_INDEX.designs[2];
  sim2.world.inject({ kind: 'file', mode: '404', match: isOneOf([never]) });
  for (let day = 0; day < 3; day++) {
    sim2.exec('syncDaily');
    sim2.drain();
    sim2.nextDay();
  }
  const st2 = sim2.readState(sim2.rootNode().id);
  t.eq([st2.initialDone, st2.news], [false, []], 'unfinished first copy: nothing switched on');
  t.eq(sim2.mails.map((e) => e.subject), ['CHD design library backup is failing'], 'unfinished first copy: only the "failing" email (after 3 failing days), no summary');
  sim2.world.clearRules();
  sim2.exec('syncDaily');
  sim2.drain();
  t.eq(JSON.parse(sim2.props.get('PROGRESS')).kind, 'complete', 'unfinished first copy: finally complete');
  t.eq(sim2.mails.map((e) => e.subject), ['CHD design library backup is failing', 'CHD design library backup is complete'], 'unfinished first copy: then the completion email, still no summary');
  t.eq(sim2.readState(sim2.rootNode().id).news, [], 'unfinished first copy: nothing listed as new');
});

// ------------------------------------------------------------------ summary
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${QUICK ? ' (quick mode)' : ''}  (peak memory ${Math.round(process.resourceUsage().maxRSS / 1024)} MB)`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((f) => f.name).join('; '));
  process.exit(1);
}
