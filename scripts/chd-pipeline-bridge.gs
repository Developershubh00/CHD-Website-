// CHD Pipeline Bridge - lets the CHD publishing pipeline read/write ONLY
// the pipeline's own folders and sheets, guarded by a secret token.
// Deploy in Google Apps Script as a Web app (Execute as Me, access: Anyone).
// Run setup() once to mint the token; pass it as "token" in every POST.

var ALLOWED_FOLDERS = [
  '14ggFuEp3DR39HBhT9Qim9oIe9KYnwFbm'  // CHD Lifestyle Review
];
var ALLOWED_SHEETS = [
  '13C3pdkyFbPAauTS03IRIt-yQ44oLzQ_ViuPf2z6khWw', // CHD Design Intake - Responses
  '1xfut34jDvryqJd8Rpp7rV71WFUVY7X7pqRu0LfAr3Is'  // CHD Lifestyle Review Board
];

function setup() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('CHD_TOKEN');
  if (!token) {
    token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('CHD_TOKEN', token);
  }
  Logger.log('CHD_BRIDGE_TOKEN: ' + token);
  Logger.log('Now do: Deploy -> New deployment -> Web app (Execute as Me, access Anyone)');
}

function doPost(e) {
  var out = function (obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  };
  try {
    var req = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('CHD_TOKEN');
    if (!token || req.token !== token) return out({ ok: false, error: 'bad token' });

    switch (req.op) {
      case 'ping':
        return out({ ok: true, time: new Date().toISOString() });

      case 'upload': { // {folderId, name, mimeType, base64}
        if (ALLOWED_FOLDERS.indexOf(req.folderId) < 0) return out({ ok: false, error: 'folder not allowed' });
        var blob = Utilities.newBlob(Utilities.base64Decode(req.base64), req.mimeType, req.name);
        var f = DriveApp.getFolderById(req.folderId).createFile(blob);
        return out({ ok: true, id: f.getId(), url: f.getUrl() });
      }

      case 'download': { // {fileId} - images only
        var file = DriveApp.getFileById(req.fileId);
        if (String(file.getMimeType()).indexOf('image/') !== 0) return out({ ok: false, error: 'not an image' });
        return out({
          ok: true, name: file.getName(), mimeType: file.getMimeType(),
          base64: Utilities.base64Encode(file.getBlob().getBytes())
        });
      }

      case 'list': { // {folderId}
        if (ALLOWED_FOLDERS.indexOf(req.folderId) < 0) return out({ ok: false, error: 'folder not allowed' });
        var files = DriveApp.getFolderById(req.folderId).getFiles();
        var items = [];
        while (files.hasNext()) { var x = files.next(); items.push({ id: x.getId(), name: x.getName() }); }
        return out({ ok: true, files: items });
      }

      case 'read': { // {sheetId, tab?, range?}
        if (ALLOWED_SHEETS.indexOf(req.sheetId) < 0) return out({ ok: false, error: 'sheet not allowed' });
        var ss = SpreadsheetApp.openById(req.sheetId);
        var sh = req.tab ? ss.getSheetByName(req.tab) : ss.getSheets()[0];
        if (!sh) return out({ ok: false, error: 'tab not found' });
        var vals = req.range ? sh.getRange(req.range).getValues() : sh.getDataRange().getValues();
        return out({ ok: true, values: vals });
      }

      case 'append': { // {sheetId, tab?, rows: [[...],[...]]}
        if (ALLOWED_SHEETS.indexOf(req.sheetId) < 0) return out({ ok: false, error: 'sheet not allowed' });
        var ss2 = SpreadsheetApp.openById(req.sheetId);
        var sh2 = req.tab ? ss2.getSheetByName(req.tab) : ss2.getSheets()[0];
        if (!sh2) return out({ ok: false, error: 'tab not found' });
        for (var i = 0; i < req.rows.length; i++) sh2.appendRow(req.rows[i]);
        return out({ ok: true, appended: req.rows.length });
      }

      case 'update': { // {sheetId, tab?, range, values: [[...]]}
        if (ALLOWED_SHEETS.indexOf(req.sheetId) < 0) return out({ ok: false, error: 'sheet not allowed' });
        var ss3 = SpreadsheetApp.openById(req.sheetId);
        var sh3 = req.tab ? ss3.getSheetByName(req.tab) : ss3.getSheets()[0];
        if (!sh3) return out({ ok: false, error: 'tab not found' });
        sh3.getRange(req.range).setValues(req.values);
        return out({ ok: true });
      }

      default:
        return out({ ok: false, error: 'unknown op' });
    }
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
