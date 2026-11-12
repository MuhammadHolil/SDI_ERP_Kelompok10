const mongoose = require('mongoose');
const Joi = require('joi');

const Project = mongoose.model('Project');
const Expert = mongoose.model('Expert');
const Allocation = mongoose.model('Allocation');

const schema = Joi.object({
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),

  project: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/),
}).unknown(false);

module.exports = async function listAllocations(req, res) {
  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Parameter daftar alokasi belum sesuai.',
    });
  }

  const roles = req.admin.businessRoles || [];
  const scopes = [];

  if (roles.includes('project_manager')) {
    const projectIds = await Project.distinct('_id', {
      manager: req.admin._id,
    });

    scopes.push({
      project: { $in: projectIds },
    });
  }

  if (roles.includes('expert')) {
    const expertIds = await Expert.distinct('_id', {
      user: req.admin._id,
    });

    scopes.push({
      expert: { $in: expertIds },
    });
  }

  if (scopes.length === 0) {
    return res.status(403).json({
      success: false,
      result: null,
      message: 'Peran Anda tidak memiliki izin untuk fitur ini.',
    });
  }

  const filter = {
    $or: scopes,
  };

  if (value.project) {
    filter.project = value.project;
  }

  const result = await Allocation.find(filter)
    .select(
      '_id project expert projectRole startDate endDate plannedHours status'
    )
    .populate({
      path: 'project',
      select: '_id code name',
    })
    .populate({
      path: 'expert',
      select: '_id code name',
    })
    .sort({ startDate: 1, _id: 1 })
    .skip((value.page - 1) * value.limit)
    .limit(value.limit)
    .lean();

  const total = await Allocation.countDocuments(filter);

  return res.status(200).json({
    success: true,
    result,
    pagination: {
      page: value.page,
      limit: value.limit,
      total,
    },
    message: 'Daftar alokasi berhasil dibaca.',
  });
};