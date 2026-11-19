const express = require('express');
const { catchErrors } = require('@/handlers/errorHandlers');
const router = express.Router();

const mongoose = require('mongoose');

const milestoneBilling = require(
  '@/controllers/sdiControllers/milestoneBilling'
);

const projectDashboard = require(
  '@/controllers/sdiControllers/projectDashboard'
);

const changeControl = require(
  '@/controllers/sdiControllers/changeControl'
);

const milestonePayment = require(
  '@/controllers/sdiControllers/milestonePayment'
);

const listMilestones = require(
  '@/controllers/sdiControllers/listMilestones'
);

const milestoneVerification = require(
  '@/controllers/sdiControllers/milestoneVerification'
);

const listContracts = require(
  '@/controllers/sdiControllers/listContracts'
);

const createMilestonePlan = require(
  '@/controllers/sdiControllers/createMilestonePlan'
);

const projectAccessOptions = require(
  '@/controllers/sdiControllers/projectAccessOptions'
);

const establishProjectBudget = require(
  '@/controllers/sdiControllers/establishProjectBudget'
);

const readProjectBudget = require(
  '@/controllers/sdiControllers/readProjectBudget'
);

const createProjectBudget = require(
  '@/controllers/sdiControllers/createProjectBudget'
);

const requireOwner = require('@/middlewares/requireOwner');

const costCategory = require(
  '@/controllers/sdiControllers/costCategory'
);

const projectAccess = require(
  '@/controllers/sdiControllers/projectAccess'
);

const createProject = require(
  '@/controllers/sdiControllers/createProject'
);

const agreeContract = require(
  '@/controllers/sdiControllers/agreeContract'
);

const createContract = require(
  '@/controllers/sdiControllers/createContract'
);

const requireBusinessRole = require(
  '@/middlewares/requireBusinessRole'
);

const requireOwnerForWrite = require(
  '@/middlewares/requireOwnerForWrite'
);

const reverseMilestonePayment = require(
  '@/controllers/sdiControllers/reverseMilestonePayment'
);

const appControllers = require('@/controllers/appControllers');
const { routesList } = require('@/models/utils');

const routerApp = (entity, controller) => {
  router.route(`/${entity}/create`).post(catchErrors(controller['create']));
  router.route(`/${entity}/read/:id`).get(catchErrors(controller['read']));
  router.route(`/${entity}/update/:id`).patch(catchErrors(controller['update']));
  router.route(`/${entity}/delete/:id`).delete(catchErrors(controller['delete']));
  router.route(`/${entity}/search`).get(catchErrors(controller['search']));
  router.route(`/${entity}/list`).get(catchErrors(controller['list']));
  router.route(`/${entity}/listAll`).get(catchErrors(controller['listAll']));
  router.route(`/${entity}/filter`).get(catchErrors(controller['filter']));
  router.route(`/${entity}/summary`).get(catchErrors(controller['summary']));

  if (entity === 'invoice' || entity === 'quote' || entity === 'payment') {
    router.route(`/${entity}/mail`).post(catchErrors(controller['mail']));
  }

  if (entity === 'quote') {
    router.route(`/${entity}/convert/:id`).get(catchErrors(controller['convert']));
  }
};
router.get(
  '/client/search',
  requireBusinessRole('sales', 'finance'),
  catchErrors(async (req, res, next) => {
    // Sales tetap menggunakan pencarian bawaan.
    if (req.admin.businessRoles.includes('sales')) {
      return next();
    }

    const q = req.query.q ?? '';

    if (
      typeof q !== 'string' ||
      q.length > 100 ||
      (req.query.fields !== undefined &&
        req.query.fields !== 'name')
    ) {
      return res.status(400).json({
        success: false,
        result: [],
        message: 'Parameter pencarian pelanggan tidak valid.',
      });
    }

    // Finance hanya mencari nama pelanggan yang terkait
    // dengan invoice aktif.
    const clientIds = await mongoose.model('Invoice').distinct(
      'client',
      { removed: false }
    );

    const escaped = q.trim().replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    const result = await mongoose.model('Client')
      .find({
        _id: { $in: clientIds },
        removed: false,
        ...(escaped
          ? { name: { $regex: escaped, $options: 'i' } }
          : {}),
      })
      .select('_id name')
      .sort({ name: 1 })
      .limit(20)
      .lean();

    return res.status(200).json({
      success: true,
      result,
      message: 'Daftar pelanggan untuk pencarian invoice.',
    });
  })
);
router.use('/client', requireBusinessRole('sales'));

