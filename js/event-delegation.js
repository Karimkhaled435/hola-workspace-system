document.addEventListener('DOMContentLoaded', () => {

    document.addEventListener('click', (e) => {

        if (e.target.classList.contains('fixed') && e.target.classList.contains('inset-0')) {
            e.target.classList.add('hidden');
            return;
        }

        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const ds = btn.dataset;

        switch (action) {

            case 'switch-view': window.switchView(ds.view); break;
            case 'switch-client-tab': window.switchClientTab(ds.tab); break;
            case 'switch-admin-tab': window.switchAdminTab(ds.tab); break;
            case 'show-admin-login-modal': window.showAdminLoginModal(); break;
            case 'show-subscription-modal': window.showSubscriptionModal(); break;
            case 'check-location-for-login': window.checkLocationForLogin(); break;
            case 'show-pre-booking-fallback': window.showPreBookingFallback(ds.type); break;
            case 'show-quick-book-modal': window.showQuickBookModal(); break;
            case 'show-event-intent-from-login': window.showEventIntentFromLogin(); break;
            case 'handle-login': window.handleLogin(); break;
            case 'reset-location-check': window.resetLocationCheck(); break;
            case 'submit-pre-booking': window.submitPreBooking(); break;
            case 'open-event-details': window.openEventDetails(); break;

            case 'attend-event':
                window.attendEvent(ds.slot ? parseInt(ds.slot) : (window._currentPublicEvSlot || 1));
                break;

            case 'vote-music': window.voteMusic(ds.vote); break;
            case 'suggest-song': window.suggestSong(); break;
            case 'show-checkout-modal': window.showCheckoutModal(); break;
            case 'open-bar-self-service': window.openBarSelfService(); break;
            case 'refresh-notifications': window.refreshNotifications?.(); break;
            case 'submit-room-booking': window.submitRoomBooking(); break;
            case 'submit-room-waitlist': window.submitRoomWaitlist(); break;
            case 'submit-internal-pre-booking': window.submitInternalPreBooking(ds.type); break;
            case 'open-client-chat': window.openClientChat(); break;
            case 'reset-music-votes': window.resetMusicVotes(); break;
            case 'show-end-day-summary': window.showEndDaySummary(); break;
            case 'logout-admin': window.logoutAdmin(); break;
            case 'send-admin-message': window.sendAdminMessage(); break;

            case 'switch-event-slot':
                window.switchEventSlot(parseInt(ds.slot));
                break;

            case 'share-event-link': window.shareEventLink(); break;
            case 'copy-event-link': window.copyEventLink(); break;
            case 'share-event-whatsapp': window.shareEventWhatsapp(); break;
            case 'save-event-settings': window.saveEventSettings(); break;
            case 'export-table-to-csv': window.exportTableToCSV(ds.table, ds.filename); break;
            case 'clear-event-attendees': window.clearEventAttendees(); break;
            case 'show-menu-modal': window.showMenuModal(); break;
            case 'show-discount-modal': window.showDiscountModal(); break;
            case 'delete-all-history': window.deleteAllHistory(); break;
            case 'delete-all-archived-bookings': window.deleteAllArchivedBookings(); break;
            case 'show-add-plan-modal': window.showAddPlanModal(); break;
            case 'save-system-settings': window.saveSystemSettings(); break;
            case 'add-shift-manager': window.addShiftManager(); break;
            case 'close-client-chat': window.closeClientChat(); break;
            case 'send-client-message': window.sendClientMessage(); break;

            case 'share-client-event':
                window.shareClientEvent(ds.slot ? parseInt(ds.slot) : (window._currentPublicEvSlot || 1));
                break;

            case 'set-payment': window.setPayment(ds.type); break;
            case 'confirm-payment-method': window.confirmPaymentMethod(); break;
            case 'close-end-day-summary': window.closeEndDaySummary(); break;
            case 'print-end-day-summary': window.printEndDaySummary(); break;
            case 'close-checkout-modal': window.closeCheckoutModal(); break;
            case 'apply-discount-code': window.applyDiscountCode(); break;
            case 'confirm-checkout': window.confirmCheckout(); break;
            case 'toggle-vf-pay': window.toggleVfPay(); break;
            case 'open-instapay': window.openInstapay(); break;

            case 'print-invoice':
                const sid = ds.session === 'lastCompleted' ? window.lastCompletedSessionId :
                            ds.session === 'lastAdmin' ? window.lastAdminCompletedSessionId :
                            ds.session;
                window.printInvoice(sid);
                break;

            case 'close-receipt-modal': window.closeReceiptModal(); break;

            case 'open-user-details':
                const phone = ds.phone || document.getElementById('liveSesPhone')?.innerText;
                if (!phone) return;
                window.openUserDetails(phone);
                break;

            case 'save-user-wallet': window.saveUserWallet(); break;
            case 'send-user-msg-only': window.sendUserMsgOnly(); break;
            case 'send-user-discount-only': window.sendUserDiscountOnly(); break;
            case 'close-client-notif': window.closeClientNotif(); break;
            case 'verify-admin-pin': window.verifyAdminPin(); break;
            case 'save-menu-item': window.saveMenuItem(); break;
            case 'save-discount': window.saveDiscount(); break;
            case 'do-share-whatsapp': window.doShareWhatsapp(); break;
            case 'copy-share-link': window.copyShareLink(); break;
            case 'submit-subscription': window.submitSubscription(); break;
            case 'print-sub-card': window.printSubCard(); break;
            case 'confirm-bar-self-service': window.confirmBarSelfService(); break;
            case 'preview-embed': window.previewEmbed(); break;
            case 'apply-embed': window.applyEmbed(); break;
            case 'save-plan': window.savePlan(); break;
            case 'submit-landing-attend': window.submitLandingAttend(); break;
            case 'toggle-landing-embed': window.toggleLandingEmbed(); break;

            // UI helpers
            case 'close-modal':
                const modalId = ds.modal;
                if (modalId) document.getElementById(modalId)?.classList.add('hidden');
                else btn.closest('.fixed')?.classList.add('hidden');
                break;

            case 'copy-to-clipboard':
                const el = document.getElementById(ds.copyTarget);
                window.copyToClipboard(el?.innerText || '');
                break;
        }
    });

});
