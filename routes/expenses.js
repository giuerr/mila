const express = require('express');
const router = express.Router();
const expenses = require('../services/expenseManagement');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/track', requireFields('expenses'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.expenses)) throw new ValidationError('expenses must be an array');
  res.json(expenses.trackFundExpenses(req.body.expenses, req.body.lpaProvisions));
}));

router.post('/mgmt-co-pnl', asyncHandler((req, res) => {
  res.json(expenses.calculateMgmtCoP_L(req.body));
}));

router.post('/allocate', asyncHandler((req, res) => {
  res.json(expenses.allocateSharedExpenses(req.body));
}));

router.post('/broken-deals', requireFields('deals'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.deals)) throw new ValidationError('deals must be an array');
  res.json(expenses.trackBrokenDealExpenses(req.body.deals, req.body.offsetProvision));
}));

router.post('/variance', asyncHandler((req, res) => {
  res.json(expenses.varianceAnalysis(req.body));
}));

module.exports = router;
