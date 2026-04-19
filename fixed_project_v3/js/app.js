// =====================================================
// js/app.js — Main Entry Point, Timer, Session Logic
// =====================================================
/* global scrollTo, print, open, confirm, alert, prompt, setTimeout, setInterval, clearTimeout, clearInterval, localStorage, sessionStorage, navigator, location, history, performance, fetch, URL, URLSearchParams, FormData, FileReader, Blob, Worker, EventSource, MutationObserver, IntersectionObserver, ResizeObserver, AbortController, crypto */
/* eslint-disable no-undef */

import { collection, addDoc, updateDoc, doc, deleteDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initFirebase, db, appId } from "./firebase.js";
import {
    sysSettings, _profiles, _sessions, _menu, _discounts, _notifications, _operations,
    _prebookings, _eventAttendees, _chats, _subscriptions, _plans, _smartEvents, _feedback,
    myProfile, activeSessionId, sessionStartTime,
    sessionItems, timerInterval, appliedDiscountVal, currentManageUserPhone, currentShiftAdmin,
    currentChatPhone, setMyProfile, setActiveSessionId, setSessionStartTime, setSessionItems,
    setTimerInterval, setAppliedDiscountVal, setCurrentManageUserPhone, setCurrentShiftAdmin,
    setCurrentChatPhone, unregisterUserDeviceSession, resetSeenNotifications
} from "./sessions.js";
import {
    showMsg, safeSet, copyToClipboard, switchView, switchClientTab, switchAdminTab,
    updateClientHeaderUI, updateCapacityUI, renderShiftManagers,
    renderClientMenu, renderAdminMenu, renderAdminDiscounts, renderAdminUsers, renderAdminBanned,
    renderAdminGroupedOrders, renderAdminSessions, renderAdminPreBookings, renderAdminEventAttendees,
    renderAdminChatUsersList, renderAdminChatMessages, renderClientChatMessages,
    renderClientHistory, renderClientNotifications, renderClientLoyalty, showClientNotification,
    renderPublicEvents, renderClientSubscriptions, renderAdminSubscriptions, renderAdminPlans
} from "./ui.js";
import {
    checkLocationForLogin, showPreBookingFallback, resetLocationCheck, checkNewUser,
    submitPreBooking, submitInternalPreBooking, handleLogin, showAdminLoginModal,
    verifyAdminPin, logoutAdmin
} from "./auth.js";
import {
    applyDiscountCode, saveDiscount, deleteDiscount, showDiscountModal,
    saveMenuItem, deleteMenuItem, showMenuModal,
    openUserManage, saveUserWallet, sendUserMsgOnly, sendUserDiscountOnly, openUserDetails,
    unbanPhone, markPreBookingDone, deleteAllHistory, deleteAllArchivedBookings, exportTableToCSV
} from "./vouchers.js";
import { printInvoice, showEndDaySummary, closeEndDaySummary, printEndDaySummary } from "./print.js";

// ─── Security: HTML Sanitizer ────────────────────────────────────────────────
function _esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}
window._esc = _esc;

// ─── Global Init ─────────────────────────────────────────────────────────────
window._loginAttempts = {};
window._bannedPhones = {};
window._smartEvents = _smartEvents;
window.sysSettings = sysSettings;
window.lastCompletedSessionId = null;
window.lastAdminCompletedSessionId = null;
window.currentPaymentSessionId = null;
window.currentPaymentType = null;
window._currentShiftAdmin = currentShiftAdmin;
window._currentEvSlot = 1; // Current event slot being edited

// ─── Sound Alerts ─────────────────────────────────────────────────────────────
export function playAlertSound(type = 'normal') {
    let audio = document.getElementById('alertSound');
    if (type === 'high') audio = document.getElementById('soundHigh') || audio;
    if (type === 'congrats') audio = document.getElementById('soundCongrats') || audio;
    if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
}

// ─── Operation Log ────────────────────────────────────────────────────────────
export async function logOperation(db, appId, adminName, actionType, details) {
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'operations'), { adminName: adminName || "الإدارة", actionType, details, timestamp: Date.now() });
    } catch (e) {}
}

// ─── Time Cost Calculation ────────────────────────────────────────────────────
function calculateTimeCost(diffMs) {
    if (diffMs <= 0) return 0;
    // دقائق السماح قبل احتساب الساعة التالية (0 = احتساب فوري)
    const graceMs = ((sysSettings.graceMinutes || 0) * 60000);
    // نطرح دقائق السماح قبل التقريب للأعلى
    const adjustedMs = Math.max(0, diffMs - graceMs);
    const hours = Math.ceil(adjustedMs / 3600000);
    let cost = 0;
    if (hours >= 1) cost += sysSettings.pricingTier1;
    if (hours >= 2) cost += sysSettings.pricingTier2;
    if (hours >= 3) cost += sysSettings.pricingTier3;
    
    // النظام الجديد لما بعد الساعة الثالثة
    if (hours > 3) {
        if (sysSettings.after3rdType === 'fixed') {
            cost += (hours - 3) * (sysSettings.after3rdPrice || 0);
        }
    }
    return cost;
}

function getSessionGroupCount(sessionLike) {
    const g = parseInt(sessionLike?.groupCount, 10);
    return Number.isFinite(g) && g > 1 ? g : 1;
}

function calculateGroupAwareTimeCost(diffMs, sessionLike) {
    return calculateTimeCost(diffMs) * getSessionGroupCount(sessionLike);
}

// ─── Timer & Dashboard ────────────────────────────────────────────────────────
function updateDashboardNumbers() {
    const now = Date.now();
    if (sessionStartTime) {
        const diffSecs = Math.floor((now - sessionStartTime) / 1000);
        const h = Math.floor(diffSecs / 3600).toString().padStart(2, '0');
        const m = Math.floor((diffSecs % 3600) / 60).toString().padStart(2, '0');
        const s = (diffSecs % 60).toString().padStart(2, '0');
        const elElapsed = document.getElementById('clientElapsedTime');
        if (elElapsed) elElapsed.innerHTML = `${h}:${m}<span class="text-xl text-gray-400 ml-1 font-bold">:${s}</span>`;
        const curSession = activeSessionId ? _sessions[activeSessionId] : null;
        const timeCost = calculateGroupAwareTimeCost(diffSecs * 1000, curSession);
        const itemsCost = sessionItems.reduce((sum, item) => sum + item.price, 0);
        safeSet('clientTimeCost', 'innerText', `${timeCost} ج`);
        safeSet('clientItemsCost', 'innerText', `${itemsCost} ج`);
        safeSet('clientTotalCost', 'innerText', `${timeCost + itemsCost} ج`);
    }
    document.querySelectorAll('.admin-timer').forEach(el => {
        const start = parseInt(el.dataset.start);
        if (start) {
            const d = now - start;
            const h = Math.floor(d / 3600000).toString().padStart(2, '0');
            const m = Math.floor((d % 3600000) / 60000).toString().padStart(2, '0');
            const s = Math.floor((d % 60000) / 1000).toString().padStart(2, '0');
            el.innerHTML = `${h}:${m}<span class="text-[10px] text-gray-400 ml-1">:${s}</span>`;
        }
    });
    const lElapsed = document.getElementById('liveSesElapsed');
    if (lElapsed && lElapsed.dataset.start) {
        const d = now - parseInt(lElapsed.dataset.start);
        const h = Math.floor(d / 3600000).toString().padStart(2, '0');
        const m = Math.floor((d % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((d % 60000) / 1000).toString().padStart(2, '0');
        lElapsed.innerText = `${h}:${m}:${s}`;
    }
    if (typeof window._updateGroupLiveInfo === 'function') window._updateGroupLiveInfo();
}
window._updateDashboardNumbers = updateDashboardNumbers;

// ─── Persistent Admin Timer (runs always, independent of client session) ──────
let _adminTimerInterval = null;
function _startAdminTimer() {
    if (_adminTimerInterval) return; // already running
    _adminTimerInterval = setInterval(() => {
        const now = Date.now();
        document.querySelectorAll('.admin-timer[data-start]').forEach(el => {
            const start = parseInt(el.dataset.start);
            if (start) {
                const d = now - start;
                const h = Math.floor(d / 3600000).toString().padStart(2, '0');
                const m = Math.floor((d % 3600000) / 60000).toString().padStart(2, '0');
                const s = Math.floor((d % 60000) / 1000).toString().padStart(2, '0');
                el.innerHTML = `${h}:${m}<span class="text-[10px] text-gray-400 ml-1">:${s}</span>`;
            }
        });
        const lElapsed = document.getElementById('liveSesElapsed');
        if (lElapsed && lElapsed.dataset.start) {
            const d = now - parseInt(lElapsed.dataset.start);
            const h = Math.floor(d / 3600000).toString().padStart(2, '0');
            const m = Math.floor((d % 3600000) / 60000).toString().padStart(2, '0');
            const s = Math.floor((d % 60000) / 1000).toString().padStart(2, '0');
            lElapsed.innerText = `${h}:${m}:${s}`;
        }
    }, 1000);
}
window._startAdminTimer = _startAdminTimer;
// Start immediately when module loads
_startAdminTimer();

function startTimer() {
    safeSet('clientStartTime', 'innerText', new Date(sessionStartTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    if (timerInterval) clearInterval(timerInterval);
    updateDashboardNumbers();
    const interval = setInterval(updateDashboardNumbers, 1000);
    setTimerInterval(interval);
    // Update session ID ref for menu free drink tracking
    window._sessionIdRef = activeSessionId;
    // Re-render menu with free drink status
    if (window._menuData && window.renderClientMenuWithFreeDrink) {
        window.renderClientMenuWithFreeDrink(window._menuData, activeSessionId);
    }
    // Track session items ref for features.js
    window._sessionItemsRef = sessionItems;
}
window._startTimer = startTimer;

// ─── Session Items ────────────────────────────────────────────────────────────
window.renderSessionItemsList = () => {
    window._sessionItemsRef = sessionItems; // keep ref in sync
    const div = document.getElementById('activeSessionItemsDiv');
    const list = document.getElementById('activeSessionItemsList');
    if (!div || !list) return;
    if (sessionItems.length === 0) { div.classList.add('hidden'); return; }
    div.classList.remove('hidden');
    list.innerHTML = sessionItems.map(i =>
        `<span class="bg-gray-100 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-md border shadow-sm">${_esc(i.name)} <span class="text-hola-orange ml-1 font-black">${i.price} ج</span></span>`
    ).join('');
};

window.orderItem = async (menuId) => {
    if (!activeSessionId || !db) return;
    const item = _menu[menuId]; if (!item) return;
    const newItems = [...sessionItems, { name: item.name, price: item.price, type: item.type, time: Date.now() }];
    setSessionItems(newItems);
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', activeSessionId), { items: newItems });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), { phone: myProfile.phone, itemName: item.name, status: 'pending', timestamp: Date.now() });
        window.renderSessionItemsList(); updateDashboardNumbers(); showMsg(`تم تسجيل ${item.name} بنجاح!`, "success");
    } catch (e) { console.error(e); showMsg("خطأ في تنفيذ الطلب", "error"); }
};

// ─── Bar Self-Service ─────────────────────────────────────────────────────────
window._barCart = [];

window.openBarSelfService = () => {
    window._barCart = [];
    const grid = document.getElementById('barSelfMenuGrid');
    if (grid) {
        const drinks = Object.values(_menu).filter(i => i.type === 'drink');
        if (drinks.length === 0) { grid.innerHTML = '<p class="col-span-full text-center text-gray-400 text-sm py-4">لا توجد مشروبات في المنيو</p>'; }
        else {
            grid.innerHTML = drinks.map(item => `
                <button onclick="window.addToBarCart('${item.id}')" class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center hover:bg-orange-50 transition">
                    <i class="fa-solid ${item.icon || 'fa-mug-hot'} text-2xl text-hola-purple mb-2"></i>
                    <p class="font-bold text-xs text-gray-800">${item.name}</p>
                    <p class="text-xs font-black text-hola-orange mt-1">${item.price} ج</p>
                </button>`).join('');
        }
    }
    window.updateBarCart();
    document.getElementById('barSelfServiceModal')?.classList.remove('hidden');
};

window.addToBarCart = (menuId) => {
    const item = _menu[menuId]; if (!item) return;
    window._barCart.push({ id: menuId, name: item.name, price: item.price });
    window.updateBarCart();
};

window.removeFromBarCart = (idx) => {
    window._barCart.splice(idx, 1);
    window.updateBarCart();
};

window.updateBarCart = () => {
    const cartDiv = document.getElementById('barSelfCart');
    const cartItems = document.getElementById('barSelfCartItems');
    const totalEl = document.getElementById('barSelfTotal');
    const confirmBtn = document.getElementById('barSelfConfirmBtn');
    const drinkNote = document.getElementById('drinkNoteMsg');
    if (!cartDiv) return;
    if (window._barCart.length === 0) {
        cartDiv.classList.add('hidden');
        if (confirmBtn) confirmBtn.classList.add('hidden');
        if (drinkNote) drinkNote.classList.add('hidden');
    } else {
        cartDiv.classList.remove('hidden');
        if (confirmBtn) confirmBtn.classList.remove('hidden');
        if (drinkNote) drinkNote.classList.remove('hidden');
        if (cartItems) cartItems.innerHTML = window._barCart.map((i, idx) =>
            `<div class="flex justify-between items-center text-sm"><span class="font-bold">${_esc(i.name)}</span><div class="flex items-center gap-2"><span class="text-hola-orange font-black">${i.price} ج</span><button onclick="window.removeFromBarCart(${idx})" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-times text-xs"></i></button></div></div>`
        ).join('');
        const total = window._barCart.reduce((s, i) => s + i.price, 0);
        if (totalEl) totalEl.innerText = `${total} ج`;
    }
};

window.confirmBarSelfService = async () => {
    if (!activeSessionId || !db || window._barCart.length === 0) return;
    const newItems = [...sessionItems, ...window._barCart.map(i => ({ name: i.name, price: i.price, type: 'drink', time: Date.now() }))];
    setSessionItems(newItems);
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', activeSessionId), { items: newItems });
        for (const item of window._barCart) {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), { phone: myProfile.phone, itemName: `🧃 ${item.name} (بوفيه ذاتي)`, status: 'pending', timestamp: Date.now() });
        }
        window._barCart = [];
        window.renderSessionItemsList(); updateDashboardNumbers();
        document.getElementById('barSelfServiceModal')?.classList.add('hidden');
        showMsg("تم تسجيل مشروباتك بنجاح! 🎉", "success");
    } catch (e) { showMsg("خطأ في التسجيل", "error"); }
};

// ─── Checkout ─────────────────────────────────────────────────────────────────
window.recalcTotal = () => {
    const tC = parseInt(document.getElementById('clientTimeCost')?.innerText) || 0;
    const iC = parseInt(document.getElementById('clientItemsCost')?.innerText) || 0;
    let sub = tC + iC - appliedDiscountVal; if (sub < 0) sub = 0;
    safeSet('modalSubTotal', 'innerText', `${sub} ج`);
    const wIn = document.getElementById('walletDeductInput'); let mDed = wIn ? (parseInt(wIn.value) || 0) : 0;
    const uPhone = myProfile?.phone || (_sessions[activeSessionId]?.phone); const prof = _profiles[uPhone];
    const maxW = prof?.walletBalance || 0;
    if (mDed > maxW) mDed = maxW; if (mDed > sub) mDed = sub;
    const reqEl = document.getElementById('modalFinalRequired');
    if (reqEl) { reqEl.dataset.subTotal = sub; reqEl.dataset.deduction = mDed; reqEl.innerText = `${sub - mDed} ج`; }
    const wDiv = document.getElementById('walletDeductionDiv'); const wSpan = document.getElementById('modalWalletDeduction');
    if (wDiv && wSpan) { if (mDed > 0) { wSpan.innerText = `-${mDed} ج`; wDiv.classList.remove('hidden'); } else { wDiv.classList.add('hidden'); } }
};

window.showCheckoutModal = () => {
    if (!activeSessionId) return; updateDashboardNumbers();
    safeSet('modalTime', 'innerText', document.getElementById('clientElapsedTime')?.innerText || '00:00');
    safeSet('modalTimeCost', 'innerText', document.getElementById('clientTimeCost')?.innerText || '0 ج');
    safeSet('modalItemsCost', 'innerText', document.getElementById('clientItemsCost')?.innerText || '0 ج');
    setAppliedDiscountVal(0);
    const dIn = document.getElementById('discountCode'); if (dIn) dIn.value = '';
    const dMsg = document.getElementById('discountMsg'); if (dMsg) dMsg.classList.add('hidden');
    const uPhone = myProfile?.phone || (_sessions[activeSessionId]?.phone); const prof = _profiles[uPhone];
    const wallet = prof?.walletBalance || 0;
    const wIn = document.getElementById('walletDeductInput'); if (wIn) { wIn.value = 0; wIn.max = wallet; }
    const wDiv = document.getElementById('manualWalletDiv'); if (wDiv) { if (wallet > 0) wDiv.classList.remove('hidden'); else wDiv.classList.add('hidden'); }
    window.recalcTotal();
    const m = document.getElementById('checkoutModal'); if (m) m.classList.remove('hidden');
};
window.closeCheckoutModal = () => { const m = document.getElementById('checkoutModal'); if (m) m.classList.add('hidden'); };

window.handleWalletInput = (el) => {
    const uPhone = myProfile?.phone || (_sessions[activeSessionId]?.phone); const prof = _profiles[uPhone];
    const maxW = prof?.walletBalance || 0; let val = parseInt(el.value) || 0;
    const sub = parseInt(document.getElementById('modalSubTotal')?.innerText) || 0;
    const err = document.getElementById('walletError');
    if (err) {
        if (val > maxW) { err.innerText = "لا يمكنك تجاوز رصيد محفظتك!"; err.classList.remove('hidden'); el.value = maxW; }
        else if (val > sub) { err.innerText = "لا يمكنك خصم رقم أكبر من الفاتورة!"; err.classList.remove('hidden'); el.value = sub; }
        else err.classList.add('hidden');
    }
    window.recalcTotal();
};

function populateDetailedReceipt(prefix, sessionData) {
    const rStart = new Date(sessionData.startTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const rEnd = new Date(sessionData.endTime || Date.now()).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    safeSet(`${prefix}StartTime`, 'innerText', rStart); safeSet(`${prefix}EndTime`, 'innerText', rEnd);
    const durMs = sessionData.durationMs || (sessionData.endTime ? sessionData.endTime - sessionData.startTime : 0);
    const durH = Math.floor(durMs / 3600000); const durM = Math.floor((durMs % 3600000) / 60000);
    safeSet(`${prefix}Duration`, 'innerText', `${durH}س و ${durM}د`);
    const tCost = calculateGroupAwareTimeCost(durMs, sessionData); const itemsCost = (sessionData.items || []).reduce((a, b) => a + b.price, 0);
    const finalCost = sessionData.finalCost ?? (tCost + itemsCost);
    const totalBefore = tCost + itemsCost; const disc = Math.max(0, totalBefore - finalCost);
    safeSet(`${prefix}Discount`, 'innerText', `${disc} ج`); safeSet(`${prefix}FinalCost`, 'innerText', `${finalCost} ج`);
    // ★ كود الخصم في الفاتورة
    const discCodeRow = document.getElementById(`${prefix}DiscountCodeRow`);
    const discCodeEl = document.getElementById(`${prefix}DiscountCode`);
    if (discCodeRow && discCodeEl) {
        if (sessionData.discountCode) { discCodeEl.innerText = sessionData.discountCode; discCodeRow.classList.remove('hidden'); }
        else discCodeRow.classList.add('hidden');
    }
    // ★ قسمة الأصحاب في الفاتورة
    const groupCount = sessionData.groupCount ? parseInt(sessionData.groupCount) : 1;
    const groupRow = document.getElementById(`${prefix}GroupRow`);
    const groupPP  = document.getElementById(`${prefix}GroupPerPerson`);
    if (groupRow && groupPP) {
        if (groupCount > 1) {
            groupPP.innerText = `${Math.ceil(finalCost / groupCount)} ج (${groupCount} أشخاص)`;
            groupRow.classList.remove('hidden');
        } else groupRow.classList.add('hidden');
    }
    const itemsList = document.getElementById(`${prefix}ItemsList`);
    if (itemsList) {
        if (sessionData.items && sessionData.items.length > 0)
            itemsList.innerHTML = sessionData.items.map(i => `<div class="flex justify-between"><span>${_esc(i.name)}</span><span class="text-hola-orange">${_esc(String(i.price))} ج</span></div>`).join('');
        else itemsList.innerHTML = '<span class="text-gray-400">لا يوجد طلبات</span>';
    }
}

window.forceShowClientReceipt = (sessionData) => {
    clearInterval(timerInterval); setActiveSessionId(null); setSessionItems([]); window.lastCompletedSessionId = sessionData.id;
    // Save phone/name for the receipt review BEFORE clearing profile
    window._lastReceiptPhone = myProfile?.phone || sessionData.phone;
    window._lastReceiptName = myProfile?.name || sessionData.name;
    safeSet('receiptTitle', 'innerText', 'تم إنهاء الجلسة من الإدارة');
    populateDetailedReceipt('receipt', sessionData);
    switchView('public'); document.getElementById('navClient')?.classList.add('hidden'); setMyProfile(null);
    const loginPh = document.getElementById('loginPhone'); if (loginPh) loginPh.value = '';
    playAlertSound('high'); document.getElementById('clientReceiptModal')?.classList.remove('hidden');
};

window.confirmCheckout = async () => {
    try {
        if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
        if (!activeSessionId) return showMsg("لا توجد جلسة نشطة", "error");
        const session = _sessions[activeSessionId]; if (!session) return showMsg("خطأ في بيانات الجلسة", "error");
        const sPhone = session.phone; const sName = session.name;
        const reqEl = document.getElementById('modalFinalRequired'); const ded = reqEl ? parseInt(reqEl.dataset.deduction) : 0; const fin = reqEl ? parseInt(reqEl.innerText) : 0;
        const dMs = Date.now() - session.startTime; window.lastCompletedSessionId = activeSessionId;
        // Save for receipt review
        window._lastReceiptPhone = sPhone; window._lastReceiptName = sName;
        const recData = { status: 'completed', endTime: Date.now(), finalCost: fin, durationMs: dMs, shiftAdmin: currentShiftAdmin, items: sessionItems || session.items, startTime: session.startTime, name: sName, phone: sPhone, id: activeSessionId };
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', activeSessionId), { status: 'completed', endTime: Date.now(), finalCost: fin, durationMs: dMs, shiftAdmin: currentShiftAdmin });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), { phone: sPhone, itemName: `طلب الحساب (مطلوب: ${fin} ج)`, status: 'pending', timestamp: Date.now() });
        logOperation(db, appId, currentShiftAdmin, 'إنهاء جلسة (عميل)', `العميل ${sPhone} أنهى جلسته بقيمة ${fin}ج`);
        const prof = _profiles[sPhone];
        if (prof && ded > 0) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', sPhone), { walletBalance: (prof.walletBalance || 0) - ded });
        const discEl = document.getElementById('discountCode');
        const aId = discEl?.dataset.appliedId;
        const aCode = discEl?.value?.trim() || discEl?.dataset.appliedCode || '';
        if (aId) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'discounts', aId), { isUsed: true, usedBy: sPhone, usedAt: Date.now() });
            // ★ حفظ كود الخصم في الجلسة لعرضه في الفاتورة
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', activeSessionId), { discountCode: aCode });
        }
        // Deduct from subscription if active
        await window.deductSubscriptionDay(sPhone);
        clearInterval(timerInterval); setActiveSessionId(null); setSessionItems([]); window.closeCheckoutModal();
        safeSet('receiptTitle', 'innerText', 'تم إنهاء الجلسة بنجاح');
        populateDetailedReceipt('receipt', recData);
        document.getElementById('clientReceiptModal')?.classList.remove('hidden');
    } catch (e) { console.error("Checkout Error:", e); showMsg("خطأ أثناء إنهاء الجلسة. حاول مرة أخرى.", "error"); }
};

window.deductSubscriptionDay = async (phone) => {
    if (!db) return;
    const activeSub = Object.values(_subscriptions).find(s => s.phone === phone && s.status === 'active' && (s.daysLeft || 0) > 0);
    if (!activeSub) return;
    const today = new Date().toLocaleDateString('ar-EG');
    if (activeSub.lastUsedDate === today) return; // Already used today
    const newDays = Math.max(0, (activeSub.daysLeft || 0) - 1);
    const newStatus = newDays <= 0 ? 'expired' : 'active';
    // ★ حساب الأيام المستخدمة الفعلية
    const totalAllowed = activeSub.allowedDays || activeSub.planDays || 30;
    const usedDays = Math.max(0, totalAllowed - newDays);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', activeSub.id), {
        daysLeft: newDays,
        status: newStatus,
        lastUsedDate: today,
        usedDays: usedDays  // ★ حفظ الأيام المستخدمة صراحةً
    });
    if (newStatus === 'expired') {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
            phone,
            msg: `⏰ انتهى اشتراكك يا صديقي!\nاشتريت باقتك واستخدمت كل أيامها بنجاح 🎉\nجدد اشتراكك للاستمرار!`,
            type: 'high', isRead: false, timestamp: Date.now()
        });
    } else if (newDays <= 3) {
        // تنبيه اقتراب الانتهاء
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
            phone,
            msg: `⚠️ تنبيه: باقتك بتخلص!\nمتبقي لك ${newDays} أيام فقط.\nجدد بدري عشان ما تقطعش! ⚡`,
            type: 'normal', isRead: false, timestamp: Date.now()
        });
    }
};

window.toggleVfPay = () => {
    const el = document.getElementById('vfPayDetails');
    if (el) {
        if (el.classList.contains('hidden')) { el.classList.remove('hidden'); el.classList.add('animate-pulse'); setTimeout(() => el.classList.remove('animate-pulse'), 1000); }
        else { el.classList.add('hidden'); }
    }
};
window.openInstapay = () => {
    if (sysSettings.instapayLink) window.location.href = sysSettings.instapayLink;
    else showMsg("رابط إنستا باي غير متوفر حالياً", "error");
};
window.closeReceiptModal = () => {
    document.getElementById('clientReceiptModal')?.classList.add('hidden'); switchView('public');
    document.getElementById('navPublic')?.classList.remove('hidden'); document.getElementById('navClient')?.classList.add('hidden');
    setMyProfile(null); const l = document.getElementById('loginPhone'); if (l) l.value = '';
};

// ─── Guest Session (Admin Quick Register) ────────────────────────────────────
window._guestCounter = 0;
window.startGuestSession = async () => {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    // ★ سؤال عدد الأشخاص
    const countStr = prompt('هل الضيف وحده؟\nأدخل العدد الإجمالي (1 = وحده، 2+ = معه آخرون):', '1');
    if (countStr === null) return; // ألغى
    const groupCount = Math.max(1, parseInt(countStr) || 1);
    window._guestCounter++;
    const guestNum = window._guestCounter;
    const guestName = `ضيف ${guestNum}`;
    const guestPhone = `guest_${Date.now()}_${guestNum}`;
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', guestPhone), {
            name: guestName, phone: guestPhone, isGuest: true,
            stamps: [], walletBalance: 0, firstVisit: true, createdAt: Date.now()
        });
        const sessionRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'sessions'), {
            name: guestName, phone: guestPhone, isGuest: true,
            startTime: Date.now(), status: 'active',
            shiftAdmin: currentShiftAdmin || 'الإدارة',
            groupCount: groupCount,
            groupNote: groupCount > 1 ? `مجموعة: ${groupCount} أشخاص` : '',
            items: [], createdAt: Date.now()
        });
        logOperation(db, appId, currentShiftAdmin || 'الإدارة', 'بدء جلسة ضيف', `${guestName}${groupCount > 1 ? ` (${groupCount} أشخاص)` : ''}`);
        showMsg(`✅ تم بدء جلسة ${guestName}${groupCount > 1 ? ` — ${groupCount} أشخاص` : ''}`, "success");
        playAlertSound('normal');
    } catch(e) { console.error(e); showMsg("خطأ في إنشاء جلسة الضيف", "error"); }
};

