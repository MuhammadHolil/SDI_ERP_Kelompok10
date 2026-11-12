const mongoose = require('mongoose');
const Joi = require('joi');

const schema = Joi.object({
  code: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9_]+$/)
    .max(50)
    .required(),

  name: Joi.string().trim().max(150).required(),
});

exports.create = async function createCategory(req, res) {
  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Kode atau nama kategori belum sesuai.',
    });
  }

  const CostCategory = mongoose.model('CostCategory');

  try {
    const category = await CostCategory.create({
      code: value.code,
      name: value.name,
      active: true,
    });

    return res.status(201).json({
      success: true,
      result: category,
      message: 'Kategori biaya berhasil dibuat.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Kode kategori sudah digunakan.',
      });
    }

    throw err;
  }
};

exports.list = async function listCategories(req, res) {
  const CostCategory = mongoose.model('CostCategory');

  const categories = await CostCategory.find({ active: true })
    .select('_id code name active')
    .sort({ code: 1 })
    .lean();

  return res.status(200).json({
    success: true,
    result: categories,
    message: 'Daftar kategori biaya aktif.',
  });
};