const mongoose = require('mongoose');
const Joi = require('joi');

const Expense = mongoose.model('Expense');
const Project = mongoose.model('Project');
const ProjectAccess = mongoose.model('ProjectAccess');

const schema = Joi.object({
  id: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/)
    .required(),

  fileId: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/)
    .required(),
});

const notFound = (res) =>
  res.status(404).json({
    success: false,
    result: null,
    message: 'Bukti tidak ditemukan dalam cakupan akses Anda.',
  });

module.exports = async function downloadExpenseEvidence(req, res) {
  const { error, value } = schema.validate(req.params);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID pengeluaran atau berkas tidak valid.',
    });
  }

  const expense = await Expense.findById(value.id).lean();

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

  if (
    !permitted &&
    roles.includes('expense_approver') &&
    ['submitted', 'approved', 'rejected'].includes(
      expense.approvalStatus
    )
  ) {
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

  const evidence = (expense.evidence || []).find(
    (item) =>
      String(item.fileId).toLowerCase() ===
      value.fileId.toLowerCase()
  );

  if (!evidence) {
    return notFound(res);
  }

  const fileId = new mongoose.Types.ObjectId(value.fileId);

  const storedFile = await mongoose.connection.db
    .collection('expenseEvidence.files')
    .findOne({ _id: fileId });

  if (
    !storedFile ||
    String(storedFile.metadata?.expense) !== String(expense._id) ||
    storedFile.length !== evidence.size
  ) {
    return notFound(res);
  }

  const extensions = {
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
  };

  const extension = extensions[evidence.mimeType];

  if (!extension) {
    return notFound(res);
  }

  const bucket = new mongoose.mongo.GridFSBucket(
    mongoose.connection.db,
    { bucketName: 'expenseEvidence' }
  );

  res.setHeader('Content-Type', evidence.mimeType);
  res.setHeader('Content-Length', storedFile.length);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="bukti-${fileId}.${extension}"`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');

  const stream = bucket.openDownloadStream(fileId);

  stream.once('error', () => {
    if (!res.headersSent) {
      res.removeHeader('Content-Length');
      res.removeHeader('Content-Disposition');

      res.status(500).json({
        success: false,
        result: null,
        message: 'Berkas bukti gagal dibaca.',
      });
    } else {
      res.destroy();
    }
  });

  res.once('close', () => {
    stream.destroy();
  });

  stream.pipe(res);
};