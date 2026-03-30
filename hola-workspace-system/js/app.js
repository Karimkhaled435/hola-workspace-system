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
    openUserManage, saveUserWallet, openUserDetails,
    unbanPhone, markPreBookingDone, deleteAllHistory, deleteAllArchivedBookings, exportTableToCSV
} from "./vouchers.js";
import { printInvoice, showEndDaySummary, closeEndDaySummary, printEndDaySummary } from "./print.js";

// ─── BIND IMPORTS TO GLOBAL WINDOW FOR HTML EVENT HANDLERS ──────────────────
window.checkLocationForLogin = checkLocationForLogin;
window.showPreBookingFallback = showPreBookingFallback;
window.resetLocationCheck = resetLocationCheck;
window.checkNewUser = checkNewUser;
window.submitPreBooking = submitPreBooking;
window.submitInternalPreBooking = submitInternalPreBooking;
window.handleLogin = handleLogin;
window.showAdminLoginModal = showAdminLoginModal;
window.verifyAdminPin = verifyAdminPin;
window.logoutAdmin = logoutAdmin;

window.showMsg = showMsg;
window.copyToClipboard = copyToClipboard;
window.switchView = switchView;
window.switchClientTab = switchClientTab;
window.switchAdminTab = switchAdminTab;

window.applyDiscountCode = applyDiscountCode;
window.saveDiscount = saveDiscount;
window.deleteDiscount = deleteDiscount;
window.showDiscountModal = showDiscountModal;
window.saveMenuItem = saveMenuItem;
window.deleteMenuItem = deleteMenuItem;
window.showMenuModal = showMenuModal;
window.openUserManage = openUserManage;
window.saveUserWallet = saveUserWallet;
window.openUserDetails = openUserDetails;
window.unbanPhone = unbanPhone;
window.markPreBookingDone = markPreBookingDone;
window.deleteAllHistory = deleteAllHistory;
window.deleteAllArchivedBookings = deleteAllArchivedBookings;
window.exportTableToCSV = exportTableToCSV;

window.printInvoice = printInvoice;
window.showEndDaySummary = showEndDaySummary;
window.closeEndDaySummary = closeEndDaySummary;
window.printEndDaySummary = printEndDaySummary;

// ─── Global Init ─────────────────────────────────────────────────────────────
window._loginAttempts = {};
window._bannedPhones = {};
window.lastCompletedSessionId = null;
window.lastAdminCompletedSessionId = null;
window.currentPaymentSessionId = null;
window.currentPaymentType = null;
window._currentShiftAdmin = currentShiftAdmin;
window._currentEvSlot = 1;

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

