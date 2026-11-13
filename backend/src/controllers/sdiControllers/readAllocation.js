const mongoose = require('mongoose');

const Project = mongoose.model('Project');
const Expert = mongoose.model('Expert');
const Allocation = mongoose.model('Allocation');

module.exports = async function readAllocation(req, res) {
  if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID alokasi tidak valid.',
    });
  }

  const roles = Array.isArray(req.admin.businessRoles)
    ? req.admin.businessRoles
    : [];

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

  const allocation = await Allocation.findOne({
    _id: req.params.id,
    $or: scopes,
  })
    .select(
      '_id project expert projectRole startDate endDate plannedHours status'
    )
    .populate({
      path: 'project',
      select: '_id code name manager startDate endDate status',
    })
    .populate({
      path: 'expert',
      select: '_id code name user',
    })
    .lean();

  if (!allocation) {
    return res.status(404).json({
      success: false,
      result: null,
      message:
        'Alokasi tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  return res.status(200).json({
    success: true,
    result: allocation,
    message: 'Detail alokasi berhasil dibaca.',
  });
};