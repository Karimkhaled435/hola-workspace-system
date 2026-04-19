// =====================================================
// js/features.js — New Features v4
// Timer sync, Free drinks, Subscription check on login,
// Reviews/Ratings, Delete chat, IP ban, Payment ref fix
/* global scrollTo, print, open, confirm, alert, prompt, setTimeout, setInterval, clearTimeout, clearInterval, localStorage, sessionStorage, navigator, location, history, performance, fetch, URL, URLSearchParams */
/* eslint-disable no-undef */
// =====================================================

import { collection, addDoc, updateDoc, doc, deleteDoc, getDocs, setDoc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId } from "./firebase.js";
import {
    sysSettings, _profiles, _sessions, _notifications, _chats, _subscriptions, _plans,
    myProfile, activeSessionId, sessionStartTime,
    setMyProfile, setActiveSessionId, setSessionStartTime, setSessionItems,
    currentShiftAdmin, setTimerInterval, timerInterval
} from "./sessions.js";
import { showMsg, safeSet, switchView, switchClientTab } from "./ui.js";
import { playAlertSound, logOperation } from "./app.js";

// ─── 1. REAL-TIME TIMER SYNC (Firestore-backed) ───────────────────────────────
// Syncs elapsed time with server startTime to prevent drift
let _timerSyncInterval = null;

export function startSyncedTimer(sessionId, startTime) {
    if (_timerSyncInterval) clearInterval(_timerSyncInterval);
    
    function tick() {
        const now = Date.now();
        const diffSecs = Math.floor((now - startTime) / 1000);
        const h = Math.floor(diffSecs / 3600).toString().padStart(2, '0');
        const m = Math.floor((diffSecs % 3600) / 60).toString().padStart(2, '0');
        const s = (diffSecs % 60).toString().padStart(2, '0');
        
        // Client elapsed display
        const elElapsed = document.getElementById('clientElapsedTime');
        if (elElapsed) elElapsed.innerHTML = `${h}:${m}<span class="text-xl text-gray-400 ml-1 font-bold">:${s}</span>`;
        
        // Admin timers - update all admin-timer elements
        document.querySelectorAll('.admin-timer[data-start]').forEach(el => {
            const st = parseInt(el.dataset.start);
            if (!st) return;
            const d = now - st;
            const ah = Math.floor(d / 3600000).toString().padStart(2, '0');
            const am = Math.floor((d % 3600000) / 60000).toString().padStart(2, '0');
            const as_ = Math.floor((d % 60000) / 1000).toString().padStart(2, '0');
            el.innerHTML = `${ah}:${am}<span class="text-[10px] text-gray-400 ml-1">:${as_}</span>`;
        });
        
        // Live session elapsed in admin modal
        const lElapsed = document.getElementById('liveSesElapsed');
        if (lElapsed && lElapsed.dataset.start) {
            const d = now - parseInt(lElapsed.dataset.start);
            const lh = Math.floor(d / 3600000).toString().padStart(2, '0');
            const lm = Math.floor((d % 3600000) / 60000).toString().padStart(2, '0');
            const ls = Math.floor((d % 60000) / 1000).toString().padStart(2, '0');
            lElapsed.innerText = `${lh}:${lm}:${ls}`;
        }

        // Update costs if active session
        if (activeSessionId && typeof window._updateDashboardNumbers === 'function') {
            window._updateDashboardNumbers();
        }
    }
    
    tick(); // Run immediately
    _timerSyncInterval = setInterval(tick, 1000);
    return _timerSyncInterval;
}
window.startSyncedTimer = startSyncedTimer;

export function stopSyncedTimer() {
    if (_timerSyncInterval) {
        clearInterval(_timerSyncInterval);
        _timerSyncInterval = null;
    }
}
window.stopSyncedTimer = stopSyncedTimer;

