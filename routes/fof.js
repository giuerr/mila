const express = require('express');
const router = express.Router();
const fof = require('../services/fundOfFunds');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/look-through', asyncHandler((req, res) => {
  res.json(fof.lookThroughAnalysis(req.body));
}));

router.post('/performance', asyncHandler((req, res) => {
  res.json(fof.consolidatedPerformance(req.body));
}));

router.post('/fee-layering', asyncHandler((req, res) => {
  res.json(fof.feeLayeringAnalysis(req.body));
}));

router.post('/j-curve', asyncHandler((req, res) => {
  res.json(fof.jCurveBlending(req.body));
}));

router.post('/pacing', asyncHandler((req, res) => {
  res.json(fof.pacingPlan(req.body));
}));

module.exports = router;
