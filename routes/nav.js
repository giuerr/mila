const express = require('express');
const router = express.Router();
const navCalc = require('../services/navCalculator');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/calculate', requireFields('assets', 'liabilities', 'asOfDate'), asyncHandler((req, res) => {
  if (typeof req.body.assets !== 'object') throw new ValidationError('assets must be an object');
  if (typeof req.body.liabilities !== 'object') throw new ValidationError('liabilities must be an object');
  res.json(navCalc.calculateNav(req.body));
}));

router.post('/per-share', requireFields('nav', 'series'), asyncHandler((req, res) => {
  if (typeof req.body.nav !== 'number') throw new ValidationError('nav must be a number');
  if (!Array.isArray(req.body.series)) throw new ValidationError('series must be an array');
  res.json(navCalc.calculateNavPerShare(req.body));
}));

router.post('/equalization', requireFields('newInvestor', 'currentNavPerShare', 'hwmPerShare', 'perfFeeRate'), asyncHandler((req, res) => {
  if (typeof req.body.currentNavPerShare !== 'number') throw new ValidationError('currentNavPerShare must be a number');
  res.json(navCalc.calculateEqualization(req.body));
}));

router.post('/side-pocket', requireFields('assetName', 'costBasis', 'fundSeries'), asyncHandler((req, res) => {
  res.json(navCalc.createSidePocket(req.body));
}));

router.post('/valuation-hierarchy', asyncHandler((req, res) => {
  if (!Array.isArray(req.body.investments)) throw new ValidationError('investments must be an array');
  res.json(navCalc.valuationHierarchy(req.body.investments));
}));

module.exports = router;
