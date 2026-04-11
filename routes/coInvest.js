const express = require('express');
const router = express.Router();
const coInvest = require('../services/coInvestment');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/opportunity', asyncHandler((req, res) => {
  res.json(coInvest.createOpportunity(req.body));
}));

router.post('/allocate', asyncHandler((req, res) => {
  res.json(coInvest.allocateCoInvest(req.body));
}));

router.post('/spv-economics', asyncHandler((req, res) => {
  res.json(coInvest.trackSpvEconomics(req.body));
}));

router.post('/program-summary', requireFields('spvs'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.spvs)) throw new ValidationError('spvs must be an array');
  res.json(coInvest.programSummary(req.body.spvs));
}));

module.exports = router;
