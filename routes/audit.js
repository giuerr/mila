/**
 * Audit Routes
 * Audit trails, regulatory filings, compliance
 */

const express = require('express');
const router = express.Router();
const auditService = require('../services/auditService');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// Generate audit trail for a period
router.post('/trail', requireFields('fundId', 'startDate', 'endDate'), asyncHandler(async (req, res) => {
  const { fundId, startDate, endDate, fundConnector, accountingSystem } = req.body;
  const trail = await auditService.generateAuditTrail(
    fundId, startDate, endDate, { fundConnector, accountingSystem }
  );
  res.json(trail);
}));

// Generate regulatory filing
router.post('/filing', requireFields('fundId', 'filingType', 'period'), asyncHandler(async (req, res) => {
  const { fundId, filingType, period, fundConnector, accountingSystem } = req.body;
  const filing = await auditService.generateRegulatoryFiling(
    fundId, filingType, period, { fundConnector, accountingSystem }
  );
  res.json(filing);
}));

module.exports = router;