// ─── 2. FREE DRINK SYSTEM (First Visit Only) ──────────────────────────────────
// Returns true if this phone number has NEVER visited before (no completed sessions)
// ★ إصلاح جذري: تحقق من الأختام في الملف الشخصي — إذا كان لديه أختام يعني ليست زيارته الأولى
function _isFirstVisit(phone) {
    if (!phone) return false;
    const prof = _profiles[phone];
    if (!prof) return true; // مستخدم جديد تماماً = زيارة أولى
    // ★ الإصلاح: إذا كان لديه أي أختام = ليست زيارته الأولى
    const stamps = prof.stamps || [];
    if (stamps.length > 0) return false;
    // ★ تحقق ثانوي: عدد الجلسات المكتملة في الذاكرة
    const allSessions = window._allSessionsRef || {};
    const completedCount = Object.values(allSessions).filter(s => s.phone === phone && s.status === 'completed').length;
    return completedCount === 0;
}

// ★ التحقق من استخدام المشروب المجاني: localStorage + Firestore profile
function _hasUsedFirstVisitDrink(phone) {
    if (!phone) return true;
    // localStorage (fast check)
    if (localStorage.getItem(`first_visit_drink_${phone}`) === 'true') return true;
    // Firestore profile check (set by admin or system)
    const prof = _profiles[phone];
    if (prof && prof.freeDrinkUsed === true) return true;
    return false;
}

export function renderClientMenuWithFreeDrink(_menu, sessionId) {
    const grid = document.getElementById('dynamicMenuGrid');
    if (!grid) return;
    const items = Object.values(_menu);
    if (items.length === 0) return;
    
    // Check if free drink is enabled in settings
    const freeDrinkEnabled = sysSettings.freeDrinkEnabled || false;
    const freeDrinkMode = sysSettings.freeDrinkMode || 'first_visit'; // 'first_visit' | 'every_session'
    
    // Get current user phone
    const userPhone = myProfile?.phone || null;
    
    let showFreeDrink = false;
    if (freeDrinkEnabled && userPhone) {
        if (freeDrinkMode === 'every_session') {
            // Old behavior: once per session
            showFreeDrink = sessionId ? (localStorage.getItem(`free_drink_${sessionId}`) !== 'true') : false;
        } else {
            // New behavior: first visit only
            showFreeDrink = _isFirstVisit(userPhone) && !_hasUsedFirstVisitDrink(userPhone);
        }
    }
    
    grid.innerHTML = items.map(item => {
        const isDrink = item.type === 'drink';
        const showFree = showFreeDrink && isDrink;
        const isUnavailable = item.unavailable === true;
        
        if (isUnavailable) {
            return `
            <div class="bg-gray-100 p-4 rounded-xl border border-gray-200 shadow-sm text-center opacity-60 cursor-not-allowed relative">
                <div class="absolute -top-2 -right-2 bg-gray-400 text-white text-[9px] px-2 py-0.5 rounded-full font-black shadow-md">غير متوفر</div>
                <i class="fa-solid ${item.icon || 'fa-mug-hot'} text-3xl text-gray-400 mb-3"></i>
                <p class="font-bold text-sm text-gray-500 line-through">${item.name}</p>
                <p class="text-sm font-black text-gray-400 mt-1">${item.price} ج</p>
            </div>`;
        }
        
        return `
        <button onclick="window.orderItemSmart('${item.id}')" 
            class="bg-white p-4 rounded-xl border ${showFree ? 'border-green-300 ring-2 ring-green-200' : 'border-gray-100'} shadow-sm text-center transition transform hover:-translate-y-1 ${showFree ? 'hover:bg-green-50' : 'hover:bg-orange-50'} relative">
            ${showFree ? '<div class="absolute -top-2 -right-2 bg-green-500 text-white text-[9px] px-2 py-0.5 rounded-full font-black shadow-md">مجانًا 🎁 أول زيارة</div>' : ''}
            <i class="fa-solid ${item.icon || 'fa-mug-hot'} text-3xl ${showFree ? 'text-green-600' : 'text-hola-purple'} mb-3"></i>
            <p class="font-bold text-sm text-gray-800">${item.name}</p>
            ${showFree 
                ? `<p class="text-sm font-black text-green-600 mt-1 flex items-center justify-center gap-1"><span class="line-through text-gray-400 text-xs">${item.price} ج</span> <span class="bg-green-100 px-2 py-0.5 rounded-lg">مجانًا!</span></p>`
                : `<p class="text-sm font-black text-hola-orange mt-1">${item.price} ج</p>`
            }
        </button>`;
    }).join('');
}
window.renderClientMenuWithFreeDrink = renderClientMenuWithFreeDrink;

