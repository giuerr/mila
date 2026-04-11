const express = require('express');
const router = express.Router();
const insurance = require('../services/insuranceTracker');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/program', requireFields('policies'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.policies)) throw new ValidationError('policies must be an array');
  res.json(insurance.getInsuranceProgram(req.body.policies));
}));

router.post('/required', asyncHandler((req, res) => {
  res.json(insurance.getRequiredPolicies(req.body));
}));

router.post('/gap-analysis', requireFields('existing', 'required'), asyncHandler((req, res) => {
  res.json(insurance.gapAnalysis(req.body.existing, req.body.required));
}));

router.post('/allocate-premiums', requireFields('policies', 'funds'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.policies)) throw new ValidationError('policies must be an array');
  if (!Array.isArray(req.body.funds)) throw new ValidationError('funds must be an array');
  res.json(insurance.allocatePremiums(req.body.policies, req.body.funds));
}));

router.post('/claims', requireFields('claims'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.claims)) throw new ValidationError('claims must be an array');
  res.json(insurance.trackClaims(req.body.claims));
}));

module.exports = router;
