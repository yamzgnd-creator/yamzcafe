import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
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
  Search,
  Loader2,
  Receipt,
  DollarSign,
  TrendingUp,
  FileText,
  RefreshCw,
  Printer,
  Download,
} from 'lucide-react';
import {
  transactionApi,
  type Transaction,
  type TransactionItem,
} from '@/lib/api';
import { toast } from 'sonner';

import { format } from 'date-fns';

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  // Detail dialog
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (dateFilter) params.date = dateFilter;
      const data = await transactionApi.getAll(
        Object.keys(params).length > 0 ? params : undefined
      );
      setTransactions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      toast.error('Failed to load transactions');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'h:mm a');
    } catch {
      return '';
    }
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return dateStr;
    }
  };

  // Filter transactions
  const filtered = transactions.filter((tx) => {
    const matchesSearch =
      !searchQuery ||
      tx.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.id?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || tx.status === statusFilter;
    const matchesMethod =
      methodFilter === 'all' || tx.payment_method === methodFilter;
    return matchesSearch && matchesStatus && matchesMethod;
  });

  // Summary stats
  const totalAmount = filtered.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const paidAmount = filtered
    .filter((tx) => tx.payment_method === 'cash' || tx.payment_method === 'card')
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const creditAmount = filtered
    .filter((tx) => tx.payment_method === 'account')
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const completedCount = filtered.filter(
    (t) => t.status === 'completed'
  ).length;
  const avgTransaction =
    filtered.length > 0 ? totalAmount / filtered.length : 0;

  const printTransactionReceipt = (tx: Transaction) => {
    const receiptWindow = window.open('', '_blank', 'width=320,height=600');
    if (!receiptWindow) return;

    const itemsHtml = tx.items
      ? tx.items
          .map(
            (item) =>
              `<tr>
                <td style="padding:2px 0">${item.item_name}</td>
                <td style="text-align:center;padding:2px 4px">${item.quantity}</td>
                <td style="text-align:right;padding:2px 0">$${((item.unit_price || item.price) * item.quantity).toFixed(2)}</td>
              </tr>`
          )
          .join('')
      : '<tr><td colspan="3" style="text-align:center;padding:8px">No items</td></tr>';

    receiptWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head><title>Receipt</title></head>
      <body style="font-family:monospace;width:280px;margin:0 auto;padding:16px;font-size:12px">
        <div style="text-align:center;margin-bottom:12px">
          <h2 style="margin:0;font-size:16px">YAMZ Cafe</h2>
          <p style="margin:4px 0;font-size:10px">Transaction Receipt</p>
          <hr style="border:1px dashed #999">
        </div>
        <div style="margin-bottom:8px">
          <p style="margin:2px 0">Date: ${formatDateTime(tx.created_at)}</p>
          <p style="margin:2px 0">Receipt: ${tx.receipt_number || tx.id.slice(0, 12)}</p>
          <p style="margin:2px 0">Student: ${tx.student_name || 'Guest'}</p>
          <p style="margin:2px 0">Payment: ${tx.payment_method}</p>
          <p style="margin:2px 0">Status: ${tx.status}</p>
        </div>
        <hr style="border:1px dashed #999">
        <table style="width:100%;border-collapse:collapse;margin:8px 0">
          <tr style="border-bottom:1px solid #ccc">
            <th style="text-align:left;padding:4px 0">Item</th>
            <th style="text-align:center;padding:4px">Qty</th>
            <th style="text-align:right;padding:4px 0">Price</th>
          </tr>
          ${itemsHtml}
        </table>
        <hr style="border:1px dashed #999">
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin:8px 0">
          <span>TOTAL:</span><span>$${tx.amount.toFixed(2)}</span>
        </div>
        <hr style="border:1px dashed #999">
        <div style="text-align:center;margin-top:12px;font-size:10px">
          <p>Thank you!</p>
        </div>
        <script>window.onload=function(){window.print();}</script>
      </body>
      </html>
    `);
    receiptWindow.document.close();
  };

  const exportTransactionsCSV = () => {
    if (filtered.length === 0) {
      toast.error('No transactions to export');
      return;
    }
    const headers = ['Date', 'Student', 'Type', 'Payment Method', 'Amount', 'Status'];
    const rows = filtered.map((tx) =>
      [
        formatDateTime(tx.created_at),
        tx.student_name || 'Guest',
        tx.type,
        tx.payment_method,
        tx.amount.toFixed(2),
        tx.status,
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Transactions exported');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            Completed
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
            Pending
          </Badge>
        );
      case 'refunded':
        return (
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
            Refunded
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'account':
        return '💳';
      case 'cash':
        return '💵';
      case 'card':
        return '💳';
      default:
        return '📋';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Transaction History
          </h1>
          <p className="text-muted-foreground">
            View and search all cafeteria transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportTransactionsCSV}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button
            variant="outline"
            onClick={loadTransactions}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{filtered.length}</p>
              <p className="text-xs text-muted-foreground">
                Total Transactions
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(paidAmount)}</p>
              <p className="text-xs text-muted-foreground">Cash & Card Revenue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(creditAmount)}</p>
              <p className="text-xs text-muted-foreground">Credit (Account) Transactions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatCurrency(avgTransaction)}
              </p>
              <p className="text-xs text-muted-foreground">Avg. Transaction</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by student name or transaction ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="account">Account</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full sm:w-44"
            />
          </div>
        </CardContent>
      </Card>

      {/* Transaction Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No transactions found</p>
              {(searchQuery || statusFilter !== 'all' || methodFilter !== 'all') && (
                <p className="text-xs mt-1">
                  Try adjusting your search filters
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tx) => {
                  const items: TransactionItem[] = Array.isArray(tx.items) ? tx.items : [];
                  const itemSummary = items.length > 0
                    ? items.map((i) => `${i.item_name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')
                    : tx.type === 'credit' ? 'Account Deposit' : '—';

                  return (
                    <TableRow
                      key={tx.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedTx(tx)}
                    >
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">
                            {formatDate(tx.created_at)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(tx.created_at)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {tx.student_name || 'Guest'}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[220px]">
                          <p className="text-sm truncate" title={itemSummary}>
                            {itemSummary}
                          </p>
                          {items.length > 2 && (
                            <p className="text-xs text-muted-foreground">
                              {items.length} items total
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="capitalize">
                          {getMethodIcon(tx.payment_method)}{' '}
                          {tx.payment_method}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(tx.amount)}
                      </TableCell>
                      <TableCell>{getStatusBadge(tx.status)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Transaction Detail Dialog */}
      <Dialog
        open={!!selectedTx}
        onOpenChange={(open) => !open && setSelectedTx(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>
          {selectedTx && (
            <div className="space-y-4">
              {/* Header info */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Transaction ID
                  </p>
                  <p className="font-mono text-sm font-medium">
                    {selectedTx.id.slice(0, 12)}...
                  </p>
                </div>
                {getStatusBadge(selectedTx.status)}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Student</p>
                  <p className="font-medium">
                    {selectedTx.student_name || 'Guest'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date & Time</p>
                  <p className="font-medium">
                    {formatDateTime(selectedTx.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Method</p>
                  <p className="font-medium capitalize">
                    {getMethodIcon(selectedTx.payment_method)}{' '}
                    {selectedTx.payment_method}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium capitalize">{selectedTx.type}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-sm font-medium mb-2">Items Ordered</p>
                {selectedTx.items && selectedTx.items.length > 0 ? (
                  <div className="border rounded-lg divide-y">
                    {selectedTx.items.map((item: TransactionItem, idx: number) => (
                      <div
                        key={item.id || idx}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{item.item_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(item.unit_price || item.price)} ×{' '}
                            {item.quantity}
                          </p>
                        </div>
                        <p className="font-mono font-medium">
                          {formatCurrency(
                            (item.unit_price || item.price) * item.quantity
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border rounded-lg px-3 py-4 text-center text-sm text-muted-foreground">
                    {selectedTx.type === 'credit' || selectedTx.type === 'deposit'
                      ? 'Account deposit — no items'
                      : selectedTx.type === 'refund'
                        ? 'Refund transaction'
                        : 'No items recorded'}
                  </div>
                )}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between border-t pt-3">
                <span className="font-bold text-lg">Total</span>
                <span className="font-bold text-lg text-primary font-mono">
                  {formatCurrency(selectedTx.amount)}
                </span>
              </div>

              {selectedTx.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{selectedTx.notes}</p>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedTx(null)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => printTransactionReceipt(selectedTx)}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print Receipt
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}