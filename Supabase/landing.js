/**
 * landing.js — Cloud MBG Landing Page Scripts
 * Extracted from inline <script> in index.html for better caching & separation.
 * Requires: DOM ready (loaded with defer)
 */

// 1. TYPIST ANIMATION (Type, Hold, Erase, Repeat)
(function() {
    const typist = document.getElementById('typistElement');
    if (!typist) return;
    const words = [
        "automated payroll & salary calculations.",
        "seamless geofencing & GPS verification.",
        "instant PDF salary slips & ZIP records.",
        "real-time dashboard analytics.",
        "zero-bug corporate stability."
    ];
    let wordIdx = 0, charIdx = 0, isDeleting = false, delay = 80;

    function type() {
        const currentWord = words[wordIdx];
        let isWaiting = false;
        if (isDeleting) { charIdx--; delay = 30; }
        else { charIdx++; delay = 80; }
        const textToShow = currentWord.substring(0, charIdx);
        if (!isDeleting && charIdx === currentWord.length) {
            isDeleting = true; delay = 2200; isWaiting = true;
        } else if (isDeleting && charIdx === 0) {
            isDeleting = false; wordIdx = (wordIdx + 1) % words.length; delay = 300; isWaiting = true;
        }
        const blinkClass = isWaiting ? 'blink' : '';
        typist.innerHTML = textToShow + '<span class="typewriter-cursor ' + blinkClass + '">|</span>';
        setTimeout(type, delay);
    }
    setTimeout(type, 1000);
})();

// 2. 3D PARTICLE CONSTELLATION SPHERE
(function() {
    const canvas = document.getElementById('heroCanvasParticles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    // Reduce particles on mobile for performance
    const isMobile = () => window.innerWidth < 768;
    const numParticles = isMobile() ? 60 : 160;

    window.addEventListener('resize', () => {
        width = canvas.width = canvas.offsetWidth;
        height = canvas.height = canvas.offsetHeight;
    });

    const particles = [];
    const radiusSphere = Math.min(width, height) * 0.35;

    for (let i = 0; i < numParticles; i++) {
        const theta = Math.acos((Math.random() * 2) - 1);
        const phi = Math.random() * Math.PI * 2;
        particles.push({
            x3d: Math.sin(theta) * Math.cos(phi) * radiusSphere,
            y3d: Math.sin(theta) * Math.sin(phi) * radiusSphere,
            z3d: Math.cos(theta) * radiusSphere,
            color: Math.random() > 0.4 ? '#6366f1' : '#10b981'
        });
    }

    let angleX = 0.001, angleY = 0.0015, targetAngleX = 0.001, targetAngleY = 0.0015;

    // OPTIMIZED: Throttled mousemove using RAF
    let sphereRafPending = false;
    document.addEventListener('mousemove', (e) => {
        if (sphereRafPending) return;
        sphereRafPending = true;
        requestAnimationFrame(() => {
            const dx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
            const dy = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
            targetAngleY = dx * 0.004;
            targetAngleX = dy * 0.004;
            sphereRafPending = false;
        });
    }, { passive: true });

    function rotateX(p, angle) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const y = p.y3d * cos - p.z3d * sin; const z = p.y3d * sin + p.z3d * cos;
        p.y3d = y; p.z3d = z;
    }
    function rotateY(p, angle) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const x = p.x3d * cos - p.z3d * sin; const z = p.x3d * sin + p.z3d * cos;
        p.x3d = x; p.z3d = z;
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);
        angleX += (targetAngleX - angleX) * 0.05;
        angleY += (targetAngleY - angleY) * 0.05;
        const projected = [];
        for (let i = 0; i < numParticles; i++) {
            const p = particles[i];
            rotateX(p, angleX); rotateY(p, angleY);
            const fov = 400, scale = fov / (fov + p.z3d);
            projected.push({ x: (p.x3d * scale) + width / 2, y: (p.y3d * scale) + height / 2, z: p.z3d, scale, color: p.color });
        }
        const isDark = document.documentElement.classList.contains('dark');
        ctx.strokeStyle = isDark ? 'rgba(99, 102, 241, 0.07)' : 'rgba(99, 102, 241, 0.04)';
        ctx.lineWidth = 0.5;
        const maxDist = isMobile() ? 65 : 85;
        for (let i = 0; i < numParticles; i++) {
            const p1 = projected[i];
            for (let j = i + 1; j < numParticles; j++) {
                const p2 = projected[j];
                const dx = p1.x - p2.x, dy = p1.y - p2.y;
                if (Math.sqrt(dx * dx + dy * dy) < maxDist) {
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
                }
            }
        }
        for (let i = 0; i < numParticles; i++) {
            const p = projected[i];
            const alpha = Math.max(0.1, (p.z + radiusSphere) / (radiusSphere * 2));
            ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
            ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, p.scale * 1.6), 0, Math.PI * 2); ctx.fill();
        }
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
})();