// Smart order: handles free drink logic
window.orderItemSmart = async (menuId) => {
    if (!activeSessionId || !db) return;
    const item = window._menuData ? window._menuData[menuId] : null;
    if (!item) {
        if (window.orderItem) window.orderItem(menuId);
        return;
    }
    
    // Block unavailable items
    if (item.unavailable === true) {
        showMsg('هذا المنتج غير متوفر حالياً', 'error');
        return;
    }
    
    const freeDrinkEnabled = sysSettings.freeDrinkEnabled || false;
    const freeDrinkMode = sysSettings.freeDrinkMode || 'first_visit';
    const isDrink = item.type === 'drink';
    const userPhone = myProfile?.phone || null;
    
    let isFreeDrink = false;
    if (freeDrinkEnabled && isDrink && userPhone) {
        if (freeDrinkMode === 'every_session') {
            const usedFreeKey = `free_drink_${activeSessionId}`;
            isFreeDrink = localStorage.getItem(usedFreeKey) !== 'true';
        } else {
            // First visit only
            isFreeDrink = _isFirstVisit(userPhone) && !_hasUsedFirstVisitDrink(userPhone);
        }
    }
    
    const effectivePrice = isFreeDrink ? 0 : item.price;
    
    if (isFreeDrink) {
        if (!confirm(`هل تريد طلب "${item.name}" مجانًا؟ 🎁\n(هذا المشروب المجاني الخاص بك كعميل لأول زيارة)`)) return;
        // Mark as used — per session (legacy) and per phone (first visit)
        if (freeDrinkMode === 'every_session') {
            localStorage.setItem(`free_drink_${activeSessionId}`, 'true');
        } else {
            localStorage.setItem(`first_visit_drink_${userPhone}`, 'true');
            // ★ حفظ في Firestore أيضاً حتى تعمل من أي جهاز
            try {
                const { updateDoc, doc: fDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
                await updateDoc(fDoc(db, 'artifacts', appId, 'public', 'data', 'profiles', userPhone), { freeDrinkUsed: true });
                if (_profiles[userPhone]) _profiles[userPhone].freeDrinkUsed = true;
            } catch(e) { console.warn('freeDrinkUsed Firestore update failed:', e); }
        }
    }
    
    const currentItems = window._sessionItemsRef || [];
    const newItems = [...currentItems, { 
        name: item.name + (isFreeDrink ? ' 🎁' : ''), 
        price: effectivePrice, 
        type: item.type, 
        time: Date.now(),
        isFree: isFreeDrink 
    }];
    
    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', activeSessionId), { items: newItems });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), { 
            phone: myProfile?.phone, 
            itemName: item.name + (isFreeDrink ? ' 🎁 (مجاني)' : ''), 
            status: 'pending', 
            timestamp: Date.now() 
        });
        window._sessionItemsRef = newItems;
        if (window.renderSessionItemsList) window.renderSessionItemsList();
        if (window._updateDashboardNumbers) window._updateDashboardNumbers();
        showMsg(isFreeDrink ? `تم طلب ${item.name} مجانًا! 🎁` : `تم تسجيل ${item.name} بنجاح!`, "success");
        
        // Re-render menu to update free drink status
        if (window._menuData) renderClientMenuWithFreeDrink(window._menuData, activeSessionId);
    } catch (e) { 
        console.error(e); 
        showMsg("خطأ في تنفيذ الطلب", "error"); 
    }
};

