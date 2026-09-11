// API client for YAMZ Cafe backend (Express on port 3000, proxied via Vite)

const API_BASE = '/api';
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'local_auth_user';

export interface ApiError {
  error: string;
  status: number;
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    let errorCode = '';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
      errorCode = errorData.code || '';
    } catch {
      // ignore parse error
    }

    // Auto-logout on auth errors (stale token, user not found, expired)
    if (response.status === 401 && !endpoint.includes('/auth/login')) {
      console.warn('Auth error detected, clearing session:', errorMessage);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      // Redirect to login page if not already there
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }

    throw new Error(errorMessage);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    role: string;
    full_name: string;
    permissions: string[];
  };
  token: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  full_name: string;
  role: string;
  student_id?: string;
  grade?: string;
  balance?: number;
  photo?: string;
  phone_number?: string;
  permissions: string[];
  is_active?: boolean;
  created_at?: string;
}

export const authApi = {
  login: (payload: LoginPayload) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getProfile: () => request<UserProfile>('/auth/profile'),

  resetUserPassword: (userId: string, newPassword: string) =>
    request<{ success: boolean }>('/auth/reset-user-password', {
      method: 'POST',
      body: JSON.stringify({ userId, newPassword }),
    }),

  resetPassword: (email: string) =>
    request<{ success: boolean }>('/auth/reset-password-request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  validateResetToken: (token: string) =>
    request<{ valid: boolean; error?: string; user?: { full_name: string; email: string } }>(
      `/auth/validate-reset-token?token=${encodeURIComponent(token)}`
    ),

  resetPasswordWithToken: (token: string, newPassword: string) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),
};

// ─── Token helpers ───────────────────────────────────────────────────────────

export const tokenHelpers = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  removeToken: () => localStorage.removeItem(TOKEN_KEY),
  getStoredUser: (): LoginResponse['user'] | null => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setStoredUser: (user: LoginResponse['user']) =>
    localStorage.setItem(USER_KEY, JSON.stringify(user)),
  removeStoredUser: () => localStorage.removeItem(USER_KEY),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

// ─── Menu ────────────────────────────────────────────────────────────────────
// Actual DB columns: id, item_id, name, description, price, calories, is_healthy,
//   image, image_alt, is_available, created_at, updated_at, category, allergens,
//   dietary_tags, prep_time, serving_size

export interface MenuItem {
  id: string;
  item_id?: string;
  name: string;
  description: string;
  price: number;
  calories?: number;
  is_healthy?: boolean;
  category: string;
  is_available: boolean;
  image?: string;
  image_alt?: string;
  allergens: string[];
  dietary_tags?: string[];
  prep_time?: number;
  serving_size?: string;
  stock_quantity?: number;
  max_stock?: number;
  low_stock_threshold?: number;
  created_at?: string;
  updated_at?: string;
}

export const menuApi = {
  getAll: () => request<MenuItem[]>('/menu/items'),
  getAvailable: () => request<MenuItem[]>('/menu/items?is_available=true'),
  getById: (id: string) => request<MenuItem>(`/menu/items/${id}`),
  create: (data: Partial<MenuItem>) =>
    request<MenuItem>('/menu/items', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<MenuItem>) =>
    request<MenuItem>(`/menu/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/menu/items/${id}`, { method: 'DELETE' }),
};

// ─── Inventory ───────────────────────────────────────────────────────────────

