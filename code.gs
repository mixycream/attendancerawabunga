// --- KONFIGURASI Script ---

const DRIVE_FOLDER_ID = "1cMIzeRzepw4b8EcSS-Odfb5_FUWv_zOl"; 
const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// Nama Folder Sub-Direktori
const FOLDER_PROFIL = "Foto Profil Relawan";
const FOLDER_ABSEN = "Foto Absen";

// DEFAULT JAM KERJA (Format 24 Jam Mutlak: HH:mm)
// UPDATED: Semua divisi masuk di sini
const DEFAULT_SHIFTS = {
  "Helper Cook": { start: "15:00", end: "23:00" },
  "Cook": { start: "23:00", end: "07:00" },
  "Head Chef": { start: "23:00", end: "07:00" },
  "Packing": { start: "03:00", end: "11:00" },
  "Distribusi": { start: "06:00", end: "14:00" },
  "Kenek Distribusi": { start: "06:00", end: "14:00" },
  "Kebersihan": { start: "08:00", end: "16:00" },
  "Asisten Lapangan": { start: "05:00", end: "13:00" },
  "Admin Gudang": { start: "10:00", end: "17:00" },
  "Gudang": { start: "12:00", end: "20:00" },
  "Keamanan Shift 1": { start: "07:00", end: "19:00" }, 
  "Keamanan Shift 2": { start: "19:00", end: "07:00" },
  "Cuci Ompreng": { start: "13:00", end: "21:00" },
  "Leader Ompreng": { start: "13:00", end: "21:00" },
  "Leader Packing": { start: "03:00", end: "11:00" },
  "Leader Helper Cook": { start: "15:00", end: "23:00" },
  "Admin Yayasan": { start: "08:00", end: "16:00" }
};

// --- WorkingTimes Sheet Helper ---
function formatSheetTime(val) {
  if (val instanceof Date) {
    var h = val.getHours();
    var m = val.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  var s = String(val || '').trim();
  if (s.length > 5 && s.indexOf(':') > 2) {
    var match = s.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      var hh = match[1].length < 2 ? '0' + match[1] : match[1];
      return hh + ':' + match[2];
    }
  }
  return s;
}

function getShiftsFromSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('WorkingTimes');

  if (!sheet) {
    sheet = ss.insertSheet('WorkingTimes');
    var empSheet = ss.getSheetByName('Employees');
    if (empSheet) {
      ss.setActiveSheet(sheet);
      ss.moveActiveSheet(empSheet.getIndex() + 1);
    }
    sheet.appendRow(['Division', 'Start', 'End']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    var keys = Object.keys(DEFAULT_SHIFTS);
    var rows = [];
    for (var i = 0; i < keys.length; i++) {
      rows.push([keys[i], DEFAULT_SHIFTS[keys[i]].start, DEFAULT_SHIFTS[keys[i]].end]);
    }
    if (rows.length > 0) {
      sheet.getRange(2, 2, rows.length, 2).setNumberFormat('@');
      sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }
    sheet.autoResizeColumns(1, 3);
    return JSON.parse(JSON.stringify(DEFAULT_SHIFTS));
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return JSON.parse(JSON.stringify(DEFAULT_SHIFTS));

  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var shifts = {};
  for (var i = 0; i < data.length; i++) {
    var div = String(data[i][0] || '').trim();
    if (div) {
      shifts[div] = { start: formatSheetTime(data[i][1]), end: formatSheetTime(data[i][2]) };
    }
  }

  var merged = JSON.parse(JSON.stringify(DEFAULT_SHIFTS));
  for (var k in shifts) merged[k] = shifts[k];
  return merged;
}

function saveShiftsToSheet(shifts) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('WorkingTimes');

  if (!sheet) {
    sheet = ss.insertSheet('WorkingTimes');
    var empSheet = ss.getSheetByName('Employees');
    if (empSheet) {
      ss.setActiveSheet(sheet);
      ss.moveActiveSheet(empSheet.getIndex() + 1);
    }
    sheet.appendRow(['Division', 'Start', 'End']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, 3).clear();

  var keys = Object.keys(shifts);
  if (keys.length > 0) {
    var rows = [];
    for (var i = 0; i < keys.length; i++) {
      rows.push([keys[i], shifts[keys[i]].start, shifts[keys[i]].end]);
    }
    sheet.getRange(2, 2, rows.length, 2).setNumberFormat('@');
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  sheet.autoResizeColumns(1, 3);
}

function normalizeRole(role, division) {
  const rawRole = String(role || '').toLowerCase().trim();
  if (rawRole) return rawRole;

  const rawDivision = String(division || '').toLowerCase().trim();
  if (rawDivision.includes('keamanan')) return 'security';
  if (rawDivision.includes('ahli gizi')) return 'nutritionist';
  if (rawDivision.includes('akuntan')) return 'accountant';
  if (rawDivision.includes('admin gudang')) return 'admin_warehouse';
  if (rawDivision.includes('gudang')) return 'warehouse';
  if (rawDivision.includes('ka sppg')) return 'head_sppg';
  if (rawDivision.includes('admin yayasan')) return 'foundation';
  if (rawDivision.includes('yayasan')) return 'foundation';
  return 'employee';
}

function getHeaderMap(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const map = {};
  headers.forEach((header, index) => {
    const key = String(header || '').toLowerCase().trim();
    if (key) map[key] = index;
  });
  return map;
}

function findHeaderIndex(headerMap, aliases, fallbackIndex) {
  for (var i = 0; i < aliases.length; i++) {
    var key = String(aliases[i] || '').toLowerCase().trim();
    if (headerMap[key] !== undefined) return headerMap[key];
  }
  return fallbackIndex;
}

function getRowValue(row, headerMap, headerName, fallbackIndex) {
  const key = String(headerName || '').toLowerCase().trim();
  const mappedIndex = headerMap[key];
  if (mappedIndex !== undefined) return row[mappedIndex];
  return fallbackIndex !== undefined ? row[fallbackIndex] : '';
}

function getRowValueByAliases(row, headerMap, aliases, fallbackIndex) {
  var index = findHeaderIndex(headerMap, aliases, fallbackIndex);
  return index !== undefined ? row[index] : '';
}

function doGet(e) {
  const action = e.parameter.action;
  if (action === "getData") return getData();
  return response({ status: "ready" });
}

function doPost(e) {
  try {
    var data = {};

    // Try JSON body first
    if (e.postData && e.postData.type && e.postData.type.indexOf('application/json') !== -1) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter && Object.keys(e.parameter).length > 0) {
      // Fallback: form-encoded POST -> use e.parameter
      for (var k in e.parameter) {
        data[k] = e.parameter[k];
      }
    } else {
      // Last resort: try parsing raw contents
      try { data = JSON.parse(e.postData.contents); } catch (ignore) { data = {}; }
    }

    // Normalize numeric fields
    if (data.overtime) data.overtime = parseInt(data.overtime) || 0;
    if (data.lateMinutes) data.lateMinutes = parseInt(data.lateMinutes) || 0;

    if (data.action === "addEmployee") return addOrUpdateEmployee(data); 
    else if (data.action === "attendance") return handleAttendance(data);
    else if (data.action === "saveConfig") return saveConfig(data);
    else if (data.action === "deleteEmployee") return deleteEmployee(data);
    else if (data.action === "confirmAttendance") return confirmAttendance(data);
    else if (data.action === "deleteAttendance") return deleteAttendance(data);
    else if (data.action === "deleteAttendanceByEmpDate") return deleteAttendanceByEmpDate(data);
    else if (data.action === "confirmViolation") return confirmViolationServer(data);
    else if (data.action === "login") return verifyLogin(data);
    else if (data.action === "securityLogout") return securityLogout(data);
    else if (data.action === "checkSecuritySession") return checkSecuritySession(data);
    else if (data.action === "saveNutritionistPlan") return saveNutritionistPlan(data);
    else if (data.action === "saveFeatureSettings") return saveFeatureSettings(data);
    else if (data.action === "cleanDuplicateLogs") return cleanDuplicateLogs();
    return response({ status: "success" });
  } catch (err) {
    return response({ status: "error", message: err.toString() });
  }
}

function verifyLogin(data) {
  const u = data.username.toLowerCase().trim();
  const p = String(data.password || '').trim();

  if (u === 'admin' && p === '!1AdminRawaBunga1') {
    return response({ status: "success", user: { u: 'admin', role: 'admin', name: 'Administrator' } });
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Employees");
  if (!sheet) return response({ status: "error", message: "Database user kosong" });

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return response({ status: "error", message: "User tidak ditemukan" });

  const totalCols = Math.max(sheet.getLastColumn(), 8);
  const vals = sheet.getRange(2, 1, lastRow - 1, totalCols).getValues(); 
  const headerMap = getHeaderMap(sheet);
  
  const foundUser = vals.find(r => 
    String(getRowValueByAliases(r, headerMap, ['username', 'user name', 'akun', 'nama akun'], 5) || '').toLowerCase().trim() === u &&
    String(getRowValueByAliases(r, headerMap, ['password', 'kata sandi', 'sandi', 'pass'], 6) || '').trim() === p
  );

  if (foundUser) {
    const role = normalizeRole(
      getRowValueByAliases(foundUser, headerMap, ['role', 'akses login', 'akses'], 7),
      getRowValueByAliases(foundUser, headerMap, ['division', 'divisi'], 2)
    );
    const scriptProps = PropertiesService.getScriptProperties();
    if (role === 'security') {
      const activeRaw = scriptProps.getProperty('activeSecuritySession');
      if (activeRaw) {
        try {
          const active = JSON.parse(activeRaw);
          if (active && active.u && String(active.u).toLowerCase() !== u) {
            return response({ status: "error", message: `Security ${active.name || active.u} sedang login. Silahkan hubungi Security tersebut terlebih dahulu.` });
          }
        } catch (ignore) {}
      }

      scriptProps.setProperty('activeSecuritySession', JSON.stringify({
        u: getRowValueByAliases(foundUser, headerMap, ['username', 'user name', 'akun', 'nama akun'], 5),
        name: getRowValueByAliases(foundUser, headerMap, ['name', 'nama'], 1),
        division: getRowValueByAliases(foundUser, headerMap, ['division', 'divisi'], 2),
        loginAt: new Date().toISOString()
      }));
    }

    return response({ 
      status: "success", 
      user: { 
        u: getRowValueByAliases(foundUser, headerMap, ['username', 'user name', 'akun', 'nama akun'], 5), 
        role: role,
        id: getRowValueByAliases(foundUser, headerMap, ['id'], 0),
        name: getRowValueByAliases(foundUser, headerMap, ['name', 'nama'], 1),
        division: getRowValueByAliases(foundUser, headerMap, ['division', 'divisi'], 2),
        photo: getRowValueByAliases(foundUser, headerMap, ['photourl', 'photo url', 'foto profil', 'foto', 'photo'], 4)
      } 
    });
  }

  return response({ status: "error", message: "Username atau Password salah" });
}

function securityLogout(data) {
  const scriptProps = PropertiesService.getScriptProperties();
  const activeRaw = scriptProps.getProperty('activeSecuritySession');
  if (!activeRaw) return response({ status: "success" });

  try {
    const active = JSON.parse(activeRaw);
    const reqUser = String(data.username || '').toLowerCase().trim();
    if (!active || !active.u || String(active.u).toLowerCase() === reqUser) {
      scriptProps.deleteProperty('activeSecuritySession');
    }
  } catch (e) {
    scriptProps.deleteProperty('activeSecuritySession');
  }

  return response({ status: "success" });
}

function checkSecuritySession(data) {
  const reqUser = String(data.username || '').toLowerCase().trim();
  if (!reqUser) return response({ status: "error", message: "Username tidak valid" });

  const scriptProps = PropertiesService.getScriptProperties();
  const activeRaw = scriptProps.getProperty('activeSecuritySession');
  if (!activeRaw) return response({ status: "error", message: "Tidak ada security aktif" });

  try {
    const active = JSON.parse(activeRaw);
    if (active && active.u && String(active.u).toLowerCase() === reqUser) {
      return response({ status: "success" });
    }
    return response({ status: "error", message: `Security ${active && (active.name || active.u) ? (active.name || active.u) : 'lain'} sedang login.` });
  } catch (e) {
    return response({ status: "error", message: "Session security tidak valid" });
  }
}

function getData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  
  const sheetEmp = ss.getSheetByName("Employees");
  let emps = [];
  if (sheetEmp && sheetEmp.getLastRow() > 1) {
    const totalCols = Math.max(sheetEmp.getLastColumn(), 8);
    const vals = sheetEmp.getRange(2, 1, sheetEmp.getLastRow()-1, totalCols).getValues();
    const headerMap = getHeaderMap(sheetEmp);
    emps = vals.map(r => ({ 
      id: getRowValueByAliases(r, headerMap, ['id'], 0),
      name: getRowValueByAliases(r, headerMap, ['name', 'nama'], 1),
      division: getRowValueByAliases(r, headerMap, ['division', 'divisi'], 2),
      salary: getRowValueByAliases(r, headerMap, ['salary', 'gaji', 'gaji harian'], 3),
      photo: getRowValueByAliases(r, headerMap, ['photourl', 'photo url', 'foto profil', 'foto', 'photo'], 4),
      role: normalizeRole(
        getRowValueByAliases(r, headerMap, ['role', 'akses login', 'akses'], 7),
        getRowValueByAliases(r, headerMap, ['division', 'divisi'], 2)
      )
    }));
  }

  const sheetLog = ss.getSheetByName("Logs");
  let logs = [];
  if (sheetLog && sheetLog.getLastRow() > 1) {
    const lastCol = Math.max(sheetLog.getLastColumn(), 10);
    const vals = sheetLog.getRange(2, 1, sheetLog.getLastRow()-1, lastCol).getValues();
    logs = vals.map((r, i) => {
      let cleanTime = r[1];
      if (r[1] instanceof Date) cleanTime = Utilities.formatDate(r[1], tz, "HH:mm:ss");
      
      return { 
        row: i + 2, 
        date: Utilities.formatDate(new Date(r[0]), tz, "yyyy-MM-dd"),
        time: cleanTime,
        empId: r[2], name: r[3], type: r[4], photo: r[5], overtime: r[6], location: r[7], lateMinutes: r[8] || 0, note: r[9] || "", absentBy: r[10] || "-" 
      };
    });
  }
  
  const scriptProps = PropertiesService.getScriptProperties();

  // Baca shifts dari sheet WorkingTimes
  const finalShifts = getShiftsFromSheet();

  const config = { 
    overtimeRate: scriptProps.getProperty('overtimeRate') || "15000",
    shifts: finalShifts,
    disableLate: scriptProps.getProperty('disableLate') === 'true',
    disableEarly: scriptProps.getProperty('disableEarly') === 'true',
    disableBoth: scriptProps.getProperty('disableBoth') === 'true',
    disableLateReason: scriptProps.getProperty('disableLateReason') || '',
    disableEarlyReason: scriptProps.getProperty('disableEarlyReason') || '',
    disableBothReason: scriptProps.getProperty('disableBothReason') || '',
    disableGeofence: scriptProps.getProperty('disableGeofence') === 'true',
    hideOvertime: scriptProps.getProperty('hideOvertime') === 'true'
  };

  return response({ status: "success", employees: emps, logs: logs, config: config });
}

function addOrUpdateEmployee(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName("Employees");
  if (!sheet) {
    sheet = ss.insertSheet("Employees");
    sheet.appendRow(["ID", "Name", "Division", "Salary", "PhotoURL", "Username", "Password", "Role"]);
  } else if (sheet.getLastRow() > 0 && sheet.getLastColumn() < 8) {
    sheet.getRange(1, 8).setValue("Role");
  }

  let photoUrl = data.photo || ""; 
  if (data.image) { 
    try {
      const folder = getOrCreateSubFolder(DRIVE_FOLDER_ID, FOLDER_PROFIL);
      const fileName = `PROFIL_${data.name}_${data.id}.jpg`.replace(/\s/g, '_');
      const blob = Utilities.newBlob(Utilities.base64Decode(data.image), "image/jpeg", fileName);
      const file = folder.createFile(blob);
      // Set sharing to public with viewer access
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      const fileId = file.getId();
      // Use Google's CDN URL format - has proper CORS headers
      photoUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
    } catch(e) { 
      // Fallback: use base64 data URL if Drive upload fails
      photoUrl = data.photo || ("data:image/jpeg;base64," + data.image);
    }
  }

  const lastRow = sheet.getLastRow();
  let rowIndex = -1;
  
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(v => String(v));
    rowIndex = ids.indexOf(String(data.id));
  }

  const user = String(data.username || '').trim().toLowerCase();
  const pass = String(data.password || '').trim();
  const role = normalizeRole(data.role, data.division);
  const headerMap = getHeaderMap(sheet);
  const colName = findHeaderIndex(headerMap, ['name', 'nama'], 1) + 1;
  const colDivision = findHeaderIndex(headerMap, ['division', 'divisi'], 2) + 1;
  const colSalary = findHeaderIndex(headerMap, ['salary', 'gaji', 'gaji harian'], 3) + 1;
  const colPhoto = findHeaderIndex(headerMap, ['photourl', 'photo url', 'foto profil', 'foto', 'photo'], 4) + 1;
  const colUsername = findHeaderIndex(headerMap, ['username', 'user name', 'akun', 'nama akun'], 5) + 1;
  const colPassword = findHeaderIndex(headerMap, ['password', 'kata sandi', 'sandi', 'pass'], 6) + 1;
  const colRole = findHeaderIndex(headerMap, ['role', 'akses login', 'akses'], 7) + 1;

  if (rowIndex > -1) {
    const rowNum = rowIndex + 2;
    sheet.getRange(rowNum, colName).setValue(data.name);
    sheet.getRange(rowNum, colDivision).setValue(data.division);
    sheet.getRange(rowNum, colSalary).setValue(data.salary);
    if (photoUrl && photoUrl !== "Error Upload") sheet.getRange(rowNum, colPhoto).setValue(photoUrl);
    sheet.getRange(rowNum, colUsername).setValue(user);
    sheet.getRange(rowNum, colPassword).setValue(pass);
    sheet.getRange(rowNum, colRole).setValue(role);
  } else {
    sheet.appendRow([data.id, data.name, data.division, data.salary, photoUrl, user, pass, role]);
  }
  
  return response({ status: "success", photoUrl: photoUrl });
}

