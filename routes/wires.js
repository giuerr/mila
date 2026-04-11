const express = require('express');
const router = express.Router();
const wires = require('../services/wireProcessing');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/capital-call/notices', asyncHandler((req, res) => {
  const _ic = req.app.locals._ic;
  if (_ic) {
    const check = _ic.approval.check('wire_transfer', { amount: req.body.amount });
    if (!check.approved) {
      return res.status(202).json({ pending: true, pendingId: check.pendingId, message: check.message });
    }
  }
  res.json(wires.generateCapitalCallNotices(req.body));
}));

router.post('/capital-call/track', requireFields('callId', 'notices', 'receivedWires'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.notices)) throw new ValidationError('notices must be an array');
  if (!Array.isArray(req.body.receivedWires)) throw new ValidationError('receivedWires must be an array');
  res.json(wires.trackCapitalCallReceipts(req.body.callId, req.body.notices, req.body.receivedWires));
}));

router.post('/capital-call/default', asyncHandler((req, res) => {
  res.json(wires.processDefault(req.body));
}));

router.post('/distribution/payments', asyncHandler((req, res) => {
  const _ic = req.app.locals._ic;
  if (_ic) {
    const check = _ic.approval.check('wire_transfer', { amount: req.body.amount });
    if (!check.approved) {
      return res.status(202).json({ pending: true, pendingId: check.pendingId, message: check.message });
    }
  }
  res.json(wires.generateDistributionPayments(req.body));
}));

module.exports = router;
