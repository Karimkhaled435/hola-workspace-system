// =====================================================
// js/app.js — Main Entry Point, Timer, Session Logic
// =====================================================

if (typeof document !== 'undefined' && !document.getElementById('hola-global-fixes')) {
    const style = document.createElement('style');
    style.id = 'hola-global-fixes';
    style.innerHTML = `
        .hidden { display: none !important; }
        .client-tab-content.hidden { display: none !important; }
        .admin-tab-content.hidden { display: none !important; }
        section.hidden { display: none !important; }
        
        @media print {
            #invoicePrintArea { font-family: 'Cairo', sans-serif !important; direction: rtl; }
            #invoicePrintArea h1 { font-size: 28pt !important; color: #000 !important; }
            #invoicePrintArea p, #invoicePrintArea td, #invoicePrintArea th { color: #333 !important; font-size: 14pt !important; }
            #invoicePrintArea .border-hola-purple { border-color: #333 !important; }
            #invoicePrintArea .bg-hola-purple { background-color: #eee !important; color: #000 !important; }
            #invoicePrintArea .bg-gray-50 { background-color: #f9f9f9 !important; }
        }
    `;
    document.head.appendChild(style);
}

import { collection, addDoc, updateDoc, doc, deleteDoc, setDoc, getDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initFirebase, db, appId } from "./firebase.js";
import { setupListeners } from "./sessions.js"; 

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
    submitPreBooking, submitInternalPreBooking, showQuickBookModal, submitQuickBook,
    handleLogin, showAdminLoginModal, verifyAdminPin, logoutAdmin
} from "./auth.js";

import {
    applyDiscountCode, saveDiscount, deleteDiscount, showDiscountModal,
    saveMenuItem, deleteMenuItem, showMenuModal,
    saveUserWallet, openUserDetails,
    unbanPhone, markPreBookingDone, deleteAllHistory, deleteAllArchivedBookings, exportTableToCSV
} from "./vouchers.js";

import { printInvoice, showEndDaySummary, closeEndDaySummary, printEndDaySummary } from "./print.js";

window.checkLocationForLogin = checkLocationForLogin;
window.showPreBookingFallback = showPreBookingFallback;
window.resetLocationCheck = resetLocationCheck;
window.checkNewUser = checkNewUser;
window.submitPreBooking = submitPreBooking;
window.submitInternalPreBooking = submitInternalPreBooking;
window.showQuickBookModal = showQuickBookModal;
window.submitQuickBook = submitQuickBook;
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

window._loginAttempts = {};
window._bannedPhones = {};
window.lastCompletedSessionId = null;
window.lastAdminCompletedSessionId = null;
window.currentPaymentSessionId = null;
window.currentPaymentType = null;
window._currentShiftAdmin = currentShiftAdmin;
window._currentEvSlot = 1;
window._isRemoteMode = false;
window._currentManageUserPhone = null;

if (db && appId) {
    if (typeof setupListeners === 'function') setupListeners(db, appId); 
}

window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const evSlot = urlParams.get('ev');
    if (evSlot) {
        setTimeout(() => window.openEventLandingPage(parseInt(evSlot)), 1500); 
    }
});

window.maskName = (name) => {
    if (!name) return "عميل";
    const parts = name.split(" ");
    if (parts.length === 1) return parts[0];
    return parts.map((p, i) => i === 0 ? p : p[0] + "****").join(" ");
};

window.openUserManageGlobal = (phone) => {
    window._currentManageUserPhone = phone;
    const prof = _profiles[phone];
    if(!prof) return;
    safeSet('manageUserName', 'innerText', prof.name);
    safeSet('manageUserPhone', 'innerText', prof.phone);
    const wEl = document.getElementById('manageUserWallet'); if(wEl) wEl.value = prof.walletBalance || 0;
    document.getElementById('userManageModal')?.classList.remove('hidden');
};

window.sendUserMsgOnly = async () => {
    if (!db) return;
    const p = window._currentManageUserPhone;
    if (!p) return showMsg("لم يتم تحديد العميل", "error");
    const m = document.getElementById('manageUserMsg')?.value.trim();
    const t = document.getElementById('manageUserNotifType')?.value || "normal";
    const img = document.getElementById('manageUserImgUrl')?.value.trim() || "";
    const lnk = document.getElementById('manageUserLinkUrl')?.value.trim() || "";
    if (!m) return showMsg("اكتب رسالة", "error");
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), { phone: p, msg: m, type: t, imgUrl: img, linkUrl: lnk, isRead: false, timestamp: Date.now() });
        showMsg("تم إرسال الإشعار", "success");
        document.getElementById('userManageModal')?.classList.add('hidden');
    } catch(e) { showMsg("خطأ في الإرسال", "error"); }
};

