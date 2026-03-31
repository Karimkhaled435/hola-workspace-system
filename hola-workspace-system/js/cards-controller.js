// =====================================================
// js/cards-controller.js — Internet Cards UI Controller
// Handles all window.* functions for card management
// =====================================================

import {
    generateCards, setCardStatus, deleteCard, getCardByCode,
    bindCardToDevice, isCardValid, resetCardBinding, renderAdminCards, renderCardLoginResult
} from "./cards.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ─── Wait for Firebase (db, appId exposed by app.js via window) ───────────────
let _db = null;
let _appId = null;
let _allCards = [];

function getDb() { return _db; }
function getAppId() { return _appId; }

// Poll until firebase is ready (app.js calls initFirebase which sets window._db etc.)
function waitForFirebase(cb) {
    const check = () => {
        if (window._firebaseDb && window._firebaseAppId) {
            _db = window._firebaseDb;
            _appId = window._firebaseAppId;
            cb();
        } else {
            setTimeout(check, 300);
        }
    };
    check();
}

// ─── Subscribe to cards collection ────────────────────────────────────────────
function subscribeToCards() {
    if (!_db || !_appId) return;
    const cardsRef = collection(_db, 'artifacts', _appId, 'public', 'data', 'internet_cards');
    onSnapshot(cardsRef, (snap) => {
        _allCards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCardsIfVisible();
        updateCardStats();
    });
}

function renderCardsIfVisible() {
    const tabPanel = document.getElementById('admin-cards');
    if (!tabPanel || tabPanel.classList.contains('hidden')) return;
    window.filterAdminCards();
}

function updateCardStats() {
    const stats = { active: 0, suspended: 0, expired: 0, inactive: 0, total: _allCards.length };
    const now = Date.now();
    _allCards.forEach(c => {
        // Auto-detect expired based on time/quota even if status still says active
        const effectiveStatus = (c.status === 'active' && (now > c.expiresAt || c.usedMB >= c.quotaMB))
            ? 'expired' : c.status;
        if (stats[effectiveStatus] !== undefined) stats[effectiveStatus]++;
    });

    const s = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    s('cardStatActive', stats.active);
    s('cardStatSuspended', stats.suspended);
    s('cardStatExpired', stats.expired);
    s('cardStatTotal', stats.total);
}

// ─── Filter & render cards table ──────────────────────────────────────────────
window.filterAdminCards = function () {
    const statusFilter = document.getElementById('cardFilterStatus')?.value || 'all';
    const search = (document.getElementById('cardSearchInput')?.value || '').trim().toUpperCase();
    const now = Date.now();

    let filtered = _allCards.filter(c => {
        const effectiveStatus = (c.status === 'active' && (now > c.expiresAt || c.usedMB >= c.quotaMB))
            ? 'expired' : c.status;
        if (statusFilter !== 'all' && effectiveStatus !== statusFilter) return false;
        if (search && !c.code.includes(search)) return false;
        return true;
    });

    const tbody = document.getElementById('adminCardsList');
    if (!tbody) return;
    tbody.innerHTML = renderAdminCards(filtered).replace(/<table[^>]*>.*?<tbody>/s, '').replace(/<\/tbody>.*?<\/table>/s, '');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-400">لا توجد كروت مطابقة</td></tr>';
    }
};

// ─── Card Actions ─────────────────────────────────────────────────────────────
window.cardAction = async function (action, cardId) {
    const db = getDb(), appId = getAppId();
    if (!db) return;
    if (action === 'delete') {
        if (!confirm('هل تريد حذف هذا الكرت نهائياً؟')) return;
        await deleteCard(db, appId, cardId);
    } else if (action === 'activate') {
        await setCardStatus(db, appId, cardId, 'active');
    } else if (action === 'suspend') {
        await setCardStatus(db, appId, cardId, 'suspended');
    } else if (action === 'resetBind') {
        if (!confirm('إعادة تعيين الجهاز المرتبط بهذا الكرت؟')) return;
        await resetCardBinding(db, appId, cardId);
    }
};

// ─── Show generate cards modal ────────────────────────────────────────────────
window.showGenerateCardsModal = function () {
    // Update preview
    const updatePreview = () => {
        const quota = document.getElementById('genCardsQuota')?.value || 5;
        const days  = document.getElementById('genCardsDays')?.value || 30;
        const expiry = new Date(Date.now() + days * 86400000).toLocaleDateString('ar-EG');
        const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        s('genPreviewQuota', quota);
        s('genPreviewDays', days);
        s('genPreviewExpiry', expiry);
    };
    updatePreview();

    // Reset previous generated preview
    const prev = document.getElementById('generatedCardsPreview');
    if (prev) prev.classList.add('hidden');

    // Listen for input changes to update preview
    ['genCardsQuota', 'genCardsDays'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = updatePreview;
    });

    document.getElementById('generateCardsModal')?.classList.remove('hidden');
};

