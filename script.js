const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxB4E-iBT76N8SfxCUcS99T80JEwtU46xTgAmVU4oaTeSaPHxBb2EEuWNzjBLEw9mv-/exec"; 

// 🔗 1. Firebase เดิม (สำหรับดึงสถิติการมาเรียนเท่านั้น)
const attendanceFirebaseConfig = {
  apiKey: "AIzaSyBZRq6svRTueE7vm1Nq_1HTc9XoF7md5dA",
  authDomain: "school-attendance-system-bb6fd.firebaseapp.com",
  projectId: "school-attendance-system-bb6fd",
  storageBucket: "school-attendance-system-bb6fd.firebasestorage.app",
  messagingSenderId: "759416871053",
  appId: "1:759416871053:web:b35232dbe27a952df12ac4",
  measurementId: "G-W4QSQND8KJ"
};

// 🔗 2. Firebase ใหม่ ( bankayi-esaraban - สำหรับฐานข้อมูลระบบสารบรรณทั้งหมด)
const mainFirebaseConfig = {
  apiKey: "AIzaSyCIeezqGRTVkfSn07vSrgXqytu20uFUUHk",
  authDomain: "bankayi-esaraban.firebaseapp.com",
  projectId: "bankayi-esaraban",
  storageBucket: "bankayi-esaraban.firebasestorage.app",
  messagingSenderId: "391266707209",
  appId: "1:391266707209:web:a7cc2a61177afb98ca55d8"
};

// 🚀 เริ่มต้นเชื่อมต่อทั้ง 2 Firebase App
const attendanceApp = firebase.initializeApp(attendanceFirebaseConfig, "attendanceApp");
const mainApp = firebase.initializeApp(mainFirebaseConfig, "mainApp");

const attendanceDb = firebase.firestore(attendanceApp);
const mainDb = firebase.firestore(mainApp);

let globalSarabanData = [];
let globalOrdersData = [];
let globalMemosData = [];
let globalGenDocsData = [];
let globalReceiptsData = [];
let globalAttendanceData = [];
let currentSarabanTab = 'inbound';
let sarabanEditIndex = null;
let currentUser = null;  
let calendarObj = null;

window.onload = function() { 
    const todayStr = new Date().toISOString().split('T')[0];
    if(document.getElementById('sync-att-date')) {
        document.getElementById('sync-att-date').value = todayStr;
    }
    checkAuth(); 
};

function showLoading(text) {
    document.getElementById('loading-text').innerText = text;
    document.getElementById('loading-spinner').classList.remove('hidden');
}
function hideLoading() { document.getElementById('loading-spinner').classList.add('hidden'); }

function checkAuth() {
    const saved = sessionStorage.getItem("smart_user_session");
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            document.getElementById("login-screen").classList.add("hidden");
            document.getElementById("main-app").classList.remove("hidden");
            initLiveHeader();
            fetchSystemData();
            navigateTo('menu-dashboard');
        } catch(e) {
            sessionStorage.removeItem("smart_user_session");
        }
    } else {
        document.getElementById("main-app").classList.add("hidden");
        document.getElementById("login-screen").classList.remove("hidden");
    }
}

async function handleLogin(event) {
    event.preventDefault();
    showLoading("กำลังตรวจสอบสิทธิ์เข้าใช้งาน...");
    const userInp = document.getElementById("username").value.trim().toLowerCase();
    const passInp = document.getElementById("password").value.trim();
    const errorDiv = document.getElementById("login-error");

    try {
        const usersSnap = await mainDb.collection("users").where("username", "==", userInp).get();
        let matchedUser = null;

        usersSnap.forEach(doc => {
            const u = doc.data();
            if (u.password === passInp) {
                matchedUser = { displayName: u.displayName, role: u.role, department: u.department };
            }
        });

        if (matchedUser) {
            currentUser = matchedUser;
            sessionStorage.setItem("smart_user_session", JSON.stringify(currentUser));
            errorDiv.classList.add("hidden");
            document.getElementById("username").value = "";
            document.getElementById("password").value = "";
            checkAuth();
        } else if (userInp === "admin" && passInp === "1234") {
            currentUser = { displayName: "คุณครูผู้ดูแลระบบ", role: "แอดมิน", department: "ฝ่ายบริหารงานทั่วไป" };
            sessionStorage.setItem("smart_user_session", JSON.stringify(currentUser));
            errorDiv.classList.add("hidden");
            checkAuth();
        } else {
            errorDiv.classList.remove("hidden");
        }
    } catch (err) { 
        if(userInp === "admin" && passInp === "1234") {
            currentUser = { displayName: "คุณครูผู้ดูแลระบบ", role: "แอดมิน", department: "ฝ่ายบริหารงานทั่วไป" };
            sessionStorage.setItem("smart_user_session", JSON.stringify(currentUser));
            errorDiv.classList.add("hidden");
            checkAuth();
        } else {
            errorDiv.classList.remove("hidden");
        }
    } finally {
        hideLoading();
    }
}

function handleLogout() {
    const confirmLogout = confirm("คุณต้องการออกจากระบบใช่หรือไม่?");
    if (!confirmLogout) return;
    sessionStorage.removeItem("smart_user_session");
    currentUser = null;
    checkAuth();
}

function initLiveHeader() {
    const clockEl = document.getElementById("clock-display");
    const badgeEl = document.getElementById("user-role-badge");
    badgeEl.innerText = `สิทธิ์: [${currentUser.role}] - ฝ่าย: ${currentUser.department}`;
    
    setInterval(() => {
        const now = new Date();
        clockEl.innerText = `${currentUser.displayName} | ${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH')} น.`;
    }, 1000);
}

// ===================================================================================
// 📡 ฟังก์ชันดึงข้อมูลจาก Firebase Firestore แบบประหยัดโควต้า (จำกัดจำนวนดึงข้อมูล - Limit Query)
// ===================================================================================
async function fetchSystemData() {
    showLoading("กำลังดึงข้อมูลแบบจำกัดจำนวน (Limit) จากคลาวด์ Firebase Firestore...");
    try {
        const currentToday = document.getElementById('sync-att-date').value || new Date().toISOString().split('T')[0];
        fetchFirebaseAttendanceData(currentToday);

        // อ่านค่า limit จาก Dropdown หน้าระบบสารบรรณ (ค่าเริ่มต้น 100 รายการ)
        const limitSelect = document.getElementById('fetch-limit-saraban');
        const limitVal = limitSelect ? limitSelect.value : "100";

        // สร้าง Query แบบมี Limit สำหรับแต่ละ Collection
        let sarabanQuery = mainDb.collection("saraban").orderBy("date", "desc");
        let ordersQuery = mainDb.collection("orders").orderBy("signDate", "desc");
        let memosQuery = mainDb.collection("memos").orderBy("date", "desc");
        let genDocsQuery = mainDb.collection("gendocs").orderBy("date", "desc");
        let receiptsQuery = mainDb.collection("receipts").orderBy("date", "desc");

        if (limitVal !== "all") {
            const numLimit = parseInt(limitVal, 10) || 100;
            sarabanQuery = sarabanQuery.limit(numLimit);
            ordersQuery = ordersQuery.limit(numLimit);
            memosQuery = memosQuery.limit(numLimit);
            genDocsQuery = genDocsQuery.limit(numLimit);
            receiptsQuery = receiptsQuery.limit(numLimit);
        }

        const [sarabanSnap, ordersSnap, memosSnap, genDocsSnap, receiptsSnap] = await Promise.all([
            sarabanQuery.get(),
            ordersQuery.get(),
            memosQuery.get(),
            genDocsQuery.get(),
            receiptsQuery.get()
        ]);

        globalSarabanData = sarabanSnap.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
        globalOrdersData = ordersSnap.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
        globalMemosData = memosSnap.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
        globalGenDocsData = genDocsSnap.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
        globalReceiptsData = receiptsSnap.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));

        calculateDashboardCounters();
        renderSarabanTable();
        renderWorkflowTable();
        renderOrdersTable();
        initCalendar();
        renderNewMenusTables();
        populateStampSarabanDropdown();

        // 🎯 สั่งให้ทุกตารางเริ่มต้นที่หน้า 1 (หน้าแรก) เสมอหลังโหลดข้อมูล
        setTimeout(() => {
            const tablesToFirstPage = ["saraban", "sign", "orders", "memos", "gendocs", "receipts"];
            tablesToFirstPage.forEach(tableType => jumpToPage(tableType, 1));
        }, 300);

    } catch(e) { 
        console.error(e);
        // Fallback หาก Firestore ยังไม่ได้สร้าง Composite Index สำหรับ orderBy
        try {
            console.warn("สลับไปใช้ดึงข้อมูลแบบ Fallback (ไม่ระบุ orderBy) เพื่อป้องกัน Error");
            const limitSelect = document.getElementById('fetch-limit-saraban');
            const limitVal = limitSelect ? limitSelect.value : "100";
            
            let sQ = mainDb.collection("saraban");
            let oQ = mainDb.collection("orders");
            let mQ = mainDb.collection("memos");
            let gQ = mainDb.collection("gendocs");
            let rQ = mainDb.collection("receipts");

            if (limitVal !== "all") {
                const numLimit = parseInt(limitVal, 10) || 100;
                sQ = sQ.limit(numLimit);
                oQ = oQ.limit(numLimit);
                mQ = mQ.limit(numLimit);
                gQ = gQ.limit(numLimit);
                rQ = rQ.limit(numLimit);
            }

            const [sarabanSnap, ordersSnap, memosSnap, genDocsSnap, receiptsSnap] = await Promise.all([
                sQ.get(), oQ.get(), mQ.get(), gQ.get(), rQ.get()
            ]);

            globalSarabanData = sarabanSnap.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
            globalOrdersData = ordersSnap.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
            globalMemosData = memosSnap.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
            globalGenDocsData = genDocsSnap.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
            globalReceiptsData = receiptsSnap.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));

            calculateDashboardCounters();
            renderSarabanTable();
            renderWorkflowTable();
            renderOrdersTable();
            initCalendar();
            renderNewMenusTables();
            populateStampSarabanDropdown();

            setTimeout(() => {
                const tablesToFirstPage = ["saraban", "sign", "orders", "memos", "gendocs", "receipts"];
                tablesToFirstPage.forEach(tableType => jumpToPage(tableType, 1));
            }, 300);
        } catch(fallbackErr) {
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อ Firebase Firestore: " + fallbackErr.message);
        }
    } finally {
        hideLoading();
    }
}

// 📦 ฟังก์ชันย้ายข้อมูลเดิมจาก Google Sheet เข้า Firebase โปรเจกต์ใหม่ (ทำครั้งเดียว)
async function migrateGoogleSheetToFirebase() {
    if (!confirm("คุณต้องการดึงข้อมูลเดิมจาก Google Sheet ทั้งหมด แล้วนำมาบันทึกลง Firebase โปรเจกต์ใหม่ใช่หรือไม่?")) return;
    showLoading("กำลังอ่านข้อมูลเดิมจาก Google Sheet เพื่อย้ายเข้า Firebase ใหม่...");

    try {
        const res = await fetch(GOOGLE_SCRIPT_URL);
        const out = await res.json();

        if (out.status === "success") {
            const batch = mainDb.batch();

            if (out.sarabanData && out.sarabanData.length > 0) {
                out.sarabanData.forEach(item => {
                    const ref = mainDb.collection("saraban").doc(item.internalId.replace(/\//g, "_"));
                    batch.set(ref, item, { merge: true });
                });
            }

            if (out.ordersData && out.ordersData.length > 0) {
                out.ordersData.forEach(item => {
                    const docId = item.id || item.orderId || 'ORD-' + Date.now();
                    const ref = mainDb.collection("orders").doc(String(docId));
                    batch.set(ref, item, { merge: true });
                });
            }

            if (out.memosData && out.memosData.length > 0) {
                out.memosData.forEach(item => {
                    const ref = mainDb.collection("memos").doc(String(item.id));
                    batch.set(ref, item, { merge: true });
                });
            }

            if (out.genDocsData && out.genDocsData.length > 0) {
                out.genDocsData.forEach(item => {
                    const ref = mainDb.collection("gendocs").doc(String(item.id));
                    batch.set(ref, item, { merge: true });
                });
            }

            if (out.receiptsData && out.receiptsData.length > 0) {
                out.receiptsData.forEach(item => {
                    const ref = mainDb.collection("receipts").doc(String(item.id));
                    batch.set(ref, item, { merge: true });
                });
            }

            await batch.commit();
            alert("ย้ายข้อมูลจาก Google Sheet เข้าสู่ Firebase Firestore โปรเจกต์ใหม่สำเร็จเรียบร้อย!");
            await fetchSystemData();
        }
    } catch (err) {
        alert("เกิดข้อผิดพลาดขณะย้ายข้อมูล: " + err.message);
    } finally {
        hideLoading();
    }
}

// 📂 ฟังก์ชันช่วยอัปโหลดไฟล์ไป Google Drive
async function uploadFileToGoogleDrive(fileInputId, department) {
    const fileInput = document.getElementById(fileInputId);
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return "";

    const file = fileInput.files[0];
    const base64 = await convertFileToBase64(file);
    
    const bodyData = new URLSearchParams();
    bodyData.append("action", "uploadOnly");
    bodyData.append("department", department || "เอกสารระบบ");
    bodyData.append("fileData", base64);
    bodyData.append("fileName", file.name);
    bodyData.append("mimeType", file.type);

    try {
        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: bodyData.toString()
        });
        const text = await res.text();
        if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
            console.error("Deploy Error: สิทธิ์ Web App ไม่ใช่ Anyone");
            return "";
        }
        const result = JSON.parse(text);
        return result.fileUrl || "";
    } catch (err) {
        console.error("Upload Error:", err);
        return "";
    }
}

