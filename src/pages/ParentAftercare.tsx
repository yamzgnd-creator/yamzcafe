import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { request } from '@/lib/api';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { toast } from 'sonner';
import {
  UserCheck,
  UserMinus,
  Clock,
  Loader2,
  RefreshCw,
  Baby,
  GraduationCap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Receipt,
  DollarSign,
} from 'lucide-react';
import { format } from 'date-fns';

interface ChildProfile {
  id: string;
  full_name: string;
  student_id: string;
  grade: string;
}

interface AftercareSession {
  id: string;
  student_id: string;
  student_name: string;
  check_in_time: string;
  check_out_time: string | null;
  checked_in_by_role: string;
  checked_out_by_role: string | null;
  checked_in_by_name: string;
  checked_out_by_name: string | null;
  status: string;
  notes: string | null;
  invoice_id: string | null;
  invoice_total: number | null;
  invoice_status: string | null;
  invoice_paid_at: string | null;
}

interface Enrollment {
  id: string;
  student_id: string;
  student_name: string;
  grade: string;
  programmes: string;
  package_type: string;
  academic_year: string;
  status: string;
  created_at: string;
}

interface BillingSettings {
  rate_type: 'hourly' | 'weekly' | 'monthly';
  rate_amount: number;
  daily_cap: number | null;
  grace_period_minutes: number;
  late_pickup_fee: number;
  late_pickup_after_minutes: number;
}

interface Invoice {
  id: string;
  student_id: string;
  session_id: string;
  student_name: string;
  student_code: string;
  grade: string;
  amount: number;
  duration_minutes: number;
  rate_type: string;
  rate_amount: number;
  late_fee: number;
  total: number;
  status: string;
  invoice_date: string;
  created_at: string;
  paid_at: string | null;
}

interface Programme {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
}

interface AftercarePackage {
  id: string;
  name: string;
  description: string;
  price: number;
  billing_cycle: string;
  hours: string;
  sort_order: number;
}