router.use('/quote', requireBusinessRole('sales'));

router.get('/quote/convert/:id', (req, res) => {
  return res.status(403).json({
    success: false,
    result: null,
    message:
      'Invoice harus diterbitkan melalui proses penagihan sesuai kontrak dan milestone.',
  });
});

router.use('/invoice', requireBusinessRole('finance'));
router.use('/payment', requireBusinessRole('finance'));

router
  .route('/contract/create')
  .post(
    requireBusinessRole('sales'),
    catchErrors(createContract)
  );

router
  .route('/contract/agree/:id')
  .post(
    requireBusinessRole('sales'),
    catchErrors(agreeContract)
  );

router
  .route('/project/create')
  .post(
    requireBusinessRole('project_manager'),
    catchErrors(createProject)
  );

router
  .route('/project/list')
  .get(
    requireBusinessRole('project_manager'),
    catchErrors(projectAccess.list)
  );

router
  .route('/project/read/:id')
  .get(
    requireBusinessRole('project_manager'),
    catchErrors(projectAccess.read)
  );

router
  .route('/costcategory/create')
  .post(
    requireOwner,
    catchErrors(costCategory.create)
  );

router
  .route('/costcategory/list')
  .get(
    (req, res, next) => {
      if (req.admin?.role === 'owner') {
        return requireOwner(req, res, next);
      }

      return requireBusinessRole(
        'project_manager',
        'project_team',
        'expense_approver',
        'finance'
      )(req, res, next);
    },
    catchErrors(costCategory.list)
  );

router
  .route('/projectbudget/create')
  .post(
    requireBusinessRole('project_manager'),
    catchErrors(createProjectBudget)
  );

router
  .route('/projectbudget/read/:id')
  .get(
    requireBusinessRole('project_manager'),
    catchErrors(readProjectBudget)
  );

  const listProjectBudgets = require(
  '@/controllers/sdiControllers/listProjectBudgets'
);

router.get(
  '/projectbudget/list',
  requireBusinessRole('project_manager'),
  catchErrors(listProjectBudgets)
);

router
  .route('/projectbudget/establish/:id')
  .post(
    requireBusinessRole('project_manager'),
    catchErrors(establishProjectBudget)
  );

router
  .route('/milestone/create-plan')
  .post(
    requireBusinessRole('project_manager'),
    catchErrors(createMilestonePlan)
  );

router
  .route('/milestone/list/:projectId')
  .get(
    requireBusinessRole('project_manager'),
    catchErrors(listMilestones)
  );

router
  .route('/milestone/list/:projectId')
  .get(
    requireBusinessRole('project_manager'),
    catchErrors(listMilestones)
  );


const expertController = require(
  '@/controllers/sdiControllers/expert'
);

const expertRequireOwner = require(
  '@/middlewares/requireOwner'
);

const expertListAccess = (req, res, next) => {
  if (req.admin?.role === 'owner') {
    return expertRequireOwner(req, res, next);
  }

  return requireBusinessRole('project_manager')(req, res, next);
};

router.post(
  '/expert/create',
  expertRequireOwner,
  catchErrors(expertController.create)
);

router.get(
  '/expert/list',
  expertListAccess,
  catchErrors(expertController.list)
);

const expertCapacity = require(
  '@/controllers/sdiControllers/expertCapacity'
);

router.get(
  '/expert/capacity/:id',
  expertListAccess,
  catchErrors(expertCapacity.read)
);

router.put(
  '/expert/capacity/:id',
  expertRequireOwner,
  catchErrors(expertCapacity.update)
);

