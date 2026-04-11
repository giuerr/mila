/**
 * Bank Reconciliation Routes
 */
const express = require('express');
const router = express.Router();
const { requireFields } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');

let recon;
try { recon = require('../services/bankReconciliation'); } catch (e) { recon = null; }

router.post('/reconcile', requireFields('fundId', 'bankEntries'), asyncHandler((req, res) => {
  if (!recon) throw new Error('Reconciliation service not available');
  res.json(recon.reconcile(req.body));
}));

router.post('/auto-match/:fundId', asyncHandler((req, res) => {
  if (!recon) throw new Error('Reconciliation service not available');
  res.json(recon.autoMatch({ fundId: req.params.fundId }));
}));

router.get('/report/:fundId', asyncHandler((req, res) => {
  if (!recon) throw new Error('Reconciliation service not available');
  res.json(recon.getReconciliationReport({ fundId: req.params.fundId, period: req.query.period }));
}));

module.exports = router;
