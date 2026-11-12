const mongoose = require('mongoose');
const Joi = require('joi');

const schema = Joi.object({
  code: Joi.string().trim().max(100).required(),
  name: Joi.string().trim().max(200).required(),
  contract: Joi.string().hex().length(24).required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
});

module.exports = async function createProject(req, res) {
  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data proyek belum sesuai.',
      details: error.details.map((item) => ({
        field: item.path.join('.'),
        code: item.type,
      })),
    });
  }

  const Contract = mongoose.model('Contract');
  const Project = mongoose.model('Project');

  const contract = await Contract.findById(value.contract).lean();

  if (!contract) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Kontrak tidak ditemukan.',
    });
  }

  if (contract.status !== 'agreed') {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'Proyek hanya dapat dibuat dari kontrak yang disepakati.',
    });
  }

  try {
    const project = await Project.create({
      code: value.code,
      name: value.name,
      contract: contract._id,
      manager: req.admin._id,
      startDate: value.startDate,
      endDate: value.endDate,
      status: 'planned',
    });

    return res.status(201).json({
      success: true,
      result: project,
      message: 'Proyek berhasil dibuat.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Kode proyek sudah digunakan.',
      });
    }

    throw err;
  }
};