function saveNutritionistPlan(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('NutritionPlans');
  if (!sheet) {
    sheet = ss.insertSheet('NutritionPlans');
    sheet.appendRow(['UserID', 'Username', 'Name', 'Division', 'SavedAt', 'MenuName', 'Session', 'Portions', 'Reserve', 'IngredientsJson']);
  }

  var userId = String(data.userId || '').trim();
  var username = String(data.username || '').trim();
  var savedAt = new Date().toISOString();
  var ingredientsJson = '';
  try { ingredientsJson = typeof data.ingredients === 'string' ? data.ingredients : JSON.stringify(data.ingredients || []); } catch (e) { ingredientsJson = '[]'; }

  // Find existing row
  var foundRow = -1;
  if (sheet.getLastRow() > 1) {
    var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < ids.length; i++) {
      if ((userId && String(ids[i][0]).trim() === userId) || (username && String(ids[i][1]).trim().toLowerCase() === username.toLowerCase())) {
        foundRow = i + 2;
        break;
      }
    }
  }

  var row = [userId, username, data.name || '', data.division || '', savedAt, data.menuName || '', data.session || 'pagi', data.portions || '250', data.reserve || '10', ingredientsJson];
  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return response({ status: 'success' });
}

function deleteEmployee(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Employees");
  if (!sheet) return response({ status: "error", message: "Sheet Employees tidak ditemukan" });

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return response({ status: "error", message: "Tidak ada data relawan" });

  // Cari kolom ID melalui header map (robust: tidak asumsi selalu kolom 1)
  var headerMap = getHeaderMap(sheet);
  var idColIndex = findHeaderIndex(headerMap, ['id', 'emp id', 'empid'], 0); // 0-based
  var idColNum = idColIndex + 1; // 1-based untuk getRange

  var targetId = String(data.id || '').trim();
  if (!targetId) return response({ status: "error", message: "ID tidak boleh kosong" });

  var numRows = lastRow - 1;
  var colValues = sheet.getRange(2, idColNum, numRows, 1).getValues();

  var rowToDelete = -1;
  for (var i = 0; i < colValues.length; i++) {
    var cellVal = String(colValues[i][0] || '').trim();
    // Compare as string dan juga sebagai angka (handle Sheets yang simpan ID sebagai number)
    if (cellVal === targetId || cellVal === String(parseFloat(targetId))) {
      rowToDelete = i + 2; // +2 = offset header
      break;
    }
  }

  if (rowToDelete > 0) {
    sheet.deleteRow(rowToDelete);
    return response({ status: "success" });
  }

  // Debug info agar bisa diagnosa lebih lanjut
  return response({ status: "error", message: "ID not found: " + targetId });
}

