/**
 * Native Signature Routes
 * Full e-signature lifecycle without DocuSign.
 * Captures IP, timestamp, geolocation, user agent, consent.
 */

const express = require('express');
const path = require('path');
const router = express.Router();
const signEngine = require('../services/signatureEngine');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');

// Serve the signing page (the UI an LP sees when clicking their signing link)
router.get('/page/:envelopeId/:signerId', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'portal', 'views', 'sign.html'));
});

// Create signing envelope
router.post('/envelope', requireFields('documents', 'signers', 'sender'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.documents) || req.body.documents.length === 0) {
    throw new ValidationError('documents must be a non-empty array');
  }
  if (!Array.isArray(req.body.signers) || req.body.signers.length === 0) {
    throw new ValidationError('signers must be a non-empty array');
  }
  res.json(signEngine.createEnvelope(req.body));
}));

// Get envelope status
router.get('/envelope/:envelopeId', asyncHandler((req, res) => {
  try {
    res.json(signEngine.getEnvelope(req.params.envelopeId));
  } catch (err) {
    throw new NotFoundError(err.message);
  }
}));

// Generate audit trail report (JSON)
router.get('/audit/:envelopeId', asyncHandler((req, res) => {
  try {
    res.json(signEngine.generateAuditReport(req.params.envelopeId));
  } catch (err) {
    throw new NotFoundError(err.message);
  }
}));

// Generate audit trail report (HTML — for PDF conversion)
router.get('/audit/:envelopeId/html', asyncHandler((req, res) => {
  try {
    const html = signEngine.generateAuditTrailHtml(req.params.envelopeId);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    throw new NotFoundError(err.message);
  }
}));

// Generate audit trail PDF
router.get('/audit/:envelopeId/pdf', asyncHandler(async (req, res) => {
  const html = signEngine.generateAuditTrailHtml(req.params.envelopeId);
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    margin: { top: '40px', right: '30px', bottom: '40px', left: '30px' },
    printBackground: true
  });
  await browser.close();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="audit_trail_${req.params.envelopeId}.pdf"`);
  res.send(pdf);
}));

// Verify document integrity (check for tampering)
router.post('/verify/:envelopeId', requireFields('documentContent'), asyncHandler((req, res) => {
  res.json(signEngine.verifyIntegrity(req.params.envelopeId, req.body.documentContent));
}));

// Void an envelope
router.post('/void/:envelopeId', requireFields('reason', 'actor'), asyncHandler((req, res) => {
  res.json(signEngine.voidEnvelope(req.params.envelopeId, req.body.reason, req.body.actor));
}));

// Bulk create envelopes (e.g., subscription docs to all LPs)
router.post('/bulk', requireFields('documentTemplate', 'investors', 'fund', 'sender'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.investors)) throw new ValidationError('investors must be an array');
  res.json(signEngine.bulkCreateEnvelopes(req.body));
}));

// Signing dashboard
router.get('/dashboard', asyncHandler((req, res) => {
  res.json(signEngine.getDashboard(req.query));
}));

// Record a signature (the actual signing action)
// MUST be last — /:envelopeId/:signerId is a catch-all pattern
router.post('/:envelopeId/:signerId', asyncHandler((req, res) => {
  const result = signEngine.recordSignature({
    envelopeId: req.params.envelopeId,
    signerId: req.params.signerId,
    token: req.query.token,
    signatureImage: req.body.signatureImage,
    consent: req.body.consent,
    req
  });
  res.json(result);
}));

module.exports = router;
