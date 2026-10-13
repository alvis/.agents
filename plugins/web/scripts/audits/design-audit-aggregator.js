/**
 * Design Audit Aggregator — Unified Orchestrator and Scoring Module
 *
 * Injected AFTER all 8 individual audit scripts are loaded.
 * Invokes each audit, collects results, deduplicates issues,
 * computes per-category and overall scores using diminishing-return
 * scoring, determines risk level, and returns a unified report.
 *
 * Contract version: 2.0
 *
 * Scoring algorithm:
 *   Each issue carries a severity weight (critical=22, high=14, medium=8,
 *   low=4, info=0). Within the same rule, repeated occurrences receive
 *   diminishing weight: effectiveWeight = baseWeight / (1 + i * 0.7)
 *   where i is the 0-indexed occurrence count. Per-severity penalties are
 *   further capped (critical<=24, high<=18, medium<=12, low<=6).
 *   The total penalty per category is capped at 45, giving a category
 *   score of max(0, round(100 - cappedPenalty)). The overall score is the
 *   mean of all tested category scores.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Severity constants
  // ---------------------------------------------------------------------------

  /** Base penalty weight per severity level. */
  var SEVERITY_WEIGHTS = { critical: 22, high: 14, medium: 8, low: 4, info: 0 };

  /** Maximum penalty any single rule may contribute, per severity. */
  var SEVERITY_CAPS = { critical: 24, high: 18, medium: 12, low: 6, info: 0 };

  /** Canonical severity ordering (most severe first). */
  var SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

  /**
   * Diminishing-return decay factor.
   * The i-th occurrence (0-indexed) of a rule contributes:
   *   baseWeight / (1 + i * DIMINISHING_FACTOR)
   */
  var DIMINISHING_FACTOR = 0.7;

  /** Hard cap on total penalty per category — prevents any single category
   *  from dragging the score below 55 by itself. */
  var MAX_PENALTY = 45;

  // ---------------------------------------------------------------------------
  // Category registry — maps category keys to window function names and labels
  // ---------------------------------------------------------------------------

  var CATEGORY_MAP = {
    text:        { fn: 'runWcagTextAudit',          label: 'Text & Readability' },
    structure:   { fn: 'runSemanticStructureAudit',  label: 'Semantic Structure' },
    interaction: { fn: 'runInteractionAudit',        label: 'Interaction & Feedback' },
    mobile:      { fn: 'runMobileLayoutAudit',       label: 'Mobile Layout' },
    visual:      { fn: 'runVisualLayoutAudit',       label: 'Visual Composition' },
    tokens:      { fn: 'runDesignTokensAudit',       label: 'Design Tokens & Consistency' },
    typography:  { fn: 'runTypographyAudit',         label: 'Typography & Type Scale' },
    spatial:     { fn: 'runSpatialLayoutAudit',      label: 'Spatial Relationships' },
    css:         { fn: 'runUnusedCssAudit',           label: 'Unused & Redundant CSS' }
  };

  // ---------------------------------------------------------------------------
  // Utility helpers
  // ---------------------------------------------------------------------------

  /**
   * Normalise a severity string to a known value, defaulting to 'medium'.
   * @param {string} value - Raw severity string.
   * @returns {string} One of the canonical severity levels.
   */
  function normalizeSeverity(value) {
    return SEVERITY_ORDER.indexOf(value) !== -1 ? value : 'medium';
  }

  /**
   * Return the sort-rank of a severity (lower = more severe).
   * @param {string} value - Severity string.
   * @returns {number} 0 for critical through 4 for info.
   */
  function severityRank(value) {
    var index = SEVERITY_ORDER.indexOf(normalizeSeverity(value));
    return index !== -1 ? index : 2; // default to 'medium' rank
  }



  // ---------------------------------------------------------------------------
  // Scoring helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute the penalty contributed by repeated occurrences of a single rule
   * at a given severity. Uses diminishing returns so that a flood of identical
   * low-severity issues does not dominate the score.
   *
   * Formula per occurrence i (0-indexed):
   *   baseWeight / (1 + i * 0.7)
   *
   * The sum is capped at the severity-specific maximum (SEVERITY_CAPS).
   *
   * @param {string} severity - Normalised severity level.
   * @param {number} occurrences - Number of issues for this rule.
   * @returns {number} Total penalty for this rule.
   */
  function penaltyForOccurrences(severity, occurrences) {
    var normalised = normalizeSeverity(severity);
    var baseWeight = SEVERITY_WEIGHTS[normalised];
    var maxPenalty = SEVERITY_CAPS[normalised];
    var penalty = 0;

    for (var i = 0; i < occurrences; i++) {
      penalty += baseWeight / (1 + i * DIMINISHING_FACTOR);
    }

    return Math.min(maxPenalty, penalty);
  }

  /**
   * Compute a 0–100 score for a set of issues belonging to one category.
   *
   * Steps:
   *  1. Group issues by ruleId.
   *  2. For each rule, track the highest severity and occurrence count.
   *  3. Apply diminishing-return penalty per rule.
   *  4. Sum all rule penalties, cap at MAX_PENALTY (45).
   *  5. Score = max(0, round(100 - cappedPenalty)).
   *
   * @param {Array} issues - Issues for a single category.
   * @returns {number} Integer score 0–100.
   */
  function computeCategoryScore(issues) {
    if (!issues || issues.length === 0) return 100;

    // Group by ruleId, tracking occurrences and worst severity
    var ruleMap = {};
    for (var i = 0; i < issues.length; i++) {
      var issue = issues[i];
      var ruleId = issue.ruleId || 'unknown-rule';

      if (!ruleMap[ruleId]) {
        ruleMap[ruleId] = {
          occurrences: 0,
          severity: normalizeSeverity(issue.severity)
        };
      }

      ruleMap[ruleId].occurrences += 1;

      // Promote to higher severity if this issue is worse
      if (severityRank(issue.severity) < severityRank(ruleMap[ruleId].severity)) {
        ruleMap[ruleId].severity = normalizeSeverity(issue.severity);
      }
    }

    // Sum penalties across all rules
    var totalPenalty = 0;
    var ruleIds = Object.keys(ruleMap);
    for (var j = 0; j < ruleIds.length; j++) {
      var entry = ruleMap[ruleIds[j]];
      totalPenalty += penaltyForOccurrences(entry.severity, entry.occurrences);
    }

    // Cap and convert to score
    var cappedPenalty = Math.min(MAX_PENALTY, totalPenalty);
    return Math.max(0, Math.round(100 - cappedPenalty));
  }

  /**
   * Compute the overall score as the mean of all tested category scores.
   * Categories that were tested but had no issues score 100.
   *
   * @param {Object<string, number>} categoryScores - Map of category key to score.
   * @returns {number} Integer score 0–100.
   */
  function computeOverallScore(categoryScores) {
    var keys = Object.keys(categoryScores);
    if (keys.length === 0) return 100;

    var sum = 0;
    for (var i = 0; i < keys.length; i++) {
      sum += categoryScores[keys[i]];
    }
    return Math.round(sum / keys.length);
  }

  /**
   * Determine the aggregate risk level from severity counts.
   *
   * Thresholds:
   *   CRITICAL — at least 1 critical issue OR at least 4 high issues
   *   HIGH     — at least 1 high issue OR at least 6 medium issues
   *   MEDIUM   — at least 1 medium issue OR at least 4 low issues
   *   LOW      — everything else
   *
   * @param {Object<string, number>} severityCounts - e.g. { critical: 1, high: 3 }
   * @returns {string} 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
   */
  function determineRisk(severityCounts) {
    var critical = severityCounts.critical || 0;
    var high = severityCounts.high || 0;
    var medium = severityCounts.medium || 0;
    var low = severityCounts.low || 0;

    if (critical >= 1 || high >= 4) return 'CRITICAL';
    if (high >= 1 || medium >= 6) return 'HIGH';
    if (medium >= 1 || low >= 4) return 'MEDIUM';
    return 'LOW';
  }

  // ---------------------------------------------------------------------------
  // Deduplication
  // ---------------------------------------------------------------------------

  /**
   * Deduplicate issues across all categories.
   *
   * Key = [viewport, ruleId, selector, summary] joined with '::'.
   * When a duplicate is found, keep the one with higher severity.
   * Track the duplicate count in the kept issue's evidence.duplicateCount.
   *
   * @param {Array} allIssues - Flat list of all issues.
   * @param {string} viewport - Viewport label for key construction.
   * @returns {Array} Deduplicated issues.
   */
  function deduplicateIssues(allIssues, viewport) {
    var keyMap = {};   // key -> { issue, count }
    var order = [];    // preserve insertion order of first-seen keys

    for (var i = 0; i < allIssues.length; i++) {
      var issue = allIssues[i];
      var key = [
        viewport || 'default',
        issue.ruleId || 'unknown-rule',
        issue.selector || '',
        issue.summary || issue.details || ''
      ].join('::');

      if (!keyMap[key]) {
        keyMap[key] = { issue: issue, count: 1 };
        order.push(key);
      } else {
        keyMap[key].count += 1;
        // Keep the issue with higher severity (lower rank)
        if (severityRank(issue.severity) < severityRank(keyMap[key].issue.severity)) {
          var prevCount = keyMap[key].count;
          keyMap[key].issue = issue;
          keyMap[key].count = prevCount;
        }
      }
    }

    var deduped = [];
    for (var j = 0; j < order.length; j++) {
      var entry = keyMap[order[j]];
      var dedupedIssue = entry.issue;

      // Attach duplicate count into evidence for traceability
      if (entry.count > 1) {
        if (!dedupedIssue.evidence) {
          dedupedIssue.evidence = {};
        }
        dedupedIssue.evidence.duplicateCount = entry.count;
      }

      deduped.push(dedupedIssue);
    }

    return deduped;
  }

  // ---------------------------------------------------------------------------
  // Issue sorting
  // ---------------------------------------------------------------------------

  /**
   * Sort issues by severity (critical first), then by category alphabetically.
   *
   * @param {Array} issues
   * @returns {Array} New sorted array.
   */
  function sortIssues(issues) {
    return issues.slice().sort(function (a, b) {
      var sevDiff = severityRank(a.severity) - severityRank(b.severity);
      if (sevDiff !== 0) return sevDiff;

      var catA = (a.category || '').toLowerCase();
      var catB = (b.category || '').toLowerCase();
      if (catA < catB) return -1;
      if (catA > catB) return 1;
      return 0;
    });
  }

  // ---------------------------------------------------------------------------
  // Top-severity helper
  // ---------------------------------------------------------------------------

  /**
   * Return the highest severity found in a set of issues.
   * @param {Array} issues
   * @returns {string|null} Highest severity or null if no issues.
   */
  function topSeverity(issues) {
    if (!issues || issues.length === 0) return null;

    var best = 'info';
    for (var i = 0; i < issues.length; i++) {
      var sev = normalizeSeverity(issues[i].severity);
      if (severityRank(sev) < severityRank(best)) {
        best = sev;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Main aggregator
  // ---------------------------------------------------------------------------

  /**
   * Run all requested design audits and produce a unified, scored report.
   *
   * @param {Object} [options]
   * @param {boolean}  [options.quiet=true]          Suppress console output.
   * @param {string[]} [options.categories]           Audit categories to run (default: all available).
   * @param {Object}   [options.selectors]            Passed through to individual audits.
   * @param {string[]} [options.exclude]              Passed through to individual audits.
   * @param {string}   [options.viewport='desktop']   Current viewport type.
   * @param {string}   [options.viewportLabel]        Human label like "Desktop 1440x900".
   * @returns {Object} Unified audit report (see contract version 2.0).
   */
  window.runDesignAudit = function (options) {
    options = options || {};

    var requestedCategories = options.categories || Object.keys(CATEGORY_MAP);
    var viewportType = options.viewport || 'desktop';
    var viewportLabel = options.viewportLabel || 'Unknown';

    // Results accumulators
    var categoryResults = {};      // categoryKey -> audit result object
    var categoryScores = {};       // categoryKey -> numeric score
    var allRawIssues = [];         // all issues before dedup
    var allManualReview = [];      // aggregated manual review entries
    var skippedCategories = [];    // categories requested but function missing
    var warnings = [];             // non-fatal warnings

    // -----------------------------------------------------------------------
    // Run each requested audit
    // -----------------------------------------------------------------------
    for (var i = 0; i < requestedCategories.length; i++) {
      var catKey = requestedCategories[i];
      var catDef = CATEGORY_MAP[catKey];

      // Unknown category key
      if (!catDef) {
        warnings.push('Unknown category "' + catKey + '" — skipped.');
        skippedCategories.push(catKey);
        continue;
      }

      var fnName = catDef.fn;
      var auditFn = window[fnName];

      // Function not loaded
      if (typeof auditFn !== 'function') {
        skippedCategories.push(catKey);
        warnings.push(
          'Audit function window.' + fnName + ' not found for category "' + catKey + '" — skipped.'
        );
        continue;
      }

      // Build options to pass through to individual audit
      var auditOptions = { quiet: true };
      if (options.selectors) {
        auditOptions.selectors = options.selectors;
      }
      if (options.exclude) {
        auditOptions.exclude = options.exclude;
      }

      // Execute the audit with error handling
      var result;
      try {
        result = auditFn(auditOptions);
      } catch (err) {
        warnings.push(
          'Audit function window.' + fnName + ' threw an error: ' +
          (err && err.message ? err.message : String(err)) + ' — skipped.'
        );
        skippedCategories.push(catKey);
        continue;
      }

      // Normalise the result to a standard shape
      if (!result || typeof result !== 'object') {
        warnings.push(
          'Audit function window.' + fnName + ' returned a non-object value — skipped.'
        );
        skippedCategories.push(catKey);
        continue;
      }

      var issues = Array.isArray(result.issues) ? result.issues : [];
      var manualReview = [];

      // Collect manual review entries from result or nested stats
      if (Array.isArray(result.manualReview)) {
        manualReview = result.manualReview;
      } else if (result.stats && Array.isArray(result.stats.manualReview)) {
        manualReview = result.stats.manualReview;
      }

      // Ensure every issue has the category field set
      for (var k = 0; k < issues.length; k++) {
        if (!issues[k].category) {
          issues[k].category = catKey;
        }
      }

      // Compute per-category score
      var score = computeCategoryScore(issues);
      categoryScores[catKey] = score;

      // Store full result
      categoryResults[catKey] = {
        auditId: result.auditId || catKey,
        label: catDef.label,
        score: score,
        issues: issues,
        manualReview: manualReview,
        stats: result.stats || {}
      };

      // Accumulate for dedup and aggregation
      allRawIssues = allRawIssues.concat(issues);
      allManualReview = allManualReview.concat(manualReview);
    }

    // -----------------------------------------------------------------------
    // Deduplicate all issues
    // -----------------------------------------------------------------------
    var totalBeforeDedup = allRawIssues.length;
    var dedupedIssues = deduplicateIssues(allRawIssues, viewportType);
    var sortedIssues = sortIssues(dedupedIssues);

    // -----------------------------------------------------------------------
    // Compute severity counts from deduplicated issues
    // -----------------------------------------------------------------------
    var severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (var m = 0; m < sortedIssues.length; m++) {
      var sev = normalizeSeverity(sortedIssues[m].severity);
      severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    }

    // -----------------------------------------------------------------------
    // Compute overall score and risk
    // -----------------------------------------------------------------------
    var overallScore = computeOverallScore(categoryScores);
    var risk = determineRisk(severityCounts);

    // -----------------------------------------------------------------------
    // Build per-category summary
    // -----------------------------------------------------------------------
    var byCategory = {};
    var testedKeys = Object.keys(categoryResults);
    for (var n = 0; n < testedKeys.length; n++) {
      var ck = testedKeys[n];
      var cr = categoryResults[ck];
      byCategory[ck] = {
        score: cr.score,
        issueCount: cr.issues.length,
        topSeverity: topSeverity(cr.issues)
      };
    }

    // -----------------------------------------------------------------------
    // Assemble unified report
    // -----------------------------------------------------------------------
    return {
      contractVersion: '2.0',
      timestamp: new Date().toISOString(),
      viewport: {
        label: viewportLabel,
        width: window.innerWidth,
        height: window.innerHeight
      },
      summary: {
        overallScore: overallScore,
        risk: risk,
        totalIssues: totalBeforeDedup,
        totalDeduplicated: sortedIssues.length,
        bySeverity: severityCounts,
        byCategory: byCategory
      },
      categories: categoryResults,
      allIssues: sortedIssues,
      manualReview: allManualReview,
      skippedCategories: skippedCategories,
      warnings: warnings
    };
  };
})();
