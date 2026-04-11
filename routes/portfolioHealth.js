const express = require('express');
const router = express.Router();
const health = require('../services/portfolioHealth');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// Single company scorecard
router.post('/scorecard', asyncHandler((req, res) => {
  res.json(health.generateScorecard(req.body));
}));

// Portfolio-wide health dashboard
router.post('/dashboard', requireFields('companies'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.companies)) throw new ValidationError('companies must be an array');
  res.json(health.getPortfolioHealthDashboard(req.body.companies));
}));

module.exports = router;
