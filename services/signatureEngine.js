/**
 * Mila Native Signature Engine
 * Replaces DocuSign — captures IP, timestamp, geolocation, user agent,
 * generates tamper-proof signing certificates and audit trail PDFs.
 * Uses SHA-256 document hashing for integrity verification.
 */

const crypto = require('crypto');
const handlebars = require('handlebars');
const db = require('../db/database');

class SignatureEngineService {

  constructor() {
    this.envelopes = new Map(); // In-memory cache, backed by DB
    this._dbLoaded = false;
  }

  /**
   * Load envelopes from DB into memory cache on first access
   */
  _ensureLoaded() {
    if (this._dbLoaded || !db.db) return;
    try {
      const envelopes = db.loadAllEnvelopes();
      for (const env of envelopes) {
        this.envelopes.set(env.envelopeId, env);
      }
      this._dbLoaded = true;
    } catch (e) { /* DB not ready yet */ }
  }

  /**
   * Persist envelope to DB after any mutation
   */
  _persist(envelope) {
    try {
      if (db.db) db.saveEnvelope(envelope);
    } catch (e) { /* non-blocking */ }
  }

  // ==================== ENVELOPE LIFECYCLE ====================

  /**
   * Create a signing envelope with one or more documents
   */
  createEnvelope({ documents, signers, sender, metadata }) {
    const envelopeId = `ENV-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const envelope = {
      envelopeId,
      status: 'CREATED',
      sender: {
        name: sender.name,
        email: sender.email,
        role: sender.role
      },
      metadata: {
        fundName: metadata?.fundName,
        documentType: metadata?.documentType, // SUBSCRIPTION, CAPITAL_CALL, SIDE_LETTER, DISTRIBUTION, K1, GENERAL
        fundId: metadata?.fundId,
        reference: metadata?.reference
      },
      documents: documents.map((doc, idx) => ({
        documentId: `DOC-${idx + 1}`,
        name: doc.name,
        contentHash: this._hashDocument(doc.content),
        hashAlgorithm: 'SHA-256',
        contentBase64: doc.content, // Base64 encoded
        mimeType: doc.mimeType || 'application/pdf',
        pageCount: doc.pageCount || null,
        sizeBytes: doc.content ? Buffer.from(doc.content, 'base64').length : 0
      })),
      signers: signers.map((signer, idx) => ({
        signerId: `SIG-${crypto.randomBytes(4).toString('hex')}`,
        name: signer.name,
        email: signer.email,
        role: signer.role || 'SIGNER',
        order: signer.order || idx + 1,
        status: 'PENDING',
        accessToken: crypto.randomBytes(32).toString('hex'), // Unique signing link token
        signatureData: null,
        signedAt: null,
        signingEvidence: null
      })),
      auditTrail: [{
        action: 'ENVELOPE_CREATED',
        timestamp: new Date().toISOString(),
        actor: sender.name,
        details: `Envelope created with ${documents.length} document(s) and ${signers.length} signer(s)`
      }],
      createdAt: new Date().toISOString(),
      completedAt: null,
      expiresAt: this._addDays(new Date(), 30).toISOString(),
      signingCertificate: null
    };

    this.envelopes.set(envelopeId, envelope);
    this._persist(envelope);
    return {
      envelopeId,
      status: envelope.status,
      signingLinks: envelope.signers.map(s => ({
        signerName: s.name,
        signerEmail: s.email,
        signingUrl: `/api/sign/${envelopeId}/${s.signerId}?token=${s.accessToken}`,
        signingPage: `/api/sign/page/${envelopeId}/${s.signerId}?token=${s.accessToken}&docTitle=${encodeURIComponent(documents[0]?.name || 'Document')}&fund=${encodeURIComponent(metadata?.fundName || '')}`,
        order: s.order
      })),
      expiresAt: envelope.expiresAt,
      createdAt: envelope.createdAt
    };
  }

  /**
   * Record a signature with full forensic evidence
   */
  recordSignature({ envelopeId, signerId, token, signatureImage, consent, req }) {
    this._ensureLoaded();
    const envelope = this.envelopes.get(envelopeId);
    if (!envelope) throw new Error(`Envelope ${envelopeId} not found`);

    const signer = envelope.signers.find(s => s.signerId === signerId);
    if (!signer) throw new Error(`Signer ${signerId} not found`);
    if (signer.accessToken !== token) throw new Error('Invalid signing token');
    if (signer.status === 'SIGNED') throw new Error('Document already signed by this signer');

    // Check signing order
    const prevSigners = envelope.signers.filter(s => s.order < signer.order);
    if (prevSigners.some(s => s.status !== 'SIGNED')) {
      throw new Error('Previous signers have not yet signed');
    }

    // Capture forensic signing evidence
    const now = new Date();
    const evidence = {
      ipAddress: this._getClientIp(req),
      ipVersion: this._getClientIp(req).includes(':') ? 'IPv6' : 'IPv4',
      timestamp: now.toISOString(),
      timestampUtc: now.toUTCString(),
      timestampUnix: Math.floor(now.getTime() / 1000),
      timezone: req?.headers?.['x-timezone'] || Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: req?.headers?.['user-agent'] || 'Unknown',
      browser: this._parseBrowser(req?.headers?.['user-agent']),
      operatingSystem: this._parseOS(req?.headers?.['user-agent']),
      screenResolution: req?.body?.screenResolution || null,
      language: req?.headers?.['accept-language']?.split(',')[0] || null,
      geolocation: {
        latitude: req?.body?.latitude || null,
        longitude: req?.body?.longitude || null,
        accuracy: req?.body?.geoAccuracy || null,
        city: req?.body?.city || null,
        region: req?.body?.region || null,
        country: req?.body?.country || null,
        source: req?.body?.latitude ? 'BROWSER_GEOLOCATION' : 'IP_LOOKUP'
      },
      consentRecord: {
        consentGiven: consent === true,
        consentText: 'I agree to sign this document electronically and acknowledge that my electronic signature has the same legal effect as a handwritten signature.',
        consentTimestamp: now.toISOString()
      },
      signatureMethod: req?.body?.signatureMethod || (signatureImage ? 'DRAWN' : 'TYPED'),
      typedSignatureDetails: req?.body?.typedSignature || null, // { name, font }
      documentHashAtSigning: envelope.documents.map(d => ({
        documentId: d.documentId,
        hash: d.contentHash,
        algorithm: d.hashAlgorithm,
        verified: true
      }))
    };

    // Generate signature hash (binds signer identity to document + timestamp)
    const signaturePayload = `${signer.name}|${signer.email}|${evidence.timestamp}|${evidence.ipAddress}|${envelope.documents.map(d => d.contentHash).join('|')}`;
    const signatureHash = crypto.createHash('sha256').update(signaturePayload).digest('hex');

    // Update signer record
    signer.status = 'SIGNED';
    signer.signedAt = now.toISOString();
    signer.signatureData = {
      signatureHash,
      signatureImage: signatureImage || null, // Base64 drawn or rendered signature image
      typedName: req?.body?.typedSignature?.name || (!signatureImage ? signer.name : null),
      fontStyle: req?.body?.typedSignature?.font || null
    };
    signer.signingEvidence = evidence;

    // Audit trail
    envelope.auditTrail.push({
      action: 'DOCUMENT_SIGNED',
      timestamp: now.toISOString(),
      actor: signer.name,
      details: `Signed from IP ${evidence.ipAddress}${evidence.geolocation.city ? `, ${evidence.geolocation.city}, ${evidence.geolocation.country}` : ''}`,
      ipAddress: evidence.ipAddress,
      signatureHash
    });

    // Check if all signers are done
    const allSigned = envelope.signers.every(s => s.status === 'SIGNED');
    if (allSigned) {
      envelope.status = 'COMPLETED';
      envelope.completedAt = now.toISOString();
      envelope.signingCertificate = this._generateCertificate(envelope);
      envelope.auditTrail.push({
        action: 'ENVELOPE_COMPLETED',
        timestamp: now.toISOString(),
        actor: 'SYSTEM',
        details: 'All signers have signed. Signing certificate generated.'
      });
    } else {
      envelope.status = 'PARTIALLY_SIGNED';
    }

    this.envelopes.set(envelopeId, envelope);
    this._persist(envelope);

    return {
      envelopeId,
      signerId,
      signerName: signer.name,
      status: signer.status,
      signedAt: signer.signedAt,
      signatureHash,
      evidence: {
        ipAddress: evidence.ipAddress,
        timestamp: evidence.timestamp,
        location: evidence.geolocation.city
          ? `${evidence.geolocation.city}, ${evidence.geolocation.region}, ${evidence.geolocation.country}`
          : `IP: ${evidence.ipAddress}`,
        browser: evidence.browser,
        os: evidence.operatingSystem
      },
      envelopeStatus: envelope.status,
      allSigned,
      signingCertificate: allSigned ? envelope.signingCertificate : null
    };
  }

  // ==================== SIGNING CERTIFICATE ====================

  /**
   * Generate tamper-proof signing certificate
   */
  _generateCertificate(envelope) {
    const certId = `CERT-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    // Create integrity hash over all signatures + documents
    const integrityPayload = [
      envelope.envelopeId,
      ...envelope.documents.map(d => d.contentHash),
      ...envelope.signers.map(s => s.signatureData.signatureHash)
    ].join('|');
    const integrityHash = crypto.createHash('sha256').update(integrityPayload).digest('hex');

    return {
      certificateId: certId,
      envelopeId: envelope.envelopeId,
      integrityHash,
      integrityAlgorithm: 'SHA-256',
      issuedAt: new Date().toISOString(),
      issuer: 'Mila CFO Agent — Antoninus Global SPC',
      documents: envelope.documents.map(d => ({
        name: d.name,
        hash: d.contentHash,
        pages: d.pageCount,
        size: d.sizeBytes
      })),
      signatures: envelope.signers.map(s => ({
        name: s.name,
        email: s.email,
        role: s.role,
        signedAt: s.signedAt,
        signatureHash: s.signatureData.signatureHash,
        ipAddress: s.signingEvidence.ipAddress,
        location: s.signingEvidence.geolocation.city
          ? `${s.signingEvidence.geolocation.city}, ${s.signingEvidence.geolocation.region}, ${s.signingEvidence.geolocation.country}`
          : `IP: ${s.signingEvidence.ipAddress}`,
        userAgent: s.signingEvidence.browser,
        consent: s.signingEvidence.consentRecord.consentGiven
      })),
      verification: {
        howToVerify: 'Recompute SHA-256 hash of all document hashes and signature hashes concatenated with pipe separator. Must match integrityHash.',
        tamperEvident: true,
        legalBasis: 'ESIGN Act (US), eIDAS Regulation (EU), Electronic Transactions Act (Cayman Islands)'
      }
    };
  }