// ─── Drinks Question Before Checkout ─────────────────────────────────────────
// Override showCheckoutModal to show drinks question first
const _origShowCheckoutModal = window.showCheckoutModal;
window.showCheckoutModal = () => {
    // Check if session has free drink available
    if (!activeSessionId) return;
    const sPhone = myProfile?.phone || _sessions[activeSessionId]?.phone;
    const prof = _profiles[sPhone];
    const hasFreeDrink = sysSettings.freeDrinkEnabled &&
        ((sysSettings.freeDrinkMode === 'every_session') ||
         (sysSettings.freeDrinkMode !== 'every_session' && prof?.firstVisit));
    // Show free drink notice
    const fdNotice = document.getElementById('freeDrinkNotice');
    if (fdNotice) fdNotice.classList.toggle('hidden', !hasFreeDrink);
    window._hasFreedrinkCheckout = hasFreeDrink;
    document.getElementById('drinksQuestionModal')?.classList.remove('hidden');
};

// ★ قائمة المشروبات المحسَّنة: تظهر غير المتوفر + كميات + الطلبات السابقة
window._drinksAnswer = function(hasDrinks) {
    document.getElementById('drinksQuestionModal')?.classList.add('hidden');
    if (!hasDrinks) { _showRealCheckout(); return; }
    const grid = document.getElementById('drinksSelectGrid');
    if (!grid) { _showRealCheckout(); return; }
    const menuItems = Object.values(_menu || {}).filter(i => i.type === 'drink' || !i.type);
    if (menuItems.length === 0) { _showRealCheckout(); return; }
    // طلبات الجلسة المسجّلة مسبقاً
    const alreadyOrdered = (sessionItems || []).reduce((acc, item) => {
        acc[item.name] = (acc[item.name] || 0) + 1; return acc;
    }, {});
    window._selectedExtraDrinks = [];
    function rebuildGrid() {
        grid.innerHTML = menuItems.map(item => {
            const unavail = item.unavailable === true;
            const sel = (window._selectedExtraDrinks||[]).find(d => d.id === item.id);
            const qty = sel ? sel.qty : 0;
            const prev = alreadyOrdered[item.name] || 0;
            const n = (item.name||'').replace(/'/g,"\'");
            if (unavail) return `<div class="flex flex-col items-center gap-1 p-3 rounded-2xl border-2 border-gray-200 bg-gray-50 opacity-60 relative">
                <span class="absolute -top-2 -right-2 bg-gray-400 text-white text-[9px] px-2 py-0.5 rounded-full font-black shadow">غير متوفر</span>
                <i class="fa-solid ${item.icon||'fa-mug-hot'} text-2xl text-gray-400"></i>
                <span class="text-xs font-black text-gray-400 line-through">${item.name}</span>
                <span class="text-xs text-gray-400">${item.price} ج</span>
            </div>`;
            return `<div class="flex flex-col items-center gap-1 p-3 rounded-2xl border-2 ${qty>0?'border-hola-orange bg-orange-50':'border-gray-200 bg-white'} transition relative">
                ${prev>0?`<span class="absolute -top-2 -right-2 bg-blue-500 text-white text-[9px] px-2 py-0.5 rounded-full font-black shadow">طلبت ${prev}</span>`:''}
                <i class="fa-solid ${item.icon||'fa-mug-hot'} text-2xl ${qty>0?'text-hola-orange':'text-hola-purple'}"></i>
                <span class="text-xs font-black text-gray-700">${item.name}</span>
                <span class="text-xs font-black text-hola-orange">${item.price} ج</span>
                <div class="flex items-center gap-2 mt-1">
                    <button onclick="window._drinkQtyChange('${item.id}','${n}',${item.price},-1)"
                        class="w-7 h-7 rounded-full font-black text-sm flex items-center justify-center transition ${qty>0?'bg-hola-orange text-white hover:bg-orange-600':'bg-gray-100 text-gray-400'}">−</button>
                    <span class="font-black text-sm w-5 text-center">${qty}</span>
                    <button onclick="window._drinkQtyChange('${item.id}','${n}',${item.price},1)"
                        class="w-7 h-7 rounded-full bg-hola-purple text-white font-black text-sm flex items-center justify-center hover:bg-hola-dark transition">+</button>
                </div>
            </div>`;
        }).join('');
    }
    window._drinkQtyChange = function(id, name, price, delta) {
        if (!window._selectedExtraDrinks) window._selectedExtraDrinks = [];
        const idx = window._selectedExtraDrinks.findIndex(d => d.id === id);
        if (idx >= 0) {
            window._selectedExtraDrinks[idx].qty = Math.max(0, window._selectedExtraDrinks[idx].qty + delta);
            if (window._selectedExtraDrinks[idx].qty === 0) window._selectedExtraDrinks.splice(idx, 1);
        } else if (delta > 0) {
            window._selectedExtraDrinks.push({ id, name, price, qty: 1 });
        }
        rebuildGrid();
        window._updateDrinksSummary();
    };
    rebuildGrid();
    window._updateDrinksSummary();
    document.getElementById('selectDrinksModal')?.classList.remove('hidden');
};

window._updateDrinksSummary = function() {
    const sel = window._selectedExtraDrinks || [];
    const sumDiv = document.getElementById('drinksSelectedSummary');
    const listEl = document.getElementById('drinksSelectedList');
    const totalEl = document.getElementById('drinksSelectedTotal');
    if (!sumDiv) return;
    if (sel.length === 0) { sumDiv.classList.add('hidden'); return; }
    sumDiv.classList.remove('hidden');
    let total = sel.reduce((s, d) => s + d.price * d.qty, 0);
    if (window._hasFreedrinkCheckout && sel.length > 0) {
        const cheapest = Math.min(...sel.map(d => d.price));
        total = Math.max(0, total - cheapest);
    }
    if (listEl) listEl.innerHTML = sel.map(d =>
        `<div class="flex justify-between text-xs items-center">
            <span>${d.name} × ${d.qty}</span>
            <span class="font-black text-hola-orange">${d.price * d.qty} ج</span>
        </div>`
    ).join('');
    if (totalEl) totalEl.textContent = total + ' ج';
};

window._closeDrinksSelect = function() {
    document.getElementById('selectDrinksModal')?.classList.add('hidden');
    _showRealCheckout();
};

window._confirmDrinksAndCheckout = async function() {
    const sel = window._selectedExtraDrinks || [];
    if (sel.length > 0 && activeSessionId && db) {
        let freeUsed = false;
        // توسيع الكميات: كل قطعة تصبح item منفصل
        const itemsToAdd = sel.flatMap(d => {
            const arr = [];
            for (let q = 0; q < d.qty; q++) {
                let price = d.price;
                if (window._hasFreedrinkCheckout && !freeUsed) { price = 0; freeUsed = true; }
                arr.push({ id: d.id, name: d.name, price });
            }
            return arr;
        });
        try {
            const existing = sessionItems || [];
            const newItems = [...existing, ...itemsToAdd];
            setSessionItems(newItems);
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', activeSessionId), { items: newItems });
        } catch(e) { console.error(e); }
    }
    document.getElementById('selectDrinksModal')?.classList.add('hidden');
    _showRealCheckout();
};

function _showRealCheckout() {
    if (!activeSessionId) return;
    updateDashboardNumbers();
    safeSet('modalTime', 'innerText', document.getElementById('clientElapsedTime')?.innerText || '00:00');
    safeSet('modalTimeCost', 'innerText', document.getElementById('clientTimeCost')?.innerText || '0 ج');
    safeSet('modalItemsCost', 'innerText', document.getElementById('clientItemsCost')?.innerText || '0 ج');
    setAppliedDiscountVal(0);
    const dIn = document.getElementById('discountCode'); if (dIn) dIn.value = '';
    const dMsg = document.getElementById('discountMsg'); if (dMsg) dMsg.classList.add('hidden');
    const uPhone = myProfile?.phone || (_sessions[activeSessionId]?.phone); const prof = _profiles[uPhone];
    const wallet = prof?.walletBalance || 0;
    const wIn = document.getElementById('walletDeductInput'); if (wIn) { wIn.value = 0; wIn.max = wallet; }
    const wDiv = document.getElementById('manualWalletDiv'); if (wDiv) { if (wallet > 0) wDiv.classList.remove('hidden'); else wDiv.classList.add('hidden'); }
    window.recalcTotal();
    // ★ قسمة الأصحاب في الفاتورة
    const sess = _sessions[activeSessionId];
    const groupCount = sess?.groupCount ? parseInt(sess.groupCount) : 1;
    const splitDiv = document.getElementById('checkoutSplitDiv');
    const splitCount = document.getElementById('checkoutSplitCount');
    const splitPP = document.getElementById('checkoutSplitPerPerson');
    if (splitDiv && groupCount > 1) {
        const totalCostEl = document.getElementById('clientTotalCost');
        const total = parseInt(totalCostEl?.innerText || totalCostEl?.textContent || '0') || 0;
        const perPerson = Math.ceil(total / groupCount);
        if (splitCount) splitCount.textContent = '(' + groupCount + ' أشخاص)';
        if (splitPP) splitPP.textContent = perPerson + ' ج';
        splitDiv.classList.remove('hidden');
    } else if (splitDiv) {
        splitDiv.classList.add('hidden');
    }
    document.getElementById('checkoutModal')?.classList.remove('hidden');
}


window.openAdminLiveSession = (id) => {
    const s = _sessions[id]; if (!s) return;
    window._currentLiveSesId = id;
    safeSet('liveSesName', 'innerText', s.name); safeSet('liveSesPhone', 'innerText', s.phone);
    const el = document.getElementById('liveSesElapsed'); if (el) el.dataset.start = s.startTime;
    // ★ تعيين وقت البدء في حقل التعديل
    const startInput = document.getElementById('liveSesStartTimeEdit');
    if (startInput) {
        const d = new Date(s.startTime);
        const pad = n => String(n).padStart(2,'0');
        startInput.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    const l = document.getElementById('liveSesItemsList');
    if (l) {
        if (!s.items || s.items.length === 0) l.innerHTML = '<p class="text-xs text-gray-400">لا يوجد طلبات.</p>';
        else l.innerHTML = s.items.map((i, idx) =>
            `<div class="flex justify-between items-center bg-gray-50 border p-2 rounded">
                <span class="text-xs font-bold">${i.name} <span class="text-hola-orange ml-1">${i.price}ج</span></span>
                <button onclick="window.removeSessionItem('${id}', ${idx})" class="text-red-500 hover:text-red-700 bg-red-50 w-6 h-6 rounded-full"><i class="fa-solid fa-trash text-xs"></i></button>
            </div>`
        ).join('');
    }
        const dMs = Date.now() - s.startTime; const tC = calculateGroupAwareTimeCost(dMs, s); const iC = (s.items || []).reduce((su, i) => su + i.price, 0);
    safeSet('liveSesTimeCost', 'innerText', `${tC} ج`); safeSet('liveSesItemsCost', 'innerText', `${iC} ج`); safeSet('liveSesTotal', 'innerText', `${tC + iC} ج`);
    const btn = document.getElementById('liveSesEndBtn'); if (btn) btn.onclick = () => window.adminEndSession(id);
    document.getElementById('adminLiveSessionModal')?.classList.remove('hidden');
};

// ★ تعديل وقت بدء الجلسة النشطة من الإدارة
window.adminUpdateSessionStartTime = async (sid) => {
    if (!db) return;
    const s = _sessions[sid]; if (!s) return;
    const inp = document.getElementById('liveSesStartTimeEdit');
    if (!inp || !inp.value) return showMsg('اختر وقت البدء أولاً','error');
    const newStart = new Date(inp.value).getTime();
    if (isNaN(newStart)) return showMsg('وقت غير صحيح','error');
    if (newStart > Date.now()) return showMsg('لا يمكن أن يكون وقت البدء في المستقبل','error');
    await updateDoc(doc(db,'artifacts',appId,'public','data','sessions',sid),{startTime:newStart});
    showMsg('✅ تم تعديل وقت البدء','success');
    logOperation(db,appId,currentShiftAdmin,'تعديل وقت بدء','جلسة '+s.phone+' → '+new Date(newStart).toLocaleTimeString('ar-EG'));
    window.openAdminLiveSession(sid);
};

window.removeSessionItem = async (sid, idx) => {
    if (!db) return;
    const s = _sessions[sid]; if (!s) return; const arr = [...s.items]; const rem = arr.splice(idx, 1)[0];
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', sid), { items: arr });
    showMsg(`تم حذف ${rem.name}`, "success"); logOperation(db, appId, currentShiftAdmin, 'حذف طلب', `حذف ${rem.name} من جلسة ${s.phone}`);
    if (!document.getElementById('adminLiveSessionModal')?.classList.contains('hidden')) window.openAdminLiveSession(sid);
};

window.adminEndSession = async (sid) => {
    if (!db) return;
    const s = _sessions[sid]; if (!s) return;
    const dMs = Date.now() - s.startTime; const tC = calculateGroupAwareTimeCost(dMs, s); const iC = (s.items || []).reduce((su, i) => su + i.price, 0); const sub = tC + iC;
    const prof = _profiles[s.phone]; let ded = 0; if (prof && prof.walletBalance > 0) ded = Math.min(prof.walletBalance, sub);
    const fin = sub - ded;
    window.lastAdminCompletedSessionId = sid; window.currentPaymentSessionId = sid;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', sid), { status: 'completed', endTime: Date.now(), finalCost: fin, durationMs: dMs, shiftAdmin: currentShiftAdmin });
    if (ded > 0) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', s.phone), { walletBalance: prof.walletBalance - ded });
    await window.deductSubscriptionDay(s.phone);
    logOperation(db, appId, currentShiftAdmin, 'إنهاء جلسة (إدارة)', `الإدارة أنهت جلسة ${s.phone} بصافي ${fin}ج`);
    document.getElementById('adminLiveSessionModal')?.classList.add('hidden');
    safeSet('adminRecName', 'innerText', s.name || s.phone);
    safeSet('adminRecStart', 'innerText', new Date(s.startTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    safeSet('adminRecEnd', 'innerText', new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    safeSet('adminRecDuration', 'innerText', `${Math.floor(dMs / 3600000)}س و ${Math.floor((dMs % 3600000) / 60000)}د`);
    const itemsHtml = (s.items && s.items.length > 0) ? s.items.map(i => `<div class="flex justify-between"><span>${_esc(i.name)}</span><span class="text-hola-orange">${i.price} ج</span></div>`).join('') : '<span class="text-gray-400">لا يوجد طلبات</span>';
    document.getElementById('adminRecItems').innerHTML = itemsHtml;
    safeSet('adminReceiptFinalCost', 'innerText', `${fin} ج.م`);
    document.getElementById('adminReceiptModal')?.classList.remove('hidden');
    showMsg("تم إنهاء الجلسة وإرسالها للعميل", "success");
};

// ★ استئناف جلسة مكتملة
window.resumeCompletedSession = async (sid) => {
    if (!db) return showMsg("غير متصل","error");
    const s = _sessions[sid]; if (!s) return;
    if (!confirm(`استئناف جلسة ${s.name || s.phone}؟ سيتم فتحها كجلسة نشطة جديدة.`)) return;
    const newStart = s.startTime || Date.now(); // محافظة على وقت البدء الأصلي
    await updateDoc(doc(db,'artifacts',appId,'public','data','sessions',sid),{
        status:'active', endTime:null, finalCost:null, durationMs:null,
        startTime: newStart, resumedAt: Date.now()
    });
    logOperation(db,appId,currentShiftAdmin,'استئناف جلسة',`استئناف جلسة ${s.phone}`);
    showMsg(`✅ تم استئناف جلسة ${s.name || s.phone}`,'success');
};

window.openPaymentMethodModal = (sid) => {
    window.currentPaymentSessionId = sid;
    document.getElementById('payRefDiv')?.classList.add('hidden');
    document.getElementById('paymentMethodModal')?.classList.remove('hidden');
};
window.setPayment = async (type) => {
    if (!db) return; window.currentPaymentType = type;
    if (type === 'كاش') {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', window.currentPaymentSessionId), { paymentMethod: 'كاش' });
        document.getElementById('paymentMethodModal')?.classList.add('hidden'); document.getElementById('adminReceiptModal')?.classList.add('hidden');
        showMsg("تم تسجيل الدفع كاش", "success");
    } else { document.getElementById('payRefDiv')?.classList.remove('hidden'); }
};
window.confirmPaymentMethod = async () => {
    if (!db) return;
    const ref = document.getElementById('payRefInput')?.value.trim();
    if (!ref) return showMsg("أدخل رقم المحفظة / الحساب", "error");
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', window.currentPaymentSessionId), { paymentMethod: window.currentPaymentType, paymentRef: ref });
    document.getElementById('paymentMethodModal')?.classList.add('hidden'); document.getElementById('adminReceiptModal')?.classList.add('hidden');
    const inpt = document.getElementById('payRefInput'); if (inpt) inpt.value = '';
    showMsg("تم تسجيل الدفع الإلكتروني بنجاح", "success");
};

window.markOrderDone = async (id) => { if (db) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', id), { status: 'completed' }); };
window.markMultipleOrdersDone = async (idsStr) => {
    if (!idsStr || !db) return;
    const ids = idsStr.split(',');
    for (let id of ids) { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', id), { status: 'completed' }); }
};

// ─── Event Multi-Slot System ──────────────────────────────────────────────────
window.switchEventSlot = (slot) => {
    window._currentEvSlot = slot;
    document.querySelectorAll('.ev-slot-btn').forEach((btn, i) => {
        if (i + 1 === slot) { btn.classList.add('bg-hola-purple', 'text-white', 'shadow'); btn.classList.remove('bg-gray-100', 'text-gray-600'); }
        else { btn.classList.remove('bg-hola-purple', 'text-white', 'shadow'); btn.classList.add('bg-gray-100', 'text-gray-600'); }
    });
    safeSet('currentEvSlotLabel', 'innerText', `(${slot})`);
    // Load the current slot data
    const prefix = slot === 1 ? '' : `ev${slot}_`;
    const key = (k) => slot === 1 ? k : `ev${slot}_${k}`;
    safeSet('setEvTitle', 'value', sysSettings[key('evTitle')] || '');
    safeSet('setEvDesc', 'value', sysSettings[key('evDesc')] || '');
    safeSet('setEvImg', 'value', sysSettings[key('evImg')] || '');
    safeSet('setEvEmbed', 'value', sysSettings[key('evEmbed')] || '');
    const evTimeRaw = sysSettings[key('evTime')] || '';
    // Try to parse date and time from stored value
    try {
        if (evTimeRaw.includes('T') || evTimeRaw.match(/\d{4}-\d{2}-\d{2}/)) {
            // It's stored as structured data
            const parts = sysSettings[key('evTimeParsed')] || {};
            safeSet('setEvDate', 'value', parts.date || '');
            safeSet('setEvTimeFrom', 'value', parts.from || '');
            safeSet('setEvTimeTo', 'value', parts.to || '');
        }
    } catch(e) {}
    const chk = document.getElementById('setEvActive');
    if (chk) chk.checked = sysSettings[key('evActive')] || false;
};

window.saveEventSettings = async () => {
    if (!db) return;
    const slot = window._currentEvSlot || 1;
    const key = (k) => slot === 1 ? k : `ev${slot}_${k}`;
    const t = document.getElementById('setEvTitle')?.value.trim() || "";
    const d = document.getElementById('setEvDesc')?.value.trim() || "";
    const img = document.getElementById('setEvImg')?.value.trim() || "";
    const embedCode = document.getElementById('setEvEmbed')?.value.trim() || "";
    const c = document.getElementById('setEvActive')?.checked || false;
    const evDate = document.getElementById('setEvDate')?.value || "";
    const evFrom = document.getElementById('setEvTimeFrom')?.value || "";
    const evTo = document.getElementById('setEvTimeTo')?.value || "";
    // Build human readable time
    let tmDisplay = '';
    if (evDate) {
        const dateObj = new Date(evDate);
        const dayName = dateObj.toLocaleDateString('ar-EG', { weekday: 'long' });
        const dateStr = dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
        tmDisplay = `${dayName} ${dateStr}`;
        if (evFrom) tmDisplay += ` من ${evFrom}`;
        if (evTo) tmDisplay += ` إلى ${evTo}`;
    }
    const updateData = {
        [key('evTitle')]: t, [key('evDesc')]: d, [key('evTime')]: tmDisplay, [key('evImg')]: img,
        [key('evEmbed')]: embedCode, [key('evActive')]: c,
        [key('evTimeParsed')]: { date: evDate, from: evFrom, to: evTo }
    };
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), updateData);
    showMsg(`تم حفظ ونشر الفعالية ${slot}`, "success");
};

// ─── Event Share System ───────────────────────────────────────────────────────
window.shareEventLink = () => {
    const slot = window._currentEvSlot || 1;
    const key = (k) => slot === 1 ? k : `ev${slot}_${k}`;
    const title = sysSettings[key('evTitle')] || 'فعالية Hola Workspace';
    const desc = sysSettings[key('evDesc')] || '';
    const time = sysSettings[key('evTime')] || '';
    const fbPage = sysSettings.fbPageLink || 'https://www.facebook.com/HolaWorkspace';
    const waNum = sysSettings.whatsappNum || '';
    // Generate landing URL with event slot param
    const baseUrl = window.location.href.split('?')[0];
    const eventUrl = `${baseUrl}?ev=${slot}`;
    const shareText = `🎉 ${title}\n📅 ${time}\n\n${desc}\n\n📍 Hola Workspace\n🔗 ${eventUrl}${waNum ? `\n📱 واتساب: wa.me/${waNum}` : ''}`;
    document.getElementById('shareModalTitle').innerText = title;
    document.getElementById('shareModalDesc').innerText = time;
    document.getElementById('shareEventUrl').innerText = eventUrl;
    const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(eventUrl)}&quote=${encodeURIComponent(shareText)}`;
    document.getElementById('shareFbBtn').onclick = () => window.open(fbShareUrl, '_blank');
    window._shareEventText = shareText;
    document.getElementById('eventShareModal')?.classList.remove('hidden');
};

window.copyEventLink = () => {
    const slot = window._currentEvSlot || 1;
    const key = (k) => slot === 1 ? k : `ev${slot}_${k}`;
    const title = sysSettings[key('evTitle')] || 'فعالية Hola Workspace';
    const time = sysSettings[key('evTime')] || '';
    const fbPage = sysSettings.fbPageLink || 'https://www.facebook.com/HolaWorkspace';
    const waNum = sysSettings.whatsappNum || '';
    const eventUrl = window.location.href.split('?')[0];
    const text = `🎉 ${title}\n📅 ${time}\n📍 Hola Workspace\n🔗 ${fbPage}${waNum ? `\n📱 واتساب: wa.me/${waNum}` : ''}\n\n${eventUrl}`;
    copyToClipboard(text);
};

window.shareEventWhatsapp = () => {
    window.shareEventLink();
    setTimeout(() => window.doShareWhatsapp(), 200);
};

window.doShareWhatsapp = () => {
    const text = window._shareEventText || 'تفقد فعالية Hola Workspace!';
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
};

window.copyShareLink = () => { copyToClipboard(window._shareEventText || window.location.href); };

// Share from client event banner
window.shareClientEvent = (slot = 1) => {
    window._currentEvSlot = slot;
    window.shareEventLink();
};

// ─── Quick Booking (Login Screen - 2x per device per day) ────────────────────
window.showQuickBookModal = () => {
    const today = new Date().toLocaleDateString('ar-EG');
    const key = `hola_quickbook_${today}`;
    const count = parseInt(localStorage.getItem(key) || '0');
    if (count >= 2) {
        showMsg("لقد استخدمت هذا الخيار مرتين اليوم. حاول غداً أو استخدم الحجز المسبق.", "error");
        return;
    }
    document.getElementById('quickBookModal')?.classList.remove('hidden');
};

window.submitQuickBook = async () => {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    const phone = document.getElementById('quickBookPhone')?.value.trim();
    const type = document.getElementById('quickBookType')?.value;
    const note = document.getElementById('quickBookNote')?.value.trim() || '';
    if (!phone || phone.length < 10) return showMsg("أدخل رقم هاتف صحيح", "error");
    const today = new Date().toLocaleDateString('ar-EG');
    const key = `hola_quickbook_${today}`;
    const count = parseInt(localStorage.getItem(key) || '0');
    if (count >= 2) return showMsg("وصلت للحد الأقصى (2 مرات يومياً)", "error");
    try {
        const typeLabel = type === 'room' ? 'حجز غرفة خاصة' : 'حجز مقعد عادي';
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), {
            name: `حجز سريع (${phone})`, phone, type: typeLabel, note,
            expectedTime: 'سيتم التنسيق', status: 'pending', isQuickBook: true, createdAt: Date.now()
        });
        localStorage.setItem(key, String(count + 1));
        document.getElementById('quickBookModal').innerHTML = `
            <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border-t-8 border-green-500">
                <div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-4"><i class="fa-solid fa-check-double"></i></div>
                <h3 class="text-xl font-black text-hola-purple mb-3">تم استلام حجزك!</h3>
                <p class="text-gray-600 font-bold leading-relaxed text-sm">سنقوم بالتواصل معك على رقم <span class="text-hola-purple font-black">${phone}</span> قريباً لتأكيد الحجز.</p>
                <p class="text-[10px] text-gray-400 mt-2">متبقي لك ${1 - count} حجز سريع اليوم</p>
                <button onclick="document.getElementById('quickBookModal').classList.add('hidden');location.reload();" class="mt-6 text-hola-orange font-bold text-sm hover:underline">إغلاق</button>
            </div>`;
        playAlertSound('congrats');
    } catch (e) { showMsg("حدث خطأ أثناء الحجز", "error"); }
};

// ─── Room Booking from Client Panel ──────────────────────────────────────────
window.submitRoomBooking = async () => {
    if (!db || !myProfile) return;
    const phone = document.getElementById('roomBookPhone')?.value.trim() || myProfile.phone;
    const note = document.getElementById('roomBookNote')?.value.trim() || '';
    if (!phone) return showMsg("أدخل رقم هاتفك", "error");
    // Only one pending room request allowed
    const existingPendingRoom = Object.values(_prebookings).find(b =>
        b.phone === myProfile.phone && b.status === 'pending' && b.type === 'حجز غرفة خاصة'
    );
    if (existingPendingRoom) return showMsg("لديك طلب حجز غرفة معلق بالفعل. انتظر رد الإدارة.", "error");
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), {
            name: `${myProfile.name} (حجز غرفة)`, phone, note,
            expectedTime: 'سيتم التنسيق', status: 'pending', type: 'حجز غرفة خاصة', createdAt: Date.now()
        });
        showMsg("تم إرسال طلب حجز الغرفة! سنتواصل معك للتأكيد 🎉", "success");
        const np = document.getElementById('roomBookPhone'); if (np) np.value = '';
        const nn = document.getElementById('roomBookNote'); if (nn) nn.value = '';
    } catch (e) { showMsg("حدث خطأ", "error"); }
};

window.submitRoomWaitlist = async () => {
    if (!db) return;
    const phone = document.getElementById('roomWaitPhone')?.value.trim();
    if (!phone || phone.length < 10) return showMsg("أدخل رقم هاتف صحيح", "error");
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), {
            name: `قائمة انتظار (${phone})`, phone,
            expectedTime: 'قائمة انتظار الغرف', status: 'pending', type: 'قائمة انتظار غرف', createdAt: Date.now()
        });
        showMsg("تم إضافتك لقائمة الانتظار! سنتواصل معك عند توفر مكان.", "success");
    } catch (e) { showMsg("حدث خطأ", "error"); }
};

// ─── Bio Page Settings ────────────────────────────────────────────────────────
window.saveBioSettings = async () => {
    if (!db) return showMsg("غير متصل", "error");
    const S = window.sysSettings || {};
    const bioAboutUs = document.getElementById('setBioAboutUs')?.value.trim() || S.bioAboutUs || '';
    const venueName = document.getElementById('setBioVenueName')?.value.trim() || S.venueName || '';
    const venueTagline = document.getElementById('setBioTagline')?.value.trim() || S.venueTagline || '';
    const bioLinks = S.bioLinks || [];
    // Collect bioNavButtons from editor
    const bioNavButtons = [];
    for (let i = 1; i <= 3; i++) {
        const label = document.getElementById(`bioNavBtn${i}EditLabel`)?.value.trim();
        const url   = document.getElementById(`bioNavBtn${i}EditUrl`)?.value.trim();
        const icon  = document.getElementById(`bioNavBtn${i}EditIcon`)?.value.trim();
        if (label || url) bioNavButtons.push({ label: label || '', url: url || '#', icon: icon || 'fa-solid fa-link' });
    }
    // Always include bioNavButtons (use existing if editor returned nothing)
    const finalNavBtns = bioNavButtons.length ? bioNavButtons : (S.bioNavButtons || []);
    try {
        const updateData = { bioAboutUs, venueName, venueTagline, bioLinks, bioNavButtons: finalNavBtns };
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), updateData);
        Object.assign(window.sysSettings, updateData);
        showMsg("✅ تم حفظ إعدادات Bio", "success");
        if (window._renderBioNavBtnsEditor) window._renderBioNavBtnsEditor();
    } catch(e) { showMsg("خطأ في الحفظ", "error"); console.error(e); }
};

window._addBioLink = async () => {
    if (!db) return;
    const type = document.getElementById('newBioLinkType')?.value || 'other';
    const label = document.getElementById('newBioLinkLabel')?.value.trim() || '';
    const url = document.getElementById('newBioLinkUrl')?.value.trim() || '';
    if (!url) return showMsg("أدخل الرابط", "error");
    const S = window.sysSettings || {};
    const links = [...(S.bioLinks || []), { type, label: label || type, url, id: Date.now() }];
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), { bioLinks: links });
        Object.assign(window.sysSettings, { bioLinks: links });
        const u = document.getElementById('newBioLinkUrl'); if (u) u.value = '';
        const l = document.getElementById('newBioLinkLabel'); if (l) l.value = '';
        window._renderBioLinksManager();
        showMsg("✅ تم إضافة الرابط", "success");
    } catch(e) { showMsg("خطأ", "error"); }
};

window._deleteBioLink = async (id) => {
    if (!db) return;
    const S = window.sysSettings || {};
    const links = (S.bioLinks || []).filter(l => l.id !== id);
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), { bioLinks: links });
        Object.assign(window.sysSettings, { bioLinks: links });
        window._renderBioLinksManager();
    } catch(e) { showMsg("خطأ في الحذف", "error"); }
};

window._renderBioLinksManager = () => {
    const mgr = document.getElementById('bioLinksManager'); if (!mgr) return;
    const links = (window.sysSettings || {}).bioLinks || [];
    if (links.length === 0) { mgr.innerHTML = '<p class="text-xs text-gray-400 text-center py-2 font-bold">لا توجد روابط بعد</p>'; return; }
    const iconMap = { whatsapp: '💚', facebook: '💙', instagram: '💗', tiktok: '🖤', youtube: '❤️', website: '🌐', phone: '📞', location: '📍', other: '🔗' };
    mgr.innerHTML = links.map(l => `
        <div class="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-gray-100 shadow-sm">
            <span class="text-lg">${iconMap[l.type]||'🔗'}</span>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-black text-gray-700">${l.label||l.type}</p>
                <p class="text-[10px] font-mono text-gray-400 truncate">${l.url||''}</p>
            </div>
            <button onclick="window._deleteBioLink(${l.id})" class="w-6 h-6 bg-red-50 text-red-400 hover:bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <i class="fa-solid fa-xmark text-xs"></i>
            </button>
        </div>`).join('');
};

window._renderBioNavBtnsEditor = () => {
    const editor = document.getElementById('bioNavBtnsEditor'); if (!editor) return;
    const ss = window.sysSettings || {};
    const defaults = [
        { label: 'الباقات', url: 'https://hola-workspace-system.web.app/', icon: 'fa-solid fa-star' },
        { label: 'مكاننا', url: '#contact', icon: 'fa-solid fa-location-dot' },
        { label: 'مساعدة', url: '#contact', icon: 'fa-solid fa-headset' },
    ];
    const btns = ss.bioNavButtons || defaults;
    editor.innerHTML = btns.slice(0,3).map((b, i) => `
        <div class="grid grid-cols-3 gap-1.5 items-center text-xs">
            <div><label class="text-[10px] text-gray-500 font-bold block mb-0.5">اسم الزر ${i+1}</label>
            <input id="bioNavBtn${i+1}EditLabel" value="${b.label||''}" class="w-full border rounded-lg px-2 py-1.5 text-xs font-bold focus:border-hola-orange outline-none" placeholder="مثال: الباقات"></div>
            <div><label class="text-[10px] text-gray-500 font-bold block mb-0.5">الرابط</label>
            <input id="bioNavBtn${i+1}EditUrl" value="${b.url||''}" class="w-full border rounded-lg px-2 py-1.5 text-xs font-mono focus:border-hola-orange outline-none" placeholder="#contact أو رابط كامل"></div>
            <div><label class="text-[10px] text-gray-500 font-bold block mb-0.5">الأيقونة (FA class)</label>
            <input id="bioNavBtn${i+1}EditIcon" value="${b.icon||'fa-solid fa-link'}" class="w-full border rounded-lg px-2 py-1.5 text-xs font-mono focus:border-hola-orange outline-none" placeholder="fa-solid fa-star"></div>
        </div>`).join('<hr class="border-gray-100 my-1">');
};

window.saveSystemSettings = async () => {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    // ★ FIX: Use current sysSettings as fallback, NOT hardcoded defaults.
    // This prevents fields from resetting to defaults when they're left empty or have 0.
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
    const getNum = (id, fallback) => { const v = parseInt(getVal(id)); return isNaN(v) ? fallback : v; };
    const getFloat = (id, fallback) => { const v = parseFloat(getVal(id)); return isNaN(v) ? fallback : v; };
    const S = window.sysSettings || {};
    const data = {
        adminPin: getVal('settingAdminPin') || S.adminPin || '',  // ★ no hardcoded fallback
        description: getVal('settingDescription'),
        loyaltyText: getVal('settingLoyaltyText'),
        maxCapacity: getNum('setMaxCap', S.maxCapacity ?? 50),
        pricingTier1: getNum('setT1', S.pricingTier1 ?? 25),
        pricingTier2: getNum('setT2', S.pricingTier2 ?? 15),
        pricingTier3: getNum('setT3', S.pricingTier3 ?? 10),
        after3rdType: getVal('setAfter3rdType') || S.after3rdType || 'free',
        after3rdPrice: getNum('setAfter3rdPrice', S.after3rdPrice ?? 0),
        after3rdNote: getVal('setAfter3rdNote'),
        graceMinutes: getNum('setGraceMinutes', S.graceMinutes ?? 0),
        stampsRequired: getNum('setStampsReq', S.stampsRequired ?? 7),
        promoImg: getVal('setPromoImg'),
        promoText: getVal('setPromoText'),
        promoLink: getVal('setPromoLink'),
        promoEmbed: getVal('setPromoEmbed'),
        logoUrl: getVal('setLogoUrl'),
        workspaceLat: getFloat('setLat', S.workspaceLat ?? 26.5590),
        workspaceLng: getFloat('setLng', S.workspaceLng ?? 31.6957),
        workspaceRadius: getNum('setRadius', S.workspaceRadius ?? 500),
        vfNumber: getVal('setVfNumber'),
        vfName: getVal('setVfName'),
        instapayLink: getVal('setInstapayLink'),
        fbPageLink: getVal('setFbPageLink'),
        whatsappNum: getVal('setWhatsappNum'),
        igPageLink: getVal('setIgPageLink'),
        roomsActive: document.getElementById('setRoomsActive')?.checked ?? S.roomsActive ?? false,
        freeDrinkEnabled: document.getElementById('setFreeDrink')?.checked ?? S.freeDrinkEnabled ?? false,
        freeDrinkMode: document.getElementById('setFreeDrinkMode')?.value || S.freeDrinkMode || 'first_visit',
        // ★ إصلاح: استخدام القيمة المدخلة دائماً — لا نرجع للقديم إلا إذا العنصر غير موجود
        wifiSSID: (() => { const el = document.getElementById('setWifiSSID'); return el ? el.value.trim() : (S.wifiSSID || ''); })(),
        wifiPassword: (() => { const el = document.getElementById('setWifiPassword'); return el ? el.value : (S.wifiPassword || ''); })(),
        wifiSecurity: (() => { const el = document.getElementById('setWifiSecurity'); return el ? (el.value || 'WPA') : (S.wifiSecurity || 'WPA'); })(),
        wifiEnabled: (() => { const el = document.getElementById('setWifiEnabled'); return el ? el.checked : (S.wifiEnabled ?? false); })(),
        // Bio fields (preserved from existing)
        bioAboutUs: getVal('setBioAboutUs') || S.bioAboutUs || '',
        venueName: getVal('setBioVenueName') || S.venueName || '',
        venueTagline: getVal('setBioTagline') || S.venueTagline || '',
        bioLinks: S.bioLinks || [],
        bioNavButtons: (function() {
            var btns = [];
            for (var i = 1; i <= 3; i++) {
                var lbl  = (document.getElementById('bioNavBtn'+i+'EditLabel') || {}).value || '';
                var url  = (document.getElementById('bioNavBtn'+i+'EditUrl')   || {}).value || '';
                var icon = (document.getElementById('bioNavBtn'+i+'EditIcon')  || {}).value || 'fa-solid fa-link';
                if (lbl || url) btns.push({ label: lbl, url: url || '#', icon: icon });
            }
            return btns.length ? btns : (S.bioNavButtons || []);
        })()
    };
    try {
        const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system');
        const payload = { ...data, _updatedAt: Date.now(), _updatedBy: currentShiftAdmin || 'admin' };
        console.log('[Settings] 💾 Save requested', payload);
        await updateDoc(settingsRef, payload);
        // ★ Update local sysSettings immediately to prevent onSnapshot overwrite
        Object.assign(window.sysSettings, payload);
        showMsg("✅ تم تحديث الإعدادات بنجاح!", "success");
        // ★ تحديث معاينة QR الواي فاي فوراً بعد الحفظ
        if (typeof window._previewWifiQR === 'function') window._previewWifiQR();
        if (typeof window._onWifiToggle === 'function') window._onWifiToggle(!!payload.wifiEnabled);
    }
    catch (e) {
        console.error('[Settings] ❌ updateDoc failed:', e);
        try {
            const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system');
            const payload = { ...data, _updatedAt: Date.now(), _updatedBy: currentShiftAdmin || 'admin' };
            await setDoc(settingsRef, payload, { merge: true });
            Object.assign(window.sysSettings, payload);
            console.log('[Settings] ✅ Fallback setDoc(merge:true) saved successfully');
            showMsg("✅ تم تحديث الإعدادات بنجاح!", "success");
            if (typeof window._previewWifiQR === 'function') window._previewWifiQR();
            if (typeof window._onWifiToggle === 'function') window._onWifiToggle(!!payload.wifiEnabled);
        } catch (e2) {
            showMsg("حدث خطأ أثناء الحفظ", "error");
            console.error('[Settings] ❌ fallback setDoc failed:', e2);
        }
    }
};

window.addShiftManager = async () => {
    if (!db) return;
    const m = document.getElementById('newManagerName')?.value.trim();
    if (!m) return showMsg("أدخل اسم المسؤول", "error");
    let mgrs = sysSettings.shiftManagers || ["مدير النظام"];
    if (!mgrs.includes(m)) { mgrs.push(m); await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), { shiftManagers: mgrs }); document.getElementById('newManagerName').value = ''; showMsg("تم الإضافة بنجاح", "success"); }
    else showMsg("الاسم موجود", "error");
};
window.removeShiftManager = async (m) => {
    if (!db) return;
    let mgrs = (sysSettings.shiftManagers || ["مدير النظام"]).filter(x => x !== m);
    if (mgrs.length === 0) mgrs.push("مدير النظام");
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), { shiftManagers: mgrs });
    showMsg("تم الحذف بنجاح", "success");
};

// ─── Events ───────────────────────────────────────────────────────────────────
window.openEventDetails = (slot = 1) => {
    const key = (k) => slot === 1 ? k : `ev${slot}_${k}`;
    const title = sysSettings[key('evTitle')] || '';
    const desc = sysSettings[key('evDesc')] || '';
    const time = sysSettings[key('evTime')] || '';
    const img = sysSettings[key('evImg')] || '';
    const embed = sysSettings[key('evEmbed')] || sysSettings.promoEmbed || '';
    const modal = document.getElementById('eventDetailsModal');
    if (!modal) return;
    const waNum = sysSettings.whatsappNum || '';
    const fbPage = sysSettings.fbPageLink || '';
    modal.querySelector('.bg-white').innerHTML = `
        <div class="relative flex-shrink-0">
            ${img ? `
            <div id="posterFlipCard" onclick="window._flipPosterCard()"
                style="height:90px;perspective:800px;cursor:pointer;position:relative;overflow:hidden;background:#1a1a2e;" class="w-full">
                <div id="posterFront" style="position:absolute;inset:0;backface-visibility:hidden;transition:transform 0.7s cubic-bezier(.4,0,.2,1);transform-style:preserve-3d;">
                    <img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;filter:blur(3px) brightness(0.5);transform:scale(1.08);">
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:10px;">
                        <span style="font-size:20px;">🎴</span>
                        <span style="color:#fff;font-weight:900;font-size:13px;text-shadow:0 1px 8px #000;">اضغط لعرض البوستر كاملاً</span>
                        <span style="font-size:20px;">🎴</span>
                    </div>
                </div>
                <div id="posterBack" style="position:absolute;inset:0;backface-visibility:hidden;transform:rotateY(180deg);transition:transform 0.7s cubic-bezier(.4,0,.2,1);transform-style:preserve-3d;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                    <img src="${img}" alt="بوستر الفعالية" style="width:100%;height:100%;object-fit:contain;max-height:70vw;">
                    <div style="position:absolute;bottom:6px;left:8px;background:rgba(0,0,0,0.55);color:#fff;font-size:10px;padding:2px 8px;border-radius:20px;backdrop-filter:blur(4px);">اضغط للطي</div>
                </div>
            </div>` : ''}
            <button type="button" onclick="event.stopPropagation();document.getElementById('eventDetailsModal').classList.add('hidden')"
                class="absolute top-2 left-2 bg-black/50 hover:bg-black/80 text-white w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm transition z-20">
                <i class="fa-solid fa-xmark text-lg"></i>
            </button>
            ${!img ? `<div class="flex justify-between items-center p-4 border-b"><span class="text-2xl">🎉</span></div>` : ''}
        </div>
        <div class="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
                <h4 class="text-xl font-black text-hola-purple leading-snug mb-1">${title}</h4>
                ${time ? `<p class="text-sm font-bold text-hola-orange flex items-center gap-1.5"><i class="fa-solid fa-calendar-clock"></i><span>${time}</span></p>` : ''}
            </div>
            ${desc ? `<p class="text-sm text-gray-600 leading-relaxed font-bold whitespace-pre-line bg-gray-50 rounded-xl p-3 border border-gray-100">${desc}</p>` : ''}
            ${embed ? `<div class="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">${embed}</div>` : ''}
            <div class="flex gap-2 flex-wrap">
                ${fbPage ? `<a href="${fbPage}" target="_blank" class="flex-1 min-w-[80px] bg-blue-600 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-blue-700 transition"><i class="fa-brands fa-facebook"></i> فيسبوك</a>` : ''}
                ${waNum ? `<a href="https://wa.me/${waNum}" target="_blank" class="flex-1 min-w-[80px] bg-green-600 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-green-700 transition"><i class="fa-brands fa-whatsapp"></i> واتساب</a>` : ''}
            </div>
            <button type="button" onclick="window.attendEvent(${slot})"
                class="w-full bg-hola-purple hover:bg-hola-dark text-white font-black py-4 rounded-2xl shadow-lg transition text-base flex items-center justify-center gap-2">
                <i class="fa-solid fa-hand-sparkles"></i> انوي الحضور
            </button>
        </div>`;
    modal.classList.remove('hidden');
    window._currentPublicEvSlot = slot;
};

window.attendEvent = async (slot = 1) => {
    // If user is not logged in — redirect to intent form from login screen
    if (!myProfile) {
        window._currentPublicEvSlot = slot;
        window.showEventIntentFromLogin && window.showEventIntentFromLogin();
        return;
    }
    // Remote users cannot confirm attendance
    if (myProfile.isRemote) {
        showMsg("لا يمكن تأكيد الحضور من خارج المكان", "error");
        return;
    }
    if (!db) return;
    const key = (k) => (slot === 1 ? k : `ev${slot}_${k}`);
    const evTitle = sysSettings[key('evTitle')] || 'الفعالية';
    const alreadyAttending = Object.values(_eventAttendees).some(a => a.phone === myProfile.phone && a.slot === slot);
    if (alreadyAttending) return showMsg("لقد قمت بتسجيل حضورك مسبقاً!", "error");
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'event_attendees'), { name: myProfile.name, phone: myProfile.phone, timestamp: Date.now(), slot, evTitle });
        // إرسال إشعار تأكيد الحضور للعميل
        const evDate = sysSettings[key('evTime')] ? new Date(sysSettings[key('evTime')]).toLocaleString('ar-EG', {weekday:'long', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
            phone: myProfile.phone,
            msg: `✅ تم تسجيل حضورك في "${evTitle}"${evDate ? '\n📅 الموعد: ' + evDate : ''}\n\nشكراً يا ${myProfile.name}! ننتظرك بفارغ الصبر 🎉\nإذا طرأ طارئ، أبلغنا مسبقاً.`,
            type: 'workshop',
            isRead: false,
            timestamp: Date.now()
        });
        document.getElementById('eventDetailsModal')?.classList.add('hidden');
        showMsg(`تم تسجيلك في "${evTitle}" بنجاح! ننتظرك 🎉`, "success"); playAlertSound('congrats');
    } catch (e) { showMsg("حدث خطأ", "error"); }
};
window.deleteAttendee = async (id) => { 
    if (!db) return; 
    if (!confirm('حذف هذا الشخص من قائمة الحضور؟')) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'event_attendees', id));
        showMsg('تم حذف الشخص من الحضور ✅', 'success');
    } catch(e) { showMsg('خطأ في الحذف', 'error'); }
};
window.clearEventAttendees = async () => {
    if (!db || !confirm("متأكد من مسح الحضور؟")) return;
    Object.keys(_eventAttendees).forEach(id => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'event_attendees', id)));
    showMsg("تم المسح", "success");
};

// ─── Subscription / Plans System ─────────────────────────────────────────────
window.showSubscriptionModal = () => {
    // ★ إظهار Spinner أولاً ريثما تصل البيانات
    const list = document.getElementById('subscriptionPlansList');
    if (list) list.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-hola-purple text-2xl mb-3"></i><p class="text-sm text-gray-400 font-bold">جاري تحميل الباقات...</p></div>`;
    // Auto-fill if logged in
    if (myProfile && !myProfile.isRemote) {
        const nameInput = document.getElementById('subName');
        const phoneInput = document.getElementById('subPhone');
        if (nameInput) nameInput.value = myProfile.name || '';
        if (phoneInput) phoneInput.value = myProfile.phone || '';
        const subFormHint = document.getElementById('subFormLoggedHint');
        if (subFormHint) subFormHint.classList.remove('hidden');
    }
    document.getElementById('subscriptionModal')?.classList.remove('hidden');
    document.getElementById('subscriptionFormDiv')?.classList.add('hidden');
    // ★ انتظر البيانات ثم ارسم — poll حتى 5 ثوانٍ
    let _att = 0;
    const _poll = () => {
        if (Object.keys(_plans).length > 0 || ++_att > 25) {
            renderPublicPlans();
        } else {
            setTimeout(_poll, 200);
        }
    };
    setTimeout(_poll, 100);
};

function renderPublicPlans() {
    const list = document.getElementById('subscriptionPlansList');
    if (!list) return;
    const plans = Object.values(_plans).filter(p => p.active !== false && p.active !== 0);
    if (plans.length === 0) {
        list.innerHTML = `<div class="text-center py-6"><p class="text-gray-400">لا توجد باقات متاحة حالياً</p><p class="text-sm text-gray-400 mt-1">سيتم إضافة الباقات قريباً</p></div>`;
        return;
    }
    list.innerHTML = plans.map(p => {
        const isUnavail = p.unavailable === true;
        const planColor = p.color || '#301043';
        const planIcon = p.icon || 'fa-crown';
        return `
        <div class="plan-card border-2 ${isUnavail ? 'border-gray-200 bg-gray-100 opacity-60 cursor-not-allowed' : 'border-purple-100 hover:border-hola-purple cursor-pointer hover:shadow-lg hover:-translate-y-0.5'} rounded-2xl p-4 transition-all duration-200 relative overflow-hidden"
             id="plan-card-${p.id}"
             onclick="${isUnavail ? "window.showMsg('هذا الاشتراك غير متوفر حالياً','error')" : `window.selectPlanCard('${p.id}', '${p.name}')`}">
            ${isUnavail ? '<div class="absolute top-2 right-2 bg-gray-400 text-white text-[9px] px-2 py-0.5 rounded-full font-bold">غير متوفر</div>' : ''}
            <!-- مؤشر التحديد -->
            <div class="plan-selected-badge hidden absolute top-2 right-2 bg-green-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><i class="fa-solid fa-check text-[8px]"></i> محدد</div>
            <div class="absolute top-0 right-0 ${isUnavail ? 'bg-gray-400' : 'bg-hola-orange'} text-white text-[10px] px-3 py-1 rounded-bl-lg font-bold">${p.price} ج.م</div>
            <div class="mt-4">
                ${p.headerImg
                    ? `<img src="${p.headerImg}" class="w-full h-20 object-cover rounded-xl mb-3 ${isUnavail ? 'grayscale' : ''}" onerror="this.style.display='none'">`
                    : `<div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-2 ${isUnavail ? 'bg-gray-200 text-gray-400' : 'bg-purple-100'}" style="${isUnavail ? '' : `color:${planColor}`}"><i class="fa-solid ${planIcon}"></i></div>`
                }
                <h4 class="font-black text-lg mb-1 ${isUnavail ? 'text-gray-400' : ''}" style="${isUnavail ? '' : `color:${planColor}`}">${_esc(p.name)}</h4>
                <p class="text-xs text-gray-500 font-bold mb-3">${_esc(p.desc || '')}</p>
                <div class="flex justify-between text-xs font-bold text-gray-600">
                    <span><i class="fa-solid fa-calendar-days ${isUnavail ? 'text-gray-400' : 'text-hola-orange'} ml-1"></i>${p.days} يوم</span>
                    <span><i class="fa-solid fa-check-circle ${isUnavail ? 'text-gray-400' : 'text-green-500'} ml-1"></i>${p.allowedDays || p.days} أيام استخدام</span>
                </div>
                ${isUnavail ? '<p class="text-[10px] text-gray-400 text-center mt-2 font-bold">غير متوفر حالياً</p>'
                    : `<div class="mt-3 w-full bg-hola-purple text-white text-xs font-black py-2 rounded-xl text-center opacity-0 plan-btn transition-opacity duration-200">اختر هذه الباقة ✓</div>`
                }
            </div>
        </div>`; }).join('');

    // Show "اختر" button on hover
    list.querySelectorAll('.plan-card:not([onclick*="showMsg"])').forEach(function(card) {
        card.addEventListener('mouseenter', function() {
            var btn = card.querySelector('.plan-btn');
            if (btn) btn.style.opacity = '1';
        });
        card.addEventListener('mouseleave', function() {
            var btn = card.querySelector('.plan-btn');
            if (btn && !card.classList.contains('plan-selected')) btn.style.opacity = '0';
        });
    });
}

window.selectPlanCard = (planId, planName) => {
    // Remove selection from all cards
    document.querySelectorAll('.plan-card').forEach(function(c) {
        c.classList.remove('plan-selected', 'border-hola-purple', 'bg-purple-50');
        c.classList.add('border-purple-100');
        var badge = c.querySelector('.plan-selected-badge');
        if (badge) badge.classList.add('hidden');
        var btn = c.querySelector('.plan-btn');
        if (btn) { btn.style.opacity = '0'; btn.textContent = 'اختر هذه الباقة ✓'; }
    });
    // Highlight selected card
    var selected = document.getElementById('plan-card-' + planId);
    if (selected) {
        selected.classList.add('plan-selected', 'border-hola-purple', 'bg-purple-50');
        selected.classList.remove('border-purple-100');
        var badge = selected.querySelector('.plan-selected-badge');
        if (badge) badge.classList.remove('hidden');
        var btn = selected.querySelector('.plan-btn');
        if (btn) { btn.style.opacity = '1'; btn.textContent = '✓ تم الاختيار'; }
    }
    // Fill form
    document.getElementById('subPlanId').value = planId;
    document.getElementById('selectedPlanTitle').innerText = planName;
    document.getElementById('subscriptionFormDiv')?.classList.remove('hidden');
    document.getElementById('subscriptionFormDiv')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

// Keep old selectPlan as alias
window.selectPlan = window.selectPlanCard;



window.submitSubscription = async () => {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    const name = document.getElementById('subName')?.value.trim();
    const phone = document.getElementById('subPhone')?.value.trim();
    const planId = document.getElementById('subPlanId')?.value;
    if (!name || !phone || phone.length < 10) return showMsg("برجاء إدخال الاسم ورقم الهاتف بشكل صحيح", "error");
    if (!planId) return showMsg("اختر باقة أولاً", "error");
    // Prevent multiple pending subscriptions
    const hasPending = Object.values(_subscriptions).some(s => s.phone === phone && s.status === 'pending');
    if (hasPending) return showMsg("لديك طلب اشتراك معلق بالفعل. انتظر موافقة الإدارة.", "error");
    // Prevent re-subscribe within 2 days of rejection
    const lastRejected = Object.values(_subscriptions)
        .filter(s => s.phone === phone && s.status === 'cancelled')
        .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (lastRejected && (Date.now() - lastRejected.createdAt) < 2 * 24 * 3600000) {
        return showMsg("يمكنك إعادة الاشتراك بعد يومين من رفض الطلب السابق.", "error");
    }
    // Prevent subscribing more than once every 2 days (active)
    const hasActiveOrRecent = Object.values(_subscriptions).find(s =>
        s.phone === phone && s.status === 'active'
    );
    if (hasActiveOrRecent) return showMsg("لديك اشتراك نشط بالفعل!", "error");
    try {
        const plan = _plans[planId];
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'subscriptions'), {
            name, phone, planId, planName: plan?.name || planId, planDays: plan?.days || 7,
            planPrice: plan?.price || 0, allowedDays: plan?.allowedDays || plan?.days || 7,
            status: 'pending', createdAt: Date.now(), daysLeft: plan?.allowedDays || plan?.days || 7
        });
        // Notify admin
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), {
            phone: 'admin', itemName: `🌟 طلب اشتراك: ${name} (${phone}) - ${plan?.name}`, status: 'pending', timestamp: Date.now()
        });
        document.getElementById('subscriptionFormDiv').innerHTML = `
            <div class="text-center py-4">
                <div class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-3"><i class="fa-solid fa-check-double"></i></div>
                <h4 class="font-black text-hola-purple text-lg mb-2">تم استلام طلب اشتراكك!</h4>
                <p class="text-sm text-gray-600 font-bold">سيتم مراجعة طلبك وتفعيل اشتراكك قريباً من الإدارة. ستصلك إشعار عند التفعيل.</p>
            </div>`;
        playAlertSound('congrats');
        // Show admin badge
        document.getElementById('adminSubsBadge')?.classList.remove('hidden');
    } catch (e) { showMsg("حدث خطأ أثناء الاشتراك", "error"); }
};

window.approveSubscription = async (subId) => {
    if (!db) return;
    const sub = _subscriptions[subId]; if (!sub) return;
    const code = 'SUB-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const startDate = Date.now();
    const endDate = startDate + (sub.planDays * 24 * 3600000);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', subId), {
        status: 'active', code, startDate, endDate, daysLeft: sub.allowedDays || sub.planDays, approvedAt: Date.now()
    });
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
        phone: sub.phone,
        msg: `🎉 تم تفعيل اشتراكك "${sub.planName}" بنجاح!\n\nكود اشتراكك: ${code}\n\nيسري حتى: ${new Date(endDate).toLocaleDateString('ar-EG')}\n\nاحتفظ بهذا الكود — ستحتاجه عند تسجيل الدخول. اضغط على الكود لنسخه!`,
        type: 'sub_activated',
        discountCode: code,
        isRead: false,
        timestamp: Date.now()
    });
    showMsg("تم تفعيل الاشتراك وإرسال الكود للعميل", "success");
    logOperation(db, appId, currentShiftAdmin, 'تفعيل اشتراك', `تفعيل اشتراك ${sub.phone} - ${sub.planName}`);
};

window.revokeSubscription = async (subId) => {
    if (!db || !confirm("متأكد من إلغاء الاشتراك؟")) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', subId), { status: 'cancelled' });
    showMsg("تم إلغاء الاشتراك", "success");
};

window.showAddPlanModal = () => { document.getElementById('addPlanModal')?.classList.remove('hidden'); };

window.savePlan = async () => {
    if (!db) return;
    const name = document.getElementById('planName')?.value.trim();
    const days = parseInt(document.getElementById('planDays')?.value) || 7;
    const price = parseInt(document.getElementById('planPrice')?.value) || 0;
    const allowedDays = parseInt(document.getElementById('planAllowedDays')?.value) || days;
    const desc = document.getElementById('planDesc')?.value.trim() || '';
    const color = document.getElementById('planColor')?.value || '#301043';
    const icon = document.getElementById('planIcon')?.value.trim() || 'fa-crown';
    const headerImg = document.getElementById('planHeaderImg')?.value.trim() || '';
    if (!name) return showMsg("أدخل اسم الباقة", "error");
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'plans'), { name, days, price, allowedDays, desc, color, icon, headerImg, active: true, createdAt: Date.now() });
    document.getElementById('addPlanModal')?.classList.add('hidden');
    // Reset fields
    ['planName','planDesc','planIcon','planHeaderImg'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    const pc = document.getElementById('planColor'); if(pc) pc.value='#301043';
    showMsg("تم إضافة الباقة بنجاح", "success");
};

window.deletePlan = async (id) => {
    if (!db || !confirm("متأكد من حذف الباقة؟")) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'plans', id));
    showMsg("تم حذف الباقة", "success");
};

window.markFeedbackRead = async (id) => {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'feedback', id), { isRead: true });
};

window.deleteFeedback = async (id) => {
    if (!db || !confirm("حذف الرسالة؟")) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'feedback', id));
    showMsg("تم حذف الرسالة", "success");
};

window.markAllFeedbackRead = async () => {
    if (!db) return;
    const unread = Object.values(_feedback).filter(f => !f.isRead);
    if (unread.length === 0) { showMsg("كل الرسائل مقروءة بالفعل", "info"); return; }
    await Promise.all(unread.map(f =>
        updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'feedback', f.id), { isRead: true })
    ));
    showMsg(`تم تحديد ${unread.length} رسائل كمقروءة ✅`, "success");
};

window.showSubCard = (subId) => {
    const sub = _subscriptions[subId]; if (!sub) return;
    window._currentSubCardId = subId;
    // Resolve profile for name & phone
    const prof = _profiles[sub.phone] || {};
    const holderName = sub.name || prof.name || '---';
    const holderPhone = sub.phone || '---';
    const statusLabel = sub.status === 'active' ? '✅ نشط' : sub.status === 'paused' ? '⏸ موقوف مؤقتاً' : sub.status === 'expired' ? '❌ منتهي' : '⏳ معلق';
    const fromDate = sub.startDate ? new Date(sub.startDate).toLocaleDateString('ar-EG') : (sub.createdAt ? new Date(sub.createdAt).toLocaleDateString('ar-EG') : '--/--');
    const toDate = sub.endDate ? new Date(sub.endDate).toLocaleDateString('ar-EG') : (sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('ar-EG') : '--/--');

    safeSet('subCardTitle', 'innerText', 'بطاقة اشتراكك');
    safeSet('subCardPlanName', 'innerText', sub.planName || '');
    safeSet('subCardCode', 'innerText', sub.code || '---');
    safeSet('subCardStatus', 'innerText', statusLabel);
    safeSet('subCardHolderName', 'innerText', holderName);
    safeSet('subCardHolderPhone', 'innerText', holderPhone);
    safeSet('subCardFrom', 'innerText', fromDate);
    safeSet('subCardTo', 'innerText', toDate);
    safeSet('subCardDaysLeft', 'innerText', sub.daysLeft || 0);

    // Pause / Resume controls
    const pauseCtrl = document.getElementById('subCardPauseControls');
    const resumeCtrl = document.getElementById('subCardResumeControls');
    if (pauseCtrl) pauseCtrl.classList.toggle('hidden', sub.status !== 'active');
    if (resumeCtrl) resumeCtrl.classList.toggle('hidden', sub.status !== 'paused');

    // Sync print area fields
    safeSet('subCardPrint_planName', 'innerText', sub.planName || '');
    safeSet('subCardPrint_code', 'innerText', sub.code || '---');
    safeSet('subCardPrint_status', 'innerText', statusLabel);
    safeSet('subCardPrint_name', 'innerText', holderName);
    safeSet('subCardPrint_phone', 'innerText', holderPhone);
    safeSet('subCardPrint_from', 'innerText', fromDate);
    safeSet('subCardPrint_to', 'innerText', toDate);
    safeSet('subCardPrint_daysLeft', 'innerText', sub.daysLeft || 0);

    document.getElementById('subscriptionCardModal')?.classList.remove('hidden');
};

window.printSubCard = () => {
    document.body.classList.add('printing-subcard');
    const printArea = document.getElementById('subCardPrintArea');
    if (printArea) printArea.classList.remove('hidden');
    setTimeout(() => {
        window.print();
        document.body.classList.remove('printing-subcard');
        if (printArea) printArea.classList.add('hidden');
    }, 300);
};

// ─── Remote Profile (outside workspace) ──────────────────────────────────────
window.showRemoteProfile = () => {
    const modal = document.getElementById('remoteProfileModal');
    if (!modal) return;
    if (!myProfile) {
        // Ask for phone
        const content = document.getElementById('remoteProfileContent');
        if (content) content.innerHTML = `
            <div class="text-center">
                <p class="text-sm text-gray-600 font-bold mb-4">أدخل رقم هاتفك للوصول لملفك</p>
                <input type="tel" id="remotePhoneInput" class="w-full border-2 p-3 rounded-xl font-mono text-center font-bold mb-3" placeholder="010..." dir="ltr">
                <button onclick="window.loadRemoteProfile()" class="w-full bg-gray-700 text-white font-bold py-2.5 rounded-xl hover:bg-gray-800 transition">عرض ملفي</button>
            </div>`;
        modal.classList.remove('hidden');
    } else {
        window.populateRemoteProfile(myProfile.phone);
        modal.classList.remove('hidden');
    }
};

window.loadRemoteProfile = async () => {
    const phone = document.getElementById('remotePhoneInput')?.value.trim();
    if (!phone || phone.length < 10) return showMsg("أدخل رقم صحيح", "error");
    await window.populateRemoteProfile(phone);
};

window.populateRemoteProfile = async (phone) => {
    const prof = _profiles[phone];
    if (!prof) { showMsg("لم يتم العثور على هذا الرقم", "error"); return; }
    const nameEl = document.getElementById('remoteNameDisplay');
    const phoneEl = document.getElementById('remotePhoneDisplay');
    const avatarEl = document.getElementById('remoteAvatarInitial');
    if (nameEl) nameEl.innerText = prof.name || 'بدون اسم';
    if (phoneEl) phoneEl.innerText = phone;
    if (avatarEl) avatarEl.innerText = (prof.name || '?').charAt(0).toUpperCase();
    const content = document.getElementById('remoteProfileContent');
    if (!content) return;

    const activeSub = Object.values(_subscriptions).find(s => s.phone === phone && s.status === 'active');
    const completedSessions = Object.values(_sessions).filter(s => s.phone === phone && s.status === 'completed').sort((a, b) => b.endTime - a.endTime);
    const lastSession = completedSessions[0];
    const myNotifs = Object.values(_notifications).filter(n => n.phone === phone && !n.isRead).slice(0,3);
    const myDiscounts = Object.values(_discounts).filter(d => d.assignedTo === phone && !d.isUsed);

    // ★ الإشعارات غير المقروءة
    const notifsHtml = myNotifs.length > 0
        ? `<div class="bg-amber-50 border border-amber-200 rounded-2xl p-3">
            <p class="text-xs font-black text-amber-700 mb-2"><i class="fa-solid fa-bell text-amber-500 ml-1"></i>إشعارات جديدة (${myNotifs.length})</p>
            <div class="space-y-1.5">${myNotifs.map(n=>`<div class="bg-white rounded-xl p-2.5 text-xs font-bold text-gray-700 border border-amber-100 leading-relaxed">${n.msg.substring(0,80)}${n.msg.length>80?'...':''}</div>`).join('')}</div>
        </div>` : '';

    // ★ آخر فاتورة
    const invoiceHtml = lastSession
        ? `<div class="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <div class="flex justify-between items-center mb-2">
                <p class="text-xs font-black text-gray-700"><i class="fa-solid fa-receipt text-hola-orange ml-1"></i>آخر فاتورة</p>
                <span class="text-hola-orange font-black text-lg">${lastSession.finalCost || 0} ج</span>
            </div>
            <p class="text-xs text-gray-500 font-bold mb-3">${new Date(lastSession.endTime).toLocaleDateString('ar-EG')} — ${Math.floor((lastSession.durationMs||0)/3600000)}س ${Math.floor(((lastSession.durationMs||0)%3600000)/60000)}د</p>
            <button onclick="window.printInvoice('${lastSession.id}')" class="w-full bg-gray-800 text-white font-bold py-2 rounded-xl text-xs hover:bg-black transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-print"></i> طباعة الفاتورة
            </button>
        </div>` : '';

    // ★ الاشتراك النشط
    const subHtml = activeSub
        ? `<div class="bg-gradient-to-br from-hola-purple to-hola-dark text-white rounded-2xl p-4 cursor-pointer shadow-lg" onclick="window.showSubCard('${activeSub.id}')">
            <div class="flex justify-between items-start mb-3">
                <div><p class="text-[10px] text-purple-300">الباقة النشطة</p><p class="font-black text-hola-orange">${activeSub.planName}</p></div>
                <span class="bg-green-500 text-[9px] text-white px-2 py-0.5 rounded-full font-bold">✅ نشط</span>
            </div>
            <p class="font-mono text-lg font-black tracking-widest text-center bg-white/10 rounded-xl py-2 mb-3">${activeSub.code || '---'}</p>
            <div class="grid grid-cols-3 gap-2 text-center text-xs">
                <div class="bg-white/10 rounded-xl p-2"><p class="text-purple-300 mb-1">مستخدم</p><p class="font-black">${Math.max(0,(activeSub.allowedDays||activeSub.planDays||0)-(activeSub.daysLeft||0))}</p></div>
                <div class="bg-white/20 rounded-xl p-2"><p class="text-purple-200 mb-1">متبقي</p><p class="font-black text-hola-orange text-base">${activeSub.daysLeft||0}</p></div>
                <div class="bg-white/10 rounded-xl p-2"><p class="text-purple-300 mb-1">إجمالي</p><p class="font-black">${activeSub.allowedDays||activeSub.planDays||0}</p></div>
            </div>
        </div>` : `<div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-center">
            <p class="text-sm text-gray-400 font-bold">لا يوجد اشتراك نشط</p>
            <button onclick="window.showSubscriptionModal()" class="mt-2 bg-hola-orange text-white font-bold px-4 py-2 rounded-xl text-xs hover:bg-orange-600 transition">اشترك الآن</button>
        </div>`;

    // ★ أكواد الخصم
    const discHtml = myDiscounts.length > 0
        ? `<div class="bg-orange-50 border border-orange-200 rounded-2xl p-3">
            <p class="text-xs font-black text-hola-orange mb-2"><i class="fa-solid fa-tag ml-1"></i>أكواد خصم متاحة (${myDiscounts.length})</p>
            <div class="space-y-1.5">${myDiscounts.map(d=>`<div class="bg-white rounded-xl px-3 py-2 flex justify-between items-center border border-orange-100 cursor-pointer" onclick="window.copyToClipboard('${_esc(d.code)}');window.showMsg('تم نسخ الكود!','success')"><span class="font-mono font-black text-sm">${_esc(d.code)}</span><span class="font-black text-hola-orange">${d.isPercentage?d.value+'%':d.value+' ج'}</span></div>`).join('')}</div>
        </div>` : '';

    content.innerHTML = notifsHtml + invoiceHtml + subHtml + discHtml;
};

// ─── Embed System ─────────────────────────────────────────────────────────────
window.showEmbedModal = () => { document.getElementById('embedModal')?.classList.remove('hidden'); };

window.previewEmbed = () => {
    const code = document.getElementById('embedCodeInput')?.value.trim();
    if (!code) return;
    const preview = document.getElementById('embedPreviewArea');
    const content = document.getElementById('embedPreviewContent');
    if (preview && content) {
        content.innerHTML = code;
        preview.classList.remove('hidden');
    }
};

window.applyEmbed = () => {
    const code = document.getElementById('embedCodeInput')?.value.trim();
    if (!code) return;
    // Apply embed to promo card
    const promoCard = document.getElementById('fbPromoCard');
    if (promoCard) {
        promoCard.classList.remove('hidden');
        const existing = promoCard.querySelector('.embed-content');
        if (existing) existing.remove();
        const div = document.createElement('div');
        div.className = 'embed-content w-full overflow-hidden rounded-xl';
        div.innerHTML = code;
        promoCard.insertBefore(div, promoCard.firstChild);
    }
    document.getElementById('embedModal')?.classList.add('hidden');
    showMsg("تم تطبيق المحتوى المدمج بنجاح", "success");
};

// ─── Promo Link Detection (Smart) ────────────────────────────────────────────
function detectSocialPlatform(url) {
    if (!url) return { icon: 'fa-link', label: 'عرض التفاصيل', color: 'bg-blue-600' };
    const u = url.toLowerCase();
    if (u.includes('facebook.com') || u.includes('fb.com') || u.includes('fb.watch')) return { icon: 'fa-brands fa-facebook', label: 'عرض على فيسبوك', color: 'bg-blue-600' };
    if (u.includes('instagram.com') || u.includes('instagr.am')) return { icon: 'fa-brands fa-instagram', label: 'عرض على إنستاغرام', color: 'bg-gradient-to-br from-purple-600 to-pink-500' };
    if (u.includes('linkedin.com')) return { icon: 'fa-brands fa-linkedin', label: 'عرض على لينكد إن', color: 'bg-blue-700' };
    if (u.includes('behance.net')) return { icon: 'fa-brands fa-behance', label: 'عرض على بيهانس', color: 'bg-blue-500' };
    if (u.includes('twitter.com') || u.includes('x.com')) return { icon: 'fa-brands fa-x-twitter', label: 'عرض على X', color: 'bg-gray-900' };
    if (u.includes('youtube.com') || u.includes('youtu.be')) return { icon: 'fa-brands fa-youtube', label: 'عرض على يوتيوب', color: 'bg-red-600' };
    if (u.includes('tiktok.com')) return { icon: 'fa-brands fa-tiktok', label: 'عرض على تيك توك', color: 'bg-gray-900' };
    if (u.includes('wa.me') || u.includes('whatsapp.com')) return { icon: 'fa-brands fa-whatsapp', label: 'تواصل عبر واتساب', color: 'bg-green-600' };
    return { icon: 'fa-arrow-up-right-from-square', label: 'عرض التفاصيل', color: 'bg-gray-700' };
}
window.detectSocialPlatform = detectSocialPlatform;

// Update promo link button dynamically
function updatePromoLinkBtn() {
    const link = sysSettings.promoLink;
    const btn = document.getElementById('pubPromoLink');
    if (!btn || !link) return;
    const platform = detectSocialPlatform(link);
    btn.className = `block w-full ${platform.color} text-white text-center py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2`;
    btn.innerHTML = `<i class="fa-solid ${_esc(platform.icon)}"></i> ${_esc(platform.label)}`;
}
window._updatePromoLinkBtn = updatePromoLinkBtn;

// ─── Music Voting ─────────────────────────────────────────────────────────────
window.voteMusic = async (type) => {
    if (!db) return;
    // منع المستخدم البعيد من التصويت
    if (myProfile && myProfile.isRemote) return showMsg("لا يمكن التصويت من خارج المكان", "error");
    if (window._currentUserIsRemote) return showMsg("لا يمكن التصويت من خارج المكان", "error");
    const currentRound = sysSettings.musicVoteRound || 1;
    const hasVoted = localStorage.getItem(`voted_music_${type}_round_${currentRound}`);
    if (hasVoted) return showMsg("لقد قمت بالتصويت مسبقاً في هذه الجولة!", "error");
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system');
    if (type === 'loud') { await updateDoc(ref, { voteLoud: (sysSettings.voteLoud || 0) + 1 }); showMsg("تم إرسال رأيك (صوت عالي)", "success"); }
    if (type === 'bad') { await updateDoc(ref, { voteBad: (sysSettings.voteBad || 0) + 1 }); showMsg("تم إرسال رأيك (موسيقى سيئة)", "success"); }
    localStorage.setItem(`voted_music_${type}_round_${currentRound}`, "true");
};
window.resetMusicVotes = async () => {
    if (!db) return;
    const nextRound = (sysSettings.musicVoteRound || 1) + 1;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), { voteLoud: 0, voteBad: 0, musicVoteRound: nextRound });
    showMsg("تم تصفير الأصوات وبدء جولة جديدة!", "success");
};
window.suggestSong = async () => {
    if (!db || !myProfile) return;
    const input = document.getElementById('suggestSongInput');
    const song = input.value.trim();
    if (!song) return showMsg("اكتب اسم الأغنية أولاً", "error");
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'chats'), { phone: myProfile.phone, name: myProfile.name, text: `🎵 اقتراح أغنية: ${song}`, sender: 'client', timestamp: Date.now() });
    input.value = ''; showMsg("تم إرسال اقتراحك للإدارة!", "success");
};

// ─── Chat ─────────────────────────────────────────────────────────────────────
window.openClientChat = () => {
    document.getElementById('clientChatModal')?.classList.remove('hidden');
    document.getElementById('chatBadge')?.classList.add('hidden');
    if (currentShiftAdmin) document.getElementById('chatClientHeaderName').innerText = `شات مباشر مع ${currentShiftAdmin}`;
    setTimeout(() => { const box = document.getElementById('clientChatMessages'); if (box) box.scrollTop = box.scrollHeight; }, 100);
};
window.closeClientChat = () => { document.getElementById('clientChatModal')?.classList.add('hidden'); };
window.sendClientMessage = async () => {
    if (!db || !myProfile) return;
    const input = document.getElementById('clientChatInput'); const text = input.value.trim(); if (!text) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'chats'), { phone: myProfile.phone, name: myProfile.name, text, sender: 'client', timestamp: Date.now() });
    input.value = '';
};
window.openAdminChat = (phone) => {
    setCurrentChatPhone(phone);
    const name = _profiles[phone]?.name || phone;
    document.getElementById('adminChatHeader').innerHTML = `<i class="fa-solid fa-headset text-hola-orange"></i> محادثة مع: <span class="text-hola-orange">${_esc(name)}</span>`;
    document.getElementById('adminChatInput').disabled = false;
    document.getElementById('adminChatBtn').disabled = false;
    renderAdminChatUsersList(_chats, _profiles, phone, _sessions);
    renderAdminChatMessages(phone, _chats);
};
window.sendAdminMessage = async () => {
    if (!db || !currentChatPhone) return;
    const input = document.getElementById('adminChatInput'); const text = input.value.trim(); if (!text) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'chats'), { phone: currentChatPhone, text, sender: 'admin', timestamp: Date.now() });
    input.value = '';
};

// ─── Loyalty / Notification ───────────────────────────────────────────────────
window.goToLoyaltyAndPulse = (code) => {
    window.closeClientNotif(); switchClientTab('notifications');
    setTimeout(() => {
        const el = document.getElementById(`discount-card-${code}`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('pulse-highlight'); setTimeout(() => { el.classList.remove('pulse-highlight'); }, 6000); }
        else if (code) showMsg(`الكود جاهز: ${code} 👌`, 'success');
    }, 300);
};
window.closeClientNotif = () => {
    const m = document.getElementById('clientNotifModal');
    if (m) {
        if (window._clientNotifAutoDismissTimer) {
            clearTimeout(window._clientNotifAutoDismissTimer);
            window._clientNotifAutoDismissTimer = null;
        }
        m.classList.add('hidden');
        // ★ reset modal state so it can reopen cleanly
        const img = document.getElementById('clientNotifImg');
        const link = document.getElementById('clientNotifLink');
        if (img) img.classList.add('hidden');
        if (link) link.classList.add('hidden');
        const msg = document.getElementById('clientNotifMsg');
        if (msg && msg.parentNode) {
            msg.parentNode.querySelectorAll('.copy-code-btn').forEach(el => {
                const wrap = el.closest('.mt-4');
                if (wrap) wrap.remove();
            });
        }
    }
};

// ─── Expose all window functions ──────────────────────────────────────────────
window.showMsg = showMsg;
window.safeSet = safeSet;
window.copyToClipboard = copyToClipboard;
window.switchView = (viewName) => {
    switchView(viewName);
    // Hide remote-only tab button unless user is remote
    const remoteTab = document.getElementById('c-tab-remote');
    if (remoteTab && window._currentUserIsRemote) {
        remoteTab.classList.remove('hidden');
    } else if (remoteTab && viewName !== 'client') {
        remoteTab.classList.add('hidden');
    }
};
window.switchClientTab = switchClientTab;
window.switchAdminTab = switchAdminTab;
window.checkLocationForLogin = checkLocationForLogin;
window.showPreBookingFallback = showPreBookingFallback;
window.resetLocationCheck = resetLocationCheck;
window.checkNewUser = (val) => checkNewUser(val, _profiles);

// Show active session OR subscription info as user types phone number
window.checkPhoneForSubscription = (val) => {
    const badge = document.getElementById('loginInfoBadge');
    if (!badge) return;
    const phone = (val || '').trim();
    if (phone.length < 10) { badge.classList.add('hidden'); badge.innerHTML = ''; return; }

    // Check active session
    const activeSes = Object.values(_sessions || {}).find(s => s.phone === phone && s.status === 'active');
    if (activeSes) {
        const elapsed = Math.floor((Date.now() - activeSes.startTime) / 60000);
        const hrs = Math.floor(elapsed / 60), mins = elapsed % 60;
        const timeStr = hrs > 0 ? `${hrs}س ${mins}د` : `${mins} دقيقة`;
        badge.innerHTML = `<div class="bg-amber-50 border-amber-300 border p-3 rounded-xl">
            <div class="flex items-start gap-2 mb-2">
                <span class="text-amber-500 text-base mt-0.5">🟡</span>
                <div>
                    <p class="text-amber-800 font-black text-xs">لديك جلسة نشطة حالياً!</p>
                    <p class="text-amber-600 text-[11px] mt-0.5">منذ ${timeStr}</p>
                </div>
            </div>
            <button onclick="window.handleLogin()" class="w-full bg-amber-500 text-white font-black text-xs py-2 rounded-xl hover:bg-amber-600 transition active:scale-95">
                ✅ استكمال الجلسة النشطة
            </button>
        </div>`;
        badge.classList.remove('hidden');
        return;
    }

    // Check active subscription
    const subs = Object.values(_subscriptions || {}).filter(s => s.phone === phone && s.status === 'active');
    if (subs.length > 0) {
        const sub = subs[0];
        const plan = (sysSettings?.subscriptionPlans || []).find(p => p.id === sub.planId);
        const planName = plan?.name || sub.planId || 'اشتراك';
        const usedHrs = Math.round((sub.usedMinutes || 0) / 60 * 10) / 10;
        const totalHrs = plan?.hours || sub.totalHours || '?';
        const remaining = totalHrs !== '?' ? Math.max(0, totalHrs - usedHrs) : null;
        const remainStr = remaining !== null ? `متبقي ${remaining} ساعة` : '';
        badge.innerHTML = `<div class="bg-green-50 border-green-300 border p-3 rounded-xl flex items-start gap-2">
            <span class="text-green-500 text-base mt-0.5">👑</span>
            <div>
                <p class="text-green-800 font-black text-xs">لديك اشتراك نشط: ${planName}</p>
                ${remainStr ? `<p class="text-green-600 text-[11px] mt-0.5">${remainStr} من أصل ${totalHrs}س — مُستخدم: ${usedHrs}س</p>` : ''}
            </div>
        </div>`;
        badge.classList.remove('hidden');
        return;
    }

    badge.classList.add('hidden');
    badge.innerHTML = '';
};
window.submitPreBooking = () => submitPreBooking(db, appId);
window.submitInternalPreBooking = (type) => submitInternalPreBooking(type, db, appId, myProfile);
window.handleLogin = () => handleLogin(db, appId, _profiles, _sessions, sysSettings);
window.showAdminLoginModal = showAdminLoginModal;
window.verifyAdminPin = () => verifyAdminPin(db, appId, sysSettings, activeSessionId);
window.logoutAdmin = () => logoutAdmin(activeSessionId, currentShiftAdmin, db, appId);
window.applyDiscountCode = applyDiscountCode;
window.saveDiscount = () => saveDiscount(db, appId);
window.deleteDiscount = (id) => deleteDiscount(id, db, appId);
window.showDiscountModal = showDiscountModal;
window.saveMenuItem = () => saveMenuItem(db, appId);
window.deleteMenuItem = (id) => deleteMenuItem(id, db, appId);
window.showMenuModal = showMenuModal;
window.openUserManage = (phone) => openUserManage(phone, _profiles, setCurrentManageUserPhone);
window.saveUserWallet = () => saveUserWallet(db, appId, currentManageUserPhone, _profiles);
window.sendUserMsgOnly = () => sendUserMsgOnly(db, appId, currentManageUserPhone);
window.sendUserDiscountOnly = () => sendUserDiscountOnly(db, appId, currentManageUserPhone);
window.openUserDetails = (phone) => openUserDetails(phone, _profiles, _sessions, _discounts);

// ★ تحكم الأدمن في الأختام
window._adminAddStamp = async () => {
    const phone = window._adminDetailsPhone; if (!phone || !db) return;
    const prof = _profiles[phone]; if (!prof) return;
    const stamps = [...(prof.stamps || []), Date.now()];
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', phone), { stamps });
        prof.stamps = stamps;
        document.getElementById('detailsStamps').textContent = stamps.length;
        showMsg(`✅ تمت إضافة ختم لـ ${prof.name}`, 'success');
        logOperation(db, appId, currentShiftAdmin, 'إضافة ختم', `${prof.name} — الإجمالي: ${stamps.length}`);
    } catch(e) { showMsg('خطأ في الإضافة', 'error'); }
};

window._adminRemoveStamp = async () => {
    const phone = window._adminDetailsPhone; if (!phone || !db) return;
    const prof = _profiles[phone]; if (!prof) return;
    const stamps = (prof.stamps || []).slice(0, -1);
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', phone), { stamps });
        prof.stamps = stamps;
        document.getElementById('detailsStamps').textContent = stamps.length;
        showMsg(`تم حذف ختم من ${prof.name}`, 'info');
        logOperation(db, appId, currentShiftAdmin, 'حذف ختم', `${prof.name} — المتبقي: ${stamps.length}`);
    } catch(e) { showMsg('خطأ في الحذف', 'error'); }
};

window._adminToggleFreeDrink = async () => {
    const phone = window._adminDetailsPhone; if (!phone || !db) return;
    const prof = _profiles[phone]; if (!prof) return;
    const current = prof.freeDrinkUsed === true;
    const newVal = !current;
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', phone), { freeDrinkUsed: newVal });
        prof.freeDrinkUsed = newVal;
        if (!newVal) localStorage.removeItem(`first_visit_drink_${phone}`);
        else localStorage.setItem(`first_visit_drink_${phone}`, 'true');
        // تحديث الزر
        const btn = document.getElementById('adminFreeDrinkBtn');
        const txt = document.getElementById('adminFreeDrinkBtnText');
        if (btn) btn.className = `flex-1 text-xs font-black py-2 rounded-xl transition flex items-center justify-center gap-1 border-2 ${newVal ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100' : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'}`;
        if (txt) txt.textContent = newVal ? 'إعادة المشروب المجاني ↩' : 'تعطيل المشروب المجاني ✗';
        showMsg(newVal ? `🚫 تم إلغاء المشروب المجاني لـ ${prof.name}` : `✅ تم استعادة المشروب المجاني لـ ${prof.name}`, 'success');
        logOperation(db, appId, currentShiftAdmin, 'تعديل مشروب مجاني', `${prof.name} — ${newVal ? 'إلغاء' : 'استعادة'}`);
    } catch(e) { showMsg('خطأ في التعديل', 'error'); }
};
window.unbanPhone = (phone) => unbanPhone(phone, db, appId);
window.markPreBookingDone = (id) => markPreBookingDone(id, db, appId);
window.deleteAllHistory = () => deleteAllHistory(db, appId, _sessions);
window.deleteAllArchivedBookings = () => deleteAllArchivedBookings(db, appId, _prebookings);
window.exportTableToCSV = exportTableToCSV;
window.printInvoice = (id) => printInvoice(id, _sessions, sysSettings);
window.showEndDaySummary = () => showEndDaySummary(_sessions, sysSettings);
window.closeEndDaySummary = closeEndDaySummary;
window.printEndDaySummary = printEndDaySummary;
window.openNotifFullImg = window.openNotifFullImg;
window.openEventLanding = window.openEventLanding;
window.submitLandingAttend = window.submitLandingAttend;
window.toggleLandingEmbed = window.toggleLandingEmbed;
window.showEventIntentFromLogin = window.showEventIntentFromLogin;
window.submitEventIntent = window.submitEventIntent;
window.togglePlanActive = window.togglePlanActive;

// ★ تعديل وقت البدء لجلسة مكتملة من ملف العميل
window._adminEditSessionStart = async (sid) => {
    if (!db) return;
    const s = _sessions[sid]; if (!s) return;
    const d = new Date(s.startTime);
    const pad = n => String(n).padStart(2,'0');
    const current = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const newVal = prompt('تعديل وقت البدء (اتركه كما هو للإلغاء):', current);
    if (!newVal || newVal === current) return;
    const newStart = new Date(newVal).getTime();
    if (isNaN(newStart)) return showMsg('وقت غير صحيح','error');
    // أعد حساب المدة والتكلفة
    const endTime = s.endTime || Date.now();
    const newDurMs = Math.max(0, endTime - newStart);
    await updateDoc(doc(db,'artifacts',appId,'public','data','sessions',sid),{startTime:newStart, durationMs:newDurMs});
    showMsg('✅ تم تعديل وقت البدء وإعادة حساب المدة','success');
    logOperation(db,appId,currentShiftAdmin,'تعديل وقت بدء جلسة مكتملة','جلسة '+s.phone);
};

// ─── Full Image Viewer ────────────────────────────────────────────────────────
window.openNotifFullImg = (src) => {
    const modal = document.getElementById('fullImgModal');
    const img = document.getElementById('fullImgContent');
    if (modal && img && src) { img.src = src; modal.classList.remove('hidden'); }
};

// ─── Mask Beneficiary Name (اسم المستفيد مع إخفاء جزئي) ─────────────────────
function maskBeneficiaryName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    return parts.map((p, i) => {
        if (i === 0) return p; // الاسم الأول كاملاً
        if (p.length <= 1) return p;
        return p[0] + '*'.repeat(p.length - 1); // الحرف الأول + نجوم
    }).join(' ');
}

// Override vf pay display to show masked name + copy button
const _origToggleVfPay = window.toggleVfPay;
window.toggleVfPay = () => {
    _origToggleVfPay?.();
    const nameEl = document.getElementById('vfPayName');
    const numFull = document.getElementById('vfPayNumFull');
    const numEl = document.getElementById('vfPayNum');
    if (nameEl && sysSettings.vfName) nameEl.innerText = maskBeneficiaryName(sysSettings.vfName);
    if (numFull) numFull.innerText = sysSettings.vfNumber || '';
    if (numEl) numEl.innerText = sysSettings.vfNumber || '';
};

// Also patch sessions.js safeSet for vfPayName
const _origSafeSet = window.safeSet;
window.safeSet = (id, prop, val) => {
    if (id === 'vfPayName' && prop === 'innerText') {
        _origSafeSet(id, prop, maskBeneficiaryName(val));
    } else {
        _origSafeSet(id, prop, val);
    }
};

// ─── Smart Social Link Preview in Notification Panel ─────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const linkInput = document.getElementById('manageUserLinkUrl');
    if (linkInput) {
        linkInput.addEventListener('input', () => {
            const preview = document.getElementById('manageUserLinkPreview');
            if (!preview) return;
            const url = linkInput.value.trim();
            if (!url) { preview.classList.add('hidden'); return; }
            const p = detectSocialPlatform(url);
            preview.innerHTML = `<i class="fa-solid ${_esc(p.icon)}"></i> <span>سيظهر كزر: ${_esc(p.label)}</span>`;
            preview.className = `mb-2 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 text-white ${p.color}`;
            preview.classList.remove('hidden');
        });
    }
    // Init closed screen feedback type buttons styling
    window._closedFeedbackType('rating');
});

// ─── Event Intent From Login Screen ──────────────────────────────────────────
window.showEventIntentFromLogin = () => {
    // Check device limit: max 2 per device per day
    const today = new Date().toLocaleDateString('ar-EG');
    const key = `hola_event_intent_${today}`;
    const count = parseInt(localStorage.getItem(key) || '0');
    if (count >= 2) {
        showMsg("لقد سجّلت نية حضورك مرتين اليوم. يمكنك التسجيل غداً أو تسجيل الدخول.", "error");
        return;
    }

    // Find active events
    const activeEvents = [];
    for (let slot = 1; slot <= 3; slot++) {
        const k = (x) => slot === 1 ? x : `ev${slot}_${x}`;
        if (sysSettings[k('evActive')] && sysSettings[k('evTitle')]) {
            activeEvents.push({ slot, title: sysSettings[k('evTitle')], time: sysSettings[k('evTime')] });
        }
    }
    if (activeEvents.length === 0) { showMsg("لا توجد فعاليات نشطة حالياً", "error"); return; }

    // Build inline form in authContainer
    const container = document.getElementById('authContainer');
    if (!container) return;
    container.innerHTML = `
        <div class="bg-gradient-to-br from-hola-purple to-hola-dark p-5 text-white text-center">
            <div class="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-2xl mx-auto mb-2"><i class="fa-solid fa-masks-theater"></i></div>
            <h3 class="font-black text-lg">نية حضور فعالية</h3>
            <p class="text-xs text-purple-200">سجّل اهتمامك بالفعالية</p>
        </div>
        <div class="p-5 space-y-3">
            <div>
                <label class="block text-xs font-bold text-gray-700 mb-1">اختر الفعالية</label>
                <select id="intentEvSlot" class="w-full border-2 p-2.5 rounded-xl font-bold focus:border-hola-purple outline-none">
                    ${activeEvents.map(e => `<option value="${_esc(e.slot)}">🎉 ${_esc(e.title)} — ${_esc(e.time || '')}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-700 mb-1">اسمك</label>
                <input type="text" id="intentName" class="w-full border-2 p-2.5 rounded-xl font-bold focus:border-hola-purple outline-none" placeholder="اسمك الكريم">
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-700 mb-1">رقم هاتفك</label>
                <input type="tel" id="intentPhone" class="w-full border-2 p-2.5 rounded-xl font-mono font-bold text-left focus:border-hola-purple outline-none" placeholder="010..." dir="ltr">
            </div>
            <div class="flex items-center gap-2 bg-purple-50 p-2.5 rounded-xl border border-purple-100">
                <input type="checkbox" id="intentHasAccount" class="w-4 h-4 text-hola-purple">
                <label class="text-xs font-bold text-gray-600">لديّ حساب في Hola — سجّل على حسابي</label>
            </div>
            <button onclick="window.submitEventIntent()" class="w-full bg-hola-purple text-white font-black py-3.5 rounded-xl shadow-lg transition hover:bg-hola-dark">
                تأكيد نية الحضور <i class="fa-solid fa-hand-sparkles ml-1"></i>
            </button>
            <button onclick="window.resetLocationCheck()" class="w-full text-gray-400 font-bold text-xs hover:text-hola-orange transition flex items-center justify-center gap-1">
                <i class="fa-solid fa-arrow-right text-xs"></i> العودة
            </button>
        </div>`;
};

window.submitEventIntent = async () => {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    const slot = parseInt(document.getElementById('intentEvSlot')?.value) || 1;
    const name = document.getElementById('intentName')?.value.trim();
    const phone = document.getElementById('intentPhone')?.value.trim();
    const hasAccount = document.getElementById('intentHasAccount')?.checked;
    if (!name || !phone || phone.length < 10) return showMsg("أدخل اسمك ورقم هاتفك بشكل صحيح", "error");

    // Device limit check
    const today = new Date().toLocaleDateString('ar-EG');
    const key = `hola_event_intent_${today}`;
    const count = parseInt(localStorage.getItem(key) || '0');
    if (count >= 2) return showMsg("وصلت للحد الأقصى (مرتين يومياً)", "error");

    const k = (x) => slot === 1 ? x : `ev${slot}_${x}`;
    const evTitle = sysSettings[k('evTitle')] || 'الفعالية';
    const alreadyAttending = Object.values(_eventAttendees).some(a => a.phone === phone && a.slot === slot);
    if (alreadyAttending) return showMsg("هذا الرقم مسجّل مسبقاً في الفعالية!", "error");

    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'event_attendees'), {
            name, phone, timestamp: Date.now(), slot, evTitle,
            fromLogin: true, hasAccount
        });
        localStorage.setItem(key, String(count + 1));

        // If user has account, also add to their events notifications
        if (hasAccount && _profiles[phone]) {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
                phone, msg: `✅ تم تسجيل حضورك في "${evTitle}"!\n📅 ${sysSettings[k('evTime')] || ''}\nسنرسل لك تذكيراً قبل موعد الفعالية.`,
                type: 'congrats', isRead: false, timestamp: Date.now()
            });
        }

        showMsg(`تم تسجيل نية حضورك في "${evTitle}" 🎉`, "success");
        playAlertSound('congrats');
        // Reset to login
        setTimeout(() => window.resetLocationCheck(), 1500);
    } catch (e) { showMsg("حدث خطأ، حاول مرة أخرى", "error"); }
};

// ─── Render Active Events in Login Screen ────────────────────────────────────
window._renderLoginEvents = () => {
    const notifBanner = document.getElementById('loginEventNotifBanner');
    const intentBtn = document.getElementById('btnEventIntent');

    const activeEvs = Object.values(_smartEvents).filter(e => e.active).sort((a, b) => a.createdAt - b.createdAt);
    const firstEv = activeEvs[0] || null;

    if (!firstEv) {
        if (notifBanner) notifBanner.classList.add('hidden');
        if (intentBtn) intentBtn.classList.add('opacity-40', 'pointer-events-none');
        return;
    }
    if (intentBtn) intentBtn.classList.remove('opacity-40', 'pointer-events-none');

    // Inside auth card — prominent, attractive banner
    if (notifBanner) {
        notifBanner.innerHTML = `
        <div class="bg-gradient-to-l from-purple-700 to-hola-purple text-white rounded-2xl shadow-xl cursor-pointer hover:opacity-95 transition relative overflow-hidden"
             onclick="window.openSmartEventDetails('${firstEv.id}')">
            <div class="absolute inset-0 opacity-10" style="background-image:radial-gradient(circle,white 1px,transparent 1px);background-size:16px 16px;"></div>
            <div class="relative flex items-center gap-3 p-3">
                ${firstEv.img
                    ? `<img src="${firstEv.img}" class="w-12 h-12 rounded-xl object-cover border-2 border-white/20 flex-shrink-0 shadow">`
                    : `<div class="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">🎉</div>`}
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1 mb-0.5">
                        <span class="bg-hola-orange text-white text-[9px] px-2 py-0.5 rounded-full font-black animate-pulse">🎉 فعالية نشطة</span>
                    </div>
                    <p class="font-black text-sm truncate">${firstEv.title}</p>
                    <p class="text-[9px] text-purple-200 truncate">${firstEv.evTime || 'اضغط لمعرفة التفاصيل'}</p>
                </div>
                <span class="bg-white/20 text-white text-[10px] px-2 py-1 rounded-xl font-bold flex-shrink-0">عرض</span>
            </div>
        </div>`;
        notifBanner.classList.remove('hidden');
    }
};

// ─── Event Landing Page (Public Poster with Registration) ────────────────────
window.openEventLanding = (slot = 1) => {
    const k = (x) => slot === 1 ? x : `ev${slot}_${x}`;
    const title = sysSettings[k('evTitle')] || '';
    const desc = sysSettings[k('evDesc')] || '';
    const time = sysSettings[k('evTime')] || '';
    const img = sysSettings[k('evImg')] || '';

    safeSet('landingEvTitle', 'innerText', title);
    safeSet('landingEvTime', 'innerText', time);
    safeSet('landingEvDesc', 'innerText', desc);
    const imgEl = document.getElementById('landingEvImg');
    const imgWrap = document.getElementById('landingImgWrap');
    if (imgEl) { imgEl.src = img; if (!img) imgWrap?.style.setProperty('display','none'); else imgWrap?.style.removeProperty('display'); }

    // Set contact buttons
    const waNum = sysSettings.whatsappNum || '';
    const fbPage = sysSettings.fbPageLink || '';
    const waBtn = document.getElementById('landingWaBtn');
    const fbBtn = document.getElementById('landingFbBtn');
    if (waBtn && waNum) { waBtn.href = `https://wa.me/${waNum}?text=${encodeURIComponent(`مرحباً، أريد معرفة تفاصيل أكثر عن فعالية "${title}"`)}`;  waBtn.classList.remove('hidden'); }
    else if (waBtn) waBtn.classList.add('hidden');
    if (fbBtn && fbPage) { fbBtn.href = fbPage; fbBtn.classList.remove('hidden'); }
    else if (fbBtn) fbBtn.classList.add('hidden');

    // Set embed code
    const landingUrl = `${window.location.origin}${window.location.pathname}?ev=${slot}`;
    const embedCode = document.getElementById('landingEmbedCode');
    if (embedCode) embedCode.value = `<iframe src="${landingUrl}" width="100%" height="600" style="border:none;border-radius:16px;" title="${title}"></iframe>`;

    window._currentLandingSlot = slot;
    // Reset form
    safeSet('landingName', 'value', ''); safeSet('landingPhone', 'value', '');
    document.getElementById('landingHasAccount') && (document.getElementById('landingHasAccount').checked = false);
    const regMsg = document.getElementById('landingRegMsg'); if (regMsg) { regMsg.classList.add('hidden'); regMsg.innerText = ''; }
    const regDiv = document.getElementById('landingRegisterDiv'); if (regDiv) regDiv.classList.remove('hidden');
    safeSet('landingEvStatus', 'innerText', '🎉 سجّل حضورك الآن');
    document.getElementById('eventLandingModal')?.classList.remove('hidden');
};

window.submitLandingAttend = async () => {
    if (!db) return showMsg("غير متصل", "error");
    const slot = window._currentLandingSlot || 1;
    const name = document.getElementById('landingName')?.value.trim();
    const phone = document.getElementById('landingPhone')?.value.trim();
    const hasAccount = document.getElementById('landingHasAccount')?.checked;
    if (!name || !phone || phone.length < 10) return showMsg("أدخل اسمك ورقم هاتفك بشكل صحيح", "error");

    const k = (x) => slot === 1 ? x : `ev${slot}_${x}`;
    const evTitle = sysSettings[k('evTitle')] || 'الفعالية';
    const alreadyAttending = Object.values(_eventAttendees).some(a => a.phone === phone && a.slot === slot);
    if (alreadyAttending) {
        safeSet('landingEvStatus', 'innerText', '✅ مسجّل مسبقاً');
        const regMsg = document.getElementById('landingRegMsg');
        if (regMsg) { regMsg.innerText = `هذا الرقم مسجّل بالفعل في "${evTitle}"! سنتواصل معك قبل الموعد.`; regMsg.classList.remove('hidden'); }
        return;
    }
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'event_attendees'), {
            name, phone, timestamp: Date.now(), slot, evTitle, fromLanding: true, hasAccount
        });
        if (hasAccount && _profiles[phone]) {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
                phone, msg: `✅ تم تسجيل حضورك في "${evTitle}"!\n📅 ${sysSettings[k('evTime')] || ''}\nسنرسل لك تذكيراً قبل موعد الفعالية.`,
                type: 'congrats', isRead: false, timestamp: Date.now()
            });
        }
        document.getElementById('landingRegisterDiv')?.classList.add('hidden');
        safeSet('landingEvStatus', 'innerText', '✅ تم تسجيل حضورك!');
        const regMsg = document.getElementById('landingRegMsg');
        if (regMsg) { regMsg.innerText = `شكراً ${name}! تم تسجيل اسمك. سنتواصل معك على ${phone} قبل موعد الفعالية إن شاء الله 🎉`; regMsg.classList.remove('hidden'); regMsg.className = 'text-xs text-center mt-2 text-green-600 font-bold'; }
        playAlertSound('congrats');
        showMsg("تم تسجيل الحضور بنجاح", "success");
    } catch (e) { 
        console.error("Error submitting attendance: ", e);
        showMsg("حدث خطأ، حاول مرة أخرى", "error"); 
    }
};

