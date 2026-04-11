const express = require('express');
const router = express.Router();
const notifications = require('../services/notificationHub');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/scan', asyncHandler(async (req, res) => {
  res.json(await notifications.scanAllModules(req.body));
}));

router.post('/configure-rule', asyncHandler((req, res) => {
  res.json(notifications.configureRule(req.body));
}));

router.post('/history', asyncHandler((req, res) => {
  res.json(notifications.getAlertHistory(req.body.alerts, req.body.filters));
}));

module.exports = router;