// ─── 3. SUBSCRIPTION CHECK ON LOGIN PHONE INPUT ───────────────────────────────
let _subCheckTimeout = null;

export function checkPhoneForSubscription(phoneValue) {
    clearTimeout(_subCheckTimeout);
    const phone = phoneValue.trim();
    const banner = document.getElementById('loginSubBanner');
    if (!banner) return;
    if (phone.length < 10) { banner.classList.add('hidden'); return; }
    
    _subCheckTimeout = setTimeout(() => {
        const activeSub = Object.values(_subscriptions).find(
            s => s.phone === phone && s.status === 'active' && (s.daysLeft || 0) > 0
        );
        
        if (activeSub) {
            const startDate = activeSub.startDate ? new Date(activeSub.startDate).toLocaleDateString('ar-EG') : '---';
            const endDate = activeSub.endDate ? new Date(activeSub.endDate).toLocaleDateString('ar-EG') : 
                           activeSub.expiresAt ? new Date(activeSub.expiresAt).toLocaleDateString('ar-EG') : '---';
            
            banner.innerHTML = `
                <div class="bg-gradient-to-br from-hola-purple to-hola-dark text-white p-4 rounded-2xl shadow-xl border-2 border-hola-orange animate-fade-in">
                    <div class="flex items-center gap-3 mb-3">
                        <div class="w-10 h-10 bg-hola-orange/20 rounded-xl flex items-center justify-center text-xl"><i class="fa-solid fa-crown text-hola-orange"></i></div>
                        <div>
                            <p class="text-xs text-purple-300 font-bold">اشتراك نشط</p>
                            <p class="font-black text-hola-orange">${activeSub.planName}</p>
                        </div>
                        <span class="mr-auto bg-green-500 text-white text-[10px] px-2 py-1 rounded-full font-bold">✅ نشط</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 bg-white/10 rounded-xl p-3 text-center">
                        <div><p class="text-[9px] text-purple-300">بداية</p><p class="font-bold text-xs text-white">${startDate}</p></div>
                        <div class="border-x border-white/20"><p class="text-[9px] text-purple-300">أيام متبقية</p><p class="font-black text-hola-orange text-xl">${activeSub.daysLeft}</p></div>
                        <div><p class="text-[9px] text-purple-300">نهاية</p><p class="font-bold text-xs text-white">${endDate}</p></div>
                    </div>
                    <div class="flex gap-2 mt-3">
                        <button onclick="window.useSubscriptionAndLogin('${phone}')" 
                            class="flex-1 bg-hola-orange text-white font-black py-2.5 rounded-xl text-sm hover:bg-orange-600 transition shadow-lg">
                            <i class="fa-solid fa-play ml-1"></i> استخدام الاشتراك
                        </button>
                        <button onclick="window.loginWithoutSubscription('${phone}')"
                            class="flex-1 bg-white/10 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-white/20 transition border border-white/30">
                            دخول عادي
                        </button>
                    </div>
                    <p class="text-[9px] text-purple-400 text-center mt-2">الكود: ${activeSub.code || '---'}</p>
                </div>`;
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }, 400);
}
window.checkPhoneForSubscription = checkPhoneForSubscription;

window.useSubscriptionAndLogin = (phone) => {
    const banner = document.getElementById('loginSubBanner');
    if (banner) banner.classList.add('hidden');
    // Set flag so login knows to use subscription
    window._loginUseSubscription = true;
    // Trigger normal login
    if (window.handleLogin) window.handleLogin();
};

window.loginWithoutSubscription = (phone) => {
    const banner = document.getElementById('loginSubBanner');
    if (banner) banner.classList.add('hidden');
    window._loginUseSubscription = false;
    if (window.handleLogin) window.handleLogin();
};

// ─── 4. REVIEWS & RATINGS SYSTEM ─────────────────────────────────────────────
export async function submitReview(sessionId, stars, comment) {
    // Use saved receipt phone/name if myProfile was already cleared
    const phone = myProfile?.phone || window._lastReceiptPhone;
    const name = myProfile?.name || window._lastReceiptName;
    if (!db || !phone) return showMsg("خطأ: لم يتم التعرف على المستخدم", "error");
    if (!stars || stars < 1 || stars > 5) return showMsg("اختر تقييمك أولاً", "error");
    
    const today = new Date().toLocaleDateString('ar-EG');
    const ratingKey = `hola_rated_${today}`;
    if (localStorage.getItem(ratingKey)) {
        showMsg("لقد قيّمت اليوم بالفعل!", "info");
        return;
    }
    
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'reviews'), {
            phone, name, sessionId: sessionId || null,
            stars, comment: comment || '',
            timestamp: Date.now(), date: today
        });
        localStorage.setItem(ratingKey, 'true');
        showMsg("شكراً على تقييمك! 💜", "success");
        playAlertSound('congrats');
        document.getElementById('reviewModal')?.classList.add('hidden');
        const ratingBtns = document.querySelectorAll('.daily-rating-btn');
        ratingBtns.forEach(btn => {
            btn.classList.add('opacity-50', 'pointer-events-none');
            btn.innerHTML = '<i class="fa-solid fa-star text-yellow-400"></i> قيّمت اليوم';
        });
    } catch (e) {
        console.error(e);
        showMsg("خطأ أثناء إرسال التقييم", "error");
    }
}
window.submitReview = submitReview;

