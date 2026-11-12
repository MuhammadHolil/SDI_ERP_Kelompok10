const mongoose = require('mongoose');

module.exports = async function readProjectBudget(req, res) {
  if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID anggaran tidak valid.',
    });
  }

  const ProjectBudget = mongoose.model('ProjectBudget');
  const Project = mongoose.model('Project');

  const budget = await ProjectBudget.findById(req.params.id).lean();

  if (!budget) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Anggaran tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  const project = await Project.exists({
    _id: budget.project,
    manager: req.admin._id,
  });

  if (!project) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Anggaran tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  return res.status(200).json({
    success: true,
    result: budget,
    message: 'Detail anggaran berhasil dibaca.',
  });
};