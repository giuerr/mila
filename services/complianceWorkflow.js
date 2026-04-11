/**
 * Compliance Workflow Automation Service
 * Transforms the compliance calendar into an actionable workflow engine:
 *   - Filing status tracking (NOT_STARTED → IN_PROGRESS → UNDER_REVIEW → FILED → CONFIRMED)
 *   - Automated email/notification reminders (30, 15, 7, 3, 1 day before deadline)
 *   - Assignee management & escalation chains
 *   - Overdue detection & CRITICAL alerts
 *   - Audit-ready status reports
 *   - Cross-jurisdiction filing coordination
 *   - Regulatory examiner preparation
 */

class ComplianceWorkflowService {

  constructor() {
    this.filings = new Map(); // In production, use DB
    this.escalationRules = {
      daysBeforeDeadline: [
        { days: 30, action: 'REMINDER',   severity: 'LOW',      channel: 'EMAIL',     target: 'ASSIGNEE' },
        { days: 15, action: 'REMINDER',   severity: 'MEDIUM',   channel: 'EMAIL',     target: 'ASSIGNEE' },
        { days: 7,  action: 'ESCALATION', severity: 'HIGH',     channel: 'EMAIL+SMS', target: 'ASSIGNEE+MANAGER' },
        { days: 3,  action: 'ESCALATION', severity: 'HIGH',     channel: 'EMAIL+SMS', target: 'ASSIGNEE+MANAGER+CCO' },
        { days: 1,  action: 'CRITICAL',   severity: 'CRITICAL', channel: 'EMAIL+SMS+CALL', target: 'ALL' },
        { days: 0,  action: 'OVERDUE',    severity: 'CRITICAL', channel: 'EMAIL+SMS+CALL', target: 'ALL+BOARD' }
      ]
    };
  }

  // ==================== FILING LIFECYCLE ====================