const expertRateController = require(
  '@/controllers/sdiControllers/expertRate'
);

const expertRateRequireOwner = require(
  '@/middlewares/requireOwner'
);

const expertRateListAccess = (req, res, next) => {
  if (req.admin?.role === 'owner') {
    return expertRateRequireOwner(req, res, next);
  }

  return requireBusinessRole(
    'project_manager',
    'finance'
  )(req, res, next);
};

router.post(
  '/expertrate/create',
  expertRateRequireOwner,
  catchErrors(expertRateController.create)
);

router.get(
  '/expertrate/list',
  expertRateListAccess,
  catchErrors(expertRateController.list)
);

const createAllocation = require(
  '@/controllers/sdiControllers/createAllocation'
);

router.post(
  '/allocation/create',
  requireBusinessRole('project_manager'),
  catchErrors(createAllocation)
);

const listAllocations = require(
  '@/controllers/sdiControllers/listAllocations'
);

router.get(
  '/allocation/list',
  requireBusinessRole('project_manager', 'expert'),
  catchErrors(listAllocations)
);

const createTimesheet = require(
  '@/controllers/sdiControllers/createTimesheet'
);

router.post(
  '/timesheet/create',
  requireBusinessRole('expert'),
  catchErrors(createTimesheet)
);

const listTimesheets = require(
  '@/controllers/sdiControllers/listTimesheets'
);

router.get(
  '/timesheet/list',
  requireBusinessRole('expert', 'project_manager'),
  catchErrors(listTimesheets)
);

const submitTimesheet = require(
  '@/controllers/sdiControllers/submitTimesheet'
);

router.post(
  '/timesheet/submit/:id',
  requireBusinessRole('expert'),
  catchErrors(submitTimesheet)
);

const reviewTimesheet = require(
  '@/controllers/sdiControllers/reviewTimesheet'
);

router.post(
  '/timesheet/review/:id',
  requireBusinessRole('project_manager'),
  catchErrors(reviewTimesheet)
);

const projectLaborCost = require(
  '@/controllers/sdiControllers/projectLaborCost'
);

router.get(
  '/project/labor-cost/:id',
  requireBusinessRole('project_manager'),
  catchErrors(projectLaborCost)
);

const projectExpenseAccessController = require(
  '@/controllers/sdiControllers/projectExpenseAccess'
);

router.put(
  '/project/access/:id',
  requireBusinessRole('project_manager'),
  catchErrors(projectExpenseAccessController.update)
);

router.get(
  '/project/access/:id',
  requireBusinessRole('project_manager'),
  catchErrors(projectExpenseAccessController.read)
);

const createExpense = require(
  '@/controllers/sdiControllers/createExpense'
);

router.post(
  '/expense/create',
  requireBusinessRole('project_team'),
  catchErrors(createExpense)
);

const listExpenses = require(
  '@/controllers/sdiControllers/listExpenses'
);

router.get(
  '/expense/list',
  requireBusinessRole(
    'project_team',
    'project_manager',
    'expense_approver'
  ),
  catchErrors(listExpenses)
);

const expenseEvidenceController = require(
  '@/controllers/sdiControllers/expenseEvidence'
);

const expenseEvidenceUpload = require(
  '@/middlewares/expenseEvidenceUpload'
);

router.post(
  '/expense/evidence/:id',
  requireBusinessRole('project_team'),
  catchErrors(expenseEvidenceController.authorize),
  expenseEvidenceUpload,
  catchErrors(expenseEvidenceController.upload)
);

const submitExpense = require(
  '@/controllers/sdiControllers/submitExpense'
);

router.post(
  '/expense/submit/:id',
  requireBusinessRole('project_team'),
  catchErrors(submitExpense)
);

const downloadExpenseEvidence = require(
  '@/controllers/sdiControllers/downloadExpenseEvidence'
);

router.get(
  '/expense/evidence/:id/:fileId',
  requireBusinessRole(
    'project_team',
    'project_manager',
    'expense_approver'
  ),
  catchErrors(downloadExpenseEvidence)
);

