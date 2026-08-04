'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mila = require('../index');
const { calculations, calendar, fatcaCrs, filingTracker, k1Generator, jurisdictionRouter } = mila.tax;

test('agent card is a well-formed identity', () => {
  const c = mila.AGENT_CARD;
  assert.equal(c.name, 'Mila');
  assert.match(c.version, /^\d+\.\d+\.\d+$/);
  assert.ok(Array.isArray(c.capabilities) && c.capabilities.length > 0);
});

test('card version matches package version', () => {
  assert.equal(mila.AGENT_CARD.version, require('../package.json').version);
});

test('importing the library does not start a server', () => {
  // index.js previously *was* the Express app and called app.listen() at import
  // time, so requiring Mila bound port 3400 as a side effect.
  const handles = process._getActiveHandles().filter(h => h.constructor.name === 'Server');
  assert.equal(handles.length, 0, 'importing @tabularum/mila bound a listening socket');
});

test('every tax module is exposed and callable', () => {
  for (const [name, mod] of Object.entries(mila.tax)) {
    assert.equal(typeof mod, 'object', `${name} did not load`);
    assert.ok(Object.values(mod).some(v => typeof v === 'function'), `${name} exports no functions`);
  }
});

test('partner income allocation splits pro rata and rejects bad ownership', () => {
  const partners = [
    { partnerId: 'lp-1', partnerName: 'LP One', ownershipPct: 60 },
    { partnerId: 'lp-2', partnerName: 'LP Two', ownershipPct: 40 },
  ];
  const result = calculations.allocatePartnerIncome({ ordinaryIncome: 1000 }, partners);
  assert.equal(result.length, 2);

  const total = result.reduce((sum, p) => sum + p.allocation.ordinaryIncome, 0);
  assert.equal(total, 1000, 'allocations must sum to the fund total');
  assert.equal(result[0].allocation.ordinaryIncome, 600);
  assert.equal(result[1].allocation.ordinaryIncome, 400);

  assert.throws(
    () => calculations.allocatePartnerIncome({ ordinaryIncome: 1000 },
      [{ partnerId: 'x', partnerName: 'X', ownershipPct: 50 }]),
    /ownership/i,
    'ownership that does not total 100% must be rejected',
  );
});

test('carried interest is zero when the fund loses money', () => {
  const r = calculations.calculateCarriedInterest(-500, 0.08, 0.20, 1.0, 10000);
  assert.equal(r.carriedInterest, 0);
  assert.equal(r.gpShare, 0);
  assert.equal(r.lpShare, -500, 'the loss falls entirely to LPs');
});

test('carried interest never exceeds the profit it is taken from', () => {
  const profit = 5000;
  const r = calculations.calculateCarriedInterest(profit, 0.08, 0.20, 1.0, 10000);
  assert.ok(r.carriedInterest >= 0);
  assert.ok(r.carriedInterest <= profit, 'carry exceeded total profit');
  assert.equal(
    Math.round((r.lpShare + r.gpShare) * 100) / 100,
    profit,
    'LP and GP shares must reconcile to the profit',
  );
});

test('tax calendar and filing tracker return usable data', () => {
  const fns = Object.keys(calendar).filter(k => typeof calendar[k] === 'function');
  assert.ok(fns.length > 0, 'tax calendar exposes no functions');
  assert.ok(Object.keys(filingTracker).length > 0);
});

test('FATCA/CRS and jurisdiction routing modules load', () => {
  assert.ok(Object.keys(fatcaCrs).length > 0);
  assert.ok(Object.keys(jurisdictionRouter).length > 0);
  assert.ok(Object.keys(k1Generator).length > 0);
});
