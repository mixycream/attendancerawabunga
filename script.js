// --- KONFIGURASI UTAMA ---
// Paste URL Google Apps Script kamu di sini (Wajib)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxBbEsm6blMRoUYpCEYESMw6Y0XpIm-dBwSjoGvT2ZkIWDKFmXiyCbc_v04QccFfg7z/exec"; 

// Local demo accounts (fallback untuk offline + admin)
const LOCAL_USERS = [
    { u:'adminrawabunga1', p:'123', role:'admin' },
];

// Convert old Google Drive URLs to CDN format (for direct embedding with CORS support)
function convertDriveUrl(url) {
    if (!url || !url.startsWith('http')) return url;
    
    // Handle old formats: drive.google.com/uc?...&id=FILE_ID
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (idMatch) {
        return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
    }
    
    return url; // Return as-is if not a Drive URL
}

// ===== COSMIC LOGIN EFFECTS =====
// Particle System Initialization
let particles = [];
const particleCanvas = document.getElementById('particleCanvas');
const ctx = particleCanvas ? particleCanvas.getContext('2d') : null;

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = Math.random() * 1.5 + 0.5;
        this.opacity = Math.random() * 0.5 + 0.2;
        this.color = Math.random() > 0.5 ? '#3B82F6' : '#8B5CF6';
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.opacity -= 0.002;
    }
    
    draw(ctx) {
        ctx.fillStyle = this.color + Math.floor(this.opacity * 255).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initParticleSystem() {
    if (!particleCanvas || !ctx) return;
    
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
    
    function animate() {
        ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
        
        particles = particles.filter(p => p.opacity > 0);
        particles.forEach(p => {
            p.update();
            p.draw(ctx);
        });
        
        requestAnimationFrame(animate);
    }
    
    animate();
    
    // Spawn particles on mouse move
    document.addEventListener('mousemove', (e) => {
        if (Math.random() > 0.8) {
            particles.push(new Particle(e.clientX, e.clientY));
        }
    });
    
    window.addEventListener('resize', () => {
        particleCanvas.width = window.innerWidth;
        particleCanvas.height = window.innerHeight;
    });
}

// Initialize particles when DOM ready
document.addEventListener('DOMContentLoaded', initParticleSystem);

// Mouse tracking for card glow effect
const loginCard = document.getElementById('loginCard');
if (loginCard) {
    document.addEventListener('mousemove', (e) => {
        const rect = loginCard.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        
        const glow = Math.sqrt(x * x + y * y) / 300;
        loginCard.style.boxShadow = `
            0 0 ${60 + glow * 30}px rgba(59, 130, 246, ${0.3 + glow * 0.2}),
            0 0 ${120 + glow * 60}px rgba(59, 130, 246, ${0.15 + glow * 0.15}),
            0 25px 50px rgba(0, 0, 0, 0.5)
        `;
    });
}

// Helper to call API and return parsed JSON (kept separate from postData which returns boolean)
async function callApi(action, payload) {
    try {
        const form = new URLSearchParams();
        const dataObj = { action, ...payload };
        Object.keys(dataObj).forEach(k => {
            if (dataObj[k] === undefined || dataObj[k] === null) return;
            form.append(k, String(dataObj[k]));
        });

        const res = await fetch(SCRIPT_URL, { method: 'POST', body: form });
        let json = null;
        try { json = await res.json(); } catch (e) { json = null; }
        return { ok: res.ok, data: json };
    } catch (e) {
        console.error('callApi error', e);
        return { ok: false, error: e };
    }
}

// STATE
let employees = []; 
let logs = [];
let currentUser = null;
let appConfig = { 
    overtimeRate: 15000,
    shifts: {} // Will be populated from cloud
}; 
let sortState = {
    logs: 'time_desc',
    employees: 'name_asc',
    salary: 'name_asc'
};
let editingEmployeeId = null;
let pendingAttendancePayload = null; // Menyimpan data sementara jika telat > 30 menit
let trendChartInstance = null; // Instance Chart.js
let securitySelfAttendanceDone = false;
let securitySelfAttendanceMode = false;

// Camera & Geo State
let scanStream = null, faceStream = null, scanInterval = null;
let scannedEmployee = null;
let currentFacingMode = 'user';
let currentLocation = "Lokasi Tidak Terdeteksi";
let isLocationLocked = false;
let activeWorkerTimer = null; 

// --- HELPER FUNCTIONS ---

// Format Menit ke "X Jam Y Menit"
function formatDuration(totalMinutes) {
    if (!totalMinutes || totalMinutes <= 0) return "-";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    let result = [];
    if (hours > 0) result.push(`${hours} Jam`);
    if (minutes > 0) result.push(`${minutes} Menit`);
    
    return result.join(" ");
}

// --- AUTH & INIT ---
window.onload = () => {
    const savedUser = localStorage.getItem('mbg_user');
    if(savedUser) {
        currentUser = JSON.parse(savedUser);
        if (currentUser.role === 'security') {
            callApi('checkSecuritySession', { username: currentUser.u || '' }).then(resp => {
                if (!resp.ok || !resp.data || resp.data.status !== 'success') {
                    localStorage.removeItem('mbg_user');
                    showToast(resp?.data?.message || 'Session security sudah tidak aktif. Silakan login ulang.', 'error');
                    return;
                }
                document.getElementById('loginView').classList.add('hidden');
                fetchData(true);
                initSecurity();
            }).catch(() => {
                localStorage.removeItem('mbg_user');
                showToast('Gagal validasi session security. Silakan login ulang.', 'error');
            });
        } else {
            document.getElementById('loginView').classList.add('hidden');
            fetchData(true);
            initAdmin();
        }
    }
    
    const savedRate = localStorage.getItem('mbg_overtime_rate');
    if(savedRate) appConfig.overtimeRate = parseInt(savedRate);
};

// Populate remembered username if exists
try {
    window.addEventListener('load', () => {
        const saved = localStorage.getItem('remembered_username');
        if (saved) {
            const el = document.getElementById('usernameInput');
            if (el) el.value = saved;
            const chk = document.getElementById('rememberMe'); if (chk) chk.checked = true;
        }
    });
} catch(e) {}

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('usernameInput').value.toLowerCase().trim();
    const p = document.getElementById('passwordInput').value;

    if(SCRIPT_URL.includes("GANTI_DENGAN") || SCRIPT_URL === "") {
        return alert("PENTING: Edit file script.js baris ke-3, masukkan URL Google Script Anda!");
    }

    // Cek admin lokal dulu (fallback offline)
    const localAcc = LOCAL_USERS.find(a => a.u === u && a.p === p);
    if(localAcc) {
        currentUser = localAcc;
        localStorage.setItem('mbg_user', JSON.stringify(localAcc));

        document.getElementById('loginView').classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => document.getElementById('loginView').classList.add('hidden'), 500);

        await fetchData(true);
        if(localAcc.role === 'security') initSecurity(); else initAdmin();
        // Remember username if checkbox checked
        const remember = document.getElementById('rememberMe')?.checked;
        if (remember) localStorage.setItem('remembered_username', u); else localStorage.removeItem('remembered_username');
        return;
    }

    // Jika bukan admin lokal, coba server untuk security accounts
    const resp = await callApi('login', { username: u, password: p });
    if (!resp.ok || !resp.data) return showToast('Gagal terhubung ke server / Username/Password Salah', 'error');
    if (resp.data.status === 'success') {
        const user = resp.data.user || { u: u, role: 'security' };
        currentUser = user;
        localStorage.setItem('mbg_user', JSON.stringify(user));

        document.getElementById('loginView').classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => document.getElementById('loginView').classList.add('hidden'), 500);

        await fetchData(true);
        if (user.role === 'security') initSecurity(); else initAdmin();
        // Remember username if checkbox checked
        const remember = document.getElementById('rememberMe')?.checked;
        if (remember) localStorage.setItem('remembered_username', u); else localStorage.removeItem('remembered_username');
    } else {
        showToast(resp.data.message || 'Username / Password Salah', 'error');
    }
}