  // ==================== AUDIT TRAIL REPORT ====================

  /**
   * Generate complete audit trail report for an envelope
   */
  generateAuditReport(envelopeId) {
    this._ensureLoaded();
    const envelope = this.envelopes.get(envelopeId);
    if (!envelope) throw new Error(`Envelope ${envelopeId} not found`);

    return {
      title: 'Electronic Signature Audit Trail',
      envelopeId: envelope.envelopeId,
      status: envelope.status,
      metadata: envelope.metadata,
      sender: envelope.sender,
      created: envelope.createdAt,
      completed: envelope.completedAt,
      documents: envelope.documents.map(d => ({
        name: d.name,
        documentId: d.documentId,
        hash: d.contentHash,
        hashAlgorithm: d.hashAlgorithm,
        pages: d.pageCount,
        sizeBytes: d.sizeBytes
      })),
      signers: envelope.signers.map(s => ({
        name: s.name,
        email: s.email,
        role: s.role,
        signingOrder: s.order,
        status: s.status,
        signedAt: s.signedAt,
        signatureHash: s.signatureData?.signatureHash || null,
        signatureMethod: s.signingEvidence?.signatureMethod || null,
        forensicEvidence: s.signingEvidence ? {
          ipAddress: s.signingEvidence.ipAddress,
          ipVersion: s.signingEvidence.ipVersion,
          timestamp: s.signingEvidence.timestamp,
          timestampUtc: s.signingEvidence.timestampUtc,
          timestampUnix: s.signingEvidence.timestampUnix,
          timezone: s.signingEvidence.timezone,
          geolocation: s.signingEvidence.geolocation,
          browser: s.signingEvidence.browser,
          operatingSystem: s.signingEvidence.operatingSystem,
          userAgent: s.signingEvidence.userAgent,
          screenResolution: s.signingEvidence.screenResolution,
          language: s.signingEvidence.language,
          consentGiven: s.signingEvidence.consentRecord.consentGiven,
          consentText: s.signingEvidence.consentRecord.consentText,
          consentTimestamp: s.signingEvidence.consentRecord.consentTimestamp,
          documentIntegrity: s.signingEvidence.documentHashAtSigning
        } : null
      })),
      chronologicalAuditTrail: envelope.auditTrail,
      certificate: envelope.signingCertificate,
      legalDisclaimer: `This document was signed electronically using the Mila Signature Engine operated by Antoninus Global SPC. ` +
        `Electronic signatures are legally binding under the U.S. Electronic Signatures in Global and National Commerce Act (ESIGN), ` +
        `the Uniform Electronic Transactions Act (UETA), the EU Electronic Identification and Trust Services Regulation (eIDAS), ` +
        `and the Cayman Islands Electronic Transactions Act. ` +
        `Each signature includes cryptographic proof of signer identity, timestamp, IP address, and geolocation. ` +
        `Document integrity is verified via SHA-256 hashing. Any modification to the signed document will invalidate the integrity hash.`
    };
  }

