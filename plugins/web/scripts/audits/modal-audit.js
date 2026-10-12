/**
 * Modal accessibility audit.
 *
 * Browser-injectable, framework-agnostic module.
 * Inspects newly-opened modal subtrees and checks for an accessible
 * name (DES-MODA-01) and a visible close affordance (DES-MODA-02).
 * The Escape-dismiss check (DES-MODA-03) is set Python-side based on
 * post-Escape observation — this module only returns 01/02 findings.
 *
 * Usage (injected via <script src>):
 *   const report = window.runModalAudit({ modalUids: [12, 37] });
 *
 * ``modalUids`` is advisory — the script resolves modals by querying
 * matching selectors directly, since agent-browser's uid indirection
 * is not visible to injected JS.
 */
(function () {
  'use strict';

  var MODAL_SELECTOR =
    '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]';

  var CLOSE_AFFORDANCE_TEXT = /^\s*(close|dismiss|cancel|\u00d7|x)\s*$/i;
  var CLOSE_ARIA_LABEL = /close|dismiss/i;

  var getSelectorHint = function (element) {
    if (!element) return null;
    var hint = element.tagName.toLowerCase();
    if (element.id) hint = hint + '#' + element.id;
    var classNames = Array.from(element.classList || []).slice(0, 3);
    if (classNames.length > 0) hint = hint + '.' + classNames.join('.');
    if (hint.length > 80) hint = hint.substring(0, 77) + '...';
    return hint;
  };

  var isVisible = function (element) {
    if (!element) return false;
    if (element.offsetParent === null) return false;
    var style = getComputedStyle(element);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity || '1') <= 0) return false;
    return true;
  };

  var resolveLabelledByText = function (modal, ids) {
    if (!ids) return '';
    var parts = ids.split(/\s+/).filter(Boolean);
    var combined = '';
    for (var i = 0; i < parts.length; i++) {
      var ref = (modal.ownerDocument || document).getElementById(parts[i]);
      if (ref) combined = combined + ' ' + (ref.textContent || '');
    }
    return combined.trim();
  };

  var hasAccessibleName = function (modal) {
    var label = (modal.getAttribute('aria-label') || '').trim();
    if (label) return true;
    var labelledBy = modal.getAttribute('aria-labelledby');
    if (labelledBy && resolveLabelledByText(modal, labelledBy)) return true;
    // dialog elements inherit name from <h1>..<h6> inside
    var heading = modal.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading && (heading.textContent || '').trim()) return true;
    return false;
  };

  var findCloseAffordance = function (modal) {
    var focusable = modal.querySelectorAll(
      'button, [role="button"], a[href], [tabindex]:not([tabindex="-1"])'
    );
    for (var i = 0; i < focusable.length; i++) {
      var candidate = focusable[i];
      if (!isVisible(candidate)) continue;
      var aria = (candidate.getAttribute('aria-label') || '').trim();
      if (aria && CLOSE_ARIA_LABEL.test(aria)) return candidate;
      var text = (candidate.textContent || '').trim();
      if (text && CLOSE_AFFORDANCE_TEXT.test(text)) return candidate;
      if (candidate.hasAttribute('data-dismiss')) return candidate;
      if (candidate.hasAttribute('data-close')) return candidate;
    }
    return null;
  };

  var findVisibleModals = function () {
    var all = document.querySelectorAll(MODAL_SELECTOR);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (isVisible(all[i])) out.push(all[i]);
    }
    return out;
  };

  window.runModalAudit = function (options) {
    options = options || {};

    var issues = [];
    var modals = findVisibleModals();

    for (var i = 0; i < modals.length; i++) {
      var modal = modals[i];
      var selector = getSelectorHint(modal);

      if (!hasAccessibleName(modal)) {
        issues.push({
          category: 'interaction',
          ruleId: 'DES-MODA-01',
          desRuleId: 'DES-MODA-01',
          severity: 'high',
          title: 'Modal missing accessible name',
          summary:
            (selector || 'modal') +
            ' has no aria-label, aria-labelledby, or heading — screen readers cannot announce its purpose.',
          details:
            'Dialogs must expose an accessible name via aria-label, ' +
            'aria-labelledby pointing to visible text, or a heading inside the dialog.',
          selector: selector,
          tags: ['modal', 'accessibility', 'aria'],
          wcagCriteria: ['4.1.2'],
          evidence: {
            role: modal.getAttribute('role') || modal.tagName.toLowerCase(),
            hasAriaLabel: Boolean((modal.getAttribute('aria-label') || '').trim()),
            hasAriaLabelledBy: Boolean(modal.getAttribute('aria-labelledby')),
          },
        });
      }

      var closeEl = findCloseAffordance(modal);
      if (!closeEl) {
        issues.push({
          category: 'interaction',
          ruleId: 'DES-MODA-02',
          desRuleId: 'DES-MODA-02',
          severity: 'high',
          title: 'Modal lacks visible close affordance',
          summary:
            (selector || 'modal') +
            ' has no visible close/dismiss control — users cannot dismiss it with a pointer.',
          details:
            'Dialogs must expose a focusable close control: a button ' +
            'with an aria-label matching /close|dismiss/i, visible ' +
            '"Close" / "\u00d7" text, or a data-dismiss attribute.',
          selector: selector,
          tags: ['modal', 'accessibility', 'dismissal'],
          wcagCriteria: ['2.1.2'],
          evidence: {
            role: modal.getAttribute('role') || modal.tagName.toLowerCase(),
          },
        });
      }
    }

    return {
      auditId: 'modal-audit',
      label: 'Modal Accessibility',
      issueCount: issues.length,
      issues: issues,
      stats: {
        url: window.location.href,
        modalCount: modals.length,
        requestedUids: Array.isArray(options.modalUids) ? options.modalUids.length : 0,
      },
    };
  };
})();
