const express = require('express');
const router = express.Router();
const pipeline = require('../services/dealPipeline');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// Pipeline dashboard
router.post('/dashboard', requireFields('deals'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.deals)) throw new ValidationError('deals must be an array');
  res.json(pipeline.getDashboard(req.body.deals));
}));

// Create deal
router.post('/deals', asyncHandler((req, res) => {
  res.json(pipeline.createDeal(req.body));
}));

// Advance deal stage
router.post('/deals/:dealId/advance', requireFields('deal', 'newStage'), asyncHandler((req, res) => {
  res.json(pipeline.advanceDeal(req.body.deal, req.body.newStage, req.body.note));
}));

// IC memo summary
router.post('/deals/:dealId/ic-memo', asyncHandler((req, res) => {
  res.json(pipeline.generateIcMemoSummary(req.body));
}));

module.exports = router;
