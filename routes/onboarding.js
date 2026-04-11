const express = require('express');
const router = express.Router();
const onboarding = require('../services/investorOnboarding');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/process', asyncHandler(async (req, res) => {
  res.json(await onboarding.processOnboarding(req.body));
}));

router.post('/sanctions-screen', asyncHandler(async (req, res) => {
  res.json(await onboarding.screenSanctions(req.body));
}));

router.post('/classify', asyncHandler((req, res) => {
  res.json(onboarding.classifyInvestor(req.body));
}));

router.post('/erisa-test', asyncHandler((req, res) => {
  res.json(onboarding.monitorErisaTest(req.body));
}));

module.exports = router;
