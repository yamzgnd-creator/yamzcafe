import { Suspense, lazy } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { BrandingProvider } from '@/contexts/BrandingContext';

// Eagerly load only the login page (first page users see)
import Login from '@/pages/Login';

// Lazy load all other pages to reduce initial bundle and memory usage
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const PosTerminal = lazy(() => import('@/pages/PosTerminal'));
const MenuManagement = lazy(() => import('@/pages/MenuManagement'));
const StudentManagement = lazy(() => import('@/pages/StudentManagement'));
const TransactionHistory = lazy(() => import('@/pages/TransactionHistory'));
const Reports = lazy(() => import('@/pages/Reports'));
const MonthlyReports = lazy(() => import('@/pages/MonthlyReports'));
const InventoryManagement = lazy(() => import('@/pages/InventoryManagement'));
const PreOrders = lazy(() => import('@/pages/PreOrders'));
const UserManagement = lazy(() => import('@/pages/UserManagement'));
const StudentLookup = lazy(() => import('@/pages/StudentLookup'));
const CreditManagement = lazy(() => import('@/pages/CreditManagement'));
const MealCategoryManagement = lazy(() => import('@/pages/MealCategoryManagement'));
const UserPermissions = lazy(() => import('@/pages/UserPermissions'));
const PendingTransactions = lazy(() => import('@/pages/PendingTransactions'));
const ParentDashboard = lazy(() => import('@/pages/ParentDashboard'));
const ParentPreOrdering = lazy(() => import('@/pages/ParentPreOrdering'));
const ParentDietaryManagement = lazy(() => import('@/pages/ParentDietaryManagement'));
const ParentNotificationSettings = lazy(() => import('@/pages/ParentNotificationSettings'));
const ParentGuardianManagement = lazy(() => import('@/pages/ParentGuardianManagement'));
const ParentAccountSetup = lazy(() => import('@/pages/ParentAccountSetup'));
const NotificationCenter = lazy(() => import('@/pages/NotificationCenter'));
const SystemSettings = lazy(() => import('@/pages/SystemSettings'));
const PaymentGatewayManagement = lazy(() => import('@/pages/PaymentGatewayManagement'));
const DietaryManagement = lazy(() => import('@/pages/DietaryManagement'));
const MealPlanManagement = lazy(() => import('@/pages/MealPlanManagement'));
const AuditHistory = lazy(() => import('@/pages/AuditHistory'));
const Aftercare = lazy(() => import('@/pages/Aftercare'));
const AftercareBilling = lazy(() => import('@/pages/AftercareBilling'));
const ParentAftercare = lazy(() => import('@/pages/ParentAftercare'));

const DashboardLayout = lazy(() => import('@/components/DashboardLayout'));
const NotFound = lazy(() => import('@/pages/NotFound'));

const queryClient = new QueryClient();

/** Loading fallback shown while lazy chunks are fetched */
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrandingProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public */}
                <Route path="/" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/parent/account-setup" element={<ParentAccountSetup />} />

                {/* Protected — Admin/Staff layout */}
                <Route
                  element={
                    <DashboardLayout
                      allowedRoles={['admin', 'staff', 'cashier']}
                    />
                  }
                >
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/pos" element={<PosTerminal />} />
                  <Route path="/menu" element={<MenuManagement />} />
                  <Route path="/students" element={<StudentManagement />} />
                  <Route path="/transactions" element={<TransactionHistory />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/monthly-reports" element={<MonthlyReports />} />
                  <Route path="/inventory" element={<InventoryManagement />} />
                  <Route path="/preorders" element={<PreOrders />} />
                  <Route path="/users" element={<UserManagement />} />
                  <Route path="/student-lookup" element={<StudentLookup />} />
                  <Route path="/credit-management" element={<CreditManagement />} />
                  <Route path="/meal-categories" element={<MealCategoryManagement />} />
                  <Route path="/user-permissions" element={<UserPermissions />} />
                  <Route path="/pending-transactions" element={<PendingTransactions />} />
                  <Route path="/notifications" element={<NotificationCenter />} />
                  <Route path="/settings" element={<SystemSettings />} />
                  <Route path="/payment-gateways" element={<PaymentGatewayManagement />} />
                  <Route path="/dietary-management" element={<DietaryManagement />} />
                  <Route path="/meal-plan-management" element={<MealPlanManagement />} />
                  <Route path="/audit-history" element={<AuditHistory />} />
                  <Route path="/aftercare" element={<Aftercare />} />
                  <Route path="/aftercare-billing" element={<AftercareBilling />} />
                </Route>

                {/* Protected — Parent layout */}
                <Route
                  element={
                    <DashboardLayout
                      allowedRoles={['parent', 'admin', 'staff']}
                    />
                  }
                >
                  <Route path="/parent/dashboard" element={<ParentDashboard />} />
                  <Route path="/parent/preorders" element={<ParentPreOrdering />} />
                  <Route path="/parent/dietary" element={<ParentDietaryManagement />} />
                  <Route path="/parent/notifications" element={<ParentNotificationSettings />} />
                  <Route path="/parent/guardians" element={<ParentGuardianManagement />} />
                  <Route path="/parent/aftercare" element={<ParentAftercare />} />
                </Route>

                {/* Catch-all */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </BrandingProvider>
  </QueryClientProvider>
);

export default App;