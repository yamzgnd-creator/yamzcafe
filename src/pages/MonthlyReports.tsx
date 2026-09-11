import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Area,
  AreaChart,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Loader2,
  Download,
  Users,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CalendarDays,
  Clock,
  FileText,
  ChevronLeft,
  ChevronRight,
  Mail,
  Send,
  Settings2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  reportsApi,
  type MonthlyReport,
  type BalanceReportSettings,
  type StudentWithParent,
  type LastReportRun,
} from '@/lib/api';
import { toast } from 'sonner';
import { format } from 'date-fns';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#64748b',
];

const PAYMENT_LABELS: Record<string, string> = {
  account: 'Account Balance',
  cash: 'Cash',
  card: 'Credit/Debit Card',
  online: 'Online Payment',
};

const TYPE_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  deposit: 'Deposit',
  refund: 'Refund',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function MonthlyReports() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<MonthlyReport | null>(null);

  // Balance report state
  const [reportSettings, setReportSettings] = useState<BalanceReportSettings>({
    enabled: false,
    frequency: 'monthly',
    day_of_week: 1,
    day_of_month: 1,
    low_balance_threshold: 5,
    include_transactions: true,
  });
  const [studentsWithParents, setStudentsWithParents] = useState<StudentWithParent[]>([]);
  const [lastRun, setLastRun] = useState<LastReportRun | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sendingReports, setSendingReports] = useState(false);
  const [sendingStudentId, setSendingStudentId] = useState<string | null>(null);
  const [confirmSendAll, setConfirmSendAll] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reportsApi.getMonthlyReport(selectedMonth, selectedYear);
      setReport(data);
    } catch (err) {
      console.error('Failed to load monthly report:', err);
      toast.error('Failed to load monthly report');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  const loadBalanceReportData = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const [settings, students, lastRunData] = await Promise.all([
        reportsApi.getBalanceReportSettings(),
        reportsApi.getStudentsWithParents(),
        reportsApi.getLastBalanceReportRun(),
      ]);
      setReportSettings(settings);
      setStudentsWithParents(students);
      setLastRun(lastRunData);
    } catch (err) {
      console.error('Failed to load balance report data:', err);
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (activeTab === 'parent-reports') {
      loadBalanceReportData();
    }
  }, [activeTab, loadBalanceReportData]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);

  const parseDate = (dateStr: string): Date => {
    if (!dateStr) return new Date(NaN);
    if (dateStr.includes('T')) {
      return new Date(dateStr);
    }
    return new Date(dateStr + 'T12:00:00');
  };

  const formatShortDate = (dateStr: string) => {
    try {
      const d = parseDate(dateStr);
      if (isNaN(d.getTime())) return dateStr || '—';
      return format(d, 'MMM d');
    } catch {
      return dateStr || '—';
    }
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
  };

  const goToPrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const isCurrentOrFuture = selectedYear > now.getFullYear() ||
    (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth() + 1);

  const yearOptions = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  // Save balance report settings
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await reportsApi.saveBalanceReportSettings(reportSettings);
      toast.success('Balance report settings saved');
    } catch (err) {
      console.error('Failed to save settings:', err);
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // Send reports to all parents
  const handleSendAllReports = async () => {
    setConfirmSendAll(false);
    setSendingReports(true);
    try {
      const result = await reportsApi.sendBulkBalanceReports(reportSettings.frequency);
      if (result.sent > 0) {
        toast.success(`${result.sent} balance report(s) sent successfully`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} report(s) failed to send`);
      }
      if (result.sent === 0 && result.failed === 0) {
        toast.info('No students with linked parent emails found');
      }
      // Reload last run data
      const lastRunData = await reportsApi.getLastBalanceReportRun();
      setLastRun(lastRunData);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to send reports:', err);
      toast.error(`Failed to send reports: ${errorMsg}`);
    } finally {
      setSendingReports(false);
    }
  };

  // Send report for a single student
  const handleSendSingleReport = async (studentId: string) => {
    setSendingStudentId(studentId);
    try {
      const result = await reportsApi.sendSingleBalanceReport(studentId, reportSettings.frequency);
      if (result.sent > 0) {
        toast.success('Balance report sent to parent(s)');
      } else {
        toast.error(result.errors?.[0]?.error || 'Failed to send report');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to send single report:', err);
      toast.error(`Failed to send report: ${errorMsg}`);
    } finally {
      setSendingStudentId(null);
    }
  };

  // CSV export
  const exportCSV = () => {
    if (!report) return;

    const lines: string[] = [];
    lines.push('MONTHLY REPORT');
    lines.push(`Month,${MONTH_NAMES[report.month - 1]} ${report.year}`);
    lines.push('');
    lines.push('SUMMARY');
    lines.push(`Total Sales,${report.summary.total_sales}`);
    lines.push(`Total Deposits,${report.summary.total_deposits}`);
    lines.push(`Total Refunds,${report.summary.total_refunds}`);
    lines.push(`Net Revenue,${report.summary.net_revenue}`);
    lines.push(`Total Transactions,${report.summary.total_transactions}`);
    lines.push(`Avg Transaction,${report.summary.avg_transaction}`);
    lines.push(`Unique Students,${report.summary.unique_students}`);
    lines.push('');
    lines.push('DAILY BREAKDOWN');
    lines.push('Date,Transactions,Sales,Deposits,Refunds');
    report.daily_breakdown.forEach(d => {
      lines.push(`${d.date},${d.transaction_count},${d.total_sales},${d.total_deposits},${d.total_refunds}`);
    });
    lines.push('');
    lines.push('TOP SELLING ITEMS');
    lines.push('Item,Category,Quantity,Revenue,Orders');
    report.top_items.forEach(item => {
      lines.push(`"${item.name}",${item.category},${item.total_quantity},${item.total_revenue},${item.order_count}`);
    });
    lines.push('');
    lines.push('PAYMENT METHODS');
    lines.push('Method,Transactions,Amount');
    report.payment_methods.forEach(pm => {
      lines.push(`${pm.method},${pm.transaction_count},${pm.total_amount}`);
    });

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monthly-report-${report.year}-${String(report.month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Monthly report exported');
  };

  // Change indicator component
  const ChangeIndicator = ({ value, suffix = '%' }: { value: number; suffix?: string }) => {
    if (value === 0) return (
      <span className="flex items-center text-xs text-muted-foreground">
        <Minus className="h-3 w-3 mr-0.5" /> 0{suffix}
      </span>
    );
    if (value > 0) return (
      <span className="flex items-center text-xs text-emerald-600">
        <ArrowUpRight className="h-3 w-3 mr-0.5" /> +{value}{suffix}
      </span>
    );
    return (
      <span className="flex items-center text-xs text-red-500">
        <ArrowDownRight className="h-3 w-3 mr-0.5" /> {value}{suffix}
      </span>
    );
  };

  // Chart data
  const dailyChartData = report?.daily_breakdown.map(d => ({
    date: formatShortDate(d.date),
    sales: d.total_sales,
    deposits: d.total_deposits,
    transactions: d.transaction_count,
  })) || [];

  const hourlyChartData = report?.hourly_breakdown.map(h => ({
    hour: formatHour(h.hour),
    transactions: h.transaction_count,
    amount: h.total_amount,
  })) || [];

  const paymentPieData = report?.payment_methods.map(pm => ({
    name: PAYMENT_LABELS[pm.method] || pm.method,
    value: pm.total_amount,
  })) || [];

  const categoryPieData = report?.category_breakdown.map(c => ({
    name: c.category,
    value: c.total_revenue,
  })) || [];

  const typePieData = report?.transaction_types.map(t => ({
    name: TYPE_LABELS[t.type] || t.type,
    value: t.total_amount,
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Monthly Reports
          </h1>
          <p className="text-muted-foreground">
            Comprehensive monthly financial and operational summaries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select
            value={String(selectedMonth)}
            onValueChange={(v) => setSelectedMonth(parseInt(v, 10))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, idx) => (
                <SelectItem key={idx} value={String(idx + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => setSelectedYear(parseInt(v, 10))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextMonth}
            disabled={isCurrentOrFuture}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!report || loading}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Tabs: Overview vs Parent Reports */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <FileText className="h-4 w-4" />
            Monthly Overview
          </TabsTrigger>
          <TabsTrigger value="parent-reports" className="gap-2">
            <Mail className="h-4 w-4" />
            Send Reports to Parents
          </TabsTrigger>
        </TabsList>

        {/* ─── OVERVIEW TAB ─── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !report ? (
            <Card>
              <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
                <p>No report data available</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <DollarSign className="h-5 w-5 text-emerald-600" />
                      </div>
                      <ChangeIndicator value={report.comparison.sales_change} />
                    </div>
                    <div className="mt-3">
                      <p className="text-2xl font-bold">{formatCurrency(report.summary.total_sales)}</p>
                      <p className="text-xs text-muted-foreground">Total Sales</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <TrendingUp className="h-5 w-5 text-indigo-600" />
                      </div>
                      <ChangeIndicator value={report.comparison.transactions_change} />
                    </div>
                    <div className="mt-3">
                      <p className="text-2xl font-bold">{report.summary.total_transactions}</p>
                      <p className="text-xs text-muted-foreground">Total Transactions</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <CreditCard className="h-5 w-5 text-blue-600" />
                      </div>
                      <ChangeIndicator value={report.comparison.deposits_change} />
                    </div>
                    <div className="mt-3">
                      <p className="text-2xl font-bold">{formatCurrency(report.summary.total_deposits)}</p>
                      <p className="text-xs text-muted-foreground">Total Deposits</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                        <Users className="h-5 w-5 text-amber-600" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="text-2xl font-bold">{formatCurrency(report.summary.avg_transaction)}</p>
                      <p className="text-xs text-muted-foreground">Avg Transaction</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Secondary Stats */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xl font-bold">{formatCurrency(report.summary.net_revenue)}</p>
                      <p className="text-xs text-muted-foreground">Net Revenue (Sales - Refunds)</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-xl font-bold">{report.summary.unique_students}</p>
                      <p className="text-xs text-muted-foreground">Unique Students</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                      <TrendingDown className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xl font-bold">{formatCurrency(report.summary.total_refunds)}</p>
                      <p className="text-xs text-muted-foreground">Total Refunds</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Daily Revenue Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    Daily Revenue — {MONTH_NAMES[report.month - 1]} {report.year}
                  </CardTitle>
                  <CardDescription>
                    Sales and deposits broken down by day
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {dailyChartData.length === 0 ? (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <p>No transaction data for this month</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <AreaChart data={dailyChartData}>
                        <defs>
                          <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="depositsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip
                          formatter={(value: number, name: string) => [
                            formatCurrency(value),
                            name === 'sales' ? 'Sales' : 'Deposits',
                          ]}
                        />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="sales"
                          stroke="#22c55e"
                          fill="url(#salesGradient)"
                          strokeWidth={2}
                          name="Sales"
                        />
                        <Area
                          type="monotone"
                          dataKey="deposits"
                          stroke="#6366f1"
                          fill="url(#depositsGradient)"
                          strokeWidth={2}
                          name="Deposits"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Two-column: Hourly + Payment Methods */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Busiest Hours
                    </CardTitle>
                    <CardDescription>Purchase transactions by hour of day</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {hourlyChartData.length === 0 ? (
                      <div className="flex items-center justify-center h-48 text-muted-foreground">
                        <p>No data available</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={hourlyChartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="hour" className="text-xs" interval={0} angle={-45} textAnchor="end" height={50} />
                          <YAxis className="text-xs" />
                          <Tooltip />
                          <Bar
                            dataKey="transactions"
                            fill="#6366f1"
                            radius={[4, 4, 0, 0]}
                            name="Transactions"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Payment Methods</CardTitle>
                    <CardDescription>Revenue distribution by payment type</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {paymentPieData.length === 0 ? (
                      <div className="flex items-center justify-center h-48 text-muted-foreground">
                        <p>No data available</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={paymentPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={80}
                              dataKey="value"
                              label={({ name, percent }) =>
                                `${name} ${(percent * 100).toFixed(0)}%`
                              }
                            >
                              {paymentPieData.map((_, idx) => (
                                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-3 mt-2 justify-center">
                          {paymentPieData.map((entry, idx) => (
                            <div key={entry.name} className="flex items-center gap-1.5 text-sm">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                              />
                              <span>{entry.name}: {formatCurrency(entry.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Two-column: Transaction Types + Category Breakdown */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Transaction Types</CardTitle>
                    <CardDescription>Breakdown by transaction category</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {typePieData.length === 0 ? (
                      <div className="flex items-center justify-center h-48 text-muted-foreground">
                        <p>No data available</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={typePieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={80}
                              dataKey="value"
                              label={({ name, percent }) =>
                                `${name} ${(percent * 100).toFixed(0)}%`
                              }
                            >
                              {typePieData.map((_, idx) => (
                                <Cell key={idx} fill={['#22c55e', '#6366f1', '#ef4444', '#f59e0b'][idx] || COLORS[idx]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-3 mt-2 justify-center">
                          {typePieData.map((entry, idx) => (
                            <div key={entry.name} className="flex items-center gap-1.5 text-sm">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: ['#22c55e', '#6366f1', '#ef4444', '#f59e0b'][idx] || COLORS[idx] }}
                              />
                              <span>{entry.name}: {formatCurrency(entry.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Sales by Category</CardTitle>
                    <CardDescription>Menu category revenue distribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {categoryPieData.length === 0 ? (
                      <div className="flex items-center justify-center h-48 text-muted-foreground">
                        <p>No data available</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={categoryPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={80}
                              dataKey="value"
                              label={({ name, percent }) =>
                                `${name} ${(percent * 100).toFixed(0)}%`
                              }
                            >
                              {categoryPieData.map((_, idx) => (
                                <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap gap-3 mt-2 justify-center">
                          {categoryPieData.map((entry, idx) => (
                            <div key={entry.name} className="flex items-center gap-1.5 text-sm capitalize">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                              />
                              <span>{entry.name}: {formatCurrency(entry.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Top Selling Items Table */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingBag className="h-5 w-5" />
                      Top Selling Items
                    </CardTitle>
                    <CardDescription>
                      Best performing menu items for {MONTH_NAMES[report.month - 1]} {report.year}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {report.top_items.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p>No item sales data for this month</p>
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={Math.min(report.top_items.length * 40, 400)}>
                        <BarChart
                          data={report.top_items.slice(0, 10).map(item => ({
                            name: item.name.length > 20 ? item.name.slice(0, 20) + '…' : item.name,
                            revenue: item.total_revenue,
                            quantity: item.total_quantity,
                          }))}
                          layout="vertical"
                          margin={{ left: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" className="text-xs" />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={140}
                            className="text-xs"
                          />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Bar
                            dataKey="revenue"
                            fill="#22c55e"
                            radius={[0, 4, 4, 0]}
                            name="Revenue"
                          />
                        </BarChart>
                      </ResponsiveContainer>

                      <div className="mt-6">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10">#</TableHead>
                              <TableHead>Item</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead className="text-right">Qty Sold</TableHead>
                              <TableHead className="text-right">Orders</TableHead>
                              <TableHead className="text-right">Revenue</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {report.top_items.map((item, idx) => (
                              <TableRow key={`${item.name}-${idx}`}>
                                <TableCell className="font-mono text-muted-foreground">
                                  {idx + 1}
                                </TableCell>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="capitalize">
                                    {item.category}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {item.total_quantity}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {item.order_count}
                                </TableCell>
                                <TableCell className="text-right font-mono font-medium text-emerald-600">
                                  {formatCurrency(item.total_revenue)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Daily Breakdown Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    Daily Breakdown
                  </CardTitle>
                  <CardDescription>
                    Transaction details for each day of the month
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {report.daily_breakdown.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>No daily data available</p>
                    </div>
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Transactions</TableHead>
                            <TableHead className="text-right">Sales</TableHead>
                            <TableHead className="text-right">Deposits</TableHead>
                            <TableHead className="text-right">Refunds</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {report.daily_breakdown.map((day) => (
                            <TableRow key={day.date}>
                              <TableCell className="font-medium">
                                {(() => {
                                  try {
                                    const d = parseDate(day.date);
                                    if (isNaN(d.getTime())) return day.date || '—';
                                    return format(d, 'EEE, MMM d');
                                  } catch {
                                    return day.date || '—';
                                  }
                                })()}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {day.transaction_count}
                              </TableCell>
                              <TableCell className="text-right font-mono text-emerald-600">
                                {formatCurrency(day.total_sales)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-indigo-600">
                                {formatCurrency(day.total_deposits)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-red-500">
                                {day.total_refunds > 0 ? formatCurrency(day.total_refunds) : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2 font-bold">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-right font-mono">
                              {report.summary.total_transactions}
                            </TableCell>
                            <TableCell className="text-right font-mono text-emerald-600">
                              {formatCurrency(report.summary.total_sales)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-indigo-600">
                              {formatCurrency(report.summary.total_deposits)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-red-500">
                              {report.summary.total_refunds > 0 ? formatCurrency(report.summary.total_refunds) : '—'}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Month-over-Month Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>Month-over-Month Comparison</CardTitle>
                  <CardDescription>
                    {MONTH_NAMES[report.month - 1]} {report.year} vs {MONTH_NAMES[(report.month - 2 + 12) % 12]} {report.month === 1 ? report.year - 1 : report.year}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="p-4 rounded-lg border">
                      <p className="text-sm text-muted-foreground mb-1">Sales Change</p>
                      <div className="flex items-center gap-2">
                        <ChangeIndicator value={report.comparison.sales_change} />
                        <span className="text-sm text-muted-foreground">
                          from {formatCurrency(report.comparison.prev_total_sales)}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border">
                      <p className="text-sm text-muted-foreground mb-1">Transaction Change</p>
                      <div className="flex items-center gap-2">
                        <ChangeIndicator value={report.comparison.transactions_change} />
                        <span className="text-sm text-muted-foreground">
                          from {report.comparison.prev_total_transactions}
                        </span>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border">
                      <p className="text-sm text-muted-foreground mb-1">Deposit Change</p>
                      <ChangeIndicator value={report.comparison.deposits_change} />
                    </div>
                    <div className="p-4 rounded-lg border">
                      <p className="text-sm text-muted-foreground mb-1">Refund Change</p>
                      <ChangeIndicator value={report.comparison.refunds_change} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ─── PARENT REPORTS TAB ─── */}
        <TabsContent value="parent-reports" className="space-y-6 mt-4">
          {loadingSettings ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Report Settings Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5" />
                    Balance Report Settings
                  </CardTitle>
                  <CardDescription>
                    Configure how and when balance reports are sent to parents via email
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">Enable Scheduled Reports</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically send balance reports to parents
                      </p>
                    </div>
                    <Switch
                      checked={reportSettings.enabled}
                      onCheckedChange={(checked) =>
                        setReportSettings({ ...reportSettings, enabled: checked })
                      }
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select
                        value={reportSettings.frequency}
                        onValueChange={(v) =>
                          setReportSettings({ ...reportSettings, frequency: v as 'weekly' | 'monthly' })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {reportSettings.frequency === 'weekly' ? (
                      <div className="space-y-2">
                        <Label>Day of Week</Label>
                        <Select
                          value={String(reportSettings.day_of_week)}
                          onValueChange={(v) =>
                            setReportSettings({ ...reportSettings, day_of_week: parseInt(v, 10) })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAY_NAMES.map((day, idx) => (
                              <SelectItem key={idx} value={String(idx)}>
                                {day}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Day of Month</Label>
                        <Select
                          value={String(reportSettings.day_of_month)}
                          onValueChange={(v) =>
                            setReportSettings({ ...reportSettings, day_of_month: parseInt(v, 10) })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                              <SelectItem key={day} value={String(day)}>
                                {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Low Balance Threshold ($)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={reportSettings.low_balance_threshold}
                        onChange={(e) =>
                          setReportSettings({
                            ...reportSettings,
                            low_balance_threshold: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-end pb-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="include-transactions"
                          checked={reportSettings.include_transactions}
                          onCheckedChange={(checked) =>
                            setReportSettings({ ...reportSettings, include_transactions: checked })
                          }
                        />
                        <Label htmlFor="include-transactions" className="text-sm">
                          Include recent transactions
                        </Label>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSaveSettings} disabled={savingSettings}>
                      {savingSettings ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Settings2 className="h-4 w-4 mr-2" />
                      )}
                      Save Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Send Reports Card */}
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5" />
                        Send Balance Reports
                      </CardTitle>
                      <CardDescription>
                        Send {reportSettings.frequency} balance reports to parents via email.
                        {reportSettings.frequency === 'weekly'
                          ? ' Covers the last 7 days.'
                          : ' Covers the previous month.'}
                      </CardDescription>
                    </div>
                    <Button
                      onClick={() => setConfirmSendAll(true)}
                      disabled={sendingReports || studentsWithParents.length === 0}
                      className="shrink-0"
                    >
                      {sendingReports ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4 mr-2" />
                      )}
                      Send to All Parents ({studentsWithParents.length})
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Last Run Info */}
                  {lastRun && (
                    <div className="mb-4 p-3 rounded-lg border bg-muted/50 flex flex-wrap items-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Last sent:</span>
                        <span className="font-medium">
                          {new Date(lastRun.ran_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: 'numeric', minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <Badge variant="outline" className="capitalize">{lastRun.frequency}</Badge>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span>{lastRun.sent} sent</span>
                      </div>
                      {lastRun.failed > 0 && (
                        <div className="flex items-center gap-1.5">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span>{lastRun.failed} failed</span>
                        </div>
                      )}
                    </div>
                  )}

                  {studentsWithParents.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="font-medium">No students with linked parent emails</p>
                      <p className="text-sm mt-1">
                        Link parents to students in Student Management to enable balance reports.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[500px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>Grade</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                            <TableHead>Parent</TableHead>
                            <TableHead>Parent Email</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {studentsWithParents.map((record) => (
                            <TableRow key={`${record.student_id}-${record.parent_id}`}>
                              <TableCell className="font-medium">{record.student_name}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{record.grade || '—'}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <span
                                  className={`font-mono font-medium ${
                                    record.balance < reportSettings.low_balance_threshold
                                      ? 'text-red-500'
                                      : 'text-emerald-600'
                                  }`}
                                >
                                  {formatCurrency(record.balance)}
                                </span>
                                {record.balance < reportSettings.low_balance_threshold && (
                                  <AlertTriangle className="inline h-3.5 w-3.5 ml-1 text-amber-500" />
                                )}
                              </TableCell>
                              <TableCell>{record.parent_name}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {record.parent_email}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSendSingleReport(record.student_id)}
                                  disabled={sendingStudentId === record.student_id}
                                >
                                  {sendingStudentId === record.student_id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Send className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirm Send All Dialog */}
      <Dialog open={confirmSendAll} onOpenChange={setConfirmSendAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Balance Reports to All Parents?</DialogTitle>
            <DialogDescription>
              This will send {reportSettings.frequency} balance report emails to{' '}
              <strong>{studentsWithParents.length}</strong> parent-student pairs.
              {reportSettings.frequency === 'weekly'
                ? ' The report covers the last 7 days.'
                : ' The report covers the previous month.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>
                {new Set(studentsWithParents.map(s => s.parent_email)).size} unique parent email(s)
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSendAll(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendAllReports}>
              <Send className="h-4 w-4 mr-2" />
              Send Reports
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}