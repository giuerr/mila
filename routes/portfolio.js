const express = require('express');
const router = express.Router();
const portfolio = require('../services/portfolioMonitoring');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/dashboard', requireFields('companies'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.companies)) throw new ValidationError('companies must be an array');
  res.json(portfolio.generateDashboard(req.body.companies));
}));

router.post('/covenants', asyncHandler((req, res) => {
  res.json(portfolio.trackCovenants(req.body));
}));

router.post('/budget-vs-actual', asyncHandler((req, res) => {
  res.json(portfolio.budgetVsActual(req.body));
}));

router.post('/exit-readiness', asyncHandler(async (req, res) => {
  res.json(await portfolio.assessExitReadiness(req.body));
}));

router.post('/qofe-template', asyncHandler((req, res) => {
  res.json(portfolio.generateQofETemplate(req.body));
}));

module.exports = router;
