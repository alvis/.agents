/**
 * Spatial layout and element positioning audit.
 *
 * Browser-injectable, framework-agnostic module.
 * Checks element overlap, vertical misalignment, boundary proximity,
 * and excessive padding patterns.
 *
 * Usage (injected via <script src>):
 *   const report = window.runSpatialLayoutAudit({ quiet: true });
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DES rule-ID mapping for spatial-layout issues
  // ---------------------------------------------------------------------------
  var DES_RULE_MAP = {
    'element-overlap':             'DES-SPAC-01',
    'vertical-misalignment':       'DES-SPAC-01',
    'child-vertical-misalignment': 'DES-SPAC-01',
    'boundary-proximity':          'DES-SPAC-02',
    'excessive-padding':           'DES-CONS-02',
    'element-offset-asymmetry':    'DES-SPAC-03',
  };

  var JUSTIFY_REDISTRIBUTES = {
    'space-between': true,
    'space-around':  true,
    'space-evenly':  true,
    'flex-end':      true,
    'center':        true,
  };

  var ASYMMETRY_MIN_DELTA_PX = 8;
  var ASYMMETRY_MIN_RATIO    = 1.5;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Human-readable CSS selector (tag#id.class, max 80 chars). */
  var getSelectorHint = function (element) {
    if (!element) return null;
    var hint = element.tagName.toLowerCase();
    if (element.id) {
      hint = hint + '#' + element.id;
    }
    var classNames = Array.from(element.classList || []).slice(0, 3);
    if (classNames.length > 0) {
      hint = hint + '.' + classNames.join('.');
    }
    if (hint.length > 80) {
      hint = hint.substring(0, 77) + '...';
    }
    return hint;
  };

  /** getBoundingClientRect() values rounded with Math.round(). */
  var getRenderedBox = function (element) {
    var rect = element.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };

  /** Visibility check: display, visibility, opacity, onscreen, non-zero size. */
  var isVisible = function (element) {
    var style = getComputedStyle(element);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity || '1') <= 0) return false;
    var rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (rect.bottom <= 0 || rect.right <= 0) return false;
    if (rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
    return true;
  };

  /** Returns intersection rect {x, y, width, height, area} or null. */
  var rectsIntersect = function (a, b) {
    var x = Math.max(a.left, b.left);
    var y = Math.max(a.top, b.top);
    var right = Math.min(a.right, b.right);
    var bottom = Math.min(a.bottom, b.bottom);
    var width = right - x;
    var height = bottom - y;
    if (width <= 0 || height <= 0) return null;
    return { x: x, y: y, width: width, height: height, area: width * height };
  };

  /** Overlap exemption: fixed/sticky, absolute+z-index>0, inside tooltip/dropdown/modal. */
  var EXEMPT_CLASS_PATTERNS = /tooltip|dropdown|modal|popover|overlay|drawer/i;
  var EXEMPT_ROLES = { tooltip: true, dialog: true, menu: true, listbox: true };

  var isOverlapExempt = function (element) {
    var style = getComputedStyle(element);
    var position = style.position;
    if (position === 'fixed' || position === 'sticky') return true;
    if (position === 'absolute') {
      var zIndex = parseInt(style.zIndex, 10);
      if (zIndex > 0) return true;
    }
    // Walk up to check for tooltip/dropdown/modal containers
    var node = element;
    while (node && node !== document.body) {
      var role = node.getAttribute('role');
      if (role && EXEMPT_ROLES[role]) return true;
      if (node.className && typeof node.className === 'string' && EXEMPT_CLASS_PATTERNS.test(node.className)) return true;
      // Check for hidden popover/dropdown containers
      var nodeStyle = node === element ? style : getComputedStyle(node);
      if ((nodeStyle.position === 'fixed' || nodeStyle.position === 'absolute') && nodeStyle.display === 'none') return true;
      node = node.parentElement;
    }
    return false;
  };

  /** Returns true if element uses flex/grid centering (align-items:center). */
  var getFlexCenteringIntent = function (element) {
    var style = getComputedStyle(element);
    var display = style.display;
    if (display !== 'flex' && display !== 'inline-flex' && display !== 'grid' && display !== 'inline-grid') return false;
    var alignItems = style.alignItems;
    return alignItems === 'center';
  };

  // ---------------------------------------------------------------------------
  // Main audit
  // ---------------------------------------------------------------------------

  window.runSpatialLayoutAudit = function (options) {
    options = options || {};

    var settings = {
      quiet: true,
      maxIssues: 200,
      maxElements: 300,
      ignoreSelectors: [],
      overlapMinArea: 4,
      overlapHighArea: 100,
      misalignMediumPx: 3,
      misalignHighPx: 8,
      childMisalignLowPx: 3,
      childMisalignMediumPx: 6,
      boundaryProximityPx: 4,
      excessivePaddingRatio: 2,
      excessivePaddingMinPx: 24,
      selectors: {
        navbar: 'nav, header nav, [role="navigation"]',
        sidebar: 'aside, [role="complementary"], .sidebar',
        footer: 'footer, [role="contentinfo"]',
        main: 'main, [role="main"], #content',
      },
      exclude: [],
      viewport: 'desktop',
    };

    Object.keys(options).forEach(function (key) {
      if (key === 'selectors' && typeof options.selectors === 'object') {
        Object.keys(options.selectors).forEach(function (sk) {
          settings.selectors[sk] = options.selectors[sk];
        });
      } else {
        settings[key] = options[key];
      }
    });

    var ignoredSelectors = (settings.ignoreSelectors || []).filter(Boolean)
      .concat((settings.exclude || []).filter(Boolean));

    var matchesIgnoredSelector = function (element) {
      return ignoredSelectors.some(function (selector) {
        return element && (element.matches(selector) || element.closest(selector));
      });
    };

    var issues = [];
    var manualReview = [];

    var pushIssue = function (issue) {
      if (issues.length >= settings.maxIssues) return;
      issues.push(issue);
    };

    var createIssue = function (opts) {
      return {
        category: 'spatial',
        ruleId: opts.ruleId,
        desRuleId: DES_RULE_MAP[opts.ruleId] || 'DES-SPAC-01',
        severity: opts.severity,
        title: opts.title,
        summary: opts.summary,
        details: opts.details,
        selector: opts.selector || null,
        tags: opts.tags || [],
        wcagCriteria: opts.wcagCriteria || [],
        evidence: opts.evidence || {},
      };
    };

    // -----------------------------------------------------------------------
    // Collect visible interactive + text-bearing elements (capped)
    // -----------------------------------------------------------------------
    var collectAuditableElements = function () {
      var candidates = document.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
        '[role="button"], [role="link"], [tabindex]:not([tabindex="-1"]), ' +
        'p, span, h1, h2, h3, h4, h5, h6, label, li, td, th, figcaption'
      );
      var result = [];
      for (var i = 0; i < candidates.length && result.length < settings.maxElements; i++) {
        var el = candidates[i];
        if (matchesIgnoredSelector(el)) continue;
        if (!isVisible(el)) continue;
        result.push(el);
      }
      return result;
    };

    var auditableElements = collectAuditableElements();

    // -----------------------------------------------------------------------
    // 1. Element Overlap Detection (DES-SPAC-01)
    // -----------------------------------------------------------------------
    var checkElementOverlap = function () {
      // Filter to non-exempt elements and pre-compute rects
      var items = [];
      for (var i = 0; i < auditableElements.length; i++) {
        var el = auditableElements[i];
        if (isOverlapExempt(el)) continue;
        var box = getRenderedBox(el);
        if (box.width < 1 || box.height < 1) continue;
        items.push({ element: el, rect: box });
      }

      // Sort by rect.left for sweep-line approach
      items.sort(function (a, b) { return a.rect.left - b.rect.left; });

      // Sweep-line: only compare element i with elements j where j's left < i's right
      for (var i = 0; i < items.length; i++) {
        var a = items[i];
        for (var j = i + 1; j < items.length; j++) {
          var b = items[j];
          // Once b's left edge is past a's right edge, no more overlaps for a
          if (b.rect.left >= a.rect.right) break;

          // Skip parent-child relationships (nested elements naturally overlap)
          if (a.element.contains(b.element) || b.element.contains(a.element)) continue;

          var overlap = rectsIntersect(a.rect, b.rect);
          if (!overlap || overlap.area <= settings.overlapMinArea) continue;

          var severity = overlap.area > settings.overlapHighArea ? 'high' : 'medium';

          pushIssue(createIssue({
            ruleId: 'element-overlap',
            severity: severity,
            title: 'Elements overlap',
            summary:
              getSelectorHint(a.element) + ' overlaps ' +
              getSelectorHint(b.element) + ' by ' +
              Math.round(overlap.area) + 'px' + String.fromCharCode(178) + '.',
            details:
              'Two non-nested visible elements occupy overlapping screen space. ' +
              'This can obscure content or create confusing click targets.',
            selector: getSelectorHint(a.element) + ' / ' + getSelectorHint(b.element),
            tags: ['overlap', 'layout'],
            wcagCriteria: [],
            evidence: {
              elementA: getSelectorHint(a.element),
              elementB: getSelectorHint(b.element),
              overlapArea: Math.round(overlap.area),
              overlapRect: overlap,
              rectA: a.rect,
              rectB: b.rect,
            },
          }));
        }
      }
    };

    // -----------------------------------------------------------------------
    // 2. Vertical Misalignment in Flex/Grid Containers (DES-SPAC-01)
    // -----------------------------------------------------------------------
    var checkVerticalMisalignment = function () {
      var containers = document.querySelectorAll('*');
      var checked = 0;

      for (var i = 0; i < containers.length && checked < settings.maxElements; i++) {
        var container = containers[i];
        if (!getFlexCenteringIntent(container)) continue;
        if (!isVisible(container)) continue;
        if (matchesIgnoredSelector(container)) continue;
        checked++;

        var containerRect = getRenderedBox(container);
        var containerCenterY = containerRect.top + containerRect.height / 2;
        var children = container.children;

        for (var c = 0; c < children.length; c++) {
          var child = children[c];
          if (!isVisible(child)) continue;

          var childRect = getRenderedBox(child);
          var childCenterY = childRect.top + childRect.height / 2;
          var offset = Math.abs(containerCenterY - childCenterY);

          if (offset <= settings.misalignMediumPx) continue;

          var severity = offset > settings.misalignHighPx ? 'high' : 'medium';

          pushIssue(createIssue({
            ruleId: 'vertical-misalignment',
            severity: severity,
            title: 'Vertical misalignment in centered container',
            summary:
              getSelectorHint(child) + ' is ' + Math.round(offset) +
              'px off-center within ' + getSelectorHint(container) + '.',
            details:
              'This element is not vertically centered despite its container ' +
              'declaring align-items:center. This can happen due to overflow, ' +
              'margin collapse, or mismatched intrinsic sizing.',
            selector: getSelectorHint(child),
            tags: ['alignment', 'layout', 'flex'],
            wcagCriteria: [],
            evidence: {
              container: getSelectorHint(container),
              child: getSelectorHint(child),
              containerCenterY: containerCenterY,
              childCenterY: childCenterY,
              offsetPx: Math.round(offset),
            },
          }));
        }
      }
    };

    // -----------------------------------------------------------------------
    // 3. Child Vertical Misalignment within Interactive Elements (DES-SPAC-01)
    // -----------------------------------------------------------------------
    var checkChildVerticalMisalignment = function () {
      var interactiveEls = document.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), [role="button"]'
      );

      for (var i = 0; i < interactiveEls.length && i < settings.maxElements; i++) {
        var parent = interactiveEls[i];
        if (!isVisible(parent)) continue;
        if (matchesIgnoredSelector(parent)) continue;
        if (!getFlexCenteringIntent(parent)) continue;

        var parentRect = getRenderedBox(parent);
        var parentCenterY = parentRect.top + parentRect.height / 2;
        var visibleChildren = parent.querySelectorAll('span, svg, kbd, img, i');

        for (var c = 0; c < visibleChildren.length; c++) {
          var child = visibleChildren[c];
          // Only check direct children or one level deep to avoid deep SVG internals
          if (child.parentElement !== parent && child.parentElement.parentElement !== parent) continue;
          if (!isVisible(child)) continue;

          var childRect = getRenderedBox(child);
          var childCenterY = childRect.top + childRect.height / 2;
          var offset = Math.abs(parentCenterY - childCenterY);

          if (offset <= settings.childMisalignLowPx) continue;

          var severity = offset > settings.childMisalignMediumPx ? 'medium' : 'low';

          pushIssue(createIssue({
            ruleId: 'child-vertical-misalignment',
            severity: severity,
            title: 'Child element not centered in interactive parent',
            summary:
              getSelectorHint(child) + ' is ' + Math.round(offset) +
              'px off-center within ' + getSelectorHint(parent) + '.',
            details:
              'A visible child (icon, text span, kbd) inside a flex-centered ' +
              'interactive element is not vertically centered. This creates ' +
              'a visual misalignment that undermines polish.',
            selector: getSelectorHint(child),
            tags: ['alignment', 'layout', 'icon'],
            wcagCriteria: [],
            evidence: {
              parent: getSelectorHint(parent),
              child: getSelectorHint(child),
              parentCenterY: parentCenterY,
              childCenterY: childCenterY,
              offsetPx: Math.round(offset),
            },
          }));
        }
      }
    };

    // -----------------------------------------------------------------------
    // 4. Boundary Proximity (DES-SPAC-02)
    // -----------------------------------------------------------------------
    var checkBoundaryProximity = function () {
      var containerSelector =
        'nav, header, section, footer, aside, ' +
        '[role="navigation"], [role="banner"], [role="main"], [role="contentinfo"]';

      var meaningfulContainers = document.querySelectorAll(containerSelector);
      // Also include divs with min-height or significant padding
      var allDivs = document.querySelectorAll('div');
      var extraContainers = [];
      for (var d = 0; d < allDivs.length && extraContainers.length < 100; d++) {
        var divStyle = getComputedStyle(allDivs[d]);
        var hasPadding = parseFloat(divStyle.paddingTop) >= 8 ||
          parseFloat(divStyle.paddingBottom) >= 8;
        var hasMinHeight = divStyle.minHeight !== 'auto' && divStyle.minHeight !== '0px';
        if (hasPadding || hasMinHeight) {
          extraContainers.push(allDivs[d]);
        }
      }

      var containers = Array.from(meaningfulContainers).concat(extraContainers);

      // Build a set for quick container lookup
      var containerSet = [];
      for (var ci = 0; ci < containers.length; ci++) {
        if (!isVisible(containers[ci])) continue;
        containerSet.push({
          element: containers[ci],
          rect: getRenderedBox(containers[ci]),
        });
      }

      // For each interactive element, find nearest meaningful container
      var interactiveEls = document.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), select, textarea, ' +
        '[role="button"], [role="link"]'
      );

      for (var i = 0; i < interactiveEls.length && i < settings.maxElements; i++) {
        var el = interactiveEls[i];
        if (!isVisible(el)) continue;
        if (matchesIgnoredSelector(el)) continue;
        var elRect = getRenderedBox(el);

        // Find nearest ancestor container from our set
        var nearestContainer = null;
        var nearestContainerRect = null;
        for (var ci = 0; ci < containerSet.length; ci++) {
          if (containerSet[ci].element.contains(el) && containerSet[ci].element !== el) {
            // Pick the tightest (smallest area) container
            if (!nearestContainer ||
                (containerSet[ci].rect.width * containerSet[ci].rect.height <
                 nearestContainerRect.width * nearestContainerRect.height)) {
              nearestContainer = containerSet[ci].element;
              nearestContainerRect = containerSet[ci].rect;
            }
          }
        }

        if (!nearestContainer || !nearestContainerRect) continue;

        // Compute distance to each edge
        var distances = {
          top: elRect.top - nearestContainerRect.top,
          right: nearestContainerRect.right - elRect.right,
          bottom: nearestContainerRect.bottom - elRect.bottom,
          left: elRect.left - nearestContainerRect.left,
        };

        var edges = Object.keys(distances);
        for (var e = 0; e < edges.length; e++) {
          var edge = edges[e];
          var dist = distances[edge];
          if (dist >= 0 && dist < settings.boundaryProximityPx) {
            pushIssue(createIssue({
              ruleId: 'boundary-proximity',
              severity: 'medium',
              title: 'Element too close to container boundary',
              summary:
                getSelectorHint(el) + ' is only ' + Math.round(dist) +
                'px from the ' + edge + ' edge of ' +
                getSelectorHint(nearestContainer) + '.',
              details:
                'Interactive elements that nearly touch their container boundary ' +
                'create visual tension and may feel cramped. Consider adding ' +
                'padding or adjusting spacing.',
              selector: getSelectorHint(el),
              tags: ['spacing', 'layout', 'boundary'],
              wcagCriteria: [],
              evidence: {
                element: getSelectorHint(el),
                container: getSelectorHint(nearestContainer),
                edge: edge,
                distancePx: Math.round(dist),
                elementRect: elRect,
                containerRect: nearestContainerRect,
              },
            }));
            // Only report the closest edge per element to reduce noise
            break;
          }
        }
      }
    };

    // -----------------------------------------------------------------------
    // 5. Excessive Padding (DES-CONS-02)
    // -----------------------------------------------------------------------
    var checkExcessivePadding = function () {
      var flexGridContainers = document.querySelectorAll('*');
      var checked = 0;

      for (var i = 0; i < flexGridContainers.length && checked < settings.maxElements; i++) {
        var container = flexGridContainers[i];
        var containerStyle = getComputedStyle(container);
        var display = containerStyle.display;
        if (display !== 'flex' && display !== 'inline-flex' && display !== 'grid' && display !== 'inline-grid') continue;
        if (!isVisible(container)) continue;
        if (matchesIgnoredSelector(container)) continue;

        var children = container.children;
        if (children.length < 2) continue;
        checked++;

        // Collect padding values for all children
        var sides = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
        var childPaddings = [];

        for (var c = 0; c < children.length; c++) {
          if (!isVisible(children[c])) continue;
          var childStyle = getComputedStyle(children[c]);
          var paddings = {};
          for (var s = 0; s < sides.length; s++) {
            paddings[sides[s]] = parseFloat(childStyle[sides[s]]) || 0;
          }
          paddings.element = children[c];
          childPaddings.push(paddings);
        }

        if (childPaddings.length < 2) continue;

        // Compute median for each side
        for (var s = 0; s < sides.length; s++) {
          var side = sides[s];
          var values = [];
          for (var cp = 0; cp < childPaddings.length; cp++) {
            values.push(childPaddings[cp][side]);
          }
          values.sort(function (a, b) { return a - b; });
          var medianIndex = Math.floor(values.length / 2);
          var median = values.length % 2 === 0
            ? (values[medianIndex - 1] + values[medianIndex]) / 2
            : values[medianIndex];

          if (median < 1) continue; // Skip if median is near-zero

          // Flag children that exceed threshold
          for (var cp = 0; cp < childPaddings.length; cp++) {
            var val = childPaddings[cp][side];
            if (val > median * settings.excessivePaddingRatio && val > settings.excessivePaddingMinPx) {
              var el = childPaddings[cp].element;
              pushIssue(createIssue({
                ruleId: 'excessive-padding',
                severity: 'low',
                title: 'Excessive padding compared to siblings',
                summary:
                  getSelectorHint(el) + ' has ' + Math.round(val) +
                  'px ' + side.replace('padding', '').toLowerCase() +
                  ' padding (median sibling: ' + Math.round(median) + 'px).',
                details:
                  'This element has disproportionate padding compared to its ' +
                  'siblings in the same flex/grid container, which can create ' +
                  'uneven visual rhythm.',
                selector: getSelectorHint(el),
                tags: ['spacing', 'consistency', 'padding'],
                wcagCriteria: [],
                evidence: {
                  element: getSelectorHint(el),
                  container: getSelectorHint(container),
                  side: side,
                  valuePx: Math.round(val),
                  medianPx: Math.round(median),
                  ratio: Number((val / median).toFixed(2)),
                },
              }));
            }
          }
        }
      }
    };

    // -----------------------------------------------------------------------
    // 6. Element Offset Asymmetry (DES-SPAC-03)
    // -----------------------------------------------------------------------
    var isAsymmetryExempt = function (element) {
      var style = getComputedStyle(element);
      var position = style.position;
      if (position === 'absolute' || position === 'fixed' || position === 'sticky') return true;
      var node = element;
      while (node && node !== document.body) {
        var role = node.getAttribute('role');
        if (role && EXEMPT_ROLES[role]) return true;
        if (node.className && typeof node.className === 'string' && EXEMPT_CLASS_PATTERNS.test(node.className)) return true;
        node = node.parentElement;
      }
      return false;
    };

    var parentRedistributesSpace = function (parent) {
      var parentStyle = getComputedStyle(parent);
      var display = parentStyle.display;
      var isFlex = display === 'flex' || display === 'inline-flex';
      var isGrid = display === 'grid' || display === 'inline-grid';
      if (!isFlex && !isGrid) return false;
      var justify = parentStyle.justifyContent;
      return !!JUSTIFY_REDISTRIBUTES[justify];
    };

    var isAsymmetric = function (left, right) {
      var delta = Math.abs(left - right);
      if (delta < ASYMMETRY_MIN_DELTA_PX) return false;
      var maxVal = Math.max(left, right);
      var minVal = Math.min(left, right);
      var ratio = maxVal / (minVal + 1);
      return ratio >= ASYMMETRY_MIN_RATIO;
    };

    var checkElementOffsetAsymmetry = function () {
      var candidates = document.querySelectorAll('*');
      var checked = 0;

      for (var i = 0; i < candidates.length && checked < settings.maxElements; i++) {
        var element = candidates[i];
        var parent = element.parentElement;
        if (!parent) continue;
        var parentTag = parent.tagName;
        if (parentTag === 'HTML' || parentTag === 'BODY') continue;
        if (!isVisible(element)) continue;
        if (matchesIgnoredSelector(element)) continue;
        if (isAsymmetryExempt(element)) continue;
        if (parentRedistributesSpace(parent)) continue;
        checked++;

        var elStyle = getComputedStyle(element);
        var parentStyle = getComputedStyle(parent);
        var elRect = getRenderedBox(element);
        var parentRect = getRenderedBox(parent);

        var parentPadLeft  = parseFloat(parentStyle.paddingLeft)  || 0;
        var parentPadRight = parseFloat(parentStyle.paddingRight) || 0;
        var parentContentLeft  = parentRect.left + parentPadLeft;
        var parentContentRight = parentRect.right - parentPadRight;
        var gapLeft  = elRect.left - parentContentLeft;
        var gapRight = parentContentRight - elRect.right;

        var marginLeft  = parseFloat(elStyle.marginLeft)  || 0;
        var marginRight = parseFloat(elStyle.marginRight) || 0;
        var paddingLeft  = parseFloat(elStyle.paddingLeft)  || 0;
        var paddingRight = parseFloat(elStyle.paddingRight) || 0;

        var findings = [];
        if (gapLeft >= 0 && gapRight >= 0 && isAsymmetric(gapLeft, gapRight)) {
          findings.push({
            kind:  'gap',
            left:  gapLeft,
            right: gapRight,
          });
        }
        if (isAsymmetric(marginLeft, marginRight)) {
          findings.push({
            kind:  'margin',
            left:  marginLeft,
            right: marginRight,
          });
        }
        if (isAsymmetric(paddingLeft, paddingRight)) {
          findings.push({
            kind:  'padding',
            left:  paddingLeft,
            right: paddingRight,
          });
        }

        for (var f = 0; f < findings.length; f++) {
          var finding = findings[f];
          var delta = Math.abs(finding.left - finding.right);
          var ratio = Math.max(finding.left, finding.right) / (Math.min(finding.left, finding.right) + 1);
          pushIssue(createIssue({
            ruleId:   'element-offset-asymmetry',
            severity: 'medium',
            title:    'Asymmetric horizontal ' + finding.kind + ' on element',
            summary:
              getSelectorHint(element) + ' has asymmetric ' + finding.kind +
              ' (left=' + Math.round(finding.left) + 'px, right=' +
              Math.round(finding.right) + 'px) within ' + getSelectorHint(parent) + '.',
            details:
              'Left/right ' + finding.kind + ' differ by ' + Math.round(delta) +
              'px (ratio ' + ratio.toFixed(2) + '), which reads as a layout bug ' +
              'and disrupts horizontal rhythm. Prefer symmetric margin-inline / ' +
              'padding-inline or parent-driven centering unless the asymmetry is intentional.',
            selector:     getSelectorHint(element),
            tags:         ['spacing', 'asymmetry', 'layout'],
            wcagCriteria: [],
            evidence: {
              element:       getSelectorHint(element),
              parent:        getSelectorHint(parent),
              kind:          finding.kind,
              leftPx:        Math.round(finding.left),
              rightPx:       Math.round(finding.right),
              deltaPx:       Math.round(delta),
              ratio:         Number(ratio.toFixed(2)),
              elementRect:   elRect,
              parentRect:    parentRect,
            },
          }));
        }
      }
    };

    // -----------------------------------------------------------------------
    // Run all checks
    // -----------------------------------------------------------------------
    checkElementOverlap();
    checkVerticalMisalignment();
    checkChildVerticalMisalignment();
    checkBoundaryProximity();
    checkExcessivePadding();
    checkElementOffsetAsymmetry();

    // -----------------------------------------------------------------------
    // Build report
    // -----------------------------------------------------------------------
    var report = {
      auditId: 'spatial-layout',
      label: 'Spatial Layout',
      issueCount: issues.length,
      issues: issues,
      manualReview: manualReview,
      stats: {
        url: window.location.href,
        title: document.title,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        auditableElementCount: auditableElements.length,
        issueBreakdown: {
          overlap: issues.filter(function (i) { return i.ruleId === 'element-overlap'; }).length,
          verticalMisalignment: issues.filter(function (i) { return i.ruleId === 'vertical-misalignment'; }).length,
          childVerticalMisalignment: issues.filter(function (i) { return i.ruleId === 'child-vertical-misalignment'; }).length,
          boundaryProximity: issues.filter(function (i) { return i.ruleId === 'boundary-proximity'; }).length,
          excessivePadding: issues.filter(function (i) { return i.ruleId === 'excessive-padding'; }).length,
          elementOffsetAsymmetry: issues.filter(function (i) { return i.ruleId === 'element-offset-asymmetry'; }).length,
        },
      },
    };

    return report;
  };
})();