window.toggleLandingEmbed = () => {
    const div = document.getElementById('landingEmbedDiv');
    if (div) div.classList.toggle('hidden');
};

// Handle URL param ?ev=N to auto-open event landing
(function checkEventUrlParam() {
    const params = new URLSearchParams(window.location.search);
    const evSlot = params.get('ev');
    if (evSlot && ['1','2','3'].includes(evSlot)) {
        // Wait for settings to load then open landing
        const tryOpen = () => {
            const k = (x) => evSlot === '1' ? x : `ev${evSlot}_${x}`;
            if (sysSettings[k('evTitle')]) window.openEventLanding(parseInt(evSlot));
            else setTimeout(tryOpen, 800);
        };
        setTimeout(tryOpen, 1200);
    }
})();

// ─── Patch sendUserMsgOnly to support embed and smart platform detection ──────
window._origSendUserMsg = window.sendUserMsgOnly;
window.sendUserMsgOnly = async () => {
    if (!db) return showMsg("غير متصل", "error");
    const phone = window._currentManageUserPhone || currentManageUserPhone || '';
    const msg = document.getElementById('manageUserMsg')?.value.trim();
    const type = document.getElementById('manageUserNotifType')?.value || 'normal';
    const imgUrl = document.getElementById('manageUserImgUrl')?.value.trim() || '';
    const linkUrl = document.getElementById('manageUserLinkUrl')?.value.trim() || '';
    const embedCode = document.getElementById('manageUserEmbedUrl')?.value.trim() || '';
    if (!phone) return showMsg("لم يتم تحديد عميل", "error");
    if (!msg) return showMsg("اكتب رسالة أولاً", "error");
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
            phone, msg, type, imgUrl: imgUrl || null, linkUrl: linkUrl || null,
            embedCode: embedCode || null, isRead: false, timestamp: Date.now()
        });
        showMsg("تم إرسال الإشعار بنجاح!", "success");
        const msgEl = document.getElementById('manageUserMsg'); if (msgEl) msgEl.value = '';
        const imgEl = document.getElementById('manageUserImgUrl'); if (imgEl) imgEl.value = '';
        const lkEl = document.getElementById('manageUserLinkUrl'); if (lkEl) lkEl.value = '';
        const emEl = document.getElementById('manageUserEmbedUrl'); if (emEl) emEl.value = '';
        const preview = document.getElementById('manageUserLinkPreview'); if (preview) preview.classList.add('hidden');
    } catch (e) { showMsg("حدث خطأ أثناء الإرسال", "error"); }
};

