import { useEffect, useState } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import {
  Calendar, Plus, Minus, ShoppingCart, Loader2, Trash2,
  UtensilsCrossed, Clock, CheckCircle, CalendarDays, Utensils,
  Pencil, RefreshCw, Pause, Play, XCircle,
} from 'lucide-react';
import {
  parentApi, scheduledMenuApi, preOrderApi, mealSubscriptionApi,
  type ParentChild, type ScheduledMenu, type ScheduledMenuItem, type PreOrder,
  type MealSubscription,
} from '@/lib/api';
import { format, addDays, startOfDay, isBefore, parseISO, isPast } from 'date-fns';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

interface CartItem {
  menuItem: ScheduledMenuItem;
  quantity: number;
  scheduledMenuId: string;
  scheduledMenuName: string;
  orderDate: string;
}

export default function ParentPreOrdering() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [publishedMenus, setPublishedMenus] = useState<ScheduledMenu[]>([]);
  const [orders, setOrders] = useState<PreOrder[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'order' | 'history' | 'subscriptions'>('order');

  // Subscription state
  const [subscriptions, setSubscriptions] = useState<MealSubscription[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [showSubDialog, setShowSubDialog] = useState(false);
  const [subSaving, setSubSaving] = useState(false);
  const [subMealType, setSubMealType] = useState('lunch');
  const [subDays, setSubDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [subInstructions, setSubInstructions] = useState('');
  const [subMaxAmount, setSubMaxAmount] = useState('');
  const [subStartDate, setSubStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [subEndDate, setSubEndDate] = useState('');
  const [subStatusUpdating, setSubStatusUpdating] = useState<string | null>(null);

  // Edit state
  const [editingOrder, setEditingOrder] = useState<PreOrder | null>(null);
  const [editMealType, setEditMealType] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Cancel state
  const [showCancelConfirm, setShowCancelConfirm] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedChildId) {
      loadOrders();
      loadSubscriptions();
    }
  }, [selectedChildId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      const [childrenData, menusData] = await Promise.all([
        parentApi.getChildren(),
        scheduledMenuApi.getPublished({ start_date: tomorrow }),
      ]);
      const list = Array.isArray(childrenData) ? childrenData : [];
      setChildren(list);
      if (list.length > 0 && !selectedChildId) setSelectedChildId(list[0].id);
      setPublishedMenus(Array.isArray(menusData) ? menusData : []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      const data = await preOrderApi.getByStudent(selectedChildId);
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    }
  };

  const loadSubscriptions = async () => {
    try {
      setSubsLoading(true);
      const data = await mealSubscriptionApi.getAll(
        selectedChildId ? { student_id: selectedChildId } : undefined
      );
      setSubscriptions(Array.isArray(data) ? data : []);
    } catch {
      setSubscriptions([]);
    } finally {
      setSubsLoading(false);
    }
  };

  const handleCreateSubscription = async () => {
    if (!selectedChildId) return;
    try {
      setSubSaving(true);
      await mealSubscriptionApi.create({
        student_id: selectedChildId,
        meal_type: subMealType,
        days_of_week: subDays,
        special_instructions: subInstructions || undefined,
        max_daily_amount: subMaxAmount ? parseFloat(subMaxAmount) : undefined,
        start_date: subStartDate,
        end_date: subEndDate || undefined,
      });
      setShowSubDialog(false);
      resetSubForm();
      await loadSubscriptions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create subscription';
      alert(msg);
    } finally {
      setSubSaving(false);
    }
  };

  const handleSubStatusChange = async (subId: string, status: 'active' | 'paused' | 'cancelled') => {
    try {
      setSubStatusUpdating(subId);
      await mealSubscriptionApi.updateStatus(subId, status);
      await loadSubscriptions();
    } catch (err) {
      console.error('Failed to update subscription status:', err);
    } finally {
      setSubStatusUpdating(null);
    }
  };

  const handleDeleteSubscription = async (subId: string) => {
    try {
      setSubStatusUpdating(subId);
      await mealSubscriptionApi.delete(subId);
      await loadSubscriptions();
    } catch (err) {
      console.error('Failed to delete subscription:', err);
    } finally {
      setSubStatusUpdating(null);
    }
  };

  const resetSubForm = () => {
    setSubMealType('lunch');
    setSubDays([1, 2, 3, 4, 5]);
    setSubInstructions('');
    setSubMaxAmount('');
    setSubStartDate(format(new Date(), 'yyyy-MM-dd'));
    setSubEndDate('');
  };

  const toggleDay = (day: number) => {
    setSubDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const addToCart = (item: ScheduledMenuItem, menu: ScheduledMenu) => {
    setCart((prev) => {
      const key = `${menu.id}-${item.id}`;
      const existing = prev.find((c) => `${c.scheduledMenuId}-${c.menuItem.id}` === key);
      if (existing) {
        return prev.map((c) =>
          `${c.scheduledMenuId}-${c.menuItem.id}` === key
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [
        ...prev,
        {
          menuItem: item,
          quantity: 1,
          scheduledMenuId: menu.id,
          scheduledMenuName: menu.menu_name,
          orderDate: menu.schedule_date,
        },
      ];
    });
  };

  const updateQuantity = (itemId: string, menuId: string, delta: number) => {
    const key = `${menuId}-${itemId}`;
    setCart((prev) =>
      prev
        .map((c) =>
          `${c.scheduledMenuId}-${c.menuItem.id}` === key
            ? { ...c, quantity: Math.max(0, c.quantity + delta) }
            : c
        )
        .filter((c) => c.quantity > 0)
    );
  };

  const removeFromCart = (itemId: string, menuId: string) => {
    const key = `${menuId}-${itemId}`;
    setCart((prev) => prev.filter((c) => `${c.scheduledMenuId}-${c.menuItem.id}` !== key));
  };

  const subtotal = cart.reduce((s, c) => s + c.menuItem.price * c.quantity, 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;

  // Group cart items by scheduled menu for ordering
  const cartByMenu = cart.reduce<Record<string, CartItem[]>>((acc, item) => {
    if (!acc[item.scheduledMenuId]) acc[item.scheduledMenuId] = [];
    acc[item.scheduledMenuId].push(item);
    return acc;
  }, {});

  const handlePlaceOrder = async () => {
    if (!selectedChildId || cart.length === 0) return;
    try {
      setSubmitting(true);
      // Create one pre-order per scheduled menu
      const promises = Object.entries(cartByMenu).map(([menuId, items]) => {
        const menuSubtotal = items.reduce((s, c) => s + c.menuItem.price * c.quantity, 0);
        const menuTax = menuSubtotal * 0.08;
        const menuTotal = menuSubtotal + menuTax;
        return preOrderApi.create({
          student_id: selectedChildId,
          scheduled_menu_id: menuId,
          order_date: items[0].orderDate,
          meal_type: 'lunch',
          subtotal: Math.round(menuSubtotal * 100) / 100,
          tax: Math.round(menuTax * 100) / 100,
          total: Math.round(menuTotal * 100) / 100,
          payment_method: 'balance',
        });
      });
      await Promise.all(promises);
      setCart([]);
      setShowConfirm(false);
      await loadOrders();
    } catch (err) {
      console.error('Failed to place order:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      setCancellingId(orderId);
      await preOrderApi.cancel(orderId);
      await loadOrders();
    } catch (err) {
      console.error('Failed to cancel order:', err);
    } finally {
      setCancellingId(null);
      setShowCancelConfirm(null);
    }
  };

  const openEditDialog = (order: PreOrder) => {
    setEditingOrder(order);
    setEditMealType(order.meal_type || 'lunch');
    setEditInstructions((order as Record<string, unknown>).special_instructions as string || '');
  };

  const handleSaveEdit = async () => {
    if (!editingOrder) return;
    try {
      setEditSaving(true);
      await preOrderApi.update(editingOrder.id, {
        meal_type: editMealType,
        special_instructions: editInstructions,
      });
      setEditingOrder(null);
      await loadOrders();
    } catch (err) {
      console.error('Failed to update pre-order:', err);
    } finally {
      setEditSaving(false);
    }
  };

  const selectedChild = children.find((c) => c.id === selectedChildId);

  const formatMenuDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  const formatShortDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Meal Pre-Ordering</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meal Pre-Ordering</h1>
          <p className="text-muted-foreground">
            Order meals in advance from published meal plans
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={activeTab === 'order' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('order')}
          >
            <ShoppingCart className="h-4 w-4 mr-1" /> New Order
          </Button>
          <Button
            variant={activeTab === 'history' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('history')}
          >
            <Clock className="h-4 w-4 mr-1" /> Order History
          </Button>
          <Button
            variant={activeTab === 'subscriptions' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('subscriptions')}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Auto-Subscribe
          </Button>
        </div>
      </div>

      {/* Child Selection */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 max-w-sm">
            <Label>Select Child</Label>
            <Select value={selectedChildId} onValueChange={setSelectedChildId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose child" />
              </SelectTrigger>
              <SelectContent>
                {children.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name} — {c.grade || 'N/A'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {activeTab === 'order' ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Published Meal Plans */}
          <div className="lg:col-span-2 space-y-4">
            {publishedMenus.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <UtensilsCrossed className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No meal plans available</p>
                  <p className="text-sm mt-1">
                    Check back later — meal plans will appear here once published by the cafeteria.
                  </p>
                </CardContent>
              </Card>
            ) : (
              publishedMenus.map((menu) => {
                const menuItems = menu.menu_items || [];
                const mealTypes = menu.meal_types || [];
                // Group items by category
                const categories = [...new Set(menuItems.map((mi) => mi.category || 'Other'))];

                // Check if ordering is past cutoff
                const cutoffTime = menu.cutoff_time ? new Date(menu.cutoff_time) : null;
                const isPastCutoff = cutoffTime ? isPast(cutoffTime) : false;

                // Assign a color theme per menu card for visual distinction
                const menuColorThemes = [
                  { bg: 'bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20', border: 'border-violet-200', icon: 'text-violet-600', badge: 'bg-violet-100 text-violet-700 border-violet-300' },
                  { bg: 'bg-gradient-to-r from-sky-50 to-cyan-50 dark:from-sky-950/20 dark:to-cyan-950/20', border: 'border-sky-200', icon: 'text-sky-600', badge: 'bg-sky-100 text-sky-700 border-sky-300' },
                  { bg: 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20', border: 'border-emerald-200', icon: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
                  { bg: 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20', border: 'border-amber-200', icon: 'text-amber-600', badge: 'bg-amber-100 text-amber-700 border-amber-300' },
                  { bg: 'bg-gradient-to-r from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20', border: 'border-rose-200', icon: 'text-rose-600', badge: 'bg-rose-100 text-rose-700 border-rose-300' },
                ];
                const menuIdx = publishedMenus.indexOf(menu);
                const theme = menuColorThemes[menuIdx % menuColorThemes.length];

                return (
                  <Card key={menu.id} className={`overflow-hidden border-2 ${theme.border}`}>
                    <CardHeader className={`pb-3 ${theme.bg}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            <CalendarDays className={`h-4 w-4 ${theme.icon}`} />
                            {menu.menu_name}
                          </CardTitle>
                          <CardDescription className="mt-1 font-medium">
                            {formatMenuDate(menu.schedule_date)}
                          </CardDescription>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {mealTypes.map((t) => (
                            <Badge key={t} variant="outline" className={`text-xs capitalize font-medium ${theme.badge}`}>
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {menu.notes && (
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          {menu.notes}
                        </p>
                      )}
                      {cutoffTime && (
                        <div className={`flex items-center gap-1.5 mt-2 text-xs font-medium rounded-md px-2 py-1 w-fit ${
                          isPastCutoff
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : 'bg-amber-100 text-amber-700 border border-amber-200'
                        }`}>
                          <Clock className="h-3 w-3" />
                          {isPastCutoff
                            ? `Ordering closed (cut-off was ${format(cutoffTime, 'MMM d, h:mm a')})`
                            : `Order by ${format(cutoffTime, 'MMM d, h:mm a')}`
                          }
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="pt-4">
                      {menuItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No items in this meal plan
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {categories.map((cat) => (
                            <div key={cat}>
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                {cat}
                              </h4>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {menuItems
                                  .filter((mi) => (mi.category || 'Other') === cat)
                                  .map((item) => {
                                    const cartKey = `${menu.id}-${item.id}`;
                                    const inCart = cart.find(
                                      (c) =>
                                        `${c.scheduledMenuId}-${c.menuItem.id}` === cartKey
                                    );
                                    return (
                                      <div
                                        key={item.id}
                                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                                      >
                                        <div className="flex-1 min-w-0 mr-3">
                                          <div className="flex items-center gap-1.5">
                                            <p className="font-medium text-sm truncate">
                                              {item.name}
                                            </p>
                                            {item.is_healthy && (
                                              <Badge
                                                variant="outline"
                                                className="text-[10px] px-1 py-0 text-emerald-600 border-emerald-300"
                                              >
                                                Healthy
                                              </Badge>
                                            )}
                                          </div>
                                          {item.description && (
                                            <p className="text-xs text-muted-foreground truncate">
                                              {item.description}
                                            </p>
                                          )}
                                          <div className="flex items-center gap-2 mt-1">
                                            <span className="text-sm font-semibold">
                                              {fmt(item.price)}
                                            </span>
                                            {item.calories != null && (
                                              <span className="text-xs text-muted-foreground">
                                                {item.calories} cal
                                              </span>
                                            )}
                                          </div>
                                          {item.allergens && item.allergens.length > 0 && (
                                            <div className="flex gap-1 mt-1 flex-wrap">
                                              {item.allergens.map((a) => (
                                                <Badge
                                                  key={a}
                                                  variant="destructive"
                                                  className="text-[10px] px-1 py-0"
                                                >
                                                  {a}
                                                </Badge>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        {inCart ? (
                                          <div className="flex items-center gap-1">
                                            <Button
                                              size="icon"
                                              variant="outline"
                                              className="h-7 w-7"
                                              onClick={() =>
                                                updateQuantity(item.id, menu.id, -1)
                                              }
                                              disabled={isPastCutoff}
                                            >
                                              <Minus className="h-3 w-3" />
                                            </Button>
                                            <span className="w-6 text-center text-sm font-medium">
                                              {inCart.quantity}
                                            </span>
                                            <Button
                                              size="icon"
                                              variant="outline"
                                              className="h-7 w-7"
                                              onClick={() =>
                                                updateQuantity(item.id, menu.id, 1)
                                              }
                                              disabled={isPastCutoff}
                                            >
                                              <Plus className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        ) : (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => addToCart(item, menu)}
                                            disabled={isPastCutoff}
                                            title={isPastCutoff ? 'Ordering is closed for this meal plan' : undefined}
                                          >
                                            <Plus className="h-3 w-3 mr-1" /> Add
                                          </Button>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Cart */}
          <div>
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="h-4 w-4" /> Order Summary
                </CardTitle>
                <CardDescription>{selectedChild?.full_name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cart.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No items in cart. Browse the meal plans and add items.
                  </p>
                ) : (
                  <>
                    {/* Group cart by menu */}
                    {Object.entries(cartByMenu).map(([menuId, items]) => (
                      <div key={menuId} className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Utensils className="h-3 w-3" />
                          <span className="truncate">
                            {items[0].scheduledMenuName}
                          </span>
                          <span>·</span>
                          <span>{formatShortDate(items[0].orderDate)}</span>
                        </div>
                        {items.map((c) => (
                          <div
                            key={`${c.scheduledMenuId}-${c.menuItem.id}`}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex-1 min-w-0">
                              <span className="truncate">{c.menuItem.name}</span>
                              <span className="text-muted-foreground ml-1">
                                ×{c.quantity}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono">
                                {fmt(c.menuItem.price * c.quantity)}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive"
                                onClick={() =>
                                  removeFromCart(c.menuItem.id, c.scheduledMenuId)
                                }
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="border-t pt-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>{fmt(subtotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tax (8%)</span>
                        <span>{fmt(tax)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-base pt-1">
                        <span>Total</span>
                        <span>{fmt(total)}</span>
                      </div>
                    </div>
                    <Button className="w-full" onClick={() => setShowConfirm(true)}>
                      Place Order
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : activeTab === 'history' ? (
        /* Order History */
        <Card>
          <CardHeader>
            <CardTitle>Order History</CardTitle>
            <CardDescription>
              Past and upcoming pre-orders for {selectedChild?.full_name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {orders.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Menu</TableHead>
                    <TableHead>Meal Type</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const statusStyles: Record<string, string> = {
                      pending: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100',
                      confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100',
                      fulfilled: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100',
                      cancelled: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-100',
                    };
                    const rowHighlight: Record<string, string> = {
                      pending: 'bg-amber-50/40',
                      confirmed: 'bg-emerald-50/40',
                      fulfilled: '',
                      cancelled: 'bg-red-50/30 opacity-70',
                    };
                    let dateDisplay = order.order_date;
                    try {
                      dateDisplay = format(parseISO(order.order_date), 'EEE, MMM d, yyyy');
                    } catch { /* keep raw */ }

                    const isFutureOrder = !isBefore(
                      new Date(order.order_date),
                      startOfDay(new Date())
                    );
                    const canEdit = order.status === 'pending' && isFutureOrder;
                    const canCancel = (order.status === 'pending' || order.status === 'confirmed') && isFutureOrder;

                    return (
                      <TableRow key={order.id} className={rowHighlight[order.status] || ''}>
                        <TableCell className="font-medium">{dateDisplay}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {(order as Record<string, unknown>).menu_name as string || '—'}
                        </TableCell>
                        <TableCell className="capitalize">
                          {order.meal_type || '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {order.total != null ? fmt(order.total) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`capitalize font-medium ${statusStyles[order.status] || ''}`}
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {canEdit && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                                onClick={() => openEditDialog(order)}
                              >
                                <Pencil className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            )}
                            {canCancel && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-red-600 border-red-200 hover:bg-red-50"
                                disabled={cancellingId === order.id}
                                onClick={() => setShowCancelConfirm(order.id)}
                              >
                                {cancellingId === order.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Cancel
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No pre-orders found</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : activeTab === 'subscriptions' ? (
        /* Auto-Subscribe Tab */
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-primary" />
                  Meal Auto-Subscribe
                </CardTitle>
                <CardDescription className="mt-1">
                  Automatically order meals for {selectedChild?.full_name} on selected days — no need to place individual pre-orders.
                </CardDescription>
              </div>
              <Button onClick={() => { resetSubForm(); setShowSubDialog(true); }}>
                <Plus className="h-4 w-4 mr-1" /> New Subscription
              </Button>
            </CardHeader>
            <CardContent>
              {subsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : subscriptions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <RefreshCw className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No active subscriptions</p>
                  <p className="text-sm mt-1">
                    Create a subscription to automatically order meals when new meal plans are published.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {subscriptions.map((sub) => {
                    const statusColors: Record<string, string> = {
                      active: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                      paused: 'bg-amber-100 text-amber-800 border-amber-300',
                      cancelled: 'bg-red-100 text-red-700 border-red-300',
                    };
                    return (
                      <div
                        key={sub.id}
                        className={`rounded-lg border p-4 transition-colors ${
                          sub.status === 'cancelled' ? 'opacity-60' : ''
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`capitalize font-medium ${statusColors[sub.status] || ''}`}>
                                {sub.status}
                              </Badge>
                              <Badge variant="secondary" className="capitalize">
                                {sub.meal_type}
                              </Badge>
                              {sub.max_daily_amount > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  Max {fmt(sub.max_daily_amount)}/day
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                              <span className="font-medium text-foreground">Days:</span>
                              {sub.days_of_week.map((d) => (
                                <span
                                  key={d}
                                  className="inline-flex items-center justify-center h-6 w-8 rounded bg-primary/10 text-primary text-xs font-medium"
                                >
                                  {DAY_LABELS[d]}
                                </span>
                              ))}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Started {format(parseISO(sub.start_date), 'MMM d, yyyy')}
                              {sub.end_date && ` · Ends ${format(parseISO(sub.end_date), 'MMM d, yyyy')}`}
                            </div>
                            {sub.special_instructions && (
                              <p className="text-xs italic text-muted-foreground">
                                &ldquo;{sub.special_instructions}&rdquo;
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {sub.status === 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-amber-600 border-amber-200 hover:bg-amber-50"
                                disabled={subStatusUpdating === sub.id}
                                onClick={() => handleSubStatusChange(sub.id, 'paused')}
                              >
                                {subStatusUpdating === sub.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><Pause className="h-3 w-3 mr-1" /> Pause</>
                                )}
                              </Button>
                            )}
                            {sub.status === 'paused' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                disabled={subStatusUpdating === sub.id}
                                onClick={() => handleSubStatusChange(sub.id, 'active')}
                              >
                                {subStatusUpdating === sub.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><Play className="h-3 w-3 mr-1" /> Resume</>
                                )}
                              </Button>
                            )}
                            {sub.status !== 'cancelled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                                disabled={subStatusUpdating === sub.id}
                                onClick={() => handleSubStatusChange(sub.id, 'cancelled')}
                              >
                                {subStatusUpdating === sub.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><XCircle className="h-3 w-3 mr-1" /> Cancel</>
                                )}
                              </Button>
                            )}
                            {sub.status === 'cancelled' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                                disabled={subStatusUpdating === sub.id}
                                onClick={() => handleDeleteSubscription(sub.id)}
                              >
                                {subStatusUpdating === sub.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <><Trash2 className="h-3 w-3 mr-1" /> Delete</>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* How it works */}
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-sm mb-3">How Auto-Subscribe Works</h3>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>Create a subscription by choosing your child&apos;s preferred meal type and days.</li>
                <li>When the cafeteria publishes a new meal plan matching your selected days, an order is automatically placed.</li>
                <li>You can pause or cancel the subscription at any time.</li>
                <li>Set a daily spending limit to control costs — orders above the limit won&apos;t be auto-placed.</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Create Subscription Dialog */}
      <Dialog open={showSubDialog} onOpenChange={setShowSubDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              New Auto-Subscribe
            </DialogTitle>
            <DialogDescription>
              Set up automatic meal ordering for {selectedChild?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {/* Meal Type */}
            <div className="space-y-2">
              <Label>Meal Type</Label>
              <Select value={subMealType} onValueChange={setSubMealType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select meal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Days of Week */}
            <div className="space-y-2">
              <Label>Days of the Week</Label>
              <p className="text-xs text-muted-foreground">Select which days to auto-order meals</p>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`h-9 w-11 rounded-md text-xs font-medium border transition-colors ${
                      subDays.includes(idx)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-input hover:bg-accent'
                    }`}
                    onClick={() => toggleDay(idx)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setSubDays([1, 2, 3, 4, 5])}
                >
                  Weekdays
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setSubDays([0, 1, 2, 3, 4, 5, 6])}
                >
                  Every day
                </Button>
              </div>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={subStartDate}
                  onChange={(e) => setSubStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  type="date"
                  value={subEndDate}
                  onChange={(e) => setSubEndDate(e.target.value)}
                  min={subStartDate}
                />
              </div>
            </div>

            {/* Max Daily Amount */}
            <div className="space-y-2">
              <Label>Daily Spending Limit <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g., 15.00 — leave empty for no limit"
                value={subMaxAmount}
                onChange={(e) => setSubMaxAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If the meal plan total exceeds this amount, the auto-order won&apos;t be placed.
              </p>
            </div>

            {/* Special Instructions */}
            <div className="space-y-2">
              <Label>Special Instructions <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                placeholder="e.g., No nuts, extra sauce, gluten-free..."
                value={subInstructions}
                onChange={(e) => setSubInstructions(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSubscription} disabled={subSaving || subDays.length === 0}>
              {subSaving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Creating...</>
              ) : (
                <><CheckCircle className="h-4 w-4 mr-1" /> Create Subscription</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Order Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Pre-Order</DialogTitle>
            <DialogDescription>
              Order for {selectedChild?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm max-h-60 overflow-y-auto">
            {Object.entries(cartByMenu).map(([menuId, items]) => (
              <div key={menuId}>
                <p className="font-medium text-xs text-muted-foreground mb-1">
                  {items[0].scheduledMenuName} — {formatShortDate(items[0].orderDate)}
                </p>
                {items.map((c) => (
                  <div
                    key={`${c.scheduledMenuId}-${c.menuItem.id}`}
                    className="flex justify-between pl-2"
                  >
                    <span>
                      {c.menuItem.name} ×{c.quantity}
                    </span>
                    <span className="font-mono">
                      {fmt(c.menuItem.price * c.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            <div className="border-t pt-2 font-bold flex justify-between">
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handlePlaceOrder} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-1" />
              )}
              Confirm Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Pre-Order Dialog */}
      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-blue-600" />
              Edit Pre-Order
            </DialogTitle>
            <DialogDescription>
              {editingOrder && (
                <>
                  Order for{' '}
                  {(() => {
                    try {
                      return format(parseISO(editingOrder.order_date), 'EEEE, MMMM d, yyyy');
                    } catch {
                      return editingOrder.order_date;
                    }
                  })()}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Order Info (read-only) */}
            {editingOrder && (
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Menu</span>
                  <span className="font-medium">
                    {(editingOrder as Record<string, unknown>).menu_name as string || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-mono font-medium">
                    {editingOrder.total != null ? fmt(editingOrder.total) : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs capitalize">
                    {editingOrder.status}
                  </Badge>
                </div>
              </div>
            )}

            {/* Editable Fields */}
            <div className="space-y-2">
              <Label htmlFor="edit-meal-type">Meal Type</Label>
              <Select value={editMealType} onValueChange={setEditMealType}>
                <SelectTrigger id="edit-meal-type">
                  <SelectValue placeholder="Select meal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-instructions">Special Instructions</Label>
              <Textarea
                id="edit-instructions"
                placeholder="e.g., No nuts, extra sauce, gluten-free bread..."
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Add any dietary notes or special requests for the cafeteria.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrder(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving...</>
              ) : (
                <><CheckCircle className="h-4 w-4 mr-1" /> Save Changes</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              onClick={() => showCancelConfirm && handleCancelOrder(showCancelConfirm)}
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