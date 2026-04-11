/**
 * Cash Flow Stress Testing Routes
 */
const express = require('express');
const router = express.Router();
const { requireFields } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');

let stressTest;
try { stressTest = require('../services/cashFlowStressTest'); } catch (e) { stressTest = null; }

router.post('/monte-carlo', requireFields('fundId'), asyncHandler((req, res) => {
  if (!stressTest) throw new Error('Stress test service not available');
  res.json(stressTest.simulate({
    fundId: req.body.fundId,
    simulations: req.body.simulations || 1000,
    forecastYears: req.body.forecastYears || 5
  }));
}));

router.post('/scenarios', requireFields('fundId'), asyncHandler((req, res) => {
  if (!stressTest) throw new Error('Stress test service not available');
  res.json(stressTest.scenarioStressTest({
    fundId: req.body.fundId,
    scenarios: req.body.scenarios
  }));
}));

module.exports = router;