// ─── Generate cards ───────────────────────────────────────────────────────────
window.doGenerateCards = async function () {
    const db = getDb(), appId = getAppId();
    if (!db) return;

    const count     = parseInt(document.getElementById('genCardsCount')?.value) || 1;
    const quotaGB   = parseInt(document.getElementById('genCardsQuota')?.value) || 5;
    const validityDays = parseInt(document.getElementById('genCardsDays')?.value) || 30;
    const prefix    = (document.getElementById('genCardsPrefix')?.value || 'HOLA').toUpperCase().slice(0, 6);

    const cards = await generateCards(db, appId, { count, quotaGB, validityDays, prefix });
    if (!cards || cards.length === 0) return;

    // Show generated cards
    const listEl = document.getElementById('generatedCardsList');
    const prevEl = document.getElementById('generatedCardsPreview');
    if (listEl && prevEl) {
        listEl.innerHTML = cards.map(c =>
            `<div class="flex items-center gap-2 bg-white p-2 rounded-lg border">
                <span class="font-mono font-black text-hola-purple">${c.code}</span>
                <span class="text-xs text-gray-400 mr-auto">${quotaGB}GB / ${validityDays}d</span>
             </div>`
        ).join('');
        prevEl.classList.remove('hidden');
        // Store for printing
        window._lastGeneratedCards = cards;
    }
};

// ─── Print generated cards ────────────────────────────────────────────────────
window.printGeneratedCards = function () {
    const cards = window._lastGeneratedCards || [];
    if (cards.length === 0) return;
    _showPrintCards(cards);
};

window.printAllCards = function () {
    const statusFilter = document.getElementById('cardFilterStatus')?.value || 'all';
    const filtered = statusFilter === 'all' ? _allCards
        : _allCards.filter(c => c.status === statusFilter);
    _showPrintCards(filtered);
};

function _showPrintCards(cards) {
    const grid = document.getElementById('cardsPrintGrid');
    const dateEl = document.getElementById('cardsPrintDate');
    if (!grid) return;

    if (dateEl) dateEl.textContent = `طُبع: ${new Date().toLocaleString('ar-EG')}`;

    grid.innerHTML = cards.map(c => {
        const remainGB = ((c.quotaMB - c.usedMB) / 1024).toFixed(1);
        const expDate  = new Date(c.expiresAt).toLocaleDateString('ar-EG');
        return `
        <div class="internet-card-print" style="
            background: linear-gradient(135deg, #301043, #1a0028);
            color: #fff;
            border-radius: 12px;
            padding: 16px;
            font-family: Cairo, sans-serif;
            text-align: right;
        ">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div style="font-size:11px;color:#d8b4fe;">HOLA WORKSPACE</div>
                <div style="font-size:10px;color:#4ade80;font-weight:700;">${c.status === 'active' ? '✓ نشط' : '✗ موقوف'}</div>
            </div>
            <div style="margin-bottom:10px;">
                <div style="font-size:9px;color:#d8b4fe;margin-bottom:4px;">كود الكرت</div>
                <div style="font-family:monospace;font-size:20px;font-weight:900;letter-spacing:3px;color:#f97316;">${c.code}</div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
                <div><div style="color:#d8b4fe;">الكوتا</div><div style="font-weight:700;">${(c.quotaMB/1024).toFixed(0)} GB</div></div>
                <div><div style="color:#d8b4fe;">المتبقي</div><div style="font-weight:700;color:#4ade80;">${remainGB} GB</div></div>
                <div><div style="color:#d8b4fe;">ينتهي</div><div style="font-weight:700;">${expDate}</div></div>
            </div>
        </div>`;
    }).join('');

    document.getElementById('cardsPrintArea')?.classList.remove('hidden');
    window.print();
    setTimeout(() => {
        document.getElementById('cardsPrintArea')?.classList.add('hidden');
    }, 1000);
}

// ─── Check card status (public / client) ─────────────────────────────────────
window.checkCardStatus = async function () {
    const db = getDb(), appId = getAppId();
    const code = document.getElementById('cardLoginCode')?.value.trim().toUpperCase();
    if (!code) return;

    const resultEl = document.getElementById('cardLoginResult');
    if (resultEl) {
        resultEl.classList.remove('hidden');
        resultEl.innerHTML = '<p class="text-center text-gray-400 py-2">جاري الفحص...</p>';
    }

    const card = db ? await getCardByCode(db, appId, code) : null;
    if (resultEl) resultEl.innerHTML = renderCardLoginResult(card);
};

