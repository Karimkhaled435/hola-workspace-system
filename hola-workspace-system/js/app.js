// =====================================================
// js/app.js — Main Entry Point, Timer, Session Logic
// =====================================================

import { collection, addDoc, updateDoc, doc, deleteDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initFirebase, db, appId } from "./firebase.js";
import {
    sysSettings, _profiles, _sessions, _menu, _discounts, _notifications, _operations,
    _prebookings, _eventAttendees, _chats, _subscriptions, _plans,
    myProfile, activeSessionId, sessionStartTime,
    sessionItems, timerInterval, appliedDiscountVal, currentManageUserPhone, currentShiftAdmin,
    currentChatPhone, setMyProfile, setActiveSessionId, setSessionStartTime, setSessionItems,
    setTimerInterval, setAppliedDiscountVal, setCurrentManageUserPhone, setCurrentShiftAdmin,
    setCurrentChatPhone
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
    enterGuestMode,
    verifyAdminPin, logoutAdmin
} from "./auth.js";
import {
    applyDiscountCode, saveDiscount, deleteDiscount, showDiscountModal,
    saveMenuItem, deleteMenuItem, showMenuModal,
    openUserManage, saveUserWallet, sendUserMsgOnly, sendUserDiscountOnly, openUserDetails,
    unbanPhone, markPreBookingDone, deleteAllHistory, deleteAllArchivedBookings, exportTableToCSV
} from "./vouchers.js";
import { printInvoice, showEndDaySummary, closeEndDaySummary, printEndDaySummary } from "./print.js";

// ─── Global Init ─────────────────────────────────────────────────────────────
window._loginAttempts = {};
window._bannedPhones = {};
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
    const hours = Math.ceil(diffMs / 3600000);
    let cost = 0;
    if (hours >= 1) cost += sysSettings.pricingTier1;
    if (hours >= 2) cost += sysSettings.pricingTier2;
    if (hours >= 3) cost += sysSettings.pricingTier3;
    return cost;
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
        const timeCost = calculateTimeCost(diffSecs * 1000);
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
}
window._updateDashboardNumbers = updateDashboardNumbers;

