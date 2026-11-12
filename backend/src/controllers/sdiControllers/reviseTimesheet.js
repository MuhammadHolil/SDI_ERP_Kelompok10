const mongoose = require('mongoose');
const Joi = require('joi');

const Timesheet = mongoose.model('Timesheet');
const Allocation = mongoose.model('Allocation');
const Expert = mongoose.model('Expert');

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

module.exports = async function reviseTimesheet(req, res) {
  const idValidation = idSchema.validate(req.params.id);
  const bodyValidation = bodySchema.validate(req.body);

  if (idValidation.error || bodyValidation.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID atau nomor revisi timesheet tidak valid.',
    });
  }

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const timesheet = await Timesheet.findById(
        idValidation.value
      )
        .session(session)
        .lean();

      if (!timesheet) {
        fail(404, 'Timesheet tidak ditemukan dalam cakupan akses Anda.');
      }

      const allocation = await Allocation.findById(
        timesheet.allocation
      )
        .session(session)
        .lean();

      if (!allocation) {
        fail(404, 'Timesheet tidak ditemukan dalam cakupan akses Anda.');
      }

      const expert = await Expert.findOneAndUpdate(
        {
          _id: allocation.expert,
          user: req.admin._id,
          active: true,
        },
        {
          $inc: { __v: 1 },
        },
        {
          new: true,
          session,
        }
      ).lean();

      if (!expert) {
        fail(404, 'Timesheet tidak ditemukan dalam cakupan akses Anda.');
      }

      if (!['planned', 'active'].includes(allocation.status)) {
        fail(409, 'Status alokasi tidak mengizinkan perbaikan timesheet.');
      }

      if (timesheet.approvalStatus !== 'rejected') {
        fail(409, 'Hanya timesheet rejected yang dapat dibuka untuk perbaikan.');
      }

      if (
        timesheet.revision !==
        bodyValidation.value.expectedRevision
      ) {
        fail(409, 'Revisi telah berubah. Muat ulang data.');
      }

      result = await Timesheet.findOneAndUpdate(
        {
          _id: timesheet._id,
          revision: bodyValidation.value.expectedRevision,
          approvalStatus: 'rejected',
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
        fail(409, 'Timesheet telah berubah. Muat ulang data.');
      }
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Timesheet dibuka sebagai draft revisi baru.',
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