const mongoose = require('mongoose');
const Joi = require('joi');

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

exports.list = async function listProjects(req, res) {
  const { error, value } = listSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Parameter halaman tidak valid.',
    });
  }

  const Project = mongoose.model('Project');

  // Pembatasan ditentukan oleh backend, bukan input pengguna.
  const filter = { manager: req.admin._id };

  const projects = await Project.find(filter)
    .sort({ _id: -1 })
    .skip((value.page - 1) * value.limit)
    .limit(value.limit)
    .lean();

  return res.status(200).json({
    success: true,
    result: projects,
    page: value.page,
    limit: value.limit,
    message: 'Daftar proyek sesuai tanggung jawab PM.',
  });
};

exports.read = async function readProject(req, res) {
  if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID proyek tidak valid.',
    });
  }

  const Project = mongoose.model('Project');

  const project = await Project.findOne({
    _id: req.params.id,
    manager: req.admin._id,
  }).lean();

  if (!project) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Proyek tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  return res.status(200).json({
    success: true,
    result: project,
    message: 'Detail proyek berhasil dibaca.',
  });
};