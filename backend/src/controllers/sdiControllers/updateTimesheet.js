const mongoose = require('mongoose');
const Joi = require('joi');

const Timesheet = mongoose.model('Timesheet');
const Allocation = mongoose.model('Allocation');
const Expert = mongoose.model('Expert');
const ExpertRate = mongoose.model('ExpertRate');
const Project = mongoose.model('Project');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const timestamp = Joi.string()
  .isoDate()
  .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
  .required();

const bodySchema = Joi.object({
  expectedRevision: Joi.number()
    .integer()
    .min(1)
    .strict()
    .required(),

  activity: Joi.string().trim().max(2000).required(),
  startedAt: timestamp,
  endedAt: timestamp,

  breakMinutes: Joi.number()
    .integer()
    .min(0)
    .strict()
    .required(),
}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const calendarDate = (value) =>
  new Date(value).toISOString().slice(0, 10);

const wibDate = (value) =>
  new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

module.exports = async function updateTimesheet(req, res) {
  const idValidation = idSchema.validate(req.params.id);
  const bodyValidation = bodySchema.validate(req.body);

  if (idValidation.error || bodyValidation.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data perubahan timesheet belum sesuai.',
    });
  }

  const value = bodyValidation.value;
  const startedAt = new Date(value.startedAt);
  const endedAt = new Date(value.endedAt);

  const durationMinutes =
    (endedAt.getTime() - startedAt.getTime()) / 60000;

  if (
    startedAt.getTime() % 60000 !== 0 ||
    endedAt.getTime() % 60000 !== 0 ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    value.breakMinutes >= durationMinutes
  ) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Waktu kerja atau durasi istirahat tidak valid.',
    });
  }

  const workDate = wibDate(startedAt);

  if (workDate !== wibDate(endedAt)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Satu timesheet harus berada dalam satu tanggal WIB.',
    });
  }

  const workHours = Number(
    ((durationMinutes - value.breakMinutes) / 60).toFixed(8)
  );

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

      if (timesheet.approvalStatus !== 'draft') {
        fail(409, 'Hanya timesheet draft yang dapat diedit.');
      }

      if (timesheet.revision !== value.expectedRevision) {
        fail(409, 'Revisi telah berubah. Muat ulang data sebelum mengedit.');
      }

      if (!['planned', 'active'].includes(allocation.status)) {
        fail(409, 'Status alokasi tidak mengizinkan perubahan timesheet.');
      }

      const project = await Project.findById(allocation.project)
        .session(session)
        .lean();

      if (!project) {
        fail(409, 'Proyek alokasi tidak tersedia.');
      }

      if (
        workDate < calendarDate(allocation.startDate) ||
        workDate > calendarDate(allocation.endDate) ||
        workDate < calendarDate(project.startDate) ||
        workDate > calendarDate(project.endDate)
      ) {
        fail(400, 'Tanggal kerja harus dalam periode alokasi dan proyek.');
      }

      const rates = await ExpertRate.find({
        expert: expert._id,
      })
        .session(session)
        .lean();

      const applicableRates = rates.filter((rate) => {
        const from = calendarDate(rate.effectiveFrom);
        const to = rate.effectiveTo
          ? calendarDate(rate.effectiveTo)
          : null;

        return from <= workDate && (to === null || to >= workDate);
      });

      if (applicableRates.length !== 1) {
        fail(
          409,
          'Harus tersedia tepat satu tarif yang berlaku pada tanggal kerja.'
        );
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

      const rate = applicableRates[0];

      result = await Timesheet.findOneAndUpdate(
        {
          _id: timesheet._id,
          revision: value.expectedRevision,
          approvalStatus: 'draft',
        },
        {
          $set: {
            activity: value.activity,
            startedAt,
            endedAt,
            breakMinutes: value.breakMinutes,
            workHours,
            rate: rate._id,
            hourlyCostSnapshot: rate.hourlyCost,
            currency: rate.currency,
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
      message: 'Draft timesheet berhasil diperbarui.',
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