const mongoose = require('mongoose');

module.exports = async function listMilestones(req, res) {
  if (!/^[a-fA-F0-9]{24}$/.test(req.params.projectId)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID proyek tidak valid.',
    });
  }

  const Project = mongoose.model('Project');
  const Milestone = mongoose.model('Milestone');

  const project = await Project.exists({
    _id: req.params.projectId,
    manager: req.admin._id,
  });

  if (!project) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Proyek tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  const milestones = await Milestone.find({
    project: req.params.projectId,
  })
    .sort({ dueDate: 1, code: 1 })
    .lean();

  return res.status(200).json({
    success: true,
    result: milestones,
    message: 'Daftar milestone proyek.',
  });
};