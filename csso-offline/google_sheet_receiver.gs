/* 
 * CSSO NFC Member ID System: Google Sheet Receiver
 * Data Contract: id, time, operator, student_no, name, action, amount, balance_after, note, operator_role
 */

// Set CSSO_SECRET in Project Settings > Script Properties. Never hardcode it here.
const SECRET = PropertiesService.getScriptProperties().getProperty('CSSO_SECRET');

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Auth Check
    if (data.secret !== SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ok: false, error: 'Unauthorized'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const rows = data.logs; // Array of objects matching contract
    const existingIds = new Set(sheet.getDataRange().getValues().map(r => r[0])); // id is column 0
    
    const newIds = [];
    const rowsToAppend = [];

    rows.forEach(row => {
      // Idempotency check: Skip if ID already exists (including earlier in this batch)
      if (!existingIds.has(row.id)) {
        rowsToAppend.push([
          row.id,
          row.time,
          row.operator,
          row.student_no,
          row.name,
          row.action,
          row.amount,
          row.balance_after,
          row.note,
          row.operator_role
        ]);
        newIds.push(row.id);
        existingIds.add(row.id);
      }
    });

    if (rowsToAppend.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, 10).setValues(rowsToAppend);
    }

    return ContentService.createTextOutput(JSON.stringify({ok: true, ids: newIds}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