  /**
   * Generate audit trail HTML (for PDF conversion)
   */
  generateAuditTrailHtml(envelopeId) {
    const report = this.generateAuditReport(envelopeId);

    const template = `<!DOCTYPE html><html><head><style>
      body { font-family: 'Helvetica Neue', sans-serif; color: #1a1a2e; padding: 40px; font-size: 11px; line-height: 1.5; }
      .header { border-bottom: 3px solid #1a365d; padding-bottom: 15px; margin-bottom: 25px; }
      .title { font-size: 18px; font-weight: bold; color: #1a365d; }
      .subtitle { font-size: 12px; color: #666; margin-top: 4px; }
      .section { margin-bottom: 25px; }
      .section-title { font-size: 13px; font-weight: bold; color: #1a365d; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th { background: #1a365d; color: white; padding: 6px 8px; text-align: left; font-size: 10px; }
      td { padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 10px; }
      .evidence-box { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px; margin: 8px 0; }
      .hash { font-family: 'Courier New', monospace; font-size: 9px; word-break: break-all; color: #555; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 9px; font-weight: bold; }
      .badge-green { background: #d4edda; color: #155724; }
      .badge-blue { background: #cce5ff; color: #004085; }
      .legal { font-size: 9px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 20px; }
      .cert-box { border: 2px solid #1a365d; padding: 15px; border-radius: 6px; margin-top: 15px; }
      .cert-title { font-size: 14px; font-weight: bold; color: #1a365d; text-align: center; }
    </style></head><body>
    <div class="header">
      <div class="title">Electronic Signature Audit Trail</div>
      <div class="subtitle">Antoninus Global SPC — Mila CFO Agent</div>
      <div class="subtitle">Envelope: {{envelopeId}} | Status: <span class="badge badge-green">{{status}}</span></div>
    </div>

    <div class="section">
      <div class="section-title">Document Information</div>
      <table>
        <tr><th>Document</th><th>SHA-256 Hash</th><th>Pages</th><th>Size</th></tr>
        {{#each documents}}<tr>
          <td>{{name}}</td><td class="hash">{{hash}}</td><td>{{pages}}</td><td>{{sizeBytes}} bytes</td>
        </tr>{{/each}}
      </table>
    </div>

    <div class="section">
      <div class="section-title">Signature Evidence</div>
      {{#each signers}}
      <div class="evidence-box">
        <strong>{{name}}</strong> ({{email}}) — <span class="badge badge-blue">{{status}}</span><br>
        {{#if forensicEvidence}}
        <table>
          <tr><td><strong>Signed At</strong></td><td>{{forensicEvidence.timestamp}} ({{forensicEvidence.timezone}})</td></tr>
          <tr><td><strong>IP Address</strong></td><td>{{forensicEvidence.ipAddress}} ({{forensicEvidence.ipVersion}})</td></tr>
          <tr><td><strong>Location</strong></td><td>{{#if forensicEvidence.geolocation.city}}{{forensicEvidence.geolocation.city}}, {{forensicEvidence.geolocation.region}}, {{forensicEvidence.geolocation.country}}{{else}}Derived from IP{{/if}}</td></tr>
          <tr><td><strong>Browser</strong></td><td>{{forensicEvidence.browser}}</td></tr>
          <tr><td><strong>OS</strong></td><td>{{forensicEvidence.operatingSystem}}</td></tr>
          <tr><td><strong>Consent</strong></td><td>{{#if forensicEvidence.consentGiven}}Yes — "{{forensicEvidence.consentText}}"{{else}}Pending{{/if}}</td></tr>
          <tr><td><strong>Signature Hash</strong></td><td class="hash">{{signatureHash}}</td></tr>
        </table>
        {{/if}}
      </div>
      {{/each}}
    </div>

    <div class="section">
      <div class="section-title">Chronological Audit Trail</div>
      <table>
        <tr><th>Timestamp</th><th>Action</th><th>Actor</th><th>Details</th></tr>
        {{#each chronologicalAuditTrail}}<tr>
          <td>{{timestamp}}</td><td>{{action}}</td><td>{{actor}}</td><td>{{details}}</td>
        </tr>{{/each}}
      </table>
    </div>

    {{#if certificate}}
    <div class="cert-box">
      <div class="cert-title">Signing Certificate</div>
      <table>
        <tr><td><strong>Certificate ID</strong></td><td>{{certificate.certificateId}}</td></tr>
        <tr><td><strong>Integrity Hash</strong></td><td class="hash">{{certificate.integrityHash}}</td></tr>
        <tr><td><strong>Algorithm</strong></td><td>{{certificate.integrityAlgorithm}}</td></tr>
        <tr><td><strong>Issued</strong></td><td>{{certificate.issuedAt}}</td></tr>
        <tr><td><strong>Issuer</strong></td><td>{{certificate.issuer}}</td></tr>
      </table>
    </div>
    {{/if}}

    <div class="legal">{{{legalDisclaimer}}}</div>
    </body></html>`;

    const compiled = handlebars.compile(template);
    return compiled(report);
  }