export function showReviewModal(sessionId = null) {
    const today = new Date().toLocaleDateString('ar-EG');
    const ratingKey = `hola_rated_${today}`;
    if (localStorage.getItem(ratingKey)) {
        showMsg("لقد قيّمت اليوم بالفعل! شكراً 💜", "info");
        return;
    }
    
    // Set session id in modal
    const modal = document.getElementById('reviewModal');
    if (modal) {
        modal.dataset.sessionId = sessionId || '';
        modal.classList.remove('hidden');
        // Reset stars
        document.querySelectorAll('.star-btn').forEach(btn => {
            btn.classList.remove('text-yellow-400', 'scale-110');
            btn.classList.add('text-gray-300');
        });
        document.getElementById('reviewStarsValue').value = '0';
        const textarea = document.getElementById('reviewComment');
        if (textarea) textarea.value = '';
    }
}
window.showReviewModal = showReviewModal;

window.setReviewStar = (val) => {
    document.getElementById('reviewStarsValue').value = val;
    document.querySelectorAll('.star-btn').forEach((btn, idx) => {
        if (idx < val) {
            btn.classList.add('text-yellow-400', 'scale-110');
            btn.classList.remove('text-gray-300');
        } else {
            btn.classList.remove('text-yellow-400', 'scale-110');
            btn.classList.add('text-gray-300');
        }
    });
};

window.confirmReview = () => {
    const stars = parseInt(document.getElementById('reviewStarsValue')?.value) || 0;
    const comment = document.getElementById('reviewComment')?.value.trim() || '';
    const sessionId = document.getElementById('reviewModal')?.dataset.sessionId;
    submitReview(sessionId, stars, comment);
};

// ─── 5. DELETE CHAT MESSAGES (Admin) ─────────────────────────────────────────
window.deleteAdminChat = async (chatId) => {
    if (!db || !confirm("حذف هذه الرسالة للجميع؟")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'chats', chatId));
        showMsg("تم حذف الرسالة", "success");
    } catch (e) { showMsg("خطأ في الحذف", "error"); }
};

window.clearAllChatsForPhone = async (phone) => {
    if (!db || !confirm(`حذف كل محادثة ${phone}؟`)) return;
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'chats'));
        const toDelete = snap.docs.filter(d => d.data().phone === phone);
        for (const d of toDelete) await deleteDoc(d.ref);
        showMsg("تم مسح المحادثة بالكامل", "success");
    } catch (e) { showMsg("خطأ في الحذف", "error"); }
};

