const mongoose = require('mongoose');
const Joi = require('joi');

const Expense = mongoose.model('Expense');
const ProjectAccess = mongoose.model('ProjectAccess');
const Approval = mongoose.model('Approval');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const bodySchema = Joi.object({
  expectedRevision: Joi.number()
    .integer()
    .min(1)
    .strict()
    .required(),

  decision: Joi.string()
    .valid('approved', 'rejected')
    .required(),

  notes: Joi.when('decision', {
    is: 'rejected',
    then: Joi.string().trim().min(1).max(2000).required(),
    otherwise: Joi.string()
      .trim()
      .max(2000)
      .allow('')
      .default(''),
  }),
}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

module.exports = async function reviewExpense(req, res) {
  const idValidation = idSchema.validate(req.params.id);
  const bodyValidation = bodySchema.validate(req.body);

  if (idValidation.error || bodyValidation.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message:
        'Data keputusan belum sesuai. Penolakan wajib disertai catatan.',
    });
  }

  const value = bodyValidation.value;
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const expense = await Expense.findById(
        idValidation.value
      )
        .session(session)
        .lean();

      if (!expense) {
        fail(404, 'Pengeluaran tidak ditemukan dalam cakupan akses Anda.');
      }

      const access = await ProjectAccess.findOneAndUpdate(
        {
          project: expense.project,
          expenseApprovers: req.admin._id,
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

      if (String(expense.createdBy) === String(req.admin._id)) {
        fail(403, 'Anda tidak boleh memeriksa pengeluaran sendiri.');
      }

      if (expense.approvalStatus !== 'submitted') {
        fail(409, 'Hanya expense submitted yang dapat diperiksa.');
      }

      if (expense.revision !== value.expectedRevision) {
        fail(
          409,
          'Revisi pengeluaran telah berubah. Muat ulang sebelum memutuskan.'
        );
      }

      if (!expense.updatedAt) {
        fail(409, 'Waktu pengajuan pengeluaran tidak tersedia.');
      }

      if (value.decision === 'approved') {
        if (
          !Number.isFinite(expense.amount) ||
          expense.amount <= 0
        ) {
          fail(400, 'Nominal pengeluaran tidak valid.');
        }

        const evidence = expense.evidence || [];

        if (evidence.length === 0) {
          fail(400, 'Pengeluaran harus memiliki bukti.');
        }

        for (const item of evidence) {
          if (!mongoose.isObjectIdOrHexString(item.fileId)) {
            fail(400, 'Referensi bukti tidak valid.');
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
              String(expense._id)
          ) {
            fail(400, 'Berkas bukti tidak tersedia atau tidak sesuai.');
          }
        }
      }

      result = await Expense.findOneAndUpdate(
        {
          _id: expense._id,
          revision: value.expectedRevision,
          approvalStatus: 'submitted',
        },
        {
          $set: {
            approvalStatus: value.decision,
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!result) {
        fail(409, 'Pengeluaran telah berubah. Muat ulang sebelum memeriksa.');
      }

      await Approval.create(
        [
          {
            targetType: 'Expense',
            targetId: expense._id,
            targetRevision: expense.revision,
            step: 'expense_review',
            requestedBy: expense.createdBy,
            decidedBy: req.admin._id,
            decision: value.decision,
            notes: value.notes,
            requestedAt: expense.updatedAt,
            decidedAt: new Date(),
          },
        ],
        { session }
      );
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Keputusan pemeriksaan pengeluaran berhasil disimpan.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Keputusan untuk revisi pengeluaran ini sudah tersedia.',
      });
    }

    if ([400, 403, 404, 409].includes(err.status)) {
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