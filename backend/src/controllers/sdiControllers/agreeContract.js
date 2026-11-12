const mongoose = require('mongoose');
const Joi = require('joi');

const schema = Joi.object({
  agreementReference: Joi.string().trim().max(200).required(),

  billingTerms: Joi.array()
    .items(
      Joi.object({
        code: Joi.string().trim().max(30).required(),
        name: Joi.string().trim().max(200).required(),
        amount: Joi.number().positive().precision(2).strict().required(),
      })
    )
    .min(1)
    .max(100)
    .unique('code')
    .required(),
});

module.exports = async function agreeContract(req, res) {
  if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID kontrak tidak valid.',
    });
  }

  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Referensi kesepakatan atau termin belum sesuai.',
      details: error.details.map((item) => ({
        field: item.path.join('.'),
        code: item.type,
      })),
    });
  }

  const Contract = mongoose.model('Contract');
  const contract = await Contract.findById(req.params.id).lean();

  if (!contract) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Kontrak tidak ditemukan.',
    });
  }

  if (contract.status !== 'draft') {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'Hanya kontrak draft yang dapat disepakati.',
    });
  }

  // Gunakan satuan terkecil untuk membandingkan jumlah uang.
  const amounts = value.billingTerms.map((term) =>
    Math.round(term.amount * 100)
  );

  const totalTerms = amounts.reduce((sum, amount) => sum + amount, 0);
  const contractAmount = Math.round(contract.contractValue * 100);

  if (
    !amounts.every(Number.isSafeInteger) ||
    !Number.isSafeInteger(totalTerms) ||
    !Number.isSafeInteger(contractAmount) ||
    totalTerms !== contractAmount
  ) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Total termin harus sama dengan nilai kontrak.',
    });
  }

  const result = await Contract.findOneAndUpdate(
    {
      _id: contract._id,
      status: 'draft',
      currentVersion: contract.currentVersion,
      contractValue: contract.contractValue,
    },
    {
      $set: {
        status: 'agreed',
        billingTerms: value.billingTerms,
      },
      $push: {
        revisions: {
          action: 'agreement_recorded',
          version: contract.currentVersion,
          reference: value.agreementReference,
          recordedBy: req.admin._id,
          recordedAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true }
  );

  if (!result) {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'Kontrak berubah. Muat ulang sebelum melanjutkan.',
    });
  }

  return res.status(200).json({
    success: true,
    result,
    message: 'Kesepakatan kontrak dan termin berhasil dicatat.',
  });
};