// Centralized event delegation for UI actions in Hola Workspace

document.addEventListener('click', function (event) {
  const actionElement = event.target.closest('[data-action]');
  if (!actionElement) return;

  const { action } = actionElement.dataset;

  switch (action) {
    case 'order-item':
      // data-menu-id required
      window.orderItem && window.orderItem(actionElement.dataset.menuId);
      break;

    case 'confirm-checkout':
      window.confirmCheckout && window.confirmCheckout();
      break;

    case 'show-checkout-modal':
      window.showCheckoutModal && window.showCheckoutModal();
      break;

    case 'close-checkout-modal':
      window.closeCheckoutModal && window.closeCheckoutModal();
      break;

    case 'handle-wallet-input':
      window.handleWalletInput && window.handleWalletInput(actionElement);
      break;

    case 'open-bar-self-service':
      window.openBarSelfService && window.openBarSelfService();
      break;

    case 'add-to-bar-cart':
      window.addToBarCart && window.addToBarCart(actionElement.dataset.menuId);
      break;

    case 'remove-from-bar-cart':
      window.removeFromBarCart && window.removeFromBarCart(actionElement.dataset.idx);
      break;

    case 'confirm-bar-self-service':
      window.confirmBarSelfService && window.confirmBarSelfService();
      break;

    case 'copy-share-link':
      window.copyShareLink && window.copyShareLink();
      break;

    case 'submit-pre-booking':
      window.submitPreBooking && window.submitPreBooking();
      break;

    case 'submit-internal-pre-booking':
      window.submitInternalPreBooking && window.submitInternalPreBooking(actionElement.dataset.type);
      break;

    case 'handle-login':
      window.handleLogin && window.handleLogin();
      break;

    case 'show-admin-login-modal':
      window.showAdminLoginModal && window.showAdminLoginModal();
      break;

    case 'verify-admin-pin':
      window.verifyAdminPin && window.verifyAdminPin();
      break;

    case 'logout-admin':
      window.logoutAdmin && window.logoutAdmin();
      break;

    case 'apply-discount-code':
      window.applyDiscountCode && window.applyDiscountCode();
      break;

    case 'show-discount-modal':
      window.showDiscountModal && window.showDiscountModal();
      break;

    case 'save-discount':
      window.saveDiscount && window.saveDiscount();
      break;

    case 'delete-discount':
      window.deleteDiscount && window.deleteDiscount(actionElement.dataset.id);
      break;

    case 'show-menu-modal':
      window.showMenuModal && window.showMenuModal();
      break;

    case 'save-menu-item':
      window.saveMenuItem && window.saveMenuItem();
      break;

    case 'delete-menu-item':
      window.deleteMenuItem && window.deleteMenuItem(actionElement.dataset.id);
      break;

    case 'open-user-manage':
      window.openUserManage && window.openUserManage(actionElement.dataset.phone);
      break;

    case 'save-user-wallet':
      window.saveUserWallet && window.saveUserWallet();
      break;

    case 'send-user-msg-only':
      window.sendUserMsgOnly && window.sendUserMsgOnly();
      break;

    case 'send-user-discount-only':
      window.sendUserDiscountOnly && window.sendUserDiscountOnly();
      break;

    case 'open-user-details':
      window.openUserDetails && window.openUserDetails(actionElement.dataset.phone);
      break;

    case 'unban-phone':
      window.unbanPhone && window.unbanPhone(actionElement.dataset.phone);
      break;

    case 'mark-pre-booking-done':
      window.markPreBookingDone && window.markPreBookingDone(actionElement.dataset.id);
      break;

    case 'delete-all-history':
      window.deleteAllHistory && window.deleteAllHistory();
      break;

    case 'delete-all-archived-bookings':
      window.deleteAllArchivedBookings && window.deleteAllArchivedBookings();
      break;

    case 'export-table-to-csv':
      window.exportTableToCSV && window.exportTableToCSV(actionElement.dataset.tableId, actionElement.dataset.fileName);
      break;

    case 'print-invoice':
      window.printInvoice && window.printInvoice(actionElement.dataset.id);
      break;

    case 'show-end-day-summary':
      window.showEndDaySummary && window.showEndDaySummary();
      break;

    case 'show-add-plan-modal':
      window.showAddPlanModal && window.showAddPlanModal();
      break;

    case 'show-embed-modal':
      window.showEmbedModal && window.showEmbedModal();
      break;

    case 'close-client-chat':
      window.closeClientChat && window.closeClientChat();
      break;

    case 'close-client-notif':
      window.closeClientNotif && window.closeClientNotif();
      break;

    case 'delete-attendee':
      window.deleteAttendee && window.deleteAttendee(actionElement.dataset.id);
      break;

    case 'mark-order-done':
      window.markOrderDone && window.markOrderDone(actionElement.dataset.id);
      break;

    case 'copy-event-link':
      window.copyEventLink && window.copyEventLink();
      break;

    case 'share-event-link':
      window.shareEventLink && window.shareEventLink();
      break;

    case 'share-event-whatsapp':
      window.shareEventWhatsapp && window.shareEventWhatsapp();
      break;

    case 'show-subscription-modal':
      window.showSubscriptionModal && window.showSubscriptionModal();
      break;

    case 'switch-admin-tab':
      window.switchAdminTab && window.switchAdminTab(actionElement.dataset.tab);
      break;

    case 'switch-client-tab':
      window.switchClientTab && window.switchClientTab(actionElement.dataset.tab);
      break;

    case 'reset-location-check':
      window.resetLocationCheck && window.resetLocationCheck();
      break;

    case 'show-quick-book-modal':
      window.showQuickBookModal && window.showQuickBookModal();
      break;

    case 'submit-quick-book':
      window.submitQuickBook && window.submitQuickBook();
      break;

    case 'show-event-intent-from-login':
      window.showEventIntentFromLogin && window.showEventIntentFromLogin();
      break;

    case 'attend-event':
      window.attendEvent && window.attendEvent(actionElement.dataset.evSlot);
      break;

    case 'show-event-details':
      window.openEventDetails && window.openEventDetails();
      break;

    case 'show-subscription-card-modal':
      window.showSubscriptionCardModal && window.showSubscriptionCardModal();
      break;

    case 'show-end-day-modal':
      window.showEndDaySummary && window.showEndDaySummary();
      break;

    case 'print-end-day-summary':
      window.printEndDaySummary && window.printEndDaySummary();
      break;

    case 'copy-to-clipboard':
      window.copyToClipboard && window.copyToClipboard(actionElement.dataset.text);
      break;

    case 'send-admin-message':
      window.sendAdminMessage && window.sendAdminMessage();
      break;

    case 'show-promo-link':
      window.showPromoLink && window.showPromoLink(actionElement.dataset.link);
      break;

    // Add further real project actions as needed, using action names and dataset params from your markup & JS

    default:
      break;
  }
});