// 3. PRICING PERIOD TOGGLE
let isAnnualPricing = false;
function togglePricingPeriod() {
    isAnnualPricing = !isAnnualPricing;
    const circle = document.getElementById('pricingSwitchCircle');
    const btn = document.getElementById('pricingSwitchBtn');
    if (isAnnualPricing) {
        circle.classList.replace('translate-x-0', 'translate-x-6');
        btn.classList.replace('bg-indigo-600', 'bg-violet-600');
    } else {
        circle.classList.replace('translate-x-6', 'translate-x-0');
        btn.classList.replace('bg-violet-600', 'bg-indigo-600');
    }
    updatePricingDisplay();
}

function updatePricingDisplay() {
    const p = isAnnualPricing;
    const prices = {
        a: { text: p ? "Rp 119.000" : "Rp 149.000", sub: p ? "Tagihan Tahunan (Hemat 20%)" : "Tagihan Bulanan" },
        b: { text: p ? "Rp 239.000" : "Rp 299.000", sub: p ? "Tagihan Tahunan (Hemat 20%)" : "Tagihan Bulanan" },
        c: { text: p ? "Rp 399.000" : "Rp 499.000", sub: p ? "Tagihan Tahunan (Hemat 20%)" : "Tagihan Bulanan" }
    };
    [['pricePlanA', prices.a.text], ['subPlanA', prices.a.sub],
     ['pricePlanB', prices.b.text], ['subPlanB', prices.b.sub],
     ['pricePlanC', prices.c.text], ['subPlanC', prices.c.sub]].forEach(([id, text]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('opacity-40');
        setTimeout(() => { el.innerText = text; el.classList.remove('opacity-40'); }, 150);
    });

    const wa = "6281414142726";
    const mkMsg = (pkg, price) => isAnnualPricing
        ? `Halo AFKxEnjoyCreamID, saya tertarik berlangganan Cloud MBG *${pkg}* (Tahunan) harga ${price}/bulan (Hemat 20%). Info selengkapnya?`
        : `Halo AFKxEnjoyCreamID, saya tertarik berlangganan Cloud MBG *${pkg}* (Bulanan) harga ${price}/bulan. Info selengkapnya?`;
    const msgs = [
        ['btnOrderPlanA', mkMsg('Paket A', prices.a.text)],
        ['btnOrderPlanB', mkMsg('Paket B (Best Seller)', prices.b.text)],
        ['btnOrderPlanC', mkMsg('Paket C', prices.c.text)]
    ];
    msgs.forEach(([id, text]) => {
        const el = document.getElementById(id);
        if (el) el.href = `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
    });
}

// 4. VIEW TRANSITION UTILITIES
function showLoginScreen() {
    const landing = document.getElementById('landingView');
    const login = document.getElementById('loginView');
    if (!landing || !login) return;
    landing.classList.add('view-hidden');
    setTimeout(() => {
        landing.classList.add('hidden');
        login.classList.remove('hidden');
        setTimeout(() => login.classList.remove('view-hidden'), 50);
    }, 500);
}

function showLandingView() {
    const landing = document.getElementById('landingView');
    const login = document.getElementById('loginView');
    if (!landing || !login) return;
    login.classList.add('view-hidden');
    setTimeout(() => {
        login.classList.add('hidden');
        landing.classList.remove('hidden');
        setTimeout(() => landing.classList.remove('view-hidden'), 50);
    }, 500);
}

// 5. PRIVACY & TERMS MODALS
function openPrivacyModal() {
    const modal = document.getElementById('privacyModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); modal.querySelector('.clay-modal')?.classList.remove('scale-95'); }, 10);
}
function closePrivacyModal() {
    const modal = document.getElementById('privacyModal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    modal.querySelector('.clay-modal')?.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}
function openTermsModal() {
    const modal = document.getElementById('termsModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); modal.querySelector('.clay-modal')?.classList.remove('scale-95'); }, 10);
}
function closeTermsModal() {
    const modal = document.getElementById('termsModal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    modal.querySelector('.clay-modal')?.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}
