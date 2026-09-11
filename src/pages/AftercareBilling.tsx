import { useState, useEffect, useCallback, useRef } from 'react';
import { request } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  DollarSign,
  Settings,
  FileText,
  Loader2,
  RefreshCw,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Printer,
  Download,
  Zap,
} from 'lucide-react';
import { format } from 'date-fns';

interface BillingSettings {
  id: string | null;
  rate_type: string;
  rate_amount: number;
  daily_cap: number | null;
  grace_period_minutes: number;
  billing_cycle: string;
  late_pickup_fee: number;
  late_pickup_after_minutes: number;
  auto_generate?: boolean;
  is_active: boolean;
}

interface Invoice {
  id: string;
  student_id: string;
  session_id: string;
  parent_id: string | null;
  amount: number;
  duration_minutes: number;
  rate_type: string;
  rate_amount: number;
  late_fee: number;
  total: number;
  status: string;
  invoice_date: string;
  paid_at: string | null;
  notes: string | null;
  student_name: string;
  student_code: string;
  grade: string;
  parent_name: string | null;
  created_at: string;
}

interface BillingSummary {
  total_invoices: number;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  overdue_amount: number;
  paid_count: number;
  pending_count: number;
  overdue_count: number;
  waived_count: number;
}

interface InvoicePdfData {
  invoice: Invoice & {
    check_in_time: string;
    check_out_time: string;
    parent_email: string | null;
  };
  school: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
}

