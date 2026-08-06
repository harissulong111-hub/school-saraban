// ⚠️ โฟลเดอร์หลักของระบบโรงเรียนบ้านกาหยี
const MAIN_FOLDER_ID = "1prVMH3_KmFg-mesR3ALxiVJCnMPu9StZ";

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. ดึงข้อมูลหนังสือรับ-ส่ง (Data) พร้อมลิงก์แนบ 1-6
  const sheetData = ss.getSheetByName("Data") || ss.getSheets()[0];
  const rowsData = sheetData.getDataRange().getValues();
  const dataList = [];
  for (let i = 1; i < rowsData.length; i++) {
    if(!rowsData[i][0]) continue;
    dataList.push({
      internalId: String(rowsData[i][0]),
      docId: String(rowsData[i][1] || ""),
      date: rowsData[i][2] ? formatDate(rowsData[i][2]) : "",
      department: String(rowsData[i][3] || ""),
      source: String(rowsData[i][4] || ""),
      destination: String(rowsData[i][5] || ""),
      title: String(rowsData[i][6] || ""),
      priority: String(rowsData[i][7] || "ปกติ"),
      deadline: rowsData[i][8] ? formatDate(rowsData[i][8]) : "",
      managercomment: String(rowsData[i][9] || ""),
      status: String(rowsData[i][10] || "รอดำเนินการ"),
      fileUrl: String(rowsData[i][11] || ""),
      link1: String(rowsData[i][12] || ""),
      link2: String(rowsData[i][13] || ""),
      link3: String(rowsData[i][14] || ""),
      link4: String(rowsData[i][15] || ""),
      link5: String(rowsData[i][16] || ""),
      link6: String(rowsData[i][17] || "")
    });
  }
  
  // 2. ดึงข้อมูลคำสั่งโรงเรียน (Orders)
  const sheetOrders = ss.getSheetByName("Orders");
  const ordersList = [];
  if (sheetOrders) {
    const rowsOrders = sheetOrders.getDataRange().getValues();
    for (let i = 1; i < rowsOrders.length; i++) {
      if(!rowsOrders[i][0]) continue;
      ordersList.push({
        orderId: String(rowsOrders[i][0]),
        year: String(rowsOrders[i][1] || ""),
        title: String(rowsOrders[i][2] || ""),
        signDate: rowsOrders[i][3] ? formatDate(rowsOrders[i][3]) : "",
        department: String(rowsOrders[i][4] || ""),
        status: String(rowsOrders[i][5] || "เปิดเผย"),
        fileUrl: String(rowsOrders[i][6] || ""),
        id: rowsOrders[i][7] ? String(rowsOrders[i][7]) : String(rowsOrders[i][0])
      });
    }
  }

  // 3. ดึงข้อมูลบันทึกข้อความ (Memos)
  const sheetMemos = ss.getSheetByName("memos");
  const memosList = [];
  if (sheetMemos) {
    const rows = sheetMemos.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if(!rows[i][0]) continue;
      memosList.push({ id: String(rows[i][0]), docNo: String(rows[i][1]), date: formatDate(rows[i][2]), title: String(rows[i][3]), department: String(rows[i][4]), fileUrl: String(rows[i][5]), notes: String(rows[i][6] || "") });
    }
  }

  // 4. ดึงข้อมูลเอกสารทั่วไป (General Docs)
  const sheetGenDocs = ss.getSheetByName("general_docs");
  const genDocsList = [];
  if (sheetGenDocs) {
    const rows = sheetGenDocs.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if(!rows[i][0]) continue;
      genDocsList.push({ id: String(rows[i][0]), docName: String(rows[i][1]), date: formatDate(rows[i][2]), category: String(rows[i][3]), fileUrl: String(rows[i][4]), notes: String(rows[i][5] || "") });
    }
  }

  // 5. ดึงข้อมูลใบเสร็จใบรับเงิน (Receipts)
  const sheetReceipts = ss.getSheetByName("receipts");
  const receiptsList = [];
  if (sheetReceipts) {
    const rows = sheetReceipts.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if(!rows[i][0]) continue;
      receiptsList.push({ id: String(rows[i][0]), receiptNo: String(rows[i][1]), date: formatDate(rows[i][2]), amount: String(rows[i][3]), payer: String(rows[i][4]), fileUrl: String(rows[i][5]), notes: String(rows[i][6] || "") });
    }
  }

  // 6. ดึงข้อมูลสถิติการมาเรียน (Attendance)
  const sheetAtt = ss.getSheetByName("attendance");
  const attList = [];
  if (sheetAtt) {
    const rows = sheetAtt.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if(!rows[i][0]) continue;
      attList.push({ id: String(rows[i][0]), date: formatDate(rows[i][1]), classLevel: String(rows[i][2]), totalMale: Number(rows[i][3] || 0), presentMale: Number(rows[i][4] || 0), totalFemale: Number(rows[i][5] || 0), presentFemale: Number(rows[i][6] || 0), percentage: String(rows[i][7] || "0.00") });
    }
  }

  const output = {
    status: "success",
    sarabanData: dataList,
    ordersData: ordersList,
    memosData: memosList,
    genDocsData: genDocsList,
    receiptsData: receiptsList,
    attendanceData: attList
  };

  return createJsonResponse(output);
}

