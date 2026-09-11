import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { request } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import {
  Search,
  UserCheck,
  UserMinus,
  Clock,
  Users,
  Loader2,
  RefreshCw,
  CalendarDays,
  CheckSquare,
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';

interface Student {
  id: string;
  full_name: string;
  student_id: string;
  grade: string;
}

interface AftercareSession {
  id: string;
  student_id: string;
  student_name: string;
  student_code: string;
  grade: string;
  check_in_time: string;
  check_out_time: string | null;
  checked_in_by_name: string;
  checked_in_by_role: string;
  checked_out_by_name: string | null;
  checked_out_by_role: string | null;
  status: string;
  notes: string | null;
}

interface Programme {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
}

interface Enrollment {
  id: string;
  student_id: string;
  parent_id: string;
  student_name: string;
  student_code: string;
  grade: string;
  parent_name: string;
  parent_email: string;
  programmes: string;
  package_type: string;
  academic_year: string;
  status: string;
  created_at: string;
  updated_at: string | null;
}

export default function Aftercare() {
  const { user } = useAuth();
  const [activeSessions, setActiveSessions] = useState<AftercareSession[]>([]);
  const [history, setHistory] = useState<AftercareSession[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [stats, setStats] = useState({ currently_checked_in: 0, checked_out_today: 0, total_sessions_today: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [checkOutDialogOpen, setCheckOutDialogOpen] = useState(false);
  const [bulkCheckInDialogOpen, setBulkCheckInDialogOpen] = useState(false);
  const [bulkCheckOutDialogOpen, setBulkCheckOutDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedSession, setSelectedSession] = useState<AftercareSession | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [historyDate, setHistoryDate] = useState('');

  // Programme management state
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [progDialogOpen, setProgDialogOpen] = useState(false);
  const [editingProg, setEditingProg] = useState<Programme | null>(null);
  const [progName, setProgName] = useState('');
  const [progDescription, setProgDescription] = useState('');
  const [progActive, setProgActive] = useState(true);
  const [progSortOrder, setProgSortOrder] = useState(0);
  const [progSubmitting, setProgSubmitting] = useState(false);

  // Enrollment management state
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [enrollmentFilter, setEnrollmentFilter] = useState('all');
  const [enrollmentSearch, setEnrollmentSearch] = useState('');
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await request<{ currently_checked_in: number; checked_out_today: number; total_sessions_today: number }>('/aftercare/stats');
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  const fetchActiveSessions = useCallback(async () => {
    try {
      const data = await request<AftercareSession[]>('/aftercare/active');
      setActiveSessions(data);
    } catch (error) {
      console.error('Failed to fetch active sessions:', error);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const dateParam = historyDate ? `date=${historyDate}` : 'date=all';
      // Send timezone offset so backend can filter by the user's local date
      const tzOffset = new Date().getTimezoneOffset(); // minutes offset from UTC (e.g., 300 for UTC-5)
      const data = await request<{ sessions: AftercareSession[]; total: number }>(
        `/aftercare/history?${dateParam}&tz_offset=${tzOffset}&limit=100`
      );
      setHistory(data.sessions);
      setHistoryTotal(data.total);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  }, [historyDate]);

  const fetchProgrammes = useCallback(async () => {
    try {
      const data = await request<Programme[]>('/aftercare-enrollment/admin/programmes');
      setProgrammes(data);
    } catch (error) {
      console.error('Failed to fetch programmes:', error);
    }
  }, []);

  const fetchEnrollments = useCallback(async () => {
    setEnrollmentLoading(true);
    try {
      const params = new URLSearchParams();
      if (enrollmentFilter !== 'all') params.set('status', enrollmentFilter);
      if (enrollmentSearch) params.set('search', enrollmentSearch);
      const data = await request<Enrollment[]>(`/aftercare-enrollment/admin/enrollments?${params.toString()}`);
      setEnrollments(data);
    } catch (error) {
      console.error('Failed to fetch enrollments:', error);
    } finally {
      setEnrollmentLoading(false);
    }
  }, [enrollmentFilter, enrollmentSearch]);

  const handleUpdateEnrollmentStatus = async (enrollmentId: string, newStatus: string) => {
    try {
      await request(`/aftercare-enrollment/admin/enrollments/${enrollmentId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(`Enrollment status updated to ${newStatus}`);
      fetchEnrollments();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to update status';
      toast.error(msg);
    }
  };

  const handleDeleteEnrollment = async (enrollmentId: string, studentName: string) => {
    if (!confirm(`Are you sure you want to permanently delete the enrollment for ${studentName}?`)) return;
    try {
      await request(`/aftercare-enrollment/admin/enrollments/${enrollmentId}`, {
        method: 'DELETE',
      });
      toast.success('Enrollment deleted');
      fetchEnrollments();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to delete enrollment';
      toast.error(msg);
    }
  };

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  // Initial data load (runs once on mount)
  const hasMounted = useRef(false);
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchActiveSessions(), fetchHistory(), fetchProgrammes()]);
      setLoading(false);
      hasMounted.current = true;
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch history when date filter changes (skip initial mount)
  useEffect(() => {
    if (!hasMounted.current) return;
    fetchHistory();
  }, [fetchHistory]);

  // Auto-refresh stats and active sessions every 15 seconds for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
      fetchActiveSessions();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchActiveSessions]);

  // Force re-render every 60 seconds to update duration displays
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Search students
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await request<Student[]>(`/aftercare/search-students?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Single check-in
  const handleCheckIn = async () => {
    if (!selectedStudent) return;
    setSubmitting(true);
    try {
      await request('/aftercare/checkin', {
        method: 'POST',
        body: JSON.stringify({ student_id: selectedStudent.id, notes: notes || undefined }),
      });
      toast.success(`${selectedStudent.full_name} checked in to aftercare`);
      setCheckInDialogOpen(false);
      setSelectedStudent(null);
      setNotes('');
      setSearchQuery('');
      setSearchResults([]);
      await Promise.all([fetchStats(), fetchActiveSessions()]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Check-in failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Single check-out
  const handleCheckOut = async () => {
    if (!selectedSession) return;
    setSubmitting(true);
    try {
      await request(`/aftercare/checkout/${selectedSession.id}`, {
        method: 'POST',
        body: JSON.stringify({ notes: notes || undefined }),
      });
      toast.success(`${selectedSession.student_name} checked out of aftercare`);
      setCheckOutDialogOpen(false);
      setSelectedSession(null);
      setNotes('');
      await Promise.all([fetchStats(), fetchActiveSessions(), fetchHistory()]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Check-out failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Bulk check-in
  const handleBulkCheckIn = async () => {
    if (selectedStudents.length === 0) return;
    setSubmitting(true);
    try {
      const data = await request<{ checked_in: number; skipped: number }>('/aftercare/bulk-checkin', {
        method: 'POST',
        body: JSON.stringify({
          student_ids: selectedStudents.map(s => s.id),
          notes: notes || undefined,
        }),
      });
      toast.success(`${data.checked_in} student(s) checked in${data.skipped > 0 ? ` (${data.skipped} already checked in)` : ''}`);
      setBulkCheckInDialogOpen(false);
      setSelectedStudents([]);
      setNotes('');
      setSearchQuery('');
      setSearchResults([]);
      await Promise.all([fetchStats(), fetchActiveSessions()]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Bulk check-in failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Bulk check-out
  const handleBulkCheckOut = async () => {
    if (selectedSessions.length === 0) return;
    setSubmitting(true);
    try {
      const data = await request<{ checked_out: number }>('/aftercare/bulk-checkout', {
        method: 'POST',
        body: JSON.stringify({
          session_ids: selectedSessions,
          notes: notes || undefined,
        }),
      });
      toast.success(`${data.checked_out} student(s) checked out`);
      setBulkCheckOutDialogOpen(false);
      setSelectedSessions([]);
      setNotes('');
      await Promise.all([fetchStats(), fetchActiveSessions(), fetchHistory()]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Bulk check-out failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle student selection for bulk check-in
  const toggleStudentSelection = (student: Student) => {
    setSelectedStudents(prev => {
      const exists = prev.find(s => s.id === student.id);
      if (exists) {
        return prev.filter(s => s.id !== student.id);
      }
      return [...prev, student];
    });
  };

  // Toggle session selection for bulk check-out
  const toggleSessionSelection = (sessionId: string) => {
    setSelectedSessions(prev => {
      if (prev.includes(sessionId)) {
        return prev.filter(id => id !== sessionId);
      }
      return [...prev, sessionId];
    });
  };

  // Select/deselect all active sessions
  const toggleAllSessions = () => {
    if (selectedSessions.length === activeSessions.length) {
      setSelectedSessions([]);
    } else {
      setSelectedSessions(activeSessions.map(s => s.id));
    }
  };

  // Programme CRUD handlers
  const openAddProgramme = () => {
    setEditingProg(null);
    setProgName('');
    setProgDescription('');
    setProgActive(true);
    setProgSortOrder(programmes.length);
    setProgDialogOpen(true);
  };

  const openEditProgramme = (prog: Programme) => {
    setEditingProg(prog);
    setProgName(prog.name);
    setProgDescription(prog.description || '');
    setProgActive(prog.active);
    setProgSortOrder(prog.sort_order);
    setProgDialogOpen(true);
  };

  const handleSaveProgramme = async () => {
    if (!progName.trim()) {
      toast.error('Programme name is required');
      return;
    }
    setProgSubmitting(true);
    try {
      if (editingProg) {
        await request(`/aftercare-enrollment/admin/programmes/${editingProg.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: progName.trim(),
            description: progDescription.trim() || null,
            active: progActive,
            sort_order: progSortOrder,
          }),
        });
        toast.success('Programme updated');
      } else {
        await request('/aftercare-enrollment/admin/programmes', {
          method: 'POST',
          body: JSON.stringify({
            name: progName.trim(),
            description: progDescription.trim() || null,
            active: progActive,
            sort_order: progSortOrder,
          }),
        });
        toast.success('Programme added');
      }
      setProgDialogOpen(false);
      await fetchProgrammes();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save programme';
      toast.error(msg);
    } finally {
      setProgSubmitting(false);
    }
  };

  const handleDeleteProgramme = async (prog: Programme) => {
    if (!confirm(`Delete "${prog.name}"? This cannot be undone.`)) return;
    try {
      await request(`/aftercare-enrollment/admin/programmes/${prog.id}`, { method: 'DELETE' });
      toast.success('Programme deleted');
      await fetchProgrammes();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to delete programme';
      toast.error(msg);
    }
  };

  const openCheckIn = (student: Student) => {
    setSelectedStudent(student);
    setNotes('');
    setCheckInDialogOpen(true);
  };

  const openCheckOut = (session: AftercareSession) => {
    setSelectedSession(session);
    setNotes('');
    setCheckOutDialogOpen(true);
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
          <h1 className="text-2xl font-bold">Aftercare Management</h1>
          <p className="text-muted-foreground">Check students in and out of aftercare — single or bulk</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Live
          </div>
          <Button variant="outline" size="sm" onClick={() => Promise.all([fetchStats(), fetchActiveSessions(), fetchHistory()])}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.currently_checked_in}</p>
                <p className="text-sm text-muted-foreground">Currently Checked In</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.checked_out_today}</p>
                <p className="text-sm text-muted-foreground">Checked Out Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <CalendarDays className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total_sessions_today}</p>
                <p className="text-sm text-muted-foreground">Total Sessions Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">
            <UserCheck className="h-4 w-4 mr-2" />
            Active ({activeSessions.length})
          </TabsTrigger>
          <TabsTrigger value="checkin">
            <Search className="h-4 w-4 mr-2" />
            Check In
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
          <TabsTrigger value="programmes">
            <GraduationCap className="h-4 w-4 mr-2" />
            Programmes
          </TabsTrigger>
          <TabsTrigger value="enrollments">
            <Users className="h-4 w-4 mr-2" />
            Enrolled Students
          </TabsTrigger>
        </TabsList>

        {/* Active Sessions Tab */}
        <TabsContent value="active">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Currently Checked In</CardTitle>
              {activeSessions.length > 0 && (
                <div className="flex items-center gap-2">
                  {selectedSessions.length > 0 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setNotes('');
                        setBulkCheckOutDialogOpen(true);
                      }}
                    >
                      <UserMinus className="h-3.5 w-3.5 mr-1" />
                      Check Out Selected ({selectedSessions.length})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={toggleAllSessions}
                  >
                    <CheckSquare className="h-3.5 w-3.5 mr-1" />
                    {selectedSessions.length === activeSessions.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {activeSessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No students currently in aftercare</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={selectedSessions.length === activeSessions.length && activeSessions.length > 0}
                          onCheckedChange={toggleAllSessions}
                        />
                      </TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Check-In Time</TableHead>
                      <TableHead>Checked In By</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeSessions.map((session) => {
                      const checkInDate = new Date(session.check_in_time);
                      const duration = Math.floor((Date.now() - checkInDate.getTime()) / 60000);
                      const hours = Math.floor(duration / 60);
                      const mins = duration % 60;
                      return (
                        <TableRow key={session.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedSessions.includes(session.id)}
                              onCheckedChange={() => toggleSessionSelection(session.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{session.student_name}</TableCell>
                          <TableCell>{session.student_code}</TableCell>
                          <TableCell>{session.grade}</TableCell>
                          <TableCell>{format(checkInDate, 'h:mm a')}</TableCell>
                          <TableCell>
                            <span className="text-sm">{session.checked_in_by_name}</span>
                            <Badge variant="outline" className="ml-2 text-xs">
                              {session.checked_in_by_role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openCheckOut(session)}
                            >
                              <UserMinus className="h-3.5 w-3.5 mr-1" />
                              Check Out
                            </Button>
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

        {/* Check In Tab */}
        <TabsContent value="checkin">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Check In Students</CardTitle>
              {selectedStudents.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => {
                    setNotes('');
                    setBulkCheckInDialogOpen(true);
                  }}
                >
                  <CheckSquare className="h-3.5 w-3.5 mr-1" />
                  Bulk Check In ({selectedStudents.length})
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by student name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Selected students for bulk check-in */}
              {selectedStudents.length > 0 && (
                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">
                      Selected for check-in ({selectedStudents.length})
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedStudents([])}
                      className="text-xs h-7"
                    >
                      Clear All
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedStudents.map(student => (
                      <Badge
                        key={student.id}
                        variant="secondary"
                        className="cursor-pointer hover:bg-destructive/20"
                        onClick={() => toggleStudentSelection(student)}
                      >
                        {student.full_name} ✕
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {searching && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                  {searchResults.map((student) => {
                    const isCheckedIn = activeSessions.some(s => s.student_id === student.id);
                    const isSelected = selectedStudents.some(s => s.id === student.id);
                    return (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-3 hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isSelected}
                            disabled={isCheckedIn}
                            onCheckedChange={() => {
                              if (!isCheckedIn) toggleStudentSelection(student);
                            }}
                          />
                          <div>
                            <p className="font-medium">{student.full_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {student.student_id} • Grade {student.grade}
                            </p>
                          </div>
                        </div>
                        {isCheckedIn ? (
                          <Badge variant="secondary">Already Checked In</Badge>
                        ) : (
                          <Button size="sm" onClick={() => openCheckIn(student)}>
                            <UserCheck className="h-3.5 w-3.5 mr-1" />
                            Check In
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No students found matching "{searchQuery}"
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Aftercare History</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant={historyDate === '' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setHistoryDate('')}
                >
                  All
                </Button>
                <Button
                  variant={historyDate === format(new Date(), 'yyyy-MM-dd') ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setHistoryDate(format(new Date(), 'yyyy-MM-dd'))}
                >
                  Today
                </Button>
                <Input
                  type="date"
                  value={historyDate}
                  onChange={(e) => setHistoryDate(e.target.value)}
                  className="w-auto"
                />
              </div>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>{historyDate ? 'No aftercare sessions for this date' : 'No aftercare sessions found'}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Grade</TableHead>
                      {!historyDate && <TableHead>Date</TableHead>}
                      <TableHead>Check In</TableHead>
                      <TableHead>Checked In By</TableHead>
                      <TableHead>Check Out</TableHead>
                      <TableHead>Checked Out By</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((session) => {
                      const checkIn = new Date(session.check_in_time);
                      const checkOut = session.check_out_time ? new Date(session.check_out_time) : null;
                      let durationStr = '—';
                      if (checkOut) {
                        const mins = Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000);
                        const h = Math.floor(mins / 60);
                        const m = mins % 60;
                        durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                      }
                      return (
                        <TableRow key={session.id}>
                          <TableCell className="font-medium">{session.student_name}</TableCell>
                          <TableCell>{session.grade}</TableCell>
                          {!historyDate && <TableCell>{format(checkIn, 'MMM d, yyyy')}</TableCell>}
                          <TableCell>{format(checkIn, 'h:mm a')}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{session.checked_in_by_name || '—'}</p>
                              {session.checked_in_by_role && (
                                <p className="text-xs text-muted-foreground capitalize">{session.checked_in_by_role}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{checkOut ? format(checkOut, 'h:mm a') : '—'}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{session.checked_out_by_name || '—'}</p>
                              {session.checked_out_by_role && (
                                <p className="text-xs text-muted-foreground capitalize">{session.checked_out_by_role}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{durationStr}</TableCell>
                          <TableCell>
                            <Badge variant={session.status === 'checked_in' ? 'default' : 'secondary'}>
                              {session.status === 'checked_in' ? 'In Aftercare' : 'Picked Up'}
                            </Badge>
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

        {/* Programmes Tab */}
        <TabsContent value="programmes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>After School Programmes</CardTitle>
              <Button size="sm" onClick={openAddProgramme}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Programme
              </Button>
            </CardHeader>
            <CardContent>
              {programmes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No programmes configured yet</p>
                  <p className="text-sm mt-1">Add programmes that parents can select during enrollment.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {programmes.map((prog) => (
                      <TableRow key={prog.id} className={!prog.active ? 'opacity-50' : ''}>
                        <TableCell className="font-medium">{prog.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                          {prog.description || '—'}
                        </TableCell>
                        <TableCell>{prog.sort_order}</TableCell>
                        <TableCell>
                          <Badge variant={prog.active ? 'default' : 'secondary'}>
                            {prog.active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditProgramme(prog)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeleteProgramme(prog)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

        {/* Enrolled Students Tab */}
        <TabsContent value="enrollments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Enrolled Students</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search student or parent..."
                  value={enrollmentSearch}
                  onChange={(e) => setEnrollmentSearch(e.target.value)}
                  className="w-[200px] h-8 text-sm"
                />
                <select
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                  value={enrollmentFilter}
                  onChange={(e) => setEnrollmentFilter(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="suspended">Suspended</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <Button size="sm" variant="outline" onClick={fetchEnrollments} disabled={enrollmentLoading}>
                  {enrollmentLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {enrollmentLoading && enrollments.length === 0 ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Loading enrollments...</p>
                </div>
              ) : enrollments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No enrollments found</p>
                  <p className="text-sm mt-1">
                    {enrollmentFilter !== 'all' || enrollmentSearch
                      ? 'Try adjusting your filters or search query.'
                      : 'Students will appear here once parents submit enrollment forms.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-3">
                    Showing {enrollments.length} enrollment{enrollments.length !== 1 ? 's' : ''}
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead>Package</TableHead>
                        <TableHead>Year</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Enrolled</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enrollments.map((enrollment) => (
                        <TableRow key={enrollment.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{enrollment.student_name}</p>
                              <p className="text-xs text-muted-foreground">{enrollment.student_code}</p>
                            </div>
                          </TableCell>
                          <TableCell>{enrollment.grade || '—'}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{enrollment.parent_name || '—'}</p>
                              <p className="text-xs text-muted-foreground">{enrollment.parent_email || ''}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {enrollment.package_type || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{enrollment.academic_year}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                enrollment.status === 'active' ? 'default' :
                                enrollment.status === 'pending' ? 'secondary' :
                                enrollment.status === 'suspended' ? 'destructive' :
                                'outline'
                              }
                              className="capitalize"
                            >
                              {enrollment.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(enrollment.created_at), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {enrollment.status !== 'active' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50 h-7 px-2 text-xs"
                                  onClick={() => handleUpdateEnrollmentStatus(enrollment.id, 'active')}
                                  title="Activate"
                                >
                                  <CheckSquare className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {enrollment.status === 'active' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 h-7 px-2 text-xs"
                                  onClick={() => handleUpdateEnrollmentStatus(enrollment.id, 'suspended')}
                                  title="Suspend"
                                >
                                  <UserMinus className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {enrollment.status !== 'cancelled' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2 text-xs"
                                  onClick={() => handleUpdateEnrollmentStatus(enrollment.id, 'cancelled')}
                                  title="Cancel"
                                >
                                  <UserMinus className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2 text-xs"
                                onClick={() => handleDeleteEnrollment(enrollment.id, enrollment.student_name)}
                                title="Delete permanently"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Programme Add/Edit Dialog */}
      <Dialog open={progDialogOpen} onOpenChange={setProgDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProg ? 'Edit Programme' : 'Add Programme'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Programme Name *</Label>
              <Input
                placeholder="e.g. Chess Club, Art Care, Swimming"
                value={progName}
                onChange={(e) => setProgName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Brief description of the programme..."
                value={progDescription}
                onChange={(e) => setProgDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  min={0}
                  value={progSortOrder}
                  onChange={(e) => setProgSortOrder(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Switch
                    checked={progActive}
                    onCheckedChange={setProgActive}
                  />
                  <span className="text-sm">{progActive ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProgDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProgramme} disabled={progSubmitting || !progName.trim()}>
              {progSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingProg ? 'Update' : 'Add'} Programme
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Check In Dialog */}
      <Dialog open={checkInDialogOpen} onOpenChange={setCheckInDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check In Student</DialogTitle>
          </DialogHeader>
          {selectedStudent && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{selectedStudent.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedStudent.student_id} • Grade {selectedStudent.grade}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Any notes about this check-in..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckInDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCheckIn} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
              Confirm Check In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Check Out Dialog */}
      <Dialog open={checkOutDialogOpen} onOpenChange={setCheckOutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check Out Student</DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{selectedSession.student_name}</p>
                <p className="text-sm text-muted-foreground">
                  Checked in at {format(new Date(selectedSession.check_in_time), 'h:mm a')}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Any notes about this pick-up..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckOutDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleCheckOut} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserMinus className="h-4 w-4 mr-2" />}
              Confirm Check Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Check In Dialog */}
      <Dialog open={bulkCheckInDialogOpen} onOpenChange={setBulkCheckInDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Check In — {selectedStudents.length} Student(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border rounded-lg max-h-[200px] overflow-y-auto divide-y">
              {selectedStudents.map(student => (
                <div key={student.id} className="p-2 px-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{student.full_name}</p>
                    <p className="text-xs text-muted-foreground">{student.student_id} • Grade {student.grade}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => toggleStudentSelection(student)}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Notes (optional — applies to all)</Label>
              <Textarea
                placeholder="Any notes about this bulk check-in..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCheckInDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkCheckIn} disabled={submitting || selectedStudents.length === 0}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
              Check In All ({selectedStudents.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Check Out Dialog */}
      <Dialog open={bulkCheckOutDialogOpen} onOpenChange={setBulkCheckOutDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Check Out — {selectedSessions.length} Student(s)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border rounded-lg max-h-[200px] overflow-y-auto divide-y">
              {activeSessions
                .filter(s => selectedSessions.includes(s.id))
                .map(session => (
                  <div key={session.id} className="p-2 px-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{session.student_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Checked in at {format(new Date(session.check_in_time), 'h:mm a')}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => toggleSessionSelection(session.id)}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
            </div>
            <div className="space-y-2">
              <Label>Notes (optional — applies to all)</Label>
              <Textarea
                placeholder="Any notes about this bulk check-out..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCheckOutDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkCheckOut} disabled={submitting || selectedSessions.length === 0}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserMinus className="h-4 w-4 mr-2" />}
              Check Out All ({selectedSessions.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}