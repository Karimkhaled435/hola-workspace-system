// =====================================================
// js/sessions.js — Firebase Listeners & Global State
// =====================================================

import { collection, addDoc, updateDoc, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { DEFAULT_SETTINGS } from "../config/constants.js";
import {
    renderClientMenu, renderAdminMenu, renderAdminDiscounts, renderAdminOperations,
    renderAdminUsers, renderAdminBanned, renderAdminGroupedOrders, renderAdminSessions,
    renderAdminPreBookings, renderAdminEventAttendees, renderAdminChatUsersList,
    renderAdminChatMessages, renderClientChatMessages, renderClientHistory,
    renderClientNotifications, renderClientLoyalty, showClientNotification,
    updateCapacityUI, updateClientHeaderUI, renderShiftManagers, safeSet,
    renderPublicEvents, renderClientSubscriptions, renderAdminSubscriptions, renderAdminPlans
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

export function setMyProfile(v) { myProfile = v; }
export function setActiveSessionId(v) { activeSessionId = v; }
export function setSessionStartTime(v) { sessionStartTime = v; }
export function setSessionItems(v) { sessionItems = v; }
export function setTimerInterval(v) { timerInterval = v; }
export function setAppliedDiscountVal(v) { appliedDiscountVal = v; }
export function setCurrentManageUserPhone(v) { currentManageUserPhone = v; window._currentManageUserPhone = v; }
export function setCurrentShiftAdmin(v) { currentShiftAdmin = v; window._currentShiftAdmin = v; }
export function setCurrentChatPhone(v) { currentChatPhone = v; }

// ─── Manual Sync Helper — call from any tab to force re-render ────────────────
export function syncAllClientTabs() {
    if (!myProfile) return;
    renderClientHistory(myProfile, _sessions);
    renderClientLoyalty(myProfile, _profiles, _discounts, sysSettings);
    renderClientNotifications(myProfile, _notifications);
    renderClientSubscriptions(myProfile, _subscriptions);
    renderClientChatMessages(myProfile, _chats);
    updateClientHeaderUI(myProfile, _profiles, sysSettings);
}
window._syncAllClientTabs = () => syncAllClientTabs();

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
                <div class="w-9 h-9 bg-gray-700 text-white rounded-full flex items-center justify-center font-black text-sm">${(u.name||'?').charAt(0).toUpperCase()}</div>
                <div>
                    <p class="font-bold text-sm text-gray-800">${u.name || 'غير معروف'}</p>
                    <p class="text-xs font-mono text-gray-500">${u.phone || ''}</p>
                </div>
            </div>
            <div class="text-left">
                <span class="bg-gray-200 text-gray-700 text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">🌐 بعيد</span>
                <p class="text-[9px] text-gray-400 mt-0.5">${new Date(u.enteredAt||Date.now()).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</p>
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
            <div class="w-7 h-7 bg-hola-purple text-white rounded-full flex items-center justify-center font-black text-xs">${(s.adminName||'م').charAt(0)}</div>
            <div>
                <p class="font-bold text-xs text-hola-purple">${s.adminName || 'مسؤول'}</p>
                <p class="text-[9px] text-gray-400">دخل ${new Date(s.loginAt||Date.now()).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</p>
            </div>
            <span class="mr-auto bg-green-100 text-green-700 text-[8px] px-1.5 py-0.5 rounded-full font-bold">● نشط</span>
        </div>`).join('');
}

// ─── Setup all Firestore Listeners ───────────────────────────────────────────
export function setupListeners(db, appId) {
    // Settings
    onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), snap => {
        if (snap.exists()) {
            sysSettings = { ...sysSettings, ...snap.data() };
            if (!sysSettings.shiftManagers) sysSettings.shiftManagers = ["مدير النظام"];
            if (!sysSettings.workspaceLat) { sysSettings.workspaceLat = 26.559074; sysSettings.workspaceLng = 31.695689; sysSettings.workspaceRadius = 500; }
            if (sysSettings.voteLoud === undefined) sysSettings.voteLoud = 0;
            if (sysSettings.voteBad === undefined) sysSettings.voteBad = 0;
            if (!sysSettings.musicVoteRound) sysSettings.musicVoteRound = 1;

            safeSet('pubT1','innerText',sysSettings.pricingTier1); safeSet('pubT2','innerText',sysSettings.pricingTier2); safeSet('pubT3','innerText',sysSettings.pricingTier3);
            safeSet('hintT1','innerText',sysSettings.pricingTier1); safeSet('hintT2','innerText',sysSettings.pricingTier2); safeSet('hintT3','innerText',sysSettings.pricingTier3);
            safeSet('setT1','value',sysSettings.pricingTier1); safeSet('setT2','value',sysSettings.pricingTier2); safeSet('setT3','value',sysSettings.pricingTier3);
            safeSet('setMaxCap','value',sysSettings.maxCapacity); safeSet('setStampsReq','value',sysSettings.stampsRequired);
            safeSet('settingAdminPin','value',sysSettings.adminPin);
            safeSet('publicDescription','innerText',sysSettings.description); safeSet('settingDescription','value',sysSettings.description);
            safeSet('publicLoyaltyText','innerText',sysSettings.loyaltyText); safeSet('settingLoyaltyText','value',sysSettings.loyaltyText);
            safeSet('clientStampsGoalText','innerText',sysSettings.loyaltyText); safeSet('clientHeaderStampsReq','innerText',sysSettings.stampsRequired);
            safeSet('setVfNumber','value',sysSettings.vfNumber||''); safeSet('setVfName','value',sysSettings.vfName||''); safeSet('setInstapayLink','value',sysSettings.instapayLink||'');
            safeSet('setFbPageLink','value',sysSettings.fbPageLink||''); safeSet('setWhatsappNum','value',sysSettings.whatsappNum||'');
            safeSet('vfPayNum','innerText',sysSettings.vfNumber||''); safeSet('vfPayName','innerText',sysSettings.vfName||'');
            safeSet('setLat','value',sysSettings.workspaceLat); safeSet('setLng','value',sysSettings.workspaceLng); safeSet('setRadius','value',sysSettings.workspaceRadius);
            safeSet('setPromoImg','value',sysSettings.promoImg||''); safeSet('setPromoLink','value',sysSettings.promoLink||'');
            safeSet('setPromoText','value',sysSettings.promoText||''); safeSet('setPromoEmbed','value',sysSettings.promoEmbed||'');

            const promoCard = document.getElementById('fbPromoCard');
            if (sysSettings.promoEmbed) {
                if (promoCard) { promoCard.classList.remove('hidden'); promoCard.innerHTML = `<div class="embed-content w-full overflow-hidden rounded-xl">${sysSettings.promoEmbed}</div>`; }
            } else if (sysSettings.promoImg) {
                safeSet('pubPromoImg','src',sysSettings.promoImg);
                if (sysSettings.promoText) { safeSet('pubPromoText','innerText',sysSettings.promoText); document.getElementById('pubPromoText')?.classList.remove('hidden'); }
                else document.getElementById('pubPromoText')?.classList.add('hidden');
                if (sysSettings.promoLink) {
                    const link = document.getElementById('pubPromoLink');
                    if (link) {
                        link.href = sysSettings.promoLink;
                        if (window.detectSocialPlatform) {
                            const p = window.detectSocialPlatform(sysSettings.promoLink);
                            link.className = `block w-full ${p.color} text-white text-center py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2`;
                            link.innerHTML = `<i class="fa-solid ${p.icon}"></i> ${p.label}`;
                        }
                        link.classList.remove('hidden');
                    }
                } else document.getElementById('pubPromoLink')?.classList.add('hidden');
                if (promoCard) promoCard.classList.remove('hidden');
            } else { if (promoCard) promoCard.classList.add('hidden'); }

            renderPublicEvents(sysSettings, myProfile, activeSessionId);
            if (window._renderLoginEvents) window._renderLoginEvents();

            const rCheck = document.getElementById('setRoomsActive'); if (rCheck) rCheck.checked = sysSettings.roomsActive||false;
            const roomsAvail = document.getElementById('roomsAvailableDiv'), roomsUnavail = document.getElementById('roomsUnavailableDiv');
            if (roomsAvail && roomsUnavail) {
                if (sysSettings.roomsActive) { roomsAvail.classList.remove('hidden'); roomsUnavail.classList.add('hidden'); }
                else { roomsAvail.classList.add('hidden'); roomsUnavail.classList.remove('hidden'); }
            }

            safeSet('voteCountLoud','innerText',sysSettings.voteLoud); safeSet('voteCountBad','innerText',sysSettings.voteBad);
            safeSet('adminVoteLoud','innerText',sysSettings.voteLoud); safeSet('adminVoteBad','innerText',sysSettings.voteBad);

            updateCapacityUI(_sessions, sysSettings);
            if (activeSessionId && window._updateDashboardNumbers) window._updateDashboardNumbers();
            if (myProfile) renderClientLoyalty(myProfile, _profiles, _discounts, sysSettings);
            renderShiftManagers(sysSettings);
        } else {
            if (db) setDoc(doc(db,'artifacts',appId,'public','data','settings','system'), sysSettings);
        }
    });

    // Profiles
    onSnapshot(collection(db,'artifacts',appId,'public','data','profiles'), snap => {
        _profiles = {}; snap.forEach(d => _profiles[d.id] = d.data());
        renderAdminUsers(_profiles);
        if (myProfile && _profiles[myProfile.phone]) {
            myProfile = { ..._profiles[myProfile.phone], isRemote: myProfile.isRemote };
            updateClientHeaderUI(myProfile, _profiles, sysSettings);
            renderClientLoyalty(myProfile, _profiles, _discounts, sysSettings);
            renderClientHistory(myProfile, _sessions);
            renderClientNotifications(myProfile, _notifications);
            renderClientSubscriptions(myProfile, _subscriptions);
            renderClientChatMessages(myProfile, _chats);
            // Update remote profile display too
            if (myProfile.isRemote && window.populateRemoteProfile) window.populateRemoteProfile(myProfile.phone);
        }
        renderAdminChatUsersList(_chats, _profiles, currentChatPhone);
    });

    // Sessions
    onSnapshot(collection(db,'artifacts',appId,'public','data','sessions'), snap => {
        _sessions = {}; snap.forEach(d => _sessions[d.id] = { id: d.id, ...d.data() });
        renderAdminSessions(_sessions, _profiles); updateCapacityUI(_sessions, sysSettings);
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
                    renderPublicEvents(sysSettings, myProfile, activeSessionId);
                }
            } else {
                const cur = _sessions[activeSessionId];
                if (cur && cur.status === 'completed' && window.forceShowClientReceipt) window.forceShowClientReceipt(cur);
            }
        }
    });

    // Menu
    onSnapshot(collection(db,'artifacts',appId,'public','data','menu'), snap => {
        _menu = {}; snap.forEach(d => _menu[d.id] = { id: d.id, ...d.data() });
        renderClientMenu(_menu); renderAdminMenu(_menu);
    });

    // Discounts
    onSnapshot(collection(db,'artifacts',appId,'public','data','discounts'), snap => {
        _discounts = {}; snap.forEach(d => _discounts[d.id] = { id: d.id, ...d.data() });
        renderAdminDiscounts(_discounts);
        if (myProfile) renderClientLoyalty(myProfile, _profiles, _discounts, sysSettings);
    });

    // Operations
    onSnapshot(collection(db,'artifacts',appId,'public','data','operations'), snap => {
        _operations = {}; snap.forEach(d => _operations[d.id] = { id: d.id, ...d.data() });
        renderAdminOperations(_operations);
    });

    // Event Attendees
    onSnapshot(collection(db,'artifacts',appId,'public','data','event_attendees'), snap => {
        _eventAttendees = {}; snap.forEach(d => _eventAttendees[d.id] = { id: d.id, ...d.data() });
        renderAdminEventAttendees(_eventAttendees);
    });

    // Notifications — popup once per id
    onSnapshot(collection(db,'artifacts',appId,'public','data','notifications'), snap => {
        _notifications = {}; snap.forEach(d => { _notifications[d.id] = { id: d.id, ...d.data() }; });
        if (myProfile) {
            renderClientNotifications(myProfile, _notifications);
            Object.values(_notifications).forEach(n => {
                if (n.phone === myProfile.phone && !n.isRead && !seenNotificationPopups.has(n.id)) {
                    seenNotificationPopups.add(n.id);
                    showClientNotification(n.msg, n.type, n.id, n.imgUrl, n.linkUrl, db, appId);
                    playAlertSound(n.type);
                }
            });
        }
    });

    // Orders
    onSnapshot(collection(db,'artifacts',appId,'public','data','orders'), snap => {
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

    // Pre-bookings
    onSnapshot(collection(db,'artifacts',appId,'public','data','prebookings'), snap => {
        _prebookings = {}; snap.forEach(d => _prebookings[d.id] = { id: d.id, ...d.data() });
        renderAdminPreBookings(_prebookings);
    });

    // Banned
    onSnapshot(collection(db,'artifacts',appId,'public','data','banned_phones'), snap => {
        window._bannedPhones = {}; snap.forEach(d => window._bannedPhones[d.id] = { id: d.id, ...d.data() });
        renderAdminBanned(window._bannedPhones);
    });

    // Chats
    onSnapshot(collection(db,'artifacts',appId,'public','data','chats'), snap => {
        _chats = {}; snap.forEach(d => _chats[d.id] = { id: d.id, ...d.data() });
        if (myProfile) renderClientChatMessages(myProfile, _chats);
        renderAdminChatUsersList(_chats, _profiles, currentChatPhone);
        if (currentChatPhone) renderAdminChatMessages(currentChatPhone, _chats);
    });

    // Subscriptions
    onSnapshot(collection(db,'artifacts',appId,'public','data','subscriptions'), snap => {
        _subscriptions = {}; snap.forEach(d => _subscriptions[d.id] = { id: d.id, ...d.data() });
        renderAdminSubscriptions(_subscriptions, _plans);
        if (myProfile) {
            renderClientSubscriptions(myProfile, _subscriptions);
            // Check scheduled pauses
            if (window._checkScheduledPauses) window._checkScheduledPauses();
        }
        const pending = Object.values(_subscriptions).filter(s => s.status === 'pending');
        if (pending.length > 0) document.getElementById('adminSubsBadge')?.classList.remove('hidden');
        else document.getElementById('adminSubsBadge')?.classList.add('hidden');
    });

    // Remote Users (outside workspace)
    onSnapshot(collection(db,'artifacts',appId,'public','data','remote_users'), snap => {
        window._remoteUsers = {};
        const now = Date.now();
        snap.forEach(d => {
            const data = { id: d.id, ...d.data() };
            // Only show users seen in last 10 minutes
            if (now - (data.lastSeen || 0) < 600000) window._remoteUsers[d.id] = data;
        });
        _renderAdminRemoteUsers();
    });

    // Admin Sessions (multi-admin support)
    onSnapshot(collection(db,'artifacts',appId,'public','data','admin_sessions'), snap => {
        window._adminSessions = {};
        const now = Date.now();
        snap.forEach(d => {
            const data = { id: d.id, ...d.data() };
            if (now - (data.lastPing || data.loginAt || 0) < 300000) window._adminSessions[d.id] = data;
        });
        _renderAdminSessions_multi();
    });

    // Plans
    onSnapshot(collection(db,'artifacts',appId,'public','data','plans'), snap => {
        _plans = {}; snap.forEach(d => _plans[d.id] = { id: d.id, ...d.data() });
        renderAdminPlans(_plans);
    });
}
