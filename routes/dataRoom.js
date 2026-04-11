const express = require('express');
const router = express.Router();
const dataRoom = require('../services/dataRoom');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/fundraising-structure', asyncHandler((req, res) => {
  res.json(dataRoom.generateFundraisingStructure(req.body));
}));

router.post('/investor-portal', requireFields('fundId'), asyncHandler((req, res) => {
  res.json(dataRoom.generateInvestorPortalStructure(req.body.fundId));
}));

router.get('/exam-readiness', asyncHandler((req, res) => {
  res.json(dataRoom.generateExamReadinessChecklist());
}));

router.post('/activity-analytics', requireFields('activityLog'), asyncHandler((req, res) => {
  if (!Array.isArray(req.body.activityLog)) throw new ValidationError('activityLog must be an array');
  res.json(dataRoom.analyzeActivity(req.body.activityLog));
}));

module.exports = router;