// ─── Patch renderClientNotifications in ui.js to support embed ───────────────
// Override the platform-aware link button in notification display
window._patchNotifLink = (linkUrl) => {
    if (!linkUrl) return '';
    const p = detectSocialPlatform(linkUrl);
    return `<a href="${linkUrl}" target="_blank" class="inline-flex items-center gap-2 ${p.color} text-white text-xs font-bold px-3 py-2 rounded-lg mt-2 hover:opacity-90 transition shadow-sm"><i class="fa-solid ${_esc(p.icon)}"></i> ${_esc(p.label)}</a>`;
};

// ─── Toggle plan active status ────────────────────────────────────────────────
window.togglePlanActive = async (planId, current) => {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'plans', planId), { active: !current });
    showMsg(current ? "تم إيقاف الباقة" : "تم تفعيل الباقة", "success");
};

// Toggle menu item availability (متوفر / غير متوفر)
window.toggleMenuItemAvailability = async (itemId, currentlyUnavailable) => {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', itemId), { unavailable: !currentlyUnavailable });
    showMsg(!currentlyUnavailable ? "⏸ تم إيقاف المنتج مؤقتاً" : "✅ تم تفعيل المنتج", "success");
};

// Toggle subscription/plan availability
window.togglePlanAvailability = async (planId, currentlyUnavailable) => {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'plans', planId), { unavailable: !currentlyUnavailable });
    showMsg(!currentlyUnavailable ? "⏸ تم إيقاف الاشتراك مؤقتاً" : "✅ تم تفعيل الاشتراك", "success");
};



