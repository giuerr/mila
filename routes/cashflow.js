const express = require('express');
const router = express.Router();
const cashflow = require('../services/cashFlowForecasting');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/forecast', asyncHandler((req, res) => {
  res.json(cashflow.generateForecast(req.body));
}));

router.post('/pacing', asyncHandler((req, res) => {
  res.json(cashflow.forecastCapitalCallPacing(req.body));
}));

router.post('/recycling', asyncHandler((req, res) => {
  res.json(cashflow.calculateRecyclingCapacity(req.body));
}));

router.post('/stress-test', asyncHandler((req, res) => {
  res.json(cashflow.stressTest(req.body));
}));

module.exports = router;
