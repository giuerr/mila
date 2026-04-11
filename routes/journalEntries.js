/**
 * Journal Entry Generation Routes
 */

const express = require('express');
const router = express.Router();
const generator = require('../services/journalEntryGenerator');
const { requireFields } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');

router.post('/capital-call', requireFields('fundId', 'callNumber'), asyncHandler((req, res) => {
  res.json(generator.generateCapitalCallEntries(req.body));
}));

router.post('/distribution', requireFields('fundId', 'distributions'), asyncHandler((req, res) => {
  res.json(generator.generateDistributionEntries(req.body));
}));

router.post('/mgmt-fee/accrual', requireFields('fundId', 'feeAmount', 'periodStart', 'periodEnd'), asyncHandler((req, res) => {
  res.json(generator.generateMgmtFeeEntries(req.body));
}));

router.post('/mgmt-fee/payment', requireFields('fundId', 'feeAmount'), asyncHandler((req, res) => {
  res.json(generator.generateMgmtFeePaymentEntries(req.body));
}));

router.post('/investment', requireFields('fundId', 'companyName', 'amount'), asyncHandler((req, res) => {
  res.json(generator.generateInvestmentEntries(req.body));
}));

router.post('/fair-value-adjustment', requireFields('fundId', 'companyName', 'previousValue', 'newValue'), asyncHandler((req, res) => {
  res.json(generator.generateFairValueAdjustmentEntries(req.body));
}));

router.post('/carry-accrual', requireFields('fundId', 'carryAmount'), asyncHandler((req, res) => {
  res.json(generator.generateCarryAccrualEntries(req.body));
}));

// Push to accounting system
router.post('/push/xero', asyncHandler(async (req, res) => {
  res.json(await generator.pushToXero(req.body));
}));

router.post('/push/quickbooks', asyncHandler(async (req, res) => {
  res.json(await generator.pushToQuickBooks(req.body));
}));

module.exports = router;