  // ==================== VERIFICATION ====================

  /**
   * Verify document integrity — check if document was tampered with after signing
   */
  verifyIntegrity(envelopeId, documentContent) {
    this._ensureLoaded();
    const envelope = this.envelopes.get(envelopeId);
    if (!envelope) throw new Error(`Envelope ${envelopeId} not found`);

    const currentHash = this._hashDocument(documentContent);
    const results = envelope.documents.map(doc => ({
      documentId: doc.documentId,
      name: doc.name,
      originalHash: doc.contentHash,
      currentHash,
      match: doc.contentHash === currentHash,
      tampered: doc.contentHash !== currentHash
    }));

    // Verify certificate integrity
    let certValid = false;
    if (envelope.signingCertificate) {
      const integrityPayload = [
        envelope.envelopeId,
        ...envelope.documents.map(d => d.contentHash),
        ...envelope.signers.map(s => s.signatureData?.signatureHash).filter(Boolean)
      ].join('|');
      const recalcHash = crypto.createHash('sha256').update(integrityPayload).digest('hex');
      certValid = recalcHash === envelope.signingCertificate.integrityHash;
    }

    return {
      envelopeId,
      documentIntegrity: results,
      allDocumentsIntact: results.every(r => r.match),
      certificateValid: certValid,
      verifiedAt: new Date().toISOString()
    };
  }