window.updateSubDays = async (subId, newDays) => {
    if (!db) return;
    const days = parseInt(newDays) || 0;
    const newStatus = days <= 0 ? 'expired' : 'active';
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', subId), { 
        daysLeft: days, status: newStatus 
    });
    showMsg(days > 0 ? `تم تحديث الأيام إلى ${days}` : "تم انتهاء الاشتراك", "success");
};



// ─── Plan Appearance Customization ───────────────────────────────────────────
window.showEditPlanModal = (planId) => {
    const plan = _plans[planId]; if (!plan) return;
    window._editingPlanId = planId;
    const modal = document.getElementById('editPlanModal');
    if (!modal) {
        // Build modal dynamically
        const m = document.createElement('div');
        m.id = 'editPlanModal';
        m.className = 'hidden fixed inset-0 bg-black/60 z-[180] flex items-center justify-center p-4 print:hidden';
        m.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div class="bg-gradient-to-l from-hola-purple to-purple-800 text-white p-5">
                <h3 class="font-black text-lg">🎨 تخصيص مظهر الاشتراك</h3>
                <p id="editPlanModalName" class="text-xs text-purple-200 mt-1"></p>
            </div>
            <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-1"><i class="fa-solid fa-palette text-hola-purple ml-1"></i>لون الاشتراك</label>
                    <div class="flex items-center gap-3">
                        <input type="color" id="editPlanColor" value="#301043" class="w-12 h-10 rounded-lg border-2 cursor-pointer">
                        <div class="flex gap-2 flex-wrap">
                            ${['#301043','#f17200','#10b981','#3b82f6','#ec4899','#f59e0b','#6366f1'].map(c=>`<button onclick="document.getElementById('editPlanColor').value='${c}'" style="background:${c}" class="w-7 h-7 rounded-full border-2 border-white shadow-sm hover:scale-110 transition"></button>`).join('')}
                        </div>
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-1"><i class="fa-solid fa-icons text-hola-orange ml-1"></i>أيكون الاشتراك (Font Awesome)</label>
                    <div class="flex items-center gap-2">
                        <input type="text" id="editPlanIcon" class="flex-1 border-2 p-2 rounded-xl text-sm font-mono focus:border-hola-purple outline-none" placeholder="fa-crown">
                        <div class="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-xl" id="editPlanIconPreview"><i class="fa-solid fa-crown"></i></div>
                    </div>
                    <div class="flex gap-2 mt-2 flex-wrap">
                        ${['fa-crown','fa-star','fa-gem','fa-bolt','fa-fire','fa-rocket','fa-award','fa-medal'].map(ic=>`<button onclick="document.getElementById('editPlanIcon').value='${ic}';window._previewPlanIcon()" class="w-8 h-8 bg-gray-100 hover:bg-purple-100 rounded-lg flex items-center justify-center text-sm transition"><i class="fa-solid ${ic}"></i></button>`).join('')}
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-gray-700 mb-1"><i class="fa-solid fa-image text-blue-500 ml-1"></i>صورة هيدر (اختياري — يستبدل الأيكون)</label>
                    <input type="text" id="editPlanHeaderImg" class="w-full border-2 p-2 rounded-xl text-sm font-mono text-left focus:border-hola-purple outline-none" dir="ltr" placeholder="https://i.postimg.cc/...">
                    <p class="text-[10px] text-gray-400 mt-1">ارفع الصورة على postimages.org والصق الرابط</p>
                </div>
                <div class="flex gap-2 pt-2">
                    <button onclick="window.savePlanAppearance()" class="flex-1 bg-hola-purple text-white font-bold py-2.5 rounded-xl hover:bg-hola-dark transition">حفظ المظهر</button>
                    <button onclick="document.getElementById('editPlanModal').classList.add('hidden')" class="flex-1 bg-gray-100 text-gray-600 font-bold py-2.5 rounded-xl hover:bg-gray-200 transition">إلغاء</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(m);
        document.getElementById('editPlanIcon')?.addEventListener('input', window._previewPlanIcon);
    }
    const m2 = document.getElementById('editPlanModal');
    document.getElementById('editPlanModalName').innerText = plan.name;
    document.getElementById('editPlanColor').value = plan.color || '#301043';
    document.getElementById('editPlanIcon').value = plan.icon || 'fa-crown';
    document.getElementById('editPlanHeaderImg').value = plan.headerImg || '';
    window._previewPlanIcon();
    m2.classList.remove('hidden');
};

window._previewPlanIcon = () => {
    const icon = document.getElementById('editPlanIcon')?.value || 'fa-crown';
    const preview = document.getElementById('editPlanIconPreview');
    if (preview) preview.innerHTML = `<i class="fa-solid ${icon}"></i>`;
};

window.savePlanAppearance = async () => {
    if (!db || !window._editingPlanId) return;
    const color = document.getElementById('editPlanColor')?.value || '#301043';
    const icon = document.getElementById('editPlanIcon')?.value.trim() || 'fa-crown';
    const headerImg = document.getElementById('editPlanHeaderImg')?.value.trim() || '';
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'plans', window._editingPlanId), { color, icon, headerImg });
    document.getElementById('editPlanModal')?.classList.add('hidden');
    showMsg('✅ تم حفظ المظهر بنجاح', 'success');
};

window.rejectSubscription = async (subId) => {
    if (!db) return;
    const sub = _subscriptions[subId]; if (!sub) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', subId), { 
        status: 'cancelled', cancelledAt: Date.now() 
    });
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
        phone: sub.phone, 
        msg: `عذراً، تم رفض طلب اشتراكك في باقة "${sub.planName}". يمكنك إعادة التقديم بعد يومين.`,
        type: 'high', isRead: false, timestamp: Date.now()
    });
    showMsg("تم رفض الطلب وإشعار العميل", "info");
};


window.refreshNotifications = () => {
    if (!myProfile) return showMsg("يجب تسجيل الدخول أولاً", "error");
    showMsg("جاري تحديث الإشعارات...", "info");
    try {
        // ★ إعادة رسم الإشعارات من الحالة الحالية
        if (typeof window.renderClientNotifications === 'function') window.renderClientNotifications(myProfile, _notifications);
        else renderClientNotifications(myProfile, _notifications);
        // ★ تحديث badge الإشعارات
        const unread = Object.values(_notifications).filter(n => n.phone === myProfile.phone && !n.isRead).length;
        const badge = document.getElementById('headerNotifCount');
        if (badge) { badge.textContent = unread; badge.classList.toggle('hidden', unread === 0); }
        const badgeM = document.getElementById('headerNotifCountMobile');
        if (badgeM) { badgeM.textContent = unread; badgeM.classList.toggle('hidden', unread === 0); }
        const tabBadge = document.getElementById('notifTabBadge');
        if (tabBadge) { tabBadge.textContent = unread; tabBadge.classList.toggle('hidden', unread === 0); }
        showMsg("تم التحديث ✅", "success");
    } catch(e) { showMsg("تم التحديث", "success"); }
};

// ════════════════════════════════════════════════════════════
// ★ نظام الأختام — Celebration Popup
// ════════════════════════════════════════════════════════════
window._stampsCelebShownThisSession = false;

window._showStampsCelebration = (userName, stampsRequired) => {
    if (window._stampsCelebShownThisSession) return; // مرة واحدة لكل جلسة
    window._stampsCelebShownThisSession = true;

    const popup = document.getElementById('stampsCelebrationPopup');
    const content = document.getElementById('stampsCelebContent');
    const nameEl = document.getElementById('stampsCelebName');
    const dotsEl = document.getElementById('stampsCelebDots');
    const bar = document.getElementById('stampsCelebBar');

    if (!popup || !content) return;

    // اسم المستخدم
    if (nameEl) nameEl.innerHTML = `مبروك يا ${_esc(userName) || 'بطل'}! 👏`;

    // نقاط الأختام
    if (dotsEl) {
        const total = stampsRequired || 7;
        dotsEl.innerHTML = Array.from({length: total}, (_, i) =>
            `<span class="w-5 h-5 rounded-full bg-hola-orange shadow-md flex items-center justify-center text-white text-[10px] font-black" style="animation:stampPop 0.3s ease ${i*0.08}s both">✓</span>`
        ).join('');
    }

    popup.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => {
        content.style.transform = 'scale(1)';
        content.style.opacity = '1';
    }));

    // Auto dismiss bar animation
    if (bar) {
        setTimeout(() => {
            bar.style.transition = 'width 6s linear';
            bar.style.width = '0%';
        }, 100);
    }

    // Auto dismiss after 7s
    setTimeout(() => window._closeStampsCelebration(), 7000);

    // تشغيل صوت احتفالي
    playAlertSound('congrats');
};

