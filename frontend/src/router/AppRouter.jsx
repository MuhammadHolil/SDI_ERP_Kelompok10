import { lazy, useEffect } from 'react';

import { useSelector } from 'react-redux';
import { selectCurrentAdmin } from '@/redux/auth/selectors';
import { Result } from 'antd';

import {} from 'react-router-dom';
import {} from 'react-router-dom';
import { Navigate, useLocation, useRoutes } from 'react-router-dom';
import { useAppContext } from '@/context/appContext';

import routes from './routes';

export default function AppRouter() {
  let location = useLocation();
  const currentAdmin = useSelector(selectCurrentAdmin);
  const businessRoles = currentAdmin?.businessRoles || [];
  const isOwner = currentAdmin?.role === 'owner';

  const homePath = businessRoles.includes('project_manager')
    ? '/project'
    : businessRoles.includes('sales')
      ? '/customer'
      : businessRoles.includes('finance')
        ? '/invoice'
        : businessRoles.includes('expert')
          ? '/timesheet'
          : '/about';

  const { state: stateApp, appContextAction } = useAppContext();
  const { app } = appContextAction;

  const routesList = [];

  Object.entries(routes).forEach(([key, value]) => {
    routesList.push(...value);
  });

  function getAppNameByPath(path) {
    for (let key in routes) {
      for (let i = 0; i < routes[key].length; i++) {
        if (routes[key][i].path === path) {
          return key;
        }
      }
    }
    // Return 'default' app  if the path is not found
    return 'default';
  }
  useEffect(() => {
    if (location.pathname === '/') {
      app.default();
    } else {
      const path = getAppNameByPath(location.pathname);
      app.open(path);
    }
  }, [location]);

    const guardedRoutes = routesList.map((route) => {
    if (route.path === '/') {
      return {
        ...route,
        element: <Navigate to={homePath} replace />,
      };
    }

    let permitted = true;
    if (route.path === '/expense-review') {
      permitted = businessRoles.includes('expense_approver');
      } else if (route.path === '/expense') {
      permitted = businessRoles.includes('project_team');
      } else if (
      route.path === '/project' ||
      route.path.startsWith('/project/')
    ) {
      permitted = businessRoles.includes('project_manager');
      } else if (route.path === '/timesheet-review') {
      permitted = businessRoles.includes('project_manager');
    } else if (
      route.path === '/timesheet' ||
      route.path.startsWith('/timesheet/')
    ) {
      permitted = businessRoles.includes('expert');
    } else if (
      route.path === '/customer' ||
      route.path === '/quote' ||
      route.path.startsWith('/quote/')
    ) {
      permitted = businessRoles.includes('sales');
    } else if (
      route.path === '/invoice' ||
      route.path.startsWith('/invoice/') ||
      route.path === '/payment' ||
      route.path.startsWith('/payment/')
    ) {
      permitted = businessRoles.includes('finance');
    }

    return {
      ...route,
      element: permitted ? (
        route.element
      ) : (
        <Result
          status="403"
          title="Akses ditolak"
          subTitle="Akun Anda tidak memiliki izin membuka halaman ini."
        />
      ),
    };
  });

  let element = useRoutes(guardedRoutes);

  return element;
}