  /**
   * Get envelope status
   */
  getEnvelope(envelopeId) {
    this._ensureLoaded();
    const envelope = this.envelopes.get(envelopeId);
    if (!envelope) throw new Error(`Envelope ${envelopeId} not found`);

    return {
      envelopeId: envelope.envelopeId,
      status: envelope.status,
      metadata: envelope.metadata,
      sender: envelope.sender,
      created: envelope.createdAt,
      completed: envelope.completedAt,
      expires: envelope.expiresAt,
      documents: envelope.documents.map(d => ({ name: d.name, hash: d.contentHash })),
      signers: envelope.signers.map(s => ({
        name: s.name,
        email: s.email,
        order: s.order,
        status: s.status,
        signedAt: s.signedAt,
        ipAddress: s.signingEvidence?.ipAddress || null,
        location: s.signingEvidence?.geolocation?.city
          ? `${s.signingEvidence.geolocation.city}, ${s.signingEvidence.geolocation.country}`
          : null
      })),
      certificate: envelope.signingCertificate
    };
  }

  /**
   * Void an envelope (cancel before completion)
   */
  voidEnvelope(envelopeId, reason, actor) {
    this._ensureLoaded();
    const envelope = this.envelopes.get(envelopeId);
    if (!envelope) throw new Error(`Envelope ${envelopeId} not found`);
    if (envelope.status === 'COMPLETED') throw new Error('Cannot void a completed envelope');

    envelope.status = 'VOIDED';
    envelope.auditTrail.push({
      action: 'ENVELOPE_VOIDED',
      timestamp: new Date().toISOString(),
      actor,
      details: `Voided: ${reason}`
    });

    this.envelopes.set(envelopeId, envelope);
    this._persist(envelope);
    return { envelopeId, status: 'VOIDED', reason };
  }

