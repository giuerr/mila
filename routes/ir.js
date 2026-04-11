const express = require('express');
const router = express.Router();
const ir = require('../services/investorRelations');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/retention', asyncHandler((req, res) => {
  res.json(ir.calculateRetention(req.body));
}));

router.post('/nps', requireFields('responses'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.responses)) throw new ValidationError('responses must be an array');
  res.json(ir.calculateNps(req.body.responses));
}));

router.post('/satisfaction', requireFields('responses'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.responses)) throw new ValidationError('responses must be an array');
  res.json(ir.analyzeSatisfaction(req.body.responses));
}));

router.post('/pipeline', requireFields('prospects'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.prospects)) throw new ValidationError('prospects must be an array');
  res.json(ir.trackFundraisingPipeline(req.body.prospects));
}));

router.post('/concentration', requireFields('investors'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.investors)) throw new ValidationError('investors must be an array');
  res.json(ir.concentrationAnalysis(req.body.investors));
}));

router.post('/reporting-quality', requireFields('reports'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.reports)) throw new ValidationError('reports must be an array');
  res.json(ir.reportingQualityMetrics(req.body.reports));
}));

module.exports = router;
