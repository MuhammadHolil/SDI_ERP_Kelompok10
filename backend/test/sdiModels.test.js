const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Service = require('../src/models/sdiModels/Service');
const Timesheet = require('../src/models/sdiModels/Timesheet');
const Expense = require('../src/models/sdiModels/Expense');

const objectId = () => new mongoose.Types.ObjectId();

const validTimesheet = () =>
  new Timesheet({
    allocation: objectId(),
    rate: objectId(),
    activity: 'Analisis kebutuhan',
    startedAt: new Date('2026-11-14T02:00:00.000Z'),
    endedAt: new Date('2026-11-14T06:00:00.000Z'),
    breakMinutes: 0,
    workHours: 4,
    hourlyCostSnapshot: 200000,
    currency: 'IDR',
    revision: 1,
    approvalStatus: 'draft',
  });

const validExpense = () =>
  new Expense({
    project: objectId(),
    category: objectId(),
    createdBy: objectId(),
    transactionDate: new Date('2026-11-14T00:00:00.000Z'),
    description: 'Biaya perjalanan proyek',
    amount: 500000,
    currency: 'IDR',
    approvalStatus: 'draft',
  });

test('layanan dengan data lengkap valid', () => {
  const service = new Service({
    code: 'IMPLEMENTASI_ERP',
    name: 'Implementasi Sistem ERP',
    unit: 'paket',
  });

  assert.equal(service.validateSync(), undefined);
});

test('layanan tanpa nama ditolak', () => {
  const service = new Service({
    code: 'UJI_TANPA_NAMA',
    unit: 'paket',
  });

  assert.ok(service.validateSync().errors.name);
});

test('timesheet dengan waktu dan jam kerja valid', () => {
  assert.equal(validTimesheet().validateSync(), undefined);
});

test('timesheet dengan waktu selesai sebelum mulai ditolak', () => {
  const timesheet = validTimesheet();
  timesheet.endedAt = new Date('2026-11-14T01:00:00.000Z');

  assert.ok(timesheet.validateSync().errors.endedAt);
});

test('timesheet dengan istirahat negatif ditolak', () => {
  const timesheet = validTimesheet();
  timesheet.breakMinutes = -1;

  assert.ok(timesheet.validateSync().errors.breakMinutes);
});

test('timesheet dengan jam kerja nol ditolak', () => {
  const timesheet = validTimesheet();
  timesheet.workHours = 0;

  assert.ok(timesheet.validateSync().errors.workHours);
});

test('expense dengan nominal valid', () => {
  assert.equal(validExpense().validateSync(), undefined);
});

test('expense dengan nominal nol ditolak', () => {
  const expense = validExpense();
  expense.amount = 0;

  assert.ok(expense.validateSync().errors.amount);
});