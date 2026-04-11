/**
 * LP Quarterly Letter Generator Routes
 */
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

let letterService;
try { letterService = require('../services/quarterlyLetterGenerator'); } catch (e) { letterService = null; }

router.get('/:fundId', asyncHandler((req, res) => {
  if (!letterService) throw new Error('Quarterly letter service not available');
  const fundId = req.params.fundId;
  const q = parseInt(req.query.quarter, 10) || Math.ceil((new Date().getMonth() + 1) / 3);
  const y = parseInt(req.query.year, 10) || new Date().getFullYear();
  const content = letterService.generate({ fundId, quarter: q, year: y });
  const _ic = req.app.locals._ic;
  if (_ic) {
    const scored = _ic.confidence.score(content, { withinCoreDomain: true, templateGrounded: true });
    content.confidence = scored.confidence;
    _ic.versioning.save(`lp-report-${fundId}-Q${q}-${y}`, content, { action: 'lp_report', model: 'claude-sonnet-4-6' });
  }
  res.json(content);
}));

router.get('/:fundId/html', asyncHandler((req, res) => {
  if (!letterService) throw new Error('Quarterly letter service not available');
  const q = parseInt(req.query.quarter, 10) || Math.ceil((new Date().getMonth() + 1) / 3);
  const y = parseInt(req.query.year, 10) || new Date().getFullYear();
  const html = letterService.generateHtml({ fundId: req.params.fundId, quarter: q, year: y });
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

router.get('/batch/:fundId', asyncHandler((req, res) => {
  if (!letterService) throw new Error('Quarterly letter service not available');
  const q = parseInt(req.query.quarter, 10) || Math.ceil((new Date().getMonth() + 1) / 3);
  const y = parseInt(req.query.year, 10) || new Date().getFullYear();
  res.json(letterService.batchGenerate({ fundId: req.params.fundId, quarter: q, year: y }));
}));

module.exports = router;
