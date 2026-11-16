const mongoose = require('mongoose');

module.exports = async function projectAccessOptions(req, res) {
  const projectId = req.params.id;

  if (!/^[a-fA-F0-9]{24}$/.test(projectId)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID proyek tidak valid.',
    });
  }

  const Project = mongoose.model('Project');
  const Admin = mongoose.model('Admin');

  const project = await Project.exists({
    _id: projectId,
    manager: req.admin._id,
  });

  if (!project) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Proyek tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  const accounts = await Admin.find({
    enabled: true,
    removed: false,
    businessRoles: {
      $in: ['project_team', 'expense_approver'],
    },
  })
    .select('_id name businessRoles')
    .sort({ name: 1, _id: 1 })
    .lean();

  return res.status(200).json({
    success: true,
    result: {
      teamMembers: accounts.filter((account) =>
        account.businessRoles.includes('project_team')
      ),
      expenseApprovers: accounts.filter((account) =>
        account.businessRoles.includes('expense_approver')
      ),
    },
    message: 'Pilihan akun proyek berhasil dibaca.',
  });
};