function handleAttendance(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName("Logs");
  if (!sheet) {
    sheet = ss.insertSheet("Logs");
    sheet.appendRow(["Date", "Time", "EmpID", "Name", "Type", "PhotoURL", "Overtime", "Location", "LateMinutes", "Note", "AbsentBy"]);
  } else if (sheet.getLastRow() > 0 && sheet.getLastColumn() < 11) {
    sheet.getRange(1, 11).setValue("AbsentBy");
  }

  let fileUrl = "";
  if (data.image) {
    try {
      const folder = getOrCreateSubFolder(DRIVE_FOLDER_ID, FOLDER_ABSEN);
      const fileName = `${data.name}_${data.date}_${data.type}.jpg`.toUpperCase().replace(/\s/g, '_');
      const blob = Utilities.newBlob(Utilities.base64Decode(data.image), "image/jpeg", fileName);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      // Use Google's CDN URL format - works reliably for direct embedding
      fileUrl = "https://lh3.googleusercontent.com/d/" + file.getId(); 
    } catch(e) { fileUrl = ""; }
  }

  const now = new Date();
  const tz = ss.getSpreadsheetTimeZone();
  const dateStr = data.date || Utilities.formatDate(now, tz, "yyyy-MM-dd");
  let timeStr = data.forcedTime ? data.forcedTime + ":00" : Utilities.formatDate(now, tz, "HH:mm:ss");

  // Anti-duplicate: check if same EmpID + Date + Type + AbsentBy already exists
  if (data.absentBy === 'Admin') {
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const existingData = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
      const isDuplicate = existingData.some(function(row) {
        return String(row[0]) === dateStr &&
               String(row[2]) === String(data.empId) &&
               String(row[4]) === String(data.type) &&
               String(row[10]) === 'Admin';
      });
      if (isDuplicate) {
        return response({ status: "success", duplicate: true });
      }
    }
  }

  // --- Batasan Absensi (non-Admin): 1x IN per hari & 1 jam sebelum shift ---
  if (String(data.absentBy) !== 'Admin' && (String(data.type) === 'IN' || String(data.type) === 'PENDING')) {
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const existingData = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      var hasTodayIN = existingData.some(function(row) {
        return String(row[0]) === dateStr &&
               String(row[2]) === String(data.empId) &&
               (String(row[4]) === 'IN' || String(row[4]) === 'PENDING');
      });
      if (hasTodayIN) {
        return response({ status: "error", message: "Sudah absen masuk hari ini. Maksimal 1x per hari." });
      }
    }

    // Cek window 30 menit sebelum shift
    var empSheet = ss.getSheetByName("Employees");
    if (empSheet && empSheet.getLastRow() > 1) {
      var empHeaderMap = getHeaderMap(empSheet);
      var empRows = empSheet.getRange(2, 1, empSheet.getLastRow() - 1, empSheet.getLastColumn()).getValues();
      var empRow = empRows.find(function(r) { return String(r[0]) === String(data.empId); });
      if (empRow) {
        var division = getRowValueByAliases(empRow, empHeaderMap, ['division', 'divisi'], 2);
        var shifts = getShiftsFromSheet();
        var shiftConf = shifts[division];
        if (shiftConf && typeof shiftConf !== 'string' && shiftConf.start) {
          var nowH = parseInt(Utilities.formatDate(now, tz, "HH"));
          var nowM = parseInt(Utilities.formatDate(now, tz, "mm"));
          var nowMin = nowH * 60 + nowM;
          var sParts = shiftConf.start.split(':');
          var shiftStartMin = parseInt(sParts[0]) * 60 + parseInt(sParts[1]);
          var eParts = shiftConf.end.split(':');
          var shiftEndMin = parseInt(eParts[0]) * 60 + parseInt(eParts[1]);
          var isOvernight = shiftEndMin <= shiftStartMin;

          var minutesBefore = shiftStartMin - nowMin;
          if (minutesBefore < 0) minutesBefore += 1440;

          var inShift = false;
          if (isOvernight) {
            inShift = nowMin >= shiftStartMin || nowMin <= shiftEndMin;
          } else {
            inShift = nowMin >= shiftStartMin && nowMin <= shiftEndMin;
          }

          if (minutesBefore > 30 && !inShift) {
            var earMin = shiftStartMin - 30;
            if (earMin < 0) earMin += 1440;
            var earH = Math.floor(earMin / 60);
            var earM = earMin % 60;
            var earStr = (earH < 10 ? '0' : '') + earH + ':' + (earM < 10 ? '0' : '') + earM;
            return response({ status: "error", message: "Belum bisa absen! Absen masuk dibuka jam " + earStr + " (30 menit sebelum shift " + shiftConf.start + ")." });
          }
        }
      }
    }
  }

  sheet.appendRow([
    dateStr, timeStr, data.empId, data.name, data.type, fileUrl, data.overtime || 0, data.location || "N/A", data.lateMinutes || 0, data.note || "", data.absentBy || "-"
  ]);
  return response({ status: "success" });
}

