/**
 * Multi-Fund Consolidated Reporting Routes
 */

const express = require('express');
const router = express.Router();
const consolidated = require('../services/consolidatedReporting');
const { asyncHandler } = require('../middleware/errorHandler');

router.get('/dashboard', asyncHandler((req, res) => {
  res.json(consolidated.dashboard(req.query));
}));

router.get('/gp-economics', asyncHandler((req, res) => {
  res.json(consolidated.gpEconomics());
}));

module.exports = router;
