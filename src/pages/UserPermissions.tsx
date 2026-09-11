import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search, User, Shield, RotateCcw, Info, ChevronDown, ChevronRight, Lock, Unlock, Eye, AlertTriangle } from 'lucide-react';
import { userPermissionsApi, type ManagedUser } from '@/lib/api';
import { toast } from 'sonner';

const ROLE_OPTIONS = ['all', 'admin', 'staff', 'cashier', 'parent', 'student'] as const;

/** Permission modules organized to match sidebar navigation groups */
interface PermissionModule {
  module: string;
  icon: string;
  description: string;
  permissions: { key: string; label: string; description: string }[];
}

interface PermissionGroup {
  group: string;
  color: string;
  modules: PermissionModule[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: 'Main',
    color: 'bg-blue-500',
    modules: [
      {
        module: 'Dashboard',
        icon: '📊',
        description: 'Main dashboard and analytics overview',
        permissions: [
          { key: 'dashboard.view', label: 'View Dashboard', description: 'Access the main dashboard page' },
          { key: 'dashboard.analytics', label: 'View Analytics', description: 'Access detailed analytics and charts' },
        ],
      },
      {
        module: 'POS Terminal',
        icon: '🛒',
        description: 'Point of sale terminal for processing transactions',
        permissions: [
          { key: 'pos.access', label: 'Access POS', description: 'Open the POS terminal' },
          { key: 'pos.process_sale', label: 'Process Sale', description: 'Complete sale transactions' },
          { key: 'pos.void_transaction', label: 'Void Transaction', description: 'Cancel/void a completed transaction' },
          { key: 'pos.apply_discount', label: 'Apply Discount', description: 'Apply discounts to items or orders' },
        ],
      },
      {
        module: 'Student Lookup',
        icon: '🔍',
        description: 'Quick student search and balance check',
        permissions: [
          { key: 'studentlookup.access', label: 'Access Lookup', description: 'Use the student lookup feature' },
          { key: 'studentlookup.view_balance', label: 'View Balance', description: 'See student account balances' },
        ],
      },
    ],
  },
  {
    group: 'Operations',
    color: 'bg-green-500',
    modules: [
      {
        module: 'Menu Management',
        icon: '🍽️',
        description: 'Manage food items, prices, and availability',
        permissions: [
          { key: 'menu.view', label: 'View Menu', description: 'See all menu items' },
          { key: 'menu.create', label: 'Create Items', description: 'Add new menu items' },
          { key: 'menu.edit', label: 'Edit Items', description: 'Modify existing menu items' },
          { key: 'menu.delete', label: 'Delete Items', description: 'Remove menu items' },
        ],
      },
      {
        module: 'Meal Categories',
        icon: '🏷️',
        description: 'Organize menu items into categories',
        permissions: [
          { key: 'mealcategories.view', label: 'View Categories', description: 'See all meal categories' },
          { key: 'mealcategories.manage', label: 'Manage Categories', description: 'Create, edit, and delete categories' },
        ],
      },
      {
        module: 'Inventory',
        icon: '📦',
        description: 'Track stock levels and inventory',
        permissions: [
          { key: 'inventory.view', label: 'View Inventory', description: 'See stock levels' },
          { key: 'inventory.manage', label: 'Manage Inventory', description: 'Update stock quantities and items' },
        ],
      },
      {
        module: 'Pre-Orders',
        icon: '⏰',
        description: 'Handle advance meal orders from parents/students',
        permissions: [
          { key: 'preorders.view', label: 'View Orders', description: 'See all pre-orders' },
          { key: 'preorders.fulfill', label: 'Fulfill Orders', description: 'Mark orders as fulfilled' },
          { key: 'preorders.cancel', label: 'Cancel Orders', description: 'Cancel pending pre-orders' },
          { key: 'preorders.export', label: 'Export Orders', description: 'Download pre-order data' },
        ],
      },
      {
        module: 'Dietary Management',
        icon: '🥗',
        description: 'Manage dietary restrictions and allergens',
        permissions: [
          { key: 'dietary.view', label: 'View Dietary Info', description: 'See dietary profiles' },
          { key: 'dietary.manage', label: 'Manage Dietary', description: 'Update dietary restrictions and allergens' },
        ],
      },
      {
        module: 'Meal Plan Management',
        icon: '📅',
        description: 'Create and manage meal plans and schedules',
        permissions: [
          { key: 'mealplans.view', label: 'View Plans', description: 'See meal plans' },
          { key: 'mealplans.manage', label: 'Manage Plans', description: 'Create and edit meal plans' },
        ],
      },
      {
        module: 'Aftercare',
        icon: '👶',
        description: 'After-school care check-in/out and programme management',
        permissions: [
          { key: 'aftercare.view', label: 'View Aftercare', description: 'Access the aftercare dashboard and history' },
          { key: 'aftercare.checkin', label: 'Check In Students', description: 'Check students into aftercare' },
          { key: 'aftercare.checkout', label: 'Check Out Students', description: 'Check students out of aftercare' },
          { key: 'aftercare.manage_programmes', label: 'Manage Programmes', description: 'Add, edit, and delete after-school programmes' },
        ],
      },
    ],
  },
  {
    group: 'Finance',
    color: 'bg-amber-500',
    modules: [
      {
        module: 'Transactions',
        icon: '🧾',
        description: 'View and manage financial transactions',
        permissions: [
          { key: 'transactions.view', label: 'View Transactions', description: 'See transaction history' },
          { key: 'transactions.create', label: 'Create Transactions', description: 'Record new transactions' },
          { key: 'transactions.refund', label: 'Process Refunds', description: 'Issue refunds for transactions' },
        ],
      },
      {
        module: 'Pending Transactions',
        icon: '⏳',
        description: 'Review and approve pending transactions',
        permissions: [
          { key: 'pendingtx.view', label: 'View Pending', description: 'See pending transactions' },
          { key: 'pendingtx.approve', label: 'Approve', description: 'Approve pending transactions' },
          { key: 'pendingtx.reject', label: 'Reject', description: 'Reject pending transactions' },
        ],
      },
      {
        module: 'Credit Management',
        icon: '💳',
        description: 'Manage student account credits and balances',
        permissions: [
          { key: 'credits.manage', label: 'Manage Credits', description: 'Access credit management' },
          { key: 'credits.add', label: 'Add Credits', description: 'Add funds to student accounts' },
          { key: 'credits.deduct', label: 'Deduct Credits', description: 'Remove funds from student accounts' },
        ],
      },
      {
        module: 'Aftercare Billing',
        icon: '💰',
        description: 'Manage aftercare invoices, rates, and billing settings',
        permissions: [
          { key: 'aftercarebilling.view', label: 'View Billing', description: 'See aftercare invoices and billing info' },
          { key: 'aftercarebilling.manage', label: 'Manage Billing', description: 'Adjust rates, generate invoices, mark as paid' },
          { key: 'aftercarebilling.export', label: 'Export Billing', description: 'Download billing data and reports' },
        ],
      },
      {
        module: 'Reports',
        icon: '📈',
        description: 'Financial and operational reports',
        permissions: [
          { key: 'reports.view', label: 'View Reports', description: 'Access report pages' },
          { key: 'reports.export', label: 'Export Reports', description: 'Download report data' },
        ],
      },
      {
        module: 'Monthly Reports',
        icon: '📋',
        description: 'Monthly summary and breakdown reports',
        permissions: [
          { key: 'monthlyreports.view', label: 'View Monthly', description: 'See monthly report summaries' },
          { key: 'monthlyreports.export', label: 'Export Monthly', description: 'Download monthly report data' },
        ],
      },
      {
        module: 'Payment Gateways',
        icon: '🏦',
        description: 'Configure payment processing integrations',
        permissions: [
          { key: 'paymentgateways.view', label: 'View Gateways', description: 'See payment gateway settings' },
          { key: 'paymentgateways.manage', label: 'Manage Gateways', description: 'Configure payment processors' },
        ],
      },
    ],
  },
  {
    group: 'People',
    color: 'bg-purple-500',
    modules: [
      {
        module: 'Student Management',
        icon: '🎓',
        description: 'Manage student profiles, grades, and enrollment',
        permissions: [
          { key: 'students.view', label: 'View Students', description: 'See student list and profiles' },
          { key: 'students.create', label: 'Add Students', description: 'Create new student records' },
          { key: 'students.edit', label: 'Edit Students', description: 'Modify student information' },
          { key: 'students.delete', label: 'Delete Students', description: 'Remove student records' },
        ],
      },
      {
        module: 'User Accounts',
        icon: '👤',
        description: 'Manage staff, parent, and admin accounts',
        permissions: [
          { key: 'users.view', label: 'View Users', description: 'See all user accounts' },
          { key: 'users.create', label: 'Create Users', description: 'Add new user accounts' },
          { key: 'users.edit', label: 'Edit Users', description: 'Modify user account details' },
          { key: 'users.delete', label: 'Delete Users', description: 'Remove user accounts' },
        ],
      },
      {
        module: 'User Permissions',
        icon: '🔐',
        description: 'Configure what each user can access',
        permissions: [
          { key: 'userpermissions.view', label: 'View Permissions', description: 'See permission settings' },
          { key: 'userpermissions.manage', label: 'Manage Permissions', description: 'Change user permissions' },
        ],
      },
    ],
  },
  {
    group: 'System',
    color: 'bg-gray-500',
    modules: [
      {
        module: 'Notifications',
        icon: '🔔',
        description: 'System notifications and alerts',
        permissions: [
          { key: 'notifications.view', label: 'View Notifications', description: 'See system notifications' },
          { key: 'notifications.manage', label: 'Manage Notifications', description: 'Configure notification settings' },
        ],
      },
      {
        module: 'Audit History',
        icon: '📜',
        description: 'View system activity and change logs',
        permissions: [
          { key: 'audithistory.view', label: 'View Audit Log', description: 'See all system activity history' },
        ],
      },
      {
        module: 'System Settings',
        icon: '⚙️',
        description: 'Global system configuration and branding',
        permissions: [
          { key: 'settings.view', label: 'View Settings', description: 'See system settings' },
          { key: 'settings.manage', label: 'Manage Settings', description: 'Change system configuration' },
        ],
      },
    ],
  },
];

