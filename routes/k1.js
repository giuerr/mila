const express = require('express');
const router = express.Router();
const k1 = require('../services/k1Generator');
const { asyncHandler, ValidationError } = require('../middleware/errorHandler');

router.get('/:fundId/:investorId', asyncHandler((req, res) => {
  res.json(k1.generate({ fundId: req.params.fundId, investorId: req.params.investorId, taxYear: parseInt(req.query.taxYear, 10) || undefined }));
}));

router.get('/:fundId/:investorId/html', asyncHandler((req, res) => {
  const html = k1.generateHtml({ fundId: req.params.fundId, investorId: req.params.investorId, taxYear: parseInt(req.query.taxYear, 10) || undefined });
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}));

router.get('/:fundId/:investorId/pdf', asyncHandler(async (req, res) => {
  const html = k1.generateHtml({ fundId: req.params.fundId, investorId: req.params.investorId, taxYear: parseInt(req.query.taxYear, 10) || undefined });
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'Letter', margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }, printBackground: true });
  await browser.close();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="K1_${req.params.fundId}_${req.params.investorId}.pdf"`);
  res.send(pdf);
}));

router.get('/batch/:fundId', asyncHandler((req, res) => {
  res.json(k1.batchGenerate({ fundId: req.params.fundId, taxYear: parseInt(req.query.taxYear, 10) || undefined }));
}));

module.exports = router;