export const inventoryApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<MenuItem[]>(`/inventory${qs}`);
  },
  adjustStock: (id: string, delta: number) =>
    request<MenuItem>(`/inventory/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ delta }),
    }),
  restock: (id: string, data: { amount: number; max_stock?: number; low_stock_threshold?: number }) =>
    request<MenuItem>(`/inventory/${id}/restock`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ─── Students ────────────────────────────────────────────────────────────────

export interface ParentLink {
  link_id: string;
  parent_id: string;
  relationship?: string;
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
}

export interface Student {
  id: string;
  student_id: string;
  full_name: string;
  email?: string;
  grade?: string;
  homeroom?: string;
  balance: number;
  photo?: string;
  account_status: string;
  meal_program?: string;
  dietary_restrictions?: string;
  allergies?: string;
  phone_number?: string;
  spending_limit?: number;
  parent_guardian?: string;
  parent_email_address?: string;
  created_at?: string;
  // Backward-compatible: first parent flat fields
  parent_name?: string;
  parent_email?: string;
  parent_id?: string;
  link_id?: string;
  relationship?: string;
  // Multiple parents array
  parents?: ParentLink[];
}

export interface BulkImportResult {
  imported: Student[];
  errors: { row: number; student_id: string; full_name: string; error: string }[];
}

export interface GradeSummaryItem {
  grade: string;
  count: number;
}

export interface GradeSummaryResponse {
  summary: GradeSummaryItem[];
  raw: Record<string, number>;
}

export interface PromotionPreviewItem {
  id: string;
  student_id: string;
  full_name: string;
  from_grade: string;
  to_grade: string;
}

export interface GraduatingItem {
  id: string;
  student_id: string;
  full_name: string;
  grade: string;
  normalized_grade: string;
}

export interface SkippedItem {
  id: string;
  student_id: string;
  full_name: string;
  grade: string;
  reason: string;
}

export interface PromoteGradesResponse {
  dry_run: boolean;
  success?: boolean;
  total_students?: number;
  to_promote?: number;
  to_graduate?: number;
  promoted?: number;
  graduated?: number;
  skipped: number;
  errors?: { student_id: string; full_name: string; error: string }[];
  promotions: PromotionPreviewItem[];
  graduating: GraduatingItem[];
  skipped_details: SkippedItem[];
}

export const studentApi = {
  getAll: () => request<Student[]>('/students'),
  search: (q: string) => request<Student[]>(`/students?search=${encodeURIComponent(q)}`),
  getById: (id: string) => request<Student>(`/students/${id}`),
  create: (data: Partial<Student>) =>
    request<Student>('/students', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Student>) =>
    request<Student>(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  bulkImport: (students: Partial<Student>[]) =>
    request<BulkImportResult>('/students/bulk-import', {
      method: 'POST',
      body: JSON.stringify({ students }),
    }),
  getGradeSummary: () =>
    request<GradeSummaryResponse>('/students/grade-summary'),
  promoteGrades: (data: { graduating_grade?: string; graduating_action?: string; selected_grades?: string[] }, dryRun = false) =>
    request<PromoteGradesResponse>(`/students/promote-grades${dryRun ? '?dry_run=true' : ''}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ─── Transactions ────────────────────────────────────────────────────────────
// Actual DB columns: id, transaction_id, student_id, cashier_id, terminal_id,
//   transaction_type, payment_method, subtotal, tax, total, cash_received,
//   change_given, receipt_number, notes, created_at, status

export interface Transaction {
  id: string;
  transaction_id?: string;
  student_id?: string;
  student_name?: string;
  student_number?: string;
  cashier_id?: string;
  processed_by_name?: string;
  transaction_type?: string;
  type: string;           // mapped from transaction_type
  amount: number;         // mapped from total
  subtotal?: number;
  tax?: number;
  total?: number;
  payment_method: string;
  status: string;
  receipt_number?: string;
  notes?: string;
  items?: TransactionItem[];
  created_at: string;
}

export interface TransactionItem {
  id: string;
  menu_item_id: string;
  item_name: string;
  quantity: number;
  price: number;
  unit_price: number;
  total_price?: number;
}

export interface CreateTransactionPayload {
  student_id?: string;
  items: { menu_item_id: string; quantity: number }[];
  payment_method: string;
  notes?: string;
  cash_received?: number;
  change_given?: number;
  discount_amount?: number;
  discount_type?: string;
  discount_reason?: string;
}

export interface TodayStats {
  total_transactions: string;
  total_sales: string;
  avg_order: string;
}

export interface PopularItem {
  menu_item_id: string;
  name: string;
  total_qty: string;
  price: number;
  image?: string;
  category?: string;
}

export interface RecentCashierTx {
  id: string;
  transaction_id: string;
  total: number;
  payment_method: string;
  created_at: string;
  status: string;
  student_name?: string;
  items: { name: string; quantity: number }[];
}

export const transactionApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<Transaction[]>(`/transactions${qs}`);
  },
  getById: (id: string) => request<Transaction>(`/transactions/${id}`),
  create: (data: CreateTransactionPayload) =>
    request<Transaction>('/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  addCredit: (data: { student_id: string; amount: number; payment_method: string; notes?: string }) =>
    request<Transaction>('/transactions/add-credit', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  emailReceipt: (id: string, email?: string) =>
    request<{ message: string; email: string }>(`/transactions/${id}/email-receipt`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  getTodayStats: () => request<TodayStats>('/transactions/stats/today'),
  getPopularItems: () => request<PopularItem[]>('/transactions/stats/popular-items'),
  getRecentCashier: () => request<RecentCashierTx[]>('/transactions/stats/recent-cashier'),
};

// ─── Dashboard / Reports ─────────────────────────────────────────────────────

export interface DashboardStats {
  todayRevenue: number;
  todayTransactions: number;
  activeStudents: number;
  lowBalanceCount: number;
  recentTransactions: Transaction[];
}

export interface FinancialReportRow {
  date: string;
  transaction_count: number;
  total_sales: number;
  total_credits: number;
  total_refunds: number;
}

export interface MenuSalesRow {
  id: string;
  name: string;
  category: string;
  times_sold: number;
  total_quantity: number;
  total_revenue: number;
}

export interface TransactionStatsSummary {
  total_transactions: number;
  total_sales: number;
  total_credits: number;
  total_refunds: number;
  avg_transaction: number;
}

// ─── Monthly Report Types ────────────────────────────────────────────────────

export interface MonthlyReportSummary {
  total_transactions: number;
  total_sales: number;
  total_deposits: number;
  total_refunds: number;
  avg_transaction: number;
  unique_students: number;
  unique_cashiers: number;
  net_revenue: number;
}

export interface MonthlyReportComparison {
  sales_change: number;
  transactions_change: number;
  deposits_change: number;
  refunds_change: number;
  prev_total_sales: number;
  prev_total_transactions: number;
}

export interface MonthlyDailyBreakdown {
  date: string;
  transaction_count: number;
  total_sales: number;
  total_deposits: number;
  total_refunds: number;
}

export interface MonthlyTopItem {
  name: string;
  category: string;
  total_quantity: number;
  total_revenue: number;
  order_count: number;
}

export interface MonthlyPaymentMethod {
  method: string;
  transaction_count: number;
  total_amount: number;
}

export interface MonthlyTransactionType {
  type: string;
  transaction_count: number;
  total_amount: number;
}

export interface MonthlyHourlyBreakdown {
  hour: number;
  transaction_count: number;
  total_amount: number;
}

export interface MonthlyCategoryBreakdown {
  category: string;
  total_quantity: number;
  total_revenue: number;
}

export interface MonthlyReport {
  month: number;
  year: number;
  summary: MonthlyReportSummary;
  comparison: MonthlyReportComparison;
  daily_breakdown: MonthlyDailyBreakdown[];
  top_items: MonthlyTopItem[];
  payment_methods: MonthlyPaymentMethod[];
  transaction_types: MonthlyTransactionType[];
  hourly_breakdown: MonthlyHourlyBreakdown[];
  category_breakdown: MonthlyCategoryBreakdown[];
}

// ─── Balance Report Types ────────────────────────────────────────────────────

export interface BalanceReportSettings {
  enabled: boolean;
  frequency: 'weekly' | 'monthly';
  day_of_week: number;
  day_of_month: number;
  low_balance_threshold: number;
  include_transactions: boolean;
}

export interface StudentWithParent {
  student_id: string;
  student_name: string;
  student_number: string;
  grade: string;
  balance: number;
  parent_id: string;
  parent_name: string;
  parent_email: string;
}

export interface BalanceReportResult {
  message: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: { parent_email: string; student_name?: string; error: string }[];
}

export interface LastReportRun {
  ran_at: string;
  frequency: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
}

export const reportsApi = {
  getDashboardStats: () => request<DashboardStats>('/reports/dashboard-stats'),
  getFinancialReport: (startDate: string, endDate: string) =>
    request<FinancialReportRow[]>(`/reports/financial?start_date=${startDate}&end_date=${endDate}`),
  getMenuSales: (startDate: string, endDate: string) =>
    request<MenuSalesRow[]>(`/reports/menu-sales?start_date=${startDate}&end_date=${endDate}`),
  getStudentBalances: (threshold?: number) =>
    request<Student[]>(`/reports/student-balances${threshold ? `?threshold=${threshold}` : ''}`),
  getTransactionStats: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    const qs = params.toString();
    return request<TransactionStatsSummary>(`/transactions/stats/summary${qs ? `?${qs}` : ''}`);
  },
  getMonthlyReport: (month: number, year: number) =>
    request<MonthlyReport>(`/reports/monthly?month=${month}&year=${year}`),

  // Balance report endpoints
  getBalanceReportSettings: () =>
    request<BalanceReportSettings>('/reports/balance-report-settings'),
  saveBalanceReportSettings: (settings: Partial<BalanceReportSettings>) =>
    request<{ message: string; settings: BalanceReportSettings }>('/reports/balance-report-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  getStudentsWithParents: () =>
    request<StudentWithParent[]>('/reports/students-with-parents'),
  sendBulkBalanceReports: (frequency: string) =>
    request<BalanceReportResult>('/reports/send-balance-reports', {
      method: 'POST',
      body: JSON.stringify({ frequency }),
    }),
  sendSingleBalanceReport: (studentId: string, frequency: string) =>
    request<BalanceReportResult>(`/reports/send-balance-report/${studentId}`, {
      method: 'POST',
      body: JSON.stringify({ frequency }),
    }),
  getLastBalanceReportRun: () =>
    request<LastReportRun | null>('/reports/last-balance-report-run'),
};

// ─── Users (Admin) ───────────────────────────────────────────────────────────

export interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone_number?: string;
  account_status?: string;
  is_active?: boolean;
  permissions?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateUserPayload {
  full_name: string;
  email: string;
  password: string;
  role: string;
  phone_number?: string;
}

export interface UpdateUserPayload {
  full_name?: string;
  email?: string;
  role?: string;
  phone_number?: string;
  account_status?: string;
}

export const usersApi = {
  getAll: () => request<ManagedUser[]>('/users'),
  create: (data: CreateUserPayload) =>
    request<ManagedUser>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateUserPayload) =>
    request<ManagedUser>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/users/${id}`, { method: 'DELETE' }),
  unlock: (id: string) =>
    request<{ message: string; user: ManagedUser }>(`/users/${id}/unlock`, {
      method: 'POST',
    }),
};

// ─── Parent-Student Linking ──────────────────────────────────────────────────

export interface ParentStudentLink {
  id: string;
  parent_id: string;
  student_id: string;
  relationship?: string;
  created_at?: string;
}

export const parentStudentApi = {
  link: (parentId: string, studentId: string, relationship?: string) =>
    request<ParentStudentLink>('/users/link-parent-student', {
      method: 'POST',
      body: JSON.stringify({ parentId, studentId, relationship: relationship || 'parent' }),
    }),
  unlink: (linkId: string) =>
    request<void>(`/users/unlink-parent-student/${linkId}`, {
      method: 'DELETE',
    }),
  getStudentsByParent: (parentId: string) =>
    request<Student[]>(`/students?parent_id=${parentId}`),
};

// ─── Meal Categories ─────────────────────────────────────────────────────────

export interface MealCategory {
  id: string;
  name: string;
  description?: string;
  display_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const mealCategoryApi = {
  getAll: () => request<MealCategory[]>('/menu/categories'),
  create: (data: Partial<MealCategory>) =>
    request<MealCategory>('/menu/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<MealCategory>) =>
    request<MealCategory>(`/menu/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/menu/categories/${id}`, { method: 'DELETE' }),
};

// ─── Pending Transactions ────────────────────────────────────────────────────

export interface PendingTransaction {
  id: string;
  transaction_id?: string;
  student_id?: string;
  student_name?: string;
  student_number?: string;
  cashier_id?: string;
  processed_by_name?: string;
  transaction_type?: string;
  type: string;
  amount: number;
  total?: number;
  payment_method: string;
  status: string;
  failure_reason?: string;
  terminal_id?: string;
  receipt_number?: string;
  notes?: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
}

export const pendingTransactionApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<PendingTransaction[]>(`/transactions/pending${qs}`);
  },
  resolve: (id: string, data: { resolution: string; notes?: string }) =>
    request<PendingTransaction>(`/transactions/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ─── User Permissions ────────────────────────────────────────────────────────

export const userPermissionsApi = {
  getAll: (role?: string) => {
    const qs = role && role !== 'all' ? `?role=${role}` : '';
    return request<ManagedUser[]>(`/users${qs}`);
  },
  updatePermissions: (id: string, permissions: string[]) =>
    request<ManagedUser>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ permissions }),
    }),
};

