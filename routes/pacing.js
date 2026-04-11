/**
 * Commitment Pacing Model Routes
 */
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

let pacing;
try { pacing = require('../services/commitmentPacing'); } catch (e) { pacing = null; }

router.get('/forecast/:fundId', asyncHandler((req, res) => {
  if (!pacing) throw new Error('Pacing service not available');
  res.json(pacing.forecast({ fundId: req.params.fundId, forecastMonths: parseInt(req.query.months, 10) || 24 }));
}));

router.get('/lp-schedule/:fundId', asyncHandler((req, res) => {
  if (!pacing) throw new Error('Pacing service not available');
  res.json(pacing.lpPacingSchedule({ fundId: req.params.fundId }));
}));

router.get('/liquidity/:fundId', asyncHandler((req, res) => {
  if (!pacing) throw new Error('Pacing service not available');
  res.json(pacing.liquidityForecast({ fundId: req.params.fundId }));
}));

module.exports = router;
