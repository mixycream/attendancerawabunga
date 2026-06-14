// --- KONFIGURASI UTAMA ---
// Paste URL Google Apps Script kamu di sini (Wajib)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx2cZ-IBc5P8FDbBWT6evg6zc4vVOYkn0ThwmDjo6oW5Ca9zzTGybU_GnmwGjX4dFkI/exec"; 

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

const ALLOWED_ROLES = ['employee', 'security', 'foundation', 'admin_warehouse', 'warehouse'];


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
    hideOvertime: false,
    allowMultipleIn: false,
    geofenceLat: -6.21973,
    geofenceLng: 106.87015,
    geofenceRadius: 15,
    lateTolerance: 5,
    lateReasonThreshold: 25,
    lateWaThreshold: 35,
    lateMaxThreshold: 60,
    adminWhatsApp: "6282114806765",
    autoOutType: "global",
    autoOutGlobalMinutes: 240,
    autoOutDivisionsConfig: "{}",
    enableLivenessCheck: false
}; 
let sortState = {
    logs: 'time_desc',
    employees: 'name_asc',
    salary: 'name_asc'
};
let editingEmployeeId = null;
let pendingAttendancePayload = null; // Menyimpan data sementara jika telat > 30 menit
let trendChartInstance = null; // Instance Chart.js
let currentChartPeriod = '7d'; // Periode tren grafik aktif
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
let securityCoords = { lat: 0, lng: 0 };
let toastTimeout = null;
let toastProgressTimeout = null;
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
                const landingView = document.getElementById('landingView');
                if (landingView) landingView.classList.add('hidden');
                fetchData(true);
                initSecurity();
                startSessionTimer();
            }).catch(() => {
                localStorage.removeItem('mbg_user');
                showToast('Gagal validasi session security. Silakan login ulang.', 'error');
            });
        } else {
            document.getElementById('loginView').classList.add('hidden');
            const landingView = document.getElementById('landingView');
            if (landingView) landingView.classList.add('hidden');
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
    
    // Auto UPPERCASE for new volunteer name
    const newEmpNameInput = document.getElementById('newEmpName');
    if (newEmpNameInput) {
        newEmpNameInput.addEventListener('input', function(e) {
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.toUpperCase();
            this.setSelectionRange(start, end);
        });
    }

    // Auto Capitalized for new division name
    const divFormNameInput = document.getElementById('divFormName');
    if (divFormNameInput) {
        divFormNameInput.addEventListener('input', function(e) {
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.replace(/\b\w/g, char => char.toUpperCase());
            this.setSelectionRange(start, end);
        });
    }

    // Initialize premium entrance scroll-reveal animations
    initScrollReveal();
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

function openLogoutModal() {
    const modal = document.getElementById('logoutConfirmModal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('.clay-modal')?.classList.remove('scale-95');
        }, 10);
    }
}

function closeLogoutModal() {
    const modal = document.getElementById('logoutConfirmModal');
    if (modal) {
        modal.classList.add('opacity-0');
        modal.querySelector('.clay-modal')?.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

async function confirmLogoutAction() {
    closeLogoutModal();
    await forceLogout();
}

async function logout() {
    openLogoutModal();
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
        // Reset success state and show loading state
        loaderSuccess.classList.add('hidden', 'opacity-0', 'scale-75');
        loaderSuccess.classList.remove('flex', 'opacity-100', 'scale-100');
        
        loaderContent.classList.remove('hidden', 'opacity-0', 'scale-75');
        loaderContent.classList.add('flex', 'opacity-100', 'scale-100');
        
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
            // Restore default visibility classes
            loaderContent.classList.remove('hidden');
            loaderContent.classList.add('flex');
            loaderSuccess.classList.add('hidden');
            loaderSuccess.classList.remove('flex');
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
    
    // Switch visibility and fade in success content
    setTimeout(() => {
        loaderContent.classList.add('hidden');
        loaderContent.classList.remove('flex');
        
        loaderSuccess.classList.remove('hidden');
        loaderSuccess.classList.add('flex');
        
        setTimeout(() => {
            loaderSuccess.classList.remove('opacity-0', 'scale-75');
            loaderSuccess.classList.add('opacity-100', 'scale-100');
        }, 50);
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
        _syncingButton = btn;
        btn._origHTML = btn.innerHTML;
        btn._origClasses = btn.className; // Simpan kelas asli SEBELUM dimodifikasi
        
        btn.disabled = true;
        btn.classList.add('pointer-events-none', 'animate-pulse');
        
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
            const res = await fetch(SCRIPT_URL + "?action=getData&_t=" + Date.now(), { timeout: 10000 });
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
                    appConfig.allowMultipleIn = data.config.allowMultipleIn === true || data.config.allowMultipleIn === 'true';
                    appConfig.enableLivenessCheck = data.config.enableLivenessCheck === true || data.config.enableLivenessCheck === 'true';
                    appConfig.geofenceLat = parseFloat(data.config.geofenceLat || "-6.21973");
                    appConfig.geofenceLng = parseFloat(data.config.geofenceLng || "106.87015");
                    appConfig.geofenceRadius = parseInt(data.config.geofenceRadius || "15");
                    appConfig.lateTolerance = parseInt(data.config.lateTolerance || "5");
                    appConfig.lateReasonThreshold = parseInt(data.config.lateReasonThreshold || "25");
                    appConfig.lateWaThreshold = parseInt(data.config.lateWaThreshold || "35");
                    appConfig.lateMaxThreshold = parseInt(data.config.lateMaxThreshold || "60");
                    appConfig.adminWhatsApp = data.config.adminWhatsApp || "6282114806765";
                    appConfig.autoOutType = data.config.autoOutType || "global";
                    appConfig.autoOutGlobalMinutes = parseInt(data.config.autoOutGlobalMinutes || "240");
                    appConfig.autoOutDivisionsConfig = data.config.autoOutDivisionsConfig || "{}";
                    
                    appConfig.divisionRolePresets = {};
                    if (data.config.divisionRolePresets) {
                        try {
                            appConfig.divisionRolePresets = typeof data.config.divisionRolePresets === 'string' 
                                ? JSON.parse(data.config.divisionRolePresets) 
                                : data.config.divisionRolePresets;
                        } catch(e) { console.error(e); }
                    }
                    Object.assign(DIVISION_ROLE_PRESETS, appConfig.divisionRolePresets);

                    appConfig.customRoles = {};
                    if (data.config.customRoles) {
                        try {
                            appConfig.customRoles = typeof data.config.customRoles === 'string' 
                                ? JSON.parse(data.config.customRoles) 
                                : data.config.customRoles;
                        } catch(e) { console.error(e); }
                    }
                    Object.assign(ROLE_LABELS, appConfig.customRoles);

                    // Update GEOFENCE_CONFIG
                    GEOFENCE_CONFIG.lat = appConfig.geofenceLat;
                    GEOFENCE_CONFIG.lng = appConfig.geofenceLng;
                    GEOFENCE_CONFIG.radius = appConfig.geofenceRadius;
                }

                try {
                    refreshUI();
                } catch(uiErr) {
                    console.error('Error in refreshUI:', uiErr);
                }
                autoClockOutForgotten(); // Auto OUT relawan yang lupa

                // Re-render the active admin tab to ensure all logs and settings are up-to-date
                try {
                    const activeTab = ['dashboard', 'employees', 'salaries', 'manual_attendance', 'violations', 'settings', 'pengumuman']
                        .find(t => {
                            const el = document.getElementById('tab-' + t);
                            return el && !el.classList.contains('hidden');
                        });
                    if (activeTab === 'manual_attendance') maInit();
                    else if (activeTab === 'violations') renderViolationsTab();
                    else if (activeTab === 'settings') loadSettingsUI();
                    else if (activeTab === 'pengumuman') initPengumumanTab();
                } catch(tabErr) {
                    console.error('Error re-rendering active tab:', tabErr);
                }

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

    // Hitung Tidak Hadir & Belum Hadir (Hanya relawan aktif yang tergolong ALLOWED_ROLES)
    const activeEmployees = employees.filter(e => ALLOWED_ROLES.includes(e.role || 'employee'));
    const presentEmpIds = new Set(todayLogs.filter(l => l.type === 'IN').map(l => String(l.empId)));
    const expectedEmployees = activeEmployees.filter(e => {
        if (typeof isDateExcludedForDiv === 'function' && isDateExcludedForDiv(today, e.division)) {
            return false;
        }
        return true;
    });

    let absentCount = 0;
    let belumHadirCount = 0;
    const now = new Date();

    expectedEmployees.forEach(e => {
        if (presentEmpIds.has(String(e.id))) return; // Already present

        const shift = appConfig.shifts?.[e.division];
        if (!shift || typeof shift === 'string' || !shift.start) {
            belumHadirCount++; // Default to Belum Hadir if shift not configured
            return;
        }

        const [sh, sm] = shift.start.split(':').map(Number);
        const shiftDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm);
        const limitDate = new Date(shiftDate.getTime() + 60 * 60 * 1000); // 1 hour past shift start

        if (now > limitDate) {
            absentCount++;
        } else {
            belumHadirCount++;
        }
    });

    // Update Stats Cards
    document.getElementById('statEmp').innerText = employees.length;
    document.getElementById('statPresent').innerText = present;
    document.getElementById('statWorking').innerText = workingCount + " Sedang Bekerja";
    document.getElementById('statAbsent').innerText = absentCount;
    const statBelum = document.getElementById('statBelumHadir');
    if (statBelum) statBelum.innerText = belumHadirCount;
    document.getElementById('statOvertime').innerText = overtimeCount;
    document.getElementById('statLate').innerText = lateCount; 

    const shiftCount = Object.keys(appConfig.shifts || {}).length;
    const shiftEl = document.getElementById('statShiftCount');
    if (shiftEl) shiftEl.innerText = `${shiftCount} Divisi`; 

    renderTrendChart();
    renderDivisionGrid();
    updateDivisionSelects();
    updateRoleSelects();

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
            badge = 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-500/20';
            statusText = 'IN';
        } else if (l.type === 'OUT') {
            const hasEarlyNote = l.note && l.note.includes('[Pulang');
            badge = hasEarlyNote 
                ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-100/50 dark:border-purple-500/20' 
                : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-500/20';
            statusText = 'OUT';
        } else if (l.type === 'REJECTED') {
            badge = 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50 line-through';
            statusText = 'DITOLAK';
        } else {
            badge = 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-150 dark:border-slate-700/30';
            statusText = l.type;
        }

        let actionArea = `<span class="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${badge}">${statusText}</span>`;
        if (l.type === 'IN' && l.lateMinutes >= 5) {
            actionArea = `<div class="flex flex-col items-center gap-0.5">
                <span class="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-100/50 dark:border-rose-500/20">TELAT</span>
                <span class="text-[9px] text-rose-400 dark:text-rose-400/80">${formatDuration(l.lateMinutes)}</span>
            </div>`;
        }
        if (l.type === 'OUT' && l.note && l.note.includes('[Pulang')) {
            actionArea = `<div class="flex flex-col items-center gap-0.5">
                <span class="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-100/50 dark:border-purple-500/20">PULANG AWAL</span>
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
                 const safeUrl = photoUrl.replace(/'/g, "\\'");
                 profilePic = `<img src="${photoUrl}" onclick="previewImage('${safeUrl}'); event.stopPropagation();" crossorigin="anonymous" class="w-8 h-8 rounded-full object-cover border border-slate-200 cursor-pointer hover:scale-110 transition duration-200 shadow-sm" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e2e8f0%22/%3E%3Ctext x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%239ca3af%22 font-size=%2240%22%3E%26%238287;%3C/text%3E%3C/svg%3E';">`;
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
                            <div class="flex items-center gap-1.5">
                                <div class="font-bold text-slate-700">${e.name}</div>
                                <button onclick="showVolunteerQRCode('${e.id}', '${e.name.replace(/'/g, "\\'")}', '${e.division.replace(/'/g, "\\'")}')" class="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-600 transition flex items-center justify-center" title="Tampilkan QR Code">
                                    <i class="fas fa-qrcode text-[10px]"></i>
                                </button>
                            </div>
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
    const ok = await showCustomConfirm({
        title: 'Konfirmasi Status?',
        message: `Apakah Anda yakin ingin mengubah status menjadi ${newStatus}?`,
        icon: 'fa-check-circle',
        iconClass: 'bg-emerald-500/10 text-emerald-500',
        confirmText: 'Ya, Konfirmasi',
        confirmClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30'
    });
    if(!ok) return;
    if(logIndex !== -1) {
        logs[logIndex].type = newStatus;
        refreshUI();
    }
    await postData('confirmAttendance', { row: row, newStatus: newStatus });
}

async function deleteAttendanceLog(row, name) {
    const ok = await showCustomConfirm({
        title: 'Hapus Data Absensi?',
        message: `Hapus data absensi ${name} pada baris ini? Absensi akan dihapus dan tidak dihitung gaji.`,
        icon: 'fa-trash-alt',
        iconClass: 'bg-red-500/10 text-red-500',
        confirmText: 'Ya, Hapus',
        confirmClass: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
    });
    if (!ok) return;
    const logIndex = logs.findIndex(l => l.row == row);
    if (logIndex !== -1) {
        logs.splice(logIndex, 1);
        refreshUI();
        renderViolationsTab();
    }
    await postData('deleteAttendance', { row: row });
}

