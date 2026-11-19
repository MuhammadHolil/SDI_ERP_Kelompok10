const { minor } = require('./paymentRules');

function calculateReversal({
  total,
  discount = 0,
  payments,
  targetId,
  currency,
}) {
  const net = minor(total) - minor(discount);

  if (net < 0) {
    throw new Error('Diskon melebihi total invoice.');
  }

  const active = payments.filter(
    (payment) => !payment.removed && !payment.isReversed
  );

  const target = active.find(
    (payment) => String(payment._id) === String(targetId)
  );

  if (!target) {
    throw new Error('Pembayaran tidak aktif atau sudah dibatalkan.');
  }

  let before = 0;
  let targetAmount = 0;

  for (const payment of active) {
    if (payment.currency !== currency || !(payment.amount > 0)) {
      throw new Error('Nominal atau mata uang pembayaran tidak valid.');
    }

    const amount = minor(payment.amount);

    if (!Number.isSafeInteger(before + amount)) {
      throw new Error('Total pembayaran melebihi batas perhitungan.');
    }

    before += amount;

    if (String(payment._id) === String(targetId)) {
      targetAmount = amount;
    }
  }

  const after = before - targetAmount;

  if (after > net) {
    throw new Error(
      'Pembayaran lain masih melebihi invoice. Periksa dan batalkan catatan keliru yang menyebabkan kelebihan.'
    );
  }

  return {
    ledgerBefore: before / 100,
    credit: after / 100,
    remaining: (net - after) / 100,
    paymentStatus:
      after === net
        ? 'paid'
        : after === 0
          ? 'unpaid'
          : 'partially',
  };
}

module.exports = { calculateReversal };