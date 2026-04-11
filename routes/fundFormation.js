const express = require('express');
const router = express.Router();
const formation = require('../services/fundFormation');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/structure', asyncHandler((req, res) => {
  res.json(formation.recommendStructure(req.body));
}));

router.post('/banking', asyncHandler((req, res) => {
  res.json(formation.recommendBankingSetup(req.body));
}));

router.post('/service-providers', requireFields('category', 'candidates'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.candidates)) throw new ValidationError('candidates must be an array');
  res.json(formation.compareServiceProviders(req.body.category, req.body.candidates));
}));

router.post('/budget', asyncHandler((req, res) => {
  res.json(formation.generateFormationBudget(req.body));
}));

module.exports = router;
