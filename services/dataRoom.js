/**
 * Data Room Management Service
 * Fundraising data rooms, ongoing investor portal content,
 * regulatory exam readiness, access management, activity analytics.
 */

class DataRoomService {

  /**
   * Generate fundraising data room structure
   */
  generateFundraisingStructure(fundDetails) {
    return {
      fundName: fundDetails.name,
      type: 'FUNDRAISING',
      createdAt: new Date().toISOString(),
      folders: [
        {
          name: '01 - Fund Overview',
          documents: [
            { name: 'Private Placement Memorandum (PPM)', status: 'REQUIRED', uploaded: false },
            { name: 'Executive Summary / Teaser', status: 'REQUIRED', uploaded: false },
            { name: 'Investor Presentation', status: 'REQUIRED', uploaded: false },
            { name: 'Fund Factsheet', status: 'RECOMMENDED', uploaded: false }
          ]
        },
        {
          name: '02 - Legal Documents',
          documents: [
            { name: 'Limited Partnership Agreement (LPA)', status: 'REQUIRED', uploaded: false },
            { name: 'Subscription Agreement', status: 'REQUIRED', uploaded: false },
            { name: 'Side Letter Template', status: 'REQUIRED', uploaded: false },
            { name: 'GP/Management Company Structure Chart', status: 'REQUIRED', uploaded: false },
            { name: 'Form D / Regulatory Filings', status: 'REQUIRED', uploaded: false }
          ]
        },
        {
          name: '03 - Track Record',
          documents: [
            { name: 'Track Record Summary', status: 'REQUIRED', uploaded: false },
            { name: 'Attribution Analysis', status: 'REQUIRED', uploaded: false },
            { name: 'Case Studies (Top 3-5 Deals)', status: 'RECOMMENDED', uploaded: false },
            { name: 'Benchmark Comparison', status: 'RECOMMENDED', uploaded: false },
            { name: 'PME Analysis', status: 'RECOMMENDED', uploaded: false }
          ]
        },
        {
          name: '04 - Team',
          documents: [
            { name: 'Team Bios', status: 'REQUIRED', uploaded: false },
            { name: 'Organizational Chart', status: 'REQUIRED', uploaded: false },
            { name: 'Key Person Provisions Summary', status: 'REQUIRED', uploaded: false },
            { name: 'Compensation & Carry Allocation Overview', status: 'OPTIONAL', uploaded: false }
          ]
        },
        {
          name: '05 - Financial Information',
          documents: [
            { name: 'Audited Financial Statements (Fund I)', status: 'REQUIRED', uploaded: false },
            { name: 'Audited Financial Statements (Fund II)', status: 'REQUIRED', uploaded: false },
            { name: 'Management Company Financials', status: 'OPTIONAL', uploaded: false },
            { name: 'Fee & Expense Summary', status: 'REQUIRED', uploaded: false }
          ]
        },
        {
          name: '06 - Due Diligence',
          documents: [
            { name: 'Due Diligence Questionnaire (DDQ)', status: 'REQUIRED', uploaded: false },
            { name: 'ILPA DDQ', status: 'RECOMMENDED', uploaded: false },
            { name: 'Operational Due Diligence Memo', status: 'RECOMMENDED', uploaded: false },
            { name: 'Reference Letters', status: 'REQUIRED', uploaded: false },
            { name: 'Background Check Confirmation', status: 'REQUIRED', uploaded: false }
          ]
        },
        {
          name: '07 - Compliance & Policies',
          documents: [
            { name: 'Compliance Manual', status: 'REQUIRED', uploaded: false },
            { name: 'Code of Ethics', status: 'REQUIRED', uploaded: false },
            { name: 'Valuation Policy', status: 'REQUIRED', uploaded: false },
            { name: 'Allocation Policy', status: 'REQUIRED', uploaded: false },
            { name: 'Conflicts of Interest Policy', status: 'REQUIRED', uploaded: false },
            { name: 'AML/KYC Policy', status: 'REQUIRED', uploaded: false },
            { name: 'Cybersecurity Policy', status: 'RECOMMENDED', uploaded: false },
            { name: 'Business Continuity Plan', status: 'RECOMMENDED', uploaded: false }
          ]
        },
        {
          name: '08 - ESG',
          documents: [
            { name: 'ESG/Responsible Investment Policy', status: 'RECOMMENDED', uploaded: false },
            { name: 'UN PRI Signatory Confirmation', status: 'OPTIONAL', uploaded: false },
            { name: 'ESG Reporting Template', status: 'OPTIONAL', uploaded: false },
            { name: 'Diversity & Inclusion Policy', status: 'OPTIONAL', uploaded: false }
          ]
        },
        {
          name: '09 - Service Providers',
          documents: [
            { name: 'Fund Administrator Details', status: 'REQUIRED', uploaded: false },
            { name: 'Auditor Engagement Letter', status: 'REQUIRED', uploaded: false },
            { name: 'Legal Counsel Details', status: 'REQUIRED', uploaded: false },
            { name: 'Custodian/Prime Broker Details', status: 'REQUIRED', uploaded: false },
            { name: 'Insurance Program Summary', status: 'RECOMMENDED', uploaded: false }
          ]
        },
        {
          name: '10 - Sample Reports',
          documents: [
            { name: 'Sample Quarterly Report', status: 'RECOMMENDED', uploaded: false },
            { name: 'Sample Capital Call Notice', status: 'RECOMMENDED', uploaded: false },
            { name: 'Sample Distribution Notice', status: 'RECOMMENDED', uploaded: false },
            { name: 'Sample Capital Account Statement', status: 'RECOMMENDED', uploaded: false }
          ]
        }
      ]
    };
  }