export default function ParentAftercare() {
  const { user } = useAuth();
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [sessions, setSessions] = useState<AftercareSession[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [packages, setPackages] = useState<AftercarePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'checkin' | 'checkout'>('checkin');
  const [selectedChild, setSelectedChild] = useState<ChildProfile | null>(null);
  const [selectedSession, setSelectedSession] = useState<AftercareSession | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('aftercare');

  // Billing state
  const [billingSettings, setBillingSettings] = useState<BillingSettings | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Sync state
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Enrollment form state
  const [enrollChildId, setEnrollChildId] = useState('');
  const [selectedProgrammes, setSelectedProgrammes] = useState<string[]>([]);
  const [selectedPackage, setSelectedPackage] = useState('');
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [aftercareData, programmesData, packagesData, settingsData] = await Promise.all([
        request<{ children: ChildProfile[]; sessions: AftercareSession[]; enrollments: Enrollment[] }>('/aftercare/parent'),
        request<Programme[]>('/aftercare-enrollment/programmes'),
        request<AftercarePackage[]>('/aftercare-enrollment/packages'),
        request<BillingSettings>('/aftercare-billing/settings'),
      ]);
      setChildren(aftercareData.children);
      setSessions(aftercareData.sessions);
      setEnrollments(aftercareData.enrollments || []);
      setProgrammes(programmesData);
      setPackages(packagesData);
      setBillingSettings(settingsData);
      setLastSynced(new Date());
    } catch (error) {
      console.error('Failed to fetch aftercare data:', error);
      toast.error('Failed to load aftercare information');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const data = await request<{ invoices: Invoice[]; total: number }>('/aftercare-billing/invoices');
      setInvoices(data.invoices || []);
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchInvoices();

    // Auto-refresh every 30 seconds to keep data synchronized with the system
    const interval = setInterval(() => {
      fetchData();
      fetchInvoices();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchData, fetchInvoices]);

  // Calculate estimated cost for a completed session based on billing settings
  const calculateSessionCost = (session: AftercareSession): string | null => {
    if (!billingSettings || !session.check_out_time) return null;
    const checkIn = new Date(session.check_in_time);
    const checkOut = new Date(session.check_out_time);
    const durationMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
    const billableMinutes = Math.max(0, durationMinutes - billingSettings.grace_period_minutes);

    let amount = 0;
    let lateFee = 0;

    if (billingSettings.rate_type === 'hourly') {
      const hours = billableMinutes / 60;
      amount = Math.round(hours * billingSettings.rate_amount * 100) / 100;
      if (billingSettings.daily_cap && amount > billingSettings.daily_cap) {
        amount = billingSettings.daily_cap;
      }
    } else if (billingSettings.rate_type === 'weekly') {
      // Weekly rate divided by 5 weekdays for per-session cost
      amount = Math.round((billingSettings.rate_amount / 5) * 100) / 100;
    } else if (billingSettings.rate_type === 'monthly') {
      // Monthly rate divided by ~22 weekdays for per-session cost
      amount = Math.round((billingSettings.rate_amount / 22) * 100) / 100;
    }

    if (billingSettings.late_pickup_fee > 0 && durationMinutes > billingSettings.late_pickup_after_minutes) {
      lateFee = billingSettings.late_pickup_fee;
    }

    const total = Math.round((amount + lateFee) * 100) / 100;
    return total.toFixed(2);
  };

  const getChildStatus = (childId: string) => {
    return sessions.find(s => s.student_id === childId && s.status === 'checked_in');
  };

  const isChildEnrolled = (childId: string) => {
    return enrollments.some(e => e.student_id === childId && e.status === 'active');
  };



  const handleCheckIn = async () => {
    if (!selectedChild) return;
    setSubmitting(true);
    try {
      await request('/aftercare/checkin', {
        method: 'POST',
        body: JSON.stringify({ student_id: selectedChild.id, notes: notes || undefined }),
      });
      toast.success(`${selectedChild.full_name} checked in to aftercare`);
      setActionDialogOpen(false);
      setNotes('');
      await fetchData();
      fetchInvoices();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Check-in failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async () => {
    if (!selectedSession) return;
    setSubmitting(true);
    try {
      await request(`/aftercare/checkout/${selectedSession.id}`, {
        method: 'POST',
        body: JSON.stringify({ notes: notes || undefined }),
      });
      toast.success(`${selectedSession.student_name} picked up from aftercare`);
      setActionDialogOpen(false);
      setNotes('');
      await fetchData();
      fetchInvoices();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Check-out failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const openCheckIn = (child: ChildProfile) => {
    setSelectedChild(child);
    setSelectedSession(null);
    setActionType('checkin');
    setNotes('');
    setActionDialogOpen(true);
  };

  const openCheckOut = (child: ChildProfile, session: AftercareSession) => {
    setSelectedChild(child);
    setSelectedSession(session);
    setActionType('checkout');
    setNotes('');
    setActionDialogOpen(true);
  };

  const handleEnrollSubmit = async () => {
    if (!enrollChildId) {
      toast.error('Please select a child');
      return;
    }
    if (!selectedPackage) {
      toast.error('Please select an aftercare package');
      return;
    }
    if (!disclaimerAccepted) {
      toast.error('Please accept the disclaimer to proceed');
      return;
    }

    setEnrollSubmitting(true);
    try {
      await request('/aftercare-enrollment/enroll', {
        method: 'POST',
        body: JSON.stringify({
          student_id: enrollChildId,
          programmes: selectedProgrammes,
          package_type: selectedPackage,
          academic_year: '2025-2026',
        }),
      });
      toast.success('Enrollment submitted successfully!');
      // Reset form
      setEnrollChildId('');
      setSelectedProgrammes([]);
      setSelectedPackage('');
      setDisclaimerAccepted(false);
      await fetchData();
      // Switch to aftercare tab
      setActiveTab('aftercare');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Enrollment failed';
      toast.error(msg);
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const handleCancelEnrollment = async (enrollmentId: string) => {
    try {
      await request(`/aftercare-enrollment/${enrollmentId}`, { method: 'DELETE' });
      toast.success('Enrollment cancelled');
      await fetchData();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to cancel enrollment';
      toast.error(msg);
    }
  };

  const toggleProgramme = (programmeId: string) => {
    setSelectedProgrammes(prev =>
      prev.includes(programmeId)
        ? prev.filter(p => p !== programmeId)
        : [...prev, programmeId]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const recentHistory = sessions.filter(s => s.status === 'checked_out').slice(0, 10);
  const unenrolledChildren = children.filter(c => !isChildEnrolled(c.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Aftercare</h1>
          <p className="text-muted-foreground">Manage aftercare check-in, pick-up, and programme enrollment</p>
        </div>
        <div className="flex items-center gap-3">
          {lastSynced && (
            <span className="text-xs text-muted-foreground">
              Synced: {format(lastSynced, 'h:mm:ss a')}
            </span>
          )}
          <Button variant="outline" onClick={() => { fetchData(); fetchInvoices(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alert for unenrolled children */}
      {unenrolledChildren.length > 0 && activeTab === 'aftercare' && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Enrollment Required</p>
                <p className="text-sm text-amber-700 mt-1">
                  The following children need to be enrolled in the After School Programme before they can be checked in:
                  {' '}<strong>{unenrolledChildren.map(c => c.full_name).join(', ')}</strong>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 border-amber-400 text-amber-800 hover:bg-amber-100"
                  onClick={() => setActiveTab('enrollment')}
                >
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Go to Enrollment
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="aftercare" className="gap-2">
            <Baby className="h-4 w-4" />
            Check In / Pick Up
          </TabsTrigger>
          <TabsTrigger value="enrollment" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            Programme Enrollment
            {unenrolledChildren.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-xs flex items-center justify-center rounded-full">
                {unenrolledChildren.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2" onClick={() => fetchInvoices()}>
            <Receipt className="h-4 w-4" />
            Billing & Invoices
          </TabsTrigger>
        </TabsList>

        {/* AFTERCARE TAB */}
        <TabsContent value="aftercare" className="space-y-6 mt-4">
          {/* Children Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {children.map((child) => {
              const activeSession = getChildStatus(child.id);
              const isCheckedIn = !!activeSession;
              const enrolled = isChildEnrolled(child.id);
              return (
                <Card key={child.id} className={isCheckedIn ? 'border-green-300 bg-green-50/50' : !enrolled ? 'border-amber-200 bg-amber-50/30' : ''}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${isCheckedIn ? 'bg-green-100' : !enrolled ? 'bg-amber-100' : 'bg-gray-100'}`}>
                          <Baby className={`h-5 w-5 ${isCheckedIn ? 'text-green-600' : !enrolled ? 'text-amber-600' : 'text-gray-500'}`} />
                        </div>
                        <div>
                          <p className="font-semibold">{child.full_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {child.student_id} • Grade {child.grade}
                          </p>
                        </div>
                      </div>
                      <Badge variant={isCheckedIn ? 'default' : !enrolled ? 'destructive' : 'secondary'}>
                        {isCheckedIn ? 'In Aftercare' : !enrolled ? 'Not Enrolled' : 'Not Checked In'}
                      </Badge>
                    </div>

                    {isCheckedIn && activeSession && (
                      <div className="mt-3 p-2 bg-green-100/50 rounded text-sm">
                        <p className="text-green-700">
                          <Clock className="h-3.5 w-3.5 inline mr-1" />
                          Checked in at {format(new Date(activeSession.check_in_time), 'h:mm a')}
                        </p>
                      </div>
                    )}

                    {!enrolled && (
                      <div className="mt-3 p-2 bg-amber-100/50 rounded text-sm">
                        <p className="text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                          Must complete enrollment before check-in
                        </p>
                      </div>
                    )}

                    <div className="mt-4">
                      {isCheckedIn ? (
                        <Button
                          className="w-full"
                          variant="destructive"
                          onClick={() => openCheckOut(child, activeSession!)}
                        >
                          <UserMinus className="h-4 w-4 mr-2" />
                          Pick Up (Check Out)
                        </Button>
                      ) : enrolled ? (
                        <Button
                          className="w-full"
                          onClick={() => openCheckIn(child)}
                        >
                          <UserCheck className="h-4 w-4 mr-2" />
                          Check In to Aftercare
                        </Button>
                      ) : (
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => {
                            setEnrollChildId(child.id);
                            setActiveTab('enrollment');
                          }}
                        >
                          <GraduationCap className="h-4 w-4 mr-2" />
                          Enroll Now
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {children.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Baby className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No children linked to your account</p>
                <p className="text-sm mt-1">Contact the school to link your children to your parent account.</p>
              </CardContent>
            </Card>
          )}

          {/* Recent History */}
          {recentHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Aftercare History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Child</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Check In</TableHead>
                      <TableHead>Check Out</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Date Paid</TableHead>
                      <TableHead>Picked Up By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentHistory.map((session) => {
                      const checkIn = new Date(session.check_in_time);
                      const checkOut = session.check_out_time ? new Date(session.check_out_time) : null;
                      let durationStr = '—';
                      if (checkOut) {
                        const mins = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
                        const h = Math.floor(mins / 60);
                        const m = mins % 60;
                        durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                      }
                      // Use actual invoice data from the system (accurate & synchronized)
                      // Fall back to client-side estimate only if no invoice exists yet
                      const actualCost = session.invoice_total != null
                        ? Number(session.invoice_total).toFixed(2)
                        : calculateSessionCost(session);
                      const invoiceStatus = session.invoice_status;
                      return (
                        <TableRow key={session.id}>
                          <TableCell className="font-medium">{session.student_name}</TableCell>
                          <TableCell>{format(checkIn, 'MMM d, yyyy')}</TableCell>
                          <TableCell>{format(checkIn, 'h:mm a')}</TableCell>
                          <TableCell>{checkOut ? format(checkOut, 'h:mm a') : '—'}</TableCell>
                          <TableCell>{durationStr}</TableCell>
                          <TableCell>
                            {session.status === 'checked_in' ? (
                              <Badge variant="outline" className="text-xs">In progress</Badge>
                            ) : actualCost ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-primary">{actualCost}</span>
                                {invoiceStatus && (
                                  <Badge
                                    variant={invoiceStatus === 'paid' ? 'default' : 'secondary'}
                                    className={`text-[10px] px-1 py-0 ${invoiceStatus === 'paid' ? 'bg-green-600' : ''}`}
                                  >
                                    {invoiceStatus === 'paid' ? 'Paid' : invoiceStatus === 'pending' ? 'Due' : ''}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            {session.invoice_paid_at ? (
                              <span className="text-green-700 text-sm">{format(new Date(session.invoice_paid_at), 'MMM d, yyyy')}</span>
                            ) : session.invoice_status === 'pending' ? (
                              <Badge variant="secondary" className="text-xs">Unpaid</Badge>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            {session.checked_out_by_name || '—'}
                            {session.checked_out_by_role && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                {session.checked_out_by_role}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ENROLLMENT TAB */}
        <TabsContent value="enrollment" className="space-y-6 mt-4">
          {/* Active Enrollments */}
          {enrollments.filter(e => e.status === 'active').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Active Enrollments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Child</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Programmes</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrollments.filter(e => e.status === 'active').map((enrollment) => {
                      let progs: string[] = [];
                      try { progs = JSON.parse(enrollment.programmes); } catch { progs = []; }
                      return (
                        <TableRow key={enrollment.id}>
                          <TableCell className="font-medium">{enrollment.student_name}</TableCell>
                          <TableCell>{enrollment.grade}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {progs.length > 0 ? progs.map(p => (
                                <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                              )) : <span className="text-muted-foreground text-sm">None selected</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{enrollment.package_type}</Badge>
                          </TableCell>
                          <TableCell>{enrollment.academic_year}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleCancelEnrollment(enrollment.id)}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Enrollment Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                After School Programme Enrollment
              </CardTitle>
              <CardDescription>
                Complete this form to enroll your child in aftercare and after-school programmes.
                Enrollment is required before your child can be checked in to aftercare.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Child Selection */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">Select Child</Label>
                {children.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground border rounded-lg">
                    <Baby className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No children linked to your account.</p>
                    <p className="text-xs mt-1">Contact the school to link your children.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {children.map(child => {
                      const alreadyEnrolled = isChildEnrolled(child.id);
                      const isSelected = enrollChildId === child.id;
                      return (
                        <div
                          key={child.id}
                          className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                            alreadyEnrolled
                              ? 'opacity-50 cursor-not-allowed bg-muted/30'
                              : isSelected
                                ? 'border-primary bg-primary/5 cursor-pointer'
                                : 'border-border hover:border-primary/50 cursor-pointer'
                          }`}
                          onClick={() => {
                            if (!alreadyEnrolled) {
                              setEnrollChildId(isSelected ? '' : child.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-full ${isSelected ? 'bg-primary/10' : 'bg-gray-100'}`}>
                              <Baby className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-gray-500'}`} />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{child.full_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {child.student_id} • Grade {child.grade}
                              </p>
                            </div>
                          </div>
                          {alreadyEnrolled ? (
                            <Badge variant="secondary" className="text-xs">Already Enrolled</Badge>
                          ) : isSelected ? (
                            <Badge variant="default" className="text-xs">Selected</Badge>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Programme Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">After School Programmes</Label>
                <p className="text-sm text-muted-foreground">Select the programmes your child would like to participate in (optional)</p>
                {programmes.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground border rounded-lg">
                    <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No programmes available at this time.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {programmes.map(prog => (
                      <div
                        key={prog.id}
                        className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedProgrammes.includes(prog.name)
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => toggleProgramme(prog.name)}
                      >
                        <Checkbox
                          checked={selectedProgrammes.includes(prog.name)}
                          onCheckedChange={() => toggleProgramme(prog.name)}
                        />
                        <div>
                          <p className="font-medium text-sm">{prog.name}</p>
                          {prog.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{prog.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Aftercare Package Selection */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Aftercare Package</Label>
                <p className="text-sm text-muted-foreground">
                  Aftercare hours: Monday – Friday, 1:30 PM – 5:30 PM
                </p>
                <RadioGroup value={selectedPackage} onValueChange={setSelectedPackage}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {packages.map(pkg => (
                      <div
                        key={pkg.id}
                        className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedPackage === pkg.name
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => setSelectedPackage(pkg.name)}
                      >
                        <RadioGroupItem value={pkg.name} id={`pkg-${pkg.id}`} />
                        <div>
                          <p className="font-medium">{pkg.name}</p>
                          <p className="text-sm text-muted-foreground">{pkg.description}</p>
                          {pkg.price > 0 && (
                            <p className="text-sm font-semibold text-primary mt-1">
                              {pkg.price}/{pkg.billing_cycle}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </div>

              {/* Disclaimer */}
              <div className="space-y-3 border-t pt-4">
                <Label className="text-base font-semibold">Disclaimer & Agreement</Label>
                <div className="p-4 bg-muted/50 rounded-lg text-sm space-y-2">
                  <p>By enrolling my child in the After School Programme, I acknowledge and agree to the following:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>I understand the aftercare hours are Monday – Friday, 1:30 PM – 5:30 PM</li>
                    <li>Late pick-up fees may apply after 5:30 PM</li>
                    <li>I will ensure my child is collected by an authorised person</li>
                    <li>I accept responsibility for informing the school of any changes to pick-up arrangements</li>
                    <li>Programme fees are billed per term and are non-refundable once the term has commenced</li>
                    <li>The school reserves the right to modify programme schedules with reasonable notice</li>
                  </ul>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="disclaimer"
                    checked={disclaimerAccepted}
                    onCheckedChange={(checked) => setDisclaimerAccepted(checked === true)}
                  />
                  <Label htmlFor="disclaimer" className="text-sm cursor-pointer">
                    I have read and agree to the above terms and conditions
                  </Label>
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEnrollChildId('');
                    setSelectedProgrammes([]);
                    setSelectedPackage('');
                    setDisclaimerAccepted(false);
                  }}
                >
                  Reset Form
                </Button>
                <Button
                  onClick={handleEnrollSubmit}
                  disabled={enrollSubmitting || !enrollChildId || !selectedPackage || !disclaimerAccepted}
                >
                  {enrollSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <GraduationCap className="h-4 w-4 mr-2" />
                  )}
                  Submit Enrollment
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BILLING TAB */}
        <TabsContent value="billing" className="space-y-6 mt-4">
          {/* Billing Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Receipt className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Invoices</p>
                    <p className="text-2xl font-bold">{invoices.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pending</p>
                    <p className="text-2xl font-bold">
                      {invoices.filter(i => i.status === 'pending').reduce((sum, i) => sum + Number(i.total), 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Paid</p>
                    <p className="text-2xl font-bold">
                      {invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.total), 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Rate Info */}
          {billingSettings && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <span>
                    Current rate: <strong className="text-foreground">{billingSettings.rate_amount.toFixed(2)}</strong>
                    {billingSettings.rate_type === 'hourly' ? '/hour' : billingSettings.rate_type === 'weekly' ? '/week' : '/month'}
                    {billingSettings.grace_period_minutes > 0 && (
                      <> • {billingSettings.grace_period_minutes} min grace period</>
                    )}
                    {billingSettings.daily_cap && (
                      <> • Daily cap: {billingSettings.daily_cap.toFixed(2)}</>
                    )}
                    {billingSettings.late_pickup_fee > 0 && (
                      <> • Late fee: {billingSettings.late_pickup_fee.toFixed(2)} (after {Math.floor(billingSettings.late_pickup_after_minutes / 60)}h)</>
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invoices Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Aftercare Invoices
              </CardTitle>
              <CardDescription>
                Invoices generated for aftercare sessions. Contact the school for payment queries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No invoices yet</p>
                  <p className="text-sm mt-1">Invoices will appear here once aftercare sessions are billed.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Child</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Late Fee</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => {
                      const h = Math.floor(invoice.duration_minutes / 60);
                      const m = invoice.duration_minutes % 60;
                      const durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                      return (
                        <TableRow key={invoice.id}>
                          <TableCell>{format(new Date(invoice.invoice_date), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="font-medium">{invoice.student_name}</TableCell>
                          <TableCell>{durationStr}</TableCell>
                          <TableCell>{Number(invoice.amount).toFixed(2)}</TableCell>
                          <TableCell>
                            {Number(invoice.late_fee) > 0 ? (
                              <span className="text-red-600">{Number(invoice.late_fee).toFixed(2)}</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="font-semibold">{Number(invoice.total).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                invoice.status === 'paid' ? 'default' :
                                invoice.status === 'pending' ? 'secondary' :
                                'destructive'
                              }
                              className={invoice.status === 'paid' ? 'bg-green-600' : ''}
                            >
                              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {invoice.paid_at ? (
                              <span className="text-green-700 text-sm">{format(new Date(invoice.paid_at), 'MMM d, yyyy')}</span>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'checkin' ? 'Check In to Aftercare' : 'Pick Up from Aftercare'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedChild && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{selectedChild.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedChild.student_id} • Grade {selectedChild.grade}
                </p>
              </div>
            )}
            {actionType === 'checkout' && selectedSession && (
              <p className="text-sm text-muted-foreground">
                Checked in at {format(new Date(selectedSession.check_in_time), 'h:mm a')}
              </p>
            )}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder={actionType === 'checkin' ? 'Any notes for aftercare staff...' : 'Pick-up notes...'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              Cancel
            </Button>
            {actionType === 'checkin' ? (
              <Button onClick={handleCheckIn} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
                Confirm Check In
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleCheckOut} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserMinus className="h-4 w-4 mr-2" />}
                Confirm Pick Up
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}