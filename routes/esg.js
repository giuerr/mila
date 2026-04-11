const express = require('express');
const router = express.Router();
const esg = require('../services/esgReporting');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/scorecard', requireFields('companies'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.companies)) throw new ValidationError('companies must be an array');
  res.json(esg.generateScorecard(req.body.companies));
}));

router.post('/carbon', requireFields('companies'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.companies)) throw new ValidationError('companies must be an array');
  res.json(esg.calculateCarbonMetrics(req.body.companies));
}));

router.post('/dei', asyncHandler((req, res) => {
  res.json(esg.calculateDeiMetrics(req.body));
}));

router.post('/sfdr', asyncHandler((req, res) => {
  res.json(esg.generateSfdrReport(req.body));
}));

router.post('/pri', asyncHandler((req, res) => {
  res.json(esg.generatePriReportingData(req.body));
}));

module.exports = router;
