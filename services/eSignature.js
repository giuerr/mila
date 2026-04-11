/**
 * E-Signature / DocuSign Integration Service
 * Envelope creation, document signing workflows, status tracking,
 * subscription doc signing, capital call acknowledgments.
 */

const axios = require('axios');

class ESignatureService {

  constructor() {
    this.provider = process.env.ESIGN_PROVIDER || 'docusign'; // docusign, hellosign
    this.baseUrl = process.env.DOCUSIGN_BASE_URL || 'https://na4.docusign.net/restapi/v2.1';
    this.accountId = process.env.DOCUSIGN_ACCOUNT_ID;
    this.accessToken = null;
  }

  async authenticate() {
    // DocuSign JWT Grant flow
    const res = await axios.post('https://account.docusign.com/oauth/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: this._buildJwtAssertion()
    });
    this.accessToken = res.data.access_token;
  }

  async request(method, endpoint, data = null) {
    if (!this.accessToken) await this.authenticate();
    const res = await axios({
      method,
      url: `${this.baseUrl}/accounts/${this.accountId}${endpoint}`,
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      data
    });
    return res.data;
  }

  /**
   * Create and send subscription document for signing
   */
  async sendSubscriptionDoc({ investor, fund, document }) {
    const envelope = {
      emailSubject: `${fund.name} — Subscription Agreement for Signature`,
      emailBlurb: `Dear ${investor.name},\n\nPlease review and sign the enclosed subscription agreement for ${fund.name}.\n\nBest regards,\nAntoninus Global SPC`,
      status: 'sent',
      documents: [{
        documentId: '1',
        name: `Subscription_Agreement_${fund.name}_${investor.name}.pdf`,
        documentBase64: document.base64Content,
        fileExtension: 'pdf'
      }],
      recipients: {
        signers: [{
          email: investor.email,
          name: investor.name,
          recipientId: '1',
          routingOrder: '1',
          tabs: {
            signHereTabs: document.signatureLocations || [
              { documentId: '1', pageNumber: 'last', xPosition: '100', yPosition: '600' }
            ],
            dateSignedTabs: [
              { documentId: '1', pageNumber: 'last', xPosition: '300', yPosition: '600' }
            ],
            textTabs: document.textFields || []
          }
        }],
        carbonCopies: [{
          email: fund.gpEmail || 'operations@antoninus.com',
          name: 'Antoninus Global SPC — Operations',
          recipientId: '2',
          routingOrder: '2'
        }]
      }
    };

    const result = await this.request('POST', '/envelopes', envelope);

    return {
      envelopeId: result.envelopeId,
      status: result.status,
      investor: investor.name,
      fund: fund.name,
      documentType: 'SUBSCRIPTION_AGREEMENT',
      sentAt: new Date().toISOString(),
      trackingUrl: `${this.baseUrl}/accounts/${this.accountId}/envelopes/${result.envelopeId}`
    };
  }

  /**
   * Send capital call acknowledgment for signature
   */
  async sendCapitalCallAck({ investor, fund, callDetails, document }) {
    const envelope = {
      emailSubject: `${fund.name} — Capital Call #${callDetails.callNumber} Acknowledgment`,
      emailBlurb: `Capital call of ${callDetails.amount} due ${callDetails.dueDate}. Please acknowledge.`,
      status: 'sent',
      documents: [{
        documentId: '1',
        name: `Capital_Call_${callDetails.callNumber}_${investor.name}.pdf`,
        documentBase64: document.base64Content,
        fileExtension: 'pdf'
      }],
      recipients: {
        signers: [{
          email: investor.email,
          name: investor.name,
          recipientId: '1',
          routingOrder: '1',
          tabs: {
            signHereTabs: [{ documentId: '1', pageNumber: 'last', xPosition: '100', yPosition: '500' }]
          }
        }]
      }
    };

    const result = await this.request('POST', '/envelopes', envelope);
    return {
      envelopeId: result.envelopeId,
      status: result.status,
      documentType: 'CAPITAL_CALL_ACK',
      callNumber: callDetails.callNumber,
      sentAt: new Date().toISOString()
    };
  }

  /**
   * Send side letter for counter-signature
   */
  async sendSideLetter({ investor, gpSigner, fund, document }) {
    const envelope = {
      emailSubject: `${fund.name} — Side Letter for Execution`,
      status: 'sent',
      documents: [{
        documentId: '1',
        name: `Side_Letter_${fund.name}_${investor.name}.pdf`,
        documentBase64: document.base64Content,
        fileExtension: 'pdf'
      }],
      recipients: {
        signers: [
          {
            email: investor.email,
            name: investor.name,
            recipientId: '1',
            routingOrder: '1',
            tabs: {
              signHereTabs: [{ documentId: '1', pageNumber: 'last', xPosition: '100', yPosition: '600' }]
            }
          },
          {
            email: gpSigner.email,
            name: gpSigner.name,
            recipientId: '2',
            routingOrder: '2', // GP signs after LP
            tabs: {
              signHereTabs: [{ documentId: '1', pageNumber: 'last', xPosition: '350', yPosition: '600' }]
            }
          }
        ]
      }
    };

    const result = await this.request('POST', '/envelopes', envelope);
    return {
      envelopeId: result.envelopeId,
      status: result.status,
      documentType: 'SIDE_LETTER',
      signingOrder: `${investor.name} → ${gpSigner.name}`,
      sentAt: new Date().toISOString()
    };
  }

  /**
   * Check envelope status
   */
  async getEnvelopeStatus(envelopeId) {
    const envelope = await this.request('GET', `/envelopes/${envelopeId}`);
    const recipients = await this.request('GET', `/envelopes/${envelopeId}/recipients`);

    return {
      envelopeId,
      status: envelope.status, // created, sent, delivered, signed, completed, declined, voided
      createdDate: envelope.createdDateTime,
      sentDate: envelope.sentDateTime,
      completedDate: envelope.completedDateTime,
      signers: recipients.signers?.map(s => ({
        name: s.name,
        email: s.email,
        status: s.status, // sent, delivered, signed, completed, declined
        signedDate: s.signedDateTime,
        deliveredDate: s.deliveredDateTime
      }))
    };
  }

  /**
   * Download signed document
   */
  async downloadSignedDocument(envelopeId, documentId = '1') {
    const doc = await this.request('GET', `/envelopes/${envelopeId}/documents/${documentId}`);
    return {
      envelopeId,
      documentId,
      content: doc // Base64 or buffer depending on DocuSign response
    };
  }

  /**
   * Bulk send subscription docs to multiple investors
   */
  async bulkSendSubscriptions({ fund, investors, documentTemplate }) {
    const results = [];
    for (const investor of investors) {
      try {
        const result = await this.sendSubscriptionDoc({
          investor,
          fund,
          document: documentTemplate
        });
        results.push({ investor: investor.name, status: 'SENT', envelopeId: result.envelopeId });
      } catch (err) {
        results.push({ investor: investor.name, status: 'FAILED', error: err.message });
      }
    }

    return {
      fund: fund.name,
      totalSent: results.filter(r => r.status === 'SENT').length,
      totalFailed: results.filter(r => r.status === 'FAILED').length,
      results
    };
  }

  /**
   * Get signing activity dashboard
   */
  async getSigningDashboard({ fromDate, toDate }) {
    const envelopes = await this.request('GET',
      `/envelopes?from_date=${fromDate}&to_date=${toDate}&include=recipients`
    );

    const statusCounts = { sent: 0, delivered: 0, signed: 0, completed: 0, declined: 0, voided: 0 };
    for (const env of envelopes.envelopes || []) {
      statusCounts[env.status] = (statusCounts[env.status] || 0) + 1;
    }

    return {
      period: { from: fromDate, to: toDate },
      totalEnvelopes: envelopes.totalSetSize || 0,
      statusBreakdown: statusCounts,
      pendingSignatures: (envelopes.envelopes || [])
        .filter(e => e.status === 'sent' || e.status === 'delivered')
        .map(e => ({
          envelopeId: e.envelopeId,
          subject: e.emailSubject,
          sentDate: e.sentDateTime,
          status: e.status
        }))
    };
  }

  // --- Private ---

  _buildJwtAssertion() {
    // In production: build JWT assertion using DocuSign integration key + RSA private key
    // This is a placeholder — actual implementation requires the DocuSign SDK
    return process.env.DOCUSIGN_JWT_ASSERTION || '';
  }
}

module.exports = new ESignatureService();
