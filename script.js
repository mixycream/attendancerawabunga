// --- KONFIGURASI UTAMA ---
// Paste URL Google Apps Script kamu di sini (Wajib)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyW5Pmj7wTX53bBVSgnxrOVMR6IPdEeP3V3x9-QtrhiM86Ubw9JSCzU9edobFD3FCZK/exec"; 

// Local demo accounts (fallback untuk offline + admin)
const LOCAL_USERS = [
    { u:'adminrawabunga1', p:'!1AdminRawaBunga1', role:'admin' },
];

const DIVISION_ROLE_PRESETS = {
    'Keamanan': 'security',
    'Ahli Gizi': 'nutritionist',
    'Akuntan': 'accountant',
    'Gudang': 'warehouse',
    'Ka SPPG': 'head_sppg',
    'Yayasan': 'foundation'
};

const ROLE_LABELS = {
    admin: 'Admin',
    employee: 'Relawan Biasa',
    security: 'Security',
    nutritionist: 'Ahli Gizi',
    accountant: 'Akuntan',
    warehouse: 'Gudang',
    head_sppg: 'Ka SPPG',
    foundation: 'Yayasan'
};

function inferRoleFromDivision(division) {
    const normalized = String(division || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (normalized.includes('keamanan')) return 'security';
    if (normalized.includes('ahli gizi') || normalized.includes('ahligizi')) return 'nutritionist';
    if (normalized.includes('akuntan')) return 'accountant';
    if (normalized.includes('gudang')) return 'warehouse';
    if (normalized.includes('ka sppg') || normalized.includes('kasppg')) return 'head_sppg';
    if (normalized.includes('yayasan')) return 'foundation';
    return 'employee';
}

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
            if (currentUser.role === 'nutritionist') initNutritionist();
            else if (['accountant', 'warehouse', 'head_sppg', 'foundation'].includes(currentUser.role)) initSpecialRoleDashboard();
            else if (currentUser.role === 'employee') initVolunteer();
            else initAdmin();
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
        if (localAcc.role === 'security') initSecurity();
        else if (localAcc.role === 'nutritionist') initNutritionist();
        else if (['accountant', 'warehouse', 'head_sppg', 'foundation'].includes(localAcc.role)) initSpecialRoleDashboard();
        else if (localAcc.role === 'employee') initVolunteer();
        else initAdmin();
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
        if (user.role === 'security') initSecurity();
        else if (user.role === 'nutritionist') initNutritionist();
        else if (['accountant', 'warehouse', 'head_sppg', 'foundation'].includes(user.role)) initSpecialRoleDashboard();
        else if (user.role === 'employee') initVolunteer();
        else initAdmin();
        // Remember username if checkbox checked
        const remember = document.getElementById('rememberMe')?.checked;
        if (remember) localStorage.setItem('remembered_username', u); else localStorage.removeItem('remembered_username');
    } else {
        try {
            const fallbackRes = await fetch(SCRIPT_URL + '?action=getData');
            const fallbackData = await fallbackRes.json();
            const matched = (fallbackData.employees || []).find(emp => {
                const role = emp.role || inferRoleFromDivision(emp.division);
                if (role === 'employee' || role === 'security') return false;
                return String(emp.username || '').toLowerCase().trim() === u && String(emp.password || '').trim() === p;
            });

            if (matched) {
                const user = {
                    u: String(matched.username || '').toLowerCase().trim(),
                    role: matched.role || inferRoleFromDivision(matched.division),
                    id: matched.id,
                    name: matched.name,
                    division: matched.division,
                    photo: matched.photo || ''
                };
                currentUser = user;
                localStorage.setItem('mbg_user', JSON.stringify(user));

                document.getElementById('loginView').classList.add('opacity-0', 'pointer-events-none');
                setTimeout(() => document.getElementById('loginView').classList.add('hidden'), 500);

                employees = fallbackData.employees || [];
                logs = fallbackData.logs || [];
                if (fallbackData.config) {
                    if (fallbackData.config.overtimeRate) appConfig.overtimeRate = parseInt(fallbackData.config.overtimeRate) || appConfig.overtimeRate;
                    if (fallbackData.config.shifts) appConfig.shifts = fallbackData.config.shifts;
                }

                if (user.role === 'nutritionist') initNutritionist();
                else if (['accountant', 'warehouse', 'head_sppg', 'foundation'].includes(user.role)) initSpecialRoleDashboard();
                else if (user.role === 'employee') initVolunteer();
                else initAdmin();

                const remember = document.getElementById('rememberMe')?.checked;
                if (remember) localStorage.setItem('remembered_username', u); else localStorage.removeItem('remembered_username');
                return;
            }
        } catch (fallbackError) {
            console.warn('Role login fallback failed', fallbackError);
        }

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
    if(!currentUser) {
        return;
    }

    if (currentUser.role === 'nutritionist') {
        nRenderOverview();
        nRecalcPlanner();
        return;
    }

    if (['accountant', 'warehouse', 'head_sppg', 'foundation'].includes(currentUser.role)) {
        renderSpecialRoleDashboard();
        return;
    }

    if(currentUser.role !== 'admin') {
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
            const roleKey = e.role || inferRoleFromDivision(e.division);
            const roleLabel = ROLE_LABELS[roleKey] || roleKey;
            const roleClass = roleKey === 'employee' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700';

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
                <td class="px-6 py-4 text-center">
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${roleClass}">${roleLabel}</span>
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

// --- CETAK REKAP GAJI (Print with Kop Surat) ---
function openCetakModal() {
    const modal = document.getElementById('cetakModal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
}
function closeCetakModal() {
    const modal = document.getElementById('cetakModal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
}
function confirmCetakGaji() {
    closeCetakModal();
    setTimeout(() => cetakRekapGaji(), 350);
}

function cetakRekapGaji() {
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const now = new Date();
    const periodeText = `${bulan[now.getMonth()]} ${now.getFullYear()}`;
    const periodeEl = document.getElementById('printPeriodeGaji');
    const tanggalEl = document.getElementById('printTanggalGaji');
    if (periodeEl) periodeEl.textContent = `Periode: ${periodeText}`;
    if (tanggalEl) tanggalEl.textContent = `Jakarta, ${now.getDate()} ${bulan[now.getMonth()]} ${now.getFullYear()}`;

    // Read checkbox options BEFORE generating slips
    const showLembur = document.getElementById('chkRincianLembur')?.checked;
    const showTelat = document.getElementById('chkRincianTelat')?.checked;
    const showSlip = document.getElementById('chkSlipIndividual')?.checked;
    const showKop = document.getElementById('chkKopSurat')?.checked;

    // Generate individual slip per employee
    const slipContainer = document.getElementById('slipGajiIndividual');
    if (slipContainer) {
        let slipsHtml = '';
        const salaryList = employees.map(e => {
            const empLogs = logs.filter(l => l.empId === e.id);
            const days = new Set(empLogs.filter(l => l.type === 'IN').map(l => l.date)).size;
            let totalOvertimeHours = 0;
            let totalLateCount = 0;
            let totalLateMinutes = 0;
            const overtimeRows = [];
            const lateRows = [];

            empLogs.filter(l => l.type === 'OUT' && l.overtime > 0).forEach(l => {
                totalOvertimeHours += (parseInt(l.overtime) || 0);
                overtimeRows.push({ date: l.date, hours: l.overtime });
            });
            empLogs.filter(l => l.type === 'IN' && l.lateMinutes > 0).forEach(l => {
                totalLateCount++;
                totalLateMinutes += l.lateMinutes;
                lateRows.push({ date: l.date, minutes: l.lateMinutes });
            });

            const basicSalary = days * e.salary;
            const overtimePay = totalOvertimeHours * appConfig.overtimeRate;
            const total = basicSalary + overtimePay;
            return { ...e, days, totalOvertimeHours, totalLateCount, totalLateMinutes, overtimeRows, lateRows, basicSalary, overtimePay, total };
        });

        salaryList.forEach((e, idx) => {
            let overtimeRowsHtml = e.overtimeRows.map(r => `<tr><td style="border:1px solid #ccc;padding:4px 8px;font-size:10px;">${r.date}</td><td style="border:1px solid #ccc;padding:4px 8px;font-size:10px;text-align:right;">+${r.hours} Jam</td></tr>`).join('');
            let lateRowsHtml = e.lateRows.map(r => `<tr><td style="border:1px solid #ccc;padding:4px 8px;font-size:10px;">${r.date}</td><td style="border:1px solid #ccc;padding:4px 8px;font-size:10px;text-align:right;color:#dc2626;">${formatDuration(r.minutes)}</td></tr>`).join('');

            slipsHtml += `
            <div style="page-break-before:${idx === 0 ? 'always' : 'always'}; padding-top:12px;">
                <table style="width:100%;border-collapse:collapse;border:2px solid #555;">
                    <thead>
                        <tr style="background:#e2e8f0;">
                            <th colspan="3" style="border:1px solid #999;padding:8px;font-size:13px;text-align:center;letter-spacing:1px;">SLIP GAJI — ${e.name}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- INFO KARYAWAN -->
                        <tr style="background:#f8fafc;">
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:10px;color:#555;width:130px;">Nama Karyawan</td>
                            <td colspan="2" style="border:1px solid #ccc;padding:6px 8px;font-size:11px;font-weight:700;">${e.name}</td>
                        </tr>
                        <tr style="background:#f8fafc;">
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:10px;color:#555;">Divisi</td>
                            <td colspan="2" style="border:1px solid #ccc;padding:6px 8px;font-size:11px;font-weight:700;">${e.division}</td>
                        </tr>
                        <tr style="background:#f8fafc;">
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:10px;color:#555;">Gaji Per Hari</td>
                            <td colspan="2" style="border:1px solid #ccc;padding:6px 8px;font-size:11px;">Rp ${parseInt(e.salary).toLocaleString()}</td>
                        </tr>
                        <tr style="background:#f8fafc;">
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:10px;color:#555;">Periode</td>
                            <td colspan="2" style="border:1px solid #ccc;padding:6px 8px;font-size:11px;">${periodeText}</td>
                        </tr>
                        <!-- HEADER KOMPONEN -->
                        <tr style="background:#e2e8f0;">
                            <th style="border:1px solid #999;padding:6px 8px;font-size:10px;text-align:left;">Komponen</th>
                            <th style="border:1px solid #999;padding:6px 8px;font-size:10px;text-align:center;">Keterangan</th>
                            <th style="border:1px solid #999;padding:6px 8px;font-size:10px;text-align:right;width:140px;">Jumlah</th>
                        </tr>
                        <tr>
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:11px;">Gaji Pokok</td>
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:11px;text-align:center;">${e.days} hari x Rp ${parseInt(e.salary).toLocaleString()}</td>
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:11px;text-align:right;">Rp ${e.basicSalary.toLocaleString()}</td>
                        </tr>
                        ${showLembur ? `<tr>
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:11px;">Lembur</td>
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:11px;text-align:center;">${e.totalOvertimeHours} jam x Rp ${parseInt(appConfig.overtimeRate).toLocaleString()}</td>
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:11px;text-align:right;">Rp ${e.overtimePay.toLocaleString()}</td>
                        </tr>` : ''}
                        ${showTelat ? `<tr>
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:11px;color:#dc2626;">Keterlambatan</td>
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:11px;text-align:center;color:#dc2626;">${e.totalLateCount}x (total ${formatDuration(e.totalLateMinutes)})</td>
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:11px;text-align:right;">-</td>
                        </tr>` : ''}
                        ${showLembur && e.overtimeRows.length > 0 ? `
                        <tr style="background:#e2e8f0;"><th colspan="3" style="border:1px solid #999;padding:5px 8px;font-size:9px;text-align:left;">RINCIAN LEMBUR</th></tr>
                        <tr style="background:#fffbeb;"><td style="border:1px solid #ccc;padding:4px 8px;font-size:9px;font-weight:700;">Tanggal</td><td colspan="2" style="border:1px solid #ccc;padding:4px 8px;font-size:9px;font-weight:700;text-align:right;">Jam Lembur</td></tr>
                        ${e.overtimeRows.map(r => `<tr><td style="border:1px solid #ccc;padding:4px 8px;font-size:10px;">${r.date}</td><td colspan="2" style="border:1px solid #ccc;padding:4px 8px;font-size:10px;text-align:right;">+${r.hours} Jam</td></tr>`).join('')}` : ''}
                        ${showTelat && e.lateRows.length > 0 ? `
                        <tr style="background:#e2e8f0;"><th colspan="3" style="border:1px solid #999;padding:5px 8px;font-size:9px;text-align:left;">RINCIAN KETERLAMBATAN</th></tr>
                        <tr style="background:#fef2f2;"><td style="border:1px solid #ccc;padding:4px 8px;font-size:9px;font-weight:700;">Tanggal</td><td colspan="2" style="border:1px solid #ccc;padding:4px 8px;font-size:9px;font-weight:700;text-align:right;">Terlambat</td></tr>
                        ${e.lateRows.map(r => `<tr><td style="border:1px solid #ccc;padding:4px 8px;font-size:10px;">${r.date}</td><td colspan="2" style="border:1px solid #ccc;padding:4px 8px;font-size:10px;text-align:right;color:#dc2626;">${formatDuration(r.minutes)}</td></tr>`).join('')}` : ''}
                        <!-- TOTAL -->
                        <tr style="background:#e2e8f0;font-weight:700;">
                            <td colspan="2" style="border:1px solid #999;padding:8px;font-size:12px;text-align:right;">TOTAL TAKE HOME PAY</td>
                            <td style="border:1px solid #999;padding:8px;font-size:13px;text-align:right;">Rp ${e.total.toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>

                <div style="margin-top:20px;display:flex;justify-content:space-between;">
                    <div style="text-align:center;width:45%;">
                        <p style="font-size:10px;color:#555;margin:0 0 50px;">Penerima,</p>
                        <p style="font-size:11px;font-weight:700;margin:0;border-bottom:1px solid #333;display:inline-block;padding-bottom:2px;">${e.name}</p>
                    </div>
                    <div style="text-align:center;width:45%;">
                        <p style="font-size:10px;color:#555;margin:0 0 50px;">Akuntan,</p>
                        <p style="font-size:11px;font-weight:700;margin:0;border-bottom:1px solid #333;display:inline-block;padding-bottom:2px;">Muhammad Fikri, S. Ak.</p>
                    </div>
                </div>
            </div>`;
        });
        slipContainer.innerHTML = slipsHtml;
    }

    // Apply checkbox options to main print sections

    const sectionLembur = document.getElementById('printSectionLembur');
    const sectionTelat = document.getElementById('printSectionTelat');
    const sectionSlip = document.getElementById('slipGajiIndividual');
    const sectionKop = document.getElementById('kopSuratGaji');
    const sectionTtd = document.getElementById('printTtdFooter');

    // Store original display to restore after print
    const restore = [];
    if (!showLembur && sectionLembur) { restore.push([sectionLembur, sectionLembur.style.display]); sectionLembur.style.display = 'none'; }
    if (!showTelat && sectionTelat) { restore.push([sectionTelat, sectionTelat.style.display]); sectionTelat.style.display = 'none'; }
    if (!showSlip && sectionSlip) { restore.push([sectionSlip, sectionSlip.style.display]); sectionSlip.style.display = 'none'; }
    if (!showKop && sectionKop) { restore.push([sectionKop, sectionKop.style.display]); sectionKop.style.display = 'none'; }
    if (!showKop && sectionTtd) { restore.push([sectionTtd, sectionTtd.style.display]); sectionTtd.style.display = 'none'; }

    window.print();

    // Restore after print
    setTimeout(() => restore.forEach(([el, orig]) => el.style.display = orig || ''), 500);
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
    if (!isLocationLocked) return showToast("Tunggu GPS Terkunci!\nPastikan GPS dan Lokasi Aktif.", "error");
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
    // Deteksi wajah sebelum capture
    if (video) {
        try {
            const faceFound = await detectFace(video);
            if (!faceFound) {
                return showToast('Wajah tidak terdeteksi! Pastikan wajah terlihat jelas di kamera.', 'error');
            }
        } catch (e) {
            console.warn('Face detection skip:', e);
        }
    }
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

// =============================================
// NUTRITIONIST DASHBOARD - Complete System
// =============================================

// --- Food Database (per 100g, sumber: TKPI / DKBM Indonesia) ---
const FOOD_DATABASE = [
    // Karbohidrat
    { name: 'Beras Putih', category: 'karbohidrat', kcal: 360, protein: 6.8, carbs: 79.3, fat: 0.7, fiber: 0.4 },
    { name: 'Beras Merah', category: 'karbohidrat', kcal: 352, protein: 7.3, carbs: 76.2, fat: 0.9, fiber: 3.5 },
    { name: 'Mie Kering', category: 'karbohidrat', kcal: 337, protein: 7.9, carbs: 70.3, fat: 3.3, fiber: 1.2 },
    { name: 'Roti Tawar', category: 'karbohidrat', kcal: 248, protein: 8.0, carbs: 50.0, fat: 1.2, fiber: 2.7 },
    { name: 'Kentang', category: 'karbohidrat', kcal: 62, protein: 2.1, carbs: 13.5, fat: 0.2, fiber: 1.8 },
    { name: 'Ubi Jalar', category: 'karbohidrat', kcal: 123, protein: 1.8, carbs: 27.9, fat: 0.7, fiber: 3.0 },
    { name: 'Jagung Pipil', category: 'karbohidrat', kcal: 150, protein: 4.7, carbs: 28.6, fat: 1.3, fiber: 2.8 },
    { name: 'Singkong', category: 'karbohidrat', kcal: 154, protein: 1.0, carbs: 36.8, fat: 0.3, fiber: 1.2 },
    { name: 'Oatmeal', category: 'karbohidrat', kcal: 379, protein: 13.2, carbs: 67.7, fat: 6.5, fiber: 10.1 },
    // Protein Hewani
    { name: 'Ayam Dada', category: 'protein_hewani', kcal: 164, protein: 31.0, carbs: 0, fat: 3.6, fiber: 0 },
    { name: 'Ayam Paha', category: 'protein_hewani', kcal: 209, protein: 26.0, carbs: 0, fat: 10.9, fiber: 0 },
    { name: 'Daging Sapi', category: 'protein_hewani', kcal: 250, protein: 26.0, carbs: 0, fat: 15.0, fiber: 0 },
    { name: 'Ikan Lele', category: 'protein_hewani', kcal: 90, protein: 18.7, carbs: 0, fat: 1.1, fiber: 0 },
    { name: 'Ikan Tongkol', category: 'protein_hewani', kcal: 117, protein: 25.0, carbs: 0, fat: 1.0, fiber: 0 },
    { name: 'Ikan Nila', category: 'protein_hewani', kcal: 96, protein: 20.1, carbs: 0, fat: 1.7, fiber: 0 },
    { name: 'Telur Ayam', category: 'protein_hewani', kcal: 154, protein: 12.4, carbs: 0.7, fat: 10.8, fiber: 0 },
    { name: 'Telur Puyuh', category: 'protein_hewani', kcal: 158, protein: 13.1, carbs: 0.4, fat: 11.1, fiber: 0 },
    { name: 'Udang', category: 'protein_hewani', kcal: 91, protein: 21.0, carbs: 0.3, fat: 0.5, fiber: 0 },
    { name: 'Ikan Bandeng', category: 'protein_hewani', kcal: 148, protein: 20.0, carbs: 0, fat: 7.0, fiber: 0 },
    // Protein Nabati
    { name: 'Tahu', category: 'protein_nabati', kcal: 80, protein: 10.9, carbs: 0.8, fat: 4.7, fiber: 0.1 },
    { name: 'Tempe', category: 'protein_nabati', kcal: 201, protein: 20.8, carbs: 13.5, fat: 8.8, fiber: 1.4 },
    { name: 'Kacang Tanah', category: 'protein_nabati', kcal: 525, protein: 27.9, carbs: 17.4, fat: 42.7, fiber: 2.4 },
    { name: 'Kacang Hijau', category: 'protein_nabati', kcal: 323, protein: 22.2, carbs: 56.8, fat: 1.2, fiber: 7.6 },
    { name: 'Kacang Kedelai', category: 'protein_nabati', kcal: 381, protein: 34.9, carbs: 24.6, fat: 18.1, fiber: 4.2 },
    { name: 'Oncom', category: 'protein_nabati', kcal: 187, protein: 13.0, carbs: 22.6, fat: 6.0, fiber: 0.5 },
    // Sayuran
    { name: 'Bayam', category: 'sayuran', kcal: 36, protein: 3.5, carbs: 6.5, fat: 0.5, fiber: 2.2 },
    { name: 'Kangkung', category: 'sayuran', kcal: 29, protein: 3.0, carbs: 5.4, fat: 0.3, fiber: 2.0 },
    { name: 'Wortel', category: 'sayuran', kcal: 42, protein: 1.2, carbs: 9.3, fat: 0.3, fiber: 4.0 },
    { name: 'Kol/Kubis', category: 'sayuran', kcal: 24, protein: 1.4, carbs: 4.2, fat: 0.2, fiber: 0.9 },
    { name: 'Buncis', category: 'sayuran', kcal: 35, protein: 2.4, carbs: 7.7, fat: 0.2, fiber: 3.2 },
    { name: 'Terong', category: 'sayuran', kcal: 24, protein: 1.1, carbs: 5.7, fat: 0.2, fiber: 2.5 },
    { name: 'Labu Siam', category: 'sayuran', kcal: 26, protein: 0.6, carbs: 6.7, fat: 0.1, fiber: 0.6 },
    { name: 'Tomat', category: 'sayuran', kcal: 20, protein: 1.0, carbs: 4.2, fat: 0.3, fiber: 1.5 },
    { name: 'Timun', category: 'sayuran', kcal: 12, protein: 0.7, carbs: 2.7, fat: 0.1, fiber: 0.5 },
    { name: 'Sawi Hijau', category: 'sayuran', kcal: 22, protein: 2.3, carbs: 4.0, fat: 0.3, fiber: 1.2 },
    { name: 'Daun Singkong', category: 'sayuran', kcal: 73, protein: 6.8, carbs: 13.0, fat: 1.2, fiber: 1.2 },
    // Buah
    { name: 'Pisang Ambon', category: 'buah', kcal: 99, protein: 1.2, carbs: 25.8, fat: 0.2, fiber: 0.6 },
    { name: 'Pepaya', category: 'buah', kcal: 46, protein: 0.5, carbs: 12.2, fat: 0, fiber: 0.7 },
    { name: 'Jeruk Manis', category: 'buah', kcal: 45, protein: 0.9, carbs: 11.2, fat: 0.2, fiber: 0.4 },
    { name: 'Semangka', category: 'buah', kcal: 28, protein: 0.5, carbs: 6.9, fat: 0.2, fiber: 0.5 },
    { name: 'Melon', category: 'buah', kcal: 34, protein: 0.6, carbs: 7.7, fat: 0.4, fiber: 0.3 },
    { name: 'Apel Malang', category: 'buah', kcal: 58, protein: 0.3, carbs: 14.9, fat: 0.4, fiber: 0.7 },
    // Susu & Olahan
    { name: 'Susu UHT', category: 'susu_olahan', kcal: 61, protein: 3.2, carbs: 4.5, fat: 3.5, fiber: 0, note: 'per 100ml' },
    { name: 'Susu Kental Manis', category: 'susu_olahan', kcal: 336, protein: 8.2, carbs: 55, fat: 10, fiber: 0 },
    { name: 'Yogurt Plain', category: 'susu_olahan', kcal: 52, protein: 3.5, carbs: 6.0, fat: 1.5, fiber: 0, note: 'per 100ml' },
    // Bumbu
    { name: 'Bawang Merah', category: 'bumbu', kcal: 39, protein: 1.5, carbs: 9.2, fat: 0.3, fiber: 1.0 },
    { name: 'Bawang Putih', category: 'bumbu', kcal: 95, protein: 4.5, carbs: 23.1, fat: 0.2, fiber: 1.1 },
    { name: 'Cabai Merah', category: 'bumbu', kcal: 31, protein: 1.0, carbs: 7.3, fat: 0.3, fiber: 0.4 },
    { name: 'Jahe', category: 'bumbu', kcal: 51, protein: 1.5, carbs: 10.1, fat: 1.0, fiber: 2.0 },
    { name: 'Kunyit', category: 'bumbu', kcal: 63, protein: 2.0, carbs: 14.7, fat: 1.0, fiber: 2.0 },
    { name: 'Gula Pasir', category: 'bumbu', kcal: 364, protein: 0, carbs: 94, fat: 0, fiber: 0 },
    { name: 'Garam', category: 'bumbu', kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    // Minyak & Lemak
    { name: 'Minyak Goreng', category: 'minyak_lemak', kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 },
    { name: 'Santan Kelapa', category: 'minyak_lemak', kcal: 122, protein: 1.0, carbs: 2.5, fat: 12.2, fiber: 0, note: 'per 100ml' },
    { name: 'Mentega', category: 'minyak_lemak', kcal: 720, protein: 0.5, carbs: 0.4, fat: 81.6, fiber: 0 },
    { name: 'Margarin', category: 'minyak_lemak', kcal: 720, protein: 0.6, carbs: 0.4, fat: 81, fiber: 0 },
    { name: 'Minyak Kelapa', category: 'minyak_lemak', kcal: 870, protein: 0, carbs: 0, fat: 98, fiber: 0 }
];

const CATEGORY_LABELS = {
    karbohidrat: 'Karbohidrat',
    protein_hewani: 'Protein Hewani',
    protein_nabati: 'Protein Nabati',
    sayuran: 'Sayuran',
    buah: 'Buah',
    susu_olahan: 'Susu & Olahan',
    bumbu: 'Bumbu',
    minyak_lemak: 'Minyak & Lemak'
};

const CATEGORY_COLORS = {
    karbohidrat: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    protein_hewani: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    protein_nabati: { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200' },
    sayuran: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    buah: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    susu_olahan: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
    bumbu: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    minyak_lemak: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' }
};

// Planner state
let nMenuIngredients = []; // [{name, category, grams, kcal, protein, carbs, fat, fiber}, ...]
let nSelectedCategory = 'semua';
let nPendingIngredient = null;
let nNutritionChartInstance = null;

function initNutritionist() {
    document.getElementById('nutritionistLayout').classList.remove('hidden');
    // Set user info in sidebar
    const nameEl = document.getElementById('nUserName');
    const divEl = document.getElementById('nUserDivision');
    const avatarEl = document.getElementById('nUserAvatar');
    if (nameEl) nameEl.textContent = currentUser?.name || 'Ahli Gizi';
    if (divEl) divEl.textContent = currentUser?.division || 'Nutrisionis';
    if (avatarEl) {
        const initials = (currentUser?.name || 'AG').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        avatarEl.textContent = initials;
    }
    // Load saved state from localStorage
    nLoadPlannerState();
    // Render all tabs
    nRenderOverview();
    nRenderDatabase();
    nRecalcPlanner();
}

// --- Sidebar & Tab Navigation ---
function nToggleSidebar() {
    const sb = document.getElementById('nSidebar');
    const ol = document.getElementById('nSidebarOverlay');
    if (sb.classList.contains('-translate-x-full')) {
        sb.classList.remove('-translate-x-full');
        ol.classList.remove('hidden');
        setTimeout(() => ol.classList.remove('opacity-0'), 10);
    } else {
        sb.classList.add('-translate-x-full');
        ol.classList.add('opacity-0');
        setTimeout(() => ol.classList.add('hidden'), 300);
    }
}

function nSwitchTab(id) {
    document.querySelectorAll('.n-tab-pane').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('nTab-' + id);
    if (target) { target.classList.remove('hidden'); }
    // Close mobile sidebar
    if (window.innerWidth < 768) {
        document.getElementById('nSidebar').classList.add('-translate-x-full');
        const ol = document.getElementById('nSidebarOverlay');
        ol.classList.add('opacity-0');
        setTimeout(() => ol.classList.add('hidden'), 300);
    }
    // Active state
    document.querySelectorAll('.n-nav-item').forEach(el => el.classList.remove('active'));
    const btn = document.querySelector(`.n-nav-item[data-ntab="${id}"]`);
    if (btn) btn.classList.add('active');
    const titles = { overview: 'Ringkasan', planner: 'Meal Planner', database: 'Database Bahan' };
    document.getElementById('nPageTitle').textContent = titles[id] || id;
}

// --- OVERVIEW TAB ---
function nRenderOverview() {
    const today = new Date().toISOString().split('T')[0];
    const activeCount = logs.filter(l => l.date === today && l.type === 'IN').length;
    
    // Metrics
    const totalKcal = nMenuIngredients.reduce((s, i) => s + (i.kcal * i.grams / 100), 0);
    const portions = parseInt(document.getElementById('nPortions')?.value) || 250;
    const kcalPerPortion = nMenuIngredients.length > 0 ? Math.round(totalKcal / Math.max(portions, 1) * portions / Math.max(nMenuIngredients.reduce((s, i) => s + i.grams, 0) / 100, 1) ) : 0;
    
    document.getElementById('nMetricCalories').textContent = nMenuIngredients.length > 0 ? Math.round(nMenuIngredients.reduce((s, i) => s + (i.kcal * i.grams / 100), 0) / Math.max(nMenuIngredients.length, 1)) : '—';
    document.getElementById('nMetricBeneficiaries').textContent = portions;
    
    const targetKcal = 700; // target per porsi MBG
    if (nMenuIngredients.length > 0) {
        const perPortion = Math.round(totalKcal / Math.max(portions, 1));
        const pct = Math.round(perPortion / targetKcal * 100);
        document.getElementById('nMetricFulfillment').textContent = pct + '%';
        document.getElementById('nMetricFulfillmentDesc').textContent = `${perPortion} kkal / target ${targetKcal} kkal`;
    } else {
        document.getElementById('nMetricFulfillment').textContent = '—';
        document.getElementById('nMetricFulfillmentDesc').textContent = 'target vs realisasi';
    }

    // Focus text
    const focusEl = document.getElementById('nFocusText');
    const focusDesc = document.getElementById('nFocusDesc');
    if (nMenuIngredients.length > 0) {
        focusEl.textContent = 'Review & finalisasi menu';
        focusDesc.textContent = `Menu saat ini memiliki ${nMenuIngredients.length} bahan. Pastikan komposisi gizi memenuhi standar.`;
    } else {
        focusEl.textContent = 'Susun menu & validasi gizi';
        focusDesc.textContent = 'Siapkan perencanaan menu harian berdasarkan target porsi dan kebutuhan gizi.';
    }

    // Menu label
    const menuName = document.getElementById('nMenuName')?.value || '';
    document.getElementById('nMenuLabel').textContent = menuName || 'Belum ada menu';

    // Nutrition chart
    nRenderNutritionChart();
    
    // Daily summary
    nRenderDailySummary();
}

function nRenderNutritionChart() {
    const ctx = document.getElementById('nNutritionChart');
    if (!ctx) return;
    
    const totals = { protein: 0, carbs: 0, fat: 0, fiber: 0, kcal: 0 };
    nMenuIngredients.forEach(i => {
        const m = i.grams / 100;
        totals.protein += i.protein * m;
        totals.carbs += i.carbs * m;
        totals.fat += i.fat * m;
        totals.fiber += i.fiber * m;
        totals.kcal += i.kcal * m;
    });

    if (nNutritionChartInstance) nNutritionChartInstance.destroy();

    nNutritionChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Kalori (kkal)', 'Protein (g)', 'Karbo (g)', 'Lemak (g)', 'Serat (g)'],
            datasets: [{
                label: 'Total Menu',
                data: [totals.kcal.toFixed(1), totals.protein.toFixed(1), totals.carbs.toFixed(1), totals.fat.toFixed(1), totals.fiber.toFixed(1)],
                backgroundColor: ['#10b981', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6'],
                borderRadius: 8,
                borderSkipped: false,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11, family: 'Plus Jakarta Sans' } } },
                x: { grid: { display: false }, ticks: { font: { size: 11, family: 'Plus Jakarta Sans', weight: 600 } } }
            }
        }
    });
}

function nRenderDailySummary() {
    const el = document.getElementById('nDailySummaryGrid');
    if (!el) return;
    
    const portions = parseInt(document.getElementById('nPortions')?.value) || 250;
    const reserve = parseInt(document.getElementById('nReserve')?.value) || 10;
    const multiplier = 1 + reserve / 100;

    if (nMenuIngredients.length === 0) {
        // Default staple food estimates
        const defaults = [
            { name: 'Beras', grams: 120, unit: 'kg', icon: 'fa-seedling', color: 'text-amber-500' },
            { name: 'Protein', grams: 60, unit: 'kg', icon: 'fa-drumstick-bite', color: 'text-rose-500' },
            { name: 'Nabati', grams: 35, unit: 'kg', icon: 'fa-leaf', color: 'text-lime-500' },
            { name: 'Sayur', grams: 50, unit: 'kg', icon: 'fa-carrot', color: 'text-emerald-500' },
            { name: 'Buah', grams: 40, unit: 'kg', icon: 'fa-apple-alt', color: 'text-orange-500' },
            { name: 'Susu', grams: 200, unit: 'liter', icon: 'fa-glass-whiskey', color: 'text-sky-500' }
        ];
        el.innerHTML = defaults.map(d => {
            const total = (portions * d.grams * multiplier / 1000).toFixed(1);
            return `<div class="n-daily-item"><div class="${d.color} text-lg mb-1"><i class="fas ${d.icon}"></i></div><div class="text-xl font-extrabold text-slate-800">${total}</div><div class="text-[10px] font-semibold text-slate-400 uppercase">${d.unit} ${d.name}</div></div>`;
        }).join('');
    } else {
        // Group by category and show totals
        const byCategory = {};
        nMenuIngredients.forEach(i => {
            if (!byCategory[i.category]) byCategory[i.category] = 0;
            byCategory[i.category] += i.grams * portions * multiplier;
        });
        const catIcons = { karbohidrat: 'fa-seedling', protein_hewani: 'fa-drumstick-bite', protein_nabati: 'fa-leaf', sayuran: 'fa-carrot', buah: 'fa-apple-alt', susu_olahan: 'fa-glass-whiskey', bumbu: 'fa-pepper-hot', minyak_lemak: 'fa-oil-can' };
        const catColors = { karbohidrat: 'text-amber-500', protein_hewani: 'text-rose-500', protein_nabati: 'text-lime-500', sayuran: 'text-emerald-500', buah: 'text-orange-500', susu_olahan: 'text-sky-500', bumbu: 'text-red-500', minyak_lemak: 'text-yellow-500' };
        el.innerHTML = Object.entries(byCategory).map(([cat, grams]) => {
            const kg = (grams / 1000).toFixed(1);
            return `<div class="n-daily-item"><div class="${catColors[cat] || 'text-slate-500'} text-lg mb-1"><i class="fas ${catIcons[cat] || 'fa-box'}"></i></div><div class="text-xl font-extrabold text-slate-800">${kg}</div><div class="text-[10px] font-semibold text-slate-400 uppercase">kg ${CATEGORY_LABELS[cat] || cat}</div></div>`;
        }).join('');
    }
}

// --- FOOD DATABASE TAB ---
function nRenderDatabase() {
    const tbody = document.getElementById('nDbTableBody');
    const countEl = document.getElementById('nDbCount');
    if (!tbody) return;

    const search = (document.getElementById('nDbSearch')?.value || '').toLowerCase();
    const filtered = FOOD_DATABASE.filter(f => {
        const matchCat = nSelectedCategory === 'semua' || f.category === nSelectedCategory;
        const matchSearch = !search || f.name.toLowerCase().includes(search) || (CATEGORY_LABELS[f.category] || '').toLowerCase().includes(search);
        return matchCat && matchSearch;
    });

    if (countEl) countEl.textContent = `${filtered.length} bahan`;

    tbody.innerHTML = filtered.length > 0 ? filtered.map(f => {
        const cc = CATEGORY_COLORS[f.category] || {};
        const catLabel = CATEGORY_LABELS[f.category] || f.category;
        return `<tr class="cursor-pointer" onclick="nQuickAddFromDb('${f.name.replace(/'/g, "\\'")}')">
            <td class="px-5 py-3.5 font-semibold text-slate-800">${f.name}${f.note ? ` <span class="text-[10px] text-slate-400">(${f.note})</span>` : ''}</td>
            <td class="px-4 py-3.5 text-center"><span class="text-[10px] font-bold px-2 py-1 rounded-full ${cc.bg || ''} ${cc.text || ''} ${cc.border || ''} border">${catLabel}</span></td>
            <td class="px-4 py-3.5 text-center font-bold text-slate-700">${f.kcal}</td>
            <td class="px-4 py-3.5 text-center text-slate-600">${f.protein}g</td>
            <td class="px-4 py-3.5 text-center text-slate-600">${f.carbs}g</td>
            <td class="px-4 py-3.5 text-center text-slate-600">${f.fat}g</td>
            <td class="px-4 py-3.5 text-center text-slate-600">${f.fiber}g</td>
            <td class="px-4 py-3.5 text-center"><button onclick="event.stopPropagation(); nQuickAddFromDb('${f.name.replace(/'/g, "\\'")}')" class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition mx-auto"><i class="fas fa-plus text-xs"></i></button></td>
        </tr>`;
    }).join('') : `<tr><td colspan="8" class="text-center text-slate-400 py-10 text-sm">Tidak ada bahan makanan yang cocok.</td></tr>`;
}

function nFilterDatabase() { nRenderDatabase(); }

function nSetCategory(cat) {
    nSelectedCategory = cat;
    document.querySelectorAll('.n-cat-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === cat);
    });
    nRenderDatabase();
}

function nQuickAddFromDb(name) {
    const food = FOOD_DATABASE.find(f => f.name === name);
    if (!food) return;
    nPendingIngredient = food;
    const searchEl = document.getElementById('nAddIngredientSearch');
    if (searchEl) searchEl.value = food.name;
    document.getElementById('nIngredientDropdown')?.classList.add('hidden');
    // Switch to planner and add
    nSwitchTab('planner');
    nAddIngredientToMenu();
}

// --- MEAL PLANNER TAB ---
function nSearchIngredientForAdd(query) {
    const dropdown = document.getElementById('nIngredientDropdown');
    if (!dropdown) return;
    if (!query || query.length < 1) { dropdown.classList.add('hidden'); nPendingIngredient = null; return; }
    
    const q = query.toLowerCase();
    const results = FOOD_DATABASE.filter(f => f.name.toLowerCase().includes(q)).slice(0, 8);
    
    if (results.length === 0) { dropdown.classList.add('hidden'); return; }
    
    dropdown.innerHTML = results.map(f => {
        const cc = CATEGORY_COLORS[f.category] || {};
        return `<div onclick="nSelectIngredient('${f.name.replace(/'/g, "\\'")}')" class="px-4 py-2.5 hover:bg-emerald-50 cursor-pointer flex items-center justify-between transition">
            <div><span class="text-sm font-semibold text-slate-800">${f.name}</span><span class="ml-2 text-[10px] ${cc.text || 'text-slate-400'}">${CATEGORY_LABELS[f.category] || ''}</span></div>
            <span class="text-xs text-slate-400">${f.kcal} kkal</span>
        </div>`;
    }).join('');
    dropdown.classList.remove('hidden');
}

function nSelectIngredient(name) {
    const food = FOOD_DATABASE.find(f => f.name === name);
    if (!food) return;
    nPendingIngredient = food;
    document.getElementById('nAddIngredientSearch').value = food.name;
    document.getElementById('nIngredientDropdown').classList.add('hidden');
}

function nAddIngredientToMenu() {
    if (!nPendingIngredient) {
        // Try to find from search value
        const sv = document.getElementById('nAddIngredientSearch')?.value || '';
        const found = FOOD_DATABASE.find(f => f.name.toLowerCase() === sv.toLowerCase());
        if (found) nPendingIngredient = found;
        else { showToast('Pilih bahan dari daftar terlebih dahulu', 'error'); return; }
    }
    
    const grams = parseInt(document.getElementById('nAddGrams')?.value) || 100;
    
    // Check duplicate
    const existing = nMenuIngredients.find(i => i.name === nPendingIngredient.name);
    if (existing) {
        existing.grams += grams;
    } else {
        nMenuIngredients.push({
            name: nPendingIngredient.name,
            category: nPendingIngredient.category,
            grams: grams,
            kcal: nPendingIngredient.kcal,
            protein: nPendingIngredient.protein,
            carbs: nPendingIngredient.carbs,
            fat: nPendingIngredient.fat,
            fiber: nPendingIngredient.fiber
        });
    }
    
    // Reset input
    document.getElementById('nAddIngredientSearch').value = '';
    document.getElementById('nAddGrams').value = 100;
    nPendingIngredient = null;
    
    nRecalcPlanner();
    nSavePlannerState();
    showToast(`${existing ? 'Menambah gram' : 'Ditambahkan'}: ${nMenuIngredients[nMenuIngredients.length - 1]?.name || 'bahan'}`);
}

function nRemoveIngredient(index) {
    nMenuIngredients.splice(index, 1);
    nRecalcPlanner();
    nSavePlannerState();
}

function nUpdateIngredientGrams(index, value) {
    const grams = parseInt(value) || 0;
    if (grams <= 0) { nRemoveIngredient(index); return; }
    nMenuIngredients[index].grams = grams;
    nRecalcPlanner();
    nSavePlannerState();
}

function nRecalcPlanner() {
    const listEl = document.getElementById('nMenuIngredientList');
    const calcEl = document.getElementById('nNutritionCalc');
    const shopEl = document.getElementById('nShoppingList');
    const countBadge = document.getElementById('nIngredientCountBadge');
    
    if (!listEl) return;
    
    const portions = Math.max(parseInt(document.getElementById('nPortions')?.value) || 1, 1);
    const reserve = Math.max(parseInt(document.getElementById('nReserve')?.value) || 0, 0);
    const multiplier = 1 + reserve / 100;
    
    // Ingredient count badge
    if (countBadge) countBadge.textContent = `${nMenuIngredients.length} item`;
    
    // Render ingredient list
    if (nMenuIngredients.length === 0) {
        listEl.innerHTML = '<div class="text-center text-slate-400 py-8 text-sm"><i class="fas fa-inbox text-2xl mb-2 block text-slate-300"></i>Belum ada bahan. Tambah dari database atau kolom di atas.</div>';
    } else {
        listEl.innerHTML = nMenuIngredients.map((item, i) => {
            const cc = CATEGORY_COLORS[item.category] || {};
            const itemKcal = (item.kcal * item.grams / 100).toFixed(0);
            return `<div class="n-ingredient-row" style="animation-delay:${i * 0.04}s">
                <div class="w-8 h-8 rounded-lg ${cc.bg || 'bg-slate-50'} ${cc.text || 'text-slate-500'} flex items-center justify-center text-xs flex-shrink-0"><i class="fas fa-circle text-[6px]"></i></div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold text-slate-800 truncate">${item.name}</div>
                    <div class="text-[10px] text-slate-400">${CATEGORY_LABELS[item.category] || ''} · ${itemKcal} kkal</div>
                </div>
                <input type="number" min="1" value="${item.grams}" onchange="nUpdateIngredientGrams(${i}, this.value)" class="w-16 text-center text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-lg py-1.5 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 outline-none transition">
                <span class="text-xs text-slate-400 w-5">g</span>
                <button onclick="nRemoveIngredient(${i})" class="w-8 h-8 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition flex-shrink-0"><i class="fas fa-trash-alt text-xs"></i></button>
            </div>`;
        }).join('');
    }
    
    // Calculate nutrition per portion
    const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    nMenuIngredients.forEach(i => {
        const m = i.grams / 100;
        totals.kcal += i.kcal * m;
        totals.protein += i.protein * m;
        totals.carbs += i.carbs * m;
        totals.fat += i.fat * m;
        totals.fiber += i.fiber * m;
    });
    
    if (calcEl) {
        const targetKcal = 700;
        const bars = [
            { label: 'Kalori', value: totals.kcal.toFixed(0), unit: 'kkal', pct: Math.min(totals.kcal / targetKcal * 100, 100), color: 'bg-emerald-500' },
            { label: 'Protein', value: totals.protein.toFixed(1), unit: 'g', pct: Math.min(totals.protein / 20 * 100, 100), color: 'bg-sky-500' },
            { label: 'Karbohidrat', value: totals.carbs.toFixed(1), unit: 'g', pct: Math.min(totals.carbs / 100 * 100, 100), color: 'bg-amber-500' },
            { label: 'Lemak', value: totals.fat.toFixed(1), unit: 'g', pct: Math.min(totals.fat / 25 * 100, 100), color: 'bg-red-500' },
            { label: 'Serat', value: totals.fiber.toFixed(1), unit: 'g', pct: Math.min(totals.fiber / 8 * 100, 100), color: 'bg-violet-500' }
        ];
        calcEl.innerHTML = bars.map(b => `
            <div>
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-semibold text-slate-600">${b.label}</span>
                    <span class="text-xs font-bold text-slate-800">${b.value} ${b.unit}</span>
                </div>
                <div class="n-nutrition-bar">
                    <div class="n-nutrition-bar-fill ${b.color}" style="width: ${b.pct}%"></div>
                </div>
            </div>
        `).join('');
    }
    
    // Shopping list
    if (shopEl) {
        if (nMenuIngredients.length === 0) {
            shopEl.innerHTML = '<div class="text-center text-slate-400 py-4 text-xs">Tambah bahan ke menu untuk melihat kebutuhan belanja.</div>';
        } else {
            shopEl.innerHTML = nMenuIngredients.map(item => {
                const totalGrams = item.grams * portions * multiplier;
                const display = totalGrams >= 1000 ? `${(totalGrams / 1000).toFixed(1)} kg` : `${Math.round(totalGrams)} g`;
                return `<div class="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-slate-50 border border-slate-100">
                    <span class="text-sm text-slate-700 font-medium">${item.name}</span>
                    <span class="text-sm font-bold text-emerald-700">${display}</span>
                </div>`;
            }).join('');
        }
    }
    
    // Update overview too
    nRenderOverview();
}

function nResetPlanner() {
    if (!confirm('Reset semua bahan dalam menu?')) return;
    nMenuIngredients = [];
    const nameEl = document.getElementById('nMenuName');
    if (nameEl) nameEl.value = '';
    const portionsEl = document.getElementById('nPortions');
    if (portionsEl) portionsEl.value = 250;
    const reserveEl = document.getElementById('nReserve');
    if (reserveEl) reserveEl.value = 10;
    nRecalcPlanner();
    nSavePlannerState();
    showToast('Menu direset');
}

// --- PERSISTENCE (localStorage) ---
function nSavePlannerState() {
    const state = {
        ingredients: nMenuIngredients,
        menuName: document.getElementById('nMenuName')?.value || '',
        portions: document.getElementById('nPortions')?.value || '250',
        reserve: document.getElementById('nReserve')?.value || '10',
        session: document.getElementById('nSession')?.value || 'pagi',
        savedAt: new Date().toISOString()
    };
    localStorage.setItem('mbg_nutrition_plan', JSON.stringify(state));
}

function nLoadPlannerState() {
    try {
        const raw = localStorage.getItem('mbg_nutrition_plan');
        if (!raw) return;
        const state = JSON.parse(raw);
        nMenuIngredients = state.ingredients || [];
        const nameEl = document.getElementById('nMenuName');
        if (nameEl && state.menuName) nameEl.value = state.menuName;
        const portionsEl = document.getElementById('nPortions');
        if (portionsEl && state.portions) portionsEl.value = state.portions;
        const reserveEl = document.getElementById('nReserve');
        if (reserveEl && state.reserve) reserveEl.value = state.reserve;
        const sessionEl = document.getElementById('nSession');
        if (sessionEl && state.session) sessionEl.value = state.session;
    } catch (e) { /* ignore */ }
}

// --- CLOUD SAVE ---
async function nSavePlannerToCloud() {
    const plan = {
        userId: currentUser?.id || '',
        username: currentUser?.u || '',
        name: currentUser?.name || '',
        division: currentUser?.division || '',
        menuName: document.getElementById('nMenuName')?.value || '',
        session: document.getElementById('nSession')?.value || 'pagi',
        portions: document.getElementById('nPortions')?.value || '250',
        reserve: document.getElementById('nReserve')?.value || '10',
        ingredients: nMenuIngredients,
        savedAt: new Date().toISOString()
    };
    
    const badge = document.getElementById('nSyncBadge');
    if (badge) {
        badge.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i> Menyimpan...';
        badge.className = 'inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200/60 px-3 py-1.5 rounded-full';
    }
    
    try {
        const resp = await callApi('saveNutritionistPlan', plan);
        if (resp.ok && resp.data?.status === 'success') {
            showToast('Menu berhasil disimpan ke cloud!');
            if (badge) {
                badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Tersimpan';
                badge.className = 'inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-3 py-1.5 rounded-full';
            }
        } else {
            throw new Error(resp.data?.message || 'Gagal simpan');
        }
    } catch (e) {
        showToast('Gagal menyimpan ke cloud: ' + e.message, 'error');
        if (badge) {
            badge.innerHTML = '<i class="fas fa-exclamation-circle text-xs"></i> Error';
            badge.className = 'inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200/60 px-3 py-1.5 rounded-full';
        }
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dd = document.getElementById('nIngredientDropdown');
    const searchEl = document.getElementById('nAddIngredientSearch');
    if (dd && searchEl && !dd.contains(e.target) && e.target !== searchEl) {
        dd.classList.add('hidden');
    }
});

// --- SPECIAL ROLE DASHBOARD (Akuntan, Gudang, Ka SPPG, Yayasan) ---
function initSpecialRoleDashboard() {
    document.getElementById('specialRoleLayout').classList.remove('hidden');
    renderSpecialRoleDashboard();
}

function renderSpecialRoleDashboard() {
    const title = document.getElementById('specialRoleTitle');
    const eyebrow = document.getElementById('specialRoleEyebrow');
    const desc = document.getElementById('specialRoleDesc');
    const label = document.getElementById('specialRoleCardLabel');
    const userName = document.getElementById('specialRoleUserName');
    const division = document.getElementById('specialRoleDivision');
    if (!title || !eyebrow || !desc || !label || !userName || !division) return;

    const currentRole = currentUser?.role || 'employee';
    const roleLabel = ROLE_LABELS[currentRole] || currentRole;
    eyebrow.innerText = `${roleLabel} Panel`;
    title.innerText = `Dashboard ${roleLabel}`;
    desc.innerText = `Halaman awal ${roleLabel} untuk operasional SPPG Yayasan. Modul detail akan ditambahkan berikutnya.`;
    label.innerText = roleLabel;
    userName.innerText = currentUser?.name || '-';
    division.innerText = currentUser?.division || '-';
}

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

function handleDivisionRolePreset(mode) {
    const divEl = document.getElementById(mode === 'edit' ? 'editEmpDiv' : 'newEmpDiv');
    const roleEl = document.getElementById(mode === 'edit' ? 'editEmpRole' : 'newEmpRole');
    if (!divEl || !roleEl) return;

    const presetRole = DIVISION_ROLE_PRESETS[divEl.value] || 'employee';
    roleEl.value = presetRole;
    roleEl.disabled = !!DIVISION_ROLE_PRESETS[divEl.value];
    roleEl.classList.toggle('opacity-60', roleEl.disabled);
    roleEl.classList.toggle('cursor-not-allowed', roleEl.disabled);

    if (mode === 'edit') toggleEditEmpCreds(roleEl.value);
    else toggleNewEmpCreds(roleEl.value);
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
function toggleNewEmpCreds(role) {
    const el = document.getElementById('newEmpCreds');
    const unameEl = document.getElementById('newEmpUsername');
    const pwdEl = document.getElementById('newEmpPassword');
    if (!el) return;
    if (String(role).toLowerCase() !== 'employee') {
        if (unameEl) unameEl.value = '';
        if (pwdEl) pwdEl.value = '';
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}
function toggleEditEmpCreds(role) {
    const el = document.getElementById('editEmpCreds');
    const unameEl = document.getElementById('editEmpUsername');
    const pwdEl = document.getElementById('editEmpPassword');
    if (!el) return;
    if (String(role).toLowerCase() !== 'employee') {
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
    const role = document.getElementById('newEmpRole').value;
    const salary = document.getElementById('newEmpSalary').value;
    const id = 'EMP-' + Math.floor(1000 + Math.random() * 9000);

    let payload = { id, name, division: div, salary, role };
    
    if (String(role).toLowerCase() !== 'employee') {
        const uname = document.getElementById('newEmpUsername').value.toLowerCase().trim();
        const pwd = document.getElementById('newEmpPassword').value.trim();
        if (uname) payload.username = uname;
        if (pwd) payload.password = pwd;
    }

    postData('addEmployee', payload);
    e.target.reset();
    const creds = document.getElementById('newEmpCreds'); if (creds) creds.classList.add('hidden');
    handleDivisionRolePreset('new');
}
function deleteEmployee() { if (!editingEmployeeId) return; if(confirm("Hapus data relawan ini?")) { employees = employees.filter(e => e.id !== editingEmployeeId); refreshUI(); closeEditEmployee(); postData('deleteEmployee', { id: editingEmployeeId }); } }
function submitEditEmployee(e) {
    e.preventDefault(); if (!editingEmployeeId) return;
    const name = document.getElementById('editEmpName').value;
    const div = document.getElementById('editEmpDiv').value;
    const role = document.getElementById('editEmpRole').value;
    const salary = document.getElementById('editEmpSalary').value;
    let payload = { id: editingEmployeeId, name: name, division: div, salary: salary, role: role };
    const oldEmp = employees.find(e => e.id === editingEmployeeId);
    if(oldEmp && oldEmp.photo) payload.photo = oldEmp.photo;

    if (String(role).toLowerCase() !== 'employee') {
        const uname = document.getElementById('editEmpUsername').value.toLowerCase().trim();
        const pwd = document.getElementById('editEmpPassword').value.trim();
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
    editingEmployeeId = id; document.getElementById('editEmpId').value = id; document.getElementById('editEmpName').value = emp.name; document.getElementById('editEmpDiv').value = emp.division; document.getElementById('editEmpRole').value = emp.role || 'employee'; document.getElementById('editEmpSalary').value = emp.salary;
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
    handleDivisionRolePreset('edit');
    if (!DIVISION_ROLE_PRESETS[emp.division]) {
        document.getElementById('editEmpRole').value = emp.role || 'employee';
        toggleEditEmpCreds(emp.role || 'employee');
    }
    document.getElementById('editEmployeeModal').classList.remove('hidden'); setTimeout(() => document.getElementById('editEmployeeModal').classList.remove('opacity-0'), 10);
}
function closeEditEmployee() { document.getElementById('editEmployeeModal').classList.add('opacity-0'); setTimeout(() => document.getElementById('editEmployeeModal').classList.add('hidden'), 300); editingEmployeeId = null; }
// ===== VOLUNTEER SELF-ATTENDANCE (Absensi Mandiri Relawan) =====
// Geofence config — set the center coordinates for your location
const GEOFENCE_CONFIG = {
    lat: -6.21973,    // Latitude titik pusat (ubah sesuai lokasi)
    lng: 106.87015,   // Longitude titik pusat (ubah sesuai lokasi)
    radius: 15          // Radius toleransi dalam meter
};

// Volunteer-specific state
let volScanStream = null;
let volFaceStream = null;
let volScannedEmployee = null;
let volCurrentFacingMode = 'user';
let volCurrentLocation = { lat: 0, lng: 0, alt: 0, str: 'Menunggu...' };
let volLocationLocked = false;
let volAbsenType = null; // 'IN' or 'OUT'
let volClockInterval = null;
let volGpsWatchId = null;
let volGuestMode = false; // true = akses dari tombol Absen Mandiri tanpa login

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function volUpdateGeofenceUI() {
    const bar = document.getElementById('volGeofenceBar');
    const txt = document.getElementById('volGeofenceText');
    if (!bar || !txt) return;

    if (!volLocationLocked) {
        bar.className = 'mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/15 border border-yellow-400/20 text-[10px] text-yellow-300 font-bold transition-all duration-300';
        txt.innerText = 'Geofence: Menunggu lokasi...';
        return;
    }

    const dist = haversineDistance(volCurrentLocation.lat, volCurrentLocation.lng, GEOFENCE_CONFIG.lat, GEOFENCE_CONFIG.lng);
    const isInside = dist <= GEOFENCE_CONFIG.radius;

    if (isInside) {
        bar.className = 'mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/20 text-[10px] text-emerald-300 font-bold transition-all duration-300';
        txt.innerText = `Geofence: Dalam area (${Math.round(dist)}m)`;
    } else {
        bar.className = 'mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-400/20 text-[10px] text-red-300 font-bold transition-all duration-300';
        txt.innerText = `Geofence: Di luar area (${Math.round(dist)}m dari dalam Dapur SPPG Rawa Bunga 1)`;
    }
    return isInside;
}

function volStartClockAndGPS() {
    // Live clock
    if (volClockInterval) clearInterval(volClockInterval);
    volClockInterval = setInterval(() => {
        const now = new Date();
        const timeEl = document.getElementById('volLiveTime');
        const dateEl = document.getElementById('volLiveDate');
        if (timeEl) timeEl.innerText = now.toLocaleTimeString('id-ID', { hour12: false });
        if (dateEl) dateEl.innerText = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        // Update watermark time preview
        const wmTime = document.getElementById('volWmTime');
        if (wmTime) wmTime.innerText = now.toLocaleTimeString('id-ID', { hour12: false }) + ' ' + now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }, 1000);

    // GPS watch
    if (volGpsWatchId) navigator.geolocation.clearWatch(volGpsWatchId);
    if (navigator.geolocation) {
        volGpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                volCurrentLocation = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    alt: pos.coords.altitude || 0,
                    str: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`
                };
                const locEl = document.getElementById('volLiveLoc');
                if (locEl) locEl.innerText = volCurrentLocation.str;
                const gpsEl = document.getElementById('volGpsStatus');
                if (gpsEl) gpsEl.innerHTML = '<span class="text-white">GPS Terkunci</span>';
                volLocationLocked = true;
                volUpdateGeofenceUI();
                // Update watermark location preview
                const wmLoc = document.getElementById('volWmLoc');
                if (wmLoc) wmLoc.innerText = `Lat: ${pos.coords.latitude.toFixed(5)} Lon: ${pos.coords.longitude.toFixed(5)} Alt: ${Math.round(pos.coords.altitude || 0)}m`;
            },
            (err) => {
                volLocationLocked = false;
                const locEl = document.getElementById('volLiveLoc');
                if (locEl) locEl.innerText = 'GPS Error';
                const gpsEl = document.getElementById('volGpsStatus');
                if (gpsEl) gpsEl.innerText = 'GPS Error';
                volUpdateGeofenceUI();
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    }
}

// Deteksi otomatis: harus Clock In atau Clock Out?
function volDetectAbsenType(empId) {
    if (!empId) return 'IN';
    const empLogs = logs.filter(l => String(l.empId) === String(empId))
        .sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
    const lastLog = empLogs.length > 0 ? empLogs[0] : null;
    if (!lastLog || lastLog.type === 'OUT') return 'IN';
    return 'OUT'; // Sudah Clock In, berarti selanjutnya Clock Out
}

function volUpdateAbsenButton(empId) {
    const btn = document.getElementById('volBtnAbsen');
    const icon = document.getElementById('volBtnAbsenIcon');
    const label = document.getElementById('volBtnAbsenLabel');
    if (!btn) return;

    const type = volDetectAbsenType(empId);
    if (type === 'OUT') {
        btn.className = 'w-full py-4 rounded-2xl bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-bold shadow-lg shadow-amber-600/30 transition active:scale-95 flex items-center justify-center gap-3 border-t border-white/20';
        if (icon) icon.className = 'fas fa-sign-out-alt text-lg';
        if (label) label.innerText = 'Absen Pulang';
    } else {
        btn.className = 'w-full py-4 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/30 transition active:scale-95 flex items-center justify-center gap-3 border-t border-white/20';
        if (icon) icon.className = 'fas fa-sign-in-alt text-lg';
        if (label) label.innerText = 'Absen Masuk';
    }
}

function volUpdateTodayStatus() {
    const infoEl = document.getElementById('volTodayInfo');
    if (!infoEl) return;
    // Di mode tamu, tidak bisa tampilkan status karena belum tahu siapa
    if (volGuestMode && !volScannedEmployee) {
        infoEl.innerHTML = 'Scan QR untuk mulai absen.';
        volUpdateAbsenButton(null);
        return;
    }
    const empId = volGuestMode ? volScannedEmployee?.id : currentUser?.id;
    if (!empId) { infoEl.innerHTML = 'Belum absen hari ini.'; volUpdateAbsenButton(null); return; }
    const today = new Date().toISOString().split('T')[0];
    const myLogs = logs.filter(l => String(l.empId) === String(empId) && l.date === today)
        .sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));

    if (myLogs.length === 0) {
        infoEl.innerHTML = 'Belum absen hari ini.';
        volUpdateAbsenButton(empId);
        return;
    }

    let html = myLogs.map(l => {
        const icon = l.type === 'IN' ? '🟢' : (l.type === 'OUT' ? '🔴' : '🟡');
        const label = l.type === 'IN' ? 'Masuk' : (l.type === 'OUT' ? 'Pulang' : 'Pending');
        return `<div>${icon} ${label} — ${l.time}</div>`;
    }).join('');
    infoEl.innerHTML = html;
    volUpdateAbsenButton(empId);
}

function initVolunteer() {
    // Hide all other layouts
    ['adminLayout', 'securityLayout', 'nutritionistLayout', 'specialRoleLayout'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.getElementById('volunteerLayout').classList.remove('hidden');

    const profileCard = document.getElementById('volProfileCard');

    if (volGuestMode) {
        // Mode tamu: sembunyikan kartu profil, tampilkan info umum
        if (profileCard) profileCard.classList.add('hidden');
    } else {
        // Mode login: tampilkan profil user
        if (profileCard) profileCard.classList.remove('hidden');
        if (currentUser) {
            const nameEl = document.getElementById('volProfileName');
            const divEl = document.getElementById('volProfileDiv');
            const shiftEl = document.getElementById('volProfileShift');
            const avatarEl = document.getElementById('volProfileAvatar');
            if (nameEl) nameEl.innerText = currentUser.name || currentUser.u || '-';
            if (divEl) divEl.innerText = currentUser.division || 'Relawan';
            if (shiftEl) {
                const st = getShiftTime(currentUser.division || '');
                shiftEl.innerHTML = `<i class="far fa-clock mr-1"></i>${st}`;
            }
            if (avatarEl && currentUser.photo) {
                const url = convertDriveUrl(currentUser.photo);
                avatarEl.innerHTML = `<img src="${url}" class="w-full h-full object-cover rounded-full" onerror="this.onerror=null;this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'">`;
            }
        }
    }

    volStartClockAndGPS();
    volUpdateTodayStatus();
    volShowPage('home');
}

function volShowPage(page) {
    ['volPageHome', 'volPageQR', 'volPageSelfie'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    if (page === 'home') document.getElementById('volPageHome')?.classList.remove('hidden');
    else if (page === 'qr') document.getElementById('volPageQR')?.classList.remove('hidden');
    else if (page === 'selfie') document.getElementById('volPageSelfie')?.classList.remove('hidden');
}

function volStartAbsen() {
    if (!volLocationLocked) return showToast('Tunggu GPS terkunci dulu!', 'error');

    // Check geofence
    const dist = haversineDistance(volCurrentLocation.lat, volCurrentLocation.lng, GEOFENCE_CONFIG.lat, GEOFENCE_CONFIG.lng);
    if (dist > GEOFENCE_CONFIG.radius) {
        return showToast(`Anda di luar area absensi (${Math.round(dist)}m). Maksimal ${GEOFENCE_CONFIG.radius}m.`, 'error');
    }

    // Di mode login, sudah tahu user-nya → langsung tentukan tipe
    if (!volGuestMode && currentUser) {
        volAbsenType = volDetectAbsenType(currentUser.id);
    } else {
        // Di mode tamu, tipe ditentukan setelah QR di-scan
        volAbsenType = null;
    }

    volScannedEmployee = null;
    volShowPage('qr');
    volStartQR();
}

function volStartQR() {
    const video = document.getElementById('volScanVideo');
    if (!video) return;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(stream => {
        volScanStream = stream;
        video.srcObject = stream;
        requestAnimationFrame(volScanLoop);
    }).catch(e => {
        console.error('Vol cam error', e);
        showToast('Gagal akses kamera', 'error');
    });
}

function volScanLoop() {
    if (volScannedEmployee) return;
    const video = document.getElementById('volScanVideo');
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        requestAnimationFrame(volScanLoop);
        return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code && code.data) {
        volValidateQR(code.data);
    } else {
        requestAnimationFrame(volScanLoop);
    }
}

function volValidateQR(data) {
    const emp = employees.find(e => e.id == data || e.name.toLowerCase() == data.toLowerCase());
    if (!emp) {
        showToast('QR tidak dikenali', 'error');
        requestAnimationFrame(volScanLoop);
        return;
    }

    // Mode login: hanya boleh scan QR milik sendiri
    if (!volGuestMode && currentUser && String(emp.id) !== String(currentUser.id)) {
        showToast('QR ini bukan milik Anda. Gunakan QR Code pribadi Anda.', 'error');
        requestAnimationFrame(volScanLoop);
        return;
    }

    volScannedEmployee = emp;
    if (volScanStream) volScanStream.getTracks().forEach(t => t.stop());

    // Auto-detect tipe absen berdasarkan log terakhir karyawan
    volAbsenType = volDetectAbsenType(emp.id);

    // Move to selfie page
    volShowPage('selfie');
    volPopulateSelfieInfo();
    volStartSelfie('user');
    // Enable submit after camera is ready
    setTimeout(() => {
        const btn = document.getElementById('volBtnSubmit');
        if (btn) btn.disabled = false;
    }, 1000);
}

function volPopulateSelfieInfo() {
    const nameEl = document.getElementById('volSelfieName');
    const divEl = document.getElementById('volSelfieDiv');
    const typeEl = document.getElementById('volSelfieType');
    const iconEl = document.getElementById('volSelfieTypeIcon');

    if (volScannedEmployee) {
        if (nameEl) nameEl.innerText = volScannedEmployee.name;
        if (divEl) divEl.innerText = volScannedEmployee.division;
    }
    if (volAbsenType === 'IN') {
        if (typeEl) { typeEl.innerText = 'ABSEN MASUK'; typeEl.className = 'text-[10px] font-bold text-white bg-emerald-500 px-2 py-0.5 rounded'; }
        if (iconEl) iconEl.innerHTML = '<i class="fas fa-sign-in-alt"></i>';
    } else {
        if (typeEl) { typeEl.innerText = 'ABSEN PULANG'; typeEl.className = 'text-[10px] font-bold text-white bg-amber-500 px-2 py-0.5 rounded'; }
        if (iconEl) iconEl.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
    }
}

function volStartSelfie(mode) {
    volCurrentFacingMode = mode;
    const video = document.getElementById('volFaceVideo');
    if (!video) return;
    if (volFaceStream) volFaceStream.getTracks().forEach(t => t.stop());
    navigator.mediaDevices.getUserMedia({
        video: { facingMode: volCurrentFacingMode, width: { ideal: 640 }, height: { ideal: 480 } }
    }).then(s => {
        volFaceStream = s;
        video.srcObject = s;
        video.style.transform = mode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
    }).catch(e => showToast('Gagal akses kamera selfie', 'error'));
}

function volToggleCamera() {
    const newMode = volCurrentFacingMode === 'user' ? 'environment' : 'user';
    volStartSelfie(newMode);
}

// --- Deteksi Wajah ---
async function detectFace(videoElement) {
    // Capture frame ke canvas sementara
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoElement.videoWidth || 320;
    tempCanvas.height = videoElement.videoHeight || 240;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(videoElement, 0, 0, tempCanvas.width, tempCanvas.height);

    // Coba FaceDetector API (Chrome/Edge/Android)
    if (window.FaceDetector) {
        try {
            const detector = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
            const faces = await detector.detect(tempCanvas);
            return faces.length > 0;
        } catch (e) {
            console.warn('FaceDetector error, fallback to skin detection', e);
        }
    }

    // Fallback: deteksi area warna kulit (skin-tone heuristic)
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    let skinPixels = 0;
    const totalPixels = tempCanvas.width * tempCanvas.height;
    // Fokus area tengah frame (50% tengah) dimana wajah biasa berada
    const x1 = Math.floor(tempCanvas.width * 0.25);
    const x2 = Math.floor(tempCanvas.width * 0.75);
    const y1 = Math.floor(tempCanvas.height * 0.05);
    const y2 = Math.floor(tempCanvas.height * 0.65);
    let regionPixels = 0;

    for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
            const i = (y * tempCanvas.width + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            regionPixels++;
            // Skin-tone detection (RGB rule-based)
            if (r > 95 && g > 40 && b > 20 &&
                r > g && r > b &&
                (r - g) > 15 &&
                Math.abs(r - g) > 15 &&
                (r - b) > 15) {
                skinPixels++;
            }
        }
    }

    const skinRatio = skinPixels / regionPixels;
    return skinRatio > 0.12; // Minimal 12% area tengah = warna kulit
}

async function volSubmitSelfie() {
    if (!volScannedEmployee) return showToast('Scan QR terlebih dahulu', 'error');
    if (!volLocationLocked) return showToast('Tunggu GPS terkunci!', 'error');

    // Deteksi wajah sebelum lanjut
    const volVideo = document.getElementById('volFaceVideo');
    if (volVideo) {
        try {
            const faceFound = await detectFace(volVideo);
            if (!faceFound) {
                return showToast('Wajah tidak terdeteksi! Pastikan wajah terlihat jelas di kamera.', 'error');
            }
        } catch (e) {
            console.warn('Face detection skip:', e);
        }
    }

    // Re-check geofence at submit time
    const dist = haversineDistance(volCurrentLocation.lat, volCurrentLocation.lng, GEOFENCE_CONFIG.lat, GEOFENCE_CONFIG.lng);
    if (dist > GEOFENCE_CONFIG.radius) {
        return showToast(`Anda di luar area absensi (${Math.round(dist)}m).`, 'error');
    }

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Validate attendance logic
    const empLogs = logs.filter(l => String(l.empId) === String(volScannedEmployee.id))
        .sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
    const lastLog = empLogs.length > 0 ? empLogs[0] : null;

    if (volAbsenType === 'IN') {
        if (lastLog && lastLog.type === 'IN') {
            showToast('Sesi masih aktif! Anda sudah Absen Masuk.', 'error');
            volCancelFlow();
            return;
        }
    }
    if (volAbsenType === 'OUT') {
        if (!lastLog || lastLog.type === 'OUT') {
            showToast('Belum Absen Masuk!', 'error');
            volCancelFlow();
            return;
        }
    }

    let overtimeHours = 0;
    let lateMinutes = 0;
    let finalType = volAbsenType;
    let forcedTime = null;
    let toastMsg = 'Absen Berhasil!';

    if (volAbsenType === 'IN') {
        const divConfig = appConfig.shifts[volScannedEmployee.division];
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
                    toastMsg = `Telat ${diffMin}m (Toleransi).`;
                } else {
                    finalType = 'PENDING';
                    toastMsg = 'Menunggu Konfirmasi Admin.';
                }
            }
        }
    }

    if (volAbsenType === 'OUT') {
        const divConfig = appConfig.shifts[volScannedEmployee.division];
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
            toastMsg = `Out After: ${overtimeHours} Hours`;
        }
    }

    // Capture photo with watermark
    const video = document.getElementById('volFaceVideo');
    const canvas = document.getElementById('volSnapCanvas');
    if (!canvas || !video) return;
    canvas.width = 400;
    canvas.height = 533;
    const ctx = canvas.getContext('2d');
    if (volCurrentFacingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Reset transform for watermark drawing
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Draw watermark bar at bottom
    const barH = 50;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, canvas.height - barH, canvas.width, barH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    const timeStr = now.toLocaleTimeString('id-ID', { hour12: false }) + '  ' + now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    ctx.fillText(timeStr, 10, canvas.height - barH + 18);

    ctx.font = '10px monospace';
    const locStr = `Lat: ${volCurrentLocation.lat.toFixed(5)}  Lon: ${volCurrentLocation.lng.toFixed(5)}  Alt: ${Math.round(volCurrentLocation.alt)}m`;
    ctx.fillText(locStr, 10, canvas.height - barH + 34);

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = volAbsenType === 'IN' ? '#34d399' : '#fbbf24';
    ctx.fillText(volAbsenType === 'IN' ? 'ABSEN MASUK' : 'ABSEN PULANG', canvas.width - 110, canvas.height - barH + 18);

    const photoBase64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];

    const payload = {
        empId: volScannedEmployee.id,
        name: volScannedEmployee.name,
        type: finalType,
        overtime: overtimeHours,
        location: volCurrentLocation.str,
        image: photoBase64,
        date: today,
        lateMinutes: lateMinutes,
        forcedTime: forcedTime,
        note: '',
        absentBy: 'Mandiri'
    };

    if (finalType === 'PENDING') {
        pendingAttendancePayload = payload;
        document.getElementById('lateNoteInput').value = '';
        document.getElementById('lateAlertModal').classList.remove('hidden');
        setTimeout(() => document.getElementById('lateAlertModal').classList.remove('opacity-0'), 10);
        return;
    }

    const success = await postData('attendance', payload);
    if (success) {
        toggleLoader(false);
        showToast(toastMsg, 'success');
        volCancelFlow();
        // Refresh data to update today status
        await fetchData(true);
        volUpdateTodayStatus();
    }
}

function volCancelFlow() {
    volScannedEmployee = null;
    volAbsenType = null;
    if (volScanStream) { volScanStream.getTracks().forEach(t => t.stop()); volScanStream = null; }
    if (volFaceStream) { volFaceStream.getTracks().forEach(t => t.stop()); volFaceStream = null; }
    const btn = document.getElementById('volBtnSubmit');
    if (btn) btn.disabled = true;
    volShowPage('home');
    volUpdateTodayStatus();
}

// --- Fungsi untuk masuk mode Absen Mandiri dari halaman login (tanpa akun) ---
async function startAbsenMandiri() {
    volGuestMode = true;
    // Ambil data karyawan dari server dulu
    toggleLoader(true, 'Memuat data...');
    try {
        const res = await fetch(SCRIPT_URL + '?action=getData');
        const data = await res.json();
        if (data.status === 'success') {
            employees = data.employees || [];
            logs = data.logs || [];
            if (data.config) {
                if (data.config.overtimeRate) appConfig.overtimeRate = parseInt(data.config.overtimeRate) || appConfig.overtimeRate;
                if (data.config.shifts) appConfig.shifts = data.config.shifts;
            }
        }
    } catch (e) {
        console.warn('Fetch data for mandiri failed', e);
    }
    toggleLoader(false);

    // Sembunyikan login, tampilkan volunteer layout
    document.getElementById('loginView').classList.add('hidden');
    initVolunteer();
}

// Tombol keluar dari volunteer (kembali ke login)
function volExitToLogin() {
    // Kalau mode tamu, langsung balik ke login
    if (volGuestMode) {
        volGuestMode = false;
        volScannedEmployee = null;
        volAbsenType = null;
        if (volScanStream) { volScanStream.getTracks().forEach(t => t.stop()); volScanStream = null; }
        if (volFaceStream) { volFaceStream.getTracks().forEach(t => t.stop()); volFaceStream = null; }
        if (volClockInterval) { clearInterval(volClockInterval); volClockInterval = null; }
        if (volGpsWatchId) { navigator.geolocation.clearWatch(volGpsWatchId); volGpsWatchId = null; }
        volLocationLocked = false;
        document.getElementById('volunteerLayout').classList.add('hidden');
        document.getElementById('loginView').classList.remove('hidden', 'opacity-0', 'pointer-events-none');
    } else {
        // Mode login biasa, panggil logout standar
        logout();
    }
}

function showToast(msg, type='success') {
    const t = document.getElementById('toast'); const i = document.getElementById('toastIcon'); document.getElementById('toastMsg').innerText = msg;
    if(type === 'error') { i.className = "w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-xs"; i.innerHTML = '<i class="fas fa-times"></i>'; } 
    else { i.className = "w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs"; i.innerHTML = '<i class="fas fa-check"></i>'; }
    t.classList.remove('-translate-y-[200%]', 'opacity-0'); setTimeout(() => t.classList.add('-translate-y-[200%]', 'opacity-0'), 6000); 
}