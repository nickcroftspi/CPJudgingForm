/**
 * Coolest Projects judging form - score collector.
 *
 * Paste this over the whole contents of the SUBMIT script (the one whose /exec URL
 * is SUBMIT_URL in index.html), then:
 *   Deploy > Manage deployments > (pencil icon) > Version: New version > Deploy
 * Using "New version" on the EXISTING deployment keeps the same /exec URL, so
 * index.html needs no change.
 *
 * Why this rewrite exists
 * -----------------------
 * Ten concurrent submissions were tested against the previous version. All ten
 * received {"result":"success"} but only three rows reached the sheet: concurrent
 * executions each read the same last-row position and overwrote one another, so
 * scores were lost silently while judges were told they had been saved.
 *
 * Two things prevent that here:
 *   1. LockService serialises the read-append cycle, so no two executions can
 *      target the same row.
 *   2. appendRow() is used instead of computing a row index by hand.
 *
 * A submission_id sent by the page is also recorded, so that if a judge's browser
 * retries a submission whose response was lost in transit, the retry is recognised
 * and does not create a duplicate row.
 */

var SPREADSHEET_ID = '19QRmlokzpN_DiClcxC0v_Xwk5cUt-Mv9-TMjVGV0n2E'; // rpf.io/judging-scores
var SHEET_NAME = 'Sheet1';

// Columns A-K, in the order they appear in the sheet.
var FIELDS = ['desk_no', 'project_name', 'category', 'team', 'judge_name',
              'coolness', 'complexity', 'presentation', 'design', 'comments'];
var NUMERIC_FIELDS = ['coolness', 'complexity', 'presentation', 'design'];

function doPost(e) {
  var params = (e && e.parameter) || {};
  var submissionId = String(params.submission_id || '');

  // Work that does not need serialising happens BEFORE taking the lock. Opening the
  // spreadsheet takes a second or two, and holding the lock across it made ten
  // concurrent submissions take 38-68s each. Google stops returning the response body
  // (you get a 404 page instead) once an execution runs that long, so the write
  // succeeded but the judge's browser could not read the confirmation.

  // Cheap short-circuit for an obvious retry. This is only an optimisation: the
  // authoritative check happens again inside the lock, because two retries arriving
  // together could both pass this one.
  if (submissionId && alreadyRecorded(submissionId)) {
    return jsonOut({ result: 'success', duplicate: true });
  }

  var sheet;
  try {
    sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  } catch (err) {
    return jsonOut({ result: 'error', message: String(err && err.message || err) });
  }
  if (!sheet) {
    return jsonOut({ result: 'error', message: 'Sheet "' + SHEET_NAME + '" not found' });
  }

  var row = FIELDS.map(function (field) {
    var value = params[field] === undefined ? '' : params[field];
    if (NUMERIC_FIELDS.indexOf(field) !== -1 && value !== '') {
      var number = Number(value);
      return isNaN(number) ? value : number;
    }
    return value;
  });

  var lock = LockService.getScriptLock();

  // Wait rather than fail: the locked section is one append, so a queue of judges
  // drains quickly.
  try {
    lock.waitLock(45000);
  } catch (err) {
    // Never claim success we cannot back up. The page will retry this submission.
    return jsonOut({ result: 'error', message: 'Server busy, please retry' });
  }

  try {
    // Authoritative duplicate check, inside the lock so that check-then-append is
    // atomic with respect to other submissions.
    if (submissionId && alreadyRecorded(submissionId)) {
      return jsonOut({ result: 'success', duplicate: true });
    }

    row.push(Utilities.formatDate(new Date(),
                                  Session.getScriptTimeZone(),
                                  'dd/MM/yyyy HH:mm:ss'));

    sheet.appendRow(row);
    SpreadsheetApp.flush();

    if (submissionId) markRecorded(submissionId);

    return jsonOut({ result: 'success', row: sheet.getLastRow() });

  } catch (err) {
    return jsonOut({ result: 'error', message: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Health check. Open the /exec URL in a browser to confirm the deployment is live
 * and pointed at the right sheet.
 */
function doGet() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    return jsonOut({
      result: 'success',
      sheet: SHEET_NAME,
      rows: sheet ? sheet.getLastRow() - 1 : null
    });
  } catch (err) {
    return jsonOut({ result: 'error', message: String(err && err.message || err) });
  }
}

// ---- submission_id bookkeeping -------------------------------------------------
// Kept in script properties rather than a sheet column, so the layout of Sheet1 is
// unchanged and "copy from Sheet1" still exports exactly what it did before.

function alreadyRecorded(submissionId) {
  return PropertiesService.getScriptProperties().getProperty('sub_' + submissionId) !== null;
}

function markRecorded(submissionId) {
  PropertiesService.getScriptProperties().setProperty('sub_' + submissionId,
                                                      String(Date.now()));
}

/**
 * Run this from the editor between events, after you have copied the scores out.
 * It clears the stored submission ids so the property store does not grow forever.
 * It does NOT touch the sheet.
 */
function clearSubmissionHistory() {
  var properties = PropertiesService.getScriptProperties();
  var keys = properties.getKeys().filter(function (key) {
    return key.indexOf('sub_') === 0;
  });
  keys.forEach(function (key) { properties.deleteProperty(key); });
  Logger.log('Cleared ' + keys.length + ' submission ids.');
}

function jsonOut(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