function confirmAttendance(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Logs");
  if (data.row && data.newStatus) {
    sheet.getRange(data.row, 5).setValue(data.newStatus); 
    return response({ status: "success" });
  }
  return response({ status: "error", message: "Invalid data" });
}

function deleteAttendance(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Logs");
  var row = parseInt(data.row);
  if (row && row >= 2 && row <= sheet.getLastRow()) {
    sheet.deleteRow(row);
    return response({ status: "success" });
  }
  return response({ status: "error", message: "Invalid row" });
}

function deleteAttendanceByEmpDate(data) {
  var empId = String(data.empId || '');
  var date = String(data.date || '');
  if (!empId || !date) return response({ status: "error", message: "Missing empId or date" });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Logs");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return response({ status: "success" });
  var allData = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  // Delete from bottom to top to preserve row indices
  for (var i = allData.length - 1; i >= 0; i--) {
    var rowDate = allData[i][0];
    if (rowDate instanceof Date) {
      var y = rowDate.getFullYear();
      var m = ('0' + (rowDate.getMonth() + 1)).slice(-2);
      var d = ('0' + rowDate.getDate()).slice(-2);
      rowDate = y + '-' + m + '-' + d;
    } else {
      rowDate = String(rowDate);
    }
    var rowEmpId = String(allData[i][2]);
    if (rowEmpId === empId && rowDate === date) {
      sheet.deleteRow(i + 2);
    }
  }
  return response({ status: "success" });
}

