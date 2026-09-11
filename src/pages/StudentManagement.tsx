import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus,
  Pencil,
  Search,
  Loader2,
  Users,
  DollarSign,
  AlertTriangle,
  UserCheck,
  GraduationCap,
  Wallet,
  Link2,
  Unlink,
  Camera,
  X,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  ArrowUpCircle,
  ChevronRight,
  Archive,

} from 'lucide-react';

import {
  studentApi,
  transactionApi,
  usersApi,
  parentStudentApi,
  guardianApi,
  type Student,
  type ManagedUser,
  type BulkImportResult,

  type PromoteGradesResponse,
} from '@/lib/api';
import { toast } from 'sonner';

// ─── Types & Constants ───────────────────────────────────────────────────────

interface StudentFormData {
  student_id: string;
  full_name: string;
  email: string;
  grade: string;
  homeroom: string;
  balance: string;
  meal_program: string;
  account_status: string;
  photo: string;
  parent_guardian: string;
  parent_email_address: string;
}

const EMPTY_FORM: StudentFormData = {
  student_id: '',
  full_name: '',
  email: '',
  grade: '',
  homeroom: '',
  balance: '0',
  meal_program: 'standard',
  account_status: 'active',
  photo: '',
  parent_guardian: '',
  parent_email_address: '',
};

const GRADES = [
  'Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
];

const MEAL_PROGRAMS = [
  { value: 'standard', label: 'Standard' },
  { value: 'free', label: 'Free Lunch' },
  { value: 'reduced', label: 'Reduced Price' },
];

const RELATIONSHIP_OPTIONS = [
  { value: 'parent', label: 'Parent' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'other', label: 'Other' },
];

interface CsvRow {
  student_id: string;
  full_name: string;
  grade: string;
  homeroom: string;
  meal_program: string;
  parent_guardian: string;
  parent_email_address: string;
  _error?: string;
}

const CSV_TEMPLATE_HEADER = 'Student ID,Student Name,Grade,Homeroom,Meal Program,Parent/Guardian Name,Parent Email';
const CSV_TEMPLATE_EXAMPLE = 'STU-001,John Smith,5,Room 101,standard,Jane Smith,jane@example.com';

// ─── CSV Helpers ─────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Skip header row
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: CsvRow = {
      student_id: cols[0] || '',
      full_name: cols[1] || '',
      grade: cols[2] || '',
      homeroom: cols[3] || '',
      meal_program: (cols[4] || 'standard').toLowerCase(),
      parent_guardian: cols[5] || '',
      parent_email_address: cols[6] || '',
    };

    // Validate
    const errors: string[] = [];
    if (!row.student_id) errors.push('Missing Student ID');
    if (!row.full_name) errors.push('Missing Student Name');
    if (row.meal_program && !['standard', 'free', 'reduced'].includes(row.meal_program)) {
      errors.push('Invalid Meal Program (use: standard, free, reduced)');
    }
    if (row.parent_email_address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.parent_email_address)) {
      errors.push('Invalid email format');
    }
    if (errors.length > 0) row._error = errors.join('; ');

    rows.push(row);
  }
  return rows;
}

