const mongoose = require('mongoose');
const Joi = require('joi');

const Project = mongoose.model('Project');
const ProjectBudget = mongoose.model('ProjectBudget');

const schema = Joi.object({
  project: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/)
    .required(),

  page: Joi.number()
    .integer()
    .min(1)
    .max(100000)
    .default(1),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
}).unknown(false);

module.exports = async function listProjectBudgets(req, res) {
  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Parameter daftar anggaran belum sesuai.',
    });
  }

  // PM hanya boleh meminta anggaran dari proyek miliknya.
  const project = await Project.exists({
    _id: value.project,
    manager: req.admin._id,
  });

  if (!project) {
    return res.status(404).json({
      success: false,
      result: null,
      message:
        'Proyek tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  const filter = { project: value.project };

  const [budgets, total] = await Promise.all([
    ProjectBudget.find(filter)
      .select(
        '_id project version total currency approvalStatus isCurrent'
      )
      .sort({ version: -1, _id: -1 })
      .skip((value.page - 1) * value.limit)
      .limit(value.limit)
      .lean(),

    ProjectBudget.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    result: budgets,
    pagination: {
      page: value.page,
      limit: value.limit,
      total,
    },
    message: 'Daftar anggaran proyek berhasil dibaca.',
  });
};