  /**
   * Create a filing task from compliance calendar entry
   */
  createFiling({ calendarEntry, fundId, assignee, reviewers }) {
    const filingId = `FIL-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    const filing = {
      filingId,
      fundId,
      name: calendarEntry.name,
      jurisdiction: calendarEntry.jurisdiction,
      deadline: calendarEntry.deadline,
      frequency: calendarEntry.frequency,
      year: calendarEntry.year,

      status: 'NOT_STARTED',
      assignee: assignee || null,
      reviewers: reviewers || [],
      priority: this._calculatePriority(calendarEntry.deadline),

      checklist: this._generateChecklist(calendarEntry),
      documents: [],
      comments: [],
      auditTrail: [{
        action: 'FILING_CREATED',
        timestamp: new Date().toISOString(),
        actor: 'SYSTEM',
        details: `Filing created for ${calendarEntry.name} — deadline ${calendarEntry.deadline}`
      }],

      reminders: this._generateReminderSchedule(calendarEntry.deadline),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      filedAt: null,
      confirmedAt: null
    };

    this.filings.set(filingId, filing);
    return filing;
  }

  /**
   * Update filing status with full audit trail
   */
  updateFilingStatus({ filingId, newStatus, actor, comment, attachments }) {
    const filing = this.filings.get(filingId);
    if (!filing) throw new Error(`Filing ${filingId} not found`);

    const validTransitions = {
      'NOT_STARTED':  ['IN_PROGRESS'],
      'IN_PROGRESS':  ['UNDER_REVIEW', 'NOT_STARTED'],
      'UNDER_REVIEW': ['FILED', 'IN_PROGRESS'],
      'FILED':        ['CONFIRMED', 'UNDER_REVIEW'],
      'CONFIRMED':    []
    };

    if (!validTransitions[filing.status]?.includes(newStatus)) {
      throw new Error(`Invalid status transition: ${filing.status} → ${newStatus}`);
    }

    const oldStatus = filing.status;
    filing.status = newStatus;
    filing.updatedAt = new Date().toISOString();
    filing.priority = this._calculatePriority(filing.deadline);

    if (newStatus === 'FILED') filing.filedAt = new Date().toISOString();
    if (newStatus === 'CONFIRMED') filing.confirmedAt = new Date().toISOString();

    filing.auditTrail.push({
      action: 'STATUS_CHANGE',
      timestamp: new Date().toISOString(),
      actor,
      details: `Status changed: ${oldStatus} → ${newStatus}`,
      comment: comment || null,
      attachments: attachments || []
    });

    if (comment) {
      filing.comments.push({ author: actor, text: comment, timestamp: new Date().toISOString(), status: newStatus });
    }

    if (attachments) {
      filing.documents.push(...attachments.map(a => ({ ...a, uploadedBy: actor, uploadedAt: new Date().toISOString() })));
    }

    this.filings.set(filingId, filing);
    return filing;
  }

  /**
   * Assign/reassign a filing
   */
  assignFiling({ filingId, assignee, actor }) {
    const filing = this.filings.get(filingId);
    if (!filing) throw new Error(`Filing ${filingId} not found`);

    const oldAssignee = filing.assignee;
    filing.assignee = assignee;
    filing.updatedAt = new Date().toISOString();

    filing.auditTrail.push({
      action: 'REASSIGNED',
      timestamp: new Date().toISOString(),
      actor,
      details: `Reassigned from ${oldAssignee || 'unassigned'} to ${assignee}`
    });

    this.filings.set(filingId, filing);
    return filing;
  }

  // ==================== REMINDER ENGINE ====================

  _generateReminderSchedule(deadline) {
    const deadlineDate = new Date(deadline);
    return this.escalationRules.daysBeforeDeadline.map(rule => {
      const reminderDate = new Date(deadlineDate);
      reminderDate.setDate(reminderDate.getDate() - rule.days);
      return {
        scheduledDate: reminderDate.toISOString().split('T')[0],
        daysBeforeDeadline: rule.days,
        action: rule.action,
        severity: rule.severity,
        channel: rule.channel,
        target: rule.target,
        sent: false,
        sentAt: null
      };
    }).filter(r => new Date(r.scheduledDate) >= new Date()); // Only future reminders
  }

  /**
   * Get all pending reminders that should fire today
   */
  getPendingReminders() {
    const today = new Date().toISOString().split('T')[0];
    const pending = [];

    for (const filing of this.filings.values()) {
      if (filing.status === 'FILED' || filing.status === 'CONFIRMED') continue;

      for (const reminder of filing.reminders) {
        if (reminder.scheduledDate <= today && !reminder.sent) {
          pending.push({
            filingId: filing.filingId,
            filingName: filing.name,
            jurisdiction: filing.jurisdiction,
            deadline: filing.deadline,
            assignee: filing.assignee,
            ...reminder
          });
        }
      }

      // Check if overdue
      if (new Date(filing.deadline) < new Date()) {
        const daysOverdue = Math.floor((new Date() - new Date(filing.deadline)) / (1000 * 60 * 60 * 24));
        pending.push({
          filingId: filing.filingId,
          filingName: filing.name,
          jurisdiction: filing.jurisdiction,
          deadline: filing.deadline,
          assignee: filing.assignee,
          action: 'OVERDUE',
          severity: 'CRITICAL',
          channel: 'EMAIL+SMS+CALL',
          target: 'ALL+BOARD',
          daysOverdue,
          message: `OVERDUE: ${filing.name} was due ${daysOverdue} days ago`
        });
      }
    }

    return pending.sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (order[a.severity] || 99) - (order[b.severity] || 99);
    });
  }

  /**
   * Mark reminder as sent
   */
  markReminderSent({ filingId, scheduledDate }) {
    const filing = this.filings.get(filingId);
    if (!filing) return;

    const reminder = filing.reminders.find(r => r.scheduledDate === scheduledDate);
    if (reminder) {
      reminder.sent = true;
      reminder.sentAt = new Date().toISOString();
    }
    this.filings.set(filingId, filing);
  }

  // ==================== FILING CHECKLIST ====================

  _generateChecklist(calendarEntry) {
    const baseChecklist = [
      { id: 'gather_data', task: 'Gather required data and documents', status: 'PENDING', assignee: null },
      { id: 'prepare_filing', task: 'Prepare filing / report', status: 'PENDING', assignee: null },
      { id: 'internal_review', task: 'Internal review and quality check', status: 'PENDING', assignee: null },
      { id: 'compliance_review', task: 'Compliance officer review', status: 'PENDING', assignee: null },
      { id: 'submit_filing', task: 'Submit filing to regulator / authority', status: 'PENDING', assignee: null },
      { id: 'confirm_receipt', task: 'Confirm receipt / acknowledgement', status: 'PENDING', assignee: null },
      { id: 'archive', task: 'Archive filing and supporting documents', status: 'PENDING', assignee: null }
    ];

    // Add jurisdiction-specific checklist items
    const jurisdictionItems = {
      AIFMD: [
        { id: 'annex_iv', task: 'Complete AIFMD Annex IV XML template', status: 'PENDING' },
        { id: 'leverage_calc', task: 'Calculate leverage (commitment & gross methods)', status: 'PENDING' },
        { id: 'stress_test', task: 'Run stress test scenarios', status: 'PENDING' }
      ],
      CIMA: [
        { id: 'nav_calc', task: 'Calculate audited NAV', status: 'PENDING' },
        { id: 'aum_cert', task: 'Certify AUM & investor count', status: 'PENDING' }
      ],
      SEC: [
        { id: 'form_pf', task: 'Complete Form PF data fields', status: 'PENDING' },
        { id: 'edgar', task: 'Submit via EDGAR system', status: 'PENDING' }
      ],
      CRS_FATCA: [
        { id: 'identify_accounts', task: 'Identify reportable accounts', status: 'PENDING' },
        { id: 'xml_schema', task: 'Generate CRS/FATCA XML per OECD schema', status: 'PENDING' }
      ]
    };

    // Match filing name to additional items
    const name = calendarEntry.name.toUpperCase();
    if (name.includes('AIFMD')) baseChecklist.push(...(jurisdictionItems.AIFMD || []));
    if (name.includes('CIMA')) baseChecklist.push(...(jurisdictionItems.CIMA || []));
    if (name.includes('FORM PF') || name.includes('FORM 13F') || name.includes('ADV')) baseChecklist.push(...(jurisdictionItems.SEC || []));
    if (name.includes('CRS') || name.includes('FATCA')) baseChecklist.push(...(jurisdictionItems.CRS_FATCA || []));

    return baseChecklist;
  }

  /**
   * Update checklist item status
   */
  updateChecklistItem({ filingId, checklistItemId, status, actor }) {
    const filing = this.filings.get(filingId);
    if (!filing) throw new Error(`Filing ${filingId} not found`);

    const item = filing.checklist.find(c => c.id === checklistItemId);
    if (!item) throw new Error(`Checklist item ${checklistItemId} not found`);

    item.status = status; // PENDING, IN_PROGRESS, DONE
    item.completedBy = status === 'DONE' ? actor : null;
    item.completedAt = status === 'DONE' ? new Date().toISOString() : null;
    filing.updatedAt = new Date().toISOString();

    this.filings.set(filingId, filing);
    return filing;
  }

  // ==================== DASHBOARDS & REPORTS ====================

  /**
   * Compliance dashboard — all filings, status, alerts
   */
  getDashboard({ fundId, year }) {
    const filings = [...this.filings.values()]
      .filter(f => (!fundId || f.fundId === fundId) && (!year || f.year === year));

    const now = new Date();
    const statusCounts = { NOT_STARTED: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, FILED: 0, CONFIRMED: 0, OVERDUE: 0 };

    const overdue = [];
    const upcoming = [];

    for (const f of filings) {
      if (!['FILED', 'CONFIRMED'].includes(f.status) && new Date(f.deadline) < now) {
        statusCounts.OVERDUE++;
        overdue.push({
          filingId: f.filingId,
          name: f.name,
          jurisdiction: f.jurisdiction,
          deadline: f.deadline,
          daysOverdue: Math.floor((now - new Date(f.deadline)) / (1000 * 60 * 60 * 24)),
          assignee: f.assignee,
          status: f.status
        });
      } else {
        statusCounts[f.status]++;
        if (!['FILED', 'CONFIRMED'].includes(f.status)) {
          const daysUntil = Math.floor((new Date(f.deadline) - now) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 30) {
            upcoming.push({
              filingId: f.filingId,
              name: f.name,
              jurisdiction: f.jurisdiction,
              deadline: f.deadline,
              daysUntilDeadline: daysUntil,
              assignee: f.assignee,
              status: f.status,
              checklistProgress: this._checklistProgress(f.checklist)
            });
          }
        }
      }
    }

    const total = filings.length;
    const completed = statusCounts.FILED + statusCounts.CONFIRMED;

    return {
      year,
      totalFilings: total,
      statusBreakdown: statusCounts,
      completionRate: total > 0 ? parseFloat(((completed / total) * 100).toFixed(1)) + '%' : '0%',
      overdue: overdue.sort((a, b) => b.daysOverdue - a.daysOverdue),
      upcoming: upcoming.sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline),
      byJurisdiction: this._groupFilingsByField(filings, 'jurisdiction'),
      byStatus: statusCounts,
      pendingReminders: this.getPendingReminders().length,
      generatedAt: now.toISOString()
    };
  }

  /**
   * Audit-ready compliance report — for regulatory examinations
   */
  generateAuditReport({ fundId, year }) {
    const filings = [...this.filings.values()]
      .filter(f => f.fundId === fundId && f.year === year)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    return {
      title: 'Regulatory Filing Compliance Report',
      fund: fundId,
      year,
      generatedAt: new Date().toISOString(),
      generatedBy: 'Mila CFO Agent — Antoninus Global SPC',

      summary: {
        totalFilings: filings.length,
        filedOnTime: filings.filter(f => f.filedAt && new Date(f.filedAt) <= new Date(f.deadline)).length,
        filedLate: filings.filter(f => f.filedAt && new Date(f.filedAt) > new Date(f.deadline)).length,
        outstanding: filings.filter(f => !f.filedAt).length,
        onTimeRate: filings.filter(f => f.filedAt).length > 0
          ? parseFloat(((filings.filter(f => f.filedAt && new Date(f.filedAt) <= new Date(f.deadline)).length / filings.filter(f => f.filedAt).length) * 100).toFixed(1)) + '%'
          : 'N/A'
      },

      filings: filings.map(f => ({
        name: f.name,
        jurisdiction: f.jurisdiction,
        deadline: f.deadline,
        filedAt: f.filedAt,
        confirmedAt: f.confirmedAt,
        status: f.status,
        assignee: f.assignee,
        onTime: f.filedAt ? new Date(f.filedAt) <= new Date(f.deadline) : null,
        daysBeforeDeadline: f.filedAt ? Math.floor((new Date(f.deadline) - new Date(f.filedAt)) / (1000 * 60 * 60 * 24)) : null,
        documentsAttached: f.documents.length,
        auditTrailEntries: f.auditTrail.length,
        checklistCompletion: this._checklistProgress(f.checklist)
      })),

      auditTrail: filings.flatMap(f => f.auditTrail.map(a => ({ filing: f.name, ...a })))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    };
  }

  // ==================== HELPERS ====================

  _calculatePriority(deadline) {
    const days = Math.floor((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'OVERDUE';
    if (days <= 3) return 'CRITICAL';
    if (days <= 7) return 'HIGH';
    if (days <= 15) return 'MEDIUM';
    return 'LOW';
  }

  _checklistProgress(checklist) {
    if (!checklist || checklist.length === 0) return '0%';
    const done = checklist.filter(c => c.status === 'DONE').length;
    return parseFloat(((done / checklist.length) * 100).toFixed(0)) + '%';
  }

  _groupFilingsByField(filings, field) {
    const groups = {};
    for (const f of filings) {
      const key = f[field] || 'Other';
      if (!groups[key]) groups[key] = { total: 0, completed: 0, overdue: 0 };
      groups[key].total++;
      if (f.status === 'FILED' || f.status === 'CONFIRMED') groups[key].completed++;
      if (!['FILED', 'CONFIRMED'].includes(f.status) && new Date(f.deadline) < new Date()) groups[key].overdue++;
    }
    return groups;
  }
}

module.exports = new ComplianceWorkflowService();