/** Flat list of all permission keys for computing defaults */
const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.modules.flatMap((m) => m.permissions.map((p) => p.key)));

/** Safely convert permissions to a string array regardless of source type */
function toPermArray(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // might be comma-separated
      return val.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin: ALL_PERMISSIONS,
  staff: [
    // Main
    'dashboard.view', 'dashboard.analytics',
    'pos.access', 'pos.process_sale', 'pos.void_transaction', 'pos.apply_discount',
    'studentlookup.access', 'studentlookup.view_balance',
    // Operations
    'menu.view', 'menu.create', 'menu.edit', 'menu.delete',
    'mealcategories.view', 'mealcategories.manage',
    'inventory.view', 'inventory.manage',
    'preorders.view', 'preorders.fulfill', 'preorders.cancel', 'preorders.export',
    'dietary.view', 'dietary.manage',
    'mealplans.view', 'mealplans.manage',
    'aftercare.view', 'aftercare.checkin', 'aftercare.checkout',
    // Finance
    'transactions.view', 'transactions.create', 'transactions.refund',
    'pendingtx.view', 'pendingtx.approve', 'pendingtx.reject',
    'credits.manage', 'credits.add', 'credits.deduct',
    'reports.view', 'reports.export',
    'monthlyreports.view', 'monthlyreports.export',
    // People
    'students.view', 'students.create', 'students.edit',
    // System
    'notifications.view', 'notifications.manage',
  ],
  cashier: [
    // Main
    'pos.access', 'pos.process_sale',
    'studentlookup.access', 'studentlookup.view_balance',
    // Operations
    'preorders.view', 'preorders.fulfill',
    // Finance
    'transactions.view', 'transactions.create',
  ],
  parent: [
    'dashboard.view',
    'students.view',
    'transactions.view',
  ],
  student: [
    'dashboard.view',
  ],
};

