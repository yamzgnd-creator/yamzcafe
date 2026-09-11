import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  usersApi,
  authApi,
  parentStudentApi,
  type ManagedUser,
  type CreateUserPayload,
  type UpdateUserPayload,
  type Student,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  UserPlus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  Users,
  ShieldCheck,
  UserCog,
  Phone,
  GraduationCap,
  KeyRound,
  LockOpen,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';

const ROLE_OPTIONS = ['admin', 'staff', 'cashier', 'parent'] as const;
type Role = (typeof ROLE_OPTIONS)[number];

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  staff: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  cashier:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  parent:
    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

const EMPTY_FORM: CreateUserPayload = {
  full_name: '',
  email: '',
  password: '',
  role: 'staff',
  phone_number: '',
};

/* ────────────────────────────────────────────────────────────────────────── */

export default function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Add / Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<CreateUserPayload>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Linked students dialog (for parent users)
  const [linkedStudentsUser, setLinkedStudentsUser] = useState<ManagedUser | null>(null);
  const [linkedStudents, setLinkedStudents] = useState<Student[]>([]);
  const [linkedStudentsLoading, setLinkedStudentsLoading] = useState(false);

  // Reset password dialog
  const [resetPwUser, setResetPwUser] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resettingPw, setResettingPw] = useState(false);

  // Unlock account
  const [unlockTarget, setUnlockTarget] = useState<ManagedUser | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  /* ── Fetch users ─────────────────────────────────────────────────────── */

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await usersApi.getAll();
      setUsers(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load users';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /* ── Filtering ───────────────────────────────────────────────────────── */

  const filtered = useMemo(() => {
    let list = users.filter((u) => u.role !== 'student');
    if (roleFilter !== 'all') {
      list = list.filter((u) => u.role === roleFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.full_name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.phone_number?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, roleFilter, search]);

  /* ── Stats ───────────────────────────────────────────────────────────── */

  const stats = useMemo(() => {
    const nonStudents = users.filter((u) => u.role !== 'student');
    return {
      total: nonStudents.length,
      admin: nonStudents.filter((u) => u.role === 'admin').length,
      staff: nonStudents.filter((u) => u.role === 'staff').length,
      cashier: nonStudents.filter((u) => u.role === 'cashier').length,
      parent: nonStudents.filter((u) => u.role === 'parent').length,
    };
  }, [users]);

  /* ── Open dialogs ────────────────────────────────────────────────────── */

  const openAddDialog = () => {
    setEditingUser(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEditDialog = (user: ManagedUser) => {
    setEditingUser(user);
    setForm({
      full_name: user.full_name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'staff',
      phone_number: user.phone_number || '',
    });
    setDialogOpen(true);
  };

  const openLinkedStudentsDialog = async (user: ManagedUser) => {
    setLinkedStudentsUser(user);
    setLinkedStudentsLoading(true);
    try {
      const students = await parentStudentApi.getStudentsByParent(user.id);
      setLinkedStudents(Array.isArray(students) ? students : []);
    } catch (err) {
      console.error('Failed to load linked students:', err);
      setLinkedStudents([]);
    } finally {
      setLinkedStudentsLoading(false);
    }
  };

  /* ── Save (create / update) ──────────────────────────────────────────── */

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (!editingUser && !form.password.trim()) {
      toast.error('Password is required for new users');
      return;
    }

    try {
      setSaving(true);
      if (editingUser) {
        const payload: UpdateUserPayload = {
          full_name: form.full_name,
          email: form.email,
          role: form.role,
          phone_number: form.phone_number,
        };
        await usersApi.update(editingUser.id, payload);
        toast.success('User updated successfully');
      } else {
        await usersApi.create(form);
        toast.success('User created successfully');
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to save user';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete ──────────────────────────────────────────────────────────── */

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await usersApi.delete(deleteTarget.id);
      toast.success(`${deleteTarget.full_name} deleted`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete user';
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  /* ── Reset Password ──────────────────────────────────────────────────── */

  const openResetPwDialog = (user: ManagedUser) => {
    setResetPwUser(user);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleResetPassword = async () => {
    if (!resetPwUser) return;

    if (!newPassword.trim()) {
      toast.error('Please enter a new password');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      setResettingPw(true);
      await authApi.resetUserPassword(resetPwUser.id, newPassword);
      toast.success(`Password reset for ${resetPwUser.full_name}`);
      setResetPwUser(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to reset password';
      toast.error(message);
    } finally {
      setResettingPw(false);
    }
  };

  /* ── Unlock Account ─────────────────────────────────────────────────── */

  const handleUnlock = async () => {
    if (!unlockTarget) return;
    try {
      setUnlocking(true);
      await usersApi.unlock(unlockTarget.id);
      toast.success(`Account unlocked for ${unlockTarget.full_name}`);
      setUnlockTarget(null);
      fetchUsers();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to unlock account';
      toast.error(message);
    } finally {
      setUnlocking(false);
    }
  };

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            User Accounts
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage system users, roles, and permissions
          </p>
        </div>
        <Button onClick={openAddDialog} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
        {(['admin', 'staff', 'cashier', 'parent'] as const).map((r) => (
          <Card key={r}>
            <CardHeader className="pb-2">
              <CardDescription className="capitalize">{r}s</CardDescription>
              <CardTitle className="text-2xl">{stats[r]}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {r === 'admin' ? (
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              ) : r === 'parent' ? (
                <Phone className="h-4 w-4 text-muted-foreground" />
              ) : (
                <UserCog className="h-4 w-4 text-muted-foreground" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">
                Loading users…
              </span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="mb-2 h-10 w-10" />
              <p>No users found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  <TableHead className="hidden md:table-cell">Status</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Created
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.full_name || '—'}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={ROLE_COLORS[user.role] ?? ''}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {user.phone_number || '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {user.is_locked ? (
                        <Badge
                          variant="destructive"
                          className="gap-1"
                        >
                          <Lock className="h-3 w-3" />
                          Locked
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        >
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {user.is_locked && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1 border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                            onClick={() => setUnlockTarget(user)}
                            title="Unlock Account"
                          >
                            <LockOpen className="h-3 w-3" />
                            Unlock
                          </Button>
                        )}
                        {user.role === 'parent' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1"
                            onClick={() => openLinkedStudentsDialog(user)}
                            title="View linked students"
                          >
                            <GraduationCap className="h-3 w-3" />
                            Students
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openResetPwDialog(user)}
                          title="Reset Password"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(user)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(user)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* ── Add / Edit Dialog ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Edit User' : 'Add New User'}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Update user details below.'
                : 'Fill in the details to create a new user account.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, full_name: e.target.value }))
                }
                placeholder="John Doe"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="john@example.com"
              />
            </div>

            {!editingUser && (
              <div className="grid gap-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder="Minimum 6 characters"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, role: v as Role }))
                }
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={form.phone_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone_number: e.target.value }))
                }
                placeholder="(555) 123-4567"
              />
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
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingUser ? 'Save Changes' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ──────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>{deleteTarget?.full_name}</strong>? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reset Password Dialog ────────────────────────────────────────── */}
      <Dialog
        open={!!resetPwUser}
        onOpenChange={(open) => {
          if (!open) {
            setResetPwUser(null);
            setNewPassword('');
            setConfirmPassword('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              Set a new password for{' '}
              <strong>{resetPwUser?.full_name}</strong> ({resetPwUser?.email})
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new_password">New Password *</Label>
              <Input
                id="new_password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm_password">Confirm Password *</Label>
              <Input
                id="confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter the new password"
                autoComplete="new-password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetPwUser(null);
                setNewPassword('');
                setConfirmPassword('');
              }}
              disabled={resettingPw}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={resettingPw || !newPassword || newPassword !== confirmPassword}
              className="gap-2"
            >
              {resettingPw && <Loader2 className="h-4 w-4 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Unlock Account Confirmation ──────────────────────────────────── */}
      <AlertDialog
        open={!!unlockTarget}
        onOpenChange={(open) => {
          if (!open) setUnlockTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LockOpen className="h-5 w-5 text-amber-500" />
              Unlock Account
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unlock the account for{' '}
              <strong>{unlockTarget?.full_name}</strong> ({unlockTarget?.email})?
              This will reset all failed login attempts and allow the user to log
              in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlock}
              disabled={unlocking}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {unlocking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LockOpen className="mr-2 h-4 w-4" />
              )}
              Unlock Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Linked Students Dialog (for parent users) ────────────────────── */}
      <Dialog
        open={!!linkedStudentsUser}
        onOpenChange={(open) => {
          if (!open) {
            setLinkedStudentsUser(null);
            setLinkedStudents([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Linked Students</DialogTitle>
            <DialogDescription>
              Students linked to{' '}
              <strong>{linkedStudentsUser?.full_name}</strong> (
              {linkedStudentsUser?.email})
            </DialogDescription>
          </DialogHeader>

          {linkedStudentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading linked students…
              </span>
            </div>
          ) : linkedStudents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No students linked to this parent.</p>
              <p className="text-xs mt-1">
                Go to Student Accounts to link a student.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {linkedStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {student.full_name
                        ?.split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2) || '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{student.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      ID: {student.student_id}
                      {student.grade ? ` · Grade ${student.grade}` : ''}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      student.account_status === 'active'
                        ? 'bg-emerald-100 text-emerald-700'
                        : ''
                    }
                  >
                    {student.account_status}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLinkedStudentsUser(null);
                setLinkedStudents([]);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}