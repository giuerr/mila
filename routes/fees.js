const express = require('express');
const router = express.Router();
const feeCalc = require('../services/feeCalculator');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/management-fee', requireFields('feeBase', 'feeRate', 'periodStart', 'periodEnd'), asyncHandler((req, res) => {
  if (typeof req.body.feeBase !== 'number') throw new ValidationError('feeBase must be a number');
  if (typeof req.body.feeRate !== 'number') throw new ValidationError('feeRate must be a number');
  res.json(feeCalc.calculateManagementFee(req.body));
}));

router.post('/management-fee/with-offsets', requireFields('feeBase', 'feeRate'), asyncHandler((req, res) => {
  res.json(feeCalc.calculateFeeWithOffsets(req.body));
}));

router.post('/performance-fee', requireFields('currentNav', 'previousHwm', 'perfFeeRate'), asyncHandler((req, res) => {
  if (typeof req.body.currentNav !== 'number') throw new ValidationError('currentNav must be a number');
  res.json(feeCalc.calculatePerformanceFee(req.body));
}));

router.post('/performance-fee/multi-series', asyncHandler((req, res) => {
  if (!Array.isArray(req.body.series)) throw new ValidationError('series must be an array');
  res.json(feeCalc.calculateMultiSeriesPerformanceFee(req.body.series));
}));

router.post('/carried-interest', requireFields('totalContributed', 'preferredReturn', 'carryRate'), asyncHandler((req, res) => {
  if (typeof req.body.totalContributed !== 'number') throw new ValidationError('totalContributed must be a number');
  res.json(feeCalc.calculateCarriedInterest(req.body));
}));

router.post('/clawback', requireFields('cumulativeCarryDistributed', 'currentCarryEntitlement'), asyncHandler((req, res) => {
  res.json(feeCalc.calculateClawback(req.body));
}));

router.post('/org-expenses', requireFields('expenses'), asyncHandler((req, res) => {
  res.json(feeCalc.trackOrgExpenses(req.body));
}));

module.exports = router;