function downloadCsvTemplate() {
  const content = `${CSV_TEMPLATE_HEADER}\n${CSV_TEMPLATE_EXAMPLE}\nSTU-002,Emily Johnson,3,Room 205,free,Robert Johnson,robert@example.com`;
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'student_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function StudentManagement() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formData, setFormData] = useState<StudentFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detail dialog
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch full student detail (including parents array) from the /:id endpoint
  const handleViewDetail = useCallback(async (student: Student) => {
    // Show the dialog immediately with list data as a placeholder
    setDetailStudent(student);
    setDetailLoading(true);
    try {
      const fullStudent = await studentApi.getById(student.id);
      setDetailStudent(fullStudent);
    } catch (err) {
      console.error('Failed to fetch student detail:', err);
      // Keep the list data as fallback
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Top-up dialog
  const [topUpStudent, setTopUpStudent] = useState<Student | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('10');
  const [topUpMethod, setTopUpMethod] = useState('cash');
  const [topUpNotes, setTopUpNotes] = useState('');
  const [topUpLoading, setTopUpLoading] = useState(false);

  // Link parent dialog
  const [linkStudent, setLinkStudent] = useState<Student | null>(null);
  const [parents, setParents] = useState<ManagedUser[]>([]);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [selectedRelationship, setSelectedRelationship] = useState('parent');
  const [linkLoading, setLinkLoading] = useState(false);
  const [parentsLoading, setParentsLoading] = useState(false);
  // Create new parent mode within link dialog
  const [linkMode, setLinkMode] = useState<'existing' | 'new'>('existing');
  const [newParentEmail, setNewParentEmail] = useState('');
  const [newParentName, setNewParentName] = useState('');

  // Unlink confirmation - stores student + specific parent link to unlink
  const [unlinkStudent, setUnlinkStudent] = useState<Student | null>(null);
  const [unlinkParentInfo, setUnlinkParentInfo] = useState<{ link_id: string; parent_name: string } | null>(null);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  // Bulk import state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Grade promotion state
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoStep, setPromoStep] = useState<'config' | 'result'>('config');
  const [graduatingGrade, setGraduatingGrade] = useState('12th');
  const [graduatingAction, setGraduatingAction] = useState<'archive' | 'keep'>('archive');
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set(GRADES));
  const [promoPreview, setPromoPreview] = useState<PromoteGradesResponse | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoResult, setPromoResult] = useState<PromoteGradesResponse | null>(null);

  // ─── Data loading ────────────────────────────────────────────────────────

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const data = await studentApi.getAll();
      setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load students:', err);
      toast.error('Failed to load students');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadParents = useCallback(async () => {
    try {
      setParentsLoading(true);
      const allUsers = await usersApi.getAll();
      setParents(allUsers.filter((u) => u.role === 'parent'));
    } catch (err) {
      console.error('Failed to load parents:', err);
      toast.error('Failed to load parent accounts');
    } finally {
      setParentsLoading(false);
    }
  }, []);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Photo must be under 2MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((p) => ({ ...p, photo: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setFormData((p) => ({ ...p, photo: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openCreateDialog = () => {
    setEditingStudent(null);
    setFormData(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditDialog = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      student_id: student.student_id || '',
      full_name: student.full_name || '',
      email: student.email || '',
      grade: student.grade || '',
      homeroom: student.homeroom || '',
      balance: String(student.balance ?? 0),
      meal_program: student.meal_program || 'standard',
      account_status: student.account_status || 'active',
      photo: student.photo || '',
      // Prioritize linked parent data (from parents array or JOIN) over direct fields
      parent_guardian: (student.parents?.[0]?.parent_name) || student.parent_name || student.parent_guardian || '',
      parent_email_address: (student.parents?.[0]?.parent_email) || student.parent_email || student.parent_email_address || '',
    });
    setDialogOpen(true);
  };

  const openLinkDialog = (student: Student) => {
    setLinkStudent(student);
    setSelectedParentId('');
    setSelectedRelationship('parent');
    loadParents();
  };

  const handleSave = async () => {
    if (!formData.full_name.trim()) {
      toast.error('Student name is required');
      return;
    }
    if (!formData.student_id.trim()) {
      toast.error('Student ID is required');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        student_id: formData.student_id.trim(),
        full_name: formData.full_name.trim(),
        email: formData.email.trim() || undefined,
        grade: formData.grade || undefined,
        homeroom: formData.homeroom.trim() || undefined,
        balance: parseFloat(formData.balance) || 0,
        meal_program: formData.meal_program || undefined,
        account_status: formData.account_status,
        photo: formData.photo || undefined,
        parent_guardian: formData.parent_guardian.trim() || undefined,
        parent_email_address: formData.parent_email_address.trim() || undefined,
      };

      if (editingStudent) {
        await studentApi.update(editingStudent.id, payload as Partial<Student>);
        toast.success('Student updated successfully');
      } else {
        await studentApi.create(payload as Partial<Student>);
        toast.success('Student created successfully');
      }

      setDialogOpen(false);
      loadStudents();
    } catch (err) {
      console.error('Save failed:', err);
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTopUp = async () => {
    if (!topUpStudent) return;
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    setTopUpLoading(true);
    try {
      await transactionApi.addCredit({
        student_id: topUpStudent.id,
        amount,
        payment_method: topUpMethod,
        notes: topUpNotes || undefined,
      });
      toast.success(`Added $${amount.toFixed(2)} to ${topUpStudent.full_name}'s account`);
      setTopUpStudent(null);
      setTopUpAmount('10');
      setTopUpNotes('');
      loadStudents();
    } catch (err) {
      console.error('Top-up failed:', err);
      toast.error(err instanceof Error ? err.message : 'Top-up failed');
    } finally {
      setTopUpLoading(false);
    }
  };

  const handleLinkParent = async () => {
    if (!linkStudent) return;

    if (linkMode === 'existing') {
      if (!selectedParentId) {
        toast.error('Please select a parent');
        return;
      }
      setLinkLoading(true);
      try {
        await parentStudentApi.link(selectedParentId, linkStudent.id, selectedRelationship);
        toast.success('Parent linked to student successfully');
        setLinkStudent(null);
        loadStudents();
      } catch (err) {
        console.error('Link failed:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to link parent');
      } finally {
        setLinkLoading(false);
      }
    } else {
      // Create new parent account and link via guardianApi
      if (!newParentEmail.trim()) {
        toast.error('Please enter the parent email');
        return;
      }
      if (!newParentName.trim()) {
        toast.error('Please enter the parent name');
        return;
      }
      setLinkLoading(true);
      try {
        const result = await guardianApi.add(
          linkStudent.id,
          newParentEmail.trim(),
          selectedRelationship,
          newParentName.trim()
        );
        if (result.account_created) {
          toast.success('New parent account created and linked! A welcome email has been sent.');
        } else {
          toast.success('Existing parent account found and linked successfully!');
        }
        setLinkStudent(null);
        setNewParentEmail('');
        setNewParentName('');
        setLinkMode('existing');
        loadStudents();
        loadParents(); // Refresh parent list
      } catch (err) {
        console.error('Create & link failed:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to create and link parent');
      } finally {
        setLinkLoading(false);
      }
    }
  };

  const handleUnlinkParent = async () => {
    const linkId = unlinkParentInfo?.link_id || unlinkStudent?.link_id;
    if (!linkId) return;
    setUnlinkLoading(true);
    try {
      await parentStudentApi.unlink(linkId);
      toast.success(`Unlinked parent from ${unlinkStudent?.full_name}`);
      const studentToRefresh = unlinkStudent;
      setUnlinkStudent(null);
      setUnlinkParentInfo(null);
      loadStudents();
      // Refresh the detail dialog if it's still open for this student
      if (studentToRefresh && detailStudent && detailStudent.id === studentToRefresh.id) {
        try {
          const refreshed = await studentApi.getById(studentToRefresh.id);
          setDetailStudent(refreshed);
        } catch {
          // If fetch fails, close the detail dialog
          setDetailStudent(null);
        }
      }
    } catch (err) {
      console.error('Unlink failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to unlink parent');
    } finally {
      setUnlinkLoading(false);
    }
  };

  // ─── Bulk Import Handlers ────────────────────────────────────────────────

  const openBulkDialog = () => {
    setCsvRows([]);
    setBulkResult(null);
    setBulkOpen(true);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const text = reader.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast.error('No data rows found in CSV. Make sure the first row is the header.');
        return;
      }
      setCsvRows(rows);
      setBulkResult(null);
    };
    reader.readAsText(file);
    // Reset so the same file can be re-uploaded
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const validRows = csvRows.filter((r) => !r._error);
  const errorRows = csvRows.filter((r) => !!r._error);

  const handleBulkImport = async () => {
    if (validRows.length === 0) {
      toast.error('No valid rows to import');
      return;
    }
    setBulkImporting(true);
    try {
      const payload = validRows.map((r) => ({
        student_id: r.student_id,
        full_name: r.full_name,
        grade: r.grade || undefined,
        homeroom: r.homeroom || undefined,
        meal_program: r.meal_program || 'standard',
        parent_guardian: r.parent_guardian || undefined,
        parent_email_address: r.parent_email_address || undefined,
      }));
      const result = await studentApi.bulkImport(payload as Partial<Student>[]);
      setBulkResult(result);
      if (result.imported.length > 0) {
        toast.success(`Successfully imported ${result.imported.length} student(s)`);
        loadStudents();
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} row(s) failed to import`);
      }
    } catch (err) {
      console.error('Bulk import failed:', err);
      toast.error(err instanceof Error ? err.message : 'Bulk import failed');
    } finally {
      setBulkImporting(false);
    }
  };

  // ─── Grade Promotion Handlers ────────────────────────────────────────────

  const allGradesSelected = selectedGrades.size === GRADES.length;

  const toggleGrade = (grade: string) => {
    setSelectedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(grade)) {
        next.delete(grade);
      } else {
        next.add(grade);
      }
      return next;
    });
  };

  const toggleAllGrades = () => {
    if (allGradesSelected) {
      setSelectedGrades(new Set());
    } else {
      setSelectedGrades(new Set(GRADES));
    }
  };

  // Build the payload shared by preview & execute
  const buildPromoPayload = (gradeSel: Set<string>, gradGrade: string, gradAction: string) => {
    const payload: { graduating_grade?: string; graduating_action: string; selected_grades?: string[] } = {
      graduating_action: gradAction,
    };
    if (gradGrade && gradGrade !== 'none') payload.graduating_grade = gradGrade;
    // Only send selected_grades if not all are selected (optimization)
    if (gradeSel.size < GRADES.length) {
      payload.selected_grades = Array.from(gradeSel);
    }
    return payload;
  };

  const openPromoDialog = async () => {
    setPromoStep('config');
    setPromoPreview(null);
    setPromoResult(null);
    setGraduatingGrade('12th');
    setGraduatingAction('archive');
    const allGrades = new Set(GRADES);
    setSelectedGrades(allGrades);
    setPromoOpen(true);
    // Auto-load preview with defaults (all grades selected)
    setPromoLoading(true);
    try {
      const preview = await studentApi.promoteGrades(
        { graduating_grade: '12th', graduating_action: 'archive' },
        true
      );
      setPromoPreview(preview);
    } catch (err) {
      console.error('Failed to load preview:', err);
      toast.error('Failed to load grade promotion preview');
    } finally {
      setPromoLoading(false);
    }
  };

  const refreshPromoPreview = async (gradeSel: Set<string>, gradGrade: string, gradAction: string) => {
    if (gradeSel.size === 0) {
      setPromoPreview(null);
      return;
    }
    setPromoLoading(true);
    try {
      const payload = buildPromoPayload(gradeSel, gradGrade, gradAction);
      const preview = await studentApi.promoteGrades(payload, true);
      setPromoPreview(preview);
    } catch (err) {
      console.error('Preview failed:', err);
    } finally {
      setPromoLoading(false);
    }
  };

  // Debounce preview refresh when toggling grades
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = (gradeSel: Set<string>, gradGrade: string, gradAction: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshPromoPreview(gradeSel, gradGrade, gradAction);
    }, 400);
  };

  const handlePromoExecute = async () => {
    setPromoLoading(true);
    try {
      const payload = buildPromoPayload(selectedGrades, graduatingGrade, graduatingAction);
      const result = await studentApi.promoteGrades(payload);
      setPromoResult(result);
      setPromoStep('result');
      if (result.promoted && result.promoted > 0) {
        toast.success(`Successfully promoted ${result.promoted} student(s)`);
      }
      if (result.graduated && result.graduated > 0) {
        toast.success(`${result.graduated} student(s) marked as graduated`);
      }
      loadStudents();
    } catch (err) {
      console.error('Promotion failed:', err);
      toast.error(err instanceof Error ? err.message : 'Grade promotion failed');
    } finally {
      setPromoLoading(false);
    }
  };

  // ─── Formatting & Filtering ──────────────────────────────────────────────

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

  const filtered = students.filter((s) => {
    const matchesSearch =
      !searchQuery ||
      s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.student_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || s.account_status === statusFilter;
    const matchesGrade =
      gradeFilter === 'all' || s.grade === gradeFilter;
    return matchesSearch && matchesStatus && matchesGrade;
  });

  const totalStudents = students.length;
  const activeStudents = students.filter(
    (s) => s.account_status === 'active'
  ).length;
  const lowBalanceStudents = students.filter((s) => s.balance < 5).length;
  const totalBalance = students.reduce((sum, s) => sum + (s.balance || 0), 0);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Student Accounts
          </h1>
          <p className="text-muted-foreground">
            Manage student accounts, balances, and meal programs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openPromoDialog}>
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            Grade Promotion
          </Button>
          <Button variant="outline" onClick={openBulkDialog}>
            <Upload className="h-4 w-4 mr-2" />
            Bulk Import
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Student
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalStudents}</p>
              <p className="text-xs text-muted-foreground">Total Students</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeStudents}</p>
              <p className="text-xs text-muted-foreground">Active Accounts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{lowBalanceStudents}</p>
              <p className="text-xs text-muted-foreground">Low Balance (&lt;$5)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(totalBalance)}</p>
              <p className="text-xs text-muted-foreground">Total Balances</p>
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
                placeholder="Search by name, ID, or email..."
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
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Grades</SelectItem>
                {GRADES.map((g) => (
                  <SelectItem key={g} value={g}>
                    Grade {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Student Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No students found</p>
              {searchQuery && (
                <p className="text-xs mt-1">Try adjusting your search filters</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Parent / Guardian</TableHead>
                  <TableHead>Meal Program</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((student) => (
                  <TableRow
                    key={student.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleViewDetail(student)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {student.photo ? (
                          <img
                            src={student.photo}
                            alt={student.full_name}
                            className="h-9 w-9 rounded-full object-cover border"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">
                              {student.full_name
                                ?.split(' ')
                                .map((n) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2) || '?'}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{student.full_name}</p>
                          {student.email && (
                            <p className="text-xs text-muted-foreground">
                              {student.email}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {student.student_id}
                    </TableCell>
                    <TableCell>{student.grade || '-'}</TableCell>
                    <TableCell>
                      {(student.parents && student.parents.length > 0) ? (
                        <div className="space-y-1.5">
                          {student.parents.map((p, idx) => (
                            <div key={p.link_id || idx} className="flex items-start gap-1.5">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{p.parent_name}</p>
                                {p.parent_email && (
                                  <p className="text-xs text-muted-foreground truncate">{p.parent_email}</p>
                                )}
                              </div>
                              {p.relationship && (
                                <Badge variant="outline" className="text-xs shrink-0 capitalize">
                                  {p.relationship}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : student.parent_name ? (
                        <div>
                          <p className="text-sm font-medium">{student.parent_name}</p>
                          {student.parent_email && (
                            <p className="text-xs text-muted-foreground">{student.parent_email}</p>
                          )}
                          {student.relationship && (
                            <Badge variant="outline" className="text-xs mt-0.5 capitalize">
                              {student.relationship}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No parent linked</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {student.meal_program || 'standard'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-mono font-medium ${
                          student.balance < 5
                            ? 'text-red-600'
                            : student.balance < 10
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {formatCurrency(student.balance)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          student.account_status === 'active'
                            ? 'default'
                            : 'secondary'
                        }
                        className={
                          student.account_status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                            : student.account_status === 'suspended'
                            ? 'bg-red-100 text-red-700 hover:bg-red-100'
                            : ''
                        }
                      >
                        {student.account_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openLinkDialog(student);
                          }}
                          title="Link parent"
                        >
                          <Link2 className="h-3 w-3 mr-1" />
                          {(student.parents && student.parents.length > 0) ? 'Add Parent' : 'Link Parent'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTopUpStudent(student);
                          }}
                        >
                          <Wallet className="h-3 w-3 mr-1" />
                          Top Up
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(student);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
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

      {/* ─── Create / Edit Student Dialog ─────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStudent ? 'Edit Student' : 'Add Student'}
            </DialogTitle>
            <DialogDescription>
              {editingStudent
                ? 'Update student account details.'
                : 'Create a new student account. Fields marked * are required.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Photo */}
            <div className="flex items-center gap-4">
              <div className="relative">
                {formData.photo ? (
                  <div className="relative h-16 w-16 rounded-full overflow-hidden border-2 border-primary/20">
                    <img
                      src={formData.photo}
                      alt="Student"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30">
                    <Camera className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                  id="photo-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-3.5 w-3.5 mr-1.5" />
                  {formData.photo ? 'Change' : 'Upload Photo'}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">
                  Max 2MB
                </p>
              </div>
            </div>

            {/* Student Info Section */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Student Information</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="student_id" className="text-xs">Student ID *</Label>
                  <Input
                    id="student_id"
                    value={formData.student_id}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, student_id: e.target.value }))
                    }
                    placeholder="STU-001"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="full_name" className="text-xs">Full Name *</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, full_name: e.target.value }))
                    }
                    placeholder="John Smith"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="student@school.edu"
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="grade" className="text-xs">Grade</Label>
                  <Select
                    value={formData.grade}
                    onValueChange={(v) =>
                      setFormData((p) => ({ ...p, grade: v }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADES.map((g) => (
                        <SelectItem key={g} value={g}>
                          Grade {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="homeroom" className="text-xs">Homeroom</Label>
                  <Input
                    id="homeroom"
                    value={formData.homeroom}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, homeroom: e.target.value }))
                    }
                    placeholder="Room 101"
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* Account Section */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Account Settings</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="balance" className="text-xs">Balance ($)</Label>
                  <Input
                    id="balance"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.balance}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, balance: e.target.value }))
                    }
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meal_program" className="text-xs">Meal Program</Label>
                  <Select
                    value={formData.meal_program}
                    onValueChange={(v) =>
                      setFormData((p) => ({ ...p, meal_program: v }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEAL_PROGRAMS.map((mp) => (
                        <SelectItem key={mp.value} value={mp.value}>
                          {mp.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="account_status" className="text-xs">Status</Label>
                  <Select
                    value={formData.account_status}
                    onValueChange={(v) =>
                      setFormData((p) => ({ ...p, account_status: v }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Parent Section */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parent / Guardian</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="parent_guardian" className="text-xs">Name</Label>
                  <Input
                    id="parent_guardian"
                    value={formData.parent_guardian}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, parent_guardian: e.target.value }))
                    }
                    placeholder="Jane Smith"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="parent_email_address" className="text-xs">Email</Label>
                  <Input
                    id="parent_email_address"
                    type="email"
                    value={formData.parent_email_address}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, parent_email_address: e.target.value }))
                    }
                    placeholder="parent@example.com"
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingStudent ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Import Dialog ───────────────────────────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Bulk Import Students
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to import multiple students at once.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Step 1: Download template & upload */}
            {!bulkResult && (
              <>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-dashed">
                  <div className="flex-1">
                    <p className="text-sm font-medium">1. Download the CSV template</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Columns: Student ID, Student Name, Grade, Homeroom, Meal Program, Parent/Guardian Name, Parent Email
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Template
                  </Button>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-dashed">
                  <div className="flex-1">
                    <p className="text-sm font-medium">2. Upload your filled CSV</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {csvRows.length > 0
                        ? `${csvRows.length} row(s) loaded — ${validRows.length} valid, ${errorRows.length} with errors`
                        : 'Select a .csv file from your computer'}
                    </p>
                  </div>
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => csvInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Upload CSV
                  </Button>
                </div>

                {/* Preview table */}
                {csvRows.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8">#</TableHead>
                            <TableHead>Student ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Grade</TableHead>
                            <TableHead>Homeroom</TableHead>
                            <TableHead>Program</TableHead>
                            <TableHead>Parent</TableHead>
                            <TableHead className="w-8"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {csvRows.map((row, i) => (
                            <TableRow
                              key={i}
                              className={row._error ? 'bg-red-50' : ''}
                            >
                              <TableCell className="text-xs text-muted-foreground">
                                {i + 1}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {row.student_id || <span className="text-red-500">—</span>}
                              </TableCell>
                              <TableCell className="text-sm">
                                {row.full_name || <span className="text-red-500">—</span>}
                              </TableCell>
                              <TableCell className="text-xs">{row.grade || '-'}</TableCell>
                              <TableCell className="text-xs">{row.homeroom || '-'}</TableCell>
                              <TableCell className="text-xs capitalize">{row.meal_program}</TableCell>
                              <TableCell className="text-xs">{row.parent_guardian || '-'}</TableCell>
                              <TableCell>
                                {row._error ? (
                                  <span title={row._error}>
                                    <XCircle className="h-4 w-4 text-red-500" />
                                  </span>
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {errorRows.length > 0 && (
                      <div className="p-3 border-t bg-red-50">
                        <p className="text-xs font-medium text-red-700 mb-1">
                          Validation Errors ({errorRows.length}):
                        </p>
                        <ul className="text-xs text-red-600 space-y-0.5">
                          {errorRows.slice(0, 5).map((r, i) => (
                            <li key={i}>
                              Row {csvRows.indexOf(r) + 1}: {r._error}
                            </li>
                          ))}
                          {errorRows.length > 5 && (
                            <li>...and {errorRows.length - 5} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Results */}
            {bulkResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      <span className="font-medium text-emerald-700">
                        {bulkResult.imported.length} imported successfully
                      </span>
                    </div>
                    {bulkResult.errors.length > 0 && (
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-500" />
                        <span className="font-medium text-red-700">
                          {bulkResult.errors.length} failed
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {bulkResult.errors.length > 0 && (
                  <div className="border rounded-lg p-3 bg-red-50">
                    <p className="text-xs font-medium text-red-700 mb-2">Failed Rows:</p>
                    <ul className="text-xs text-red-600 space-y-1">
                      {bulkResult.errors.map((err, i) => (
                        <li key={i}>
                          Row {err.row}: {err.student_id} — {err.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            {bulkResult ? (
              <Button onClick={() => setBulkOpen(false)}>
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setBulkOpen(false)}
                  disabled={bulkImporting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkImport}
                  disabled={bulkImporting || validRows.length === 0}
                >
                  {bulkImporting && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Import {validRows.length} Student{validRows.length !== 1 ? 's' : ''}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Top-Up Balance Dialog ────────────────────────────────────────── */}
      <Dialog
        open={!!topUpStudent}
        onOpenChange={(open) => !open && setTopUpStudent(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Top Up Balance</DialogTitle>
            <DialogDescription>
              Add funds to {topUpStudent?.full_name}&apos;s account
              {topUpStudent && (
                <span className="block mt-1">
                  Current balance:{' '}
                  <span className="font-bold">
                    {formatCurrency(topUpStudent.balance)}
                  </span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Amount ($)</Label>
              <div className="flex gap-2">
                {[5, 10, 20, 50].map((amt) => (
                  <Button
                    key={amt}
                    variant={topUpAmount === String(amt) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTopUpAmount(String(amt))}
                    className="flex-1"
                  >
                    ${amt}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="Custom amount"
              />
            </div>
            <div className="grid gap-2">
              <Label>Payment Method</Label>
              <Select value={topUpMethod} onValueChange={setTopUpMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Input
                value={topUpNotes}
                onChange={(e) => setTopUpNotes(e.target.value)}
                placeholder="e.g. Parent deposit"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTopUpStudent(null)}
              disabled={topUpLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleTopUp} disabled={topUpLoading}>
              {topUpLoading && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Add {topUpAmount ? `$${parseFloat(topUpAmount || '0').toFixed(2)}` : 'Funds'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Link Parent Dialog ───────────────────────────────────────────── */}
      <Dialog
        open={!!linkStudent}
        onOpenChange={(open) => {
          if (!open) {
            setLinkStudent(null);
            setLinkMode('existing');
            setNewParentEmail('');
            setNewParentName('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link Parent to Student</DialogTitle>
            <DialogDescription>
              Link a parent account to{' '}
              <strong>{linkStudent?.full_name}</strong>. Choose an existing parent or create a new one.
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex gap-2 border-b pb-2">
            <Button
              variant={linkMode === 'existing' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLinkMode('existing')}
              disabled={linkLoading}
            >
              Existing Parent
            </Button>
            <Button
              variant={linkMode === 'new' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLinkMode('new')}
              disabled={linkLoading}
            >
              Create New Parent
            </Button>
          </div>

          <div className="grid gap-4 py-2">
            {linkMode === 'existing' ? (
              <div className="grid gap-2">
                <Label>Parent Account *</Label>
                {parentsLoading ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading parents…
                  </div>
                ) : parents.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    No parent accounts found. Switch to "Create New Parent" to create one.
                  </p>
                ) : (
                  <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a parent…" />
                    </SelectTrigger>
                    <SelectContent>
                      {parents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name} ({p.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Full Name *</Label>
                  <Input
                    placeholder="e.g. Jane Smith"
                    value={newParentName}
                    onChange={(e) => setNewParentName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Email Address *</Label>
                  <Input
                    type="email"
                    placeholder="parent@example.com"
                    value={newParentEmail}
                    onChange={(e) => setNewParentEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    If this email already has an account, it will be linked directly. Otherwise, a new parent account will be created and a welcome email sent.
                  </p>
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label>Relationship</Label>
              <Select value={selectedRelationship} onValueChange={setSelectedRelationship}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLinkStudent(null);
                setLinkMode('existing');
                setNewParentEmail('');
                setNewParentName('');
              }}
              disabled={linkLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleLinkParent}
              disabled={
                linkLoading ||
                (linkMode === 'existing' && !selectedParentId) ||
                (linkMode === 'new' && (!newParentEmail.trim() || !newParentName.trim()))
              }
              className="gap-2"
            >
              {linkLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Link2 className="h-4 w-4" />
              {linkMode === 'new' ? 'Create & Link' : 'Link Parent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Unlink Parent Confirmation ───────────────────────────────────── */}
      <AlertDialog
        open={!!unlinkStudent && !!unlinkParentInfo}
        onOpenChange={(open) => {
          if (!open) {
            setUnlinkStudent(null);
            setUnlinkParentInfo(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink Parent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unlink{' '}
              <strong>{unlinkParentInfo?.parent_name || unlinkStudent?.parent_name}</strong> from{' '}
              <strong>{unlinkStudent?.full_name}</strong>? The parent account
              will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlinkParent}
              disabled={unlinkLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unlinkLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Student Detail Dialog ────────────────────────────────────────── */}
      <Dialog
        open={!!detailStudent}
        onOpenChange={(open) => !open && setDetailStudent(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Student Details</DialogTitle>
          </DialogHeader>
          {detailStudent && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {detailStudent.photo ? (
                  <img
                    src={detailStudent.photo}
                    alt={detailStudent.full_name}
                    className="h-14 w-14 rounded-full object-cover border-2 border-primary/20"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">
                      {detailStudent.full_name
                        ?.split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2) || '?'}
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold">
                    {detailStudent.full_name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    ID: {detailStudent.student_id}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Grade</p>
                  <p className="font-medium">{detailStudent.grade || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Homeroom</p>
                  <p className="font-medium">
                    {detailStudent.homeroom || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Balance</p>
                  <p
                    className={`font-bold font-mono ${
                      detailStudent.balance < 5
                        ? 'text-red-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {formatCurrency(detailStudent.balance)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge
                    className={
                      detailStudent.account_status === 'active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }
                  >
                    {detailStudent.account_status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Meal Program</p>
                  <p className="font-medium capitalize">
                    {detailStudent.meal_program || 'Standard'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium truncate">
                    {detailStudent.email || 'N/A'}
                  </p>
                </div>

                {/* Parent info in detail view - supports multiple parents */}
                <div className="col-span-2">
                  <p className="text-muted-foreground">Parent / Guardian</p>
                  {detailLoading ? (
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading parents...
                    </div>
                  ) : (detailStudent.parents && detailStudent.parents.length > 0) ? (
                    <div className="space-y-2 mt-1">
                      {detailStudent.parents.map((p, idx) => (
                        <div key={p.link_id || idx} className="flex items-center justify-between border rounded-md px-3 py-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{p.parent_name}</p>
                              {p.relationship && (
                                <Badge variant="outline" className="text-xs capitalize">
                                  {p.relationship}
                                </Badge>
                              )}
                            </div>
                            {p.parent_email && (
                              <p className="text-xs text-muted-foreground">{p.parent_email}</p>
                            )}
                            {p.parent_phone && (
                              <p className="text-xs text-muted-foreground">{p.parent_phone}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => {
                              setUnlinkStudent(detailStudent);
                              setUnlinkParentInfo({ link_id: p.link_id, parent_name: p.parent_name || 'Unknown' });
                            }}
                          >
                            <Unlink className="h-3 w-3 mr-1" />
                            Unlink
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : detailStudent.parent_name ? (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="font-medium">{detailStudent.parent_name}</p>
                      {detailStudent.relationship && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {detailStudent.relationship}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm italic text-muted-foreground mt-1">
                      No parent linked
                    </p>
                  )}
                  {!detailStudent.parents?.length && detailStudent.parent_email && (
                    <p className="text-xs text-muted-foreground">
                      {detailStudent.parent_email}
                    </p>
                  )}
                </div>

                {detailStudent.dietary_restrictions && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">
                      Dietary Restrictions
                    </p>
                    <p className="font-medium">
                      {detailStudent.dietary_restrictions}
                    </p>
                  </div>
                )}
                {detailStudent.allergies && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Allergies</p>
                    <p className="font-medium text-red-600">
                      ⚠️ {detailStudent.allergies}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDetailStudent(null)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setDetailStudent(null);
                    openEditDialog(detailStudent);
                  }}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Grade Promotion Dialog ────────────────────────────────────────── */}
      <Dialog open={promoOpen} onOpenChange={setPromoOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-primary" />
              Grade Promotion
            </DialogTitle>
            <DialogDescription>
              Choose which grades to promote to the next level.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {promoStep === 'config' && (
              <>
                {/* Grade Selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Grades to Promote</Label>
                    <button
                      type="button"
                      onClick={() => {
                        toggleAllGrades();
                        const nextAll = !allGradesSelected;
                        const nextSet = nextAll ? new Set(GRADES) : new Set<string>();
                        scheduleRefresh(nextSet, graduatingGrade, graduatingAction);
                      }}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      {allGradesSelected ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {GRADES.map((grade) => {
                      const checked = selectedGrades.has(grade);
                      return (
                        <label
                          key={grade}
                          className={`flex flex-col items-center gap-1 p-2 rounded-md border cursor-pointer transition-colors ${
                            checked
                              ? 'border-primary bg-primary/5'
                              : 'border-muted hover:border-muted-foreground/30'
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => {
                              toggleGrade(grade);
                              const nextSet = new Set(selectedGrades);
                              if (nextSet.has(grade)) nextSet.delete(grade);
                              else nextSet.add(grade);
                              scheduleRefresh(nextSet, graduatingGrade, graduatingAction);
                            }}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-xs font-medium">{grade}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedGrades.size === 0
                      ? 'No grades selected'
                      : selectedGrades.size === GRADES.length
                      ? 'All grades selected'
                      : `${selectedGrades.size} of ${GRADES.length} grades selected`}
                  </p>
                </div>

                {/* Graduating Settings */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Graduating Grade</Label>
                    <Select
                      value={graduatingGrade}
                      onValueChange={(v) => {
                        setGraduatingGrade(v);
                        scheduleRefresh(selectedGrades, v, graduatingAction);
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="5th">5th (Elementary)</SelectItem>
                        <SelectItem value="8th">8th (Middle)</SelectItem>
                        <SelectItem value="12th">12th (High School)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Graduating Action</Label>
                    <Select
                      value={graduatingAction}
                      onValueChange={(v) => {
                        const action = v as 'archive' | 'keep';
                        setGraduatingAction(action);
                        scheduleRefresh(selectedGrades, graduatingGrade, action);
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="archive">Archive</SelectItem>
                        <SelectItem value="keep">Keep Active</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Preview Summary */}
                {promoLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading preview...</span>
                  </div>
                ) : selectedGrades.size === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Select at least one grade to see the preview.</p>
                ) : promoPreview ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-xl font-bold text-primary">{promoPreview.to_promote ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Promote</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-xl font-bold text-amber-600">{promoPreview.to_graduate ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Graduate</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <p className="text-xl font-bold text-muted-foreground">{promoPreview.skipped}</p>
                        <p className="text-xs text-muted-foreground">Skip</p>
                      </div>
                    </div>

                    {/* Compact list of changes */}
                    {promoPreview.promotions.length > 0 && (
                      <div className="border rounded-lg max-h-40 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Student</TableHead>
                              <TableHead className="text-xs text-center">Change</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {promoPreview.promotions.map((p) => (
                              <TableRow key={p.id}>
                                <TableCell className="text-sm py-1.5">{p.full_name}</TableCell>
                                <TableCell className="py-1.5">
                                  <div className="flex items-center justify-center gap-1">
                                    <span className="text-xs text-muted-foreground">{p.from_grade}</span>
                                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs font-semibold text-primary">{p.to_grade}</span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Warning */}
                    {((promoPreview.to_promote ?? 0) > 0 || (promoPreview.to_graduate ?? 0) > 0) && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-700">
                          This will permanently update grade levels. This cannot be easily undone.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No students with assigned grades found.</p>
                )}
              </>
            )}

            {/* Results */}
            {promoStep === 'result' && promoResult && (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-800">Promotion Complete</h4>
                      <ul className="text-sm text-emerald-700 mt-2 space-y-1">
                        <li>✅ <strong>{promoResult.promoted}</strong> promoted</li>
                        {(promoResult.graduated ?? 0) > 0 && (
                          <li>🎓 <strong>{promoResult.graduated}</strong> graduated</li>
                        )}
                        {promoResult.skipped > 0 && (
                          <li>⏭️ <strong>{promoResult.skipped}</strong> skipped</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                {promoResult.errors && promoResult.errors.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-xs font-semibold text-red-800 mb-1">Errors:</p>
                    <ul className="text-xs text-red-600 space-y-0.5">
                      {promoResult.errors.map((err, i) => (
                        <li key={i}>{err.full_name}: {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            {promoStep === 'config' && (
              <>
                <Button variant="outline" onClick={() => setPromoOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handlePromoExecute}
                  disabled={promoLoading || selectedGrades.size === 0 || !promoPreview || ((promoPreview.to_promote ?? 0) === 0 && (promoPreview.to_graduate ?? 0) === 0)}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {promoLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                  {allGradesSelected ? 'Promote All' : `Promote Selected`}
                </Button>
              </>
            )}
            {promoStep === 'result' && (
              <Button onClick={() => setPromoOpen(false)}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}