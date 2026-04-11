const express = require('express');
const router = express.Router();
const fx = require('../services/fxEngine');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/exposure', asyncHandler((req, res) => {
  res.json(fx.calculateExposure(req.body));
}));

router.post('/translation-gain-loss', asyncHandler((req, res) => {
  res.json(fx.calculateTranslationGainLoss(req.body));
}));

router.post('/hedge-effectiveness', asyncHandler((req, res) => {
  res.json(fx.testHedgeEffectiveness(req.body));
}));

router.post('/hedging-cost', asyncHandler((req, res) => {
  res.json(fx.calculateHedgingCost(req.body));
}));

router.post('/hedged-share-class', asyncHandler((req, res) => {
  res.json(fx.calculateHedgedShareClass(req.body));
}));

module.exports = router;