async function rejectViolation(empId, date, name) {
    const ok = await showCustomConfirm({
        title: 'Tolak Absensi?',
        message: `Tolak absensi ${name} pada ${date}? Semua data absen (Masuk & Pulang) di hari itu akan dihapus dan tidak dihitung gaji.`,
        icon: 'fa-times-circle',
        iconClass: 'bg-red-500/10 text-red-500',
        confirmText: 'Tolak Absen',
        confirmClass: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
    });
    if (!ok) return;
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
    const ok = await showCustomConfirm({
        title: 'Konfirmasi Absensi?',
        message: `Konfirmasi absensi ${name} pada ${date}? Absensi tetap dihitung gaji dan data pelanggaran tetap tercatat.`,
        icon: 'fa-exclamation-triangle',
        iconClass: 'bg-amber-500/10 text-amber-500',
        confirmText: 'Ya, Konfirmasi',
        confirmClass: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/30'
    });
    if (!ok) return;
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
            .filter(e => ALLOWED_ROLES.includes(e.role || 'employee'))
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
                <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-900/40 rounded-xl px-4 py-2.5 border border-slate-100 dark:border-white/5 shadow-sm">
                    <span class="font-bold text-xs text-slate-700 dark:text-slate-350 truncate mr-2">${e.name}</span>
                    <div class="flex gap-2 shrink-0">
                        ${e.lateCount > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-100/50 dark:border-rose-500/20">${e.lateCount} Telat</span>` : ''}
                        ${e.earlyCount > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-amber-500/20">${e.earlyCount} Awal</span>` : ''}
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
            typeBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20">TERLAMBAT</span>';
        } else {
            if (v.duration <= 90) {
                typeBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20">PULANG AWAL</span>';
            } else {
                typeBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20">PULANG AWAL</span>';
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
            <th rowspan="2" class="border-r border-b border-slate-200/60 dark:border-white/5 p-3 w-10 text-center align-middle">No</th>
            <th rowspan="2" class="border-r border-b border-slate-200/60 dark:border-white/5 p-3 text-left align-middle min-w-[120px]">Divisi</th>
            <th rowspan="2" class="border-r border-b border-slate-200/60 dark:border-white/5 p-3 text-left align-middle min-w-[150px]">Nama Relawan</th>
            <th colspan="14" class="border-r border-b border-slate-200/60 dark:border-white/5 p-2 text-center align-middle bg-blue-50 dark:bg-indigo-500/10 text-blue-700 dark:text-indigo-300 font-extrabold uppercase tracking-wider text-[10px]">Absensi Harian (2 Minggu)</th>
            <th rowspan="2" class="border-r border-b border-slate-200/60 dark:border-white/5 p-3 text-right align-middle min-w-[140px]">Honoranium Sukarelawan</th>
            <th rowspan="2" class="border-r border-b border-slate-200/60 dark:border-white/5 p-3 text-right align-middle min-w-[100px] text-slate-500 dark:text-slate-400">Iuran BPJS</th>
            <th rowspan="2" class="border-r border-b border-slate-200/60 dark:border-white/5 p-3 text-right align-middle min-w-[80px] text-slate-500 dark:text-slate-400">TK</th>
            <th rowspan="2" class="border-r border-b border-slate-200/60 dark:border-white/5 p-3 text-right align-middle min-w-[80px] text-slate-500 dark:text-slate-400">PJ</th>
            <th rowspan="2" class="border-b border-slate-200/60 dark:border-white/5 p-3 text-right align-middle min-w-[140px] text-blue-600 dark:text-indigo-400 font-extrabold bg-blue-50/50 dark:bg-indigo-500/5">Total Upah</th>
        </tr>`;
        
        let row2 = `<tr>`;
        for (let i = 0; i < 14; i++) {
            const isWeekend = dayNames[i] === 'Minggu' || dayNames[i] === 'Sabtu';
            const textClass = isWeekend ? 'text-rose-600 font-bold' : 'text-slate-700 dark:text-slate-300 font-medium';
            row2 += `
            <th class="border-r border-b border-slate-200/60 dark:border-white/5 p-1.5 text-center align-middle text-[9px] min-w-[45px] bg-slate-50/30 dark:bg-white/[0.02]">
                <div class="${textClass}">${dayNames[i]}</div>
                <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">${dateNumbers[i]}</div>
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
        .filter(e => ALLOWED_ROLES.includes(e.role || 'employee'))
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
                    dailyCellsHtml += `<td class="border-r border-slate-200/60 dark:border-white/5 p-1.5 text-center font-mono text-[10px]">${cellContent}</td>`;
                }

                // Divisi cell is only rendered on the first row of the group with rowspan=K
                const divisionCellHtml = memberIdx === 0 
                    ? `<td rowspan="${K}" class="border-r border-slate-200/60 dark:border-white/5 p-2 font-bold text-slate-700 dark:text-slate-300 bg-slate-50/20 dark:bg-slate-900/10 align-middle text-center">${divName}</td>`
                    : '';

                rowsHtml += `
                <tr class="border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02] break-inside-avoid text-[11px] bg-white">
                    <td class="border-r border-slate-200/60 dark:border-white/5 p-2 text-center text-slate-400 font-mono">${globalIndex}</td>
                    ${divisionCellHtml}
                    <td class="border-r border-slate-200/60 dark:border-white/5 p-2 font-bold text-slate-700 dark:text-slate-300">${item.name}</td>
                    ${dailyCellsHtml}
                    <td class="border-r border-slate-200/60 dark:border-white/5 p-2 text-right font-extrabold text-slate-800 dark:text-slate-100">Rp ${item.honoranium.toLocaleString()}</td>
                    <td class="border-r border-slate-200/60 dark:border-white/5 p-2 text-right text-slate-500 dark:text-slate-400">Rp 16.800</td>
                    <td class="border-r border-slate-200/60 dark:border-white/5 p-2 text-right text-slate-400">Rp 0</td>
                    <td class="border-r border-slate-200/60 dark:border-white/5 p-2 text-right text-slate-400">Rp 0</td>
                    <td class="p-2 text-right font-extrabold text-blue-700 dark:text-indigo-400 bg-blue-50/20 dark:bg-indigo-500/10">Rp ${item.totalUpah.toLocaleString()}</td>
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
    const allowedEmployees = employees.filter(e => ALLOWED_ROLES.includes(e.role || 'employee'));
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
    const canvasEl = document.getElementById('trendChart');
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    
    let labels = [];
    const now = new Date();
    
    if (currentChartPeriod === '7d') {
        labels = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(now.getDate() - i);
            return getLocalDateStr(d);
        }).reverse();
    } else if (currentChartPeriod === '14d') {
        labels = [...Array(14)].map((_, i) => {
            const d = new Date();
            d.setDate(now.getDate() - i);
            return getLocalDateStr(d);
        }).reverse();
    } else if (currentChartPeriod === 'custom') {
        const startVal = document.getElementById('chartStartDate')?.value;
        const endVal = document.getElementById('chartEndDate')?.value;
        const start = startVal ? new Date(startVal) : null;
        const end = endVal ? new Date(endVal) : null;
        
        if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
            let current = new Date(start);
            const maxDays = 60; // limit
            let count = 0;
            while (current <= end && count < maxDays) {
                labels.push(getLocalDateStr(current));
                current.setDate(current.getDate() + 1);
                count++;
            }
        } else {
            labels = [...Array(7)].map((_, i) => {
                const d = new Date();
                d.setDate(now.getDate() - i);
                return getLocalDateStr(d);
            }).reverse();
        }
    }

    const presentData = labels.map(date => logs.filter(l => l.date === date && l.type === 'IN').length);
    const lateData = labels.map(date => logs.filter(l => l.date === date && l.lateMinutes > 0).length);
    const overtimeData = labels.map(date => logs.filter(l => l.date === date && l.type === 'OUT' && l.overtime > 0).length);

    if (trendChartInstance) trendChartInstance.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const legendColor = isDark ? '#f1f5f9' : '#1e293b';

    const labelColors = labels.map(d => {
        const dt = new Date(d + 'T00:00:00');
        return (dt.getDay() === 0 || getHoliday(d)) ? '#f43f5e' : textColor;
    });

    // Create modern gradients under lines
    const gradHadir = ctx.createLinearGradient(0, 0, 0, 240);
    gradHadir.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
    gradHadir.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    const gradTelat = ctx.createLinearGradient(0, 0, 0, 240);
    gradTelat.addColorStop(0, 'rgba(244, 63, 94, 0.2)');
    gradTelat.addColorStop(1, 'rgba(244, 63, 94, 0.0)');

    const gradLembur = ctx.createLinearGradient(0, 0, 0, 240);
    gradLembur.addColorStop(0, 'rgba(245, 158, 11, 0.2)');
    gradLembur.addColorStop(1, 'rgba(245, 158, 11, 0.0)');

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
                {
                    label: 'Hadir',
                    data: presentData,
                    borderColor: '#10b981',
                    backgroundColor: gradHadir,
                    borderWidth: 3,
                    tension: 0.38,
                    fill: true,
                    pointRadius: labels.length > 15 ? 1 : 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#10b981',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5
                },
                {
                    label: 'Telat',
                    data: lateData,
                    borderColor: '#f43f5e',
                    backgroundColor: gradTelat,
                    borderWidth: 3,
                    tension: 0.38,
                    fill: true,
                    pointRadius: labels.length > 15 ? 1 : 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#f43f5e',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5
                },
                {
                    label: 'Lembur',
                    data: overtimeData,
                    borderColor: '#f59e0b',
                    backgroundColor: gradLembur,
                    borderWidth: 3,
                    tension: 0.38,
                    fill: true,
                    pointRadius: labels.length > 15 ? 1 : 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: legendColor,
                        font: { family: 'Outfit, Inter, sans-serif', size: 11, weight: 'bold' },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                    titleColor: isDark ? '#f1f5f9' : '#1e293b',
                    bodyColor: isDark ? '#cbd5e1' : '#475569',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                    borderWidth: 1,
                    padding: 10,
                    cornerRadius: 12,
                    titleFont: { family: 'Outfit, Inter, sans-serif', weight: 'bold', size: 12 },
                    bodyFont: { family: 'Outfit, Inter, sans-serif', size: 11 },
                    displayColors: true,
                    boxWidth: 8,
                    boxHeight: 8,
                    boxPadding: 4
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: textColor,
                        font: { family: 'Outfit, Inter, sans-serif', size: 10 }
                    },
                    grid: {
                        color: gridColor,
                        drawBorder: false,
                        borderDash: [5, 5]
                    }
                },
                x: {
                    ticks: {
                        color: labelColors,
                        font: { family: 'Outfit, Inter, sans-serif', size: 10 }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function changeChartPeriod(period) {
    currentChartPeriod = period;
    
    const btns = {
        '7d': document.getElementById('btnPeriod7d'),
        '14d': document.getElementById('btnPeriod14d'),
        'custom': document.getElementById('btnPeriodCustom')
    };
    
    Object.entries(btns).forEach(([p, btn]) => {
        if (!btn) return;
        if (p === period) {
            btn.className = "px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-blue-600 text-white shadow-sm shadow-blue-600/20 active:scale-95";
        } else {
            btn.className = "px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 active:scale-95";
        }
    });
    
    const wrap = document.getElementById('customDateRangeWrap');
    if (wrap) {
        if (period === 'custom') {
            wrap.classList.remove('hidden');
            wrap.classList.add('flex');
            
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 14);
            
            const startInp = document.getElementById('chartStartDate');
            const endInp = document.getElementById('chartEndDate');
            if (startInp && !startInp.value) startInp.value = getLocalDateStr(start);
            if (endInp && !endInp.value) endInp.value = getLocalDateStr(end);
        } else {
            wrap.classList.remove('flex');
            wrap.classList.add('hidden');
        }
    }
    
    renderTrendChart();
}

function onCustomChartDatesChange() {
    if (currentChartPeriod === 'custom') {
        renderTrendChart();
    }
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
        if (!ALLOWED_ROLES.includes(emp.role || 'employee')) {
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

    // Re-check geofence at submit time (skip jika admin matikan)
    if (!appConfig.disableGeofence) {
        if (!securityCoords.lat) {
            return showToast("Tunggu GPS Terkunci!\nPastikan GPS dan Lokasi Aktif.", "error");
        }
        const dist = haversineDistance(securityCoords.lat, securityCoords.lng, GEOFENCE_CONFIG.lat, GEOFENCE_CONFIG.lng);
        if (dist > GEOFENCE_CONFIG.radius) {
            return showToast(`Di luar area absensi (${Math.round(dist)}m) dari Dapur.`, 'error');
        }
    }

    const now = new Date();
    const today = getLocalDateStr(now);
    
    const empLogs = logs.filter(l => l.empId === scannedEmployee.id).sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
    const lastLog = empLogs.length > 0 ? empLogs[0] : null;

    const bothDisabled = appConfig.disableBoth || (appConfig.disableLate && appConfig.disableEarly);
    if(type === 'IN') {
        if(lastLog && lastLog.type === 'IN' && !appConfig.allowMultipleIn) {
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
                } else if (diffMin >= appConfig.lateMaxThreshold) {
                    // Blocked completely
                    showToast(`Gagal Absen! Keterlambatan (${diffMin}m) melebihi batas maksimal (${appConfig.lateMaxThreshold}m).`, 'error');
                    setTimeout(resetSecurityFlow, 1500);
                    return;
                } else if (diffMin < appConfig.lateTolerance) {
                    // Tier 1: Toleransi
                    lateMinutes = 0;
                    toastMessage = `Telat ${diffMin}m (Toleransi).`;
                } else if (diffMin < appConfig.lateReasonThreshold) {
                    // Tier 2: Terlambat
                    toastMessage = `Terlambat ${diffMin} menit.`;
                } else if (diffMin < appConfig.lateWaThreshold) {
                    // Tier 3: Wajib Alasan
                    needsReason = 'late';
                    toastMessage = `Terlambat ${diffMin} menit — isi alasan.`;
                } else {
                    // Tier 4: Wajib Alasan + WA
                    needsReason = 'blocked';
                    toastMessage = `Terlambat ${diffMin} menit — konfirmasi ke Admin.`;
                }
            }
        }
    }
    
    if(type === 'OUT') {
        if((!lastLog || lastLog.type === 'OUT') && !appConfig.allowMultipleIn) return showToast("Belum Absen Masuk!", "error");
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

    msg.textContent = `Maaf ${name}, kamu terlambat lebih dari ${appConfig.lateWaThreshold} menit dari jam kerja divisi ${division} (${shiftStart}). Wajib isi alasan & konfirmasi ke Admin via WhatsApp.`;
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
    pendingAttendancePayload.note = `[Telat ${lateMin} mnt >${appConfig.lateWaThreshold}m] ${reason}`;
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

Dengan ini saya menginformasikan bahwa pada hari *${dateStr}* pukul *${timeStr} WIB*, saya terlambat hadir melebihi ${appConfig.lateWaThreshold} menit dari jadwal shift pukul *${shiftStart} WIB*.

Adapun alasan keterlambatan saya:
_${reason}_

Absensi saya telah *otomatis tercatat* di sistem dengan catatan terlambat. Mohon kiranya Admin berkenan meninjau pelanggaran ini.

Atas perhatiannya saya ucapkan terima kasih.
Wassalamualaikum Warahmatullahi Wabarakatuh.`;

    const phone = appConfig.adminWhatsApp || '6282114806765';
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
                securityCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                currentLocation = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
                document.getElementById('liveLoc').innerText = currentLocation;
                if (!isLocationLocked) {
                    isLocationLocked = true;
                    document.getElementById('gpsStatus').innerHTML = '<span class="text-white">GPS Terkunci</span>';
                    document.getElementById('gpsStatus').parentElement.classList.replace('text-emerald-400', 'bg-emerald-500');
                    document.getElementById('gpsStatus').parentElement.classList.add('px-2', 'rounded');
                }
                secUpdateGeofence();
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
    const allDivs = Array.from(new Set([...orderedKeys, ...Object.keys(appConfig.shifts || {})]));
    allDivs.forEach(key => {
        const shiftData = appConfig.shifts[key] || { start: "00:00", end: "08:00" };
        const startVal = typeof shiftData === 'string' ? shiftData : shiftData.start; 
        const endVal = typeof shiftData === 'string' ? "00:00" : shiftData.end;
        list.innerHTML += `
        <div class="grid grid-cols-12 gap-2 items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
            <div class="col-span-4 text-xs font-bold text-slate-700 dark:text-slate-350">${key}</div>
            <div class="col-span-4"><input type="text" inputmode="numeric" placeholder="HH:mm" maxlength="5" class="shift-start-input w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-emerald-600 focus:border-mbg-500 outline-none text-center" data-division="${key}" value="${startVal}" onchange="validateTimeInput(this); autoCalculateEndTime(this)"></div>
            <div class="col-span-4"><input type="text" inputmode="numeric" placeholder="HH:mm" maxlength="5" class="shift-end-input w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-amber-600 focus:border-mbg-500 outline-none text-center" data-division="${key}" id="end-${key.replace(/\s/g, '-')}" value="${endVal}" onchange="validateTimeInput(this)"></div>
        </div>`;
    });
    document.getElementById('configModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('configModal').classList.remove('opacity-0'), 10);
}

function toggleDivisionForm(show) {
    const collapsed = document.getElementById('divCardCollapsed');
    const expanded = document.getElementById('divCardExpanded');
    if (!collapsed || !expanded) return;
    
    if (show) {
        collapsed.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        collapsed.style.opacity = '0';
        collapsed.style.transform = 'scale(0.95)';
        collapsed.style.pointerEvents = 'none';
        
        setTimeout(() => {
            collapsed.classList.add('hidden');
            collapsed.style.opacity = '';
            collapsed.style.transform = '';
            collapsed.style.pointerEvents = '';
            
            expanded.classList.remove('hidden');
            expanded.style.opacity = '0';
            expanded.style.transform = 'scale(0.95)';
            expanded.style.transition = 'none';
            
            adjustGridSpans();
            
            expanded.offsetHeight; // trigger reflow
            
            expanded.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
            expanded.style.opacity = '1';
            expanded.style.transform = 'scale(1)';
            
            document.getElementById('divFormName').value = '';
            document.getElementById('divFormStart').value = '';
            document.getElementById('divFormEnd').value = '';
            document.getElementById('divFormRole').value = 'employee';
            document.getElementById('divFormCustomRoleWrap').classList.add('hidden');
            document.getElementById('divFormCustomRoleKey').value = '';
            document.getElementById('divFormCustomRoleLabel').value = '';
            document.getElementById('divFormCustomRoleKey').removeAttribute('required');
            document.getElementById('divFormCustomRoleLabel').removeAttribute('required');
        }, 200);
    } else {
        expanded.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        expanded.style.opacity = '0';
        expanded.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            expanded.classList.add('hidden');
            expanded.style.opacity = '';
            expanded.style.transform = '';
            
            collapsed.classList.remove('hidden');
            collapsed.style.opacity = '0';
            collapsed.style.transform = 'scale(0.95)';
            collapsed.style.transition = 'none';
            
            adjustGridSpans();
            
            collapsed.offsetHeight; // trigger reflow
            
            collapsed.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            collapsed.style.opacity = '1';
            collapsed.style.transform = 'scale(1)';
        }, 150);
    }
}

function handleDivFormRoleChange(val) {
    const customWrap = document.getElementById('divFormCustomRoleWrap');
    const keyInput = document.getElementById('divFormCustomRoleKey');
    const labelInput = document.getElementById('divFormCustomRoleLabel');
    if (!customWrap || !keyInput || !labelInput) return;
    
    if (val === 'NEW_ROLE') {
        customWrap.classList.remove('hidden');
        keyInput.setAttribute('required', 'true');
        labelInput.setAttribute('required', 'true');
    } else {
        customWrap.classList.add('hidden');
        keyInput.removeAttribute('required');
        labelInput.removeAttribute('required');
        keyInput.value = '';
        labelInput.value = '';
    }
}

async function submitNewDivision(e) {
    e.preventDefault();
    const divName = document.getElementById('divFormName').value.trim();
    let startTime = document.getElementById('divFormStart').value.trim();
    let endTime = document.getElementById('divFormEnd').value.trim();
    let selectedRole = document.getElementById('divFormRole').value;
    
    if (!divName) {
        showToast("Nama divisi tidak boleh kosong!", "error");
        return;
    }
    
    if (appConfig.shifts[divName]) {
        showToast("Divisi sudah terdaftar!", "error");
        return;
    }
    
    if (!startTime) startTime = "08:00";
    if (!endTime) endTime = "16:00";
    
    if (selectedRole === 'NEW_ROLE') {
        const customKey = document.getElementById('divFormCustomRoleKey').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        const customLabel = document.getElementById('divFormCustomRoleLabel').value.trim();
        
        if (!customKey || !customLabel) {
            showToast("Nama dan Label Akses Baru wajib diisi!", "error");
            return;
        }
        
        ROLE_LABELS[customKey] = customLabel;
        
        if (!appConfig.customRoles) appConfig.customRoles = {};
        appConfig.customRoles[customKey] = customLabel;
        
        selectedRole = customKey;
    }
    
    if (!appConfig.divisionRolePresets) appConfig.divisionRolePresets = {};
    appConfig.divisionRolePresets[divName] = selectedRole;
    
    DIVISION_ROLE_PRESETS[divName] = selectedRole;
    
    appConfig.shifts[divName] = { start: startTime, end: endTime };
    
    // Also initialize auto-out config for this new division
    let originalAutoOutConfig = appConfig.autoOutDivisionsConfig;
    let divConfig = {};
    try {
        divConfig = typeof appConfig.autoOutDivisionsConfig === 'string'
            ? JSON.parse(appConfig.autoOutDivisionsConfig)
            : (appConfig.autoOutDivisionsConfig || {});
    } catch(e) {
        divConfig = {};
    }
    if (!divConfig[divName]) {
        const defaultMin = parseInt(appConfig.autoOutGlobalMinutes) || 240;
        divConfig[divName] = { enabled: true, minutes: defaultMin };
        appConfig.autoOutDivisionsConfig = JSON.stringify(divConfig);
    }
    
    const payload = {
        shifts: appConfig.shifts,
        divisionRolePresets: appConfig.divisionRolePresets,
        customRoles: appConfig.customRoles,
        autoOutDivisionsConfig: appConfig.autoOutDivisionsConfig
    };
    
    toggleLoader(true, "Menyimpan Divisi Baru...");
    const success = await postData('saveConfig', payload);
    if (success) {
        showToast(`Divisi ${divName} berhasil ditambahkan!`, "success");
        toggleDivisionForm(false);
    } else {
        delete appConfig.shifts[divName];
        delete DIVISION_ROLE_PRESETS[divName];
        if (appConfig.divisionRolePresets) delete appConfig.divisionRolePresets[divName];
        appConfig.autoOutDivisionsConfig = originalAutoOutConfig;
        toggleLoader(false);
    }
}

function updateDivisionSelects() {
    const newEmpDiv = document.getElementById('newEmpDiv');
    const editEmpDiv = document.getElementById('editEmpDiv');
    if (!newEmpDiv || !editEmpDiv) return;
    
    const orderedKeys = ["Helper Cook", "Cook", "Head Chef", "Packing", "Distribusi", "Kenek Distribusi", "Kebersihan", "Asisten Lapangan", "Admin Gudang", "Gudang", "Keamanan Shift 1", "Keamanan Shift 2", "Cuci Ompreng", "Leader Ompreng", "Leader Packing", "Leader Helper Cook", "Admin Yayasan", "Koordinasi Lapangan"];
    const allDivs = Array.from(new Set([...orderedKeys, ...Object.keys(appConfig.shifts || {})]));
    
    const curNewVal = newEmpDiv.value;
    const curEditVal = editEmpDiv.value;
    
    const html = allDivs.map(div => `<option value="${div}">${div}</option>`).join('');
    newEmpDiv.innerHTML = html;
    editEmpDiv.innerHTML = html;
    
    if (curNewVal) newEmpDiv.value = curNewVal;
    if (curEditVal) editEmpDiv.value = curEditVal;
}

function updateRoleSelects() {
    const newEmpRole = document.getElementById('newEmpRole');
    const editEmpRole = document.getElementById('editEmpRole');
    const divFormRole = document.getElementById('divFormRole');
    if (!newEmpRole || !editEmpRole) return;
    
    const curNewVal = newEmpRole.value;
    const curEditVal = editEmpRole.value;
    
    let html = '';
    Object.entries(ROLE_LABELS).forEach(([key, label]) => {
        if (key !== 'admin') {
            html += `<option value="${key}">${label}</option>`;
        }
    });
    
    newEmpRole.innerHTML = html;
    editEmpRole.innerHTML = html;
    
    if (curNewVal) newEmpRole.value = curNewVal;
    if (curEditVal) editEmpRole.value = curEditVal;
    
    if (divFormRole) {
        const curDivRoleVal = divFormRole.value;
        let divFormHtml = '';
        Object.entries(ROLE_LABELS).forEach(([key, label]) => {
            if (key !== 'admin') {
                divFormHtml += `<option value="${key}">${label}</option>`;
            }
        });
        divFormHtml += `<option value="NEW_ROLE">+ Tambah Akses Baru</option>`;
        divFormRole.innerHTML = divFormHtml;
        if (curDivRoleVal) divFormRole.value = curDivRoleVal;
    }
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
    const now = new Date();
    const today = getLocalDateStr(now);

    // Cek 1: Sudah absen masuk hari ini? (Hanya dibatasi jika allowMultipleIn bernilai false)
    if (!appConfig.allowMultipleIn) {
        const alreadyIN = logs.some(l =>
            String(l.empId) === String(empId) &&
            l.date === today &&
            (l.type === 'IN' || l.type === 'PENDING')
        );
        if (alreadyIN) {
            return { allowed: false, message: 'Sudah absen masuk hari ini! Maksimal 1x absen masuk per hari.' };
        }
    }

    const divConfig = appConfig.shifts[division];
    if (!divConfig || typeof divConfig === 'string') return { allowed: true };

    const nowMin = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = divConfig.start.split(':').map(Number);
    const shiftStartMin = startH * 60 + startM;
    const [endH, endM] = divConfig.end.split(':').map(Number);
    const shiftEndMin = endH * 60 + endM;
    const isOvernight = shiftEndMin <= shiftStartMin;

    // Jika fitur telat+pulang awal dimatikan → bebas masuk kapan saja, bypass window 30 menit
    const lateDisabled = appConfig.disableBoth || appConfig.disableLate;
    if (lateDisabled) return { allowed: true };

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
function showAbsentVolunteers() { openModalList('Relawan Tidak Hadir Hari Ini', 'absent'); }
function showBelumHadirVolunteers() { openModalList('Relawan Belum Hadir', 'belum_hadir'); }
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
        } else if (mode === 'absent') {
            document.getElementById('activeModalSubtitle').innerText = `Tidak Hadir ${today}`;
            const activeEmployees = employees.filter(e => ALLOWED_ROLES.includes(e.role || 'employee'));
            const presentEmpIds = new Set(logs.filter(l => l.date === today && l.type === 'IN').map(l => String(l.empId)));
            const expectedEmployees = activeEmployees.filter(e => {
                if (typeof isDateExcludedForDiv === 'function' && isDateExcludedForDiv(today, e.division)) {
                    return false;
                }
                return true;
            });
            filtered = expectedEmployees.filter(e => {
                if (presentEmpIds.has(String(e.id))) return false;
                const shift = appConfig.shifts?.[e.division];
                if (!shift || typeof shift === 'string' || !shift.start) return false;
                
                const [sh, sm] = shift.start.split(':').map(Number);
                const shiftDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm);
                const limitDate = new Date(shiftDate.getTime() + 60 * 60 * 1000);
                return now > limitDate;
            });
        } else if (mode === 'belum_hadir') {
            document.getElementById('activeModalSubtitle').innerText = `Belum Hadir ${today}`;
            const activeEmployees = employees.filter(e => ALLOWED_ROLES.includes(e.role || 'employee'));
            const presentEmpIds = new Set(logs.filter(l => l.date === today && l.type === 'IN').map(l => String(l.empId)));
            const expectedEmployees = activeEmployees.filter(e => {
                if (typeof isDateExcludedForDiv === 'function' && isDateExcludedForDiv(today, e.division)) {
                    return false;
                }
                return true;
            });
            filtered = expectedEmployees.filter(e => {
                if (presentEmpIds.has(String(e.id))) return false;
                const shift = appConfig.shifts?.[e.division];
                if (!shift || typeof shift === 'string' || !shift.start) return true; // Default to Belum Hadir
                
                const [sh, sm] = shift.start.split(':').map(Number);
                const shiftDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm);
                const limitDate = new Date(shiftDate.getTime() + 60 * 60 * 1000);
                return now <= limitDate;
            });
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
                statusBadge = '<span class="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-500/20 text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">Sedang Bekerja</span>';
                timeInfo = `<div class="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">${hrs}j ${mins}m ${secs}d</div>`; 
            } else if (mode === 'present') {
                statusBadge = '<span class="bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-100/50 dark:border-blue-500/20 text-[10px] px-2 py-0.5 rounded-full font-bold">Hadir</span>';
                timeInfo = `<div class="text-[10px] text-slate-400">Masuk: <span class="font-bold text-slate-700 dark:text-slate-300">${w.inTime}</span></div>`;
            } else if (mode === 'absent') {
                statusBadge = '<span class="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-100/50 dark:border-rose-500/20 text-[10px] px-2 py-0.5 rounded-full font-bold">Tidak Hadir</span>';
                timeInfo = `<div class="text-[10px] text-slate-400">Shift: <span class="font-bold text-slate-700 dark:text-slate-300">${getShiftTime(w.division)}</span></div>`;
            } else if (mode === 'belum_hadir') {
                statusBadge = '<span class="bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-100/50 dark:border-white/5 text-[10px] px-2 py-0.5 rounded-full font-bold">Belum Hadir</span>';
                timeInfo = `<div class="text-[10px] text-slate-400">Shift: <span class="font-bold text-slate-700 dark:text-slate-300">${getShiftTime(w.division)}</span></div>`;
            } else if (mode === 'overtime') {
                statusBadge = '<span class="bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-100/50 dark:border-amber-500/20 text-[10px] px-2 py-0.5 rounded-full font-bold">Lembur</span>';
                timeInfo = `<div class="text-sm font-bold text-amber-600 dark:text-amber-400">${w.extraInfo}</div>`;
            } else if (mode === 'late') {
                statusBadge = '<span class="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-100/50 dark:border-rose-500/20 text-[10px] px-2 py-0.5 rounded-full font-bold">Terlambat</span>';
                timeInfo = `<div class="text-sm font-bold text-rose-600 dark:text-rose-400">${w.extraInfo}</div>`;
            } else {
                statusBadge = `<span class="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-100/50 dark:border-white/5 text-[10px] px-2 py-0.5 rounded-full font-bold">ID: ${w.id}</span>`;
            }
            let actionBtns = '';
            if (mode === 'active') {
                actionBtns = `<div class="flex gap-1.5 mt-2">
                    <button onclick="adminClockOut('${w.id}','${w.name}')" class="px-2.5 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-bold transition"><i class="fas fa-sign-out-alt mr-1"></i>Absen Out</button>
                    <button onclick="adminDeleteAbsen('${w.id}','${w.name}')" class="px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold transition"><i class="fas fa-trash-alt mr-1"></i>Hapus Absen</button>
                </div>`;
            }
            return `
            <div class="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500"><i class="fas fa-user"></i></div>
                    <div class="flex-1"><div class="font-bold text-sm text-slate-800 dark:text-slate-200">${w.name}</div><div class="flex items-center gap-2 mt-0.5">${statusBadge}</div></div>
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
    const ok = await showCustomConfirm({
        title: 'Absen OUT Relawan?',
        message: `Absen OUT untuk ${empName}? Waktu OUT akan dicatat sekarang oleh Admin.`,
        icon: 'fa-sign-out-alt',
        iconClass: 'bg-amber-500/10 text-amber-500',
        confirmText: 'Ya, OUT',
        confirmClass: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/30'
    });
    if (!ok) return;
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
    const ok = await showCustomConfirm({
        title: 'Hapus Semua Absen Hari Ini?',
        message: `Hapus semua absen hari ini untuk ${empName}? Data IN & OUT hari ini akan dihapus dari database.`,
        icon: 'fa-trash-alt',
        iconClass: 'bg-red-500/10 text-red-500',
        confirmText: 'Ya, Hapus',
        confirmClass: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
    });
    if (!ok) return;
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
                iconWrap.className = 'w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0';
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
        iconWrap.className = 'w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center flex-shrink-0';
        iconWrap.innerHTML = '<i class="fas fa-check text-[10px] text-emerald-600"></i>';
    }
    const label = el.querySelector('span');
    if (label) label.classList.remove('text-slate-400');
}

let customConfirmResolve = null;

function showCustomConfirm({ title, message, icon = 'fa-question', iconClass = 'bg-blue-500/10 text-blue-500', confirmText = 'Ya', confirmClass = 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30' }) {
    return new Promise((resolve) => {
        customConfirmResolve = resolve;

        const titleEl = document.getElementById('customConfirmTitle');
        const msgEl = document.getElementById('customConfirmMessage');
        const iconEl = document.getElementById('customConfirmIcon');
        const iconWrap = document.getElementById('customConfirmIconWrap');
        const yesBtn = document.getElementById('customConfirmYesBtn');
        const modal = document.getElementById('customConfirmModal');

        if (titleEl) titleEl.textContent = title;
        if (msgEl) msgEl.textContent = message;
        if (iconEl) iconEl.className = `fas ${icon} text-2xl`;
        if (iconWrap) iconWrap.className = `w-16 h-16 rounded-full flex items-center justify-center mb-4 animate-pulse ${iconClass}`;
        if (yesBtn) {
            yesBtn.textContent = confirmText;
            yesBtn.className = `flex-1 px-4 py-3 rounded-2xl font-bold text-xs shadow-lg transition active:scale-95 ${confirmClass}`;
        }

        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modal.querySelector('.clay-modal')?.classList.remove('scale-95');
            }, 10);
        }
    });
}

function closeCustomConfirm(result) {
    const modal = document.getElementById('customConfirmModal');
    if (modal) {
        modal.classList.add('opacity-0');
        modal.querySelector('.clay-modal')?.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
    if (customConfirmResolve) {
        customConfirmResolve(result);
        customConfirmResolve = null;
    }
}

function openConfirmDupModal() {
    const modal = document.getElementById('confirmDuplicateModal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('.clay-modal')?.classList.remove('scale-95');
        }, 10);
    }
}

function closeConfirmDupModal() {
    const modal = document.getElementById('confirmDuplicateModal');
    if (modal) {
        modal.classList.add('opacity-0');
        modal.querySelector('.clay-modal')?.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function cleanDuplicateLogs() {
    // Hitung duplikat lokal untuk konfirmasi
    const seen = {};
    const dupesList = [];
    logs.forEach(l => {
        const key = `${l.empId}|${l.date}|${l.type}`;
        if (seen[key]) {
            dupesList.push({
                name: l.name,
                date: l.date,
                type: l.type,
                time: l.time || ''
            });
        } else {
            seen[key] = true;
        }
    });

    const localDupes = dupesList.length;
    const msg = localDupes > 0
        ? `Ditemukan ${localDupes} data duplikat di sesi ini. Lanjutkan bersihkan Spreadsheet? (Baris pertama dipertahankan, duplikat dihapus)`
        : `Tidak ada duplikat terdeteksi secara lokal. Tetap jalankan pengecekan di server?`;

    const msgEl = document.getElementById('confirmDupMessage');
    if (msgEl) msgEl.textContent = msg;

    const detailsContainer = document.getElementById('confirmDupDetailsList');
    if (detailsContainer) {
        if (localDupes > 0) {
            detailsContainer.classList.remove('hidden');
            detailsContainer.innerHTML = dupesList.map(d => `
                <div class="flex justify-between items-center bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-white/5">
                    <span class="font-bold text-slate-700 dark:text-slate-350">${d.name}</span>
                    <span class="text-slate-500 text-[10px]">${d.date} (${d.type} - ${d.time})</span>
                </div>
            `).join('');
        } else {
            detailsContainer.classList.add('hidden');
            detailsContainer.innerHTML = '';
        }
    }

    openConfirmDupModal();
}

async function executeCleanDuplicateLogs() {
    closeConfirmDupModal();

    // Reset modal ke state awal
    document.getElementById('cleanDupScanning').classList.remove('hidden');
    document.getElementById('cleanDupSuccess').classList.add('hidden');
    document.getElementById('cleanDupError').classList.add('hidden');
    document.getElementById('cleanDupCloseBtn').classList.add('hidden');
    document.getElementById('cleanDupWaitNote').classList.remove('hidden');
    document.getElementById('cleanDupResultBadge').classList.add('hidden');
    document.getElementById('cleanDupTitle').textContent = 'Membersihkan Data Duplikat';
    document.getElementById('cleanDupSubtitle').textContent = 'Sedang memindai Spreadsheet...';
    document.getElementById('cleanDupIconWrap').className = 'w-10 h-10 rounded-xl bg-red-100 dark:bg-rose-500/20 flex items-center justify-center text-red-500 dark:text-rose-400 flex-shrink-0 transition-all duration-500';
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
            iconWrap.className = 'w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0';
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
            document.getElementById('cleanDupIconWrap').className = 'w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0 transition-all duration-500';
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
        document.getElementById('cleanDupIconWrap').className = 'w-10 h-10 rounded-xl bg-red-100 dark:bg-rose-500/20 flex items-center justify-center text-red-500 dark:text-rose-400 flex-shrink-0 transition-all duration-500';
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
            const shift = appConfig.shifts?.[emp.division];
            if (!shift) return null;
            const startVal = typeof shift === 'string' ? shift : shift.start;
            const endVal = typeof shift === 'string' ? '17:00' : shift.end;

            const [startH, startM] = startVal.split(':').map(Number);
            const [endH, endM] = endVal.split(':').map(Number);

            const inTime = new Date(`${lastIN.date}T${lastIN.time}`);
            const [inYr, inMo, inDy] = lastIN.date.split('-').map(Number);

            // Find closest shift start date relative to inTime
            const startCand1 = new Date(inYr, inMo - 1, inDy, startH, startM, 0, 0);
            const startCand2 = new Date(inYr, inMo - 1, inDy - 1, startH, startM, 0, 0);
            const startCand3 = new Date(inYr, inMo - 1, inDy + 1, startH, startM, 0, 0);

            const diff1 = Math.abs(inTime - startCand1);
            const diff2 = Math.abs(inTime - startCand2);
            const diff3 = Math.abs(inTime - startCand3);

            let actualShiftStart = startCand1;
            let minDiff = diff1;
            if (diff2 < minDiff) { actualShiftStart = startCand2; minDiff = diff2; }
            if (diff3 < minDiff) { actualShiftStart = startCand3; minDiff = diff3; }

            // Determine expectedEnd (the actual shift end date object)
            let expectedEnd = new Date(actualShiftStart.getTime());
            expectedEnd.setHours(endH, endM, 0, 0);

            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;
            if (endMinutes <= startMinutes) {
                expectedEnd.setDate(expectedEnd.getDate() + 1);
            }

            const outDate = getLocalDateStr(expectedEnd);
            const outTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

            // Cek duplikat di sisi client — jika sudah ada OUT di tanggal outDate, skip
            const alreadyHasOUT = logs.some(l =>
                String(l.empId) === String(emp.id) &&
                l.date === outDate &&
                l.type === 'OUT'
            );
            if (alreadyHasOUT) return null;

            const diffHours = (now - inTime) / 3600000;

            let autoOutMs = 240 * 60 * 1000;
            if (appConfig.autoOutType === 'division') {
                let divConfig = {};
                try {
                    divConfig = typeof appConfig.autoOutDivisionsConfig === 'string' 
                        ? JSON.parse(appConfig.autoOutDivisionsConfig) 
                        : (appConfig.autoOutDivisionsConfig || {});
                } catch(e) {
                    divConfig = {};
                }
                const conf = divConfig[emp.division] || { enabled: true, minutes: (parseInt(appConfig.autoOutGlobalMinutes) || 240) };
                if (conf.enabled !== true) {
                    return null;
                }
                const divMin = parseInt(conf.minutes) || 240;
                autoOutMs = divMin * 60 * 1000;
            } else {
                const globalMin = parseInt(appConfig.autoOutGlobalMinutes) || 240;
                autoOutMs = globalMin * 60 * 1000;
            }

            // Guard: Jangan auto out jika baru absen kurang dari 2 jam
            if (now - inTime < 2 * 3600000) return null;

            if (now.getTime() < expectedEnd.getTime() + autoOutMs) return null;

            return { emp, lastIN, outDate, outTime, diffHours };
        }).filter(Boolean);

        if (stuckWorkers.length === 0) return;

        console.log(`[AutoClockOut] ${stuckWorkers.length} relawan lupa OUT:`, stuckWorkers.map(w => w.emp.name));

        let successCount = 0;
        for (const { emp, lastIN, outDate, outTime } of stuckWorkers) {
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
    const tMultIn = document.getElementById('toggleMultipleIn');
    if (tMultIn) tMultIn.checked = appConfig.allowMultipleIn;
    const tLiveness = document.getElementById('toggleLivenessCheck');
    if (tLiveness) tLiveness.checked = appConfig.enableLivenessCheck;

    const bReason = document.getElementById('bothReasonInput');
    const lReason = document.getElementById('lateReasonInput');
    const eReason = document.getElementById('earlyReasonInput');
    if (bReason) bReason.value = appConfig.disableBothReason || '';
    if (lReason) lReason.value = appConfig.disableLateReason || '';
    if (eReason) eReason.value = appConfig.disableEarlyReason || '';

    // Geofence inputs
    const gLat = document.getElementById('geofenceLat');
    const gLng = document.getElementById('geofenceLng');
    const gRadius = document.getElementById('geofenceRadius');
    if (gLat) gLat.value = appConfig.geofenceLat;
    if (gLng) gLng.value = appConfig.geofenceLng;
    if (gRadius) gRadius.value = appConfig.geofenceRadius;

    // Lateness inputs
    const lTol = document.getElementById('lateTolerance');
    const lReasonThresh = document.getElementById('lateReasonThreshold');
    const lWaThresh = document.getElementById('lateWaThreshold');
    const lMaxThresh = document.getElementById('lateMaxThreshold');
    const adminWA = document.getElementById('adminWhatsApp');
    if (lTol) lTol.value = appConfig.lateTolerance;
    if (lReasonThresh) lReasonThresh.value = appConfig.lateReasonThreshold;
    if (lWaThresh) lWaThresh.value = appConfig.lateWaThreshold;
    if (lMaxThresh) lMaxThresh.value = appConfig.lateMaxThreshold;
    if (adminWA) adminWA.value = appConfig.adminWhatsApp;

    // Auto Out type state initialization
    setAutoOutType(appConfig.autoOutType || 'global');
    const autoOutGlobalMin = document.getElementById('autoOutGlobalMinutes');
    if (autoOutGlobalMin) autoOutGlobalMin.value = appConfig.autoOutGlobalMinutes || 240;

    // Render per-division auto-out options dynamically
    let divConfig = {};
    try {
        divConfig = typeof appConfig.autoOutDivisionsConfig === 'string' 
            ? JSON.parse(appConfig.autoOutDivisionsConfig) 
            : (appConfig.autoOutDivisionsConfig || {});
    } catch(e) {
        divConfig = {};
    }

    const orderedKeys = ["Helper Cook", "Cook", "Head Chef", "Packing", "Distribusi", "Kenek Distribusi", "Kebersihan", "Asisten Lapangan", "Admin Gudang", "Gudang", "Keamanan Shift 1", "Keamanan Shift 2", "Cuci Ompreng", "Leader Ompreng", "Leader Packing", "Leader Helper Cook", "Admin Yayasan", "Koordinasi Lapangan"];
    const allDivs = Array.from(new Set([...orderedKeys, ...Object.keys(appConfig.shifts || {})]));
    const filteredDivisions = allDivs.filter(key => !key.toLowerCase().includes('keamanan') && !key.toLowerCase().includes('security'));

    const divisionsListContainer = document.getElementById('autoOutDivisionsList');
    if (divisionsListContainer) {
        divisionsListContainer.innerHTML = '';
        filteredDivisions.forEach(div => {
            const conf = divConfig[div] || { enabled: false, minutes: 240 };
            const isChecked = conf.enabled === true;
            const minutesVal = conf.minutes !== undefined ? conf.minutes : 240;
            const inputId = `input-autoout-${div.replace(/\s/g, '-')}`;
            const toggleId = `toggle-autoout-${div.replace(/\s/g, '-')}`;
            
            divisionsListContainer.innerHTML += `
            <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 transition-all duration-200 ${!isChecked ? 'opacity-80' : ''}" id="card-autoout-${div.replace(/\s/g, '-')}">
                <div class="flex-1 mr-3">
                    <span class="text-xs font-bold text-slate-700 dark:text-slate-300 block">${div}</span>
                    <label class="relative inline-flex items-center cursor-pointer mt-1">
                        <input type="checkbox" id="${toggleId}" class="sr-only peer" ${isChecked ? 'checked' : ''} onchange="toggleDivisionAutoOut('${div.replace(/\s/g, '-')}', this.checked)">
                        <div class="w-7 h-4 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                        <span class="ml-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider peer-checked:text-purple-600">Auto Out</span>
                    </label>
                </div>
                <div class="w-24 text-right flex flex-col items-end">
                    <label class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Batas (Menit)</label>
                    <input type="number" id="${inputId}" class="w-full text-center text-xs font-bold text-slate-700 bg-white border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-xl px-2 py-1 focus:ring-2 focus:ring-purple-400 outline-none transition-all duration-200 ${!isChecked ? 'opacity-40 pointer-events-none' : ''}" value="${minutesVal}" placeholder="240">
                </div>
            </div>`;
        });
    }

    updateSettingsVisibility();
}

function toggleDivisionAutoOut(key, checked) {
    const input = document.getElementById(`input-autoout-${key}`);
    const card = document.getElementById(`card-autoout-${key}`);
    if (input) {
        if (checked) {
            input.classList.remove('opacity-40', 'pointer-events-none');
            if (card) card.classList.remove('opacity-80');
        } else {
            input.classList.add('opacity-40', 'pointer-events-none');
            if (card) card.classList.add('opacity-80');
        }
    }
}

function setAutoOutType(type) {
    appConfig.autoOutType = type;
    const btnGlobal = document.getElementById('btnAutoOutTypeGlobal');
    const btnDivision = document.getElementById('btnAutoOutTypeDivision');
    const wrapGlobal = document.getElementById('autoOutGlobalWrap');
    const wrapDivision = document.getElementById('autoOutDivisionWrap');

    if (type === 'global') {
        if (btnGlobal) {
            btnGlobal.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all border border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-600/20';
        }
        if (btnDivision) {
            btnDivision.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800';
        }
        if (wrapGlobal) wrapGlobal.classList.remove('hidden');
        if (wrapDivision) wrapDivision.classList.add('hidden');
    } else {
        if (btnGlobal) {
            btnGlobal.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800';
        }
        if (btnDivision) {
            btnDivision.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all border border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-600/20';
        }
        if (wrapGlobal) wrapGlobal.classList.add('hidden');
        if (wrapDivision) wrapDivision.classList.remove('hidden');
    }
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
    const allowMultipleIn = document.getElementById('toggleMultipleIn')?.checked || false;
    const enableLivenessCheck = document.getElementById('toggleLivenessCheck')?.checked || false;

    const geofenceLat = document.getElementById('geofenceLat')?.value.trim() || "-6.21973";
    const geofenceLng = document.getElementById('geofenceLng')?.value.trim() || "106.87015";
    const geofenceRadius = parseInt(document.getElementById('geofenceRadius')?.value) || 15;
    const lateTolerance = parseInt(document.getElementById('lateTolerance')?.value) || 5;
    const lateReasonThreshold = parseInt(document.getElementById('lateReasonThreshold')?.value) || 25;
    const lateWaThreshold = parseInt(document.getElementById('lateWaThreshold')?.value) || 35;
    const lateMaxThreshold = parseInt(document.getElementById('lateMaxThreshold')?.value) || 60;
    const adminWhatsApp = document.getElementById('adminWhatsApp')?.value.trim() || "6282114806765";
    
    const autoOutType = appConfig.autoOutType || 'global';
    const autoOutGlobalMinutes = parseInt(document.getElementById('autoOutGlobalMinutes')?.value) || 240;

    // Gather per-division configurations
    const orderedKeys = ["Helper Cook", "Cook", "Head Chef", "Packing", "Distribusi", "Kenek Distribusi", "Kebersihan", "Asisten Lapangan", "Admin Gudang", "Gudang", "Keamanan Shift 1", "Keamanan Shift 2", "Cuci Ompreng", "Leader Ompreng", "Leader Packing", "Leader Helper Cook", "Admin Yayasan", "Koordinasi Lapangan"];
    const allDivs = Array.from(new Set([...orderedKeys, ...Object.keys(appConfig.shifts || {})]));
    const filteredDivisions = allDivs.filter(key => !key.toLowerCase().includes('keamanan') && !key.toLowerCase().includes('security'));
    let divConfig = {};
    filteredDivisions.forEach(div => {
        const key = div.replace(/\s/g, '-');
        const toggle = document.getElementById(`toggle-autoout-${key}`);
        const input = document.getElementById(`input-autoout-${key}`);
        if (toggle && input) {
            divConfig[div] = {
                enabled: toggle.checked,
                minutes: parseInt(input.value) || 240
            };
        } else {
            let existing = {};
            try {
                existing = typeof appConfig.autoOutDivisionsConfig === 'string' 
                    ? JSON.parse(appConfig.autoOutDivisionsConfig) 
                    : (appConfig.autoOutDivisionsConfig || {});
            } catch(e) {}
            divConfig[div] = existing[div] || { enabled: false, minutes: 240 };
        }
    });
    const autoOutDivisionsConfig = JSON.stringify(divConfig);

    appConfig.disableBoth = disableBoth;
    appConfig.disableLate = disableLate;
    appConfig.disableEarly = disableEarly;
    appConfig.disableBothReason = disableBothReason;
    appConfig.disableLateReason = disableLateReason;
    appConfig.disableEarlyReason = disableEarlyReason;
    appConfig.disableGeofence = disableGeofence;
    appConfig.hideOvertime = hideOvertime;
    appConfig.allowMultipleIn = allowMultipleIn;
    appConfig.enableLivenessCheck = enableLivenessCheck;

    appConfig.geofenceLat = parseFloat(geofenceLat);
    appConfig.geofenceLng = parseFloat(geofenceLng);
    appConfig.geofenceRadius = geofenceRadius;
    appConfig.lateTolerance = lateTolerance;
    appConfig.lateReasonThreshold = lateReasonThreshold;
    appConfig.lateWaThreshold = lateWaThreshold;
    appConfig.lateMaxThreshold = lateMaxThreshold;
    appConfig.adminWhatsApp = adminWhatsApp;
    appConfig.autoOutGlobalMinutes = autoOutGlobalMinutes;
    appConfig.autoOutDivisionsConfig = autoOutDivisionsConfig;

    // Update GEOFENCE_CONFIG immediately
    GEOFENCE_CONFIG.lat = appConfig.geofenceLat;
    GEOFENCE_CONFIG.lng = appConfig.geofenceLng;
    GEOFENCE_CONFIG.radius = appConfig.geofenceRadius;

    toggleLoader(true, 'Menyimpan pengaturan...');
    const success = await postData('saveFeatureSettings', {
        disableBoth, disableLate, disableEarly,
        disableBothReason, disableLateReason, disableEarlyReason,
        disableGeofence, hideOvertime, allowMultipleIn, enableLivenessCheck,
        geofenceLat, geofenceLng, geofenceRadius,
        lateTolerance, lateReasonThreshold, lateWaThreshold, lateMaxThreshold,
        adminWhatsApp, autoOutType, autoOutGlobalMinutes, autoOutDivisionsConfig
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
    
    // Render ulang grafik tren kehadiran agar warnanya berganti sesuai tema gelap/terang
    renderTrendChart();
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
            .filter(e => ALLOWED_ROLES.includes(e.role || 'employee'))
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
            .filter(e => ALLOWED_ROLES.includes(e.role || 'employee'))
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
            .filter(e => ALLOWED_ROLES.includes(e.role || 'employee'))
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
            .filter(e => ALLOWED_ROLES.includes(e.role || 'employee'))
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
let maSelectedDatesIn = new Set();
let maSelectedDatesOut = new Set();
let maCalendarDateIn = new Date();
let maCalendarDateOut = new Date();
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
    '2026-02-16': 'Cuti Bersama Tahun Baru Imlek 2577 Kongzili',
    '2026-02-17': 'Tahun Baru Imlek 2577 Kongzili',
    '2026-03-18': 'Cuti Bersama Hari Suci Nyepi',
    '2026-03-19': 'Hari Suci Nyepi (Tahun Baru Saka 1948)',
    '2026-03-20': 'Cuti Bersama Hari Raya Idul Fitri 1447 H',
    '2026-03-21': 'Hari Raya Idul Fitri 1447 H',
    '2026-03-22': 'Hari Raya Idul Fitri 1447 H',
    '2026-03-23': 'Cuti Bersama Hari Raya Idul Fitri 1447 H',
    '2026-03-24': 'Cuti Bersama Hari Raya Idul Fitri 1447 H',
    '2026-04-03': 'Wafat Yesus Kristus',
    '2026-04-05': 'Hari Kebangkitan Yesus Kristus (Paskah)',
    '2026-05-01': 'Hari Buruh Internasional',
    '2026-05-14': 'Kenaikan Yesus Kristus',
    '2026-05-15': 'Cuti Bersama Kenaikan Yesus Kristus',
    '2026-05-27': 'Hari Raya Idul Adha 1447 H',
    '2026-05-28': 'Cuti Bersama Hari Raya Idul Adha 1447 H',
    '2026-05-31': 'Hari Raya Waisak 2570 BE',
    '2026-06-01': 'Hari Lahir Pancasila',
    '2026-06-16': 'Tahun Baru Islam 1448 H',
    '2026-08-17': 'Hari Kemerdekaan RI',
    '2026-08-25': 'Maulid Nabi Muhammad SAW',
    '2026-12-24': 'Cuti Bersama Hari Raya Natal',
    '2026-12-25': 'Hari Raya Natal',
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
    maRenderCalendarIn();
    maRenderCalendarOut();
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
        .filter(e => ALLOWED_ROLES.includes(e.role || 'employee'))
        .forEach(e => { if (e.division) divs.add(e.division); });
    return [...divs].sort();
}

function maRenderDivisionChips() {
    const container = document.getElementById('maDivisionChips');
    const divs = maGetDivisions();
    container.innerHTML = divs.map(d => {
        const isActive = maSelectedDivisions.has(d);
        const count = employees
            .filter(e => ALLOWED_ROLES.includes(e.role || 'employee'))
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
        .filter(e => ALLOWED_ROLES.includes(e.role || 'employee'))
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
    const allowedPool = employees.filter(e => ALLOWED_ROLES.includes(e.role || 'employee'));
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
        .filter(e => ALLOWED_ROLES.includes(e.role || 'employee'))
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

function maChangeMonthIn(delta) {
    maCalendarDateIn.setMonth(maCalendarDateIn.getMonth() + delta);
    maRenderCalendarIn();
}

function maChangeMonthOut(delta) {
    maCalendarDateOut.setMonth(maCalendarDateOut.getMonth() + delta);
    maRenderCalendarOut();
}

function maRenderCalendarGeneric(type) {
    const dateObj = type === 'IN' ? maCalendarDateIn : maCalendarDateOut;
    const selectedDatesSet = type === 'IN' ? maSelectedDatesIn : maSelectedDatesOut;
    const gridId = type === 'IN' ? 'maCalendarGridIn' : 'maCalendarGridOut';
    const monthLabelId = type === 'IN' ? 'maCalendarMonthIn' : 'maCalendarMonthOut';
    const legendId = type === 'IN' ? 'maHolidayLegendIn' : 'maHolidayLegendOut';

    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    
    const monthLabel = document.getElementById(monthLabelId);
    if (monthLabel) monthLabel.textContent = monthNames[month] + ' ' + year;

    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById(gridId);
    if (!grid) return;
    let html = '';

    for (let i = 0; i < firstDay; i++) html += '<div></div>';

    const holidaysThisMonth = [];

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isSelected = selectedDatesSet.has(dateStr);
        const dayOfWeek = new Date(year, month, d).getDay();
        const isSunday = dayOfWeek === 0;
        const holiday = getHoliday(dateStr);

        if (holiday) holidaysThisMonth.push({ date: d, name: holiday });

        let btnClass = 'h-9 rounded-lg text-xs font-bold transition-all active:scale-90 relative ';
        if (isSelected) {
            btnClass += 'bg-blue-600 text-white shadow-md shadow-blue-600/30';
        } else if (holiday) {
            btnClass += 'bg-red-50 dark:bg-rose-500/10 text-red-600 dark:text-rose-400 hover:bg-red-100 dark:hover:bg-rose-500/20 ring-1 ring-red-200 dark:ring-rose-500/20';
        } else if (isSunday) {
            btnClass += 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10';
        } else {
            btnClass += 'text-slate-600 dark:text-slate-300 hover:bg-blue-100 dark:hover:bg-slate-800';
        }

        const tooltip = holiday ? ` title="${holiday}"` : (isSunday ? ' title="Hari Minggu"' : '');
        const dot = holiday ? '<span class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-400"></span>' : '';

        html += `<button type="button" onclick="maToggleDateGeneric('${dateStr}', '${type}')"${tooltip} class="${btnClass}">${d}${dot}</button>`;
    }
    grid.innerHTML = html;
    maRenderDateTagsGeneric(type);

    // Render holiday legend below calendar
    const legendEl = document.getElementById(legendId);
    if (legendEl) {
        if (holidaysThisMonth.length === 0) {
            legendEl.innerHTML = '';
        } else {
            legendEl.innerHTML = '<div class="mt-3 space-y-1">' +
                '<p class="text-[10px] font-bold text-red-400 dark:text-red-400/80 uppercase tracking-wider"><i class="fas fa-calendar-times mr-1"></i>Hari Libur Nasional</p>' +
                holidaysThisMonth.map(h =>
                    `<div class="flex items-center gap-2 text-[11px]"><span class="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span><span class="text-red-600 dark:text-red-400 font-bold">${h.date}</span><span class="text-slate-500 dark:text-slate-400">${h.name}</span></div>`
                ).join('') + '</div>';
        }
    }
}

