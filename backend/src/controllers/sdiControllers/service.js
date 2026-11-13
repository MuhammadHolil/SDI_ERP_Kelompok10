const mongoose = require('mongoose');
const Joi = require('joi');

const Service = mongoose.model('Service');

const createSchema = Joi.object({
  code: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9_-]+$/)
    .min(1)
    .max(50)
    .required(),

  name: Joi.string().trim().min(1).max(200).required(),

  unit: Joi.string().trim().min(1).max(50).required(),
}).unknown(false);

exports.create = async (req, res) => {
  const { error, value } = createSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data layanan belum sesuai.',
    });
  }

  try {
    const result = await Service.create({
      ...value,
      active: true,
    });

    return res.status(201).json({
      success: true,
      result,
      message: 'Layanan berhasil ditambahkan.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Kode layanan sudah digunakan.',
      });
    }

    throw err;
  }
};

exports.list = async (req, res) => {
  const result = await Service.find({ active: true })
    .select('_id code name unit active')
    .sort({ code: 1 })
    .lean();

  return res.status(200).json({
    success: true,
    result,
    message: 'Daftar layanan aktif berhasil dibaca.',
  });
};