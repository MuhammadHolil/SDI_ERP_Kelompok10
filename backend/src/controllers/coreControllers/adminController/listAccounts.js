const mongoose = require('mongoose');
const Joi = require('joi');

const schema = Joi.object({
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
}).unknown(false);

module.exports = async function listAccounts(req, res) {
  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Parameter daftar akun tidak valid.',
    });
  }

  const Admin = mongoose.model('Admin');
  const filter = { removed: false };

  const [result, total] = await Promise.all([
    Admin.find(filter)
      .select('_id name email role businessRoles enabled')
      .sort({ name: 1, _id: 1 })
      .skip((value.page - 1) * value.limit)
      .limit(value.limit)
      .lean(),

    Admin.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    result,
    pagination: {
      page: value.page,
      limit: value.limit,
      total,
    },
    message: 'Daftar akun berhasil dibaca.',
  });
};