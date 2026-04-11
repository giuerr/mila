const express = require('express');
const router = express.Router();
const pdf = require('../services/pdfEngine');
const { requireFields } = require('../middleware/security');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.post('/generate', asyncHandler(async (req, res) => {
  const result = await pdf.generatePdf(req.body);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
  res.send(result.buffer);
}));

router.post('/preview', asyncHandler((req, res) => {
  const html = pdf.generateHtmlPreview(req.body);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

router.get('/templates', asyncHandler((req, res) => {
  res.json(pdf.getAvailableTemplates());
}));

module.exports = router;
