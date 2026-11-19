const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cents,
  checkBillable,
} = require('../src/utils/billingRules');

const data = () => ({
  financeId: 'finance',
  project: {
    _id: 'project',
    manager: 'pm',
    contract: 'contract',
  },
  contract: {
    _id: 'contract',
    status: 'agreed',
    currency: 'IDR',
    contractValue: 100000,
    billingTerms: [
      { code: 'DP', amount: 50000 },
      { code: 'AKHIR', amount: 50000 },
    ],
  },
  milestone: {
    project: 'project',
    status: 'completed',
    approvalStatus: 'approved',
    billingTermCode: 'DP',
    billingAmount: 50000,
    verification: {
      decision: 'approved',
      reference: 'Dokumen uji',
    },
  },
});

test('milestone terverifikasi menghasilkan nilai termin', () => {
  assert.equal(checkBillable(data()), 50000);
});

test('milestone belum disetujui ditolak', () => {
  const value = data();
  value.milestone.approvalStatus = 'draft';
  assert.throws(() => checkBillable(value), /verifikasi/);
});

test('milestone sudah ditagihkan ditolak', () => {
  const value = data();
  value.milestone.billingInvoice = 'invoice';
  assert.throws(() => checkBillable(value), /memiliki invoice/);
});

test('PM tidak boleh menerbitkan invoice sendiri', () => {
  const value = data();
  value.financeId = 'pm';
  assert.throws(() => checkBillable(value), /sendiri/);
});

test('nilai milestone melebihi termin ditolak', () => {
  const value = data();
  value.milestone.billingAmount = 50001;
  assert.throws(() => checkBillable(value), /melebihi/);
});

test('total termin tidak cocok dengan kontrak ditolak', () => {
  const value = data();
  value.contract.contractValue = 110000;
  assert.throws(() => checkBillable(value), /Total termin/);
});

test('referensi verifikasi kosong ditolak', () => {
  const value = data();
  value.milestone.verification.reference = ' ';
  assert.throws(() => checkBillable(value), /verifikasi/);
});

test('hubungan proyek tidak sesuai ditolak', () => {
  const value = data();
  value.milestone.project = 'other';
  assert.throws(() => checkBillable(value), /Hubungan/);
});

test('nominal negatif dan pecahan lebih dua desimal ditolak', () => {
  assert.throws(() => cents(-1));
  assert.throws(() => cents(1.001));
});