/** Quick-apply presets for common permission configurations */
const QUICK_PRESETS: { label: string; description: string; icon: string; permissions: string[] }[] = [
  {
    label: 'View Only',
    description: 'Can view all pages but cannot make changes',
    icon: '👁️',
    permissions: ALL_PERMISSIONS.filter((p) => p.includes('.view') || p.includes('.access')),
  },
  {
    label: 'Full Aftercare',
    description: 'Complete aftercare access including billing',
    icon: '👶',
    permissions: [
      'aftercare.view', 'aftercare.checkin', 'aftercare.checkout', 'aftercare.manage_programmes',
      'aftercarebilling.view', 'aftercarebilling.manage', 'aftercarebilling.export',
    ],
  },
  {
    label: 'Finance Team',
    description: 'All financial permissions without operations',
    icon: '💰',
    permissions: [
      'dashboard.view', 'dashboard.analytics',
      'transactions.view', 'transactions.create', 'transactions.refund',
      'pendingtx.view', 'pendingtx.approve', 'pendingtx.reject',
      'credits.manage', 'credits.add', 'credits.deduct',
      'aftercarebilling.view', 'aftercarebilling.manage', 'aftercarebilling.export',
      'reports.view', 'reports.export',
      'monthlyreports.view', 'monthlyreports.export',
      'paymentgateways.view', 'paymentgateways.manage',
    ],
  },
  {
    label: 'Operations Only',
    description: 'Menu, inventory, and daily operations',
    icon: '🍽️',
    permissions: [
      'dashboard.view',
      'pos.access', 'pos.process_sale',
      'studentlookup.access', 'studentlookup.view_balance',
      'menu.view', 'menu.create', 'menu.edit', 'menu.delete',
      'mealcategories.view', 'mealcategories.manage',
      'inventory.view', 'inventory.manage',
      'preorders.view', 'preorders.fulfill', 'preorders.cancel', 'preorders.export',
      'dietary.view', 'dietary.manage',
      'mealplans.view', 'mealplans.manage',
    ],
  },
];