// ─── 6. PHONE BAN (Phone number only — no device ban) ────────────────────────
export async function banUserDevice(phone, reason = "حظر إداري", note = "") {
    if (!db) return;
    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banned_phones', phone), {
            phone, reason, note, timestamp: Date.now()
        });
        showMsg(`🚫 تم حظر رقم ${phone}`, "success");
        logOperation(db, appId, currentShiftAdmin, 'حظر مستخدم', `حظر ${phone} - ${reason}${note ? ' | ' + note : ''}`);
    } catch (e) { showMsg("خطأ في الحظر", "error"); }
}
window.banUserDevice = banUserDevice;

export async function checkDeviceBan() {
    if (!db) return false;
    const deviceId = localStorage.getItem('hola_device_id');
    if (!deviceId) return false;
    try {
        const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'banned_devices', deviceId));
        return snap.exists();
    } catch (e) { return false; }
}
window.checkDeviceBan = checkDeviceBan;

// ─── 7. PAYMENT REF PERSISTENCE FIX ──────────────────────────────────────────
// Fix: payment ref input should retain value after modal state changes
window.fixedSetPayment = async (type) => {
    if (!db) return;
    window.currentPaymentType = type;
    const isPaymentModalOpen = !!(document.getElementById('paymentMethodModal') && !document.getElementById('paymentMethodModal').classList.contains('hidden'));
    const payRefDiv = isPaymentModalOpen ? document.getElementById('payRefDiv') : document.getElementById('adminPayRefDiv');
    
    if (type === 'كاش') {
        const sessionId = window.currentPaymentSessionId;
        if (sessionId) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', sessionId), 
                { paymentMethod: 'كاش', paymentRef: '' });
        }
        document.getElementById('paymentMethodModal')?.classList.add('hidden');
        document.getElementById('adminReceiptModal')?.classList.add('hidden');
        showMsg("تم تسجيل الدفع كاش ✅", "success");
    } else {
        if (payRefDiv) {
            payRefDiv.classList.remove('hidden');
            const input = payRefDiv.querySelector('input');
            if (input) {
                const saved = sessionStorage.getItem('hola_last_pay_ref') || '';
                if (!input.value && saved) input.value = saved;
                input.placeholder = type === 'محفظة إلكترونية' 
                    ? 'أدخل رقم المحفظة المحولة منها...' 
                    : 'أدخل رقم المرجع / Reference Number...';
                input.focus();
                input.select();
            }
        }
        const label = document.getElementById('payRefLabel');
        if (label) {
            label.textContent = type === 'محفظة إلكترونية' 
                ? 'رقم المحفظة المحولة منها:' 
                : 'رقم المرجع (InstaPay Reference):';
        }
    }
};

window.confirmFixedPayment = async () => {
    if (!db) return;
    const isPaymentModalOpen = !!(document.getElementById('paymentMethodModal') && !document.getElementById('paymentMethodModal').classList.contains('hidden'));
    const input = isPaymentModalOpen ? document.getElementById('payRefInput') : document.getElementById('adminPayRefInput');
    const ref = input?.value.trim();
    if (!ref) return showMsg("أدخل رقم المرجع / المحفظة أولاً", "error");
    
    const sessionId = window.currentPaymentSessionId;
    if (!sessionId) return;
    
    // ── Save ref to localStorage for next time ──
    sessionStorage.setItem('hola_last_pay_ref', ref);  // ★ use sessionStorage — cleared when tab closes
    
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', sessionId), { 
        paymentMethod: window.currentPaymentType || 'محفظة إلكترونية', 
        paymentRef: ref 
    });
    
    document.getElementById('paymentMethodModal')?.classList.add('hidden');
    document.getElementById('adminReceiptModal')?.classList.add('hidden');
    showMsg(`تم تسجيل الدفع بـ ${window.currentPaymentType} ✅`, "success");
    logOperation(db, appId, currentShiftAdmin, 'تسجيل دفع', `${window.currentPaymentType} - مرجع: ${ref}`);
};