  /**
   * Generate ongoing investor portal structure
   */
  generateInvestorPortalStructure(fundId) {
    return {
      fundId,
      type: 'INVESTOR_PORTAL',
      sections: [
        { name: 'Quarterly Reports', frequency: 'Quarterly', access: 'ALL_LPS' },
        { name: 'Capital Account Statements', frequency: 'Quarterly', access: 'LP_SPECIFIC' },
        { name: 'Capital Call Notices', frequency: 'As needed', access: 'LP_SPECIFIC' },
        { name: 'Distribution Notices', frequency: 'As needed', access: 'LP_SPECIFIC' },
        { name: 'K-1 / Tax Documents', frequency: 'Annual', access: 'LP_SPECIFIC' },
        { name: 'Audited Financial Statements', frequency: 'Annual', access: 'ALL_LPS' },
        { name: 'ILPA Templates', frequency: 'Quarterly', access: 'ALL_LPS' },
        { name: 'Valuation Reports', frequency: 'Quarterly', access: 'LPAC_ONLY' },
        { name: 'LPAC Meeting Materials', frequency: 'Quarterly', access: 'LPAC_ONLY' },
        { name: 'ESG Reports', frequency: 'Annual', access: 'ALL_LPS' }
      ]
    };
  }

  /**
   * Generate regulatory exam readiness checklist
   */
  generateExamReadinessChecklist() {
    const categories = [
      {
        name: 'Governance & Organization',
        items: [
          'Compliance manual (current version)',
          'Code of ethics & personal trading records',
          'Advisory committee meeting minutes',
          'Board resolutions',
          'Organizational chart',
          'Key person employment agreements'
        ]
      },
      {
        name: 'Investment Activities',
        items: [
          'Investment committee meeting minutes',
          'Deal approval memos',
          'Trade allocation records',
          'Best execution documentation',
          'Cross-trade / principal transaction records',
          'Side-by-side investment records'
        ]
      },
      {
        name: 'Valuation',
        items: [
          'Valuation policy',
          'Valuation committee minutes',
          'Third-party valuation reports',
          'Valuation override documentation',
          'Back-testing analysis'
        ]
      },
      {
        name: 'Fund Operations',
        items: [
          'Capital call / distribution calculations',
          'Fee calculations & waterfall models',
          'Expense allocation documentation',
          'Side letter inventory & MFN summary',
          'Subscription documents (all LPs)',
          'KYC/AML records'
        ]
      },
      {
        name: 'Marketing & Communications',
        items: [
          'All marketing materials (PPM, presentations, DDQs)',
          'Performance advertising & track record',
          'LP quarterly reports (last 3 years)',
          'All external communications with investors'
        ]
      },
      {
        name: 'Compliance & Regulatory',
        items: [
          'Form ADV (current and prior versions)',
          'Form PF filings',
          'Annual compliance review',
          'Compliance testing results',
          'Conflicts of interest disclosures',
          'Regulatory correspondence',
          'CIMA filings and correspondence'
        ]
      },
      {
        name: 'Financial Records',
        items: [
          'Audited financial statements (all funds, 3+ years)',
          'Bank statements (all accounts)',
          'GL and trial balance',
          'Management company financial statements',
          'Insurance policies (D&O, E&O, cyber)'
        ]
      }
    ];

    const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);