export default function UserPermissions() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [permSearchTerm, setPermSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [editedPermissions, setEditedPermissions] = useState<string[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showPresets, setShowPresets] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [roleFilter]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await userPermissionsApi.getAll(roleFilter);
      setUsers(data);
      if (data.length > 0 && !selectedUser) {
        selectUser(data[0]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const selectUser = (user: ManagedUser) => {
    setSelectedUser(user);
    setEditedPermissions(toPermArray(user.permissions));
  };

  const filteredUsers = users.filter(
    (u) =>
      !searchTerm ||
      u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const togglePermission = (perm: string) => {
    setEditedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  /** Toggle all permissions in a module */
  const toggleModule = (permissions: string[]) => {
    const allChecked = permissions.every((p) => editedPermissions.includes(p));
    if (allChecked) {
      setEditedPermissions((prev) => prev.filter((p) => !permissions.includes(p)));
    } else {
      setEditedPermissions((prev) => [...new Set([...prev, ...permissions])]);
    }
  };

  /** Toggle all permissions in a group */
  const toggleGroup = (group: PermissionGroup) => {
    const allPerms = group.modules.flatMap((m) => m.permissions.map((p) => p.key));
    const allChecked = allPerms.every((p) => editedPermissions.includes(p));
    if (allChecked) {
      setEditedPermissions((prev) => prev.filter((p) => !allPerms.includes(p)));
    } else {
      setEditedPermissions((prev) => [...new Set([...prev, ...allPerms])]);
    }
  };

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const applyPreset = (preset: typeof QUICK_PRESETS[number]) => {
    setEditedPermissions((prev) => [...new Set([...prev, ...preset.permissions])]);
    toast.success(`Applied "${preset.label}" preset (not saved yet)`);
    setShowPresets(false);
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await userPermissionsApi.updatePermissions(selectedUser.id, editedPermissions);
      setSelectedUser({ ...selectedUser, permissions: editedPermissions });
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, permissions: editedPermissions } : u))
      );
      toast.success('Permissions updated successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (!selectedUser) return;
    const defaults = DEFAULT_PERMISSIONS[selectedUser.role] || [];
    setEditedPermissions(defaults);
    toast.info('Permissions reset to defaults (not saved yet)');
  };

  const handleClearAll = () => {
    setEditedPermissions([]);
    toast.info('All permissions cleared (not saved yet)');
  };

  const handleGrantAll = () => {
    setEditedPermissions([...ALL_PERMISSIONS]);
    toast.info('All permissions granted (not saved yet)');
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Admin',
      staff: 'Staff',
      cashier: 'Cashier',
      parent: 'Parent',
      student: 'Student',
    };
    return labels[role] || role;
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: 'bg-red-100 text-red-800 border-red-200',
      staff: 'bg-blue-100 text-blue-800 border-blue-200',
      cashier: 'bg-green-100 text-green-800 border-green-200',
      parent: 'bg-purple-100 text-purple-800 border-purple-200',
      student: 'bg-orange-100 text-orange-800 border-orange-200',
    };
    return colors[role] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const hasChanges =
    selectedUser &&
    JSON.stringify([...toPermArray(selectedUser.permissions)].sort()) !==
      JSON.stringify([...editedPermissions].sort());

  /** Count how many permissions in a group are enabled */
  const groupPermCount = (group: PermissionGroup) => {
    const allPerms = group.modules.flatMap((m) => m.permissions.map((p) => p.key));
    const enabled = allPerms.filter((p) => editedPermissions.includes(p)).length;
    return { enabled, total: allPerms.length };
  };

  /** Count how many permissions in a module are enabled */
  const modulePermCount = (mod: PermissionModule) => {
    const enabled = mod.permissions.filter((p) => editedPermissions.includes(p.key)).length;
    return { enabled, total: mod.permissions.length };
  };

  /** Filter modules/permissions based on search term */
  const filterModules = (modules: PermissionModule[]) => {
    if (!permSearchTerm) return modules;
    const term = permSearchTerm.toLowerCase();
    return modules
      .map((mod) => ({
        ...mod,
        permissions: mod.permissions.filter(
          (p) =>
            p.label.toLowerCase().includes(term) ||
            p.description.toLowerCase().includes(term) ||
            p.key.toLowerCase().includes(term) ||
            mod.module.toLowerCase().includes(term)
        ),
      }))
      .filter((mod) => mod.permissions.length > 0 || mod.module.toLowerCase().includes(term));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Permission Management</h1>
        <p className="text-muted-foreground mt-1">
          Control what each user can see and do in the system
        </p>
      </div>

      {/* Role Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 flex-wrap">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Filter by Role:</span>
            {ROLE_OPTIONS.map((role) => (
              <Button
                key={role}
                variant={roleFilter === role ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRoleFilter(role)}
                className="capitalize"
              >
                {role === 'all' ? 'All Users' : getRoleLabel(role)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Users ({filteredUsers.length})</span>
              </CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No users found</p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-all ${
                      selectedUser?.id === user.id
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/50 hover:bg-muted/30'
                    }`}
                    onClick={() => selectUser(user)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{user.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <Badge className={`text-xs capitalize border ${getRoleColor(user.role)}`}>
                        {user.role}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Permission Configuration */}
          <div className="lg:col-span-2 space-y-4">
            {selectedUser ? (
              <>
                {/* Selected User Header */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-primary/10 rounded-lg">
                          <User className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-xl font-semibold">{selectedUser.full_name}</h2>
                          <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className={`capitalize border ${getRoleColor(selectedUser.role)}`}>
                              {getRoleLabel(selectedUser.role)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {editedPermissions.length} of {ALL_PERMISSIONS.length} permissions enabled
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedUser.role !== 'admin' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowPresets(!showPresets)}
                            >
                              ⚡ Quick Presets
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleResetToDefault}
                              disabled={saving}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Reset Default
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Unsaved Changes Banner */}
                {hasChanges && (
                  <Card className="border-amber-300 bg-amber-50">
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <span className="text-sm font-medium text-amber-800">
                            You have unsaved changes
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => selectUser(selectedUser)}
                          >
                            Discard
                          </Button>
                          <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Quick Presets Panel */}
                {showPresets && selectedUser.role !== 'admin' && (
                  <Card className="border-primary/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        ⚡ Quick Permission Presets
                        <span className="text-xs font-normal text-muted-foreground">
                          — Click to add these permissions (won't remove existing ones)
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {QUICK_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            className="p-3 border rounded-lg text-left hover:bg-primary/5 hover:border-primary/30 transition-all"
                            onClick={() => applyPreset(preset)}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span>{preset.icon}</span>
                              <span className="font-medium text-sm">{preset.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{preset.description}</p>
                            <p className="text-xs text-primary mt-1">
                              {preset.permissions.length} permissions
                            </p>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Admin Notice */}
                {selectedUser.role === 'admin' && (
                  <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-blue-900">Admin — Full Access</h4>
                          <p className="text-sm text-blue-700 mt-1">
                            Admin users automatically have unrestricted access to all system features.
                            Their permissions cannot be limited.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Permission Matrix — organized by sidebar groups */}
                {selectedUser.role !== 'admin' && (
                  <div className="space-y-4">
                    {/* Permission Search + Bulk Actions */}
                    <Card>
                      <CardContent className="py-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search permissions..."
                              value={permSearchTerm}
                              onChange={(e) => setPermSearchTerm(e.target.value)}
                              className="pl-10 h-9"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleGrantAll}>
                              <Unlock className="h-3.5 w-3.5 mr-1" />
                              Grant All
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleClearAll}>
                              <Lock className="h-3.5 w-3.5 mr-1" />
                              Revoke All
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {PERMISSION_GROUPS.map((group) => {
                      const filteredModules = filterModules(group.modules);
                      if (filteredModules.length === 0) return null;

                      const { enabled, total } = groupPermCount(group);
                      const isCollapsed = collapsedGroups.has(group.group);
                      const allGroupChecked = enabled === total;
                      const someGroupChecked = enabled > 0 && enabled < total;

                      return (
                        <Card key={group.group}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div
                                className="flex items-center gap-3 cursor-pointer flex-1"
                                onClick={() => toggleGroupCollapse(group.group)}
                              >
                                {isCollapsed ? (
                                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                )}
                                <div className={`w-3 h-3 rounded-full ${group.color}`} />
                                <CardTitle className="text-base">{group.group}</CardTitle>
                                <Badge
                                  variant={enabled === total ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  {enabled}/{total}
                                </Badge>
                                {enabled === total && (
                                  <Eye className="h-4 w-4 text-green-600" />
                                )}
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <span className="text-xs text-muted-foreground">All</span>
                                <Checkbox
                                  checked={allGroupChecked}
                                  className={someGroupChecked ? 'data-[state=unchecked]:bg-primary/30' : ''}
                                  onCheckedChange={() => toggleGroup(group)}
                                />
                              </label>
                            </div>
                          </CardHeader>
                          {!isCollapsed && (
                            <CardContent className="pt-0 space-y-4">
                              {filteredModules.map((mod) => {
                                const permKeys = mod.permissions.map((p) => p.key);
                                const mc = modulePermCount(mod);
                                const allModChecked = mc.enabled === mc.total;
                                const someModChecked = mc.enabled > 0 && mc.enabled < mc.total;

                                return (
                                  <div key={mod.module} className="border rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-lg">{mod.icon}</span>
                                        <h4 className="font-semibold text-sm">{mod.module}</h4>
                                        <Badge
                                          variant={mc.enabled === mc.total ? 'default' : 'outline'}
                                          className="text-xs"
                                        >
                                          {mc.enabled}/{mc.total}
                                        </Badge>
                                      </div>
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <span className="text-xs text-muted-foreground">All</span>
                                        <Checkbox
                                          checked={allModChecked}
                                          className={someModChecked ? 'data-[state=unchecked]:bg-primary/30' : ''}
                                          onCheckedChange={() => toggleModule(permKeys)}
                                        />
                                      </label>
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-3">{mod.description}</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                      {mod.permissions.map((perm) => (
                                        <label
                                          key={perm.key}
                                          className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer group"
                                        >
                                          <Checkbox
                                            checked={editedPermissions.includes(perm.key)}
                                            onCheckedChange={() => togglePermission(perm.key)}
                                            className="mt-0.5"
                                          />
                                          <div className="flex-1 min-w-0">
                                            <span className="text-sm font-medium">{perm.label}</span>
                                            <p className="text-xs text-muted-foreground leading-tight">
                                              {perm.description}
                                            </p>
                                          </div>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Sticky Save Bar */}
                {hasChanges && (
                  <div className="sticky bottom-4 z-10">
                    <Card className="border-primary shadow-lg">
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            💾 Don't forget to save your changes!
                          </span>
                          <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                            Save Permissions
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No User Selected</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a user from the list to configure their permissions
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}