window.sendUserDiscountOnly = async () => {
    if (!db) return;
    const p = window._currentManageUserPhone;
    if (!p) return showMsg("لم يتم تحديد العميل", "error");
    const v = parseInt(document.getElementById('manageUserDiscountVal')?.value) || 0;
    const t = document.getElementById('manageUserDiscountType')?.value;
    if (v <= 0) return showMsg("أدخل قيمة خصم", "error");
    const code = "GFT" + Math.random().toString(36).substring(2, 6).toUpperCase();
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'discounts'), { code, value: v, isPercentage: (t === 'percent'), assignedTo: p, title: "هدية خاصة", isUsed: false, createdAt: Date.now() });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), { phone: p, msg: `تم إرسال كود خصم خاص لك: ${code}`, type: "congrats", isRead: false, timestamp: Date.now() });
        showMsg("تم إرسال الكود", "success");
        document.getElementById('userManageModal')?.classList.add('hidden');
    } catch(e) { showMsg("خطأ", "error"); }
};

window.refreshNotifications = async () => {
    if(!db || !myProfile) return;
    try {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'));
        const snap = await getDocs(q);
        let notifs = {};
        snap.forEach(d => { notifs[d.id] = { id: d.id, ...d.data() }; });
        renderClientNotifications(myProfile, notifs);
        showMsg("تم تحديث الإشعارات", "success");
    } catch(e) {}
};

window.renderRemoteProfileData = (phone) => {
    const prof = _profiles[phone];
    const content = document.getElementById('remoteProfileContent');
    if (!prof || !content) return;

    const mySubs = Object.values(_subscriptions || {}).filter(s => s.phone === phone && s.status === 'active' && s.daysLeft > 0);
    const subHtml = mySubs.length > 0 
        ? mySubs.map(s => `<div class="bg-orange-50 text-hola-orange p-2 rounded text-sm font-bold border border-orange-100 mb-1">${s.planName} (متبقي ${s.daysLeft} يوم)</div>`).join('') 
        : '<p class="text-xs text-gray-400 text-center">لا توجد اشتراكات نشطة</p>';

    const userSessions = Object.values(_sessions || {}).filter(s => s.phone === phone && s.status === 'completed').sort((a,b) => b.endTime - a.endTime);
    const lastSession = userSessions[0];
    let invoiceHtml = '<p class="text-xs text-gray-400 text-center">لا توجد زيارات سابقة</p>';
    if(lastSession) {
        const d = new Date(lastSession.startTime).toLocaleDateString('ar-EG');
        invoiceHtml = `<div class="bg-purple-50 p-3 rounded-lg text-xs font-bold border border-purple-100 flex justify-between items-center"><span>آخر زيارة: ${d}</span><span class="text-hola-purple font-black text-lg">${lastSession.finalCost || 0} ج.م</span></div>`;
    }

    let eventsHtml = '';
    if (sysSettings && sysSettings.evActive) {
         eventsHtml = `<div class="mt-2 bg-blue-50 p-3 rounded-lg border border-blue-100 cursor-pointer hover:bg-blue-100 transition text-center shadow-sm" data-action="open-event-details" data-slot="1"><span class="text-xs font-bold text-blue-700"><i class="fa-solid fa-masks-theater ml-1"></i> ${sysSettings.evTitle || 'فعالية جديدة متاحة!'} - اضغط لمعرفة التفاصيل</span></div>`;
    }

    content.innerHTML = `
        <div class="text-center border-b pb-4">
            <h4 class="font-black text-lg text-hola-purple">${window.maskName(prof.name)}</h4>
            <p class="text-xs text-gray-500 font-mono mt-1">${prof.phone}</p>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-2 mt-4">
            <div class="bg-gray-50 p-3 rounded-xl text-center border">
                <p class="text-xs text-gray-500 mb-1">المحفظة</p>
                <p class="font-black text-green-600 text-lg">${prof.walletBalance || 0} ج.م</p>
            </div>
            <div class="bg-gray-50 p-3 rounded-xl text-center border">
                <p class="text-xs text-gray-500 mb-1">الأختام</p>
                <p class="font-black text-hola-orange text-lg">${prof.stamps ? prof.stamps.length : 0}</p>
            </div>
        </div>
        <div class="mt-4">
            <h5 class="font-bold text-sm text-gray-700 mb-2"><i class="fa-solid fa-file-invoice text-hola-purple ml-1" aria-hidden="true"></i> آخر فاتورة:</h5>
            ${invoiceHtml}
        </div>
        <div class="mt-4">
            <h5 class="font-bold text-sm text-gray-700 mb-2"><i class="fa-solid fa-crown text-hola-orange ml-1" aria-hidden="true"></i> اشتراكاتك الحالية:</h5>
            ${subHtml}
        </div>
        ${eventsHtml ? `<div class="mt-4"><h5 class="font-bold text-sm text-gray-700 mb-2"><i class="fa-solid fa-calendar-check text-hola-orange ml-1" aria-hidden="true"></i> أحدث الفعاليات:</h5>${eventsHtml}</div>` : ''}
    `;
};

