import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  CalendarDays, Plus, Loader2, Eye, Pencil, Trash2,
  Send, SendHorizonal, UtensilsCrossed, ShoppingBag,
  ChevronLeft, ChevronRight, Clock, Users, Repeat, Copy,
} from 'lucide-react';
import {
  scheduledMenuApi, menuApi, preOrderApi,
  type ScheduledMenu, type MenuItem, type PreOrder,
} from '@/lib/api';
import { toast } from 'sonner';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, isSameMonth, isSameDay, isToday,
  parseISO,
} from 'date-fns';

type ViewMode = 'calendar' | 'list';

export default function MealPlanManagement() {
  const [menus, setMenus] = useState<ScheduledMenu[]>([]);
  const [allMenuItems, setAllMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Form dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<ScheduledMenu | null>(null);
  const [formDate, setFormDate] = useState('');
  const [formName, setFormName] = useState('');
  const [formMealTypes, setFormMealTypes] = useState<string[]>(['lunch']);
  const [formNotes, setFormNotes] = useState('');
  const [formCutoffTime, setFormCutoffTime] = useState('');
  const [formSelectedItems, setFormSelectedItems] = useState<string[]>([]);
  const [formStatus, setFormStatus] = useState<'draft' | 'published'>('draft');
  const [formRecurrenceType, setFormRecurrenceType] = useState<'none' | 'weekly' | 'monthly'>('none');
  const [formRecurrenceEndDate, setFormRecurrenceEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Publish with recurrence dialog
  const [publishDialogMenu, setPublishDialogMenu] = useState<ScheduledMenu | null>(null);
  const [publishRecurrenceType, setPublishRecurrenceType] = useState<'none' | 'weekly' | 'monthly'>('none');
  const [publishRecurrenceEndDate, setPublishRecurrenceEndDate] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Repeat monthly dialog
  const [repeatMonthlyOpen, setRepeatMonthlyOpen] = useState(false);
  const [repeatSourceYear, setRepeatSourceYear] = useState(new Date().getFullYear());
  const [repeatSourceMonth, setRepeatSourceMonth] = useState(new Date().getMonth() + 1);
  const [repeatTargetYear, setRepeatTargetYear] = useState(new Date().getFullYear());
  const [repeatTargetMonth, setRepeatTargetMonth] = useState(new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2);
  const [repeating, setRepeating] = useState(false);

  // Pre-orders dialog
  const [ordersDialogMenu, setOrdersDialogMenu] = useState<ScheduledMenu | null>(null);
  const [menuPreOrders, setMenuPreOrders] = useState<PreOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Detail dialog
  const [detailMenu, setDetailMenu] = useState<ScheduledMenu | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const start = format(subMonths(startOfMonth(currentMonth), 1), 'yyyy-MM-dd');
      const end = format(endOfMonth(addMonths(currentMonth, 1)), 'yyyy-MM-dd');
      const [menusData, itemsData] = await Promise.all([
        scheduledMenuApi.getAll({ start_date: start, end_date: end }),
        menuApi.getAll(),
      ]);
      setMenus(Array.isArray(menusData) ? menusData : []);
      setAllMenuItems(Array.isArray(itemsData) ? itemsData : []);
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error('Failed to load meal plan data');
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Calendar helpers ─────────────────────────────────────────────── */

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart); // 0=Sun

  const getMenusForDate = (date: Date) =>
    menus.filter((m) => {
      try { return isSameDay(parseISO(m.schedule_date), date); }
      catch { return false; }
    });

  /* ── Form ──────────────────────────────────────────────────────────── */

  const openCreateForm = (date?: Date) => {
    setEditingMenu(null);
    setFormDate(date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
    setFormName('');
    setFormMealTypes(['lunch']);
    setFormNotes('');
    setFormCutoffTime('');
    setFormSelectedItems([]);
    setFormStatus('draft');
    setFormRecurrenceType('none');
    setFormRecurrenceEndDate('');
    setFormOpen(true);
  };

  const openEditForm = (menu: ScheduledMenu) => {
    setEditingMenu(menu);
    setFormDate(menu.schedule_date);
    setFormName(menu.menu_name);
    setFormMealTypes(menu.meal_types || ['lunch']);
    setFormNotes(menu.notes || '');
    setFormCutoffTime(menu.cutoff_time ? format(new Date(menu.cutoff_time), "yyyy-MM-dd'T'HH:mm") : '');
    setFormSelectedItems(
      (menu.menu_items || []).map((mi) => mi.menu_item_id || mi.id)
    );
    setFormStatus(menu.status as 'draft' | 'published');
    setFormRecurrenceType((menu.recurrence_type as 'none' | 'weekly' | 'monthly') || 'none');
    setFormRecurrenceEndDate(menu.recurrence_end_date ? menu.recurrence_end_date.split('T')[0] : '');
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!formDate || !formName.trim()) {
      toast.error('Date and menu name are required');
      return;
    }
    if (formRecurrenceType !== 'none' && !formRecurrenceEndDate) {
      toast.error('Please set an end date for the recurrence');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        schedule_date: formDate,
        menu_name: formName.trim(),
        status: formStatus,
        meal_types: formMealTypes,
        notes: formNotes || undefined,
        cutoff_time: formCutoffTime ? new Date(formCutoffTime).toISOString() : undefined,
        menu_item_ids: formSelectedItems,
        recurrence_type: formRecurrenceType,
        recurrence_end_date: formRecurrenceType !== 'none' ? formRecurrenceEndDate : null,
      };
      if (editingMenu) {
        await scheduledMenuApi.update(editingMenu.id, payload as Parameters<typeof scheduledMenuApi.update>[1]);
        toast.success('Meal plan updated');
      } else {
        const result = await scheduledMenuApi.create(payload as Parameters<typeof scheduledMenuApi.create>[0]);
        const copies = (result as Record<string, unknown>).recurring_copies_created;
        if (copies && Number(copies) > 0) {
          toast.success(`Meal plan created with ${copies} recurring ${formRecurrenceType} copies!`);
        } else {
          toast.success('Meal plan created');
        }
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  /* ── Publish with recurrence ───────────────────────────────────────── */

  const openPublishDialog = (menu: ScheduledMenu) => {
    setPublishDialogMenu(menu);
    setPublishRecurrenceType((menu.recurrence_type as 'none' | 'weekly' | 'monthly') || 'none');
    setPublishRecurrenceEndDate(menu.recurrence_end_date ? menu.recurrence_end_date.split('T')[0] : '');
  };

  const handlePublishWithRecurrence = async () => {
    if (!publishDialogMenu) return;
    if (publishRecurrenceType !== 'none' && !publishRecurrenceEndDate) {
      toast.error('Please set an end date for the recurrence');
      return;
    }
    setPublishing(true);
    try {
      const data = await scheduledMenuApi.publish(publishDialogMenu.id, {
        recurrence_type: publishRecurrenceType,
        recurrence_end_date: publishRecurrenceType !== 'none' ? publishRecurrenceEndDate : null,
      });

      if (data.recurring_copies_created && data.recurring_copies_created > 0) {
        toast.success(data.message || `Published and created ${data.recurring_copies_created} recurring copies!`);
      } else {
        toast.success('Menu published successfully');
      }
      setPublishDialogMenu(null);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  };

  const togglePublish = async (menu: ScheduledMenu) => {
    if (menu.status === 'published') {
      try {
        await scheduledMenuApi.unpublish(menu.id);
        toast.success('Menu unpublished');
        await loadData();
      } catch {
        toast.error('Failed to unpublish');
      }
    } else {
      // Open publish dialog with recurrence options
      openPublishDialog(menu);
    }
  };

  const handleDelete = async (menu: ScheduledMenu) => {
    if (!confirm(`Delete "${menu.menu_name}"? This cannot be undone.`)) return;
    try {
      await scheduledMenuApi.delete(menu.id);
      toast.success('Menu deleted');
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  /* ── Repeat Monthly ───────────────────────────────────────────────── */

  const handleRepeatMonthly = async () => {
    setRepeating(true);
    try {
      const result = await scheduledMenuApi.repeatMonthly({
        source_year: repeatSourceYear,
        source_month: repeatSourceMonth,
        target_year: repeatTargetYear,
        target_month: repeatTargetMonth,
      });
      toast.success(result.message || `Created ${result.created_count} meal plans`);
      setRepeatMonthlyOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to repeat monthly');
    } finally {
      setRepeating(false);
    }
  };

  /* ── Pre-orders viewer ────────────────────────────────────────────── */

  const viewPreOrders = async (menu: ScheduledMenu) => {
    setOrdersDialogMenu(menu);
    setLoadingOrders(true);
    try {
      const data = await scheduledMenuApi.getPreOrders(menu.id);
      setMenuPreOrders(Array.isArray(data) ? data : []);
    } catch {
      setMenuPreOrders([]);
      toast.error('Failed to load pre-orders');
    } finally {
      setLoadingOrders(false);
    }
  };

  const toggleMealType = (type: string) => {
    setFormMealTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleMenuItem = (id: string) => {
    setFormSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const formatDate = (d?: string) => {
    if (!d) return '—';
    try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
  };

  const recurrenceLabel = (type?: string) => {
    if (type === 'weekly') return 'Weekly';
    if (type === 'monthly') return 'Monthly';
    return '';
  };

  /* ── Stats ─────────────────────────────────────────────────────────── */

  const totalMenus = menus.length;
  const publishedMenus = menus.filter((m) => m.status === 'published').length;
  const draftMenus = menus.filter((m) => m.status === 'draft').length;

  /* ── Render ────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meal Plan Management</h1>
          <p className="text-muted-foreground">
            Schedule meals, assign menu items, and manage pre-orders
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('calendar')}
          >
            <CalendarDays className="h-4 w-4 mr-1" /> Calendar
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <UtensilsCrossed className="h-4 w-4 mr-1" /> List
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRepeatMonthlyOpen(true)}>
            <Copy className="h-4 w-4 mr-1" /> Repeat Month
          </Button>
          <Button onClick={() => openCreateForm()}>
            <Plus className="h-4 w-4 mr-2" /> New Meal Plan
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalMenus}</p>
              <p className="text-xs text-muted-foreground">Total Menus</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Send className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{publishedMenus}</p>
              <p className="text-xs text-muted-foreground">Published</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Pencil className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{draftMenus}</p>
              <p className="text-xs text-muted-foreground">Drafts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading meal plans…</span>
        </div>
      ) : viewMode === 'calendar' ? (
        /* ── Calendar View ─────────────────────────────────────────── */
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <CardTitle className="text-lg">
                {format(currentMonth, 'MMMM yyyy')}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {d}
                </div>
              ))}
            </div>
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-px">
              {/* Padding for start of month */}
              {Array.from({ length: startPadding }).map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[100px] bg-muted/20 rounded-md" />
              ))}
              {calendarDays.map((day) => {
                const dayMenus = getMenusForDate(day);
                const isCurrentDay = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[100px] border rounded-md p-1.5 cursor-pointer hover:bg-accent/30 transition-colors ${
                      isCurrentDay ? 'border-primary bg-primary/5' : 'border-border'
                    } ${!isSameMonth(day, currentMonth) ? 'opacity-40' : ''}`}
                    onClick={() => openCreateForm(day)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${isCurrentDay ? 'text-primary font-bold' : ''}`}>
                        {format(day, 'd')}
                      </span>
                      {dayMenus.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {dayMenus.length}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {dayMenus.slice(0, 2).map((menu) => (
                        <div
                          key={menu.id}
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate cursor-pointer flex items-center gap-0.5 ${
                            menu.status === 'published'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailMenu(menu);
                          }}
                          title={menu.menu_name}
                        >
                          {menu.recurrence_type && menu.recurrence_type !== 'none' && (
                            <Repeat className="h-2.5 w-2.5 shrink-0" />
                          )}
                          <span className="truncate">{menu.menu_name}</span>
                        </div>
                      ))}
                      {dayMenus.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{dayMenus.length - 2} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* ── List View ─────────────────────────────────────────────── */
        <Card>
          <CardContent className="p-0">
            {menus.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No meal plans found</p>
                <p className="text-xs mt-1">Create a new meal plan to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Meal Types</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Recurrence</TableHead>
                    <TableHead>Cut-off</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {menus.map((menu) => (
                    <TableRow key={menu.id}>
                      <TableCell className="font-medium">
                        {formatDate(menu.schedule_date)}
                      </TableCell>
                      <TableCell>{menu.menu_name}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {(menu.meal_types || []).map((t) => (
                            <Badge key={t} variant="outline" className="text-xs capitalize">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {(menu.menu_items || []).length} items
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {menu.recurrence_type && menu.recurrence_type !== 'none' ? (
                          <div className="flex items-center gap-1">
                            <Repeat className="h-3 w-3 text-violet-600" />
                            <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100 text-xs">
                              {recurrenceLabel(menu.recurrence_type)}
                            </Badge>
                            {menu.recurrence_end_date && (
                              <span className="text-[10px] text-muted-foreground">
                                until {formatDate(menu.recurrence_end_date)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {menu.cutoff_time ? (
                          <div className="flex items-center gap-1 text-xs">
                            <Clock className="h-3 w-3 text-amber-600" />
                            <span className="text-amber-700">
                              {format(new Date(menu.cutoff_time), 'MMM d, h:mm a')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            menu.status === 'published'
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                          }
                        >
                          {menu.status === 'published' ? 'Published' : 'Draft'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => setDetailMenu(menu)}
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => openEditForm(menu)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => togglePublish(menu)}
                            title={menu.status === 'published' ? 'Unpublish' : 'Publish'}
                          >
                            <SendHorizonal className={`h-4 w-4 ${menu.status === 'published' ? 'text-emerald-600' : ''}`} />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => viewPreOrders(menu)}
                            title="View pre-orders"
                          >
                            <ShoppingBag className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(menu)}
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
      )}

      {/* ── Detail Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!detailMenu} onOpenChange={(open) => { if (!open) setDetailMenu(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              {detailMenu?.menu_name}
            </DialogTitle>
            <DialogDescription>
              {formatDate(detailMenu?.schedule_date)}
            </DialogDescription>
          </DialogHeader>
          {detailMenu && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className={
                    detailMenu.status === 'published'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }
                >
                  {detailMenu.status === 'published' ? 'Published' : 'Draft'}
                </Badge>
                <div className="flex gap-1">
                  {(detailMenu.meal_types || []).map((t) => (
                    <Badge key={t} variant="outline" className="capitalize text-xs">{t}</Badge>
                  ))}
                </div>
                {detailMenu.recurrence_type && detailMenu.recurrence_type !== 'none' && (
                  <Badge className="bg-violet-100 text-violet-700 hover:bg-violet-100">
                    <Repeat className="h-3 w-3 mr-1" />
                    {recurrenceLabel(detailMenu.recurrence_type)}
                    {detailMenu.recurrence_end_date && (
                      <span className="ml-1">until {formatDate(detailMenu.recurrence_end_date)}</span>
                    )}
                  </Badge>
                )}
              </div>

              {detailMenu.cutoff_time && (
                <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="text-amber-800">
                    <span className="font-medium">Order cut-off:</span>{' '}
                    {format(new Date(detailMenu.cutoff_time), 'MMM d, yyyy h:mm a')}
                  </span>
                </div>
              )}

              {detailMenu.notes && (
                <p className="text-sm text-muted-foreground">{detailMenu.notes}</p>
              )}

              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-sm">Menu Items ({(detailMenu.menu_items || []).length})</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  {(detailMenu.menu_items || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items assigned</p>
                  ) : (
                    <div className="space-y-2">
                      {(detailMenu.menu_items || []).map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-medium">{item.name}</span>
                            {item.category && (
                              <span className="text-muted-foreground ml-2 text-xs">({item.category})</span>
                            )}
                          </div>
                          <span className="font-mono">{fmt(item.price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {detailMenu.created_by_name && (
                <p className="text-xs text-muted-foreground">
                  Created by: {detailMenu.created_by_name}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { if (detailMenu) viewPreOrders(detailMenu); setDetailMenu(null); }}>
              <ShoppingBag className="h-4 w-4 mr-1" /> View Orders
            </Button>
            <Button variant="outline" size="sm" onClick={() => { if (detailMenu) openEditForm(detailMenu); setDetailMenu(null); }}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => { if (detailMenu) togglePublish(detailMenu); setDetailMenu(null); }}>
              <SendHorizonal className="h-4 w-4 mr-1" />
              {detailMenu?.status === 'published' ? 'Unpublish' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create/Edit Form Dialog ────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingMenu ? 'Edit Meal Plan' : 'Create Meal Plan'}
            </DialogTitle>
            <DialogDescription>
              {editingMenu
                ? 'Update the scheduled meal plan details'
                : 'Schedule a new meal plan for a specific date'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Schedule Date *</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as 'draft' | 'published')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Menu Name *</Label>
              <Input
                placeholder="e.g. Monday Lunch Special"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Meal Types</Label>
              <div className="flex gap-3">
                {['breakfast', 'lunch', 'dinner', 'snack'].map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={formMealTypes.includes(type)}
                      onCheckedChange={() => toggleMealType(type)}
                    />
                    <span className="capitalize">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Recurrence Settings */}
            <div className="space-y-3 border rounded-lg p-4 bg-violet-50/50">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Repeat className="h-4 w-4 text-violet-600" />
                Recurrence Settings
              </Label>
              <p className="text-xs text-muted-foreground">
                Set this meal plan to automatically repeat on a weekly or monthly basis.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Repeat</Label>
                  <Select value={formRecurrenceType} onValueChange={(v) => setFormRecurrenceType(v as 'none' | 'weekly' | 'monthly')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Repeat</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formRecurrenceType !== 'none' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Repeat Until</Label>
                    <Input
                      type="date"
                      value={formRecurrenceEndDate}
                      onChange={(e) => setFormRecurrenceEndDate(e.target.value)}
                      min={formDate}
                    />
                  </div>
                )}
              </div>
              {formRecurrenceType !== 'none' && formRecurrenceEndDate && formDate && (
                <p className="text-xs text-violet-700 bg-violet-100 rounded px-2 py-1">
                  This meal plan will be copied {formRecurrenceType === 'weekly' ? 'every week' : 'every month'} from{' '}
                  {formatDate(formDate)} until {formatDate(formRecurrenceEndDate)}.
                  {formStatus === 'published'
                    ? ' Recurring copies will be created as published when you save.'
                    : ' Recurring copies will be generated when you publish this meal plan.'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any notes about this meal plan..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Order Cut-off Time (optional)
              </Label>
              <Input
                type="datetime-local"
                value={formCutoffTime}
                onChange={(e) => setFormCutoffTime(e.target.value)}
                placeholder="Set a deadline for pre-orders"
              />
              <p className="text-xs text-muted-foreground">
                Parents won&apos;t be able to place pre-orders after this time. Leave empty for no cut-off.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Menu Items ({formSelectedItems.length} selected)</Label>
              <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
                {allMenuItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">No menu items available</p>
                ) : (
                  allMenuItems.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-accent/30 cursor-pointer"
                    >
                      <Checkbox
                        checked={formSelectedItems.includes(item.id)}
                        onCheckedChange={() => toggleMenuItem(item.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({item.category})
                        </span>
                      </div>
                      <span className="text-sm font-mono">{fmt(item.price)}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingMenu ? 'Update' : 'Create'} Meal Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Publish with Recurrence Dialog ─────────────────────────── */}
      <Dialog open={!!publishDialogMenu} onOpenChange={(open) => { if (!open) setPublishDialogMenu(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-600" />
              Publish Meal Plan
            </DialogTitle>
            <DialogDescription>
              Publish &quot;{publishDialogMenu?.menu_name}&quot; for {formatDate(publishDialogMenu?.schedule_date)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3 border rounded-lg p-4 bg-violet-50/50">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Repeat className="h-4 w-4 text-violet-600" />
                Set Recurring Schedule (Optional)
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically create copies of this meal plan on a recurring basis when publishing.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Repeat</Label>
                  <Select value={publishRecurrenceType} onValueChange={(v) => setPublishRecurrenceType(v as 'none' | 'weekly' | 'monthly')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Repeat</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {publishRecurrenceType !== 'none' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Repeat Until</Label>
                    <Input
                      type="date"
                      value={publishRecurrenceEndDate}
                      onChange={(e) => setPublishRecurrenceEndDate(e.target.value)}
                      min={publishDialogMenu?.schedule_date}
                    />
                  </div>
                )}
              </div>
              {publishRecurrenceType !== 'none' && publishRecurrenceEndDate && (
                <p className="text-xs text-violet-700 bg-violet-100 rounded px-2 py-1">
                  This will publish the meal plan and create {publishRecurrenceType === 'weekly' ? 'weekly' : 'monthly'} copies
                  until {formatDate(publishRecurrenceEndDate)}. All copies will be published automatically.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPublishDialogMenu(null)} disabled={publishing}>
              Cancel
            </Button>
            <Button
              onClick={handlePublishWithRecurrence}
              disabled={publishing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {publishing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Send className="h-4 w-4 mr-2" />
              Publish{publishRecurrenceType !== 'none' ? ' & Repeat' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Repeat Monthly Dialog ──────────────────────────────────── */}
      <Dialog open={repeatMonthlyOpen} onOpenChange={setRepeatMonthlyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-blue-600" />
              Repeat Month&apos;s Meal Plans
            </DialogTitle>
            <DialogDescription>
              Copy all meal plans from one month to another
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Source Month</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={String(repeatSourceYear)} onValueChange={(v) => setRepeatSourceYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2025, 2026, 2027].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(repeatSourceMonth)} onValueChange={(v) => setRepeatSourceMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {format(new Date(2026, m - 1, 1), 'MMMM')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Target Month</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={String(repeatTargetYear)} onValueChange={(v) => setRepeatTargetYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2025, 2026, 2027].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(repeatTargetMonth)} onValueChange={(v) => setRepeatTargetMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {format(new Date(2026, m - 1, 1), 'MMMM')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded px-3 py-2">
              All meal plans from the source month will be copied to the target month as drafts.
              Existing plans on the same dates will be skipped.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRepeatMonthlyOpen(false)} disabled={repeating}>
              Cancel
            </Button>
            <Button onClick={handleRepeatMonthly} disabled={repeating}>
              {repeating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Copy className="h-4 w-4 mr-2" />
              Repeat Month
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pre-Orders Dialog ──────────────────────────────────────── */}
      <Dialog
        open={!!ordersDialogMenu}
        onOpenChange={(open) => { if (!open) { setOrdersDialogMenu(null); setMenuPreOrders([]); } }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              Pre-Orders — {ordersDialogMenu?.menu_name}
            </DialogTitle>
            <DialogDescription>
              {formatDate(ordersDialogMenu?.schedule_date)}
            </DialogDescription>
          </DialogHeader>

          {loadingOrders ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : menuPreOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No pre-orders for this menu</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ordered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {menuPreOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.student_name || '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(order as Record<string, unknown>).parent_name as string || '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {order.total != null ? fmt(order.total) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          order.status === 'confirmed' ? 'default' :
                          order.status === 'cancelled' ? 'destructive' : 'secondary'
                        }
                      >
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.created_at ? format(new Date(order.created_at), 'MMM d, h:mm a') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOrdersDialogMenu(null); setMenuPreOrders([]); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}