function confirmViolationServer(data) {
  var empId = String(data.empId || '');
  var date = String(data.date || '');
  if (!empId || !date) return response({ status: "error", message: "Missing empId or date" });
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Logs");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return response({ status: "success" });
  var allData = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  for (var i = 0; i < allData.length; i++) {
    var rowDate = allData[i][0];
    if (rowDate instanceof Date) {
      var y = rowDate.getFullYear();
      var m = ('0' + (rowDate.getMonth() + 1)).slice(-2);
      var d = ('0' + rowDate.getDate()).slice(-2);
      rowDate = y + '-' + m + '-' + d;
    } else {
      rowDate = String(rowDate);
    }
    var rowEmpId = String(allData[i][2]);
    if (rowEmpId === empId && rowDate === date) {
      var lateMin = parseInt(allData[i][8]) || 0;
      var note = String(allData[i][9] || '');
      var type = String(allData[i][4]);
      var isLate = (type === 'IN' && lateMin >= 5);
      var isEarly = (type === 'OUT' && note.indexOf('[Pulang') !== -1);
      if ((isLate || isEarly) && note.indexOf('[OK]') === -1) {
        sheet.getRange(i + 2, 10).setValue('[OK] ' + note);
      }
    }
  }
  return response({ status: "success" });
}