// ─── Public Capacity Auto-Updater (تم إصلاح القطع هنا!) ────────────────────────────────
setInterval(() => {
    const statusText = document.getElementById('publicStatusText');
    const gauge = document.getElementById('capacityGauge');
    
    if (statusText && gauge && sysSettings && Object.keys(sysSettings).length > 0) {
        const activeCount = Object.values(_sessions || {}).filter(s => s.status === 'active').length;
        const maxCap = parseInt(sysSettings.maxCapacity) || 50;
        let percentage = (activeCount / maxCap) * 100;
        if (percentage > 100) percentage = 100;
        
        gauge.style.width = `${percentage}%`;
        
        if (activeCount === 0) {
            statusText.innerText = `المكان هادي ومناسب جداً الآن (0 عملاء)`;
            statusText.className = 'text-sm font-bold text-green-600';
            gauge.className = 'h-full bg-gradient-to-l from-green-400 to-green-500 transition-all duration-1000 relative';
        } else if (percentage <= 50) {
            statusText.innerText = `هادي ومناسب للتركيز (${activeCount} عميل)`;
            statusText.className = 'text-sm font-bold text-green-600';
            gauge.className = 'h-full bg-gradient-to-l from-green-400 to-green-500 transition-all duration-1000 relative';
        } else if (percentage <= 80) {
            statusText.innerText = `متوسط الازدحام (${activeCount} عميل)`;
            statusText.className = 'text-sm font-bold text-yellow-600';
            gauge.className = 'h-full bg-gradient-to-l from-yellow-400 to-orange-500 transition-all duration-1000 relative';
        } else {
            statusText.innerText = `مزدحم جداً (${activeCount} عميل)`;
            statusText.className = 'text-sm font-bold text-red-600 animate-pulse';
            gauge.className = 'h-full bg-gradient-to-l from-red-500 to-red-600 transition-all duration-1000 relative';
        }
    }
}, 2500);

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
                <button data-action="addToBarCart" data-menuid="${item.id}" class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center hover:bg-orange-50 transition w-full">
                    <i class="fa-solid ${item.icon || 'fa-mug-hot'} text-2xl text-hola-purple mb-2" aria-hidden="true"></i>
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
            `<div class="flex justify-between items-center text-sm"><span class="font-bold">${i.name}</span><div class="flex items-center gap-2"><span class="text-hola-orange font-black">${i.price} ج</span><button data-action="removeFromBarCart" data-idx="${idx}" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-times text-xs" aria-hidden="true"></i><span class="sr-only">إزالة</span></button></div></div>`
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
    if (activeSub.lastUsedDate === today) return; 
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
                <button data-action="removeSessionItem" data-sid="${id}" data-idx="${idx}" class="text-red-500 hover:text-red-700 bg-red-50 w-6 h-6 rounded-full" aria-label="إزالة الطلب"><i class="fa-solid fa-trash text-xs" aria-hidden="true"></i></button>
            </div>`
        ).join('');
    }
    const dMs = Date.now() - s.startTime; const tC = calculateTimeCost(dMs); const iC = (s.items || []).reduce((su, i) => su + i.price, 0);
    safeSet('liveSesTimeCost', 'innerText', `${tC} ج`); safeSet('liveSesItemsCost', 'innerText', `${iC} ج`); safeSet('liveSesTotal', 'innerText', `${tC + iC} ج`);
    const btn = document.getElementById('liveSesEndBtn'); 
    if (btn) {
        btn.dataset.action = 'endAdminLiveSession';
        btn.dataset.sid = id;
    }
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
        if (i + 1 === slot) { 
            btn.classList.add('bg-hola-purple', 'text-white', 'shadow'); btn.classList.remove('bg-gray-100', 'text-gray-600');
            btn.setAttribute('aria-selected', 'true');
        } else { 
            btn.classList.remove('bg-hola-purple', 'text-white', 'shadow'); btn.classList.add('bg-gray-100', 'text-gray-600'); 
            btn.setAttribute('aria-selected', 'false');
        }
    });
    safeSet('currentEvSlotLabel', 'innerText', `(${slot})`);
    
    const prefix = slot === 1 ? '' : `ev${slot}_`;
    const key = (k) => slot === 1 ? k : `ev${slot}_${k}`;
    safeSet('setEvTitle', 'value', sysSettings[key('evTitle')] || '');
    safeSet('setEvDesc', 'value', sysSettings[key('evDesc')] || '');
    safeSet('setEvImg', 'value', sysSettings[key('evImg')] || '');
    const evTimeRaw = sysSettings[key('evTime')] || '';
    
    try {
        if (evTimeRaw.includes('T') || evTimeRaw.match(/\d{4}-\d{2}-\d{2}/)) {
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
    
    const baseUrl = window.location.href.split('?')[0];
    const eventUrl = `${baseUrl}?ev=${slot}`;
    const shareText = `🎉 ${title}\n📅 ${time}\n\n${desc}\n\n📍 Hola Workspace\n🔗 ${eventUrl}${waNum ? `\n📱 واتساب: wa.me/${waNum}` : ''}`;
    document.getElementById('shareModalTitle').innerText = title;
    document.getElementById('shareModalDesc').innerText = time;
    document.getElementById('shareEventUrl').innerText = eventUrl;
    const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(eventUrl)}&quote=${encodeURIComponent(shareText)}`;
    const shareFbBtn = document.getElementById('shareFbBtn');
    if (shareFbBtn) {
        shareFbBtn.onclick = null; // removing inline
        shareFbBtn.addEventListener('click', () => window.open(fbShareUrl, '_blank'), {once: true});
    }
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
                <div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-4"><i class="fa-solid fa-check-double" aria-hidden="true"></i></div>
                <h3 class="text-xl font-black text-hola-purple mb-3">تم استلام حجزك!</h3>
                <p class="text-gray-600 font-bold leading-relaxed text-sm">سنقوم بالتواصل معك على رقم <span class="text-hola-purple font-black">${phone}</span> قريباً لتأكيد الحجز.</p>
                <p class="text-[10px] text-gray-400 mt-2">متبقي لك ${1 - count} حجز سريع اليوم</p>
                <button data-action="closeQuickBookReload" class="mt-6 text-hola-orange font-bold text-sm hover:underline">إغلاق</button>
            </div>`;
        playAlertSound('congrats');
    } catch (e) { showMsg("حدث خطأ أثناء الحجز", "error"); }
};

// ─── Room Booking from Client Panel ──────────────────────────────────────────
window.submitRoomBooking = async () => {
    if (!db || !myProfile) return;
    const phone = myProfile.phone; 
    const note = document.getElementById('roomBookNote')?.value.trim() || '';
    
    // Check if user has a pending room booking
    const pendingRoom = Object.values(_prebookings).find(p => p.phone === phone && p.type === 'حجز غرفة خاصة' && p.status === 'pending');
    if (pendingRoom) return showMsg("لديك طلب حجز غرفة معلق بالفعل، سيتم التواصل معك قريباً", "error");

    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), {
            name: `${myProfile.name} (حجز غرفة)`, phone, note,
            expectedTime: 'سيتم التنسيق', status: 'pending', type: 'حجز غرفة خاصة', createdAt: Date.now()
        });
        showMsg("تم إرسال طلب حجز الغرفة! سنتواصل معك للتأكيد 🎉", "success");
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
    const imgEl = document.getElementById('modalEventImg');
    if (imgEl) {
        imgEl.src = sysSettings[key('evImg')] || '';
        if(sysSettings[key('evImg')]) imgEl.style.display = 'block';
        else imgEl.style.display = 'none';
    }
    
    // Set WhatsApp contact button
    const waNum = sysSettings.whatsappNum || '';
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

// ─── Missing HTML Event Action Fallbacks ──────────────────────────────────────
window.showEventIntentFromLogin = () => {
    document.getElementById('locationCheckState')?.classList.add('hidden');
    document.getElementById('loginForm')?.classList.remove('hidden');
    showMsg("سجل دخولك الآن لتأكيد حضورك للفعالية", "normal");
};

window.toggleLandingEmbed = () => {
    const div = document.getElementById('landingEmbedDiv');
    if (div) div.classList.toggle('hidden');
};

window.submitLandingAttend = async () => {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    const name = document.getElementById('landingName')?.value.trim();
    const phone = document.getElementById('landingPhone')?.value.trim();
    if (!name || !phone || phone.length < 10) return showMsg("برجاء إدخال الاسم ورقم الموبايل بشكل صحيح", "error");
    
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'event_attendees'), {
            name, phone, timestamp: Date.now(), 
            slot: window._currentPublicEvSlot || 1, 
            evTitle: document.getElementById('landingEvTitle')?.innerText || 'فعالية'
        });
        document.getElementById('landingRegisterDiv').innerHTML = '<div class="text-center p-4 bg-green-50 text-green-700 rounded-xl font-bold">تم تسجيل حضورك بنجاح! ننتظرك 🎉</div>';
        playAlertSound('congrats');
    } catch (e) {
        showMsg("حدث خطأ أثناء التسجيل", "error");
    }
};

if (!window.openNotifFullImg) window.openNotifFullImg = (src) => { 
    const m = document.getElementById('fullImgModal'); 
    const i = document.getElementById('fullImgContent');
    if(m && i) { i.src = src; m.classList.remove('hidden'); }
};
if (!window.closeClientNotif) window.closeClientNotif = () => document.getElementById('clientNotifModal')?.classList.add('hidden');


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
             data-action="selectPlan" data-planid="${p.id}" data-planname="${p.name}" role="button" tabindex="0">
            <div class="absolute top-0 right-0 bg-hola-orange text-white text-[10px] px-3 py-1 rounded-bl-lg font-bold">${p.price} ج.م</div>
            <div class="mt-4">
                <h4 class="font-black text-hola-purple text-lg mb-1">${p.name}</h4>
                <p class="text-xs text-gray-500 font-bold mb-3">${p.desc || ''}</p>
                <div class="flex justify-between text-xs font-bold text-gray-600">
                    <span><i class="fa-solid fa-calendar-days text-hola-orange ml-1" aria-hidden="true"></i>${p.days} يوم</span>
                    <span><i class="fa-solid fa-check-circle text-green-500 ml-1" aria-hidden="true"></i>${p.allowedDays || p.days} أيام استخدام</span>
                </div>
            </div>
        </div>`).join('');
}

