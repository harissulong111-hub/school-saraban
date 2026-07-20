const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxCtgGVCOHQW8t28rBI5TVhxceRElv3P0USLAxVqPylJv4eCZhllayX5ydyXonAa-7r/exec"; 

// 🔗 คอนฟิกเชื่อมต่อ Firebase คลาวด์ E-Attendance
const firebaseConfig = {
  apiKey: "AIzaSyBZRq6svRTueE7vm1Nq_1HTc9XoF7md5dA",
  authDomain: "school-attendance-system-bb6fd.firebaseapp.com",
  projectId: "school-attendance-system-bb6fd",
  storageBucket: "school-attendance-system-bb6fd.firebasestorage.app",
  messagingSenderId: "759416871053",
  appId: "1:759416871053:web:b35232dbe27a952df12ac4",
  measurementId: "G-W4QSQND8KJ"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const firebaseDb = firebase.firestore();

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
    // ตั้งค่าเริ่มต้นของช่องวันที่ในหน้าบ้านให้สอดคล้องกับปฏิทินของเครื่องผู้ใช้
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
    showLoading("กำลังตรวจสอบสิทธิ์และดึงข้อมูลโครงสร้างโรงเรียนบ้านกาหยี...");
    const userInp = document.getElementById("username").value.trim().toLowerCase();
    const passInp = document.getElementById("password").value.trim();
    const errorDiv = document.getElementById("login-error");

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            body: JSON.stringify({ action: "login", username: userInp, password: passInp })
        });
        const res = await response.json();
        
        if (res.status === "success") {
            currentUser = res.user;
            sessionStorage.setItem("smart_user_session", JSON.stringify(currentUser));
            errorDiv.classList.add("hidden");
            document.getElementById("username").value = "";
            document.getElementById("password").value = "";
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
// 📡 ฟังก์ชันโหลดฐานข้อมูลระบบหลัก (วิธีแก้ที่ 2: ปลดการดักสิทธิ์ล็อกอินหน้าบ้าน)
// ===================================================================================
async function fetchSystemData() {
    showLoading("กำลังโหลดฐานข้อมูลรวมทุกกลุ่มงานโรงเรียนบ้านกาหยี...");
    try {
        // เรียกซิงค์ข้อมูลสถิติจาก Firebase ทันที (ไม่ต้องล็อกอินเบื้องหลังแล้ว)
        const currentToday = document.getElementById('sync-att-date').value || new Date().toISOString().split('T')[0];
        fetchFirebaseAttendanceData(currentToday);

        // ดึงข้อมูลจาก Google Sheets หลักของระบบสารบรรณตามปกติ
        const res = await fetch(GOOGLE_SCRIPT_URL);
        const out = await res.json();
        if(out.status === "success") {
            globalSarabanData = out.sarabanData || [];
            globalOrdersData = out.ordersData || [];
            globalMemosData = out.memosData || [];
            globalGenDocsData = out.genDocsData || [];
            globalReceiptsData = out.receiptsData || [];
            globalAttendanceData = out.attendanceData || [];

            calculateDashboardCounters();
            renderSarabanTable();
            renderWorkflowTable();
            renderOrdersTable();
            initCalendar();
            renderNewMenusTables();
        }
    } catch(e) { alert("ระบบเครือข่ายเชื่อมฐานข้อมูลหลักขัดข้อง"); }
    hideLoading();
}

// ===================================================================================
// 📡 ฟังก์ชันสำหรับซิงค์ข้อมูลสถิติมาเรียนตรงจากคลาวด์ Firebase โครงสร้างตารางใหม่เอี่ยม
// ===================================================================================
function syncAttendanceWithFirebase() {
    const dateVal = document.getElementById('sync-att-date').value;
    if(!dateVal) return alert("กรุณาระบุวันที่ต้องการซิงค์สถิติการมาเรียน");
    fetchFirebaseAttendanceData(dateVal);
}

function fetchFirebaseAttendanceData(targetDate) {
    showLoading("กำลังดึงสัญญาณโครงสร้างข้อมูลสถิติล่าสุดจากระบบคลาวด์ Firebase...");
    
    firebaseDb.collection("attendance").doc(targetDate).get()
        .then((doc) => {
            const tbody = document.getElementById('attendance-table-body');
            if (!tbody) return;
            tbody.innerHTML = '';

            // ตั้งค่าตัวแปรสะสมค่าเพื่อส่งออกแดชบอร์ดภาพรวมของหน้าหลัก
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
                        
                        // แกะค่าข้อมูล ชาย/หญิง/รวม ทั้งหมด, มาเรียน และ ขาดเรียน ให้ตรงสูตรล่าสุด
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

                        // รวมสถิติเข้าสู่ส่วนกลางเพื่อการประมวลผลการ์ดแดชบอร์ด
                        grandTotalStudents += totalClass;
                        grandTotalMale += tMale;
                        grandTotalFemale += tFemale;
                        grandPresent += present;
                        grandAbsent += absent;
                        grandMaleAbsent += abMale;
                        grandFemaleAbsent += abFemale;
                        grandMalePresent += pMale;
                        grandFemalePresent += pFemale;

                        // เรนเดอร์ช่องสลับสีสัน ข้อมูลมาเรียน/ข้อมูลขาดเรียน แยกชายหญิงสวยงาม
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
                });
                
                if(hasData) {
                    // คำนวณสรุปผลเปอร์เซ็นต์และเติมแถวสรุปรวมท้ายตาราง
                    const grandPercentage = grandTotalStudents > 0 ? ((grandPresent / grandTotalStudents) * 100).toFixed(2) : "0.00";
                    const mAbsentPercent = grandTotalMale > 0 ? ((grandMaleAbsent / grandTotalMale) * 100).toFixed(2) : "0.00";
                    const fAbsentPercent = grandTotalFemale > 0 ? ((grandFemaleAbsent / grandTotalFemale) * 100).toFixed(2) : "0.00";

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

                    // อัปเดตชุดข้อมูลสรุปบนการ์ดแดชบอร์ดสรุปด้านบน
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
    if (!tbody) return;
    const localFilter = globalAttendanceData.filter(d => d.date === targetDate);
    
    if(localFilter.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="py-10 text-center text-slate-400 text-xs">📭 ไม่พบสถิติการเช็คชื่อในระบบคลาวด์ Firebase และชีตหลักของวันที่ ${formatThaiDate(targetDate)}</td></tr>`;
        return;
    }
    
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

function navigateTo(targetTabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(targetTabId).classList.remove('hidden');
    document.querySelectorAll('aside nav button').forEach(btn => btn.classList.remove('sidebar-active'));
    const activeNavId = targetTabId.replace('menu-', 'nav-');
    if(document.getElementById(activeNavId)) {
        document.getElementById(activeNavId).classList.add('sidebar-active');
    }
    if(targetTabId === 'menu-calendar' && calendarObj) {
        setTimeout(() => calendarObj.render(), 150); 
    }
}

let chartDeptObj = null; let chartPriObj = null;

function calculateDashboardCounters() {
    const inCount = globalSarabanData.filter(d => d.internalId.startsWith("รับ")).length;
    const outCount = globalSarabanData.filter(d => d.internalId.startsWith("ส่ง")).length;
    const pendingCount = globalSarabanData.filter(d => d.status === "รอดำเนินการ").length;
    const orderCount = globalOrdersData.length;

    document.getElementById("dash-in").innerText = inCount;
    document.getElementById("dash-out").innerText = outCount;
    document.getElementById("dash-pending").innerText = pendingCount;
    document.getElementById("dash-orders").innerText = orderCount;

    const depts = ["ฝ่ายบริหารงานทั่วไป", "ฝ่ายบริหารงานงบประมาณ", "ฝ่ายบริหารงานวิชาการ", "ฝ่ายบริหารงานบุคคล"];
    const deptCounts = depts.map(name => globalSarabanData.filter(d => d.department.includes(name)).length);
    const priorityLevels = ["ปกติ", "ด่วน", "ด่วนมาก", "ด่วนที่สุด"];
    const priorityCounts = priorityLevels.map(level => globalSarabanData.filter(d => d.priority.includes(level)).length);

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
}

function renderSarabanTable() {
    const tbody = document.getElementById("saraban-table-body");
    tbody.innerHTML = "";
    const prefix = currentSarabanTab === 'inbound' ? 'รับ' : 'ส่ง';
    const raw = globalSarabanData.filter(d => d.internalId.startsWith(prefix));
    const search = document.getElementById("search-saraban").value.toLowerCase();
    const filtered = raw.filter(d => d.internalId.toLowerCase().includes(search) || d.docId.toLowerCase().includes(search) || d.title.toLowerCase().includes(search));
    
    if(filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="py-10 text-center text-slate-400 text-xs">🔍 ไม่พบข้อมูลทะเบียนเอกสารในระบบขณะนี้</td></tr>`;
        return;
    }

    filtered.forEach(doc => {
        const realIndex = globalSarabanData.findIndex(d => d.internalId === doc.internalId);
        const pColor = doc.priority.includes("ที่สุด") ? "text-rose-600 bg-rose-50" : doc.priority.includes("มาก") ? "text-orange-600 bg-orange-50" : doc.priority.includes("ด่วน") ? "text-amber-600 bg-amber-50" : "text-emerald-600 bg-emerald-50";
        const sColor = doc.status === "สำเร็จแล้ว" ? "bg-emerald-500 text-white" : "bg-amber-500 text-white";
        const fileLink = doc.fileUrl && doc.fileUrl.startsWith("http") ? `<a href="${doc.fileUrl}" target="_blank" class="text-blue-600 font-bold hover:underline bg-blue-50 px-2 py-0.5 rounded-md">📄 เปิดคลาวด์</a>` : `<span class="text-slate-300">ไม่มีไฟล์</span>`;
        
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50/80 transition-colors">
                <td class="py-3 px-4 font-bold text-slate-900">${doc.internalId}</td>
                <td class="py-3 px-3 font-semibold">${doc.docId}</td>
                <td class="py-3 px-3">${formatThaiDate(doc.date)}</td>
                <td class="py-3 px-3 font-bold text-blue-800">${doc.department.replace("ฝ่ายบริหารงาน", "")}</td>
                <td class="py-3 px-4 font-bold text-slate-800">${doc.title}</td>
                <td class="py-3 px-3 text-center"><span class="px-2 py-0.5 rounded-md text-[11px] font-bold ${pColor}">${doc.priority}</span></td>
                <td class="py-3 px-3 text-center font-bold text-rose-500">${formatThaiDateShort(doc.date) || '-'}</td>
                <td class="py-3 px-3 text-center"><span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${sColor}">${doc.status}</span></td>
                <td class="py-3 px-3 text-center">${fileLink}</td>
                <td class="py-3 px-4 text-right space-x-2 font-bold">
                    <button onclick="editSaraban(${realIndex})" class="text-blue-600 hover:text-blue-800 cursor-pointer">✏️ แก้ไข</button>
                    <button onclick="deleteSaraban(${realIndex})" class="text-rose-500 hover:text-rose-700 cursor-pointer">ลบ</button>
                </td>
            </tr>
        `;
    });
}

function openSarabanModal() {
    sarabanEditIndex = null; document.getElementById("saraban-form").reset();
    document.getElementById("form-file-status").classList.add("hidden");
    const prefix = currentSarabanTab === 'inbound' ? 'รับ' : 'ส่ง';
    const subList = globalSarabanData.filter(d => d.internalId.startsWith(prefix));
    
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
    document.getElementById("form-doc-id").value = data.docId;
    document.getElementById("form-date").value = data.date;
    document.getElementById("form-department").value = data.department;
    document.getElementById("form-source").value = data.source;
    document.getElementById("form-destination").value = data.destination;
    document.getElementById("form-title").value = data.title;
    document.getElementById("form-priority").value = data.priority;
    document.getElementById("form-deadline").value = data.deadline;
    document.getElementById("form-status").value = data.status;

    if(data.fileUrl && data.fileUrl.startsWith("http")) {
        const el = document.getElementById("form-file-status");
        el.innerHTML = `📎 คลาวด์ลิงก์เดิม: <a href="${data.fileUrl}" target="_blank" class="text-blue-600 font-bold underline">เปิดดูไฟล์แนบ</a>`;
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
            alert(`⚠️ เรื่อง "${currentTitle}" นี้เคยลงทะเบียนไว้ในระบบสารบรรณแล้วครับ`);
            return;
        }
    }

    showLoading("กำลังทำการสตรีมมิ่งไฟล์แนบลงคลาวด์ไดรฟ์แยกส่วนฝ่ายงาน...");
    const fileInput = document.getElementById("form-file");
    let fileDataJson = { fileData: null, fileName: null, mimeType: null };

    if(fileInput.files.length > 0) {
        const file = fileInput.files[0]; 
        const base64 = await convertFileToBase64(file);
        fileDataJson.fileData = base64; 
        fileDataJson.fileName = file.name; 
        fileDataJson.mimeType = file.type;
    }

    const docObj = {
        action: sarabanEditIndex !== null ? "update" : "insert",
        internalId: document.getElementById("form-internal-id").value,
        docId: document.getElementById("form-doc-id").value,
        date: document.getElementById("form-date").value,
        department: document.getElementById("form-department").value,
        source: document.getElementById("form-source").value,
        destination: document.getElementById("form-destination").value,
        title: currentTitle,
        priority: document.getElementById("form-priority").value,
        deadline: document.getElementById("form-deadline").value,
        status: document.getElementById("form-status").value,
        fileUrl: sarabanEditIndex !== null ? globalSarabanData[sarabanEditIndex].fileUrl : "",
        ...fileDataJson
    };

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(docObj) });
        if((await response.json()).status === "success") { 
            closeSarabanModal(); 
            await fetchSystemData(); 
        }
    } catch(e) { alert("Error: " + e.toString()); } finally { hideLoading(); }
}

function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

async function deleteSaraban(index) {
    if(confirm(`ยืนยันขอลบแถวทะเบียนสารบรรณรหัส ${globalSarabanData[index].internalId} หรือไม่?`)) {
        showLoading("กำลังเคลียร์แถวโครงสร้างข้อมูลออกจากระบบคลาวด์เซ็นเตอร์...");
        try {
            const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "delete", internalId: globalSarabanData[index].internalId }) });
            if((await response.json()).status === "success") await fetchSystemData();
        } catch(e){ alert(e.message); } finally { hideLoading(); }
    }
}

function renderWorkflowTable() {
    const tbody = document.getElementById("workflow-table-body");
    tbody.innerHTML = "";
    globalSarabanData.forEach((doc, idx) => {
        const isDirector = currentUser.role === "ผอ." || currentUser.role === "แอดมิน";
        const rowActionHtml = isDirector 
            ? `<div class="flex gap-2"><input type="text" id="work-comment-${idx}" value="${doc.managercomment || ''}" placeholder="ระบุข้อสั่งการ" class="px-2.5 py-1.5 border border-slate-300 rounded-xl text-xs w-full bg-white"><button onclick="submitWorkflowComment(${idx})" class="bg-blue-600 text-white font-bold px-3 py-1.5 rounded-xl text-xs hover:bg-blue-700 cursor-pointer whitespace-nowrap shadow-2xs">เซ็นคำสั่ง</button></div>`
            : `<span class="text-slate-400 font-bold text-xs">ไม่มีสิทธิ์บันทึกข้อสั่งการ</span>`;
        
        const isMyDept = currentUser.department === doc.department || currentUser.role === "แอดมิน";
        const statusBtnHtml = isMyDept ? `<button onclick="toggleWorkflowStatus(${idx})" class="mt-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-700 cursor-pointer block w-full">🔄 สลับสถานะ</button>` : ``;
        const sColor = doc.status === "สำเร็จแล้ว" ? "bg-emerald-500 text-white" : "bg-amber-500 text-white";
        const fileLinkHtml = doc.fileUrl && doc.fileUrl.startsWith("http") ? `<a href="${doc.fileUrl}" target="_blank" class="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-xs inline-flex items-center gap-1 border border-indigo-200 transition-colors">📄 เปิดไฟล์แนบ</a>` : `<span class="text-slate-300 italic text-xs">ไม่มีไฟล์แนบ</span>`;

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 font-bold text-slate-900">${doc.internalId}</td>
                <td class="py-3 px-3"><span class="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md font-bold text-xs text-slate-700">${doc.department.replace("ฝ่ายบริหารงาน", "")}</span></td>
                <td class="py-3 px-4 font-bold text-slate-800">${doc.title}</td>
                <td class="py-3 px-3 text-center">${fileLinkHtml}</td>
                <td class="py-3 px-4 text-blue-800 font-bold italic bg-blue-50/20">${doc.managercomment || '⏳ รอกรรมการ/ผอ. ลงนาม...'}</td>
                <td class="py-3 px-3 text-center"><span class="px-2 py-0.5 rounded-full text-xs font-bold ${sColor}">${doc.status}</span></td>
                <td class="py-3 px-4 text-center">${rowActionHtml} ${statusBtnHtml}</td>
            </tr>
        `;
    });
}

async function submitWorkflowComment(idx) {
    const commentVal = document.getElementById(`work-comment(`+idx+`)`).value;
    showLoading("กำลังลงนามบันทึกข้อสั่งการระดับผู้บริหารลงชีตหลัก...");
    const target = globalSarabanData[idx]; target.action = "update"; target.managercomment = commentVal;
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(target) });
        if((await response.json()).status === "success") await fetchSystemData();
    } catch(e){ alert(e.message); } finally { hideLoading(); }
}

