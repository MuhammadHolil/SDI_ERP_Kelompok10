const mongoose = require('mongoose');
const Joi = require('joi');

const validId = (value) =>
  typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);

const schema = Joi.object({
  expectedVersion: Joi.number()
    .integer()
    .min(0)
    .strict()
    .required(),

  decision: Joi.string()
    .valid('approved', 'rejected')
    .required(),

  notes: Joi.string()
    .trim()
    .min(1)
    .max(1500)
    .required(),

  reference: Joi.when('decision', {
    is: 'approved',
    then: Joi.string().trim().min(1).max(300).required(),
    otherwise: Joi.string().trim().max(300).allow('').default(''),
  }),
}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const sendError = (res, status, message) =>
  res.status(status).json({
    success: false,
    result: null,
    message,
  });

exports.review = async function review(req, res) {
  if (!validId(req.params.id)) {
    return sendError(res, 400, 'ID milestone tidak valid.');
  }

  const { error, value } = schema.validate(req.body);

  if (error) {
    return sendError(
      res,
      400,
      'Isi keputusan dan catatan. Persetujuan wajib memiliki referensi bukti.'
    );
  }

  const Milestone = mongoose.model('Milestone');
  const Project = mongoose.model('Project');
  const Contract = mongoose.model('Contract');
  const Approval = mongoose.model('Approval');

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const milestone = await Milestone.findById(req.params.id)
        .session(session)
        .lean();

      if (!milestone) {
        fail(404, 'Milestone tidak ditemukan dalam cakupan akses Anda.');
      }

      const project = await Project.findOne({
        _id: milestone.project,
        manager: req.admin._id,
      })
        .session(session)
        .lean();

      if (!project) {
        fail(404, 'Milestone tidak ditemukan dalam cakupan akses Anda.');
      }

      const contract = await Contract.findById(project.contract)
        .session(session)
        .lean();

      if (!contract || contract.status !== 'agreed') {
        fail(409, 'Kontrak proyek belum berstatus agreed.');
      }

      const eligible =
        (milestone.status === 'planned' &&
          milestone.approvalStatus === 'draft') ||
        (milestone.status === 'revision_required' &&
          milestone.approvalStatus === 'rejected');

      if (!eligible) {
        fail(
          409,
          'Milestone ini tidak dapat diperiksa ulang pada status sekarang.'
        );
      }

      if (milestone.__v !== value.expectedVersion) {
        fail(409, 'Data milestone berubah. Muat ulang halaman terlebih dahulu.');
      }

      const decidedAt = new Date();
      const nextVersion = value.expectedVersion + 1;

      result = await Milestone.findOneAndUpdate(
        {
          _id: milestone._id,
          __v: value.expectedVersion,
          status: milestone.status,
          approvalStatus: milestone.approvalStatus,
        },
        {
          $set: {
            status:
              value.decision === 'approved'
                ? 'completed'
                : 'revision_required',
            approvalStatus: value.decision,
            verification: {
              decision: value.decision,
              notes: value.notes,
              reference: value.reference || '',
              decidedBy: req.admin._id,
              decidedAt,
            },
          },
          $inc: { __v: 1 },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!result) {
        fail(409, 'Milestone sudah berubah. Muat ulang sebelum memeriksa.');
      }

      await Approval.create(
        [
          {
            targetType: 'Milestone',
            targetId: milestone._id,
            targetRevision: nextVersion,
            step: 'pm_verification',
            requestedBy: req.admin._id,
            decidedBy: req.admin._id,
            decision: value.decision,
            notes: [
              value.notes,
              value.reference ? `Referensi: ${value.reference}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
            requestedAt: decidedAt,
            decidedAt,
          },
        ],
        { session }
      );
    });

    return res.status(200).json({
      success: true,
      result,
      message:
        value.decision === 'approved'
          ? 'Milestone berhasil diverifikasi oleh PM.'
          : 'Milestone ditandai memerlukan perbaikan.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return sendError(
        res,
        409,
        'Keputusan sudah tercatat. Muat ulang halaman.'
      );
    }

    if ([400, 403, 404, 409].includes(err.status)) {
      return sendError(res, err.status, err.message);
    }

    throw err;
  } finally {
    await session.endSession();
  }
};

exports.history = async function history(req, res) {
  if (!validId(req.params.id)) {
    return sendError(res, 400, 'ID milestone tidak valid.');
  }

  const Milestone = mongoose.model('Milestone');
  const Project = mongoose.model('Project');
  const Approval = mongoose.model('Approval');

  const milestone = await Milestone.findById(req.params.id).lean();

  if (!milestone) {
    return sendError(
      res,
      404,
      'Milestone tidak ditemukan dalam cakupan akses Anda.'
    );
  }

  const permitted = await Project.exists({
    _id: milestone.project,
    manager: req.admin._id,
  });

  if (!permitted) {
    return sendError(
      res,
      404,
      'Milestone tidak ditemukan dalam cakupan akses Anda.'
    );
  }

  const result = await Approval.find({
    targetType: 'Milestone',
    targetId: milestone._id,
    step: 'pm_verification',
  })
    .select('targetRevision decision notes decidedBy decidedAt')
    .populate('decidedBy', 'name')
    .sort({ targetRevision: -1 })
    .limit(100)
    .lean();

  return res.status(200).json({
    success: true,
    result,
    message: 'Riwayat verifikasi milestone.',
  });
};