    return {
      type: 'REGULATORY_EXAM_READINESS',
      categories: categories.map(c => ({
        ...c,
        items: c.items.map(item => ({
          name: item,
          status: 'NOT_VERIFIED',
          location: null,
          lastUpdated: null
        })),
        itemCount: c.items.length
      })),
      totalItems,
      completionPct: '0%',
      lastReviewed: null,
      recommendation: 'Review and verify all items quarterly. Stage documents in a separate, always-ready exam data room.'
    };
  }

  /**
   * Track data room access and activity analytics
   */
  analyzeActivity(activityLog) {
    const byInvestor = {};
    const byDocument = {};

    for (const event of activityLog) {
      // By investor
      if (!byInvestor[event.userId]) {
        byInvestor[event.userId] = { name: event.userName, views: 0, downloads: 0, totalTime: 0 };
      }
      byInvestor[event.userId].views += event.action === 'VIEW' ? 1 : 0;
      byInvestor[event.userId].downloads += event.action === 'DOWNLOAD' ? 1 : 0;
      byInvestor[event.userId].totalTime += event.durationSeconds || 0;

      // By document
      if (!byDocument[event.documentName]) {
        byDocument[event.documentName] = { views: 0, downloads: 0, uniqueViewers: new Set() };
      }
      byDocument[event.documentName].views++;
      if (event.action === 'DOWNLOAD') byDocument[event.documentName].downloads++;
      byDocument[event.documentName].uniqueViewers.add(event.userId);
    }

    // Most viewed documents
    const topDocuments = Object.entries(byDocument)
      .map(([name, data]) => ({
        name,
        views: data.views,
        downloads: data.downloads,
        uniqueViewers: data.uniqueViewers.size
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 20);

    // Most active investors
    const topInvestors = Object.entries(byInvestor)
      .map(([id, data]) => ({
        investorId: id,
        name: data.name,
        totalViews: data.views,
        totalDownloads: data.downloads,
        timeSpentMinutes: Math.round(data.totalTime / 60)
      }))
      .sort((a, b) => b.totalViews - a.totalViews);

    return {
      totalEvents: activityLog.length,
      uniqueUsers: Object.keys(byInvestor).length,
      topDocuments,
      topInvestors,
      insights: {
        mostViewedDocument: topDocuments[0]?.name,
        mostActiveInvestor: topInvestors[0]?.name,
        avgViewsPerInvestor: parseFloat((activityLog.filter(e => e.action === 'VIEW').length / Object.keys(byInvestor).length).toFixed(1))
      }
    };
  }
  // ==================== DOCUMENT MANAGEMENT (v5.0) ====================

  /**
   * Document versioning — track versions, approvals, and diffs
   */
  createDocumentVersion({ documentId, name, version, uploadedBy, content, changes }) {
    const versionId = `VER-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    return {
      versionId,
      documentId,
      documentName: name,
      version,
      uploadedBy,
      uploadedAt: now,
      status: 'DRAFT', // DRAFT → UNDER_REVIEW → APPROVED → PUBLISHED → SUPERSEDED
      contentHash: content ? require('crypto').createHash('sha256').update(content).digest('hex') : null,
      sizeBytes: content ? Buffer.byteLength(content, 'utf8') : 0,
      changes: changes || 'Initial version',
      approvals: [],
      supersedes: null, // Previous version ID
      supersededBy: null
    };
  }

  /**
   * Track document amendment history
   */
  trackAmendment({ documentId, documentName, amendmentNumber, effectiveDate, description, impactedSections, approvedBy, regulatoryImpact }) {
    return {
      amendmentId: `AMD-${Date.now()}`,
      documentId,
      documentName,
      amendmentNumber,
      effectiveDate,
      description,
      impactedSections: impactedSections || [],
      approvedBy,
      approvedAt: new Date().toISOString(),
      regulatoryImpact: regulatoryImpact || 'None',
      notificationRequired: true,
      notificationsSent: [],
      status: 'APPROVED'
    };
  }

  /**
   * Per-LP access control — granular document permissions
   */
  setDocumentAccess({ documentId, accessRules }) {
    return {
      documentId,
      updatedAt: new Date().toISOString(),
      accessRules: accessRules.map(rule => ({
        type: rule.type, // ALL_LPS, LP_SPECIFIC, LPAC_ONLY, GP_ONLY, CUSTOM
        investorIds: rule.investorIds || [],
        roles: rule.roles || [],
        permissions: rule.permissions || ['VIEW'], // VIEW, DOWNLOAD, PRINT
        effectiveFrom: rule.effectiveFrom || new Date().toISOString(),
        effectiveUntil: rule.effectiveUntil || null,
        restrictionReason: rule.restrictionReason || null
      }))
    };
  }

  /**
   * Check if an investor has access to a document
   */
  checkAccess({ investorId, investorRole, documentAccessRules }) {
    if (!documentAccessRules || documentAccessRules.length === 0) return { hasAccess: true, permissions: ['VIEW', 'DOWNLOAD'] };

    for (const rule of documentAccessRules) {
      if (rule.effectiveUntil && new Date(rule.effectiveUntil) < new Date()) continue;
      if (rule.type === 'ALL_LPS') return { hasAccess: true, permissions: rule.permissions };
      if (rule.type === 'LP_SPECIFIC' && rule.investorIds.includes(investorId)) return { hasAccess: true, permissions: rule.permissions };
      if (rule.type === 'LPAC_ONLY' && investorRole === 'LPAC') return { hasAccess: true, permissions: rule.permissions };
      if (rule.type === 'GP_ONLY' && investorRole === 'GP') return { hasAccess: true, permissions: rule.permissions };
      if (rule.type === 'CUSTOM' && (rule.investorIds.includes(investorId) || rule.roles.includes(investorRole))) return { hasAccess: true, permissions: rule.permissions };
    }

    return { hasAccess: false, permissions: [], reason: 'Access denied — investor not in permitted list' };
  }

  /**
   * Document expiry tracking — flag documents approaching expiry
   */
  trackDocumentExpiry(documents) {
    const now = new Date();
    return documents.map(doc => {
      if (!doc.expiryDate) return { ...doc, status: 'NO_EXPIRY' };
      const daysUntilExpiry = Math.floor((new Date(doc.expiryDate) - now) / (1000 * 60 * 60 * 24));
      return {
        documentId: doc.id,
        documentName: doc.name,
        expiryDate: doc.expiryDate,
        daysUntilExpiry,
        status: daysUntilExpiry < 0 ? 'EXPIRED' : daysUntilExpiry <= 30 ? 'EXPIRING_SOON' : 'VALID',
        renewalRequired: daysUntilExpiry <= 30,
        category: doc.category
      };
    }).sort((a, b) => (a.daysUntilExpiry || 999) - (b.daysUntilExpiry || 999));
  }

  /**
   * Forensic download trail — full audit of who accessed what
   */
  recordDocumentAccess({ investorId, investorName, documentId, documentName, action, req }) {
    return {
      accessId: `ACC-${Date.now()}`,
      investorId,
      investorName,
      documentId,
      documentName,
      action, // VIEW, DOWNLOAD, PRINT
      timestamp: new Date().toISOString(),
      forensicData: {
        ipAddress: req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.connection?.remoteAddress || '0.0.0.0',
        userAgent: req?.headers?.['user-agent'] || 'Unknown',
        browser: this._parseBrowser(req?.headers?.['user-agent']),
        os: this._parseOS(req?.headers?.['user-agent']),
        referrer: req?.headers?.referer || null,
        sessionId: req?.sessionId || null
      }
    };
  }

  /**
   * Watermark configuration for sensitive documents
   */
  generateWatermarkConfig({ investorName, documentType, confidentialityLevel }) {
    return {
      enabled: confidentialityLevel !== 'PUBLIC',
      text: `CONFIDENTIAL — ${investorName} — ${new Date().toISOString().split('T')[0]}`,
      position: 'DIAGONAL',
      opacity: 0.08,
      fontSize: 48,
      color: '#999999',
      repeatPattern: true,
      preventPrint: confidentialityLevel === 'HIGHLY_RESTRICTED',
      preventCopy: confidentialityLevel === 'HIGHLY_RESTRICTED',
      expiryWatermark: `Downloaded ${new Date().toISOString()} — Valid for 30 days`
    };
  }

  /**
   * Bulk permission check — for an investor, which documents can they see?
   */
  getAccessibleDocuments({ investorId, investorRole, allDocuments }) {
    return allDocuments
      .filter(doc => {
        const access = this.checkAccess({ investorId, investorRole, documentAccessRules: doc.accessRules || [] });
        return access.hasAccess;
      })
      .map(doc => ({
        documentId: doc.id,
        name: doc.name,
        category: doc.category,
        version: doc.currentVersion,
        lastUpdated: doc.lastUpdated,
        permissions: this.checkAccess({ investorId, investorRole, documentAccessRules: doc.accessRules || [] }).permissions
      }));
  }

  _parseBrowser(ua) {
    if (!ua) return 'Unknown';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edg')) return 'Microsoft Edge';
    return 'Other';
  }

  _parseOS(ua) {
    if (!ua) return 'Unknown';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac OS X')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    if (ua.includes('Android')) return 'Android';
    return 'Other';
  }
}

module.exports = new DataRoomService();
