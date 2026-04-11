const express = require('express');
const router = express.Router();
const taxEngine = require('../services/taxEngine');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/k1', asyncHandler((req, res) => {
  res.json(taxEngine.generateK1Data(req.body));
}));

router.post('/withholding', asyncHandler((req, res) => {
  res.json(taxEngine.calculateWithholding(req.body));
}));

router.post('/fatca', asyncHandler((req, res) => {
  res.json(taxEngine.generateFatcaReport(req.body));
}));

router.post('/crs', asyncHandler((req, res) => {
  res.json(taxEngine.generateCrsReport(req.body));
}));

router.post('/pfic', requireFields('companies'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.companies)) throw new ValidationError('companies must be an array');
  res.json(taxEngine.identifyPfics(req.body.companies));
}));

router.post('/eci', requireFields('investments'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.investments)) throw new ValidationError('investments must be an array');
  res.json(taxEngine.calculateEciExposure(req.body.investments));
}));

router.post('/ubti', requireFields('investments'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.investments)) throw new ValidationError('investments must be an array');
  res.json(taxEngine.calculateUbtiExposure(req.body.investments));
}));

router.post('/tax-lots', requireFields('lots'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.lots)) throw new ValidationError('lots must be an array');
  res.json(taxEngine.trackTaxLots(req.body.lots));
}));

// Jurisdiction tax profile
router.get('/jurisdiction/:code', asyncHandler((req, res) => {
  const profile = taxEngine.getJurisdictionTaxProfile(req.params.code.toUpperCase());
  if (!profile) return res.status(404).json({ error: `Unknown jurisdiction: ${req.params.code}` });
  res.json(profile);
}));

// All jurisdiction profiles
router.get('/jurisdictions', asyncHandler((req, res) => {
  res.json(taxEngine.getAllJurisdictionProfiles());
}));

// Compare tax across jurisdictions
router.post('/compare', asyncHandler((req, res) => {
  res.json(taxEngine.compareJurisdictionTax(req.body));
}));

module.exports = router;
