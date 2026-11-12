const mongoose = require('mongoose');
const Joi = require('joi');

const Allocation = mongoose.model('Allocation');
const Expert = mongoose.model('Expert');
const ExpertRate = mongoose.model('ExpertRate');
const Project = mongoose.model('Project');
const Timesheet = mongoose.model('Timesheet');

const timestamp = Joi.string()
  .isoDate()
  .pattern(/(?:Z|[+-]\d{2}:\d{2})$/)
  .required();

const schema = Joi.object({
  allocation: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/)
    .required(),

  activity: Joi.string().trim().max(2000).required(),

  startedAt: timestamp,
  endedAt: timestamp,

  breakMinutes: Joi.number()
    .integer()
    .min(0)
    .strict()
    .default(0),
}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

// Tanggal kerja mengikuti WIB.
const wibDate = (value) =>
  new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

// Kolom tanggal proyek, alokasi, dan tarif diperlakukan
// sebagai tanggal kalender, sesuai input YYYY-MM-DD.
const calendarDate = (value) =>
  new Date(value).toISOString().slice(0, 10);

module.exports = async function createTimesheet(req, res) {
  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data timesheet belum sesuai.',
    });
  }

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
      message:
        'Gunakan waktu dalam menit penuh, waktu selesai setelah mulai, dan istirahat kurang dari durasi kerja.',
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
      const allocation = await Allocation.findById(
        value.allocation
      )
        .session(session)
        .lean();

      if (!allocation) {
        fail(404, 'Alokasi tidak ditemukan dalam cakupan akses Anda.');
      }

      // Pembaruan ini menyelaraskan pencatatan waktu untuk
      // tenaga ahli yang sama, termasuk antarproyek.
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
        fail(404, 'Alokasi tidak ditemukan dalam cakupan akses Anda.');
      }

      if (!['planned', 'active'].includes(allocation.status)) {
        fail(409, 'Status alokasi tidak mengizinkan pencatatan timesheet.');
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

      const rate = applicableRates[0];

      const allocationIds = await Allocation.distinct('_id', {
        expert: expert._id,
      }).session(session);

      const overlappingTimesheet = await Timesheet.exists({
        allocation: { $in: allocationIds },
        approvalStatus: { $in: ['draft', 'submitted', 'approved'] },
        startedAt: { $lt: endedAt },
        endedAt: { $gt: startedAt },
      }).session(session);

      if (overlappingTimesheet) {
        fail(409, 'Waktu kerja bertumpuk dengan timesheet yang sudah ada.');
      }

      const created = await Timesheet.create(
        [
          {
            allocation: allocation._id,
            rate: rate._id,
            activity: value.activity,
            startedAt,
            endedAt,
            breakMinutes: value.breakMinutes,
            workHours,
            hourlyCostSnapshot: rate.hourlyCost,
            currency: rate.currency,
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
      message: 'Draft timesheet berhasil dibuat.',
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