export default function AftercareBilling() {
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Auto-generation state
  const [autoGenEnabled, setAutoGenEnabled] = useState(false);
  const [togglingAutoGen, setTogglingAutoGen] = useState(false);

  // PDF/Print state
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfData, setPdfData] = useState<InvoicePdfData | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Settings form state
  const [formRateType, setFormRateType] = useState('hourly');
  const [formRateAmount, setFormRateAmount] = useState('10.00');
  const [formDailyCap, setFormDailyCap] = useState('');
  const [formGracePeriod, setFormGracePeriod] = useState('15');
  const [formBillingCycle, setFormBillingCycle] = useState('weekly');
  const [formLateFee, setFormLateFee] = useState('0');
  const [formLateAfter, setFormLateAfter] = useState('360');

  // Generate form state
  const [genDateFrom, setGenDateFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [genDateTo, setGenDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const fetchSettings = useCallback(async () => {
    try {
      const data = await request<BillingSettings>('/aftercare-billing/settings');
      setSettings(data);
      setAutoGenEnabled(!!data.auto_generate);
    } catch (error) {
      console.error('Failed to fetch billing settings:', error);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    try {
      let url = '/aftercare-billing/invoices?limit=50';
      if (statusFilter) url += `&status=${statusFilter}`;
      if (dateFrom) url += `&date_from=${dateFrom}`;
      if (dateTo) url += `&date_to=${dateTo}`;

      const data = await request<{ invoices: Invoice[]; total: number }>(url);
      setInvoices(data.invoices);
      setInvoiceTotal(data.total);
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    }
  }, [statusFilter, dateFrom, dateTo]);

  const fetchSummary = useCallback(async () => {
    try {
      let url = '/aftercare-billing/summary';
      const params = [];
      if (dateFrom) params.push(`date_from=${dateFrom}`);
      if (dateTo) params.push(`date_to=${dateTo}`);
      if (params.length > 0) url += `?${params.join('&')}`;

      const data = await request<BillingSummary>(url);
      setSummary(data);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  }, [dateFrom, dateTo]);

  const fetchAutoGenStatus = useCallback(async () => {
    try {
      const data = await request<{ auto_generate: boolean }>('/aftercare-billing/auto-generate/status');
      setAutoGenEnabled(data.auto_generate);
    } catch (error) {
      console.error('Failed to fetch auto-gen status:', error);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchSettings(), fetchInvoices(), fetchSummary(), fetchAutoGenStatus()]);
  }, [fetchSettings, fetchInvoices, fetchSummary, fetchAutoGenStatus]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await refreshAll();
      setLoading(false);
    };
    loadData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      refreshAll();
    }, 30000);

    return () => clearInterval(interval);
  }, [refreshAll]);

  const openSettingsDialog = () => {
    if (settings) {
      setFormRateType(settings.rate_type);
      setFormRateAmount(String(settings.rate_amount));
      setFormDailyCap(settings.daily_cap ? String(settings.daily_cap) : '');
      setFormGracePeriod(String(settings.grace_period_minutes));
      setFormBillingCycle(settings.billing_cycle);
      setFormLateFee(String(settings.late_pickup_fee));
      setFormLateAfter(String(settings.late_pickup_after_minutes));
    }
    setSettingsDialogOpen(true);
  };

  const handleSaveSettings = async () => {
    setSubmitting(true);
    try {
      await request('/aftercare-billing/settings', {
        method: 'PUT',
        body: JSON.stringify({
          rate_type: formRateType,
          rate_amount: parseFloat(formRateAmount),
          daily_cap: formDailyCap ? parseFloat(formDailyCap) : null,
          grace_period_minutes: parseInt(formGracePeriod),
          billing_cycle: formBillingCycle,
          late_pickup_fee: parseFloat(formLateFee),
          late_pickup_after_minutes: parseInt(formLateAfter),
        }),
      });
      toast.success('Billing settings updated');
      setSettingsDialogOpen(false);
      await fetchSettings();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save settings';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateInvoices = async () => {
    setSubmitting(true);
    try {
      const data = await request<{ generated: number; message: string }>('/aftercare-billing/generate', {
        method: 'POST',
        body: JSON.stringify({ date_from: genDateFrom, date_to: genDateTo }),
      });
      toast.success(data.message);
      setGenerateDialogOpen(false);
      await Promise.all([fetchInvoices(), fetchSummary()]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to generate invoices';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateInvoiceStatus = async (invoiceId: string, newStatus: string) => {
    try {
      await request(`/aftercare-billing/invoices/${invoiceId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(`Invoice marked as ${newStatus}`);
      await Promise.all([fetchInvoices(), fetchSummary()]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to update invoice';
      toast.error(msg);
    }
  };

  const openPaymentDialog = (invoiceId?: string) => {
    setPaymentInvoiceId(invoiceId || null);
    setPaymentMethod('cash');
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentDialogOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!paymentInvoiceId) {
      toast.error('Please select an invoice');
      return;
    }
    if (!paymentMethod) {
      toast.error('Please select a payment method');
      return;
    }
    setSubmittingPayment(true);
    try {
      await request(`/aftercare-billing/invoices/${paymentInvoiceId}/payment`, {
        method: 'POST',
        body: JSON.stringify({
          payment_method: paymentMethod,
          payment_reference: paymentReference || null,
          notes: paymentNotes || null,
        }),
      });
      toast.success('Payment recorded successfully');
      setPaymentDialogOpen(false);
      await Promise.all([fetchInvoices(), fetchSummary()]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to record payment';
      toast.error(msg);
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleToggleAutoGenerate = async (enabled: boolean) => {
    setTogglingAutoGen(true);
    try {
      const data = await request<{ auto_generate: boolean; message: string }>('/aftercare-billing/auto-generate/toggle', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
      setAutoGenEnabled(data.auto_generate);
      toast.success(data.message);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to toggle auto-generation';
      toast.error(msg);
      // Revert UI state
      setAutoGenEnabled(!enabled);
    } finally {
      setTogglingAutoGen(false);
    }
  };

  const handleViewInvoicePdf = async (invoiceId: string) => {
    setLoadingPdf(true);
    setPdfDialogOpen(true);
    try {
      const data = await request<InvoicePdfData>(`/aftercare-billing/invoices/${invoiceId}/pdf`);
      setPdfData(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to load invoice';
      toast.error(msg);
      setPdfDialogOpen(false);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handlePrintInvoice = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      toast.error('Please allow popups to print invoices');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1a1a1a; }
          .invoice-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
          .school-info h1 { font-size: 24px; font-weight: 700; color: #111827; }
          .school-info p { font-size: 13px; color: #6b7280; margin-top: 4px; }
          .invoice-title { text-align: right; }
          .invoice-title h2 { font-size: 28px; font-weight: 700; color: #2563eb; text-transform: uppercase; }
          .invoice-title p { font-size: 13px; color: #6b7280; margin-top: 4px; }
          .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
          .detail-section h3 { font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; letter-spacing: 0.05em; }
          .detail-section p { font-size: 14px; margin: 4px 0; }
          .detail-section .value { font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th { background: #f9fafb; padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
          td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #f3f4f6; }
          .totals { text-align: right; margin-top: 16px; }
          .totals .row { display: flex; justify-content: flex-end; gap: 40px; padding: 6px 0; font-size: 14px; }
          .totals .row.total { font-size: 18px; font-weight: 700; border-top: 2px solid #e5e7eb; padding-top: 12px; margin-top: 8px; }
          .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: capitalize; }
          .status-paid { background: #d1fae5; color: #065f46; }
          .status-pending { background: #fef3c7; color: #92400e; }
          .status-overdue { background: #fee2e2; color: #991b1b; }
          .status-waived { background: #f3f4f6; color: #374151; }
          .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        ${printContent}
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleExportCsv = async () => {
    try {
      const token = localStorage.getItem('token');
      let url = '/api/aftercare-billing/invoices/export?';
      const params = [];
      if (statusFilter) params.push(`status=${statusFilter}`);
      if (dateFrom) params.push(`date_from=${dateFrom}`);
      if (dateTo) params.push(`date_to=${dateTo}`);
      url += params.join('&');

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `aftercare-invoices-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('Invoices exported successfully');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to export invoices';
      toast.error(msg);
    }
  };

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
      case 'overdue':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Overdue</Badge>;
      case 'waived':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Waived</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Aftercare Billing</h1>
          <p className="text-muted-foreground">Manage aftercare rates, generate and track invoices</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { refreshAll(); toast.success('Data refreshed'); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={openSettingsDialog}>
            <Settings className="h-4 w-4 mr-2" />
            Rate Settings
          </Button>
          <Button variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => openPaymentDialog()}>
            <DollarSign className="h-4 w-4 mr-2" />
            Add Payment
          </Button>
          <Button onClick={() => setGenerateDialogOpen(true)}>
            <Receipt className="h-4 w-4 mr-2" />
            Generate Invoices
          </Button>
        </div>
      </div>

      {/* Auto-Generation Card */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Zap className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold">Automatic Invoice Generation</p>
                <p className="text-sm text-muted-foreground">
                  When enabled, invoices are automatically generated daily at midnight for the previous day&apos;s completed aftercare sessions.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium ${autoGenEnabled ? 'text-green-600' : 'text-gray-500'}`}>
                {autoGenEnabled ? 'Enabled' : 'Disabled'}
              </span>
              <Switch
                checked={autoGenEnabled}
                onCheckedChange={handleToggleAutoGenerate}
                disabled={togglingAutoGen}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">${summary.total_amount.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">Total Billed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">${summary.paid_amount.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">Paid ({summary.paid_count})</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-100">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">${summary.pending_amount.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">Pending ({summary.pending_count})</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">${summary.overdue_amount.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">Overdue ({summary.overdue_count})</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Current Rate Display */}
      {settings && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Current Billing Setup
            </CardTitle>
            <CardDescription>
              {settings.rate_type === 'hourly'
                ? 'Charging per hour of aftercare attendance'
                : settings.rate_type === 'weekly'
                ? 'Flat weekly rate divided across 5 days'
                : 'Flat monthly rate divided across 22 days'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Pricing */}
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pricing</p>
                <p className="text-lg font-bold">
                  ${settings.rate_amount.toFixed(2)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {settings.rate_type === 'hourly' ? ' / hour' : settings.rate_type === 'weekly' ? ' / week' : ' / month'}
                  </span>
                </p>
                {settings.rate_type === 'hourly' && settings.daily_cap && (
                  <p className="text-xs text-muted-foreground">Max ${settings.daily_cap.toFixed(2)}/day</p>
                )}
                {settings.rate_type !== 'hourly' && (
                  <p className="text-xs text-muted-foreground">
                    = ${(settings.rate_type === 'weekly' ? settings.rate_amount / 5 : settings.rate_amount / 22).toFixed(2)} per session
                  </p>
                )}
              </div>
              {/* Grace & Timing */}
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Grace & Timing</p>
                <p className="text-lg font-bold">
                  {settings.grace_period_minutes} min
                  <span className="text-sm font-normal text-muted-foreground"> free</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Billing starts after {settings.grace_period_minutes} minutes
                </p>
              </div>
              {/* Late Fee */}
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Late Pickup</p>
                {settings.late_pickup_fee > 0 ? (
                  <>
                    <p className="text-lg font-bold text-orange-600">
                      +${settings.late_pickup_fee.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added if child stays over {formatDuration(settings.late_pickup_after_minutes)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-muted-foreground">None</p>
                    <p className="text-xs text-muted-foreground">No late pickup penalty</p>
                  </>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span>Invoice cycle: <span className="font-medium capitalize text-foreground">{settings.billing_cycle}</span></span>
              <span>•</span>
              <span>Auto-generate: <span className={`font-medium ${autoGenEnabled ? 'text-green-600' : 'text-foreground'}`}>{autoGenEnabled ? 'On' : 'Off'}</span></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices Tab */}
      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices">
            <FileText className="h-4 w-4 mr-2" />
            Invoices ({invoiceTotal})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle>Aftercare Invoices</CardTitle>
              <CardDescription>
                <div className="flex flex-wrap gap-3 mt-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="waived">Waived</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-auto"
                    placeholder="From"
                  />
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-auto"
                    placeholder="To"
                  />
                  {(statusFilter || dateFrom || dateTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setStatusFilter('');
                        setDateFrom('');
                        setDateTo('');
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No invoices found</p>
                  <p className="text-sm mt-1">Generate invoices from completed aftercare sessions</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Late Fee</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>{format(new Date(invoice.invoice_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell className="font-medium">{invoice.student_name}</TableCell>
                        <TableCell>{invoice.grade}</TableCell>
                        <TableCell>{formatDuration(invoice.duration_minutes)}</TableCell>
                        <TableCell className="text-sm">
                          ${invoice.rate_amount}/{invoice.rate_type === 'hourly' ? 'hr' : invoice.rate_type === 'weekly' ? 'week' : 'month'}
                        </TableCell>
                        <TableCell>${invoice.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          {invoice.late_fee > 0 ? (
                            <span className="text-red-600">${invoice.late_fee.toFixed(2)}</span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="font-semibold">${invoice.total.toFixed(2)}</TableCell>
                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="View / Print Invoice"
                              onClick={() => handleViewInvoicePdf(invoice.id)}
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {invoice.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                  onClick={() => openPaymentDialog(invoice.id)}
                                >
                                  <DollarSign className="h-3 w-3 mr-1" />
                                  Pay
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() => handleUpdateInvoiceStatus(invoice.id, 'waived')}
                                >
                                  Waive
                                </Button>
                              </>
                            )}
                            {invoice.status === 'overdue' && (
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                onClick={() => openPaymentDialog(invoice.id)}
                              >
                                <DollarSign className="h-3 w-3 mr-1" />
                                Pay
                              </Button>
                            )}
                            {invoice.status === 'paid' && (
                              <span className="text-xs text-muted-foreground">
                                {invoice.paid_at ? format(new Date(invoice.paid_at), 'MMM d') : ''}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aftercare Billing Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Section 1: How to Charge */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">1</div>
                <h4 className="font-semibold text-sm">How do you charge for aftercare?</h4>
              </div>
              <div className="ml-8 space-y-3">
                <div className="space-y-2">
                  <Label>Pricing Model</Label>
                  <Select value={formRateType} onValueChange={setFormRateType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Per Hour — charge based on time spent</SelectItem>
                      <SelectItem value="weekly">Flat Weekly — same charge each day (weekly ÷ 5)</SelectItem>
                      <SelectItem value="monthly">Flat Monthly — same charge each day (monthly ÷ 22)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    {formRateType === 'hourly' ? 'Rate Per Hour ($)' : formRateType === 'weekly' ? 'Weekly Rate ($)' : 'Monthly Rate ($)'}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formRateAmount}
                    onChange={(e) => setFormRateAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formRateType === 'hourly'
                      ? `Example: If a child stays 2 hours, bill = 2 × $${formRateAmount || '0'} = $${(2 * parseFloat(formRateAmount || '0')).toFixed(2)}`
                      : formRateType === 'weekly'
                      ? `Each day's bill = $${formRateAmount || '0'} ÷ 5 = $${(parseFloat(formRateAmount || '0') / 5).toFixed(2)} per session`
                      : `Each day's bill = $${formRateAmount || '0'} ÷ 22 = $${(parseFloat(formRateAmount || '0') / 22).toFixed(2)} per session`
                    }
                  </p>
                </div>
                {formRateType === 'hourly' && (
                  <div className="space-y-2">
                    <Label>Maximum Daily Charge ($) <span className="text-muted-foreground text-xs">— optional</span></Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formDailyCap}
                      onChange={(e) => setFormDailyCap(e.target.value)}
                      placeholder="No maximum"
                    />
                    <p className="text-xs text-muted-foreground">
                      {formDailyCap && parseFloat(formDailyCap) > 0
                        ? `Even if a child stays all day, they won't be charged more than $${parseFloat(formDailyCap).toFixed(2)}`
                        : 'Leave empty for no cap — charges accumulate with no limit'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: Grace Period */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">2</div>
                <h4 className="font-semibold text-sm">Free grace period before billing starts</h4>
              </div>
              <div className="ml-8 space-y-2">
                <Label>Grace Period (minutes)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formGracePeriod}
                  onChange={(e) => setFormGracePeriod(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The first {formGracePeriod || '0'} minutes are free. Billing only starts after this time.
                  {formRateType === 'hourly' && formGracePeriod && parseInt(formGracePeriod) > 0
                    ? ` Example: Child stays 60 min → billable time = ${Math.max(0, 60 - parseInt(formGracePeriod))} min`
                    : ''}
                </p>
              </div>
            </div>

            {/* Section 3: Late Pickup Penalty */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-700">3</div>
                <h4 className="font-semibold text-sm">Late pickup penalty <span className="font-normal text-muted-foreground">— optional</span></h4>
              </div>
              <div className="ml-8 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Late Fee ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formLateFee}
                      onChange={(e) => setFormLateFee(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Applies After (minutes)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formLateAfter}
                      onChange={(e) => setFormLateAfter(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {parseFloat(formLateFee || '0') > 0
                    ? `If a child stays longer than ${formLateAfter || '0'} minutes total, an extra $${parseFloat(formLateFee || '0').toFixed(2)} late fee is added to their bill.`
                    : 'Set a fee amount to enable late pickup penalties.'}
                </p>
              </div>
            </div>

            {/* Section 4: Invoice Schedule */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700">4</div>
                <h4 className="font-semibold text-sm">Invoice grouping cycle</h4>
              </div>
              <div className="ml-8 space-y-2">
                <Label>Billing Cycle</Label>
                <Select value={formBillingCycle} onValueChange={setFormBillingCycle}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily — one invoice per session</SelectItem>
                    <SelectItem value="weekly">Weekly — group into weekly invoices</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly — group every 2 weeks</SelectItem>
                    <SelectItem value="monthly">Monthly — group into monthly invoices</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  How often invoices are grouped and sent to parents.
                </p>
              </div>
            </div>

            {/* Live Preview */}
            <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview: How a 2-hour session would be billed</p>
              {(() => {
                const rate = parseFloat(formRateAmount || '0');
                const grace = parseInt(formGracePeriod || '0');
                const cap = parseFloat(formDailyCap || '0');
                const lateFee = parseFloat(formLateFee || '0');
                const lateAfter = parseInt(formLateAfter || '0');
                const totalMin = 120;
                const billableMin = Math.max(0, totalMin - grace);
                let amount = 0;
                if (formRateType === 'hourly') {
                  amount = (billableMin / 60) * rate;
                  if (cap > 0 && amount > cap) amount = cap;
                } else if (formRateType === 'weekly') {
                  amount = rate / 5;
                } else {
                  amount = rate / 22;
                }
                const late = lateFee > 0 && totalMin > lateAfter ? lateFee : 0;
                const total = amount + late;
                return (
                  <div className="text-sm space-y-0.5">
                    <p>Session: 2 hours (120 min) → Billable: {billableMin} min {grace > 0 ? `(after ${grace} min grace)` : ''}</p>
                    <p>Base charge: <span className="font-semibold">${amount.toFixed(2)}</span>
                      {formRateType === 'hourly' && cap > 0 && (billableMin / 60) * rate > cap ? ' (capped)' : ''}
                    </p>
                    {late > 0 && <p>Late fee: <span className="font-semibold text-orange-600">+${late.toFixed(2)}</span></p>}
                    <p className="font-bold border-t pt-1 mt-1">Total: ${total.toFixed(2)}</p>
                  </div>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Invoices Dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Invoices</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate invoices for all completed aftercare sessions that haven&apos;t been billed yet.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={genDateFrom}
                  onChange={(e) => setGenDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>To Date</Label>
                <Input
                  type="date"
                  value={genDateTo}
                  onChange={(e) => setGenDateTo(e.target.value)}
                />
              </div>
            </div>
            {settings && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-1">Current Rate:</p>
                <p>${settings.rate_amount.toFixed(2)} / {settings.rate_type === 'hourly' ? 'hour' : settings.rate_type === 'weekly' ? 'week (fixed)' : 'month (fixed)'}</p>
                {settings.daily_cap && <p>Daily cap: ${settings.daily_cap.toFixed(2)}</p>}
                {settings.late_pickup_fee > 0 && (
                  <p>Late fee: ${settings.late_pickup_fee.toFixed(2)} (after {formatDuration(settings.late_pickup_after_minutes)})</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateInvoices} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Receipt className="h-4 w-4 mr-2" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Record Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!paymentInvoiceId ? (
              <div className="space-y-2">
                <Label>Select Invoice</Label>
                <Select value={paymentInvoiceId || ''} onValueChange={setPaymentInvoiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a pending invoice..." />
                  </SelectTrigger>
                  <SelectContent>
                    {invoices
                      .filter((inv) => inv.status === 'pending' || inv.status === 'overdue')
                      .map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.student_name} — ${inv.total.toFixed(2)} ({format(new Date(inv.invoice_date), 'MMM d')})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {invoices.filter((inv) => inv.status === 'pending' || inv.status === 'overdue').length === 0 && (
                  <p className="text-sm text-muted-foreground">No pending or overdue invoices available.</p>
                )}
              </div>
            ) : (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium">
                  {invoices.find((inv) => inv.id === paymentInvoiceId)?.student_name || 'Selected Invoice'}
                </p>
                <p className="text-muted-foreground">
                  Amount: <span className="font-semibold text-foreground">${invoices.find((inv) => inv.id === paymentInvoiceId)?.total.toFixed(2)}</span>
                  {' · '}
                  {format(new Date(invoices.find((inv) => inv.id === paymentInvoiceId)?.invoice_date || new Date()), 'MMM d, yyyy')}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card (Swipe/Tap)</SelectItem>
                  <SelectItem value="eft">EFT / Bank Transfer</SelectItem>
                  <SelectItem value="debit_order">Debit Order</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reference Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. receipt number, EFT reference..."
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. paid by grandmother, partial payment..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handleRecordPayment}
              disabled={submittingPayment || !paymentInvoiceId}
            >
              {submittingPayment && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice PDF/Print Dialog */}
      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice Preview
            </DialogTitle>
          </DialogHeader>
          {loadingPdf ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : pdfData ? (
            <>
              <div ref={printRef} className="border rounded-lg p-6 bg-white">
                {/* Invoice Header */}
                <div className="invoice-header flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-200">
                  <div className="school-info">
                    <h1 className="text-xl font-bold text-gray-900">{pdfData.school.name}</h1>
                    {pdfData.school.address && <p className="text-sm text-gray-500">{pdfData.school.address}</p>}
                    {pdfData.school.phone && <p className="text-sm text-gray-500">{pdfData.school.phone}</p>}
                    {pdfData.school.email && <p className="text-sm text-gray-500">{pdfData.school.email}</p>}
                  </div>
                  <div className="invoice-title text-right">
                    <h2 className="text-2xl font-bold text-blue-600">INVOICE</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Date: {format(new Date(pdfData.invoice.invoice_date), 'MMMM d, yyyy')}
                    </p>
                    <p className="text-sm text-gray-500">
                      ID: {pdfData.invoice.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="details-grid grid grid-cols-2 gap-6 mb-6">
                  <div className="detail-section">
                    <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2 tracking-wide">Student Information</h3>
                    <p className="text-sm"><span className="font-semibold">Name:</span> {pdfData.invoice.student_name}</p>
                    <p className="text-sm"><span className="font-semibold">Code:</span> {pdfData.invoice.student_code}</p>
                    <p className="text-sm"><span className="font-semibold">Grade:</span> {pdfData.invoice.grade}</p>
                  </div>
                  <div className="detail-section">
                    <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2 tracking-wide">Billing To</h3>
                    <p className="text-sm"><span className="font-semibold">Parent:</span> {pdfData.invoice.parent_name || 'N/A'}</p>
                    {pdfData.invoice.parent_email && (
                      <p className="text-sm"><span className="font-semibold">Email:</span> {pdfData.invoice.parent_email}</p>
                    )}
                    <p className="text-sm">
                      <span className="font-semibold">Status:</span>{' '}
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                        pdfData.invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                        pdfData.invoice.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        pdfData.invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {pdfData.invoice.status}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Session Details Table */}
                <table className="w-full border-collapse mb-4">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-3 text-xs font-semibold uppercase text-gray-500 border-b-2 border-gray-200">Description</th>
                      <th className="text-left p-3 text-xs font-semibold uppercase text-gray-500 border-b-2 border-gray-200">Details</th>
                      <th className="text-right p-3 text-xs font-semibold uppercase text-gray-500 border-b-2 border-gray-200">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 text-sm border-b border-gray-100">Aftercare Session</td>
                      <td className="p-3 text-sm border-b border-gray-100">
                        {pdfData.invoice.check_in_time && pdfData.invoice.check_out_time ? (
                          <>
                            {format(new Date(pdfData.invoice.check_in_time), 'h:mm a')} – {format(new Date(pdfData.invoice.check_out_time), 'h:mm a')}
                            {' '}({formatDuration(pdfData.invoice.duration_minutes)})
                          </>
                        ) : (
                          formatDuration(pdfData.invoice.duration_minutes)
                        )}
                      </td>
                      <td className="p-3 text-sm text-right border-b border-gray-100">${pdfData.invoice.amount.toFixed(2)}</td>
                    </tr>
                    {pdfData.invoice.late_fee > 0 && (
                      <tr>
                        <td className="p-3 text-sm border-b border-gray-100">Late Pickup Fee</td>
                        <td className="p-3 text-sm border-b border-gray-100">
                          Duration exceeded {formatDuration(settings?.late_pickup_after_minutes || 360)}
                        </td>
                        <td className="p-3 text-sm text-right border-b border-gray-100 text-red-600">${pdfData.invoice.late_fee.toFixed(2)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="text-right mt-4">
                  <div className="inline-block text-sm">
                    <div className="flex justify-between gap-8 py-1">
                      <span className="text-gray-600">Subtotal:</span>
                      <span>${pdfData.invoice.amount.toFixed(2)}</span>
                    </div>
                    {pdfData.invoice.late_fee > 0 && (
                      <div className="flex justify-between gap-8 py-1">
                        <span className="text-gray-600">Late Fee:</span>
                        <span className="text-red-600">${pdfData.invoice.late_fee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-8 py-2 border-t-2 border-gray-200 mt-2 font-bold text-lg">
                      <span>Total:</span>
                      <span>${pdfData.invoice.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Rate Info */}
                <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500">
                  <p>Rate: ${pdfData.invoice.rate_amount.toFixed(2)} / {pdfData.invoice.rate_type === 'hourly' ? 'hour' : pdfData.invoice.rate_type === 'weekly' ? 'week (fixed)' : 'month (fixed)'}</p>
                  {pdfData.invoice.paid_at && (
                    <p>Paid on: {format(new Date(pdfData.invoice.paid_at), 'MMMM d, yyyy h:mm a')}</p>
                  )}
                </div>

                {/* Footer */}
                <div className="footer mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
                  <p>Thank you for using our aftercare services.</p>
                  <p className="mt-1">Generated on {format(new Date(), 'MMMM d, yyyy')}</p>
                </div>
              </div>

              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setPdfDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={handlePrintInvoice}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print / Save as PDF
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}