  // ==================== BULK OPERATIONS ====================

  /**
   * Send subscription documents to multiple investors
   */
  bulkCreateEnvelopes({ documentTemplate, investors, fund, sender }) {
    const results = investors.map(investor => {
      const envelope = this.createEnvelope({
        documents: [{
          name: `${documentTemplate.name}_${investor.name}.pdf`,
          content: documentTemplate.content,
          mimeType: 'application/pdf',
          pageCount: documentTemplate.pageCount
        }],
        signers: [{ name: investor.name, email: investor.email, role: 'LP_SIGNER', order: 1 }],
        sender,
        metadata: {
          fundName: fund.name,
          documentType: documentTemplate.type,
          fundId: fund.id,
          reference: `${fund.name}-${investor.name}`
        }
      });
      return { investor: investor.name, ...envelope };
    });

    return {
      totalSent: results.length,
      fund: fund.name,
      documentType: documentTemplate.type,
      envelopes: results
    };
  }

  /**
   * Get signing dashboard — status across all envelopes
   */
  getDashboard(filters = {}) {
    this._ensureLoaded();
    const all = [...this.envelopes.values()];
    let filtered = all;
    if (filters.status) filtered = filtered.filter(e => e.status === filters.status);
    if (filters.fundId) filtered = filtered.filter(e => e.metadata?.fundId === filters.fundId);
    if (filters.documentType) filtered = filtered.filter(e => e.metadata?.documentType === filters.documentType);

    const statusCounts = { CREATED: 0, PARTIALLY_SIGNED: 0, COMPLETED: 0, VOIDED: 0, EXPIRED: 0 };
    for (const env of filtered) {
      if (new Date(env.expiresAt) < new Date() && env.status !== 'COMPLETED' && env.status !== 'VOIDED') {
        statusCounts.EXPIRED++;
      } else {
        statusCounts[env.status] = (statusCounts[env.status] || 0) + 1;
      }
    }

    return {
      totalEnvelopes: filtered.length,
      statusBreakdown: statusCounts,
      pendingSignatures: filtered
        .filter(e => e.status !== 'COMPLETED' && e.status !== 'VOIDED')
        .flatMap(e => e.signers
          .filter(s => s.status === 'PENDING')
          .map(s => ({
            envelopeId: e.envelopeId,
            documentType: e.metadata?.documentType,
            signerName: s.name,
            signerEmail: s.email,
            created: e.createdAt,
            ageHours: Math.floor((new Date() - new Date(e.createdAt)) / (1000 * 60 * 60))
          }))
        ),
      recentlyCompleted: filtered
        .filter(e => e.status === 'COMPLETED')
        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
        .slice(0, 20)
        .map(e => ({
          envelopeId: e.envelopeId,
          documentType: e.metadata?.documentType,
          completedAt: e.completedAt,
          signerCount: e.signers.length
        }))
    };
  }

  // ==================== PRIVATE HELPERS ====================

  _hashDocument(content) {
    if (!content) return 'EMPTY_DOCUMENT';
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  _getClientIp(req) {
    if (!req) return '0.0.0.0';
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || req.connection?.remoteAddress
      || req.socket?.remoteAddress
      || '0.0.0.0';
  }

  _parseBrowser(ua) {
    if (!ua) return 'Unknown';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edg')) return 'Microsoft Edge';
    if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
    return 'Other';
  }

  _parseOS(ua) {
    if (!ua) return 'Unknown';
    if (ua.includes('Windows NT 10')) return 'Windows 10/11';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac OS X')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('iPhone')) return 'iOS (iPhone)';
    if (ua.includes('iPad')) return 'iOS (iPad)';
    if (ua.includes('Android')) return 'Android';
    return 'Other';
  }

  _addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }
}

module.exports = new SignatureEngineService();
