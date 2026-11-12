const mongoose = require('mongoose');
const currency = require('currency.js');

module.exports = async function establishProjectBudget(req, res) {
  const fail = (status, message) =>
    res.status(status).json({
      success: false,
      result: null,
      message,
    });

  if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
    return fail(400, 'ID anggaran tidak valid.');
  }

  // Tindakan ini tidak menerima perubahan nilai atau rincian.
  if (Object.keys(req.body || {}).length > 0) {
    return fail(400, 'Penetapan anggaran tidak menerima perubahan data.');
  }

  const ProjectBudget = mongoose.model('ProjectBudget');
  const Project = mongoose.model('Project');
  const Contract = mongoose.model('Contract');
  const CostCategory = mongoose.model('CostCategory');

  const budget = await ProjectBudget.findById(req.params.id).lean();

  if (!budget) {
    return fail(404, 'Anggaran tidak ditemukan dalam cakupan akses Anda.');
  }

  const project = await Project.findOne({
    _id: budget.project,
    manager: req.admin._id,
  }).lean();

  if (!project) {
    return fail(404, 'Anggaran tidak ditemukan dalam cakupan akses Anda.');
  }

  if (
    budget.version !== 1 ||
    budget.changeRequest != null ||
    budget.approvalStatus !== 'draft' ||
    budget.isCurrent
  ) {
    return fail(409, 'Hanya draft anggaran awal yang dapat ditetapkan.');
  }

  const contract = await Contract.findById(project.contract).lean();

  if (
    !contract ||
    contract.status !== 'agreed' ||
    contract.currency !== budget.currency
  ) {
    return fail(409, 'Kontrak atau mata uang anggaran belum sesuai.');
  }

  if (!budget.lines || budget.lines.length === 0) {
    return fail(400, 'Rincian anggaran belum tersedia.');
  }

  const categoryIds = [...new Set(
    budget.lines.map((line) => String(line.category))
  )];

  const activeCategories = await CostCategory.countDocuments({
    _id: { $in: categoryIds },
    active: true,
  });

  if (activeCategories !== categoryIds.length) {
    return fail(400, 'Kategori anggaran harus tersedia dan aktif.');
  }

  let total = currency(0);

  for (const line of budget.lines) {
    if (
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0 ||
      !Number.isFinite(line.unitCost) ||
      line.unitCost < 0 ||
      !Number.isFinite(line.amount)
    ) {
      return fail(400, 'Rincian anggaran tidak valid.');
    }

    const amount = currency(line.unitCost).multiply(line.quantity);

    if (
      !Number.isSafeInteger(amount.intValue) ||
      amount.value !== line.amount
    ) {
      return fail(400, 'Perhitungan rincian anggaran tidak sesuai.');
    }

    total = total.add(amount);
  }

  if (
    !Number.isSafeInteger(total.intValue) ||
    total.value <= 0 ||
    total.value !== budget.total
  ) {
    return fail(400, 'Total anggaran tidak sesuai rinciannya.');
  }

  try {
    const result = await ProjectBudget.findOneAndUpdate(
      {
        _id: budget._id,
        version: 1,
        changeRequest: null,
        approvalStatus: 'draft',
        isCurrent: false,
        total: budget.total,
      },
      {
        $set: {
          approvalStatus: 'established',
          isCurrent: true,
        },
      },
      { new: true, runValidators: true }
    );

    if (!result) {
      return fail(409, 'Anggaran berubah. Muat ulang sebelum melanjutkan.');
    }

    return res.status(200).json({
      success: true,
      result,
      message: 'Anggaran awal berhasil ditetapkan.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return fail(409, 'Proyek sudah memiliki anggaran aktif.');
    }

    throw err;
  }
};