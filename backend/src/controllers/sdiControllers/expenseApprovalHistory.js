const mongoose = require('mongoose');
const Joi = require('joi');

const Expense = mongoose.model('Expense');
const Project = mongoose.model('Project');
const ProjectAccess = mongoose.model('ProjectAccess');
const Approval = mongoose.model('Approval');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
}).unknown(false);

const notFound = (res) =>
  res.status(404).json({
    success: false,
    result: null,
    message: 'Pengeluaran tidak ditemukan dalam cakupan akses Anda.',
  });

module.exports = async function expenseApprovalHistory(req, res) {
  const idValidation = idSchema.validate(req.params.id);
  const queryValidation = querySchema.validate(req.query);

  if (idValidation.error || queryValidation.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID atau parameter riwayat tidak valid.',
    });
  }

  const expense = await Expense.findById(
    idValidation.value
  ).lean();

  if (!expense) {
    return notFound(res);
  }

  const roles = req.admin.businessRoles || [];
  let permitted = false;

  if (
    roles.includes('project_team') &&
    String(expense.createdBy) === String(req.admin._id)
  ) {
    permitted = Boolean(
      await ProjectAccess.exists({
        project: expense.project,
        teamMembers: req.admin._id,
      })
    );
  }

  if (!permitted && roles.includes('project_manager')) {
    permitted = Boolean(
      await Project.exists({
        _id: expense.project,
        manager: req.admin._id,
      })
    );
  }

  if (!permitted && roles.includes('expense_approver')) {
    permitted = Boolean(
      await ProjectAccess.exists({
        project: expense.project,
        expenseApprovers: req.admin._id,
      })
    );
  }

  if (!permitted) {
    return notFound(res);
  }

  const filter = {
    targetType: 'Expense',
    targetId: expense._id,
    step: 'expense_review',
    decision: { $in: ['approved', 'rejected'] },
    targetRevision:
      expense.approvalStatus === 'draft'
        ? { $lt: expense.revision }
        : { $lte: expense.revision },
  };

  const { page, limit } = queryValidation.value;

  const history = await Approval.find(filter)
    .select(
      '_id targetRevision requestedBy decidedBy decision notes requestedAt decidedAt'
    )
    .populate({
      path: 'requestedBy',
      select: '_id name',
    })
    .populate({
      path: 'decidedBy',
      select: '_id name',
    })
    .sort({ targetRevision: -1, decidedAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Approval.countDocuments(filter);

  return res.status(200).json({
    success: true,
    result: {
      expense: expense._id,
      currentRevision: expense.revision,
      currentStatus: expense.approvalStatus,
      history,
    },
    pagination: {
      page,
      limit,
      total,
    },
    message: 'Riwayat keputusan pengeluaran berhasil dibaca.',
  });
};