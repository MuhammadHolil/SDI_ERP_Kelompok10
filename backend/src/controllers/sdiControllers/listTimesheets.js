const mongoose = require('mongoose');
const Joi = require('joi');

const Project = mongoose.model('Project');
const Expert = mongoose.model('Expert');
const Allocation = mongoose.model('Allocation');
const Timesheet = mongoose.model('Timesheet');

const schema = Joi.object({
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),

  allocation: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/),

  approvalStatus: Joi.string().valid(
    'draft',
    'submitted',
    'approved',
    'rejected'
  ),
}).unknown(false);

module.exports = async function listTimesheets(req, res) {
  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Parameter daftar timesheet belum sesuai.',
    });
  }

  const roles = req.admin.businessRoles || [];
  const allocationScopes = [];

  if (roles.includes('project_manager')) {
    const projectIds = await Project.distinct('_id', {
      manager: req.admin._id,
    });

    allocationScopes.push({
      project: { $in: projectIds },
    });
  }

  if (roles.includes('expert')) {
    const expertIds = await Expert.distinct('_id', {
      user: req.admin._id,
    });

    allocationScopes.push({
      expert: { $in: expertIds },
    });
  }

  if (allocationScopes.length === 0) {
    return res.status(403).json({
      success: false,
      result: null,
      message: 'Peran Anda tidak memiliki izin untuk fitur ini.',
    });
  }

  const allocationFilter = {
    $or: allocationScopes,
  };

  if (value.allocation) {
    allocationFilter._id = value.allocation;
  }

  const allocationIds = await Allocation.distinct(
    '_id',
    allocationFilter
  );

  const filter = {
    allocation: { $in: allocationIds },
  };

  if (value.approvalStatus) {
    filter.approvalStatus = value.approvalStatus;
  }

  const result = await Timesheet.find(filter)
    .select(
      '_id allocation activity startedAt endedAt breakMinutes workHours hourlyCostSnapshot currency revision approvalStatus'
    )
    .populate({
      path: 'allocation',
      select: '_id project expert projectRole',
      populate: [
        {
          path: 'project',
          select: '_id code name',
        },
        {
          path: 'expert',
          select: '_id code name',
        },
      ],
    })
    .sort({ startedAt: -1, _id: -1 })
    .skip((value.page - 1) * value.limit)
    .limit(value.limit)
    .lean();

  const total = await Timesheet.countDocuments(filter);

  return res.status(200).json({
    success: true,
    result,
    pagination: {
      page: value.page,
      limit: value.limit,
      total,
    },
    message: 'Daftar timesheet berhasil dibaca.',
  });
};