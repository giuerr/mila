const express = require('express');
const router = express.Router();
const waterfall = require('../services/waterfall');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/european', requireFields('lpInvestors', 'fundTotalValue', 'preferredReturn', 'carryRate'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.lpInvestors)) throw new ValidationError('lpInvestors must be an array');
  if (typeof req.body.fundTotalValue !== 'number') throw new ValidationError('fundTotalValue must be a number');
  res.json(waterfall.calculateEuropeanWaterfall(req.body));
}));

router.post('/american', requireFields('deals', 'preferredReturn', 'carryRate'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.deals)) throw new ValidationError('deals must be an array');
  res.json(waterfall.calculateAmericanWaterfall(req.body));
}));

router.post('/scenario', requireFields('baseCase', 'scenarios', 'waterfallType'), asyncHandler((req, res) => {
  res.json(waterfall.scenarioAnalysis(req.body));
}));

// --- Real Data Simulation (pulls from DB) ---
const simulator = require('../services/waterfallSimulator');

router.post('/simulate', requireFields('fundId'), asyncHandler((req, res) => {
  res.json(simulator.simulate(req.body));
}));

router.post('/simulate/scenarios', requireFields('fundId', 'scenarios'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.scenarios)) throw new ValidationError('scenarios must be an array');
  res.json(simulator.scenarioAnalysis(req.body));
}));

module.exports = router;
