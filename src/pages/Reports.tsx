import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Loader2,
  Calendar,
  Download,
  BarChart3,
  PieChartIcon,
} from 'lucide-react';
import {
  reportsApi,
  type FinancialReportRow,
  type MenuSalesRow,
  type TransactionStatsSummary,
} from '@/lib/api';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';

const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#64748b',
];

export default function Reports() {
  const [startDate, setStartDate] = useState(
    format(subDays(new Date(), 30), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);

  const [financialData, setFinancialData] = useState<FinancialReportRow[]>([]);
  const [menuSales, setMenuSales] = useState<MenuSalesRow[]>([]);
  const [stats, setStats] = useState<TransactionStatsSummary | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const [financial, menu, txStats] = await Promise.allSettled([
        reportsApi.getFinancialReport(startDate, endDate),
        reportsApi.getMenuSales(startDate, endDate),
        reportsApi.getTransactionStats(startDate, endDate),
      ]);

      if (financial.status === 'fulfilled') {
        setFinancialData(Array.isArray(financial.value) ? financial.value : []);
      }
      if (menu.status === 'fulfilled') {
        setMenuSales(Array.isArray(menu.value) ? menu.value : []);
      }
      if (txStats.status === 'fulfilled') {
        setStats(txStats.value);
      }
    } catch (err) {
      console.error('Failed to load reports:', err);
      toast.error('Failed to load some report data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);

  const formatShortDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  // Payment method breakdown from financial data
  const totalSales = financialData.reduce((s, r) => s + parseFloat(String(r.total_sales || 0)), 0);
  const totalCredits = financialData.reduce((s, r) => s + parseFloat(String(r.total_credits || 0)), 0);
  const totalRefunds = financialData.reduce((s, r) => s + parseFloat(String(r.total_refunds || 0)), 0);
  const totalTxCount = financialData.reduce((s, r) => s + parseInt(String(r.transaction_count || 0), 10), 0);

  const revenueBreakdown = [
    { name: 'Sales', value: totalSales, color: '#22c55e' },
    { name: 'Credits', value: totalCredits, color: '#6366f1' },
    { name: 'Refunds', value: totalRefunds, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  // Category breakdown from menu sales
  const categoryMap = new Map<string, number>();
  menuSales.forEach((item) => {
    const cat = item.category || 'Other';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + parseFloat(String(item.total_revenue || 0)));
  });
  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Chart data for daily revenue
  const dailyChartData = financialData.map((row) => ({
    date: formatShortDate(row.date),
    sales: parseFloat(String(row.total_sales || 0)),
    credits: parseFloat(String(row.total_credits || 0)),
    transactions: parseInt(String(row.transaction_count || 0), 10),
  }));

  const exportCSV = () => {
    if (menuSales.length === 0) {
      toast.error('No data to export');
      return;
    }
    const headers = ['Item Name', 'Category', 'Times Sold', 'Total Qty', 'Total Revenue'];
    const rows = menuSales.map((item) =>
      [item.name, item.category, item.times_sold, item.total_quantity, item.total_revenue].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `menu-sales-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Reports & Analytics
          </h1>
          <p className="text-muted-foreground">
            Sales performance, trends, and menu analytics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
          <Button onClick={loadReports} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Calendar className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(totalSales)}</p>
              <p className="text-xs text-muted-foreground">Total Sales</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalTxCount}</p>
              <p className="text-xs text-muted-foreground">Transactions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{menuSales.length}</p>
              <p className="text-xs text-muted-foreground">Items Sold</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatCurrency(
                  stats?.avg_transaction
                    ? parseFloat(String(stats.avg_transaction))
                    : totalTxCount > 0
                    ? totalSales / totalTxCount
                    : 0
                )}
              </p>
              <p className="text-xs text-muted-foreground">Avg. Transaction</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue">Revenue Trends</TabsTrigger>
          <TabsTrigger value="items">Top Items</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
        </TabsList>

        {/* Revenue Trends Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Revenue</CardTitle>
              <CardDescription>
                Sales and credit deposits over the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : dailyChartData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <p>No data for the selected period</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === 'transactions' ? value : formatCurrency(value),
                        name.charAt(0).toUpperCase() + name.slice(1),
                      ]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Sales"
                    />
                    <Line
                      type="monotone"
                      dataKey="credits"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Credits"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Transaction Volume */}
          <Card>
            <CardHeader>
              <CardTitle>Transaction Volume</CardTitle>
              <CardDescription>Number of transactions per day</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyChartData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground">
                  <p>No data available</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
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
        </TabsContent>

        {/* Top Items Tab */}
        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Top Selling Items</CardTitle>
                <CardDescription>
                  Menu items ranked by revenue
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {menuSales.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>No sales data for the selected period</p>
                </div>
              ) : (
                <>
                  {/* Top 10 Bar Chart */}
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={menuSales.slice(0, 10).map((item) => ({
                        name:
                          item.name.length > 15
                            ? item.name.slice(0, 15) + '…'
                            : item.name,
                        revenue: parseFloat(String(item.total_revenue || 0)),
                        quantity: parseInt(String(item.total_quantity || 0), 10),
                      }))}
                      layout="vertical"
                      margin={{ left: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        className="text-xs"
                      />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Bar
                        dataKey="revenue"
                        fill="#22c55e"
                        radius={[0, 4, 4, 0]}
                        name="Revenue"
                      />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Full Table */}
                  <div className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Qty Sold</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {menuSales.map((item, idx) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-muted-foreground">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="font-medium">
                              {item.name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="capitalize">
                                {item.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {item.total_quantity}
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium text-emerald-600">
                              {formatCurrency(
                                parseFloat(String(item.total_revenue || 0))
                              )}
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
        </TabsContent>

        {/* Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Revenue Type Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5" />
                  Revenue Breakdown
                </CardTitle>
                <CardDescription>
                  Sales vs Credits vs Refunds
                </CardDescription>
              </CardHeader>
              <CardContent>
                {revenueBreakdown.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground">
                    <p>No data available</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={revenueBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          dataKey="value"
                          label={({ name, percent }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                        >
                          {revenueBreakdown.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex gap-4 mt-2">
                      {revenueBreakdown.map((entry) => (
                        <div key={entry.name} className="flex items-center gap-1.5 text-sm">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span>{entry.name}: {formatCurrency(entry.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5" />
                  Sales by Category
                </CardTitle>
                <CardDescription>
                  Revenue distribution across menu categories
                </CardDescription>
              </CardHeader>
              <CardContent>
                {categoryBreakdown.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground">
                    <p>No data available</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={categoryBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          dataKey="value"
                          label={({ name, percent }) =>
                            `${name} ${(percent * 100).toFixed(0)}%`
                          }
                        >
                          {categoryBreakdown.map((_, idx) => (
                            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-3 mt-2 justify-center">
                      {categoryBreakdown.map((entry, idx) => (
                        <div key={entry.name} className="flex items-center gap-1.5 text-sm">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                          />
                          <span className="capitalize">{entry.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}