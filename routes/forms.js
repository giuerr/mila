const express = require('express');
const router = express.Router();
const formTemplates = require('../services/formTemplates');
const signatureEngine = require('../services/signatureEngine');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError, NotFoundError } = require('../middleware/errorHandler');

// Get full form registry (all available forms)
router.get('/registry', asyncHandler((req, res) => {
  res.json(formTemplates.getFormRegistry());
}));

// Get form schema (field definitions, validation, IRS line refs)
router.get('/schema/:formId', asyncHandler((req, res) => {
  const schema = formTemplates.getFormSchema(req.params.formId);
  if (!schema) return res.status(404).json({ error: `Form ${req.params.formId} not found` });
  res.json(schema);
}));

// Determine which forms an investor needs
router.post('/required', asyncHandler((req, res) => {
  res.json(formTemplates.getRequiredForms(req.body));
}));

// Generate conversational question flow for a form (with pre-population)
router.post('/questions/:formId', asyncHandler((req, res) => {
  const flow = formTemplates.generateQuestionFlow(req.params.formId, req.body.existingData || {});
  if (!flow) return res.status(404).json({ error: `Form ${req.params.formId} not found` });
  res.json(flow);
}));

// Pre-populate a form from investor data
router.post('/prepopulate/:formId', requireFields('investor'), asyncHandler((req, res) => {
  const result = formTemplates.prePopulateForm(req.params.formId, req.body.investor);
  if (!result) return res.status(404).json({ error: `Form ${req.params.formId} not found` });
  res.json(result);
}));

// Validate completed form data
router.post('/validate/:formId', asyncHandler((req, res) => {
  res.json(formTemplates.validateForm(req.params.formId, req.body));
}));

// Prepare form for e-signature (Mila Native Signature Engine — no DocuSign)
router.post('/sign/:formId', requireFields('formData', 'investor'), asyncHandler((req, res) => {
  const result = formTemplates.prepareForSignature(req.params.formId, req.body.formData, req.body.investor, signatureEngine);
  if (!result) return res.status(404).json({ error: `Form ${req.params.formId} not found` });
  res.json(result);
}));

module.exports = router;
