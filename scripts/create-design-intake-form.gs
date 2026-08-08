/**
 * CHD — Design Intake Form builder
 * =================================
 * Run this ONCE in Google Apps Script (script.google.com) while signed in as
 * vikramjaglan11.official@gmail.com. It builds the whole intake system:
 *
 *   1. A Google Form ("CHD — New Design Upload") with every question the
 *      website's product pages need, with dropdowns and required fields so a
 *      designer cannot submit something incomplete.
 *   2. A Drive folder ("CHD Design Uploads") that receives the images.
 *   3. A response Google Sheet, linked to the form, that the daily pipeline
 *      reads to find new designs.
 *
 * HOW TO RUN
 *   1. Go to script.google.com -> New project
 *   2. Delete the sample code, paste this whole file in
 *   3. Press Run (choose the function `createDesignIntakeForm`)
 *   4. Approve the permission prompt (it is your own account)
 *   5. Open View -> Logs (or the Execution log) and send me the printed URLs
 *
 * Run it only once — each run creates a brand new form and sheet.
 */

// ---------------------------------------------------------------------------
// Configuration — matches the categories and spec fields used by the website
// ---------------------------------------------------------------------------
var FORM_TITLE = 'CHD — New Design Upload';
var UPLOAD_FOLDER_NAME = 'CHD Design Uploads';
var RESPONSE_SHEET_NAME = 'CHD Design Intake — Responses';

var CATEGORIES = [
  'Rugs',
  'Placemats',
  'Table Runners',
  'Cushions',
  'Throws',
  'Bedding',
  'Bath Mats',
  'Tote Bags',
];

var SEASONS = ['EVERYDAY', 'SPRING/SUMMER', 'FALL/WINTER', 'HOLIDAY'];

