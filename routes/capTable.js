/**
 * Cap Table Routes
 * Ownership tracking, commitments, capital accounts
 */

const express = require('express');
const router = express.Router();
const capTableService = require('../services/capTableService');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// Get cap table for a fund
router.get('/:fundId', asyncHandler(async (req, res) => {
  if (!req.params.fundId) throw new ValidationError('fundId is required');
  const { connector } = req.query;
  const capTable = await capTableService.getCapTable(req.params.fundId, connector);
  res.json(capTable);
}));

// Get investor capital account
router.get('/:fundId/investor/:investorId', asyncHandler(async (req, res) => {
  if (!req.params.fundId || !req.params.investorId) {
    throw new ValidationError('fundId and investorId are required');
  }
  const { connector } = req.query;
  const account = await capTableService.getInvestorCapitalAccount(
    req.params.fundId, req.params.investorId, connector
  );
  res.json(account);
}));

// Sync cap table to accounting system
router.post('/:fundId/sync', asyncHandler(async (req, res) => {
  const { accountingSystem, fundConnector } = req.body;
  if (!accountingSystem) throw new ValidationError('accountingSystem is required');
  const result = await capTableService.syncToAccounting(
    req.params.fundId, accountingSystem, fundConnector
  );
  res.json(result);
}));

module.exports = router;