window._closeStampsCelebration = () => {
    const popup = document.getElementById('stampsCelebrationPopup');
    const content = document.getElementById('stampsCelebContent');
    if (!popup) return;
    if (content) { content.style.transform = 'scale(0.9)'; content.style.opacity = '0'; }
    setTimeout(() => popup.classList.add('hidden'), 300);
};

// ─── Remote Mode (Outside Location) ──────────────────────────────────────────
window.activateRemoteMode = (phone) => {
    window._currentUserIsRemote = true;
    // Show remote badge in header
    document.getElementById('remoteBadge')?.classList.remove('hidden');
    // Fix header: show real name for remote users too
    const nameEl = document.getElementById('clientWelcomeName');
    const phoneEl = document.getElementById('clientWelcomePhone');
    // Get name from profiles if available
    const prof = window._profiles ? window._profiles[phone] : null;
    const displayName = (prof && prof.name) ? prof.name : 'العميل';
    if (nameEl) nameEl.innerText = `أهلاً، ${displayName}`;
    if (phoneEl) phoneEl.innerText = phone;
    // Change header avatar color to gray (remote indicator)
    const avatarDiv = document.getElementById('clientAvatarDiv');
    if (avatarDiv) { avatarDiv.className = 'w-12 h-12 bg-gray-700 text-white rounded-full flex items-center justify-center text-xl font-bold shadow-md border-2 border-amber-400'; }
    // Show remote tab, hide action tabs
    document.getElementById('c-tab-remote')?.classList.remove('hidden');
    document.getElementById('c-tab-session')?.classList.add('hidden');
    document.getElementById('c-tab-prebook')?.classList.add('hidden');
    // Switch to remote tab
    window.switchClientTab('remote');
    // Populate remote profile immediately
    if (window.populateRemoteProfile) window.populateRemoteProfile(phone);

    // Register remote user in Firebase for admin dashboard visibility
    _registerRemoteUser(phone);
};

// ─── Register Remote User in Firebase (for admin panel) ──────────────────────
async function _registerRemoteUser(phone) {
    if (!db || !phone) return;
    const prof = _profiles[phone];
    if (!prof) return;
    const deviceId = _getDeviceId();
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'remote_users', deviceId), {
            phone, name: prof.name || '', enteredAt: Date.now(), lastSeen: Date.now(), deviceId
        });
        // Cleanup on window close
        window.addEventListener('beforeunload', () => {
            navigator.sendBeacon && navigator.sendBeacon('/');
            _unregisterRemoteUser(deviceId);
        });
    } catch(e) {}
}

async function _unregisterRemoteUser(deviceId) {
    if (!db) return;
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'remote_users', deviceId)); } catch(e) {}
}

function _getDeviceId() {
    let id = localStorage.getItem('hola_device_id');
    if (!id) { id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2,6); localStorage.setItem('hola_device_id', id); }
    return id;
}

// ─── Location Tracking Every 5 Minutes ───────────────────────────────────────
let _locationWatchInterval = null;

function _getDistanceM(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function startLocationTracking() {
    if (_locationWatchInterval) clearInterval(_locationWatchInterval);
    _locationWatchInterval = setInterval(() => {
        if (!myProfile || myProfile.isRemote || !navigator.geolocation) return;
        if (!activeSessionId) return; // Only track if session is active
        navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            const tLat = parseFloat(sysSettings.workspaceLat);
            const tLng = parseFloat(sysSettings.workspaceLng);
            const radius = parseFloat(sysSettings.workspaceRadius) || 500;
            const dist = _getDistanceM(lat, lng, tLat, tLng);
            if (dist > radius) {
                // User left the workspace — transfer to remote mode
                showMsg("تم اكتشاف خروجك من المكان — تم تحويلك للملف البعيد", "error");
                const prev = myProfile;
                setMyProfile({ ...prev, isRemote: true });
                window._currentUserIsRemote = true;
                window.activateRemoteMode(prev.phone);
                clearInterval(_locationWatchInterval);
                _locationWatchInterval = null;
            }
        }, () => {}, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    }, 5 * 60 * 1000); // Every 5 minutes
}
window.startLocationTracking = startLocationTracking;

// ─── Pause / Schedule Pause Subscription ─────────────────────────────────────
window.pauseSubscriptionNow = async (subId) => {
    if (!db) return;
    const sub = _subscriptions[subId]; if (!sub || sub.status !== 'active') return;
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', subId), {
            status: 'paused', pausedAt: Date.now(), daysLeftBeforePause: sub.daysLeft
        });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
            phone: sub.phone, msg: `⏸ تم إيقاف اشتراكك "${sub.planName}" مؤقتاً. الأيام المتبقية (${sub.daysLeft}) محفوظة.`,
            type: 'normal', isRead: false, timestamp: Date.now()
        });
        showMsg("✅ تم الإيقاف المؤقت بنجاح", "success");
    } catch(e) { showMsg("حدث خطأ", "error"); }
};

window.resumeSubscription = async (subId) => {
    if (!db) return;
    const sub = _subscriptions[subId]; if (!sub || sub.status !== 'paused') return;
    try {
        const daysLeft = sub.daysLeftBeforePause || sub.daysLeft || 0;
        const newExpiry = Date.now() + daysLeft * 86400000;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', subId), {
            status: 'active', daysLeft, expiresAt: newExpiry, resumedAt: Date.now(), pausedAt: null, daysLeftBeforePause: null
        });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
            phone: sub.phone, msg: `▶️ تم استئناف اشتراكك "${sub.planName}". الأيام المتبقية: ${daysLeft} يوم.`,
            type: 'normal', isRead: false, timestamp: Date.now()
        });
        showMsg("تم استئناف الاشتراك بنجاح", "success");
    } catch(e) { showMsg("حدث خطأ", "error"); }
};

window.schedulePauseSubscription = async (subId) => {
    if (!db) return;
    const sub = _subscriptions[subId]; if (!sub) return;
    const dateStr = prompt("أدخل تاريخ الإيقاف المؤقت (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
    if (!dateStr) return;
    const schedDate = new Date(dateStr).getTime();
    if (isNaN(schedDate) || schedDate < Date.now()) return showMsg("تاريخ غير صحيح", "error");
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', subId), {
            scheduledPauseAt: schedDate
        });
        showMsg(`تم جدولة الإيقاف في ${new Date(schedDate).toLocaleDateString('ar-EG')}`, "success");
    } catch(e) { showMsg("حدث خطأ", "error"); }
};

// Check scheduled pauses on load
function _checkScheduledPauses() {
    const now = Date.now();
    Object.values(_subscriptions).forEach(sub => {
        if (sub.scheduledPauseAt && sub.status === 'active' && sub.scheduledPauseAt <= now) {
            window.pauseSubscriptionNow(sub.id);
        }
    });
}
window._checkScheduledPauses = _checkScheduledPauses;

// ─── Sub Action Modal (بطاقة / إيقاف / جدولة / إلغاء / استئناف) ──────────────
window.openSubActionModal = (subId) => {
    const sub = _subscriptions[subId]; if (!sub) return;
    window._currentSubActionId = subId;
    const isPaused = sub.status === 'paused';
    safeSet('subActionModalName', 'innerText', sub.name || sub.phone);
    safeSet('subActionModalPlan', 'innerText', `${sub.planName} — ${isPaused ? '⏸ موقوف مؤقتاً' : '✅ نشط'}`);
    // Show/hide pause vs resume
    const pauseBtn = document.getElementById('subActionPauseBtn');
    const resumeBtn = document.getElementById('subActionResumeBtn');
    if (pauseBtn) pauseBtn.classList.toggle('hidden', isPaused);
    if (resumeBtn) { resumeBtn.classList.toggle('hidden', !isPaused); resumeBtn.classList.toggle('flex', isPaused); }
    document.getElementById('subActionSchedulePicker')?.classList.add('hidden');
    document.getElementById('subActionModal')?.classList.remove('hidden');
};

window._subActionDo = async (action) => {
    const subId = window._currentSubActionId; if (!subId) return;
    if (action === 'card') {
        document.getElementById('subActionModal')?.classList.add('hidden');
        window.showSubCard(subId);
    } else if (action === 'pause') {
        document.getElementById('subActionModal')?.classList.add('hidden');
        await window.pauseSubscriptionNow(subId);
    } else if (action === 'resume') {
        document.getElementById('subActionModal')?.classList.add('hidden');
        await window.resumeSubscription(subId);
    } else if (action === 'schedule') {
        // Show inline date picker
        const picker = document.getElementById('subActionSchedulePicker');
        if (picker) { picker.classList.toggle('hidden'); }
        const dateInput = document.getElementById('subActionScheduleDate');
        if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().split('T')[0];
    } else if (action === 'cancel') {
        document.getElementById('subActionModal')?.classList.add('hidden');
        if (!confirm('إلغاء الاشتراك نهائياً؟ لا يمكن التراجع!')) return;
        if (!db) return;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', subId), { status: 'cancelled' });
        showMsg('تم إلغاء الاشتراك', 'success');
    }
};

window._subActionConfirmSchedule = async () => {
    const subId = window._currentSubActionId; if (!subId) return;
    const dateStr = document.getElementById('subActionScheduleDate')?.value;
    if (!dateStr) return showMsg('اختر تاريخاً', 'error');
    const schedDate = new Date(dateStr).getTime();
    if (isNaN(schedDate) || schedDate < Date.now()) return showMsg('تاريخ غير صحيح', 'error');
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', subId), { scheduledPauseAt: schedDate });
    showMsg(`✅ تم جدولة الإيقاف في ${new Date(schedDate).toLocaleDateString('ar-EG')}`, 'success');
    document.getElementById('subActionModal')?.classList.add('hidden');
};

// ─── Ban Note Save ────────────────────────────────────────────────────────────
window.saveBanNote = async (phone) => {
    if (!db) return;
    const note = document.getElementById(`ban-note-${phone}`)?.value.trim() || '';
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banned_phones', phone), { note });
        showMsg('تم حفظ الملاحظة', 'success');
    } catch(e) { showMsg('خطأ في الحفظ', 'error'); }
};

// ─── Create Smart Event ───────────────────────────────────────────────────────
window.createSmartEvent = async () => {
    if (!db) return;
    const title = document.getElementById('smartEvTitle')?.value.trim();
    const dateVal = document.getElementById('smartEvDate')?.value;
    const img = document.getElementById('smartEvImg')?.value.trim() || '';
    const desc = document.getElementById('smartEvDesc')?.value.trim() || '';
    const embed = document.getElementById('smartEvEmbed')?.value.trim() || '';
    const waLink = document.getElementById('smartEvWa')?.value.trim() || '';
    const fbLink = document.getElementById('smartEvFb')?.value.trim() || '';
    const igLink = document.getElementById('smartEvIg')?.value.trim() || '';
    const price = parseInt(document.getElementById('smartEvPrice')?.value) || 0;
    if (!title) return showMsg('أدخل اسم الفعالية', 'error');
    if (!dateVal) return showMsg('اختر تاريخ ووقت الفعالية', 'error');
    const evTime = new Date(dateVal).toLocaleString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    try {
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'smart_events'), {
            title, desc, img, embed, waLink, fbLink, igLink, dateVal, evTime, price, active: true, createdAt: Date.now(), attendees: 0,
            formFields: [] // default empty form, admin can add fields later
        });
        // Generate ticket URL
        const baseUrl = window.location.href.split('?')[0];
        const ticketUrl = `${baseUrl}?sev=${docRef.id}`;
        // Update with ticket URL
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'smart_events', docRef.id), { ticketUrl });
        ['smartEvTitle', 'smartEvDate', 'smartEvImg', 'smartEvDesc', 'smartEvEmbed', 'smartEvWa', 'smartEvFb', 'smartEvIg'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const priceEl = document.getElementById('smartEvPrice'); if (priceEl) priceEl.value = '';
        showMsg('✅ تم نشر الفعالية! يمكنك مشاركة رابط التذكرة الآن', 'success');
        logOperation(db, appId, currentShiftAdmin, 'إنشاء فعالية', `فعالية: ${title}`);
        // Auto-open share modal for the new event
        setTimeout(() => window.shareSmartEvent(docRef.id), 500);
    } catch(e) { showMsg('خطأ في النشر', 'error'); console.error(e); }
};

window.toggleSmartEvent = async (id, active) => {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'smart_events', id), { active });
    showMsg(active ? 'تم تفعيل الفعالية' : 'تم إخفاء الفعالية', 'success');
};

window.deleteSmartEvent = async (id) => {
    if (!db || !confirm('حذف هذه الفعالية؟')) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'smart_events', id));
    showMsg('تم حذف الفعالية', 'success');
};

// ─── Smart Event Detail Modal ─────────────────────────────────────────────────
window.openSmartEventDetails = (id) => {
    const ev = _smartEvents[id]; if (!ev) return;
    window._currentSmartEvId = id;
    const modal = document.getElementById('eventDetailsModal'); if (!modal) return;
    const price = ev.price || 0;

    modal.querySelector('.bg-white').innerHTML = `
        <div class="relative flex-shrink-0">
            ${ev.img ? `
            <div id="posterFlipCard" onclick="window._flipPosterCard()"
                style="height:90px;perspective:800px;cursor:pointer;position:relative;overflow:hidden;background:#1a1a2e;"
                class="w-full">
                <div id="posterFront" style="position:absolute;inset:0;backface-visibility:hidden;transition:transform 0.7s cubic-bezier(.4,0,.2,1);transform-style:preserve-3d;">
                    <img src="${ev.img}" alt="" style="width:100%;height:100%;object-fit:cover;filter:blur(3px) brightness(0.5);transform:scale(1.08);">
                    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:10px;">
                        <span style="font-size:20px;">🎴</span>
                        <span style="color:#fff;font-weight:900;font-size:13px;text-shadow:0 1px 8px #000;">اضغط لعرض البوستر كاملاً</span>
                        <span style="font-size:20px;">🎴</span>
                    </div>
                </div>
                <div id="posterBack" style="position:absolute;inset:0;backface-visibility:hidden;transform:rotateY(180deg);transition:transform 0.7s cubic-bezier(.4,0,.2,1);transform-style:preserve-3d;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                    <img src="${ev.img}" alt="بوستر الفعالية" style="width:100%;height:100%;object-fit:contain;max-height:70vw;">
                    <div style="position:absolute;bottom:6px;left:8px;background:rgba(0,0,0,0.55);color:#fff;font-size:10px;padding:2px 8px;border-radius:20px;backdrop-filter:blur(4px);">اضغط للطي</div>
                </div>
            </div>
            ` : ''}
            <button type="button" onclick="event.stopPropagation();document.getElementById('eventDetailsModal').classList.add('hidden')"
                class="absolute top-2 left-2 bg-black/50 hover:bg-black/80 text-white w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm transition z-20">
                <i class="fa-solid fa-xmark text-lg"></i>
            </button>
            ${!ev.img ? `<div class="flex justify-between items-center p-4 border-b"><span class="text-2xl">🎉</span></div>` : ''}
        </div>
        <div class="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
                <h4 class="text-xl font-black text-hola-purple leading-snug mb-1">${ev.title || ''}</h4>
                <p class="text-sm font-bold text-hola-orange flex items-center gap-1.5">
                    <i class="fa-solid fa-calendar-clock"></i><span>${ev.evTime || ''}</span>
                </p>
            </div>
            ${price > 0
                ? `<div class="bg-hola-orange/10 border border-hola-orange/30 rounded-xl px-4 py-2 flex items-center gap-2"><i class="fa-solid fa-ticket text-hola-orange"></i><span class="font-black text-hola-orange text-sm">سعر الحضور: ${price} ج.م</span></div>`
                : `<div class="bg-green-50 border border-green-200 rounded-xl px-4 py-2 flex items-center gap-2"><i class="fa-solid fa-gift text-green-600"></i><span class="font-black text-green-600 text-sm">الدخول مجاني!</span></div>`}
            ${ev.desc ? `<p class="text-sm text-gray-600 leading-relaxed font-bold whitespace-pre-line bg-gray-50 rounded-xl p-3 border border-gray-100">${_esc(ev.desc)}</p>` : ''}
            ${ev.embed ? `<div class="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">${ev.embed}</div>` : ''}
            <div class="flex gap-2 flex-wrap">
                ${ev.fbLink ? `<a href="${ev.fbLink}" target="_blank" class="flex-1 min-w-[80px] bg-blue-600 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-blue-700 transition"><i class="fa-brands fa-facebook"></i> فيسبوك</a>` : ''}
                ${(ev.waLink || sysSettings.whatsappNum) ? `<a href="https://wa.me/${ev.waLink || sysSettings.whatsappNum}?text=${encodeURIComponent('مرحباً، أريد معرفة تفاصيل فعالية "' + ev.title + '"')}" target="_blank" class="flex-1 min-w-[80px] bg-green-600 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 hover:bg-green-700 transition"><i class="fa-brands fa-whatsapp"></i> واتساب</a>` : ''}
                ${ev.igLink ? `<a href="${ev.igLink}" target="_blank" class="flex-1 min-w-[80px] text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5" style="background:linear-gradient(135deg,#6366f1,#ec4899)"><i class="fa-brands fa-instagram"></i> انستا</a>` : ''}
            </div>
            <div class="space-y-2 pt-1">
                <button type="button" onclick="window.attendSmartEvent('${id}')"
                    class="w-full bg-hola-purple hover:bg-hola-dark text-white font-black py-4 rounded-2xl shadow-lg transition text-base flex items-center justify-center gap-2">
                    <i class="fa-solid fa-hand-sparkles"></i> تأكيد نية الحضور
                </button>
                <button type="button" onclick="window.shareSmartEvent('${id}')"
                    class="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-2xl transition text-sm flex items-center justify-center gap-2">
                    <i class="fa-solid fa-share-nodes text-hola-orange"></i> مشاركة الفعالية
                </button>
            </div>
        </div>`;

    modal.classList.remove('hidden');
};

// Card-flip poster toggle
window._flipPosterCard = () => {
    const front = document.getElementById('posterFront');
    const back = document.getElementById('posterBack');
    const card = document.getElementById('posterFlipCard');
    if (!front || !back || !card) return;
    const isFlipped = front.style.transform === 'rotateY(-180deg)';
    if (isFlipped) {
        // Fold back
        front.style.transform = 'rotateY(0deg)';
        back.style.transform = 'rotateY(180deg)';
        setTimeout(() => { card.style.height = '90px'; }, 50);
    } else {
        // Expand height first, then flip
        const img = back.querySelector('img');
        const naturalRatio = img ? (img.naturalHeight / img.naturalWidth) : 1.4;
        const targetH = Math.min(window.innerWidth * naturalRatio, window.innerHeight * 0.72);
        card.style.transition = 'height 0.35s ease';
        card.style.height = Math.max(targetH, 220) + 'px';
        setTimeout(() => {
            front.style.transform = 'rotateY(-180deg)';
            back.style.transform = 'rotateY(0deg)';
        }, 180);
    }
};

// Toggle poster full view on click
window._togglePosterFull = (wrapper) => {
    const img = wrapper.querySelector('img');
    if (!img) return;
    const isFull = img.style.maxHeight === 'none';
    if (isFull) {
        img.style.maxHeight = '56vw';
        img.style.minHeight = '160px';
        img.style.objectFit = 'cover';
        wrapper.querySelector('div:last-child')?.classList.remove('hidden');
    } else {
        img.style.maxHeight = 'none';
        img.style.minHeight = '';
        img.style.objectFit = 'contain';
        img.style.background = '#000';
        wrapper.querySelector('div:last-child')?.classList.add('hidden');
    }
};

window.attendSmartEvent = async (id) => {
    const ev = _smartEvents[id]; if (!ev) return;
    if (!myProfile) { showMsg('يجب تسجيل الدخول أولاً', 'error'); return; }
    const already = Object.values(_eventAttendees).some(a => a.eventId === id && a.phone === myProfile.phone);
    if (already) { showMsg('أنت مسجّل بالفعل في هذه الفعالية ✅', 'info'); return; }
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'event_attendees'), {
            name: myProfile.name, phone: myProfile.phone, timestamp: Date.now(), eventId: id, evTitle: ev.title, slot: 0
        });
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'smart_events', id), { attendees: (ev.attendees || 0) + 1 });
        showMsg('✅ تم تسجيل حضورك!', 'success');
    } catch(e) { showMsg('خطأ', 'error'); }
};

window.shareSmartEvent = (id) => {
    const ev = _smartEvents[id]; if (!ev) return;
    const baseUrl = window.location.href.split('?')[0];
    const eventUrl = ev.ticketUrl || `${baseUrl}?sev=${id}`;
    const fbLink = ev.fbLink || sysSettings.fbPageLink || '';
    const waNum = ev.waLink || sysSettings.whatsappNum || '';
    const igLink = ev.igLink || sysSettings.igPageLink || '';
    const shareText = `🎉 ${ev.title}\n📅 ${ev.evTime || ''}\n\n${ev.desc || ''}\n\n📍 Hola Workspace\n🔗 ${eventUrl}${waNum ? `\n📱 واتساب: wa.me/${waNum}` : ''}`;
    _showEventTicket(ev, eventUrl, fbLink, waNum, igLink, shareText);
};

// ─── Smart Event Ticket Landing Page ─────────────────────────────────────────
// Called when URL has ?sev=ID
window._openSmartEventTicketPage = (evId) => {
    const ev = _smartEvents[evId];
    if (!ev) {
        // Wait for data then retry
        setTimeout(() => window._openSmartEventTicketPage(evId), 600);
        return;
    }
    window._ticketEvId = evId;
    _buildTicketPage(ev);
};

function _buildTicketPage(ev) {
    // Full-screen ticket page overlay
    let overlay = document.getElementById('eventTicketPage');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'eventTicketPage';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;overflow-y:auto;background:#f3f0fa;';
        document.body.appendChild(overlay);
    }
    const price = ev.price || 0;
    const priceDisplay = price > 0
        ? `<div class="bg-hola-orange text-white font-black text-center py-2 text-sm rounded-xl mt-2"><i class="fa-solid fa-ticket ml-1"></i>سعر الحضور: ${price} ج.م</div>`
        : `<div class="bg-green-500 text-white font-black text-center py-2 text-sm rounded-xl mt-2"><i class="fa-solid fa-gift ml-1"></i>الدخول مجاني!</div>`;
    
    const countdown = `<div id="ticketCountdown" class="text-center bg-white rounded-2xl p-3 border border-purple-100 shadow-sm mt-3">
        <p class="text-xs text-gray-500 font-bold mb-1">⏳ باقي على الفعالية</p>
        <p id="countdownDisplay" class="font-black text-hola-purple text-lg">جاري الحساب...</p>
    </div>`;

    // Build form fields HTML
    const formFields = ev.formFields || [];
    let formHTML = '';
    if (formFields.length > 0) {
        formHTML = formFields.map((f, i) => {
            if (f.type === 'text') return `<div><label class="block text-xs font-bold text-gray-700 mb-1">${_esc(f.label)}${f.required ? ' *' : ''}</label><input type="text" id="evFormField_${i}" class="w-full border-2 p-2.5 rounded-xl focus:border-hola-purple outline-none text-sm" placeholder="${f.placeholder || ''}"></div>`;
            if (f.type === 'phone') return `<div><label class="block text-xs font-bold text-gray-700 mb-1">${_esc(f.label)}${f.required ? ' *' : ''}</label><input type="tel" id="evFormField_${i}" class="w-full border-2 p-2.5 rounded-xl focus:border-hola-purple outline-none text-sm font-mono text-left" dir="ltr" placeholder="010..."></div>`;
            if (f.type === 'select') return `<div><label class="block text-xs font-bold text-gray-700 mb-1">${_esc(f.label)}${f.required ? ' *' : ''}</label><select id="evFormField_${i}" class="w-full border-2 p-2.5 rounded-xl focus:border-hola-purple outline-none text-sm"><option value="">اختر...</option>${(f.options||[]).map(o=>`<option value="${o}">${o}</option>`).join('')}</select></div>`;
            return '';
        }).join('');
    }

    overlay.innerHTML = `
    <div class="min-h-screen max-w-md mx-auto pb-8">
        <!-- Ticket Card -->
        <div class="bg-white rounded-none shadow-xl overflow-hidden" style="min-height:100vh;">
            <!-- Header Poster -->
            <div class="bg-gradient-to-b from-hola-purple via-purple-800 to-purple-900 relative overflow-hidden" style="min-height:220px;">
                <div class="absolute inset-0 opacity-10" style="background-image:radial-gradient(circle,white 1px,transparent 1px);background-size:20px 20px;"></div>
                ${ev.img ? `
                <!-- Flippable Ticket Image -->
                <div id="ticketImgWrap" class="relative cursor-pointer flex items-center justify-center py-6" onclick="window._flipTicket()">
                    <div id="ticketFlipContainer" style="perspective:1000px;width:100%;max-width:320px;margin:0 auto;transition:transform 0.7s;transform-style:preserve-3d;">
                        <img src="${ev.img}" id="ticketPosterImg" class="w-full rounded-2xl shadow-2xl border-4 border-white/20 relative z-10" style="max-height:300px;object-fit:cover;">
                    </div>
                    <p class="absolute bottom-2 right-2 bg-black/50 text-white text-[9px] px-2 py-0.5 rounded-full">👆 اضغط لعرض البوستر كاملاً</p>
                </div>` : `<div class="flex items-center justify-center py-12 text-6xl">🎉</div>`}
                <div class="relative z-10 px-5 pb-5">
                    <div class="bg-hola-orange/90 text-white text-[10px] px-3 py-0.5 rounded-full font-black inline-block mb-2">🎉 دعوة حضور</div>
                    <h1 class="text-white font-black text-2xl leading-tight">${ev.title}</h1>
                    <p class="text-purple-200 text-sm font-bold mt-1"><i class="fa-regular fa-clock ml-1"></i>${ev.evTime || ''}</p>
                    <p class="text-purple-200 text-xs font-bold mt-0.5"><i class="fa-solid fa-location-dot ml-1"></i>Hola Workspace</p>
                </div>
            </div>
            
            <!-- Dashed separator -->
            <div class="flex items-center px-4 bg-white">
                <div class="w-5 h-5 bg-purple-50 rounded-full -mr-2.5 border-2 border-purple-100 flex-shrink-0"></div>
                <div class="flex-1 border-t-2 border-dashed border-purple-100 mx-1"></div>
                <div class="w-5 h-5 bg-purple-50 rounded-full -ml-2.5 border-2 border-purple-100 flex-shrink-0"></div>
            </div>
            
            <!-- Ticket Body -->
            <div class="bg-white px-5 py-4 space-y-4">
                ${countdown}
                ${priceDisplay}
                
                ${ev.desc ? `<div class="bg-purple-50 rounded-2xl p-4 border border-purple-100"><p class="text-sm text-gray-700 font-bold leading-relaxed">${ev.desc}</p></div>` : ''}
                
                ${ev.embed ? `<div class="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">${ev.embed}</div>` : ''}
                
                <!-- Social Links -->
                <div class="flex justify-center gap-3">
                    ${ev.fbLink ? `<a href="${ev.fbLink}" target="_blank" class="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow hover:opacity-90 transition"><i class="fa-brands fa-facebook"></i></a>` : ''}
                    ${ev.waLink ? `<a href="https://wa.me/${ev.waLink}" target="_blank" class="w-10 h-10 bg-green-500 text-white rounded-xl flex items-center justify-center shadow hover:opacity-90 transition"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
                    ${ev.igLink ? `<a href="${ev.igLink}" target="_blank" class="w-10 h-10 rounded-xl flex items-center justify-center shadow hover:opacity-90 transition text-white" style="background:linear-gradient(135deg,#6366f1,#ec4899)"><i class="fa-brands fa-instagram"></i></a>` : ''}
                </div>
                
                <!-- Registration Form -->
                <div id="ticketRegDiv">
                    <div class="bg-gradient-to-l from-hola-purple to-purple-700 text-white rounded-2xl p-4 mb-3">
                        <h3 class="font-black text-base mb-1"><i class="fa-solid fa-hand-sparkles ml-2"></i>سجّل حضورك</h3>
                        <p class="text-purple-200 text-xs">أدخل بياناتك للتسجيل في الفعالية</p>
                    </div>
                    
                    <!-- Progress Bar -->
                    <div class="mb-4">
                        <div class="flex justify-between text-[10px] text-gray-500 font-bold mb-1">
                            <span>تقدم التسجيل</span>
                            <span id="ticketFormProgress">0%</span>
                        </div>
                        <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div id="ticketProgressBar" class="h-full bg-gradient-to-l from-hola-orange to-orange-400 rounded-full transition-all duration-500" style="width:0%"></div>
                        </div>
                    </div>
                    
                    <div class="space-y-3" id="ticketFormFields" oninput="window._updateTicketProgress()">
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">الاسم الكريم *</label>
                            <input type="text" id="ticketName" class="w-full border-2 p-2.5 rounded-xl focus:border-hola-purple outline-none text-sm" placeholder="اسمك بالكامل">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-700 mb-1">رقم الهاتف *</label>
                            <input type="tel" id="ticketPhone" class="w-full border-2 p-2.5 rounded-xl focus:border-hola-purple outline-none text-sm font-mono text-left" dir="ltr" placeholder="010...">
                        </div>
                        ${formHTML}
                    </div>
                    
                    <button onclick="window._submitTicketForm('${ev.id || window._ticketEvId}')" class="w-full bg-hola-orange text-white font-black py-4 rounded-2xl shadow-lg hover:bg-orange-600 transition mt-4 text-base flex items-center justify-center gap-2">
                        <i class="fa-solid fa-check-circle text-xl"></i> تأكيد الحضور
                    </button>
                    <p class="text-[10px] text-gray-400 text-center mt-2">يمكنك التسجيل مرة واحدة فقط لكل فعالية</p>
                </div>
                
                <div id="ticketSuccessDiv" class="hidden text-center py-6">
                    <div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-4 animate-bounce">🎉</div>
                    <h3 class="font-black text-xl text-green-600 mb-2">تم تسجيل حضورك!</h3>
                    <p class="text-sm text-gray-600 font-bold leading-relaxed" id="ticketSuccessMsg"></p>
                </div>
                
                <!-- Back link -->
                <a href="${window.location.href.split('?')[0]}" class="block text-center text-xs text-gray-400 hover:text-hola-purple transition font-bold pt-2">
                    <i class="fa-solid fa-home ml-1"></i> العودة لـ Hola Workspace
                </a>
            </div>
        </div>
    </div>`;

    // Start countdown
    _startTicketCountdown(ev.dateVal);
    // Track progress
    window._updateTicketProgress = () => {
        const name = document.getElementById('ticketName')?.value.trim();
        const phone = document.getElementById('ticketPhone')?.value.trim();
        const filled = (name ? 1 : 0) + (phone?.length >= 10 ? 1 : 0);
        const total = 2 + (ev.formFields?.filter(f=>f.required)?.length || 0);
        const pct = Math.round((filled / total) * 100);
        const bar = document.getElementById('ticketProgressBar');
        const label = document.getElementById('ticketFormProgress');
        if (bar) bar.style.width = pct + '%';
        if (label) label.textContent = pct + '%';
    };
}

function _startTicketCountdown(dateVal) {
    if (!dateVal) return;
    const target = new Date(dateVal).getTime();
    const el = document.getElementById('countdownDisplay');
    if (!el) return;
    function tick() {
        const now = Date.now();
        const diff = target - now;
        if (diff <= 0) { el.textContent = '🔴 الفعالية بدأت!'; el.className = 'font-black text-red-500 text-lg'; return; }
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        el.textContent = days > 0 ? `${days} يوم ${hours} س ${mins} د` : `${hours}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    }
    tick();
    setInterval(tick, 1000);
}

