/**
 * Filing Tracker - Tax filing status management
 * Agent: Mila (Finance Principal)
 *
 * In-memory store (Map) that tracks the lifecycle of every tax filing
 * from draft through acknowledged status.
 */

'use strict';

// ---------------------------------------------------------------------------
// Valid status transitions
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['draft', 'in_review', 'approved', 'filed', 'acknowledged'];

const VALID_TRANSITIONS = {
  draft: ['in_review'],
  in_review: ['approved', 'draft'], // can reject back to draft
  approved: ['filed'],
  filed: ['acknowledged'],
  acknowledged: [], // terminal state
};

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const filings = new Map();
let _idCounter = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _generateId() {
  _idCounter += 1;
  const ts = Date.now().toString(36);
  return `FIL-${ts}-${String(_idCounter).padStart(4, '0')}`;
}

function _isOverdue(filing) {
  if (filing.status === 'filed' || filing.status === 'acknowledged') return false;
  if (!filing.dueDate) return false;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(filing.dueDate);
  due.setHours(0, 0, 0, 0);

  return due < now;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Create a new filing record.
 *
 * @param {string} form - Form name (e.g. 'Form 1065', 'SA800')
 * @param {string} jurisdiction - Country/jurisdiction code
 * @param {number} taxYear - Tax year the filing covers
 * @param {string} fundId - Identifier for the fund
 * @param {object} [options] - Optional fields
 *   { dueDate, preparer, reviewer, notes }
 * @returns {object} The created filing record
 */
function createFiling(form, jurisdiction, taxYear, fundId, options = {}) {
  const id = _generateId();
  const now = new Date().toISOString();

  const filing = {
    id,
    form,
    jurisdiction,
    taxYear,
    fundId,
    status: 'draft',
    dueDate: options.dueDate || null,
    preparer: options.preparer || null,
    reviewer: options.reviewer || null,
    notes: options.notes || '',
    statusHistory: [
      {
        status: 'draft',
        timestamp: now,
        notes: 'Filing created',
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  filings.set(id, filing);
  return { ...filing };
}

/**
 * Update the status of an existing filing.
 *
 * @param {string} filingId
 * @param {string} status - New status (must be a valid transition)
 * @param {string} [notes] - Optional notes for the status change
 * @returns {object} The updated filing record
 * @throws {Error} If filing not found or invalid transition
 */
function updateStatus(filingId, status, notes = '') {
  const filing = filings.get(filingId);
  if (!filing) {
    throw new Error(`Filing not found: ${filingId}`);
  }

  if (!VALID_STATUSES.includes(status)) {
    throw new Error(
      `Invalid status "${status}". Valid statuses: ${VALID_STATUSES.join(', ')}`
    );
  }

  const allowedTransitions = VALID_TRANSITIONS[filing.status];
  if (!allowedTransitions.includes(status)) {
    throw new Error(
      `Cannot transition from "${filing.status}" to "${status}". ` +
      `Allowed transitions: ${allowedTransitions.join(', ') || 'none (terminal state)'}`
    );
  }

  const now = new Date().toISOString();

  filing.status = status;
  filing.updatedAt = now;
  filing.statusHistory.push({
    status,
    timestamp: now,
    notes,
  });

  // Record filed date
  if (status === 'filed') {
    filing.filedDate = now;
  }
  if (status === 'acknowledged') {
    filing.acknowledgedDate = now;
  }

  filings.set(filingId, filing);
  return { ...filing };
}

/**
 * Retrieve filings matching the given filters.
 *
 * @param {object} [filters] - Optional filter criteria
 *   { form, jurisdiction, taxYear, fundId, status, overdue }
 * @returns {object[]} Matching filing records
 */
function getFilings(filters = {}) {
  const results = [];

  for (const filing of filings.values()) {
    let match = true;

    if (filters.form && filing.form !== filters.form) match = false;
    if (filters.jurisdiction && filing.jurisdiction !== filters.jurisdiction) match = false;
    if (filters.taxYear !== undefined && filing.taxYear !== filters.taxYear) match = false;
    if (filters.fundId && filing.fundId !== filters.fundId) match = false;
    if (filters.status && filing.status !== filters.status) match = false;
    if (filters.overdue === true && !_isOverdue(filing)) match = false;
    if (filters.overdue === false && _isOverdue(filing)) match = false;

    if (match) {
      results.push({ ...filing, overdue: _isOverdue(filing) });
    }
  }

  // Sort by due date ascending (null dates at end)
  results.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });

  return results;
}

/**
 * Get aggregate statistics across all filings.
 *
 * @param {object} [filters] - Optional filters to scope the stats
 *   { taxYear, fundId, jurisdiction }
 * @returns {object} { total, draft, inReview, approved, filed, acknowledged, overdue }
 */
function getStats(filters = {}) {
  const allFilings = getFilings(filters);

  const stats = {
    total: allFilings.length,
    draft: 0,
    inReview: 0,
    approved: 0,
    filed: 0,
    acknowledged: 0,
    overdue: 0,
  };

  for (const filing of allFilings) {
    switch (filing.status) {
      case 'draft':
        stats.draft += 1;
        break;
      case 'in_review':
        stats.inReview += 1;
        break;
      case 'approved':
        stats.approved += 1;
        break;
      case 'filed':
        stats.filed += 1;
        break;
      case 'acknowledged':
        stats.acknowledged += 1;
        break;
    }
    if (filing.overdue) {
      stats.overdue += 1;
    }
  }

  return stats;
}

/**
 * Clear all filings (useful for testing).
 */
function clearAll() {
  filings.clear();
  _idCounter = 0;
}

module.exports = {
  createFiling,
  updateStatus,
  getFilings,
  getStats,
  clearAll,
  VALID_STATUSES,
  VALID_TRANSITIONS,
};
