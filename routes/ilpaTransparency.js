/**
 * ILPA 3.0 Fee Transparency Routes
 */

const express = require('express');
const router = express.Router();
const ilpa = require('../services/ilpaFeeTransparency');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.get('/report/:fundId', asyncHandler((req, res) => {
  if (!req.params.fundId) throw new ValidationError('fundId is required');
  res.json(ilpa.generateReport({
    fundId: req.params.fundId,
    period: req.query.period,
    asOfDate: req.query.asOfDate
  }));
}));

module.exports = router;
