const mongoose = require('mongoose');
const Joi = require('joi');
const { calculatePayment } = require('@/utils/paymentRules');

const validId = (value) =>
  typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);

const schema = Joi.object({
  number: Joi.number()
    .integer()
    .min(1)
    .max(1000000000)
    .strict()
    .required(),

  amount: Joi.number()
    .positive()
    .precision(2)
    .strict()
    .required(),

  date: Joi.string()
    .isoDate()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .strict()
    .required(),

  ref: Joi.string().trim().min(1).max(150).required(),

  description: Joi.string()
    .trim()
    .max(1000)
    .allow('')
    .default(''),

  idempotencyKey: Joi.string()
    .guid({ version: 'uuidv4' })
    .required(),
}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const sendError = (res, status, message) =>
  res.status(status).json({
    success: false,
    result: null,
    message,
  });

exports.read = async function read(req, res) {
  if (!validId(req.params.id)) {
    return sendError(res, 400, 'ID invoice tidak valid.');
  }

  const Invoice = mongoose.model('Invoice');
  const Payment = mongoose.model('Payment');

  const invoice = await Invoice.findOne({
    _id: req.params.id,
    removed: false,
    milestone: { $type: 'objectId' },
  })
    .populate('client', 'name')
    .lean();

  if (!invoice) {
    return sendError(res, 404, 'Invoice milestone tidak ditemukan.');
  }

  const payments = await Payment.find({
    invoice: invoice._id,
    removed: false,
  })
    .select(
      'number date amount currency ref description isReversed reversal'
    )
    .sort({ date: 1, _id: 1 })
    .lean();

  return res.status(200).json({
    success: true,
    result: {
      invoice,
      payments,
      remaining:
        Math.round(
          (invoice.total - invoice.discount - invoice.credit) * 100
        ) / 100,
    },
    message: 'Ringkasan pembayaran invoice.',
  });
};

exports.create = async function create(req, res) {
  if (!validId(req.params.id)) {
    return sendError(res, 400, 'ID invoice tidak valid.');
  }

  const { error, value } = schema.validate(req.body);

  if (error) {
    return sendError(
      res,
      400,
      'Isi nomor, nominal, tanggal, dan referensi pembayaran dengan benar.'
    );
  }

  const Invoice = mongoose.model('Invoice');
  const Payment = mongoose.model('Payment');

  await Payment.init();

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const previous = await Payment.findOne({
        idempotencyKey: value.idempotencyKey,
      })
        .setOptions({ autopopulate: false })
        .session(session)
        .lean();

      if (previous) {
      if (previous.isReversed) {
        fail(
          409,
          'Permintaan ini terkait pembayaran yang sudah dibatalkan. Muat ulang halaman sebelum membuat catatan baru.'
        );
      }
        const sameRequest =
          String(previous.createdBy) === String(req.admin._id) &&
          String(previous.invoice) === req.params.id &&
          previous.amount === value.amount &&
          previous.ref === value.ref &&
          previous.number === value.number &&
          previous.date.toISOString().slice(0, 10) === value.date &&
          (previous.description || '') === value.description;

        if (!sameRequest) {
          fail(409, 'Identitas permintaan sudah digunakan untuk data berbeda.');
        }

        result = previous;
        return;
      }

      const invoice = await Invoice.findOne({
        _id: req.params.id,
        removed: false,
        milestone: { $type: 'objectId' },
      })
        .setOptions({ autopopulate: false })
        .session(session)
        .lean();

      if (!invoice) {
        fail(404, 'Invoice milestone tidak ditemukan.');
      }

      if (!['pending', 'sent'].includes(invoice.status)) {
        fail(409, 'Status invoice tidak menerima pembayaran.');
      }

      if (
        value.date <
        new Date(invoice.date).toISOString().slice(0, 10)
      ) {
        fail(400, 'Tanggal pembayaran tidak boleh sebelum tanggal invoice.');
      }

      let balance;

      try {
        balance = calculatePayment({
          total: invoice.total,
          discount: invoice.discount || 0,
          credit: invoice.credit || 0,
          amount: value.amount,
        });
      } catch (ruleError) {
        fail(409, ruleError.message);
      }

      const paymentId = new mongoose.Types.ObjectId();

      const updated = await Invoice.findOneAndUpdate(
        {
          _id: invoice._id,
          credit: invoice.credit,
          removed: false,
          status: invoice.status,
        },
        {
          $set: {
            credit: balance.credit,
            paymentStatus: balance.paymentStatus,
            updated: new Date(),
          },
          $push: { payment: paymentId },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!updated) {
        fail(409, 'Saldo berubah. Muat ulang sebelum membayar.');
      }

      const [payment] = await Payment.create(
        [
          {
            _id: paymentId,
            createdBy: req.admin._id,
            number: value.number,
            invoice: invoice._id,
            client: invoice.client,
            date: new Date(`${value.date}T00:00:00.000Z`),
            amount: value.amount,
            currency: invoice.currency,
            ref: value.ref,
            description: value.description,
            idempotencyKey: value.idempotencyKey,
          },
        ],
        { session }
      );

      result = payment;
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Pembayaran tercatat. Saldo invoice telah diperbarui.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return sendError(
        res,
        409,
        'Permintaan sudah diproses. Muat ulang riwayat pembayaran.'
      );
    }

    if ([400, 403, 404, 409].includes(err.status)) {
      return sendError(res, err.status, err.message);
    }

    throw err;
  } finally {
    await session.endSession();
  }
};