function saveConfig(data) {
  var scriptProps = PropertiesService.getScriptProperties();
  if (data.overtimeRate) scriptProps.setProperty('overtimeRate', data.overtimeRate.toString());
  if (data.shifts) {
    var shifts = data.shifts;
    if (typeof shifts === 'string') shifts = JSON.parse(shifts);
    saveShiftsToSheet(shifts);
  }
  return response({ status: "success" });
}

function saveFeatureSettings(data) {
  var scriptProps = PropertiesService.getScriptProperties();
  scriptProps.setProperty('disableLate', String(data.disableLate === true || data.disableLate === 'true'));
  scriptProps.setProperty('disableEarly', String(data.disableEarly === true || data.disableEarly === 'true'));
  scriptProps.setProperty('disableBoth', String(data.disableBoth === true || data.disableBoth === 'true'));
  scriptProps.setProperty('disableLateReason', String(data.disableLateReason || ''));
  scriptProps.setProperty('disableEarlyReason', String(data.disableEarlyReason || ''));
  scriptProps.setProperty('disableBothReason', String(data.disableBothReason || ''));
  scriptProps.setProperty('disableGeofence', String(data.disableGeofence === true || data.disableGeofence === 'true'));
  scriptProps.setProperty('hideOvertime', String(data.hideOvertime === true || data.hideOvertime === 'true'));
  return response({ status: "success" });
}

