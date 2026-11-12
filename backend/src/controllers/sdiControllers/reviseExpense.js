const mongoose = require('mongoose');
const Joi = require('joi');

const Expense = mongoose.model('Expense');
const ProjectAccess = mongoose.model('ProjectAccess');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const bodySchema = Joi.object({
  expectedRevision: Joi.number()
    .integer()
    .min(1)
    .strict()
    .required(),
}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

module.exports = async function reviseExpense(req, res) {
  const idValidation = idSchema.validate(req.params.id);
  const bodyValidation = bodySchema.validate(req.body);

  if (idValidation.error || bodyValidation.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID atau nomor revisi pengeluaran tidak valid.',
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

      if (expense.approvalStatus !== 'rejected') {
        fail(409, 'Hanya expense rejected yang dapat dibuka untuk perbaikan.');
      }

      if (
        expense.revision !==
        bodyValidation.value.expectedRevision
      ) {
        fail(409, 'Revisi telah berubah. Muat ulang data.');
      }

      result = await Expense.findOneAndUpdate(
        {
          _id: expense._id,
          createdBy: req.admin._id,
          approvalStatus: 'rejected',
          revision: bodyValidation.value.expectedRevision,
        },
        {
          $set: {
            approvalStatus: 'draft',
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
      message: 'Pengeluaran dibuka sebagai draft revisi baru.',
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