// ── Delete a single review (admin) ──
window.deleteReview = async (reviewId) => {
    if (!db || !confirm('حذف هذا التقييم نهائياً؟')) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reviews', reviewId));
        showMsg('تم حذف التقييم', 'success');
        if (window.loadAdminReviews) window.loadAdminReviews();
    } catch (e) { showMsg('خطأ في الحذف', 'error'); }
};

// ─── 8. ADMIN REVIEWS DASHBOARD ──────────────────────────────────────────────
export async function loadAdminReviews() {
    if (!db) return;
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'reviews'));
        const reviews = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => b.timestamp - a.timestamp);
        
        // Render reviews list
        const list = document.getElementById('adminReviewsList');
        if (list) {
            if (reviews.length === 0) {
                list.innerHTML = '<p class="text-center text-gray-400 py-8">لا توجد تقييمات بعد</p>';
            } else {
                list.innerHTML = reviews.slice(0, 50).map(r => {
                    const stars = '★'.repeat(r.stars) + '☆'.repeat(5 - r.stars);
                    const starColor = r.stars >= 4 ? 'text-yellow-400' : r.stars >= 3 ? 'text-orange-400' : 'text-red-400';
                    const date = new Date(r.timestamp).toLocaleString('ar-EG', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
                    return `<div class="bg-gray-50 border rounded-xl p-4 flex gap-3 items-start hover:bg-gray-100 transition">
                        <div class="w-10 h-10 bg-hola-purple text-white rounded-full flex items-center justify-center font-black flex-shrink-0">${(r.name||'؟').charAt(0)}</div>
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1 flex-wrap">
                                <span class="font-bold text-sm text-hola-purple">${r.name || r.phone}</span>
                                <span class="${starColor} font-black tracking-widest">${stars}</span>
                                <span class="mr-auto text-[10px] text-gray-400">${date}</span>
                                <button onclick="window.deleteReview('${r.id}')" class="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 w-7 h-7 rounded-lg flex items-center justify-center transition flex-shrink-0" title="حذف التقييم"><i class="fa-solid fa-trash text-xs"></i></button>
                            </div>
                            ${r.comment ? `<p class="text-sm text-gray-600 font-bold">"${_esc(r.comment)}"</p>` : '<p class="text-xs text-gray-400 italic">بدون تعليق</p>'}
                        </div>
                    </div>`;
                }).join('');
            }
        }
        
        // Stats
        if (reviews.length > 0) {
            const avgStars = (reviews.reduce((s, r) => s + r.stars, 0) / reviews.length).toFixed(1);
            safeSet('adminAvgRating', 'innerText', avgStars);
            safeSet('adminTotalReviews', 'innerText', reviews.length);
            
            // Today's reviews
            const today = new Date().toLocaleDateString('ar-EG');
            const todayReviews = reviews.filter(r => r.date === today);
            const todayAvg = todayReviews.length > 0 
                ? (todayReviews.reduce((s, r) => s + r.stars, 0) / todayReviews.length).toFixed(1) : '-';
            safeSet('adminTodayAvgRating', 'innerText', todayAvg);
            
            // Build chart data for last 30 days
            buildRatingsChart(reviews);
            
            // AI suggestions based on reviews
            await generateAISuggestions(reviews);
        }
    } catch (e) { console.error('loadAdminReviews error:', e); }
}
window.loadAdminReviews = loadAdminReviews;

function buildRatingsChart(reviews) {
    const ctx = document.getElementById('ratingsChart');
    if (!ctx || typeof Chart === 'undefined') return;
    
    // Group by date (last 30 days)
    const last30 = Array.from({length: 30}, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (29 - i));
        return d.toLocaleDateString('ar-EG');
    });
    
    const data = last30.map(date => {
        const dayReviews = reviews.filter(r => r.date === date);
        return dayReviews.length > 0 
            ? (dayReviews.reduce((s, r) => s + r.stars, 0) / dayReviews.length).toFixed(1)
            : null;
    });
    
    // Destroy existing chart
    if (window._ratingsChartInstance) window._ratingsChartInstance.destroy();
    
    window._ratingsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last30.map(d => d.split('/').slice(0,2).join('/')),
            datasets: [{
                label: 'متوسط التقييم اليومي',
                data,
                borderColor: '#301043',
                backgroundColor: 'rgba(48,16,67,0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#f17200',
                pointRadius: 4,
                tension: 0.4,
                fill: true,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { min: 0, max: 5, ticks: { stepSize: 1 } }
            }
        }
    });
}