function maRenderCalendarIn() { maRenderCalendarGeneric('IN'); }
function maRenderCalendarOut() { maRenderCalendarGeneric('OUT'); }

function maToggleDateGeneric(dateStr, type) {
    const selectedDatesSet = type === 'IN' ? maSelectedDatesIn : maSelectedDatesOut;
    if (selectedDatesSet.has(dateStr)) selectedDatesSet.delete(dateStr); else selectedDatesSet.add(dateStr);
    maRenderCalendarGeneric(type);
}

function maRenderDateTagsGeneric(type) {
    const selectedDatesSet = type === 'IN' ? maSelectedDatesIn : maSelectedDatesOut;
    const tagsId = type === 'IN' ? 'maSelectedDatesTagsIn' : 'maSelectedDatesTagsOut';
    const container = document.getElementById(tagsId);
    if (!container) return;
    const sorted = [...selectedDatesSet].sort();
    container.innerHTML = sorted.length === 0 ? '<span class="text-xs text-slate-400 italic">Belum ada tanggal dipilih</span>' :
        sorted.map(d => `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[11px] font-bold border border-blue-100 dark:border-blue-500/20">${d} <button onclick="maRemoveDateGeneric('${d}', '${type}')" class="text-blue-400 hover:text-red-500 ml-0.5">&times;</button></span>`).join('');
}

function maRemoveDateGeneric(dateStr, type) {
    const selectedDatesSet = type === 'IN' ? maSelectedDatesIn : maSelectedDatesOut;
    selectedDatesSet.delete(dateStr);
    maRenderCalendarGeneric(type);
}