function createDesignIntakeForm() {
  // -------------------------------------------------------------------------
  // 1. Upload folder for the design images
  // -------------------------------------------------------------------------
  var uploadFolder = getOrCreateFolder_(UPLOAD_FOLDER_NAME);

  // -------------------------------------------------------------------------
  // 2. The form itself
  // -------------------------------------------------------------------------
  var form = FormApp.create(FORM_TITLE);
  form.setDescription(
    'Upload one new design per submission. Everything you enter here appears ' +
    'on the product page exactly as typed, so please use the same wording and ' +
    'capitalisation as our existing products (for example: WOVEN, COTTON + JUTE). ' +
    'The lifestyle image is generated automatically — you only need the flat ' +
    'front image and a close-up.'
  );

  // Collect the submitter's email so we know which designer sent what.
  // setCollectEmail is deprecated in newer runtimes, so fall back if needed.
  try {
    form.setCollectEmail(true);
  } catch (e) {
    try {
      form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED);
    } catch (e2) {
      Logger.log('NOTE: could not turn on email collection automatically: ' + e2);
    }
  }
  form.setAllowResponseEdits(true);
  form.setProgressBar(true);

  // --- Question 1: category -------------------------------------------------
  form.addListItem()
    .setTitle('Product category')
    .setHelpText('Which section of the website this design belongs to.')
    .setChoiceValues(CATEGORIES)
    .setRequired(true);

  // --- Question 2: style number --------------------------------------------
  form.addTextItem()
    .setTitle('Style number')
    .setHelpText('Example: CHD-RG-1450. This is shown as STYLE # on the product page.')
    .setRequired(true);

  // --- Question 3: description ---------------------------------------------
  form.addTextItem()
    .setTitle('Description')
    .setHelpText('Short product type, in caps. Examples: WOVEN RUG, CUSHION WITH FLANGE, TOTE BAG.')
    .setRequired(true);

  // --- Question 4: technique -----------------------------------------------
  form.addTextItem()
    .setTitle('Technique')
    .setHelpText('Examples: WOVEN, HAND WOVEN, PRINTED, TUFTED, EMBROIDERY.')
    .setRequired(true);

  // --- Question 5: content -------------------------------------------------
  form.addTextItem()
    .setTitle('Content')
    .setHelpText('Material composition. Examples: COTTON, COTTON + JUTE, COTTON CHINDI.')
    .setRequired(true);

  // --- Question 6: size ----------------------------------------------------
  form.addTextItem()
    .setTitle('Size')
    .setHelpText('Finished size with units. Examples: 24X36", 18X18", 50X60", QUEEN.')
    .setRequired(true);

  // --- Question 7: season --------------------------------------------------
  form.addListItem()
    .setTitle('Season')
    .setChoiceValues(SEASONS)
    .setRequired(true);

  // --- Question 8: lifestyle notes (optional) ------------------------------
  form.addParagraphTextItem()
    .setTitle('Notes for the lifestyle image (optional)')
    .setHelpText(
      'Leave blank for an automatic scene. Use this only if you want something ' +
      'specific, for example "styled in a child\'s bedroom" or "with autumn props".'
    )
    .setRequired(false);

  // -------------------------------------------------------------------------
  // 3. The two image upload questions
  //
  // Apps Script's FormApp cannot create file-upload questions, so we call the
  // Google Forms REST API directly with this script's own credentials. If that
  // call is not permitted (the Forms API may need enabling on the project),
  // the script keeps going and tells you how to add the two questions by hand.
  // -------------------------------------------------------------------------
  var uploadsAdded = tryAddFileUploadQuestions_(form.getId(), uploadFolder.getId());

  // -------------------------------------------------------------------------
  // 4. Response spreadsheet
  // -------------------------------------------------------------------------
  var spreadsheet = SpreadsheetApp.create(RESPONSE_SHEET_NAME);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());

  // -------------------------------------------------------------------------
  // 5. Report everything
  // -------------------------------------------------------------------------
  var lines = [
    '',
    '==================== CHD DESIGN INTAKE CREATED ====================',
    '',
    'Share this link with the design team (they fill this in):',
    '  ' + form.getPublishedUrl(),
    '',
    'Form editor (to tweak wording later):',
    '  ' + form.getEditUrl(),
    '',
    'Response sheet (the pipeline reads this):',
    '  ' + spreadsheet.getUrl(),
    '',
    'Upload folder (images land here):',
    '  ' + uploadFolder.getUrl(),
    '  folder id: ' + uploadFolder.getId(),
    '',
    'Image upload questions: ' + (uploadsAdded
      ? 'added automatically ✔'
      : 'NOT added — see the instructions below'),
    '',
  ];

  if (!uploadsAdded) {
    lines = lines.concat([
      'ADD THE TWO UPLOAD QUESTIONS BY HAND (about 30 seconds):',
      '  1. Open the form editor link above',
      '  2. Click + to add a question, title it "Front card image (flat 2D product image)",',
      '     change the question type to "File upload", allow only Image, max 1 file, mark Required',
      '  3. Repeat for a second question titled "Close-up image (fabric / weave detail)"',
      '  4. Keep these as the LAST two questions so the column order stays predictable',
      '',
    ]);
  }

  lines.push('Send these URLs back to Claude to finish wiring the pipeline.');
  lines.push('==================================================================');

  var report = lines.join('\n');
  Logger.log(report);
  return report;
}

/**
 * Finds a top-level Drive folder by name, or creates it.
 */
function getOrCreateFolder_(name) {
  var existing = DriveApp.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return DriveApp.createFolder(name);
}

/**
 * Adds the two file-upload questions through the Forms REST API.
 * Returns true on success, false if the API call was not permitted.
 */
function tryAddFileUploadQuestions_(formId, folderId) {
  var uploads = [
    {
      title: 'Front card image (flat 2D product image)',
      description: 'The straight-on product image. This is what the lifestyle image is generated from, so upload the highest quality version you have.',
      index: 8,
    },
    {
      title: 'Close-up image (fabric / weave detail)',
      description: 'A detail shot showing the texture and weave.',
      index: 9,
    },
  ];

  var requests = uploads.map(function (upload) {
    return {
      createItem: {
        item: {
          title: upload.title,
          description: upload.description,
          questionItem: {
            question: {
              required: true,
              fileUploadQuestion: {
                folderId: folderId,
                types: ['IMAGE'],
                maxFiles: 1,
                maxFileSize: '10485760', // 10 MB
              },
            },
          },
        },
        location: { index: upload.index },
      },
    };
  });

  try {
    var response = UrlFetchApp.fetch(
      'https://forms.googleapis.com/v1/forms/' + formId + ':batchUpdate',
      {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        payload: JSON.stringify({ requests: requests }),
        muteHttpExceptions: true,
      }
    );

    if (response.getResponseCode() === 200) return true;

    Logger.log(
      'Forms API declined to add the upload questions (HTTP ' +
      response.getResponseCode() + '): ' + response.getContentText()
    );
    return false;
  } catch (e) {
    Logger.log('Forms API call failed: ' + e);
    return false;
  }
}
