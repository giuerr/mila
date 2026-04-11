const express = require('express');
const router = express.Router();
const treasury = require('../services/treasury');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/cash-position', requireFields('accounts'), asyncHandler(async (req, res) => {
  if (!Array.isArray(req.body.accounts)) throw new ValidationError('accounts must be an array');
  res.json(await treasury.getConsolidatedCashPosition(req.body.accounts, req.body.accountingSystem));
}));

router.post('/credit-facility', asyncHandler((req, res) => {
  res.json(treasury.trackCreditFacility(req.body));
}));

router.post('/sweep-optimization', requireFields('cashBalance', 'sweepOptions'), asyncHandler((req, res) => {
  if (typeof req.body.cashBalance !== 'number') throw new ValidationError('cashBalance must be a number');
  res.json(treasury.calculateSweepOptimization(req.body.cashBalance, req.body.sweepOptions));
}));

router.post('/counterparty-risk', requireFields('counterparties'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.counterparties)) throw new ValidationError('counterparties must be an array');
  res.json(treasury.assessCounterpartyRisk(req.body.counterparties));
}));

router.post('/liquidity-buffer', asyncHandler((req, res) => {
  res.json(treasury.calculateLiquidityBuffer(req.body));
}));

module.exports = router;