export function playAlertSound(type = 'normal') {
    let audio = document.getElementById('alertSound');
    if (type === 'high') audio = document.getElementById('soundHigh') || audio;
    if (type === 'congrats') audio = document.getElementById('soundCongrats') || audio;
    if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
}

export async function logOperation(db, appId, adminName, actionType, details) {
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'operations'), { adminName: adminName || "الإدارة", actionType, details, timestamp: Date.now() });
    } catch (e) {}
}

function calculateTimeCost(diffMs) {
    if (diffMs <= 0) return 0;
    const hours = Math.ceil(diffMs / 3600000);
    let cost = 0;
    if (hours >= 1) cost += (sysSettings && sysSettings.pricingTier1) ? sysSettings.pricingTier1 : 25;
    if (hours >= 2) cost += (sysSettings && sysSettings.pricingTier2) ? sysSettings.pricingTier2 : 15;
    if (hours >= 3) cost += (sysSettings && sysSettings.pricingTier3) ? sysSettings.pricingTier3 : 10;
    return cost;
}

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

setInterval(() => {
    try {
        const statusText = document.getElementById('publicStatusText');
        const gauge = document.getElementById('capacityGauge');
        
        if (statusText && gauge) {
            const sessionsObj = (typeof _sessions !== 'undefined' && _sessions) ? _sessions : {};
            const activeCount = Object.values(sessionsObj).filter(s => s && s.status === 'active').length;
            const maxCap = (typeof sysSettings !== 'undefined' && sysSettings && sysSettings.maxCapacity) ? parseInt(sysSettings.maxCapacity) : 50;
            let percentage = (activeCount / maxCap) * 100;
            if (percentage > 100) percentage = 100;
            if (isNaN(percentage)) percentage = 0;
            
            gauge.style.width = `${percentage}%`;
            
            if (activeCount === 0) {
                statusText.innerText = `المكان هادي ومناسب جداً الآن`;
                statusText.className = 'text-sm font-bold text-green-600';
                gauge.className = 'h-full bg-gradient-to-l from-green-400 to-green-500 transition-all duration-1000 relative';
            } else if (percentage <= 50) {
                statusText.innerText = `هادي ومناسب للتركيز`;
                statusText.className = 'text-sm font-bold text-green-600';
                gauge.className = 'h-full bg-gradient-to-l from-green-400 to-green-500 transition-all duration-1000 relative';
            } else if (percentage <= 80) {
                statusText.innerText = `متوسط الازدحام`;
                statusText.className = 'text-sm font-bold text-yellow-600';
                gauge.className = 'h-full bg-gradient-to-l from-yellow-400 to-orange-500 transition-all duration-1000 relative';
            } else {
                statusText.innerText = `مزدحم جداً`;
                statusText.className = 'text-sm font-bold text-red-600 animate-pulse';
                gauge.className = 'h-full bg-gradient-to-l from-red-500 to-red-600 transition-all duration-1000 relative';
            }
        }
    } catch(e) {}
}, 2500);

export function scrollToBottom(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        setTimeout(() => { el.scrollTop = el.scrollHeight; }, 150);
    }
}
window.scrollToBottom = scrollToBottom;

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

window._barCart = [];