window._flipTicket = () => {
    const img = document.getElementById('ticketPosterImg');
    const hint = document.getElementById('flipHint') || img?.parentElement?.querySelector('p');
    const wrap = document.getElementById('ticketImgWrap');
    if (!img) return;
    const isFull = img.dataset.full === 'true';
    if (isFull) {
        // Collapse back
        img.style.maxHeight = '220px';
        img.style.objectFit = 'cover';
        img.style.background = '';
        img.style.borderRadius = '1rem';
        if (hint) hint.textContent = '👆 اضغط لعرض البوستر كاملاً';
        if (wrap) wrap.style.background = '';
        img.dataset.full = 'false';
    } else {
        // Expand to full poster
        img.style.maxHeight = '90vh';
        img.style.objectFit = 'contain';
        img.style.background = 'rgba(0,0,0,0.9)';
        img.style.borderRadius = '0';
        if (hint) hint.textContent = '👆 اضغط للتصغير';
        if (wrap) wrap.style.background = 'rgba(0,0,0,0.8)';
        img.dataset.full = 'true';
    }
};

window._submitTicketForm = async (evId) => {
    if (!db) return showMsg('غير متصل', 'error');
    const ev = _smartEvents[evId]; if (!ev) return;
    const name = document.getElementById('ticketName')?.value.trim();
    const phone = document.getElementById('ticketPhone')?.value.trim();
    if (!name) return showMsg('أدخل اسمك أولاً', 'error');
    if (!phone || phone.length < 10) return showMsg('أدخل رقم هاتفك بشكل صحيح', 'error');
    
    // One submission per phone per event
    const alreadyReg = Object.values(_eventAttendees).some(a => a.eventId === evId && a.phone === phone);
    if (alreadyReg) {
        const sDiv = document.getElementById('ticketRegDiv');
        const succDiv = document.getElementById('ticketSuccessDiv');
        if (sDiv) sDiv.classList.add('hidden');
        if (succDiv) { succDiv.classList.remove('hidden'); document.getElementById('ticketSuccessMsg').textContent = `أنت مسجّل بالفعل في "${ev.title}" 🎉`; }
        return;
    }
    
    // Collect extra form fields
    const extraData = {};
    const formFields = ev.formFields || [];
    for (let i = 0; i < formFields.length; i++) {
        const f = formFields[i];
        const val = document.getElementById(`evFormField_${i}`)?.value?.trim() || '';
        if (f.required && !val) return showMsg(`حقل "${f.label}" مطلوب`, 'error');
        extraData[f.label] = val;
    }
    
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'event_attendees'), {
            name, phone, timestamp: Date.now(), eventId: evId, evTitle: ev.title, slot: 0,
            fromTicketPage: true, extraData
        });
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'smart_events', evId), { attendees: (ev.attendees || 0) + 1 });
        // Notify if profile exists
        if (_profiles[phone]) {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
                phone, msg: `✅ تم تسجيل حضورك في "${ev.title}"!\n📅 ${ev.evTime || ''}`, type: 'congrats', isRead: false, timestamp: Date.now()
            });
        }
        const sDiv = document.getElementById('ticketRegDiv');
        const succDiv = document.getElementById('ticketSuccessDiv');
        if (sDiv) sDiv.classList.add('hidden');
        if (succDiv) {
            succDiv.classList.remove('hidden');
            document.getElementById('ticketSuccessMsg').textContent = `شكراً ${name}! تم تسجيلك في "${ev.title}". سنتواصل معك على ${phone} قبل الموعد 🎉`;
        }
        playAlertSound('congrats');
    } catch(e) { showMsg('حدث خطأ، حاول مرة أخرى', 'error'); console.error(e); }
};

// ─── Event Form Builder (Admin) ───────────────────────────────────────────────
window.openEventFormBuilder = (evId) => {
    const ev = _smartEvents[evId]; if (!ev) return;
    window._formBuilderEvId = evId;
    let modal = document.getElementById('eventFormBuilderModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'eventFormBuilderModal';
        modal.className = 'hidden fixed inset-0 bg-black/70 z-[400] flex items-center justify-center p-4 overflow-y-auto';
        modal.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden my-4">
            <div class="bg-gradient-to-l from-hola-purple to-purple-800 text-white p-5 flex justify-between items-center">
                <div><h3 class="font-black text-lg">📋 بناء فورم التسجيل</h3><p id="formBuilderEvName" class="text-xs text-purple-200 mt-0.5"></p></div>
                <button onclick="document.getElementById('eventFormBuilderModal').classList.add('hidden')" class="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                <div id="formBuilderFields" class="space-y-2"></div>
                <div class="bg-gray-50 rounded-2xl p-4 border-2 border-dashed border-gray-200">
                    <p class="text-xs font-black text-gray-600 mb-3">➕ إضافة حقل جديد</p>
                    <div class="grid grid-cols-2 gap-2 mb-3">
                        <div><label class="block text-[10px] font-bold text-gray-600 mb-1">نوع الحقل</label>
                            <select id="newFieldType" class="w-full border-2 p-2 rounded-xl text-sm focus:border-hola-purple outline-none">
                                <option value="text">نص حر</option>
                                <option value="phone">رقم هاتف</option>
                                <option value="select">قائمة منسدلة</option>
                            </select>
                        </div>
                        <div><label class="block text-[10px] font-bold text-gray-600 mb-1">اسم الحقل</label>
                            <input type="text" id="newFieldLabel" class="w-full border-2 p-2 rounded-xl text-sm focus:border-hola-purple outline-none" placeholder="مثال: اسم الشركة">
                        </div>
                    </div>
                    <div id="newFieldOptionsDiv" class="hidden mb-3">
                        <label class="block text-[10px] font-bold text-gray-600 mb-1">الخيارات (مفصولة بفاصلة)</label>
                        <input type="text" id="newFieldOptions" class="w-full border-2 p-2 rounded-xl text-sm focus:border-hola-purple outline-none" placeholder="خيار 1, خيار 2, خيار 3">
                    </div>
                    <div class="flex items-center gap-2 mb-3">
                        <input type="checkbox" id="newFieldRequired" class="w-4 h-4">
                        <label class="text-xs font-bold text-gray-700">حقل إجباري</label>
                    </div>
                    <button onclick="window._addFormField()" class="w-full bg-hola-purple text-white font-bold py-2 rounded-xl text-sm hover:bg-hola-dark transition">إضافة الحقل ✅</button>
                </div>
                <button onclick="window._saveEventForm()" class="w-full bg-hola-orange text-white font-black py-3 rounded-xl hover:bg-orange-600 transition">💾 حفظ الفورم</button>
            </div>
        </div>`;
        // Show options div only for select type
        modal.querySelector('#newFieldType')?.addEventListener('change', (e) => {
            document.getElementById('newFieldOptionsDiv')?.classList.toggle('hidden', e.target.value !== 'select');
        });
        document.body.appendChild(modal);
    }
    document.getElementById('formBuilderEvName').textContent = ev.title;
    window._renderFormBuilderFields(ev.formFields || []);
    document.getElementById('eventFormBuilderModal').classList.remove('hidden');
};

window._renderFormBuilderFields = (fields) => {
    const div = document.getElementById('formBuilderFields');
    if (!div) return;
    if (fields.length === 0) { div.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">لا توجد حقول إضافية — الاسم والهاتف مضافان تلقائياً</p>'; return; }
    div.innerHTML = fields.map((f, i) => `
        <div class="flex items-center gap-2 bg-gray-50 border rounded-xl p-3">
            <span class="text-xs font-bold text-gray-500">${f.type === 'text' ? '✏️' : f.type === 'phone' ? '📞' : '📋'}</span>
            <span class="flex-1 text-sm font-bold">${f.label} ${f.required ? '<span class="text-red-500">*</span>' : ''}</span>
            ${f.type === 'select' ? `<span class="text-[9px] text-gray-400">[${(f.options||[]).join(', ')}]</span>` : ''}
            <button onclick="window._removeFormField(${i})" class="text-red-400 hover:text-red-600 w-6 h-6 rounded-full flex items-center justify-center bg-red-50"><i class="fa-solid fa-times text-xs"></i></button>
        </div>`).join('');
};

window._addFormField = () => {
    const type = document.getElementById('newFieldType')?.value;
    const label = document.getElementById('newFieldLabel')?.value.trim();
    const required = document.getElementById('newFieldRequired')?.checked || false;
    const optionsStr = document.getElementById('newFieldOptions')?.value.trim() || '';
    if (!label) return showMsg('أدخل اسم الحقل', 'error');
    const evId = window._formBuilderEvId;
    const ev = _smartEvents[evId]; if (!ev) return;
    const fields = [...(ev.formFields || [])];
    const field = { type, label, required };
    if (type === 'select') field.options = optionsStr.split(',').map(s=>s.trim()).filter(Boolean);
    fields.push(field);
    window._tempFormFields = fields;
    window._renderFormBuilderFields(fields);
    document.getElementById('newFieldLabel').value = '';
    document.getElementById('newFieldOptions').value = '';
    document.getElementById('newFieldRequired').checked = false;
};

window._removeFormField = (idx) => {
    const evId = window._formBuilderEvId;
    const ev = _smartEvents[evId]; if (!ev) return;
    const fields = [...(window._tempFormFields || ev.formFields || [])];
    fields.splice(idx, 1);
    window._tempFormFields = fields;
    window._renderFormBuilderFields(fields);
};

window._saveEventForm = async () => {
    if (!db) return;
    const evId = window._formBuilderEvId;
    const fields = window._tempFormFields || [];
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'smart_events', evId), { formFields: fields });
    window._tempFormFields = null;
    document.getElementById('eventFormBuilderModal')?.classList.add('hidden');
    showMsg('✅ تم حفظ فورم التسجيل', 'success');
};

// ─── URL param handler for ?sev=ID ───────────────────────────────────────────
(function _checkSmartEventUrlParam() {
    const params = new URLSearchParams(window.location.search);
    const sevId = params.get('sev');
    if (!sevId) return;
    const tryOpen = (attempts = 0) => {
        if (_smartEvents[sevId]) { window._openSmartEventTicketPage(sevId); return; }
        if (attempts < 15) setTimeout(() => tryOpen(attempts + 1), 500);
    };
    setTimeout(() => tryOpen(), 800);
})();

function renderSmartEventsAdminList(events) {
    const list = document.getElementById('smartEventsAdminList');
    const attendeesList = document.getElementById('smartAttendeesList');
    if (!list) return;
    const evArr = Object.values(events).sort((a, b) => b.createdAt - a.createdAt);
    if (evArr.length === 0) {
        list.innerHTML = '<div class="col-span-full text-center py-8 text-gray-400"><i class="fa-solid fa-masks-theater text-4xl mb-3 block opacity-30"></i><p class="text-sm font-bold">لا توجد فعاليات بعد</p></div>';
    } else {
        list.innerHTML = evArr.map(ev => `
            <div class="bg-white border-2 ${ev.active ? 'border-hola-purple' : 'border-gray-200'} rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition">
                ${ev.img ? `<img src="${ev.img}" class="w-full h-32 object-cover" onerror="this.style.display='none'">` : `<div class="w-full h-20 bg-gradient-to-l from-hola-purple to-purple-800 flex items-center justify-center text-white text-3xl"><i class="fa-solid fa-masks-theater"></i></div>`}
                <div class="p-4">
                    <div class="flex items-start justify-between mb-2">
                        <h4 class="font-black text-hola-purple text-sm leading-tight flex-1">${ev.title}</h4>
                        <label class="flex items-center gap-1 cursor-pointer flex-shrink-0 mr-2">
                            <div class="relative">
                                <input type="checkbox" class="sr-only" ${ev.active ? 'checked' : ''} onchange="window.toggleSmartEvent('${ev.id}', this.checked)">
                                <div class="w-9 h-5 ${ev.active ? 'bg-hola-purple' : 'bg-gray-300'} rounded-full transition-colors"></div>
                                <div class="absolute top-0.5 ${ev.active ? 'right-0.5' : 'left-0.5'} w-4 h-4 bg-white rounded-full shadow transition-all"></div>
                            </div>
                        </label>
                    </div>
                    <p class="text-[10px] text-gray-500 font-bold mb-1"><i class="fa-solid fa-calendar ml-1 text-hola-orange"></i>${ev.evTime || ''}</p>
                    ${ev.desc ? `<p class="text-[10px] text-gray-400 mb-2 line-clamp-2">${_esc(ev.desc)}</p>` : ''}
                    <div class="flex items-center justify-between mt-2">
                        <span class="text-[10px] font-bold ${ev.active ? 'text-green-600 bg-green-50' : 'text-gray-400 bg-gray-100'} px-2 py-0.5 rounded-full">${ev.active ? '✅ منشورة' : '🔒 مخفية'}</span>
                        <div class="flex gap-1">
                            <button onclick="window.openEventFormBuilder('${ev.id}')" class="text-hola-purple hover:text-purple-800 text-xs bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded-lg transition font-bold" title="فورم التسجيل"><i class="fa-solid fa-list-check"></i></button>
                            <button onclick="window.shareSmartEvent('${ev.id}')" class="text-blue-500 hover:text-blue-700 text-xs bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition font-bold" title="رابط التذكرة"><i class="fa-solid fa-share-nodes"></i></button>
                            <button onclick="window.deleteSmartEvent('${ev.id}')" class="text-red-400 hover:text-red-600 text-xs bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition font-bold"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            </div>`).join('');
    }
    // Render attendees
    if (attendeesList) {
        const allAttendees = Object.values(_eventAttendees).sort((a, b) => b.timestamp - a.timestamp);
        if (allAttendees.length === 0) {
            attendeesList.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-400 text-xs">لا يوجد مسجلين</td></tr>';
        } else {
            attendeesList.innerHTML = allAttendees.map(a => {
                const ev = events[a.eventId] || {};
                return `<tr class="hover:bg-purple-50 border-b">
                    <td class="p-3 font-bold text-hola-purple">${a.name}</td>
                    <td class="p-3 text-xs font-bold text-hola-orange">${ev.title || a.evTitle || '---'}</td>
                    <td class="p-3 font-mono text-xs">${a.phone}</td>
                    <td class="p-3 text-xs text-gray-500" dir="ltr">${new Date(a.timestamp).toLocaleString('ar-EG')}</td>
                    <td class="p-3"><button onclick="window.deleteAttendee('${a.id}')" class="text-red-400 hover:text-red-600 text-xs bg-red-50 px-2 py-1 rounded-lg"><i class="fa-solid fa-trash"></i></button></td>
                </tr>`;
            }).join('');
        }
    }
}
window.renderSmartEventsAdminList = renderSmartEventsAdminList;

// ─── Completed Session Edit ───────────────────────────────────────────────────
window.openCompletedSessionEdit = (sid) => {
    const s = _sessions[sid]; if (!s) return;
    window._csEditId = sid;
    safeSet('csEditClientName', 'innerText', `${s.name || s.phone} — ${new Date(s.endTime || s.startTime).toLocaleDateString('ar-EG')}`);
    const costEl = document.getElementById('csEditFinalCost'); if (costEl) costEl.value = s.finalCost || 0;
    _csRenderItems(sid);
    document.getElementById('completedSessionEditModal')?.classList.remove('hidden');
};

function _csRenderItems(sid) {
    const s = _sessions[sid]; if (!s) return;
    const list = document.getElementById('csEditItemsList');
    if (!list) return;
    const items = s.items || [];
    if (items.length === 0) { list.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">لا يوجد طلبات</p>'; return; }
    list.innerHTML = items.map((item, idx) => `
        <div class="flex items-center justify-between bg-gray-50 border rounded-xl p-2.5 gap-2">
            <span class="text-sm font-bold text-gray-700 flex-1">${item.name}</span>
            <span class="text-sm font-black text-hola-orange ml-2">${item.price} ج</span>
            <button onclick="window.csRemoveItem(${idx})" class="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 w-7 h-7 rounded-lg flex items-center justify-center transition flex-shrink-0"><i class="fa-solid fa-trash text-xs"></i></button>
        </div>`).join('');
}

window.csRemoveItem = async (idx) => {
    const sid = window._csEditId; if (!sid || !db) return;
    const s = _sessions[sid]; if (!s) return;
    const items = [...(s.items || [])];
    const removed = items.splice(idx, 1)[0];
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', sid), { items });
    showMsg(`تم حذف "${removed.name}"`, 'success');
    _csRenderItems(sid);
};

window.csAddItem = async () => {
    const sid = window._csEditId; if (!sid || !db) return;
    const nameEl = document.getElementById('csAddItemName');
    const priceEl = document.getElementById('csAddItemPrice');
    const name = nameEl?.value.trim();
    const price = parseInt(priceEl?.value) || 0;
    if (!name) return showMsg('أدخل اسم الطلب', 'error');
    const s = _sessions[sid]; if (!s) return;
    const items = [...(s.items || []), { name, price }];
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', sid), { items });
    if (nameEl) nameEl.value = ''; if (priceEl) priceEl.value = '';
    showMsg(`تمت إضافة "${name}"`, 'success');
    _csRenderItems(sid);
};

window.csEditSave = async () => {
    const sid = window._csEditId; if (!sid || !db) return;
    const finalCost = parseInt(document.getElementById('csEditFinalCost')?.value) || 0;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', sid), { finalCost });
    showMsg('✅ تم حفظ التعديلات', 'success');
    document.getElementById('completedSessionEditModal')?.classList.add('hidden');
    logOperation(db, appId, currentShiftAdmin, 'تعديل جلسة مكتملة', `تعديل جلسة ${_sessions[sid]?.phone} — السعر: ${finalCost}ج`);
};

window.csDeleteSession = async () => {
    const sid = window._csEditId; if (!sid || !db) return;
    const s = _sessions[sid];
    if (!confirm(`حذف جلسة ${s?.name || s?.phone} نهائياً؟ لا يمكن التراجع.`)) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', sid));
        showMsg('🗑️ تم حذف الجلسة نهائياً', 'success');
        document.getElementById('completedSessionEditModal')?.classList.add('hidden');
        logOperation(db, appId, currentShiftAdmin, 'حذف جلسة مكتملة', `حذف جلسة ${s?.phone}`);
    } catch (e) { showMsg('خطأ في الحذف', 'error'); }
};

// ─── Multi-Admin Session (Two Admins Same Time) ───────────────────────────────
const _adminSessionId = _getDeviceId() + '_admin_' + Date.now();

export async function registerAdminSession(db, appId, adminName) {
    if (!db) return;
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'admin_sessions', _adminSessionId), {
            adminName, deviceId: _getDeviceId(), loginAt: Date.now(), lastPing: Date.now()
        });
        // Ping every 2 min to stay alive
        setInterval(async () => {
            try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'admin_sessions', _adminSessionId), { lastPing: Date.now() }); } catch(e) {}
        }, 120000);
        // Cleanup on exit
        window.addEventListener('beforeunload', () => {
            _unregisterAdminSession();
        });
    } catch(e) {}
}
window.registerAdminSession = (adminName) => registerAdminSession(db, appId, adminName);

async function _unregisterAdminSession() {
    if (!db) return;
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'admin_sessions', _adminSessionId)); } catch(e) {}
}


// ─── Manual Tab Sync ─────────────────────────────────────────────────────────
window._syncTab = (tab) => {
    if (!myProfile) return;
    switch(tab) {
        case 'session':
            window._updateDashboardNumbers && window._updateDashboardNumbers();
            window.renderSessionItemsList && window.renderSessionItemsList();
            break;
        case 'history':
            renderClientHistory(myProfile, _sessions);
            break;
        case 'loyalty':
            renderClientLoyalty(myProfile, _profiles, _discounts, sysSettings);
            break;
        case 'notifications':
            renderClientNotifications(myProfile, _notifications);
            break;
        case 'prebook':
            // Just a form, no need to sync
            break;
        case 'subscriptions':
            renderClientSubscriptions(myProfile, _subscriptions);
            break;
        case 'remote':
            if (myProfile.isRemote) window.populateRemoteProfile(myProfile.phone);
            break;
    }
    showMsg('تم التحديث', 'success');
};


// ─── Client Logout ────────────────────────────────────────────────────────────
window.clientLogout = () => {
    // ★ إغلاق أي نافذة إشعار مفتوحة عند تسجيل الخروج
    const notifModal = document.getElementById('clientNotifModal');
    if (notifModal) notifModal.classList.add('hidden');
    // ★ إغلاق popup الأختام إذا كان مفتوحاً
    if (window._closeStampsCelebration) window._closeStampsCelebration();
    // ★ إعادة ضبط حالة popup الأختام للجلسة القادمة
    window._stampsCelebShownThisSession = false;
    // ★ إعادة ضبط الإشعارات المشاهدة حتى تظهر في الجلسة القادمة
    if (window.resetSeenNotifications) window.resetSeenNotifications();
    const loggedOutPhone = myProfile?.phone;
    clearInterval(timerInterval);
    setActiveSessionId(null);
    setSessionItems([]);
    if (loggedOutPhone && db && appId) {
        unregisterUserDeviceSession(db, appId, loggedOutPhone).catch(() => {});
    }
    // Clear saved phone so auto-resume won't fire
    localStorage.removeItem('hola_saved_phone');
    // Clear QR session flag on explicit logout
    sessionStorage.removeItem('hola_qr_entry');
    setMyProfile(null);
    window._currentUserIsRemote = false;
    // Reset mobile header strip
    if (window._updateHeaderUserStrip) window._updateHeaderUserStrip(null, false);
    document.getElementById('navPublic')?.classList.remove('hidden');
    document.getElementById('navClient')?.classList.add('hidden');
    document.getElementById('remoteBadge')?.classList.add('hidden');
    const avatarDiv = document.getElementById('clientAvatarDiv');
    if (avatarDiv) { avatarDiv.className = 'w-12 h-12 bg-hola-purple text-white rounded-full flex items-center justify-center text-xl font-bold shadow-md'; avatarDiv.innerHTML = '<i class="fa-solid fa-user"></i>'; }
    document.getElementById('c-tab-session')?.classList.remove('hidden');
    document.getElementById('c-tab-prebook')?.classList.remove('hidden');
    document.getElementById('c-tab-remote')?.classList.add('hidden');
    const loginPhone = document.getElementById('loginPhone'); if (loginPhone) loginPhone.value = '';
    const loginName = document.getElementById('loginName'); if (loginName) loginName.value = '';
    document.getElementById('nameField')?.classList.add('hidden');
    switchView('public');
    showMsg('تم تسجيل الخروج', 'info');
};


// ─── Admin Manual Subscription ────────────────────────────────────────────────
window.showAdminManualSubModal = () => {
    const sel = document.getElementById('manualSubPlanSelect');
    if (sel) {
        sel.innerHTML = Object.values(_plans)
            .filter(p => p.active !== false)
            .map(p => `<option value="${p.id}">${_esc(p.name)} — ${p.price} ج.م (${p.allowedDays || p.days} يوم)</option>`)
            .join('');
        if (sel.innerHTML === '') sel.innerHTML = '<option disabled>لا توجد باقات — أضف باقة أولاً</option>';
    }
    const phoneInput = document.getElementById('manualSubPhone');
    if (phoneInput) phoneInput.value = '';
    document.getElementById('manualSubUserInfo')?.classList.add('hidden');
    document.getElementById('adminManualSubModal')?.classList.remove('hidden');
};

window.lookupManualSubUser = (phone) => {
    const info = document.getElementById('manualSubUserInfo');
    const nameSpan = document.getElementById('manualSubUserName');
    if (!info || !nameSpan) return;
    if (phone.length >= 10 && _profiles[phone]) {
        nameSpan.innerText = _profiles[phone].name;
        info.classList.remove('hidden');
    } else {
        info.classList.add('hidden');
    }
};

window.adminManualSubscribe = async () => {
    if (!db) return;
    const phone = document.getElementById('manualSubPhone')?.value.trim();
    const planId = document.getElementById('manualSubPlanSelect')?.value;
    if (!phone || phone.length < 10) return showMsg('أدخل رقم هاتف صحيح', 'error');
    if (!planId) return showMsg('اختر باقة أولاً', 'error');
    const plan = _plans[planId];
    if (!plan) return showMsg('الباقة غير موجودة', 'error');
    const prof = _profiles[phone];
    const name = prof ? prof.name : `عميل (${phone})`;
    // Check existing active
    const hasActive = Object.values(_subscriptions).some(s => s.phone === phone && s.status === 'active');
    if (hasActive) return showMsg('هذا العميل لديه اشتراك نشط بالفعل', 'error');
    const code = 'SUB-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const startDate = Date.now();
    const endDate = startDate + (plan.days * 24 * 3600000);
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'subscriptions'), {
            name, phone, planId, planName: plan.name, planDays: plan.days,
            planPrice: plan.price, allowedDays: plan.allowedDays || plan.days,
            status: 'active', code, startDate, endDate,
            daysLeft: plan.allowedDays || plan.days,
            createdAt: Date.now(), approvedAt: Date.now(), manualByAdmin: true
        });
        if (prof) {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
                phone, msg: `🎉 تم تفعيل اشتراكك "${plan.name}" من الإدارة!\nكود اشتراكك: ${code}\nيسري حتى: ${new Date(endDate).toLocaleDateString('ar-EG')}`,
                type: 'congrats', isRead: false, timestamp: Date.now()
            });
        }
        logOperation(db, appId, currentShiftAdmin, 'اشتراك يدوي', `تفعيل اشتراك ${phone} - ${plan.name} - كود: ${code}`);
        document.getElementById('adminManualSubModal')?.classList.add('hidden');
        showMsg(`تم تفعيل الاشتراك وإرسال الكود للعميل ✅`, 'success');
        playAlertSound('congrats');
    } catch(e) { showMsg('حدث خطأ', 'error'); console.error(e); }
};

// ─── Event Ticket Share Modal ─────────────────────────────────────────────────
function _showEventTicket(ev, eventUrl, fbLink, waNum, igLink, shareText) {
    // Build or reuse ticket modal
    let modal = document.getElementById('smartEventTicketModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'smartEventTicketModal';
        modal.className = 'hidden fixed inset-0 bg-black/85 z-[350] flex items-center justify-center p-4 backdrop-blur-sm print:hidden overflow-y-auto';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden relative">
            <button onclick="document.getElementById('smartEventTicketModal').classList.add('hidden')"
                class="absolute top-3 left-3 text-gray-400 hover:text-red-500 bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center z-10">
                <i class="fa-solid fa-xmark"></i></button>
            <!-- Ticket Header -->
            <div class="bg-gradient-to-l from-hola-purple to-purple-900 text-white p-6 text-center relative overflow-hidden">
                <div class="absolute inset-0 opacity-10" style="background-image:radial-gradient(circle,white 1px,transparent 1px);background-size:20px 20px;"></div>
                ${ev.img ? `<img src="${ev.img}" class="w-20 h-20 rounded-2xl object-cover border-4 border-white/30 mx-auto mb-3 shadow-xl">` : `<div class="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-3">🎉</div>`}
                <div class="bg-hola-orange text-white text-[10px] px-3 py-0.5 rounded-full font-black inline-block mb-2">تذكرة الفعالية</div>
                <h3 class="text-xl font-black leading-tight">${ev.title}</h3>
                <p class="text-purple-200 text-xs font-bold mt-1"><i class="fa-regular fa-clock ml-1"></i>${ev.evTime || ''}</p>
            </div>
            <!-- Dashed divider -->
            <div class="flex items-center px-4">
                <div class="w-6 h-6 bg-gray-100 rounded-full -mr-3 border-2 border-gray-200 flex-shrink-0"></div>
                <div class="flex-1 border-t-2 border-dashed border-gray-300 mx-2"></div>
                <div class="w-6 h-6 bg-gray-100 rounded-full -ml-3 border-2 border-gray-200 flex-shrink-0"></div>
            </div>
            <!-- Ticket Body -->
            <div class="p-5">
                ${ev.desc ? `<p class="text-sm text-gray-600 font-bold mb-4 text-center leading-relaxed">${_esc(ev.desc)}</p>` : ''}
                <p class="text-xs text-gray-400 font-bold mb-1 text-center">📍 Hola Workspace</p>
                <!-- Social Links -->
                <div class="flex justify-center gap-3 mt-4 mb-4">
                    ${fbLink ? `<a href="${fbLink}" target="_blank" class="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition shadow" title="فيسبوك"><i class="fa-brands fa-facebook"></i></a>` : ''}
                    ${waNum ? `<a href="https://wa.me/${waNum}" target="_blank" class="w-10 h-10 bg-green-500 text-white rounded-xl flex items-center justify-center hover:bg-green-600 transition shadow" title="واتساب"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
                    ${igLink ? `<a href="${igLink}" target="_blank" class="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-500 text-white rounded-xl flex items-center justify-center hover:opacity-90 transition shadow" title="إنستاغرام"><i class="fa-brands fa-instagram"></i></a>` : ''}
                </div>
                <!-- Share Buttons -->
                <div class="grid grid-cols-2 gap-2">
                    <button onclick="window.copyToClipboard('${eventUrl}');window.showMsg('تم نسخ الرابط!','success')" class="bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl text-xs hover:bg-gray-200 transition flex items-center justify-center gap-1.5"><i class="fa-regular fa-copy"></i> نسخ الرابط</button>
                    ${waNum ? `<a href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" class="bg-green-500 text-white font-bold py-2.5 rounded-xl text-xs hover:bg-green-600 transition flex items-center justify-center gap-1.5"><i class="fa-brands fa-whatsapp"></i> مشاركة واتساب</a>` : `<button onclick="window.copyToClipboard(${JSON.stringify(shareText)});window.showMsg('تم نسخ الرسالة!','success')" class="bg-green-100 text-green-700 font-bold py-2.5 rounded-xl text-xs hover:bg-green-200 transition flex items-center justify-center gap-1.5"><i class="fa-solid fa-share-nodes"></i> نسخ الدعوة</button>`}
                </div>
            </div>
        </div>`;
    modal.classList.remove('hidden');
}
window._showEventTicket = _showEventTicket;

// ─── Boot ─────────────────────────────────────────────────────────────────────
initFirebase();
async function _getStrongDeviceId() {
    // Build a fingerprint from browser characteristics (works in incognito too)
    const components = [
        navigator.userAgent,
        navigator.language,
        navigator.platform,
        screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
        navigator.deviceMemory || 0,
    ].join('|');

    // Add canvas fingerprint
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('HolaWS🔒', 2, 2);
        components + '|' + canvas.toDataURL().slice(-50);
    } catch(e) {}

    // Hash it
    let hash = 0;
    for (let i = 0; i < components.length; i++) {
        hash = ((hash << 5) - hash) + components.charCodeAt(i);
        hash |= 0;
    }
    const fpId = 'fp_' + Math.abs(hash).toString(36);

    // Store in both localStorage AND sessionStorage for cross-session tracking
    localStorage.setItem('hola_device_fp', fpId);
    sessionStorage.setItem('hola_device_fp', fpId);
    return fpId;
}
window._getStrongDeviceId = _getStrongDeviceId;

// ─── Place Closed System ──────────────────────────────────────────────────────
window.togglePlaceClosed = async () => {
    if (!db) return;
    const current = sysSettings.placeClosed || false;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), { placeClosed: !current });
    showMsg(!current ? '🌙 تم إغلاق المكان' : '☀️ تم فتح المكان', !current ? 'info' : 'success');
    logOperation(db, appId, currentShiftAdmin, !current ? 'إغلاق المكان' : 'فتح المكان', '');
    _applyPlaceClosed(!current);
};

function _applyPlaceClosed(isClosed) {
    const screen = document.getElementById('placeClosedScreen');
    const btn = document.getElementById('placeClosedBtn');
    const btnLabel = document.getElementById('placeClosedBtnLabel');
    if (!screen) return;
    // Don't show closed screen if admin is actively logged in
    if (isClosed && window._adminSessionActive) return;
    if (isClosed) {
        screen.classList.remove('hidden');
        if (btn) { btn.classList.remove('bg-gray-700','border-gray-600'); btn.classList.add('bg-green-600','border-green-500'); }
        if (btnLabel) btnLabel.textContent = 'فتح المكان';
        _initStarsAnimation();
        _initNightMusic();
        setTimeout(() => {
            if (window._updateClosedScreenData) window._updateClosedScreenData();
            // If device already sent feedback, show thank-you
            if (localStorage.getItem('hola_feedback_sent')) {
                const successDiv = document.getElementById('closedFeedbackSuccess');
                const submitBtn = document.getElementById('closedFeedbackSubmitBtn');
                if (successDiv) { successDiv.querySelector('p').textContent = '✅ لقد أرسلت رأيك من قبل — شكراً لك!'; successDiv.classList.remove('hidden'); }
                if (submitBtn) submitBtn.disabled = true;
            }
        }, 300);
    } else {
        screen.classList.add('hidden');
        if (btn) { btn.classList.add('bg-gray-700','border-gray-600'); btn.classList.remove('bg-green-600','border-green-500'); }
        if (btnLabel) btnLabel.textContent = 'إغلاق المكان';
        _stopNightMusic();
    }
}
window._applyPlaceClosed = _applyPlaceClosed;

// Stars canvas animation
function _initStarsAnimation() {
    const canvas = document.getElementById('starsCanvas');
    if (!canvas || canvas._inited) return;
    canvas._inited = true;
    const ctx = canvas.getContext('2d');
    const stars = [];
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);
    // Generate stars
    for (let i = 0; i < 220; i++) {
        stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.3, a: Math.random(), da: (Math.random() - 0.5) * 0.015, speed: Math.random() * 0.0001 + 0.00005 });
    }
    function draw() {
        if (document.getElementById('placeClosedScreen')?.classList.contains('hidden')) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        stars.forEach(s => {
            s.a += s.da;
            if (s.a > 1 || s.a < 0.1) s.da = -s.da;
            s.y -= s.speed;
            if (s.y < 0) s.y = 1;
            ctx.beginPath();
            ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${s.a})`;
            ctx.fill();
        });
        requestAnimationFrame(draw);
    }
    draw();
    // Shooting stars
    function addShootingStar() {
        const div = document.getElementById('shootingStars');
        if (!div || document.getElementById('placeClosedScreen')?.classList.contains('hidden')) return;
        const el = document.createElement('div');
        const top = Math.random() * 50;
        const left = Math.random() * 80 + 10;
        el.style.cssText = `position:absolute;top:${top}%;left:${left}%;width:120px;height:2px;background:linear-gradient(to right,transparent,rgba(255,255,255,0.9),transparent);border-radius:50%;transform:rotate(-30deg);animation:shoot 1.2s ease-out forwards;`;
        div.appendChild(el);
        setTimeout(() => el.remove(), 1300);
    }
    if (!document.querySelector('#shootingStarStyle')) {
        const style = document.createElement('style');
        style.id = 'shootingStarStyle';
        style.textContent = `@keyframes shoot{0%{opacity:1;transform:rotate(-30deg) translateX(0)}100%{opacity:0;transform:rotate(-30deg) translateX(200px)}}`;
        document.head.appendChild(style);
    }
    setInterval(addShootingStar, 2800);
}

