// =====================================================
// js/event-delegation.js — Global Event Handling
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Centralized Click Delegation
    document.addEventListener('click', (e) => {
        // Handle closing modals when clicking the backdrop
        if (e.target.classList.contains('fixed') && e.target.classList.contains('inset-0')) {
            e.target.classList.add('hidden');
            return;
        }

        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const ds = btn.dataset;

        switch (action) {
            case 'switchView': window.switchView(ds.view); break;
            case 'switchClientTab': window.switchClientTab(ds.tab); break;
            case 'switchAdminTab': window.switchAdminTab(ds.tab); break;
            case 'showAdminLoginModal': window.showAdminLoginModal(); break;
            case 'showSubscriptionModal': window.showSubscriptionModal(); break;
            case 'checkLocationForLogin': window.checkLocationForLogin(); break;
            case 'showPreBookingFallback': window.showPreBookingFallback(ds.type); break;
            case 'showQuickBookModal': window.showQuickBookModal(); break;
            case 'showEventIntentFromLogin': window.showEventIntentFromLogin(); break;
            case 'handleLogin': window.handleLogin(); break;
            case 'resetLocationCheck': window.resetLocationCheck(); break;
            case 'submitPreBooking': window.submitPreBooking(); break;
            case 'openEventDetails': window.openEventDetails(); break;
            case 'attendEvent': window.attendEvent(ds.slot ? parseInt(ds.slot) : (window._currentPublicEvSlot || 1)); break;
            case 'voteMusic': window.voteMusic(ds.vote); break;
            case 'suggestSong': window.suggestSong(); break;
            case 'showCheckoutModal': window.showCheckoutModal(); break;
            case 'openBarSelfService': window.openBarSelfService(); break;
            case 'refreshNotifications': window.refreshNotifications(); break;
            case 'submitRoomBooking': window.submitRoomBooking(); break;
            case 'submitRoomWaitlist': window.submitRoomWaitlist(); break;
            case 'submitInternalPreBooking': window.submitInternalPreBooking(ds.type); break;
            case 'openClientChat': window.openClientChat(); break;
            case 'resetMusicVotes': window.resetMusicVotes(); break;
            case 'showEndDaySummary': window.showEndDaySummary(); break;
            case 'logoutAdmin': window.logoutAdmin(); break;
            case 'sendAdminMessage': window.sendAdminMessage(); break;
            case 'switchEventSlot': window.switchEventSlot(parseInt(ds.slot)); break;
            case 'shareEventLink': window.shareEventLink(); break;
            case 'copyEventLink': window.copyEventLink(); break;
            case 'shareEventWhatsapp': window.shareEventWhatsapp(); break;
            case 'saveEventSettings': window.saveEventSettings(); break;
            case 'exportTableToCSV': window.exportTableToCSV(ds.table, ds.filename); break;
            case 'clearEventAttendees': window.clearEventAttendees(); break;
            case 'showMenuModal': window.showMenuModal(); break;
            case 'showDiscountModal': window.showDiscountModal(); break;
            case 'deleteAllHistory': window.deleteAllHistory(); break;
            case 'deleteAllArchivedBookings': window.deleteAllArchivedBookings(); break;
            case 'showAddPlanModal': window.showAddPlanModal(); break;
            case 'saveSystemSettings': window.saveSystemSettings(); break;
            case 'addShiftManager': window.addShiftManager(); break;
            case 'closeClientChat': window.closeClientChat(); break;
            case 'sendClientMessage': window.sendClientMessage(); break;
            case 'shareClientEvent': window.shareClientEvent(ds.slot ? parseInt(ds.slot) : (window._currentPublicEvSlot || 1)); break;
            case 'setPayment': window.setPayment(ds.type); break;
            case 'confirmPaymentMethod': window.confirmPaymentMethod(); break;
            case 'closeEndDaySummary': window.closeEndDaySummary(); break;
            case 'printEndDaySummary': window.printEndDaySummary(); break;
            case 'closeCheckoutModal': window.closeCheckoutModal(); break;
            case 'applyDiscountCode': window.applyDiscountCode(); break;
            case 'confirmCheckout': window.confirmCheckout(); break;
            case 'toggleVfPay': window.toggleVfPay(); break;
            case 'openInstapay': window.openInstapay(); break;
            case 'printInvoice':
                const sid = ds.session === 'lastCompleted' ? window.lastCompletedSessionId :
                            ds.session === 'lastAdmin' ? window.lastAdminCompletedSessionId :
                            ds.session;
                window.printInvoice(sid); break;
            case 'closeReceiptModal': window.closeReceiptModal(); break;
            case 'openUserDetails':
                const phone = ds.phone || document.getElementById('liveSesPhone')?.innerText;
                window.openUserDetails(phone);
                break;
            case 'saveUserWallet': window.saveUserWallet(); break;
            case 'sendUserMsgOnly': window.sendUserMsgOnly(); break;
            case 'sendUserDiscountOnly': window.sendUserDiscountOnly(); break;
            case 'closeClientNotif': window.closeClientNotif(); break;
            case 'verifyAdminPin': window.verifyAdminPin(); break;
            case 'saveMenuItem': window.saveMenuItem(); break;
            case 'saveDiscount': window.saveDiscount(); break;
            case 'doShareWhatsapp': window.doShareWhatsapp(); break;
            case 'copyShareLink': window.copyShareLink(); break;
            case 'submitSubscription': window.submitSubscription(); break;
            case 'printSubCard': window.printSubCard(); break;
            case 'confirmBarSelfService': window.confirmBarSelfService(); break;
            case 'previewEmbed': window.previewEmbed(); break;
            case 'applyEmbed': window.applyEmbed(); break;
            case 'savePlan': window.savePlan(); break;
            case 'submitLandingAttend': window.submitLandingAttend(); break;
            case 'toggleLandingEmbed': window.toggleLandingEmbed(); break;

            // DOM UI Actions
            case 'closeModal':
                const modalId = ds.modal;
                if (modalId) document.getElementById(modalId)?.classList.add('hidden');
                else btn.closest('.fixed')?.classList.add('hidden');
                break;
            case 'copyToClipboard':
                let textToCopy = '';
                if (ds.copyTarget === 'self') {
                    textToCopy = btn.innerText;
                } else {
                    const el = document.getElementById(ds.copyTarget);
                    textToCopy = ds.copyType === 'value' ? el?.value : el?.innerText;
                }
                window.copyToClipboard(textToCopy);
                break;
            case 'openNotifFullImg':
                const srcToOpen = ds.srcTarget === 'self' ? btn.src : '';
                window.openNotifFullImg(srcToOpen);
                break;
            case 'selectText':
                btn.select();
                break;
            case 'closeQuickBookReload':
                document.getElementById('quickBookModal')?.classList.add('hidden');
                location.reload();
                break;
                
            // App.js Dynamic Render Bindings
            case 'addToBarCart': window.addToBarCart(ds.menuid); break;
            case 'removeFromBarCart': window.removeFromBarCart(parseInt(ds.idx)); break;
            case 'removeSessionItem': window.removeSessionItem(ds.sid, parseInt(ds.idx)); break;
            case 'selectPlan': window.selectPlan(ds.planid, ds.planname); break;
            case 'endAdminLiveSession': window.adminEndSession(ds.sid); break;
        }
    });

    // 2. Centralized Input Delegation
    document.addEventListener('input', (e) => {
        if (e.target.dataset.inputAction === 'checkNewUser') {
            window.checkNewUser(e.target.value);
        } else if (e.target.dataset.inputAction === 'handleWalletInput') {
            window.handleWalletInput(e.target);
        }
    });

    // 3. Keyboard Accessibility for custom elements acting as buttons
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const btn = e.target.closest('[data-action]');
            if (btn && btn.tagName !== 'BUTTON' && btn.tagName !== 'A' && btn.tagName !== 'INPUT') {
                e.preventDefault();
                btn.click();
            }
        }
    });

    // 4. Image Error Handling (replaces inline onerror)
    document.addEventListener('error', (e) => {
        if (e.target.tagName && e.target.tagName.toLowerCase() === 'img' && e.target.dataset.fallback === 'hide') {
            e.target.style.display = 'none';
        }
    }, true);
});