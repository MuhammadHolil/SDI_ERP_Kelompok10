const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateReversal,
} = require('../src/utils/paymentReversalRules');

const payment = (_id, amount, extra = {}) => ({
  _id,
  amount,
  currency: 'IDR',
  removed: false,
  isReversed: false,
  ...extra,
});

test('membatalkan pembayaran tunggal mengembalikan piutang', () => {
  const result = calculateReversal({
    total: 50000,
    payments: [payment('a', 20000)],
    targetId: 'a',
    currency: 'IDR',
  });

  assert.equal(result.credit, 0);
  assert.equal(result.remaining, 50000);
  assert.equal(result.paymentStatus, 'unpaid');
});

test('membatalkan salah satu pembayaran mempertahankan pembayaran lain', () => {
  const result = calculateReversal({
    total: 50000,
    payments: [
      payment('a', 20000),
      payment('b', 30000),
    ],
    targetId: 'a',
    currency: 'IDR',
  });

  assert.equal(result.credit, 30000);
  assert.equal(result.remaining, 20000);
  assert.equal(result.paymentStatus, 'partially');
});

test('catatan kelebihan pembayaran dapat dibatalkan', () => {
  const result = calculateReversal({
    total: 50000,
    payments: [payment('a', 60000)],
    targetId: 'a',
    currency: 'IDR',
  });

  assert.equal(result.credit, 0);
  assert.equal(result.remaining, 50000);
});

test('pembayaran yang sudah dibatalkan tidak dihitung lagi', () => {
  const result = calculateReversal({
    total: 50000,
    payments: [
      payment('a', 20000),
      payment('b', 30000, { isReversed: true }),
    ],
    targetId: 'a',
    currency: 'IDR',
  });

  assert.equal(result.ledgerBefore, 20000);
  assert.equal(result.credit, 0);
});

test('pembatalan ulang ditolak', () => {
  assert.throws(() =>
    calculateReversal({
      total: 50000,
      payments: [
        payment('a', 20000, { isReversed: true }),
      ],
      targetId: 'a',
      currency: 'IDR',
    })
  );
});

test('mata uang pembayaran berbeda ditolak', () => {
  assert.throws(() =>
    calculateReversal({
      total: 50000,
      payments: [payment('a', 20000, { currency: 'USD' })],
      targetId: 'a',
      currency: 'IDR',
    })
  );
});