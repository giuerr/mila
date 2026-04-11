const express = require('express');
const router = express.Router();
const portal = require('../services/investorPortal');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

// Full LP dashboard
router.post('/dashboard', asyncHandler((req, res) => {
  res.json(portal.getDashboard(req.body));
}));

// Capital account summary
router.post('/capital-account', asyncHandler((req, res) => {
  res.json(portal.getCapitalAccountSummary(req.body));
}));

// Performance metrics with time-series
router.post('/performance', asyncHandler((req, res) => {
  res.json(portal.getPerformanceMetrics(req.body));
}));

// Document vault
router.post('/documents', asyncHandler((req, res) => {
  res.json(portal.getDocumentVault(req.body));
}));

// Document download URL
router.post('/download-url', asyncHandler((req, res) => {
  res.json(portal.getDocumentDownloadUrl(req.body));
}));

// Commitment tracker
router.post('/commitment', asyncHandler((req, res) => {
  res.json(portal.getCommitmentTracker(req.body));
}));

// Recent activity
router.post('/activity', asyncHandler((req, res) => {
  res.json(portal.getRecentActivity(req.body));
}));

// Notifications
router.get('/notifications/:investorId', asyncHandler((req, res) => {
  res.json(portal.getNotifications({ investorId: req.params.investorId }));
}));

// Update notification preferences
router.put('/notifications/:investorId', asyncHandler((req, res) => {
  res.json(portal.updateNotificationPreferences({ investorId: req.params.investorId, preferences: req.body }));
}));

// Multi-fund aggregate view
router.post('/multi-fund', asyncHandler((req, res) => {
  res.json(portal.getMultiFundDashboard(req.body));
}));

module.exports = router;