function cleanDuplicateLogs() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName("Logs");
  if (!sheet) return response({ status: "success", deleted: 0, message: "Sheet Logs tidak ditemukan" });

  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return response({ status: "success", deleted: 0, message: "Tidak ada data untuk diperiksa" });

  var allData = sheet.getRange(2, 1, lastRow - 1, 11).getValues();

  // Normalisasi tanggal ke string YYYY-MM-DD
  function normDate(val) {
    if (val instanceof Date) {
      var y = val.getFullYear();
      var m = ('0' + (val.getMonth() + 1)).slice(-2);
      var d = ('0' + val.getDate()).slice(-2);
      return y + '-' + m + '-' + d;
    }
    return String(val || '').trim();
  }

  // Tandai baris duplikat — key: EmpID|Date|Type
  // Strategi: simpan baris PERTAMA (indeks terkecil = entri paling lama), hapus sisanya
  var seen = {};
  var rowsToDelete = []; // indeks dalam allData (0-based)

  for (var i = 0; i < allData.length; i++) {
    var rowDate  = normDate(allData[i][0]);
    var empId    = String(allData[i][2] || '').trim();
    var type     = String(allData[i][4] || '').trim();

    // Abaikan baris kosong
    if (!empId || !rowDate || !type) continue;

    var key = empId + '|' + rowDate + '|' + type;
    if (seen[key] !== undefined) {
      // Sudah pernah ketemu — ini duplikat, tandai untuk dihapus
      rowsToDelete.push(i);
    } else {
      seen[key] = i;
    }
  }

  if (rowsToDelete.length === 0) {
    return response({ status: "success", deleted: 0, message: "Tidak ada duplikat ditemukan" });
  }

  // Hapus dari bawah ke atas agar indeks tidak bergeser
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j] + 2); // +2: offset header row
  }

  return response({ status: "success", deleted: rowsToDelete.length, message: rowsToDelete.length + " data duplikat berhasil dihapus" });
}

function getOrCreateSubFolder(parentId, name) {
  try {
    const parent = DriveApp.getFolderById(parentId);
    const folders = parent.getFoldersByName(name);
    return folders.hasNext() ? folders.next() : parent.createFolder(name);
  } catch (e) { return DriveApp.getFolderById(parentId); }
}

function response(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}