function togglePasswordVisibility() {
    const inp = document.getElementById('passwordInput');
    const icon = document.getElementById('pwdToggleIcon');
    if (!inp) return;
    if (inp.type === 'password') { inp.type = 'text'; if(icon) { icon.className = 'fas fa-eye-slash'; } }
    else { inp.type = 'password'; if(icon) { icon.className = 'fas fa-eye'; } }
}

async function logout() {
    if(confirm("Keluar dari aplikasi?")) {
        if (currentUser && currentUser.role === 'security') {
            try {
                await callApi('securityLogout', { username: currentUser.u || '' });
            } catch (e) {
                console.warn('securityLogout failed', e);
            }
        }
        localStorage.removeItem('mbg_user'); 
        location.reload();
    }
}

// --- CLOUD OPERATIONS ---
function toggleLoader(show, text="Menghubungkan...") {
    const el = document.getElementById('globalLoader');
    document.getElementById('loaderText').innerText = text;
    if(show) {
        el.classList.remove('hidden');
        setTimeout(() => el.classList.remove('opacity-0'), 10);
    } else {
        el.classList.add('opacity-0');
        setTimeout(() => el.classList.add('hidden'), 300);
    }
}

async function fetchData(force = false) {
    toggleLoader(true, "Sinkronisasi Data...");
    let retries = 3;
    let lastError = null;

    while (retries > 0) {
        try {
            const res = await fetch(SCRIPT_URL + "?action=getData", { timeout: 10000 });
            const data = await res.json();

            if(data.status === 'success') {
                employees = data.employees;
                logs = data.logs;

                if(data.config) {
                    if(data.config.overtimeRate) {
                        appConfig.overtimeRate = parseInt(data.config.overtimeRate);
                        localStorage.setItem('mbg_overtime_rate', appConfig.overtimeRate);
                    }
                    if(data.config.shifts) {
                        appConfig.shifts = data.config.shifts;
                    }
                }

                refreshUI();
                toggleLoader(false);
                return;
            } else {
                lastError = data.message || 'Status gagal';
                retries--;
                if (retries > 0) await new Promise(r => setTimeout(r, 500));
            }
        } catch(e) {
            console.error('fetchData error:', e);
            lastError = e.message;
            retries--;
            if (retries > 0) await new Promise(r => setTimeout(r, 500));
        }
    }

    // Semua retry gagal
    showToast("Koneksi Error. Menggunakan data lokal terakhir.", "error");
    toggleLoader(false);
}

async function postData(action, payload) {
    toggleLoader(true, "Upload ke Cloud...");
    try {
        const dataObj = { action, ...payload };
        
        // Use JSON for requests with large data (photos), form-encoded for small data
        const hasLargeData = (payload.photo || payload.image) ? true : false;
        
        let res;
        if (hasLargeData) {
            // Send as JSON for photo uploads (primary)
            try {
                res = await fetch(SCRIPT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dataObj)
                });
            } catch (jsonErr) {
                // Fallback to form-encoded when JSON/preflight fails (common: Failed to fetch)
                console.warn('JSON upload failed, retrying with form-encoded:', jsonErr);
                const form = new URLSearchParams();
                Object.keys(dataObj).forEach(k => {
                    if (dataObj[k] === undefined || dataObj[k] === null) return;
                    form.append(k, String(dataObj[k]));
                });
                res = await fetch(SCRIPT_URL, {
                    method: 'POST',
                    body: form
                });
            }
        } else {
            // Send as form-encoded for other requests
            const form = new URLSearchParams();
            Object.keys(dataObj).forEach(k => {
                if (dataObj[k] === undefined || dataObj[k] === null) return;
                form.append(k, String(dataObj[k]));
            });
            res = await fetch(SCRIPT_URL, {
                method: 'POST',
                body: form
            });
        }

        // Try to parse JSON response from server
        let json;
        try { json = await res.json(); } catch (parseErr) { json = null; }

        if (!res.ok) {
            const msg = (json && json.message) ? json.message : `HTTP ${res.status}`;
            showToast("Gagal menyimpan: " + msg, "error");
            return false;
        }

        if (json && json.status && json.status === 'success') {
            showToast("Data Tersimpan!", "success");
            fetchData();
            return true;
        } else {
            const msg = (json && json.message) ? json.message : 'Respons server tidak valid';
            showToast("Gagal menyimpan: " + msg, "error");
            return false;
        }

    } catch (e) {
        console.error('postData error', e);
        showToast("Gagal terhubung ke server: " + e.message, "error");
        return false;
    } finally {
        toggleLoader(false);
    }
}

// --- UI UPDATES & LOGIC ---

function saveConfig() {
    const rate = document.getElementById('configOvertimeRate').value;
    appConfig.overtimeRate = rate;
    localStorage.setItem('mbg_overtime_rate', rate);
    renderSalary(); 
    postData('saveConfig', { overtimeRate: rate });
}

