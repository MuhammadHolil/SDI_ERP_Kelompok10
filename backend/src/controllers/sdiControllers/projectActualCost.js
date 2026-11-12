const mongoose = require('mongoose');
const Joi = require('joi');
const currency = require('currency.js');

const Project = mongoose.model('Project');
const Contract = mongoose.model('Contract');
const Allocation = mongoose.model('Allocation');
const Timesheet = mongoose.model('Timesheet');
const Expense = mongoose.model('Expense');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const moneyFromMinor = (value) =>
  currency(value, {
    fromCents: true,
    precision: 2,
  }).value;

const addMinor = (current, amount) => {
  if (
    !Number.isSafeInteger(amount) ||
    !Number.isSafeInteger(current + amount)
  ) {
    fail(409, 'Nilai biaya melebihi batas perhitungan yang didukung.');
  }

  return current + amount;
};

module.exports = async function projectActualCost(req, res) {
  const { error, value } = idSchema.validate(req.params.id);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID proyek tidak valid.',
    });
  }

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const project = await Project.findOne({
        _id: value,
        manager: req.admin._id,
      })
        .session(session)
        .lean();

      if (!project) {
        fail(404, 'Proyek tidak ditemukan dalam cakupan akses Anda.');
      }

      const contract = await Contract.findById(project.contract)
        .session(session)
        .lean();

      if (!contract || !contract.currency) {
        fail(409, 'Mata uang kontrak proyek tidak tersedia.');
      }

      const allocationIds = await Allocation.distinct('_id', {
        project: project._id,
      }).session(session);

      const timesheets = await Timesheet.find({
        allocation: { $in: allocationIds },
        approvalStatus: 'approved',
      })
        .session(session)
        .lean();

      const expenses = await Expense.find({
        project: project._id,
        approvalStatus: 'approved',
      })
        .session(session)
        .lean();

      let laborMinor = 0;
      let expenseMinor = 0;
      let approvedHours = 0;

      for (const item of timesheets) {
        if (
          !Number.isFinite(item.workHours) ||
          item.workHours <= 0 ||
          !Number.isFinite(item.hourlyCostSnapshot) ||
          item.hourlyCostSnapshot <= 0
        ) {
          fail(409, 'Jam atau tarif timesheet approved tidak valid.');
        }

        if (item.currency !== contract.currency) {
          fail(409, 'Mata uang timesheet berbeda dari kontrak.');
        }

        const amount = currency(item.hourlyCostSnapshot, {
          precision: 2,
        }).multiply(item.workHours);

        laborMinor = addMinor(laborMinor, amount.intValue);
        approvedHours += item.workHours;
      }

      for (const item of expenses) {
        if (!Number.isFinite(item.amount) || item.amount <= 0) {
          fail(409, 'Nominal expense approved tidak valid.');
        }

        if (item.currency !== contract.currency) {
          fail(409, 'Mata uang expense berbeda dari kontrak.');
        }

        const amount = currency(item.amount, { precision: 2 });

        expenseMinor = addMinor(expenseMinor, amount.intValue);
      }

      const totalMinor = addMinor(laborMinor, expenseMinor);

      result = {
        project: project._id,
        projectCode: project.code,
        currency: contract.currency,
        approvedTimesheetCount: timesheets.length,
        approvedExpenseCount: expenses.length,
        approvedHours: Number(approvedHours.toFixed(8)),
        laborCost: moneyFromMinor(laborMinor),
        expenseCost: moneyFromMinor(expenseMinor),
        totalActualCost: moneyFromMinor(totalMinor),
      };
    }, {
      readConcern: { level: 'snapshot' },
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Biaya aktual proyek berhasil dihitung.',
    });
  } catch (err) {
    if ([404, 409].includes(err.status)) {
      return res.status(err.status).json({
        success: false,
        result: null,
        message: err.message,
      });
    }

    throw err;
  } finally {
    await session.endSession();
  }
};