// ─── Activate card for client (My Package tab) ───────────────────────────────
window.activateMyCard = async function () {
    const db = getDb(), appId = getAppId();
    const code = document.getElementById('myCardCodeInput')?.value.trim().toUpperCase();
    if (!code) return;

    const card = db ? await getCardByCode(db, appId, code) : null;
    if (!card) {
        window.showMsg?.('الكود غير موجود', 'error');
        return;
    }

    if (!isCardValid(card)) {
        window.showMsg?.('هذا الكرت غير صالح للاستخدام', 'error');
        return;
    }

    // Generate a stable device ID
    let deviceId = localStorage.getItem('hola_device_id');
    if (!deviceId) {
        const arr = new Uint8Array(8);
        crypto.getRandomValues(arr);
        deviceId = 'dev_' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('hola_device_id', deviceId);
    }

    // Check if card is already bound to a different device
    if (card.boundDevice && card.boundDevice !== deviceId) {
        window.showMsg?.('هذا الكرت مرتبط بجهاز آخر — تواصل مع الإدارة', 'error');
        return;
    }

    // Bind to this device if not already bound
    if (!card.boundDevice) {
        const deviceInfo = navigator.userAgent.slice(0, 80);
        await bindCardToDevice(db, appId, card.id, deviceId, deviceInfo);
    }

    // Save card code to local storage for this session
    localStorage.setItem('hola_my_card', code);
    window.showMsg?.('تم ربط الكرت بجهازك بنجاح!', 'success');
    renderMyCard({ ...card, boundDevice: deviceId });
};

// ─── Render My Package tab ────────────────────────────────────────────────────
function renderMyCard(card) {
    const empty   = document.getElementById('myCardEmpty');
    const display = document.getElementById('myCardDisplay');
    if (!card || !isCardValid(card)) {
        if (empty) empty.classList.remove('hidden');
        if (display) display.classList.add('hidden');
        return;
    }

    if (empty) empty.classList.add('hidden');
    if (display) display.classList.remove('hidden');

    const usedGB    = (card.usedMB / 1024).toFixed(2);
    const quotaGB   = (card.quotaMB / 1024).toFixed(0);
    const remainGB  = ((card.quotaMB - card.usedMB) / 1024).toFixed(2);
    const pct       = Math.min(100, Math.round((card.usedMB / card.quotaMB) * 100));
    const expDate   = new Date(card.expiresAt).toLocaleDateString('ar-EG');

    const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    s('myCardCode', card.code);
    s('myCardUsedGB', `${usedGB} GB / ${quotaGB} GB`);
    s('myCardRemainGB', `${remainGB} GB`);
    s('myCardUsedGBStat', `${usedGB} GB`);
    s('myCardExpiry', expDate);

    const bar = document.getElementById('myCardQuotaBar');
    if (bar) bar.style.width = pct + '%';

    const badge = document.getElementById('myCardStatusBadge');
    if (badge) {
        badge.textContent = card.status === 'active' ? 'نشط' : 'موقوف';
        badge.className = card.status === 'active'
            ? 'bg-green-500 text-white text-xs px-2 py-1 rounded-full font-bold'
            : 'bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold';
    }

    const deviceText = document.getElementById('myCardDeviceText');
    if (deviceText) {
        const deviceId = localStorage.getItem('hola_device_id');
        deviceText.textContent = card.boundDevice === deviceId
            ? 'الكرت مرتبط بهذا الجهاز ✓'
            : 'الكرت غير مرتبط بهذا الجهاز';
    }
}

// Load saved card on tab switch
window._syncCardTab = async function () {
    const db = getDb(), appId = getAppId();
    if (!db) return;
    const savedCode = localStorage.getItem('hola_my_card');
    if (savedCode) {
        const card = await getCardByCode(db, appId, savedCode);
        renderMyCard(card);
    }
};

// ─── Extend switchClientTab to handle 'internet' tab ─────────────────────────
const _originalSwitchClientTab = window.switchClientTab;
window.switchClientTab = function (tab) {
    if (typeof _originalSwitchClientTab === 'function') _originalSwitchClientTab(tab);
    if (tab === 'internet') {
        window._syncCardTab?.();
    }
};

// ─── Expose db/appId to cards module (set by firebase.js after init) ──────────
// app.js exposes db and appId via window after Firebase init
function hookFirebase() {
    // Import from app.js is not directly possible here since it's a separate module.
    // We listen for a custom event that app.js fires after Firebase init.
    document.addEventListener('hola-firebase-ready', (e) => {
        _db = e.detail.db;
        _appId = e.detail.appId;
        subscribeToCards();
    });
    // Fallback: poll if event already fired
    if (window._firebaseDb) {
        _db = window._firebaseDb;
        _appId = window._firebaseAppId;
        subscribeToCards();
    }
}

// ─── Init ──────────────────────────────────────────────────────────────────────
hookFirebase();
