/**
 * Native Signature Engine Tests
 */

const SignatureEngine = require('../services/signatureEngine');

function parseSigningLink(link) {
  // URL: /api/sign/ENV-xxx/SIG-xxx?token=xxx
  const parts = link.signingUrl.split('?');
  const pathParts = parts[0].split('/');
  const signerId = pathParts[pathParts.length - 1];
  const token = parts[1].split('=')[1];
  return { signerId, token };
}

describe('Envelope Creation', () => {
  test('creates envelope with signing links', () => {
    const result = SignatureEngine.createEnvelope({
      documents: [{ name: 'Subscription.pdf', content: 'dGVzdA==', mimeType: 'application/pdf' }],
      signers: [
        { name: 'John LP', email: 'john@pension.com', role: 'LP_SIGNER', order: 1 },
        { name: 'Jane GP', email: 'jane@antoninus.com', role: 'GP_COUNTERSIGNER', order: 2 }
      ],
      sender: { name: 'Mila', email: 'ops@antoninus.com', role: 'CFO' },
      metadata: { fundName: 'Antoninus Fund I', documentType: 'SUBSCRIPTION' }
    });

    expect(result.envelopeId).toBeDefined();
    expect(result.signingLinks).toHaveLength(2);
    expect(result.signingLinks[0].signingUrl).toContain('/api/sign/');
    expect(result.signingLinks[0].signerName).toBe('John LP');
  });
});

describe('Signing with Evidence', () => {
  let envelopeId, signerId, token;

  beforeAll(() => {
    const env = SignatureEngine.createEnvelope({
      documents: [{ name: 'Test.pdf', content: 'dGVzdGRvYw==', mimeType: 'application/pdf' }],
      signers: [{ name: 'Test Signer', email: 'test@test.com', order: 1 }],
      sender: { name: 'Admin', email: 'admin@test.com', role: 'ADMIN' },
      metadata: { documentType: 'GENERAL' }
    });
    envelopeId = env.envelopeId;
    const parsed = parseSigningLink(env.signingLinks[0]);
    signerId = parsed.signerId;
    token = parsed.token;
  });

  test('records signature with IP, timestamp, and user agent', () => {
    const mockReq = {
      headers: {
        'x-forwarded-for': '203.0.113.42',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
        'accept-language': 'en-US,en;q=0.9',
        'x-timezone': 'America/New_York'
      },
      body: {
        latitude: 40.7128,
        longitude: -74.0060,
        city: 'New York',
        region: 'NY',
        country: 'US'
      },
      connection: { remoteAddress: '127.0.0.1' }
    };

    const result = SignatureEngine.recordSignature({
      envelopeId,
      signerId,
      token,
      signatureImage: null,
      consent: true,
      req: mockReq
    });

    expect(result.status).toBe('SIGNED');
    expect(result.signatureHash).toBeDefined();
    expect(result.evidence.ipAddress).toBe('203.0.113.42');
    expect(result.evidence.location).toContain('New York');
    expect(result.evidence.browser).toBe('Chrome');
    expect(result.evidence.os).toBe('Windows 10/11');
    expect(result.envelopeStatus).toBe('COMPLETED'); // Single signer
    expect(result.signingCertificate).toBeDefined();
    expect(result.signingCertificate.integrityHash).toBeDefined();
  });

  test('audit report contains full forensic evidence', () => {
    const report = SignatureEngine.generateAuditReport(envelopeId);

    expect(report.status).toBe('COMPLETED');
    expect(report.signers[0].forensicEvidence.ipAddress).toBe('203.0.113.42');
    expect(report.signers[0].forensicEvidence.geolocation.city).toBe('New York');
    expect(report.signers[0].forensicEvidence.consentGiven).toBe(true);
    expect(report.signers[0].forensicEvidence.browser).toBe('Chrome');
    expect(report.signers[0].forensicEvidence.operatingSystem).toBe('Windows 10/11');
    expect(report.signers[0].forensicEvidence.timezone).toBe('America/New_York');
    expect(report.certificate).toBeDefined();
    expect(report.chronologicalAuditTrail.length).toBeGreaterThanOrEqual(3);
  });

  test('generates HTML audit trail', () => {
    const html = SignatureEngine.generateAuditTrailHtml(envelopeId);

    expect(html).toContain('Electronic Signature Audit Trail');
    expect(html).toContain('203.0.113.42');
    expect(html).toContain('New York');
    expect(html).toContain('SHA-256');
  });

  test('verify integrity passes for original doc and detects tampering', () => {
    const result = SignatureEngine.verifyIntegrity(envelopeId, 'dGVzdGRvYw==');
    expect(result.allDocumentsIntact).toBe(true);
    expect(result.certificateValid).toBe(true);

    const tampered = SignatureEngine.verifyIntegrity(envelopeId, 'dGFtcGVyZWQ=');
    expect(tampered.allDocumentsIntact).toBe(false);
  });
});

describe('Signing Order Enforcement', () => {
  test('prevents signing out of order', () => {
    const env = SignatureEngine.createEnvelope({
      documents: [{ name: 'Doc.pdf', content: 'dGVzdA==', mimeType: 'application/pdf' }],
      signers: [
        { name: 'First', email: 'first@test.com', order: 1 },
        { name: 'Second', email: 'second@test.com', order: 2 }
      ],
      sender: { name: 'Admin', email: 'admin@test.com', role: 'ADMIN' },
      metadata: {}
    });

    const secondParsed = parseSigningLink(env.signingLinks[1]);

    expect(() => {
      SignatureEngine.recordSignature({
        envelopeId: env.envelopeId,
        signerId: secondParsed.signerId,
        token: secondParsed.token,
        consent: true,
        req: { headers: {}, connection: {} }
      });
    }).toThrow('Previous signers have not yet signed');
  });
});

describe('Void Envelope', () => {
  test('can void an unsigned envelope', () => {
    const env = SignatureEngine.createEnvelope({
      documents: [{ name: 'Doc.pdf', content: 'dGVzdA==', mimeType: 'application/pdf' }],
      signers: [{ name: 'Signer', email: 's@test.com', order: 1 }],
      sender: { name: 'Admin', email: 'admin@test.com', role: 'ADMIN' },
      metadata: {}
    });

    const result = SignatureEngine.voidEnvelope(env.envelopeId, 'No longer needed', 'Admin');
    expect(result.status).toBe('VOIDED');
  });
});
