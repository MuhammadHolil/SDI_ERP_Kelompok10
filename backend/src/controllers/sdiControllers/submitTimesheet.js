const mongoose = require('mongoose');
const Joi = require('joi');

const Expert = mongoose.model('Expert');
const Allocation = mongoose.model('Allocation');
const Timesheet = mongoose.model('Timesheet');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const bodySchema = Joi.object({}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

module.exports = async function submitTimesheet(req, res) {
  const idValidation = idSchema.validate(req.params.id);
  const bodyValidation = bodySchema.validate(req.body || {});

  if (idValidation.error || bodyValidation.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID timesheet atau isi permintaan tidak valid.',
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

      // Menyelaraskan submit dengan create, edit, dan revisi
      // untuk tenaga ahli yang sama.
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

      if (timesheet.approvalStatus !== 'draft') {
        fail(409, 'Hanya timesheet draft yang dapat diajukan.');
      }

      if (!['planned', 'active'].includes(allocation.status)) {
        fail(409, 'Status alokasi tidak mengizinkan pengajuan timesheet.');
      }

      const startedAt = new Date(timesheet.startedAt);
      const endedAt = new Date(timesheet.endedAt);

      const durationMinutes =
        (endedAt.getTime() - startedAt.getTime()) / 60000;

      if (
        !Number.isFinite(durationMinutes) ||
        !Number.isInteger(durationMinutes) ||
        durationMinutes <= 0 ||
        !Number.isInteger(timesheet.breakMinutes) ||
        timesheet.breakMinutes < 0 ||
        timesheet.breakMinutes >= durationMinutes ||
        !Number.isFinite(timesheet.workHours) ||
        timesheet.workHours <= 0 ||
        !Number.isFinite(timesheet.hourlyCostSnapshot) ||
        timesheet.hourlyCostSnapshot <= 0
      ) {
        fail(400, 'Jam kerja atau tarif timesheet tidak valid.');
      }

      const calculatedHours = Number(
        ((durationMinutes - timesheet.breakMinutes) / 60)
          .toFixed(8)
      );

      if (Math.abs(calculatedHours - timesheet.workHours) > 0.00000001) {
        fail(400, 'Jam kerja bersih tidak sesuai durasi timesheet.');
      }

      const allocationIds = await Allocation.distinct('_id', {
        expert: expert._id,
      }).session(session);

      const overlap = await Timesheet.exists({
        _id: { $ne: timesheet._id },
        allocation: { $in: allocationIds },
        approvalStatus: { $in: ['draft', 'submitted', 'approved'] },
        startedAt: { $lt: endedAt },
        endedAt: { $gt: startedAt },
      }).session(session);

      if (overlap) {
        fail(409, 'Waktu kerja bertumpuk dengan timesheet yang sudah ada.');
      }

      result = await Timesheet.findOneAndUpdate(
        {
          _id: timesheet._id,
          revision: timesheet.revision,
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
        fail(409, 'Timesheet telah berubah. Muat ulang sebelum mengajukan.');
      }
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Timesheet berhasil diajukan.',
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