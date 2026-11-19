const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculatePayment,
} = require('../src/utils/paymentRules');

test('pembayaran parsial menyisakan piutang', () => {
  assert.deepEqual(
    calculatePayment({
      total: 50000,
      credit: 0,
      amount: 20000,
    }),
    {
      credit: 20000,
      remaining: 30000,
      paymentStatus: 'partially',
    }
  );
});

test('pembayaran kedua melunasi invoice', () => {
  assert.deepEqual(
    calculatePayment({
      total: 50000,
      credit: 20000,
      amount: 30000,
    }),
    {
      credit: 50000,
      remaining: 0,
      paymentStatus: 'paid',
    }
  );
});

test('pembayaran melebihi piutang ditolak', () => {
  assert.throws(
    () =>
      calculatePayment({
        total: 50000,
        credit: 20000,
        amount: 30001,
      }),
    /melebihi/
  );
});

test('pembayaran nol dan negatif ditolak', () => {
  for (const amount of [0, -100]) {
    assert.throws(() =>
      calculatePayment({
        total: 50000,
        credit: 0,
        amount,
      })
    );
  }
});

test('pembayaran setelah lunas ditolak', () => {
  assert.throws(() =>
    calculatePayment({
      total: 50000,
      credit: 50000,
      amount: 1,
    })
  );
});

test('pecahan lebih dari dua desimal ditolak', () => {
  assert.throws(() =>
    calculatePayment({
      total: 50000,
      credit: 0,
      amount: 100.001,
    })
  );
});