function startTimer() {
    safeSet('clientStartTime', 'innerText', new Date(sessionStartTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    if (timerInterval) clearInterval(timerInterval);
    updateDashboardNumbers();
    setTimerInterval(setInterval(updateDashboardNumbers, 1000));
    // Expose session start time for cards-controller (My Package session panel)
    window._activeSessionStartTime = sessionStartTime;
}
window._startTimer = startTimer;

// ─── Session Items ────────────────────────────────────────────────────────────
window.renderSessionItemsList = () => {
    const div = document.getElementById('activeSessionItemsDiv');
    const list = document.getElementById('activeSessionItemsList');
    if (!div || !list) return;
    if (sessionItems.length === 0) { div.classList.add('hidden'); return; }
    div.classList.remove('hidden');
    list.innerHTML = sessionItems.map(i =>
        `<span class="bg-gray-100 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-md border shadow-sm">${i.name} <span class="text-hola-orange ml-1 font-black">${i.price} ج</span></span>`
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
            `<div class="flex justify-between items-center text-sm"><span class="font-bold">${i.name}</span><div class="flex items-center gap-2"><span class="text-hola-orange font-black">${i.price} ج</span><button onclick="window.removeFromBarCart(${idx})" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-times text-xs"></i></button></div></div>`
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
    const rEnd = new Date(sessionData.endTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    safeSet(`${prefix}StartTime`, 'innerText', rStart); safeSet(`${prefix}EndTime`, 'innerText', rEnd);
    const durH = Math.floor(sessionData.durationMs / 3600000); const durM = Math.floor((sessionData.durationMs % 3600000) / 60000);
    safeSet(`${prefix}Duration`, 'innerText', `${durH}س و ${durM}د`);
    const tCost = calculateTimeCost(sessionData.durationMs); const itemsCost = (sessionData.items || []).reduce((a, b) => a + b.price, 0);
    const totalBefore = tCost + itemsCost; const disc = totalBefore - sessionData.finalCost;
    safeSet(`${prefix}Discount`, 'innerText', `${disc} ج`); safeSet(`${prefix}FinalCost`, 'innerText', `${sessionData.finalCost} ج`);
    const itemsList = document.getElementById(`${prefix}ItemsList`);
    if (itemsList) {
        if (sessionData.items && sessionData.items.length > 0)
            itemsList.innerHTML = sessionData.items.map(i => `<div class="flex justify-between"><span>${i.name}</span><span class="text-hola-orange">${i.price} ج</span></div>`).join('');
        else itemsList.innerHTML = '<span class="text-gray-400">لا يوجد طلبات</span>';
    }
}

window.forceShowClientReceipt = (sessionData) => {
    clearInterval(timerInterval); setActiveSessionId(null); setSessionItems([]); window.lastCompletedSessionId = sessionData.id;
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
        const recData = { status: 'completed', endTime: Date.now(), finalCost: fin, durationMs: dMs, shiftAdmin: currentShiftAdmin, items: sessionItems || session.items, startTime: session.startTime, name: sName, phone: sPhone, id: activeSessionId };
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', activeSessionId), { status: 'completed', endTime: Date.now(), finalCost: fin, durationMs: dMs, shiftAdmin: currentShiftAdmin });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), { phone: sPhone, itemName: `طلب الحساب (مطلوب: ${fin} ج)`, status: 'pending', timestamp: Date.now() });
        logOperation(db, appId, currentShiftAdmin, 'إنهاء جلسة (عميل)', `العميل ${sPhone} أنهى جلسته بقيمة ${fin}ج`);
        const prof = _profiles[sPhone];
        if (prof && ded > 0) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', sPhone), { walletBalance: (prof.walletBalance || 0) - ded });
        const aId = document.getElementById('discountCode')?.dataset.appliedId;
        if (aId) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'discounts', aId), { isUsed: true });
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
    const activeSub = Object.values(_subscriptions).find(s => s.phone === phone && s.status === 'active' && s.daysLeft > 0);
    if (!activeSub) return;
    const today = new Date().toLocaleDateString('ar-EG');
    if (activeSub.lastUsedDate === today) return; // Already used today
    const newDays = activeSub.daysLeft - 1;
    const newStatus = newDays <= 0 ? 'expired' : 'active';
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', activeSub.id), { daysLeft: newDays, status: newStatus, lastUsedDate: today });
    if (newStatus === 'expired') {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), { phone, msg: `انتهى اشتراكك! جدد اشتراكك للاستمرار في الاستمتاع بالمزايا.`, type: 'high', isRead: false, timestamp: Date.now() });
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

// ─── Admin Session Management ─────────────────────────────────────────────────
window.openAdminLiveSession = (id) => {
    const s = _sessions[id]; if (!s) return;
    safeSet('liveSesName', 'innerText', s.name); safeSet('liveSesPhone', 'innerText', s.phone);
    const el = document.getElementById('liveSesElapsed'); if (el) el.dataset.start = s.startTime;
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
    const dMs = Date.now() - s.startTime; const tC = calculateTimeCost(dMs); const iC = (s.items || []).reduce((su, i) => su + i.price, 0);
    safeSet('liveSesTimeCost', 'innerText', `${tC} ج`); safeSet('liveSesItemsCost', 'innerText', `${iC} ج`); safeSet('liveSesTotal', 'innerText', `${tC + iC} ج`);
    const btn = document.getElementById('liveSesEndBtn'); if (btn) btn.onclick = () => window.adminEndSession(id);
    document.getElementById('adminLiveSessionModal')?.classList.remove('hidden');
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
    const dMs = Date.now() - s.startTime; const tC = calculateTimeCost(dMs); const iC = (s.items || []).reduce((su, i) => su + i.price, 0); const sub = tC + iC;
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
    const itemsHtml = (s.items && s.items.length > 0) ? s.items.map(i => `<div class="flex justify-between"><span>${i.name}</span><span class="text-hola-orange">${i.price} ج</span></div>`).join('') : '<span class="text-gray-400">لا يوجد طلبات</span>';
    document.getElementById('adminRecItems').innerHTML = itemsHtml;
    safeSet('adminReceiptFinalCost', 'innerText', `${fin} ج.م`);
    document.getElementById('adminReceiptModal')?.classList.remove('hidden');
    showMsg("تم إنهاء الجلسة وإرسالها للعميل", "success");
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
                <button onclick="document.getElementById('quickBookModal').classList.add('hidden')" class="mt-6 text-hola-orange font-bold text-sm hover:underline">إغلاق</button>
            </div>`;
        playAlertSound('congrats');
        const qp = document.getElementById('quickBookPhone'); if (qp) qp.value = '';
        const qt = document.getElementById('quickBookType'); if (qt) qt.value = 'seat';
        const qn = document.getElementById('quickBookNote'); if (qn) qn.value = '';
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

// ─── Admin System Settings ────────────────────────────────────────────────────
window.saveSystemSettings = async () => {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    const getVal = (id) => document.getElementById(id)?.value || "";
    const data = {
        adminPin: getVal('settingAdminPin') || "hola2026",
        description: getVal('settingDescription'),
        loyaltyText: getVal('settingLoyaltyText'),
        maxCapacity: parseInt(getVal('setMaxCap')) || 50,
        pricingTier1: parseInt(getVal('setT1')) || 25,
        pricingTier2: parseInt(getVal('setT2')) || 15,
        pricingTier3: parseInt(getVal('setT3')) || 10,
        stampsRequired: parseInt(getVal('setStampsReq')) || 7,
        promoImg: getVal('setPromoImg'), promoText: getVal('setPromoText'), promoLink: getVal('setPromoLink'),
        promoEmbed: getVal('setPromoEmbed'),
        workspaceLat: parseFloat(getVal('setLat')) || 26.5590, workspaceLng: parseFloat(getVal('setLng')) || 31.6957,
        workspaceRadius: parseInt(getVal('setRadius')) || 500,
        vfNumber: getVal('setVfNumber'), vfName: getVal('setVfName'), instapayLink: getVal('setInstapayLink'),
        fbPageLink: getVal('setFbPageLink'), whatsappNum: getVal('setWhatsappNum'),
        roomsActive: document.getElementById('setRoomsActive') ? document.getElementById('setRoomsActive').checked : false
    };
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), data); showMsg("تم تحديث الإعدادات بنجاح!", "success"); }
    catch (e) { showMsg("حدث خطأ أثناء الحفظ", "error"); console.error(e); }
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

    safeSet('modalEventTitle', 'innerText', title);
    safeSet('modalEventDesc', 'innerText', desc);
    // Time element is inside a <span> inside the <p>
    const timeEl = document.getElementById('modalEventTime');
    if (timeEl) {
        const span = timeEl.querySelector('span');
        if (span) span.innerText = time;
        else timeEl.innerText = time;
    }

    // Image handling — show wrapper only if image exists
    const imgEl = document.getElementById('modalEventImg');
    const imgWrapper = document.getElementById('modalEventImgWrapper');
    const noImgClose = document.getElementById('modalNoImgClose');
    if (imgEl) {
        if (img) {
            imgEl.src = img;
            if (imgWrapper) imgWrapper.style.display = '';
            if (noImgClose) noImgClose.classList.add('hidden');
        } else {
            imgEl.src = '';
            if (imgWrapper) imgWrapper.style.display = 'none';
            if (noImgClose) noImgClose.classList.remove('hidden');
        }
    }

    // Set WhatsApp contact button
    const waNum = sysSettings.whatsappNum || '';
    const waBtn = document.getElementById('eventWhatsappBtn');
    if (waBtn && waNum) {
        const waMsg = `مرحباً، أريد معرفة تفاصيل أكثر عن فعالية "${title}" بتاريخ ${time}`;
        waBtn.href = `https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}`;
        waBtn.classList.remove('hidden');
    } else if (waBtn) { waBtn.classList.add('hidden'); }

    document.getElementById('eventDetailsModal')?.classList.remove('hidden');
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
        document.getElementById('eventDetailsModal')?.classList.add('hidden');
        showMsg(`تم تسجيلك في "${evTitle}" بنجاح! ننتظرك 🎉`, "success"); playAlertSound('congrats');
    } catch (e) { showMsg("حدث خطأ", "error"); }
};
window.deleteAttendee = async (id) => { if (!db) return; await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'event_attendees', id)); };
window.clearEventAttendees = async () => {
    if (!db || !confirm("متأكد من مسح الحضور؟")) return;
    Object.keys(_eventAttendees).forEach(id => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'event_attendees', id)));
    showMsg("تم المسح", "success");
};

// ─── Subscription / Plans System ─────────────────────────────────────────────
window.showSubscriptionModal = () => {
    renderPublicPlans();
    // Auto-fill if logged in
    if (myProfile && !myProfile.isRemote) {
        const nameInput = document.getElementById('subName');
        const phoneInput = document.getElementById('subPhone');
        if (nameInput) nameInput.value = myProfile.name || '';
        if (phoneInput) phoneInput.value = myProfile.phone || '';
        // Hide the inputs if already filled (user is logged in)
        const subFormHint = document.getElementById('subFormLoggedHint');
        if (subFormHint) subFormHint.classList.remove('hidden');
    }
    document.getElementById('subscriptionModal')?.classList.remove('hidden');
    document.getElementById('subscriptionFormDiv')?.classList.add('hidden');
};

function renderPublicPlans() {
    const list = document.getElementById('subscriptionPlansList');
    if (!list) return;
    const plans = Object.values(_plans).filter(p => p.active !== false);
    if (plans.length === 0) {
        list.innerHTML = `<div class="text-center py-6"><p class="text-gray-400">لا توجد باقات متاحة حالياً</p><p class="text-sm text-gray-400 mt-1">سيتم إضافة الباقات قريباً</p></div>`;
        return;
    }
    list.innerHTML = plans.map(p => `
        <div class="border-2 border-purple-100 rounded-2xl p-4 hover:border-hola-purple transition cursor-pointer relative overflow-hidden"
             onclick="window.selectPlan('${p.id}', '${p.name}')">
            <div class="absolute top-0 right-0 bg-hola-orange text-white text-[10px] px-3 py-1 rounded-bl-lg font-bold">${p.price} ج.م</div>
            <div class="mt-4">
                <h4 class="font-black text-hola-purple text-lg mb-1">${p.name}</h4>
                <p class="text-xs text-gray-500 font-bold mb-3">${p.desc || ''}</p>
                <div class="flex justify-between text-xs font-bold text-gray-600">
                    <span><i class="fa-solid fa-calendar-days text-hola-orange ml-1"></i>${p.days} يوم</span>
                    <span><i class="fa-solid fa-check-circle text-green-500 ml-1"></i>${p.allowedDays || p.days} أيام استخدام</span>
                </div>
            </div>
        </div>`).join('');
}

window.selectPlan = (planId, planName) => {
    document.getElementById('subPlanId').value = planId;
    document.getElementById('selectedPlanTitle').innerText = planName;
    document.getElementById('subscriptionFormDiv')?.classList.remove('hidden');
    document.getElementById('subscriptionFormDiv')?.scrollIntoView({ behavior: 'smooth' });
};

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
        phone: sub.phone, msg: `🎉 تم تفعيل اشتراكك "${sub.planName}"!\nكود اشتراكك: ${code}\nيسري حتى: ${new Date(endDate).toLocaleDateString('ar-EG')}`, type: 'congrats', isRead: false, timestamp: Date.now()
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
    if (!name) return showMsg("أدخل اسم الباقة", "error");
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'plans'), { name, days, price, allowedDays, desc, active: true, createdAt: Date.now() });
    document.getElementById('addPlanModal')?.classList.add('hidden');
    showMsg("تم إضافة الباقة بنجاح", "success");
};

window.deletePlan = async (id) => {
    if (!db || !confirm("متأكد من حذف الباقة؟")) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'plans', id));
    showMsg("تم حذف الباقة", "success");
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
    // Update remote header display elements
    const nameEl = document.getElementById('remoteNameDisplay');
    const phoneEl = document.getElementById('remotePhoneDisplay');
    const avatarEl = document.getElementById('remoteAvatarInitial');
    if (nameEl) nameEl.innerText = prof.name || 'بدون اسم';
    if (phoneEl) phoneEl.innerText = phone;
    if (avatarEl) avatarEl.innerText = (prof.name || '?').charAt(0).toUpperCase();
    const content = document.getElementById('remoteProfileContent');
    if (!content) return;
    const activeSub = Object.values(_subscriptions).find(s => s.phone === phone && s.status === 'active');
    const history = Object.values(_sessions).filter(s => s.phone === phone && s.status === 'completed').sort((a, b) => b.endTime - a.endTime).slice(0, 5);
    const lastSession = history[0];
    // Stats row
    const walletHtml = `<div class="grid grid-cols-3 gap-2 text-center mb-3">
        <div class="bg-white p-3 rounded-xl border shadow-sm">
            <p class="text-[10px] text-gray-500 mb-1">المحفظة</p>
            <p class="font-black text-green-600 text-lg">${prof.walletBalance || 0}<span class="text-[10px] mr-1">ج</span></p>
        </div>
        <div class="bg-white p-3 rounded-xl border shadow-sm">
            <p class="text-[10px] text-gray-500 mb-1">الأختام</p>
            <p class="font-black text-hola-orange text-lg">${prof.stamps?.length || 0}</p>
        </div>
        <div class="bg-white p-3 rounded-xl border shadow-sm">
            <p class="text-[10px] text-gray-500 mb-1">الزيارات</p>
            <p class="font-black text-hola-purple text-lg">${history.length}</p>
        </div>
    </div>`;

    const subHtml = activeSub ? `<div class="bg-gradient-to-br from-hola-purple to-hola-dark text-white p-4 rounded-2xl mb-3 cursor-pointer shadow-lg" onclick="window.showSubCard('${activeSub.id}')">
        <div class="flex justify-between items-start mb-2">
            <div><p class="text-[10px] text-purple-300">الباقة النشطة</p><p class="font-black text-hola-orange">${activeSub.planName}</p></div>
            <span class="bg-green-500 text-[9px] text-white px-2 py-0.5 rounded-full font-bold">✅ نشط</span>
        </div>
        <p class="font-mono text-lg font-black tracking-widest mb-2">${activeSub.code || '---'}</p>
        <div class="flex justify-between items-center bg-white/10 p-2 rounded-lg">
            <span class="text-xs text-purple-300">الأيام المتبقية</span>
            <span class="font-black text-hola-orange text-xl">${activeSub.daysLeft || 0}</span>
        </div>
        <p class="text-[9px] text-purple-300 mt-1 text-center">اضغط لعرض البطاقة الكاملة</p>
    </div>` : `<div class="bg-gray-50 p-3 rounded-xl border text-center mb-3">
        <p class="text-xs text-gray-400 font-bold">لا يوجد اشتراك نشط</p>
    </div>`;

    const invoiceHtml = lastSession ? `<div class="bg-white p-3 rounded-xl border shadow-sm cursor-pointer hover:bg-gray-50 transition" onclick="window.printInvoice('${lastSession.id}')">
        <div class="flex justify-between items-center">
            <div>
                <p class="text-xs font-bold text-gray-600"><i class="fa-solid fa-receipt text-hola-orange ml-1"></i>آخر فاتورة</p>
                <p class="text-sm font-black text-hola-purple mt-0.5">${new Date(lastSession.endTime).toLocaleDateString('ar-EG')}</p>
            </div>
            <div class="text-left">
                <p class="font-black text-hola-orange text-lg">${lastSession.finalCost} ج</p>
                <p class="text-[10px] text-gray-400">اضغط للطباعة</p>
            </div>
        </div>
    </div>` : '';

    // Recent events
    let eventsHtml = '';
    for (let slot = 1; slot <= 3; slot++) {
        const k = (x) => slot === 1 ? x : `ev${slot}_${x}`;
        if (sysSettings[k('evActive')] && sysSettings[k('evTitle')]) {
            eventsHtml += `<div class="bg-purple-50 p-3 rounded-xl border border-purple-100">
                <p class="text-xs font-bold text-hola-purple"><i class="fa-solid fa-masks-theater text-hola-orange ml-1"></i>فعالية قادمة</p>
                <p class="font-black text-hola-purple mt-1">${sysSettings[k('evTitle')]}</p>
                <p class="text-xs text-gray-500 mt-0.5">${sysSettings[k('evTime')] || ''}</p>
            </div>`;
        }
    }

    content.innerHTML = walletHtml + subHtml + invoiceHtml + (eventsHtml ? `<div class="space-y-2 mt-1">${eventsHtml}</div>` : '');
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
    btn.innerHTML = `<i class="fa-solid ${platform.icon}"></i> ${platform.label}`;
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
    const header = document.getElementById('adminChatHeader');
    if (header) {
        header.innerHTML = `<i class="fa-solid fa-headset text-hola-orange"></i> محادثة مع: <span class="text-hola-orange"></span>`;
        const nameSpan = header.querySelector('span');
        if (nameSpan) nameSpan.textContent = name;
    }
    document.getElementById('adminChatInput').disabled = false;
    document.getElementById('adminChatBtn').disabled = false;
    renderAdminChatUsersList(_chats, _profiles, phone);
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
    window.closeClientNotif(); switchClientTab('loyalty');
    setTimeout(() => {
        const el = document.getElementById(`discount-card-${code}`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('pulse-highlight'); setTimeout(() => { el.classList.remove('pulse-highlight'); }, 6000); }
    }, 300);
};
window.closeClientNotif = () => { const m = document.getElementById('clientNotifModal'); if (m) m.classList.add('hidden'); };

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
    if (viewName === 'client') {
        if (window.renderProfileData) window.renderProfileData();
        if (window.renderAdsEventsPanel) window.renderAdsEventsPanel();
    }
};
window.switchClientTab = (tabName) => {
    switchClientTab(tabName);
    if (tabName === 'profile' && window.renderProfileData) window.renderProfileData();
    if (tabName === 'ads' && window.renderAdsEventsPanel) window.renderAdsEventsPanel();
};
window.switchAdminTab = switchAdminTab;
window.checkLocationForLogin = checkLocationForLogin;
window.showPreBookingFallback = showPreBookingFallback;
window.resetLocationCheck = resetLocationCheck;
window.checkNewUser = (val) => checkNewUser(val, _profiles);
window.submitPreBooking = () => submitPreBooking(db, appId);
window.submitInternalPreBooking = (type) => submitInternalPreBooking(type, db, appId, myProfile);
window.handleLogin = () => handleLogin(db, appId, _profiles, _sessions, sysSettings);
window.enterGuestMode = enterGuestMode;
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
            preview.innerHTML = `<i class="fa-solid ${p.icon}"></i> <span>سيظهر كزر: ${p.label}</span>`;
            preview.className = `mb-2 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 text-white ${p.color}`;
            preview.classList.remove('hidden');
        });
    }
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
                    ${activeEvents.map(e => `<option value="${e.slot}">🎉 ${e.title} — ${e.time || ''}</option>`).join('')}
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

// ─── Render Active Events in Login Screen (single compact pill) ──────────────
window._renderLoginEvents = () => {
    const banner = document.getElementById('loginSingleEventBanner');
    const intentBtn = document.getElementById('btnEventIntent');
    if (!banner) return;

    // Find first active event only
    let firstEv = null;
    for (let slot = 1; slot <= 3; slot++) {
        const k = (x) => slot === 1 ? x : `ev${slot}_${x}`;
        if (sysSettings[k('evActive')] && sysSettings[k('evTitle')]) {
            firstEv = { slot, title: sysSettings[k('evTitle')], time: sysSettings[k('evTime')], img: sysSettings[k('evImg')] };
            break;
        }
    }

    if (!firstEv) {
        banner.classList.add('hidden');
        // Hide the "نوي حضور" button if no active events
        if (intentBtn) intentBtn.classList.add('opacity-40', 'pointer-events-none');
        return;
    }

    // Show the intent button normally
    if (intentBtn) { intentBtn.classList.remove('opacity-40', 'pointer-events-none'); }

    // Single pill
    banner.innerHTML = `
        <div class="bg-white rounded-2xl shadow-lg border border-purple-100 p-3 flex items-center gap-3 cursor-pointer hover:shadow-xl transition-all active:scale-98"
             onclick="window.openEventLanding(${firstEv.slot})">
            ${firstEv.img
                ? `<img src="${firstEv.img}" class="w-12 h-12 rounded-xl object-cover border-2 border-hola-orange flex-shrink-0">`
                : `<div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-masks-theater text-hola-purple text-lg"></i></div>`}
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 mb-0.5">
                    <span class="bg-hola-orange text-white text-[9px] px-1.5 py-0.5 rounded-full font-black">🎉 فعالية</span>
                </div>
                <p class="font-black text-hola-purple text-sm truncate">${firstEv.title}</p>
                <p class="text-[10px] text-gray-400 truncate">${firstEv.time || 'اضغط لمعرفة التفاصيل'}</p>
            </div>
            <div class="flex-shrink-0 text-hola-orange">
                <i class="fa-solid fa-chevron-left text-sm"></i>
            </div>
        </div>`;
    banner.classList.remove('hidden');
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
    } catch (e) { showMsg("حدث خطأ", "error"); }
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
    return `<a href="${linkUrl}" target="_blank" class="inline-flex items-center gap-2 ${p.color} text-white text-xs font-bold px-3 py-2 rounded-lg mt-2 hover:opacity-90 transition shadow-sm"><i class="fa-solid ${p.icon}"></i> ${p.label}</a>`;
};

// ─── Toggle plan active status ────────────────────────────────────────────────
window.togglePlanActive = async (planId, current) => {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'plans', planId), { active: !current });
    showMsg(current ? "تم إيقاف الباقة" : "تم تفعيل الباقة", "success");
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
    // Data is already live via Firestore listeners; this only re-renders current state.
    renderClientNotifications(myProfile, _notifications);
};

// ─── Remote Mode (Outside Location) ──────────────────────────────────────────
window.activateRemoteMode = (phone) => {
    window._currentUserIsRemote = true;
    // Show remote badge in header
    document.getElementById('remoteBadge')?.classList.remove('hidden');
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
    if (!confirm(`هل تريد إيقاف اشتراك "${sub.planName}" مؤقتاً الآن؟`)) return;
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'subscriptions', subId), {
            status: 'paused', pausedAt: Date.now(), daysLeftBeforePause: sub.daysLeft
        });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), {
            phone: sub.phone, msg: `⏸ تم إيقاف اشتراكك "${sub.planName}" مؤقتاً. الأيام المتبقية (${sub.daysLeft}) محفوظة.`,
            type: 'normal', isRead: false, timestamp: Date.now()
        });
        showMsg("تم الإيقاف المؤقت بنجاح", "success");
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


// ─── Live client tab rendering from Firestore snapshots (no manual sync) ─────
window._syncTab = () => {};


// ─── Client Logout ────────────────────────────────────────────────────────────
window.clientLogout = () => {
    clearInterval(timerInterval);
    setActiveSessionId(null);
    setSessionItems([]);
    setMyProfile(null);
    window._activeSessionStartTime = null;
    window._currentUserIsRemote = false;
    // Reset header
    document.getElementById('navPublic')?.classList.remove('hidden');
    document.getElementById('navClient')?.classList.add('hidden');
    // Hide remote badge
    document.getElementById('remoteBadge')?.classList.add('hidden');
    // Reset avatar
    const avatarDiv = document.getElementById('clientAvatarDiv');
    if (avatarDiv) { avatarDiv.className = 'w-12 h-12 bg-hola-purple text-white rounded-full flex items-center justify-center text-xl font-bold shadow-md'; avatarDiv.innerHTML = '<i class="fa-solid fa-user"></i>'; }
    // Show normal tabs, hide remote tab
    document.getElementById('c-tab-session')?.classList.remove('hidden');
    document.getElementById('c-tab-prebook')?.classList.remove('hidden');
    document.getElementById('c-tab-internet')?.classList.remove('hidden');
    document.getElementById('c-tab-subscriptions')?.classList.remove('hidden');
    document.getElementById('c-tab-remote')?.classList.add('hidden');
    // Reset login form
    const loginPhone = document.getElementById('loginPhone'); if (loginPhone) loginPhone.value = '';
    const loginName = document.getElementById('loginName'); if (loginName) loginName.value = '';
    document.getElementById('nameField')?.classList.add('hidden');
    switchView('public');
    showMsg('تم تسجيل الخروج', 'info');
};

window.renderProfileData = () => {
    if (!myProfile || myProfile.phone === 'guest') return;
    const prof = _profiles[myProfile.phone] || myProfile;
    safeSet('profileNameInput', 'value', prof.name || '');
    safeSet('profilePhoneInput', 'value', prof.phone || '');
    safeSet('profileWifiCardInput', 'value', prof.wifiCardCode || '');
};

window.saveProfileData = async () => {
    if (!db || !myProfile || myProfile.phone === 'guest') return showMsg("غير متاح في وضع الضيف", "error");
    const newName = document.getElementById('profileNameInput')?.value.trim();
    const newWifi = document.getElementById('profileWifiCardInput')?.value.trim().toUpperCase();
    if (!newName || newName.length < 2) return showMsg("أدخل اسمًا صحيحًا", "error");
    if (!newWifi) return showMsg("أدخل كود كارت الواي فاي", "error");
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', myProfile.phone), {
            name: newName,
            wifiCardCode: newWifi
        });
        if (_profiles[myProfile.phone]) {
            _profiles[myProfile.phone].name = newName;
            _profiles[myProfile.phone].wifiCardCode = newWifi;
        }
        setMyProfile({ ...myProfile, name: newName, wifiCardCode: newWifi });
        updateClientHeaderUI({ ...myProfile, name: newName }, _profiles, sysSettings);
        showMsg("تم حفظ بيانات الملف الشخصي", "success");
    } catch (e) { showMsg("تعذر حفظ البيانات", "error"); }
};

window.renderAdsEventsPanel = () => {
    const adsWrap = document.getElementById('adsCardsWrap');
    const eventsWrap = document.getElementById('eventsCardsWrap');
    if (adsWrap) {
        if (sysSettings.promoImg || sysSettings.promoText || sysSettings.promoLink || sysSettings.promoEmbed) {
            const body = sysSettings.promoEmbed
                ? `<div class="overflow-hidden rounded-xl border">${sysSettings.promoEmbed}</div>`
                : `
                    ${sysSettings.promoImg ? `<img src="${sysSettings.promoImg}" class="w-full h-36 object-cover rounded-xl border mb-2" alt="إعلان">` : ''}
                    <p class="text-xs font-bold text-gray-700 mb-2">${sysSettings.promoText || 'إعلان مميز من Hola'}</p>
                    ${sysSettings.promoLink ? `<a href="${sysSettings.promoLink}" target="_blank" class="inline-flex items-center gap-1 text-xs font-black bg-hola-purple text-white px-3 py-2 rounded-lg">عرض التفاصيل <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
                `;
            adsWrap.innerHTML = `<div class="bg-white border border-purple-100 rounded-2xl p-3 shadow-sm sm:col-span-2">${body}</div>`;
        } else {
            adsWrap.innerHTML = '<div class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-500 font-bold sm:col-span-2 text-center">لا توجد إعلانات حالياً</div>';
        }
    }
    if (eventsWrap) {
        const cards = [];
        for (let slot = 1; slot <= 3; slot++) {
            const k = (x) => slot === 1 ? x : `ev${slot}_${x}`;
            if (sysSettings[k('evActive')] && sysSettings[k('evTitle')]) {
                cards.push(`
                    <button onclick="window.openEventLanding(${slot})" class="text-right bg-white border border-orange-100 rounded-2xl p-3 shadow-sm hover:shadow-md transition">
                        <p class="text-[10px] font-black text-hola-orange mb-1">فعالية</p>
                        <p class="font-black text-hola-purple text-sm mb-1">${sysSettings[k('evTitle')]}</p>
                        <p class="text-[11px] text-gray-500 font-bold">${sysSettings[k('evTime')] || 'قريباً'}</p>
                    </button>
                `);
            }
        }
        eventsWrap.innerHTML = cards.length ? cards.join('') : '<div class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-500 font-bold sm:col-span-2 text-center">لا توجد فعاليات نشطة حالياً</div>';
    }
};