// 🗑️ ฟังก์ชันช่วยสั่งลบไฟล์ใน Google Drive
async function deleteGoogleDriveFiles(fileUrls) {
    if (!fileUrls || fileUrls.length === 0) return;
    const validUrls = fileUrls.filter(url => url && typeof url === 'string' && url.includes('drive.google.com'));
    if (validUrls.length === 0) return;

    try {
        const bodyData = new URLSearchParams();
        bodyData.append("action", "deleteFile");
        bodyData.append("fileUrls", JSON.stringify(validUrls));

        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: bodyData.toString()
        });
    } catch (err) {
        console.error("Failed to delete drive file:", err);
    }
}

function syncAttendanceWithFirebase() {
    const dateVal = document.getElementById('sync-att-date').value;
    if(!dateVal) return alert("กรุณาระบุวันที่ต้องการซิงค์สถิติการมาเรียน");
    fetchFirebaseAttendanceData(dateVal);
}

function fetchFirebaseAttendanceData(targetDate) {
    showLoading("กำลังดึงสถิติการมาเรียนจาก Firebase...");
    
    attendanceDb.collection("attendance").doc(targetDate).get()
        .then((doc) => {
            const tbody = document.getElementById('attendance-table-body');
            const mBody = document.getElementById('attendance-mobile-cards');
            if (tbody) tbody.innerHTML = '';
            if (mBody) mBody.innerHTML = '';

            let grandTotalStudents = 0, grandTotalMale = 0, grandTotalFemale = 0;
            let grandPresent = 0, grandAbsent = 0;
            let grandMaleAbsent = 0, grandFemaleAbsent = 0;
            let grandMalePresent = 0, grandFemalePresent = 0;

            if (doc.exists) {
                const fbData = doc.data();
                const classes = fbData.classes || {};
                let hasData = false;
                
                const classOrder = ['อ.1', 'อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
                
                classOrder.forEach(className => {
                    if (classes[className]) {
                        hasData = true;
                        const c = classes[className];
                        
                        const tMale = parseInt(c.male) || 0;
                        const tFemale = parseInt(c.female) || 0;
                        const totalClass = tMale + tFemale;
                        
                        const pMale = (c.malePresent !== undefined && c.malePresent !== "") ? parseInt(c.malePresent) : 0;
                        const pFemale = (c.femalePresent !== undefined && c.femalePresent !== "") ? parseInt(c.femalePresent) : 0;
                        const present = parseInt(c.present) || 0;
                        
                        const abMale = (tMale - pMale) < 0 ? 0 : (tMale - pMale);
                        const abFemale = (tFemale - pFemale) < 0 ? 0 : (tFemale - pFemale);
                        const absent = parseInt(c.absent) || 0;
                        
                        const classPercent = totalClass > 0 ? ((present / totalClass) * 100).toFixed(2) : "0.00";

                        grandTotalStudents += totalClass;
                        grandTotalMale += tMale;
                        grandTotalFemale += tFemale;
                        grandPresent += present;
                        grandAbsent += absent;
                        grandMaleAbsent += abMale;
                        grandFemaleAbsent += abFemale;
                        grandMalePresent += pMale;
                        grandFemalePresent += pFemale;

                        if (tbody) {
                            tbody.innerHTML += `
                                <tr class="hover:bg-slate-50 transition-colors text-center font-medium">
                                    <td class="p-3 font-bold text-left text-slate-800 bg-slate-50/50">${className}</td>
                                    <td class="p-2 text-slate-500">${tMale}</td>
                                    <td class="p-2 text-slate-500">${tFemale}</td>
                                    <td class="p-2 font-bold text-slate-900 bg-slate-50">${totalClass}</td>
                                    <td class="p-2"><span class="px-2 py-0.5 bg-blue-500/10 text-blue-600 border border-blue-500/20 rounded font-bold">${pMale}</span></td>
                                    <td class="p-2"><span class="px-2 py-0.5 bg-pink-500/10 text-pink-600 border border-pink-500/20 rounded font-bold">${pFemale}</span></td>
                                    <td class="p-2"><span class="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded font-bold">${present}</span></td>
                                    <td class="p-2"><span class="px-2 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded font-bold">${abMale}</span></td>
                                    <td class="p-2"><span class="px-2 py-0.5 bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded font-bold">${abFemale}</span></td>
                                    <td class="p-2"><span class="px-2 py-0.5 bg-rose-500/10 text-rose-700 border border-rose-500/20 rounded font-bold">${absent}</span></td>
                                    <td class="p-3 text-right pr-6 font-black text-emerald-500 text-sm bg-slate-50/30">${classPercent}%</td>
                                </tr>
                            `;
                        }

                        if (mBody) {
                            mBody.innerHTML += `
                                <div class="soft-card-sm p-4 space-y-3 bg-white border border-slate-200/90 shadow-2xs">
                                    <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <span class="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl font-black text-xs">ระดับชั้น ${className}</span>
                                        <span class="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-black text-xs">มาเรียน ${classPercent}%</span>
                                    </div>
                                    <div class="grid grid-cols-3 gap-2 text-center text-xs">
                                        <div class="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                            <span class="text-[10px] font-bold text-slate-400 block">ทั้งหมด</span>
                                            <span class="font-black text-slate-800 text-sm">${totalClass}</span>
                                            <span class="text-[9px] text-slate-400 block">ชาย ${tMale} | หญิง ${tFemale}</span>
                                        </div>
                                        <div class="bg-emerald-50/60 p-2 rounded-xl border border-emerald-100">
                                            <span class="text-[10px] font-bold text-emerald-700 block">มาเรียน</span>
                                            <span class="font-black text-emerald-600 text-sm">${present}</span>
                                            <span class="text-[9px] text-emerald-600 block">ชาย ${pMale} | หญิง ${pFemale}</span>
                                        </div>
                                        <div class="bg-rose-50/60 p-2 rounded-xl border border-rose-100">
                                            <span class="text-[10px] font-bold text-rose-700 block">ขาดเรียน</span>
                                            <span class="font-black text-rose-600 text-sm">${absent}</span>
                                            <span class="text-[9px] text-rose-600 block">ชาย ${abMale} | หญิง ${abFemale}</span>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    }
                });
                
                if(hasData) {
                    const grandPercentage = grandTotalStudents > 0 ? ((grandPresent / grandTotalStudents) * 100).toFixed(2) : "0.00";
                    const mAbsentPercent = grandTotalMale > 0 ? ((grandMaleAbsent / grandTotalMale) * 100).toFixed(2) : "0.00";
                    const fAbsentPercent = grandTotalFemale > 0 ? ((grandFemaleAbsent / grandTotalFemale) * 100).toFixed(2) : "0.00";

                    if (tbody) {
                        tbody.innerHTML += `
                            <tr class="bg-slate-100 font-bold text-center text-slate-900 border-t border-slate-300">
                                <td class="p-3 text-left font-black">รวม</td>
                                <td class="p-2">${grandTotalMale}</td>
                                <td class="p-2">${grandTotalFemale}</td>
                                <td class="p-2 font-black">${grandTotalStudents}</td>
                                <td class="p-2 text-blue-600">${grandMalePresent}</td>
                                <td class="p-2 text-pink-600">${grandFemalePresent}</td>
                                <td class="p-2 text-emerald-600">${grandPresent}</td>
                                <td class="p-2 text-rose-500">${grandMaleAbsent}</td>
                                <td class="p-2 text-rose-500">${grandFemaleAbsent}</td>
                                <td class="p-2 text-rose-600">${grandAbsent}</td>
                                <td class="p-3 text-right pr-6 text-emerald-600 font-black text-sm">${grandPercentage}%</td>
                            </tr>
                        `;
                    }

                    document.getElementById('att-dash-total').innerHTML = `${grandTotalStudents} <span class="text-xs font-normal text-slate-400">คน</span>`;
                    document.getElementById('att-dash-present').innerHTML = `${grandPresent} <span class="text-xs font-semibold text-emerald-500">(${grandPercentage}%)</span>`;
                    document.getElementById('att-dash-absent').innerHTML = `${grandAbsent} <span class="text-xs font-normal text-slate-400">คน</span>`;
                    document.getElementById('att-dash-male-absent').innerHTML = `${grandMaleAbsent} <span class="text-[10px] font-normal text-rose-400">(${mAbsentPercent}%)</span>`;
                    document.getElementById('att-dash-female-absent').innerHTML = `${grandFemaleAbsent} <span class="text-[10px] font-normal text-pink-400">(${fAbsentPercent}%)</span>`;
                } else {
                    renderFallbackAttendanceTable(targetDate);
                }
            } else {
                renderFallbackAttendanceTable(targetDate);
            }
        })
        .catch((error) => {
            console.error("Firebase Sync Error: ", error);
            renderFallbackAttendanceTable(targetDate);
        })
        .finally(() => { if(typeof hideLoading === 'function') hideLoading(); });
}

function renderFallbackAttendanceTable(targetDate) {
    const tbody = document.getElementById('attendance-table-body');
    const mBody = document.getElementById('attendance-mobile-cards');
    if (!tbody && !mBody) return;
    const localFilter = globalAttendanceData.filter(d => d.date === targetDate);
    
    if(localFilter.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="py-10 text-center text-slate-400 text-xs">ไม่พบสถิติการเช็คชื่อในระบบคลาวด์ Firebase และชีตหลักของวันที่ ${formatThaiDate(targetDate)}</td></tr>`;
        if (mBody) mBody.innerHTML = `<div class="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs font-bold shadow-xs">ไม่พบสถิติการเช็คชื่อของวันที่ ${formatThaiDate(targetDate)}</div>`;
        return;
    }
    
    if (tbody) {
        tbody.innerHTML = localFilter.map(item => {
            const tM = parseInt(item.totalMale) || 0;
            const tF = parseInt(item.totalFemale) || 0;
            const pM = parseInt(item.presentMale) || 0;
            const pF = parseInt(item.presentFemale) || 0;
            return `
                <tr class="hover:bg-slate-50 transition-colors text-center font-medium">
                    <td class="p-3 font-bold text-left text-slate-800 bg-slate-50/50">${item.classLevel}</td>
                    <td class="p-2 text-slate-500">${tM}</td>
                    <td class="p-2 text-slate-500">${tF}</td>
                    <td class="p-2 font-bold text-slate-900 bg-slate-50">${tM + tF}</td>
                    <td class="p-2"><span class="px-2 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded font-bold">${pM}</span></td>
                    <td class="p-2"><span class="px-2 py-0.5 bg-pink-500/10 text-pink-500 border border-pink-500/20 rounded font-bold">${pF}</span></td>
                    <td class="p-2"><span class="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded font-bold">${pM + pF}</span></td>
                    <td class="p-2"><span class="px-2 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded font-bold">${tM - pM < 0 ? 0 : tM - pM}</span></td>
                    <td class="p-2"><span class="px-2 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded font-bold">${tF - pF < 0 ? 0 : tF - pF}</span></td>
                    <td class="p-2"><span class="px-2 py-0.5 bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded font-bold">${(tM + tF) - (pM + pF)}</span></td>
                    <td class="p-3 text-right pr-6 font-black text-blue-600 bg-slate-50/30">${item.percentage}%</td>
                </tr>
            `;
        }).join('');
    }

    if (mBody) {
        mBody.innerHTML = localFilter.map(item => {
            const tM = parseInt(item.totalMale) || 0;
            const tF = parseInt(item.totalFemale) || 0;
            const pM = parseInt(item.presentMale) || 0;
            const pF = parseInt(item.presentFemale) || 0;
            const abM = tM - pM < 0 ? 0 : tM - pM;
            const abF = tF - pF < 0 ? 0 : tF - pF;

            return `
                <div class="soft-card-sm p-4 space-y-3 bg-white border border-slate-200/90 shadow-2xs">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span class="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl font-black text-xs">ระดับชั้น ${item.classLevel}</span>
                        <span class="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-black text-xs">มาเรียน ${item.percentage}%</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-center text-xs">
                        <div class="bg-slate-50 p-2 rounded-xl border border-slate-100">
                            <span class="text-[10px] font-bold text-slate-400 block">ทั้งหมด</span>
                            <span class="font-black text-slate-800 text-sm">${tM + tF}</span>
                            <span class="text-[9px] text-slate-400 block">ชาย ${tM} | หญิง ${tF}</span>
                        </div>
                        <div class="bg-emerald-50/60 p-2 rounded-xl border border-emerald-100">
                            <span class="text-[10px] font-bold text-emerald-700 block">มาเรียน</span>
                            <span class="font-black text-emerald-600 text-sm">${pM + pF}</span>
                            <span class="text-[9px] text-emerald-600 block">ชาย ${pM} | หญิง ${pF}</span>
                        </div>
                        <div class="bg-rose-50/60 p-2 rounded-xl border border-rose-100">
                            <span class="text-[10px] font-bold text-rose-700 block">ขาดเรียน</span>
                            <span class="font-black text-rose-600 text-sm">${abM + abF}</span>
                            <span class="text-[9px] text-rose-600 block">ชาย ${abM} | หญิง ${abF}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

function navigateTo(targetTabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(targetTabId).classList.remove('hidden');

    // Desktop sidebar active state
    document.querySelectorAll('aside nav button').forEach(btn => btn.classList.remove('sidebar-active'));
    const activeNavId = targetTabId.replace('menu-', 'nav-');
    if(document.getElementById(activeNavId)) {
        document.getElementById(activeNavId).classList.add('sidebar-active');
    }

    // Mobile bottom tab bar active state
    document.querySelectorAll('.mobile-tab-btn').forEach(btn => btn.classList.remove('mobile-tab-active'));
    const mobileNavId = targetTabId.replace('menu-', 'mobile-nav-');
    if(document.getElementById(mobileNavId)) {
        document.getElementById(mobileNavId).classList.add('mobile-tab-active');
    }

    if(targetTabId === 'menu-calendar' && calendarObj) {
        setTimeout(() => calendarObj.render(), 150); 
    }
}

function toggleMobileMoreMenu() {
    const modal = document.getElementById('mobile-more-modal');
    if (modal) {
        modal.classList.toggle('hidden');
    }
}

let chartDeptObj = null; let chartPriObj = null;

function calculateDashboardCounters() {
    const inCount = globalSarabanData.filter(d => d.internalId && d.internalId.startsWith("รับ")).length;
    const outCount = globalSarabanData.filter(d => d.internalId && d.internalId.startsWith("ส่ง")).length;
    const pendingCount = globalSarabanData.filter(d => d.status === "รอดำเนินการ").length;
    const orderCount = globalOrdersData.length;

    const elIn = document.getElementById("dash-stat-inbound") || document.getElementById("dash-in");
    const elOut = document.getElementById("dash-stat-outbound") || document.getElementById("dash-out");
    const elPending = document.getElementById("dash-stat-pending") || document.getElementById("dash-pending");
    const elOrders = document.getElementById("dash-stat-orders") || document.getElementById("dash-orders");

    if (elIn) elIn.innerHTML = `${inCount} <span class="text-xs font-normal text-slate-400">ฉบับ</span>`;
    if (elOut) elOut.innerHTML = `${outCount} <span class="text-xs font-normal text-slate-400">ฉบับ</span>`;
    if (elPending) elPending.innerHTML = `${pendingCount} <span class="text-xs font-normal text-slate-400">รายการ</span>`;
    if (elOrders) elOrders.innerHTML = `${orderCount} <span class="text-xs font-normal text-slate-400">ฉบับ</span>`;

    const depts = ["ฝ่ายบริหารงานทั่วไป", "ฝ่ายบริหารงานงบประมาณ", "ฝ่ายบริหารงานวิชาการ", "ฝ่ายบริหารงานบุคคล"];
    const deptCounts = depts.map(name => globalSarabanData.filter(d => d.department && d.department.includes(name)).length);
    const priorityLevels = ["ปกติ", "ด่วน", "ด่วนมาก", "ด่วนที่สุด"];
    const priorityCounts = priorityLevels.map(level => globalSarabanData.filter(d => d.priority && d.priority.includes(level)).length);

    if(chartDeptObj) chartDeptObj.destroy();
    if(chartPriObj) chartPriObj.destroy();

    chartDeptObj = new Chart(document.getElementById('chart-departments'), {
        type: 'pie',
        data: {
            labels: ['งานทั่วไป', 'งานงบประมาณ', 'งานวิชาการ', 'งานบุคคล'],
            datasets: [{ data: deptCounts, backgroundColor: ['#3b82f6', '#f59e0b', '#6366f1', '#a855f7'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    chartPriObj = new Chart(document.getElementById('chart-priority'), {
        type: 'bar',
        data: {
            labels: priorityLevels,
            datasets: [{ label: 'จำนวนเอกสาร (ฉบับ)', data: priorityCounts, backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

function switchSarabanTab(tab) {
    currentSarabanTab = tab;
    document.getElementById('subtab-inbound').className = tab === 'inbound' ? "px-5 py-2 rounded-lg text-xs font-bold bg-white text-blue-600 shadow-xs cursor-pointer" : "px-5 py-2 rounded-lg text-xs font-bold text-slate-600 cursor-pointer";
    document.getElementById('subtab-outbound').className = tab === 'outbound' ? "px-5 py-2 rounded-lg text-xs font-bold bg-white text-blue-600 shadow-xs cursor-pointer" : "px-5 py-2 rounded-lg text-xs font-bold text-slate-600 cursor-pointer";
    document.getElementById('th-saraban-id').innerText = tab === 'inbound' ? "เลขทะเบียนรับ" : "เลขทะเบียนส่ง";
    renderSarabanTable();
    
    // สลับสลับแท็บรับ-ส่ง ให้กลับมาเปิดหน้า 1 (หน้าแรก) เสมอ
    setTimeout(() => {
        jumpToPage('saraban', 1);
    }, 50);
}

function renderSarabanTable() {
    const tbody = document.getElementById("saraban-table-body");
    tbody.innerHTML = "";
    const prefix = currentSarabanTab === 'inbound' ? 'รับ' : 'ส่ง';
    const raw = globalSarabanData.filter(d => d.internalId && d.internalId.startsWith(prefix));
    const search = document.getElementById("search-saraban").value.toLowerCase();
    const filtered = raw.filter(d => (d.internalId && d.internalId.toLowerCase().includes(search)) || (d.docId && d.docId.toLowerCase().includes(search)) || (d.title && d.title.toLowerCase().includes(search)));
    
    if(filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="py-10 text-center text-slate-400 text-xs">ไม่พบข้อมูลทะเบียนเอกสารในระบบขณะนี้</td></tr>`;
        return;
    }

    filtered.forEach(doc => {
        const realIndex = globalSarabanData.findIndex(d => d.internalId === doc.internalId);
        const priority = doc.priority || "ปกติ";
        const pColor = priority.includes("ที่สุด") ? "text-rose-600 bg-rose-50" : priority.includes("มาก") ? "text-orange-600 bg-orange-50" : priority.includes("ด่วน") ? "text-amber-600 bg-amber-50" : "text-emerald-600 bg-emerald-50";
        
        const sColor = doc.status === "สำเร็จแล้ว" ? "bg-emerald-500 text-white" : 
                       doc.status === "ยังไม่ปริ้น" ? "bg-sky-500 text-white" : "bg-amber-500 text-white";
        
        let linksArray = [];
        
        if (doc.fileUrl && doc.fileUrl.startsWith("http")) {
            linksArray.push(`<a href="${doc.fileUrl}" target="_blank" title="เปิดไฟล์คลาวด์" class="text-blue-600 font-bold hover:underline bg-blue-50 px-2 py-0.5 rounded-md text-xs inline-flex items-center gap-1">หนังสือ</a>`);
        }
        
        for (let i = 1; i <= 6; i++) {
            const extraUrl = doc[`link${i}`];
            if (extraUrl && extraUrl.trim().startsWith("http")) {
                linksArray.push(`<a href="${extraUrl.trim()}" target="_blank" title="เปิดลิงก์แนบที่ ${i}" class="text-indigo-600 font-bold hover:underline bg-indigo-50 px-2 py-0.5 rounded-md text-xs inline-flex items-center gap-1">ไฟล์ ${i}</a>`);
            }
        }
        
        const fileLinkHtml = linksArray.length > 0 
            ? `<div class="flex flex-col gap-1 items-center justify-center">${linksArray.join('')}</div>` 
            : `<span class="text-slate-300 text-xs">ไม่มีไฟล์</span>`;
        
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-3 px-4 font-bold text-slate-900">${doc.internalId}</td>
                <td class="py-3 px-3 font-semibold">${doc.docId || ''}</td>
                <td class="py-3 px-3">${formatThaiDate(doc.date)}</td>
                <td class="py-3 px-3 font-bold text-blue-800">${(doc.department || '').replace("ฝ่ายบริหารงาน", "")}</td>
                <td class="py-3 px-4 font-bold text-slate-800">${doc.title || ''}</td>
                <td class="py-3 px-3 text-center"><span class="px-2 py-0.5 rounded-md text-[11px] font-bold ${pColor}">${priority}</span></td>
                <td class="py-3 px-3 text-center font-bold text-rose-500">${formatThaiDateShort(doc.deadline) || '-'}</td>
                <td class="py-3 px-3 text-center"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${sColor}">${doc.status || 'รอดำเนินการ'}</span></td>
                <td class="py-3 px-3 text-center">${fileLinkHtml}</td>
                <td class="py-3 px-4 text-right space-x-2 font-bold">
                    <button onclick="editSaraban(${realIndex})" class="text-blue-600 hover:text-blue-800 cursor-pointer">แก้ไข</button>
                    <button onclick="deleteSaraban(${realIndex})" class="text-rose-500 hover:text-rose-700 cursor-pointer">ลบ</button>
                </td>
            </tr>
        `;
    });
}

function openSarabanModal() {
    sarabanEditIndex = null; document.getElementById("saraban-form").reset();
    document.getElementById("form-file-status").classList.add("hidden");
    
    for (let i = 1; i <= 6; i++) {
        if (document.getElementById(`form-link${i}`)) document.getElementById(`form-link${i}`).value = "";
    }

    const prefix = currentSarabanTab === 'inbound' ? 'รับ' : 'ส่ง';
    const subList = globalSarabanData.filter(d => d.internalId && d.internalId.startsWith(prefix));
    
    let nextNum = 1;
    if(subList.length > 0) {
        const allNumbers = subList.map(d => {
            const match = d.internalId.match(new RegExp(`${prefix}\\s+(\\d+)`));
            return match ? parseInt(match[1]) : 0;
        });
        const maxNum = Math.max(...allNumbers);
        if (maxNum > 0) nextNum = maxNum + 1;
    }
    
    document.getElementById("form-internal-id").value = `${prefix} ${nextNum}/2569`;
    document.getElementById("saraban-modal").classList.remove("hidden");
}

function editSaraban(index) {
    sarabanEditIndex = index; const data = globalSarabanData[index];
    document.getElementById("form-internal-id").value = data.internalId;
    document.getElementById("form-doc-id").value = data.docId || "";
    document.getElementById("form-date").value = data.date || "";
    document.getElementById("form-department").value = data.department || "ฝ่ายบริหารงานทั่วไป";
    document.getElementById("form-source").value = data.source || "";
    document.getElementById("form-destination").value = data.destination || "";
    document.getElementById("form-title").value = data.title || "";
    document.getElementById("form-priority").value = data.priority || "ปกติ";
    document.getElementById("form-deadline").value = data.deadline || "";
    document.getElementById("form-status").value = data.status || "รอดำเนินการ";

    for (let i = 1; i <= 6; i++) {
        const el = document.getElementById(`form-link${i}`);
        if (el) el.value = data[`link${i}`] || "";
    }

    if(data.fileUrl && data.fileUrl.startsWith("http")) {
        const el = document.getElementById("form-file-status");
        el.innerHTML = `คลาวด์ลิงก์เดิม: <a href="${data.fileUrl}" target="_blank" class="text-blue-600 font-bold underline">เปิดดูไฟล์แนบ</a>`;
        el.classList.remove("hidden");
    }
    document.getElementById("saraban-modal").classList.remove("hidden");
}
function closeSarabanModal() { document.getElementById("saraban-modal").classList.add("hidden"); }

async function handleSarabanSubmit(event) {
    event.preventDefault();
    const currentTitle = document.getElementById("form-title").value;

    if (sarabanEditIndex === null) { 
        if (isDuplicateData("saraban-table-body", 4, currentTitle)) {
            alert(`เรื่อง "${currentTitle}" นี้เคยลงทะเบียนไว้ในระบบสารบรรณแล้วครับ`);
            return;
        }
    }

    showLoading("กำลังประมวลผลไฟล์แนบลง Google Drive และบันทึกเข้า Firebase...");

    try {
        const dept = document.getElementById("form-department").value;
        let driveFileUrl = sarabanEditIndex !== null ? (globalSarabanData[sarabanEditIndex].fileUrl || "") : "";

        const uploadedUrl = await uploadFileToGoogleDrive("form-file", dept);
        if (uploadedUrl) driveFileUrl = uploadedUrl;

        const internalId = document.getElementById("form-internal-id").value;
        const docObj = {
            internalId: internalId,
            docId: document.getElementById("form-doc-id").value,
            date: document.getElementById("form-date").value,
            department: dept,
            source: document.getElementById("form-source").value,
            destination: document.getElementById("form-destination").value,
            title: currentTitle,
            priority: document.getElementById("form-priority").value,
            deadline: document.getElementById("form-deadline").value,
            status: document.getElementById("form-status").value,
            managercomment: sarabanEditIndex !== null ? (globalSarabanData[sarabanEditIndex].managercomment || "") : "",
            fileUrl: driveFileUrl,
            link1: document.getElementById("form-link1") ? document.getElementById("form-link1").value.trim() : "",
            link2: document.getElementById("form-link2") ? document.getElementById("form-link2").value.trim() : "",
            link3: document.getElementById("form-link3") ? document.getElementById("form-link3").value.trim() : "",
            link4: document.getElementById("form-link4") ? document.getElementById("form-link4").value.trim() : "",
            link5: document.getElementById("form-link5") ? document.getElementById("form-link5").value.trim() : "",
            link6: document.getElementById("form-link6") ? document.getElementById("form-link6").value.trim() : ""
        };

        const fbDocId = internalId.replace(/\//g, "_");
        await mainDb.collection("saraban").doc(fbDocId).set(docObj, { merge: true });

        closeSarabanModal(); 
        await fetchSystemData(); 
    } catch(e) { 
        alert("เกิดข้อผิดพลาดในการบันทึก: " + e.message); 
    } finally { 
        hideLoading(); 
    }
}

function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

// 🗑️ ปรับปรุง: ลบรายการหนังสือรับ-ส่ง พร้อมไฟล์แนบใน Google Drive
async function deleteSaraban(index) {
    const item = globalSarabanData[index];
    if(confirm(`ยืนยันขอลบแถวทะเบียนสารบรรณรหัส ${item.internalId} พร้อมไฟล์แนบทั้งหมดใน Google Drive หรือไม่?`)) {
        showLoading("กำลังลบข้อมูลออกจากระบบ Firebase และ Google Drive...");
        try {
            // รวบรวมไฟล์แนบทั้งหมด (1-6)
            const filesToDelete = [item.fileUrl];
            for (let i = 1; i <= 6; i++) {
                if (item[`link${i}`]) filesToDelete.push(item[`link${i}`]);
            }

            // ลบไฟล์ออกจาก Google Drive
            await deleteGoogleDriveFiles(filesToDelete);

            // ลบข้อมูลออกจาก Firebase
            const fbDocId = item.firebaseId || item.internalId.replace(/\//g, "_");
            await mainDb.collection("saraban").doc(fbDocId).delete();
            await fetchSystemData();
        } catch(e){ alert(e.message); } finally { hideLoading(); }
    }
}

function renderWorkflowTable() {
    const tbody = document.getElementById("workflow-table-body");
    const mBody = document.getElementById("workflow-mobile-cards");
    if (tbody) tbody.innerHTML = "";
    if (mBody) mBody.innerHTML = "";
    
    const inboundDocs = globalSarabanData.filter(doc => doc.internalId && doc.internalId.startsWith("รับ"));
    
    if (inboundDocs.length === 0) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-slate-400 text-xs">ยังไม่มีรายการหนังสือรับในระบบเสนอเกษียณ</td></tr>`;
        if (mBody) mBody.innerHTML = `<div class="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs font-bold shadow-xs">ยังไม่มีรายการหนังสือรับในระบบเสนอเกษียณ</div>`;
        return;
    }

    inboundDocs.forEach((doc) => {
        const realIdx = globalSarabanData.findIndex(d => d.internalId === doc.internalId);
        
        const isDirector = currentUser.role === "ผอ." || currentUser.role === "แอดมิน";
        const rowActionHtml = isDirector 
            ? `<div class="flex gap-2"><input type="text" id="work-comment-${realIdx}" value="${doc.managercomment || ''}" placeholder="ระบุข้อสั่งการ" class="px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs w-full bg-white"><button onclick="submitWorkflowComment(${realIdx})" class="bg-blue-600 text-white font-bold px-3 py-1.5 rounded-xl text-xs hover:bg-blue-700 cursor-pointer whitespace-nowrap shadow-2xs">เซ็นคำสั่ง</button></div>`
            : `<span class="text-slate-400 font-bold text-xs">ไม่มีสิทธิ์บันทึกข้อสั่งการ</span>`;
        
        const mobileActionHtml = isDirector
            ? `<div class="flex gap-2 w-full mt-1"><input type="text" id="m-work-comment-${realIdx}" value="${doc.managercomment || ''}" placeholder="ระบุข้อสั่งการของ ผอ." class="px-3 py-2 border border-slate-300 rounded-xl text-xs flex-1 bg-white"><button onclick="submitMobileWorkflowComment(${realIdx})" class="bg-blue-600 text-white font-bold px-4 py-2 rounded-xl text-xs hover:bg-blue-700 cursor-pointer whitespace-nowrap shadow-2xs">เซ็นคำสั่ง</button></div>`
            : `<span class="text-slate-400 font-bold text-xs">ไม่มีสิทธิ์บันทึกข้อสั่งการ</span>`;

        const isMyDept = currentUser.department === doc.department || currentUser.role === "แอดมิน";
        const statusBtnHtml = isMyDept ? `<button onclick="toggleWorkflowStatus(${realIdx})" class="mt-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer block w-full">สลับสถานะ</button>` : ``;
        const mobileStatusBtnHtml = isMyDept ? `<button onclick="toggleWorkflowStatus(${realIdx})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 cursor-pointer">สลับสถานะ</button>` : ``;

        const sColor = doc.status === "สำเร็จแล้ว" ? "bg-emerald-500 text-white" : 
                       doc.status === "ยังไม่ปริ้น" ? "bg-sky-500 text-white" : "bg-amber-500 text-white";
        
        const fileLinkHtml = doc.fileUrl && doc.fileUrl.startsWith("http") ? `<a href="${doc.fileUrl}" target="_blank" class="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-xs inline-flex items-center gap-1 border border-indigo-200 transition-colors">เปิดไฟล์แนบ</a>` : `<span class="text-slate-300 italic text-xs">ไม่มีไฟล์แนบ</span>`;

        if (tbody) {
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-4 font-bold text-slate-900">${doc.internalId}</td>
                    <td class="py-3 px-3"><span class="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md font-bold text-xs text-slate-700">${(doc.department || '').replace("ฝ่ายบริหารงาน", "")}</span></td>
                    <td class="py-3 px-4 font-bold text-slate-800">${doc.title || ''}</td>
                    <td class="py-3 px-3 text-center">${fileLinkHtml}</td>
                    <td class="py-3 px-4 text-blue-800 font-bold italic bg-blue-50/20">${doc.managercomment || 'รอกรรมการ/ผอ. ลงนาม...'}</td>
                    <td class="py-3 px-3 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-bold ${sColor}">${doc.status || 'รอดำเนินการ'}</span></td>
                    <td class="py-3 px-4 text-center">${rowActionHtml} ${statusBtnHtml}</td>
                </tr>
            `;
        }
    });
}

async function submitWorkflowComment(idx) {
    const commentVal = document.getElementById(`work-comment-`+idx).value;
    showLoading("กำลังลงนามบันทึกข้อสั่งการลง Firebase...");
    const target = globalSarabanData[idx];
    try {
        const fbDocId = target.firebaseId || target.internalId.replace(/\//g, "_");
        await mainDb.collection("saraban").doc(fbDocId).update({ managercomment: commentVal });
        await fetchSystemData();
    } catch(e){ alert(e.message); } finally { hideLoading(); }
}

async function toggleWorkflowStatus(idx) {
    const target = globalSarabanData[idx];
    const newStatus = target.status === "สำเร็จแล้ว" ? "รอดำเนินการ" : "สำเร็จแล้ว";
    showLoading("กำลังปรับเปลี่ยนสถานะงานสารบรรณลง Firebase...");
    try {
        const fbDocId = target.firebaseId || target.internalId.replace(/\//g, "_");
        await mainDb.collection("saraban").doc(fbDocId).update({ status: newStatus });
        await fetchSystemData();
    } catch(e){ alert(e.message); } finally { hideLoading(); }
}

function renderOrdersTable() {
    const tbody = document.getElementById("orders-table-body"); tbody.innerHTML = "";
    if(globalOrdersData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-slate-400 text-xs">ยังไม่มีการออกเลขคำสั่งโรงเรียนในปีนี้</td></tr>`;
        return;
    }
    globalOrdersData.forEach(ord => {
        const fl = ord.fileUrl && ord.fileUrl.startsWith("http") ? `<a href="${ord.fileUrl}" target="_blank" class="text-purple-700 font-bold underline bg-purple-50 px-2 py-0.5 rounded-md text-xs">เปิดดูครุฑ</a>` : `<span class="text-slate-300">ไม่มีไฟล์</span>`;
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 font-black text-purple-700">เลขที่ ${ord.orderId}</td>
                <td class="py-3 px-3 font-bold text-slate-400">${ord.year}</td>
                <td class="py-3 px-5 font-bold text-slate-900">${ord.title}</td>
                <td class="py-3 px-4 text-slate-600 font-medium">${formatThaiDateShort(ord.signDate)}</td>
                <td class="py-3 px-4"><span class="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md font-bold text-xs">${(ord.department || '').replace("ฝ่ายบริหารงาน", "")}</span></td>
                <td class="py-3 px-3 text-center">${fl}</td>
                <td class="py-3 px-4 text-right space-x-1 font-bold">
                    <button onclick="editOrder('${ord.firebaseId || ord.id || ord.orderId}')" class="text-amber-600 font-bold hover:underline text-xs cursor-pointer">แก้ไข</button>
                    <button onclick="deleteFirestoreDocument('orders', '${ord.firebaseId || ord.id || ord.orderId}')" class="text-rose-600 font-bold hover:underline text-xs cursor-pointer">ลบ</button>
                </td>
            </tr>
        `;
    });
}

function openOrderModal() {
    document.getElementById("order-form").reset(); 
    document.getElementById("order-unique-id").value = '';
    document.getElementById("order-modal-title").innerText = "ขอออกเลขคำสั่งโรงเรียนใหม่";
    
    let nextNum = 1;
    if(globalOrdersData.length > 0) {
        // หาค่าตัวเลขสูงสุดจาก orderId ในทุกรายการ
        const allOrderNums = globalOrdersData.map(ord => {
            const match = String(ord.orderId).match(/\d+/);
            return match ? parseInt(match[0], 10) : 0;
        });
        const maxNum = Math.max(...allOrderNums);
        
        if (maxNum > 0) {
            nextNum = maxNum + 1;
        }
    }
    
    document.getElementById("order-form-id").value = String(nextNum);
    document.getElementById("order-modal").classList.remove("hidden");
}
function closeOrderModal() { document.getElementById("order-modal").classList.add("hidden"); }

async function handleOrderSubmit(event) {
    event.preventDefault();
    const currentOrderTitle = document.getElementById("order-form-title").value;
    const orderUniqueId = document.getElementById("order-unique-id").value;

    if (!orderUniqueId) {
        if (isDuplicateData("orders-table-body", 2, currentOrderTitle)) {
            alert(`คำสั่งโรงเรียนเรื่อง "${currentOrderTitle}" นี้มีอยู่ในระบบคุมเลขแล้วครับ`);
            return;
        }
    }

    showLoading("กำลังบันทึกคำสั่งโรงเรียนเข้า Firebase...");

    try {
        const dept = document.getElementById("order-form-department").value;
        let driveFileUrl = "";

        if (orderUniqueId) {
            const existing = globalOrdersData.find(el => (el.firebaseId === orderUniqueId || el.id === orderUniqueId));
            if (existing) driveFileUrl = existing.fileUrl || "";
        }

        const uploadedUrl = await uploadFileToGoogleDrive("order-form-file", dept);
        if (uploadedUrl) driveFileUrl = uploadedUrl;

        const docId = orderUniqueId || 'ORD-' + Date.now();
        const ordObj = {
            id: docId,
            orderId: document.getElementById("order-form-id").value,
            year: document.getElementById("order-form-year").value,
            title: currentOrderTitle,
            signDate: document.getElementById("order-form-date").value,
            department: dept,
            status: "เปิดเผย",
            fileUrl: driveFileUrl
        };

        await mainDb.collection("orders").doc(String(docId)).set(ordObj, { merge: true });

        closeOrderModal(); 
        await fetchSystemData(); 
    } catch(e){ alert(e.message); } finally { hideLoading(); }
}

function editOrder(id) {
    const item = globalOrdersData.find(el => (el.firebaseId === id || el.id === id || el.orderId === id));
    if(!item) return;
    document.getElementById("order-form").reset();
    document.getElementById("order-unique-id").value = item.firebaseId || item.id || item.orderId;
    document.getElementById("order-form-id").value = item.orderId;
    document.getElementById("order-form-year").value = item.year;
    document.getElementById("order-form-title").value = item.title;
    document.getElementById("order-form-date").value = item.signDate;
    document.getElementById("order-form-department").value = item.department;
    document.getElementById("order-modal-title").innerText = "แก้ไขข้อมูลคำสั่งโรงเรียน";
    document.getElementById("order-modal").classList.remove("hidden");
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar-container'); if(!calendarEl) return;
    const eventsList = [];
    globalSarabanData.forEach(doc => {
        if(doc.deadline && doc.deadline !== "") {
            let evColor = "#10b981"; 
            const priority = doc.priority || "";
            if(priority.includes("ที่สุด")) evColor = "#ef4444"; 
            else if(priority.includes("มาก")) evColor = "#f97316"; 
            else if(priority.includes("ด่วน")) evColor = "#f59e0b"; 

            const isDone = (doc.status === 'สำเร็จแล้ว' || doc.status === 'ดำเนินการ');
            const statusIcon = isDone ? '<span style="font-size: 16px; inline-block; margin-right: 3px;">☑️</span>' : '';

            eventsList.push({
                title: `${statusIcon}${doc.internalId}: ${doc.title}`, 
                start: doc.deadline, backgroundColor: evColor, borderColor: evColor, extendedProps: { docData: doc }
            });
        }
    });

    if(calendarObj) calendarObj.destroy();
    calendarObj = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth', locale: 'th',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth' },
        events: eventsList,
        eventContent: function(arg) {
            let italicEl = document.createElement('div');
            italicEl.className = 'fc-event-title';
            italicEl.innerHTML = arg.event.title;
            return { domNodes: [ italicEl ] };
        },
        eventClick: function(info) {
            const d = info.event.extendedProps.docData;
            alert(`ทะเบียน: ${d.internalId}\nเรื่อง: ${d.title}\nกำหนดส่ง: ${formatThaiDateFull(d.deadline)}`);
        }
    });
    calendarObj.render();
}

function formatThaiDate(dateString) {
    if (!dateString || dateString === "") return "-";
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${parseInt(parts[2])} ${thaiMonths[parseInt(parts[1]) - 1]} ${(parseInt(parts[0]) + 543).toString().slice(-2)}`;
}

function formatThaiDateShort(dateString) { return formatThaiDate(dateString); }

function formatThaiDateFull(dateString) {
    if (!dateString || dateString.trim() === "") return "ไม่ระบุ";
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    const thaiMonthsFull = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    return `${parseInt(parts[2])} ${thaiMonthsFull[parseInt(parts[1]) - 1]} ${parseInt(parts[0]) + 543}`;
}

function renderNewMenusTables() {
    const memoBody = document.getElementById('memos-table-body');
    const memoMobileBody = document.getElementById('memos-mobile-cards');

    if (memoBody || memoMobileBody) {
        const memoSearch = (document.getElementById('search-memos')?.value || '').toLowerCase().trim();
        const filteredMemos = globalMemosData.filter(item => 
            !memoSearch ||
            (item.docNo && item.docNo.toLowerCase().includes(memoSearch)) ||
            (item.title && item.title.toLowerCase().includes(memoSearch)) ||
            (item.department && item.department.toLowerCase().includes(memoSearch))
        );

        if (filteredMemos.length === 0) {
            if (memoBody) memoBody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-slate-400 text-xs">ไม่พบข้อมูลบันทึกข้อความในระบบขณะนี้</td></tr>`;
            if (memoMobileBody) memoMobileBody.innerHTML = `<div class="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs font-bold shadow-xs">ไม่พบข้อมูลบันทึกข้อความในระบบขณะนี้</div>`;
        } else {
            if (memoBody) {
                memoBody.innerHTML = filteredMemos.map(item => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-3 px-4 font-bold text-slate-900">${item.docNo || ''}</td>
                        <td class="py-3 px-3">${formatThaiDate(item.date)}</td>
                        <td class="py-3 px-4 text-slate-700">${item.title || ''}</td>
                        <td class="py-3 px-4"><span class="px-2.5 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-600 rounded-md">${item.department || ''}</span></td>
                        <td class="py-3 px-3 text-center">${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-blue-600 font-extrabold hover:underline">เปิดดู</a>` : '<span class="text-slate-300">-</span>'}</td>
                        <td class="py-3 px-4 text-right space-x-1">
                            <button onclick="editMemo('${item.firebaseId || item.id}')" class="text-amber-600 font-bold hover:underline text-xs cursor-pointer">แก้ไข</button>
                            <button onclick="deleteFirestoreDocument('memos', '${item.firebaseId || item.id}')" class="text-rose-600 font-bold hover:underline text-xs cursor-pointer">ลบ</button>
                        </td>
                    </tr>
                `).join('');
            }
            if (memoMobileBody) {
                memoMobileBody.innerHTML = filteredMemos.map(item => `
                    <div class="soft-card-sm p-4 space-y-3 bg-white border border-slate-200/90 shadow-2xs">
                        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span class="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl font-black text-xs">${item.docNo || ''}</span>
                            <span class="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-md font-bold text-[10px]">${item.department || ''}</span>
                        </div>
                        <div>
                            <h4 class="font-extrabold text-slate-800 text-sm leading-snug">${item.title || ''}</h4>
                        </div>
                        <div class="text-xs text-slate-500">
                            วันที่ลงรายการ: <span class="font-bold text-slate-700">${formatThaiDateShort(item.date)}</span>
                        </div>
                        <div class="flex items-center justify-between pt-2 border-t border-slate-100">
                            <div>
                                ${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl font-bold text-xs inline-flex items-center gap-1">เปิดดูเอกสาร</a>` : '<span class="text-slate-300 text-xs italic">ไม่มีไฟล์แนบ</span>'}
                            </div>
                            <div class="flex gap-2">
                                <button onclick="editMemo('${item.firebaseId || item.id}')" class="px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-xl font-bold text-xs cursor-pointer">แก้ไข</button>
                                <button onclick="deleteFirestoreDocument('memos', '${item.firebaseId || item.id}')" class="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold text-xs cursor-pointer">ลบ</button>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    const genBody = document.getElementById('gendocs-table-body');
    const genMobileBody = document.getElementById('gendocs-mobile-cards');

    if (genBody || genMobileBody) {
        const genSearch = (document.getElementById('search-gendocs')?.value || '').toLowerCase().trim();
        const filteredGenDocs = globalGenDocsData.filter(item => 
            !genSearch ||
            (item.id && item.id.toLowerCase().includes(genSearch)) ||
            (item.docName && item.docName.toLowerCase().includes(genSearch)) ||
            (item.category && item.category.toLowerCase().includes(genSearch))
        );

        if (filteredGenDocs.length === 0) {
            if (genBody) genBody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-slate-400 text-xs">ไม่พบข้อมูลเอกสารทั่วไปในระบบขณะนี้</td></tr>`;
            if (genMobileBody) genMobileBody.innerHTML = `<div class="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs font-bold shadow-xs">ไม่พบข้อมูลเอกสารทั่วไปในระบบขณะนี้</div>`;
        } else {
            if (genBody) {
                genBody.innerHTML = filteredGenDocs.map(item => {
                    let filesArray = [];
                    if (item.fileUrl && item.fileUrl.startsWith("http")) {
                        filesArray.push(`<a href="${item.fileUrl}" target="_blank" class="text-emerald-700 font-bold hover:underline bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md text-xs inline-flex items-center gap-1">ไฟล์ที่ 1</a>`);
                    }
                    for (let i = 2; i <= 6; i++) {
                        const extraUrl = item[`fileUrl${i}`];
                        if (extraUrl && extraUrl.trim().startsWith("http")) {
                            filesArray.push(`<a href="${extraUrl.trim()}" target="_blank" class="text-teal-700 font-bold hover:underline bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md text-xs inline-flex items-center gap-1">ไฟล์ที่ ${i}</a>`);
                        }
                    }

                    const fileListHtml = filesArray.length > 0 
                        ? `<div class="flex flex-col gap-1 items-center justify-center">${filesArray.join('')}</div>` 
                        : `<span class="text-slate-300 text-xs">-</span>`;

                    return `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="py-3 px-4 text-xs font-mono text-slate-400">${(item.id || '').substring(0,8)}</td>
                            <td class="py-3 px-4 font-bold text-slate-800">${item.docName || ''}</td>
                            <td class="py-3 px-3">${formatThaiDate(item.date)}</td>
                            <td class="py-3 px-4"><span class="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md text-xs font-bold">${item.category || ''}</span></td>
                            <td class="py-3 px-3 text-center">${fileListHtml}</td>
                            <td class="py-3 px-4 text-right space-x-1">
                                <button onclick="editGenDoc('${item.firebaseId || item.id}')" class="text-amber-600 font-bold hover:underline text-xs cursor-pointer">แก้ไข</button>
                                <button onclick="deleteFirestoreDocument('gendocs', '${item.firebaseId || item.id}')" class="text-rose-600 font-bold hover:underline text-xs cursor-pointer">ลบ</button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
            if (genMobileBody) {
                genMobileBody.innerHTML = filteredGenDocs.map(item => {
                    let mFilesArray = [];
                    if (item.fileUrl && item.fileUrl.startsWith("http")) {
                        mFilesArray.push(`<a href="${item.fileUrl}" target="_blank" class="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl font-bold text-xs inline-flex items-center gap-1">ไฟล์ที่ 1</a>`);
                    }
                    for (let i = 2; i <= 6; i++) {
                        const extraUrl = item[`fileUrl${i}`];
                        if (extraUrl && extraUrl.trim().startsWith("http")) {
                            mFilesArray.push(`<a href="${extraUrl.trim()}" target="_blank" class="px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 rounded-xl font-bold text-xs inline-flex items-center gap-1">ไฟล์ที่ ${i}</a>`);
                        }
                    }

                    const mFileListHtml = mFilesArray.length > 0
                        ? `<div class="flex flex-wrap gap-2 mt-2">${mFilesArray.join('')}</div>`
                        : `<span class="text-slate-300 text-xs italic">ไม่มีไฟล์แนบ</span>`;

                    return `
                        <div class="soft-card-sm p-4 space-y-3 bg-white border border-slate-200/90 shadow-2xs">
                            <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                                <span class="px-2.5 py-0.5 bg-slate-100 text-slate-500 rounded-md font-mono text-[10px]">ID: ${(item.id || '').substring(0,8)}</span>
                                <span class="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-bold text-[10px]">${item.category || ''}</span>
                            </div>
                            <div>
                                <h4 class="font-extrabold text-slate-800 text-sm leading-snug">${item.docName || ''}</h4>
                            </div>
                            <div class="text-xs text-slate-500">
                                วันที่จัดเก็บ: <span class="font-bold text-slate-700">${formatThaiDateShort(item.date)}</span>
                            </div>
                            <div>
                                ${mFileListHtml}
                            </div>
                            <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                <button onclick="editGenDoc('${item.firebaseId || item.id}')" class="px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-xl font-bold text-xs cursor-pointer">แก้ไข</button>
                                <button onclick="deleteFirestoreDocument('gendocs', '${item.firebaseId || item.id}')" class="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold text-xs cursor-pointer">ลบ</button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    const receiptBody = document.getElementById('receipts-table-body');
    const receiptMobileBody = document.getElementById('receipts-mobile-cards');

    if (receiptBody || receiptMobileBody) {
        const receiptSearch = (document.getElementById('search-receipts')?.value || '').toLowerCase().trim();
        const filteredReceipts = globalReceiptsData.filter(item => 
            !receiptSearch ||
            (item.receiptNo && item.receiptNo.toLowerCase().includes(receiptSearch)) ||
            (item.payer && item.payer.toLowerCase().includes(receiptSearch)) ||
            (item.amount && item.amount.toString().includes(receiptSearch))
        );

        if (filteredReceipts.length === 0) {
            if (receiptBody) receiptBody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-slate-400 text-xs">ไม่พบข้อมูลใบเสร็จในระบบขณะนี้</td></tr>`;
            if (receiptMobileBody) receiptMobileBody.innerHTML = `<div class="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs font-bold shadow-xs">ไม่พบข้อมูลใบเสร็จในระบบขณะนี้</div>`;
        } else {
            if (receiptBody) {
                receiptBody.innerHTML = filteredReceipts.map(item => `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-3 px-4 font-bold text-slate-900">${item.receiptNo || ''}</td>
                        <td class="py-3 px-3">${formatThaiDate(item.date)}</td>
                        <td class="py-3 px-3 font-bold text-emerald-600">${Number(item.amount || 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
                        <td class="py-3 px-4 text-slate-700">${item.payer || ''}</td>
                        <td class="py-3 px-3 text-center">${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-blue-600 font-extrabold hover:underline">ดูหลักฐาน</a>` : '<span class="text-slate-300">-</span>'}</td>
                        <td class="py-3 px-4 text-right space-x-1">
                            <button onclick="editReceipt('${item.firebaseId || item.id}')" class="text-amber-600 font-bold hover:underline text-xs cursor-pointer">แก้ไข</button>
                            <button onclick="deleteFirestoreDocument('receipts', '${item.firebaseId || item.id}')" class="text-rose-600 font-bold hover:underline text-xs cursor-pointer">ลบ</button>
                        </td>
                    </tr>
                `).join('');
            }
            if (receiptMobileBody) {
                receiptMobileBody.innerHTML = filteredReceipts.map(item => `
                    <div class="soft-card-sm p-4 space-y-3 bg-white border border-slate-200/90 shadow-2xs">
                        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span class="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-black text-xs">${item.receiptNo || ''}</span>
                            <span class="font-black text-emerald-600 text-sm">฿ ${Number(item.amount || 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}</span>
                        </div>
                        <div>
                            <span class="text-slate-400 font-bold block text-[10px]">ผู้จ่ายเงิน/บริษัทร้านค้า:</span>
                            <h4 class="font-extrabold text-slate-800 text-sm leading-snug">${item.payer || ''}</h4>
                        </div>
                        <div class="text-xs text-slate-500">
                            วันที่ทำรายการ: <span class="font-bold text-slate-700">${formatThaiDateShort(item.date)}</span>
                        </div>
                        <div class="flex items-center justify-between pt-2 border-t border-slate-100">
                            <div>
                                ${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl font-bold text-xs inline-flex items-center gap-1">ดูหลักฐานใบเสร็จ</a>` : '<span class="text-slate-300 text-xs italic">ไม่มีไฟล์แนบ</span>'}
                            </div>
                            <div class="flex gap-2">
                                <button onclick="editReceipt('${item.firebaseId || item.id}')" class="px-3 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-xl font-bold text-xs cursor-pointer">แก้ไข</button>
                                <button onclick="deleteFirestoreDocument('receipts', '${item.firebaseId || item.id}')" class="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold text-xs cursor-pointer">ลบ</button>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }
    }
}

// 🗑️ ปรับปรุง: ลบรายการใน Firebase พร้อมไฟล์แนบใน Google Drive
async function deleteFirestoreDocument(collectionName, targetId) {
    if(!confirm("คุณครูแน่ใจใช่หรือไม่ที่จะลบรายการข้อมูลแถวนี้พร้อมไฟล์แนบอย่างถาวร?")) return;
    showLoading("กำลังดำเนินการลบข้อมูลและไฟล์แนบออกจาก Google Drive...");

    try {
        let targetList = [];
        if (collectionName === 'orders') targetList = globalOrdersData;
        if (collectionName === 'memos') targetList = globalMemosData;
        if (collectionName === 'gendocs') targetList = globalGenDocsData;
        if (collectionName === 'receipts') targetList = globalReceiptsData;

        const item = targetList.find(el => (el.firebaseId === targetId || el.id === targetId || el.orderId === targetId));
        
        if (item) {
            const filesToDelete = [];
            if (item.fileUrl) filesToDelete.push(item.fileUrl);
            
            // ลบไฟล์แนบเพิ่มเติม 2-6 (สำหรับเอกสารทั่วไป)
            for (let i = 2; i <= 6; i++) {
                if (item[`fileUrl${i}`]) filesToDelete.push(item[`fileUrl${i}`]);
            }

            // ส่งคำสั่งลบไฟล์ไปยัง Google Drive
            await deleteGoogleDriveFiles(filesToDelete);
        }

        // ลบข้อมูลจาก Firebase
        await mainDb.collection(collectionName).doc(String(targetId)).delete();
        await fetchSystemData();
    } catch(e) {
        alert("เกิดข้อผิดพลาดในการลบ: " + e.message);
    } finally {
        hideLoading();
    }
}

function openMemoModal() { document.getElementById('memo-form').reset(); document.getElementById('memo-id').value = ''; document.getElementById('memo-modal-title').innerText = "ลงทะเบียนบันทึกข้อความใหม่"; document.getElementById('memo-modal').classList.remove('hidden'); }
function closeMemoModal() { document.getElementById('memo-modal').classList.add('hidden'); }

async function handleMemoSubmit(e) {
    e.preventDefault();
    showLoading("กำลังบันทึกข้อมูลบันทึกข้อความลง Firebase...");

    try {
        const id = document.getElementById('memo-id').value || 'MEMO-' + Date.now();
        const dept = document.getElementById('memo-dept').value;
        let driveFileUrl = "";

        if (document.getElementById('memo-id').value) {
            const existing = globalMemosData.find(el => (el.firebaseId === id || el.id === id));
            if (existing) driveFileUrl = existing.fileUrl || "";
        }

        const uploadedUrl = await uploadFileToGoogleDrive("memo-file", dept);
        if (uploadedUrl) driveFileUrl = uploadedUrl;

        const payload = {
            id: id,
            docNo: document.getElementById('memo-no').value,
            date: document.getElementById('memo-date').value,
            title: document.getElementById('memo-title').value,
            department: dept,
            fileUrl: driveFileUrl
        };

        await mainDb.collection("memos").doc(String(id)).set(payload, { merge: true });

        closeMemoModal();
        await fetchSystemData();
    } catch(err) {
        alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
        hideLoading();
    }
}

function editMemo(id) {
    const item = globalMemosData.find(el => (el.firebaseId === id || el.id === id));
    if(!item) return;
    openMemoModal();
    document.getElementById('memo-id').value = item.firebaseId || item.id;
    document.getElementById('memo-no').value = item.docNo || "";
    document.getElementById('memo-date').value = item.date || "";
    document.getElementById('memo-title').value = item.title || "";
    document.getElementById('memo-dept').value = item.department || "ฝ่ายบริหารงานทั่วไป";
    document.getElementById('memo-modal-title').innerText = "แก้ไขข้อมูลบันทึกข้อความ";
}

function openGenDocModal() { 
    document.getElementById('gendoc-form').reset(); 
    document.getElementById('gendoc-id').value = ''; 
    document.getElementById('gendoc-file-status').classList.add('hidden');
    document.getElementById('gendoc-modal-title').innerText = "เพิ่มเอกสารทั่วไป"; 
    document.getElementById('gendoc-modal').classList.remove('hidden'); 
}
function closeGenDocModal() { document.getElementById('gendoc-modal').classList.add('hidden'); }

async function handleGenDocSubmit(e) {
    e.preventDefault();
    showLoading("กำลังอัปโหลดไฟล์แนบเข้า Google Drive และบันทึกคลังเอกสาร...");

    try {
        const id = document.getElementById('gendoc-id').value || 'DOC-' + Date.now();
        let existingItem = null;
        if (document.getElementById('gendoc-id').value) {
            existingItem = globalGenDocsData.find(el => (el.firebaseId === id || el.id === id));
        }

        const fileInputs = [
            { id: "gendoc-file", key: "fileUrl" },
            { id: "gendoc-file2", key: "fileUrl2" },
            { id: "gendoc-file3", key: "fileUrl3" },
            { id: "gendoc-file4", key: "fileUrl4" },
            { id: "gendoc-file5", key: "fileUrl5" },
            { id: "gendoc-file6", key: "fileUrl6" }
        ];

        const uploadTasks = fileInputs.map(async (item) => {
            const inputEl = document.getElementById(item.id);
            if (inputEl && inputEl.files && inputEl.files.length > 0) {
                const url = await uploadFileToGoogleDrive(item.id, "เอกสารทั่วไป");
                return { key: item.key, url: url };
            } else if (existingItem && existingItem[item.key]) {
                return { key: item.key, url: existingItem[item.key] };
            }
            return { key: item.key, url: "" };
        });

        const results = await Promise.all(uploadTasks);
        const uploadedUrls = {};
        results.forEach(res => { uploadedUrls[res.key] = res.url; });

        const payload = {
            id: id,
            docName: document.getElementById('gendoc-name').value,
            date: document.getElementById('gendoc-date').value,
            category: document.getElementById('gendoc-category').value,
            fileUrl: uploadedUrls.fileUrl || "",
            fileUrl2: uploadedUrls.fileUrl2 || "",
            fileUrl3: uploadedUrls.fileUrl3 || "",
            fileUrl4: uploadedUrls.fileUrl4 || "",
            fileUrl5: uploadedUrls.fileUrl5 || "",
            fileUrl6: uploadedUrls.fileUrl6 || ""
        };

        await mainDb.collection("gendocs").doc(String(id)).set(payload, { merge: true });

        closeGenDocModal();
        await fetchSystemData();
    } catch(err) {
        alert("เกิดข้อผิดพลาดในการบันทึก: " + err.message);
    } finally {
        hideLoading();
    }
}

function editGenDoc(id) {
    const item = globalGenDocsData.find(el => (el.firebaseId === id || el.id === id));
    if(!item) return;
    openGenDocModal();
    document.getElementById('gendoc-id').value = item.firebaseId || item.id;
    document.getElementById('gendoc-name').value = item.docName || "";
    document.getElementById('gendoc-date').value = item.date || "";
    document.getElementById('gendoc-category').value = item.category || "";
    document.getElementById('gendoc-modal-title').innerText = "แก้ไขข้อมูลเอกสารทั่วไป";

    if(item.fileUrl && item.fileUrl.startsWith("http")) {
        const el = document.getElementById("gendoc-file-status");
        el.innerHTML = `ไฟล์เดิมบนคลาวด์: <a href="${item.fileUrl}" target="_blank" class="text-emerald-700 font-bold underline">เปิดดูไฟล์ที่ 1</a>`;
        el.classList.remove("hidden");
    }
}

function openReceiptModal() { document.getElementById('receipt-form').reset(); document.getElementById('receipt-id').value = ''; document.getElementById('receipt-modal-title').innerText = "ลงทะเบียนหลักฐานใบเสร็จ"; document.getElementById('receipt-modal').classList.remove('hidden'); }
function closeReceiptModal() { document.getElementById('receipt-modal').classList.add('hidden'); }

async function handleReceiptSubmit(e) {
    e.preventDefault();
    showLoading("กำลังบันทึกข้อมูลใบเสร็จลง Firebase...");

    try {
        const id = document.getElementById('receipt-id').value || 'REC-' + Date.now();
        let driveFileUrl = "";

        if (document.getElementById('receipt-id').value) {
            const existing = globalReceiptsData.find(el => (el.firebaseId === id || el.id === id));
            if (existing) driveFileUrl = existing.fileUrl || "";
        }

        const uploadedUrl = await uploadFileToGoogleDrive("receipt-file", "งานการเงินใบเสร็จ");
        if (uploadedUrl) driveFileUrl = uploadedUrl;

        const payload = {
            id: id,
            receiptNo: document.getElementById('receipt-no').value,
            date: document.getElementById('receipt-date').value,
            amount: document.getElementById('receipt-amount').value,
            payer: document.getElementById('receipt-payer').value,
            fileUrl: driveFileUrl
        };

        await mainDb.collection("receipts").doc(String(id)).set(payload, { merge: true });

        closeReceiptModal();
        await fetchSystemData();
    } catch(err) {
        alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
        hideLoading();
    }
}

function editReceipt(id) {
    const item = globalReceiptsData.find(el => (el.firebaseId === id || el.id === id));
    if(!item) return;
    openReceiptModal();
    document.getElementById('receipt-id').value = item.firebaseId || item.id;
    document.getElementById('receipt-no').value = item.receiptNo || "";
    document.getElementById('receipt-date').value = item.date || "";
    document.getElementById('receipt-amount').value = item.amount || "";
    document.getElementById('receipt-payer').value = item.payer || "";
    document.getElementById('receipt-modal-title').innerText = "แก้ไขหลักฐานเอกสารใบเสร็จ";
}

function filterTable(inputId, tableBodyId) {
    const input = document.getElementById(inputId);
    const filter = input.value.toLowerCase().trim();
    const tbody = document.getElementById(tableBodyId);
    const rows = tbody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        let rowContainsFilter = false;
        const cells = rows[i].getElementsByTagName('td');
        for (let j = 0; j < cells.length; j++) {
            if (cells[j] && cells[j].innerText.toLowerCase().includes(filter)) {
                rowContainsFilter = true;
                break;
            }
        }
        rows[i].style.display = rowContainsFilter ? "" : "none";
    }
}

const ROWS_PER_PAGE = 10;
const tablePages = { "saraban": 1, "orders": 1, "memos": 1, "gendocs": 1, "receipts": 1, "sign": 1 };

function changeTablePage(tableType, direction) {
    const tbodyId = (tableType === "saraban") ? "saraban-table-body" : 
                    (tableType === "orders") ? "orders-table-body" : 
                    (tableType === "memos") ? "memos-table-body" : 
                    (tableType === "gendocs") ? "gendocs-table-body" : 
                    (tableType === "receipts") ? "receipts-table-body" : "workflow-table-body";
                    
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rows = tbody.getElementsByTagName("tr");
    if (rows.length === 0) return;

    const maxPage = Math.ceil(rows.length / ROWS_PER_PAGE);
    let newPage = tablePages[tableType] + direction;
    if (newPage < 1) newPage = 1;
    if (newPage > maxPage) newPage = maxPage;
    
    tablePages[tableType] = newPage;

    const startIndex = (newPage - 1) * ROWS_PER_PAGE;
    const endIndex = startIndex + ROWS_PER_PAGE;

    for (let i = 0; i < rows.length; i++) {
        rows[i].style.display = (i >= startIndex && i < endIndex) ? "" : "none";
    }

    renderPageNumbers(tableType, rows.length, newPage);
}

function jumpToPage(tableType, pageNum) {
    tablePages[tableType] = pageNum;
    changeTablePage(tableType, 0);
}

function jumpToLastPage(tableType) {
    const tbodyId = (tableType === "saraban") ? "saraban-table-body" : 
                    (tableType === "orders") ? "orders-table-body" : 
                    (tableType === "memos") ? "memos-table-body" : 
                    (tableType === "gendocs") ? "gendocs-table-body" : 
                    (tableType === "receipts") ? "receipts-table-body" : "workflow-table-body";
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rows = tbody.getElementsByTagName("tr");
    const maxPage = Math.ceil(rows.length / ROWS_PER_PAGE);
    if (maxPage > 0) {
        jumpToPage(tableType, maxPage);
    }
}

function renderPageNumbers(tableType, totalRows, currentPage) {
    const containerId = `${tableType}-page-numbers`;
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    const maxPage = Math.ceil(totalRows / ROWS_PER_PAGE);
    if (maxPage <= 1) {
        container.innerHTML = `[<strong class="text-amber-900 font-black text-sm">1</strong>]`;
        return;
    }

    let startPage = Math.max(1, currentPage - 5);
    let endPage = Math.min(maxPage, currentPage + 5);

    for (let i = startPage; i <= endPage; i++) {
        const span = document.createElement("span");
        if (i === currentPage) {
            span.innerHTML = `[<strong class="text-amber-900 font-black text-sm">${i}</strong>]`;
            span.className = "px-0.5";
        } else {
            span.innerHTML = `[${i}]`;
            span.className = "cursor-pointer hover:underline text-blue-500 px-0.5";
            span.onclick = () => jumpToPage(tableType, i);
        }
        container.appendChild(span);
    }
}

window.addEventListener('load', () => {
    const tableConfigs = ["saraban", "orders", "memos", "gendocs", "receipts", "sign"];
    tableConfigs.forEach(tableType => {
        const tbodyId = (tableType === "saraban") ? "saraban-table-body" : 
                        (tableType === "orders") ? "orders-table-body" : 
                        (tableType === "memos") ? "memos-table-body" : 
                        (tableType === "gendocs") ? "gendocs-table-body" : 
                        (tableType === "receipts") ? "receipts-table-body" : "workflow-table-body";
        const tbody = document.getElementById(tbodyId);
        if (tbody) {
            let isUpdating = false;
            const pageObserver = new MutationObserver((mutations) => {
                if (isUpdating) return;
                const hasNodeChanges = mutations.some(m => m.addedNodes.length > 0 || m.removedNodes.length > 0);
                if (hasNodeChanges) {
                    isUpdating = true;
                    tablePages[tableType] = 1;
                    changeTablePage(tableType, 0); 
                    setTimeout(() => { isUpdating = false; }, 50);
                }
            });
            pageObserver.observe(tbody, { childList: true });
        }
    });
});

function isDuplicateData(tbodyId, columnIndex, newValue) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return false;
    const rows = tbody.getElementsByTagName("tr");
    const cleanNewValue = newValue.trim().toLowerCase();

    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName("td");
        if (cells[columnIndex]) {
            const existingValue = cells[columnIndex].innerText.trim().toLowerCase();
            if (existingValue === cleanNewValue && cleanNewValue !== "") return true; 
        }
    }
    return false;
}

// ==========================================
// 🔏 ระบบจัดการปั๊มตรายางดิจิทัล (DIGITAL STAMP ENGINE)
// ==========================================
let currentDocImage = null;

function populateStampSarabanDropdown() {
    const select = document.getElementById('stamp-saraban-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- ดึงเอกสารจากทะเบียนหนังสือรับ --</option>';
    if (!globalSarabanData || globalSarabanData.length === 0) return;

    const inboundDocs = globalSarabanData.filter(doc => doc.internalId && doc.internalId.startsWith("รับ"));
    const sortedDocs = [...inboundDocs].reverse();

    sortedDocs.forEach(doc => {
        if (doc.fileUrl && doc.fileUrl.startsWith("http")) {
            const opt = document.createElement('option');
            opt.value = doc.fileUrl;
            opt.textContent = `[${doc.internalId}] ${(doc.title || '').substring(0, 35)}...`;
            select.appendChild(opt);
        }
    });
}

function formatGoogleDriveUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    let fileId = "";
    if (rawUrl.includes("drive.google.com")) {
        const match = rawUrl.match(/\/d\/([^\/]+)/) || rawUrl.match(/id=([^&]+)/);
        if (match && match[1]) fileId = match[1];
    } else if (rawUrl.includes("docs.google.com")) {
        const match = rawUrl.match(/\/d\/([^\/]+)/);
        if (match && match[1]) fileId = match[1];
    }

    if (fileId) {
        return `https://lh3.googleusercontent.com/d/${fileId}`;
    }
    return rawUrl;
}

async function loadDocFromSaraban(url) {
    if (!url) return;
    const inputLocal = document.getElementById('stamp-doc-input');
    if (inputLocal) inputLocal.value = "";
    
    showLoading("กำลังประมวลผลเอกสารความละเอียดสูง...");
    const directUrl = formatGoogleDriveUrl(url);

    try {
        if (url.toLowerCase().includes('.pdf')) {
            await renderPdfToCanvas(directUrl);
        } else {
            await renderImageToCanvas(directUrl);
        }
    } catch (err) {
        try {
            await renderPdfToCanvas(directUrl);
        } catch (e2) {
            hideLoading();
            alert("ไม่สามารถดึงไฟล์นี้ได้ กรุณาตรวจสอบว่าไฟล์ใน Google Drive ได้เปิดสิทธิ์ 'ทุกคนที่มีลิงก์' แล้วหรือยังครับ");
        }
    }
}

function loadDocToCanvas(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('stamp-saraban-select').value = "";
    showLoading("กำลังสร้างความละเอียดระดับ Ultra-HD (500 DPI)...");

    if (file.type === "application/pdf") {
        const fileReader = new FileReader();
        fileReader.onload = function() {
            const typedarray = new Uint8Array(this.result);
            pdfjsLib.getDocument(typedarray).promise.then(pdf => {
                pdf.getPage(1).then(page => {
                    const canvas = document.getElementById('doc-canvas');
                    const ctx = canvas.getContext('2d');
                    const wrapper = document.getElementById('canvas-wrapper');
                    const container = document.getElementById('canvas-container');

                    const hdRenderScale = 5.0;
                    const viewport = page.getViewport({ scale: hdRenderScale });

                    const offscreenCanvas = document.createElement('canvas');
                    const offscreenCtx = offscreenCanvas.getContext('2d');
                    offscreenCanvas.width = viewport.width;
                    offscreenCanvas.height = viewport.height;

                    page.render({ canvasContext: offscreenCtx, viewport: viewport }).promise.then(() => {
                        const img = new Image();
                        img.onload = () => {
                            currentDocImage = img;

                            const containerWidth = (container ? container.clientWidth : 750) - 32;
                            const displayScale = containerWidth / viewport.width;
                            const displayW = viewport.width * displayScale;
                            const displayH = viewport.height * displayScale;

                            canvas.width = displayW;
                            canvas.height = displayH;
                            wrapper.style.width = displayW + 'px';
                            wrapper.style.height = displayH + 'px';

                            ctx.drawImage(img, 0, 0, displayW, displayH);
                            hideLoading();
                        };
                        img.src = offscreenCanvas.toDataURL('image/jpeg', 0.92);
                    });
                });
            }).catch(err => {
                hideLoading();
                alert("เกิดข้อผิดพลาดในการอ่านไฟล์ PDF");
            });
        };
        fileReader.readAsArrayBuffer(file);
    } else {
        const reader = new FileReader();
        reader.onload = function(event) {
            renderImageToCanvas(event.target.result);
        };
        reader.readAsDataURL(file);
    }
}

function renderPdfToCanvas(pdfUrl) {
    return new Promise((resolve, reject) => {
        pdfjsLib.getDocument(pdfUrl).promise.then(pdf => {
            pdf.getPage(1).then(page => {
                const canvas = document.getElementById('doc-canvas');
                const ctx = canvas.getContext('2d');
                const wrapper = document.getElementById('canvas-wrapper');
                const container = document.getElementById('canvas-container');

                const hdRenderScale = 5.0;
                const viewport = page.getViewport({ scale: hdRenderScale });

                const offscreenCanvas = document.createElement('canvas');
                const offscreenCtx = offscreenCanvas.getContext('2d');
                offscreenCanvas.width = viewport.width;
                offscreenCanvas.height = viewport.height;

                page.render({ canvasContext: offscreenCtx, viewport: viewport }).promise.then(() => {
                    const img = new Image();
                    img.onload = () => {
                        currentDocImage = img;

                        const containerWidth = (container ? container.clientWidth : 750) - 32;
                        const displayScale = containerWidth / viewport.width;
                        const displayW = viewport.width * displayScale;
                        const displayH = viewport.height * displayScale;

                        canvas.width = displayW;
                        canvas.height = displayH;
                        wrapper.style.width = displayW + 'px';
                        wrapper.style.height = displayH + 'px';

                        ctx.drawImage(img, 0, 0, displayW, displayH);
                        hideLoading();
                        resolve();
                    };
                    img.src = offscreenCanvas.toDataURL('image/jpeg', 0.92);
                });
            }).catch(reject);
        }).catch(reject);
    });
}

function renderImageToCanvas(imgUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = function() {
            const canvas = document.getElementById('doc-canvas');
            const ctx = canvas.getContext('2d');
            const wrapper = document.getElementById('canvas-wrapper');
            const container = document.getElementById('canvas-container');

            currentDocImage = img;

            const containerWidth = (container ? container.clientWidth : 750) - 32;
            let displayWidth = img.width;
            let displayHeight = img.height;

            if (displayWidth > containerWidth) {
                const ratio = containerWidth / displayWidth;
                displayWidth = containerWidth;
                displayHeight = displayHeight * ratio;
            }

            canvas.width = displayWidth;
            canvas.height = displayHeight;
            wrapper.style.width = displayWidth + 'px';
            wrapper.style.height = displayHeight + 'px';

            ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
            hideLoading();
            resolve();
        };
        img.onerror = function(err) {
            hideLoading();
            reject(err);
        };
        img.src = imgUrl;
    });
}

function toggleStampLayer(type) {
    const chk = document.getElementById(type === 'receipt' ? 'chk-use-receipt' : 'chk-use-propose');
    const inputs = document.getElementById(type === 'receipt' ? 'receipt-inputs' : 'propose-inputs');
    const box = document.getElementById(type === 'receipt' ? 'stamp-receipt-box' : 'stamp-propose-box');

    if (chk.checked) {
        inputs.classList.remove('hidden');
        box.classList.remove('hidden');
        updateStampText(type);
        makeElementDraggable(box);
    } else {
        inputs.classList.add('hidden');
        box.classList.add('hidden');
    }
}

function updateStampText(type) {
    if (type === 'receipt') {
        const no = document.getElementById('stamp-receipt-no').value || '..............';
        const date = document.getElementById('stamp-receipt-date').value || '..............';
        const dept = document.getElementById('stamp-receipt-dept').value || '..............';

        document.getElementById('stamp-receipt-content').innerHTML = `
            <div class="border-1.5 border-blue-800 p-2 text-blue-800 font-bold bg-white/95 w-[240px] text-xs leading-relaxed font-sarabun shadow-xs">
                <div class="text-center font-extrabold text-sm mb-1">โรงเรียนบ้านกาหยี</div>
                <div>เลขที่รับ: <span class="text-blue-900 font-extrabold">${no}</span></div>
                <div>วัน/เดือน/ปี: <span class="text-blue-900 font-extrabold">${date}</span></div>
                <div>ฝ่ายงาน: <span class="text-blue-900 font-extrabold">${dept}</span></div>
            </div>
        `;
    } else if (type === 'propose') {
        const isInform = document.getElementById('stamp-chk-inform').checked ? '✓' : '  ';
        const isConsider = document.getElementById('stamp-chk-consider').checked ? '✓' : '  ';
        const note = document.getElementById('stamp-propose-note').value || '';

        document.getElementById('stamp-propose-content').innerHTML = `
            <div class="border-1.5 border-blue-800 p-2 text-blue-800 font-bold bg-white/95 w-[280px] text-xs leading-relaxed font-sarabun shadow-xs">
                <div class="text-sm font-extrabold">เรียนเสนอ ผู้บริหาร</div>
                <div class="flex gap-3 my-0.5">
                    <span>( ${isInform} ) เพื่อโปรดทราบ</span>
                    <span>( ${isConsider} ) เพื่อโปรดพิจารณา</span>
                </div>
                <div class="border-t border-dashed border-blue-400 pt-1 text-[11px] font-normal min-h-[35px] whitespace-pre-line break-words">${note}</div>
            </div>
        `;
    }
}

function makeElementDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    elmnt.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        const wrapper = document.getElementById('canvas-wrapper');
        let newTop = elmnt.offsetTop - pos2;
        let newLeft = elmnt.offsetLeft - pos1;

        newTop = Math.max(0, Math.min(newTop, wrapper.clientHeight - elmnt.clientHeight));
        newLeft = Math.max(0, Math.min(newLeft, wrapper.clientWidth - elmnt.clientWidth));

        elmnt.style.top = newTop + "px";
        elmnt.style.left = newLeft + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

function resizeStamp(type, val) {
    const content = document.getElementById(type === 'receipt' ? 'stamp-receipt-content' : 'stamp-propose-content');
    if (content) {
        content.style.transform = `scale(${val})`;
        content.style.transformOrigin = 'top left';
    }
}

function getThaiWords(text) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter('th-TH', { granularity: 'word' });
        return Array.from(segmenter.segment(text)).map(s => s.segment);
    }
    return text.split(' ');
}

function wrapCanvasText(ctx, text, maxWidth) {
    const rawLines = text.split('\n');
    let finalLines = [];

    rawLines.forEach(line => {
        if (!line.trim()) {
            finalLines.push('');
            return;
        }

        const words = getThaiWords(line);
        let currentLine = '';

        words.forEach((word) => {
            let testLine = currentLine + word;
            if (ctx.measureText(testLine).width <= maxWidth) {
                currentLine = testLine;
            } else {
                if (currentLine !== '') {
                    finalLines.push(currentLine);
                    currentLine = word;
                } else {
                    finalLines.push(word);
                    currentLine = '';
                }
            }
        });

        if (currentLine) {
            finalLines.push(currentLine);
        }
    });

    return finalLines;
}

async function downloadStampedPDF() {
    if (!currentDocImage) {
        alert('กรุณาเลือกเอกสารหนังสือราชการก่อนดาวน์โหลดครับ');
        return;
    }

    showLoading("กำลังสร้างเอกสาร A4 คมชัดสูง 500 DPI...");

    try {
        const displayCanvas = document.getElementById('doc-canvas');
        
        const hdWidth = currentDocImage.naturalWidth || currentDocImage.width;
        const hdHeight = currentDocImage.naturalHeight || currentDocImage.height;

        const scaleX = hdWidth / displayCanvas.width;
        const scaleY = hdHeight / displayCanvas.height;

        const hdCanvas = document.createElement('canvas');
        const ctx = hdCanvas.getContext('2d');
        hdCanvas.width = hdWidth;
        hdCanvas.height = hdHeight;

        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, hdWidth, hdHeight);
        ctx.drawImage(currentDocImage, 0, 0, hdWidth, hdHeight);

        const stampsToDraw = [];
        const chkReceipt = document.getElementById('chk-use-receipt');
        const boxReceipt = document.getElementById('stamp-receipt-box');
        if (chkReceipt && chkReceipt.checked && !boxReceipt.classList.contains('hidden')) {
            stampsToDraw.push(boxReceipt);
        }

        const chkPropose = document.getElementById('chk-use-propose');
        const boxPropose = document.getElementById('stamp-propose-box');
        if (chkPropose && chkPropose.checked && !boxPropose.classList.contains('hidden')) {
            stampsToDraw.push(boxPropose);
        }

        stampsToDraw.forEach(box => {
            const displayX = parseInt(box.style.left) || 0;
            const displayY = parseInt(box.style.top) || 0;

            const hdX = displayX * scaleX;
            const hdY = displayY * scaleY;
            const isReceipt = (box.id === 'stamp-receipt-box');

            ctx.save();

            if (isReceipt) {
                const no = document.getElementById('stamp-receipt-no').value || '..............';
                const date = document.getElementById('stamp-receipt-date').value || '..............';
                const dept = document.getElementById('stamp-receipt-dept').value || '..............';
                const scaleVal = parseFloat(document.getElementById('scale-receipt').value) || 1.0;

                const baseW = 240 * scaleVal;
                const baseH = 105 * scaleVal;
                const boxW = baseW * scaleX;
                const boxH = baseH * scaleY;

                ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
                ctx.fillRect(hdX, hdY, boxW, boxH);

                ctx.lineWidth = Math.max(1.5, 2.0 * scaleX * scaleVal);
                ctx.strokeStyle = "#1e40af";
                ctx.strokeRect(hdX, hdY, boxW, boxH);

                ctx.fillStyle = "#1e40af";
                ctx.font = `bold ${Math.round(15 * scaleY * scaleVal)}px Sarabun, "TH Sarabun PSK", sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText("โรงเรียนบ้านกาหยี", hdX + (boxW / 2), hdY + (24 * scaleY * scaleVal));

                ctx.font = `bold ${Math.round(12.5 * scaleY * scaleVal)}px Sarabun, "TH Sarabun PSK", sans-serif`;
                ctx.textAlign = "left";
                ctx.fillText(`เลขที่รับ: ${no}`, hdX + (12 * scaleX * scaleVal), hdY + (48 * scaleY * scaleVal));
                ctx.fillText(`วัน/เดือน/ปี: ${date}`, hdX + (12 * scaleX * scaleVal), hdY + (70 * scaleY * scaleVal));
                ctx.fillText(`ฝ่ายงาน: ${dept}`, hdX + (12 * scaleX * scaleVal), hdY + (92 * scaleY * scaleVal));
            } else {
                const isInform = document.getElementById('stamp-chk-inform').checked ? '✓' : '  ';
                const isConsider = document.getElementById('stamp-chk-consider').checked ? '✓' : '  ';
                const note = document.getElementById('stamp-propose-note').value || '';
                const scaleVal = parseFloat(document.getElementById('scale-propose').value) || 1.0;

                const baseW = 280 * scaleVal;
                const paddingX = 12 * scaleX * scaleVal;
                const maxTextW = (baseW * scaleX) - (paddingX * 2);

                const fontSize = Math.round(11.5 * scaleY * scaleVal);
                const lineHeight = fontSize * 1.35;
                ctx.font = `${fontSize}px Sarabun, "TH Sarabun PSK", sans-serif`;

                const wrappedLines = wrapCanvasText(ctx, note, maxTextW);

                const headerH = 55 * scaleY * scaleVal;
                const contentH = Math.max(35 * scaleY * scaleVal, wrappedLines.length * lineHeight + (10 * scaleY * scaleVal));
                const boxW = baseW * scaleX;
                const boxH = headerH + contentH;

                ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
                ctx.fillRect(hdX, hdY, boxW, boxH);

                ctx.lineWidth = Math.max(1.5, 2.0 * scaleX * scaleVal);
                ctx.strokeStyle = "#1e40af";
                ctx.strokeRect(hdX, hdY, boxW, boxH);

                ctx.fillStyle = "#1e40af";
                ctx.font = `bold ${Math.round(14 * scaleY * scaleVal)}px Sarabun, "TH Sarabun PSK", sans-serif`;
                ctx.textAlign = "left";
                ctx.fillText("เรียนเสนอ ผู้บริหาร", hdX + paddingX, hdY + (22 * scaleY * scaleVal));

                ctx.font = `${Math.round(11.5 * scaleY * scaleVal)}px Sarabun, "TH Sarabun PSK", sans-serif`;
                ctx.fillText(`( ${isInform} ) เพื่อโปรดทราบ   ( ${isConsider} ) เพื่อโปรดพิจารณา`, hdX + paddingX, hdY + (44 * scaleY * scaleVal));

                ctx.beginPath();
                ctx.setLineDash([4 * scaleX * scaleVal, 4 * scaleX * scaleVal]);
                ctx.moveTo(hdX + paddingX, hdY + (50 * scaleY * scaleVal));
                ctx.lineTo(hdX + boxW - paddingX, hdY + (50 * scaleY * scaleVal));
                ctx.strokeStyle = "#60a5fa";
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = "#1e3a8a";
                ctx.font = `${fontSize}px Sarabun, "TH Sarabun PSK", sans-serif`;
                
                let startY = hdY + (68 * scaleY * scaleVal);
                wrappedLines.forEach((lineText) => {
                    ctx.fillText(lineText, hdX + paddingX, startY);
                    startY += lineHeight;
                });
            }

            ctx.restore();
        });

        const imgData = hdCanvas.toDataURL('image/jpeg', 0.92);
        const { jsPDF } = window.jspdf;
        
        const isLandscape = hdWidth > hdHeight;
        const orientation = isLandscape ? 'l' : 'p';
        
        const pdf = new jsPDF(orientation, 'mm', 'a4');
        const a4Width = isLandscape ? 297 : 210;
        const a4Height = isLandscape ? 210 : 297;

        pdf.addImage(imgData, 'JPEG', 0, 0, a4Width, a4Height, '', 'FAST');
        pdf.save('เอกสารประทับตรายาง_โรงเรียนบ้านกาหยี_A4.pdf');

        hideLoading();
    } catch (err) {
        console.error(err);
        hideLoading();
        alert("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF กรุณาลองใหม่อีกครั้งครับ");
    }
}

// ==========================================
// TOUCH DRAG EVENT HANDLER FOR MOBILE DEVICES
// ==========================================
(function initMobileTouchDrag() {
    const stampBoxes = ['stamp-receipt-box', 'stamp-propose-box'];

    stampBoxes.forEach(boxId => {
        const box = document.getElementById(boxId);
        if (!box) return;

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        box.addEventListener('touchstart', function(e) {
            if (e.touches.length !== 1) return;
            
            isDragging = true;
            const touch = e.touches[0];
            
            startX = touch.clientX;
            startY = touch.clientY;
            
            initialLeft = parseFloat(box.style.left) || 20;
            initialTop = parseFloat(box.style.top) || 20;
            
            e.preventDefault();
        }, { passive: false });

        document.addEventListener('touchmove', function(e) {
            if (!isDragging || e.touches.length !== 1) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - startX;
            const deltaY = touch.clientY - startY;

            const wrapper = document.getElementById('canvas-wrapper');
            let newLeft = initialLeft + deltaX;
            let newTop = initialTop + deltaY;

            if (wrapper) {
                newTop = Math.max(0, Math.min(newTop, wrapper.clientHeight - box.clientHeight));
                newLeft = Math.max(0, Math.min(newLeft, wrapper.clientWidth - box.clientWidth));
            }

            box.style.left = newLeft + 'px';
            box.style.top = newTop + 'px';

            e.preventDefault();
        }, { passive: false });

        document.addEventListener('touchend', function() {
            isDragging = false;
        });

        document.addEventListener('touchcancel', function() {
            isDragging = false;
        });
    });
})();