function doPost(e) {
  try {
    let params = {};
    if (e.postData && e.postData.contents) {
      try {
        params = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        params = e.parameter || {};
      }
    } else if (e.parameter) {
      params = e.parameter;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = params.action;

    // 🎯 โหมดลบไฟล์ออกจาก Google Drive โดยตรง (รับค่า URL หรือ Array ของ URLs)
    if (action === "deleteFile") {
      let fileUrls = [];
      if (params.fileUrls) {
        try { fileUrls = JSON.parse(params.fileUrls); } catch(err) { fileUrls = [params.fileUrls]; }
      } else if (params.fileUrl) {
        fileUrls = [params.fileUrl];
      }
      
      fileUrls.forEach(url => deleteDriveFile(url));
      return createJsonResponse({ status: "success", message: "ลบไฟล์สำเร็จ" });
    }

    // 🎯 โหมดอัปโหลดไฟล์ไป Google Drive อย่างเดียว ( uploadOnly )
    if (action === "uploadOnly") {
      let uploadedUrl = "";
      if (params.fileData && params.fileName && params.mimeType) {
        uploadedUrl = processFileUpload(params);
      }
      return createJsonResponse({ status: "success", fileUrl: uploadedUrl });
    }
    
    // [1] ระบบตรวจสอบการเข้าสู่ระบบ (LOGIN)
    if (action === "login") {
      const sheetUsers = ss.getSheetByName("Users");
      if (!sheetUsers) return createJsonResponse({ status: "error", message: "ไม่พบแผ่นงาน Users" });
      const rows = sheetUsers.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === String(params.username).trim() && String(rows[i][1]).trim() === String(params.password).trim()) {
          return createJsonResponse({
            status: "success",
            user: { displayName: rows[i][2], role: rows[i][3], department: rows[i][4] }
          });
        }
      }
      return createJsonResponse({ status: "invalid", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    // [2] ประมวลผลไฟล์สำหรับระบบเดิม
    let fileUrl = params.fileUrl || "";
    if (params.fileData && params.fileName && params.mimeType) {
      fileUrl = processFileUpload(params);
    }

    // [3] จัดการ Data & Orders
    const sheetData = ss.getSheetByName("Data") || ss.getSheets()[0];
    const sheetOrders = ss.getSheetByName("Orders");

    if (action === "insert") {
      sheetData.appendRow([
        params.internalId, params.docId, params.date, params.department, 
        params.source, params.destination, params.title, params.priority, 
        params.deadline, params.managercomment, params.status, fileUrl,
        params.link1 || "", params.link2 || "", params.link3 || "", 
        params.link4 || "", params.link5 || "", params.link6 || ""
      ]);
      return createJsonResponse({ status: "success" });
    }
    
    if (action === "update") {
      const rows = sheetData.getDataRange().getValues();
      let foundIndex = -1;
      for (let i = 1; i < rows.length; i++) { if (String(rows[i][0]).trim() === String(params.internalId).trim()) { foundIndex = i + 1; break; } }
      if (foundIndex !== -1) {
        const fields = [
          params.docId, params.date, params.department, params.source, 
          params.destination, params.title, params.priority, params.deadline, 
          params.managercomment, params.status, fileUrl,
          params.link1 || "", params.link2 || "", params.link3 || "", 
          params.link4 || "", params.link5 || "", params.link6 || ""
        ];
        fields.forEach((val, idx) => sheetData.getRange(foundIndex, idx + 2).setValue(val));
        return createJsonResponse({ status: "success" });
      }
    }
    
    if (action === "delete") {
      const rows = sheetData.getDataRange().getValues();
      let foundIndex = -1;
      for (let i = 1; i < rows.length; i++) { if (String(rows[i][0]).trim() === String(params.internalId).trim()) { foundIndex = i + 1; break; } }
      if (foundIndex !== -1) { 
        // 🗑️ สั่งลบไฟล์แนบหลักและลิงก์แนบ 1-6 ใน Google Drive
        for (let col = 11; col <= 17; col++) {
          deleteDriveFile(rows[foundIndex - 1][col]);
        }
        sheetData.deleteRow(foundIndex);
        return createJsonResponse({ status: "success" });
      }
    }
    
    if (sheetOrders) {
      if (action === "insertOrder") {
        sheetOrders.appendRow([params.orderId, params.year, params.title, params.signDate, params.department, params.status, fileUrl, params.id]);
        return createJsonResponse({ status: "success" });
      }
      
      if (action === "updateOrder") {
        const rows = sheetOrders.getDataRange().getValues();
        let foundIndex = -1;
        for (let i = 1; i < rows.length; i++) {
          const rowId = rows[i][7] ? String(rows[i][7]).trim() : String(rows[i][0]).trim();
          if (rowId === String(params.id).trim()) { foundIndex = i + 1; break; }
        }
        if (foundIndex !== -1) {
          const fields = [params.orderId, params.year, params.title, params.signDate, params.department, params.status, fileUrl];
          fields.forEach((val, idx) => sheetOrders.getRange(foundIndex, idx + 1).setValue(val));
          return createJsonResponse({ status: "success" });
        }
      }
      
      if (action === "deleteOrder") {
        const rows = sheetOrders.getDataRange().getValues();
        let foundIndex = -1;
        for (let i = 1; i < rows.length; i++) {
          const rowId = rows[i][7] ? String(rows[i][7]).trim() : String(rows[i][0]).trim();
          if (rowId === String(params.id).trim()) { foundIndex = i + 1; break; }
        }
        if (foundIndex !== -1) { 
          deleteDriveFile(rows[foundIndex - 1][6]); // 🗑️ สั่งลบไฟล์คำสั่งโรงเรียน
          sheetOrders.deleteRow(foundIndex);
          return createJsonResponse({ status: "success" });
        }
      }
    }

    // [4] จัดการ 4 ชีตใหม่
    const sheetMemos = ss.getSheetByName("memos");
    const sheetGenDocs = ss.getSheetByName("general_docs");
    const sheetReceipts = ss.getSheetByName("receipts");
    const sheetAtt = ss.getSheetByName("attendance");

    let activeSheet = null;
    const actionLower = (action || "").toLowerCase();
    
    if (actionLower.includes("memo")) activeSheet = sheetMemos;
    if (actionLower.includes("gendoc")) activeSheet = sheetGenDocs;
    if (actionLower.includes("receipt")) activeSheet = sheetReceipts;
    if (actionLower.includes("att")) activeSheet = sheetAtt;

    if (activeSheet) {
      if (actionLower.startsWith("insert")) {
        let rowArr = [];
        if (actionLower === "insertmemo") rowArr = [params.id, params.docNo, params.date, params.title, params.department, fileUrl, params.notes || ""];
        if (actionLower === "insertgendoc") rowArr = [params.id, params.docName, params.date, params.category, fileUrl, params.notes || ""];
        if (actionLower === "insertreceipt") rowArr = [params.id, params.receiptNo, params.date, params.amount, params.payer, fileUrl, params.notes || ""];
        if (actionLower === "insertatt") rowArr = [params.id, params.date, params.classLevel, params.totalMale, params.presentMale, params.totalFemale, params.presentFemale, params.percentage];
        
        activeSheet.appendRow(rowArr);
        return createJsonResponse({ status: "success" });
      }

      if (actionLower.startsWith("update") || actionLower.startsWith("delete")) {
        const rows = activeSheet.getDataRange().getValues();
        let foundIndex = -1;
        for (let i = 1; i < rows.length; i++) { 
          if (String(rows[i][0]).trim() === String(params.id).trim()) { foundIndex = i + 1; break; }
        }
        
        if (foundIndex !== -1) {
          if (actionLower.startsWith("delete")) {
            // 🗑️ สั่งลบไฟล์สำหรับโมดูล Memos, GenDocs และ Receipts
            if (actionLower === "deletememo") deleteDriveFile(rows[foundIndex - 1][5]);
            if (actionLower === "deletegendoc") deleteDriveFile(rows[foundIndex - 1][4]);
            if (actionLower === "deletereceipt") deleteDriveFile(rows[foundIndex - 1][5]);

            activeSheet.deleteRow(foundIndex);
          } else {
            let rowArr = [];
            if (actionLower === "updatememo") rowArr = [params.docNo, params.date, params.title, params.department, fileUrl, params.notes || ""];
            if (actionLower === "updategendoc") rowArr = [params.docName, params.date, params.category, fileUrl, params.notes || ""];
            if (actionLower === "updatereceipt") rowArr = [params.receiptNo, params.date, params.amount, params.payer, fileUrl, params.notes || ""];
            if (actionLower === "updateatt") rowArr = [params.date, params.classLevel, params.totalMale, params.presentMale, params.totalFemale, params.presentFemale, params.percentage];
            
            rowArr.forEach((val, idx) => activeSheet.getRange(foundIndex, idx + 2).setValue(val));
          }
          return createJsonResponse({ status: "success" });
        }
      }
    }

    return createJsonResponse({ status: "error", message: "ไม่พบโมดูลงานหรือสิทธิ์จัดการแผ่นงานไม่ถูกต้อง" });
  } catch(err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

function processFileUpload(params) {
  try {
    const bytes = Utilities.base64Decode(params.fileData);
    const blob = Utilities.newBlob(bytes, params.mimeType, params.fileName);
    const mainFolder = DriveApp.getFolderById(MAIN_FOLDER_ID);
    
    let deptName = params.department || "เอกสารระบบ";
    deptName = deptName.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, "").trim();
    deptName = deptName.replace(/^\d+\.\s*/, "").trim();
    
    let targetFolder;
    const subFolders = mainFolder.getFoldersByName(deptName);
    if (subFolders.hasNext()) {
      targetFolder = subFolders.next();
    } else {
      targetFolder = mainFolder.createFolder(deptName);
    }
    
    const file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    return "";
  }
}

// 🗑️ ฟังก์ชันช่วยดึง File ID จาก Google Drive URL และย้ายไฟล์ลงถังขยะ
function deleteDriveFile(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.includes("drive.google.com")) return;
  try {
    let fileId = "";
    const match = fileUrl.match(/\/d\/([^\/]+)/) || fileUrl.match(/id=([^&]+)/);
    if (match && match[1]) fileId = match[1];

    if (fileId) {
      const file = DriveApp.getFileById(fileId);
      file.setTrashed(true); // ย้ายลงถังขยะ (Trash) ใน Google Drive
    }
  } catch (err) {
    Logger.log("Error deleting drive file: " + err.toString());
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function formatDate(dateVal) {
  if (!dateVal || dateVal === "") return "";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch(e) { return String(dateVal); }
}