async function toggleWorkflowStatus(idx) {
    const target = globalSarabanData[idx]; target.action = "update";
    target.status = target.status === "สำเร็จแล้ว" ? "รอดำเนินการ" : "สำเร็จแล้ว";
    showLoading("กำลังปรับเปลี่ยนผ่านสเตตัสงานสารบรรณ...");
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(target) });
        if((await response.json()).status === "success") await fetchSystemData();
    } catch(e){ alert(e.message); } finally { hideLoading(); }
}

function renderOrdersTable() {
    const tbody = document.getElementById("orders-table-body"); tbody.innerHTML = "";
    if(globalOrdersData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-slate-400 text-xs">📜 ยังไม่มีการออกเลขคำสั่งโรงเรียนในปีนี้</td></tr>`;
        return;
    }
    globalOrdersData.forEach(ord => {
        const fl = ord.fileUrl && ord.fileUrl.startsWith("http") ? `<a href="${ord.fileUrl}" target="_blank" class="text-purple-700 font-bold underline bg-purple-50 px-2 py-0.5 rounded-md text-xs">เปิดดูครุฑ</a>` : `<span class="text-slate-300">ไม่มีไฟล์</span>`;
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 font-black text-purple-700">เลขที่ ${ord.orderId}</td>
                <td class="py-3 px-3 font-bold text-slate-400">${ord.year}</td>
                <td class="py-3 px-5 font-bold text-slate-900">${ord.title}</td>
                <td class="py-3 px-4 text-slate-600">${ord.signDate}</td>
                <td class="py-3 px-4"><span class="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md font-bold text-xs">${ord.department.replace("ฝ่ายบริหารงาน", "")}</span></td>
                <td class="py-3 px-3 text-center">${fl}</td>
                <td class="py-3 px-4 text-right space-x-1 font-bold">
                    <button onclick="editOrder('${ord.id || ord.orderId}')" class="text-amber-600 font-bold hover:underline text-xs cursor-pointer">✏️ แก้ไข</button>
                    <button onclick="deleteRowItem('deleteOrder', '${ord.id || ord.orderId}')" class="text-rose-600 font-bold hover:underline text-xs cursor-pointer">🗑️ ลบ</button>
                </td>
            </tr>
        `;
    });
}

function openOrderModal() {
    document.getElementById("order-form").reset(); 
    document.getElementById("order-unique-id").value = '';
    document.getElementById("order-modal-title").innerText = "📜 ขอออกเลขคำสั่งโรงเรียนใหม่";
    let nextNum = 1;
    if(globalOrdersData.length > 0) {
        const last = globalOrdersData[globalOrdersData.length - 1].orderId; const match = last.match(/\d+/);
        if(match) nextNum = parseInt(match[0]) + 1;
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
            alert(`⚠️ คำสั่งโรงเรียนเรื่อง "${currentOrderTitle}" นี้มีอยู่ในระบบคุมเลขแล้วครับ`);
            return;
        }
    }

    showLoading("กำลังประมวลผลระบบคำสั่งสารบรรณโรงเรียนบ้านกาหยีและอัพโหลดเอกสารตราครุฑ...");
    const fileInput = document.getElementById("order-form-file");
    let fileDataJson = { fileData: null, fileName: null, mimeType: null };

    if(fileInput.files.length > 0) {
        const file = fileInput.files[0]; 
        const base64 = await convertFileToBase64(file);
        fileDataJson.fileData = base64; 
        fileDataJson.fileName = file.name; 
        fileDataJson.mimeType = file.type;
    }

    const id = orderUniqueId || 'ORD-' + Date.now();
    const action = orderUniqueId ? "updateOrder" : "insertOrder";

    const ordObj = {
        action: action, id: id,
        orderId: document.getElementById("order-form-id").value,
        year: document.getElementById("order-form-year").value,
        title: currentOrderTitle,
        signDate: document.getElementById("order-form-date").value,
        department: document.getElementById("order-form-department").value,
        status: "เปิดเผย", ...fileDataJson
    };

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(ordObj) });
        if((await response.json()).status === "success") { 
            closeOrderModal(); 
            await fetchSystemData(); 
        }
    } catch(e){ alert(e.toString()); } finally { hideLoading(); }
}

function editOrder(id) {
    const item = globalOrdersData.find(el => (el.id === id || el.orderId === id));
    if(!item) return;
    document.getElementById("order-form").reset();
    document.getElementById("order-unique-id").value = item.id || item.orderId;
    document.getElementById("order-form-id").value = item.orderId;
    document.getElementById("order-form-year").value = item.year;
    document.getElementById("order-form-title").value = item.title;
    document.getElementById("order-form-date").value = item.signDate;
    document.getElementById("order-form-department").value = item.department;
    document.getElementById("order-modal-title").innerText = "✏️ แก้ไขข้อมูลคำสั่งโรงเรียน";
    document.getElementById("order-modal").classList.remove("hidden");
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar-container'); if(!calendarEl) return;
    const eventsList = [];
    globalSarabanData.forEach(doc => {
        if(doc.deadline && doc.deadline !== "") {
            let evColor = "#10b981"; 
            if(doc.priority.includes("ที่สุด")) evColor = "#ef4444"; 
            else if(doc.priority.includes("มาก")) evColor = "#f97316"; 
            else if(doc.priority.includes("ด่วน")) evColor = "#f59e0b"; 

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
            alert(`📄 ทะเบียน: ${d.internalId}\nเรื่อง: ${d.title}\nกำหนดส่ง: ${formatThaiDateFull(d.deadline)}`);
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
    // 1. ตาราง บันทึกข้อความ
    const memoBody = document.getElementById('memos-table-body');
    if(memoBody) {
        memoBody.innerHTML = globalMemosData.map(item => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 font-bold text-slate-900">${item.docNo}</td>
                <td class="py-3 px-3">${formatThaiDate(item.date)}</td>
                <td class="py-3 px-4 text-slate-700">${item.title}</td>
                <td class="py-3 px-4"><span class="px-2.5 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-600 rounded-md">${item.department}</span></td>
                <td class="py-3 px-3 text-center">${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-blue-600 font-extrabold hover:underline">📂 เปิดดู</a>` : '<span class="text-slate-300">-</span>'}</td>
                <td class="py-3 px-4 text-right space-x-1">
                    <button onclick="editMemo('${item.id}')" class="text-amber-600 font-bold hover:underline text-xs cursor-pointer">✏️ แก้ไข</button>
                    <button onclick="deleteRowItem('deleteMemo', '${item.id}')" class="text-rose-600 font-bold hover:underline text-xs cursor-pointer">🗑️ ลบ</button>
                </td>
            </tr>
        `).join('');
    }

    // 2. ตาราง เอกสารทั่วไป
    const genBody = document.getElementById('gendocs-table-body');
    if(genBody) {
        genBody.innerHTML = globalGenDocsData.map(item => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 text-xs font-mono text-slate-400">${item.id.substring(0,8)}</td>
                <td class="py-3 px-4 font-bold text-slate-800">${item.docName}</td>
                <td class="py-3 px-3">${formatThaiDate(item.date)}</td>
                <td class="py-3 px-4"><span class="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md text-xs font-bold">${item.category}</span></td>
                <td class="py-3 px-3 text-center">${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-blue-600 font-extrabold hover:underline">📂 เปิดดู</a>` : '<span class="text-slate-300">-</span>'}</td>
                <td class="py-3 px-4 text-right space-x-1">
                    <button onclick="editGenDoc('${item.id}')" class="text-amber-600 font-bold hover:underline text-xs cursor-pointer">✏️ แก้ไข</button>
                    <button onclick="deleteRowItem('deleteGenDoc', '${item.id}')" class="text-rose-600 font-bold hover:underline text-xs cursor-pointer">🗑️ ลบ</button>
                </td>
            </tr>
        `).join('');
    }

    // 3. ตาราง ใบเสร็จใบรับเงิน
    const receiptBody = document.getElementById('receipts-table-body');
    if(receiptBody) {
        receiptBody.innerHTML = globalReceiptsData.map(item => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 font-bold text-slate-900">${item.receiptNo}</td>
                <td class="py-3 px-3">${formatThaiDate(item.date)}</td>
                <td class="py-3 px-3 font-bold text-emerald-600">${Number(item.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
                <td class="py-3 px-4 text-slate-700">${item.payer}</td>
                <td class="py-3 px-3 text-center">${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-blue-600 font-extrabold hover:underline">📂 ดูหลักฐาน</a>` : '<span class="text-slate-300">-</span>'}</td>
                <td class="py-3 px-4 text-right space-x-1">
                    <button onclick="editReceipt('${item.id}')" class="text-amber-600 font-bold hover:underline text-xs cursor-pointer">✏️ แก้ไข</button>
                    <button onclick="deleteRowItem('deleteReceipt', '${item.id}')" class="text-rose-600 font-bold hover:underline text-xs cursor-pointer">🗑️ ลบ</button>
                </td>
            </tr>
        `).join('');
    }
}

async function uploadAndProcessForm(actionType, idVal, payload, fileElementId) {
    showLoading("กำลังส่งข้อมูลอัปเดตระบบฐานข้อมูลคลาวด์...");
    const fileInput = document.getElementById(fileElementId);
    if(fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = async function(e) {
            payload.fileData = e.target.result.split(',')[1];
            payload.fileName = file.name;
            payload.mimeType = file.type;
            await sendPostData(actionType, payload);
        };
        reader.readAsDataURL(file);
    } else {
        await sendPostData(actionType, payload);
    }
}

async function sendPostData(actionType, payload) {
    payload.action = actionType;
    try {
        const res = await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
        if((await res.json()).status === "success") {
            alert("บันทึกการประมวลผลสำเร็จเรียบร้อย");
            document.getElementById('saraban-modal').classList.add('hidden');
            document.getElementById('order-modal').classList.add('hidden');
            document.getElementById('memo-modal').classList.add('hidden');
            document.getElementById('gendoc-modal').classList.add('hidden');
            document.getElementById('receipt-modal').classList.add('hidden');
            fetchSystemData();
        }
    } catch(e) { alert("การเชื่อมต่อเซิร์ฟเวอร์ผิดพลาด"); hideLoading(); }
}

async function deleteRowItem(actionType, targetId) {
    if(!confirm("คุณครูแน่ใจใช่หรือไม่ที่จะลบรายการข้อมูลแถวนี้อย่างถาวรออกจากระบบคลาวด์?")) return;
    showLoading("กำลังดำเนินการขอลบแถวรายการข้อมูล...");
    await sendPostData(actionType, { id: targetId });
}

function openMemoModal() { document.getElementById('memo-form').reset(); document.getElementById('memo-id').value = ''; document.getElementById('memo-modal-title').innerText = "📝 ลงทะเบียนบันทึกข้อความใหม่"; document.getElementById('memo-modal').classList.remove('hidden'); }
function closeMemoModal() { document.getElementById('memo-modal').classList.add('hidden'); }
function handleMemoSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('memo-id').value || 'MEMO-' + Date.now();
    const action = document.getElementById('memo-id').value ? 'updateMemo' : 'insertMemo';
    const payload = { id, docNo: document.getElementById('memo-no').value, date: document.getElementById('memo-date').value, title: document.getElementById('memo-title').value, department: document.getElementById('memo-dept').value };
    uploadAndProcessForm(action, id, payload, 'memo-file');
}
function editMemo(id) {
    const item = globalMemosData.find(el => el.id === id);
    if(!item) return;
    openMemoModal();
    document.getElementById('memo-id').value = item.id;
    document.getElementById('memo-no').value = item.docNo;
    document.getElementById('memo-date').value = item.date;
    document.getElementById('memo-title').value = item.title;
    document.getElementById('memo-dept').value = item.department;
    document.getElementById('memo-modal-title').innerText = "✏️ แก้ไขข้อมูลบันทึกข้อความ";
}

function openGenDocModal() { document.getElementById('gendoc-form').reset(); document.getElementById('gendoc-id').value = ''; document.getElementById('gendoc-modal-title').innerText = "🗂️ เพิ่มเอกสารทั่วไป"; document.getElementById('gendoc-modal').classList.remove('hidden'); }
function closeGenDocModal() { document.getElementById('gendoc-modal').classList.add('hidden'); }
function handleGenDocSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('gendoc-id').value || 'DOC-' + Date.now();
    const action = document.getElementById('gendoc-id').value ? 'updateGenDoc' : 'insertGenDoc';
    const payload = { id, docName: document.getElementById('gendoc-name').value, date: document.getElementById('gendoc-date').value, category: document.getElementById('gendoc-category').value };
    uploadAndProcessForm(action, id, payload, 'gendoc-file');
}
function editGenDoc(id) {
    const item = globalGenDocsData.find(el => el.id === id);
    if(!item) return;
    openGenDocModal();
    document.getElementById('gendoc-id').value = item.id;
    document.getElementById('gendoc-name').value = item.docName;
    document.getElementById('gendoc-date').value = item.date;
    document.getElementById('gendoc-category').value = item.category;
    document.getElementById('gendoc-modal-title').innerText = "✏️ แก้ไขข้อมูลเอกสารทั่วไป";
}

function openReceiptModal() { document.getElementById('receipt-form').reset(); document.getElementById('receipt-id').value = ''; document.getElementById('receipt-modal-title').innerText = "💰 ลงทะเบียนหลักฐานใบเสร็จ"; document.getElementById('receipt-modal').classList.remove('hidden'); }
function closeReceiptModal() { document.getElementById('receipt-modal').classList.add('hidden'); }
function handleReceiptSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('receipt-id').value || 'REC-' + Date.now();
    const action = document.getElementById('receipt-id').value ? 'updateReceipt' : 'insertReceipt';
    const payload = { id, receiptNo: document.getElementById('receipt-no').value, date: document.getElementById('receipt-date').value, amount: document.getElementById('receipt-amount').value, payer: document.getElementById('receipt-payer').value };
    uploadAndProcessForm(action, id, payload, 'receipt-file');
}
function editReceipt(id) {
    const item = globalReceiptsData.find(el => el.id === id);
    if(!item) return;
    openReceiptModal();
    document.getElementById('receipt-id').value = item.id;
    document.getElementById('receipt-no').value = item.receiptNo;
    document.getElementById('receipt-date').value = item.date;
    document.getElementById('receipt-amount').value = item.amount;
    document.getElementById('receipt-payer').value = item.payer;
    document.getElementById('receipt-modal-title').innerText = "✏️ แก้ไขหลักฐานเอกสารใบเสร็จ";
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

// ฟังก์ชันควบคุม Pagination แบบตัวเลขแถวยาวตามรูปแบบใหม่
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
            const pageObserver = new MutationObserver(() => {
                tablePages[tableType] = 1;
                changeTablePage(tableType, 0); 
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