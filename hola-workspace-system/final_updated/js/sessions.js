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

// ─── Shared State ────────────────────────────────────────────────────────────
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

export function setMyProfile(v) { myProfile = v; }
export function setActiveSessionId(v) { activeSessionId = v; }
export function setSessionStartTime(v) { sessionStartTime = v; }
export function setSessionItems(v) { sessionItems = v; }
export function setTimerInterval(v) { timerInterval = v; }
export function setAppliedDiscountVal(v) { appliedDiscountVal = v; }
export function setCurrentManageUserPhone(v) { currentManageUserPhone = v; }
export function setCurrentShiftAdmin(v) { currentShiftAdmin = v; }
export function setCurrentChatPhone(v) { currentChatPhone = v; }

// ─── Setup all Firestore Listeners ───────────────────────────────────────────
export function setupListeners(db, appId) {
    // System Settings
    onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), snap => {
        if (snap.exists()) {
            sysSettings = { ...sysSettings, ...snap.data() };
            if (!sysSettings.shiftManagers) sysSettings.shiftManagers = ["مدير النظام"];
            if (!sysSettings.workspaceLat) { sysSettings.workspaceLat = 26.559074; sysSettings.workspaceLng = 31.695689; sysSettings.workspaceRadius = 500; }
            if (!sysSettings.voteLoud) sysSettings.voteLoud = 0;
            if (!sysSettings.voteBad) sysSettings.voteBad = 0;
            if (!sysSettings.musicVoteRound) sysSettings.musicVoteRound = 1;

            safeSet('pubT1', 'innerText', sysSettings.pricingTier1); safeSet('pubT2', 'innerText', sysSettings.pricingTier2); safeSet('pubT3', 'innerText', sysSettings.pricingTier3);
            safeSet('hintT1', 'innerText', sysSettings.pricingTier1); safeSet('hintT2', 'innerText', sysSettings.pricingTier2); safeSet('hintT3', 'innerText', sysSettings.pricingTier3);
            safeSet('setT1', 'value', sysSettings.pricingTier1); safeSet('setT2', 'value', sysSettings.pricingTier2); safeSet('setT3', 'value', sysSettings.pricingTier3);
            safeSet('setMaxCap', 'value', sysSettings.maxCapacity); safeSet('setStampsReq', 'value', sysSettings.stampsRequired);
            safeSet('settingAdminPin', 'value', sysSettings.adminPin);
            safeSet('publicDescription', 'innerText', sysSettings.description); safeSet('settingDescription', 'value', sysSettings.description);
            safeSet('publicLoyaltyText', 'innerText', sysSettings.loyaltyText); safeSet('settingLoyaltyText', 'value', sysSettings.loyaltyText); safeSet('clientStampsGoalText', 'innerText', sysSettings.loyaltyText); safeSet('clientHeaderStampsReq', 'innerText', sysSettings.stampsRequired);
            safeSet('setVfNumber', 'value', sysSettings.vfNumber || ''); safeSet('setVfName', 'value', sysSettings.vfName || ''); safeSet('setInstapayLink', 'value', sysSettings.instapayLink || '');
            safeSet('setFbPageLink', 'value', sysSettings.fbPageLink || ''); safeSet('setWhatsappNum', 'value', sysSettings.whatsappNum || '');
            safeSet('vfPayNum', 'innerText', sysSettings.vfNumber || ''); safeSet('vfPayName', 'innerText', sysSettings.vfName || '');
            safeSet('setLat', 'value', sysSettings.workspaceLat); safeSet('setLng', 'value', sysSettings.workspaceLng); safeSet('setRadius', 'value', sysSettings.workspaceRadius);
            safeSet('setPromoImg', 'value', sysSettings.promoImg || ''); safeSet('setPromoLink', 'value', sysSettings.promoLink || ''); safeSet('setPromoText', 'value', sysSettings.promoText || '');
            safeSet('setPromoEmbed', 'value', sysSettings.promoEmbed || '');

            const promoCard = document.getElementById('fbPromoCard');
            if (sysSettings.promoEmbed) {
                // Show embed content instead of image
                if (promoCard) { promoCard.classList.remove('hidden'); promoCard.innerHTML = `<div class="embed-content w-full overflow-hidden rounded-xl">${sysSettings.promoEmbed}</div>`; }
            } else if (sysSettings.promoImg) {
                safeSet('pubPromoImg', 'src', sysSettings.promoImg);
                if (sysSettings.promoText) { safeSet('pubPromoText', 'innerText', sysSettings.promoText); document.getElementById('pubPromoText')?.classList.remove('hidden'); } else { document.getElementById('pubPromoText')?.classList.add('hidden'); }
                if (sysSettings.promoLink) {
                    const link = document.getElementById('pubPromoLink');
                    if (link) {
                        link.href = sysSettings.promoLink;
                        if (window.detectSocialPlatform) {
                            const platform = window.detectSocialPlatform(sysSettings.promoLink);
                            link.className = `block w-full ${platform.color} text-white text-center py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2`;
                            link.innerHTML = `<i class="fa-solid ${platform.icon}"></i> ${platform.label}`;
                        }
                        link.classList.remove('hidden');
                    }
                } else { document.getElementById('pubPromoLink')?.classList.add('hidden'); }
                if (promoCard) promoCard.classList.remove('hidden');
            } else { if (promoCard) promoCard.classList.add('hidden'); }

            // Handle events slots 1-3
            renderPublicEvents(sysSettings, myProfile, activeSessionId);
            if (window._renderLoginEvents) window._renderLoginEvents();

            const rCheck = document.getElementById('setRoomsActive'); if (rCheck) rCheck.checked = sysSettings.roomsActive || false;
            // Rooms section - always visible but toggle content
            const roomsAvail = document.getElementById('roomsAvailableDiv');
            const roomsUnavail = document.getElementById('roomsUnavailableDiv');
            if (roomsAvail && roomsUnavail) {
                if (sysSettings.roomsActive) { roomsAvail.classList.remove('hidden'); roomsUnavail.classList.add('hidden'); }
                else { roomsAvail.classList.add('hidden'); roomsUnavail.classList.remove('hidden'); }
            }

            safeSet('voteCountLoud', 'innerText', sysSettings.voteLoud); safeSet('voteCountBad', 'innerText', sysSettings.voteBad);
            safeSet('adminVoteLoud', 'innerText', sysSettings.voteLoud); safeSet('adminVoteBad', 'innerText', sysSettings.voteBad);

            updateCapacityUI(_sessions, sysSettings);
            if (activeSessionId) window._updateDashboardNumbers();
            if (myProfile) renderClientLoyalty(myProfile, _profiles, _discounts, sysSettings);
            renderShiftManagers(sysSettings);
        } else {
            if (db) setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'system'), sysSettings);
        }
    });

    // Profiles
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'profiles'), snap => {
        _profiles = {}; snap.forEach(d => _profiles[d.id] = d.data());
        renderAdminUsers(_profiles);
        if (myProfile && _profiles[myProfile.phone]) { myProfile = _profiles[myProfile.phone]; updateClientHeaderUI(myProfile, _profiles, sysSettings); renderClientLoyalty(myProfile, _profiles, _discounts, sysSettings); }
        renderAdminChatUsersList(_chats, _profiles, currentChatPhone);
    });

    // Sessions
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'sessions'), snap => {
        _sessions = {}; snap.forEach(d => _sessions[d.id] = { id: d.id, ...d.data() });
        renderAdminSessions(_sessions, _profiles); updateCapacityUI(_sessions, sysSettings);
        if (myProfile) {
            renderClientHistory(myProfile, _sessions);
            if (!activeSessionId) {
                const existing = Object.values(_sessions).find(s => s.phone === myProfile.phone && s.status === 'active');
                if (existing) {
                    activeSessionId = existing.id; sessionStartTime = existing.startTime; sessionItems = existing.items || [];
                    window.switchView('client'); window.switchClientTab('session'); window._startTimer(); window.renderSessionItemsList();
                    renderPublicEvents(sysSettings, myProfile, activeSessionId);
                }
            } else {
                const myCurrentSes = _sessions[activeSessionId];
                if (myCurrentSes && myCurrentSes.status === 'completed') { window.forceShowClientReceipt(myCurrentSes); }
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

    // Operations
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'operations'), snap => {
        _operations = {}; snap.forEach(d => _operations[d.id] = { id: d.id, ...d.data() });
        renderAdminOperations(_operations);
    });

    // Event Attendees
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'event_attendees'), snap => {
        _eventAttendees = {}; snap.forEach(d => _eventAttendees[d.id] = { id: d.id, ...d.data() });
        renderAdminEventAttendees(_eventAttendees);
    });

    // Notifications
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'notifications'), snap => {
        _notifications = {}; snap.forEach(d => { _notifications[d.id] = { id: d.id, ...d.data() }; });
        if (myProfile) {
            renderClientNotifications(myProfile, _notifications);
            Object.values(_notifications).forEach(n => {
                if (n.phone === myProfile.phone && !n.isRead) {
                    showClientNotification(n.msg, n.type, n.id, n.imgUrl, n.linkUrl, db, appId);
                    playAlertSound(n.type);
                }
            });
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
        // Check for pending subscriptions notification
        const pendingSubs = alerts.filter(a => a.itemName?.includes('طلب اشتراك'));
        if (pendingSubs.length > 0) document.getElementById('adminSubsBadge')?.classList.remove('hidden');
    });

    // Pre-bookings
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'prebookings'), snap => {
        _prebookings = {}; snap.forEach(d => _prebookings[d.id] = { id: d.id, ...d.data() });
        renderAdminPreBookings(_prebookings);
    });

    // Banned Phones
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'banned_phones'), snap => {
        window._bannedPhones = {}; snap.forEach(d => window._bannedPhones[d.id] = { id: d.id, ...d.data() });
        renderAdminBanned(window._bannedPhones);
    });

    // Chats
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'chats'), snap => {
        _chats = {}; snap.forEach(d => _chats[d.id] = { id: d.id, ...d.data() });
        if (myProfile) renderClientChatMessages(myProfile, _chats);
        renderAdminChatUsersList(_chats, _profiles, currentChatPhone);
        if (currentChatPhone) renderAdminChatMessages(currentChatPhone, _chats);
    });

    // Subscriptions
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'subscriptions'), snap => {
        _subscriptions = {}; snap.forEach(d => _subscriptions[d.id] = { id: d.id, ...d.data() });
        renderAdminSubscriptions(_subscriptions, _plans);
        if (myProfile) renderClientSubscriptions(myProfile, _subscriptions);
        // Admin badge for pending
        const pending = Object.values(_subscriptions).filter(s => s.status === 'pending');
        if (pending.length > 0) document.getElementById('adminSubsBadge')?.classList.remove('hidden');
        else document.getElementById('adminSubsBadge')?.classList.add('hidden');
    });

    // Plans
    onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'plans'), snap => {
        _plans = {}; snap.forEach(d => _plans[d.id] = { id: d.id, ...d.data() });
        renderAdminPlans(_plans);
    });
}