function maTypeChanged() {
    const type = document.getElementById('maType').value;
    const outWrap = document.getElementById('maTimeOutWrap');
    const inLabel = document.getElementById('maTimeLabelIn');
    
    const calIn = document.getElementById('maCalendarInSection');
    const calOut = document.getElementById('maCalendarOutSection');

    if (type === 'BOTH') {
        outWrap.classList.remove('hidden');
        inLabel.textContent = 'Jam Masuk (opsional, default sesuai shift)';
        if (calIn) calIn.classList.remove('hidden');
        if (calOut) calOut.classList.remove('hidden');
    } else if (type === 'IN') {
        outWrap.classList.add('hidden');
        document.getElementById('maTimeOut').value = '';
        inLabel.textContent = 'Jam (opsional, default sesuai shift)';
        if (calIn) calIn.classList.remove('hidden');
        if (calOut) calOut.classList.add('hidden');
    } else if (type === 'OUT') {
        outWrap.classList.add('hidden');
        document.getElementById('maTimeOut').value = '';
        inLabel.textContent = 'Jam (opsional, default sesuai shift)';
        if (calIn) calIn.classList.add('hidden');
        if (calOut) calOut.classList.remove('hidden');
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
            <td class="px-6 py-3 text-center"><span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${l.type==='IN'?'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-500/20':'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-100/50 dark:border-rose-500/20'}">${l.type}</span></td>
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

async function maDiscardCheckpoint() {
    const ok = await showCustomConfirm({
        title: 'Buang Checkpoint?',
        message: 'Buang semua data checkpoint? Entri yang belum terkirim akan hilang.',
        icon: 'fa-trash',
        iconClass: 'bg-red-500/10 text-red-500',
        confirmText: 'Ya, Buang',
        confirmClass: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
    });
    if (!ok) return;
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
    maSelectedDatesIn.clear();
    maSelectedDatesOut.clear();
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

let _pendingMaEntries = null;

function openConfirmMaModal() {
    const modal = document.getElementById('confirmMaSubmitModal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('.clay-modal')?.classList.remove('scale-95');
        }, 10);
    }
}

function closeConfirmMaModal() {
    const modal = document.getElementById('confirmMaSubmitModal');
    if (modal) {
        modal.classList.add('opacity-0');
        modal.querySelector('.clay-modal')?.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function executeMaSubmit() {
    closeConfirmMaModal();
    if (!_pendingMaEntries || _pendingMaEntries.length === 0) return;
    
    // Save initial checkpoint and start sending
    maSaveCheckpoint(_pendingMaEntries, 0, 0, 0);
    maSendEntries(_pendingMaEntries, 0, 0, 0);
    _pendingMaEntries = null;
}

async function maSubmit() {
    if (maSending) { showToast('Proses sedang berjalan.', 'error'); return; }
    if (maSelectedEmployees.size === 0) { showToast('Pilih minimal 1 relawan.', 'error'); return; }
    
    const type = document.getElementById('maType').value;
    if ((type === 'IN' || type === 'BOTH') && maSelectedDatesIn.size === 0) {
        showToast('Pilih minimal 1 tanggal masuk (IN).', 'error'); return;
    }
    if ((type === 'OUT' || type === 'BOTH') && maSelectedDatesOut.size === 0) {
        showToast('Pilih minimal 1 tanggal pulang (OUT).', 'error'); return;
    }

    const timeIn = document.getElementById('maTimeIn').value || '';
    const timeOut = document.getElementById('maTimeOut').value || '';
    const note = document.getElementById('maNote').value.trim();
    const empIds = [...maSelectedEmployees];
    const inDates = (type === 'IN' || type === 'BOTH') ? [...maSelectedDatesIn].sort() : [];
    const outDates = (type === 'OUT' || type === 'BOTH') ? [...maSelectedDatesOut].sort() : [];
    const defaultLoc = `${GEOFENCE_CONFIG.lat}, ${GEOFENCE_CONFIG.lng}`;

    // Build list of entries to send and track skipped ones
    const entries = [];
    const skippedDetails = [];

    for (const empId of empIds) {
        const emp = employees.find(e => e.id === empId);
        if (!emp) continue;
        const divConfig = appConfig.shifts[emp.division] || null;
        const defaultIn = divConfig ? divConfig.start : '08:00';
        const defaultOut = divConfig ? divConfig.end : '17:00';

        // Process IN entries
        for (const dateStr of inDates) {
            const hasIn = !appConfig.allowMultipleIn && logs.some(l => 
                String(l.empId) === String(emp.id) && 
                l.date === dateStr && 
                (l.type === 'IN' || l.type === 'PENDING')
            );
            if (hasIn) {
                skippedDetails.push(`${emp.name} (IN: ${dateStr})`);
            } else {
                entries.push({
                    empId: emp.id, name: emp.name, type: 'IN',
                    date: dateStr, forcedTime: timeIn || defaultIn,
                    location: defaultLoc, image: '', overtime: 0,
                    lateMinutes: 0, note: note, absentBy: 'Admin'
                });
            }
        }

        // Process OUT entries
        for (const dateStr of outDates) {
            const hasOut = !appConfig.allowMultipleIn && logs.some(l => 
                String(l.empId) === String(emp.id) && 
                l.date === dateStr && 
                l.type === 'OUT'
            );
            if (hasOut) {
                skippedDetails.push(`${emp.name} (OUT: ${dateStr})`);
            } else {
                entries.push({
                    empId: emp.id, name: emp.name, type: 'OUT',
                    date: dateStr, forcedTime: timeOut || defaultOut,
                    location: defaultLoc, image: '', overtime: 0,
                    lateMinutes: 0, note: note, absentBy: 'Admin'
                });
            }
        }
    }

    if (entries.length === 0) {
        showToast('Semua entri dibatalkan karena sudah ada data absensi di log (duplikat).', 'error');
        return;
    }

    const typeLabel = type === 'BOTH' ? 'IN + OUT' : type;
    let msg = `Kirim ${entries.length} entri absen ${typeLabel} untuk ${empIds.length} relawan?`;
    
    // Update skipped container in modal
    const skippedList = document.getElementById('confirmMaSkippedList');
    const skippedItems = document.getElementById('confirmMaSkippedItems');
    if (skippedList && skippedItems) {
        if (skippedDetails.length > 0) {
            skippedList.classList.remove('hidden');
            skippedItems.innerHTML = skippedDetails.map(item => `<div>• ${item}</div>`).join('');
            msg += ` (${skippedDetails.length} duplikat dilewati)`;
        } else {
            skippedList.classList.add('hidden');
            skippedItems.innerHTML = '';
        }
    }

    _pendingMaEntries = entries;
    const msgEl = document.getElementById('confirmMaMessage');
    if (msgEl) msgEl.textContent = msg;
    openConfirmMaModal();
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
    // Karbohidrat
    { name: 'Beras Putih', category: 'karbohidrat', kcal: 360, protein: 6.8, carbs: 79.3, fat: 0.7, fiber: 0.4, bdd: 100, price: 15000, kalsium: 6, zatBesi: 0.4, vitA: 0, vitC: 0, folat: 8, vitB12: 0 },
    { name: 'Beras Merah', category: 'karbohidrat', kcal: 352, protein: 7.3, carbs: 76.2, fat: 0.9, fiber: 3.5, bdd: 100, price: 22000, kalsium: 9, zatBesi: 0.8, vitA: 0, vitC: 0, folat: 20, vitB12: 0 },
    { name: 'Mie Kering', category: 'karbohidrat', kcal: 337, protein: 7.9, carbs: 70.3, fat: 3.3, fiber: 1.2, bdd: 100, price: 18000, kalsium: 14, zatBesi: 1.4, vitA: 0, vitC: 0, folat: 10, vitB12: 0 },
    { name: 'Roti Tawar', category: 'karbohidrat', kcal: 248, protein: 8.0, carbs: 50.0, fat: 1.2, fiber: 2.7, bdd: 100, price: 25000, kalsium: 50, zatBesi: 1.5, vitA: 0, vitC: 0, folat: 25, vitB12: 0 },
    { name: 'Kentang', category: 'karbohidrat', kcal: 62, protein: 2.1, carbs: 13.5, fat: 0.2, fiber: 1.8, bdd: 85, price: 20000, kalsium: 11, zatBesi: 0.3, vitA: 0, vitC: 5.9, folat: 10, vitB12: 0 },
    { name: 'Ubi Jalar', category: 'karbohidrat', kcal: 123, protein: 1.8, carbs: 27.9, fat: 0.7, fiber: 3.0, bdd: 86, price: 12000, kalsium: 30, zatBesi: 0.7, vitA: 60, vitC: 10.5, folat: 11, vitB12: 0 },
    { name: 'Jagung Pipil', category: 'karbohidrat', kcal: 150, protein: 4.7, carbs: 28.6, fat: 1.3, fiber: 2.8, bdd: 100, price: 15000, kalsium: 6, zatBesi: 0.5, vitA: 11, vitC: 5.5, folat: 42, vitB12: 0 },
    { name: 'Singkong', category: 'karbohidrat', kcal: 154, protein: 1.0, carbs: 36.8, fat: 0.3, fiber: 1.2, bdd: 75, price: 8000, kalsium: 33, zatBesi: 0.8, vitA: 0, vitC: 31.0, folat: 12, vitB12: 0 },
    { name: 'Oatmeal', category: 'karbohidrat', kcal: 379, protein: 13.2, carbs: 67.7, fat: 6.5, fiber: 10.1, bdd: 100, price: 45000, kalsium: 54, zatBesi: 4.7, vitA: 0, vitC: 0, folat: 32, vitB12: 0 },
    // Protein Hewani
    { name: 'Ayam Dada', category: 'protein_hewani', kcal: 164, protein: 31.0, carbs: 0, fat: 3.6, fiber: 0, bdd: 58, price: 42000, kalsium: 14, zatBesi: 0.9, vitA: 10, vitC: 0, folat: 4, vitB12: 0.3 },
    { name: 'Ayam Paha', category: 'protein_hewani', kcal: 209, protein: 26.0, carbs: 0, fat: 10.9, fiber: 0, bdd: 58, price: 38000, kalsium: 11, zatBesi: 1.2, vitA: 30, vitC: 0, folat: 6, vitB12: 0.4 },
    { name: 'Daging Sapi', category: 'protein_hewani', kcal: 250, protein: 26.0, carbs: 0, fat: 15.0, fiber: 0, bdd: 100, price: 125000, kalsium: 11, zatBesi: 2.8, vitA: 0, vitC: 0, folat: 6, vitB12: 2.0 },
    { name: 'Ikan Lele', category: 'protein_hewani', kcal: 90, protein: 18.7, carbs: 0, fat: 1.1, fiber: 0, bdd: 80, price: 26000, kalsium: 20, zatBesi: 0.3, vitA: 150, vitC: 0, folat: 10, vitB12: 1.8 },
    { name: 'Ikan Tongkol', category: 'protein_hewani', kcal: 117, protein: 25.0, carbs: 0, fat: 1.0, fiber: 0, bdd: 90, price: 35000, kalsium: 15, zatBesi: 1.5, vitA: 11, vitC: 0, folat: 2, vitB12: 2.2 },
    { name: 'Ikan Nila', category: 'protein_hewani', kcal: 96, protein: 20.1, carbs: 0, fat: 1.7, fiber: 0, bdd: 80, price: 32000, kalsium: 14, zatBesi: 0.6, vitA: 0, vitC: 0, folat: 4, vitB12: 1.5 },
    { name: 'Telur Ayam', category: 'protein_hewani', kcal: 154, protein: 12.4, carbs: 0.7, fat: 10.8, fiber: 0, bdd: 90, price: 28000, kalsium: 50, zatBesi: 1.2, vitA: 190, vitC: 0, folat: 44, vitB12: 1.1 },
    { name: 'Telur Puyuh', category: 'protein_hewani', kcal: 158, protein: 13.1, carbs: 0.4, fat: 11.1, fiber: 0, bdd: 90, price: 35000, kalsium: 64, zatBesi: 3.7, vitA: 156, vitC: 0, folat: 66, vitB12: 1.6 },
    { name: 'Udang', category: 'protein_hewani', kcal: 91, protein: 21.0, carbs: 0.3, fat: 0.5, fiber: 0, bdd: 68, price: 85000, kalsium: 136, zatBesi: 8.0, vitA: 16, vitC: 0, folat: 8, vitB12: 1.4 },
    { name: 'Ikan Bandeng', category: 'protein_hewani', kcal: 148, protein: 20.0, carbs: 0, fat: 7.0, fiber: 0, bdd: 80, price: 38000, kalsium: 20, zatBesi: 1.9, vitA: 45, vitC: 0, folat: 3, vitB12: 2.5 },
    // Protein Nabati
    { name: 'Tahu', category: 'protein_nabati', kcal: 80, protein: 10.9, carbs: 0.8, fat: 4.7, fiber: 0.1, bdd: 100, price: 10000, kalsium: 223, zatBesi: 3.4, vitA: 0, vitC: 0, folat: 15, vitB12: 0 },
    { name: 'Tempe', category: 'protein_nabati', kcal: 201, protein: 20.8, carbs: 13.5, fat: 8.8, fiber: 1.4, bdd: 100, price: 15000, kalsium: 111, zatBesi: 2.7, vitA: 0, vitC: 0, folat: 24, vitB12: 0.1 },
    { name: 'Kacang Tanah', category: 'protein_nabati', kcal: 525, protein: 27.9, carbs: 17.4, fat: 42.7, fiber: 2.4, bdd: 100, price: 28000, kalsium: 93, zatBesi: 4.5, vitA: 0, vitC: 0, folat: 240, vitB12: 0 },
    { name: 'Kacang Hijau', category: 'protein_nabati', kcal: 323, protein: 22.2, carbs: 56.8, fat: 1.2, fiber: 7.6, bdd: 100, price: 25000, kalsium: 125, zatBesi: 6.7, vitA: 9, vitC: 4.8, folat: 625, vitB12: 0 },
    { name: 'Kacang Kedelai', category: 'protein_nabati', kcal: 381, protein: 34.9, carbs: 24.6, fat: 18.1, fiber: 4.2, bdd: 100, price: 20000, kalsium: 222, zatBesi: 8.0, vitA: 10, vitC: 0, folat: 375, vitB12: 0 },
    { name: 'Oncom', category: 'protein_nabati', kcal: 187, protein: 13.0, carbs: 22.6, fat: 6.0, fiber: 0.5, bdd: 100, price: 12000, kalsium: 96, zatBesi: 27.0, vitA: 0, vitC: 0, folat: 18, vitB12: 0 },
    // Sayuran
    { name: 'Bayam', category: 'sayuran', kcal: 36, protein: 3.5, carbs: 6.5, fat: 0.5, fiber: 2.2, bdd: 71, price: 15000, kalsium: 99, zatBesi: 2.7, vitA: 469, vitC: 28.0, folat: 194, vitB12: 0 },
    { name: 'Kangkung', category: 'sayuran', kcal: 29, protein: 3.0, carbs: 5.4, fat: 0.3, fiber: 2.0, bdd: 70, price: 12000, kalsium: 73, zatBesi: 2.5, vitA: 315, vitC: 31.0, folat: 57, vitB12: 0 },
    { name: 'Wortel', category: 'sayuran', kcal: 42, protein: 1.2, carbs: 9.3, fat: 0.3, fiber: 4.0, bdd: 88, price: 16000, kalsium: 33, zatBesi: 0.3, vitA: 835, vitC: 5.9, folat: 19, vitB12: 0 },
    { name: 'Kol/Kubis', category: 'sayuran', kcal: 24, protein: 1.4, carbs: 4.2, fat: 0.2, fiber: 0.9, bdd: 90, price: 10000, kalsium: 40, zatBesi: 0.5, vitA: 4, vitC: 36.6, folat: 43, vitB12: 0 },
    { name: 'Buncis', category: 'sayuran', kcal: 35, protein: 2.4, carbs: 7.7, fat: 0.2, fiber: 3.2, bdd: 90, price: 18000, kalsium: 44, zatBesi: 1.0, vitA: 34, vitC: 12.2, folat: 37, vitB12: 0 },
    { name: 'Terong', category: 'sayuran', kcal: 24, protein: 1.1, carbs: 5.7, fat: 0.2, fiber: 2.5, bdd: 87, price: 12000, kalsium: 30, zatBesi: 0.4, vitA: 6, vitC: 2.2, folat: 22, vitB12: 0 },
    { name: 'Labu Siam', category: 'sayuran', kcal: 26, protein: 0.6, carbs: 6.7, fat: 0.1, fiber: 0.6, bdd: 83, price: 10000, kalsium: 14, zatBesi: 0.3, vitA: 0, vitC: 7.7, folat: 9, vitB12: 0 },
    { name: 'Tomat', category: 'sayuran', kcal: 20, protein: 1.0, carbs: 4.2, fat: 0.3, fiber: 1.5, bdd: 95, price: 15000, kalsium: 5, zatBesi: 0.3, vitA: 42, vitC: 13.7, folat: 15, vitB12: 0 },
    { name: 'Timun', category: 'sayuran', kcal: 12, protein: 0.7, carbs: 2.7, fat: 0.1, fiber: 0.5, bdd: 97, price: 8000, kalsium: 16, zatBesi: 0.2, vitA: 5, vitC: 2.8, folat: 7, vitB12: 0 },
    { name: 'Sawi Hijau', category: 'sayuran', kcal: 22, protein: 2.3, carbs: 4.0, fat: 0.3, fiber: 1.2, bdd: 85, price: 12000, kalsium: 105, zatBesi: 1.9, vitA: 260, vitC: 45.0, folat: 60, vitB12: 0 },
    { name: 'Daun Singkong', category: 'sayuran', kcal: 73, protein: 6.8, carbs: 13.0, fat: 1.2, fiber: 1.2, bdd: 60, price: 10000, kalsium: 165, zatBesi: 2.0, vitA: 360, vitC: 27.0, folat: 110, vitB12: 0 },
    // Buah
    { name: 'Pisang Ambon', category: 'buah', kcal: 99, protein: 1.2, carbs: 25.8, fat: 0.2, fiber: 0.6, bdd: 75, price: 22000, kalsium: 5, zatBesi: 0.3, vitA: 3, vitC: 8.7, folat: 20, vitB12: 0 },
    { name: 'Pepaya', category: 'buah', kcal: 46, protein: 0.5, carbs: 12.2, fat: 0, fiber: 0.7, bdd: 75, price: 10000, kalsium: 23, zatBesi: 0.1, vitA: 55, vitC: 61.8, folat: 38, vitB12: 0 },
    { name: 'Jeruk Manis', category: 'buah', kcal: 45, protein: 0.9, carbs: 11.2, fat: 0.2, fiber: 0.4, bdd: 72, price: 24000, kalsium: 40, zatBesi: 0.1, vitA: 11, vitC: 53.2, folat: 30, vitB12: 0 },
    { name: 'Semangka', category: 'buah', kcal: 28, protein: 0.5, carbs: 6.9, fat: 0.2, fiber: 0.5, bdd: 46, price: 12000, kalsium: 7, zatBesi: 0.2, vitA: 28, vitC: 8.1, folat: 3, vitB12: 0 },
    { name: 'Melon', category: 'buah', kcal: 34, protein: 0.6, carbs: 7.7, fat: 0.4, fiber: 0.3, bdd: 58, price: 18000, kalsium: 9, zatBesi: 0.2, vitA: 16, vitC: 36.7, folat: 14, vitB12: 0 },
    { name: 'Apel Malang', category: 'buah', kcal: 58, protein: 0.3, carbs: 14.9, fat: 0.4, fiber: 0.7, bdd: 88, price: 25000, kalsium: 6, zatBesi: 0.1, vitA: 4, vitC: 4.6, folat: 3, vitB12: 0 },
    // Susu & Olahan
    { name: 'Susu UHT', category: 'susu_olahan', kcal: 61, protein: 3.2, carbs: 4.5, fat: 3.5, fiber: 0, bdd: 100, price: 18000, kalsium: 120, zatBesi: 0.1, vitA: 40, vitC: 1.0, folat: 5, vitB12: 0.4, note: 'per 100ml' },
    { name: 'Susu Kental Manis', category: 'susu_olahan', kcal: 336, protein: 8.2, carbs: 55, fat: 10, fiber: 0, bdd: 100, price: 32000, kalsium: 275, zatBesi: 0.2, vitA: 95, vitC: 1.0, folat: 10, vitB12: 0.8 },
    { name: 'Yogurt Plain', category: 'susu_olahan', kcal: 52, protein: 3.5, carbs: 6.0, fat: 1.5, fiber: 0, bdd: 100, price: 45000, kalsium: 110, zatBesi: 0.1, vitA: 25, vitC: 0.5, folat: 7, vitB12: 0.3, note: 'per 100ml' },
    // Bumbu
    { name: 'Bawang Merah', category: 'bumbu', kcal: 39, protein: 1.5, carbs: 9.2, fat: 0.3, fiber: 1.0, bdd: 90, price: 35000, kalsium: 36, zatBesi: 0.8, vitA: 0, vitC: 2.0, folat: 19, vitB12: 0 },
    { name: 'Bawang Putih', category: 'bumbu', kcal: 95, protein: 4.5, carbs: 23.1, fat: 0.2, fiber: 1.1, bdd: 88, price: 40000, kalsium: 29, zatBesi: 1.7, vitA: 0, vitC: 1.2, folat: 3, vitB12: 0 },
    { name: 'Cabai Merah', category: 'bumbu', kcal: 31, protein: 1.0, carbs: 7.3, fat: 0.3, fiber: 0.4, bdd: 85, price: 45000, kalsium: 29, zatBesi: 1.4, vitA: 90, vitC: 18.0, folat: 10, vitB12: 0 },
    { name: 'Jahe', category: 'bumbu', kcal: 51, protein: 1.5, carbs: 10.1, fat: 1.0, fiber: 2.0, bdd: 85, price: 30000, kalsium: 21, zatBesi: 1.6, vitA: 0, vitC: 4.0, folat: 8, vitB12: 0 },
    { name: 'Kunyit', category: 'bumbu', kcal: 63, protein: 2.0, carbs: 14.7, fat: 1.0, fiber: 2.0, bdd: 85, price: 25000, kalsium: 24, zatBesi: 3.5, vitA: 0, vitC: 2.0, folat: 9, vitB12: 0 },
    { name: 'Gula Pasir', category: 'bumbu', kcal: 364, protein: 0, carbs: 94, fat: 0, fiber: 0, bdd: 100, price: 18000, kalsium: 1, zatBesi: 0.1, vitA: 0, vitC: 0, folat: 0, vitB12: 0 },
    { name: 'Garam', category: 'bumbu', kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, bdd: 100, price: 5000, kalsium: 0, zatBesi: 0, vitA: 0, vitC: 0, folat: 0, vitB12: 0 },
    // Minyak & Lemak
    { name: 'Minyak Goreng', category: 'minyak_lemak', kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, bdd: 100, price: 18000, kalsium: 0, zatBesi: 0, vitA: 0, vitC: 0, folat: 0, vitB12: 0 },
    { name: 'Santan Kelapa', category: 'minyak_lemak', kcal: 122, protein: 1.0, carbs: 2.5, fat: 12.2, fiber: 0, bdd: 100, price: 15000, kalsium: 16, zatBesi: 1.6, vitA: 0, vitC: 2.8, folat: 16, vitB12: 0, note: 'per 100ml' },
    { name: 'Mentega', category: 'minyak_lemak', kcal: 720, protein: 0.5, carbs: 0.4, fat: 81.6, fiber: 0, bdd: 100, price: 65000, kalsium: 15, zatBesi: 0.1, vitA: 250, vitC: 0, folat: 2, vitB12: 0.1 },
    { name: 'Margarin', category: 'minyak_lemak', kcal: 720, protein: 0.6, carbs: 0.4, fat: 81, fiber: 0, bdd: 100, price: 25000, kalsium: 20, zatBesi: 0.1, vitA: 300, vitC: 0, folat: 2, vitB12: 0 },
    { name: 'Minyak Kelapa', category: 'minyak_lemak', kcal: 870, protein: 0, carbs: 0, fat: 98, fiber: 0, bdd: 100, price: 30000, kalsium: 0, zatBesi: 0, vitA: 0, vitC: 0, folat: 0, vitB12: 0 }
];

// --- Target Gizi & Harga (Simplified 3 Unified Categories - B3) ---
const NUTRITION_TARGETS = {
    balita_sd_1_3: { 
        name: 'Balita s/d SD Kelas 1-3', 
        kcal: { min: 275, max: 413 }, 
        protein: { min: 5, max: 10 }, 
        fat: { min: 10, max: 14 }, 
        carbs: { min: 44, max: 63 }, 
        fiber: { min: 4, max: 6 },
        kalsium: { min: 165, max: 250 },
        zatBesi: { min: 2, max: 3 },
        vitA: { min: 85, max: 125 },
        vitC: { min: 9, max: 11 },
        folat: { min: 36, max: 75 },
        vitB12: { min: 0.3, max: 0.5 },
        targetCost: 10000 
    },
    sd_4_6_sma: { 
        name: 'SD Kelas 4-6 s/d SMA/MA', 
        kcal: { min: 585, max: 831 }, 
        protein: { min: 16, max: 25 }, 
        fat: { min: 20, max: 27 }, 
        carbs: { min: 87, max: 122.5 }, 
        fiber: { min: 8, max: 10 },
        kalsium: { min: 360, max: 420 },
        zatBesi: { min: 2, max: 3 },
        vitA: { min: 180, max: 228 },
        vitC: { min: 15, max: 29 },
        folat: { min: 120, max: 140 },
        vitB12: { min: 1.1, max: 1.4 },
        targetCost: 16000 
    },
    bumil_busui: { 
        name: 'Ibu Hamil & Menyusui (Busui)', 
        kcal: { min: 738, max: 898 }, 
        protein: { min: 23, max: 27 }, 
        fat: { min: 19, max: 22 }, 
        carbs: { min: 116, max: 140 }, 
        fiber: { min: 10, max: 13 },
        kalsium: { min: 360, max: 420 },
        zatBesi: { min: 5, max: 15 },
        vitA: { min: 270, max: 333 },
        vitC: { min: 26, max: 42 },
        folat: { min: 150, max: 210 },
        vitB12: { min: 1.4, max: 1.75 },
        targetCost: 22000 
    }
};

// --- Preset Menu Resmi disederhanakan ---
const PRESET_CYCLE_MENUS = {
    balita_sd_1_3: {
        menuName: 'Menu Sehat Balita - SD Kelas 1-3',
        ingredients: [
            { name: 'Beras Putih', grams: 50 },
            { name: 'Ayam Dada', grams: 40 },
            { name: 'Tempe', grams: 12.5 },
            { name: 'Wortel', grams: 50 },
            { name: 'Pisang Ambon', grams: 50 },
            { name: 'Minyak Goreng', grams: 5 },
            { name: 'Susu UHT', grams: 200 }
        ]
    },
    sd_4_6_sma: {
        menuName: 'Ikan Asam Manis SD 4-6 s/d SMA',
        ingredients: [
            { name: 'Beras Putih', grams: 87.5 },
            { name: 'Ikan Tongkol', grams: 60 },
            { name: 'Tempe', grams: 25 },
            { name: 'Buncis', grams: 50 },
            { name: 'Jeruk Manis', grams: 110 },
            { name: 'Minyak Goreng', grams: 7.5 },
            { name: 'Susu UHT', grams: 200 }
        ]
    },
    bumil_busui: {
        menuName: 'Sate Lilit Tenggiri Bumil & Busui',
        ingredients: [
            { name: 'Beras Putih', grams: 125 },
            { name: 'Ikan Tongkol', grams: 80 },
            { name: 'Tahu', grams: 110 },
            { name: 'Kangkung', grams: 100 },
            { name: 'Pisang Ambon', grams: 50 },
            { name: 'Minyak Goreng', grams: 7.5 },
            { name: 'Susu UHT', grams: 200 }
        ]
    }
};

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
let nGiziFilterState = {
    kcal: true, protein: true, fat: true, carbs: true, fiber: true,
    kalsium: false, zatBesi: false, vitA: false, vitC: false, folat: false, vitB12: false
};

function nOnGiziFilterChange() {
    const keys = Object.keys(nGiziFilterState);
    keys.forEach(k => {
        const chk = document.getElementById('chk-' + k);
        if (chk) {
            nGiziFilterState[k] = chk.checked;
        }
    });
    localStorage.setItem('mbg_gizi_filter_state', JSON.stringify(nGiziFilterState));
    nRecalcPlanner();
}

function nToggleGiziFilter() {
    const keys = Object.keys(nGiziFilterState);
    const allChecked = keys.every(k => nGiziFilterState[k]);
    keys.forEach(k => {
        const chk = document.getElementById('chk-' + k);
        if (chk) {
            chk.checked = !allChecked;
            nGiziFilterState[k] = !allChecked;
        }
    });
    localStorage.setItem('mbg_gizi_filter_state', JSON.stringify(nGiziFilterState));
    nRecalcPlanner();
}

function nLoadGiziFilterState() {
    try {
        const raw = localStorage.getItem('mbg_gizi_filter_state');
        if (raw) {
            nGiziFilterState = JSON.parse(raw);
            Object.keys(nGiziFilterState).forEach(k => {
                const chk = document.getElementById('chk-' + k);
                if (chk) chk.checked = nGiziFilterState[k];
            });
        }
    } catch (e) {}
}

function initNutritionist() {
    // Load custom foods from local storage
    nLoadCustomFoods();
    nLoadGiziFilterState();

    if (!isLoginInProgress) {
        toggleLoader(true, "Mempersiapkan Ahli Gizi Page...");
        setTimeout(() => {
            document.getElementById('nutritionistLayout').classList.remove('hidden');
            nSetupProfile();
            nLoadPlannerState();
            nRenderOverview();
            nRenderDatabase();
            nRecalcPlanner();
            nCheckCloudPlanSilently();
            showLoaderSuccess("Ahli Gizi Page Siap");
        }, 300);
    } else {
        document.getElementById('nutritionistLayout').classList.remove('hidden');
        nSetupProfile();
        nLoadPlannerState();
        nRenderOverview();
        nRenderDatabase();
        nRecalcPlanner();
        nCheckCloudPlanSilently();
    }
}

function nSetupProfile() {
    const nameEl = document.getElementById('nUserName');
    const divEl = document.getElementById('nUserDivision');
    const avatarEl = document.getElementById('nUserAvatar');
    if (nameEl) nameEl.textContent = currentUser?.name || 'Ahli Gizi';
    if (divEl) divEl.textContent = currentUser?.division || 'Nutrisionis';
    if (avatarEl) {
        const initials = (currentUser?.name || 'AG').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        avatarEl.textContent = initials;
    }
}

// --- Custom Foods Persistence ---
let nCustomFoods = [];
function nLoadCustomFoods() {
    try {
        const raw = localStorage.getItem('mbg_custom_foods');
        if (raw) {
            nCustomFoods = JSON.parse(raw);
            // Append to FOOD_DATABASE avoiding duplicates by name
            nCustomFoods.forEach(cf => {
                const exists = FOOD_DATABASE.some(f => f.name.toLowerCase() === cf.name.toLowerCase());
                if (!exists) {
                    FOOD_DATABASE.push(cf);
                }
            });
        }
    } catch (e) { console.error("Error loading custom foods:", e); }
}

function nSaveCustomFoodsToStorage() {
    localStorage.setItem('mbg_custom_foods', JSON.stringify(nCustomFoods));
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
    const titles = { overview: 'Ringkasan Kinerja', planner: 'Meal Planner & Gizi', database: 'Komposisi Bahan', history: 'Riwayat Cloud' };
    document.getElementById('nPageTitle').textContent = titles[id] || id;

    if (id === 'history') {
        nLoadHistoryFromCloud();
    }
}

// --- OVERVIEW TAB ---
function nRenderOverview() {
    // Metrics
    const totalKcal = nMenuIngredients.reduce((s, i) => s + (i.kcal * i.grams / 100), 0);
    const portions = parseInt(document.getElementById('nPortions')?.value) || 250;
    
    document.getElementById('nMetricCalories').textContent = nMenuIngredients.length > 0 ? Math.round(totalKcal) + ' kkal' : '0 kkal';
    document.getElementById('nMetricBeneficiaries').textContent = portions.toLocaleString('id-ID');
    
    // Estimate cost grand total
    const grandCost = nCalculateGrandTotalCost();
    if (grandCost > 0) {
        document.getElementById('nMetricFulfillment').textContent = 'Rp ' + Math.round(grandCost).toLocaleString('id-ID');
        const perPortion = Math.round(grandCost / portions);
        document.getElementById('nMetricFulfillmentDesc').textContent = '± Rp ' + perPortion.toLocaleString('id-ID') + ' / porsi riil';
    } else {
        document.getElementById('nMetricFulfillment').textContent = 'Rp 0';
        document.getElementById('nMetricFulfillmentDesc').textContent = 'Bahan baku + 10% bumbu';
    }

    // Focus text
    const focusEl = document.getElementById('nFocusText');
    const focusDesc = document.getElementById('nFocusDesc');
    const sasaranSel = document.getElementById('nTargetGroup')?.value || 'balita_sd_1_3';
    const sasaranName = NUTRITION_TARGETS[sasaranSel]?.name || 'Sasaran';
    
    if (nMenuIngredients.length > 0) {
        focusEl.textContent = 'Review & Finalisasi Menu';
        focusDesc.textContent = `Menu saat ini memiliki ${nMenuIngredients.length} bahan untuk sasaran ${sasaranName}. Validasi kecukupan kalori & budget.`;
    } else {
        focusEl.textContent = 'Susun Menu & Validasi Gizi';
        focusDesc.textContent = `Siapkan perencanaan menu harian untuk sasaran ${sasaranName} berdasarkan target porsi dan standar gizi Kemenkes.`;
    }

    // Menu label
    const menuName = document.getElementById('nMenuName')?.value || '';
    document.getElementById('nMenuLabel').textContent = menuName || 'Menu Aktif Tanpa Nama';

    // Nutrition chart
    nRenderNutritionChart();
    
    // Daily summary
    nRenderDailySummary();
}

function nCalculateGrandTotalCost() {
    const portions = Math.max(parseInt(document.getElementById('nPortions')?.value) || 1, 1);
    const reserve = Math.max(parseInt(document.getElementById('nReserve')?.value) || 0, 0);
    const multiplier = 1 + reserve / 100;
    
    let totalFoodCost = 0;
    nMenuIngredients.forEach(item => {
        const itemBdd = item.bdd || 100;
        const rawGrams = (item.grams * 100) / itemBdd;
        const totalKg = (rawGrams * portions * multiplier) / 1000;
        const price = item.price || 0;
        totalFoodCost += totalKg * price;
    });
    
    // Add 10% bumbu allowance
    return totalFoodCost * 1.10;
}

function nRenderNutritionChart() {
    const ctx = document.getElementById('nNutritionChart');
    if (!ctx) return;
    
    const totals = { 
        kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
        kalsium: 0, zatBesi: 0, vitA: 0, vitC: 0, folat: 0, vitB12: 0 
    };
    nMenuIngredients.forEach(i => {
        const m = i.grams / 100;
        totals.kcal += i.kcal * m;
        totals.protein += i.protein * m;
        totals.carbs += i.carbs * m;
        totals.fat += i.fat * m;
        totals.fiber += i.fiber * m;
        totals.kalsium += (i.kalsium || 0) * m;
        totals.zatBesi += (i.zatBesi || 0) * m;
        totals.vitA += (i.vitA || 0) * m;
        totals.vitC += (i.vitC || 0) * m;
        totals.folat += (i.folat || 0) * m;
        totals.vitB12 += (i.vitB12 || 0) * m;
    });

    if (nNutritionChartInstance) nNutritionChartInstance.destroy();

    const allMetrics = [
        { key: 'kcal', label: 'Kalori (kkal)', val: totals.kcal, color: '#10b981' },
        { key: 'protein', label: 'Protein (g)', val: totals.protein, color: '#0ea5e9' },
        { key: 'carbs', label: 'Karbo (g)', val: totals.carbs, color: '#f59e0b' },
        { key: 'fat', label: 'Lemak (g)', val: totals.fat, color: '#ef4444' },
        { key: 'fiber', label: 'Serat (g)', val: totals.fiber, color: '#8b5cf6' },
        { key: 'kalsium', label: 'Kalsium (mg)', val: totals.kalsium, color: '#6366f1' },
        { key: 'zatBesi', label: 'Zat Besi (mg)', val: totals.zatBesi, color: '#14b8a6' },
        { key: 'vitA', label: 'Vit A (mcg)', val: totals.vitA, color: '#eab308' },
        { key: 'vitC', label: 'Vit C (mg)', val: totals.vitC, color: '#ec4899' },
        { key: 'folat', label: 'Folat (mcg)', val: totals.folat, color: '#06b6d4' },
        { key: 'vitB12', label: 'Vit B12 (mcg)', val: totals.vitB12, color: '#a855f7' }
    ];

    const activeMetrics = allMetrics.filter(m => nGiziFilterState[m.key] === true);

    nNutritionChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: activeMetrics.map(m => m.label),
            datasets: [{
                label: 'Kandungan Aktual per Porsi',
                data: activeMetrics.map(m => parseFloat(m.val.toFixed(1))),
                backgroundColor: activeMetrics.map(m => m.color),
                borderRadius: 8,
                borderSkipped: false,
                barPercentage: 0.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false } 
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    grid: { color: '#f8fafc' }, 
                    ticks: { font: { size: 10, family: 'Plus Jakarta Sans', weight: 500 } } 
                },
                x: { 
                    grid: { display: false }, 
                    ticks: { font: { size: 10, family: 'Plus Jakarta Sans', weight: 700 } } 
                }
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
        el.innerHTML = '<div class="col-span-full text-center text-slate-400 py-6 text-xs font-semibold"><i class="fas fa-info-circle mr-1"></i> Belum ada bahan dalam menu. Silahkan susun menu di Meal Planner.</div>';
    } else {
        // Group by category and show totals in raw weight (Berat Kotor)
        const byCategory = {};
        nMenuIngredients.forEach(i => {
            if (!byCategory[i.category]) byCategory[i.category] = 0;
            const rawGrams = (i.grams * 100) / (i.bdd || 100);
            byCategory[i.category] += rawGrams * portions * multiplier;
        });
        const catIcons = { karbohidrat: 'fa-seedling', protein_hewani: 'fa-drumstick-bite', protein_nabati: 'fa-leaf', sayuran: 'fa-carrot', buah: 'fa-apple-alt', susu_olahan: 'fa-glass-whiskey', bumbu: 'fa-pepper-hot', minyak_lemak: 'fa-oil-can' };
        const catColors = { karbohidrat: 'text-amber-500 bg-amber-50', protein_hewani: 'text-rose-500 bg-rose-50', protein_nabati: 'text-lime-500 bg-lime-50', sayuran: 'text-emerald-500 bg-emerald-50', buah: 'text-orange-500 bg-orange-50', susu_olahan: 'text-sky-500 bg-sky-50', bumbu: 'text-red-500 bg-red-50', minyak_lemak: 'text-yellow-500 bg-yellow-50' };
        el.innerHTML = Object.entries(byCategory).map(([cat, grams]) => {
            const kg = (grams / 1000).toFixed(1);
            const iconClass = catIcons[cat] || 'fa-box';
            const colorClass = catColors[cat] || 'text-slate-500 bg-slate-50';
            return `<div class="n-daily-item flex flex-col items-center justify-center">
                <div class="w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center text-base mb-2"><i class="fas ${iconClass}"></i></div>
                <div class="text-lg font-black text-slate-800">${parseFloat(kg).toLocaleString('id-ID')} kg</div>
                <div class="text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center mt-0.5">${CATEGORY_LABELS[cat] || cat}</div>
            </div>`;
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

    if (countEl) countEl.textContent = `${filtered.length} bahan pangan`;

    tbody.innerHTML = filtered.length > 0 ? filtered.map(f => {
        const cc = CATEGORY_COLORS[f.category] || {};
        const catLabel = CATEGORY_LABELS[f.category] || f.category;
        const bddVal = f.bdd || 100;
        const priceVal = f.price || 0;
        return `<tr>
            <td class="px-5 py-3 font-bold text-slate-700">${f.name}${f.note ? ` <span class="text-[9px] text-slate-400 font-semibold">(${f.note})</span>` : ''}</td>
            <td class="px-4 py-3 text-center"><span class="text-[9px] font-extrabold px-2 py-0.5 rounded-full ${cc.bg || ''} ${cc.text || ''} ${cc.border || ''} border">${catLabel}</span></td>
            <td class="px-4 py-3 text-center font-bold text-slate-600">${bddVal}%</td>
            <td class="px-4 py-3 text-center font-extrabold text-slate-700">${f.kcal}</td>
            <td class="px-4 py-3 text-center text-slate-600">${f.protein}g</td>
            <td class="px-4 py-3 text-center text-slate-600">${f.carbs}g</td>
            <td class="px-4 py-3 text-center text-slate-600">${f.fat}g</td>
            <td class="px-4 py-3 text-center text-slate-600">${f.fiber}g</td>
            <td class="px-4 py-3 text-right text-slate-700 font-bold">Rp ${priceVal.toLocaleString('id-ID')}</td>
            <td class="px-4 py-3 text-center">
                <button onclick="nQuickAddFromDb('${f.name.replace(/'/g, "\'")}')" class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center justify-center transition mx-auto active:scale-95"><i class="fas fa-plus text-xs"></i></button>
            </td>
        </tr>`;
    }).join('') : `<tr><td colspan="10" class="text-center text-slate-400 py-10 text-sm font-semibold">Tidak ada bahan makanan yang cocok.</td></tr>`;
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
        return `<div onclick="nSelectIngredient('${f.name.replace(/'/g, "\'")}')" class="px-4 py-2 hover:bg-emerald-50 cursor-pointer flex items-center justify-between transition">
            <div><span class="text-xs font-bold text-slate-700">${f.name}</span><span class="ml-2 text-[9px] font-extrabold ${cc.text || 'text-slate-400'}">${CATEGORY_LABELS[f.category] || ''}</span></div>
            <span class="text-[10px] text-slate-400 font-semibold">${f.kcal} kkal</span>
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
            fiber: nPendingIngredient.fiber,
            kalsium: nPendingIngredient.kalsium || 0,
            zatBesi: nPendingIngredient.zatBesi || 0,
            vitA: nPendingIngredient.vitA || 0,
            vitC: nPendingIngredient.vitC || 0,
            folat: nPendingIngredient.folat || 0,
            vitB12: nPendingIngredient.vitB12 || 0,
            bdd: nPendingIngredient.bdd || 100,
            price: nPendingIngredient.price || 0
        });
    }
    
    // Reset input
    document.getElementById('nAddIngredientSearch').value = '';
    document.getElementById('nAddGrams').value = 100;
    nPendingIngredient = null;
    
    nRecalcPlanner();
    nSavePlannerState();
    showToast(`${existing ? 'Mengubah porsi' : 'Ditambahkan'}: ${nMenuIngredients[nMenuIngredients.length - 1]?.name || 'bahan'}`);
}

function nRemoveIngredient(index) {
    const name = nMenuIngredients[index]?.name;
    nMenuIngredients.splice(index, 1);
    nRecalcPlanner();
    nSavePlannerState();
    showToast(`Bahan dihapus: ${name || ''}`);
}

function nUpdateIngredientGrams(index, value) {
    const grams = parseInt(value) || 0;
    if (grams <= 0) { nRemoveIngredient(index); return; }
    nMenuIngredients[index].grams = grams;
    nRecalcPlanner();
    nSavePlannerState();
}

function nUpdateIngredientPrice(index, value) {
    const price = parseFloat(value) || 0;
    nMenuIngredients[index].price = price;
    nRecalcPlanner();
    nSavePlannerState();
}

function nOnSasaranChange() {
    const sasaranSel = document.getElementById('nTargetGroup').value;
    const target = NUTRITION_TARGETS[sasaranSel];
    if (target) {
        // Set default target budget based on target costs
        const budgetInput = document.getElementById('nTargetBudget');
        if (budgetInput) budgetInput.value = target.targetCost || 15000;
    }
    nRecalcPlanner();
    nSavePlannerState();
}

async function nTriggerPresetMenuDirect() {
    nSwitchTab('planner');
    await nLoadPresetMenu();
}

async function nLoadPresetMenu() {
    const sasaranSel = document.getElementById('nTargetGroup').value;
    const preset = PRESET_CYCLE_MENUS[sasaranSel];
    if (!preset) {
        showToast('Preset menu gizi untuk sasaran ini belum tersedia', 'error');
        return;
    }

    if (nMenuIngredients.length > 0) {
        const ok = await showCustomConfirm({
            title: 'Muat Menu Standar?',
            message: 'Muat menu standar resmi PDF? Rencana penyusunan bahan saat ini akan diganti.',
            icon: 'fa-file-pdf',
            iconClass: 'bg-blue-500/10 text-blue-500',
            confirmText: 'Ya, Muat',
            confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30'
        });
        if (!ok) return;
    }

    // Clear current ingredients and populate
    nMenuIngredients = [];
    preset.ingredients.forEach(item => {
        const found = FOOD_DATABASE.find(f => f.name.toLowerCase() === item.name.toLowerCase());
        if (found) {
            nMenuIngredients.push({
                name: found.name,
                category: found.category,
                grams: item.grams,
                kcal: found.kcal,
                protein: found.protein,
                carbs: found.carbs,
                fat: found.fat,
                fiber: found.fiber,
                kalsium: found.kalsium || 0,
                zatBesi: found.zatBesi || 0,
                vitA: found.vitA || 0,
                vitC: found.vitC || 0,
                folat: found.folat || 0,
                vitB12: found.vitB12 || 0,
                bdd: found.bdd || 100,
                price: found.price || 0
            });
        }
    });

    const menuNameEl = document.getElementById('nMenuName');
    if (menuNameEl) menuNameEl.value = preset.menuName;

    nRecalcPlanner();
    nSavePlannerState();
    showToast(`Preset menu resmi "${preset.menuName}" berhasil dimuat!`);
}

function nRecalcPlanner() {
    const listEl = document.getElementById('nMenuIngredientList');
    const calcEl = document.getElementById('nNutritionCalc');
    const costEl = document.getElementById('nCostingCalc');
    const shopEl = document.getElementById('nShoppingList');
    const countBadge = document.getElementById('nIngredientCountBadge');
    
    if (!listEl) return;
    
    const portions = Math.max(parseInt(document.getElementById('nPortions')?.value) || 1, 1);
    const reserve = Math.max(parseInt(document.getElementById('nReserve')?.value) || 0, 0);
    const multiplier = 1 + reserve / 100;
    
    // Ingredient count badge
    if (countBadge) countBadge.textContent = `${nMenuIngredients.length} item`;
    
    // Render ingredient table list
    if (nMenuIngredients.length === 0) {
        listEl.innerHTML = '<tr><td colspan="9" class="text-center text-slate-400 py-10 font-semibold"><i class="fas fa-inbox text-2xl mb-2 block text-slate-200"></i>Belum ada bahan makanan. Tambah dari database.</td></tr>';
    } else {
        listEl.innerHTML = nMenuIngredients.map((item, i) => {
            const cc = CATEGORY_COLORS[item.category] || {};
            const rawGrams = (item.grams * 100) / (item.bdd || 100);
            const totalKg = (rawGrams * portions * multiplier) / 1000;
            const itemPrice = item.price || 0;
            const itemCost = totalKg * itemPrice;
            
            const displayBelanja = totalKg >= 1 ? `${totalKg.toFixed(2)} kg` : `${Math.round(totalKg * 1000)} g`;
            
            return `<tr>
                <td class="py-2.5 font-bold text-slate-700">${item.name}</td>
                <td class="py-2.5 text-center"><span class="text-[9px] font-extrabold px-2 py-0.5 rounded-full ${cc.bg || ''} ${cc.text || ''} ${cc.border || ''} border">${CATEGORY_LABELS[item.category] || ''}</span></td>
                <td class="py-2.5 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                        <input type="number" min="1" value="${item.grams}" onchange="nUpdateIngredientGrams(${i}, this.value)" class="w-14 text-center font-bold text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5 outline-none focus:border-emerald-400">
                        <span class="text-slate-400">g</span>
                    </div>
                </td>
                <td class="py-2.5 text-center text-slate-500 font-bold">${item.bdd}%</td>
                <td class="py-2.5 text-right font-semibold text-slate-600">${rawGrams.toFixed(1)} g</td>
                <td class="py-2.5 text-right font-bold text-slate-600">${displayBelanja}</td>
                <td class="py-2.5 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                        <span class="text-[10px] text-slate-300">Rp</span>
                        <input type="number" min="0" value="${itemPrice}" onchange="nUpdateIngredientPrice(${i}, this.value)" class="w-16 text-right font-bold text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5 outline-none focus:border-emerald-400">
                    </div>
                </td>
                <td class="py-2.5 text-right text-emerald-700 font-extrabold">Rp ${Math.round(itemCost).toLocaleString('id-ID')}</td>
                <td class="py-2.5 text-center">
                    <button onclick="nRemoveIngredient(${i})" class="w-7 h-7 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition mx-auto"><i class="fas fa-trash-alt text-xs"></i></button>
                </td>
            </tr>`;
        }).join('');
    }
    
    // Calculate nutrition per portion
    const totals = { 
        kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
        kalsium: 0, zatBesi: 0, vitA: 0, vitC: 0, folat: 0, vitB12: 0 
    };
    nMenuIngredients.forEach(i => {
        const m = i.grams / 100;
        totals.kcal += i.kcal * m;
        totals.protein += i.protein * m;
        totals.carbs += i.carbs * m;
        totals.fat += i.fat * m;
        totals.fiber += i.fiber * m;
        totals.kalsium += (i.kalsium || 0) * m;
        totals.zatBesi += (i.zatBesi || 0) * m;
        totals.vitA += (i.vitA || 0) * m;
        totals.vitC += (i.vitC || 0) * m;
        totals.folat += (i.folat || 0) * m;
        totals.vitB12 += (i.vitB12 || 0) * m;
    });
    
    // Get targets
    const sasaranSel = document.getElementById('nTargetGroup')?.value || 'balita_sd_1_3';
    const target = NUTRITION_TARGETS[sasaranSel] || NUTRITION_TARGETS.balita_sd_1_3;
    
    const sasaranBadge = document.getElementById('nSasaranBadge');
    if (sasaranBadge) sasaranBadge.textContent = target.name;
    
    if (calcEl) {
        const metrics = [
            { key: 'kcal', label: 'Energi / Kalori', value: totals.kcal.toFixed(0), unit: 'kkal', tMin: target.kcal.min, tMax: target.kcal.max, color: 'bg-emerald-500' },
            { key: 'protein', label: 'Zat Pembangun / Protein', value: totals.protein.toFixed(1), unit: 'g', tMin: target.protein.min, tMax: target.protein.max, color: 'bg-sky-500' },
            { key: 'fat', label: 'Zat Energi Cadangan / Lemak', value: totals.fat.toFixed(1), unit: 'g', tMin: target.fat.min, tMax: target.fat.max, color: 'bg-red-500' },
            { key: 'carbs', label: 'Zat Pengatur / Karbohidrat', value: totals.carbs.toFixed(1), unit: 'g', tMin: target.carbs.min, tMax: target.carbs.max, color: 'bg-amber-500' },
            { key: 'fiber', label: 'Serat Pangan', value: totals.fiber.toFixed(1), unit: 'g', tMin: target.fiber.min, tMax: target.fiber.max, color: 'bg-violet-500' },
            { key: 'kalsium', label: 'Kalsium', value: totals.kalsium.toFixed(1), unit: 'mg', tMin: target.kalsium.min, tMax: target.kalsium.max, color: 'bg-indigo-500' },
            { key: 'zatBesi', label: 'Zat Besi', value: totals.zatBesi.toFixed(1), unit: 'mg', tMin: target.zatBesi.min, tMax: target.zatBesi.max, color: 'bg-teal-500' },
            { key: 'vitA', label: 'Vitamin A', value: totals.vitA.toFixed(1), unit: 'mcg', tMin: target.vitA.min, tMax: target.vitA.max, color: 'bg-yellow-500' },
            { key: 'vitC', label: 'Vitamin C', value: totals.vitC.toFixed(1), unit: 'mg', tMin: target.vitC.min, tMax: target.vitC.max, color: 'bg-pink-500' },
            { key: 'folat', label: 'Folat', value: totals.folat.toFixed(1), unit: 'mcg', tMin: target.folat.min, tMax: target.folat.max, color: 'bg-cyan-500' },
            { key: 'vitB12', label: 'Vitamin B12', value: totals.vitB12.toFixed(1), unit: 'mcg', tMin: target.vitB12.min, tMax: target.vitB12.max, color: 'bg-purple-500' }
        ];
        
        // Filter out items that are not checked in filter panel
        const activeMetrics = metrics.filter(m => nGiziFilterState[m.key] === true);
        
        if (activeMetrics.length === 0) {
            calcEl.innerHTML = '<div class="text-center text-slate-400 py-6 font-semibold text-xs"><i class="fas fa-eye-slash text-lg mb-1 block"></i>Tidak ada zat gizi yang dipilih untuk ditampilkan.</div>';
        } else {
            calcEl.innerHTML = activeMetrics.map(m => {
                const actualVal = parseFloat(m.value);
                let statusText = 'Sesuai';
                let badgeClass = 'sesuai';
                if (actualVal < m.tMin) { statusText = 'Rendah'; badgeClass = 'rendah'; }
                else if (actualVal > m.tMax) { statusText = 'Tinggi'; badgeClass = 'tinggi'; }
                
                // Progress percentage capped at 100
                const pct = Math.min((actualVal / m.tMax) * 100, 100);
                
                return `<div>
                    <div class="flex justify-between items-center mb-1">
                        <div>
                            <span class="text-[11px] font-bold text-slate-700">${m.label}</span>
                            <span class="text-[9px] text-slate-400 font-semibold ml-1.5">(Target ${m.tMin}-${m.tMax} ${m.unit})</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-black text-slate-800">${m.value} ${m.unit}</span>
                            <span class="n-status-badge ${badgeClass}">${statusText}</span>
                        </div>
                    </div>
                    <div class="n-nutrition-bar">
                        <div class="n-nutrition-bar-fill ${m.color}" style="width: ${pct}%"></div>
                    </div>
                </div>`;
            }).join('');
        }
    }
    
    // Calculate costing & budget comparison
    let totalFoodCostPerPortion = 0;
    nMenuIngredients.forEach(item => {
        const itemBdd = item.bdd || 100;
        const rawGrams = (item.grams * 100) / itemBdd;
        const pricePerGram = (item.price || 0) / 1000;
        totalFoodCostPerPortion += rawGrams * pricePerGram;
    });
    
    const bumbuCost = totalFoodCostPerPortion * 0.10;
    const realCostPerPortion = totalFoodCostPerPortion + bumbuCost;
    const grandTotalPurchaseCost = realCostPerPortion * portions * multiplier;
    
    const targetBudgetPerPortion = parseFloat(document.getElementById('nTargetBudget')?.value) || 15000;
    
    if (costEl) {
        let costStatusText = 'Hemat';
        let costBadgeClass = 'sesuai';
        if (realCostPerPortion > targetBudgetPerPortion) { costStatusText = 'Overbudget'; costBadgeClass = 'tinggi'; }
        else if (realCostPerPortion > targetBudgetPerPortion * 0.9) { costStatusText = 'Sesuai Budget'; costBadgeClass = 'rendah'; }
        
        // Update header badge
        const headerBadge = document.getElementById('nCostStatusBadge');
        if (headerBadge) {
            headerBadge.textContent = costStatusText;
            headerBadge.className = `text-[9px] font-extrabold px-2 py-0.5 rounded ${costBadgeClass === 'sesuai' ? 'bg-emerald-50 text-emerald-700' : costBadgeClass === 'rendah' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`;
        }
        
        const costPct = Math.min((realCostPerPortion / targetBudgetPerPortion) * 100, 100);
        
        costEl.innerHTML = `
            <div class="grid grid-cols-2 gap-3 text-slate-700 text-xs font-semibold">
                <div>Biaya Bahan Baku:</div>
                <div class="text-right text-slate-800">Rp ${Math.round(totalFoodCostPerPortion).toLocaleString('id-ID')} / porsi</div>
                <div>Estimasi Bumbu (10%):</div>
                <div class="text-right text-slate-800">Rp ${Math.round(bumbuCost).toLocaleString('id-ID')} / porsi</div>
                <div class="border-t border-slate-50 pt-2 font-bold text-slate-800">Total Riil per Porsi:</div>
                <div class="border-t border-slate-50 pt-2 text-right font-black text-emerald-700 text-sm">Rp ${Math.round(realCostPerPortion).toLocaleString('id-ID')}</div>
            </div>
            
            <div class="pt-2">
                <div class="flex justify-between text-[10px] text-slate-400 font-extrabold mb-1">
                    <span>Pemakaian Anggaran vs Target</span>
                    <span>Rp ${Math.round(realCostPerPortion).toLocaleString('id-ID')} / Rp ${Math.round(targetBudgetPerPortion).toLocaleString('id-ID')}</span>
                </div>
                <div class="n-nutrition-bar">
                    <div class="n-nutrition-bar-fill ${realCostPerPortion > targetBudgetPerPortion ? 'bg-red-500' : 'bg-emerald-500'}" style="width: ${costPct}%"></div>
                </div>
            </div>
            
            <div class="border-t border-slate-50 pt-3 flex flex-col justify-center items-center bg-slate-50/50 rounded-xl p-3">
                <span class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Total Anggaran Belanja Belanja</span>
                <span class="text-base font-black text-slate-800 mt-1">Rp ${Math.round(grandTotalPurchaseCost).toLocaleString('id-ID')}</span>
                <span class="text-[9px] text-slate-400 font-medium mt-0.5">Mencakup ${portions} porsi + ${reserve}% cadangan</span>
            </div>
        `;
    }
    
    // Shopping list
    if (shopEl) {
        if (nMenuIngredients.length === 0) {
            shopEl.innerHTML = '<div class="text-center text-slate-400 py-4 text-xs font-semibold">Belum ada kebutuhan belanja.</div>';
        } else {
            shopEl.innerHTML = nMenuIngredients.map(item => {
                const rawGrams = (item.grams * 100) / (item.bdd || 100);
                const totalGrams = rawGrams * portions * multiplier;
                const display = totalGrams >= 1000 ? `${(totalGrams / 1000).toFixed(2)} kg` : `${Math.round(totalGrams)} g`;
                return `<div class="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-slate-50 border border-slate-100/50">
                    <span class="text-xs text-slate-700 font-bold">${item.name}</span>
                    <span class="text-xs font-black text-emerald-700">${display}</span>
                </div>`;
            }).join('');
        }
    }
    
    // Update overview metrics
    nRenderOverview();
}

async function nResetPlanner() {
    const ok = await showCustomConfirm({
        title: 'Reset Perencanaan Menu?',
        message: 'Dereset menu saat ini? Semua progres bahan penyusunan akan hilang.',
        icon: 'fa-undo',
        iconClass: 'bg-red-500/10 text-red-500',
        confirmText: 'Ya, Reset',
        confirmClass: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
    });
    if (!ok) return;
    nMenuIngredients = [];
    const nameEl = document.getElementById('nMenuName');
    if (nameEl) nameEl.value = '';
    const portionsEl = document.getElementById('nPortions');
    if (portionsEl) portionsEl.value = 250;
    const reserveEl = document.getElementById('nReserve');
    if (reserveEl) reserveEl.value = 10;
    const budgetEl = document.getElementById('nTargetBudget');
    if (budgetEl) budgetEl.value = 12000;
    const sasaranEl = document.getElementById('nTargetGroup');
    if (sasaranEl) sasaranEl.value = 'balita_sd_1_3';
    
    nRecalcPlanner();
    nSavePlannerState();
    showToast('Menu berhasil direset');
}

// --- PERSISTENCE (localStorage) ---
function nSavePlannerState() {
    const state = {
        ingredients: nMenuIngredients,
        menuName: document.getElementById('nMenuName')?.value || '',
        portions: document.getElementById('nPortions')?.value || '250',
        reserve: document.getElementById('nReserve')?.value || '10',
        targetBudget: document.getElementById('nTargetBudget')?.value || '12000',
        session: document.getElementById('nSession')?.value || 'siang',
        sasaran: document.getElementById('nTargetGroup')?.value || 'balita_sd_1_3',
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
        const sasaranEl = document.getElementById('nTargetGroup');
        if (sasaranEl && state.sasaran) sasaranEl.value = state.sasaran;
        const budgetEl = document.getElementById('nTargetBudget');
        if (budgetEl && state.targetBudget) budgetEl.value = state.targetBudget;
    } catch (e) { /* ignore */ }
}

// --- CLOUD SINKRONISASI ---
async function nSavePlannerToCloud() {
    const plan = {
        userId: currentUser?.id || '',
        username: currentUser?.u || '',
        name: currentUser?.name || '',
        division: currentUser?.division || '',
        menuName: document.getElementById('nMenuName')?.value || '',
        session: document.getElementById('nSession')?.value || 'siang',
        portions: document.getElementById('nPortions')?.value || '250',
        reserve: document.getElementById('nReserve')?.value || '10',
        targetBudget: document.getElementById('nTargetBudget')?.value || '12000',
        sasaran: document.getElementById('nTargetGroup')?.value || 'balita_sd_1_3',
        ingredients: nMenuIngredients,
        savedAt: new Date().toISOString()
    };
    
    const badge = document.getElementById('nSyncBadge');
    if (badge) {
        badge.innerHTML = '<i class="fas fa-spinner fa-spin text-[10px]"></i> Menyimpan...';
        badge.className = 'inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-full';
    }
    
    try {
        const resp = await callApi('saveNutritionistPlan', plan);
        if (resp.ok && resp.data?.status === 'success') {
            showToast('Rencana menu berhasil disimpan ke Cloud Google Sheets!');
            if (badge) {
                badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Tersimpan di Cloud';
                badge.className = 'inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full';
            }
        } else {
            throw new Error(resp.data?.message || 'Gagal simpan');
        }
    } catch (e) {
        showToast('Gagal sinkronisasi cloud: ' + e.message, 'error');
        if (badge) {
            badge.innerHTML = '<i class="fas fa-exclamation-circle text-xs"></i> Koneksi Gagal';
            badge.className = 'inline-flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-3 py-1.5 rounded-full';
        }
    }
}

async function nCheckCloudPlanSilently() {
    try {
        const payload = { userId: currentUser?.id || '', username: currentUser?.u || '' };
        const resp = await callApi('loadNutritionistPlan', payload);
        if (resp.ok && resp.data?.status === 'success' && resp.data.plan) {
            const plan = resp.data.plan;
            // Offer user to load it with a nice confirmation Toast
            const planDate = new Date(plan.savedAt).toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' });
            
            showToastAction(
                `Ditemukan rencana menu cloud yang disimpan pada ${planDate}. Ingin memuat?`,
                'Muat',
                () => { nLoadPlanData(plan); }
            );
        }
    } catch (e) { console.error("Cloud plan silent check failed:", e); }
}

function showToastAction(msg, actionText, callback) {
    // Elegant custom toast notification with action button
    const container = document.getElementById('toastContainer') || document.body;
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-5 right-5 bg-slate-900 text-white rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-4 border border-slate-800 z-[9999] animate-slide-up max-w-sm';
    toast.innerHTML = `
        <div>
            <p class="text-xs font-semibold text-slate-200 leading-normal">${msg}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
            <button class="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-[10px] uppercase transition-all" id="nToastActionBtn">${actionText}</button>
            <button class="w-6 h-6 rounded-lg text-slate-400 hover:bg-slate-800 flex items-center justify-center text-xs" onclick="this.parentElement.parentElement.remove()"><i class="fas fa-times"></i></button>
        </div>
    `;
    container.appendChild(toast);
    
    document.getElementById('nToastActionBtn').onclick = () => {
        callback();
        toast.remove();
    };
    
    // Auto remove after 15 seconds
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 15000);
}

function nLoadPlanData(plan) {
    nMenuIngredients = plan.ingredients || [];
    const nameEl = document.getElementById('nMenuName');
    if (nameEl && plan.menuName) nameEl.value = plan.menuName;
    const portionsEl = document.getElementById('nPortions');
    if (portionsEl && plan.portions) portionsEl.value = plan.portions;
    const reserveEl = document.getElementById('nReserve');
    if (reserveEl && plan.reserve) reserveEl.value = plan.reserve;
    const sessionEl = document.getElementById('nSession');
    if (sessionEl && plan.session) sessionEl.value = plan.session;
    const sasaranEl = document.getElementById('nTargetGroup');
    if (sasaranEl && plan.sasaran) sasaranEl.value = plan.sasaran;
    const budgetEl = document.getElementById('nTargetBudget');
    if (budgetEl && plan.targetBudget) budgetEl.value = plan.targetBudget;
    
    nRecalcPlanner();
    nSavePlannerState();
    showToast('Rencana gizi berhasil dimuat dari Cloud!');
    nSwitchTab('planner');
}

async function nLoadHistoryFromCloud() {
    const tbody = document.getElementById('nHistoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin mr-1"></i> Memuat riwayat dari cloud...</td></tr>';
    
    try {
        const payload = { userId: currentUser?.id || '', username: currentUser?.u || '' };
        const resp = await callApi('loadNutritionistPlan', payload);
        if (resp.ok && resp.data?.status === 'success' && resp.data.plan) {
            const plan = resp.data.plan;
            const dateStr = new Date(plan.savedAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            const itemCounts = plan.ingredients?.length || 0;
            const targetName = NUTRITION_TARGETS[plan.sasaran]?.name || plan.sasaran || 'SD Kelas 1-3';
            
            tbody.innerHTML = `
                <tr>
                    <td class="px-5 py-4 font-bold text-slate-800">${plan.menuName || 'Rencana Tanpa Nama'}</td>
                    <td class="px-4 py-4 text-center font-bold text-slate-600">${targetName}</td>
                    <td class="px-4 py-4 text-center capitalize font-semibold text-slate-600">${plan.session || 'siang'}</td>
                    <td class="px-4 py-4 text-center font-black text-slate-700">${plan.portions || 250} porsi</td>
                    <td class="px-4 py-4 text-center"><span class="px-2 py-0.5 rounded-full bg-sky-50 border border-sky-100 text-sky-700 text-[10px] font-bold">${itemCounts} bahan</span></td>
                    <td class="px-4 py-4 text-center text-slate-400 font-semibold">${dateStr}</td>
                    <td class="px-4 py-4 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                            <button onclick="nLoadHistoryPlanDirect()" class="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/50 text-emerald-700 font-bold rounded-lg text-[10px] uppercase transition-all shadow-sm active:scale-95">Muat</button>
                            <button onclick="nDeleteHistoryPlanDirect()" class="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200/50 text-red-700 font-bold rounded-lg text-[10px] uppercase transition-all shadow-sm active:scale-95">Hapus</button>
                        </div>
                    </td>
                </tr>
            `;
            
            // Set actions to global
            window.nLoadHistoryPlanDirect = () => { nLoadPlanData(plan); };
            window.nDeleteHistoryPlanDirect = async () => {
                const ok = await showCustomConfirm({
                    title: 'Hapus Rencana Menu?',
                    message: 'Hapus rencana menu ini dari cloud?',
                    icon: 'fa-trash-alt',
                    iconClass: 'bg-red-500/10 text-red-500',
                    confirmText: 'Ya, Hapus',
                    confirmClass: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
                });
                if (!ok) return;
                toggleLoader(true, "Menghapus rencana menu dari cloud...");
                try {
                    const payload = { userId: currentUser?.id || '', username: currentUser?.u || '' };
                    const resp = await callApi('deleteNutritionistPlan', payload);
                    if (resp.ok && resp.data?.status === 'success') {
                        showLoaderSuccess("Rencana menu berhasil dihapus");
                        nLoadHistoryFromCloud();
                        // Reset active cloud sync badge
                        const badge = document.getElementById('nSyncBadge');
                        if (badge) {
                            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Belum Tersinkron';
                            badge.className = 'inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200/60 px-3 py-1.5 rounded-full';
                        }
                    } else {
                        throw new Error(resp.data?.message || 'Gagal menghapus');
                    }
                } catch (e) {
                    showLoaderError("Gagal menghapus: " + e.message);
                }
            };
        } else {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8 text-slate-400">Tidak ada riwayat rencana tersimpan di cloud.</td></tr>';
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-red-500 font-bold">Koneksi Error: ${e.message}</td></tr>`;
    }
}

// --- MODAL BAHAN KUSTOM BARU ---
function nOpenCustomFoodModal() {
    document.getElementById('nCustomFoodModal').classList.remove('hidden');
}

function nCloseCustomFoodModal() {
    document.getElementById('nCustomFoodModal').classList.add('hidden');
}

function nSaveCustomFood() {
    const name = document.getElementById('nModalName').value.trim();
    const category = document.getElementById('nModalCategory').value;
    const bdd = parseInt(document.getElementById('nModalBdd').value) || 100;
    const kcal = parseInt(document.getElementById('nModalKcal').value) || 0;
    const protein = parseFloat(document.getElementById('nModalProtein').value) || 0;
    const carbs = parseFloat(document.getElementById('nModalCarbs').value) || 0;
    const fat = parseFloat(document.getElementById('nModalFat').value) || 0;
    const fiber = parseFloat(document.getElementById('nModalFiber').value) || 0;
    
    // New parameters
    const kalsium = parseFloat(document.getElementById('nModalKalsium')?.value) || 0;
    const zatBesi = parseFloat(document.getElementById('nModalZatBesi')?.value) || 0;
    const vitA = parseFloat(document.getElementById('nModalVitA')?.value) || 0;
    const vitC = parseFloat(document.getElementById('nModalVitC')?.value) || 0;
    const folat = parseFloat(document.getElementById('nModalFolat')?.value) || 0;
    const vitB12 = parseFloat(document.getElementById('nModalVitB12')?.value) || 0;
    
    const price = parseFloat(document.getElementById('nModalPrice').value) || 0;
    
    if (!name) {
        showToast('Nama bahan pangan wajib diisi', 'error');
        return;
    }
    
    // Check duplication in default FOOD_DATABASE
    const exists = FOOD_DATABASE.some(f => f.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        showToast('Bahan makanan dengan nama ini sudah ada di database', 'error');
        return;
    }
    
    const newFood = { 
        name, category, kcal, protein, carbs, fat, fiber, bdd, price,
        kalsium, zatBesi, vitA, vitC, folat, vitB12 
    };
    
    // Push and save
    FOOD_DATABASE.push(newFood);
    nCustomFoods.push(newFood);
    nSaveCustomFoodsToStorage();
    
    // Reset modal form
    document.getElementById('nModalName').value = '';
    document.getElementById('nModalBdd').value = '100';
    document.getElementById('nModalKcal').value = '100';
    document.getElementById('nModalProtein').value = '10';
    document.getElementById('nModalCarbs').value = '10';
    document.getElementById('nModalFat').value = '2';
    document.getElementById('nModalFiber').value = '0';
    
    // Reset new fields
    if (document.getElementById('nModalKalsium')) document.getElementById('nModalKalsium').value = '0';
    if (document.getElementById('nModalZatBesi')) document.getElementById('nModalZatBesi').value = '0';
    if (document.getElementById('nModalVitA')) document.getElementById('nModalVitA').value = '0';
    if (document.getElementById('nModalVitC')) document.getElementById('nModalVitC').value = '0';
    if (document.getElementById('nModalFolat')) document.getElementById('nModalFolat').value = '0';
    if (document.getElementById('nModalVitB12')) document.getElementById('nModalVitB12').value = '0';
    
    document.getElementById('nModalPrice').value = '30000';
    
    nCloseCustomFoodModal();
    nRenderDatabase();
    showToast(`Bahan makanan kustom "${name}" berhasil ditambahkan!`);
}

// --- PRINT HANDLING ---
function nPrintMealPlan() {
    if (nMenuIngredients.length === 0) {
        showToast('Penyusunan menu masih kosong, tidak ada yang dicetak', 'error');
        return;
    }
    
    // Populate Metadata
    const targetGroupVal = document.getElementById('nTargetGroup').value;
    document.getElementById('npName').textContent = currentUser?.name || 'Ahli Gizi';
    document.getElementById('npMenuName').textContent = document.getElementById('nMenuName').value || 'Rencana Menu Tanpa Nama';
    document.getElementById('npSasaran').textContent = NUTRITION_TARGETS[targetGroupVal]?.name || targetGroupVal;
    document.getElementById('npSession').textContent = document.getElementById('nSession').value;
    document.getElementById('npPortions').textContent = document.getElementById('nPortions').value + ' porsi';
    document.getElementById('npReserve').textContent = document.getElementById('nReserve').value + '%';
    document.getElementById('npDate').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('npSignatureName').textContent = currentUser?.name || 'Ahli Gizi';
    
    // Populate Ingredients Table
    const portions = Math.max(parseInt(document.getElementById('nPortions')?.value) || 1, 1);
    const reserve = Math.max(parseInt(document.getElementById('nReserve')?.value) || 0, 0);
    const multiplier = 1 + reserve / 100;
    
    const tbodyIng = document.getElementById('npIngredientsBody');
    tbodyIng.innerHTML = nMenuIngredients.map((item, idx) => {
        const rawGrams = (item.grams * 100) / (item.bdd || 100);
        const totalKg = (rawGrams * portions * multiplier) / 1000;
        const price = item.price || 0;
        const itemCost = totalKg * price;
        return `<tr>
            <td style="padding: 4px; font-weight: bold;">${item.name}</td>
            <td style="padding: 4px; text-align: center; text-transform: capitalize;">${CATEGORY_LABELS[item.category] || item.category}</td>
            <td style="padding: 4px; text-align: right;">${item.grams} g</td>
            <td style="padding: 4px; text-align: center;">${item.bdd}%</td>
            <td style="padding: 4px; text-align: right;">${rawGrams.toFixed(1)} g</td>
            <td style="padding: 4px; text-align: right; font-weight: bold;">${totalKg >= 1 ? `${totalKg.toFixed(2)} kg` : `${Math.round(totalKg * 1000)} g`}</td>
            <td style="padding: 4px; text-align: right;">Rp ${price.toLocaleString('id-ID')}</td>
            <td style="padding: 4px; text-align: right; font-weight: bold; color: #047857;">Rp ${Math.round(itemCost).toLocaleString('id-ID')}</td>
        </tr>`;
    }).join('');
    
    // Populate Cost Summaries
    let totalFoodCost = 0;
    nMenuIngredients.forEach(item => {
        const rawGrams = (item.grams * 100) / (item.bdd || 100);
        const totalKg = (rawGrams * portions * multiplier) / 1000;
        totalFoodCost += totalKg * (item.price || 0);
    });
    
    const bumbuCost = totalFoodCost * 0.10;
    const grandCost = totalFoodCost + bumbuCost;
    const realPortionCost = grandCost / portions;
    
    document.getElementById('npTotalBahan').textContent = 'Rp ' + Math.round(totalFoodCost).toLocaleString('id-ID');
    document.getElementById('npTotalBumbu').textContent = 'Rp ' + Math.round(bumbuCost).toLocaleString('id-ID');
    document.getElementById('npGrandTotal').textContent = 'Rp ' + Math.round(grandCost).toLocaleString('id-ID');
    document.getElementById('npRealPerPortion').textContent = 'Rp ' + Math.round(realPortionCost).toLocaleString('id-ID') + ' / porsi';
    
    // Populate Nutrition Analysis Table
    const actualTotals = { 
        kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0,
        kalsium: 0, zatBesi: 0, vitA: 0, vitC: 0, folat: 0, vitB12: 0 
    };
    nMenuIngredients.forEach(i => {
        const m = i.grams / 100;
        actualTotals.kcal += i.kcal * m;
        actualTotals.protein += i.protein * m;
        actualTotals.carbs += i.carbs * m;
        actualTotals.fat += i.fat * m;
        actualTotals.fiber += i.fiber * m;
        actualTotals.kalsium += (i.kalsium || 0) * m;
        actualTotals.zatBesi += (i.zatBesi || 0) * m;
        actualTotals.vitA += (i.vitA || 0) * m;
        actualTotals.vitC += (i.vitC || 0) * m;
        actualTotals.folat += (i.folat || 0) * m;
        actualTotals.vitB12 += (i.vitB12 || 0) * m;
    });
    
    const targetSet = NUTRITION_TARGETS[targetGroupVal] || NUTRITION_TARGETS.balita_sd_1_3;
    const giziMetrics = [
        { key: 'kcal', name: 'Energi / Kalori', actual: actualTotals.kcal.toFixed(0) + ' kkal', target: `${targetSet.kcal.min} - ${targetSet.kcal.max} kkal`, actualVal: actualTotals.kcal, min: targetSet.kcal.min, max: targetSet.kcal.max },
        { key: 'protein', name: 'Protein', actual: actualTotals.protein.toFixed(1) + ' g', target: `${targetSet.protein.min} - ${targetSet.protein.max} g`, actualVal: actualTotals.protein, min: targetSet.protein.min, max: targetSet.protein.max },
        { key: 'fat', name: 'Lemak', actual: actualTotals.fat.toFixed(1) + ' g', target: `${targetSet.fat.min} - ${targetSet.fat.max} g`, actualVal: actualTotals.fat, min: targetSet.fat.min, max: targetSet.fat.max },
        { key: 'carbs', name: 'Karbohidrat', actual: actualTotals.carbs.toFixed(1) + ' g', target: `${targetSet.carbs.min} - ${targetSet.carbs.max} g`, actualVal: actualTotals.carbs, min: targetSet.carbs.min, max: targetSet.carbs.max },
        { key: 'fiber', name: 'Serat Pangan', actual: actualTotals.fiber.toFixed(1) + ' g', target: `${targetSet.fiber.min} - ${targetSet.fiber.max} g`, actualVal: actualTotals.fiber, min: targetSet.fiber.min, max: targetSet.fiber.max },
        { key: 'kalsium', name: 'Kalsium', actual: actualTotals.kalsium.toFixed(1) + ' mg', target: `${targetSet.kalsium.min} - ${targetSet.kalsium.max} mg`, actualVal: actualTotals.kalsium, min: targetSet.kalsium.min, max: targetSet.kalsium.max },
        { key: 'zatBesi', name: 'Zat Besi', actual: actualTotals.zatBesi.toFixed(1) + ' mg', target: `${targetSet.zatBesi.min} - ${targetSet.zatBesi.max} mg`, actualVal: actualTotals.zatBesi, min: targetSet.zatBesi.min, max: targetSet.zatBesi.max },
        { key: 'vitA', name: 'Vitamin A', actual: actualTotals.vitA.toFixed(1) + ' mcg', target: `${targetSet.vitA.min} - ${targetSet.vitA.max} mcg`, actualVal: actualTotals.vitA, min: targetSet.vitA.min, max: targetSet.vitA.max },
        { key: 'vitC', name: 'Vitamin C', actual: actualTotals.vitC.toFixed(1) + ' mg', target: `${targetSet.vitC.min} - ${targetSet.vitC.max} mg`, actualVal: actualTotals.vitC, min: targetSet.vitC.min, max: targetSet.vitC.max },
        { key: 'folat', name: 'Folat', actual: actualTotals.folat.toFixed(1) + ' mcg', target: `${targetSet.folat.min} - ${targetSet.folat.max} mcg`, actualVal: actualTotals.folat, min: targetSet.folat.min, max: targetSet.folat.max },
        { key: 'vitB12', name: 'Vitamin B12', actual: actualTotals.vitB12.toFixed(1) + ' mcg', target: `${targetSet.vitB12.min} - ${targetSet.vitB12.max} mcg`, actualVal: actualTotals.vitB12, min: targetSet.vitB12.min, max: targetSet.vitB12.max }
    ];
    
    const tbodyNut = document.getElementById('npNutritionBody');
    tbodyNut.innerHTML = giziMetrics.filter(m => nGiziFilterState[m.key] === true).map(m => {
        let status = 'SESUAI STANDAR';
        let statusColor = '#047857';
        if (m.actualVal < m.min) { status = 'RENDAH'; statusColor = '#d97706'; }
        else if (m.actualVal > m.max) { status = 'TINGGI'; statusColor = '#dc2626'; }
        
        return `<tr style="text-align: center;">
            <td style="padding: 5px; font-weight: bold; text-align: left;">${m.name}</td>
            <td style="padding: 5px; font-weight: bold; text-align: right; font-size: 11px;">${m.actual}</td>
            <td style="padding: 5px; color: #475569;">${m.target}</td>
            <td style="padding: 5px; font-weight: 850; color: ${statusColor};">${status}</td>
        </tr>`;
    }).join('');
    
    // Add print class, print, and remove
    document.body.classList.add('printing-gizi');
    setTimeout(() => {
        window.print();
        setTimeout(() => {
            document.body.classList.remove('printing-gizi');
        }, 500);
    }, 100);
}

// Close custom food dropdown on click outside
document.addEventListener('click', (e) => {
    const dd = document.getElementById('nIngredientDropdown');
    const searchEl = document.getElementById('nAddIngredientSearch');
    if (dd && searchEl && !dd.contains(e.target) && e.target !== searchEl) {
        dd.classList.add('hidden');
    }
});

function initSpecialRoleDashboard() {
    if (!isLoginInProgress) {
        toggleLoader(true, "Mempersiapkan Dashboard...");
        setTimeout(() => {
            document.getElementById('specialRoleLayout').classList.remove('hidden');
            renderSpecialRoleDashboard();
            showLoaderSuccess("Dashboard Siap");
        }, 300);
    } else {
        document.getElementById('specialRoleLayout').classList.remove('hidden');
        renderSpecialRoleDashboard();
    }
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
    desc.innerText = `Halaman awal ${roleLabel} untuk operasional SPPG Cloud MBG. Modul detail akan ditambahkan berikutnya.`;
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
    const today = getLocalDateStr();
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
    if (!isLoginInProgress) {
        toggleLoader(true, "Mempersiapkan Security Page...");
        setTimeout(() => {
            document.getElementById('securityLayout').classList.remove('hidden');
            updateSecurityDropdown();
            updateSecurityInfo();
            updateSecurityProfileIndicator();
            startClockAndGPS();
            updateSecurityEntryGate();
            toggleLoader(false);
        }, 300);
    } else {
        document.getElementById('securityLayout').classList.remove('hidden');
        updateSecurityDropdown();
        updateSecurityInfo();
        updateSecurityProfileIndicator();
        startClockAndGPS();
        updateSecurityEntryGate();
    }
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
function generateEmployeeId(division) {
    const codeMap = {
        'Helper Cook': 'HC', 'Cook': 'CK', 'Head Chef': 'CHF',
        'Packing': 'PCK', 'Distribusi': 'DST', 'Kenek Distribusi': 'KND',
        'Kebersihan': 'KBR', 'Asisten Lapangan': 'ALP', 'Gudang': 'GDG',
        'Keamanan Shift 1': 'KM1', 'Keamanan Shift 2': 'KM2',
        'Ahli Gizi': 'AGZ', 'Akuntan': 'AKT', 'Ka SPPG': 'KSP', 'Yayasan': 'YSN',
        'Cuci Ompreng': 'COM', 'Admin Yayasan': 'AYN',
        'Leader Ompreng': 'LOM', 'Leader Packing': 'LPK', 'Leader Helper Cook': 'LHC',
        'Koordinasi Lapangan': 'KOL'
    };
    const code = codeMap[division] || division.substring(0, 3).toUpperCase();
    const existing = employees.filter(e => e.id && e.id.startsWith('MBG-' + code + '-'));
    let maxNum = 0;
    existing.forEach(e => {
        const parts = e.id.split('-');
        const num = parseInt(parts[parts.length - 1]) || 0;
        if (num > maxNum) maxNum = num;
    });
    const nextNum = String(maxNum + 1).padStart(3, '0');
    return `MBG-${code}-${nextNum}`;
}

function addEmployee(e) {
    e.preventDefault();
    const name = document.getElementById('newEmpName').value;
    const div = document.getElementById('newEmpDiv').value;
    const role = document.getElementById('newEmpRole').value;
    const salary = document.getElementById('newEmpSalary').value;
    const id = generateEmployeeId(div);

    let payload = { id, name, division: div, salary, role };
    
    if (String(role).toLowerCase() !== 'employee') {
        const uname = document.getElementById('newEmpUsername').value.toLowerCase().trim();
        const pwd = document.getElementById('newEmpPassword').value.trim();
        if (uname) payload.username = uname;
        if (pwd) payload.password = pwd;
    }

    if (newEmpPhotoBase64) {
        payload.image = newEmpPhotoBase64;
    }

    postData('addEmployee', payload);
    e.target.reset();
    const creds = document.getElementById('newEmpCreds'); if (creds) creds.classList.add('hidden');
    handleDivisionRolePreset('new');
    
    // Clear photo upload fields
    newEmpPhotoBase64 = '';
    const preview = document.getElementById('newEmpPhotoPreview');
    if (preview) preview.innerHTML = `<i class="fas fa-camera text-base"></i>`;
    const photoInput = document.getElementById('newEmpPhotoInput');
    if (photoInput) photoInput.value = '';
}
async function deleteEmployee() {
    if (!editingEmployeeId) return;
    const ok = await showCustomConfirm({
        title: 'Hapus Data Relawan?',
        message: 'Hapus data relawan ini? Tindakan ini tidak bisa dibatalkan.',
        icon: 'fa-trash-alt',
        iconClass: 'bg-red-500/10 text-red-500',
        confirmText: 'Ya, Hapus',
        confirmClass: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
    });
    if (!ok) return;

    // Simpan referensi employee untuk rollback jika gagal
    const idToDelete = String(editingEmployeeId);
    const deletedEmp = employees.find(e => String(e.id) === idToDelete);

    // Update UI optimistis
    employees = employees.filter(e => String(e.id) !== idToDelete);
    refreshUI();
    closeEditEmployee();

    // Kirim ke server — ID selalu sebagai string
    const success = await postData('deleteEmployee', { id: idToDelete });

    if (!success && deletedEmp) {
        // Rollback: kembalikan employee ke array jika server gagal
        employees.push(deletedEmp);
        refreshUI();
        showToast('Hapus gagal — data relawan dikembalikan.', 'error');
    }
}
function submitEditEmployee(e) {
    e.preventDefault(); if (!editingEmployeeId) return;
    const name = document.getElementById('editEmpName').value;
    const div = document.getElementById('editEmpDiv').value;
    const role = document.getElementById('editEmpRole').value;
    const salary = document.getElementById('editEmpSalary').value;
    
    const oldEmp = employees.find(e => e.id === editingEmployeeId);
    let finalId = editingEmployeeId;
    let oldId = null;

    if (oldEmp && oldEmp.division !== div) {
        // Division changed! Generate a new ID for the new division.
        oldId = editingEmployeeId;
        finalId = generateEmployeeId(div);
    }

    let payload = { id: finalId, name: name, division: div, salary: salary, role: role };
    if (oldId) {
        payload.oldId = oldId;
    }

    if (editEmpPhotoBase64) {
        payload.image = editEmpPhotoBase64;
    } else if (oldEmp && oldEmp.photo) {
        payload.photo = oldEmp.photo;
    }

    if (String(role).toLowerCase() !== 'employee') {
        const uname = document.getElementById('editEmpUsername').value.toLowerCase().trim();
        const pwd = document.getElementById('editEmpPassword').value.trim();
        if (uname) payload.username = uname;
        if (pwd) payload.password = pwd;
    } else {
        payload.username = '';
        payload.password = '';
    }

    // Update matching frontend logs if the ID changed
    if (oldId && oldId !== finalId) {
        logs.forEach(l => {
            if (String(l.empId) === String(oldId)) {
                l.empId = finalId;
            }
        });
    }

    const empIndex = employees.findIndex(e => e.id === editingEmployeeId);
    if (empIndex !== -1) {
        // Replace with new employee details including the new ID
        employees[empIndex] = { ...employees[empIndex], ...payload };
        // Clean up temporary oldId from the local object
        delete employees[empIndex].oldId;
        
        // Optimistically set the local image if a new one was uploaded
        if (editEmpPhotoBase64) {
            employees[empIndex].photo = "data:image/jpeg;base64," + editEmpPhotoBase64;
        }
        
        refreshUI();
    }
    
    closeEditEmployee();
    postData('addEmployee', payload);
}
function openEditEmployee(id) {
    const emp = employees.find(e => e.id === id); if (!emp) return;
    editingEmployeeId = id; 
    document.getElementById('editEmpId').value = id; 
    document.getElementById('editEmpName').value = emp.name; 
    document.getElementById('editEmpDiv').value = emp.division; 
    document.getElementById('editEmpRole').value = emp.role || 'employee'; 
    document.getElementById('editEmpSalary').value = emp.salary;
    
    // Reset edit photo upload state
    editEmpPhotoBase64 = '';
    const editPhotoInput = document.getElementById('editEmpPhotoInput');
    if (editPhotoInput) editPhotoInput.value = '';
    
    const previewContainer = document.getElementById('editPreviewContainer');
    if (emp.photo && emp.photo.length > 20) { 
        const photoUrl = convertDriveUrl(emp.photo);
        const safeUrl = photoUrl.replace(/'/g, "\\'");
        previewContainer.innerHTML = `<img src="${photoUrl}" onclick="previewImage('${safeUrl}'); event.stopPropagation();" crossorigin="anonymous" class="w-full h-full object-cover cursor-pointer hover:scale-105 transition duration-200" onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e2e8f0%22/%3E%3Ctext x=%2250%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%239ca3af%22 font-size=%2240%22%3E%26%238287;%3C/text%3E%3C/svg%3E';">`; 
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
function closeEditEmployee() { 
    document.getElementById('editEmployeeModal').classList.add('opacity-0'); 
    setTimeout(() => document.getElementById('editEmployeeModal').classList.add('hidden'), 300); 
    editingEmployeeId = null; 
    editEmpPhotoBase64 = '';
    const editPhotoInput = document.getElementById('editEmpPhotoInput');
    if (editPhotoInput) editPhotoInput.value = '';
}
// ===== VOLUNTEER SELF-ATTENDANCE (Absensi Mandiri Relawan) =====
// Geofence config — set the center coordinates for Rawa Bunga location
let GEOFENCE_CONFIG = {
    lat: -6.21973,    // Latitude titik pusat (ubah sesuai lokasi)
    lng: 106.87015,   // Longitude titik pusat (ubah sesuai lokasi)
    radius: 15          // Radius toleransi dalam meter
};

// // Geofence config — set the center coordinates for Demo H location
// const GEOFENCE_CONFIG = {
//     lat: -6.22368,    // Latitude titik pusat (ubah sesuai lokasi)
//     lng: 106.89102,   // Longitude titik pusat (ubah sesuai lokasi)
//     radius: 15          // Radius toleransi dalam meter
// };

// // Geofence config — set the center coordinates for Demo C location
// const GEOFENCE_CONFIG = {
//     lat: -6.22385,    // Latitude titik pusat (ubah sesuai lokasi)
//     lng: 106.89140,   // Longitude titik pusat (ubah sesuai lokasi)
//     radius: 15          // Radius toleransi dalam meter
// };

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
let volSourceView = 'landing'; // Menyimpan asal pemanggilan ('landing' atau 'login')

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
    const submitBtn = document.getElementById('volBtnSubmit');
    if (!bar || !txt) return;

    // Jika geofence dimatikan admin atau tidak di halaman selfie → sembunyikan bar sepenuhnya
    const selfiePage = document.getElementById('volPageSelfie');
    const isSelfieActive = selfiePage && !selfiePage.classList.contains('hidden');

    if (appConfig.disableGeofence || !isSelfieActive) {
        bar.classList.add('hidden');
        if (submitBtn) submitBtn.disabled = false;
        return;
    }
    bar.classList.remove('hidden');

    if (!volLocationLocked) {
        bar.className = 'mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/15 border border-yellow-400/20 text-[10px] text-yellow-300 font-bold transition-all duration-300';
        txt.innerText = 'Geofence: Menunggu lokasi...';
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    const dist = haversineDistance(volCurrentLocation.lat, volCurrentLocation.lng, GEOFENCE_CONFIG.lat, GEOFENCE_CONFIG.lng);
    const isInside = dist <= GEOFENCE_CONFIG.radius;

    if (isInside) {
        bar.className = 'mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/20 text-[10px] text-emerald-300 font-bold transition-all duration-300';
        txt.innerText = `Geofence: Dalam area (${Math.round(dist)}m) dari Dapur`;
        if (submitBtn) submitBtn.disabled = false;
    } else {
        bar.className = 'mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-400/20 text-[10px] text-red-300 font-bold transition-all duration-300';
        txt.innerText = `Geofence: Di luar area (${Math.round(dist)}m) dari Dapur`;
        if (submitBtn) submitBtn.disabled = true;
    }
    return isInside;
}

function secUpdateGeofence() {
    const btnIn = document.getElementById('btnAbsenIn');
    const btnOut = document.getElementById('btnAbsenOut');
    if (!btnIn || !btnOut) return;

    if (appConfig.disableGeofence) {
        btnIn.disabled = false;
        btnOut.disabled = false;
        return;
    }

    if (!isLocationLocked || !securityCoords.lat) {
        btnIn.disabled = true;
        btnOut.disabled = true;
        return;
    }

    const dist = haversineDistance(securityCoords.lat, securityCoords.lng, GEOFENCE_CONFIG.lat, GEOFENCE_CONFIG.lng);
    const isInside = dist <= GEOFENCE_CONFIG.radius;

    btnIn.disabled = !isInside;
    btnOut.disabled = !isInside;
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
    if (!lastLog || lastLog.type === 'OUT' || lastLog.type === 'REJECTED') return 'IN';
    return 'OUT'; // Sudah Clock In, berarti selanjutnya Clock Out
}

function volUpdateAbsenButton(empId) {
    const btn = document.getElementById('volBtnAbsen');
    const icon = document.getElementById('volBtnAbsenIcon');
    const label = document.getElementById('volBtnAbsenLabel');
    if (!btn) return;

    const type = volDetectAbsenType(empId);
    if (type === 'OUT') {
        btn.disabled = false;
        btn.className = 'w-full py-4 rounded-2xl bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-bold shadow-lg shadow-amber-600/30 transition active:scale-95 flex items-center justify-center gap-3 border-t border-white/20';
        if (icon) icon.className = 'fas fa-sign-out-alt text-lg';
        if (label) label.innerText = 'Absen Pulang';
    } else {
        btn.disabled = false;
        btn.className = 'w-full py-4 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/30 transition active:scale-95 flex items-center justify-center gap-3 border-t border-white/20';
        if (icon) icon.className = 'fas fa-sign-in-alt text-lg';
        if (label) label.innerText = 'Klik untuk Absen';
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
    const today = getLocalDateStr();
    const myLogs = logs.filter(l => String(l.empId) === String(empId) && l.date === today)
        .sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));

    if (myLogs.length === 0) {
        infoEl.innerHTML = 'Belum absen hari ini.';
        volUpdateAbsenButton(empId);
        return;
    }

    let html = myLogs.map(l => {
        const icon = l.type === 'IN' ? '🟢' : (l.type === 'OUT' ? '🔴' : '🟡');
        const label = l.type === 'IN' ? 'Masuk' : (l.type === 'OUT' ? 'Pulang' : l.type);
        return `<div>${icon} ${label} — ${l.time}</div>`;
    }).join('');
    infoEl.innerHTML = html;
    volUpdateAbsenButton(empId);
}

function initVolunteer() {
    if (!isLoginInProgress) {
        toggleLoader(true, "Mempersiapkan Volunteer Page...");
        setTimeout(() => {
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
        volUpdateGeofenceUI();
        volUpdateTodayStatus();
        volShowPage('home');
        
        toggleLoader(false);
        }, 300);
    } else {
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
        volUpdateGeofenceUI();
        volUpdateTodayStatus();
        volShowPage('home');
    }
}

function volShowPage(page) {
    ['volPageHome', 'volPageQR', 'volPageSelfie'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    if (page === 'home') document.getElementById('volPageHome')?.classList.remove('hidden');
    else if (page === 'qr') document.getElementById('volPageQR')?.classList.remove('hidden');
    else if (page === 'selfie') document.getElementById('volPageSelfie')?.classList.remove('hidden');

    // Update geofence bar visibility and status
    volUpdateGeofenceUI();
}

function volStartAbsen() {
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

function volUploadQR(event) {
    const file = event.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
            volValidateQR(code.data);
        } else {
            showToast('QR Code tidak ditemukan di foto. Pastikan foto jelas dan tidak blur.', 'error');
        }
        URL.revokeObjectURL(img.src);
    };
    img.onerror = function() {
        showToast('Gagal membaca file gambar.', 'error');
        URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    event.target.value = '';
}

function volValidateQR(data) {
    const cleanData = String(data).trim().replace(/\s+/g, ' ');
    const emp = employees.find(e => String(e.id).trim() == cleanData || e.name.trim().replace(/\s+/g, ' ').toLowerCase() == cleanData.toLowerCase());
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

    // No pre-blocking geofence checks here; validation happens dynamically on the selfie page

    volScannedEmployee = emp;
    if (volScanStream) volScanStream.getTracks().forEach(t => t.stop());

    // Auto-detect tipe absen berdasarkan log terakhir karyawan
    volAbsenType = volDetectAbsenType(emp.id);

    // Move to selfie page
    volShowPage('selfie');
    volPopulateSelfieInfo();
    volStartSelfie('user');
    // Enable submit based on geofence after camera is ready
    setTimeout(() => {
        volUpdateGeofenceUI();
    }, 1000);
}

function volPopulateSelfieInfo() {
    const nameEl = document.getElementById('volSelfieName');
    const divEl = document.getElementById('volSelfieDiv');
    const typeEl = document.getElementById('volSelfieType');
    const iconEl = document.getElementById('volSelfieTypeIcon');
    const kitchenEl = document.getElementById('volSelfieKitchen');

    if (volScannedEmployee) {
        if (nameEl) nameEl.innerText = volScannedEmployee.name;
        if (divEl) divEl.innerText = volScannedEmployee.division;
    }
    if (kitchenEl) kitchenEl.innerText = 'SPPG Rawa Bunga 1';
    if (volAbsenType === 'IN') {
        if (typeEl) { typeEl.innerText = 'ABSEN MASUK'; typeEl.className = 'text-[10px] font-bold text-white bg-emerald-500 px-2 py-0.5 rounded'; }
        if (iconEl) iconEl.innerHTML = '<i class="fas fa-sign-in-alt"></i>';
    } else {
        if (typeEl) { typeEl.innerText = 'ABSEN PULANG'; typeEl.className = 'text-[10px] font-bold text-white bg-blue-500 px-2 py-0.5 rounded'; }
        if (iconEl) iconEl.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
    }
}

function volStartSelfie(mode) {
    volCurrentFacingMode = mode;
    const video = document.getElementById('volFaceVideo');
    if (!video) return;
    if (volFaceStream) volFaceStream.getTracks().forEach(t => t.stop());
    
    // Stop any running liveness checks first
    volStopLivenessCheck();
    
    navigator.mediaDevices.getUserMedia({
        video: { facingMode: volCurrentFacingMode, width: { ideal: 640 }, height: { ideal: 480 } }
    }).then(s => {
        volFaceStream = s;
        video.srcObject = s;
        video.style.transform = mode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';
        
        // Trigger liveness check dynamically
        if (appConfig.enableLivenessCheck) {
            volStartLivenessCheck(video);
        } else {
            document.getElementById('volLivenessBanner')?.classList.add('hidden');
            document.getElementById('volLivenessBox')?.classList.add('hidden');
        }
    }).catch(e => showToast('Gagal akses kamera selfie', 'error'));
}

function volToggleCamera() {
    const newMode = volCurrentFacingMode === 'user' ? 'environment' : 'user';
    volStartSelfie(newMode);
}

// --- Liveness Detection State & Helpers (NEW) ---
let volLivenessActive = false;
let volLivenessStep = 0; // 0: inactive, 1: face, 2: blink, 3: right, 4: left, 5: success
let volLivenessBlinkCount = 0;
let volLivenessIsBlinked = false;
let volLivenessTimeout = null;
let volLivenessMesh = null;
let volFirstTurnSide = null;
let livenessAnimationFrame = null;

function playLivenessBeep(freq = 880, duration = 0.15) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.value = freq;
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.warn('Audio Context failed:', e);
    }
}

function getEuclideanDistance(p1, p2) {
    if (!p1 || !p2) return 0;
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
    );
}

function calculateEyeAspectRatio(landmarks, eyeIndices) {
    const p1 = landmarks[eyeIndices[0]];
    const p2 = landmarks[eyeIndices[1]];
    const p3 = landmarks[eyeIndices[2]];
    const p4 = landmarks[eyeIndices[3]];
    const p5 = landmarks[eyeIndices[4]];
    const p6 = landmarks[eyeIndices[5]];

    const d1 = getEuclideanDistance(p2, p6);
    const d2 = getEuclideanDistance(p3, p5);
    const d3 = getEuclideanDistance(p1, p4);

    if (d3 === 0) return 0;
    return (d1 + d2) / (2.0 * d3);
}

function volStartLivenessCheck(video) {
    document.getElementById('volLivenessBanner')?.classList.remove('hidden');
    document.getElementById('volLivenessBox')?.classList.remove('hidden');

    volLivenessStep = 1;
    volLivenessBlinkCount = 0;
    volLivenessIsBlinked = false;
    volFirstTurnSide = null;
    volUpdateLivenessUI();

    const submitBtn = document.getElementById('volBtnSubmit');
    if (submitBtn) submitBtn.disabled = true;

    const statusText = document.getElementById('volLivenessStatus');
    if (statusText) {
        statusText.innerText = "Proses...";
        statusText.className = "text-[9px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded";
    }

    if (volLivenessTimeout) clearTimeout(volLivenessTimeout);
    volLivenessTimeout = setTimeout(() => {
        if (volLivenessActive && volLivenessStep < 5) {
            volStopLivenessCheck();
            showToast("Batas waktu verifikasi habis. Silakan ulangi.", "warning");
            
            const instText = document.getElementById('volLivenessInstructionText');
            if (instText) {
                instText.innerHTML = '<button onclick="volRestartLiveness()" class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg transition active:scale-95 shadow-md">Ulangi Verifikasi</button>';
            }
            
            if (statusText) {
                statusText.innerText = "Gagal";
                statusText.className = "text-[9px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded";
            }
        }
    }, 20000);

    volLivenessActive = true;

    if (!volLivenessMesh) {
        try {
            volLivenessMesh = new FaceMesh({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
            });
            volLivenessMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            volLivenessMesh.onResults(volOnLivenessResults);
        } catch (err) {
            console.error("Gagal inisialisasi FaceMesh:", err);
            showToast("Sistem AI Wajah gagal dimuat. Menggunakan kamera biasa.", "error");
            volStopLivenessCheck();
            return;
        }
    }

    const processFrame = async () => {
        if (!volLivenessActive || !video.srcObject) return;
        try {
            if (video.readyState >= 2) {
                await volLivenessMesh.send({ image: video });
            }
        } catch (e) {
            console.error("Frame processing error:", e);
        }
        livenessAnimationFrame = requestAnimationFrame(processFrame);
    };
    livenessAnimationFrame = requestAnimationFrame(processFrame);
}

function volStopLivenessCheck() {
    volLivenessActive = false;
    if (livenessAnimationFrame) {
        cancelAnimationFrame(livenessAnimationFrame);
        livenessAnimationFrame = null;
    }
    if (volLivenessTimeout) {
        clearTimeout(volLivenessTimeout);
        volLivenessTimeout = null;
    }
}

function volRestartLiveness() {
    const video = document.getElementById('volFaceVideo');
    if (video) {
        volStartLivenessCheck(video);
    }
}

function volOnLivenessResults(results) {
    if (!volLivenessActive) return;

    const instText = document.getElementById('volLivenessInstructionText');
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        if (volLivenessStep === 1 && instText) {
            instText.innerText = "Mohon Menghadap Kamera Lurus";
        }
        return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    const cheekRight = landmarks[234];
    const cheekLeft = landmarks[454];
    const nose = landmarks[4];
    const faceWidth = cheekLeft.x - cheekRight.x;

    if (volLivenessStep === 1) {
        if (faceWidth < 0.22) {
            if (instText) instText.innerText = "Dekatkan Wajah Anda Ke Kamera";
            return;
        }
        if (faceWidth > 0.7) {
            if (instText) instText.innerText = "Jauhkan Wajah Anda Dari Kamera";
            return;
        }

        const ratio = (nose.x - cheekRight.x) / faceWidth;
        if (ratio < 0.38 || ratio > 0.62) {
            if (instText) instText.innerText = "Posisikan Wajah di Tengah Frame";
            return;
        }

        playLivenessBeep(660, 0.1);
        volLivenessStep = 2;
        volLivenessBlinkCount = 0;
        volLivenessIsBlinked = false;
        volUpdateLivenessUI();
        return;
    }

    if (volLivenessStep === 2) {
        const leftEAR = calculateEyeAspectRatio(landmarks, [362, 385, 386, 263, 374, 380]);
        const rightEAR = calculateEyeAspectRatio(landmarks, [33, 160, 158, 133, 153, 144]);
        const avgEAR = (leftEAR + rightEAR) / 2.0;

        if (instText) instText.innerText = `Silakan Berkedip 2 Kali (${volLivenessBlinkCount}/2)`;

        if (avgEAR < 0.21) {
            if (!volLivenessIsBlinked) {
                volLivenessIsBlinked = true;
            }
        } else if (avgEAR > 0.24) {
            if (volLivenessIsBlinked) {
                volLivenessBlinkCount++;
                volLivenessIsBlinked = false;
                playLivenessBeep(750, 0.1);

                if (volLivenessBlinkCount >= 2) {
                    playLivenessBeep(880, 0.15);
                    volLivenessStep = 3;
                    volFirstTurnSide = null;
                    volUpdateLivenessUI();
                }
            }
        }
        return;
    }

    if (volLivenessStep === 3) {
        const ratio = (nose.x - cheekRight.x) / faceWidth;
        if (instText) instText.innerText = "Silakan Menoleh Ke Kanan (Samping)";

        if (ratio < 0.33) {
            volFirstTurnSide = 'right';
            playLivenessBeep(880, 0.15);
            volLivenessStep = 4;
            volUpdateLivenessUI();
        } else if (ratio > 0.67) {
            volFirstTurnSide = 'left';
            playLivenessBeep(880, 0.15);
            volLivenessStep = 4;
            volUpdateLivenessUI();
        }
        return;
    }

    if (volLivenessStep === 4) {
        const ratio = (nose.x - cheekRight.x) / faceWidth;
        if (instText) instText.innerText = "Silakan Menoleh Ke Arah Sebaliknya";

        if (volFirstTurnSide === 'right' && ratio > 0.67) {
            volCompleteLiveness();
        } else if (volFirstTurnSide === 'left' && ratio < 0.33) {
            volCompleteLiveness();
        }
        return;
    }
}

function volUpdateLivenessUI() {
    for (let s = 1; s <= 4; s++) {
        const card = document.getElementById(`step-live-${s}`);
        if (!card) continue;
        const icon = card.querySelector('i');
        
        if (volLivenessStep > s) {
            card.className = "flex flex-col items-center gap-1.5 p-1.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-all duration-300";
            if (icon) icon.className = "fas fa-check-circle text-xs";
        } else if (volLivenessStep === s) {
            card.className = "flex flex-col items-center gap-1.5 p-1.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 animate-pulse transition-all duration-300";
            if (s === 1 && icon) icon.className = "fas fa-user-circle text-xs";
            else if (s === 2 && icon) icon.className = "fas fa-eye text-xs";
            else if (s === 3 && icon) icon.className = "fas fa-arrow-right text-xs";
            else if (s === 4 && icon) icon.className = "fas fa-arrow-left text-xs";
        } else {
            card.className = "flex flex-col items-center gap-1.5 p-1.5 rounded-xl bg-slate-100/50 dark:bg-white/5 text-slate-400 dark:text-slate-600 transition-all duration-300";
            if (s === 1 && icon) icon.className = "fas fa-user-circle text-xs";
            else if (s === 2 && icon) icon.className = "fas fa-eye text-xs";
            else if (s === 3 && icon) icon.className = "fas fa-arrow-right text-xs";
            else if (s === 4 && icon) icon.className = "fas fa-arrow-left text-xs";
        }
    }
}

function volCompleteLiveness() {
    volLivenessStep = 5;
    volStopLivenessCheck();
    volUpdateLivenessUI();

    playLivenessBeep(1000, 0.15);
    setTimeout(() => playLivenessBeep(1320, 0.3), 120);

    const instText = document.getElementById('volLivenessInstructionText');
    if (instText) instText.innerText = "Verifikasi Berhasil! Mengirim Absen...";

    const statusText = document.getElementById('volLivenessStatus');
    if (statusText) {
        statusText.innerText = "Berhasil";
        statusText.className = "text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded";
    }

    const submitBtn = document.getElementById('volBtnSubmit');
    if (submitBtn) submitBtn.disabled = false;

    let isGeofenceOk = true;
    if (!appConfig.disableGeofence) {
        if (volLocationLocked && volCurrentLocation.lat) {
            const dist = haversineDistance(volCurrentLocation.lat, volCurrentLocation.lng, GEOFENCE_CONFIG.lat, GEOFENCE_CONFIG.lng);
            if (dist > GEOFENCE_CONFIG.radius) {
                isGeofenceOk = false;
            }
        } else {
            isGeofenceOk = false;
        }
    }

    if (isGeofenceOk) {
        setTimeout(() => {
            volSubmitSelfie();
        }, 800);
    } else {
        if (instText) instText.innerText = "Liveness Berhasil. Posisikan diri Anda di area Dapur.";
    }
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

    // Re-check geofence at submit time (skip jika admin matikan)
    if (!appConfig.disableGeofence) {
        const dist = haversineDistance(volCurrentLocation.lat, volCurrentLocation.lng, GEOFENCE_CONFIG.lat, GEOFENCE_CONFIG.lng);
        if (dist > GEOFENCE_CONFIG.radius) {
            return showToast(`Di luar area absensi (${Math.round(dist)}m) dari Dapur.`, 'error');
        }
    }

    const now = new Date();
    const today = getLocalDateStr(now);

    // Validate attendance logic
    const empLogs = logs.filter(l => String(l.empId) === String(volScannedEmployee.id))
        .sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));
    const lastLog = empLogs.length > 0 ? empLogs[0] : null;

    const volBothDisabled = appConfig.disableBoth || (appConfig.disableLate && appConfig.disableEarly);
    if (volAbsenType === 'IN') {
        if (lastLog && lastLog.type === 'IN' && !appConfig.allowMultipleIn) {
            showToast('Sesi masih aktif! Kamu sudah Absen Masuk.', 'error');
            volCancelFlow();
            return;
        }
        // Cek batasan 1 jam sebelum shift & 1x per hari
        const clockInCheck = checkClockInAllowed(volScannedEmployee.id, volScannedEmployee.division);
        if (!clockInCheck.allowed) {
            showToast(clockInCheck.message, 'error');
            volCancelFlow();
            return;
        }
    }
    if (volAbsenType === 'OUT') {
        if ((!lastLog || lastLog.type === 'OUT') && !appConfig.allowMultipleIn) {
            showToast('Belum Absen Masuk!', 'error');
            volCancelFlow();
            return;
        }
    }

    let overtimeHours = 0;
    let lateMinutes = 0;
    let earlyMinutes = 0;
    let finalType = volAbsenType;
    let forcedTime = null;
    let needsReason = null;
    let toastMsg = 'Absen Berhasil!';

    if (volAbsenType === 'IN') {
        const divConfig = appConfig.shifts[volScannedEmployee.division];
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
                    toastMsg = reason ? `Absen Masuk (${reason})` : 'Absen Masuk.';
                    lateMinutes = 0;
                } else if (diffMin >= appConfig.lateMaxThreshold) {
                    // Blocked completely
                    showToast(`Gagal Absen! Keterlambatan (${diffMin}m) melebihi batas maksimal (${appConfig.lateMaxThreshold}m).`, 'error');
                    volCancelFlow();
                    return;
                } else if (diffMin < appConfig.lateTolerance) {
                    // Tier 1: Toleransi
                    lateMinutes = 0;
                    toastMsg = `Telat ${diffMin}m (Toleransi).`;
                } else if (diffMin < appConfig.lateReasonThreshold) {
                    // Tier 2: Terlambat
                    toastMsg = `Terlambat ${diffMin} menit.`;
                } else if (diffMin < appConfig.lateWaThreshold) {
                    // Tier 3: Wajib Alasan
                    needsReason = 'late';
                    toastMsg = `Terlambat ${diffMin} menit — isi alasan.`;
                } else {
                    // Tier 4: Wajib Alasan + WA
                    needsReason = 'blocked';
                    toastMsg = `Terlambat ${diffMin} menit — konfirmasi ke Admin.`;
                }
            }
        }
    }

    if (volAbsenType === 'OUT') {
        const divConfig = appConfig.shifts[volScannedEmployee.division];
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
                    toastMsg = reason ? `Absen Pulang (${reason})` : 'Absen Pulang.';
                } else if (diffMinutes > 40) {
                    overtimeHours = Math.floor((diffMinutes - 41) / 60) + 1;
                    toastMsg = appConfig.hideOvertime ? 'Absen Pulang Berhasil.' : `Lembur: ${overtimeHours} Jam`;
                }
            } else {
                if (diffMinutes < -120) {
                    return showToast("Tidak bisa absen pulang!\nMaksimal 2 jam sebelum jam pulang.", "error");
                } else if (diffMinutes < -20) {
                    earlyMinutes = Math.abs(diffMinutes);
                    needsReason = 'early';
                    toastMsg = `Pulang ${earlyMinutes} menit lebih awal.`;
                } else if (diffMinutes < 0) {
                    toastMsg = 'Absen Pulang Berhasil.';
                } else if (diffMinutes > 40) {
                    overtimeHours = Math.floor((diffMinutes - 41) / 60) + 1;
                    toastMsg = appConfig.hideOvertime ? 'Absen Pulang Berhasil.' : `Lembur: ${overtimeHours} Jam`;
                }
            }
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
    ctx.fillStyle = volAbsenType === 'IN' ? '#34d399' : '#60a5fa';
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

    if (volBothDisabled && volAbsenType === 'IN') {
        payload.note = '[Bebas Masuk] Fitur absen bebas aktif';
    } else if (volBothDisabled && volAbsenType === 'OUT' && earlyMinutes > 0) {
        payload.note = '[Bebas Pulang] Fitur absen bebas aktif';
    } else if (earlyMinutes > 0) {
        payload.note = `[Pulang ${earlyMinutes} mnt lebih awal]`;
    }

    if (needsReason === 'late') {
        pendingAttendancePayload = payload;
        document.getElementById('lateNoteInput').value = '';
        document.getElementById('lateAlertModal').classList.remove('hidden');
        setTimeout(() => document.getElementById('lateAlertModal').classList.remove('opacity-0'), 10);
        return;
    }

    if (needsReason === 'early') {
        pendingAttendancePayload = payload;
        pendingAttendancePayload._earlyMinutes = earlyMinutes;
        pendingAttendancePayload._toastMsg = toastMsg;
        document.getElementById('earlyNoteInput').value = '';
        document.getElementById('earlyOutModal').classList.remove('hidden');
        setTimeout(() => document.getElementById('earlyOutModal').classList.remove('opacity-0'), 10);
        return;
    }

    if (needsReason === 'blocked') {
        pendingAttendancePayload = payload;
        pendingAttendancePayload._lateMinutes = lateMinutes;
        const divConfig = appConfig.shifts[volScannedEmployee.division];
        showLateBlockedModal(volScannedEmployee.name, volScannedEmployee.division, divConfig ? divConfig.start : '-');
        return;
    }

    const success = await postData('attendance', payload);
    if (success) {
        toggleLoader(false);
        const empName = volScannedEmployee ? volScannedEmployee.name : '';
        const absenType = finalType;
        volCancelFlow();
        showAbsenSuccess({
            type: absenType, name: empName, message: toastMsg,
            onDone: async () => { await fetchData(true); volUpdateTodayStatus(); }
        });
    }
}

