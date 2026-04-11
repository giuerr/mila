const express = require('express');
const router = express.Router();
const fs = require('../services/financialStatements');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/full-statements', asyncHandler(async (req, res) => {
  res.json(await fs.generateFullStatements(req.body));
}));

router.post('/balance-sheet', requireFields('fund', 'period'), asyncHandler((req, res) => {
  res.json(fs.generateBalanceSheet(req.body.fund, req.body.period));
}));

router.post('/income-statement', requireFields('fund', 'period'), asyncHandler((req, res) => {
  res.json(fs.generateIncomeStatement(req.body.fund, req.body.period));
}));

router.post('/partners-capital', requireFields('fund', 'period'), asyncHandler((req, res) => {
  res.json(fs.generatePartnersCapitalStatement(req.body.fund, req.body.period));
}));

router.post('/cash-flow', requireFields('fund', 'period'), asyncHandler((req, res) => {
  res.json(fs.generateCashFlowStatement(req.body.fund, req.body.period));
}));

router.post('/highlights', asyncHandler((req, res) => {
  res.json(fs.calculateFinancialHighlights(req.body));
}));

module.exports = router;
