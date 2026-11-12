const mongoose = require('mongoose');
const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const schema = Joi.object({
  code: Joi.string().trim().max(100).required(),
  quote: objectId.required(),
  client: objectId.required(),
  scope: Joi.string().trim().max(5000).required(),
  contractValue: Joi.number().positive().required(),
  currency: Joi.string().trim().uppercase().length(3).required(),
});

module.exports = async function createContract(req, res) {
  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data kontrak belum sesuai.',
      details: error.details.map((item) => ({
        field: item.path.join('.'),
        code: item.type,
      })),
    });
  }

  const Quote = mongoose.model('Quote');
  const Client = mongoose.model('Client');
  const Contract = mongoose.model('Contract');

  const quote = await Quote.findOne({
    _id: value.quote,
    removed: false,
  }).setOptions({ autopopulate: false }).lean();

  if (!quote) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Quotation tidak ditemukan.',
    });
  }

  if (quote.status !== 'accepted') {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'Quotation harus berstatus accepted.',
    });
  }

  if (String(quote.client) !== value.client) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Pelanggan harus sesuai dengan quotation.',
    });
  }

  const clientExists = await Client.exists({
    _id: value.client,
    removed: false,
  });

  if (!clientExists) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Pelanggan tidak ditemukan.',
    });
  }

  if (
    !Number.isFinite(quote.total) ||
    value.contractValue !== quote.total ||
    value.currency !== quote.currency
  ) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Nilai dan mata uang kontrak harus sesuai quotation.',
    });
  }

  try {
    const contract = await Contract.create({
      code: value.code,
      quote: quote._id,
      client: quote.client,
      scope: value.scope,
      contractValue: value.contractValue,
      currency: value.currency,
      status: 'draft',
      currentVersion: 1,
      billingTerms: [],
      revisions: [],
    });

    return res.status(201).json({
      success: true,
      result: contract,
      message: 'Draft kontrak berhasil dibuat.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Kode kontrak sudah digunakan.',
      });
    }

    throw err;
  }
};