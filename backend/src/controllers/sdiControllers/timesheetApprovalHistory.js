const mongoose = require('mongoose');
const Joi = require('joi');

const Timesheet = mongoose.model('Timesheet');
const Allocation = mongoose.model('Allocation');
const Expert = mongoose.model('Expert');
const Project = mongoose.model('Project');
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
    message: 'Timesheet tidak ditemukan dalam cakupan akses Anda.',
  });

module.exports = async function timesheetApprovalHistory(req, res) {
  const idValidation = idSchema.validate(req.params.id);
  const queryValidation = querySchema.validate(req.query);

  if (idValidation.error || queryValidation.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID atau parameter riwayat tidak valid.',
    });
  }

  const timesheet = await Timesheet.findById(
    idValidation.value
  ).lean();

  if (!timesheet) {
    return notFound(res);
  }

  const allocation = await Allocation.findById(
    timesheet.allocation
  ).lean();

  if (!allocation) {
    return notFound(res);
  }

  const roles = req.admin.businessRoles || [];
  let permitted = false;

  if (roles.includes('expert')) {
    permitted = Boolean(
      await Expert.exists({
        _id: allocation.expert,
        user: req.admin._id,
      })
    );
  }

  if (!permitted && roles.includes('project_manager')) {
    permitted = Boolean(
      await Project.exists({
        _id: allocation.project,
        manager: req.admin._id,
      })
    );
  }

  if (!permitted) {
    return notFound(res);
  }

  const filter = {
    targetType: 'Timesheet',
    targetId: timesheet._id,
    step: 'pm_review',
    decision: { $in: ['approved', 'rejected'] },
    targetRevision:
      timesheet.approvalStatus === 'draft'
        ? { $lt: timesheet.revision }
        : { $lte: timesheet.revision },
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
      timesheet: timesheet._id,
      currentRevision: timesheet.revision,
      currentStatus: timesheet.approvalStatus,
      history,
    },
    pagination: {
      page,
      limit,
      total,
    },
    message: 'Riwayat keputusan timesheet berhasil dibaca.',
  });
};