import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DollarSign, Users, UserPlus, UtensilsCrossed, ShieldAlert,
  TrendingUp, Calendar, Receipt, Loader2, AlertTriangle, ChefHat,
  Clock, CalendarDays, Utensils, ArrowRight, Plus, X,
} from 'lucide-react';
import { parentApi, preOrderApi, type ParentChild, type Transaction, type PreOrder } from '@/lib/api';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function ParentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChild, setSelectedChild] = useState<ParentChild | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [preOrders, setPreOrders] = useState<PreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadChildren();
  }, []);

  useEffect(() => {
    if (selectedChild) {
      loadTransactions(selectedChild.id);
      loadPreOrders(selectedChild.id);
    }
  }, [selectedChild]);

  const loadChildren = async () => {
    try {
      setLoading(true);
      const data = await parentApi.getChildren();
      const list = Array.isArray(data) ? data : [];
      setChildren(list);
      if (list.length > 0) setSelectedChild(list[0]);
    } catch (err) {
      console.error('Failed to load children:', err);
      setChildren([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async (studentId: string) => {
    try {
      setTxLoading(true);
      const data = await parentApi.getChildTransactions(studentId);
      setTransactions(Array.isArray(data) ? data.slice(0, 15) : []);
    } catch {
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  };

  const loadPreOrders = async (studentId: string) => {
    try {
      const data = await preOrderApi.getByStudent(studentId);
      setPreOrders(Array.isArray(data) ? data : []);
    } catch {
      setPreOrders([]);
    }
  };

  const handleCancelPreOrder = async (orderId: string) => {
    try {
      setCancellingId(orderId);
      await preOrderApi.cancel(orderId);
      if (selectedChild) await loadPreOrders(selectedChild.id);
    } catch (err) {
      console.error('Failed to cancel pre-order:', err);
    } finally {
      setCancellingId(null);
      setShowCancelConfirm(null);
    }
  };

  // Pre-order status color mapping
  const getPreOrderStatusStyle = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          badge: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100',
          card: 'border-l-4 border-l-amber-400 bg-amber-50/50',
          icon: 'text-amber-600',
          dot: 'bg-amber-400',
        };
      case 'confirmed':
        return {
          badge: 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100',
          card: 'border-l-4 border-l-emerald-400 bg-emerald-50/50',
          icon: 'text-emerald-600',
          dot: 'bg-emerald-400',
        };
      case 'fulfilled':
        return {
          badge: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100',
          card: 'border-l-4 border-l-blue-400 bg-blue-50/50',
          icon: 'text-blue-600',
          dot: 'bg-blue-400',
        };
      case 'cancelled':
        return {
          badge: 'bg-red-100 text-red-800 border-red-300 hover:bg-red-100',
          card: 'border-l-4 border-l-red-300 bg-red-50/30',
          icon: 'text-red-400',
          dot: 'bg-red-400',
        };
      default:
        return {
          badge: 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-100',
          card: 'border-l-4 border-l-gray-300 bg-gray-50/50',
          icon: 'text-gray-500',
          dot: 'bg-gray-400',
        };
    }
  };

  // Filter upcoming/active pre-orders (not cancelled, future or today)
  const upcomingPreOrders = preOrders.filter((o) => {
    if (o.status === 'cancelled') return false;
    try {
      const orderDate = parseISO(o.order_date);
      return isAfter(orderDate, startOfDay(new Date())) || 
             format(orderDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
    } catch {
      return true; // Show if date parsing fails
    }
  });

  // Recent past pre-orders (last 5, including cancelled)
  const recentPastOrders = preOrders
    .filter((o) => {
      try {
        const orderDate = parseISO(o.order_date);
        return !isAfter(orderDate, startOfDay(new Date())) &&
               format(orderDate, 'yyyy-MM-dd') !== format(new Date(), 'yyyy-MM-dd');
      } catch {
        return false;
      }
    })
    .slice(0, 5);

  const totalBalance = children.reduce((s, c) => s + (c.balance ?? 0), 0);
  const totalSpent = transactions.reduce((s, t) => {
    if (t.type === 'purchase' && t.status === 'completed') return s + t.amount;
    return s;
  }, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Parent Portal</h1>
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-20 mb-2" /><Skeleton className="h-3 w-32" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome, {user?.name?.split(' ')[0] || 'Parent'}
          </h1>
          <p className="text-muted-foreground">
            Manage your children's cafeteria accounts
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/parent/preorders')}>
            <Calendar className="h-4 w-4 mr-1" /> Pre-Order Meals
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/parent/dietary')}>
            <ShieldAlert className="h-4 w-4 mr-1" /> Dietary Info
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/parent/guardians')}>
            <UserPlus className="h-4 w-4 mr-1" /> Manage Guardians
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Children</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{children.length}</div>
            <p className="text-xs text-muted-foreground">linked accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Balance</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(totalBalance)}</div>
            <p className="text-xs text-muted-foreground">across all accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Spending</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(totalSpent)}</div>
            <p className="text-xs text-muted-foreground">from recent transactions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Low Balance</CardTitle>
            <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {children.filter(c => c.balance < 5).length}
            </div>
            <p className="text-xs text-muted-foreground">children below $5</p>
          </CardContent>
        </Card>
      </div>

      {/* Children Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Your Children</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => (
            <Card
              key={child.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedChild?.id === child.id ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => setSelectedChild(child)}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                    {child.full_name?.charAt(0) || 'S'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{child.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {child.grade || 'N/A'} • #{child.student_id}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${child.balance < 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {fmt(child.balance)}
                    </p>
                    <Badge variant={child.account_status === 'active' ? 'default' : 'secondary'} className="text-xs">
                      {child.account_status || 'active'}
                    </Badge>
                  </div>
                </div>
                {child.dietary_restrictions && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-amber-600">
                    <ShieldAlert className="h-3 w-3" />
                    <span>{child.dietary_restrictions}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {children.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No children linked to your account</p>
                <p className="text-sm mt-1">Contact the school administrator to link your children.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Upcoming Pre-Orders — Highlighted Section */}
      {selectedChild && (
        <Card className="overflow-hidden border-2 border-primary/20">
          <CardHeader className="bg-gradient-to-r from-violet-50 via-purple-50 to-fuchsia-50 dark:from-violet-950/30 dark:via-purple-950/30 dark:to-fuchsia-950/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <ChefHat className="h-4 w-4 text-white" />
                  </div>
                  Pre-Ordered Meals — {selectedChild.full_name}
                </CardTitle>
                <CardDescription className="mt-1">
                  Upcoming and recent meal pre-orders
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/parent/preorders')}
                className="bg-white/80 hover:bg-white border-purple-200 text-purple-700 hover:text-purple-800"
              >
                <Utensils className="h-4 w-4 mr-1" />
                Order Meals
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            {upcomingPreOrders.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays className="h-4 w-4 text-purple-600" />
                  <h3 className="text-sm font-semibold text-purple-700">Upcoming Orders</h3>
                  <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-xs">
                    {upcomingPreOrders.length}
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {upcomingPreOrders.map((order) => {
                    const style = getPreOrderStatusStyle(order.status);
                    const menuName = (order as Record<string, unknown>).menu_name as string || order.meal_type || 'Meal';
                    let dateStr = order.order_date;
                    try {
                      dateStr = format(parseISO(order.order_date), 'EEE, MMM d');
                    } catch { /* keep raw */ }
                    const canCancel = order.status === 'pending';

                    return (
                      <div
                        key={order.id}
                        className={`rounded-lg p-4 transition-all hover:shadow-md ${style.card}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${style.dot} animate-pulse`} />
                            <Badge
                              variant="outline"
                              className={`text-xs capitalize font-medium ${style.badge}`}
                            >
                              {order.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {order.total != null && (
                              <span className="text-sm font-bold text-gray-900">
                                {fmt(order.total)}
                              </span>
                            )}
                            {canCancel && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-100"
                                disabled={cancellingId === order.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowCancelConfirm(order.id);
                                }}
                                title="Cancel order"
                              >
                                {cancellingId === order.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold text-sm text-gray-900 truncate">
                            {menuName}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className={`h-3 w-3 ${style.icon}`} />
                            <span>{dateStr}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mx-auto mb-3">
                  <UtensilsCrossed className="h-7 w-7 text-purple-400" />
                </div>
                <p className="font-medium text-muted-foreground">No upcoming pre-orders</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Order meals in advance for your child
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 border-purple-200 text-purple-700 hover:bg-purple-50"
                  onClick={() => navigate('/parent/preorders')}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Browse Meal Plans
                </Button>
              </div>
            )}

            {/* Recent Past Orders */}
            {recentPastOrders.length > 0 && (
              <div className="mt-5 pt-4 border-t">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-muted-foreground">Recent Past Orders</h3>
                </div>
                <div className="space-y-2">
                  {recentPastOrders.map((order) => {
                    const style = getPreOrderStatusStyle(order.status);
                    const menuName = (order as Record<string, unknown>).menu_name as string || order.meal_type || 'Meal';
                    let dateStr = order.order_date;
                    try {
                      dateStr = format(parseISO(order.order_date), 'MMM d');
                    } catch { /* keep raw */ }

                    return (
                      <div
                        key={order.id}
                        className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full ${style.dot}`} />
                          <span className="text-sm font-medium">{menuName}</span>
                          <span className="text-xs text-muted-foreground">{dateStr}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {order.total != null && (
                            <span className="text-sm font-mono text-muted-foreground">
                              {fmt(order.total)}
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-xs capitalize ${style.badge}`}
                          >
                            {order.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Transactions */}
      {selectedChild && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Recent Activity — {selectedChild.full_name}
            </CardTitle>
            <CardDescription>Latest cafeteria transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {txLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : transactions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="capitalize">{tx.type}</TableCell>
                      <TableCell className="capitalize">{tx.payment_method || '-'}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(tx.amount)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={tx.status === 'completed' ? 'default' : 'secondary'}
                          className={tx.status === 'completed' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}
                        >
                          {tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {(() => { try { return format(new Date(tx.created_at), 'MMM d, h:mm a'); } catch { return tx.created_at; } })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <UtensilsCrossed className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No recent transactions</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!showCancelConfirm} onOpenChange={(open) => !open && setShowCancelConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Pre-Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this pre-order? If the balance was charged, it will be refunded to your child&apos;s account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => showCancelConfirm && handleCancelPreOrder(showCancelConfirm)}
              disabled={!!cancellingId}
            >
              {cancellingId ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Cancelling...</>
              ) : (
                'Yes, Cancel Order'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}