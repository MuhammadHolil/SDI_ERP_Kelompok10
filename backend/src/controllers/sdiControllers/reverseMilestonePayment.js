const mongoose = require('mongoose');
const Joi = require('joi');

const {
  calculateReversal,
} = require('@/utils/paymentReversalRules');

const schema = Joi.object({
  reason: Joi.string().trim().min(1).max(1500).required(),
  reference: Joi.string().trim().min(1).max(300).required(),
}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

module.exports = async function reverseMilestonePayment(req, res) {
  if (!/^[a-fA-F0-9]{24}$/.test(req.params.id || '')) {
    return res.status(400).json({
      success: false,
      message: 'ID pembayaran tidak valid.',
    });
  }

  const validation = schema.validate(req.body);

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: 'Alasan dan referensi pembatalan wajib diisi.',
    });
  }

  const Payment = mongoose.model('Payment');
  const Invoice = mongoose.model('Invoice');
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findOne({
        _id: req.params.id,
        removed: false,
      })
        .setOptions({ autopopulate: false })
        .session(session)
        .lean();

      if (!payment) {
        fail(404, 'Pembayaran tidak ditemukan.');
      }

      if (payment.isReversed) {
        fail(409, 'Pembayaran sudah dibatalkan.');
      }

      const invoice = await Invoice.findOne({
        _id: payment.invoice,
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
        fail(409, 'Status invoice tidak mendukung koreksi pembayaran ini.');
      }

      const payments = await Payment.find({
        invoice: invoice._id,
        removed: false,
      })
        .setOptions({ autopopulate: false })
        .session(session)
        .lean();

      let balance;

      try {
        balance = calculateReversal({
          total: invoice.total,
          discount: invoice.discount || 0,
          payments,
          targetId: payment._id,
          currency: invoice.currency,
        });
      } catch (error) {
        fail(409, error.message);
      }

      const updatedPayment = await Payment.findOneAndUpdate(
        {
          _id: payment._id,
          removed: false,
          isReversed: { $ne: true },
        },
        {
          $set: {
            isReversed: true,
            reversal: {
              reason: validation.value.reason,
              reference: validation.value.reference,
              reversedBy: req.admin._id,
              reversedAt: new Date(),
              invoiceCreditBefore: invoice.credit,
              invoiceCreditAfter: balance.credit,
              ledgerBefore: balance.ledgerBefore,
              ledgerAfter: balance.credit,
            },
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!updatedPayment) {
        fail(409, 'Pembayaran berubah atau sudah dibatalkan.');
      }

      const updatedInvoice = await Invoice.findOneAndUpdate(
        {
          _id: invoice._id,
          removed: false,
          credit: invoice.credit,
          status: invoice.status,
        },
        {
          $set: {
            credit: balance.credit,
            paymentStatus: balance.paymentStatus,
            updated: new Date(),
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!updatedInvoice) {
        fail(409, 'Saldo invoice berubah. Muat ulang halaman.');
      }

      result = {
        payment: updatedPayment._id,
        invoice: invoice._id,
        credit: balance.credit,
        remaining: balance.remaining,
        paymentStatus: balance.paymentStatus,
      };
    });

    return res.status(200).json({
      success: true,
      result,
      message:
        'Catatan pembayaran dibatalkan dan saldo invoice dihitung ulang.',
    });
  } catch (err) {
    if ([400, 403, 404, 409].includes(err.status)) {
      return res.status(err.status).json({
        success: false,
        result: null,
        message: err.message,
      });
    }

    throw err;
  } finally {
    await session.endSession();
  }
};