const mongoose = require('mongoose');
const Joi = require('joi');

const Project = mongoose.model('Project');
const ProjectAccess = mongoose.model('ProjectAccess');
const Admin = mongoose.model('Admin');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .lowercase()
  .required();

const accountIds = Joi.array()
  .items(idSchema)
  .unique()
  .max(200)
  .required();

const bodySchema = Joi.object({
  teamMembers: accountIds,
  expenseApprovers: accountIds,
}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

exports.update = async (req, res) => {
  const idValidation = idSchema.validate(req.params.id);
  const bodyValidation = bodySchema.validate(req.body);

  if (idValidation.error || bodyValidation.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message:
        'Kirim ID proyek yang valid serta daftar teamMembers dan expenseApprovers tanpa ID duplikat.',
    });
  }

  const value = bodyValidation.value;
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const project = await Project.findOneAndUpdate(
        {
          _id: idValidation.value,
          manager: req.admin._id,
        },
        {
          $inc: { __v: 1 },
        },
        {
          new: true,
          session,
        }
      ).lean();

      if (!project) {
        fail(404, 'Proyek tidak ditemukan dalam cakupan akses Anda.');
      }

      const memberCount = await Admin.countDocuments({
        _id: { $in: value.teamMembers },
        enabled: true,
        removed: false,
        businessRoles: 'project_team',
      }).session(session);

      if (memberCount !== value.teamMembers.length) {
        fail(
          400,
          'Setiap anggota tim harus aktif dan memiliki peran project_team.'
        );
      }

      const approverCount = await Admin.countDocuments({
        _id: { $in: value.expenseApprovers },
        enabled: true,
        removed: false,
        businessRoles: 'expense_approver',
      }).session(session);

      if (approverCount !== value.expenseApprovers.length) {
        fail(
          400,
          'Setiap pemeriksa harus aktif dan memiliki peran expense_approver.'
        );
      }

      result = await ProjectAccess.findOneAndUpdate(
        {
          project: project._id,
        },
        {
          $set: {
            teamMembers: value.teamMembers,
            expenseApprovers: value.expenseApprovers,
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
          session,
        }
      );
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Pengaturan akses proyek berhasil disimpan.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Pengaturan akses berubah. Muat ulang dan coba kembali.',
      });
    }

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

exports.read = async (req, res) => {
  const { error, value } = idSchema.validate(req.params.id);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID proyek tidak valid.',
    });
  }

  const project = await Project.exists({
    _id: value,
    manager: req.admin._id,
  });

  if (!project) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Proyek tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  const saved = await ProjectAccess.findOne({
    project: value,
  })
    .select('project teamMembers expenseApprovers')
    .lean();

  return res.status(200).json({
    success: true,
    result: saved || {
      project: value,
      teamMembers: [],
      expenseApprovers: [],
    },
    message: saved
      ? 'Pengaturan akses proyek berhasil dibaca.'
      : 'Pengaturan akses proyek belum dibuat.',
  });
};