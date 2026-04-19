// =====================================================
// js/sessions.js — Firebase Listeners & Global State
// v4: Auto-sync on login, single-device enforcement, smart events
// =====================================================
/* global scrollTo, print, open, confirm, alert, prompt, setTimeout, setInterval, clearTimeout, clearInterval, localStorage, sessionStorage, navigator, location, history, performance, fetch, URL, URLSearchParams */
/* eslint-disable no-undef */

import { collection, addDoc, updateDoc, doc, setDoc, deleteDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { DEFAULT_SETTINGS } from "../config/constants.js";
import {
    renderClientMenu, renderAdminMenu, renderAdminDiscounts, renderAdminOperations,
    renderAdminUsers, renderAdminBanned, renderAdminGroupedOrders, renderAdminSessions,
    renderAdminPreBookings, renderAdminEventAttendees, renderAdminChatUsersList,
    renderAdminChatMessages, renderClientChatMessages, renderClientHistory,
    renderClientNotifications, renderClientLoyalty, showClientNotification,
    updateCapacityUI, updateClientHeaderUI, renderShiftManagers, safeSet,
    renderPublicEvents, renderClientSubscriptions, renderAdminSubscriptions, renderAdminPlans,
    renderAdminFeedback
} from "./ui.js";
import { playAlertSound } from "./app.js";

// ─── Shared State ─────────────────────────────────────────────────────────────
export let sysSettings = { ...DEFAULT_SETTINGS };
export let _profiles = {};
export let _sessions = {};
export let _menu = {};
export let _discounts = {};
export let _notifications = {};
export let _operations = {};
export let _prebookings = {};
export let _eventAttendees = {};
export let _chats = {};
export let _subscriptions = {};
export let _plans = {};
export let _feedback = {};
export let _smartEvents = {};

export let myProfile = null;
export let activeSessionId = null;
export let sessionStartTime = null;
export let sessionItems = [];
export let timerInterval = null;
export let appliedDiscountVal = 0;
export let currentManageUserPhone = null;
export let currentShiftAdmin = "مدير النظام";
export let currentChatPhone = null;

let seenOrders = new Set();
let isInitialOrdersLoad = true;
let seenNotificationPopups = new Set();
let _listenersBootstrapped = false;
let _listenersUid = null;
let _adminTokenUnsub = null;
let _adminListenersUnsubs = [];
// ★ إعادة ضبط عند تسجيل الخروج حتى تظهر الإشعارات في الجلسة الجديدة
export function resetSeenNotifications() { seenNotificationPopups = new Set(); }
window.resetSeenNotifications = function() { seenNotificationPopups = new Set(); };

function _clearAdminOnlyState() {
    _operations = {};
    _prebookings = {};
    _feedback = {};
    renderAdminOperations(_operations);
    renderAdminPreBookings(_prebookings);
    renderAdminFeedback(_feedback);
}

function _stopAdminListeners() {
    _adminListenersUnsubs.forEach(unsub => {
        try { unsub(); } catch (e) {}
    });
    _adminListenersUnsubs = [];
    _clearAdminOnlyState();
}

function _watchAdminCollection(ref, onNext, label) {
    return onSnapshot(
        ref,
        onNext,
        (err) => {
            console.warn(`[Firestore] ${label} listener stopped:`, err?.code || err);
        }
    );
}

function _startAdminListeners(db, appId) {
    if (_adminListenersUnsubs.length > 0) return;

    _adminListenersUnsubs.push(
        _watchAdminCollection(
            collection(db, 'artifacts', appId, 'public', 'data', 'operations'),
            snap => {
                _operations = {};
                snap.forEach(d => _operations[d.id] = { id: d.id, ...d.data() });
                renderAdminOperations(_operations);
            },
            'operations'
        )
    );

    _adminListenersUnsubs.push(
        _watchAdminCollection(
            collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'),
            snap => {
                _prebookings = {};
                snap.forEach(d => _prebookings[d.id] = { id: d.id, ...d.data() });
                renderAdminPreBookings(_prebookings);
            },
            'prebookings'
        )
    );

    _adminListenersUnsubs.push(
        _watchAdminCollection(
            collection(db, 'artifacts', appId, 'public', 'data', 'feedback'),
            snap => {
                _feedback = {};
                snap.forEach(d => _feedback[d.id] = { id: d.id, ...d.data() });
                renderAdminFeedback(_feedback);
            },
            'feedback'
        )
    );
}

function _bindAdminTokenWatcher(db, appId, uid) {
    if (!uid) return;

    if (_adminTokenUnsub) {
        try { _adminTokenUnsub(); } catch (e) {}
        _adminTokenUnsub = null;
    }

    _adminTokenUnsub = onSnapshot(
        doc(db, 'artifacts', appId, 'admin_tokens', uid),
        (snap) => {
            const token = snap.exists() ? snap.data() : null;
            const hasActiveAdminToken = !!(token && token.expiresAt > Date.now());

            if (hasActiveAdminToken) {
                _startAdminListeners(db, appId);
            } else {
                _stopAdminListeners();
            }
        },
        (err) => {
            console.warn('[Firestore] admin token listener stopped:', err?.code || err);
            _stopAdminListeners();
        }
    );
}

// ─── Device Session Management (Single Device Login) ─────────────────────────
let _deviceSessionUnsub = null;
let _myDeviceSessionId = null;

function _getDeviceId() {
    let id = localStorage.getItem('hola_device_id');
    if (!id) {
        id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        localStorage.setItem('hola_device_id', id);
    }
    return id;
}

export async function registerUserDeviceSession(db, appId, phone) {
    if (!db || !phone) return;
    const deviceId = _getDeviceId();
    _myDeviceSessionId = deviceId;
    const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_device_sessions', phone);
    try {
        await setDoc(sessionRef, {
            deviceId,
            phone,
            loginAt: Date.now(),
            lastSeen: Date.now()
        });
        // Ping every 90 seconds to keep session alive
        const pingInterval = setInterval(async () => {
            if (!myProfile) { clearInterval(pingInterval); return; }
            try {
                await updateDoc(sessionRef, { lastSeen: Date.now() });
            } catch (e) {}
        }, 90000);
        // Watch for other device logins
        if (_deviceSessionUnsub) _deviceSessionUnsub();
        _deviceSessionUnsub = onSnapshot(sessionRef, snap => {
            if (!snap.exists()) return;
            const data = snap.data();
            // If a different device logged in with same account — force logout
            if (data.deviceId && data.deviceId !== deviceId && myProfile) {
                _forceLogoutDueToNewDevice();
            }
        });
    } catch (e) {}
}

function _forceLogoutDueToNewDevice() {
    if (!myProfile) return;
    // Show modal
    const overlay = document.createElement('div');
    overlay.id = 'forceLogoutOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(30,0,50,0.92);display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
        <div style="background:white;border-radius:1.5rem;padding:2rem;max-width:340px;width:100%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.5);">
            <div style="width:64px;height:64px;background:#fef3c7;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.75rem;margin:0 auto 1rem;">⚠️</div>
            <h3 style="font-size:1.2rem;font-weight:900;color:#301043;margin-bottom:0.5rem;">تم تسجيل الدخول من جهاز آخر</h3>
            <p style="font-size:0.8rem;color:#6b7280;font-weight:bold;line-height:1.6;margin-bottom:1.5rem;">تم فتح حسابك على جهاز آخر. لأمان حسابك، تم تسجيل خروجك تلقائياً من هذا الجهاز.</p>
            <button onclick="window.clientLogout();document.getElementById('forceLogoutOverlay')?.remove();" 
                style="width:100%;background:#301043;color:white;font-weight:900;padding:0.875rem;border-radius:0.875rem;border:none;cursor:pointer;font-size:0.9rem;">
                حسناً، أفهم
            </button>
        </div>`;
    document.body.appendChild(overlay);
    playAlertSound('high');
    // Auto-logout after 5s if no action
    setTimeout(() => {
        if (document.getElementById('forceLogoutOverlay')) {
            window.clientLogout && window.clientLogout();
            document.getElementById('forceLogoutOverlay')?.remove();
        }
    }, 5000);
}

export async function unregisterUserDeviceSession(db, appId, phone) {
    if (!db || !phone) return;
    const deviceId = _getDeviceId();
    try {
        const sessionRef = doc(db, 'artifacts', appId, 'public', 'data', 'user_device_sessions', phone);
        const snap = await getDoc(sessionRef);
        // Only delete if it's our device
        if (snap.exists() && snap.data().deviceId === deviceId) {
            await deleteDoc(sessionRef);
        }
    } catch (e) {}
    if (_deviceSessionUnsub) { _deviceSessionUnsub(); _deviceSessionUnsub = null; }
}

// ─── Setters ──────────────────────────────────────────────────────────────────
export function setMyProfile(v) { myProfile = v; window.myProfile = v; }
export function setActiveSessionId(v) { activeSessionId = v; }
export function setSessionStartTime(v) { sessionStartTime = v; }
export function setSessionItems(v) { sessionItems = v; }
export function setTimerInterval(v) { timerInterval = v; }
export function setAppliedDiscountVal(v) { appliedDiscountVal = v; }
export function setCurrentManageUserPhone(v) { currentManageUserPhone = v; window._currentManageUserPhone = v; }
export function setCurrentShiftAdmin(v) { currentShiftAdmin = v; window._currentShiftAdmin = v; }
export function setCurrentChatPhone(v) { currentChatPhone = v; }

// ─── Full Client Sync (called after login or on manual sync) ─────────────────
export function syncAllClientData() {
    if (!myProfile) return;
    renderClientHistory(myProfile, _sessions);
    renderClientLoyalty(myProfile, _profiles, _discounts, sysSettings);
    renderClientNotifications(myProfile, _notifications);
    renderClientSubscriptions(myProfile, _subscriptions);
    renderClientChatMessages(myProfile, _chats);
    updateClientHeaderUI(myProfile, _profiles, sysSettings);
    if (window.populateRemoteProfile && myProfile.isRemote) window.populateRemoteProfile(myProfile.phone);
}
export function syncAllClientTabs() { syncAllClientData(); }
window._syncAllClientTabs = () => syncAllClientData();

// ─── Render Remote Users in Admin Panel ──────────────────────────────────────
function _renderAdminRemoteUsers() {
    const container = document.getElementById('adminRemoteUsersList');
    if (!container) return;
    const users = Object.values(window._remoteUsers || {});
    if (users.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 text-center py-3">لا يوجد مستخدمون بعيدون حالياً</p>';
        return;
    }
    container.innerHTML = users.map(u => `
        <div class="flex items-center justify-between bg-gray-50 rounded-xl p-3 border">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-gray-700 text-white rounded-full flex items-center justify-center font-black text-sm">${(u.name || '?').charAt(0).toUpperCase()}</div>
                <div>
                    <p class="font-bold text-sm text-gray-800">${u.name || 'غير معروف'}</p>
                    <p class="text-xs font-mono text-gray-500">${u.phone || ''}</p>
                </div>
            </div>
            <div class="text-left">
                <span class="bg-gray-200 text-gray-700 text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">🌐 بعيد</span>
                <p class="text-[9px] text-gray-400 mt-0.5">${new Date(u.enteredAt || Date.now()).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
        </div>`).join('');
}

// ─── Render Active Admin Sessions ─────────────────────────────────────────────
function _renderAdminSessions_multi() {
    const container = document.getElementById('activeAdminSessionsList');
    if (!container) return;
    const sessions = Object.values(window._adminSessions || {});
    if (sessions.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">لا يوجد مسؤولون نشطون</p>';
        return;
    }
    container.innerHTML = sessions.map(s => `
        <div class="flex items-center gap-2 bg-purple-50 rounded-lg p-2 border border-purple-100">
            <div class="w-7 h-7 bg-hola-purple text-white rounded-full flex items-center justify-center font-black text-xs">${(s.adminName || 'م').charAt(0)}</div>
            <div>
                <p class="font-bold text-xs text-hola-purple">${s.adminName || 'مسؤول'}</p>
                <p class="text-[9px] text-gray-400">دخل ${new Date(s.loginAt || Date.now()).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <span class="mr-auto bg-green-100 text-green-700 text-[8px] px-1.5 py-0.5 rounded-full font-bold">● نشط</span>
        </div>`).join('');
}

// ─── Setup all Firestore Listeners ───────────────────────────────────────────
export function setupListeners(db, appId, uid) {
    if (_listenersBootstrapped && _listenersUid === uid) {
        return;
    }

    if (_adminTokenUnsub) {
        try { _adminTokenUnsub(); } catch (e) {}
        _adminTokenUnsub = null;
    }
    _stopAdminListeners();
    _listenersBootstrapped = true;
    _listenersUid = uid || null;

    // Settings
    onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), snap => {
        console.log('[Settings] 📡 Snapshot received | exists:', snap.exists(), '| time:', new Date().toLocaleTimeString('ar-EG'));
        if (snap.exists()) {
            sysSettings = { ...sysSettings, ...snap.data() };
            console.log('[Settings] ✅ Loaded from Firebase OK | adminPin present:', !!sysSettings.adminPin);
            if (!sysSettings.shiftManagers) sysSettings.shiftManagers = ["مدير النظام"];
            if (!sysSettings.workspaceLat) { sysSettings.workspaceLat = 26.559074; sysSettings.workspaceLng = 31.695689; sysSettings.workspaceRadius = 500; }
            if (sysSettings.voteLoud === undefined) sysSettings.voteLoud = 0;
            if (sysSettings.voteBad === undefined) sysSettings.voteBad = 0;
            if (!sysSettings.musicVoteRound) sysSettings.musicVoteRound = 1;

            safeSet('pubT1', 'innerText', sysSettings.pricingTier1); safeSet('pubT2', 'innerText', sysSettings.pricingTier2); safeSet('pubT3', 'innerText', sysSettings.pricingTier3);
            // تحديث موديل "عن المكان" بالأسعار الحالية
            safeSet('aboutT1', 'innerText', sysSettings.pricingTier1 || '—');
            safeSet('aboutT2', 'innerText', sysSettings.pricingTier2 || '—');
            const aboutT3El = document.getElementById('aboutT3');
            if (aboutT3El) {
                if (sysSettings.after3rdType === 'fixed' && sysSettings.after3rdPrice > 0) {
                    aboutT3El.textContent = sysSettings.after3rdPrice;
                } else {
                    aboutT3El.textContent = '🎁';
                }
            }
            // تخزين sysSettings في window لاستخدامها في showAboutModal
            window.sysSettings = sysSettings;
            safeSet('hintT1', 'innerText', sysSettings.pricingTier1); safeSet('hintT2', 'innerText', sysSettings.pricingTier2); safeSet('hintT3', 'innerText', sysSettings.pricingTier3);
            safeSet('publicDescription', 'innerText', sysSettings.description);
            safeSet('publicLoyaltyText', 'innerText', sysSettings.loyaltyText);
            safeSet('clientStampsGoalText', 'innerText', sysSettings.loyaltyText); safeSet('clientHeaderStampsReq', 'innerText', sysSettings.stampsRequired);
            safeSet('vfPayNum', 'innerText', sysSettings.vfNumber || ''); safeSet('vfPayName', 'innerText', sysSettings.vfName || '');

            // ★ FIX: Only update settings INPUT fields when admin is NOT actively editing them.
            // This prevents the onSnapshot listener from overwriting in-progress edits.
            const _settingsTabOpen = !document.getElementById('admin-settings')?.classList.contains('hidden');
            const _userEditingSettings = document.activeElement && document.getElementById('admin-settings')?.contains(document.activeElement);
            if (!_settingsTabOpen || !_userEditingSettings) {
                safeSet('setT1', 'value', sysSettings.pricingTier1); safeSet('setT2', 'value', sysSettings.pricingTier2); safeSet('setT3', 'value', sysSettings.pricingTier3);
                safeSet('setMaxCap', 'value', sysSettings.maxCapacity); safeSet('setStampsReq', 'value', sysSettings.stampsRequired);
                safeSet('settingAdminPin', 'value', sysSettings.adminPin);
                safeSet('settingDescription', 'value', sysSettings.description);
                safeSet('settingLoyaltyText', 'value', sysSettings.loyaltyText);
                safeSet('setVfNumber', 'value', sysSettings.vfNumber || ''); safeSet('setVfName', 'value', sysSettings.vfName || ''); safeSet('setInstapayLink', 'value', sysSettings.instapayLink || '');
                safeSet('setFbPageLink', 'value', sysSettings.fbPageLink || ''); safeSet('setWhatsappNum', 'value', sysSettings.whatsappNum || '');
                safeSet('setIgPageLink', 'value', sysSettings.igPageLink || '');
                safeSet('setLat', 'value', sysSettings.workspaceLat); safeSet('setLng', 'value', sysSettings.workspaceLng); safeSet('setRadius', 'value', sysSettings.workspaceRadius);
                safeSet('setLogoUrl', 'value', sysSettings.logoUrl || '');
                safeSet('setPromoImg', 'value', sysSettings.promoImg || ''); safeSet('setPromoLink', 'value', sysSettings.promoLink || '');
                safeSet('setPromoText', 'value', sysSettings.promoText || ''); safeSet('setPromoEmbed', 'value', sysSettings.promoEmbed || '');
                safeSet('setAfter3rdType', 'value', sysSettings.after3rdType || 'free');
                safeSet('setAfter3rdPrice', 'value', sysSettings.after3rdPrice || 0);
                safeSet('setAfter3rdNote', 'value', sysSettings.after3rdNote || '');
                safeSet('setGraceMinutes', 'value', sysSettings.graceMinutes ?? 0);
                if (document.getElementById('setRoomsActive')) document.getElementById('setRoomsActive').checked = !!sysSettings.roomsActive;
                if (document.getElementById('setFreeDrink')) document.getElementById('setFreeDrink').checked = !!sysSettings.freeDrinkEnabled;
                if (document.getElementById('setFreeDrinkMode')) document.getElementById('setFreeDrinkMode').value = sysSettings.freeDrinkMode || 'first_visit';
                // WiFi fields
                safeSet('setWifiSSID', 'value', sysSettings.wifiSSID || '');
                safeSet('setWifiPassword', 'value', sysSettings.wifiPassword || '');
                if (document.getElementById('setWifiSecurity')) document.getElementById('setWifiSecurity').value = sysSettings.wifiSecurity || 'WPA';
                if (document.getElementById('setWifiEnabled')) {
                    document.getElementById('setWifiEnabled').checked = !!sysSettings.wifiEnabled;
                    if (window._onWifiToggle) window._onWifiToggle(!!sysSettings.wifiEnabled);
                }
                if (window._previewWifiQR) window._previewWifiQR();
                // رابط "عن المكان"
                const aboutUrlEl = document.getElementById('setAboutPageUrl');
                if (aboutUrlEl) aboutUrlEl.value = sysSettings.aboutPageUrl || 'bio.html';
                // حذف Bio fields القديمة — لم تعد مستخدمة
                if (window._renderBioLinksManager) window._renderBioLinksManager();
                if (window._renderBioNavBtnsEditor) window._renderBioNavBtnsEditor();
            }

            const elDiv = document.getElementById('setAfter3rdPriceDiv');
            if (elDiv) elDiv.style.display = (sysSettings.after3rdType === 'fixed') ? 'block' : 'none';
            // Build after-3rd public text
            let after3rdLine = sysSettings.after3rdType === 'fixed'
                ? `بعد الساعة الثالثة: يُضاف ${sysSettings.after3rdPrice || 0} ج لكل ساعة إضافية.`
                : 'بعد الساعة الثالثة: بقية اليوم مجاناً! 🎉';
            safeSet('pubAfter3rdText', 'innerText', after3rdLine);
            // Show custom note if set
            const noteEl = document.getElementById('pubAfter3rdNote');
            if (noteEl) {
                if (sysSettings.after3rdNote) { noteEl.innerText = sysSettings.after3rdNote; noteEl.classList.remove('hidden'); }
                else noteEl.classList.add('hidden');
            }

            const promoCard = document.getElementById('fbPromoCard');
            if (sysSettings.promoEmbed) {
                if (promoCard) { promoCard.classList.remove('hidden'); promoCard.innerHTML = `<div class="embed-content w-full overflow-hidden rounded-xl">${sysSettings.promoEmbed}</div>`; }
            } else if (sysSettings.promoImg) {
                safeSet('pubPromoImg', 'src', sysSettings.promoImg);
                if (sysSettings.promoText) { safeSet('pubPromoText', 'innerText', sysSettings.promoText); document.getElementById('pubPromoText')?.classList.remove('hidden'); }
                else document.getElementById('pubPromoText')?.classList.add('hidden');
                if (sysSettings.promoLink) {
                    const link = document.getElementById('pubPromoLink');
                    if (link) {
                        link.href = sysSettings.promoLink;
                        if (window.detectSocialPlatform) {
                            const p = window.detectSocialPlatform(sysSettings.promoLink);
                            link.className = `block w-full ${p.color} text-white text-center py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2`;
                            link.innerHTML = `<i class="fa-solid ${window._esc ? _esc(p.icon) : p.icon}"></i> ${window._esc ? _esc(p.label) : p.label}`;
                        }
                        link.classList.remove('hidden');
                    }
                } else document.getElementById('pubPromoLink')?.classList.add('hidden');
                if (promoCard) promoCard.classList.remove('hidden');
            } else { if (promoCard) promoCard.classList.add('hidden'); }

            renderPublicEvents(sysSettings, myProfile, activeSessionId, _smartEvents);
            if (window._renderLoginEvents) window._renderLoginEvents();
            window.sysSettings = sysSettings;
            if (window._updateClosedScreenData) window._updateClosedScreenData();

            const rCheck = document.getElementById('setRoomsActive'); if (rCheck) rCheck.checked = sysSettings.roomsActive || false;
            // Free drink toggle
            const fdCheck = document.getElementById('setFreeDrink');
            if (fdCheck) fdCheck.checked = sysSettings.freeDrinkEnabled || false;
            // Free drink mode selector
            const fdMode = document.getElementById('setFreeDrinkMode');
            if (fdMode) fdMode.value = sysSettings.freeDrinkMode || 'first_visit';
            // Re-render menu with free drink status if user is logged in
            if (window._menuData && window.renderClientMenuWithFreeDrink) {
                window.renderClientMenuWithFreeDrink(window._menuData, activeSessionId);
            }
            const roomsAvail = document.getElementById('roomsAvailableDiv'), roomsUnavail = document.getElementById('roomsUnavailableDiv');
            if (roomsAvail && roomsUnavail) {
                if (sysSettings.roomsActive) { roomsAvail.classList.remove('hidden'); roomsUnavail.classList.add('hidden'); }
                else { roomsAvail.classList.add('hidden'); roomsUnavail.classList.remove('hidden'); }
            }
            // ★ علامة خضراء نشطة تنبض للغرف
            const roomBadge = document.getElementById('roomActiveBadge');
            if (roomBadge) roomBadge.classList.toggle('hidden', !sysSettings.roomsActive);

            safeSet('voteCountLoud', 'innerText', sysSettings.voteLoud); safeSet('voteCountBad', 'innerText', sysSettings.voteBad);
            safeSet('adminVoteLoud', 'innerText', sysSettings.voteLoud); safeSet('adminVoteBad', 'innerText', sysSettings.voteBad);

            updateCapacityUI(_sessions, sysSettings);
            if (activeSessionId && window._updateDashboardNumbers) window._updateDashboardNumbers();
            if (myProfile) renderClientLoyalty(myProfile, _profiles, _discounts, sysSettings);
            renderShiftManagers(sysSettings);
            // Check place closed state
            if (window._checkPlaceClosedState) window._checkPlaceClosedState();
        } else {
            // ✅ FIX: الوثيقة غير موجودة — نكتبها بـ merge:true فقط
            // هذا يمنع overwrite أي بيانات موجودة في حالة network glitch أو auth delay
            console.warn('[Settings] ⚠️ settings/system غير موجود في Firebase — سيتم إنشاؤه بالقيم الافتراضية مع merge.');
            if (db) {
                setDoc(
                    doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'),
                    { ...DEFAULT_SETTINGS, _createdAt: Date.now() },
                    { merge: true }
                ).then(() => {
                    console.log('[Settings] ✅ تم إنشاء الإعدادات الافتراضية بأمان (merge).');
                }).catch(err => {
                    console.error('[Settings] ❌ فشل كتابة الإعدادات الافتراضية:', err);
                });
            }
        }
    });

    // Profiles — auto-sync all client tabs on change
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'profiles'), snap => {
        _profiles = {}; snap.forEach(d => _profiles[d.id] = d.data());
        renderAdminUsers(_profiles);
        if (myProfile && _profiles[myProfile.phone]) {
            myProfile = { ..._profiles[myProfile.phone], isRemote: myProfile.isRemote };
            syncAllClientData();
        }
        renderAdminChatUsersList(_chats, _profiles, currentChatPhone, _sessions);
    });

    // Sessions — auto-recover session + force-show receipt
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'sessions'), snap => {
        _sessions = {}; snap.forEach(d => _sessions[d.id] = { id: d.id, ...d.data() });
        window._allSessionsRef = _sessions; // expose for free drink first-visit check
        window._sessions = _sessions;       // ★ expose for _checkActiveSessionForPhone
        renderAdminSessions(_sessions, _profiles); updateCapacityUI(_sessions, sysSettings);

        // ── Auto-resume: if user closed tab/browser while session was active ──
        if (!myProfile) {
            const savedPhone = localStorage.getItem('hola_saved_phone');
            if (savedPhone && _profiles[savedPhone]) {
                const activeSes = Object.values(_sessions).find(s => s.phone === savedPhone && s.status === 'active');
                if (activeSes) {
                    // Silently restore — no GPS re-check needed
                    myProfile = _profiles[savedPhone];
                    window.myProfile = myProfile; // expose to window
                    activeSessionId = activeSes.id;
                    sessionStartTime = activeSes.startTime;
                    sessionItems = activeSes.items || [];
                    document.getElementById('navPublic')?.classList.add('hidden');
                    document.getElementById('navClient')?.classList.remove('hidden');
                    if (window.switchView) window.switchView('client');
                    if (window.switchClientTab) window.switchClientTab('session');
                    if (window._startTimer) window._startTimer();
                    if (window.renderSessionItemsList) window.renderSessionItemsList();
                    if (window.updateClientHeaderUI) updateClientHeaderUI(myProfile, _profiles, sysSettings);
                    syncAllClientData();
                    if (window.showMsg) window.showMsg(`مرحباً ${myProfile.name}! استُعيدت جلستك تلقائياً ✅`, 'success');
                }
            }
        }

        if (myProfile && !myProfile.isRemote) {
            renderClientHistory(myProfile, _sessions);
            if (!activeSessionId) {
                const existing = Object.values(_sessions).find(s => s.phone === myProfile.phone && s.status === 'active');
                if (existing) {
                    activeSessionId = existing.id; sessionStartTime = existing.startTime; sessionItems = existing.items || [];
                    if (window.switchView) window.switchView('client');
                    if (window.switchClientTab) window.switchClientTab('session');
                    if (window._startTimer) window._startTimer();
                    if (window.renderSessionItemsList) window.renderSessionItemsList();
                    renderPublicEvents(sysSettings, myProfile, activeSessionId, _smartEvents);
                }
            } else {
                const cur = _sessions[activeSessionId];
                if (cur && cur.status === 'completed' && window.forceShowClientReceipt) window.forceShowClientReceipt(cur);
                else if (cur && cur.items) {
                    sessionItems = cur.items;
                    window._sessionItemsRef = cur.items;
                    if (window.renderSessionItemsList) window.renderSessionItemsList();
                    // Re-render menu to reflect free drink usage
                    if (window._menuData && window.renderClientMenuWithFreeDrink) {
                        window.renderClientMenuWithFreeDrink(window._menuData, activeSessionId);
                    }
                }
            }
        }
    });

    // Menu
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'menu'), snap => {
        _menu = {}; snap.forEach(d => _menu[d.id] = { id: d.id, ...d.data() });
        renderClientMenu(_menu); renderAdminMenu(_menu);
    });

    // Discounts
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'discounts'), snap => {
        _discounts = {}; snap.forEach(d => _discounts[d.id] = { id: d.id, ...d.data() });
        renderAdminDiscounts(_discounts);
        if (myProfile) renderClientLoyalty(myProfile, _profiles, _discounts, sysSettings);
    });

    // Event Attendees
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'event_attendees'), snap => {
        _eventAttendees = {}; snap.forEach(d => _eventAttendees[d.id] = { id: d.id, ...d.data() });
        renderAdminEventAttendees(_eventAttendees);
        // Also re-render smart events list (attendees count updates)
        if (Object.keys(_smartEvents).length > 0 && window.renderSmartEventsAdminList) {
            window.renderSmartEventsAdminList(_smartEvents);
        }
    });

    // Smart Events
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'smart_events'), snap => {
        _smartEvents = {}; snap.forEach(d => _smartEvents[d.id] = { id: d.id, ...d.data() });
        window._smartEvents = _smartEvents;
        if (window.renderSmartEventsAdminList) window.renderSmartEventsAdminList(_smartEvents);
        // Re-render public events banners (login screen + client profile)
        renderPublicEvents(sysSettings, myProfile, activeSessionId, _smartEvents);
        if (window._renderLoginEvents) window._renderLoginEvents();
        if (window._updateClosedScreenData) window._updateClosedScreenData();
    });

    // Notifications — popup once per id, reset on login
    let _notifInitialLoad = true;
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), snap => {
        _notifications = {}; snap.forEach(d => { _notifications[d.id] = { id: d.id, ...d.data() }; });
        window._notifications = _notifications;
        if (myProfile) {
            renderClientNotifications(myProfile, _notifications);
            // Update notification badge
            const unread = Object.values(_notifications).filter(n => n.phone === myProfile.phone && !n.isRead).length;
            const badge = document.getElementById('headerNotifCount');
            if (badge) { badge.textContent = unread > 0 ? unread : ''; badge.classList.toggle('hidden', unread === 0); }
            const tabBadge = document.getElementById('notifTabBadge');
            if (tabBadge) { tabBadge.textContent = unread > 0 ? unread : ''; tabBadge.classList.toggle('hidden', unread === 0); }
            // Only show popups after initial load (not all at once on login)
            if (!_notifInitialLoad) {
                Object.values(_notifications).forEach(n => {
                    if (n.phone === myProfile.phone && !n.isRead && !seenNotificationPopups.has(n.id)) {
                        seenNotificationPopups.add(n.id);
                        showClientNotification(n.msg, n.type, n.id, n.imgUrl, n.linkUrl, db, appId);
                        playAlertSound(n.type);
                    }
                });
            } else {
                // On initial load, just mark all existing unread as seen (no popup)
                Object.values(_notifications).forEach(n => {
                    if (n.phone === myProfile.phone && !n.isRead) {
                        seenNotificationPopups.add(n.id);
                    }
                });
                _notifInitialLoad = false;
            }
        }
    });

    // Orders
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), snap => {
        let alerts = []; let hasNewPending = false;
        snap.forEach(d => {
            const data = d.data();
            if (data.status === 'pending') {
                alerts.push({ id: d.id, ...data });
                if (!seenOrders.has(d.id)) { seenOrders.add(d.id); if (!isInitialOrdersLoad) hasNewPending = true; }
            }
        });
        isInitialOrdersLoad = false;
        if (hasNewPending) playAlertSound('normal');
        renderAdminGroupedOrders(alerts, _profiles);
        const pendingSubs = alerts.filter(a => a.itemName?.includes('طلب اشتراك'));
        if (pendingSubs.length > 0) document.getElementById('adminSubsBadge')?.classList.remove('hidden');
    });

    // Banned
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'banned_phones'), snap => {
        window._bannedPhones = {}; snap.forEach(d => window._bannedPhones[d.id] = { id: d.id, ...d.data() });
        renderAdminBanned(window._bannedPhones);
    });

    // Chats
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'chats'), snap => {
        _chats = {}; snap.forEach(d => _chats[d.id] = { id: d.id, ...d.data() });
        if (myProfile) renderClientChatMessages(myProfile, _chats);
        renderAdminChatUsersList(_chats, _profiles, currentChatPhone, _sessions);
        if (currentChatPhone) renderAdminChatMessages(currentChatPhone, _chats);
    });

    // Subscriptions
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'subscriptions'), snap => {
        _subscriptions = {}; snap.forEach(d => _subscriptions[d.id] = { id: d.id, ...d.data() });
        renderAdminSubscriptions(_subscriptions, _plans);
        if (myProfile) {
            renderClientSubscriptions(myProfile, _subscriptions);
            if (window._checkScheduledPauses) window._checkScheduledPauses();
        }
        const pending = Object.values(_subscriptions).filter(s => s.status === 'pending');
        if (pending.length > 0) document.getElementById('adminSubsBadge')?.classList.remove('hidden');
        else document.getElementById('adminSubsBadge')?.classList.add('hidden');
    });

    // Remote Users
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'remote_users'), snap => {
        window._remoteUsers = {};
        const now = Date.now();
        snap.forEach(d => {
            const data = { id: d.id, ...d.data() };
            if (now - (data.lastSeen || 0) < 600000) window._remoteUsers[d.id] = data;
        });
        _renderAdminRemoteUsers();
    });

    // Admin Sessions (multi-admin)
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'admin_sessions'), snap => {
        window._adminSessions = {};
        const now = Date.now();
        snap.forEach(d => {
            const data = { id: d.id, ...d.data() };
            if (now - (data.lastPing || data.loginAt || 0) < 300000) window._adminSessions[d.id] = data;
        });
        _renderAdminSessions_multi();
    });

    // Plans
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'plans'), snap => {
        _plans = {}; snap.forEach(d => _plans[d.id] = { id: d.id, ...d.data() });
        window._plans = _plans; // ★ expose for subscription URL handler
        renderAdminPlans(_plans);
    });

    _bindAdminTokenWatcher(db, appId, uid);
}
