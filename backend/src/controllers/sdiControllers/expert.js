const mongoose = require('mongoose');
const Joi = require('joi');

const Expert = mongoose.model('Expert');
const Admin = mongoose.model('Admin');

const createSchema = Joi.object({
  code: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9_-]+$/)
    .max(50)
    .required(),

  name: Joi.string().trim().max(200).required(),

  user: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/)
    .required(),

  skills: Joi.array()
    .items(Joi.string().trim().max(100))
    .max(30)
    .unique()
    .default([]),
}).unknown(false);

exports.create = async (req, res) => {
  const { error, value } = createSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data tenaga ahli belum sesuai.',
      details: error.details.map((item) => ({
        field: item.path.join('.'),
        code: item.type,
      })),
    });
  }

  const user = await Admin.findOne({
    _id: value.user,
    removed: false,
    enabled: true,
    businessRoles: 'expert',
  })
    .select('_id')
    .lean();

  if (!user) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Pilih akun aktif yang memiliki peran expert.',
    });
  }

  try {
    const result = await Expert.create({
      code: value.code,
      name: value.name,
      user: user._id,
      skills: value.skills,
      capacityPeriods: [],
      active: true,
    });

    return res.status(201).json({
      success: true,
      result,
      message: 'Tenaga ahli berhasil ditambahkan.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Kode atau akun tenaga ahli sudah digunakan.',
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
      message: 'Parameter daftar tenaga ahli belum sesuai.',
    });
  }

  const filter = { active: true };

  const result = await Expert.find(filter)
    .select('_id code name user skills active')
    .sort({ code: 1 })
    .skip((value.page - 1) * value.limit)
    .limit(value.limit)
    .lean();

  const total = await Expert.countDocuments(filter);

  return res.status(200).json({
    success: true,
    result,
    pagination: {
      page: value.page,
      limit: value.limit,
      total,
    },
    message: 'Daftar tenaga ahli berhasil dibaca.',
  });
};