function volCancelFlow() {
    volScannedEmployee = null;
    volAbsenType = null;
    if (volScanStream) { volScanStream.getTracks().forEach(t => t.stop()); volScanStream = null; }
    if (volFaceStream) { volFaceStream.getTracks().forEach(t => t.stop()); volFaceStream = null; }
    
    // Stop any running liveness checks
    volStopLivenessCheck();
    
    const btn = document.getElementById('volBtnSubmit');
    if (btn) btn.disabled = true;
    volShowPage('home');
    volUpdateTodayStatus();
}

// --- Fungsi untuk masuk mode Absen Mandiri dari halaman login (tanpa akun) ---
async function startAbsenMandiri() {
    volGuestMode = true;

    // Tentukan sumber pemanggilan (apakah dari loginView atau landingView)
    const loginView = document.getElementById('loginView');
    if (loginView && !loginView.classList.contains('hidden')) {
        volSourceView = 'login';
    } else {
        volSourceView = 'landing';
    }

    // Ambil data karyawan dari server dulu
    toggleLoader(true, 'Memuat data...');
    try {
        const res = await fetch(SCRIPT_URL + '?action=getData&_t=' + Date.now());
        const data = await res.json();
        if (data.status === 'success') {
            employees = data.employees || [];
            logs = data.logs || [];
            if (data.config) {
                if (data.config.overtimeRate) appConfig.overtimeRate = parseInt(data.config.overtimeRate) || appConfig.overtimeRate;
                if (data.config.shifts) appConfig.shifts = data.config.shifts;
                appConfig.disableLate = data.config.disableLate === true || data.config.disableLate === 'true';
                appConfig.disableEarly = data.config.disableEarly === true || data.config.disableEarly === 'true';
                appConfig.disableBoth = data.config.disableBoth === true || data.config.disableBoth === 'true';
                appConfig.disableLateReason = data.config.disableLateReason || '';
                appConfig.disableEarlyReason = data.config.disableEarlyReason || '';
                appConfig.disableBothReason = data.config.disableBothReason || '';
                appConfig.disableGeofence = data.config.disableGeofence === true || data.config.disableGeofence === 'true';
                appConfig.hideOvertime = data.config.hideOvertime === true || data.config.hideOvertime === 'true';
                appConfig.allowMultipleIn = data.config.allowMultipleIn === true || data.config.allowMultipleIn === 'true';
                appConfig.enableLivenessCheck = data.config.enableLivenessCheck === true || data.config.enableLivenessCheck === 'true';
                appConfig.geofenceLat = parseFloat(data.config.geofenceLat || "-6.21973");
                appConfig.geofenceLng = parseFloat(data.config.geofenceLng || "106.87015");
                appConfig.geofenceRadius = parseInt(data.config.geofenceRadius || "15");
                appConfig.lateTolerance = parseInt(data.config.lateTolerance || "5");
                appConfig.lateReasonThreshold = parseInt(data.config.lateReasonThreshold || "25");
                appConfig.lateWaThreshold = parseInt(data.config.lateWaThreshold || "35");
                appConfig.lateMaxThreshold = parseInt(data.config.lateMaxThreshold || "60");
                appConfig.adminWhatsApp = data.config.adminWhatsApp || "6282114806765";
                appConfig.autoOutType = data.config.autoOutType || "global";
                appConfig.autoOutGlobalMinutes = parseInt(data.config.autoOutGlobalMinutes || "240");
                appConfig.autoOutDivisionsConfig = data.config.autoOutDivisionsConfig || "{}";

                // Update GEOFENCE_CONFIG
                GEOFENCE_CONFIG.lat = appConfig.geofenceLat;
                GEOFENCE_CONFIG.lng = appConfig.geofenceLng;
                GEOFENCE_CONFIG.radius = appConfig.geofenceRadius;
            }
        }
    } catch (e) {
        console.warn('Fetch data for mandiri failed', e);
    }
    toggleLoader(false);

    // Animasi transisi smooth masuk ke volunteerLayout
    const activeView = volSourceView === 'login' ? document.getElementById('loginView') : document.getElementById('landingView');
    const volunteerLayout = document.getElementById('volunteerLayout');
    
    if (activeView && volunteerLayout) {
        activeView.classList.add('view-hidden');
        setTimeout(() => {
            activeView.classList.add('hidden');
            initVolunteer();
            setTimeout(() => {
                volunteerLayout.classList.remove('view-hidden');
            }, 50);
        }, 500);
    } else {
        // Fallback jika elemen tidak ditemukan
        if (document.getElementById('loginView')) document.getElementById('loginView').classList.add('hidden');
        if (document.getElementById('landingView')) document.getElementById('landingView').classList.add('hidden');
        initVolunteer();
        if (volunteerLayout) volunteerLayout.classList.remove('view-hidden');
    }
}

