const mongoose = require('mongoose');
const Joi = require('joi');

const Project = mongoose.model('Project');
const ProjectAccess = mongoose.model('ProjectAccess');
const Expense = mongoose.model('Expense');

const schema = Joi.object({
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),

  project: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/),

  approvalStatus: Joi.string().valid(
    'draft',
    'submitted',
    'approved',
    'rejected'
  ),
}).unknown(false);

module.exports = async function listExpenses(req, res) {
  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Parameter daftar pengeluaran belum sesuai.',
    });
  }

  const roles = req.admin.businessRoles || [];
  const scopes = [];

  if (roles.includes('project_team')) {
    const memberProjects = await ProjectAccess.distinct(
      'project',
      { teamMembers: req.admin._id }
    );

    scopes.push({
      project: { $in: memberProjects },
      createdBy: req.admin._id,
    });
  }

  if (roles.includes('project_manager')) {
    const managedProjects = await Project.distinct('_id', {
      manager: req.admin._id,
    });

    scopes.push({
      project: { $in: managedProjects },
    });
  }

  if (roles.includes('expense_approver')) {
    const reviewProjects = await ProjectAccess.distinct(
      'project',
      { expenseApprovers: req.admin._id }
    );

    scopes.push({
      project: { $in: reviewProjects },
      approvalStatus: {
        $in: ['submitted', 'approved', 'rejected'],
      },
    });
  }

  if (scopes.length === 0) {
    return res.status(403).json({
      success: false,
      result: null,
      message: 'Peran Anda tidak memiliki izin untuk fitur ini.',
    });
  }

  const filter = { $or: scopes };

  if (value.project) {
    filter.project = value.project;
  }

  if (value.approvalStatus) {
    filter.approvalStatus = value.approvalStatus;
  }

  const result = await Expense.find(filter)
    .select(
      '_id project category vendor createdBy transactionDate description amount currency revision approvalStatus'
    )
    .select(
      '_id project category vendor createdBy transactionDate description amount currency revision approvalStatus evidence'
    )
    .populate({
      path: 'project',
      select: '_id code name',
    })
    .populate({
      path: 'category',
      select: '_id code name',
    })
    .populate({
      path: 'createdBy',
      select: '_id name',
    })
    .populate({
      path: 'vendor',
      select: '_id code name',
    })
    .sort({ transactionDate: -1, _id: -1 })
    .skip((value.page - 1) * value.limit)
    .limit(value.limit)
    .lean();

  const total = await Expense.countDocuments(filter);

  return res.status(200).json({
    success: true,
    result,
    pagination: {
      page: value.page,
      limit: value.limit,
      total,
    },
    message: 'Daftar pengeluaran berhasil dibaca.',
  });
};