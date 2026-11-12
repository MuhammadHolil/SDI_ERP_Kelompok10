const mongoose = require('mongoose');
const Joi = require('joi');

const Expense = mongoose.model('Expense');
const ProjectAccess = mongoose.model('ProjectAccess');
const CostCategory = mongoose.model('CostCategory');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const bodySchema = Joi.object({}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

module.exports = async function submitExpense(req, res) {
  const idValidation = idSchema.validate(req.params.id);
  const bodyValidation = bodySchema.validate(req.body || {});

  if (idValidation.error || bodyValidation.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID pengeluaran atau isi permintaan tidak valid.',
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
        fail(409, 'Hanya expense draft yang dapat diajukan.');
      }

      if (!Number.isFinite(expense.amount) || expense.amount <= 0) {
        fail(400, 'Nominal pengeluaran harus lebih besar dari nol.');
      }

      const category = await CostCategory.exists({
        _id: expense.category,
        active: true,
      }).session(session);

      if (!category) {
        fail(400, 'Kategori biaya harus tersedia dan aktif.');
      }

      const evidence = expense.evidence || [];

      if (evidence.length === 0) {
        fail(400, 'Unggah minimal satu bukti sebelum mengajukan expense.');
      }

      if (evidence.length > 5) {
        fail(400, 'Jumlah bukti melebihi batas.');
      }

      for (const item of evidence) {
        if (!mongoose.isObjectIdOrHexString(item.fileId)) {
          fail(400, 'Referensi berkas bukti tidak valid.');
        }

        const storedFile = await mongoose.connection.db
          .collection('expenseEvidence.files')
          .findOne(
            { _id: new mongoose.Types.ObjectId(item.fileId) },
            { session }
          );

        if (
          !storedFile ||
          storedFile.length <= 0 ||
          storedFile.length !== item.size ||
          String(storedFile.metadata?.expense) !==
            String(expense._id) ||
          String(storedFile.metadata?.uploadedBy) !==
            String(expense.createdBy)
        ) {
          fail(400, 'Berkas bukti tidak tersedia atau tidak sesuai expense.');
        }
      }

      result = await Expense.findOneAndUpdate(
        {
          _id: expense._id,
          createdBy: req.admin._id,
          revision: expense.revision,
          approvalStatus: 'draft',
        },
        {
          $set: {
            approvalStatus: 'submitted',
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!result) {
        fail(409, 'Pengeluaran telah berubah. Muat ulang sebelum mengajukan.');
      }
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Pengeluaran berhasil diajukan.',
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