// Tombol keluar dari volunteer (kembali ke login/landing)
function volExitToLogin() {
    // Kalau mode tamu, langsung balik ke asal
    if (volGuestMode) {
        volGuestMode = false;
        volScannedEmployee = null;
        volAbsenType = null;
        if (volScanStream) { volScanStream.getTracks().forEach(t => t.stop()); volScanStream = null; }
        if (volFaceStream) { volFaceStream.getTracks().forEach(t => t.stop()); volFaceStream = null; }
        if (volClockInterval) { clearInterval(volClockInterval); volClockInterval = null; }
        if (volGpsWatchId) { navigator.geolocation.clearWatch(volGpsWatchId); volGpsWatchId = null; }
        volLocationLocked = false;

        const volunteerLayout = document.getElementById('volunteerLayout');
        const targetView = volSourceView === 'login' ? document.getElementById('loginView') : document.getElementById('landingView');

        if (volunteerLayout && targetView) {
            volunteerLayout.classList.add('view-hidden');
            setTimeout(() => {
                volunteerLayout.classList.add('hidden');
                targetView.classList.remove('hidden');
                setTimeout(() => {
                    targetView.classList.remove('view-hidden');
                }, 50);
            }, 500);
        } else {
            // Fallback jika elemen tidak ditemukan
            if (volunteerLayout) volunteerLayout.classList.add('hidden');
            if (targetView) {
                targetView.classList.remove('hidden', 'view-hidden');
            }
        }
    } else {
        // Mode login biasa, panggil logout standar
        logout();
    }
}