const reviewExpense = require(
  '@/controllers/sdiControllers/reviewExpense'
);

router.post(
  '/expense/review/:id',
  requireBusinessRole('expense_approver'),
  catchErrors(reviewExpense)
);

const projectActualCost = require(
  '@/controllers/sdiControllers/projectActualCost'
);

router.get(
  '/project/actual-cost/:id',
  requireBusinessRole('project_manager'),
  catchErrors(projectActualCost)
);

const vendorController = require(
  '@/controllers/sdiControllers/vendor'
);

const vendorRequireOwner = require(
  '@/middlewares/requireOwner'
);

const vendorListAccess = (req, res, next) => {
  if (req.admin?.role === 'owner') {
    return vendorRequireOwner(req, res, next);
  }

  return requireBusinessRole(
    'project_manager',
    'project_team',
    'expense_approver',
    'finance'
  )(req, res, next);
};

router.post(
  '/vendor/create',
  vendorRequireOwner,
  catchErrors(vendorController.create)
);

router.get(
  '/vendor/list',
  vendorListAccess,
  catchErrors(vendorController.list)
);

const updateExpense = require(
  '@/controllers/sdiControllers/updateExpense'
);

router.patch(
  '/expense/update/:id',
  requireBusinessRole('project_team'),
  catchErrors(updateExpense)
);

const reviseExpense = require(
  '@/controllers/sdiControllers/reviseExpense'
);

router.post(
  '/expense/revise/:id',
  requireBusinessRole('project_team'),
  catchErrors(reviseExpense)
);

const expenseApprovalHistory = require(
  '@/controllers/sdiControllers/expenseApprovalHistory'
);

router.get(
  '/expense/approvals/:id',
  requireBusinessRole(
    'project_team',
    'project_manager',
    'expense_approver'
  ),
  catchErrors(expenseApprovalHistory)
);

const reviseTimesheet = require(
  '@/controllers/sdiControllers/reviseTimesheet'
);

router.post(
  '/timesheet/revise/:id',
  requireBusinessRole('expert'),
  catchErrors(reviseTimesheet)
);

const updateTimesheet = require(
  '@/controllers/sdiControllers/updateTimesheet'
);

router.patch(
  '/timesheet/update/:id',
  requireBusinessRole('expert'),
  catchErrors(updateTimesheet)
);

const timesheetApprovalHistory = require(
  '@/controllers/sdiControllers/timesheetApprovalHistory'
);

router.get(
  '/timesheet/approvals/:id',
  requireBusinessRole('expert', 'project_manager'),
  catchErrors(timesheetApprovalHistory)
);

router.use('/taxes', requireOwnerForWrite);
router.use('/paymentmode', requireOwnerForWrite);

const serviceController = require(
  '@/controllers/sdiControllers/service'
);

router.post(
  '/service/create',
  requireOwner,
  catchErrors(serviceController.create)
);

const serviceListAccess = (req, res, next) => {
  if (req.admin?.role === 'owner') {
    return requireOwner(req, res, next);
  }

  return requireBusinessRole('sales')(req, res, next);
};

router.get(
  '/service/list',
  serviceListAccess,
  catchErrors(serviceController.list)
);

router.get(
  '/billing/milestones',
  requireBusinessRole('finance'),
  catchErrors(milestoneBilling.list)
);

router.post(
  '/billing/invoice/:id',
  requireBusinessRole('finance'),
  catchErrors(milestoneBilling.create)
);

// Invoice baru harus berasal dari milestone.
router.post('/invoice/create', (req, res) =>
  res.status(403).json({
    success: false,
    result: null,
    message: 'Gunakan halaman Penagihan Milestone.',
  })
);

// Invoice milestone dikunci dari perubahan dan penghapusan biasa.
const protectMilestoneInvoice = async (req, res, next) => {
  if (!/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID invoice tidak valid.',
    });
  }

  const invoice = await mongoose.model('Invoice')
    .findById(req.params.id)
    .select('milestone')
    .lean();

  if (invoice?.milestone) {
    return res.status(409).json({
      success: false,
      result: null,
      message:
        'Invoice milestone tidak dapat diubah atau dihapus melalui fitur biasa.',
    });
  }

  return next();
};

