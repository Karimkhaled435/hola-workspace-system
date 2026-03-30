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
    if (!cartDiv) return;
    if (window._barCart.length === 0) {
        cartDiv.classList.add('hidden');
        if (confirmBtn) confirmBtn.classList.add('hidden');
    } else {
        cartDiv.classList.remove('hidden');
        if (confirmBtn) confirmBtn.classList.remove('hidden');
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
        [key('evTitle')]: t, [key('evDesc')]: d, [key('evTime')]: tmDisplay, [key('evImg')]: img, [key('evActive')]: c,
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
    safeSet('modalEventTitle', 'innerText', sysSettings[key('evTitle')] || '');
    safeSet('modalEventDesc', 'innerText', sysSettings[key('evDesc')] || '');
    safeSet('modalEventTime', 'innerText', sysSettings[key('evTime')] || '');
    safeSet('modalEventImg', 'src', sysSettings[key('evImg')] || '');
    // Set WhatsApp contact button
    const waNum = sysSettings.whatsappNum || '';
    const fbPage = sysSettings.fbPageLink || '';
    const title = sysSettings[key('evTitle')] || 'فعالية Hola Workspace';
    const time = sysSettings[key('evTime')] || '';
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
    if (!db || !myProfile) return;
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
    safeSet('subCardTitle', 'innerText', 'بطاقة اشتراكك');
    safeSet('subCardPlanName', 'innerText', sub.planName || '');
    safeSet('subCardCode', 'innerText', sub.code || '---');
    safeSet('subCardStatus', 'innerText', sub.status === 'active' ? '✅ نشط' : sub.status === 'expired' ? '❌ منتهي' : '⏳ معلق');
    if (sub.startDate) safeSet('subCardFrom', 'innerText', new Date(sub.startDate).toLocaleDateString('ar-EG'));
    if (sub.endDate) safeSet('subCardTo', 'innerText', new Date(sub.endDate).toLocaleDateString('ar-EG'));
    safeSet('subCardDaysLeft', 'innerText', sub.daysLeft || 0);
    document.getElementById('subscriptionCardModal')?.classList.remove('hidden');
};

window.printSubCard = () => {
    window.print();
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
    const content = document.getElementById('remoteProfileContent');
    if (!content) return;
    const activeSub = Object.values(_subscriptions).find(s => s.phone === phone && s.status === 'active');
    const history = Object.values(_sessions).filter(s => s.phone === phone && s.status === 'completed').sort((a, b) => b.endTime - a.endTime).slice(0, 5);
    const lastSession = history[0];
    content.innerHTML = `
        <div class="bg-gray-50 p-4 rounded-xl border mb-3">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-12 h-12 bg-hola-purple text-white rounded-full flex items-center justify-center font-bold text-lg">${prof.name?.charAt(0) || '?'}</div>
                <div><p class="font-black text-hola-purple">${prof.name}</p><p class="text-xs font-mono text-gray-500">${phone}</p></div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-center">
                <div class="bg-white p-2 rounded-lg border"><p class="text-[10px] text-gray-500">المحفظة</p><p class="font-black text-green-600">${prof.walletBalance || 0} ج</p></div>
                <div class="bg-white p-2 rounded-lg border"><p class="text-[10px] text-gray-500">الأختام</p><p class="font-black text-hola-orange">${prof.stamps?.length || 0}</p></div>
            </div>
        </div>
        ${activeSub ? `<div class="bg-purple-50 p-3 rounded-xl border border-purple-100 mb-3 cursor-pointer" onclick="window.showSubCard('${activeSub.id}')">
            <p class="text-xs font-bold text-hola-purple mb-1"><i class="fa-solid fa-crown text-hola-orange ml-1"></i>اشتراكك النشط</p>
            <p class="font-black text-hola-purple">${activeSub.planName}</p>
            <p class="text-xs text-gray-500">متبقي: ${activeSub.daysLeft} يوم — حتى ${new Date(activeSub.endDate || 0).toLocaleDateString('ar-EG')}</p>
            <p class="text-[10px] text-hola-orange font-bold mt-1">اضغط لعرض البطاقة وطباعتها</p>
        </div>` : ''}
        ${lastSession ? `<div class="bg-white p-3 rounded-xl border mb-3" onclick="window.printInvoice('${lastSession.id}')">
            <p class="text-xs font-bold text-gray-600 mb-1"><i class="fa-solid fa-print text-gray-500 ml-1"></i>آخر فاتورة</p>
            <p class="text-sm font-bold">${new Date(lastSession.endTime).toLocaleDateString('ar-EG')} — ${lastSession.finalCost} ج</p>
            <p class="text-[10px] text-hola-orange mt-1">اضغط للطباعة</p>
        </div>` : ''}
        <p class="text-[10px] text-center text-gray-400 mt-2">⚠️ أنت خارج المكان — صلاحيات عرض فقط</p>`;
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
    document.getElementById('adminChatHeader').innerHTML = `<i class="fa-solid fa-headset text-hola-orange"></i> محادثة مع: <span class="text-hola-orange">${name}</span>`;
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
window.switchView = switchView;
window.switchClientTab = switchClientTab;
window.switchAdminTab = switchAdminTab;
window.checkLocationForLogin = checkLocationForLogin;
window.showPreBookingFallback = showPreBookingFallback;
window.resetLocationCheck = resetLocationCheck;
window.checkNewUser = (val) => checkNewUser(val, _profiles);
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

// ─── Render Active Events in Login Screen ────────────────────────────────────
window._renderLoginEvents = () => {
    const container = document.getElementById('loginEventsQuick');
    if (!container) return;
    let html = '';
    for (let slot = 1; slot <= 3; slot++) {
        const k = (x) => slot === 1 ? x : `ev${slot}_${x}`;
        if (sysSettings[k('evActive')] && sysSettings[k('evTitle')]) {
            html += `<div class="bg-purple-50 border border-purple-100 p-2.5 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-purple-100 transition" onclick="window.openEventLanding(${slot})">
                ${sysSettings[k('evImg')] ? `<img src="${sysSettings[k('evImg')]}" class="w-10 h-10 rounded-lg object-cover border flex-shrink-0">` : `<div class="w-10 h-10 bg-purple-200 rounded-lg flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-masks-theater text-hola-purple"></i></div>`}
                <div class="flex-1 min-w-0"><p class="font-black text-hola-purple text-xs truncate">${sysSettings[k('evTitle')]}</p><p class="text-[10px] text-gray-400">${sysSettings[k('evTime')] || 'اضغط لمعرفة التفاصيل'}</p></div>
                <span class="text-[10px] bg-hola-orange text-white px-2 py-1 rounded-full font-bold whitespace-nowrap">تفاصيل</span>
            </div>`;
        }
    }
    if (html) { container.innerHTML = html; container.classList.remove('hidden'); }
    else container.classList.add('hidden');
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
    const phone = window._currentManageUserPhone || '';
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

// ─── Boot ─────────────────────────────────────────────────────────────────────
initFirebase();
