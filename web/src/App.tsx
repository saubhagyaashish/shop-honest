import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuditorLayout } from './auditor/AuditorLayout'
import { AuditPage } from './auditor/pages/AuditPage'
import { AuditorHome } from './auditor/pages/AuditorHome'
import { NotFound } from './auditor/pages/NotFound'
import { StoreLayout } from './store/StoreLayout'
import { CartPage } from './store/pages/CartPage'
import { CheckoutPage } from './store/pages/CheckoutPage'
import { OrderPlacedPage, PaymentPage } from './store/pages/PaymentPage'
import { ProductPage } from './store/pages/ProductPage'
import { StoreHome } from './store/pages/StoreHome'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AuditorLayout />,
    children: [
      { index: true, element: <AuditorHome /> },
      { path: 'audit/:auditId', element: <AuditPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/demo/:storeKey',
    element: <StoreLayout />,
    children: [
      { index: true, element: <StoreHome /> },
      { path: 'p/:slug', element: <ProductPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'payment', element: <PaymentPage /> },
      { path: 'order-placed', element: <OrderPlacedPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