async function generateAISuggestions(reviews) {
    const container = document.getElementById('aiSuggestionsBox');
    if (!container) return;
    
    const lowReviews = reviews.filter(r => r.stars <= 3 && r.comment);
    if (lowReviews.length < 2) {
        container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">جمع المزيد من التقييمات لتفعيل الاقتراحات الذكية</p>';
        return;
    }
    
    container.innerHTML = '<div class="flex items-center gap-2 text-hola-purple"><i class="fa-solid fa-spinner fa-spin"></i> <span class="text-sm font-bold">جاري تحليل التقييمات بالذكاء الاصطناعي...</span></div>';
    
    const complaints = lowReviews.slice(0, 10).map(r => `- ${r.stars} نجوم: "${r.comment}"`).join('\n');
    
    // ✅ SECURITY: API key يُحقن من Firebase Hosting عبر __anthropic_key
    // أو يُستدعى مباشرة من Anthropic API إذا كان المفتاح متاحاً.
    // إذا لم يكن المفتاح موجوداً، تُوقف الميزة بشكل آمن.
    const _apiKey = (typeof window.__anthropic_key !== 'undefined') ? window.__anthropic_key : '';
    if (!_apiKey) {
        container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">ميزة الذكاء الاصطناعي غير مفعّلة حالياً.</p>';
        return;
    }
    const _headers = {
        "Content-Type": "application/json",
        "x-api-key": _apiKey,
        "anthropic-version": "2023-06-01"
    };

    try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: _headers,
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 800,
                system: "أنت مستشار مساحة عمل (Workspace) في مصر. حلل الشكاوى وأعطِ 3-5 نصائح عملية ومختصرة لتحسين رضا العملاء. الرد باللغة العربية فقط، بشكل نقاط واضحة.",
                messages: [{
                    role: "user",
                    content: `تقييمات العملاء السلبية الأخيرة لـ Hola Workspace:\n${complaints}\n\nأعطِ نصائح تحسين عملية ومحددة.`
                }]
            })
        });
        
        const data = await response.json();
        const text = data.content?.[0]?.text || 'لم يتمكن النظام من التحليل';
        
        container.innerHTML = `
            <div class="flex items-center gap-2 mb-3">
                <div class="w-8 h-8 bg-hola-purple rounded-full flex items-center justify-center text-white text-sm"><i class="fa-solid fa-robot"></i></div>
                <p class="font-black text-hola-purple text-sm">اقتراحات الذكاء الاصطناعي</p>
                <span class="mr-auto text-[10px] text-gray-400">بناءً على ${lowReviews.length} تقييم</span>
            </div>
            <div class="text-sm text-gray-700 leading-relaxed font-bold bg-purple-50 p-3 rounded-xl border border-purple-100 whitespace-pre-line">${text}</div>`;
    } catch (e) {
        container.innerHTML = '<p class="text-red-500 text-sm">تعذر الاتصال بالذكاء الاصطناعي</p>';
    }
}

// ─── 9. FREE DRINK SETTINGS SAVE ─────────────────────────────────────────────
window.saveFreeDrinkSetting = async (enabled) => {
    if (!db) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), {
        freeDrinkEnabled: enabled
    });
    showMsg(enabled ? "✅ تم تفعيل المشروب المجاني" : "❌ تم إلغاء المشروب المجاني", "success");
    logOperation(db, appId, currentShiftAdmin, 'إعداد مشروب مجاني', enabled ? 'تفعيل' : 'إيقاف');
};
