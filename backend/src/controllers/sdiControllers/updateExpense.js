const mongoose = require('mongoose');
const Joi = require('joi');
const currency = require('currency.js');

const Expense = mongoose.model('Expense');
const Project = mongoose.model('Project');
const ProjectAccess = mongoose.model('ProjectAccess');
const CostCategory = mongoose.model('CostCategory');
const Vendor = mongoose.model('Vendor');

const objectId = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const schema = Joi.object({
  expectedRevision: Joi.number()
    .integer()
    .min(1)
    .strict()
    .required(),

  category: objectId,

  vendor: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/)
    .allow(null)
    .required(),

  transactionDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),

  description: Joi.string()
    .trim()
    .max(2000)
    .required(),

  amount: Joi.number()
    .positive()
    .precision(2)
    .strict()
    .required(),
}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

module.exports = async function updateExpense(req, res) {
  const idValidation = objectId.validate(req.params.id);
  const bodyValidation = schema.validate(req.body);

  if (idValidation.error || bodyValidation.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data perubahan pengeluaran belum sesuai.',
    });
  }

  const value = bodyValidation.value;

  const transactionDate = new Date(
    `${value.transactionDate}T00:00:00.000Z`
  );

  if (
    Number.isNaN(transactionDate.getTime()) ||
    transactionDate.toISOString().slice(0, 10) !==
      value.transactionDate
  ) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Tanggal transaksi tidak valid.',
    });
  }

  const amount = currency(value.amount, { precision: 2 });

  if (!Number.isSafeInteger(amount.intValue)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Nominal melebihi batas perhitungan yang didukung.',
    });
  }

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const expense = await Expense.findOne({
        _id: idValidation.value,
        createdBy: req.admin._id,
      })
        .session(session)
        .lean();

      if (!expense) {
        fail(404, 'Pengeluaran tidak ditemukan dalam cakupan akses Anda.');
      }

      const access = await ProjectAccess.findOneAndUpdate(
        {
          project: expense.project,
          teamMembers: req.admin._id,
        },
        {
          $inc: { __v: 1 },
        },
        {
          new: true,
          session,
        }
      ).lean();

      if (!access) {
        fail(404, 'Pengeluaran tidak ditemukan dalam cakupan akses Anda.');
      }

      if (expense.approvalStatus !== 'draft') {
        fail(409, 'Hanya expense draft yang dapat diedit.');
      }

      if (expense.revision !== value.expectedRevision) {
        fail(409, 'Revisi telah berubah. Muat ulang data sebelum mengedit.');
      }

      const project = await Project.findById(expense.project)
        .session(session)
        .lean();

      if (!project) {
        fail(409, 'Proyek pengeluaran tidak tersedia.');
      }

      const startDate = new Date(project.startDate)
        .toISOString()
        .slice(0, 10);

      const endDate = new Date(project.endDate)
        .toISOString()
        .slice(0, 10);

      if (
        value.transactionDate < startDate ||
        value.transactionDate > endDate
      ) {
        fail(400, 'Tanggal pengeluaran harus dalam periode proyek.');
      }

      const category = await CostCategory.exists({
        _id: value.category,
        active: true,
      }).session(session);

      if (!category) {
        fail(400, 'Kategori biaya harus tersedia dan aktif.');
      }

      if (value.vendor !== null) {
        const vendor = await Vendor.exists({
          _id: value.vendor,
          active: true,
        }).session(session);

        if (!vendor) {
          fail(400, 'Vendor harus tersedia dan aktif.');
        }
      }

      result = await Expense.findOneAndUpdate(
        {
          _id: expense._id,
          createdBy: req.admin._id,
          approvalStatus: 'draft',
          revision: value.expectedRevision,
        },
        {
          $set: {
            category: value.category,
            vendor: value.vendor,
            transactionDate,
            description: value.description,
            amount: amount.value,
          },
          $inc: {
            revision: 1,
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!result) {
        fail(409, 'Pengeluaran telah berubah. Muat ulang data.');
      }
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Draft pengeluaran berhasil diperbarui.',
    });
  } catch (err) {
    if ([400, 404, 409].includes(err.status)) {
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