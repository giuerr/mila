const express = require('express');
const router = express.Router();
const valuation = require('../services/valuationEngine');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/market-approach', asyncHandler((req, res) => {
  res.json(valuation.marketApproach(req.body));
}));

router.post('/income-approach', asyncHandler((req, res) => {
  res.json(valuation.incomeApproach(req.body));
}));

router.post('/wacc', asyncHandler((req, res) => {
  res.json(valuation.calculateWacc(req.body));
}));

router.post('/sensitivity', asyncHandler((req, res) => {
  res.json(valuation.sensitivityAnalysis(req.body));
}));

router.post('/back-test', requireFields('valuations'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.valuations)) throw new ValidationError('valuations must be an array');
  res.json(valuation.backTest(req.body.valuations));
}));

module.exports = router;
