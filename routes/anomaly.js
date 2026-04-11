/**
 * Anomaly Detection Routes
 * AI-powered monitoring for capital activity, NAV, fees, compliance, and valuations.
 */

const express = require('express');
const router = express.Router();
const anomalyService = require('../services/anomalyDetection');
const { asyncHandler } = require('../middleware/errorHandler');

// Full scan across all modules
router.get('/scan', asyncHandler((req, res) => {
  res.json(anomalyService.scanAll(req.query));
}));

// Filtered scan
router.get('/scan/filter', asyncHandler((req, res) => {
  res.json(anomalyService.getFiltered(req.query));
}));

// Scan specific categories
router.get('/scan/capital-activity', asyncHandler((req, res) => {
  res.json(anomalyService.scanCapitalActivity(req.query));
}));

router.get('/scan/nav', asyncHandler((req, res) => {
  res.json(anomalyService.scanNavTrends(req.query));
}));

router.get('/scan/fees', asyncHandler((req, res) => {
  res.json(anomalyService.scanFeeDiscrepancies(req.query));
}));

router.get('/scan/compliance', asyncHandler((req, res) => {
  res.json(anomalyService.scanComplianceDeadlines(req.query));
}));

router.get('/scan/concentration', asyncHandler((req, res) => {
  res.json(anomalyService.scanInvestorConcentration(req.query));
}));

router.get('/scan/valuation', asyncHandler((req, res) => {
  res.json(anomalyService.scanValuationOutliers(req.query));
}));

module.exports = router;
