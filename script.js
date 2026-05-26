// --- KONFIGURASI UTAMA ---
// Paste URL Google Apps Script kamu di sini (Wajib)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzKvbFqw3AA15B7TCUbTRg5RbVPJIiffYW73vBIT6Levj5MC0HgKXnKu87rdjiryfie/exec"; 

const DIVISION_ROLE_PRESETS = {
    'Keamanan': 'security',
    'Ahli Gizi': 'nutritionist',
    'Akuntan': 'accountant',
    'Admin Gudang': 'admin_warehouse',
    'Gudang': 'warehouse',
    'Ka SPPG': 'head_sppg',
    'Yayasan': 'foundation',
    'Admin Yayasan': 'foundation'
};

const ROLE_LABELS = {
    admin: 'Admin',
    employee: 'Relawan Biasa',
    security: 'Security',
    nutritionist: 'Ahli Gizi',
    accountant: 'Akuntan',
    admin_warehouse: 'Admin Gudang',
    warehouse: 'Gudang',
    head_sppg: 'Ka SPPG',
    foundation: 'Yayasan'
};

// Pagination Settings
let logsCurrentPage = 1;
const LOGS_PER_PAGE = 10;
let allLogsSorted = [];

function inferRoleFromDivision(division) {
    const normalized = String(division || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (normalized.includes('keamanan')) return 'security';
    if (normalized.includes('ahli gizi') || normalized.includes('ahligizi')) return 'nutritionist';
    if (normalized.includes('akuntan')) return 'accountant';
    if (normalized.includes('admin gudang')) return 'admin_warehouse';
    if (normalized.includes('gudang')) return 'warehouse';
    if (normalized.includes('ka sppg') || normalized.includes('kasppg')) return 'head_sppg';
    if (normalized.includes('admin yayasan')) return 'foundation';
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
    shifts: {},
    disableLate: false,
    disableEarly: false,
    disableBoth: false,
    disableLateReason: '',
    disableEarlyReason: '',
    disableBothReason: '',
    disableGeofence: false,
    hideOvertime: false
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
let sessionTimer = null;
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 menit

// Camera & Geo State
let scanStream = null, faceStream = null, scanInterval = null;
let scannedEmployee = null;
let currentFacingMode = 'user';
let currentLocation = "Lokasi Tidak Terdeteksi";
let isLocationLocked = false;
let activeWorkerTimer = null; 

// --- HELPER FUNCTIONS ---

// Helper: Local date string YYYY-MM-DD (avoid toISOString UTC bug)
function getLocalDateStr(d) {
    d = d || new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

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

        // Check if session has expired (30 min since last activity)
        const sessionStart = parseInt(localStorage.getItem('mbg_session_start') || '0');
        if (sessionStart && (Date.now() - sessionStart > SESSION_TIMEOUT)) {
            localStorage.removeItem('mbg_user');
            localStorage.removeItem('mbg_session_start');
            currentUser = null;
            showToast('Sesi habis. Silakan login ulang.', 'error');
            return;
        }

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
                startSessionTimer();
            }).catch(() => {
                localStorage.removeItem('mbg_user');
                showToast('Gagal validasi session security. Silakan login ulang.', 'error');
            });
        } else {
            document.getElementById('loginView').classList.add('hidden');
            fetchData(true);
            if (currentUser.role === 'nutritionist') initNutritionist();
            else if (['accountant', 'warehouse', 'head_sppg', 'foundation'].includes(currentUser.role)) initSpecialRoleDashboard();
            else if (currentUser.role === 'employee' || currentUser.role === 'admin_warehouse') initVolunteer();
            else initAdmin();
            startSessionTimer();
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

// Global flag untuk track apakah sedang dalam proses login
let isLoginInProgress = false;

function setLoginLoading(loading) {
    const btn = document.getElementById('loginBtn');
    const text = document.getElementById('loginBtnText');
    const loader = document.getElementById('loginBtnLoader');
    if (!btn || !text || !loader) return;
    if (loading) {
        btn.disabled = true;
        btn.classList.add('cursor-wait');
        text.classList.add('opacity-0', 'scale-90');
        loader.classList.remove('opacity-0', 'scale-90', 'pointer-events-none');
        loader.classList.add('opacity-100', 'scale-100');
    } else {
        btn.disabled = false;
        btn.classList.remove('cursor-wait');
        text.classList.remove('opacity-0', 'scale-90');
        loader.classList.add('opacity-0', 'scale-90', 'pointer-events-none');
        loader.classList.remove('opacity-100', 'scale-100');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('usernameInput').value.toLowerCase().trim();
    const p = document.getElementById('passwordInput').value;

    if(SCRIPT_URL.includes("GANTI_DENGAN") || SCRIPT_URL === "") {
        return alert("PENTING: Edit file script.js baris ke-3, masukkan URL Google Script Anda!");
    }

    setLoginLoading(true);

    // Semua login melalui server (code.gs) — satu jalur aman
    const resp = await callApi('login', { username: u, password: p });
    if (!resp.ok || !resp.data) {
        setLoginLoading(false);
        return showToast('Gagal terhubung ke server. Periksa koneksi internet.', 'error');
    }

    if (resp.data.status === 'success') {
        const user = resp.data.user || { u: u, role: 'employee' };
        currentUser = user;
        localStorage.setItem('mbg_user', JSON.stringify(user));

        // Mark login in progress
        isLoginInProgress = true;

        // Fade out login view
        document.getElementById('loginView').classList.add('opacity-0', 'pointer-events-none');
        setLoginLoading(false);
        
        // Wait for login fade out, then show loading animation
        setTimeout(async () => {
            document.getElementById('loginView').classList.add('hidden');
            
            // Explicitly show loader for login flow
            toggleLoader(true, "Mempersiapkan Dashboard...");
            
            // Fetch data and init dashboard
            await fetchData(true);
            if (user.role === 'security') initSecurity();
            else if (user.role === 'nutritionist') initNutritionist();
            else if (['accountant', 'warehouse', 'head_sppg', 'foundation'].includes(user.role)) initSpecialRoleDashboard();
            else if (user.role === 'employee' || user.role === 'admin_warehouse') initVolunteer();
            else initAdmin();
            
            // Show success animation before hiding loader
            showLoaderSuccess("Berhasil Masuk");
            
            // Mark login complete
            isLoginInProgress = false;
            startSessionTimer();
        }, 500);

        const remember = document.getElementById('rememberMe')?.checked;
        if (remember) localStorage.setItem('remembered_username', u); else localStorage.removeItem('remembered_username');
    } else {
        setLoginLoading(false);
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
        await forceLogout();
    }
}

async function forceLogout() {
    clearTimeout(sessionTimer);
    if (currentUser && currentUser.role === 'security') {
        try {
            await callApi('securityLogout', { username: currentUser.u || '' });
        } catch (e) {
            console.warn('securityLogout failed', e);
        }
    }
    localStorage.removeItem('mbg_user');
    localStorage.removeItem('mbg_session_start');
    location.reload();
}

function startSessionTimer() {
    clearTimeout(sessionTimer);
    localStorage.setItem('mbg_session_start', Date.now().toString());
    sessionTimer = setTimeout(() => {
        showToast('Sesi habis. Silakan login ulang.', 'error');
        setTimeout(() => forceLogout(), 1500);
    }, SESSION_TIMEOUT);
}

function resetSessionTimer() {
    if (!currentUser) return;
    clearTimeout(sessionTimer);
    localStorage.setItem('mbg_session_start', Date.now().toString());
    sessionTimer = setTimeout(() => {
        showToast('Sesi habis. Silakan login ulang.', 'error');
        setTimeout(() => forceLogout(), 1500);
    }, SESSION_TIMEOUT);
}

// Reset timer on user activity
['click', 'keydown', 'touchstart', 'scroll'].forEach(evt =>
    document.addEventListener(evt, resetSessionTimer, { passive: true })
);

// --- CLOUD OPERATIONS ---
function toggleLoader(show, text="Menghubungkan...") {
    const el = document.getElementById('globalLoader');
    const loaderContent = document.getElementById('loaderContent');
    const loaderSuccess = document.getElementById('loaderSuccess');
    const textEl = document.getElementById('loaderText');
    const progEl = document.getElementById('loaderProgress');
    
    if(show) {
        textEl.innerText = text;
        // Reset success state
        loaderSuccess.classList.add('opacity-0', 'scale-75');
        loaderSuccess.classList.remove('opacity-100', 'scale-100');
        loaderContent.classList.remove('opacity-0', 'scale-75');
        loaderContent.classList.add('opacity-100', 'scale-100');
        
        el.classList.remove('hidden');
        // Show progress bar if text contains upload keywords
        if (text.includes('Upload') || text.includes('Sinkronisasi') || text.includes('foto')) {
            progEl?.classList.remove('hidden');
        } else {
            progEl?.classList.add('hidden');
        }
        // Smooth entrance animation with scale and opacity
        setTimeout(() => {
            el.classList.remove('opacity-0', 'scale-95');
            el.classList.add('opacity-100', 'scale-100');
        }, 50);
    } else {
        // Smooth exit animation
        el.classList.add('opacity-0', 'scale-95');
        el.classList.remove('opacity-100', 'scale-100');
        setTimeout(() => {
            el.classList.add('hidden');
            progEl?.classList.add('hidden');
        }, 500);
    }
}

// Show loader with success animation before hiding
function showLoaderSuccess(successMsg = "Berhasil!") {
    const el = document.getElementById('globalLoader');
    const loaderContent = document.getElementById('loaderContent');
    const loaderSuccess = document.getElementById('loaderSuccess');
    const loaderSuccessMsg = document.getElementById('loaderSuccessMsg');
    
    // If loader is hidden or in transition, just show toast
    if (el.classList.contains('hidden')) {
        showToast(successMsg, "success");
        return;
    }
    
    // Set custom success message
    loaderSuccessMsg.innerText = successMsg;
    
    // Fade out loading content
    loaderContent.classList.add('opacity-0', 'scale-75');
    loaderContent.classList.remove('opacity-100', 'scale-100');
    
    // Fade in success content
    setTimeout(() => {
        loaderSuccess.classList.remove('opacity-0', 'scale-75');
        loaderSuccess.classList.add('opacity-100', 'scale-100');
    }, 200);
    
    // Hide loader after 1.8 seconds
    setTimeout(() => {
        toggleLoader(false);
    }, 1800);
}

// --- Inline sync button animation (Clay Design) ---
let _syncingButton = null;
function setSyncButtonLoading(btn, loading) {
    if (!btn) return;
    const icon = btn.querySelector('i.fas, svg');
    if (loading) {
        btn.disabled = true;
        btn.classList.add('pointer-events-none', 'animate-pulse');
        _syncingButton = btn;
        btn._origHTML = btn.innerHTML;
        btn._origClasses = btn.className;
        
        // Apply clay loading style
        btn.classList.add('bg-emerald-50', 'dark:bg-emerald-900/20', 'border-emerald-300', 'dark:border-emerald-700/50');
        btn.classList.remove('hover:border-blue-300', 'hover:text-blue-600', 'hover:bg-blue-50', 'text-slate-600', 'text-slate-500');
        btn.classList.add('text-emerald-600', 'dark:text-emerald-400');
        
        const isSmall = btn.classList.contains('w-8') || btn.classList.contains('w-9') || btn.classList.contains('w-10');
        if (isSmall) {
            btn.innerHTML = '<svg class="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" class="opacity-30"></circle><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="opacity-100"></path></svg>';
        } else {
            btn.innerHTML = '<svg class="w-3.5 h-3.5 animate-spin text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" class="opacity-30"></circle><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="opacity-100"></path></svg> <span class="hidden md:inline text-xs font-semibold">Syncing...</span>';
        }
    } else {
        btn.disabled = false;
        btn.classList.remove('pointer-events-none', 'animate-pulse');
        // Restore original styling
        if (btn._origClasses) {
            btn.className = btn._origClasses;
        }
        _syncingButton = null;
    }
}

function showSyncSuccess(btn) {
    if (!btn) return;
    const isSmall = btn.classList.contains('w-8') || btn.classList.contains('w-9') || btn.classList.contains('w-10');
    const prevClasses = btn.className;
    
    // Apply clay success style with animation
    btn.classList.remove('animate-pulse', 'bg-emerald-50', 'text-emerald-600', 'border-emerald-300');
    btn.classList.add('bg-emerald-100', 'dark:bg-emerald-900/40', 'border-emerald-400', 'dark:border-emerald-600/70', 'text-emerald-700', 'dark:text-emerald-300', 'scale-110');
    
    if (isSmall) {
        btn.innerHTML = '<i class="fas fa-check text-xs font-bold"></i>';
    } else {
        btn.innerHTML = '<i class="fas fa-check text-sm font-bold"></i> <span class="hidden md:inline text-xs font-bold">Berhasil</span>';
    }
    
    setTimeout(() => {
        btn.className = prevClasses;
        if (btn._origHTML) btn.innerHTML = btn._origHTML;
        delete btn._origHTML;
        delete btn._origClasses;
    }, 1800);
}

async function fetchData(force = false) {
    // Find which sync button was clicked (if manual)
    const triggerBtn = force ? (_syncingButton || document.getElementById('adminSyncBtn') || document.querySelector('[onclick*="fetchData(true)"]')) : null;
    
    if (force && triggerBtn) {
        if (!triggerBtn.disabled) setSyncButtonLoading(triggerBtn, true);
    } else {
        toggleLoader(true, "Sinkronisasi Data...");
    }
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
                    appConfig.disableLate = data.config.disableLate === true || data.config.disableLate === 'true';
                    appConfig.disableEarly = data.config.disableEarly === true || data.config.disableEarly === 'true';
                    appConfig.disableBoth = data.config.disableBoth === true || data.config.disableBoth === 'true';
                    appConfig.disableLateReason = data.config.disableLateReason || '';
                    appConfig.disableEarlyReason = data.config.disableEarlyReason || '';
                    appConfig.disableBothReason = data.config.disableBothReason || '';
                    appConfig.disableGeofence = data.config.disableGeofence === true || data.config.disableGeofence === 'true';
                    appConfig.hideOvertime = data.config.hideOvertime === true || data.config.hideOvertime === 'true';
                }

                refreshUI();
                autoClockOutForgotten(); // Auto OUT relawan yang lupa
                if (force && triggerBtn) {
                    setSyncButtonLoading(triggerBtn, false);
                    showSyncSuccess(triggerBtn);
                } else if (!isLoginInProgress) {
                    // Hanya tampilkan success jika tidak sedang login
                    // Saat login, success akan ditampilkan dari handleLogin
                    showLoaderSuccess("Data Disinkronisasi");
                } else {
                    // Sedang login, hide loader tanpa success animation
                    toggleLoader(false);
                }
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
    if (force && triggerBtn) {
        setSyncButtonLoading(triggerBtn, false);
        if (triggerBtn._origHTML) { triggerBtn.innerHTML = triggerBtn._origHTML; delete triggerBtn._origHTML; }
    } else {
        toggleLoader(false);
    }
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
                    const val = dataObj[k];
                    form.append(k, (typeof val === 'object') ? JSON.stringify(val) : String(val));
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
                const val = dataObj[k];
                form.append(k, (typeof val === 'object') ? JSON.stringify(val) : String(val));
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
        if (!document.getElementById('globalLoader').classList.contains('hidden')) {
            showLoaderSuccess("Data Berhasil Disimpan");
        } else {
            toggleLoader(false);
        }
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

    const today = getLocalDateStr();
    const todayLogs = logs.filter(l => l.date === today);
    const present = todayLogs.filter(l => l.type === 'IN').length;
    
    // Hitung Late Count
    const lateCount = todayLogs.filter(l => l.lateMinutes > 0).length;
    
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
    allLogsSorted = sortedLogs; // Store for pagination
    const logBody = document.getElementById('logsTableBody');
    
    // Calculate pagination
    const totalPages = Math.ceil(sortedLogs.length / LOGS_PER_PAGE);
    const startIdx = (logsCurrentPage - 1) * LOGS_PER_PAGE;
    const endIdx = startIdx + LOGS_PER_PAGE;
    const paginatedLogs = sortedLogs.slice(startIdx, endIdx);
    
    // Update pagination display
    document.getElementById('currentPage').innerText = logsCurrentPage;
    document.getElementById('totalPages').innerText = totalPages || 1;
    
    // Render pagination numbers
    renderPaginationNumbers(logsCurrentPage, totalPages);
    
    // Disable/enable buttons
    document.querySelector('button[onclick="previousLogsPage()"]').disabled = logsCurrentPage === 1;
    document.querySelector('button[onclick="nextLogsPage()"]').disabled = logsCurrentPage === totalPages;
    
    logBody.innerHTML = paginatedLogs.map(l => {
        let badge = '', statusText = '';
        
        if (l.type === 'IN') {
            badge = 'bg-emerald-100 text-emerald-700';
            statusText = 'IN';
        } else if (l.type === 'OUT') {
            const hasEarlyNote = l.note && l.note.includes('[Pulang');
            badge = hasEarlyNote ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';
            statusText = 'OUT';
        } else if (l.type === 'REJECTED') {
            badge = 'bg-slate-200 text-slate-500 line-through';
            statusText = 'DITOLAK';
        } else {
            badge = 'bg-slate-100 text-slate-500';
            statusText = l.type;
        }

        let actionArea = `<span class="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${badge}">${statusText}</span>`;
        if (l.type === 'IN' && l.lateMinutes >= 5) {
            actionArea = `<div class="flex flex-col items-center gap-0.5">
                <span class="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-red-100 text-red-600">TELAT</span>
                <span class="text-[9px] text-red-400">${formatDuration(l.lateMinutes)}</span>
            </div>`;
        }
        if (l.type === 'OUT' && l.note && l.note.includes('[Pulang')) {
            actionArea = `<div class="flex flex-col items-center gap-0.5">
                <span class="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-purple-100 text-purple-600">PULANG AWAL</span>
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
        let overtimeInfo = (l.overtime > 0 && !appConfig.hideOvertime) ? `<span class="text-amber-600 font-bold">${l.overtime} Jam</span>` : '-';
        
        let lateInfo = '-';
        if (l.note && l.note.includes('[Bebas')) {
            lateInfo = `<div class="text-[9px] text-blue-500 font-semibold mt-1 italic max-w-[120px] truncate" title="${l.note}"><i class="fas fa-shield-alt mr-0.5"></i>${l.note.includes('[Bebas Masuk]') ? 'Bebas Masuk' : 'Bebas Pulang'}</div>`;
        } else if (l.lateMinutes > 0) {
            lateInfo = `<span class="text-red-500 font-bold text-[10px]">${formatDuration(l.lateMinutes)}</span>`;
            if (l.note) {
                lateInfo += `<div class="text-[9px] text-slate-400 mt-1 italic max-w-[100px] truncate" title="${l.note}">"${l.note}"</div>`;
            }
        } else if (l.type === 'OUT' && l.note && l.note.includes('[Pulang')) {
            lateInfo = `<div class="text-[9px] text-amber-500 mt-1 italic max-w-[100px] truncate" title="${l.note}">"${l.note}"</div>`;
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
    const logIndex = logs.findIndex(l => l.row == row);
    if(!confirm(`Konfirmasi status menjadi ${newStatus}?`)) return;
    if(logIndex !== -1) {
        logs[logIndex].type = newStatus;
        refreshUI();
    }
    await postData('confirmAttendance', { row: row, newStatus: newStatus });
}

async function deleteAttendanceLog(row, name) {
    if (!confirm(`Hapus data absensi ${name} pada baris ini?\nAbsensi akan dihapus dan tidak dihitung gaji.`)) return;
    const logIndex = logs.findIndex(l => l.row == row);
    if (logIndex !== -1) {
        logs.splice(logIndex, 1);
        refreshUI();
        renderViolationsTab();
    }
    await postData('deleteAttendance', { row: row });
}

async function rejectViolation(empId, date, name) {
    if (!confirm(`Tolak absensi ${name} pada ${date}?\nSemua data absen (Masuk & Pulang) di hari itu akan dihapus dan tidak dihitung gaji.`)) return;
    // Remove all logs for this empId + date locally
    const toRemove = logs.filter(l => String(l.empId) === String(empId) && l.date === date);
    toRemove.forEach(l => {
        const idx = logs.indexOf(l);
        if (idx !== -1) logs.splice(idx, 1);
    });
    refreshUI();
    renderViolationsTab();
    // Server-side: delete all rows for empId + date
    await postData('deleteAttendanceByEmpDate', { empId: empId, date: date });
}

async function confirmViolation(empId, date, name) {
    if (!confirm(`Konfirmasi absensi ${name} pada ${date}?\nAbsensi tetap dihitung gaji. Data pelanggaran tetap tercatat.`)) return;
    // Mark as confirmed by adding [OK] prefix to note — keep lateMinutes & note data visible
    const related = logs.filter(l => String(l.empId) === String(empId) && l.date === date);
    related.forEach(l => {
        if ((l.type === 'IN' && l.lateMinutes >= 5) || (l.type === 'OUT' && l.note && l.note.includes('[Pulang'))) {
            if (!l.note.includes('[OK]')) l.note = '[OK] ' + (l.note || '');
        }
    });
    refreshUI();
    renderViolationsTab();
    await postData('confirmViolation', { empId: empId, date: date });
}

// --- VIOLATIONS TAB (Pelanggaran) ---
function toggleViolationMenu(menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    const wasHidden = menu.classList.contains('hidden');
    closeAllViolationMenus();
    if (wasHidden) menu.classList.remove('hidden');
}
function closeAllViolationMenus() {
    document.querySelectorAll('[id^="vMenu_"]').forEach(el => el.classList.add('hidden'));
}
document.addEventListener('click', function(e) {
    if (!e.target.closest('[id^="vMenu_"]') && !e.target.closest('button[onclick*="toggleViolationMenu"]')) {
        closeAllViolationMenus();
    }
});

function renderViolationsTab() {
    const body = document.getElementById('violationsTableBody');
    const emptyEl = document.getElementById('violationsEmpty');
    if (!body) return;

    const filter = document.getElementById('violationFilter')?.value || 'all';
    const monthVal = document.getElementById('violationMonth')?.value || '';
    const sortVal = document.getElementById('violationSort')?.value || 'newest';

    // Identify violations: late IN (>=30 min) or early OUT (note starts with [Pulang)
    // Exclude [Bebas] entries — those are admin-approved free attendance
    const allowedEmpIds = new Set(
        employees
            .filter(e => ['employee', 'security', 'foundation'].includes(e.role || 'employee'))
            .map(e => String(e.id))
    );
    let violations = [];
    logs.forEach(l => {
        if (!allowedEmpIds.has(String(l.empId))) return;
        if (l.note && l.note.includes('[Bebas')) return;
        let vType = null;
        let duration = 0;
        if (l.type === 'IN' && l.lateMinutes >= 5) {
            vType = 'late';
            duration = l.lateMinutes;
        } else if (l.type === 'OUT' && l.note && l.note.includes('[Pulang')) {
            vType = 'early';
            const match = l.note.match(/\[Pulang (\d+) mnt/);
            duration = match ? parseInt(match[1]) : 0;
        }
        if (vType) violations.push({ ...l, vType, duration });
    });

    // Filter by type
    if (filter === 'late') violations = violations.filter(v => v.vType === 'late');
    if (filter === 'early') violations = violations.filter(v => v.vType === 'early');

    // Filter by month
    if (monthVal) {
        violations = violations.filter(v => v.date && v.date.startsWith(monthVal));
    }

    // Per-employee aggregation
    const empStats = {};
    violations.forEach(v => {
        const key = String(v.empId);
        if (!empStats[key]) empStats[key] = { name: v.name, empId: v.empId, lateCount: 0, earlyCount: 0 };
        if (v.vType === 'late') empStats[key].lateCount++;
        if (v.vType === 'early') empStats[key].earlyCount++;
    });

    // Sorting
    if (sortVal === 'newest') {
        violations.sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
    } else if (sortVal === 'name_asc') {
        violations.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortVal === 'most_late') {
        violations.sort((a, b) => (empStats[String(b.empId)]?.lateCount || 0) - (empStats[String(a.empId)]?.lateCount || 0));
    } else if (sortVal === 'most_early') {
        violations.sort((a, b) => (empStats[String(b.empId)]?.earlyCount || 0) - (empStats[String(a.empId)]?.earlyCount || 0));
    }

    // Stats
    const lateCount = violations.filter(v => v.vType === 'late').length;
    const earlyCount = violations.filter(v => v.vType === 'early').length;
    const peopleCount = Object.keys(empStats).length;
    const statLate = document.getElementById('violStatLate');
    const statEarly = document.getElementById('violStatEarly');
    const statTotal = document.getElementById('violStatTotal');
    const statPeople = document.getElementById('violStatPeople');
    if (statLate) statLate.innerText = lateCount;
    if (statEarly) statEarly.innerText = earlyCount;
    if (statTotal) statTotal.innerText = violations.length;
    if (statPeople) statPeople.innerText = peopleCount;

    // Per-employee summary
    const summarySection = document.getElementById('violationSummarySection');
    const summaryGrid = document.getElementById('violationSummaryGrid');
    if (summaryGrid && summarySection) {
        const empList = Object.values(empStats).sort((a, b) => (b.lateCount + b.earlyCount) - (a.lateCount + a.earlyCount));
        if (empList.length > 0) {
            summarySection.classList.remove('hidden');
            summaryGrid.innerHTML = empList.map(e => `
                <div class="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-100">
                    <span class="font-bold text-xs text-slate-700 truncate mr-2">${e.name}</span>
                    <div class="flex gap-2 shrink-0">
                        ${e.lateCount > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600">${e.lateCount} Telat</span>` : ''}
                        ${e.earlyCount > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-600">${e.earlyCount} Awal</span>` : ''}
                    </div>
                </div>
            `).join('');
        } else {
            summarySection.classList.add('hidden');
        }
    }

    if (violations.length === 0) {
        body.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        body.closest('.overflow-x-auto')?.classList.add('hidden');
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    body.closest('.overflow-x-auto')?.classList.remove('hidden');

    body.innerHTML = violations.map(v => {
        let typeBadge;
        if (v.vType === 'late') {
            typeBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-600">TERLAMBAT</span>';
        } else {
            if (v.duration <= 90) {
                typeBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-600">PULANG AWAL</span>';
            } else {
                typeBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-600">PULANG AWAL</span>';
            }
        }
        const durationText = v.duration > 0 ? formatDuration(v.duration) : '-';
        const durationColor = v.vType === 'late' ? 'text-red-500' : (v.duration > 90 ? 'text-red-500' : 'text-purple-500');
        const noteText = (v.note || '-').replace(/^\[OK\]\s*/, '');
        const safeEmpId = String(v.empId).replace(/'/g, "\\'");
        const safeDate = (v.date || '').replace(/'/g, "\\'");
        const safeName = (v.name || '').replace(/'/g, "\\'");
        const isConfirmed = (v.note || '').includes('[OK]');

        let actionHtml;
        if (isConfirmed) {
            const menuId = `vMenu_${safeEmpId}_${safeDate}`.replace(/[^a-zA-Z0-9_]/g, '_');
            actionHtml = `<div class="relative inline-block">
                <button onclick="toggleViolationMenu('${menuId}')" class="bg-slate-100 hover:bg-slate-200 text-slate-600 w-8 h-8 rounded-lg text-xs shadow-sm transition flex items-center justify-center mx-auto" title="Opsi">
                    <i class="fas fa-pen text-[10px]"></i>
                </button>
                <div id="${menuId}" class="hidden absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-100 z-50 py-1 min-w-[120px]">
                    <button onclick="rejectViolation('${safeEmpId}', '${safeDate}', '${safeName}'); closeAllViolationMenus()" class="w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition flex items-center gap-2">
                        <i class="fas fa-trash-alt text-[10px]"></i> Hapus Absen
                    </button>
                </div>
            </div>`;
        } else {
            actionHtml = `<div class="flex gap-1.5 justify-center">
                <button onclick="confirmViolation('${safeEmpId}', '${safeDate}', '${safeName}')" class="bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition flex items-center gap-1" title="Konfirmasi (tetap hitung gaji)">
                    <i class="fas fa-check text-[9px]"></i> OK
                </button>
                <button onclick="rejectViolation('${safeEmpId}', '${safeDate}', '${safeName}')" class="bg-red-500 hover:bg-red-600 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition flex items-center gap-1" title="Tolak (hapus absen hari itu)">
                    <i class="fas fa-times text-[9px]"></i> Tolak
                </button>
            </div>`;
        }

        return `<tr class="${isConfirmed ? 'bg-emerald-50/50' : 'bg-white'} hover:bg-slate-50 transition">
            <td class="px-4 py-3">
                <div class="font-bold text-slate-700 text-xs">${v.date}</div>
                <div class="text-[10px] text-slate-400">${v.time}</div>
            </td>
            <td class="px-4 py-3 font-bold text-slate-700 text-xs">${v.name}${isConfirmed ? ' <span class="text-[9px] text-emerald-500 font-bold"><i class="fas fa-check-circle"></i> OK</span>' : ''}</td>
            <td class="px-4 py-3 text-center">${typeBadge}</td>
            <td class="px-4 py-3 text-center">
                <span class="font-bold text-xs ${durationColor}">${durationText}</span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate" title="${noteText}">${noteText}</td>
            <td class="px-4 py-3 text-center">${actionHtml}</td>
        </tr>`;
    }).join('');
}

// --- RENDER SALARY & REPORTS ---
function onSalaryDateChange(changedInputId) {
    let tglMulai = document.getElementById('salaryTglMulai')?.value || '';
    let tglSelesai = document.getElementById('salaryTglSelesai')?.value || '';
    
    if (changedInputId === 'mulai' && tglMulai) {
        const d = new Date(tglMulai + 'T00:00:00');
        d.setDate(d.getDate() + 13);
        tglSelesai = getLocalDateStr(d);
        document.getElementById('salaryTglSelesai').value = tglSelesai;
    } else if (changedInputId === 'selesai' && tglSelesai) {
        const d = new Date(tglSelesai + 'T00:00:00');
        d.setDate(d.getDate() - 13);
        tglMulai = getLocalDateStr(d);
        document.getElementById('salaryTglMulai').value = tglMulai;
    }
    
    // Sync to cetakModal
    const cetakMulai = document.getElementById('cetakTglMulai');
    const cetakSelesai = document.getElementById('cetakTglSelesai');
    if (cetakMulai) cetakMulai.value = tglMulai;
    if (cetakSelesai) cetakSelesai.value = tglSelesai;
    
    _updateFotoInfoBadge();
    renderSalary();
}

function renderSalary(filteredLogsOverride) {
    const body = document.getElementById('salaryTableBody');
    const detailBody = document.getElementById('overtimeDetailBody');
    const lateDetailBody = document.getElementById('lateDetailBody'); 
    
    const dailyHeaderEl = document.getElementById('dailySalaryTableHeader');
    const dailyBodyEl = document.getElementById('dailySalaryTableBody');
    
    // Initialize date inputs if they are empty
    const tglMulaiInput = document.getElementById('salaryTglMulai');
    const tglSelesaiInput = document.getElementById('salaryTglSelesai');
    
    if (tglMulaiInput && !tglMulaiInput.value) {
        const today = new Date();
        const twoWeeksAgo = new Date(today);
        twoWeeksAgo.setDate(today.getDate() - 13);
        tglMulaiInput.value = getLocalDateStr(twoWeeksAgo);
    }
    if (tglSelesaiInput && !tglSelesaiInput.value) {
        tglSelesaiInput.value = getLocalDateStr(new Date());
    }
    
    const tglMulai = tglMulaiInput?.value || '';
    const tglSelesai = tglSelesaiInput?.value || '';
    
    // Sync to print modal
    const cetakMulai = document.getElementById('cetakTglMulai');
    const cetakSelesai = document.getElementById('cetakTglSelesai');
    if (cetakMulai && !cetakMulai.value) cetakMulai.value = tglMulai;
    if (cetakSelesai && !cetakSelesai.value) cetakSelesai.value = tglSelesai;

    // Generate day list for the 14 daily columns
    const dates = [];
    const dayNames = [];
    const dateNumbers = [];
    const start = new Date(tglMulai + 'T00:00:00');
    const daysIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    
    for (let i = 0; i < 14; i++) {
        const curr = new Date(start);
        curr.setDate(start.getDate() + i);
        const dateStr = getLocalDateStr(curr);
        dates.push(dateStr);
        dayNames.push(daysIndo[curr.getDay()]);
        dateNumbers.push(curr.getDate());
    }

    // Render 2-row table headers for the Daily Table
    if (dailyHeaderEl) {
        let row1 = `
        <tr>
            <th rowspan="2" class="border-r border-b border-slate-200 p-3 w-10 text-center align-middle">No</th>
            <th rowspan="2" class="border-r border-b border-slate-200 p-3 text-left align-middle min-w-[120px]">Divisi</th>
            <th rowspan="2" class="border-r border-b border-slate-200 p-3 text-left align-middle min-w-[150px]">Nama Relawan</th>
            <th colspan="14" class="border-r border-b border-slate-200 p-2 text-center align-middle bg-blue-50 text-blue-700 font-extrabold uppercase tracking-wider text-[10px]">Absensi Harian (2 Minggu)</th>
            <th rowspan="2" class="border-r border-b border-slate-200 p-3 text-right align-middle min-w-[140px]">Honoranium Sukarelawan</th>
            <th rowspan="2" class="border-r border-b border-slate-200 p-3 text-right align-middle min-w-[100px] text-slate-500">Iuran BPJS</th>
            <th rowspan="2" class="border-r border-b border-slate-200 p-3 text-right align-middle min-w-[80px] text-slate-500">TK</th>
            <th rowspan="2" class="border-r border-b border-slate-200 p-3 text-right align-middle min-w-[80px] text-slate-500">PJ</th>
            <th rowspan="2" class="border-b border-slate-200 p-3 text-right align-middle min-w-[140px] text-blue-600 font-extrabold bg-blue-50/50">Total Upah</th>
        </tr>`;
        
        let row2 = `<tr>`;
        for (let i = 0; i < 14; i++) {
            const isWeekend = dayNames[i] === 'Minggu' || dayNames[i] === 'Sabtu';
            const textClass = isWeekend ? 'text-rose-600 font-bold' : 'text-slate-700 font-medium';
            row2 += `
            <th class="border-r border-b border-slate-200 p-1.5 text-center align-middle text-[9px] min-w-[45px] bg-slate-50/30">
                <div class="${textClass}">${dayNames[i]}</div>
                <div class="text-[10px] font-bold text-slate-500 mt-0.5">${dateNumbers[i]}</div>
            </th>`;
        }
        row2 += `</tr>`;
        dailyHeaderEl.innerHTML = row1 + row2;
    }

    const useLogs = filteredLogsOverride || logs;
    let overtimeDetailsHtml = '';
    let lateDetailsHtml = ''; 
    
    // Filter logs that are within the selected range
    const periodLogs = (tglMulai && tglSelesai) 
        ? useLogs.filter(l => l.date >= tglMulai && l.date <= tglSelesai) 
        : useLogs;
    
    let salaryData = employees
        .filter(e => ['employee', 'security', 'foundation'].includes(e.role || 'employee'))
        .map(e => {
        const empLogs = periodLogs.filter(l => l.empId === e.id);
        const allLogsOfEmp = useLogs.filter(l => l.empId === e.id); // For details which might extend
        
        // Count days where employee has IN (each unique IN date = 1 work day)
        const inDates = new Set(empLogs.filter(l => l.type === 'IN').map(l => l.date));
        const days = inDates.size;
        
        let totalOvertimeHours = 0;
        let totalLateCount = 0; 
        
        // Detail Lembur
        allLogsOfEmp.filter(l => l.type === 'OUT' && l.overtime > 0 && (!tglMulai || (l.date >= tglMulai && l.date <= tglSelesai))).forEach(l => {
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
        allLogsOfEmp.filter(l => l.type === 'IN' && l.lateMinutes > 0 && (!tglMulai || (l.date >= tglMulai && l.date <= tglSelesai))).forEach(l => {
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

        // Daily salaries for the 14 columns
        const dailySalaries = dates.map(dateStr => {
            return inDates.has(dateStr) ? parseInt(e.salary) : 0;
        });
        const honoranium = dailySalaries.reduce((sum, val) => sum + val, 0);
        const bpjs = 16800;
        const tk = 0;
        const pj = 0;
        const totalUpah = honoranium;
        
        return { 
            ...e, 
            days, 
            totalOvertimeHours, 
            totalLateCount, 
            total,
            dailySalaries,
            honoranium,
            bpjs,
            tk,
            pj,
            totalUpah
        };
    });
    
    if(detailBody) detailBody.innerHTML = overtimeDetailsHtml || '<tr><td colspan="6" class="p-4 text-center text-slate-400">Belum ada data lembur</td></tr>';
    if(lateDetailBody) lateDetailBody.innerHTML = lateDetailsHtml || '<tr><td colspan="5" class="p-4 text-center text-slate-400">Belum ada data keterlambatan</td></tr>';

    const criteria = sortState['salary'];
    if (criteria === 'name_asc') salaryData.sort((a, b) => a.name.localeCompare(b.name));
    if (criteria === 'total_desc') salaryData.sort((a, b) => b.total - a.total);
    if (criteria === 'days_desc') salaryData.sort((a, b) => b.days - a.days);

    // Render Table v1 (printed)
    if (body) {
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

        // Total footer row
        const totalDays = salaryData.reduce((s, e) => s + e.days, 0);
        const totalOT = salaryData.reduce((s, e) => s + e.totalOvertimeHours, 0);
        const totalLate = salaryData.reduce((s, e) => s + e.totalLateCount, 0);
        const grandTotal = salaryData.reduce((s, e) => s + e.total, 0);
        body.innerHTML += `
        <tr class="bg-slate-100 border-t-2 border-slate-300 break-inside-avoid">
            <td colspan="2" class="p-4 text-right font-extrabold text-slate-700 text-sm uppercase tracking-wider">Total Keseluruhan</td>
            <td class="p-4 text-center font-extrabold text-slate-700 text-sm">${totalDays} Hari</td>
            <td class="p-4 text-center font-bold ${totalLate > 0 ? 'text-red-500' : 'text-slate-400'}">${totalLate}x</td>
            <td class="p-4 text-center font-extrabold text-amber-600 text-sm">${totalOT} Jam</td>
            <td class="p-4 text-right font-extrabold text-blue-700 text-lg">Rp ${grandTotal.toLocaleString()}</td>
        </tr>`;
    }

    // Render Table Harian 2 Minggu (web-only, no-print)
    if (dailyBodyEl) {
        // Group by division
        const groups = {};
        salaryData.forEach(item => {
            const div = item.division || 'Lainnya';
            if (!groups[div]) groups[div] = [];
            groups[div].push(item);
        });

        // Define custom division order (Case-Insensitive)
        const getDivisionSortIndex = (divName) => {
            const norm = String(divName || '').toLowerCase().trim().replace(/\s+/g, ' ');
            if (norm.includes('asisten lapangan') || norm.includes('aslap')) return 0;
            if (norm.includes('koordinasi lapangan') || norm.includes('kordinasi lapangan')) return 1;
            if (norm.includes('leader helper cook')) return 2;
            if (norm.includes('helper cook')) return 3;
            if (norm.includes('chef')) return 4;
            if (norm.includes('cook')) return 5;
            if (norm.includes('leader packing')) return 6;
            if (norm.includes('packing')) return 7;
            if (norm.includes('kenek')) return 9;
            if (norm.includes('distribusi')) return 8;
            if (norm.includes('leader ompreng')) return 10;
            if (norm.includes('ompreng')) return 11;
            if (norm.includes('keamanan')) return 12;
            if (norm.includes('kebersihan')) return 13;
            if (norm.includes('admin gudang')) return 14;
            if (norm.includes('gudang')) return 15;
            return 999;
        };

        const sortedDivisions = Object.keys(groups).sort((a, b) => {
            const idxA = getDivisionSortIndex(a);
            const idxB = getDivisionSortIndex(b);
            if (idxA !== idxB) return idxA - idxB;
            return a.localeCompare(b);
        });

        let rowsHtml = '';
        let globalIndex = 0;

        sortedDivisions.forEach(divName => {
            const groupMembers = groups[divName];
            const K = groupMembers.length;

            groupMembers.forEach((item, memberIdx) => {
                globalIndex++;
                let dailyCellsHtml = '';
                for (let dIdx = 0; dIdx < 14; dIdx++) {
                    const val = item.dailySalaries[dIdx];
                    const cellContent = val > 0 
                        ? `<span class="text-emerald-600 font-extrabold">${val.toLocaleString()}</span>` 
                        : `<span class="text-slate-300">-</span>`;
                    dailyCellsHtml += `<td class="border-r border-slate-200 p-1.5 text-center font-mono text-[10px]">${cellContent}</td>`;
                }

                // Divisi cell is only rendered on the first row of the group with rowspan=K
                const divisionCellHtml = memberIdx === 0 
                    ? `<td rowspan="${K}" class="border-r border-slate-200 p-2 font-bold text-slate-700 bg-slate-50/50 align-middle text-center">${divName}</td>`
                    : '';

                rowsHtml += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 break-inside-avoid text-[11px] bg-white">
                    <td class="border-r border-slate-200 p-2 text-center text-slate-400 font-mono">${globalIndex}</td>
                    ${divisionCellHtml}
                    <td class="border-r border-slate-200 p-2 font-bold text-slate-700">${item.name}</td>
                    ${dailyCellsHtml}
                    <td class="border-r border-slate-200 p-2 text-right font-extrabold text-slate-800">Rp ${item.honoranium.toLocaleString()}</td>
                    <td class="border-r border-slate-200 p-2 text-right text-slate-500">Rp 16.800</td>
                    <td class="border-r border-slate-200 p-2 text-right text-slate-400">Rp 0</td>
                    <td class="border-r border-slate-200 p-2 text-right text-slate-400">Rp 0</td>
                    <td class="p-2 text-right font-extrabold text-blue-700 bg-blue-50/20">Rp ${item.totalUpah.toLocaleString()}</td>
                </tr>`;
            });
        });

        dailyBodyEl.innerHTML = rowsHtml;

        // Grand Total row for Daily Table
        const dailyTotals = Array(14).fill(0);
        salaryData.forEach(item => {
            for (let dIdx = 0; dIdx < 14; dIdx++) {
                dailyTotals[dIdx] += item.dailySalaries[dIdx];
            }
        });

        const grandHonoranium = salaryData.reduce((s, item) => s + item.honoranium, 0);
        const grandBpjs = salaryData.length * 16800;
        const grandTk = 0;
        const grandPj = 0;
        const grandTotalUpah = grandHonoranium;

        let footerDailyCells = '';
        for (let dIdx = 0; dIdx < 14; dIdx++) {
            const val = dailyTotals[dIdx];
            const content = val > 0 ? val.toLocaleString() : '-';
            footerDailyCells += `<td class="border-r border-slate-200 p-1.5 text-center font-extrabold text-slate-700 text-[10px]">${content}</td>`;
        }

        dailyBodyEl.innerHTML += `
        <tr class="bg-slate-100 border-t-2 border-slate-300 break-inside-avoid text-[11px]">
            <td colspan="3" class="border-r border-slate-200 p-2.5 text-right font-extrabold text-slate-700 uppercase tracking-wider">Total Keseluruhan</td>
            ${footerDailyCells}
            <td class="border-r border-slate-200 p-2.5 text-right font-extrabold text-slate-800">Rp ${grandHonoranium.toLocaleString()}</td>
            <td class="border-r border-slate-200 p-2.5 text-right font-extrabold text-slate-500">Rp ${grandBpjs.toLocaleString()}</td>
            <td class="border-r border-slate-200 p-2.5 text-right font-extrabold text-slate-400">Rp 0</td>
            <td class="border-r border-slate-200 p-2.5 text-right font-extrabold text-slate-400">Rp 0</td>
            <td class="p-2.5 text-right font-extrabold text-blue-700 bg-blue-100/50">Rp ${grandTotalUpah.toLocaleString()}</td>
        </tr>`;
    }
}

// --- CETAK REKAP GAJI (Print with Kop Surat) ---
function openCetakModal() {
    const modal = document.getElementById('cetakModal');
    // Grab current dates from Laporan Gaji tab to ensure they are synchronized
    const tglMulai = document.getElementById('salaryTglMulai')?.value || '';
    const tglSelesai = document.getElementById('salaryTglSelesai')?.value || '';
    
    if (tglMulai) document.getElementById('cetakTglMulai').value = tglMulai;
    if (tglSelesai) document.getElementById('cetakTglSelesai').value = tglSelesai;
    
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
    // Update info jumlah foto setiap kali tanggal berubah
    _updateFotoInfoBadge();
    document.getElementById('cetakTglMulai').addEventListener('change', _updateFotoInfoBadge);
    document.getElementById('cetakTglSelesai').addEventListener('change', _updateFotoInfoBadge);
    document.getElementById('chkSertakanFoto').addEventListener('change', _updateFotoInfoBadge);
}

function _updateFotoInfoBadge() {
    const tglMulai  = document.getElementById('cetakTglMulai')?.value || '';
    const tglSelesai = document.getElementById('cetakTglSelesai')?.value || '';
    const withPhoto  = document.getElementById('chkSertakanFoto')?.checked;
    const badge      = document.getElementById('fotoInfoBadge');
    const countEl    = document.getElementById('fotoInfoCount');
    if (!badge || !countEl) return;
    if (!withPhoto) { badge.classList.add('hidden'); return; }
    const filtered = (tglMulai && tglSelesai)
        ? logs.filter(l => l.date >= tglMulai && l.date <= tglSelesai)
        : logs;
    const fotoCount = filtered.filter(l => l.photo && typeof l.photo === 'string' && l.photo.startsWith('http')).length;
    countEl.textContent = fotoCount;
    badge.classList.toggle('hidden', fotoCount === 0);
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

// Helper: generate official filename
function generateRekapFilename(ext, specificStart, specificEnd) {
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const tglMulai = specificStart || document.getElementById('cetakTglMulai')?.value || document.getElementById('salaryTglMulai')?.value || '';
    const tglSelesai = specificEnd || document.getElementById('cetakTglSelesai')?.value || document.getElementById('salaryTglSelesai')?.value || '';
    let periode;
    if (tglMulai && tglSelesai) {
        const dM = new Date(tglMulai + 'T00:00:00');
        const dS = new Date(tglSelesai + 'T00:00:00');
        periode = `${dM.getDate()}-${bulan[dM.getMonth()]}-${dM.getFullYear()}_sd_${dS.getDate()}-${bulan[dS.getMonth()]}-${dS.getFullYear()}`;
    } else {
        const now = new Date();
        periode = `${bulan[now.getMonth()]}-${now.getFullYear()}`;
    }
    return `Rekap_Gaji_SPPG_Rawa_Bunga_1_${periode}.${ext}`;
}

function buildRekapWorkbook(tglMulai, tglSelesai) {
    const allowedRoles = ['employee', 'security', 'foundation'];
    const allowedEmployees = employees.filter(e => allowedRoles.includes(e.role || 'employee'));
    const allowedEmpIds = new Set(allowedEmployees.map(e => String(e.id)));

    // Generate day list for the 14 columns
    const dates = [];
    const dayNames = [];
    const dateNumbers = [];
    const start = new Date(tglMulai + 'T00:00:00');
    const daysIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    
    for (let i = 0; i < 14; i++) {
        const curr = new Date(start);
        curr.setDate(start.getDate() + i);
        dates.push(getLocalDateStr(curr));
        dayNames.push(daysIndo[curr.getDay()]);
        dateNumbers.push(curr.getDate());
    }

    // Build Excel Headers for Sheet 1 (2-Row Header)
    // Row 1: Merge labels
    const headerRow1 = [
        'No', 'Divisi', 'Nama Relawan', 
        'Absensi Harian (2 Minggu)', '', '', '', '', '', '', '', '', '', '', '', '', '', 
        'Honoranium Sukarelawan', 'Iuran BPJS', 'TK', 'PJ', 'Total Upah'
    ];
    
    // Row 2: Sub-labels (column headers for daily cells)
    const headerRow2 = ['', '', ''];
    for (let i = 0; i < 14; i++) {
        headerRow2.push(`${dayNames[i]} (${dateNumbers[i]})`);
    }
    headerRow2.push('', '', '', '', '');

    const ws1Data = [headerRow1, headerRow2];
    const merges = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // No
        { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // Divisi
        { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, // Nama Relawan
        { s: { r: 0, c: 3 }, e: { r: 0, c: 16 } }, // Absensi Harian (2 Minggu)
        { s: { r: 0, c: 17 }, e: { r: 1, c: 17 } }, // Honoranium
        { s: { r: 0, c: 18 }, e: { r: 1, c: 18 } }, // Iuran BPJS
        { s: { r: 0, c: 19 }, e: { r: 1, c: 19 } }, // TK
        { s: { r: 0, c: 20 }, e: { r: 1, c: 20 } }, // PJ
        { s: { r: 0, c: 21 }, e: { r: 1, c: 21 } }  // Total Upah
    ];

    // Filter logs that are within the selected range and are for allowed employees
    const filteredLogs = logs.filter(l => l.date >= tglMulai && l.date <= tglSelesai && allowedEmpIds.has(String(l.empId)));

    // Group by division
    const groups = {};
    allowedEmployees.forEach(e => {
        const empLogs = filteredLogs.filter(l => l.empId === e.id);
        const inDates = new Set(empLogs.filter(l => l.type === 'IN').map(l => l.date));
        
        const dailySalaries = dates.map(dateStr => {
            return inDates.has(dateStr) ? parseInt(e.salary) : 0;
        });
        const honoranium = dailySalaries.reduce((sum, val) => sum + val, 0);
        const bpjs = 16800;
        const tk = 0;
        const pj = 0;
        const totalUpah = honoranium;

        const div = e.division || 'Lainnya';
        if (!groups[div]) groups[div] = [];
        groups[div].push({ 
            ...e, 
            dailySalaries, 
            honoranium, 
            bpjs, 
            tk, 
            pj, 
            totalUpah 
        });
    });

    // Define custom division order (Case-Insensitive)
    const getDivisionSortIndex = (divName) => {
        const norm = String(divName || '').toLowerCase().trim().replace(/\s+/g, ' ');
        if (norm.includes('asisten lapangan') || norm.includes('aslap')) return 0;
        if (norm.includes('koordinasi lapangan') || norm.includes('kordinasi lapangan')) return 1;
        if (norm.includes('leader helper cook')) return 2;
        if (norm.includes('helper cook')) return 3;
        if (norm.includes('chef')) return 4;
        if (norm.includes('cook')) return 5;
        if (norm.includes('leader packing')) return 6;
        if (norm.includes('packing')) return 7;
        if (norm.includes('kenek')) return 9;
        if (norm.includes('distribusi')) return 8;
        if (norm.includes('leader ompreng')) return 10;
        if (norm.includes('ompreng')) return 11;
        if (norm.includes('keamanan')) return 12;
        if (norm.includes('kebersihan')) return 13;
        if (norm.includes('admin gudang')) return 14;
        if (norm.includes('gudang')) return 15;
        return 999;
    };

    const sortedDivisions = Object.keys(groups).sort((a, b) => {
        const idxA = getDivisionSortIndex(a);
        const idxB = getDivisionSortIndex(b);
        if (idxA !== idxB) return idxA - idxB;
        return a.localeCompare(b);
    });

    let currentRowIdx = 2; // Data rows start after the 2-row header
    let globalIndex = 0;

    sortedDivisions.forEach(divName => {
        const groupMembers = groups[divName];
        const K = groupMembers.length;
        groupMembers.sort((a, b) => a.name.localeCompare(b.name));

        if (K > 1) {
            merges.push({ s: { r: currentRowIdx, c: 1 }, e: { r: currentRowIdx + K - 1, c: 1 } });
        }

        groupMembers.forEach((item, memberIdx) => {
            globalIndex++;
            const rowData = [
                globalIndex,
                divName,
                item.name
            ];

            // Presence daily salaries for col D to col Q (14 columns)
            for (let i = 0; i < 14; i++) {
                rowData.push(item.dailySalaries[i]);
            }

            // R: Honoranium
            rowData.push(item.honoranium);
            // S: BPJS
            rowData.push(item.bpjs);
            // T: TK
            rowData.push(item.tk);
            // U: PJ
            rowData.push(item.pj);
            
            // V: Total Upah (Excel formula linking to R)
            const excelRowNumber = currentRowIdx + 1; // 1-indexed Excel row
            rowData.push({ f: `R${excelRowNumber}` });

            ws1Data.push(rowData);
            currentRowIdx++;
        });
    });

    // Add GRAND TOTAL row using Excel formulas
    const lastDataRow = currentRowIdx;
    const grandTotalRow = ['', '', 'GRAND TOTAL'];
    
    // Sum formulas for D to Q
    for (let i = 0; i < 14; i++) {
        const colLetter = String.fromCharCode(68 + i); // 68 is ASCII for 'D'
        grandTotalRow.push({ f: `SUM(${colLetter}3:${colLetter}${lastDataRow})` });
    }
    
    // R: Honoranium
    grandTotalRow.push({ f: `SUM(R3:R${lastDataRow})` });
    // S: BPJS
    grandTotalRow.push({ f: `SUM(S3:S${lastDataRow})` });
    // T: TK
    grandTotalRow.push({ f: `SUM(T3:T${lastDataRow})` });
    // U: PJ
    grandTotalRow.push({ f: `SUM(U3:U${lastDataRow})` });
    // V: Total Upah
    grandTotalRow.push({ f: `SUM(V3:V${lastDataRow})` });
    
    ws1Data.push(grandTotalRow);

    // Sheet 2: Detail Log Absensi
    const ws2Data = [['Tanggal', 'Jam', 'ID', 'Nama', 'Tipe', 'Lembur (Jam)', 'Telat (Menit)', 'Lokasi', 'Catatan', 'Oleh']];
    filteredLogs.forEach(l => {
        ws2Data.push([l.date, l.time, l.empId, l.name, l.type, l.overtime || 0, l.lateMinutes || 0, l.location, l.note, l.absentBy]);
    });

    // Sheet 3: Detail Lembur
    const ws3Data = [['Nama', 'Divisi', 'Tanggal', 'Shift Pulang', 'Actual Out', 'Jam Lembur']];
    allowedEmployees.forEach(e => {
        filteredLogs.filter(l => l.empId === e.id && l.type === 'OUT' && l.overtime > 0).forEach(l => {
            const shift = appConfig.shifts[e.division];
            const shiftEnd = shift ? (typeof shift === 'string' ? '-' : shift.end) : '-';
            ws3Data.push([e.name, e.division, l.date, shiftEnd, l.time, l.overtime]);
        });
    });

    // Sheet 4: Detail Keterlambatan
    const ws4Data = [['Nama', 'Divisi', 'Tanggal', 'Shift Masuk', 'Actual In', 'Terlambat (Menit)', 'Catatan']];
    allowedEmployees.forEach(e => {
        filteredLogs.filter(l => l.empId === e.id && l.type === 'IN' && l.lateMinutes > 0).forEach(l => {
            const shift = appConfig.shifts[e.division];
            const shiftStart = shift ? (typeof shift === 'string' ? '-' : shift.start) : '-';
            ws4Data.push([e.name, e.division, l.date, shiftStart, l.time, l.lateMinutes, l.note]);
        });
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);

    // Apply Currency format (Rp#,##0) to columns D (3) to V (21)
    for (const key in ws1) {
        if (key[0] === '!') continue;
        const cell = ws1[key];
        const decoded = XLSX.utils.decode_cell(key);
        if (decoded.c >= 3 && decoded.c <= 21) {
            if (decoded.r >= 2) {
                if (cell && (cell.t === 'n' || cell.f)) {
                    cell.z = '"Rp"#,##0';
                }
            }
        }
    }

    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);
    const ws4 = XLSX.utils.aoa_to_sheet(ws4Data);

    // Set column widths
    const ws1Cols = [{wch:4},{wch:15},{wch:20}];
    for (let i = 0; i < 14; i++) {
        ws1Cols.push({wch:12});
    }
    ws1Cols.push({wch:22},{wch:12},{wch:8},{wch:8},{wch:16});
    ws1['!cols'] = ws1Cols;
    ws1['!merges'] = merges;
    
    ws2['!cols'] = [{wch:12},{wch:10},{wch:10},{wch:25},{wch:6},{wch:10},{wch:10},{wch:30},{wch:25},{wch:12}];

    XLSX.utils.book_append_sheet(wb, ws1, 'Rekap Gaji');
    XLSX.utils.book_append_sheet(wb, ws2, 'Log Absensi');
    XLSX.utils.book_append_sheet(wb, ws3, 'Detail Lembur');
    XLSX.utils.book_append_sheet(wb, ws4, 'Detail Keterlambatan');

    return wb;
}

async function downloadDirectRekapExcel() {
    const btn = document.getElementById('btnDownloadDirectExcel');
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengunduh...';

    try {
        const tglMulai = document.getElementById('salaryTglMulai')?.value || '';
        const tglSelesai = document.getElementById('salaryTglSelesai')?.value || '';
        
        if (!tglMulai || !tglSelesai) {
            showToast('Silakan tentukan periode tanggal terlebih dahulu.', 'error');
            return;
        }

        const wb = buildRekapWorkbook(tglMulai, tglSelesai);
        const filename = generateRekapFilename('xlsx', tglMulai, tglSelesai);

        const xlsxData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const xlsxBlob = new Blob([xlsxData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        if (window.AndroidApp && window.AndroidApp.saveFile) {
            const reader = new FileReader();
            reader.onloadend = function() {
                const base64 = reader.result.split(',')[1];
                AndroidApp.saveFile(base64, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            };
            reader.readAsDataURL(xlsxBlob);
        } else {
            const url = URL.createObjectURL(xlsxBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        showToast('Download selesai! File Excel rekap berhasil diunduh.', 'success');
    } catch (err) {
        console.error('Download direct excel error:', err);
        showToast('Gagal download: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHTML;
    }
}

async function downloadRekapData() {
    const btn = document.getElementById('btnDownloadRekap');
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyiapkan data...';

    // Baca opsi foto
    const sertakanFoto = document.getElementById('chkSertakanFoto')?.checked ?? true;

    try {
        const tglMulai = document.getElementById('cetakTglMulai')?.value || '';
        const tglSelesai = document.getElementById('cetakTglSelesai')?.value || '';

        if (!tglMulai || !tglSelesai) {
            showToast('Silakan tentukan periode tanggal terlebih dahulu.', 'error');
            return;
        }

        const wb = buildRekapWorkbook(tglMulai, tglSelesai);
        const xlsxData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

        // Create ZIP
        const zip = new JSZip();
        zip.file(generateRekapFilename('xlsx', tglMulai, tglSelesai), xlsxData);

        let downloadedPhotos = 0;
        const filteredLogs = logs.filter(l => l.date >= tglMulai && l.date <= tglSelesai);

        if (sertakanFoto) {
            // Fetch attendance photos
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengunduh foto absen...';
            const photosFolder = zip.folder('Foto_Absen');
            const photoLogs = filteredLogs.filter(l => l.photo && typeof l.photo === 'string' && l.photo.startsWith('http'));
            const maxPhotos = photoLogs.length;
            downloadedPhotos = 0;

            for (const l of photoLogs) {
                try {
                    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Foto ${++downloadedPhotos}/${maxPhotos}...`;
                    const resp = await fetch(l.photo);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        const safeName = `${l.name}_${l.date}_${l.type}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                        photosFolder.file(`${safeName}.jpg`, blob);
                    }
                } catch (e) {
                    console.warn('Photo download failed:', l.photo, e);
                }
            }
        } else {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Membuat file Excel...';
            await new Promise(r => setTimeout(r, 200)); // animasi sebentar
        }

        // Generate and download ZIP
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Membuat ZIP...';
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

        // Android WebView: simpan via native bridge
        if (window.AndroidApp && window.AndroidApp.saveFile) {
            const reader = new FileReader();
            reader.onloadend = function() {
                const base64 = reader.result.split(',')[1];
                AndroidApp.saveFile(base64, generateRekapFilename('zip', tglMulai, tglSelesai), 'application/zip');
            };
            reader.readAsDataURL(zipBlob);
        } else {
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = generateRekapFilename('zip', tglMulai, tglSelesai);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        if (sertakanFoto) {
            showToast(`Download selesai! ${downloadedPhotos} foto + Excel dalam ZIP.`, 'success');
        } else {
            showToast('Download selesai! File Excel rekap berhasil diunduh (tanpa foto).', 'success');
        }
    } catch (err) {
        console.error('Download rekap error:', err);
        showToast('Gagal download: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHTML;
    }
}

function cetakRekapGaji() {
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const now = new Date();

    // Read date range from modal inputs
    const tglMulai = document.getElementById('cetakTglMulai')?.value || '';
    const tglSelesai = document.getElementById('cetakTglSelesai')?.value || '';

    // Format periode text
    let periodeText;
    if (tglMulai && tglSelesai) {
        const dMulai = new Date(tglMulai + 'T00:00:00');
        const dSelesai = new Date(tglSelesai + 'T00:00:00');
        periodeText = `${dMulai.getDate()} ${bulan[dMulai.getMonth()]} ${dMulai.getFullYear()} — ${dSelesai.getDate()} ${bulan[dSelesai.getMonth()]} ${dSelesai.getFullYear()}`;
    } else {
        periodeText = `${bulan[now.getMonth()]} ${now.getFullYear()}`;
    }

    const periodeEl = document.getElementById('printPeriodeGaji');
    const tanggalEl = document.getElementById('printTanggalGaji');
    if (periodeEl) periodeEl.textContent = `Periode: ${periodeText}`;
    if (tanggalEl) tanggalEl.textContent = `Jakarta, ${now.getDate()} ${bulan[now.getMonth()]} ${now.getFullYear()}`;

    // Filter logs by date range
    const filteredLogs = (tglMulai && tglSelesai) ? logs.filter(l => l.date >= tglMulai && l.date <= tglSelesai) : logs;

    // Re-render salary table with filtered logs
    renderSalary(filteredLogs);

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
            const empLogs = filteredLogs.filter(l => l.empId === e.id);
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
            <div style="${idx === 0 ? 'page-break-before:always;' : ''} padding-top:${idx === 0 ? '12' : '8'}px; margin-top:${idx === 0 ? '0' : '6'}px; ${idx > 0 ? 'border-top:2px dashed #aaa; padding-top:10px;' : ''} break-inside:avoid;">
                <table style="width:100%;border-collapse:collapse;border:2px solid #555;">
                    <thead>
                        <tr style="background:#e2e8f0;">
                            <th colspan="3" style="border:1px solid #999;padding:8px;font-size:13px;text-align:center;letter-spacing:1px;">SLIP GAJI — ${e.name}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- INFO RELAWAN -->
                        <tr style="background:#f8fafc;">
                            <td style="border:1px solid #ccc;padding:6px 8px;font-size:10px;color:#555;width:130px;">Nama Relawan</td>
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

                <div style="margin-top:10px;display:flex;justify-content:space-between;">
                    <div style="text-align:center;width:45%;">
                        <p style="font-size:10px;color:#555;margin:0 0 30px;">Penerima,</p>
                        <p style="font-size:11px;font-weight:700;margin:0;border-bottom:1px solid #333;display:inline-block;padding-bottom:2px;">${e.name}</p>
                    </div>
                    <div style="text-align:center;width:45%;">
                        <p style="font-size:10px;color:#555;margin:0 0 30px;">Akuntan,</p>
                        <p style="font-size:11px;font-weight:700;margin:0;border-bottom:1px solid #333;display:inline-block;padding-bottom:2px;">Muhammad Fikri, S. Ak.</p>
                    </div>
                </div>
            </div>`;
        });
        slipContainer.innerHTML = slipsHtml;
    }

    // Apply checkbox options — pakai class print-excluded (override .print-only !important)
    const sectionLembur = document.getElementById('printSectionLembur');
    const sectionTelat  = document.getElementById('printSectionTelat');
    const sectionSlip   = document.getElementById('slipGajiIndividual');
    const sectionKop    = document.getElementById('kopSuratGaji');
    const sectionTtd    = document.getElementById('printTtdFooter');

    const excluded = [];
    if (!showLembur && sectionLembur) { sectionLembur.classList.add('print-excluded'); excluded.push(sectionLembur); }
    if (!showTelat  && sectionTelat)  { sectionTelat.classList.add('print-excluded');  excluded.push(sectionTelat); }
    if (!showSlip   && sectionSlip)   { sectionSlip.classList.add('print-excluded');   excluded.push(sectionSlip); }
    if (!showKop    && sectionKop)    { sectionKop.classList.add('print-excluded');    excluded.push(sectionKop); }
    if (!showKop    && sectionTtd)    { sectionTtd.classList.add('print-excluded');    excluded.push(sectionTtd); }

    // Set document title for PDF filename
    const origTitle = document.title;
    document.title = generateRekapFilename('pdf');

    window.print();

    // Restore: hapus class print-excluded setelah dialog print selesai
    setTimeout(() => {
        document.title = origTitle;
        excluded.forEach(el => el.classList.remove('print-excluded'));
        renderSalary(); // Re-render with all logs (unfiltered)
    }, 500);
}


// --- CHART & GRID ---
function renderTrendChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    
    const labels = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return getLocalDateStr(d);
    }).reverse();

    const presentData = labels.map(date => logs.filter(l => l.date === date && l.type === 'IN').length);
    const lateData = labels.map(date => logs.filter(l => l.date === date && l.lateMinutes > 0).length);
    const overtimeData = labels.map(date => logs.filter(l => l.date === date && l.type === 'OUT' && l.overtime > 0).length);

    if (trendChartInstance) trendChartInstance.destroy();

    const labelColors = labels.map(d => {
        const dt = new Date(d + 'T00:00:00');
        return (dt.getDay() === 0 || getHoliday(d)) ? '#ef4444' : '#64748b';
    });

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(d => {
                const parts = d.split('-');
                const dt = new Date(d + 'T00:00:00');
                const dayNames = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
                const holiday = getHoliday(d);
                let lbl = `${dayNames[dt.getDay()]} ${parts[2]}/${parts[1]}`;
                if (holiday) lbl += ' \u25CF';
                return lbl;
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
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
                x: { ticks: { color: labelColors } }
            }
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
    const cleanId = String(id).trim().replace(/\s+/g, ' ');
    const emp = employees.find(e => String(e.id).trim() == cleanId || e.name.trim().replace(/\s+/g, ' ').toLowerCase() == cleanId.toLowerCase());
    if(emp) {
        // Block other roles from self attendance
        const allowedRoles = ['employee', 'security', 'foundation'];
        if (!allowedRoles.includes(emp.role || 'employee')) {
            showToast("Peran Anda tidak memerlukan pencatatan absensi.", "error");
            return;
        }
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
        showToast("Relawan Tidak Ditemukan", "error");
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

    const now = new Date();
    const today = getLocalDateStr(now);
    
    const empLogs = logs.filter(l => l.empId === scannedEmployee.id).sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
    const lastLog = empLogs.length > 0 ? empLogs[0] : null;

    const bothDisabled = appConfig.disableBoth || (appConfig.disableLate && appConfig.disableEarly);
    if(type === 'IN') {
        if(lastLog && lastLog.type === 'IN' && !bothDisabled) {
            showToast("Sesi Masih Aktif!", "error");
            setTimeout(resetSecurityFlow, 1500); 
            return;
        }
        // Cek batasan 1 jam sebelum shift & 1x per hari
        const clockInCheck = checkClockInAllowed(scannedEmployee.id, scannedEmployee.division);
        if (!clockInCheck.allowed) {
            showToast(clockInCheck.message, "error");
            setTimeout(resetSecurityFlow, 1500);
            return;
        }
    }

    let overtimeHours = 0;
    let lateMinutes = 0;
    let earlyMinutes = 0;
    let finalType = type;
    let forcedTime = null; 
    let needsReason = null;
    let toastMessage = "Absen Berhasil!";

    if (type === 'IN') {
        const divConfig = appConfig.shifts[scannedEmployee.division];
        if (divConfig && typeof divConfig !== 'string') {
            const shiftStartH = parseInt(divConfig.start.split(':')[0]);
            const shiftStartM = parseInt(divConfig.start.split(':')[1]);
            const shiftEndH = parseInt(divConfig.end.split(':')[0]);
            const isOvernight = shiftEndH < shiftStartH;
            let expectedStart = new Date();
            expectedStart.setHours(shiftStartH, shiftStartM, 0, 0);
            // Overnight shift: jika sekarang lewat tengah malam (jam kecil, sebelum jam pulang),
            // berarti shift dimulai kemarin malam. Contoh: Cook 23:00-07:00, sekarang jam 02:00
            if (isOvernight && now.getHours() < shiftEndH) {
                expectedStart.setDate(expectedStart.getDate() - 1);
            }
            const diffMs = now - expectedStart;
            const diffMin = Math.floor(diffMs / 60000);

            if (diffMin > 0) {
                lateMinutes = diffMin;
                const lateDisabled = appConfig.disableBoth || appConfig.disableLate;
                if (lateDisabled) {
                    // Admin matikan fitur telat — bebas masuk
                    const reason = appConfig.disableBoth ? appConfig.disableBothReason : appConfig.disableLateReason;
                    forcedTime = null;
                    toastMessage = reason ? `Absen Masuk (${reason})` : 'Absen Masuk.';
                    lateMinutes = 0;
                } else if (diffMin < 5) {
                    // Tier 1: 1–5 menit → Toleransi, tidak dicatat sebagai pelanggaran
                    lateMinutes = 0;
                    toastMessage = `Telat ${diffMin}m (Toleransi).`;
                } else if (diffMin < 25) {
                    // Tier 2: 5–25 menit → Terlambat, langsung simpan tanpa alasan
                    toastMessage = `Terlambat ${diffMin} menit.`;
                } else if (diffMin < 35) {
                    // Tier 3: 25–35 menit → Wajib isi alasan, tanpa WA
                    needsReason = 'late';
                    toastMessage = `Terlambat ${diffMin} menit — isi alasan.`;
                } else {
                    // Tier 4: 35+ menit → Wajib alasan + konfirmasi WA ke Admin
                    needsReason = 'blocked';
                    toastMessage = `Terlambat ${diffMin} menit — konfirmasi ke Admin.`;
                }
            }
        }
    }
    
    if(type === 'OUT') {
        if((!lastLog || lastLog.type === 'OUT') && !bothDisabled) return showToast("Belum Absen Masuk!", "error");
        const divConfig = appConfig.shifts[scannedEmployee.division];
        if (divConfig && typeof divConfig !== 'string' && lastLog && lastLog.type === 'IN') {
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
             const earlyDisabled = appConfig.disableBoth || appConfig.disableEarly;
             if (earlyDisabled) {
                 if (diffMinutes < 0) {
                     const reason = appConfig.disableBoth ? appConfig.disableBothReason : appConfig.disableEarlyReason;
                     toastMessage = reason ? `Absen Pulang (${reason})` : 'Absen Pulang.';
                 } else if (diffMinutes > 40) {
                     overtimeHours = Math.floor((diffMinutes - 41) / 60) + 1;
                     toastMessage = appConfig.hideOvertime ? 'Absen Pulang Berhasil.' : `Lembur: ${overtimeHours} Jam`;
                 }
             } else {
                 if (diffMinutes < -120) {
                     return showToast("Tidak bisa absen pulang!\nMaksimal 2 jam sebelum jam pulang.", "error");
                 } else if (diffMinutes < -20) {
                     earlyMinutes = Math.abs(diffMinutes);
                     needsReason = 'early';
                     toastMessage = `Pulang ${earlyMinutes} menit lebih awal.`;
                 } else if (diffMinutes < 0) {
                     toastMessage = 'Absen Pulang Berhasil.';
                 } else if (diffMinutes > 40) {
                     overtimeHours = Math.floor((diffMinutes - 41) / 60) + 1;
                     toastMessage = appConfig.hideOvertime ? 'Absen Pulang Berhasil.' : `Lembur: ${overtimeHours} Jam`;
                 }
             }
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

    if (bothDisabled && type === 'IN') {
        payload.note = '[Bebas Masuk] Fitur absen bebas aktif';
    } else if (bothDisabled && type === 'OUT' && earlyMinutes > 0) {
        payload.note = '[Bebas Pulang] Fitur absen bebas aktif';
    } else if (earlyMinutes > 0) {
        payload.note = `[Pulang ${earlyMinutes} mnt lebih awal]`;
    }

    if (needsReason === 'late') {
        pendingAttendancePayload = payload;
        document.getElementById('lateNoteInput').value = ""; 
        document.getElementById('lateAlertModal').classList.remove('hidden');
        setTimeout(() => document.getElementById('lateAlertModal').classList.remove('opacity-0'), 10);
        return; 
    }

    if (needsReason === 'early') {
        pendingAttendancePayload = payload;
        pendingAttendancePayload._earlyMinutes = earlyMinutes;
        pendingAttendancePayload._toastMessage = toastMessage;
        document.getElementById('earlyNoteInput').value = '';
        document.getElementById('earlyOutModal').classList.remove('hidden');
        setTimeout(() => document.getElementById('earlyOutModal').classList.remove('opacity-0'), 10);
        return;
    }

    if (needsReason === 'blocked') {
        pendingAttendancePayload = payload;
        pendingAttendancePayload._lateMinutes = lateMinutes;
        const divConfig = appConfig.shifts[scannedEmployee.division];
        showLateBlockedModal(scannedEmployee.name, scannedEmployee.division, divConfig ? divConfig.start : '-');
        return;
    }

    const success = await postData('attendance', payload);
    if(success) {
        toggleLoader(false);
        const empName = scannedEmployee ? scannedEmployee.name : '';
        const absenType = finalType;
        if (securitySelfAttendanceMode && finalType === 'IN' && currentUser && String(scannedEmployee.id) === String(currentUser.id)) {
            securitySelfAttendanceDone = true;
            securitySelfAttendanceMode = false;
            updateSecurityEntryGate();
        }
        resetSecurityFlow();
        showAbsenSuccess({ type: absenType, name: empName, message: toastMessage });
    }
}

async function submitLateReason() {
    if (!pendingAttendancePayload) return;
    const note = (document.getElementById('lateNoteInput').value || '').trim();
    if (!note) {
        document.getElementById('lateNoteWarn').classList.remove('hidden');
        document.getElementById('lateNoteInput').focus();
        return;
    }
    pendingAttendancePayload.note = note; 
    const modal = document.getElementById('lateAlertModal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
    const isVolunteer = pendingAttendancePayload.absentBy === 'Mandiri';
    const empName = pendingAttendancePayload.name || '';
    postData('attendance', pendingAttendancePayload).then(async (success) => {
        if(success) {
            toggleLoader(false);
            if (isVolunteer) {
                volCancelFlow();
                showAbsenSuccess({
                    type: 'IN', name: empName, message: 'Absen Masuk (Terlambat) Tercatat.',
                    onDone: async () => { await fetchData(true); volUpdateTodayStatus(); }
                });
            } else {
                resetSecurityFlow();
                showAbsenSuccess({ type: 'IN', name: empName, message: 'Absen Masuk (Terlambat) Tercatat.' });
            }
        }
    });
    pendingAttendancePayload = null; 
}

// --- Late Blocked Modal (>30 menit telat) ---
let _lateBlockedInfo = {};

function showLateBlockedModal(name, division, shiftStart) {
    _lateBlockedInfo = { name, division, shiftStart };
    const overlay = document.getElementById('lateBlockedModal');
    const bg = document.getElementById('lateBlockedBg');
    const card = document.getElementById('lateBlockedCard');
    const xIcon = document.getElementById('lateBlockedXIcon');
    const msg = document.getElementById('lateBlockedMsg');

    msg.textContent = `Maaf ${name}, kamu terlambat lebih dari 35 menit dari jam kerja divisi ${division} (${shiftStart}). Wajib isi alasan & konfirmasi ke Admin via WhatsApp.`;
    document.getElementById('lateBlockedReasonInput').value = '';

    // Reset animation state
    xIcon.style.opacity = '0';
    xIcon.style.transform = 'scale(0.3)';
    card.style.transform = 'scale(0.5)';
    card.style.opacity = '0';
    bg.style.backgroundColor = 'rgba(0,0,0,0)';

    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.style.pointerEvents = 'auto';

    requestAnimationFrame(() => {
        bg.style.backgroundColor = 'rgba(127,29,29,0.92)';
        card.style.transform = 'scale(1)';
        card.style.opacity = '1';
        setTimeout(() => {
            xIcon.style.opacity = '1';
            xIcon.style.transform = 'scale(1)';
        }, 300);
    });
}

function dismissLateBlocked() {
    const overlay = document.getElementById('lateBlockedModal');
    const bg = document.getElementById('lateBlockedBg');
    const card = document.getElementById('lateBlockedCard');
    bg.style.backgroundColor = 'rgba(0,0,0,0)';
    card.style.transform = 'scale(0.5)';
    card.style.opacity = '0';
    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        overlay.style.pointerEvents = 'none';
    }, 400);
}


async function sendLateWA() {
    const reason = (document.getElementById('lateBlockedReasonInput').value || '').trim();
    if (!reason) {
        document.getElementById('lateBlockedWarn').classList.remove('hidden');
        document.getElementById('lateBlockedReasonInput').focus();
        return;
    }
    if (!pendingAttendancePayload) return;

    // Disable tombol agar tidak double-submit
    const waBtn = document.querySelector('#lateBlockedCard button[onclick="sendLateWA()"]');
    if (waBtn) {
        waBtn.disabled = true;
        waBtn.innerHTML = '<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25"></circle><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path></svg> Menyimpan absen...';
    }

    const lateMin = pendingAttendancePayload._lateMinutes || 0;
    pendingAttendancePayload.note = `[Telat ${lateMin} mnt >35m] ${reason}`;
    delete pendingAttendancePayload._lateMinutes;

    const isVolunteer = pendingAttendancePayload.absentBy === 'Mandiri';
    const empName = pendingAttendancePayload.name || '';
    const payloadToSend = { ...pendingAttendancePayload };
    pendingAttendancePayload = null;

    // --- Step 1: Simpan absen ke server DULU (await, bukan fire-and-forget) ---
    let saveSuccess = false;
    try {
        toggleLoader(true, 'Menyimpan absen terlambat...');
        const form = new URLSearchParams();
        Object.keys(payloadToSend).forEach(k => {
            if (payloadToSend[k] !== undefined && payloadToSend[k] !== null)
                form.append(k, String(payloadToSend[k]));
        });
        form.set('action', 'attendance');
        const res = await fetch(SCRIPT_URL, { method: 'POST', body: form });
        const json = await res.json().catch(() => null);
        saveSuccess = json && (json.status === 'success' || json.duplicate === true);
    } catch (err) {
        console.error('[sendLateWA] Gagal simpan:', err);
    }
    toggleLoader(false);

    if (!saveSuccess) {
        showToast('Gagal menyimpan absen. Coba lagi.', 'error');
        if (waBtn) {
            waBtn.disabled = false;
            waBtn.innerHTML = '<i class="fab fa-whatsapp text-lg"></i> Kirim via WhatsApp & Simpan Absen';
        }
        return;
    }

    // --- Step 2: Absen berhasil → buka WhatsApp ---
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 11 ? 'Pagi' : hour < 15 ? 'Siang' : hour < 18 ? 'Sore' : 'Malam';
    const name = _lateBlockedInfo.name || empName || '-';
    const division = _lateBlockedInfo.division || '-';
    const shiftStart = _lateBlockedInfo.shiftStart || '-';
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });

    const message = `Assalamualaikum Warahmatullahi Wabarakatuh,
Selamat ${greeting} Admin SPPG Rawa Bunga 1.

Saya *${name}* dari divisi *${division}*.

Dengan ini saya menginformasikan bahwa pada hari *${dateStr}* pukul *${timeStr} WIB*, saya terlambat hadir melebihi 35 menit dari jadwal shift pukul *${shiftStart} WIB*.

Adapun alasan keterlambatan saya:
_${reason}_

Absensi saya telah *otomatis tercatat* di sistem dengan catatan terlambat. Mohon kiranya Admin berkenan meninjau pelanggaran ini.

Atas perhatiannya saya ucapkan terima kasih.
Wassalamualaikum Warahmatullahi Wabarakatuh.`;

    const phone = '6282114806765';
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');

    // --- Step 3: Tutup modal & tampilkan sukses ---
    dismissLateBlocked();

    if (isVolunteer) {
        volCancelFlow();
        showAbsenSuccess({
            type: 'IN', name: empName,
            message: `Absen tercatat! Konfirmasi WA terkirim ke Admin.`,
            onDone: async () => { await fetchData(true); volUpdateTodayStatus(); }
        });
    } else {
        resetSecurityFlow();
        showAbsenSuccess({ type: 'IN', name: empName, message: `Absen tercatat! Konfirmasi WA terkirim ke Admin.` });
        fetchData(false).catch(() => {});
    }
}


async function submitEarlyReason() {
    if (!pendingAttendancePayload) return;
    const note = (document.getElementById('earlyNoteInput').value || '').trim();
    if (!note) {
        document.getElementById('earlyNoteWarn').classList.remove('hidden');
        document.getElementById('earlyNoteInput').focus();
        return;
    }
    const earlyMins = pendingAttendancePayload._earlyMinutes || 0;
    const toastMsg = pendingAttendancePayload._toastMessage || pendingAttendancePayload._toastMsg || '';
    pendingAttendancePayload.note = `[Pulang ${earlyMins} mnt lebih awal] ${note}`.trim();
    delete pendingAttendancePayload._earlyMinutes;
    delete pendingAttendancePayload._toastMessage;
    delete pendingAttendancePayload._toastMsg;
    const modal = document.getElementById('earlyOutModal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
    const isVolunteer = pendingAttendancePayload.absentBy === 'Mandiri';
    const empName = pendingAttendancePayload.name || '';
    postData('attendance', pendingAttendancePayload).then(async (success) => {
        if (success) {
            toggleLoader(false);
            if (isVolunteer) {
                volCancelFlow();
                showAbsenSuccess({
                    type: 'EARLY_OUT', name: empName, message: toastMsg,
                    onDone: async () => { await fetchData(true); volUpdateTodayStatus(); }
                });
            } else {
                resetSecurityFlow();
                showAbsenSuccess({ type: 'EARLY_OUT', name: empName, message: toastMsg });
            }
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
    const orderedKeys = ["Helper Cook", "Cook", "Head Chef", "Packing", "Distribusi", "Kenek Distribusi", "Kebersihan", "Asisten Lapangan", "Admin Gudang", "Gudang", "Keamanan Shift 1", "Keamanan Shift 2", "Cuci Ompreng", "Leader Ompreng", "Leader Packing", "Leader Helper Cook", "Admin Yayasan", "Koordinasi Lapangan"];
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

// --- Batasan Absensi: 1 jam sebelum shift & 1x per hari ---
function checkClockInAllowed(empId, division) {
    const divConfig = appConfig.shifts[division];
    if (!divConfig || typeof divConfig === 'string') return { allowed: true };

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const today = getLocalDateStr(now);

    const [startH, startM] = divConfig.start.split(':').map(Number);
    const shiftStartMin = startH * 60 + startM;
    const [endH, endM] = divConfig.end.split(':').map(Number);
    const shiftEndMin = endH * 60 + endM;
    const isOvernight = shiftEndMin <= shiftStartMin;

    // Jika fitur telat+pulang awal dimatikan → bebas masuk kapan saja, kuota 1x tidak berlaku
    const lateDisabled = appConfig.disableBoth || appConfig.disableLate;
    if (lateDisabled) return { allowed: true };

    // Cek 1: Sudah absen masuk hari ini? (1x per shift per hari)
    const alreadyIN = logs.some(l =>
        String(l.empId) === String(empId) &&
        l.date === today &&
        l.type === 'IN'
    );
    if (alreadyIN) {
        return { allowed: false, message: 'Sudah absen masuk hari ini! Maksimal 1x absen masuk per hari.' };
    }

    // Cek 2: Apakah dalam window 30 menit sebelum shift?
    let minutesBefore = shiftStartMin - nowMin;
    if (minutesBefore < 0) minutesBefore += 1440;

    if (minutesBefore <= 30) return { allowed: true };

    // Jika sudah dalam jam shift (telat tapi masih jam kerja) → boleh
    let inShift = false;
    if (isOvernight) {
        inShift = nowMin >= shiftStartMin || nowMin <= shiftEndMin;
    } else {
        inShift = nowMin >= shiftStartMin && nowMin <= shiftEndMin;
    }
    if (inShift) return { allowed: true };

    // Diluar window → tolak
    let earliestMin = shiftStartMin - 30;
    if (earliestMin < 0) earliestMin += 1440;
    const eh = Math.floor(earliestMin / 60);
    const em = earliestMin % 60;
    const earliestStr = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;

    return {
        allowed: false,
        message: `Belum bisa absen! Absen masuk dibuka jam ${earliestStr} (30 menit sebelum shift ${divConfig.start}).`
    };
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
        const today = getLocalDateStr();
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
            const todayLateLogs = logs.filter(l => l.date === today && l.lateMinutes > 0);
            filtered = todayLateLogs.map(log => {
                const emp = employees.find(e => e.id === log.empId);
                const info = `${formatDuration(log.lateMinutes)}`;
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
            let actionBtns = '';
            if (mode === 'active') {
                actionBtns = `<div class="flex gap-1.5 mt-2">
                    <button onclick="adminClockOut('${w.id}','${w.name}')" class="px-2.5 py-1 rounded-lg bg-blue-500 text-white text-[10px] font-bold hover:bg-blue-600 transition"><i class="fas fa-sign-out-alt mr-1"></i>Absen Out</button>
                    <button onclick="adminDeleteAbsen('${w.id}','${w.name}')" class="px-2.5 py-1 rounded-lg bg-red-500 text-white text-[10px] font-bold hover:bg-red-600 transition"><i class="fas fa-trash-alt mr-1"></i>Hapus Absen</button>
                </div>`;
            }
            return `
            <div class="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-400"><i class="fas fa-user"></i></div>
                    <div class="flex-1"><div class="font-bold text-sm text-slate-800">${w.name}</div><div class="flex items-center gap-2 mt-0.5">${statusBadge}</div></div>
                    <div class="text-right">${timeInfo}</div>
                </div>
                ${actionBtns}
            </div>`;
        }).join('') : '<div class="text-center text-slate-400 py-10">Tidak ada data.</div>';
    };
    render();
    document.getElementById('activeWorkersModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('activeWorkersModal').classList.remove('opacity-0'), 10);
    if(activeWorkerTimer) clearInterval(activeWorkerTimer);
    if(mode === 'active') activeWorkerTimer = setInterval(render, 1000); 
}
async function adminClockOut(empId, empName) {
    if (!confirm(`Absen OUT untuk ${empName}? Waktu OUT akan dicatat sekarang oleh Admin.`)) return;
    const now = new Date();
    const date = getLocalDateStr(now);
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const emp = employees.find(e => String(e.id) === String(empId));
    const shift = emp ? (appConfig.shifts?.[emp.division] || null) : null;
    let overtime = 0;
    if (shift) {
        const endParts = shift.end.split(':').map(Number);
        let endMin = endParts[0] * 60 + endParts[1];
        const nowMin = now.getHours() * 60 + now.getMinutes();
        // overnight shift
        if (shift.start > shift.end) endMin += 1440;
        const diff = nowMin - (shift.start > shift.end && nowMin < endMin - 1440 ? endMin - 1440 : endMin);
        if (diff >= 60) overtime = Math.floor(diff / 60);
    }
    try {
        await postData('attendance', {
            empId, name: empName, type: 'OUT', date, forcedTime: time,
            overtime, note: '[Admin OUT]', absentBy: 'Admin'
        });
        // Update local logs
        logs.push({ empId, name: empName, type: 'OUT', date, time: time + ':00', overtime, lateMinutes: 0, note: '[Admin OUT]', absentBy: 'Admin' });
        refreshUI();
        showToast(`${empName} berhasil Absen OUT oleh Admin`, 'success');
    } catch (err) {
        showToast('Gagal absen OUT: ' + err.message, 'error');
    }
}

async function adminDeleteAbsen(empId, empName) {
    if (!confirm(`HAPUS semua absen hari ini untuk ${empName}?\nData IN & OUT hari ini akan dihapus dari database.`)) return;
    const today = getLocalDateStr();
    try {
        await postData('deleteAttendanceByEmpDate', { empId, date: today });
        // Remove from local logs
        const before = logs.length;
        for (let i = logs.length - 1; i >= 0; i--) {
            if (String(logs[i].empId) === String(empId) && logs[i].date === today) logs.splice(i, 1);
        }
        refreshUI();
        showToast(`Absen ${empName} hari ini dihapus (${before - logs.length} record)`, 'success');
    } catch (err) {
        showToast('Gagal hapus absen: ' + err.message, 'error');
    }
}

// --- CLEAN DUPLICATE LOGS ---

function openCleanDupModal() {
    const modal = document.getElementById('cleanDupModal');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.classList.add('opacity-100');
    });
}

function closeCleanDupModal() {
    const modal = document.getElementById('cleanDupModal');
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function _cleanDupSetProgress(current, total, desc) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    document.getElementById('cleanDupProgressBar').style.width = pct + '%';
    document.getElementById('cleanDupProgressLabel').textContent = `${current} / ${total}`;
    document.getElementById('cleanDupProgressPct').textContent = pct + '%';
    if (desc) document.getElementById('cleanDupProgressDesc').textContent = desc;
}

function _cleanDupActivateStep(stepId) {
    ['stepScan', 'stepDelete', 'stepSync'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === stepId) {
            el.classList.remove('opacity-40');
            // swap icon to spinner
            const iconWrap = el.querySelector('div');
            if (iconWrap && id !== 'stepScan') {
                iconWrap.className = 'w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0';
                iconWrap.innerHTML = '<svg class="w-3 h-3 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25"></circle><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-90"></path></svg>';
            }
        } else {
            el.classList.add('opacity-40');
        }
    });
}

function _cleanDupMarkStepDone(stepId) {
    const el = document.getElementById(stepId);
    if (!el) return;
    el.classList.remove('opacity-40');
    const iconWrap = el.querySelector('div');
    if (iconWrap) {
        iconWrap.className = 'w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0';
        iconWrap.innerHTML = '<i class="fas fa-check text-[10px] text-emerald-600"></i>';
    }
    const label = el.querySelector('span');
    if (label) label.classList.remove('text-slate-400');
}

async function cleanDuplicateLogs() {
    // Hitung duplikat lokal untuk konfirmasi
    const seen = {};
    let localDupes = 0;
    logs.forEach(l => {
        const key = `${l.empId}|${l.date}|${l.type}`;
        if (seen[key]) localDupes++;
        else seen[key] = true;
    });

    const msg = localDupes > 0
        ? `Ditemukan ${localDupes} data duplikat di sesi ini.\nLanjutkan bersihkan Spreadsheet?\n\n(Baris pertama dipertahankan, duplikat dihapus)`
        : `Tidak ada duplikat terdeteksi secara lokal.\nTetap jalankan pengecekan di server?`;

    if (!confirm(msg)) return;

    // Reset modal ke state awal
    document.getElementById('cleanDupScanning').classList.remove('hidden');
    document.getElementById('cleanDupSuccess').classList.add('hidden');
    document.getElementById('cleanDupError').classList.add('hidden');
    document.getElementById('cleanDupCloseBtn').classList.add('hidden');
    document.getElementById('cleanDupWaitNote').classList.remove('hidden');
    document.getElementById('cleanDupResultBadge').classList.add('hidden');
    document.getElementById('cleanDupTitle').textContent = 'Membersihkan Data Duplikat';
    document.getElementById('cleanDupSubtitle').textContent = 'Sedang memindai Spreadsheet...';
    document.getElementById('cleanDupIconWrap').className = 'w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-500 flex-shrink-0 transition-all duration-500';
    document.getElementById('cleanDupIcon').className = 'fas fa-broom text-sm';
    ['stepScan','stepDelete','stepSync'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('opacity-40');
    });
    // Reset step scan ke spinner
    const scanEl = document.getElementById('stepScan');
    if (scanEl) {
        scanEl.classList.remove('opacity-40');
        const iconWrap = scanEl.querySelector('div');
        if (iconWrap) {
            iconWrap.className = 'w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0';
            iconWrap.innerHTML = '<svg class="w-3 h-3 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25"></circle><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-90"></path></svg>';
        }
    }
    _cleanDupSetProgress(0, logs.length, 'Menghubungi server...');

    openCleanDupModal();

    // Animasi progress scanning (simulasi, karena server langsung kerja semua)
    const total = logs.length || 100;
    let animFrame = 0;
    const scanAnim = setInterval(() => {
        animFrame = Math.min(animFrame + Math.ceil(total / 20), Math.floor(total * 0.85));
        _cleanDupSetProgress(animFrame, total, `Memindai ${animFrame} dari ${total} baris...`);
        if (animFrame >= Math.floor(total * 0.85)) clearInterval(scanAnim);
    }, 80);

    try {
        const form = new URLSearchParams();
        form.append('action', 'cleanDuplicateLogs');
        const res = await fetch(SCRIPT_URL, { method: 'POST', body: form });
        const json = await res.json().catch(() => null);

        clearInterval(scanAnim);

        if (json && json.status === 'success') {
            const deleted = json.deleted || 0;

            // Step 1 done
            _cleanDupMarkStepDone('stepScan');
            _cleanDupSetProgress(total, total, `Pemindaian selesai. Ditemukan ${deleted} duplikat.`);
            await new Promise(r => setTimeout(r, 400));

            // Step 2: delete
            _cleanDupActivateStep('stepDelete');
            document.getElementById('cleanDupSubtitle').textContent = deleted > 0 ? `Menghapus ${deleted} baris duplikat...` : 'Tidak ada yang perlu dihapus.';
            await new Promise(r => setTimeout(r, deleted > 0 ? 600 : 300));
            _cleanDupMarkStepDone('stepDelete');
            await new Promise(r => setTimeout(r, 300));

            // Step 3: sync
            _cleanDupActivateStep('stepSync');
            document.getElementById('cleanDupSubtitle').textContent = 'Menyinkronkan data dari server...';
            await new Promise(r => setTimeout(r, 300));

            // Fetch baru di background — jangan tunggu lama
            fetchData(false).catch(() => {});
            await new Promise(r => setTimeout(r, 700));
            _cleanDupMarkStepDone('stepSync');
            await new Promise(r => setTimeout(r, 300));

            // Tampilkan state sukses
            document.getElementById('cleanDupScanning').classList.add('hidden');
            document.getElementById('cleanDupSuccess').classList.remove('hidden');
            document.getElementById('cleanDupTitle').textContent = 'Selesai!';
            document.getElementById('cleanDupSubtitle').textContent = deleted > 0 ? `${deleted} duplikat berhasil dihapus` : 'Logs sudah bersih';
            document.getElementById('cleanDupSuccessMsg').textContent = deleted > 0
                ? `${deleted} baris duplikat dihapus dari Spreadsheet. Data dipertahankan dari entri pertama.`
                : 'Tidak ada data duplikat — semua log absensi sudah bersih!';

            if (deleted > 0) {
                document.getElementById('cleanDupResultBadge').classList.remove('hidden');
                document.getElementById('cleanDupResultCount').textContent = `${deleted} baris dihapus`;
            }

            // Update icon header ke centang hijau
            document.getElementById('cleanDupIconWrap').className = 'w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0 transition-all duration-500';
            document.getElementById('cleanDupIcon').className = 'fas fa-check text-sm';

        } else {
            clearInterval(scanAnim);
            throw new Error(json?.message || 'Respons server tidak valid');
        }

    } catch (err) {
        clearInterval(scanAnim);
        console.error('[CleanDuplicates] Error:', err);
        document.getElementById('cleanDupScanning').classList.add('hidden');
        document.getElementById('cleanDupError').classList.remove('hidden');
        document.getElementById('cleanDupErrorMsg').textContent = err.message || 'Gagal terhubung ke server.';
        document.getElementById('cleanDupTitle').textContent = 'Terjadi Kesalahan';
        document.getElementById('cleanDupSubtitle').textContent = 'Proses dibatalkan';
        document.getElementById('cleanDupIconWrap').className = 'w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-500 flex-shrink-0 transition-all duration-500';
        document.getElementById('cleanDupIcon').className = 'fas fa-exclamation-triangle text-sm';
    } finally {
        // Selalu tampilkan tombol Tutup
        document.getElementById('cleanDupCloseBtn').classList.remove('hidden');
        document.getElementById('cleanDupWaitNote').classList.add('hidden');
    }
}


// Auto Clock-Out: relawan yang lupa absen OUT
// Cook: >13 jam, Lainnya (non-Security): >12 jam
// Waktu OUT = jam shift end, Lokasi = sama dengan IN
let isAutoClockOutRunning = false; // Guard flag untuk mencegah spam auto OUT
async function autoClockOutForgotten() {
    // BUG FIX #1: Guard flag — cegah eksekusi ganda/spam
    if (isAutoClockOutRunning) {
        console.log('[AutoClockOut] Sudah berjalan, skip.');
        return;
    }
    isAutoClockOutRunning = true;

    try {
        const now = new Date();
        const stuckWorkers = employees.map(emp => {
            const role = emp.role || inferRoleFromDivision(emp.division);
            // Skip security
            if (role === 'security') return null;

            const empLogs = logs
                .filter(l => String(l.empId) === String(emp.id))
                .sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
            if (empLogs.length === 0 || empLogs[0].type !== 'IN') return null;

            const lastIN = empLogs[0];

            // BUG FIX #3: Cek duplikat di sisi client — jika sudah ada OUT di hari yang sama, skip
            const alreadyHasOUT = logs.some(l =>
                String(l.empId) === String(emp.id) &&
                l.date === lastIN.date &&
                l.type === 'OUT'
            );
            if (alreadyHasOUT) return null;

            const inTime = new Date(`${lastIN.date}T${lastIN.time}`);
            const diffHours = (now - inTime) / 3600000;

            const div = (emp.division || '').toLowerCase();
            const isCook = div === 'cook';
            const maxHours = isCook ? 13 : 12;

            if (diffHours < maxHours) return null;

            return { emp, lastIN, diffHours };
        }).filter(Boolean);

        if (stuckWorkers.length === 0) return;

        console.log(`[AutoClockOut] ${stuckWorkers.length} relawan lupa OUT:`, stuckWorkers.map(w => w.emp.name));

        let successCount = 0;
        for (const { emp, lastIN } of stuckWorkers) {
            const shift = appConfig.shifts?.[emp.division];
            let outTime = shift ? shift.end : '17:00';
            const outDate = lastIN.date;
            const location = lastIN.location || '';

            // BUG FIX #3: Double-check di sisi client sebelum kirim ke server
            const alreadyOut = logs.some(l =>
                String(l.empId) === String(emp.id) &&
                l.date === outDate &&
                l.type === 'OUT'
            );
            if (alreadyOut) {
                console.log(`[AutoClockOut] ${emp.name} sudah OUT, skip.`);
                continue;
            }

            try {
                // BUG FIX #2: Pakai callApi langsung (bukan postData) agar tidak
                // memicu fetchData() → autoClockOutForgotten() loop rekursif
                const form = new URLSearchParams();
                const payload = {
                    action: 'attendance',
                    empId: emp.id,
                    name: emp.name,
                    type: 'OUT',
                    date: outDate,
                    forcedTime: outTime,
                    overtime: 0,
                    location,
                    note: '[Auto OUT - Lupa Absen]',
                    absentBy: 'Admin'
                };
                Object.keys(payload).forEach(k => form.append(k, String(payload[k])));
                const res = await fetch(SCRIPT_URL, { method: 'POST', body: form });
                const json = await res.json().catch(() => null);

                if (json && json.status === 'success') {
                    // Tambahkan ke logs lokal agar cek duplikat berikutnya akurat
                    logs.push({
                        empId: emp.id, name: emp.name, type: 'OUT',
                        date: outDate, time: outTime + ':00',
                        overtime: 0, lateMinutes: 0,
                        location, note: '[Auto OUT - Lupa Absen]', absentBy: 'Admin'
                    });
                    successCount++;
                    console.log(`[AutoClockOut] ${emp.name} auto OUT at ${outTime} on ${outDate}`);
                } else if (json && json.duplicate) {
                    console.log(`[AutoClockOut] ${emp.name} sudah OUT di server, skip.`);
                } else {
                    console.warn(`[AutoClockOut] Server tolak untuk ${emp.name}:`, json);
                }
            } catch (err) {
                console.error(`[AutoClockOut] Failed for ${emp.name}:`, err);
            }
        }

        if (successCount > 0) {
            refreshUI();
            showToast(`${successCount} relawan di-auto OUT (lupa absen)`, 'info');
        }
    } finally {
        // Selalu reset flag meski terjadi error
        isAutoClockOutRunning = false;
    }
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
    ['dashboard','employees','salaries','manual_attendance','violations','settings','pengumuman'].forEach(t => document.getElementById('tab-'+t)?.classList.add('hidden'));
    document.getElementById('tab-'+id)?.classList.remove('hidden');
    if(window.innerWidth < 768) { document.getElementById('sidebar').classList.add('-translate-x-full'); document.getElementById('sidebarOverlay').classList.add('hidden'); }
    document.querySelectorAll('.clay-nav-item').forEach(el => el.classList.remove('active'));
    Array.from(document.querySelectorAll('.clay-nav-item')).find(b => b.getAttribute('onclick').includes(id))?.classList.add('active');
    const titles = { 'dashboard': 'Dashboard', 'employees': 'Data Relawan', 'salaries': 'Laporan Gaji', 'manual_attendance': 'Absen Manual', 'violations': 'Pelanggaran', 'settings': 'Pengaturan', 'pengumuman': 'Pengumuman' };
    document.getElementById('pageTitle').innerText = titles[id] || id;
    if (id === 'manual_attendance') maInit();
    if (id === 'violations') renderViolationsTab();
    if (id === 'settings') loadSettingsUI();
    if (id === 'pengumuman') initPengumumanTab();
}

// =============================================
// SETTINGS (Pengaturan) System
// =============================================
function loadSettingsUI() {
    const tBoth = document.getElementById('toggleBoth');
    const tLate = document.getElementById('toggleLate');
    const tEarly = document.getElementById('toggleEarly');
    if (tBoth) tBoth.checked = appConfig.disableBoth;
    if (tLate) tLate.checked = appConfig.disableLate;
    if (tEarly) tEarly.checked = appConfig.disableEarly;
    const tGeo = document.getElementById('toggleGeofence');
    if (tGeo) tGeo.checked = appConfig.disableGeofence;
    const tOT = document.getElementById('toggleHideOvertime');
    if (tOT) tOT.checked = appConfig.hideOvertime;

    const bReason = document.getElementById('bothReasonInput');
    const lReason = document.getElementById('lateReasonInput');
    const eReason = document.getElementById('earlyReasonInput');
    if (bReason) bReason.value = appConfig.disableBothReason || '';
    if (lReason) lReason.value = appConfig.disableLateReason || '';
    if (eReason) eReason.value = appConfig.disableEarlyReason || '';

    updateSettingsVisibility();
}

function updateSettingsVisibility() {
    const bothOn = document.getElementById('toggleBoth')?.checked;
    const lateOn = document.getElementById('toggleLate')?.checked;
    const earlyOn = document.getElementById('toggleEarly')?.checked;

    // Show/hide reason textareas
    document.getElementById('bothReasonWrap')?.classList.toggle('hidden', !bothOn);
    document.getElementById('lateReasonWrap')?.classList.toggle('hidden', !lateOn);
    document.getElementById('earlyReasonWrap')?.classList.toggle('hidden', !earlyOn);

    // When "both" is on, disable individual toggles
    const lateWrap = document.getElementById('settingLateWrap');
    const earlyWrap = document.getElementById('settingEarlyWrap');
    if (lateWrap) {
        lateWrap.style.opacity = bothOn ? '0.5' : '1';
        lateWrap.style.pointerEvents = bothOn ? 'none' : 'auto';
    }
    if (earlyWrap) {
        earlyWrap.style.opacity = bothOn ? '0.5' : '1';
        earlyWrap.style.pointerEvents = bothOn ? 'none' : 'auto';
    }
}

function handleToggleBoth(checked) {
    if (checked) {
        // Turn off individual toggles
        const tLate = document.getElementById('toggleLate');
        const tEarly = document.getElementById('toggleEarly');
        if (tLate) tLate.checked = false;
        if (tEarly) tEarly.checked = false;
    }
    updateSettingsVisibility();
}
function handleToggleLate(checked) { updateSettingsVisibility(); }
function handleToggleEarly(checked) { updateSettingsVisibility(); }
function handleToggleGeofence(checked) { /* no extra UI needed */ }

async function saveFeatureSettings() {
    const disableBoth = document.getElementById('toggleBoth')?.checked || false;
    const disableLate = document.getElementById('toggleLate')?.checked || false;
    const disableEarly = document.getElementById('toggleEarly')?.checked || false;
    const disableBothReason = document.getElementById('bothReasonInput')?.value.trim() || '';
    const disableLateReason = document.getElementById('lateReasonInput')?.value.trim() || '';
    const disableEarlyReason = document.getElementById('earlyReasonInput')?.value.trim() || '';
    const disableGeofence = document.getElementById('toggleGeofence')?.checked || false;
    const hideOvertime = document.getElementById('toggleHideOvertime')?.checked || false;

    appConfig.disableBoth = disableBoth;
    appConfig.disableLate = disableLate;
    appConfig.disableEarly = disableEarly;
    appConfig.disableBothReason = disableBothReason;
    appConfig.disableLateReason = disableLateReason;
    appConfig.disableEarlyReason = disableEarlyReason;
    appConfig.disableGeofence = disableGeofence;
    appConfig.hideOvertime = hideOvertime;

    toggleLoader(true, 'Menyimpan pengaturan...');
    const success = await postData('saveFeatureSettings', {
        disableBoth, disableLate, disableEarly,
        disableBothReason, disableLateReason, disableEarlyReason,
        disableGeofence, hideOvertime
    });
    toggleLoader(false);
    if (success) {
        showToast('Pengaturan fitur berhasil disimpan!', 'success');
    }
}

// ===== DARK MODE TOGGLE =====
function toggleDarkMode() {
    const isDark = document.documentElement.classList.contains('dark');
    const icon = document.getElementById('darkModeIcon');
    
    if (isDark) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('mbg_dark_mode', '0');
        if (icon) icon.className = 'fas fa-moon';
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('mbg_dark_mode', '1');
        if (icon) icon.className = 'fas fa-sun';
    }
}

// Init dark mode from localStorage
(function() {
    const icon = document.getElementById('darkModeIcon');
    if (localStorage.getItem('mbg_dark_mode') === '1') {
        document.documentElement.classList.add('dark');
        if (icon) icon.className = 'fas fa-sun';
    } else {
        if (icon) icon.className = 'fas fa-moon';
    }
})();

// =============================================
// PENGUMUMAN (Surat Pengumuman) System
// =============================================
const pengExcludedDates = []; // [{date: 'YYYY-MM-DD', divisions: Set<string>}]

function renderExcludeDivCheckboxes() {
    const container = document.getElementById('pengExcludeDivChecks');
    if (!container) return;
    const divs = [...new Set(
        employees
            .filter(e => ['employee', 'security', 'foundation'].includes(e.role || 'employee'))
            .map(e => e.division)
            .filter(Boolean)
    )].sort();
    container.innerHTML = divs.map(d =>
        `<label class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] cursor-pointer hover:bg-slate-200 transition select-none">
            <input type="checkbox" class="pengExcDivChk accent-red-500 w-3.5 h-3.5" value="${d}" checked> ${d}
        </label>`
    ).join('');
}

function toggleAllExcludeDivs(state) {
    document.querySelectorAll('.pengExcDivChk').forEach(c => c.checked = state);
}

function addExcludedDate() {
    const input = document.getElementById('pengExcludeDate');
    const val = input?.value;
    if (!val) return;
    const checkedDivs = [...document.querySelectorAll('.pengExcDivChk:checked')].map(c => c.value);
    if (checkedDivs.length === 0) return showToast('Pilih minimal 1 divisi untuk dikecualikan.', 'error');
    // Check if date already exists, merge divisions
    const existing = pengExcludedDates.find(e => e.date === val);
    if (existing) {
        checkedDivs.forEach(d => existing.divisions.add(d));
    } else {
        pengExcludedDates.push({ date: val, divisions: new Set(checkedDivs) });
    }
    input.value = '';
    renderExcludedList();
}

function removeExcludedDate(date) {
    const idx = pengExcludedDates.findIndex(e => e.date === date);
    if (idx !== -1) pengExcludedDates.splice(idx, 1);
    renderExcludedList();
}

function removeExcludedDiv(date, div) {
    const entry = pengExcludedDates.find(e => e.date === date);
    if (!entry) return;
    entry.divisions.delete(div);
    if (entry.divisions.size === 0) {
        pengExcludedDates.splice(pengExcludedDates.indexOf(entry), 1);
    }
    renderExcludedList();
}

function isDateExcludedForDiv(date, division) {
    const entry = pengExcludedDates.find(e => e.date === date);
    if (!entry) return false;
    return entry.divisions.has(division);
}

function renderExcludedList() {
    const container = document.getElementById('pengExcludedList');
    if (!container) return;
    const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const sorted = [...pengExcludedDates].sort((a, b) => a.date.localeCompare(b.date));
    container.innerHTML = sorted.map(entry => {
        const dt = new Date(entry.date + 'T00:00:00');
        const dateLabel = `${dayNames[dt.getDay()]}, ${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
        const divTags = [...entry.divisions].sort().map(d =>
            `<span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-medium">
                ${d} <button onclick="removeExcludedDiv('${entry.date}','${d}')" class="text-red-300 hover:text-red-600 ml-0.5">&times;</button>
            </span>`
        ).join('');
        return `<div class="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-red-50 border border-red-200">
            <span class="font-bold text-red-700 text-xs">${dateLabel}</span>
            <span class="text-slate-400 text-[10px]">—</span>
            ${divTags}
            <button onclick="removeExcludedDate('${entry.date}')" class="ml-auto text-red-400 hover:text-red-700 text-xs font-bold" title="Hapus semua"><i class="fas fa-trash-alt"></i></button>
        </div>`;
    }).join('');
}

function initPengumumanTab() {
    const today = new Date();
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(today.getDate() - 13);
    const mulaiEl = document.getElementById('pengTglMulai');
    const selesaiEl = document.getElementById('pengTglSelesai');
    if (mulaiEl && !mulaiEl.value) mulaiEl.value = getLocalDateStr(twoWeeksAgo);
    if (selesaiEl && !selesaiEl.value) selesaiEl.value = getLocalDateStr(today);
    renderExcludeDivCheckboxes();
}

function renderPengumumanPreview() {
    const tglMulai = document.getElementById('pengTglMulai')?.value;
    const tglSelesai = document.getElementById('pengTglSelesai')?.value;
    if (!tglMulai || !tglSelesai) return showToast('Pilih periode tanggal terlebih dahulu.', 'error');

    const allowedEmpIds = new Set(
        employees
            .filter(e => ['employee', 'security', 'foundation'].includes(e.role || 'employee'))
            .map(e => String(e.id))
    );

    const noSurat = document.getElementById('pengNoSurat')?.value || '-';
    const perihal = document.getElementById('pengPerihal')?.value || 'Laporan Kehadiran Relawan';
    const showHadir = document.getElementById('pengChkHadir')?.checked;
    const showTidakHadir = document.getElementById('pengChkTidakHadir')?.checked;
    const showTelat = document.getElementById('pengChkTelat')?.checked;
    const showTelat30 = document.getElementById('pengChkTelat30')?.checked;
    const showLembur = document.getElementById('pengChkLembur')?.checked;

    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const now = new Date();
    const dM = new Date(tglMulai + 'T00:00:00');
    const dS = new Date(tglSelesai + 'T00:00:00');
    const periodeText = `${dM.getDate()} ${bulan[dM.getMonth()]} ${dM.getFullYear()} — ${dS.getDate()} ${bulan[dS.getMonth()]} ${dS.getFullYear()}`;
    const tanggalSurat = `Jakarta, ${now.getDate()} ${bulan[now.getMonth()]} ${now.getFullYear()}`;

    // Set header surat
    document.getElementById('pengPrintJudul').textContent = perihal;
    document.getElementById('pengPrintNoSurat').textContent = `No: ${noSurat}`;
    document.getElementById('pengPrintTanggal').textContent = tanggalSurat;
    document.getElementById('pengPrintPerihal').textContent = perihal;
    document.getElementById('pengPrintPeriode').textContent = periodeText;
    document.getElementById('pengPrintTtdTanggal').textContent = tanggalSurat;

    // Filter logs by period
    const filteredLogs = logs.filter(l => l.date >= tglMulai && l.date <= tglSelesai);

    // Hari kerja per divisi
    const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    function getWorkDaysForDiv(division) {
        const d = (division || '').toLowerCase();
        if (d.includes('helper cook') || d === 'cook' || d.includes('head chef')) {
            return [0, 1, 2, 3, 4]; // Minggu-Kamis
        }
        return [1, 2, 3, 4, 5, 6]; // Senin-Sabtu
    }

    // Build all dates in period
    const allDatesInPeriod = [];
    for (let d = new Date(dM); d <= dS; d.setDate(d.getDate() + 1)) {
        const ds = getLocalDateStr(d);
        allDatesInPeriod.push({ date: ds, day: d.getDay() });
    }

    function getWorkDatesForDiv(division) {
        const days = getWorkDaysForDiv(division);
        return allDatesInPeriod
            .filter(d => days.includes(d.day) && !getHoliday(d.date) && !isDateExcludedForDiv(d.date, division))
            .map(d => d.date);
    }

    function formatDateShort(ds) {
        const dt = new Date(ds + 'T00:00:00');
        return `${dayNames[dt.getDay()]}, ${dt.getDate()}/${dt.getMonth() + 1}`;
    }

    // Hadir = tanggal yang punya IN dan OUT (pasangan), hitung jumlah pair per hari
    function getHadirMap(empId, empWorkDates) {
        const empLogs = filteredLogs.filter(l => String(l.empId) === String(empId));
        const hadirMap = new Map(); // date -> count
        empWorkDates.forEach(wd => {
            const inCount = empLogs.filter(l => l.type === 'IN' && l.date === wd).length;
            if (inCount === 0) return;
            const nextDay = new Date(new Date(wd + 'T00:00:00').getTime() + 86400000);
            const nextDayStr = getLocalDateStr(nextDay);
            const outCount = empLogs.filter(l => l.type === 'OUT' && (l.date === wd || l.date === nextDayStr)).length;
            const pairs = Math.min(inCount, outCount);
            if (pairs > 0) hadirMap.set(wd, pairs);
        });
        return hadirMap;
    }

    function formatDateWithCount(ds, count) {
        const dt = new Date(ds + 'T00:00:00');
        const label = `${dayNames[dt.getDay()]}, ${dt.getDate()}/${dt.getMonth() + 1}`;
        return count > 1 ? `${label} <b>x${count}</b>` : label;
    }

    // Section label counter
    let sectionIdx = 0;
    const sectionLetters = 'ABCDEFGH';
    function nextSection() { return sectionLetters[sectionIdx++] || String(sectionIdx); }

    // --- DATA HADIR ---
    const hadirEl = document.getElementById('pengDataHadir');
    if (showHadir) {
        const label = nextSection();
        const empHadirData = employees
            .filter(e => ['employee', 'security', 'foundation'].includes(e.role || 'employee'))
            .map(e => {
            const empWorkDates = getWorkDatesForDiv(e.division);
            const hadirMap = getHadirMap(e.id, empWorkDates);
            const hadirDates = empWorkDates.filter(d => hadirMap.has(d));
            const hadirCount = hadirDates.reduce((sum, d) => sum + hadirMap.get(d), 0);
            return { name: e.name, division: e.division, hadirCount, total: empWorkDates.length, hadirDates, hadirMap };
        }).filter(e => e.hadirCount > 0);

        if (empHadirData.length > 0) {
            hadirEl.innerHTML = `
                <h4 style="font-size:13px; font-weight:700; margin:16px 0 8px;">${label}. Daftar Kehadiran</h4>
                <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:12px;">
                    <thead>
                        <tr style="background:#ecfdf5;">
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center; width:35px;">No</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Nama</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Divisi</th>
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Hadir</th>
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Total</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Hari Kehadiran</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${empHadirData.map((e, i) => `<tr>
                            <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${i + 1}</td>
                            <td style="border:1px solid #cbd5e1; padding:5px;">${e.name}</td>
                            <td style="border:1px solid #cbd5e1; padding:5px;">${e.division}</td>
                            <td style="border:1px solid #cbd5e1; padding:5px; text-align:center; color:#059669; font-weight:700;">${e.hadirCount}</td>
                            <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${e.total}</td>
                            <td style="border:1px solid #cbd5e1; padding:5px; font-size:9px;">${e.hadirDates.map(d => formatDateWithCount(d, e.hadirMap.get(d))).join(', ')}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>`;
        } else {
            hadirEl.innerHTML = `<h4 style="font-size:13px; font-weight:700; margin:16px 0 8px;">${label}. Daftar Kehadiran</h4><p style="font-size:11px; color:#777; margin:0 0 12px;">Belum ada data kehadiran pada periode ini.</p>`;
        }
    } else {
        hadirEl.innerHTML = '';
    }

    // --- DATA TIDAK HADIR ---
    const tidakHadirEl = document.getElementById('pengDataTidakHadir');
    if (showTidakHadir) {
        const label = nextSection();
        const empTidakData = employees
            .filter(e => ['employee', 'security', 'foundation'].includes(e.role || 'employee'))
            .map(e => {
            const empWorkDates = getWorkDatesForDiv(e.division);
            const hadirMap = getHadirMap(e.id, empWorkDates);
            const tidakHadirDates = empWorkDates.filter(d => !hadirMap.has(d));
            return { name: e.name, division: e.division, tidakCount: tidakHadirDates.length, total: empWorkDates.length, tidakHadirDates };
        }).filter(e => e.tidakCount > 0);

        if (empTidakData.length > 0) {
            tidakHadirEl.innerHTML = `
                <h4 style="font-size:13px; font-weight:700; margin:16px 0 8px;">${label}. Daftar Tidak Hadir</h4>
                <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:12px;">
                    <thead>
                        <tr style="background:#fef2f2;">
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center; width:35px;">No</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Nama</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Divisi</th>
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Tidak Hadir</th>
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Total</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Hari Tidak Masuk</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${empTidakData.map((e, i) => `<tr>
                            <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${i + 1}</td>
                            <td style="border:1px solid #cbd5e1; padding:5px;">${e.name}</td>
                            <td style="border:1px solid #cbd5e1; padding:5px;">${e.division}</td>
                            <td style="border:1px solid #cbd5e1; padding:5px; text-align:center; color:#dc2626; font-weight:700;">${e.tidakCount}</td>
                            <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${e.total}</td>
                            <td style="border:1px solid #cbd5e1; padding:5px; font-size:9px; color:#dc2626;">${e.tidakHadirDates.map(formatDateShort).join(', ')}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>`;
        } else {
            tidakHadirEl.innerHTML = `<h4 style="font-size:13px; font-weight:700; margin:16px 0 8px;">${label}. Daftar Tidak Hadir</h4><p style="font-size:11px; color:#777; margin:0 0 12px;">Semua relawan hadir pada periode ini.</p>`;
        }
    } else {
        tidakHadirEl.innerHTML = '';
    }

    // --- DATA KETERLAMBATAN (5-30 menit) ---
    const telatEl = document.getElementById('pengDataTelat');
    if (showTelat) {
        const label = nextSection();
        const lateLogs = filteredLogs.filter(l => l.type === 'IN' && l.lateMinutes >= 5 && l.lateMinutes <= 30 && allowedEmpIds.has(String(l.empId)));
        if (lateLogs.length > 0) {
            telatEl.innerHTML = `
                <h4 style="font-size:13px; font-weight:700; margin:16px 0 8px;">${label}. Daftar Keterlambatan (5–30 Menit)</h4>
                <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:12px;">
                    <thead>
                        <tr style="background:#fef2f2;">
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center; width:35px;">No</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Nama</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Divisi</th>
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Tanggal</th>
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Telat (Menit)</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Keterangan</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lateLogs.map((l, i) => {
                            const emp = employees.find(e => String(e.id) === String(l.empId));
                            return `<tr>
                                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${i + 1}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px;">${l.name}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px;">${emp ? emp.division : '-'}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${l.date}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center; color:#dc2626; font-weight:700;">${l.lateMinutes}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px; font-size:10px;">${(l.note || '-').replace(/\[.*?\]\s*/g, '')}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>`;
        } else {
            telatEl.innerHTML = `<h4 style="font-size:13px; font-weight:700; margin:16px 0 8px;">${label}. Daftar Keterlambatan (5–30 Menit)</h4><p style="font-size:11px; color:#777; margin:0 0 12px;">Tidak ada data keterlambatan pada periode ini.</p>`;
        }
    } else {
        telatEl.innerHTML = '';
    }

    // --- DATA TELAT > 30 MENIT ---
    const telat30El = document.getElementById('pengDataTelat30');
    if (showTelat30) {
        const label = nextSection();
        const lateLogs30 = filteredLogs.filter(l => l.type === 'IN' && l.lateMinutes > 30 && allowedEmpIds.has(String(l.empId)));
        if (lateLogs30.length > 0) {
            telat30El.innerHTML = `
                <h4 style="font-size:13px; font-weight:700; margin:16px 0 8px;">${label}. Daftar Keterlambatan Lebih dari 30 Menit</h4>
                <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:12px;">
                    <thead>
                        <tr style="background:#fef2f2;">
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center; width:35px;">No</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Nama</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Divisi</th>
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Tanggal</th>
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Telat (Menit)</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Keterangan</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lateLogs30.map((l, i) => {
                            const emp = employees.find(e => String(e.id) === String(l.empId));
                            return `<tr>
                                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${i + 1}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px;">${l.name}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px;">${emp ? emp.division : '-'}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${l.date}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center; color:#dc2626; font-weight:700;">${l.lateMinutes}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px; font-size:10px;">${(l.note || '-').replace(/\[.*?\]\s*/g, '')}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>`;
        } else {
            telat30El.innerHTML = `<h4 style="font-size:13px; font-weight:700; margin:16px 0 8px;">${label}. Daftar Keterlambatan Lebih dari 30 Menit</h4><p style="font-size:11px; color:#777; margin:0 0 12px;">Tidak ada data pada periode ini.</p>`;
        }
    } else {
        telat30El.innerHTML = '';
    }

    // --- DATA LEMBUR ---
    const lemburEl = document.getElementById('pengDataLembur');
    if (showLembur) {
        const label = nextSection();
        const otLogs = filteredLogs.filter(l => l.type === 'OUT' && l.overtime > 0 && allowedEmpIds.has(String(l.empId)));
        if (otLogs.length > 0) {
            lemburEl.innerHTML = `
                <h4 style="font-size:13px; font-weight:700; margin:16px 0 8px;">${label}. Daftar Lembur</h4>
                <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:12px;">
                    <thead>
                        <tr style="background:#fefce8;">
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center; width:35px;">No</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Nama</th>
                            <th style="border:1px solid #cbd5e1; padding:6px;">Divisi</th>
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Tanggal</th>
                            <th style="border:1px solid #cbd5e1; padding:6px; text-align:center;">Jam Lembur</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${otLogs.map((l, i) => {
                            const emp = employees.find(e => String(e.id) === String(l.empId));
                            return `<tr>
                                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${i + 1}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px;">${l.name}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px;">${emp ? emp.division : '-'}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center;">${l.date}</td>
                                <td style="border:1px solid #cbd5e1; padding:5px; text-align:center; color:#d97706; font-weight:700;">${l.overtime} Jam</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>`;
        } else {
            lemburEl.innerHTML = `<h4 style="font-size:13px; font-weight:700; margin:16px 0 8px;">${label}. Daftar Lembur</h4><p style="font-size:11px; color:#777; margin:0 0 12px;">Tidak ada data lembur pada periode ini.</p>`;
        }
    } else {
        lemburEl.innerHTML = '';
    }

    // Show content, hide empty state
    document.getElementById('pengumumanContent').classList.remove('hidden');
    document.getElementById('pengumumanEmpty').classList.add('hidden');
}

function cetakPengumuman() {
    // Ensure preview is rendered
    const content = document.getElementById('pengumumanContent');
    if (content.classList.contains('hidden')) {
        renderPengumumanPreview();
        if (content.classList.contains('hidden')) return;
    }

    // Show kop & content for print
    const kopEl = document.getElementById('kopSuratPengumuman');
    kopEl.classList.remove('hidden');
    content.classList.remove('hidden');

    // Hide other tabs' printables
    const salaryPrint = document.getElementById('printAreaSalary');
    const origSalaryDisplay = salaryPrint ? salaryPrint.style.display : '';
    if (salaryPrint) salaryPrint.style.display = 'none';

    // Set document title for PDF filename
    const origTitle = document.title;
    const perihal = document.getElementById('pengPerihal')?.value || 'Pengumuman';
    document.title = `Surat_${perihal.replace(/\s+/g, '_')}.pdf`;

    window.print();

    // Restore
    setTimeout(() => {
        document.title = origTitle;
        kopEl.classList.add('hidden');
        if (salaryPrint) salaryPrint.style.display = origSalaryDisplay;
    }, 500);
}

// =============================================
// MANUAL ATTENDANCE (Absen Manual) System
// =============================================
let maSelectedEmployees = new Set();
let maSelectedDates = new Set();
let maCalendarDate = new Date();
let maSelectionMode = 'all'; // 'all' | 'division' | 'individual'
let maSelectedDivisions = new Set();
let maPaused = false;
let maSending = false;
const MA_CHECKPOINT_KEY = 'maCheckpoint';

// Hari Libur Nasional Indonesia (format: 'MM-DD' untuk tahunan, 'YYYY-MM-DD' untuk spesifik)
// Update setiap tahun untuk tanggal yang berubah (hijriah, imlek, dll)
const INDONESIA_HOLIDAYS = {
    // === 2025 ===
    '2025-01-01': 'Tahun Baru Masehi',
    '2025-01-27': 'Isra Miraj Nabi Muhammad SAW',
    '2025-01-29': 'Tahun Baru Imlek',
    '2025-03-28': 'Hari Suci Nyepi',
    '2025-03-29': 'Hari Raya Idul Fitri',
    '2025-03-30': 'Hari Raya Idul Fitri',
    '2025-03-31': 'Cuti Bersama Idul Fitri',
    '2025-04-01': 'Cuti Bersama Idul Fitri',
    '2025-04-18': 'Wafat Isa Al Masih',
    '2025-05-01': 'Hari Buruh Internasional',
    '2025-05-12': 'Hari Raya Waisak',
    '2025-05-29': 'Kenaikan Isa Al Masih',
    '2025-06-01': 'Hari Lahir Pancasila',
    '2025-06-06': 'Hari Raya Idul Adha',
    '2025-06-27': 'Tahun Baru Hijriah',
    '2025-08-17': 'Hari Kemerdekaan RI',
    '2025-09-05': 'Maulid Nabi Muhammad SAW',
    '2025-12-25': 'Hari Natal',
    // === 2026 ===
    '2026-01-01': 'Tahun Baru Masehi',
    '2026-01-16': 'Isra Miraj Nabi Muhammad SAW',
    '2026-02-17': 'Tahun Baru Imlek',
    '2026-03-17': 'Hari Suci Nyepi',
    '2026-03-20': 'Hari Raya Idul Fitri',
    '2026-03-21': 'Hari Raya Idul Fitri',
    '2026-03-22': 'Cuti Bersama Idul Fitri',
    '2026-03-23': 'Cuti Bersama Idul Fitri',
    '2026-04-03': 'Wafat Isa Al Masih',
    '2026-05-01': 'Hari Buruh Internasional',
    '2026-05-16': 'Kenaikan Isa Al Masih',
    '2026-05-26': 'Hari Raya Idul Adha',
    '2026-05-31': 'Hari Raya Waisak',
    '2026-06-01': 'Hari Lahir Pancasila',
    '2026-06-17': 'Tahun Baru Hijriah',
    '2026-08-17': 'Hari Kemerdekaan RI',
    '2026-08-26': 'Maulid Nabi Muhammad SAW',
    '2026-12-25': 'Hari Natal',
    // === 2027 ===
    '2027-01-01': 'Tahun Baru Masehi',
    '2027-01-05': 'Isra Miraj Nabi Muhammad SAW',
    '2027-02-06': 'Tahun Baru Imlek',
    '2027-03-09': 'Hari Raya Idul Fitri',
    '2027-03-10': 'Hari Raya Idul Fitri',
    '2027-03-11': 'Cuti Bersama Idul Fitri',
    '2027-03-12': 'Cuti Bersama Idul Fitri',
    '2027-03-26': 'Wafat Isa Al Masih',
    '2027-04-07': 'Hari Suci Nyepi',
    '2027-05-01': 'Hari Buruh Internasional',
    '2027-05-06': 'Kenaikan Isa Al Masih',
    '2027-05-16': 'Hari Raya Idul Adha',
    '2027-05-20': 'Hari Raya Waisak',
    '2027-06-01': 'Hari Lahir Pancasila',
    '2027-06-06': 'Tahun Baru Hijriah',
    '2027-08-15': 'Maulid Nabi Muhammad SAW',
    '2027-08-17': 'Hari Kemerdekaan RI',
    '2027-12-25': 'Hari Natal',
};

function getHoliday(dateStr) {
    return INDONESIA_HOLIDAYS[dateStr] || null;
}

function maInit() {
    maSetMode('all');
    maRenderCalendar();
    maRenderHistory();
    maTypeChanged();
    maCheckForResume();
}

function maSetMode(mode) {
    maSelectionMode = mode;
    // Update button styles
    document.querySelectorAll('.ma-mode-btn').forEach(b => {
        b.className = b.className.replace(/bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600\/20/g, 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600');
    });
    const activeBtn = document.getElementById(mode === 'all' ? 'maModeAll' : mode === 'division' ? 'maModeDivision' : 'maModeIndividual');
    if (activeBtn) activeBtn.className = activeBtn.className.replace(/bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600/g, 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20');

    document.getElementById('maDivisionSection').classList.toggle('hidden', mode !== 'division');
    document.getElementById('maIndividualSection').classList.toggle('hidden', mode !== 'individual');

    // Update selection
    maSelectedEmployees.clear();
    maSelectedDivisions.clear();
    if (mode === 'all') {
        employees.forEach(e => maSelectedEmployees.add(e.id));
    } else if (mode === 'division') {
        maRenderDivisionChips();
    } else {
        maRenderEmployeeList();
    }
    // Show/hide exclude section for all/division modes
    document.getElementById('maExcludeSection').classList.toggle('hidden', mode === 'individual');
    document.getElementById('maExcludePanel').classList.add('hidden');
    document.getElementById('maExcludeArrow').style.transform = '';
    const searchEl = document.getElementById('maExcludeSearch');
    if (searchEl) searchEl.value = '';
    maRenderExcludeList();
    maUpdateCount();
}

function maGetDivisions() {
    const divs = new Set();
    employees
        .filter(e => ['employee', 'security', 'foundation'].includes(e.role || 'employee'))
        .forEach(e => { if (e.division) divs.add(e.division); });
    return [...divs].sort();
}

function maRenderDivisionChips() {
    const container = document.getElementById('maDivisionChips');
    const divs = maGetDivisions();
    container.innerHTML = divs.map(d => {
        const isActive = maSelectedDivisions.has(d);
        const count = employees
            .filter(e => ['employee', 'security', 'foundation'].includes(e.role || 'employee'))
            .filter(e => e.division === d).length;
        return `<button onclick="maToggleDivision('${d.replace(/'/g, "\\'")}')" class="px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
            isActive ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
        }">${d} <span class="opacity-60">(${count})</span></button>`;
    }).join('');
}

function maToggleDivision(div) {
    if (maSelectedDivisions.has(div)) maSelectedDivisions.delete(div);
    else maSelectedDivisions.add(div);
    // Rebuild selected employees from selected divisions
    maSelectedEmployees.clear();
    employees
        .filter(e => ['employee', 'security', 'foundation'].includes(e.role || 'employee'))
        .forEach(e => { if (maSelectedDivisions.has(e.division)) maSelectedEmployees.add(e.id); });
    maRenderDivisionChips();
    maRenderExcludeList();
    maUpdateCount();
}

function maToggleExcludePanel() {
    const panel = document.getElementById('maExcludePanel');
    const arrow = document.getElementById('maExcludeArrow');
    const isHidden = panel.classList.toggle('hidden');
    arrow.style.transform = isHidden ? '' : 'rotate(180deg)';
    if (!isHidden) maRenderExcludeList();
}

function maRenderExcludeList() {
    const container = document.getElementById('maExcludeList');
    if (!container) return;
    const search = (document.getElementById('maExcludeSearch')?.value || '').toLowerCase();
    // Show employees that are in the current selection pool
    const allowedPool = employees.filter(e => ['employee', 'security', 'foundation'].includes(e.role || 'employee'));
    let pool;
    if (maSelectionMode === 'all') pool = allowedPool;
    else if (maSelectionMode === 'division') pool = allowedPool.filter(e => maSelectedDivisions.has(e.division));
    else return;
    const filtered = pool.filter(e => e.name.toLowerCase().includes(search));
    if (filtered.length === 0) {
        container.innerHTML = '<div class="p-3 text-center text-xs text-slate-400">Tidak ada relawan</div>';
        return;
    }
    container.innerHTML = filtered.map(e => {
        const isIncluded = maSelectedEmployees.has(e.id);
        return `<label class="flex items-center gap-3 px-4 py-2 hover:bg-orange-50 cursor-pointer transition-colors">
            <input type="checkbox" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" ${isIncluded ? 'checked' : ''} onchange="maToggleExclude('${e.id}', this.checked)">
            <span class="text-xs ${isIncluded ? 'text-slate-700' : 'text-slate-400 line-through'}">${e.name}</span>
            <span class="text-[10px] text-slate-400 ml-auto">${e.division || '-'}</span>
        </label>`;
    }).join('');
}

function maToggleExclude(id, checked) {
    if (checked) maSelectedEmployees.add(id); else maSelectedEmployees.delete(id);
    maRenderExcludeList();
    maUpdateCount();
}

function maRenderEmployeeList(filter = '') {
    const container = document.getElementById('maEmployeeList');
    const filtered = employees
        .filter(e => ['employee', 'security', 'foundation'].includes(e.role || 'employee'))
        .filter(e => e.name.toLowerCase().includes(filter.toLowerCase()));
    container.innerHTML = filtered.length === 0 ? '<div class="p-4 text-center text-xs text-slate-400">Tidak ada relawan ditemukan</div>' :
        filtered.map(e => `
        <label class="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/50 cursor-pointer transition-colors">
            <input type="checkbox" class="ma-emp-cb w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" value="${e.id}" ${maSelectedEmployees.has(e.id)?'checked':''} onchange="maToggleEmployee('${e.id}', this.checked)">
            <span class="text-sm text-slate-700">${e.name}</span>
            <span class="text-[10px] text-slate-400 ml-auto">${e.division || '-'}</span>
        </label>`).join('');
    maUpdateCount();
}

function maFilterEmployees() {
    maRenderEmployeeList(document.getElementById('maSearchEmployee').value);
}

function maToggleEmployee(id, checked) {
    if (checked) maSelectedEmployees.add(id); else maSelectedEmployees.delete(id);
    maUpdateCount();
}

function maSelectAll() {
    const filter = document.getElementById('maSearchEmployee').value.toLowerCase();
    employees.filter(e => e.name.toLowerCase().includes(filter)).forEach(e => maSelectedEmployees.add(e.id));
    maRenderEmployeeList(filter);
}

function maDeselectAll() {
    maSelectedEmployees.clear();
    maRenderEmployeeList(document.getElementById('maSearchEmployee').value);
}

function maUpdateCount() {
    document.getElementById('maSelectedCount').textContent = maSelectedEmployees.size + ' dipilih';
}

function maChangeMonth(delta) {
    maCalendarDate.setMonth(maCalendarDate.getMonth() + delta);
    maRenderCalendar();
}

function maRenderCalendar() {
    const year = maCalendarDate.getFullYear();
    const month = maCalendarDate.getMonth();
    const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    document.getElementById('maCalendarMonth').textContent = monthNames[month] + ' ' + year;

    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById('maCalendarGrid');
    let html = '';

    for (let i = 0; i < firstDay; i++) html += '<div></div>';

    const holidaysThisMonth = [];

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isSelected = maSelectedDates.has(dateStr);
        const dayOfWeek = new Date(year, month, d).getDay();
        const isSunday = dayOfWeek === 0;
        const holiday = getHoliday(dateStr);

        if (holiday) holidaysThisMonth.push({ date: d, name: holiday });

        let btnClass = 'h-9 rounded-lg text-xs font-bold transition-all active:scale-90 relative ';
        if (isSelected) {
            btnClass += 'bg-blue-600 text-white shadow-md shadow-blue-600/30';
        } else if (holiday) {
            btnClass += 'bg-red-50 text-red-600 hover:bg-red-100 ring-1 ring-red-200';
        } else if (isSunday) {
            btnClass += 'text-red-500 hover:bg-red-50';
        } else {
            btnClass += 'text-slate-600 hover:bg-blue-100';
        }

        const tooltip = holiday ? ` title="${holiday}"` : (isSunday ? ' title="Hari Minggu"' : '');
        const dot = holiday ? '<span class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-400"></span>' : '';

        html += `<button onclick="maToggleDate('${dateStr}')"${tooltip} class="${btnClass}">${d}${dot}</button>`;
    }
    grid.innerHTML = html;
    maRenderDateTags();

    // Render holiday legend below calendar
    const legendEl = document.getElementById('maHolidayLegend');
    if (legendEl) {
        if (holidaysThisMonth.length === 0) {
            legendEl.innerHTML = '';
        } else {
            legendEl.innerHTML = '<div class="mt-3 space-y-1">' +
                '<p class="text-[10px] font-bold text-red-400 uppercase tracking-wider"><i class="fas fa-calendar-times mr-1"></i>Hari Libur Nasional</p>' +
                holidaysThisMonth.map(h =>
                    `<div class="flex items-center gap-2 text-[11px]"><span class="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span><span class="text-red-600 font-bold">${h.date}</span><span class="text-slate-500">${h.name}</span></div>`
                ).join('') + '</div>';
        }
    }
}

function maToggleDate(dateStr) {
    if (maSelectedDates.has(dateStr)) maSelectedDates.delete(dateStr); else maSelectedDates.add(dateStr);
    maRenderCalendar();
}

function maRenderDateTags() {
    const container = document.getElementById('maSelectedDatesTags');
    const sorted = [...maSelectedDates].sort();
    container.innerHTML = sorted.length === 0 ? '<span class="text-xs text-slate-400 italic">Belum ada tanggal dipilih</span>' :
        sorted.map(d => `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-100">${d} <button onclick="maRemoveDate('${d}')" class="text-blue-400 hover:text-red-500 ml-0.5">&times;</button></span>`).join('');
}

function maRemoveDate(dateStr) {
    maSelectedDates.delete(dateStr);
    maRenderCalendar();
}

function maTypeChanged() {
    const type = document.getElementById('maType').value;
    const outWrap = document.getElementById('maTimeOutWrap');
    const inLabel = document.getElementById('maTimeLabelIn');
    if (type === 'BOTH') {
        outWrap.classList.remove('hidden');
        inLabel.textContent = 'Jam Masuk (opsional, default sesuai shift)';
    } else {
        outWrap.classList.add('hidden');
        document.getElementById('maTimeOut').value = '';
        inLabel.textContent = 'Jam (opsional, default sesuai shift)';
    }
}

function maRenderHistory() {
    const tbody = document.getElementById('maHistoryBody');
    const manualLogs = logs.filter(l => l.absentBy === 'Admin').slice(-50).reverse();
    if (manualLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-xs text-slate-400">Belum ada riwayat absen manual</td></tr>';
        return;
    }
    tbody.innerHTML = manualLogs.map(l => `
        <tr class="hover:bg-slate-50/50 transition-colors">
            <td class="px-6 py-3 text-slate-600 text-xs whitespace-nowrap">${l.date} ${l.time || ''}</td>
            <td class="px-6 py-3 text-slate-700 font-bold text-xs">${l.name}</td>
            <td class="px-6 py-3 text-center"><span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${l.type==='IN'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${l.type}</span></td>
            <td class="px-6 py-3 text-slate-500 text-xs">${l.note || '-'}</td>
            <td class="px-6 py-3 text-slate-400 text-xs">${l.absentBy}</td>
        </tr>`).join('');
}

// === Checkpoint helpers ===
function maSaveCheckpoint(entries, nextIndex, successCount, failCount) {
    const cp = { entries, nextIndex, successCount, failCount, savedAt: new Date().toISOString() };
    try { localStorage.setItem(MA_CHECKPOINT_KEY, JSON.stringify(cp)); } catch(e) { console.warn('Checkpoint save failed', e); }
}
function maLoadCheckpoint() {
    try { const raw = localStorage.getItem(MA_CHECKPOINT_KEY); return raw ? JSON.parse(raw) : null; } catch(e) { return null; }
}
function maClearCheckpoint() {
    try { localStorage.removeItem(MA_CHECKPOINT_KEY); } catch(e) {}
}

function maCheckForResume() {
    const cp = maLoadCheckpoint();
    const banner = document.getElementById('maResumeBanner');
    if (!banner) return;
    if (!cp || cp.nextIndex >= cp.entries.length) {
        banner.classList.add('hidden');
        maClearCheckpoint();
        return;
    }
    const remaining = cp.entries.length - cp.nextIndex;
    const pct = Math.round((cp.nextIndex / cp.entries.length) * 100);
    const savedDate = new Date(cp.savedAt);
    const timeStr = savedDate.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('maResumeInfo').textContent = `${cp.successCount} berhasil, ${remaining} sisa dari ${cp.entries.length} total — terakhir ${timeStr}`;
    document.getElementById('maResumeProgressBar').style.width = pct + '%';
    banner.classList.remove('hidden');
}

function maDiscardCheckpoint() {
    if (!confirm('Buang semua data checkpoint? Entri yang belum terkirim akan hilang.')) return;
    maClearCheckpoint();
    document.getElementById('maResumeBanner').classList.add('hidden');
    showToast('Checkpoint dibuang.', 'success');
}

function maResumeCheckpoint() {
    const cp = maLoadCheckpoint();
    if (!cp) { showToast('Tidak ada checkpoint.', 'error'); return; }
    document.getElementById('maResumeBanner').classList.add('hidden');
    maSendEntries(cp.entries, cp.nextIndex, cp.successCount, cp.failCount);
}

function maPauseSubmit() {
    maPaused = true;
    const pauseBtn = document.getElementById('maPauseBtn');
    if (pauseBtn) {
        pauseBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menjeda...';
        pauseBtn.disabled = true;
    }
}

function maUpdateProgress(current, total, successCount, failCount, entryName) {
    const pct = Math.round((current / total) * 100);
    const panel = document.getElementById('maProgressPanel');
    panel.classList.remove('hidden');
    document.getElementById('maProgressBar').style.width = pct + '%';
    document.getElementById('maProgressCount').textContent = `${current}/${total}`;
    document.getElementById('maProgressLabel').textContent = `Mengirim... ${pct}%`;
    const failText = failCount > 0 ? ` | ${failCount} gagal` : '';
    document.getElementById('maProgressDetail').textContent = `✓ ${successCount} berhasil${failText} — ${entryName}`;
}

async function maSendOneEntry(entry) {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const form = new URLSearchParams();
            const dataObj = { action: 'attendance', ...entry };
            Object.keys(dataObj).forEach(k => {
                if (dataObj[k] === undefined || dataObj[k] === null) return;
                form.append(k, String(dataObj[k]));
            });
            const res = await fetch(SCRIPT_URL, { method: 'POST', body: form, redirect: 'follow' });
            let json = null;
            try { json = await res.json(); } catch(e) {}
            if (json && json.status === 'success') return true;
            // Server responded but not success — retry with backoff
        } catch(e) {
            console.warn(`Attempt ${attempt+1} failed for ${entry.name}:`, e);
        }
        if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); // 2s, 4s backoff
        }
    }
    return false;
}

async function maSendEntries(entries, startIndex = 0, successCount = 0, failCount = 0) {
    if (maSending) return;
    maSending = true;
    maPaused = false;

    const btn = document.getElementById('maSubmitBtn');
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';

    const pauseBtn = document.getElementById('maPauseBtn');
    if (pauseBtn) { pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Jeda'; pauseBtn.disabled = false; }
    document.getElementById('maProgressPanel').classList.remove('hidden');

    let consecutiveFails = 0;

    for (let i = startIndex; i < entries.length; i++) {
        // Check if paused
        if (maPaused) {
            maSaveCheckpoint(entries, i, successCount, failCount);
            showToast(`Dijeda. ${successCount} berhasil, ${entries.length - i} tersisa. Bisa dilanjutkan nanti.`, 'success');
            document.getElementById('maProgressPanel').classList.add('hidden');
            btn.disabled = false;
            btn.innerHTML = origHTML;
            maSending = false;
            maCheckForResume();
            return;
        }

        const entry = entries[i];
        maUpdateProgress(i, entries.length, successCount, failCount, `${entry.name} (${entry.type})`);

        const ok = await maSendOneEntry(entry);
        if (ok) {
            successCount++;
            consecutiveFails = 0;
        } else {
            failCount++;
            consecutiveFails++;
        }

        // Save checkpoint after every entry
        maSaveCheckpoint(entries, i + 1, successCount, failCount);

        // Auto-pause after 3 consecutive failures (server likely overloaded)
        if (consecutiveFails >= 3) {
            maSaveCheckpoint(entries, i + 1, successCount, failCount);
            showToast(`3x gagal berturut — otomatis dijeda. ${successCount} berhasil, ${entries.length - (i+1)} tersisa.`, 'error');
            document.getElementById('maProgressPanel').classList.add('hidden');
            btn.disabled = false;
            btn.innerHTML = origHTML;
            maSending = false;
            maCheckForResume();
            return;
        }
    }

    // All done!
    maUpdateProgress(entries.length, entries.length, successCount, failCount, 'Selesai!');
    maClearCheckpoint();
    document.getElementById('maProgressPanel').classList.add('hidden');

    if (failCount === 0) {
        showToast(`${successCount} entri absen manual berhasil disimpan!`, 'success');
    } else {
        showToast(`${successCount} berhasil, ${failCount} gagal.`, 'error');
    }

    maSelectedEmployees.clear();
    maSelectedDates.clear();
    document.getElementById('maNote').value = '';
    document.getElementById('maTimeIn').value = '';
    document.getElementById('maTimeOut').value = '';
    document.getElementById('maType').value = 'BOTH';
    await fetchData(false);
    maInit();
    btn.disabled = false;
    btn.innerHTML = origHTML;
    maSending = false;
}

async function maSubmit() {
    if (maSending) { showToast('Proses sedang berjalan.', 'error'); return; }
    if (maSelectedEmployees.size === 0) { showToast('Pilih minimal 1 relawan.', 'error'); return; }
    if (maSelectedDates.size === 0) { showToast('Pilih minimal 1 tanggal.', 'error'); return; }

    const type = document.getElementById('maType').value;
    const timeIn = document.getElementById('maTimeIn').value || '';
    const timeOut = document.getElementById('maTimeOut').value || '';
    const note = document.getElementById('maNote').value.trim();
    const empIds = [...maSelectedEmployees];
    const dates = [...maSelectedDates].sort();
    const multiplier = type === 'BOTH' ? 2 : 1;
    const totalEntries = empIds.length * dates.length * multiplier;
    const defaultLoc = `${GEOFENCE_CONFIG.lat}, ${GEOFENCE_CONFIG.lng}`;

    const typeLabel = type === 'BOTH' ? 'IN + OUT' : type;
    if (!confirm(`Kirim ${totalEntries} entri absen ${typeLabel} untuk ${empIds.length} relawan × ${dates.length} tanggal?`)) return;

    // Build list of entries to send
    const entries = [];
    for (const empId of empIds) {
        const emp = employees.find(e => e.id === empId);
        if (!emp) continue;
        const divConfig = appConfig.shifts[emp.division] || null;
        const defaultIn = divConfig ? divConfig.start : '08:00';
        const defaultOut = divConfig ? divConfig.end : '17:00';
        const isOvernightShift = divConfig ? (parseInt(divConfig.end) < parseInt(divConfig.start)) : false;

        for (const dateStr of dates) {
            if (type === 'IN' || type === 'BOTH') {
                entries.push({
                    empId: emp.id, name: emp.name, type: 'IN',
                    date: dateStr, forcedTime: timeIn || defaultIn,
                    location: defaultLoc, image: '', overtime: 0,
                    lateMinutes: 0, note: note, absentBy: 'Admin'
                });
            }
            if (type === 'OUT' || type === 'BOTH') {
                let outDate = dateStr;
                if (type === 'BOTH' && isOvernightShift) {
                    const d = new Date(dateStr + 'T00:00:00');
                    d.setDate(d.getDate() + 1);
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    outDate = `${yyyy}-${mm}-${dd}`;
                }
                entries.push({
                    empId: emp.id, name: emp.name, type: 'OUT',
                    date: outDate, forcedTime: timeOut || defaultOut,
                    location: defaultLoc, image: '', overtime: 0,
                    lateMinutes: 0, note: note, absentBy: 'Admin'
                });
            }
        }
    }

    // Save initial checkpoint and start sending
    maSaveCheckpoint(entries, 0, 0, 0);
    maSendEntries(entries, 0, 0, 0);
}

function initAdmin() {
    if (!isLoginInProgress) {
        toggleLoader(true, "Mempersiapkan Admin Dashboard...");
        setTimeout(() => {
            document.getElementById('adminLayout').classList.remove('hidden');
            refreshUI();
            showLoaderSuccess("Admin Dashboard Siap");
        }, 300);
    } else {
        document.getElementById('adminLayout').classList.remove('hidden');
        refreshUI();
    }
}

// =============================================
// NUTRITIONIST DASHBOARD - Complete System
// =============================================

// --- Food Database (per 100g, BDD standard, TKPI 2020) ---
const FOOD_DATABASE = [
    // === KARBOHIDRAT ===
    { name: 'Beras Putih', category: 'karbohidrat', kcal: 360, protein: 6.8, carbs: 79.3, fat: 0.7, fiber: 0.4, bdd: 100, price: 15000, kalsium: 6, zatBesi: 0.4, vitA: 0, vitC: 0, folat: 8, vitB12: 0 },
    { name: 'Beras Merah', category: 'karbohidrat', kcal: 352, protein: 7.3, carbs: 76.2, fat: 0.9, fiber: 3.5, bdd: 100, price: 22000, kalsium: 9, zatBesi: 0.8, vitA: 0, vitC: 0, folat: 20, vitB12: 0 },
    { name: 'Beras Ketan', category: 'karbohidrat', kcal: 362, protein: 6.7, carbs: 79.4, fat: 0.7, fiber: 0.4, bdd: 100, price: 18000, kalsium: 4, zatBesi: 0.3, vitA: 0, vitC: 0, folat: 6, vitB12: 0 },
    { name: 'Mie Kering', category: 'karbohidrat', kcal: 337, protein: 7.9, carbs: 70.3, fat: 3.3, fiber: 1.2, bdd: 100, price: 18000, kalsium: 14, zatBesi: 1.4, vitA: 0, vitC: 0, folat: 10, vitB12: 0 },
    { name: 'Mie Basah (Kuning)', category: 'karbohidrat', kcal: 86, protein: 0.6, carbs: 14.0, fat: 3.3, fiber: 0.1, bdd: 100, price: 12000, kalsium: 12, zatBesi: 0.2, vitA: 0, vitC: 0, folat: 3, vitB12: 0 },
    { name: 'Bihun Kering', category: 'karbohidrat', kcal: 360, protein: 4.7, carbs: 82.1, fat: 0.5, fiber: 0.8, bdd: 100, price: 16000, kalsium: 6, zatBesi: 0.5, vitA: 0, vitC: 0, folat: 4, vitB12: 0 },
    { name: 'Roti Tawar', category: 'karbohidrat', kcal: 248, protein: 8.0, carbs: 50.0, fat: 1.2, fiber: 2.7, bdd: 100, price: 25000, kalsium: 50, zatBesi: 1.5, vitA: 0, vitC: 0, folat: 25, vitB12: 0 },
    { name: 'Kentang', category: 'karbohidrat', kcal: 62, protein: 2.1, carbs: 13.5, fat: 0.2, fiber: 1.8, bdd: 85, price: 20000, kalsium: 11, zatBesi: 0.3, vitA: 0, vitC: 5.9, folat: 10, vitB12: 0 },
    { name: 'Singkong', category: 'karbohidrat', kcal: 154, protein: 1.0, carbs: 36.8, fat: 0.3, fiber: 1.2, bdd: 75, price: 8000, kalsium: 33, zatBesi: 0.8, vitA: 0, vitC: 31.0, folat: 12, vitB12: 0 },
    { name: 'Ubi Jalar', category: 'karbohidrat', kcal: 123, protein: 1.8, carbs: 27.9, fat: 0.7, fiber: 3.0, bdd: 86, price: 12000, kalsium: 30, zatBesi: 0.7, vitA: 60, vitC: 10.5, folat: 11, vitB12: 0 },
    { name: 'Jagung Pipil', category: 'karbohidrat', kcal: 150, protein: 4.7, carbs: 28.6, fat: 1.3, fiber: 2.8, bdd: 100, price: 15000, kalsium: 6, zatBesi: 0.5, vitA: 11, vitC: 5.5, folat: 42, vitB12: 0 },
    { name: 'Oatmeal', category: 'karbohidrat', kcal: 379, protein: 13.2, carbs: 67.7, fat: 6.5, fiber: 10.1, bdd: 100, price: 45000, kalsium: 54, zatBesi: 4.7, vitA: 0, vitC: 0, folat: 32, vitB12: 0 },
    { name: 'Makaroni Kering', category: 'karbohidrat', kcal: 353, protein: 12.0, carbs: 75.0, fat: 1.3, fiber: 2.5, bdd: 100, price: 20000, kalsium: 15, zatBesi: 1.2, vitA: 0, vitC: 0, folat: 12, vitB12: 0 },
    { name: 'Bubur Beras', category: 'karbohidrat', kcal: 44, protein: 0.8, carbs: 9.8, fat: 0.1, fiber: 0.1, bdd: 100, price: 10000, kalsium: 1, zatBesi: 0.1, vitA: 0, vitC: 0, folat: 1, vitB12: 0 },
    { name: 'Sagu', category: 'karbohidrat', kcal: 355, protein: 0.7, carbs: 85.0, fat: 0.2, fiber: 0.6, bdd: 100, price: 14000, kalsium: 11, zatBesi: 0.8, vitA: 0, vitC: 0, folat: 0, vitB12: 0 },

    // === PROTEIN HEWANI ===
    { name: 'Ayam Dada', category: 'protein_hewani', kcal: 164, protein: 31.0, carbs: 0, fat: 3.6, fiber: 0, bdd: 58, price: 42000, kalsium: 14, zatBesi: 0.9, vitA: 10, vitC: 0, folat: 4, vitB12: 0.3 },
    { name: 'Ayam Paha', category: 'protein_hewani', kcal: 209, protein: 26.0, carbs: 0, fat: 10.9, fiber: 0, bdd: 58, price: 38000, kalsium: 11, zatBesi: 1.2, vitA: 30, vitC: 0, folat: 6, vitB12: 0.4 },
    { name: 'Ayam Fillet (Tanpa Kulit)', category: 'protein_hewani', kcal: 120, protein: 23.0, carbs: 0, fat: 3.0, fiber: 0, bdd: 100, price: 55000, kalsium: 12, zatBesi: 0.8, vitA: 15, vitC: 0, folat: 4, vitB12: 0.3 },
    { name: 'Daging Sapi', category: 'protein_hewani', kcal: 250, protein: 26.0, carbs: 0, fat: 15.0, fiber: 0, bdd: 100, price: 125000, kalsium: 11, zatBesi: 2.8, vitA: 0, vitC: 0, folat: 6, vitB12: 2.0 },
    { name: 'Daging Sapi Cincang', category: 'protein_hewani', kcal: 215, protein: 18.0, carbs: 0, fat: 15.0, fiber: 0, bdd: 100, price: 115000, kalsium: 10, zatBesi: 2.2, vitA: 0, vitC: 0, folat: 5, vitB12: 1.8 },
    { name: 'Hati Sapi', category: 'protein_hewani', kcal: 135, protein: 20.0, carbs: 3.9, fat: 3.9, fiber: 0, bdd: 100, price: 60000, kalsium: 7, zatBesi: 6.5, vitA: 7700, vitC: 25.0, folat: 290, vitB12: 59.0 },
    { name: 'Hati Ayam', category: 'protein_hewani', kcal: 116, protein: 16.9, carbs: 0.7, fat: 4.8, fiber: 0, bdd: 100, price: 30000, kalsium: 9, zatBesi: 9.0, vitA: 3290, vitC: 17.9, folat: 580, vitB12: 16.6 },
    { name: 'Ikan Tongkol', category: 'protein_hewani', kcal: 117, protein: 25.0, carbs: 0, fat: 1.0, fiber: 0, bdd: 90, price: 35000, kalsium: 15, zatBesi: 1.5, vitA: 11, vitC: 0, folat: 2, vitB12: 2.2 },
    { name: 'Ikan Patin', category: 'protein_hewani', kcal: 132, protein: 17.0, carbs: 0, fat: 6.6, fiber: 0, bdd: 80, price: 30000, kalsium: 31, zatBesi: 1.6, vitA: 15, vitC: 0, folat: 4, vitB12: 1.5 },
    { name: 'Ikan Nila', category: 'protein_hewani', kcal: 96, protein: 20.1, carbs: 0, fat: 1.7, fiber: 0, bdd: 80, price: 32000, kalsium: 14, zatBesi: 0.6, vitA: 0, vitC: 0, folat: 4, vitB12: 1.5 },
    { name: 'Ikan Mas', category: 'protein_hewani', kcal: 86, protein: 16.0, carbs: 0, fat: 2.0, fiber: 0, bdd: 80, price: 28000, kalsium: 20, zatBesi: 2.0, vitA: 33, vitC: 0, folat: 6, vitB12: 1.0 },
    { name: 'Ikan Bandeng', category: 'protein_hewani', kcal: 148, protein: 20.0, carbs: 0, fat: 7.0, fiber: 0, bdd: 80, price: 38000, kalsium: 20, zatBesi: 1.9, vitA: 45, vitC: 0, folat: 3, vitB12: 2.5 },
    { name: 'Ikan Lele', category: 'protein_hewani', kcal: 90, protein: 18.7, carbs: 0, fat: 1.1, fiber: 0, bdd: 80, price: 26000, kalsium: 20, zatBesi: 0.3, vitA: 150, vitC: 0, folat: 10, vitB12: 1.8 },
    { name: 'Ikan Tenggiri', category: 'protein_hewani', kcal: 109, protein: 21.5, carbs: 0, fat: 2.6, fiber: 0, bdd: 90, price: 80000, kalsium: 11, zatBesi: 0.9, vitA: 30, vitC: 0, folat: 2, vitB12: 2.0 },
    { name: 'Ikan Kakap', category: 'protein_hewani', kcal: 92, protein: 20.0, carbs: 0, fat: 1.3, fiber: 0, bdd: 80, price: 75000, kalsium: 20, zatBesi: 0.9, vitA: 30, vitC: 0, folat: 5, vitB12: 3.0 },
    { name: 'Ikan Dori Fillet', category: 'protein_hewani', kcal: 88, protein: 15.0, carbs: 0, fat: 3.1, fiber: 0, bdd: 100, price: 55000, kalsium: 15, zatBesi: 0.4, vitA: 0, vitC: 0, folat: 4, vitB12: 1.2 },
    { name: 'Udang', category: 'protein_hewani', kcal: 91, protein: 21.0, carbs: 0.3, fat: 0.5, fiber: 0, bdd: 68, price: 85000, kalsium: 136, zatBesi: 8.0, vitA: 16, vitC: 0, folat: 8, vitB12: 1.4 },
    { name: 'Cumi-cumi', category: 'protein_hewani', kcal: 92, protein: 17.9, carbs: 3.1, fat: 1.4, fiber: 0, bdd: 100, price: 75000, kalsium: 32, zatBesi: 0.7, vitA: 10, vitC: 4.7, folat: 5, vitB12: 1.3 },
    { name: 'Telur Ayam', category: 'protein_hewani', kcal: 154, protein: 12.4, carbs: 0.7, fat: 10.8, fiber: 0, bdd: 90, price: 28000, kalsium: 50, zatBesi: 1.2, vitA: 190, vitC: 0, folat: 44, vitB12: 1.1 },
    { name: 'Telur Bebek', category: 'protein_hewani', kcal: 189, protein: 13.1, carbs: 0.8, fat: 14.3, fiber: 0, bdd: 90, price: 35000, kalsium: 64, zatBesi: 3.8, vitA: 260, vitC: 0, folat: 80, vitB12: 5.4 },
    { name: 'Telur Puyuh', category: 'protein_hewani', kcal: 158, protein: 13.1, carbs: 0.4, fat: 11.1, fiber: 0, bdd: 90, price: 35000, kalsium: 64, zatBesi: 3.7, vitA: 156, vitC: 0, folat: 66, vitB12: 1.6 },
    { name: 'Bakso Sapi', category: 'protein_hewani', kcal: 202, protein: 10.3, carbs: 16.5, fat: 10.5, fiber: 0.2, bdd: 100, price: 65000, kalsium: 35, zatBesi: 1.2, vitA: 0, vitC: 0, folat: 4, vitB12: 0.8 },
    { name: 'Sosis Ayam', category: 'protein_hewani', kcal: 250, protein: 11.5, carbs: 12.0, fat: 18.0, fiber: 0.1, bdd: 100, price: 48000, kalsium: 15, zatBesi: 0.9, vitA: 10, vitC: 0, folat: 3, vitB12: 0.5 },
    { name: 'Kornet Sapi', category: 'protein_hewani', kcal: 241, protein: 15.0, carbs: 0.8, fat: 20.0, fiber: 0, bdd: 100, price: 80000, kalsium: 10, zatBesi: 2.1, vitA: 0, vitC: 0, folat: 4, vitB12: 1.5 },
    { name: 'Daging Kambing', category: 'protein_hewani', kcal: 154, protein: 16.6, carbs: 0, fat: 9.4, fiber: 0, bdd: 100, price: 110000, kalsium: 11, zatBesi: 1.2, vitA: 0, vitC: 0, folat: 5, vitB12: 2.2 },

    // === PROTEIN NABATI ===
    { name: 'Tahu', category: 'protein_nabati', kcal: 80, protein: 10.9, carbs: 0.8, fat: 4.7, fiber: 0.1, bdd: 100, price: 10000, kalsium: 223, zatBesi: 3.4, vitA: 0, vitC: 0, folat: 15, vitB12: 0 },
    { name: 'Tempe', category: 'protein_nabati', kcal: 201, protein: 20.8, carbs: 13.5, fat: 8.8, fiber: 1.4, bdd: 100, price: 15000, kalsium: 111, zatBesi: 2.7, vitA: 0, vitC: 0, folat: 24, vitB12: 0.1 },
    { name: 'Kacang Kedelai', category: 'protein_nabati', kcal: 381, protein: 34.9, carbs: 24.6, fat: 18.1, fiber: 4.2, bdd: 100, price: 20000, kalsium: 222, zatBesi: 8.0, vitA: 10, vitC: 0, folat: 375, vitB12: 0 },
    { name: 'Kacang Hijau', category: 'protein_nabati', kcal: 323, protein: 22.2, carbs: 56.8, fat: 1.2, fiber: 7.6, bdd: 100, price: 25000, kalsium: 125, zatBesi: 6.7, vitA: 9, vitC: 4.8, folat: 625, vitB12: 0 },
    { name: 'Kacang Tanah', category: 'protein_nabati', kcal: 525, protein: 27.9, carbs: 17.4, fat: 42.7, fiber: 2.4, bdd: 100, price: 28000, kalsium: 93, zatBesi: 4.5, vitA: 0, vitC: 0, folat: 240, vitB12: 0 },
    { name: 'Kacang Merah', category: 'protein_nabati', kcal: 336, protein: 22.5, carbs: 59.5, fat: 1.1, fiber: 15.2, bdd: 100, price: 35000, kalsium: 80, zatBesi: 5.0, vitA: 0, vitC: 0, folat: 394, vitB12: 0 },
    { name: 'Kacang Mede', category: 'protein_nabati', kcal: 566, protein: 18.2, carbs: 29.1, fat: 46.9, fiber: 3.3, bdd: 100, price: 120000, kalsium: 37, zatBesi: 6.6, vitA: 0, vitC: 0, folat: 68, vitB12: 0 },
    { name: 'Oncom', category: 'protein_nabati', kcal: 187, protein: 13.0, carbs: 22.6, fat: 6.0, fiber: 0.5, bdd: 100, price: 12000, kalsium: 96, zatBesi: 27.0, vitA: 0, vitC: 0, folat: 18, vitB12: 0 },

    // === SAYURAN ===
    { name: 'Bayam', category: 'sayuran', kcal: 36, protein: 3.5, carbs: 6.5, fat: 0.5, fiber: 2.2, bdd: 71, price: 15000, kalsium: 99, zatBesi: 2.7, vitA: 469, vitC: 28.0, folat: 194, vitB12: 0 },
    { name: 'Kangkung', category: 'sayuran', kcal: 29, protein: 3.0, carbs: 5.4, fat: 0.3, fiber: 2.0, bdd: 70, price: 12000, kalsium: 73, zatBesi: 2.5, vitA: 315, vitC: 31.0, folat: 57, vitB12: 0 },
    { name: 'Wortel', category: 'sayuran', kcal: 42, protein: 1.2, carbs: 9.3, fat: 0.3, fiber: 4.0, bdd: 88, price: 16000, kalsium: 33, zatBesi: 0.3, vitA: 835, vitC: 5.9, folat: 19, vitB12: 0 },
    { name: 'Buncis', category: 'sayuran', kcal: 35, protein: 2.4, carbs: 7.7, fat: 0.2, fiber: 3.2, bdd: 90, price: 18000, kalsium: 44, zatBesi: 1.0, vitA: 34, vitC: 12.2, folat: 37, vitB12: 0 },
    { name: 'Kacang Panjang', category: 'sayuran', kcal: 47, protein: 2.8, carbs: 7.8, fat: 0.4, fiber: 3.2, bdd: 92, price: 12000, kalsium: 50, zatBesi: 1.0, vitA: 30, vitC: 13.0, folat: 62, vitB12: 0 },
    { name: 'Labu Siam', category: 'sayuran', kcal: 26, protein: 0.6, carbs: 6.7, fat: 0.1, fiber: 0.6, bdd: 83, price: 10000, kalsium: 14, zatBesi: 0.3, vitA: 0, vitC: 7.7, folat: 9, vitB12: 0 },
    { name: 'Labu Kuning', category: 'sayuran', kcal: 29, protein: 1.1, carbs: 6.6, fat: 0.3, fiber: 1.5, bdd: 77, price: 12000, kalsium: 45, zatBesi: 0.5, vitA: 180, vitC: 9.0, folat: 16, vitB12: 0 },
    { name: 'Kol/Kubis', category: 'sayuran', kcal: 24, protein: 1.4, carbs: 4.2, fat: 0.2, fiber: 0.9, bdd: 90, price: 10000, kalsium: 40, zatBesi: 0.5, vitA: 4, vitC: 36.6, folat: 43, vitB12: 0 },
    { name: 'Kembang Kol', category: 'sayuran', kcal: 25, protein: 2.0, carbs: 5.3, fat: 0.2, fiber: 2.5, bdd: 57, price: 22000, kalsium: 22, zatBesi: 0.4, vitA: 0, vitC: 48.2, folat: 57, vitB12: 0 },
    { name: 'Brokoli', category: 'sayuran', kcal: 34, protein: 2.8, carbs: 7.0, fat: 0.4, fiber: 2.6, bdd: 100, price: 28000, kalsium: 47, zatBesi: 0.7, vitA: 31, vitC: 89.2, folat: 63, vitB12: 0 },
    { name: 'Sawi Hijau', category: 'sayuran', kcal: 22, protein: 2.3, carbs: 4.0, fat: 0.3, fiber: 1.2, bdd: 85, price: 12000, kalsium: 105, zatBesi: 1.9, vitA: 260, vitC: 45.0, folat: 60, vitB12: 0 },
    { name: 'Sawi Putih', category: 'sayuran', kcal: 13, protein: 1.0, carbs: 2.2, fat: 0.1, fiber: 1.0, bdd: 90, price: 10000, kalsium: 105, zatBesi: 0.8, vitA: 10, vitC: 13.0, folat: 79, vitB12: 0 },
    { name: 'Tauge (Kecambah)', category: 'sayuran', kcal: 34, protein: 3.7, carbs: 4.3, fat: 1.5, fiber: 1.1, bdd: 100, price: 12000, kalsium: 32, zatBesi: 0.8, vitA: 2, vitC: 15.0, folat: 61, vitB12: 0 },
    { name: 'Tomat', category: 'sayuran', kcal: 20, protein: 1.0, carbs: 4.2, fat: 0.3, fiber: 1.5, bdd: 95, price: 15000, kalsium: 5, zatBesi: 0.3, vitA: 42, vitC: 13.7, folat: 15, vitB12: 0 },
    { name: 'Timun', category: 'sayuran', kcal: 12, protein: 0.7, carbs: 2.7, fat: 0.1, fiber: 0.5, bdd: 97, price: 8000, kalsium: 16, zatBesi: 0.2, vitA: 5, vitC: 2.8, folat: 7, vitB12: 0 },
    { name: 'Daun Singkong', category: 'sayuran', kcal: 73, protein: 6.8, carbs: 13.0, fat: 1.2, fiber: 1.2, bdd: 60, price: 10000, kalsium: 165, zatBesi: 2.0, vitA: 360, vitC: 27.0, folat: 110, vitB12: 0 },
    { name: 'Terong', category: 'sayuran', kcal: 24, protein: 1.1, carbs: 5.7, fat: 0.2, fiber: 2.5, bdd: 87, price: 12000, kalsium: 30, zatBesi: 0.4, vitA: 6, vitC: 2.2, folat: 22, vitB12: 0 },
    { name: 'Jagung Muda (Putren)', category: 'sayuran', kcal: 35, protein: 2.0, carbs: 7.4, fat: 0.2, fiber: 1.8, bdd: 100, price: 20000, kalsium: 12, zatBesi: 0.5, vitA: 4, vitC: 5.0, folat: 12, vitB12: 0 },
    { name: 'Jamur Kuping', category: 'sayuran', kcal: 15, protein: 1.0, carbs: 2.9, fat: 0.1, fiber: 3.5, bdd: 100, price: 45000, kalsium: 12, zatBesi: 1.5, vitA: 0, vitC: 0, folat: 19, vitB12: 0 },
    { name: 'Jamur Tiram', category: 'sayuran', kcal: 35, protein: 2.2, carbs: 6.5, fat: 0.4, fiber: 2.8, bdd: 100, price: 25000, kalsium: 14, zatBesi: 1.2, vitA: 0, vitC: 0, folat: 27, vitB12: 0 },
    { name: 'Daun Kelor', category: 'sayuran', kcal: 92, protein: 6.7, carbs: 12.5, fat: 1.7, fiber: 2.0, bdd: 70, price: 15000, kalsium: 440, zatBesi: 7.0, vitA: 750, vitC: 220, folat: 40, vitB12: 0 },
    { name: 'Daun Katuk', category: 'sayuran', kcal: 59, protein: 4.8, carbs: 11.0, fat: 1.0, fiber: 1.5, bdd: 68, price: 15000, kalsium: 204, zatBesi: 2.7, vitA: 600, vitC: 239, folat: 35, vitB12: 0 },
    
    // === TUMISAN & SAYUR MATANG ===
    { name: 'Tumis Kangkung', category: 'sayuran', kcal: 78, protein: 2.8, carbs: 3.9, fat: 6.2, fiber: 1.8, bdd: 100, price: 15000, kalsium: 68, zatBesi: 2.1, vitA: 280, vitC: 18.0, folat: 45, vitB12: 0 },
    { name: 'Tumis Buncis', category: 'sayuran', kcal: 80, protein: 2.2, carbs: 7.0, fat: 5.5, fiber: 2.8, bdd: 100, price: 20000, kalsium: 38, zatBesi: 0.8, vitA: 28, vitC: 9.8, folat: 30, vitB12: 0 },
    { name: 'Tumis Kacang Panjang', category: 'sayuran', kcal: 85, protein: 2.1, carbs: 7.2, fat: 5.8, fiber: 2.4, bdd: 100, price: 18000, kalsium: 40, zatBesi: 0.9, vitA: 30, vitC: 10.5, folat: 32, vitB12: 0 },
    { name: 'Capcay Sayuran', category: 'sayuran', kcal: 65, protein: 1.8, carbs: 6.4, fat: 4.2, fiber: 2.0, bdd: 100, price: 20000, kalsium: 35, zatBesi: 0.6, vitA: 380, vitC: 22.0, folat: 28, vitB12: 0 },
    { name: 'Tumis Sawi Hijau', category: 'sayuran', kcal: 68, protein: 2.0, carbs: 3.8, fat: 5.2, fiber: 1.1, bdd: 100, price: 15000, kalsium: 95, zatBesi: 1.5, vitA: 230, vitC: 38.0, folat: 50, vitB12: 0 },
    { name: 'Sayur Asem', category: 'sayuran', kcal: 29, protein: 0.7, carbs: 5.0, fat: 0.6, fiber: 1.2, bdd: 100, price: 12000, kalsium: 15, zatBesi: 0.4, vitA: 40, vitC: 8.0, folat: 10, vitB12: 0 },
    { name: 'Sayur Lodeh', category: 'sayuran', kcal: 68, protein: 1.5, carbs: 5.4, fat: 4.8, fiber: 1.1, bdd: 100, price: 15000, kalsium: 24, zatBesi: 0.6, vitA: 35, vitC: 5.0, folat: 12, vitB12: 0 },
    { name: 'Sup Ayam Sayur', category: 'sayuran', kcal: 72, protein: 5.5, carbs: 3.2, fat: 4.0, fiber: 0.8, bdd: 100, price: 25000, kalsium: 20, zatBesi: 0.7, vitA: 180, vitC: 8.0, folat: 14, vitB12: 0.2 },
    { name: 'Sup Sayur Bening', category: 'sayuran', kcal: 22, protein: 0.8, carbs: 4.2, fat: 0.2, fiber: 1.1, bdd: 100, price: 12000, kalsium: 18, zatBesi: 0.3, vitA: 250, vitC: 12.0, folat: 15, vitB12: 0 },

    // === BUAH ===
    { name: 'Pisang Ambon', category: 'buah', kcal: 99, protein: 1.2, carbs: 25.8, fat: 0.2, fiber: 0.6, bdd: 75, price: 22000, kalsium: 5, zatBesi: 0.3, vitA: 3, vitC: 8.7, folat: 20, vitB12: 0 },
    { name: 'Pisang Lampung', category: 'buah', kcal: 99, protein: 1.3, carbs: 25.6, fat: 0.2, fiber: 1.1, bdd: 75, price: 18000, kalsium: 8, zatBesi: 0.3, vitA: 5, vitC: 10.0, folat: 14, vitB12: 0 },
    { name: 'Pisang Raja', category: 'buah', kcal: 120, protein: 1.2, carbs: 31.8, fat: 0.2, fiber: 1.5, bdd: 70, price: 28000, kalsium: 10, zatBesi: 0.4, vitA: 8, vitC: 12.0, folat: 18, vitB12: 0 },
    { name: 'Pisang Mas', category: 'buah', kcal: 92, protein: 1.4, carbs: 23.4, fat: 0.2, fiber: 1.0, bdd: 85, price: 20000, kalsium: 7, zatBesi: 0.4, vitA: 4, vitC: 6.0, folat: 12, vitB12: 0 },
    { name: 'Pisang Kepok', category: 'buah', kcal: 115, protein: 0.8, carbs: 29.8, fat: 0.1, fiber: 1.8, bdd: 68, price: 18000, kalsium: 10, zatBesi: 0.5, vitA: 6, vitC: 10.0, folat: 15, vitB12: 0 },
    { name: 'Pepaya', category: 'buah', kcal: 46, protein: 0.5, carbs: 12.2, fat: 0, fiber: 0.7, bdd: 75, price: 10000, kalsium: 23, zatBesi: 0.1, vitA: 55, vitC: 61.8, folat: 38, vitB12: 0 },
    { name: 'Jeruk Manis', category: 'buah', kcal: 45, protein: 0.9, carbs: 11.2, fat: 0.2, fiber: 0.4, bdd: 72, price: 24000, kalsium: 40, zatBesi: 0.1, vitA: 11, vitC: 53.2, folat: 30, vitB12: 0 },
    { name: 'Jeruk Santang', category: 'buah', kcal: 43, protein: 0.8, carbs: 10.3, fat: 0.2, fiber: 1.8, bdd: 72, price: 32000, kalsium: 37, zatBesi: 0.1, vitA: 12, vitC: 26.7, folat: 16, vitB12: 0 },
    { name: 'Jeruk Mandarin', category: 'buah', kcal: 53, protein: 0.8, carbs: 13.3, fat: 0.3, fiber: 1.8, bdd: 74, price: 38000, kalsium: 37, zatBesi: 0.1, vitA: 34, vitC: 26.7, folat: 16, vitB12: 0 },
    { name: 'Jeruk Nipis', category: 'buah', kcal: 30, protein: 0.7, carbs: 10.5, fat: 0.2, fiber: 2.8, bdd: 100, price: 20000, kalsium: 33, zatBesi: 0.6, vitA: 2, vitC: 29.1, folat: 8, vitB12: 0 },
    { name: 'Semangka', category: 'buah', kcal: 28, protein: 0.5, carbs: 6.9, fat: 0.2, fiber: 0.5, bdd: 46, price: 12000, kalsium: 7, zatBesi: 0.2, vitA: 28, vitC: 8.1, folat: 3, vitB12: 0 },
    { name: 'Melon', category: 'buah', kcal: 34, protein: 0.6, carbs: 7.7, fat: 0.4, fiber: 0.3, bdd: 58, price: 18000, kalsium: 9, zatBesi: 0.2, vitA: 16, vitC: 36.7, folat: 14, vitB12: 0 },
    { name: 'Apel Malang', category: 'buah', kcal: 58, protein: 0.3, carbs: 14.9, fat: 0.4, fiber: 0.7, bdd: 88, price: 25000, kalsium: 6, zatBesi: 0.1, vitA: 4, vitC: 4.6, folat: 3, vitB12: 0 },
    { name: 'Apel Merah', category: 'buah', kcal: 52, protein: 0.3, carbs: 13.8, fat: 0.2, fiber: 2.4, bdd: 88, price: 35000, kalsium: 6, zatBesi: 0.1, vitA: 3, vitC: 4.6, folat: 3, vitB12: 0 },
    { name: 'Mangga Harum Manis', category: 'buah', kcal: 60, protein: 0.8, carbs: 15.0, fat: 0.4, fiber: 1.6, bdd: 65, price: 25000, kalsium: 11, zatBesi: 0.2, vitA: 54, vitC: 36.4, folat: 43, vitB12: 0 },
    { name: 'Alpukat', category: 'buah', kcal: 160, protein: 2.0, carbs: 8.5, fat: 14.7, fiber: 6.7, bdd: 61, price: 30000, kalsium: 12, zatBesi: 0.6, vitA: 7, vitC: 10.0, folat: 81, vitB12: 0 },
    { name: 'Nanas', category: 'buah', kcal: 50, protein: 0.5, carbs: 13.1, fat: 0.1, fiber: 1.4, bdd: 53, price: 15000, kalsium: 13, zatBesi: 0.3, vitA: 3, vitC: 47.8, folat: 18, vitB12: 0 },
    { name: 'Salak', category: 'buah', kcal: 77, protein: 0.4, carbs: 20.9, fat: 0.4, fiber: 0.3, bdd: 60, price: 14000, kalsium: 28, zatBesi: 4.2, vitA: 0, vitC: 2.0, folat: 0, vitB12: 0 },
    { name: 'Jambu Biji', category: 'buah', kcal: 68, protein: 2.6, carbs: 14.3, fat: 1.0, fiber: 5.4, bdd: 82, price: 16000, kalsium: 18, zatBesi: 0.3, vitA: 31, vitC: 228.0, folat: 49, vitB12: 0 },

    // === SUSU & OLAHAN ===
    { name: 'Susu UHT', category: 'susu_olahan', kcal: 61, protein: 3.2, carbs: 4.5, fat: 3.5, fiber: 0, bdd: 100, price: 18000, kalsium: 120, zatBesi: 0.1, vitA: 40, vitC: 1.0, folat: 5, vitB12: 0.4 },
    { name: 'Susu Bubuk Full Cream', category: 'susu_olahan', kcal: 496, protein: 26.3, carbs: 38.4, fat: 26.7, fiber: 0, bdd: 100, price: 90000, kalsium: 950, zatBesi: 0.5, vitA: 260, vitC: 8.0, folat: 35, vitB12: 3.2 },
    { name: 'Susu Kental Manis', category: 'susu_olahan', kcal: 336, protein: 8.2, carbs: 55, fat: 10, fiber: 0, bdd: 100, price: 32000, kalsium: 275, zatBesi: 0.2, vitA: 95, vitC: 1.0, folat: 10, vitB12: 0.8 },
    { name: 'Yogurt Plain', category: 'susu_olahan', kcal: 52, protein: 3.5, carbs: 6.0, fat: 1.5, fiber: 0, bdd: 100, price: 45000, kalsium: 110, zatBesi: 0.1, vitA: 25, vitC: 0.5, folat: 7, vitB12: 0.3 },
    { name: 'Keju Cheddar', category: 'susu_olahan', kcal: 403, protein: 24.9, carbs: 1.3, fat: 33.1, fiber: 0, bdd: 100, price: 110000, kalsium: 721, zatBesi: 0.7, vitA: 260, vitC: 0, folat: 18, vitB12: 0.8 },

    // === BUMBU & BAHAN TAMBAHAN ===
    { name: 'Bawang Merah', category: 'bumbu', kcal: 39, protein: 1.5, carbs: 9.2, fat: 0.3, fiber: 1.0, bdd: 90, price: 35000, kalsium: 36, zatBesi: 0.8, vitA: 0, vitC: 2.0, folat: 19, vitB12: 0 },
    { name: 'Bawang Putih', category: 'bumbu', kcal: 95, protein: 4.5, carbs: 23.1, fat: 0.2, fiber: 1.1, bdd: 88, price: 40000, kalsium: 29, zatBesi: 1.7, vitA: 0, vitC: 1.2, folat: 3, vitB12: 0 },
    { name: 'Cabai Merah', category: 'bumbu', kcal: 31, protein: 1.0, carbs: 7.3, fat: 0.3, fiber: 0.4, bdd: 85, price: 45000, kalsium: 29, zatBesi: 1.4, vitA: 90, vitC: 18.0, folat: 10, vitB12: 0 },
    { name: 'Cabai Rawit', category: 'bumbu', kcal: 40, protein: 2.0, carbs: 9.0, fat: 0.4, fiber: 1.5, bdd: 90, price: 50000, kalsium: 45, zatBesi: 1.8, vitA: 120, vitC: 60.0, folat: 15, vitB12: 0 },
    { name: 'Jahe', category: 'bumbu', kcal: 51, protein: 1.5, carbs: 10.1, fat: 1.0, fiber: 2.0, bdd: 85, price: 30000, kalsium: 21, zatBesi: 1.6, vitA: 0, vitC: 4.0, folat: 8, vitB12: 0 },
    { name: 'Kunyit', category: 'bumbu', kcal: 63, protein: 2.0, carbs: 14.7, fat: 1.0, fiber: 2.0, bdd: 85, price: 25000, kalsium: 24, zatBesi: 3.5, vitA: 0, vitC: 2.0, folat: 9, vitB12: 0 },
    { name: 'Gula Pasir', category: 'bumbu', kcal: 364, protein: 0, carbs: 94, fat: 0, fiber: 0, bdd: 100, price: 18000, kalsium: 1, zatBesi: 0.1, vitA: 0, vitC: 0, folat: 0, vitB12: 0 },
    { name: 'Gula Merah (Jawa)', category: 'bumbu', kcal: 356, protein: 0, carbs: 92.0, fat: 0, fiber: 0, bdd: 100, price: 22000, kalsium: 75, zatBesi: 3.0, vitA: 0, vitC: 0, folat: 0, vitB12: 0 },
    { name: 'Garam', category: 'bumbu', kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, bdd: 100, price: 5000, kalsium: 0, zatBesi: 0, vitA: 0, vitC: 0, folat: 0, vitB12: 0 },
    { name: 'Kecap Manis', category: 'bumbu', kcal: 268, protein: 5.7, carbs: 64.3, fat: 0.1, fiber: 0.8, bdd: 100, price: 24000, kalsium: 85, zatBesi: 4.4, vitA: 0, vitC: 0, folat: 6, vitB12: 0 },
    { name: 'Kecap Asin', category: 'bumbu', kcal: 60, protein: 7.0, carbs: 8.0, fat: 0.1, fiber: 0.2, bdd: 100, price: 26000, kalsium: 40, zatBesi: 2.2, vitA: 0, vitC: 0, folat: 4, vitB12: 0 },
    { name: 'Saus Tiram', category: 'bumbu', kcal: 51, protein: 1.4, carbs: 11.2, fat: 0.1, fiber: 0, bdd: 100, price: 42000, kalsium: 12, zatBesi: 0.5, vitA: 0, vitC: 0, folat: 2, vitB12: 0 },
    { name: 'Ketumbar Bubuk', category: 'bumbu', kcal: 298, protein: 12.3, carbs: 54.9, fat: 17.7, fiber: 29.0, bdd: 100, price: 30000, kalsium: 709, zatBesi: 16.3, vitA: 0, vitC: 21.0, folat: 0, vitB12: 0 },
    { name: 'Serai (Sereh)', category: 'bumbu', kcal: 99, protein: 1.8, carbs: 25.3, fat: 0.5, fiber: 3.0, bdd: 100, price: 12000, kalsium: 65, zatBesi: 8.0, vitA: 0, vitC: 2.6, folat: 0, vitB12: 0 },
    { name: 'Lengkuas', category: 'bumbu', kcal: 71, protein: 1.2, carbs: 15.0, fat: 1.0, fiber: 2.0, bdd: 100, price: 14000, kalsium: 11, zatBesi: 0.8, vitA: 0, vitC: 5.6, folat: 0, vitB12: 0 },
    { name: 'Daun Salam', category: 'bumbu', kcal: 313, protein: 7.6, carbs: 75.0, fat: 8.3, fiber: 26.3, bdd: 100, price: 15000, kalsium: 834, zatBesi: 43.0, vitA: 300, vitC: 46.5, folat: 180, vitB12: 0 },
    { name: 'Lada Bubuk (Merica)', category: 'bumbu', kcal: 255, protein: 10.4, carbs: 64.0, fat: 3.3, fiber: 25.3, bdd: 100, price: 65000, kalsium: 443, zatBesi: 28.9, vitA: 0, vitC: 0, folat: 10, vitB12: 0 },

    // === MINYAK & LEMAK ===
    { name: 'Minyak Goreng', category: 'minyak_lemak', kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, bdd: 100, price: 18000, kalsium: 0, zatBesi: 0, vitA: 0, vitC: 0, folat: 0, vitB12: 0 },
    { name: 'Santan Kelapa Cair', category: 'minyak_lemak', kcal: 122, protein: 1.0, carbs: 2.5, fat: 12.2, fiber: 0, bdd: 100, price: 15000, kalsium: 16, zatBesi: 1.6, vitA: 0, vitC: 2.8, folat: 16, vitB12: 0 },
    { name: 'Santan Kelapa Kental', category: 'minyak_lemak', kcal: 230, protein: 2.3, carbs: 5.5, fat: 23.8, fiber: 0.5, bdd: 100, price: 25000, kalsium: 20, zatBesi: 2.2, vitA: 0, vitC: 3.5, folat: 20, vitB12: 0 },
    { name: 'Mentega', category: 'minyak_lemak', kcal: 720, protein: 0.5, carbs: 0.4, fat: 81.6, fiber: 0, bdd: 100, price: 65000, kalsium: 15, zatBesi: 0.1, vitA: 250, vitC: 0, folat: 2, vitB12: 0.1 },
    { name: 'Margarin', category: 'minyak_lemak', kcal: 720, protein: 0.6, carbs: 0.4, fat: 81, fiber: 0, bdd: 100, price: 25000, kalsium: 20, zatBesi: 0.1, vitA: 300, vitC: 0, folat: 2, vitB12: 0 },
    { name: 'Minyak Kelapa', category: 'minyak_lemak', kcal: 870, protein: 0, carbs: 0, fat: 98, fiber: 0, bdd: 100, price: 30000, kalsium: 0, zatBesi: 0, vitA: 0, vitC: 0, folat: 0, vitB12: 0 },
    { name: 'Minyak Zaitun', category: 'minyak_lemak', kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, bdd: 100, price: 140000, kalsium: 1, zatBesi: 0.6, vitA: 0, vitC: 0, folat: 0, vitB12: 0 },

    // === LAUK MATANG ===
    { name: 'Orek Tempe Manis', category: 'protein_nabati', kcal: 230, protein: 12.5, carbs: 20.4, fat: 11.2, fiber: 2.1, bdd: 100, price: 18000, kalsium: 80, zatBesi: 2.2, vitA: 0, vitC: 0, folat: 15, vitB12: 0.1 },
    { name: 'Tahu Goreng', category: 'protein_nabati', kcal: 115, protein: 9.7, carbs: 2.5, fat: 8.5, fiber: 0.4, bdd: 100, price: 12000, kalsium: 180, zatBesi: 2.5, vitA: 0, vitC: 0, folat: 10, vitB12: 0 },
    { name: 'Tempe Goreng', category: 'protein_nabati', kcal: 225, protein: 15.0, carbs: 12.0, fat: 14.5, fiber: 1.2, bdd: 100, price: 16000, kalsium: 90, zatBesi: 2.0, vitA: 0, vitC: 0, folat: 16, vitB12: 0.1 },
    { name: 'Ayam Goreng', category: 'protein_hewani', kcal: 246, protein: 25.0, carbs: 0, fat: 16.0, fiber: 0, bdd: 100, price: 48000, kalsium: 15, zatBesi: 1.1, vitA: 25, vitC: 0, folat: 5, vitB12: 0.3 },
    { name: 'Ayam Semur', category: 'protein_hewani', kcal: 185, protein: 22.0, carbs: 5.4, fat: 8.2, fiber: 0.2, bdd: 100, price: 48000, kalsium: 20, zatBesi: 1.5, vitA: 15, vitC: 0, folat: 4, vitB12: 0.3 },
    { name: 'Telur Dadar', category: 'protein_hewani', kcal: 188, protein: 11.0, carbs: 1.2, fat: 15.2, fiber: 0, bdd: 100, price: 30000, kalsium: 48, zatBesi: 1.2, vitA: 170, vitC: 0, folat: 38, vitB12: 0.9 },
    { name: 'Telur Ceplok', category: 'protein_hewani', kcal: 196, protein: 12.4, carbs: 0.8, fat: 16.0, fiber: 0, bdd: 100, price: 30000, kalsium: 50, zatBesi: 1.2, vitA: 180, vitC: 0, folat: 40, vitB12: 1.0 },
    { name: 'Ikan Goreng', category: 'protein_hewani', kcal: 165, protein: 21.0, carbs: 0, fat: 9.0, fiber: 0, bdd: 100, price: 38000, kalsium: 25, zatBesi: 1.2, vitA: 20, vitC: 0, folat: 3, vitB12: 1.8 },
    { name: 'Ikan Bakar', category: 'protein_hewani', kcal: 130, protein: 22.0, carbs: 0.8, fat: 4.5, fiber: 0, bdd: 100, price: 42000, kalsium: 20, zatBesi: 1.0, vitA: 15, vitC: 0, folat: 2, vitB12: 2.0 },
    { name: 'Soto Ayam', category: 'protein_hewani', kcal: 78, protein: 6.2, carbs: 3.5, fat: 4.3, fiber: 0.3, bdd: 100, price: 20000, kalsium: 24, zatBesi: 0.8, vitA: 25, vitC: 2.0, folat: 8, vitB12: 0.2 }
];

// --- Target Gizi & Harga}