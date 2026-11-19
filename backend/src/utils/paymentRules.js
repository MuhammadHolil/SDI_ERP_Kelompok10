function minor(value) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error('Nominal tidak valid.');
  }

  const result = Math.round(value * 100);

  if (
    !Number.isSafeInteger(result) ||
    Math.abs(result / 100 - value) > 1e-8
  ) {
    throw new Error('Nominal maksimal dua angka desimal.');
  }

  return result;
}

function calculatePayment({
  total,
  discount = 0,
  credit = 0,
  amount,
}) {
  const due = minor(total) - minor(discount);
  const paid = minor(credit);
  const incoming = minor(amount);

  if (due < 0 || paid > due) {
    throw new Error('Saldo invoice tidak konsisten.');
  }

  if (incoming <= 0) {
    throw new Error('Pembayaran harus lebih dari nol.');
  }

  if (incoming > due - paid) {
    throw new Error('Pembayaran melebihi sisa piutang.');
  }

  const nextCredit = paid + incoming;

  return {
    credit: nextCredit / 100,
    remaining: (due - nextCredit) / 100,
    paymentStatus: nextCredit === due ? 'paid' : 'partially',
  };
}

module.exports = { minor, calculatePayment };