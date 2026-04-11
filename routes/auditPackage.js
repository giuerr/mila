/**
 * Audit Package Generator Routes
 */
const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

let auditPkg;
try { auditPkg = require('../services/auditPackageGenerator'); } catch (e) { auditPkg = null; }

router.get('/:fundId', asyncHandler((req, res) => {
  if (!auditPkg) throw new Error('Audit package service not available');
  res.json(auditPkg.generate({ fundId: req.params.fundId, fiscalYear: parseInt(req.query.year, 10) || new Date().getFullYear() - 1 }));
}));

router.get('/:fundId/html', asyncHandler((req, res) => {
  if (!auditPkg) throw new Error('Audit package service not available');
  const html = auditPkg.generateHtml({ fundId: req.params.fundId, fiscalYear: parseInt(req.query.year, 10) || new Date().getFullYear() - 1 });
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

module.exports = router;