// ─── Admin Manual Subscription ────────────────────────────────────────────────
window.showAdminManualSubModal = () => {
    const sel = document.getElementById('manualSubPlanSelect');
    if (sel) {
        sel.innerHTML = Object.values(_plans)
            .filter(p => p.active !== false)
            .map(p => `<option value="${p.id}">${p.name} — ${p.price} ج.م (${p.allowedDays || p.days} يوم)</option>`)
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

// ─── Boot ─────────────────────────────────────────────────────────────────────
initFirebase();

// ─── Captive Portal Auto-Handoff ──────────────────────────────────────────────
(function handleCaptivePortalRedirect() {
    const params = new URLSearchParams(window.location.search);
    const isPortal = params.get('portal') === '1';
    const phone = (params.get('phone') || localStorage.getItem('hola_portal_phone') || '').trim();
    if (!isPortal || !phone || phone.length < 10) return;

    const tryAttachProfile = async () => {
        if (!db) return setTimeout(tryAttachProfile, 500);
        let prof = _profiles[phone];
        if (!prof) {
            const fallbackProfile = {
                name: 'عميل إنترنت',
                phone,
                walletBalance: 0,
                stamps: [],
                joinedAt: Date.now()
            };
            try {
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', phone), fallbackProfile);
                prof = fallbackProfile;
                _profiles[phone] = fallbackProfile;
            } catch (_e) {}
        }
        if (!prof) return setTimeout(tryAttachProfile, 700);

        setMyProfile({ ...prof, isRemote: true });
        document.getElementById('navPublic')?.classList.add('hidden');
        document.getElementById('navClient')?.classList.remove('hidden');
        switchView('client');
        window.activateRemoteMode && window.activateRemoteMode(phone);
        showMsg('تم تسجيل دخولك عبر بوابة الواي فاي بنجاح', 'success');
    };

    setTimeout(tryAttachProfile, 1000);
})();
