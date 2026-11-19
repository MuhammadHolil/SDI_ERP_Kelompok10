const mongoose = require('mongoose');
const currency = require('currency.js');

const allowedOverview = (admin) =>
  admin.businessRoles?.some((role) =>
    ['management', 'finance'].includes(role)
  );

const projectScope = (admin) =>
  allowedOverview(admin) ? {} : { manager: admin._id };

const fail = (message) => {
  const error = new Error(message);
  error.status = 409;
  throw error;
};

function minor(value) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    fail('Terdapat nominal keuangan yang tidak valid.');
  }

  const result = currency(value).intValue;

  if (!Number.isSafeInteger(result)) {
    fail('Nominal melebihi batas perhitungan.');
  }

  return result;
}

function add(a, b) {
  if (!Number.isSafeInteger(a + b)) {
    fail('Total melebihi batas perhitungan.');
  }

  return a + b;
}

const major = (value) => value / 100;

exports.list = async function list(req, res) {
  const projects = await mongoose.model('Project')
    .find(projectScope(req.admin))
    .select('code name')
    .sort({ code: 1 })
    .lean();

  return res.status(200).json({
    success: true,
    result: projects,
    message: 'Daftar proyek sesuai akses dashboard.',
  });
};

exports.read = async function read(req, res) {
  if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID proyek tidak valid.',
    });
  }

  const Project = mongoose.model('Project');
  const Contract = mongoose.model('Contract');
  const ProjectBudget = mongoose.model('ProjectBudget');
  const Allocation = mongoose.model('Allocation');
  const Timesheet = mongoose.model('Timesheet');
  const Expense = mongoose.model('Expense');
  const Milestone = mongoose.model('Milestone');
  const Invoice = mongoose.model('Invoice');
  const Payment = mongoose.model('Payment');

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const project = await Project.findOne({
        _id: req.params.id,
        ...projectScope(req.admin),
      })
        .session(session)
        .lean();

      if (!project) {
        const error = new Error(
          'Proyek tidak ditemukan dalam cakupan akses Anda.'
        );
        error.status = 404;
        throw error;
      }

      const contract = await Contract.findById(project.contract)
        .session(session)
        .lean();

      if (!contract || !/^[A-Z]{3}$/.test(contract.currency || '')) {
        fail('Kontrak atau mata uang proyek tidak valid.');
      }

      const warnings = [];
      const contractMinor = minor(contract.contractValue);

      const budget = await ProjectBudget.findOne({
        project: project._id,
        isCurrent: true,
        approvalStatus: 'established',
      })
        .session(session)
        .lean();

      if (budget && budget.currency !== contract.currency) {
        fail('Mata uang anggaran berbeda dari kontrak.');
      }

      const allocations = await Allocation.find({
        project: project._id,
      })
        .session(session)
        .lean();

      const timesheets = await Timesheet.find({
        allocation: {
          $in: allocations.map((item) => item._id),
        },
        approvalStatus: 'approved',
      })
        .session(session)
        .lean();

      const expenses = await Expense.find({
        project: project._id,
        approvalStatus: 'approved',
      })
        .session(session)
        .lean();

      const milestones = await Milestone.find({
        project: project._id,
      })
        .session(session)
        .lean();

      const invoices = await Invoice.find({
        project: project._id,
        removed: false,
        status: { $nin: ['draft', 'cancelled', 'refunded'] },
      })
        .session(session)
        .lean();

      const payments = await Payment.find({
        invoice: {
          $in: invoices.map((item) => item._id),
        },
        removed: false,
      })
        .setOptions({ autopopulate: false })
        .session(session)
        .lean();

      let hours = 0;
      let laborMinor = 0;
      let expenseMinor = 0;
      let vendorMinor = 0;

      for (const item of timesheets) {
        if (
          item.currency !== contract.currency ||
          !Number.isFinite(item.workHours) ||
          item.workHours <= 0 ||
          !Number.isFinite(item.hourlyCostSnapshot) ||
          item.hourlyCostSnapshot <= 0
        ) {
          fail('Timesheet approved memiliki jam, tarif, atau mata uang tidak valid.');
        }

        const amount = currency(item.hourlyCostSnapshot)
          .multiply(item.workHours)
          .intValue;

        laborMinor = add(laborMinor, amount);
        hours += item.workHours;
      }

      for (const item of expenses) {
        if (item.currency !== contract.currency) {
          fail('Mata uang pengeluaran berbeda dari kontrak.');
        }

        const amount = minor(item.amount);
        expenseMinor = add(expenseMinor, amount);

        if (item.vendor) {
          vendorMinor = add(vendorMinor, amount);
        }
      }

      const actualMinor = add(laborMinor, expenseMinor);

      let progress = 0;

      for (const item of milestones) {
        if (
          item.status === 'completed' &&
          item.approvalStatus === 'approved'
        ) {
          if (
            !Number.isFinite(item.progressWeight) ||
            item.progressWeight <= 0
          ) {
            fail('Bobot milestone tidak valid.');
          }

          progress += item.progressWeight;
        }
      }

      if (progress > 100.000001) {
        fail('Total bobot milestone terverifikasi melebihi 100%.');
      }

      const ledgerByInvoice = new Map();

      for (const payment of payments) {
        if (payment.currency !== contract.currency) {
          fail('Mata uang pembayaran berbeda dari kontrak.');
        }

        if (!(payment.amount > 0)) {
          fail('Nominal pembayaran tidak valid.');
        }

        const key = String(payment.invoice);

        ledgerByInvoice.set(
          key,
          add(
            ledgerByInvoice.get(key) || 0,
            minor(payment.amount)
          )
        );
      }

      let invoicedMinor = 0;
      let receivedMinor = 0;
      let storedCreditMinor = 0;
      let overdueMinor = 0;

      const today = new Date().toISOString().slice(0, 10);
      const invoiceDetails = [];

      for (const invoice of invoices) {
        if (invoice.currency !== contract.currency) {
          fail('Mata uang invoice berbeda dari kontrak.');
        }

        const net =
          minor(invoice.total) - minor(invoice.discount || 0);

        if (net < 0) fail('Diskon melebihi total invoice.');

        const paid =
          ledgerByInvoice.get(String(invoice._id)) || 0;
        const stored = minor(invoice.credit || 0);
        const remaining = net - paid;

        if (paid !== stored) {
          warnings.push(
            `Invoice ${invoice.number}/${invoice.year}: total riwayat pembayaran berbeda dari credit invoice.`
          );
        }

        if (remaining < 0) {
          warnings.push(
            `Invoice ${invoice.number}/${invoice.year}: pembayaran melebihi nilai invoice.`
          );
        }

        const expectedStatus =
          paid === 0
            ? 'unpaid'
            : paid === net
              ? 'paid'
              : paid < net
                ? 'partially'
                : 'overpaid';

        if (invoice.paymentStatus !== expectedStatus) {
          warnings.push(
            `Invoice ${invoice.number}/${invoice.year}: status pembayaran tidak sesuai perhitungan.`
          );
        }

        const linkedMilestone = milestones.find(
          (item) => String(item._id) === String(invoice.milestone)
        );

        if (
          !linkedMilestone ||
          minor(invoice.subTotal) !==
            minor(linkedMilestone.billingAmount)
        ) {
          warnings.push(
            `Invoice ${invoice.number}/${invoice.year}: hubungan atau nilai milestone perlu diperiksa.`
          );
        }

        const overdue =
          remaining > 0 &&
          invoice.expiredDate &&
          new Date(invoice.expiredDate)
            .toISOString()
            .slice(0, 10) < today;

        invoicedMinor = add(invoicedMinor, net);
        receivedMinor = add(receivedMinor, paid);
        storedCreditMinor = add(storedCreditMinor, stored);

        if (overdue) {
          overdueMinor = add(overdueMinor, remaining);
        }

        invoiceDetails.push({
          _id: invoice._id,
          number: invoice.number,
          year: invoice.year,
          total: major(net),
          received: major(paid),
          storedCredit: major(stored),
          remaining: major(remaining),
          paymentStatus: invoice.paymentStatus,
          overdue: Boolean(overdue),
        });
      }

      const sharedCount = await Project.countDocuments({
        contract: contract._id,
      }).session(session);

      if (sharedCount > 1) {
        warnings.push(
          'Kontrak digunakan beberapa proyek. Margin per proyek belum dihitung karena pembagian nilai kontrak belum ditentukan.'
        );
      }

      if (!budget) {
        warnings.push('Proyek belum memiliki anggaran berlaku.');
      }

      const budgetMinor = budget ? minor(budget.total) : null;

      if (budgetMinor !== null && actualMinor > budgetMinor) {
        warnings.push('Biaya aktual melampaui anggaran berlaku.');
      }

      const gapMinor =
        sharedCount === 1
          ? contractMinor - actualMinor
          : null;

      result = {
        project,
        contractCode: contract.code,
        currency: contract.currency,
        contractValue: major(contractMinor),
        progress: Number(progress.toFixed(2)),
        budget: budgetMinor === null ? null : major(budgetMinor),
        budgetVersion: budget?.version || null,
        approvedHours: Number(hours.toFixed(8)),
        laborCost: major(laborMinor),
        expenseCost: major(expenseMinor),
        vendorCost: major(vendorMinor),
        actualCost: major(actualMinor),
        budgetUsage:
          budgetMinor > 0
            ? Number(((actualMinor / budgetMinor) * 100).toFixed(2))
            : null,
        budgetVariance:
          budgetMinor === null
            ? null
            : major(actualMinor - budgetMinor),
        invoiced: major(invoicedMinor),
        received: major(receivedMinor),
        storedCredit: major(storedCreditMinor),
        receivable: major(invoicedMinor - receivedMinor),
        overdueReceivable: major(overdueMinor),
        contractCostGap:
          gapMinor === null ? null : major(gapMinor),
        recordedCostMargin:
          gapMinor === null || contractMinor === 0
            ? null
            : Number(((gapMinor / contractMinor) * 100).toFixed(2)),
        invoiceDetails,
        warnings,
        generatedAt: new Date(),
      };
    }, {
      readConcern: { level: 'snapshot' },
    });

    return res.status(200).json({
      success: true,
      result,
      message: 'Dashboard proyek berhasil dihitung.',
    });
  } catch (err) {
    if ([404, 409].includes(err.status)) {
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