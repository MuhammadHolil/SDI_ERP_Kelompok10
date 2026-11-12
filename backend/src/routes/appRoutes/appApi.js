const express = require('express');
const { catchErrors } = require('@/handlers/errorHandlers');
const router = express.Router();

const listMilestones = require(
  '@/controllers/sdiControllers/listMilestones'
);

const createMilestonePlan = require(
  '@/controllers/sdiControllers/createMilestonePlan'
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
    requireBusinessRole(
      'project_manager',
      'project_team',
      'expense_approver',
      'finance'
    ),
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

routesList.forEach(({ entity, controllerName }) => {
  const controller = appControllers[controllerName];
  routerApp(entity, controller);
});

module.exports = router;
