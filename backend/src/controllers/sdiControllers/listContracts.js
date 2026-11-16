const mongoose = require('mongoose');
const Joi = require('joi');

const schema = Joi.object({
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
}).unknown(false);

module.exports = async function listContracts(req, res) {
  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Parameter daftar kontrak tidak valid.',
    });
  }

  const Contract = mongoose.model('Contract');

  // Sales melihat kontrak untuk pengelolaan kesepakatan.
  // PM mendapat pilihan kontrak agreed untuk membuat proyek.
  const isSales = (req.admin.businessRoles || []).includes('sales');
  const filter = isSales ? {} : { status: 'agreed' };

  const [result, total] = await Promise.all([
    Contract.find(filter)
      .select(
        '_id code quote client scope contractValue currency status billingTerms'
      )
      .populate({
        path: 'client',
        select: '_id name',
      })
      .sort({ _id: -1 })
      .skip((value.page - 1) * value.limit)
      .limit(value.limit)
      .lean(),

    Contract.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    result,
    pagination: {
      page: value.page,
      limit: value.limit,
      total,
    },
    message: 'Daftar kontrak berhasil dibaca.',
  });
};