router.patch(
  '/invoice/update/:id',
  catchErrors(protectMilestoneInvoice)
);

router.delete(
  '/invoice/delete/:id',
  catchErrors(protectMilestoneInvoice)
);

router.get(
  '/billing/payments/:id',
  requireBusinessRole('finance'),
  catchErrors(milestonePayment.read)
);

router.post(
  '/billing/payments/:id',
  requireBusinessRole('finance'),
  catchErrors(milestonePayment.create)
);

// Pembayaran invoice milestone menggunakan jalur transaksi yang baru.
router.post(
  '/payment/create',
  catchErrors(async (req, res, next) => {
    if (!/^[a-fA-F0-9]{24}$/.test(req.body.invoice || '')) {
      return res.status(400).json({
        success: false,
        result: null,
        message: 'ID invoice tidak valid.',
      });
    }

    const invoice = await mongoose.model('Invoice')
      .findById(req.body.invoice)
      .select('milestone')
      .lean();

    if (invoice?.milestone) {
      return res.status(403).json({
        success: false,
        result: null,
        message: 'Gunakan halaman Pembayaran Invoice Milestone.',
      });
    }

    return next();
  })
);

// Pembayaran milestone dipertahankan sebagai riwayat transaksi.
const protectMilestonePayment = async (req, res, next) => {
  if (!/^[a-fA-F0-9]{24}$/.test(req.params.id || '')) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID pembayaran tidak valid.',
    });
  }

  const payment = await mongoose.model('Payment')
    .findById(req.params.id)
    .setOptions({ autopopulate: false })
    .select('invoice idempotencyKey')
    .lean();

  const invoice = payment
    ? await mongoose.model('Invoice')
        .findById(payment.invoice)
        .select('milestone')
        .lean()
    : null;

  if (payment?.idempotencyKey || invoice?.milestone) {
    return res.status(409).json({
      success: false,
      result: null,
      message:
        'Pembayaran milestone tidak dapat diedit atau dihapus melalui fitur biasa.',
    });
  }

  return next();
};

router.patch(
  '/payment/update/:id',
  catchErrors(protectMilestonePayment)
);

router.delete(
  '/payment/delete/:id',
  catchErrors(protectMilestonePayment)
);

router.get(
  '/dashboard/projects',
  requireBusinessRole(
    'project_manager',
    'management',
    'finance'
  ),
  catchErrors(projectDashboard.list)
);

router.get(
  '/dashboard/project/:id',
  requireBusinessRole(
    'project_manager',
    'management',
    'finance'
  ),
  catchErrors(projectDashboard.read)
);

router.get(
  '/change-control/:id',
  requireBusinessRole('project_manager', 'management'),
  catchErrors(changeControl.read)
);

router.post(
  '/change-control/:id/submit',
  requireBusinessRole('project_manager'),
  catchErrors(changeControl.submit)
);

router.post(
  '/change-control/review/:id',
  requireBusinessRole('management'),
  catchErrors(changeControl.review)
);

router.post(
  '/billing/payment/:id/reverse',
  requireBusinessRole('finance'),
  catchErrors(reverseMilestonePayment)
);

routesList.forEach(({ entity, controllerName }) => {
  const controller = appControllers[controllerName];
  routerApp(entity, controller);
});

router.get(
  '/contract/list',
  requireBusinessRole('sales', 'project_manager'),
  catchErrors(listContracts)
);

router.get(
  '/project/access-options/:id',
  requireBusinessRole('project_manager'),
  catchErrors(projectAccessOptions)
);

router.post(
  '/milestone/verify/:id',
  requireBusinessRole('project_manager'),
  catchErrors(milestoneVerification.review)
);

router.get(
  '/milestone/verification-history/:id',
  requireBusinessRole('project_manager'),
  catchErrors(milestoneVerification.history)
);

module.exports = router;
