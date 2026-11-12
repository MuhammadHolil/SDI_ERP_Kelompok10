const mongoose = require('mongoose');
const Joi = require('joi');

const Timesheet = mongoose.model('Timesheet');
const Allocation = mongoose.model('Allocation');
const Project = mongoose.model('Project');
const Expert = mongoose.model('Expert');
const Approval = mongoose.model('Approval');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const bodySchema = Joi.object({
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

module.exports = async function reviewTimesheet(req, res) {
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

      const project = await Project.findOne({
        _id: allocation.project,
        manager: req.admin._id,
      })
        .session(session)
        .lean();

      if (!project) {
        fail(404, 'Timesheet tidak ditemukan dalam cakupan akses Anda.');
      }

      const expert = await Expert.findById(allocation.expert)
        .session(session)
        .lean();

      if (!expert) {
        fail(409, 'Profil tenaga ahli timesheet tidak tersedia.');
      }

      if (String(expert.user) === String(req.admin._id)) {
        fail(403, 'Anda tidak boleh memeriksa timesheet sendiri.');
      }

      if (timesheet.approvalStatus !== 'submitted') {
        fail(409, 'Hanya timesheet submitted yang dapat diperiksa.');
      }

      if (!timesheet.updatedAt) {
        fail(409, 'Waktu pengajuan timesheet tidak tersedia.');
      }

      result = await Timesheet.findOneAndUpdate(
        {
          _id: timesheet._id,
          revision: timesheet.revision,
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
        fail(409, 'Timesheet telah berubah. Muat ulang sebelum memeriksa.');
      }

      await Approval.create(
        [
          {
            targetType: 'Timesheet',
            targetId: timesheet._id,
            targetRevision: timesheet.revision,
            step: 'pm_review',
            requestedBy: expert.user,
            decidedBy: req.admin._id,
            decision: value.decision,
            notes: value.notes,
            requestedAt: timesheet.updatedAt,
            decidedAt: new Date(),
          },
        ],
        { session }
      );
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Keputusan pemeriksaan timesheet berhasil disimpan.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Keputusan untuk revisi timesheet ini sudah tersedia.',
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