// Night lullaby music (Web Audio API — children sleep melody)
let _nightAudioCtx = null;
let _nightNodes = [];
let _nightMelodyTimeout = null;

function _initNightMusic() {
    if (_nightAudioCtx) return;
    try {
        _nightAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        _playLullabyMelody();
    } catch(e) {}
}

function _playLullabyMelody() {
    if (!_nightAudioCtx) return;
    const ctx = _nightAudioCtx;
    // Lullaby melody — gentle C major pentatonic (Twinkle-style pattern slowed down)
    // Notes: C4, E4, G4, A4, G4, E4, C4 etc. — soft & soothing
    const notes = [
        261.63, 329.63, 392.00, 440.00, 392.00, 329.63,
        261.63, 392.00, 349.23, 329.63, 293.66, 261.63,
        392.00, 440.00, 523.25, 440.00, 392.00,
        261.63, 329.63, 392.00, 261.63
    ];
    const durations = [
        0.9, 0.9, 0.9, 0.9, 0.9, 0.9,
        1.2, 0.9, 0.9, 0.9, 0.9, 1.4,
        0.9, 0.9, 1.1, 0.9, 1.4,
        0.9, 0.9, 1.1, 1.6
    ];
    // Soft pad chords underneath (C maj, F maj, G maj cycling)
    const chords = [
        [261.63, 329.63, 392.00],
        [261.63, 349.23, 440.00],
        [246.94, 329.63, 392.00],
        [261.63, 329.63, 392.00]
    ];

    let t = ctx.currentTime + 0.3;
    // Play chords as slow pads
    chords.forEach((chord, ci) => {
        chord.forEach(freq => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
            osc.type = 'sine';
            osc.frequency.value = freq / 2; // one octave lower for warmth
            gain.gain.setValueAtTime(0, t + ci * 4.5);
            gain.gain.linearRampToValueAtTime(0.018, t + ci * 4.5 + 0.8);
            gain.gain.linearRampToValueAtTime(0.015, t + ci * 4.5 + 3.5);
            gain.gain.linearRampToValueAtTime(0, t + ci * 4.5 + 4.5);
            osc.connect(gain);
            if (panner) { gain.connect(panner); panner.connect(ctx.destination); }
            else gain.connect(ctx.destination);
            osc.start(t + ci * 4.5);
            osc.stop(t + ci * 4.5 + 5);
            _nightNodes.push({ osc, gain });
        });
    });

    // Play melody notes
    let mt = t + 1;
    notes.forEach((freq, i) => {
        const dur = durations[i] || 0.8;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle'; // softer than sine for lullaby feel
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, mt);
        gain.gain.linearRampToValueAtTime(0.055, mt + 0.08);
        gain.gain.linearRampToValueAtTime(0.04, mt + dur * 0.6);
        gain.gain.linearRampToValueAtTime(0, mt + dur * 0.95);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(mt);
        osc.stop(mt + dur);
        _nightNodes.push({ osc, gain });
        mt += dur * 1.05;
    });

    // Loop after total duration + silence gap
    const totalDur = (mt - ctx.currentTime + 3) * 1000;
    _nightMelodyTimeout = setTimeout(() => {
        if (_nightAudioCtx) _playLullabyMelody();
    }, totalDur);
}

function _stopNightMusic() {
    if (_nightMelodyTimeout) { clearTimeout(_nightMelodyTimeout); _nightMelodyTimeout = null; }
    _nightNodes.forEach(n => {
        try { n.gain.gain.cancelScheduledValues(0); n.gain.gain.setTargetAtTime(0, _nightAudioCtx?.currentTime || 0, 0.3); setTimeout(() => { try { n.osc.stop(); } catch(e) {} }, 600); } catch(e) {}
    });
    _nightNodes = [];
    setTimeout(() => { try { _nightAudioCtx?.close(); } catch(e) {} _nightAudioCtx = null; }, 800);
}

// Helper: open any modal above the closed screen (z-9999)
function _openModalAboveClosed(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    el._prevZ = el.style.zIndex;
    el.style.zIndex = '10001';
    // Reset remote modal to phone form when opened from closed screen
    if (id === 'remoteProfileModal') {
        document.getElementById('remoteModalPhoneForm')?.classList.remove('hidden');
        document.getElementById('remoteProfileModalContent')?.classList.add('hidden');
        const inp = document.getElementById('remoteModalPhoneInput');
        if (inp) inp.value = '';
    }
    el.classList.remove('hidden');
    const observer = new MutationObserver(() => {
        if (el.classList.contains('hidden')) {
            el.style.zIndex = el._prevZ || '';
            observer.disconnect();
        }
    });
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return true;
}

// Load profile into the remote modal
window._loadRemoteModalProfile = async () => {
    const phone = document.getElementById('remoteModalPhoneInput')?.value.trim();
    if (!phone || phone.length < 10) { showMsg('أدخل رقم صحيح', 'error'); return; }
    const prof = _profiles[phone];
    if (!prof) { showMsg('لم يتم العثور على هذا الرقم', 'error'); return; }
    // Use existing populateRemoteProfile if available, otherwise build minimal view
    const content = document.getElementById('remoteProfileModalContent');
    if (!content) return;
    const activeSub = Object.values(_subscriptions).find(s => s.phone === phone && s.status === 'active');
    const history = Object.values(_sessions).filter(s => s.phone === phone && s.status === 'completed').sort((a,b) => b.endTime - a.endTime).slice(0,5);
    content.innerHTML = `
        <div class="bg-gray-50 rounded-2xl p-4 text-center border">
            <div class="w-14 h-14 bg-gray-800 text-white rounded-full flex items-center justify-center text-2xl font-black mx-auto mb-2">${(prof.name||'?').charAt(0).toUpperCase()}</div>
            <p class="font-black text-gray-800 text-lg">${prof.name||'بدون اسم'}</p>
            <p class="text-xs text-gray-500 font-mono">${phone}</p>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center">
            <div class="bg-white p-3 rounded-xl border shadow-sm"><p class="text-[10px] text-gray-500 mb-1">المحفظة</p><p class="font-black text-green-600 text-lg">${prof.walletBalance||0}<span class="text-[10px] mr-1">ج</span></p></div>
            <div class="bg-white p-3 rounded-xl border shadow-sm"><p class="text-[10px] text-gray-500 mb-1">الأختام</p><p class="font-black text-hola-orange text-lg">${prof.stamps?.length||0}</p></div>
            <div class="bg-white p-3 rounded-xl border shadow-sm"><p class="text-[10px] text-gray-500 mb-1">الزيارات</p><p class="font-black text-hola-purple text-lg">${history.length}</p></div>
        </div>
        ${activeSub ? `<div class="bg-gradient-to-br from-hola-purple to-hola-dark text-white p-4 rounded-2xl shadow"><p class="text-[10px] text-purple-300 mb-1">الباقة النشطة</p><p class="font-black text-hola-orange">${activeSub.planName}</p><p class="text-xs text-purple-200 mt-1">الأيام المتبقية: <span class="font-black text-white">${activeSub.daysLeft||0}</span></p></div>` : ''}
        ${history.length>0 ? `<div class="bg-white rounded-2xl border p-3"><p class="text-xs font-black text-gray-600 mb-2">آخر الزيارات</p>${history.map(s=>`<div class="flex justify-between text-xs py-1 border-b last:border-0"><span class="text-gray-500">${new Date(s.endTime).toLocaleDateString('ar-EG')}</span><span class="font-bold text-gray-700">${s.totalCost||0} ج</span></div>`).join('')}</div>` : ''}
    `;
    document.getElementById('remoteModalPhoneForm')?.classList.add('hidden');
    content.classList.remove('hidden');
};

// Close remote modal and reset
window._closeRemoteModal = () => {
    const modal = document.getElementById('remoteProfileModal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.getElementById('remoteModalPhoneForm')?.classList.remove('hidden');
    const c = document.getElementById('remoteProfileModalContent');
    if (c) { c.innerHTML=''; c.classList.add('hidden'); }
    const inp = document.getElementById('remoteModalPhoneInput');
    if (inp) inp.value='';
};

// Remote login from closed screen
window._enterRemoteFromClosed = () => {
    if (!_openModalAboveClosed('remoteProfileModal')) {
        _openModalAboveClosed('adminLoginModal');
    }
};

// Admin panel login from closed screen
window._enterAdminFromClosed = () => {
    _openModalAboveClosed('adminLoginModal');
};

// ── Update closed screen: social links, events, logo ──
window._updateClosedScreenData = () => {
    const s = window.sysSettings || {};
    const fb = s.fbPageLink || '';
    const ig = s.igPageLink || '';
    const wa = s.whatsappNum ? `https://wa.me/${s.whatsappNum.replace(/\D/g,'')}` : '';
    const fbEl = document.getElementById('closedFbLink');
    const igEl = document.getElementById('closedIgLink');
    const waEl = document.getElementById('closedWaLink');
    const socialDiv = document.getElementById('closedSocialLinks');
    if (fbEl) { if (fb) { fbEl.href = fb; fbEl.classList.remove('hidden'); } else fbEl.classList.add('hidden'); }
    if (igEl) { if (ig) { igEl.href = ig; igEl.classList.remove('hidden'); } else igEl.classList.add('hidden'); }
    if (waEl) { if (wa) { waEl.href = wa; waEl.classList.remove('hidden'); } else waEl.classList.add('hidden'); }
    if (socialDiv) { socialDiv.classList.toggle('hidden', !fb && !ig && !wa); }
    // Venue logo / name
    const logoUrl = s.logoUrl || s.promoImg || '';
    const venueName = s.venueName || s.placeName || 'HOLA';
    const logoDiv = document.getElementById('closedVenueLogo');
    const logoImg = document.getElementById('closedVenueLogoImg');
    const nameEl = document.getElementById('closedVenueName');
    if (nameEl) nameEl.textContent = venueName;
    if (logoDiv && logoImg && logoUrl) { logoImg.src = logoUrl; logoDiv.classList.remove('hidden'); }
    // Active events
    const evArr = window._smartEvents ? Object.values(window._smartEvents).filter(e => e.active) : [];
    const evDiv = document.getElementById('closedActiveEvents');
    const evList = document.getElementById('closedEventsList');
    if (evList && evArr.length > 0) {
        evList.innerHTML = evArr.slice(0, 3).map(ev => `
            <div class="bg-white/8 border border-white/15 rounded-2xl p-3 text-right flex gap-3 items-center">
                ${ev.img ? `<img src="${ev.img}" class="w-12 h-12 rounded-xl object-cover flex-shrink-0"/>` : `<div class="w-12 h-12 rounded-xl bg-hola-orange/20 flex items-center justify-center text-xl flex-shrink-0">🎉</div>`}
                <div class="flex-1 min-w-0">
                    <p class="text-white font-black text-sm leading-tight truncate">${_esc(ev.title||'')}</p>
                    ${ev.evTime ? `<p class="text-blue-300/70 text-xs mt-0.5">${ev.evTime}</p>` : ''}
                    ${ev.desc ? `<p class="text-blue-200/50 text-[10px] mt-0.5 line-clamp-1">${_esc(ev.desc)}</p>` : ''}
                </div>
            </div>`).join('');
        if (evDiv) evDiv.classList.remove('hidden');
    } else if (evDiv) evDiv.classList.add('hidden');
};

// ── Closed screen star rating & feedback ──
let _closedFeedbackStars = 0;
let _closedFeedbackTypeVal = 'rating';
window._closedRateStar = (n) => {
    _closedFeedbackStars = n;
    const labels = ['','سيء 😞','مقبول 😐','جيد 🙂','رائع 😊','ممتاز! 🌟'];
    const lbl = document.getElementById('closedRatingLabel');
    if (lbl) { lbl.textContent = labels[n]||''; lbl.style.color = ''; }
    document.querySelectorAll('.star-btn').forEach(btn => {
        const s = parseInt(btn.dataset.star);
        btn.style.color = s <= n ? '#facc15' : '';
        btn.style.textShadow = s <= n ? '0 0 8px rgba(250,204,21,0.6)' : '';
    });
};
window._closedFeedbackType = (type) => {
    _closedFeedbackTypeVal = type;
    ['rating','suggestion','complaint'].forEach(t => {
        const id = 'fbType'+t.charAt(0).toUpperCase()+t.slice(1);
        const btn = document.getElementById(id);
        if (!btn) return;
        const on = t===type;
        btn.style.background = on ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)';
        btn.style.borderColor = on ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)';
        btn.style.color = on ? '#fff' : 'rgba(255,255,255,0.5)';
    });
};
window._submitClosedFeedback = async () => {
    // One feedback per device (stored in localStorage)
    if (localStorage.getItem('hola_feedback_sent')) {
        const successDiv = document.getElementById('closedFeedbackSuccess');
        if (successDiv) {
            successDiv.querySelector('p').textContent = '✅ لقد أرسلت رأيك من قبل — شكراً لك!';
            successDiv.classList.remove('hidden');
        }
        return;
    }
    const text = (document.getElementById('closedFeedbackText')?.value||'').trim();
    const btn = document.getElementById('closedFeedbackSubmitBtn');
    if (!_closedFeedbackStars && !text) {
        const lbl = document.getElementById('closedRatingLabel');
        if (lbl) { lbl.textContent='⚠️ اختر تقييماً أو اكتب رسالة'; lbl.style.color='#f97316'; }
        return;
    }
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin ml-1"></i> جاري الإرسال...'; }
    try {
        if (window.db && window.appId) {
            const { addDoc, collection } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
            await addDoc(collection(window.db,'artifacts',window.appId,'public','data','feedback'), {
                stars: _closedFeedbackStars, type: _closedFeedbackTypeVal,
                message: text, source: 'closed_screen', anonymous: true, createdAt: Date.now()
            });
        }
        // Mark device as having sent feedback
        localStorage.setItem('hola_feedback_sent', '1');
        document.getElementById('closedFeedbackSuccess')?.classList.remove('hidden');
        if (document.getElementById('closedFeedbackText')) document.getElementById('closedFeedbackText').value='';
        _closedFeedbackStars=0;
        document.querySelectorAll('.star-btn').forEach(b=>{b.style.color='';b.style.textShadow='';});
        const lbl=document.getElementById('closedRatingLabel'); if(lbl){lbl.textContent='';lbl.style.color='';}
        // Hide form elements after submission
        const form = document.getElementById('closedStarRating')?.closest('.bg-white\\/5');
        if (form) {
            form.querySelectorAll('textarea, .flex.gap-2.mb-3, #closedStarRating').forEach(el => el.style.opacity = '0.4');
        }
        setTimeout(()=>document.getElementById('closedFeedbackSuccess')?.classList.add('hidden'),6000);
    } catch(e) { console.warn('feedback error',e); }
    if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-paper-plane ml-1"></i> إرسال بسرية تامة'; }
};

// Watch sysSettings for place closed state (synced from Firestore)
const _origSetupListeners_placeClosed = window._applyPlaceClosed;
// Called from sessions.js settings listener
window._checkPlaceClosedState = () => {
    _applyPlaceClosed(sysSettings.placeClosed || false);
    if (sysSettings.placeClosed && window._updateClosedScreenData) window._updateClosedScreenData();
};



// db/appId are exposed globally in firebase.js onAuthStateChanged

window.refreshNotificationsPanel = function() {
    if (typeof window.refreshNotifications === 'function') {
        return window.refreshNotifications();
    }
};

// Client checkout finalization (single authoritative definition to avoid accidental override bugs).
window.confirmCheckout = async function() {
    try {
        if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
        if (!activeSessionId) return showMsg("لا توجد جلسة نشطة", "error");

        const session = _sessions[activeSessionId];
        if (!session) return showMsg("خطأ في بيانات الجلسة", "error");

        const reqEl = document.getElementById('modalFinalRequired');
        const ded = reqEl ? parseInt(reqEl.dataset.deduction, 10) || 0 : 0;
        const fin = reqEl ? parseInt(reqEl.innerText, 10) || 0 : 0;
        const endNow = Date.now();
        const dMs = endNow - (session.startTime || endNow);
        const groupCount = getSessionGroupCount(session);

        window.lastCompletedSessionId = activeSessionId;
        window._lastReceiptPhone = session.phone;
        window._lastReceiptName = session.name;

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', activeSessionId), {
            status: 'completed',
            endTime: endNow,
            finalCost: fin,
            durationMs: dMs,
            shiftAdmin: currentShiftAdmin || 'عميل'
        });

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), {
            phone: session.phone,
            customerName: session.name,
            sessionId: activeSessionId,
            requestedTotal: fin,
            itemName: `طلب الحساب (مطلوب: ${fin} ج)`,
            status: 'pending',
            timestamp: endNow
        });

        const prof = _profiles[session.phone];
        if (prof && ded > 0) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', session.phone), {
                walletBalance: (prof.walletBalance || 0) - ded
            });
        }

        const discEl = document.getElementById('discountCode');
        const aId = discEl?.dataset.appliedId;
        const aCode = discEl?.value?.trim() || discEl?.dataset.appliedCode || '';
        if (aId) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'discounts', aId), {
                isUsed: true, usedBy: session.phone, usedAt: endNow
            });
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', activeSessionId), { discountCode: aCode });
        }

        await window.deductSubscriptionDay(session.phone);

        const recData = {
            status: 'completed',
            endTime: endNow,
            finalCost: fin,
            durationMs: dMs,
            shiftAdmin: currentShiftAdmin || 'عميل',
            items: sessionItems || session.items || [],
            startTime: session.startTime,
            name: session.name,
            phone: session.phone,
            id: activeSessionId,
            groupCount: groupCount,
            groupNote: groupCount > 1 ? `مجموعة: ${groupCount} أشخاص` : ''
        };

        clearInterval(timerInterval);
        setActiveSessionId(null);
        setSessionItems([]);
        window.closeCheckoutModal();
        safeSet('receiptTitle', 'innerText', 'تم إنهاء الجلسة بنجاح');
        populateDetailedReceipt('receipt', recData);
        document.getElementById('clientReceiptModal')?.classList.remove('hidden');
        showMsg("تم إنهاء الجلسة وإظهار الفاتورة", "success");
    } catch (e) {
        console.error("Checkout Error:", e);
        showMsg("خطأ أثناء إنهاء الجلسة. حاول مرة أخرى.", "error");
    }
};
