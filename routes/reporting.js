/**
 * Reporting Routes
 * AI-generated LP communications: quarterly letters, deal updates, market commentary, event recaps
 */

const express = require('express');
const router = express.Router();
const lpReporting = require('../services/lpReporting');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// Generate quarterly LP letter (personalized by investor type)
router.post('/quarterly-letter', requireFields('fundId', 'quarter', 'year'), asyncHandler(async (req, res) => {
  const { fundId, quarter, year, investorType, portfolioHighlights, connector } = req.body;
  const report = await lpReporting.generateQuarterlyLetter({
    fundId, quarter, year, investorType, portfolioHighlights, connector
  });
  res.json(report);
}));

// Generate deal update
router.post('/deal-update', requireFields('fundId', 'dealName'), asyncHandler(async (req, res) => {
  const { fundId, dealName, dealDetails, investorType, connector } = req.body;
  const report = await lpReporting.generateDealUpdate({
    fundId, dealName, dealDetails, investorType, connector
  });
  res.json(report);
}));

// Generate market commentary
router.post('/market-commentary', asyncHandler(async (req, res) => {
  const { sector, region, investorType, keyThemes, dataPoints } = req.body;
  const report = await lpReporting.generateMarketCommentary({
    sector, region, investorType, keyThemes, dataPoints
  });
  res.json(report);
}));

// Generate event recap
router.post('/event-recap', requireFields('eventName', 'eventDate'), asyncHandler(async (req, res) => {
  const { eventName, eventDate, eventType, highlights, decisions, investorType } = req.body;
  const report = await lpReporting.generateEventRecap({
    eventName, eventDate, eventType, highlights, decisions, investorType
  });
  res.json(report);
}));

// Batch generate — same report personalized for all investor types
router.post('/batch', requireFields('fundId', 'reportType'), asyncHandler(async (req, res) => {
  const { fundId, reportType, params, connector } = req.body;
  const reports = await lpReporting.generateBatchReports({
    fundId, reportType, params, connector
  });
  res.json(reports);
}));

module.exports = router;