window.openBarSelfService = () => {
    window._barCart = [];
    const grid = document.getElementById('barSelfMenuGrid');
    if (grid) {
        const drinks = Object.values(_menu).filter(i => i.type === 'drink');
        if (drinks.length === 0) { grid.innerHTML = '<p class="col-span-full text-center text-gray-400 text-sm py-4">لا توجد مشروبات في المنيو</p>'; }
        else {
            grid.innerHTML = drinks.map(item => `
                <button data-action="add-to-bar-cart" data-menuid="${item.id}" class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm text-center hover:bg-orange-50 transition w-full">
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
            `<div class="flex justify-between items-center text-sm"><span class="font-bold">${i.name}</span><div class="flex items-center gap-2"><span class="text-hola-orange font-black">${i.price} ج</span><button data-action="remove-from-bar-cart" data-idx="${idx}" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-times text-xs" aria-hidden="true"></i><span class="sr-only">إزالة</span></button></div></div>`
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

window.recalcTotal = () => {
    const tC = parseInt(document.getElementById('clientTimeCost')?.innerText) || 0;
    const iC = parseInt(document.getElementById('clientItemsCost')?.innerText) || 0;
    let sub = tC + iC - appliedDiscountVal; if (sub < 0) sub = 0;
    safeSet('modalSubTotal', 'innerText', `${sub} ج`);
    const wIn = document.getElementById('walletDeductInput'); let mDed = wIn ? (parseInt(wIn.value) || 0) : 0;
    const uPhone = (typeof myProfile !== 'undefined' && myProfile) ? myProfile.phone : (_sessions[activeSessionId]?.phone); 
    const prof = uPhone ? _profiles[uPhone] : null;
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
    const uPhone = (typeof myProfile !== 'undefined' && myProfile) ? myProfile.phone : (_sessions[activeSessionId]?.phone); 
    const prof = uPhone ? _profiles[uPhone] : null;
    const wallet = prof?.walletBalance || 0;
    const wIn = document.getElementById('walletDeductInput'); if (wIn) { wIn.value = 0; wIn.max = wallet; }
    const wDiv = document.getElementById('manualWalletDiv'); if (wDiv) { if (wallet > 0) wDiv.classList.remove('hidden'); else wDiv.classList.add('hidden'); }
    window.recalcTotal();
    const m = document.getElementById('checkoutModal'); if (m) m.classList.remove('hidden');
};
window.closeCheckoutModal = () => { const m = document.getElementById('checkoutModal'); if (m) m.classList.add('hidden'); };

window.handleWalletInput = (el) => {
    const uPhone = (typeof myProfile !== 'undefined' && myProfile) ? myProfile.phone : (_sessions[activeSessionId]?.phone); 
    const prof = uPhone ? _profiles[uPhone] : null;
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
    const activeSub = Object.values(_subscriptions || {}).find(s => s.phone === phone && s.status === 'active' && s.daysLeft > 0);
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
    if (sysSettings && sysSettings.instapayLink) window.location.href = sysSettings.instapayLink;
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
                <button data-action="remove-session-item" data-sid="${id}" data-idx="${idx}" class="text-red-500 hover:text-red-700 bg-red-50 w-6 h-6 rounded-full" aria-label="إزالة الطلب"><i class="fa-solid fa-trash text-xs" aria-hidden="true"></i></button>
            </div>`
        ).join('');
    }
    const dMs = Date.now() - s.startTime; const tC = calculateTimeCost(dMs); const iC = (s.items || []).reduce((su, i) => su + i.price, 0);
    safeSet('liveSesTimeCost', 'innerText', `${tC} ج`); safeSet('liveSesItemsCost', 'innerText', `${iC} ج`); safeSet('liveSesTotal', 'innerText', `${tC + iC} ج`);
    const btn = document.getElementById('liveSesEndBtn'); 
    if (btn) {
        btn.dataset.action = 'end-admin-live-session';
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
    safeSet('setEvEmbed', 'value', sysSettings[key('evEmbed')] || '');
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
    if (chk) chk.checked = !!sysSettings[key('evActive')];
};

window.saveEventSettings = async () => {
    if (!db) return;
    const slot = window._currentEvSlot || 1;
    const key = (k) => slot === 1 ? k : `ev${slot}_${k}`;
    const t = document.getElementById('setEvTitle')?.value.trim() || "";
    const d = document.getElementById('setEvDesc')?.value.trim() || "";
    const img = document.getElementById('setEvImg')?.value.trim() || "";
    const emb = document.getElementById('setEvEmbed')?.value.trim() || "";
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
        [key('evTitle')]: t, [key('evDesc')]: d, [key('evTime')]: tmDisplay, [key('evImg')]: img, [key('evEmbed')]: emb, [key('evActive')]: c,
        [key('evTimeParsed')]: { date: evDate, from: evFrom, to: evTo }
    };
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), updateData);
    showMsg(`تم حفظ ونشر الفعالية ${slot}`, "success");
};

window.shareEventLink = () => {
    const slot = window._currentEvSlot || 1;
    const key = (k) => slot === 1 ? k : `ev${slot}_${k}`;
    const title = sysSettings[key('evTitle')] || 'فعالية Hola Workspace';
    const desc = sysSettings[key('evDesc')] || '';
    const time = sysSettings[key('ev
