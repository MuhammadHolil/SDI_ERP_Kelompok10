const cents = (value) => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error('Nilai penagihan harus berupa angka positif.');
  }

  const result = Math.round(value * 100);

  if (
    !Number.isSafeInteger(result) ||
    Math.abs(result / 100 - value) > 1e-8
  ) {
    throw new Error(
      'Nominal maksimal dua angka desimal dan harus dalam batas aman.'
    );
  }

  return result;
};

function checkBillable({
  milestone,
  project,
  contract,
  financeId,
}) {
  if (String(project.manager) === String(financeId)) {
    throw new Error(
      'PM pengelola proyek tidak boleh menerbitkan invoice proyeknya sendiri.'
    );
  }

  if (
    String(milestone.project) !== String(project._id) ||
    String(project.contract) !== String(contract._id)
  ) {
    throw new Error(
      'Hubungan milestone, proyek, dan kontrak tidak sesuai.'
    );
  }

  if (contract.status !== 'agreed') {
    throw new Error('Kontrak belum agreed.');
  }

  if (
    milestone.status !== 'completed' ||
    milestone.approvalStatus !== 'approved' ||
    milestone.verification?.decision !== 'approved' ||
    !milestone.verification?.reference?.trim()
  ) {
    throw new Error(
      'Milestone belum memenuhi verifikasi internal PM.'
    );
  }

  if (milestone.billingInvoice) {
    throw new Error('Milestone sudah memiliki invoice.');
  }

  if (!/^[A-Z]{3}$/.test(contract.currency || '')) {
    throw new Error('Mata uang kontrak belum valid.');
  }

  const terms = contract.billingTerms || [];

  if (
    !terms.length ||
    new Set(terms.map((term) => term.code)).size !== terms.length
  ) {
    throw new Error(
      'Termin kontrak kosong atau memiliki kode ganda.'
    );
  }

  const term = terms.find(
    (item) => item.code === milestone.billingTermCode
  );

  if (!term) {
    throw new Error(
      'Termin milestone tidak ditemukan dalam kontrak.'
    );
  }

  const amountCents = cents(milestone.billingAmount);

  if (amountCents > cents(term.amount)) {
    throw new Error(
      'Nilai milestone melebihi termin kontrak.'
    );
  }

  const termsTotal = terms.reduce(
    (sum, item) => sum + cents(item.amount),
    0
  );

  if (termsTotal !== cents(contract.contractValue)) {
    throw new Error(
      'Total termin tidak sesuai nilai kontrak.'
    );
  }

  return amountCents / 100;
}

module.exports = { cents, checkBillable };
