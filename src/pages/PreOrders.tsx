import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Clock,
  Plus,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Timer,
  ShoppingBag,
  User,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Download,
  Eye,
  CheckSquare,
  CalendarDays,
} from 'lucide-react';
import {
  studentApi,
  preOrderApi,
  settingsApi,
  type Student,
  type PreOrder,
} from '@/lib/api';
import { toast } from 'sonner';
import { format, isToday, isThisWeek, startOfDay, endOfDay } from 'date-fns';

type StatusType = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
type DateFilter = 'all' | 'today' | 'week' | 'custom';

export default function PreOrders() {
  const [preOrders, setPreOrders] = useState<PreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [orderDate, setOrderDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [mealType, setMealType] = useState('lunch');
  const [orderTotal, setOrderTotal] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('balance');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [creating, setCreating] = useState(false);

  // Negative balance cap
  const [negativeBalanceCap, setNegativeBalanceCap] = useState<number>(0);

  // Detail dialog
  const [detailOrder, setDetailOrder] = useState<PreOrder | null>(null);

  /* ── Load ───────────────────────────────────────────────────────────── */

  const loadPreOrders = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (dateFilter === 'today') {
        params.date = format(new Date(), 'yyyy-MM-dd');
      }
      const data = await preOrderApi.getAll(params);
      setPreOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load pre-orders:', err);
      toast.error('Failed to load pre-orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFilter]);

  useEffect(() => {
    loadPreOrders();
  }, [loadPreOrders]);

  // Load negative balance cap setting
  useEffect(() => {
    settingsApi.getByKey<number>('negative_balance_cap')
      .then((val) => setNegativeBalanceCap(typeof val === 'number' ? val : parseFloat(String(val)) || 0))
      .catch(() => setNegativeBalanceCap(0));
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        loadPreOrders();
      }, 30000);
    }
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [autoRefresh, loadPreOrders]);

  /* ── Filtering ─────────────────────────────────────────────────────── */

  const filtered = preOrders.filter((order) => {
    const matchesSearch =
      !searchQuery ||
      (order.student_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.order_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.meal_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.id || '').toLowerCase().includes(searchQuery.toLowerCase());

    let matchesDate = true;
    if (dateFilter === 'today') {
      matchesDate = order.order_date ? isToday(new Date(order.order_date)) : false;
    } else if (dateFilter === 'week') {
      matchesDate = order.order_date ? isThisWeek(new Date(order.order_date)) : false;
    } else if (dateFilter === 'custom' && (customDateFrom || customDateTo)) {
      const d = order.order_date ? new Date(order.order_date) : null;
      if (d) {
        if (customDateFrom && d < startOfDay(new Date(customDateFrom))) matchesDate = false;
        if (customDateTo && d > endOfDay(new Date(customDateTo))) matchesDate = false;
      } else {
        matchesDate = false;
      }
    }

    return matchesSearch && matchesDate;
  });

  /* ── Summary ───────────────────────────────────────────────────────── */

  const todayOrders = preOrders.filter((o) =>
    o.order_date ? isToday(new Date(o.order_date)) : false
  );
  const todayTotal = todayOrders.reduce(
    (sum, o) => sum + (o.total || 0),
    0
  );
  const pendingCount = preOrders.filter((o) => o.status === 'pending').length;
  const completedCount = preOrders.filter((o) => o.status === 'completed').length;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  /* ── Status helpers ────────────────────────────────────────────────── */

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
      pending: { bg: 'bg-amber-100', text: 'text-amber-700', icon: <Clock className="h-3 w-3 mr-1" />, label: 'Pending' },
      confirmed: { bg: 'bg-sky-100', text: 'text-sky-700', icon: <CheckCircle2 className="h-3 w-3 mr-1" />, label: 'Confirmed' },
      preparing: { bg: 'bg-blue-100', text: 'text-blue-700', icon: <Timer className="h-3 w-3 mr-1" />, label: 'Preparing' },
      ready: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: <CheckCircle2 className="h-3 w-3 mr-1" />, label: 'Ready' },
      completed: { bg: 'bg-gray-100', text: 'text-gray-700', icon: <CheckCircle2 className="h-3 w-3 mr-1" />, label: 'Completed' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-700', icon: <XCircle className="h-3 w-3 mr-1" />, label: 'Cancelled' },
    };
    const s = map[status] || { bg: 'bg-gray-100', text: 'text-gray-700', icon: null, label: status };
    return (
      <Badge className={`${s.bg} ${s.text} hover:${s.bg}`}>
        {s.icon}
        {s.label}
      </Badge>
    );
  };

  const getNextStatus = (status: string): StatusType | null => {
    const flow: Record<string, StatusType> = {
      pending: 'confirmed',
      confirmed: 'preparing',
      preparing: 'ready',
      ready: 'completed',
    };
    return flow[status] || null;
  };

  const getNextLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Confirm',
      confirmed: 'Start Prep',
      preparing: 'Ready',
      ready: 'Complete',
    };
    return labels[status] || '';
  };

  const getMealTypeBadge = (mealType?: string) => {
    if (!mealType) return null;
    const colors: Record<string, string> = {
      breakfast: 'bg-orange-100 text-orange-700',
      lunch: 'bg-green-100 text-green-700',
      dinner: 'bg-indigo-100 text-indigo-700',
      snack: 'bg-pink-100 text-pink-700',
    };
    const cls = colors[mealType] || 'bg-gray-100 text-gray-700';
    return <Badge className={`${cls} capitalize text-xs`}>{mealType}</Badge>;
  };

  /* ── Actions ───────────────────────────────────────────────────────── */

  const updateOrderStatus = async (orderId: string, newStatus: StatusType) => {
    try {
      await preOrderApi.updateStatus(orderId, newStatus);
      toast.success(`Order updated to ${newStatus}`);
      await loadPreOrders();
    } catch (err) {
      console.error('Status update failed:', err);
      toast.error('Failed to update order status');
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      await preOrderApi.cancel(orderId);
      toast.success('Order cancelled');
      await loadPreOrders();
    } catch (err) {
      console.error('Cancel failed:', err);
      toast.error('Failed to cancel order');
    }
  };

  const handleBulkStatus = async (newStatus: StatusType) => {
    if (selectedIds.size === 0) return;
    let updated = 0;
    for (const id of selectedIds) {
      try {
        await preOrderApi.updateStatus(id, newStatus);
        updated++;
      } catch { /* skip */ }
    }
    toast.success(`${updated} order(s) updated to ${newStatus}`);
    setSelectedIds(new Set());
    loadPreOrders();
  };

  const allPageSelected =
    filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((o) => o.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  /* ── Create dialog ─────────────────────────────────────────────────── */

  const searchStudents = useCallback(async () => {
    if (!studentQuery.trim()) return;
    try {
      const results = await studentApi.search(studentQuery.trim());
      setStudentResults(Array.isArray(results) ? results : []);
    } catch {
      toast.error('Student search failed');
    }
  }, [studentQuery]);

  const createPreOrder = async () => {
    if (!selectedStudent) { toast.error('Please select a student'); return; }
    if (!orderDate) { toast.error('Please set an order date'); return; }

    setCreating(true);
    try {
      const totalVal = parseFloat(orderTotal) || 0;
      await preOrderApi.create({
        student_id: selectedStudent.id,
        order_date: orderDate,
        meal_type: mealType,
        subtotal: totalVal,
        tax: 0,
        total: totalVal,
        payment_method: paymentMethod,
        special_instructions: specialInstructions || undefined,
      });
      toast.success('Pre-order created!');
      setCreateOpen(false);
      setSelectedStudent(null);
      setStudentQuery('');
      setStudentResults([]);
      setOrderDate(format(new Date(), 'yyyy-MM-dd'));
      setMealType('lunch');
      setOrderTotal('');
      setPaymentMethod('balance');
      setSpecialInstructions('');
      loadPreOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create pre-order');
    } finally {
      setCreating(false);
    }
  };

  /* ── Export ─────────────────────────────────────────────────────────── */

  const exportOrders = () => {
    const rows = [
      ['Order #', 'Student', 'Date', 'Meal Type', 'Total', 'Payment', 'Status'],
      ...filtered.map((o) => [
        o.order_number || o.id,
        o.student_name || '',
        o.order_date || '',
        o.meal_type || '',
        String(o.total || 0),
        o.payment_method || '',
        o.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preorders-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Orders exported');
  };

  /* ── Format helpers ────────────────────────────────────────────────── */

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try { return format(new Date(dateStr), 'MMM d, yyyy'); } catch { return dateStr; }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '—';
    try { return format(new Date(dateStr), 'MMM d, h:mm a'); } catch { return dateStr; }
  };

  /* ── Render ────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pre-Orders</h1>
          <p className="text-muted-foreground">
            Manage advance meal orders and scheduling
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'border-primary text-primary' : ''}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto ON' : 'Auto-refresh'}
          </Button>
          <Button variant="outline" size="sm" onClick={exportOrders} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Pre-Order
          </Button>
        </div>
      </div>

      {/* Summary Dashboard */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{todayOrders.length}</p>
              <p className="text-xs text-muted-foreground">Today&apos;s Orders</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(todayTotal)}</p>
              <p className="text-xs text-muted-foreground">Today&apos;s Revenue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{completedCount}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by student, order #, or meal type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="preparing">Preparing</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                <SelectTrigger className="w-full sm:w-40">
                  <CalendarDays className="h-4 w-4 mr-1" />
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateFilter === 'custom' && (
              <div className="flex gap-3 items-center">
                <Label className="text-sm shrink-0">From</Label>
                <Input type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)} className="w-auto" />
                <Label className="text-sm shrink-0">To</Label>
                <Input type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)} className="w-auto" />
              </div>
            )}

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{selectedIds.size} selected</span>
                <div className="flex gap-2 ml-auto flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => handleBulkStatus('confirmed')}>Confirm</Button>
                  <Button variant="outline" size="sm" onClick={() => handleBulkStatus('preparing')}>Start Prep</Button>
                  <Button variant="outline" size="sm" onClick={() => handleBulkStatus('ready')}>Mark Ready</Button>
                  <Button variant="outline" size="sm" onClick={() => handleBulkStatus('completed')}>Complete</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading orders…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No pre-orders found</p>
              <p className="text-xs mt-1">Create a new pre-order to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allPageSelected} onCheckedChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Meal</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((order) => {
                  const next = getNextStatus(order.status);
                  return (
                    <TableRow key={order.id} className={selectedIds.has(order.id) ? 'bg-muted/30' : undefined}>
                      <TableCell>
                        <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{order.order_number || order.id.slice(0, 8)}</TableCell>
                      <TableCell className="font-medium">{order.student_name || '—'}</TableCell>
                      <TableCell className="text-sm">{formatDate(order.order_date)}</TableCell>
                      <TableCell>{getMealTypeBadge(order.meal_type)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {order.total != null ? formatCurrency(order.total) : '—'}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{order.payment_method || '—'}</TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailOrder(order)} title="View details">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {next && (
                            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => updateOrderStatus(order.id, next)}>
                              {getNextLabel(order.status)}
                            </Button>
                          )}
                          {order.status === 'pending' && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs text-red-500 hover:text-red-600" onClick={() => cancelOrder(order.id)}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Dialog */}
      <Dialog open={!!detailOrder} onOpenChange={(open) => { if (!open) setDetailOrder(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              Order Details
            </DialogTitle>
            <DialogDescription>
              {detailOrder?.order_number || `ID: ${detailOrder?.id?.slice(0, 8)}`}
            </DialogDescription>
          </DialogHeader>
          {detailOrder && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                {getStatusBadge(detailOrder.status)}
                <span className="text-sm text-muted-foreground">
                  Created: {formatDateTime(detailOrder.created_at)}
                </span>
              </div>

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Student
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <p className="font-medium">{detailOrder.student_name || '—'}</p>
                  <p className="text-sm text-muted-foreground">
                    ID: {detailOrder.student_number || detailOrder.student_id?.slice(0, 8)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-sm">Order Info</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Order Date</span>
                    <span>{formatDate(detailOrder.order_date)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Meal Type</span>
                    <span className="capitalize">{detailOrder.meal_type || '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Payment</span>
                    <span className="capitalize">{detailOrder.payment_method || '—'}</span>
                  </div>
                  {detailOrder.subtotal != null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-mono">{formatCurrency(detailOrder.subtotal)}</span>
                    </div>
                  )}
                  {detailOrder.tax != null && detailOrder.tax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="font-mono">{formatCurrency(detailOrder.tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold border-t pt-2">
                    <span>Total</span>
                    <span className="font-mono">{detailOrder.total != null ? formatCurrency(detailOrder.total) : '—'}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Timeline */}
              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-sm">Timeline</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      <span>Ordered: {formatDateTime(detailOrder.ordered_at || detailOrder.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-gray-300" />
                      <span className="text-muted-foreground">
                        Scheduled for: {formatDate(detailOrder.order_date)}
                      </span>
                    </div>
                    {detailOrder.confirmed_at && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-sky-500" />
                        <span>Confirmed: {formatDateTime(detailOrder.confirmed_at)}</span>
                      </div>
                    )}
                    {detailOrder.cancelled_at && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        <span>Cancelled: {formatDateTime(detailOrder.cancelled_at)}</span>
                      </div>
                    )}
                    {detailOrder.updated_at && detailOrder.updated_at !== detailOrder.created_at && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-gray-400" />
                        <span className="text-muted-foreground">
                          Last updated: {formatDateTime(detailOrder.updated_at)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {detailOrder.special_instructions && (
                <Card>
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-sm">Special Instructions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-sm text-muted-foreground">{detailOrder.special_instructions}</p>
                  </CardContent>
                </Card>
              )}

              {detailOrder.cancellation_reason && (
                <Card>
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-sm text-red-600">Cancellation Reason</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-sm text-muted-foreground">{detailOrder.cancellation_reason}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOrder(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Pre-Order Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Pre-Order</DialogTitle>
            <DialogDescription>Schedule an advance meal order for a student</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Student Search */}
            <div className="space-y-2">
              <Label>Student *</Label>
              {selectedStudent ? (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                  <User className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium text-sm">{selectedStudent.full_name}</span>
                  <span className="text-xs text-muted-foreground">({selectedStudent.student_id})</span>
                  <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => { setSelectedStudent(null); setStudentResults([]); }}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Search student by name or ID..."
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchStudents()}
                  />
                  <Button variant="secondary" size="sm" onClick={searchStudents}>Search</Button>
                </div>
              )}
              {studentResults.length > 0 && !selectedStudent && (
                <div className="border rounded-lg divide-y max-h-32 overflow-auto">
                  {studentResults.slice(0, 5).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedStudent(s); setStudentResults([]); }}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                    >
                      {s.full_name} ({s.student_id})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date and Meal Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Order Date *</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Meal Type</Label>
                <Select value={mealType} onValueChange={setMealType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakfast">Breakfast</SelectItem>
                    <SelectItem value="lunch">Lunch</SelectItem>
                    <SelectItem value="dinner">Dinner</SelectItem>
                    <SelectItem value="snack">Snack</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Total and Payment */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={orderTotal}
                  onChange={(e) => setOrderTotal(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="balance">Account Balance</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Balance Warning */}
            {paymentMethod === 'balance' && selectedStudent && (() => {
              const totalVal = parseFloat(orderTotal) || 0;
              const balance = selectedStudent.balance ?? 0;
              const resultingBalance = balance - totalVal;
              const wouldGoNegative = resultingBalance < 0;
              const exceedsCap = resultingBalance < -negativeBalanceCap;

              if (totalVal > 0 && wouldGoNegative && !exceedsCap && negativeBalanceCap > 0) {
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                    <div className="flex items-center gap-2 font-semibold mb-1">
                      <DollarSign className="h-4 w-4" />
                      Insufficient Balance — Negative Charge
                    </div>
                    <p>
                      Student balance: <strong>${balance.toFixed(2)}</strong> | Order total: <strong>${totalVal.toFixed(2)}</strong>
                    </p>
                    <p>
                      Account will be charged <strong>${Math.abs(resultingBalance).toFixed(2)}</strong> into negative
                      (resulting balance: <strong>${resultingBalance.toFixed(2)}</strong>).
                    </p>
                    <p className="text-xs mt-1 text-amber-600">
                      Negative balance cap: -${negativeBalanceCap.toFixed(2)}
                    </p>
                  </div>
                );
              }

              if (totalVal > 0 && exceedsCap) {
                return (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    <div className="flex items-center gap-2 font-semibold mb-1">
                      <XCircle className="h-4 w-4" />
                      Exceeds Negative Balance Limit
                    </div>
                    <p>
                      Student balance: <strong>${balance.toFixed(2)}</strong> | Order total: <strong>${totalVal.toFixed(2)}</strong>
                    </p>
                    <p>
                      Resulting balance would be <strong>${resultingBalance.toFixed(2)}</strong>,
                      which exceeds the negative balance limit of <strong>-${negativeBalanceCap.toFixed(2)}</strong>.
                    </p>
                    <p className="text-xs mt-1">This order cannot be placed with account balance.</p>
                  </div>
                );
              }

              if (totalVal > 0 && balance < totalVal && negativeBalanceCap === 0) {
                return (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    <div className="flex items-center gap-2 font-semibold mb-1">
                      <XCircle className="h-4 w-4" />
                      Insufficient Balance
                    </div>
                    <p>
                      Student balance: <strong>${balance.toFixed(2)}</strong> | Order total: <strong>${totalVal.toFixed(2)}</strong>
                    </p>
                    <p className="text-xs mt-1">
                      Negative balances are not allowed. Ask an admin to increase the negative balance cap in System Settings.
                    </p>
                  </div>
                );
              }

              if (totalVal > 0 && balance >= totalVal) {
                return (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Student balance: <strong>${balance.toFixed(2)}</strong> — Sufficient funds</span>
                    </div>
                  </div>
                );
              }

              return null;
            })()}

            <div className="space-y-2">
              <Label>Special Instructions (optional)</Label>
              <Textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} placeholder="Any dietary needs or special requests..." rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={createPreOrder} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Pre-Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}