function hideToast() {
    const t = document.getElementById('toast');
    if (!t) return;
    t.style.transform = 'translateY(-150%) scale(0.95)';
    t.style.opacity = '0';
    
    if (toastTimeout) { clearTimeout(toastTimeout); toastTimeout = null; }
    if (toastProgressTimeout) { clearTimeout(toastProgressTimeout); toastProgressTimeout = null; }
}

function showToast(msg, type='success') {
    const t = document.getElementById('toast');
    const i = document.getElementById('toastIcon');
    const msgEl = document.getElementById('toastMsg');
    const titleEl = document.getElementById('toastTitle');
    const progEl = document.getElementById('toastProgress');
    if (!t || !i || !msgEl || !progEl) return;

    msgEl.innerText = msg;
    
    // Reset progress bar animation width
    progEl.style.transition = 'none';
    progEl.style.width = '100%';
    
    // Force a browser reflow to apply the width reset immediately
    progEl.offsetHeight;

    // Clear any active timeouts
    if (toastTimeout) clearTimeout(toastTimeout);
    if (toastProgressTimeout) clearTimeout(toastProgressTimeout);

    // Apply color schemes based on type
    if (type === 'error') {
        if (titleEl) {
            titleEl.innerText = 'Error';
            titleEl.className = "font-bold text-[10px] uppercase tracking-wider text-rose-500 leading-none";
        }
        i.className = "w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 text-base shrink-0 shadow-sm";
        i.innerHTML = '<i class="fas fa-exclamation-circle animate-pulse"></i>';
        t.className = "fixed top-6 right-0 left-0 mx-auto w-full max-w-[380px] z-[999] transition-all duration-500 transform bg-white/85 dark:bg-slate-950/80 backdrop-blur-xl text-slate-800 dark:text-white p-4 rounded-3xl shadow-[0_20px_50px_rgba(244,63,94,0.15)] dark:shadow-[0_20px_50px_rgba(244,63,94,0.3)] flex flex-col gap-3 border border-rose-200/50 dark:border-rose-500/20 overflow-hidden";
        progEl.className = "h-full bg-rose-500 w-full";
    } else if (type === 'warning' || type === 'info') {
        if (titleEl) {
            titleEl.innerText = type === 'warning' ? 'Peringatan' : 'Info';
            titleEl.className = "font-bold text-[10px] uppercase tracking-wider text-amber-500 leading-none";
        }
        i.className = "w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 text-base shrink-0 shadow-sm";
        i.innerHTML = '<i class="fas fa-info-circle animate-pulse"></i>';
        t.className = "fixed top-6 right-0 left-0 mx-auto w-full max-w-[380px] z-[999] transition-all duration-500 transform bg-white/85 dark:bg-slate-950/80 backdrop-blur-xl text-slate-800 dark:text-white p-4 rounded-3xl shadow-[0_20px_50px_rgba(245,158,11,0.15)] dark:shadow-[0_20px_50px_rgba(245,158,11,0.3)] flex flex-col gap-3 border border-amber-200/50 dark:border-amber-500/20 overflow-hidden";
        progEl.className = "h-full bg-amber-500 w-full";
    } else {
        // Success
        if (titleEl) {
            titleEl.innerText = 'Sukses';
            titleEl.className = "font-bold text-[10px] uppercase tracking-wider text-emerald-500 leading-none";
        }
        i.className = "w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 text-base shrink-0 shadow-sm";
        i.innerHTML = '<i class="fas fa-check-circle animate-pulse"></i>';
        t.className = "fixed top-6 right-0 left-0 mx-auto w-full max-w-[380px] z-[999] transition-all duration-500 transform bg-white/85 dark:bg-slate-950/80 backdrop-blur-xl text-slate-800 dark:text-white p-4 rounded-3xl shadow-[0_20px_50px_rgba(16,185,129,0.15)] dark:shadow-[0_20px_50px_rgba(16,185,129,0.3)] flex flex-col gap-3 border border-emerald-200/50 dark:border-emerald-500/20 overflow-hidden";
        progEl.className = "h-full bg-emerald-500 w-full";
    }

    // Drop down and scale in
    t.style.transform = 'translateY(0) scale(1)';
    t.style.opacity = '1';

    // Delay slightly to start progress bar animation transition
    toastProgressTimeout = setTimeout(() => {
        progEl.style.transition = 'width 4800ms linear';
        progEl.style.width = '0%';
    }, 50);

    toastTimeout = setTimeout(() => {
        t.style.transform = 'translateY(-150%) scale(0.95)';
        t.style.opacity = '0';
    }, 5000);
}