window.selectPlan = (planId, planName) => {
    const planEl = document.getElementById('subPlanId');
    if (planEl) planEl.value = planId;
    const titleEl = document.getElementById('selectedPlanTitle');
    if (titleEl) titleEl.innerText = planName;
    
    const formDiv = document.getElementById('subscriptionFormDiv');
    if (formDiv) {
        formDiv.classList.remove('hidden');
        formDiv.scrollIntoView({ behavior: 'smooth' });
        // If logged in, hide inputs and use myProfile
        if (myProfile) {
            const nEl = document.getElementById('subName');
            const pEl = document.getElementById('subPhone');
            if (nEl && nEl.parentElement) nEl.parentElement.classList.add('hidden');
            if (pEl && pEl.parentElement) pEl.parentElement.classList.add('hidden');
        }
    }
};

window.submitSubscription = async () => {
    if (!db) return showMsg("غير متصل بقاعدة البيانات", "error");
    
    const nameEl = document.getElementById('subName');
    const phoneEl = document.getElementById('subPhone');
    
    const name = myProfile ? myProfile.name : (nameEl ? nameEl.value.trim() : '');
    const phone = myProfile ? myProfile.phone : (phoneEl ? phoneEl.value.trim() : '');
    const planIdEl = document.getElementById('subPlanId');
    const planId = planIdEl ? planIdEl.value : null;

    if (!name || !phone || phone.length < 10) return showMsg("برجاء إدخال الاسم ورقم الهاتف بشكل صحيح", "error");
    if (!planId) return showMsg("اختر باقة أولاً", "error");

    const mySubs = Object.values(_subscriptions).filter(s => s.phone === phone);
    
    // Check if there is already a pending subscription
    if (mySubs.some(s => s.status === 'pending')) {
        return showMsg("لديك طلب اشتراك معلق بالفعل، يرجى انتظار الموافقة", "error");
    }

    // Check if subscribed within 48 hours and not cancelled or expired
    const recent = mySubs.find(s => (Date.now() - s.createdAt < 48 * 3600000) && s.status !== 'cancelled' && s.status !== 'expired');
    if (recent) {
         return showMsg("لا يمكنك تقديم طلب جديد حالياً. الرجاء الانتظار.", "error");
    }

    try {
        const plan = _plans[planId];
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'subscriptions'), {
            name, phone,
            planId, planName: plan.name,
            status: 'pending',
            createdAt: Date.now()
        });
        showMsg("تم إرسال طلب اشتراكك بنجاح! سيتم التواصل معك قريباً", "success");
        document.getElementById('subscriptionModal')?.classList.add('hidden');
    } catch (e) {
        showMsg("حدث خطأ أثناء الطلب", "error");
    }
};
