import { lazy } from 'react';

import { Navigate } from 'react-router-dom';

const Logout = lazy(() => import('@/pages/Logout.jsx'));
const NotFound = lazy(() => import('@/pages/NotFound.jsx'));

const ChangeControl = lazy(() =>
  import('@/pages/ChangeControl')
);

const InvoiceMilestonePayment = lazy(() =>
  import('@/pages/Invoice/InvoiceMilestonePayment')
);

const ProjectDashboard = lazy(() =>
  import('@/pages/ProjectDashboard')
);

const ExpenseReview = lazy(() => import('@/pages/Expense/ExpenseReview'));

const Expense = lazy(() => import('@/pages/Expense'));

const Timesheet = lazy(() => import('@/pages/Timesheet'));

const Project = lazy(() => import('@/pages/Project'));

const MasterData = lazy(() => import('@/pages/MasterData'));

const UserAccount = lazy(() => import('@/pages/UserAccount'));

const Expert = lazy(() => import('@/pages/Expert'));

const Contract = lazy(() => import('@/pages/Contract'));

const InvoiceMilestoneBilling = lazy(() =>
  import('@/pages/Invoice/InvoiceMilestoneBilling')
);

const ProjectRead = lazy(() =>
  import('@/pages/Project/ProjectRead')
);

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Customer = lazy(() => import('@/pages/Customer'));
const Invoice = lazy(() => import('@/pages/Invoice'));
const InvoiceCreate = lazy(() => import('@/pages/Invoice/InvoiceCreate'));

const InvoiceRead = lazy(() => import('@/pages/Invoice/InvoiceRead'));
const InvoiceUpdate = lazy(() => import('@/pages/Invoice/InvoiceUpdate'));
const InvoiceRecordPayment = lazy(() => import('@/pages/Invoice/InvoiceRecordPayment'));
const Quote = lazy(() => import('@/pages/Quote/index'));
const QuoteCreate = lazy(() => import('@/pages/Quote/QuoteCreate'));
const QuoteRead = lazy(() => import('@/pages/Quote/QuoteRead'));
const QuoteUpdate = lazy(() => import('@/pages/Quote/QuoteUpdate'));
const Payment = lazy(() => import('@/pages/Payment/index'));
const PaymentRead = lazy(() => import('@/pages/Payment/PaymentRead'));
const PaymentUpdate = lazy(() => import('@/pages/Payment/PaymentUpdate'));

const Settings = lazy(() => import('@/pages/Settings/Settings'));
const PaymentMode = lazy(() => import('@/pages/PaymentMode'));
const Taxes = lazy(() => import('@/pages/Taxes'));

const Profile = lazy(() => import('@/pages/Profile'));

const TimesheetReview = lazy(() =>
  import('@/pages/Timesheet/TimesheetReview')
);

const About = lazy(() => import('@/pages/About'));

let routes = {
  expense: [],
  default: [
    {
      path: '/change-control',
      element: <ChangeControl />,
    },
    {
      path: '/project',
      element: <Project />,
    },

    {
      path: '/dashboard-kpi',
      element: <ProjectDashboard />,
    },

    {
      path: '/invoice/milestone-payment/:id',
      element: <InvoiceMilestonePayment />,
    },

    {
     path: '/invoice/billing',
     element: <InvoiceMilestoneBilling />,
    },

    {
      path: '/contract',
      element: <Contract />,
    },

    {
      path: '/expert',
      element: <Expert />,
    },
    {
      path: '/user-account',
      element: <UserAccount />,
    },
    {
      path: '/master-data',
      element: <MasterData />,
    },
    { path: '/expense', element: <Expense /> },
    { path: '/expense-review', element: <ExpenseReview /> },
    {
      path: '/timesheet-review',
      element: <TimesheetReview />,
    },
    {
      path: '/project/read/:id',
      element: <ProjectRead />,
    },
    {
      path: '/timesheet',
      element: <Timesheet />,
    },
    {
      path: '/login',
      element: <Navigate to="/" />,
    },
    {
      path: '/logout',
      element: <Logout />,
    },
    {
      path: '/about',
      element: <About />,
    },
    {
      path: '/',
      element: <Dashboard />,
    },
    {
      path: '/customer',
      element: <Customer />,
    },

    {
      path: '/invoice',
      element: <Invoice />,
    },
    {
      path: '/invoice/create',
      element: <InvoiceCreate />,
    },
    {
      path: '/invoice/read/:id',
      element: <InvoiceRead />,
    },
    {
      path: '/invoice/update/:id',
      element: <InvoiceUpdate />,
    },
    {
      path: '/invoice/pay/:id',
      element: <InvoiceRecordPayment />,
    },
    {
      path: '/quote',
      element: <Quote />,
    },
    {
      path: '/quote/create',
      element: <QuoteCreate />,
    },
    {
      path: '/quote/read/:id',
      element: <QuoteRead />,
    },
    {
      path: '/quote/update/:id',
      element: <QuoteUpdate />,
    },
    {
      path: '/payment',
      element: <Payment />,
    },
    {
      path: '/payment/read/:id',
      element: <PaymentRead />,
    },
    {
      path: '/payment/update/:id',
      element: <PaymentUpdate />,
    },

    {
      path: '/settings',
      element: <Settings />,
    },
    {
      path: '/settings/edit/:settingsKey',
      element: <Settings />,
    },
    {
      path: '/payment/mode',
      element: <PaymentMode />,
    },
    {
      path: '/taxes',
      element: <Taxes />,
    },

    {
      path: '/profile',
      element: <Profile />,
    },
    {
      path: '*',
      element: <NotFound />,
    },
  ],
};

export default routes;