// === ATTENDANCE SUCCESS ANIMATION ===
function showAbsenSuccess({ type, name, message, onDone }) {
    const overlay = document.getElementById('absenSuccessOverlay');
    const bg = document.getElementById('absenSuccessBg');
    const card = document.getElementById('absenSuccessCard');
    const icon = document.getElementById('absenSuccessIcon');
    const checkIcon = document.getElementById('absenCheckIcon');
    const pulseRing = document.getElementById('absenPulseRing');
    const confettiBox = document.getElementById('absenConfetti');
    if (!overlay) { if (onDone) onDone(); return; }

    const isIN = type === 'IN';
    const isEarlyOut = type === 'EARLY_OUT';
    let gradientColor, bgColor, pingColor, title;

    if (isIN) {
        gradientColor = 'from-emerald-500 to-teal-600';
        bgColor = 'rgba(5,150,105,0.92)';
        pingColor = 'bg-emerald-400';
        title = 'Absen Masuk Berhasil!';
    } else if (isEarlyOut) {
        gradientColor = 'from-purple-500 to-violet-600';
        bgColor = 'rgba(139,92,246,0.92)';
        pingColor = 'bg-purple-400';
        title = 'Sukses Pulang Lebih Awal';
    } else {
        gradientColor = 'from-blue-500 to-indigo-600';
        bgColor = 'rgba(59,130,246,0.92)';
        pingColor = 'bg-blue-400';
        title = 'Absen Pulang Berhasil!';
    }

    // Setup content
    document.getElementById('absenSuccessTitle').textContent = title;
    document.getElementById('absenSuccessName').textContent = name || '';
    document.getElementById('absenSuccessDetail').textContent = message || '';
    const now = new Date();
    document.getElementById('absenSuccessTimeText').textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    // Setup styles
    icon.className = `relative w-24 h-24 rounded-full flex items-center justify-center text-white text-4xl shadow-2xl bg-gradient-to-br ${gradientColor}`;
    const rings = pulseRing.querySelectorAll('.animate-absen-ping, .animate-absen-ping2');
    rings.forEach(r => r.className = r.className.replace(/bg-\w+-\d+/g, '') + ` ${pingColor}`);

    // Reset
    checkIcon.style.opacity = '0';
    checkIcon.style.transform = 'scale(0.3)';
    card.style.transform = 'scale(0.5)';
    card.style.opacity = '0';
    bg.style.backgroundColor = 'rgba(0,0,0,0)';
    confettiBox.innerHTML = '';

    // Show overlay
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    overlay.style.pointerEvents = 'auto';

    // Setup close button with 5s cooldown
    const closeBtn = document.getElementById('absenSuccessCloseBtn');
    const closeTxt = document.getElementById('absenCloseBtnText');
    if (closeBtn) {
        closeBtn.disabled = true;
        let countdown = 5;
        closeTxt.textContent = `Tutup (${countdown})`;
        const cdInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                closeTxt.textContent = `Tutup (${countdown})`;
            } else {
                clearInterval(cdInterval);
                closeTxt.textContent = 'Tutup';
                closeBtn.disabled = false;
            }
        }, 1000);
        // Store onDone callback and interval on overlay for dismissal
        overlay._onDone = onDone;
        overlay._cdInterval = cdInterval;
    }

    // Animate in
    requestAnimationFrame(() => {
        bg.style.backgroundColor = bgColor;
        card.style.transform = 'scale(1)';
        card.style.opacity = '1';
        // Check icon pop
        setTimeout(() => {
            checkIcon.style.opacity = '1';
            checkIcon.style.transform = 'scale(1)';
        }, 350);
        // Confetti burst
        setTimeout(() => spawnConfetti(confettiBox), 400);
    });
}

function dismissAbsenSuccess() {
    const overlay = document.getElementById('absenSuccessOverlay');
    const bg = document.getElementById('absenSuccessBg');
    const card = document.getElementById('absenSuccessCard');
    const confettiBox = document.getElementById('absenConfetti');
    if (!overlay) return;
    if (overlay._cdInterval) clearInterval(overlay._cdInterval);
    const onDone = overlay._onDone;
    card.style.transform = 'scale(0.8)';
    card.style.opacity = '0';
    bg.style.backgroundColor = 'rgba(0,0,0,0)';
    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        overlay.style.pointerEvents = 'none';
        if (confettiBox) confettiBox.innerHTML = '';
        if (onDone) onDone();
    }, 400);
}

function spawnConfetti(container) {
    const colors = ['#34d399','#fbbf24','#60a5fa','#f87171','#a78bfa','#fb923c','#2dd4bf','#e879f9'];
    for (let i = 0; i < 40; i++) {
        const p = document.createElement('div');
        p.className = 'confetti-particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.top = '-10px';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.width = (4 + Math.random() * 6) + 'px';
        p.style.height = (4 + Math.random() * 6) + 'px';
        p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        p.style.animationDuration = (1.5 + Math.random() * 2) + 's';
        p.style.animationDelay = (Math.random() * 0.6) + 's';
        container.appendChild(p);
    }
}

// =============================================
// PAGINATION FUNCTIONS - Logs Table
// =============================================

function previousLogsPage() {
    if (logsCurrentPage > 1) {
        logsCurrentPage--;
        refreshUI();
    }
}

function nextLogsPage() {
    const sortedLogs = getSortedData(logs, 'logs');
    const totalPages = Math.ceil(sortedLogs.length / LOGS_PER_PAGE);
    if (logsCurrentPage < totalPages) {
        logsCurrentPage++;
        refreshUI();
    }
}

function goToLogsPage(pageNum) {
    const sortedLogs = getSortedData(logs, 'logs');
    const totalPages = Math.ceil(sortedLogs.length / LOGS_PER_PAGE);
    if (pageNum >= 1 && pageNum <= totalPages) {
        logsCurrentPage = pageNum;
        refreshUI();
    }
}

function renderPaginationNumbers(currentPage, totalPages) {
    const container = document.getElementById('paginationNumbers');
    if (!container) return;
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    const activeBtnClass = "px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 dark:bg-indigo-500 text-white shadow-sm shadow-indigo-600/20 transition-all duration-200 active:scale-95";
    const inactiveBtnClass = "px-2 py-1 rounded-lg text-xs font-bold bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all duration-200 active:scale-95";
    const dotsSpan = `<span class="px-1 text-slate-400 dark:text-slate-500">...</span>`;
    
    // First page button
    if (startPage > 1) {
        html += `<button onclick="goToLogsPage(1)" class="${inactiveBtnClass}">1</button>`;
        if (startPage > 2) {
            html += dotsSpan;
        }
    }
    
    // Page number buttons
    for (let i = startPage; i <= endPage; i++) {
        if (i === currentPage) {
            html += `<button class="${activeBtnClass}">${i}</button>`;
        } else {
            html += `<button onclick="goToLogsPage(${i})" class="${inactiveBtnClass}">${i}</button>`;
        }
    }
    
    // Last page button
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += dotsSpan;
        }
        html += `<button onclick="goToLogsPage(${totalPages})" class="${inactiveBtnClass}">${totalPages}</button>`;
    }
    
    container.innerHTML = html;
}

// --- Premium Scroll Reveal Observer ---
function initScrollReveal() {
    if (!('IntersectionObserver' in window)) {
        // Fallback for extremely legacy browsers
        document.querySelectorAll('.reveal-element, .reveal-left, .reveal-right, .reveal-scale').forEach(el => {
            el.classList.add('revealed');
        });
        return;
    }

    const revealCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const delay = parseInt(entry.target.getAttribute('data-delay') || '0');
                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, delay);
                observer.unobserve(entry.target);
            }
        });
    };

    const revealObserver = new IntersectionObserver(revealCallback, {
        root: null, // viewport
        rootMargin: '0px 0px -80px 0px', // trigger slightly before entering viewport
        threshold: 0.05
    });

    document.querySelectorAll('.reveal-element, .reveal-left, .reveal-right, .reveal-scale').forEach(el => {
        revealObserver.observe(el);
    });
}

// --- Volunteer QR Code Modal Functions ---
let currentQrData = { id: '', name: '', division: '' };

function showVolunteerQRCode(id, name, division) {
    currentQrData = { id, name, division };
    
    const modal = document.getElementById('volunteerQrModal');
    const img = document.getElementById('volunteerQrImage');
    const nameEl = document.getElementById('volunteerQrName');
    const divEl = document.getElementById('volunteerQrDiv');
    const idEl = document.getElementById('volunteerQrId');
    
    if (!modal || !img || !nameEl || !divEl || !idEl) return;
    
    // Generate QR using API QR Server
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(id)}`;
    nameEl.innerText = name;
    divEl.innerText = division;
    idEl.innerText = `ID: ${id}`;
    
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
}

function closeVolunteerQrModal() {
    const modal = document.getElementById('volunteerQrModal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

async function triggerDownloadQr() {
    if (!currentQrData.id) return;
    toggleLoader(true, "Menyiapkan Unduhan...");
    try {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(currentQrData.id)}`;
        const response = await fetch(qrUrl);
        if (!response.ok) throw new Error("Network response was not OK");
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `QR_${currentQrData.name.replace(/\s+/g, '_')}_${currentQrData.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        showToast("QR Code berhasil diunduh!", "success");
    } catch (e) {
        console.error(e);
        showToast("Gagal mengunduh QR Code", "error");
    } finally {
        toggleLoader(false);
    }
}

function printQrCode() {
    if (!currentQrData.id) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast("Gagal membuka jendela cetak. Pastikan pop-up diizinkan.", "error");
        return;
    }
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQrData.id)}`;
    
    printWindow.document.write(`
        <html>
        <head>
            <title>Cetak QR Code - ${currentQrData.name}</title>
            <style>
                body {
                    font-family: 'Plus Jakarta Sans', 'Outfit', 'Inter', sans-serif;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #fff;
                    color: #334155;
                }
                .card {
                    border: 2px solid #e2e8f0;
                    border-radius: 24px;
                    padding: 32px;
                    text-align: center;
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);
                    max-width: 320px;
                }
                img {
                    width: 200px;
                    height: 200px;
                    margin-bottom: 24px;
                }
                h1 {
                    font-size: 20px;
                    font-weight: 700;
                    margin: 0 0 8px 0;
                }
                .division {
                    font-size: 12px;
                    font-weight: 700;
                    color: #2563eb;
                    background-color: #eff6ff;
                    padding: 4px 12px;
                    border-radius: 9999px;
                    display: inline-block;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                }
                .id {
                    font-family: monospace;
                    font-size: 11px;
                    color: #94a3b8;
                    margin: 0;
                }
                @media print {
                    body { height: auto; }
                    .card { border: none; box-shadow: none; }
                }
            </style>
        </head>
        <body>
            <div class="card">
                <img src="${qrUrl}" onload="window.print(); window.close();" alt="QR Code">
                <h1>${currentQrData.name}</h1>
                <div class="division">${currentQrData.division}</div>
                <p class="id">ID: ${currentQrData.id}</p>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// --- Volunteer & Division Card Collapsible Toggles & Photo Upload handlers ---
let newEmpPhotoBase64 = '';
let editEmpPhotoBase64 = '';

function toggleEmpForm(show) {
    const collapsed = document.getElementById('empCardCollapsed');
    const expanded = document.getElementById('empCardExpanded');
    if (!collapsed || !expanded) return;
    
    if (show) {
        collapsed.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
        collapsed.style.opacity = '0';
        collapsed.style.transform = 'scale(0.95)';
        collapsed.style.pointerEvents = 'none';
        
        setTimeout(() => {
            collapsed.classList.add('hidden');
            collapsed.style.opacity = '';
            collapsed.style.transform = '';
            collapsed.style.pointerEvents = '';
            
            expanded.classList.remove('hidden');
            expanded.style.opacity = '0';
            expanded.style.transform = 'scale(0.95)';
            expanded.style.transition = 'none';
            
            adjustGridSpans();
            
            expanded.offsetHeight; // trigger reflow
            
            expanded.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
            expanded.style.opacity = '1';
            expanded.style.transform = 'scale(1)';
            
            // Reset form inputs and variables
            document.getElementById('newEmpName').value = '';
            document.getElementById('newEmpSalary').value = '';
            newEmpPhotoBase64 = '';
            const preview = document.getElementById('newEmpPhotoPreview');
            if (preview) preview.innerHTML = `<i class="fas fa-camera text-base"></i>`;
            const photoInput = document.getElementById('newEmpPhotoInput');
            if (photoInput) photoInput.value = '';
            
            // Trigger select defaults
            document.getElementById('newEmpDiv').selectedIndex = 0;
            document.getElementById('newEmpRole').selectedIndex = 0;
            handleDivisionRolePreset('new');
        }, 200);
    } else {
        expanded.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        expanded.style.opacity = '0';
        expanded.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            expanded.classList.add('hidden');
            expanded.style.opacity = '';
            expanded.style.transform = '';
            
            collapsed.classList.remove('hidden');
            collapsed.style.opacity = '0';
            collapsed.style.transform = 'scale(0.95)';
            collapsed.style.transition = 'none';
            
            adjustGridSpans();
            
            collapsed.offsetHeight; // trigger reflow
            
            collapsed.style.transition = 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            collapsed.style.opacity = '1';
            collapsed.style.transform = 'scale(1)';
        }, 150);
    }
}

function adjustGridSpans() {
    const empExpanded = !document.getElementById('empCardExpanded').classList.contains('hidden');
    const divExpanded = !document.getElementById('divCardExpanded').classList.contains('hidden');
    
    const empContainerEl = document.getElementById('empCardContainer');
    const divContainerEl = document.getElementById('divCardContainer');
    
    if (!empContainerEl || !divContainerEl) return;
    
    // Remove previous classes
    empContainerEl.classList.remove('lg:col-span-4', 'lg:col-span-6', 'lg:col-span-8');
    divContainerEl.classList.remove('lg:col-span-4', 'lg:col-span-6', 'lg:col-span-8');
    
    if (empExpanded && divExpanded) {
        // Both expanded
        empContainerEl.classList.add('lg:col-span-6');
        divContainerEl.classList.add('lg:col-span-6');
    } else if (empExpanded && !divExpanded) {
        // Volunteer expanded, Divisi collapsed
        empContainerEl.classList.add('lg:col-span-8');
        divContainerEl.classList.add('lg:col-span-4');
    } else if (!empExpanded && divExpanded) {
        // Volunteer collapsed, Divisi expanded
        empContainerEl.classList.add('lg:col-span-4');
        divContainerEl.classList.add('lg:col-span-8');
    } else {
        // Both collapsed
        empContainerEl.classList.add('lg:col-span-6');
        divContainerEl.classList.add('lg:col-span-6');
    }
}

function handlePhotoUpload(input, mode) {
    const file = input.files[0];
    if (!file) return;
    
    // Validate size (limit to 2MB to prevent payload errors)
    if (file.size > 2 * 1024 * 1024) {
        showToast("Ukuran foto maksimal 2MB!", "error");
        input.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function (e) {
        const base64Data = e.target.result.split(',')[1]; // Get only the base64 content
        const previewUrl = e.target.result;
        
        if (mode === 'new') {
            newEmpPhotoBase64 = base64Data;
            const preview = document.getElementById('newEmpPhotoPreview');
            if (preview) {
                preview.innerHTML = `<img src="${previewUrl}" onclick="previewImage('${previewUrl.replace(/'/g, "\\'")}'); event.stopPropagation();" class="w-full h-full object-cover cursor-pointer hover:scale-105 transition duration-200">`;
            }
        } else if (mode === 'edit') {
            editEmpPhotoBase64 = base64Data;
            const preview = document.getElementById('editPreviewContainer');
            if (preview) {
                preview.innerHTML = `<img src="${previewUrl}" onclick="previewImage('${previewUrl.replace(/'/g, "\\'")}'); event.stopPropagation();" class="w-full h-full object-cover cursor-pointer hover:scale-105 transition duration-200">`;
            }
        }
    };
    reader.readAsDataURL(file);
}