const mongoose = require('mongoose');
const Joi = require('joi');

const Vendor = mongoose.model('Vendor');

const createSchema = Joi.object({
  code: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9_-]+$/)
    .max(50)
    .required(),

  name: Joi.string().trim().max(200).required(),

  email: Joi.string()
    .trim()
    .lowercase()
    .email()
    .max(254)
    .allow('')
    .default(''),
}).unknown(false);

exports.create = async (req, res) => {
  const { error, value } = createSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Kode, nama, atau email vendor belum sesuai.',
    });
  }

  try {
    const result = await Vendor.create({
      code: value.code,
      name: value.name,
      email: value.email,
      active: true,
    });

    return res.status(201).json({
      success: true,
      result,
      message: 'Vendor berhasil ditambahkan.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Kode vendor sudah digunakan.',
      });
    }

    throw err;
  }
};

const listSchema = Joi.object({
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
}).unknown(false);

exports.list = async (req, res) => {
  const { error, value } = listSchema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Parameter daftar vendor belum sesuai.',
    });
  }

  const filter = { active: true };

  const result = await Vendor.find(filter)
    .select('_id code name email active')
    .sort({ code: 1 })
    .skip((value.page - 1) * value.limit)
    .limit(value.limit)
    .lean();

  const total = await Vendor.countDocuments(filter);

  return res.status(200).json({
    success: true,
    result,
    pagination: {
      page: value.page,
      limit: value.limit,
      total,
    },
    message: 'Daftar vendor aktif berhasil dibaca.',
  });
};