function refreshUI() {
    if(!currentUser || currentUser.role !== 'admin') {
        updateSecurityDropdown();
        updateSecurityInfo();
        return;
    }

    document.getElementById('configOvertimeRate').value = appConfig.overtimeRate;

    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter(l => l.date === today);
    const present = todayLogs.filter(l => l.type === 'IN').length;
    
    // Hitung Late Count
    const lateCount = todayLogs.filter(l => l.lateMinutes > 0 || l.type === 'PENDING').length;
    
    let overtimeCount = 0;
    todayLogs.filter(l => l.type === 'OUT').forEach(l => { if(l.overtime > 0) overtimeCount++; });

    const workingCount = employees.filter(e => {
        const myLogs = logs.filter(l => l.empId === e.id).sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
        return myLogs.length > 0 && myLogs[0].type === 'IN';
    }).length;

    // Update Stats Cards
    document.getElementById('statEmp').innerText = employees.length;
    document.getElementById('statPresent').innerText = present;
    document.getElementById('statWorking').innerText = workingCount + " Sedang Bekerja";
    document.getElementById('statOvertime').innerText = overtimeCount;
    document.getElementById('statLate').innerText = lateCount; 

    // Render Components
    renderTrendChart();
    renderDivisionGrid();

    // --- RENDER LOGS (TABEL AKTIVITAS) ---
    const sortedLogs = getSortedData(logs, 'logs');
    const logBody = document.getElementById('logsTableBody');
    logBody.innerHTML = sortedLogs.slice(0, 20).map(l => {
        let badge = '', statusText = '';
        
        if (l.type === 'IN') {
            badge = 'bg-emerald-100 text-emerald-700';
            statusText = 'IN';
        } else if (l.type === 'OUT') {
            badge = 'bg-amber-100 text-amber-700';
            statusText = 'OUT';
        } else if (l.type === 'PENDING') {
            badge = 'bg-red-100 text-red-600 animate-pulse';
            statusText = 'KONFIRMASI TELAT';
        } else if (l.type === 'REJECTED') {
            badge = 'bg-slate-200 text-slate-500 line-through';
            statusText = 'DITOLAK';
        }

        let actionArea = `<span class="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${badge}">${statusText}</span>`;
        
        if (l.type === 'PENDING') {
            actionArea = `
            <div class="flex flex-col gap-1 items-center">
                <div class="text-[9px] font-bold text-red-500 uppercase">Perlu Konfirmasi</div>
                <div class="flex gap-1">
                    <button onclick="confirmLate('${l.row}', 'IN')" class="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded text-[10px] font-bold shadow-sm transition">Terima</button>
                    <button onclick="confirmLate('${l.row}', 'OUT')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-[10px] font-bold shadow-sm transition">Tolak</button>
                </div>
            </div>`;
        }

        let photoHtml = '<div class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mx-auto"><i class="fas fa-user"></i></div>';
        if(l.photo && (l.photo.startsWith('http') || l.photo.startsWith('data:image'))) {
             const photoUrl = convertDriveUrl(l.photo);
             const safeUrl = photoUrl.replace(/'/g, "\\'");
             // Add crossOrigin and better error handling; fallback to user icon SVG
             const fallbackSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e2e8f0%22/%3E%3Ctext x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%239ca3af%22 font-size=%2240%22%3E%26%238287;%3C/text%3E%3C/svg%3E';
             photoHtml = `<img src="${photoUrl}" onclick="previewImage('${safeUrl}'); event.stopPropagation();" class="w-10 h-10 rounded-full object-cover border-2 border-white shadow-md cursor-pointer hover:scale-110 transition mx-auto" crossorigin="anonymous" onerror="console.warn('Photo failed to load:', this.src); this.onerror=null; this.src='${fallbackSvg}';">`;
        }
        
        // Pemisahan Kolom & Format
        let overtimeInfo = l.overtime > 0 ? `<span class="text-amber-600 font-bold">${l.overtime} Jam</span>` : '-';
        
        let lateInfo = '-';
        if (l.lateMinutes > 0) {
            lateInfo = `<span class="text-red-500 font-bold text-[10px]">${formatDuration(l.lateMinutes)}</span>`;
            if (l.note) {
                lateInfo += `<div class="text-[9px] text-slate-400 mt-1 italic max-w-[100px] truncate" title="${l.note}">"${l.note}"</div>`;
            }
        }
            
        return `
        <tr class="bg-white hover:bg-slate-50 border-b border-slate-50 transition group">
            <td class="px-6 py-4 text-center">${photoHtml}</td>
            <td class="px-6 py-4">
                <div class="font-bold text-slate-700">${l.time}</div>
                <div class="text-[10px] text-slate-400">${l.date}</div>
            </td>
            <td class="px-6 py-4 font-bold text-slate-700">${l.name}</td>
             <td class="px-6 py-4">
                <div class="text-[10px] text-slate-500 truncate max-w-[150px]"><i class="fas fa-map-marker-alt text-slate-300 mr-1"></i>${l.location || '-'}</div>
            </td>
            <td class="px-6 py-4 text-center">${lateInfo}</td>
            <td class="px-6 py-4 text-center">${overtimeInfo}</td>
            <td class="px-6 py-4 text-center">${actionArea}</td>
            <td class="px-6 py-4 text-center text-xs font-semibold text-slate-600">${l.absentBy || '-'}</td>
        </tr>`;
    }).join('');

    // --- RENDER EMPLOYEE LIST (DAFTAR RELAWAN) ---
    const sortedEmployees = getSortedData(employees, 'employees');
    const empBody = document.getElementById('employeeTableBody');
    if(empBody) {
        empBody.innerHTML = sortedEmployees.map(e => {
            let profilePic = `<div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-user"></i></div>`;
            if (e.photo && e.photo.length > 20) {
                 const photoUrl = convertDriveUrl(e.photo);
                 profilePic = `<img src="${photoUrl}" crossorigin="anonymous" class="w-8 h-8 rounded-full object-cover border border-slate-200" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e2e8f0%22/%3E%3Ctext x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%239ca3af%22 font-size=%2240%22%3E%26%238287;%3C/text%3E%3C/svg%3E';">`;
            }

            const shiftTime = getShiftTime(e.division);

            return `
            <tr class="border-b border-slate-50 hover:bg-slate-50 transition">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        ${profilePic}
                        <div>
                            <div class="font-bold text-slate-700">${e.name}</div>
                            <div class="text-[10px] text-slate-400 font-mono">${e.id}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">
                    <span class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">${e.division}</span>
                    <div class="text-[10px] text-slate-400 mt-1"><i class="far fa-clock"></i> ${shiftTime}</div>
                </td>
                <td class="px-6 py-4 text-right font-bold text-emerald-600">Rp ${parseInt(e.salary).toLocaleString()}</td>
                <td class="px-6 py-4 text-center">
                    <button onclick="openEditEmployee('${e.id}')" class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-mbg-50 hover:text-mbg-600 transition flex items-center justify-center">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                </td>
            </tr>
        `}).join('');
    }

    renderSalary();
}

async function confirmLate(row, newStatus) {
    if(!confirm(`Konfirmasi status menjadi ${newStatus}?`)) return;
    const logIndex = logs.findIndex(l => l.row == row);
    if(logIndex !== -1) {
        logs[logIndex].type = newStatus;
        refreshUI();
    }
    await postData('confirmAttendance', { row: row, newStatus: newStatus });
}

// --- RENDER SALARY & REPORTS ---
function renderSalary() {
    const body = document.getElementById('salaryTableBody');
    const detailBody = document.getElementById('overtimeDetailBody');
    const lateDetailBody = document.getElementById('lateDetailBody'); 
    
    let overtimeDetailsHtml = '';
    let lateDetailsHtml = ''; 
    
    let salaryData = employees.map(e => {
        const empLogs = logs.filter(l => l.empId === e.id);
        const days = new Set(empLogs.filter(l => l.type === 'IN').map(l => l.date)).size;
        
        let totalOvertimeHours = 0;
        let totalLateCount = 0; 
        
        // Detail Lembur
        empLogs.filter(l => l.type === 'OUT' && l.overtime > 0).forEach(l => {
            totalOvertimeHours += (parseInt(l.overtime) || 0);
            const shift = appConfig.shifts[e.division];
            const shiftEnd = shift ? (typeof shift === 'string' ? 'Auto 8h' : shift.end) : '-';

            overtimeDetailsHtml += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-3 font-bold text-slate-700">${e.name}</td>
                <td class="p-3 text-slate-500">${l.date}</td>
                <td class="p-3 font-mono text-slate-500">${shiftEnd}</td>
                <td class="p-3 font-mono font-bold text-slate-800">${l.time}</td>
                <td class="p-3 text-right text-xs text-slate-400 italic">Terhitung > 40m</td>
                <td class="p-3 text-right font-bold text-amber-600">+${l.overtime} Jam</td>
            </tr>`;
        });

        // Detail Telat
        empLogs.filter(l => l.type === 'IN' && l.lateMinutes > 0).forEach(l => {
            totalLateCount++;
            const shift = appConfig.shifts[e.division];
            const shiftStart = shift ? (typeof shift === 'string' ? '00:00' : shift.start) : '-';
            const noteText = l.note ? `<br><span class="text-[9px] text-slate-400 italic">"${l.note}"</span>` : '';

            lateDetailsHtml += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-3 font-bold text-slate-700">${e.name}</td>
                <td class="p-3 text-slate-500">${l.date}</td>
                <td class="p-3 font-mono text-slate-500">${shiftStart}</td>
                <td class="p-3 font-mono font-bold text-slate-800">${l.time}</td>
                <td class="p-3 text-right font-bold text-red-500">${formatDuration(l.lateMinutes)} ${noteText}</td>
            </tr>`;
        });

        const basicSalary = days * e.salary;
        const overtimePay = totalOvertimeHours * appConfig.overtimeRate;
        const total = basicSalary + overtimePay;
        
        return { ...e, days, totalOvertimeHours, totalLateCount, total };
    });
    
    if(detailBody) detailBody.innerHTML = overtimeDetailsHtml || '<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada data lembur</td></tr>';
    if(lateDetailBody) lateDetailBody.innerHTML = lateDetailsHtml || '<tr><td colspan="5" class="p-4 text-center text-slate-400">Belum ada data keterlambatan</td></tr>';

    const criteria = sortState['salary'];
    if (criteria === 'name_asc') salaryData.sort((a, b) => a.name.localeCompare(b.name));
    if (criteria === 'total_desc') salaryData.sort((a, b) => b.total - a.total);
    if (criteria === 'days_desc') salaryData.sort((a, b) => b.days - a.days);

    body.innerHTML = salaryData.map((e, i) => {
        const lateClass = e.totalLateCount > 0 ? "text-red-500 font-bold" : "text-slate-300";
        
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 break-inside-avoid">
            <td class="p-4 text-center text-slate-400 font-mono text-xs">${i+1}</td>
            <td class="p-4 font-bold text-slate-700">${e.name}<br><span class="text-[10px] font-normal text-slate-400">${e.division}</span></td>
            <td class="p-4 text-center">
                <div class="text-xs font-bold text-slate-700">${e.days} Hari</div>
                <div class="text-[10px] text-slate-400">x Rp ${parseInt(e.salary).toLocaleString()}</div>
            </td>
            <td class="p-4 text-center ${lateClass}">
                ${e.totalLateCount}x
            </td>
            <td class="p-4 text-center">
                <div class="text-xs font-bold text-amber-600">${e.totalOvertimeHours} Jam</div>
                <div class="text-[10px] text-slate-400">x Rp ${parseInt(appConfig.overtimeRate).toLocaleString()}</div>
            </td>
            <td class="p-4 text-right font-extrabold text-slate-800 text-base">Rp ${e.total.toLocaleString()}</td>
        </tr>`;
    }).join('');
}

// --- CHART & GRID ---
function renderTrendChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    const labels = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
    }).reverse();

    const presentData = labels.map(date => logs.filter(l => l.date === date && l.type === 'IN').length);
    const lateData = labels.map(date => logs.filter(l => l.date === date && (l.lateMinutes > 0 || l.type === 'PENDING')).length);
    const overtimeData = labels.map(date => logs.filter(l => l.date === date && l.type === 'OUT' && l.overtime > 0).length);

    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(d => {
                const parts = d.split('-');
                return `${parts[2]}/${parts[1]}`; 
            }),
            datasets: [
                { label: 'Hadir', data: presentData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', tension: 0.4, fill: true },
                { label: 'Telat', data: lateData, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', tension: 0.4 },
                { label: 'Lembur', data: overtimeData, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', tension: 0.4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top' } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

function renderDivisionGrid() {
    const container = document.getElementById('divisionGrid');
    if(!container) return;
    
    const counts = {};
    employees.forEach(e => {
        counts[e.division] = (counts[e.division] || 0) + 1;
    });

    const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500', 'bg-rose-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-lime-500'];

    container.innerHTML = Object.entries(counts).map(([div, count], index) => {
        const colorClass = colors[index % colors.length];
        return `
        <div onclick="showDivisionDetails('${div}')" class="cursor-pointer group relative overflow-hidden bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
            <div class="absolute right-0 top-0 w-16 h-16 opacity-10 rounded-bl-full ${colorClass} group-hover:scale-150 transition-transform duration-500"></div>
            <div class="relative z-10">
                <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Divisi</div>
                <div class="font-bold text-slate-800 text-sm truncate" title="${div}">${div}</div>
                <div class="mt-2 text-2xl font-extrabold text-slate-800">${count} <span class="text-[10px] font-normal text-slate-400">Org</span></div>
            </div>
        </div>`;
    }).join('');
}

// --- SECURITY LOGIC UPDATED ---
function validateEmployee(id) {
    const emp = employees.find(e => e.id == id || e.name.toLowerCase() == id.toLowerCase());
    if(emp) {
        if (!securitySelfAttendanceMode && String(emp.division || '').toLowerCase().includes('keamanan')) {
            showToast("Security tidak bisa di-scan dari halaman relawan.", "error");
            return;
        }
        scannedEmployee = emp;
        document.getElementById('secGatePage')?.classList.add('hidden');
        document.getElementById('secPage1').classList.add('hidden');
        document.getElementById('secPage2').classList.remove('hidden');
        document.getElementById('confirmName').innerText = emp.name;
        document.getElementById('confirmDiv').innerText = emp.division;
        let shiftLabel = getShiftTime(emp.division);
        document.getElementById('confirmShift').innerText = `Shift: ${shiftLabel}`;
        
        // MINIMIZE INFO JADWAL SHIFT
        const shiftInfo = document.getElementById('securityShiftInfo');
        if(shiftInfo) shiftInfo.classList.add('hidden');

        if(scanStream) scanStream.getTracks().forEach(t=>t.stop());
        startSelfie('user'); 
    } else {
        showToast("Karyawan Tidak Ditemukan", "error");
    }
}

function resetSecurityFlow() {
    scannedEmployee = null;
    securitySelfAttendanceMode = false;
    document.getElementById('secPage2').classList.add('hidden');
    if (securitySelfAttendanceDone) {
        document.getElementById('secPage1').classList.remove('hidden');
        document.getElementById('secGatePage')?.classList.add('hidden');
    } else {
        document.getElementById('secPage1').classList.add('hidden');
        document.getElementById('secGatePage')?.classList.remove('hidden');
    }
    
    // TAMPILKAN KEMBALI INFO SHIFT
    const shiftInfo = document.getElementById('securityShiftInfo');
    if(shiftInfo) shiftInfo.classList.remove('hidden');

    if(faceStream) faceStream.getTracks().forEach(t=>t.stop());
    if (securitySelfAttendanceDone) startQR();
}

async function submitAbsence(type) {
    if (!isLocationLocked) return showToast("Tunggu GPS Terkunci!", "error");
    if (securitySelfAttendanceMode && type !== 'IN') return showToast("Gunakan Absen Masuk untuk absen security awal shift.", "error");

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    
    const empLogs = logs.filter(l => l.empId === scannedEmployee.id).sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
    const lastLog = empLogs.length > 0 ? empLogs[0] : null;

    if(type === 'IN') {
        if(lastLog && lastLog.type === 'IN') {
            showToast("Sesi Masih Aktif!", "error");
            setTimeout(resetSecurityFlow, 1500); 
            return;
        }
    }

    let overtimeHours = 0;
    let lateMinutes = 0;
    let finalType = type;
    let forcedTime = null; 
    let toastMessage = "Absen Berhasil!";

    if (type === 'IN') {
        const divConfig = appConfig.shifts[scannedEmployee.division];
        if (divConfig && typeof divConfig !== 'string') {
            const shiftStartH = parseInt(divConfig.start.split(':')[0]);
            const shiftStartM = parseInt(divConfig.start.split(':')[1]);
            let expectedStart = new Date();
            expectedStart.setHours(shiftStartH, shiftStartM, 0, 0);
            const diffMs = now - expectedStart;
            const diffMin = Math.floor(diffMs / 60000);

            if (diffMin > 0) {
                lateMinutes = diffMin;
                if (diffMin < 30) {
                    forcedTime = divConfig.start; 
                    toastMessage = `Telat ${diffMin}m (Toleransi).`;
                } else {
                    finalType = 'PENDING';
                    toastMessage = "Menunggu Konfirmasi Admin.";
                }
            }
        }
    }
    
    if(type === 'OUT') {
        if(!lastLog || lastLog.type === 'OUT') return showToast("Belum Absen Masuk!", "error");
        
        const divConfig = appConfig.shifts[scannedEmployee.division];
        if (divConfig && typeof divConfig !== 'string') {
             const shiftEndH = parseInt(divConfig.end.split(':')[0]);
             const shiftStartH = parseInt(divConfig.start.split(':')[0]);
             let logDateParts = lastLog.date.split('-'); 
             let logYear = parseInt(logDateParts[0]);
             let logMonth = parseInt(logDateParts[1]) - 1; 
             let logDay = parseInt(logDateParts[2]);
             let expectedEnd = new Date(logYear, logMonth, logDay, shiftEndH, parseInt(divConfig.end.split(':')[1]));
             if (shiftEndH < shiftStartH) expectedEnd.setDate(expectedEnd.getDate() + 1);
             const diffMs = now - expectedEnd;
             const diffMinutes = Math.floor(diffMs / 60000);
             if (diffMinutes > 40) overtimeHours = Math.floor((diffMinutes - 41) / 60) + 1;
             toastMessage = `Lembur: ${overtimeHours} Jam`;
        }
    }

    const video = document.getElementById('faceVideo');
    const canvas = document.getElementById('snapCanvas');
    canvas.width = 400; canvas.height = 533; 
    const ctx = canvas.getContext('2d');
    if(currentFacingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photoBase64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]; 

    const payload = {
        empId: scannedEmployee.id, name: scannedEmployee.name, type: finalType, overtime: overtimeHours,
        location: currentLocation, image: photoBase64, date: today, lateMinutes: lateMinutes, forcedTime: forcedTime, note: "",
        absentBy: currentUser ? (currentUser.name || currentUser.u || '-') : '-'
    };

    if (finalType === 'PENDING') {
        pendingAttendancePayload = payload;
        document.getElementById('lateNoteInput').value = ""; 
        document.getElementById('lateAlertModal').classList.remove('hidden');
        setTimeout(() => document.getElementById('lateAlertModal').classList.remove('opacity-0'), 10);
        return; 
    }

    const success = await postData('attendance', payload);
    if(success) {
        toggleLoader(false);
        showToast(toastMessage, "success");
        if (securitySelfAttendanceMode && finalType === 'IN' && currentUser && String(scannedEmployee.id) === String(currentUser.id)) {
            securitySelfAttendanceDone = true;
            securitySelfAttendanceMode = false;
            updateSecurityEntryGate();
        }
        resetSecurityFlow();
    }
}

async function submitLateReason() {
    if (!pendingAttendancePayload) return;
    const note = document.getElementById('lateNoteInput').value;
    pendingAttendancePayload.note = note; 
    const modal = document.getElementById('lateAlertModal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
    postData('attendance', pendingAttendancePayload).then(success => {
        if(success) {
            toggleLoader(false);
            showToast("Laporan Telat Terkirim.", "success");
            resetSecurityFlow();
        }
    });
    pendingAttendancePayload = null; 
}

// --- HELPER FUNCTIONS ---
function handleSort(table, value) { sortState[table] = value; refreshUI(); }
function getSortedData(data, type) {
    let sorted = [...data];
    if (type === 'logs') {
        if (sortState[type] === 'time_desc') return sorted.sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
        if (sortState[type] === 'time_asc') return sorted.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
        if (sortState[type] === 'name_asc') return sorted.sort((a, b) => a.name.localeCompare(b.name));
        if (sortState[type] === 'status_asc') return sorted.sort((a, b) => a.type.localeCompare(b.type));
    }
    if (type === 'employees') {
        if (sortState[type] === 'name_asc') return sorted.sort((a, b) => a.name.localeCompare(b.name));
        if (sortState[type] === 'name_desc') return sorted.sort((a, b) => b.name.localeCompare(a.name));
        if (sortState[type] === 'salary_desc') return sorted.sort((a, b) => b.salary - a.salary);
        if (sortState[type] === 'div_asc') return sorted.sort((a, b) => a.division.localeCompare(b.division));
    }
    return sorted;
}

function startClockAndGPS() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('liveTime').innerText = now.toLocaleTimeString('id-ID', {hour12: false});
        document.getElementById('liveDate').innerText = now.toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
    }, 1000);
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (pos) => {
                currentLocation = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
                document.getElementById('liveLoc').innerText = currentLocation;
                if (!isLocationLocked) {
                    isLocationLocked = true;
                    document.getElementById('gpsStatus').innerHTML = '<span class="text-white">GPS Terkunci</span>';
                    document.getElementById('gpsStatus').parentElement.classList.replace('text-emerald-400', 'bg-emerald-500');
                    document.getElementById('gpsStatus').parentElement.classList.add('px-2', 'rounded');
                    document.getElementById('btnAbsenIn').disabled = false;
                    document.getElementById('btnAbsenOut').disabled = false;
                }
            },
            (err) => {
                currentLocation = "GPS Error";
                document.getElementById('liveLoc').innerText = currentLocation;
                isLocationLocked = false;
                document.getElementById('btnAbsenIn').disabled = true;
                document.getElementById('btnAbsenOut').disabled = true;
            }
        );
    }
}

function updateSecurityDropdown() {
    return;
}

function startQR() {
    const video = document.getElementById('scanVideo');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(stream => {
        scanStream = stream;
        video.srcObject = stream;
        requestAnimationFrame(scanLoop);
    }).catch(e => { console.error("Cam Error", e); showToast("Gagal akses kamera belakang", "error"); });
}

function scanLoop() {
    if(scannedEmployee) return;
    const video = document.getElementById('scanVideo');
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0,0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        if(code && code.data) validateEmployee(code.data);
    }
    if(!scannedEmployee) requestAnimationFrame(scanLoop);
}

function manualSelect(val) { return; }
function startSelfie(mode) {
    currentFacingMode = mode;
    const video = document.getElementById('faceVideo');
    if(faceStream) faceStream.getTracks().forEach(t => t.stop());
    navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode } }).then(s => {
        faceStream = s;
        video.srcObject = s;
        if(mode === 'user') video.style.transform = "scaleX(-1)";
        else video.style.transform = "scaleX(1)";
    }).catch(e => showToast("Gagal akses kamera selfie", "error"));
}
function toggleCamera() { const newMode = currentFacingMode === 'user' ? 'environment' : 'user'; startSelfie(newMode); }

// Config & Modal Functions
function openConfigModal() {
    const list = document.getElementById('configList');
    list.innerHTML = '';
    const orderedKeys = ["Helper Cook", "Cook", "Head Chef", "Packing", "Distribusi", "Kenek Distribusi", "Kebersihan", "Asisten Lapangan", "Gudang", "Keamanan Shift 1", "Keamanan Shift 2"];
    orderedKeys.forEach(key => {
        const shiftData = appConfig.shifts[key] || { start: "00:00", end: "08:00" };
        const startVal = typeof shiftData === 'string' ? shiftData : shiftData.start; 
        const endVal = typeof shiftData === 'string' ? "00:00" : shiftData.end;
        list.innerHTML += `
        <div class="grid grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div class="col-span-4 text-xs font-bold text-slate-700">${key}</div>
            <div class="col-span-4"><input type="text" inputmode="numeric" placeholder="HH:mm" maxlength="5" class="shift-start-input w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-emerald-600 focus:border-mbg-500 outline-none text-center" data-division="${key}" value="${startVal}" onchange="validateTimeInput(this); autoCalculateEndTime(this)"></div>
            <div class="col-span-4"><input type="text" inputmode="numeric" placeholder="HH:mm" maxlength="5" class="shift-end-input w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-amber-600 focus:border-mbg-500 outline-none text-center" data-division="${key}" id="end-${key.replace(/\s/g, '-')}" value="${endVal}" onchange="validateTimeInput(this)"></div>
        </div>`;
    });
    document.getElementById('configModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('configModal').classList.remove('opacity-0'), 10);
}
function validateTimeInput(input) {
    let val = input.value.replace(/[^0-9:]/g, ''); 
    if (!val) return;
    if(val.indexOf(':') === -1) {
        if(val.length === 4) val = val.substring(0,2) + ':' + val.substring(2);
        else if(val.length === 3) val = '0' + val.substring(0,1) + ':' + val.substring(1);
        else if(val.length <= 2) val = val + ':00';
    }
    let [h, m] = val.split(':').map(Number);
    if(isNaN(h)) h = 0; if(isNaN(m)) m = 0;
    h = Math.min(23, Math.max(0, h)); m = Math.min(59, Math.max(0, m));
    input.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function autoCalculateEndTime(input) {
    const div = input.dataset.division;
    const startTime = input.value;
    if(!startTime) return;
    const [h, m] = startTime.split(':').map(Number);
    let endH = (h + 8) % 24;
    const endStr = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const endInput = document.getElementById(`end-${div.replace(/\s/g, '-')}`);
    if(endInput) { endInput.value = endStr; endInput.classList.add('bg-amber-50'); setTimeout(() => endInput.classList.remove('bg-amber-50'), 300); }
}
function closeConfigModal() { document.getElementById('configModal').classList.add('opacity-0'); setTimeout(() => document.getElementById('configModal').classList.add('hidden'), 300); }
function saveShiftConfig() {
    const startInputs = document.querySelectorAll('.shift-start-input');
    let newShifts = {};
    startInputs.forEach(input => {
        const div = input.dataset.division;
        const endInput = document.getElementById(`end-${div.replace(/\s/g, '-')}`);
        newShifts[div] = { start: input.value, end: endInput.value };
    });
    appConfig.shifts = newShifts;
    postData('saveConfig', { shifts: newShifts });
    closeConfigModal();
}
function getShiftTime(division) {
    if (division === 'Keamanan') return "Shift (Rotasi)";
    const shift = appConfig.shifts[division];
    if (!shift) return "-";
    if (typeof shift === 'string') return shift; 
    return `${shift.start} - ${shift.end}`;
}

// Modal Helpers
function showAllEmployees() { openModalList('Total Relawan Terdaftar', 'all'); }
function showActiveVolunteers() { openModalList('Relawan Sedang Bekerja', 'active'); }
function showPresentVolunteers() { openModalList('Relawan Hadir Hari Ini', 'present'); }
function showOvertimeToday() { openModalList('Lembur Hari Ini', 'overtime'); }
function showLateToday() { openModalList('Terlambat Hari Ini', 'late'); }
function showDivisionDetails(division) { openModalList(`Divisi: ${division}`, 'division', division); }

function openModalList(title, mode, filterParam = null) {
    const list = document.getElementById('activeWorkersList');
    document.getElementById('activeModalTitle').innerText = title;
    const render = () => {
        const now = new Date();
        const today = new Date().toISOString().split('T')[0];
        let filtered = [];
        if (mode === 'all') {
            document.getElementById('activeModalSubtitle').innerText = "Seluruh database relawan";
            filtered = employees;
        } else if (mode === 'active') {
            document.getElementById('activeModalSubtitle').innerText = "Realtime tracking";
            filtered = employees.map(e => {
                const myLogs = logs.filter(l => l.empId === e.id).sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
                if (myLogs.length > 0 && myLogs[0].type === 'IN') { return { ...e, inTime: myLogs[0].time, inDate: myLogs[0].date, status: 'working' }; }
                return null;
            }).filter(e => e !== null);
        } else if (mode === 'present') {
            document.getElementById('activeModalSubtitle').innerText = `Kehadiran ${today}`;
            const todayInLogs = logs.filter(l => l.date === today && l.type === 'IN');
            filtered = todayInLogs.map(log => {
                const emp = employees.find(e => e.id === log.empId);
                return emp ? { ...emp, inTime: log.time, status: 'present' } : null;
            }).filter(e => e);
        } else if (mode === 'overtime') {
            document.getElementById('activeModalSubtitle').innerText = `Lembur ${today}`;
            const todayOvertimeLogs = logs.filter(l => l.date === today && l.type === 'OUT' && l.overtime > 0);
            filtered = todayOvertimeLogs.map(log => {
                const emp = employees.find(e => e.id === log.empId);
                return emp ? { ...emp, extraInfo: `+${log.overtime} Jam`, status: 'overtime' } : null;
            }).filter(e => e);
        } else if (mode === 'late') {
            document.getElementById('activeModalSubtitle').innerText = `Terlambat ${today}`;
            const todayLateLogs = logs.filter(l => l.date === today && (l.lateMinutes > 0 || l.type === 'PENDING'));
            filtered = todayLateLogs.map(log => {
                const emp = employees.find(e => e.id === log.empId);
                const info = log.type === 'PENDING' ? 'Menunggu Konfirmasi' : `${formatDuration(log.lateMinutes)}`;
                return emp ? { ...emp, extraInfo: info, status: 'late' } : null;
            }).filter(e => e);
        } else if (mode === 'division') {
            document.getElementById('activeModalSubtitle').innerText = "Filter Divisi";
            filtered = employees.filter(e => e.division === filterParam);
        }

        list.innerHTML = filtered.length ? filtered.map(w => {
            let statusBadge = '', timeInfo = '';
            if (mode === 'active') {
                const start = new Date(`${w.inDate}T${w.inTime}`);
                const diffMs = Math.max(now - start, 0);
                const hrs = Math.floor(diffMs / 3600000);
                const mins = Math.floor((diffMs % 3600000) / 60000);
                const secs = Math.floor((diffMs % 60000) / 1000); 
                statusBadge = '<span class="bg-emerald-100 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">Sedang Bekerja</span>';
                timeInfo = `<div class="font-mono font-bold text-emerald-600 text-sm">${hrs}j ${mins}m ${secs}d</div>`; 
            } else if (mode === 'present') {
                statusBadge = '<span class="bg-blue-100 text-blue-600 text-[10px] px-2 py-0.5 rounded-full font-bold">Hadir</span>';
                timeInfo = `<div class="text-[10px] text-slate-400">Masuk: <span class="font-bold text-slate-700">${w.inTime}</span></div>`;
            } else if (mode === 'overtime') {
                statusBadge = '<span class="bg-amber-100 text-amber-600 text-[10px] px-2 py-0.5 rounded-full font-bold">Lembur</span>';
                timeInfo = `<div class="text-sm font-bold text-amber-600">${w.extraInfo}</div>`;
            } else if (mode === 'late') {
                statusBadge = '<span class="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full font-bold">Terlambat</span>';
                timeInfo = `<div class="text-sm font-bold text-red-600">${w.extraInfo}</div>`;
            } else {
                statusBadge = `<span class="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold">ID: ${w.id}</span>`;
            }
            return `
            <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div class="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-400"><i class="fas fa-user"></i></div>
                <div class="flex-1"><div class="font-bold text-sm text-slate-800">${w.name}</div><div class="flex items-center gap-2 mt-0.5">${statusBadge}</div></div>
                <div class="text-right">${timeInfo}</div>
            </div>`;
        }).join('') : '<div class="text-center text-slate-400 py-10">Tidak ada data.</div>';
    };
    render();
    document.getElementById('activeWorkersModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('activeWorkersModal').classList.remove('opacity-0'), 10);
    if(activeWorkerTimer) clearInterval(activeWorkerTimer);
    if(mode === 'active') activeWorkerTimer = setInterval(render, 1000); 
}
function closeActiveWorkers() {
    const modal = document.getElementById('activeWorkersModal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
    if(activeWorkerTimer) clearInterval(activeWorkerTimer);
}
// UI Helpers
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ol = document.getElementById('sidebarOverlay');
    if (sb.classList.contains('-translate-x-full')) { sb.classList.remove('-translate-x-full'); ol.classList.remove('hidden'); setTimeout(() => ol.classList.remove('opacity-0'), 10); } 
    else { sb.classList.add('-translate-x-full'); ol.classList.add('opacity-0'); setTimeout(() => ol.classList.add('hidden'), 300); }
}
function previewImage(url) { document.getElementById('imgModalSrc').src = url; document.getElementById('imgDownloadLink').href = url; document.getElementById('imgModal').classList.remove('hidden'); setTimeout(() => document.getElementById('imgModal').classList.remove('opacity-0'), 10); }
function closePreview() { document.getElementById('imgModal').classList.add('opacity-0'); setTimeout(() => document.getElementById('imgModal').classList.add('hidden'), 300); }
function switchTab(id) {
    ['dashboard','employees','salaries'].forEach(t => document.getElementById('tab-'+t).classList.add('hidden'));
    document.getElementById('tab-'+id).classList.remove('hidden');
    if(window.innerWidth < 768) { document.getElementById('sidebar').classList.add('-translate-x-full'); document.getElementById('sidebarOverlay').classList.add('hidden'); }
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    Array.from(document.querySelectorAll('.nav-item')).find(b => b.getAttribute('onclick').includes(id))?.classList.add('active');
    const titles = { 'dashboard': 'Dashboard', 'employees': 'Data Karyawan', 'salaries': 'Laporan Gaji' };
    document.getElementById('pageTitle').innerText = titles[id];
}
function initAdmin() { document.getElementById('adminLayout').classList.remove('hidden'); refreshUI(); }
function updateSecurityInfo() {
    const now = new Date(); const onejan = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil((((now.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
    const badge = document.getElementById('weekInfoBadge'); if(badge) badge.innerText = week % 2 === 0 ? "Minggu Genap" : "Minggu Ganjil";
}
function updateSecurityProfileIndicator() {
    const el = document.getElementById('securityProfileText');
    if (!el || !currentUser) return;
    el.innerText = `${currentUser.name || currentUser.u || '-'} • ${currentUser.division || 'Keamanan'}`;
}

function hasSecurityCheckedInToday() {
    if (!currentUser || !currentUser.id) return false;
    const today = new Date().toISOString().split('T')[0];
    return logs.some(l => String(l.empId) === String(currentUser.id) && l.date === today && l.type === 'IN');
}

function updateSecurityEntryGate() {
    const gate = document.getElementById('secGatePage');
    const scanner = document.getElementById('secPage1');
    const status = document.getElementById('securityEntryStatus');
    if (!gate || !scanner) return;

    securitySelfAttendanceDone = hasSecurityCheckedInToday();
    if (securitySelfAttendanceDone) {
        gate.classList.add('hidden');
        scanner.classList.remove('hidden');
        if (status) status.innerText = 'Sudah absen masuk. QR relawan aktif.';
        if (!scanStream) startQR();
    } else {
        gate.classList.remove('hidden');
        scanner.classList.add('hidden');
        document.getElementById('secPage2')?.classList.add('hidden');
        if (status) status.innerText = 'Belum absen masuk.';
        if (scanStream) {
            scanStream.getTracks().forEach(t => t.stop());
            scanStream = null;
        }
    }
}

function startSecuritySelfCheck() {
    if (!currentUser || !currentUser.id) {
        showToast('Data security login tidak lengkap', 'error');
        return;
    }
    securitySelfAttendanceMode = true;
    validateEmployee(String(currentUser.id));
}

function initSecurity() {
    document.getElementById('securityLayout').classList.remove('hidden');
    updateSecurityDropdown();
    updateSecurityInfo();
    updateSecurityProfileIndicator();
    startClockAndGPS();
    updateSecurityEntryGate();
}
function toggleNewEmpCreds(div) {
    const el = document.getElementById('newEmpCreds');
    const unameEl = document.getElementById('newEmpUsername');
    const pwdEl = document.getElementById('newEmpPassword');
    if (!el) return;
    if (String(div).toLowerCase().includes('keamanan')) {
        if (unameEl) unameEl.value = '';
        if (pwdEl) pwdEl.value = '';
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}
function toggleEditEmpCreds(div) {
    const el = document.getElementById('editEmpCreds');
    const unameEl = document.getElementById('editEmpUsername');
    const pwdEl = document.getElementById('editEmpPassword');
    if (!el) return;
    if (String(div).toLowerCase().includes('keamanan')) {
        el.classList.remove('hidden');
    } else {
        if (unameEl) unameEl.value = '';
        if (pwdEl) pwdEl.value = '';
        el.classList.add('hidden');
    }
}
function addEmployee(e) {
    e.preventDefault();
    const name = document.getElementById('newEmpName').value;
    const div = document.getElementById('newEmpDiv').value;
    const salary = document.getElementById('newEmpSalary').value;
    const id = 'EMP-' + Math.floor(1000 + Math.random() * 9000);

    let payload = { id, name, division: div, salary };
    
    // Include username/password for security division if provided
    if (String(div).toLowerCase().includes('keamanan')) {
        const uname = document.getElementById('newEmpUsername').value;
        const pwd = document.getElementById('newEmpPassword').value;
        if (uname) payload.username = uname;
        if (pwd) payload.password = pwd;
    }

    postData('addEmployee', payload);
    e.target.reset();
    const creds = document.getElementById('newEmpCreds'); if (creds) creds.classList.add('hidden');
}
function deleteEmployee() { if (!editingEmployeeId) return; if(confirm("Hapus data relawan ini?")) { employees = employees.filter(e => e.id !== editingEmployeeId); refreshUI(); closeEditEmployee(); postData('deleteEmployee', { id: editingEmployeeId }); } }
function submitEditEmployee(e) {
    e.preventDefault(); if (!editingEmployeeId) return;
    const name = document.getElementById('editEmpName').value;
    const div = document.getElementById('editEmpDiv').value;
    const salary = document.getElementById('editEmpSalary').value;
    let payload = { id: editingEmployeeId, name: name, division: div, salary: salary };
    const oldEmp = employees.find(e => e.id === editingEmployeeId);
    if(oldEmp && oldEmp.photo) payload.photo = oldEmp.photo;

    // Include username/password for security division if provided
    if (String(div).toLowerCase().includes('keamanan')) {
        const uname = document.getElementById('editEmpUsername').value;
        const pwd = document.getElementById('editEmpPassword').value;
        if (uname) payload.username = uname;
        if (pwd) payload.password = pwd;
    } else {
        payload.username = '';
        payload.password = '';
    }

    const empIndex = employees.findIndex(e => e.id === editingEmployeeId);
    if(empIndex !== -1) { employees[empIndex] = { ...employees[empIndex], ...payload }; refreshUI(); }
    closeEditEmployee(); postData('addEmployee', payload);
}
function openEditEmployee(id) {
    const emp = employees.find(e => e.id === id); if (!emp) return;
    editingEmployeeId = id; document.getElementById('editEmpId').value = id; document.getElementById('editEmpName').value = emp.name; document.getElementById('editEmpDiv').value = emp.division; document.getElementById('editEmpSalary').value = emp.salary;
    const previewContainer = document.getElementById('editPreviewContainer');
    if (emp.photo && emp.photo.length > 20) { 
        const photoUrl = convertDriveUrl(emp.photo);
        previewContainer.innerHTML = `<img src="${photoUrl}" crossorigin="anonymous" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e2e8f0%22/%3E%3Ctext x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%239ca3af%22 font-size=%2240%22%3E%26%238287;%3C/text%3E%3C/svg%3E';"> 
    `; 
    } else { 
        previewContainer.innerHTML = '<i class="fas fa-user text-slate-300 text-2xl"></i>'; 
    }
    // Populate credentials if present
    const unameEl = document.getElementById('editEmpUsername'); const pwdEl = document.getElementById('editEmpPassword');
    if (unameEl) unameEl.value = emp.username || '';
    if (pwdEl) pwdEl.value = '';
    toggleEditEmpCreds(emp.division);
    document.getElementById('editEmployeeModal').classList.remove('hidden'); setTimeout(() => document.getElementById('editEmployeeModal').classList.remove('opacity-0'), 10);
}
function closeEditEmployee() { document.getElementById('editEmployeeModal').classList.add('opacity-0'); setTimeout(() => document.getElementById('editEmployeeModal').classList.add('hidden'), 300); editingEmployeeId = null; }
function showToast(msg, type='success') {
    const t = document.getElementById('toast'); const i = document.getElementById('toastIcon'); document.getElementById('toastMsg').innerText = msg;
    if(type === 'error') { i.className = "w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-xs"; i.innerHTML = '<i class="fas fa-times"></i>'; } 
    else { i.className = "w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs"; i.innerHTML = '<i class="fas fa-check"></i>'; }
    t.classList.remove('-translate-y-[200%]', 'opacity-0'); setTimeout(() => t.classList.add('-translate-y-[200%]', 'opacity-0'), 6000); 
}