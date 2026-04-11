/**
 * LP Re-Up Prediction Routes
 */
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

let reup;
try { reup = require('../services/lpReupPrediction'); } catch (e) { reup = null; }

router.get('/scores/:fundId', asyncHandler((req, res) => {
  if (!reup) throw new Error('Re-up prediction service not available');
  res.json(reup.scoreAll({ fundId: req.params.fundId }));
}));

router.get('/recommendations/:fundId', asyncHandler((req, res) => {
  if (!reup) throw new Error('Re-up prediction service not available');
  res.json(reup.getRecommendations({ fundId: req.params.fundId }));
}));

module.exports = router;
