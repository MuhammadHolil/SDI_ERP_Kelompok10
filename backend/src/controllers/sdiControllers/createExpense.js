const mongoose = require('mongoose');
const Joi = require('joi');
const currency = require('currency.js');

const ProjectAccess = mongoose.model('ProjectAccess');
const Project = mongoose.model('Project');
const Contract = mongoose.model('Contract');
const CostCategory = mongoose.model('CostCategory');
const Expense = mongoose.model('Expense');

const Vendor = mongoose.model('Vendor');

const objectId = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const schema = Joi.object({
  project: objectId,
  category: objectId,

  vendor: Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .allow(null)
  .default(null),

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

module.exports = async function createExpense(req, res) {
  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data pengeluaran belum sesuai.',
    });
  }

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
      const access = await ProjectAccess.findOneAndUpdate(
        {
          project: value.project,
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
        fail(404, 'Proyek tidak ditemukan dalam cakupan akses Anda.');
      }

      const project = await Project.findById(value.project)
        .session(session)
        .lean();

      if (!project) {
        fail(404, 'Proyek tidak ditemukan dalam cakupan akses Anda.');
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

      const contract = await Contract.findById(project.contract)
        .session(session)
        .lean();

      if (!contract || !contract.currency) {
        fail(409, 'Mata uang kontrak proyek tidak tersedia.');
      }

      const created = await Expense.create(
        [
          {
            project: project._id,
            category: value.category,
            vendor: value.vendor,
            createdBy: req.admin._id,
            transactionDate,
            description: value.description,
            amount: amount.value,
            currency: contract.currency,
            evidence: [],
            revision: 1,
            approvalStatus: 'draft',
          },
        ],
        { session }
      );

      result = created[0];
    });

    return res.status(201).json({
      success: true,
      result,
      message: 'Draft pengeluaran berhasil dibuat.',
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