// ─── File Upload ─────────────────────────────────────────────────────────────

export interface UploadResult {
  success: boolean;
  path: string;
  url: string;
  filename: string;
  originalName: string;
  size: number;
  mimetype: string;
}

export interface UploadedFile {
  filename: string;
  path: string;
  url: string;
  size: number;
  uploadedAt: string;
}

export const uploadApi = {
  /**
   * Upload a single image file to the given category (students, menu, logos, backgrounds).
   */
  uploadImage: async (category: string, file: File): Promise<UploadResult> => {
    const token = localStorage.getItem('auth_token');
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch(`${API_BASE}/uploads/${category}`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }

    return res.json();
  },

  /**
   * List all uploaded files in a category.
   */
  listByCategory: (category: string) =>
    request<UploadedFile[]>(`/uploads/${category}`),

  /**
   * Delete an uploaded file by category and filename.
   */
  deleteFile: (category: string, filename: string) =>
    request<{ success: boolean; message: string }>(`/uploads/${category}/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),
};

// ─── Branding ────────────────────────────────────────────────────────────────

export interface BrandingSettings {
  company_name?: string;
  tagline?: string;
  logo_url?: string;
  login_logo_url?: string;
  login_logo_size?: string;
  welcome_text?: string;
  subtitle_text?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  website_url?: string;
  currency_symbol?: string;
  timezone?: string;
  date_format?: string;
  favicon_url?: string;
  site_background_image?: string;
  login_background_image?: string;
  dashboard_background_image?: string;
  login_bg_opacity?: number;
  login_bg_blur?: number;
  login_card_opacity?: number;
}

export const brandingApi = {
  get: () => request<BrandingSettings>('/settings/branding/company'),
};

// ─── Parent Portal ───────────────────────────────────────────────────────────

export interface ParentChild {
  id: string;
  student_id: string;
  full_name: string;
  grade?: string;
  photo?: string;
  balance: number;
  account_status?: string;
  dietary_restrictions?: string;
  allergies?: string;
  meal_program?: string;
  spending_limit?: number;
}

export interface ParentDashboardData {
  children: ParentChild[];
  recentTransactions: Transaction[];
  totalSpentToday: number;
  totalSpentWeek: number;
  totalSpentMonth: number;
}

export const parentApi = {
  getDashboard: () => request<ParentDashboardData>('/students?parent_id=me'),
  getChildren: () => request<ParentChild[]>('/students?parent_id=me'),
  getChildTransactions: (studentId: string) =>
    request<Transaction[]>(`/transactions?student_id=${studentId}`),
};

// ─── Guardian Management (Parent-accessible) ────────────────────────────────

export interface Guardian {
  link_id: string;
  id: string;
  full_name: string;
  email: string;
  phone_number?: string;
  relationship?: string;
  linked_at?: string;
}

export const guardianApi = {
  getByChild: (studentId: string) =>
    request<Guardian[]>(`/users/child/${studentId}/guardians`),
  add: (studentId: string, email: string, relationship?: string, full_name?: string) =>
    request<Guardian & { account_created?: boolean }>(`/users/child/${studentId}/guardians`, {
      method: 'POST',
      body: JSON.stringify({ email, relationship: relationship || 'guardian', full_name }),
    }),
  remove: (studentId: string, linkId: string) =>
    request<{ message: string }>(`/users/child/${studentId}/guardians/${linkId}`, {
      method: 'DELETE',
    }),
};

// ─── Pre-Orders ──────────────────────────────────────────────────────────────

export interface PreOrder {
  id: string;
  order_number?: string;
  student_id: string;
  student_name?: string;
  student_number?: string;
  parent_id?: string;
  scheduled_menu_id?: string;
  order_date: string;
  meal_type?: string;
  status: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  payment_method?: string;
  payment_status?: string;
  special_instructions?: string;
  cutoff_time?: string;
  ordered_at?: string;
  confirmed_at?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  created_at: string;
  updated_at?: string;
}

export interface CreatePreOrderPayload {
  student_id: string;
  parent_id?: string;
  scheduled_menu_id?: string;
  order_date: string;
  meal_type?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  payment_method?: string;
  special_instructions?: string;
}

export const preOrderApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<PreOrder[]>(`/pre-orders${qs}`);
  },
  getById: (id: string) => request<PreOrder>(`/pre-orders/${id}`),
  getByStudent: (studentId: string) =>
    request<PreOrder[]>(`/pre-orders?student_id=${studentId}`),
  create: (data: CreatePreOrderPayload) =>
    request<PreOrder>('/pre-orders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateStatus: (id: string, status: string) =>
    request<PreOrder>(`/pre-orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  cancel: (id: string) =>
    request<{ message: string }>(`/pre-orders/${id}`, {
      method: 'DELETE',
    }),
  cancelOrder: (id: string, reason?: string) =>
    request<{ message: string; order: PreOrder }>(`/pre-orders/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    }),
  update: (id: string, data: { meal_type?: string; special_instructions?: string; order_date?: string; scheduled_menu_id?: string }) =>
    request<PreOrder>(`/pre-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ─── Meal Subscriptions ──────────────────────────────────────────────────────

export interface MealSubscription {
  id: string;
  student_id: string;
  parent_id: string;
  meal_type: string;
  days_of_week: number[];
  status: 'active' | 'paused' | 'cancelled';
  special_instructions?: string;
  max_daily_amount: number;
  start_date: string;
  end_date?: string;
  student_name?: string;
  student_number?: string;
  student_grade?: string;
  created_at?: string;
  updated_at?: string;
}

export const mealSubscriptionApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<MealSubscription[]>(`/meal-subscriptions${qs}`);
  },
  create: (data: {
    student_id: string;
    meal_type?: string;
    days_of_week?: number[];
    special_instructions?: string;
    max_daily_amount?: number;
    start_date?: string;
    end_date?: string;
  }) =>
    request<MealSubscription>('/meal-subscriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<MealSubscription>) =>
    request<MealSubscription>(`/meal-subscriptions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  updateStatus: (id: string, status: 'active' | 'paused' | 'cancelled') =>
    request<MealSubscription>(`/meal-subscriptions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  delete: (id: string) =>
    request<{ message: string }>(`/meal-subscriptions/${id}`, {
      method: 'DELETE',
    }),
};

// ─── Scheduled Menus ─────────────────────────────────────────────────────────

export interface ScheduledMenu {
  id: string;
  schedule_date: string;
  menu_name: string;
  status: 'draft' | 'published';
  meal_types?: string[];
  notes?: string;
  cutoff_time?: string;
  created_by?: string;
  created_by_name?: string;
  menu_items?: ScheduledMenuItem[];
  order_count?: number;
  total_revenue?: number;
  recurrence_type?: string;
  recurrence_end_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduledMenuItem {
  id: string;
  schedule_item_id?: string;
  menu_item_id?: string;
  meal_type?: string;
  display_order?: number;
  name: string;
  description?: string;
  price: number;
  calories?: number;
  image?: string;
  image_alt?: string;
  category?: string;
  allergens?: string[];
  dietary_tags?: string[];
  is_healthy?: boolean;
  is_available?: boolean;
}

export interface CreateScheduledMenuPayload {
  schedule_date: string;
  menu_name: string;
  status?: string;
  meal_types?: string[];
  notes?: string;
  cutoff_time?: string;
  menu_item_ids?: (string | { menu_item_id: string; meal_type: string })[];
  recurrence_type?: string;
  recurrence_end_date?: string | null;
}

export interface RepeatMonthlyPayload {
  source_year: number;
  source_month: number;
  target_year: number;
  target_month: number;
}

export interface RepeatMonthlyResult {
  message: string;
  created: number;
  skipped: number;
  menus?: ScheduledMenu[];
}

export const scheduledMenuApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<ScheduledMenu[]>(`/scheduled-menus${qs}`);
  },
  getPublished: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<ScheduledMenu[]>(`/scheduled-menus/published${qs}`);
  },
  getById: (id: string) => request<ScheduledMenu>(`/scheduled-menus/${id}`),
  create: (data: CreateScheduledMenuPayload) =>
    request<ScheduledMenu>('/scheduled-menus', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<CreateScheduledMenuPayload>) =>
    request<ScheduledMenu>(`/scheduled-menus/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  publish: (id: string, data?: { recurrence_type?: string; recurrence_end_date?: string | null }) =>
    request<ScheduledMenu & { recurring_copies_created?: number; message?: string }>(
      `/scheduled-menus/${id}/publish`,
      { method: 'PUT', body: JSON.stringify(data || {}) },
    ),
  unpublish: (id: string) =>
    request<ScheduledMenu>(`/scheduled-menus/${id}/unpublish`, { method: 'PUT' }),
  delete: (id: string) =>
    request<{ message: string }>(`/scheduled-menus/${id}`, { method: 'DELETE' }),
  getPreOrders: (id: string) =>
    request<PreOrder[]>(`/scheduled-menus/${id}/pre-orders`),
  setRecurrence: (id: string, data: { recurrence_type: string; recurrence_end_date?: string | null }) =>
    request<ScheduledMenu & { recurring_copies_created?: number; message?: string }>(
      `/scheduled-menus/${id}/recurrence`,
      { method: 'PUT', body: JSON.stringify(data) },
    ),
  repeatMonthly: (data: RepeatMonthlyPayload) =>
    request<RepeatMonthlyResult>('/scheduled-menus/repeat-monthly', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  repeatWeekly: (data: { source_menu_id: string; weeks: number }) =>
    request<{ message: string; created: number; skipped: number }>(
      '/scheduled-menus/repeat-weekly',
      { method: 'POST', body: JSON.stringify(data) },
    ),
};

// ─── Dietary Restrictions ────────────────────────────────────────────────────

export interface DietaryRestriction {
  id: string;
  student_id?: string;
  restriction_name: string;
  category: string;
  severity: string;
  notes?: string;
  medical_documentation?: boolean;
  created_at?: string;
}

export interface DietaryCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_active?: boolean;
}

export interface DietaryTemplate {
  id: string;
  name: string;
  category: string;
  description?: string;
  common_allergens?: string[];
  substitutions?: string[];
  severity_default?: string;
}

export const dietaryApi = {
  getStudentRestrictions: (studentId: string) =>
    request<DietaryRestriction[]>(`/dietary/students/${studentId}/restrictions`),
  addRestriction: (studentId: string, data: Partial<DietaryRestriction>) =>
    request<DietaryRestriction>(`/dietary/students/${studentId}/restrictions`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateRestriction: (id: string, data: Partial<DietaryRestriction>) =>
    request<DietaryRestriction>(`/dietary/restrictions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteRestriction: (id: string) =>
    request<void>(`/dietary/restrictions/${id}`, { method: 'DELETE' }),
  getCategories: () => request<DietaryCategory[]>('/dietary/categories'),
  createCategory: (data: Partial<DietaryCategory>) =>
    request<DietaryCategory>('/dietary/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: string, data: Partial<DietaryCategory>) =>
    request<DietaryCategory>(`/dietary/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getTemplates: () => request<DietaryTemplate[]>('/dietary/templates'),
};

// ─── Notifications ───────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  resolved: boolean;
  resolved_at?: string;
  resolved_note?: string;
  student_name?: string;
  student_id?: string;
  terminal_id?: string;
  created_at: string;
}

export interface NotificationPreferences {
  [key: string]: {
    enabled: boolean;
    frequency: string;
    delivery: string[];
  };
}

export const notificationApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<Notification[]>(`/notifications${qs}`);
  },
  dismiss: (id: string, note?: string) =>
    request<Notification>(`/notifications/${id}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),
  getPreferences: (studentId?: string) => {
    const qs = studentId ? `?student_id=${studentId}` : '';
    return request<NotificationPreferences>(`/notifications/preferences${qs}`);
  },
  updatePreferences: (data: NotificationPreferences, studentId?: string) =>
    request<NotificationPreferences>('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences: data, student_id: studentId }),
    }),
};

// ─── Settings ────────────────────────────────────────────────────────────────

export interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: { value: unknown };
  category: string;
  description: string;
  is_editable: boolean;
}

export const settingsApi = {
  getAll: () => request<SystemSetting[]>('/settings'),
  getByKey: <T = unknown>(key: string) => request<T>(`/settings/${key}`),
  update: (key: string, value: unknown) =>
    request<SystemSetting>(`/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
  getBranding: () => request<BrandingSettings>('/settings/branding/company'),
  updateBranding: (data: Partial<BrandingSettings>) =>
    request<BrandingSettings>('/settings/branding/company', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ─── SMTP Settings ──────────────────────────────────────────────────────────

export interface SmtpSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;
  smtp_from_name: string;
  smtp_from_email: string;
}

export const smtpApi = {
  get: () => request<Partial<SmtpSettings>>('/settings/smtp'),
  save: (data: Partial<SmtpSettings>) =>
    request<{ message: string }>('/settings/smtp', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  sendTest: (recipientEmail: string) =>
    request<{ message: string; messageId: string }>('/settings/smtp/test', {
      method: 'POST',
      body: JSON.stringify({ recipient_email: recipientEmail }),
    }),
};

// ─── Email Templates ─────────────────────────────────────────────────────────

export interface EmailTemplate {
  key: string;
  subject: string;
  body: string;
  is_custom: boolean;
}

export const emailTemplateApi = {
  getAll: () =>
    request<Record<string, EmailTemplate>>('/settings/email-templates'),
  get: (key: string) =>
    request<EmailTemplate>(`/settings/email-templates/${key}`),
  save: (key: string, data: { subject: string; body: string }) =>
    request<EmailTemplate & { message: string }>(`/settings/email-templates/${key}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  reset: (key: string) =>
    request<EmailTemplate & { message: string }>(`/settings/email-templates/${key}/reset`, {
      method: 'POST',
    }),
};

// ─── Payment Gateways ────────────────────────────────────────────────────────

export interface PaymentGateway {
  id: string;
  provider_id: string;
  provider_name: string;
  status: string;
  is_active: boolean;
  environment: string;
  supported_currencies: string[];
  transaction_volume?: number;
  success_rate?: number;
  avg_response_time?: number;
  configured_at?: string;
  configured_by?: string;
}

export const paymentGatewayApi = {
  getAll: () => request<PaymentGateway[]>('/payments/gateways'),
  create: (data: Partial<PaymentGateway>) =>
    request<PaymentGateway>('/payments/gateways', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<PaymentGateway>) =>
    request<PaymentGateway>(`/payments/gateways/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/payments/gateways/${id}`, { method: 'DELETE' }),
  toggle: (id: string) =>
    request<PaymentGateway>(`/payments/gateways/${id}/toggle`, {
      method: 'POST',
    }),
};