const express = require('express');
const router = express.Router();
const windDown = require('../services/fundWindDown');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/plan', asyncHandler((req, res) => {
  res.json(windDown.generateWindDownPlan(req.body));
}));

router.post('/final-distribution', asyncHandler((req, res) => {
  res.json(windDown.calculateFinalDistribution(req.body));
}));

router.post('/tail-insurance', asyncHandler((req, res) => {
  res.json(windDown.calculateTailInsurance(req.body));
}));

router.get('/retention-schedule', asyncHandler((req, res) => {
  res.json(windDown.generateRetentionSchedule());
}));

module.exports = router;
