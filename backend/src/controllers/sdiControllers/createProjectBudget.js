const mongoose = require('mongoose');
const Joi = require('joi');
const currency = require('currency.js');

const objectId = Joi.string().lowercase().hex().length(24);

const schema = Joi.object({
  project: objectId.required(),

  lines: Joi.array()
    .items(
      Joi.object({
        category: objectId.required(),
        description: Joi.string().trim().max(500).required(),
        quantity: Joi.number()
          .positive()
          .precision(3)
          .strict()
          .required(),
        unit: Joi.string().trim().max(50).required(),
        unitCost: Joi.number()
          .min(0)
          .precision(2)
          .strict()
          .required(),
      })
    )
    .min(1)
    .max(200)
    .required(),
});

module.exports = async function createProjectBudget(req, res) {
  const fail = (status, message) =>
    res.status(status).json({
      success: false,
      result: null,
      message,
    });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data anggaran belum sesuai.',
      details: error.details.map((item) => ({
        field: item.path.join('.'),
        code: item.type,
      })),
    });
  }

  const Project = mongoose.model('Project');
  const Contract = mongoose.model('Contract');
  const CostCategory = mongoose.model('CostCategory');
  const ProjectBudget = mongoose.model('ProjectBudget');

  const project = await Project.findOne({
    _id: value.project,
    manager: req.admin._id,
  }).lean();

  if (!project) {
    return fail(404, 'Proyek tidak ditemukan dalam cakupan akses Anda.');
  }

  const contract = await Contract.findById(project.contract).lean();

  if (!contract || contract.status !== 'agreed') {
    return fail(409, 'Kontrak proyek harus sudah disepakati.');
  }

  const existingBudget = await ProjectBudget.exists({
    project: project._id,
  });

  if (existingBudget) {
    return fail(
      409,
      'Anggaran awal sudah tersedia. Perubahan harus melalui proses perubahan anggaran.'
    );
  }

  const categoryIds = [...new Set(
    value.lines.map((line) => line.category)
  )];

  const activeCategories = await CostCategory.countDocuments({
    _id: { $in: categoryIds },
    active: true,
  });

  if (activeCategories !== categoryIds.length) {
    return fail(400, 'Setiap kategori harus tersedia dan aktif.');
  }

  let total = currency(0);
  const lines = [];

  for (const line of value.lines) {
    const amount = currency(line.unitCost).multiply(line.quantity);

    if (
      !Number.isSafeInteger(amount.intValue) ||
      amount.intValue < 0
    ) {
      return fail(400, 'Nilai rincian biaya melampaui batas perhitungan.');
    }

    total = total.add(amount);

    if (!Number.isSafeInteger(total.intValue)) {
      return fail(400, 'Total anggaran melampaui batas perhitungan.');
    }

    lines.push({
      category: line.category,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitCost: line.unitCost,
      amount: amount.value,
    });
  }

  if (total.value <= 0) {
    return fail(400, 'Total anggaran harus lebih dari nol.');
  }

  try {
    const budget = await ProjectBudget.create({
      project: project._id,
      changeRequest: null,
      version: 1,
      total: total.value,
      currency: contract.currency,
      approvalStatus: 'draft',
      isCurrent: false,
      lines,
    });

    return res.status(201).json({
      success: true,
      result: budget,
      message: 'Draft anggaran awal berhasil dibuat.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return fail(409, 'Versi anggaran proyek sudah digunakan.');
    }

    throw err;
  }
};