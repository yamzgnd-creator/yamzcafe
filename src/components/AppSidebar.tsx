import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  CreditCard,
  UtensilsCrossed,
  Users,
  UserPlus,
  Receipt,
  LogOut,
  Loader2,
  BarChart3,
  Package,
  Clock,
  UserCog,
  Search,
  DollarSign,
  Tag,
  Shield,
  AlertCircle,
  Bell,
  Settings,
  Wallet,
  ShieldAlert,
  Home,
  Calendar,
  CalendarDays,
  BellRing,
  FileText,
  History,
  Baby,
} from 'lucide-react';
import { useState } from 'react';
import type { BrandingSettings } from '@/lib/api';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  roles: UserRole[];
  /** Optional permission key — if set, user must have this permission (admins bypass) */
  permission?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'staff'], permission: 'dashboard.view' },
      { label: 'POS Terminal', path: '/pos', icon: CreditCard, roles: ['admin', 'staff', 'cashier'], permission: 'pos.access' },
      { label: 'Student Lookup', path: '/student-lookup', icon: Search, roles: ['admin', 'staff', 'cashier'], permission: 'studentlookup.access' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Menu Management', path: '/menu', icon: UtensilsCrossed, roles: ['admin', 'staff'], permission: 'menu.view' },
      { label: 'Meal Categories', path: '/meal-categories', icon: Tag, roles: ['admin', 'staff'], permission: 'mealcategories.view' },
      { label: 'Inventory', path: '/inventory', icon: Package, roles: ['admin', 'staff'], permission: 'inventory.view' },
      { label: 'Pre-Orders', path: '/preorders', icon: Clock, roles: ['admin', 'staff', 'cashier'], permission: 'preorders.view' },
      { label: 'Dietary Management', path: '/dietary-management', icon: ShieldAlert, roles: ['admin', 'staff'], permission: 'dietary.view' },
      { label: 'Meal Plan Management', path: '/meal-plan-management', icon: CalendarDays, roles: ['admin', 'staff'], permission: 'mealplans.view' },
      { label: 'Aftercare', path: '/aftercare', icon: Baby, roles: ['admin', 'staff'], permission: 'aftercare.view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Transactions', path: '/transactions', icon: Receipt, roles: ['admin', 'staff'], permission: 'transactions.view' },
      { label: 'Pending Transactions', path: '/pending-transactions', icon: AlertCircle, roles: ['admin', 'staff'], permission: 'pendingtx.view' },
      { label: 'Credit Management', path: '/credit-management', icon: DollarSign, roles: ['admin', 'staff'], permission: 'credits.manage' },
      { label: 'Aftercare Billing', path: '/aftercare-billing', icon: DollarSign, roles: ['admin', 'staff'], permission: 'aftercarebilling.view' },
      { label: 'Reports', path: '/reports', icon: BarChart3, roles: ['admin', 'staff'], permission: 'reports.view' },
      { label: 'Monthly Reports', path: '/monthly-reports', icon: FileText, roles: ['admin', 'staff'], permission: 'monthlyreports.view' },
      { label: 'Payment Gateways', path: '/payment-gateways', icon: Wallet, roles: ['admin'], permission: 'paymentgateways.view' },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Students', path: '/students', icon: Users, roles: ['admin', 'staff'], permission: 'students.view' },
      { label: 'User Accounts', path: '/users', icon: UserCog, roles: ['admin'], permission: 'users.view' },
      { label: 'User Permissions', path: '/user-permissions', icon: Shield, roles: ['admin'], permission: 'userpermissions.view' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Notifications', path: '/notifications', icon: Bell, roles: ['admin', 'staff'], permission: 'notifications.view' },
      { label: 'Audit History', path: '/audit-history', icon: History, roles: ['admin'], permission: 'audithistory.view' },
      { label: 'System Settings', path: '/settings', icon: Settings, roles: ['admin'], permission: 'settings.view' },
    ],
  },
  {
    label: 'Parent Portal',
    items: [
      { label: 'My Dashboard', path: '/parent/dashboard', icon: Home, roles: ['parent'] },
      { label: 'Pre-Order Meals', path: '/parent/preorders', icon: Calendar, roles: ['parent'] },
      { label: 'Dietary Info', path: '/parent/dietary', icon: ShieldAlert, roles: ['parent'] },
      { label: 'Manage Guardians', path: '/parent/guardians', icon: UserPlus, roles: ['parent'] },
      { label: 'Notifications', path: '/parent/notifications', icon: BellRing, roles: ['parent'] },
      { label: 'Aftercare', path: '/parent/aftercare', icon: Baby, roles: ['parent'] },
    ],
  },
];

const DEFAULT_LOGO_URL =
  'https://mgx-backend-cdn.metadl.com/generate/images/737931/2026-03-06/15303f11-632f-4c38-bd2a-7c93117e9c38.png';

interface AppSidebarProps {
  branding?: BrandingSettings | null;
}

export default function AppSidebar({ branding }: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const role = user?.role ?? 'cashier';

  // Parse user permissions from profile
  const userPermissions: string[] = (() => {
    const raw = profile?.permissions;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }
    return [];
  })();

  const visibleGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        // First check role-based access
        if (!item.roles.includes(role)) return false;
        // Admins bypass permission checks
        if (role === 'admin') return true;
        // If item has a permission requirement, check it
        if (item.permission && userPermissions.length > 0) {
          return userPermissions.includes(item.permission);
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      signOut();
      navigate('/');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img
            src={branding?.logo_url || DEFAULT_LOGO_URL}
            alt={branding?.company_name || 'YAMZ Cafe'}
            className="h-9 w-9 rounded-lg object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = DEFAULT_LOGO_URL;
            }}
          />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-sidebar-foreground">
              {branding?.company_name || 'YAMZ Cafe'}
            </span>
            <span className="text-xs text-sidebar-foreground/60 capitalize">
              {role} Portal
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => navigate(item.path)}
                        tooltip={item.label}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="mb-2 px-2">
          <p className="text-xs font-medium text-sidebar-foreground truncate">
            {user?.name || user?.email}
          </p>
          <p className="text-xs text-sidebar-foreground/60 truncate">
            {user?.email}
          </p>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              {loggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}