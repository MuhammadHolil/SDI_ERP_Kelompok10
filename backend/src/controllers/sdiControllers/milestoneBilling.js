const mongoose = require('mongoose');
const Joi = require('joi');

const {
  cents,
  checkBillable,
} = require('@/utils/billingRules');

const idPattern = /^[a-fA-F0-9]{24}$/;

const dateSchema = Joi.string()
  .isoDate()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .strict()
  .required();

const createSchema = Joi.object({
  expectedVersion: Joi.number()
    .integer()
    .min(0)
    .strict()
    .required(),

  number: Joi.number()
    .integer()
    .min(1)
    .max(1000000000)
    .strict()
    .required(),

  date: dateSchema,
  expiredDate: dateSchema,

  contractConditionsMet: Joi.boolean()
    .valid(true)
    .strict()
    .required(),

  clearanceReference: Joi.string()
    .trim()
    .min(1)
    .max(300)
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

exports.list = async function list(req, res) {
  const { error, value } = Joi.object({
    page: Joi.number().integer().min(1).max(100000).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  })
    .unknown(false)
    .validate(req.query);

  if (error) {
    return sendError(res, 400, 'Parameter daftar tidak valid.');
  }

  const Milestone = mongoose.model('Milestone');
  const { page, limit } = value;

  const [result, total] = await Promise.all([
    Milestone.find({})
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({
        path: 'project',
        select: 'code name contract',
        populate: {
          path: 'contract',
          select: 'code client currency billingTerms status',
          populate: {
            path: 'client',
            select: 'name',
          },
        },
      })
      .lean(),
    Milestone.countDocuments({}),
  ]);

  return res.status(200).json({
    success: true,
    result,
    pagination: { page, limit, total },
    message: 'Daftar milestone untuk penagihan.',
  });
};

exports.create = async function create(req, res) {
  if (!idPattern.test(req.params.id)) {
    return sendError(res, 400, 'ID milestone tidak valid.');
  }

  const { error, value } = createSchema.validate(req.body);

  if (error) {
    return sendError(
      res,
      400,
      'Isi nomor, tanggal, konfirmasi syarat kontrak, dan referensi bukti.'
    );
  }

  if (value.expiredDate < value.date) {
    return sendError(
      res,
      400,
      'Jatuh tempo tidak boleh sebelum tanggal invoice.'
    );
  }

  const Milestone = mongoose.model('Milestone');
  const Project = mongoose.model('Project');
  const Contract = mongoose.model('Contract');
  const Invoice = mongoose.model('Invoice');
  const Client = mongoose.model('Client');

  // Tunggu inisialisasi index sebelum menerbitkan invoice.
  await Invoice.init();

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const milestone = await Milestone.findById(req.params.id)
        .session(session)
        .lean();

      if (!milestone) {
        fail(404, 'Milestone tidak ditemukan.');
      }

      const project = await Project.findById(milestone.project)
        .session(session)
        .lean();

      if (!project) {
        fail(409, 'Proyek milestone tidak tersedia.');
      }

      const contract = await Contract.findById(project.contract)
        .session(session)
        .lean();

      if (!contract) {
        fail(409, 'Kontrak proyek tidak tersedia.');
      }

      let amount;

      try {
        amount = checkBillable({
          milestone,
          project,
          contract,
          financeId: req.admin._id,
        });
      } catch (ruleError) {
        fail(409, ruleError.message);
      }

      if (milestone.__v !== value.expectedVersion) {
        fail(409, 'Milestone berubah. Muat ulang daftar.');
      }

      const client = await Client.exists({
        _id: contract.client,
        removed: false,
      }).session(session);

      if (!client) {
        fail(409, 'Pelanggan kontrak tidak tersedia.');
      }

      // Penulisan ini membuat transaksi penagihan pada kontrak
      // yang sama saling berkonflik dan diulang secara aman.
      await Contract.updateOne(
        { _id: contract._id },
        { $inc: { billingRevision: 1 } },
        { session }
      );

      const year = Number(value.date.slice(0, 4));

      const numberUsed = await Invoice.exists({
        number: value.number,
        year,
      }).session(session);

      if (numberUsed) {
        fail(409, 'Nomor invoice pada tahun tersebut sudah digunakan.');
      }

      // Periksa total invoice yang sudah diterbitkan untuk kontrak.
      const previousInvoices = await Invoice.find({
        contract: contract._id,
        removed: false,
        status: { $nin: ['draft', 'cancelled', 'refunded'] },
      })
        .select('total billingTermCode')
        .session(session)
        .lean();

      const previousTotal = previousInvoices.reduce(
        (sum, invoice) => sum + cents(invoice.total),
        0
      );

      const previousTermTotal = previousInvoices
        .filter(
          (invoice) =>
            invoice.billingTermCode === milestone.billingTermCode
        )
        .reduce(
          (sum, invoice) => sum + cents(invoice.total),
          0
        );

      const term = contract.billingTerms.find(
        (item) => item.code === milestone.billingTermCode
      );

      if (
        previousTotal + cents(amount) >
        cents(contract.contractValue)
      ) {
        fail(409, 'Total penagihan akan melebihi nilai kontrak.');
      }

      if (
        previousTermTotal + cents(amount) >
        cents(term.amount)
      ) {
        fail(409, 'Total penagihan akan melebihi nilai termin.');
      }

      const invoiceId = new mongoose.Types.ObjectId();
      const now = new Date();

      const locked = await Milestone.findOneAndUpdate(
        {
          _id: milestone._id,
          __v: value.expectedVersion,
          billingInvoice: null,
          status: 'completed',
          approvalStatus: 'approved',
        },
        {
          $set: { billingInvoice: invoiceId },
          $inc: { __v: 1 },
        },
        { new: true, session }
      );

      if (!locked) {
        fail(409, 'Milestone berubah atau sudah ditagihkan.');
      }

      const [invoice] = await Invoice.create(
        [
          {
            _id: invoiceId,
            createdBy: req.admin._id,
            number: value.number,
            year,
            date: new Date(`${value.date}T00:00:00.000Z`),
            expiredDate: new Date(
              `${value.expiredDate}T00:00:00.000Z`
            ),
            client: contract.client,
            project: project._id,
            contract: contract._id,
            milestone: milestone._id,
            billingTermCode: milestone.billingTermCode,
            currency: contract.currency,
            items: [
              {
                itemName: milestone.name,
                description:
                  `${project.code} / ${milestone.code} / ` +
                  `Termin ${milestone.billingTermCode}`,
                quantity: 1,
                price: amount,
                total: amount,
              },
            ],
            subTotal: amount,
            taxRate: 0,
            taxTotal: 0,
            discount: 0,
            total: amount,
            credit: 0,
            payment: [],
            paymentStatus: 'unpaid',
            status: 'pending',
            approved: true,
            pdf: `invoice-${invoiceId}.pdf`,
            notes: 'Diterbitkan melalui penagihan milestone.',
            billingClearance: {
              reference: value.clearanceReference,
              checkedBy: req.admin._id,
              checkedAt: now,
              contractVersion: contract.currentVersion,
              milestoneVersion: milestone.__v,
            },
          },
        ],
        { session }
      );

      result = invoice;
    });

    return res.status(201).json({
      success: true,
      result,
      message: 'Invoice milestone berhasil diterbitkan.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return sendError(
        res,
        409,
        'Milestone atau nomor invoice sudah digunakan. Muat ulang daftar.'
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