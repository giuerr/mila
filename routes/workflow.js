const express = require('express');
const router = express.Router();
const workflow = require('../services/workflowEngine');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/create', asyncHandler((req, res) => {
  res.json(workflow.createWorkflow(req.body));
}));

router.post('/approve', asyncHandler((req, res) => {
  res.json(workflow.processApproval(req.body));
}));

router.get('/templates', asyncHandler((req, res) => {
  res.json(workflow.getWorkflowTemplates());
}));

router.get('/dashboard', asyncHandler((req, res) => {
  res.json(workflow.getDashboard());
}));

module.exports = router;
