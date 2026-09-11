import { useEffect, useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Loader2,
  Search,
  Pencil,
  Trash2,
  UtensilsCrossed,
  ArrowUp,
  ArrowDown,
  Coffee,
  Salad,
  Sandwich,
  IceCream2,
  Apple,
  Soup,
  Egg,
  Cookie,
  Milk,
  Pizza,
  Beef,
  Fish,
  CakeSlice,
  Grape,
  Carrot,
  Wheat,
  Utensils,
  Eye,
  type LucideIcon,
} from 'lucide-react';
import { mealCategoryApi, menuApi, type MealCategory, type MenuItem } from '@/lib/api';
import { toast } from 'sonner';

// Preset icons for categories
const ICON_OPTIONS: { name: string; icon: LucideIcon }[] = [
  { name: 'Utensils', icon: Utensils },
  { name: 'Coffee', icon: Coffee },
  { name: 'Salad', icon: Salad },
  { name: 'Sandwich', icon: Sandwich },
  { name: 'IceCream', icon: IceCream2 },
  { name: 'Apple', icon: Apple },
  { name: 'Soup', icon: Soup },
  { name: 'Egg', icon: Egg },
  { name: 'Cookie', icon: Cookie },
  { name: 'Milk', icon: Milk },
  { name: 'Pizza', icon: Pizza },
  { name: 'Beef', icon: Beef },
  { name: 'Fish', icon: Fish },
  { name: 'Cake', icon: CakeSlice },
  { name: 'Grape', icon: Grape },
  { name: 'Carrot', icon: Carrot },
  { name: 'Wheat', icon: Wheat },
];

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#64748b',
];

function getIconComponent(iconName?: string): LucideIcon {
  const found = ICON_OPTIONS.find((o) => o.name === iconName);
  return found ? found.icon : UtensilsCrossed;
}

function CategoryIcon({ name, className }: { name?: string; className?: string }) {
  const Comp = getIconComponent(name);
  return <Comp className={className} />;
}

export default function MealCategoryManagement() {
  const [categories, setCategories] = useState<MealCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MealCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState<string | null>(null);

  // Preview dialog
  const [previewCat, setPreviewCat] = useState<MealCategory | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formOrder, setFormOrder] = useState('0');
  const [formActive, setFormActive] = useState(true);
  const [formColor, setFormColor] = useState('#3b82f6');
  const [formIcon, setFormIcon] = useState('Utensils');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catsData, itemsData] = await Promise.all([
        mealCategoryApi.getAll(),
        menuApi.getAll(),
      ]);
      setCategories(catsData);
      setMenuItems(Array.isArray(itemsData) ? itemsData : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Count menu items per category
  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    menuItems.forEach((item) => {
      const cat = item.category || 'other';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [menuItems]);

  const sorted = useMemo(() => {
    return [...categories].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
  }, [categories]);

  const filtered = useMemo(() => {
    return sorted.filter((cat) => {
      const matchesSearch =
        !searchQuery ||
        cat.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cat.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && cat.is_active !== false) ||
        (statusFilter === 'inactive' && cat.is_active === false);
      return matchesSearch && matchesStatus;
    });
  }, [sorted, searchQuery, statusFilter]);

  const openAddModal = () => {
    setEditing(null);
    setFormName('');
    setFormDescription('');
    setFormOrder(String(sorted.length * 10));
    setFormActive(true);
    setFormColor('#3b82f6');
    setFormIcon('Utensils');
    setShowModal(true);
  };

  const openEditModal = (cat: MealCategory) => {
    setEditing(cat);
    setFormName(cat.name);
    setFormDescription(cat.description || '');
    setFormOrder(String(cat.display_order || 0));
    setFormActive(cat.is_active !== false);
    const catAny = cat as Record<string, unknown>;
    setFormColor((catAny.color as string) || '#3b82f6');
    setFormIcon((catAny.icon as string) || 'Utensils');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Category name is required');
      return;
    }
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        display_order: parseInt(formOrder) || 0,
        is_active: formActive,
        color: formColor,
        icon: formIcon,
      };
      if (editing) {
        await mealCategoryApi.update(editing.id, data as Partial<MealCategory>);
        toast.success('Category updated');
      } else {
        await mealCategoryApi.create(data as Partial<MealCategory>);
        toast.success('Category created');
      }
      setShowModal(false);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: MealCategory) => {
    const count = itemCounts[cat.name] || 0;
    const msg = count > 0
      ? `Delete "${cat.name}"? It has ${count} linked menu item(s). This cannot be undone.`
      : `Delete "${cat.name}"? This cannot be undone.`;
    if (!confirm(msg)) return;
    try {
      await mealCategoryApi.delete(cat.id);
      toast.success('Category deleted');
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  const handleToggleStatus = async (cat: MealCategory) => {
    try {
      await mealCategoryApi.update(cat.id, { is_active: !cat.is_active });
      toast.success(`Category ${cat.is_active ? 'deactivated' : 'activated'}`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleMoveOrder = async (cat: MealCategory, direction: 'up' | 'down') => {
    const idx = sorted.findIndex((c) => c.id === cat.id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const other = sorted[swapIdx];
    setReordering(cat.id);
    try {
      const catOrder = cat.display_order ?? idx * 10;
      const otherOrder = other.display_order ?? swapIdx * 10;
      await Promise.all([
        mealCategoryApi.update(cat.id, { display_order: otherOrder }),
        mealCategoryApi.update(other.id, { display_order: catOrder }),
      ]);
      await loadData();
    } catch {
      toast.error('Failed to reorder');
    } finally {
      setReordering(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Meal Category Management</h1>
          <p className="text-muted-foreground mt-1">
            Organize and manage meal categories for menu items
          </p>
        </div>
        <Button onClick={openAddModal}>
          <Plus className="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all')}
              >
                All ({categories.length})
              </Button>
              <Button
                variant={statusFilter === 'active' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('active')}
              >
                Active ({categories.filter((c) => c.is_active !== false).length})
              </Button>
              <Button
                variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('inactive')}
              >
                Inactive ({categories.filter((c) => c.is_active === false).length})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Categories Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5" />
            Categories ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <UtensilsCrossed className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-semibold mb-1">No categories yet</h3>
              <p className="text-sm mb-4 max-w-sm mx-auto">
                Categories help organize your menu items. Create your first
                category to get started — try &quot;Breakfast&quot;, &quot;Lunch&quot;, or &quot;Snacks&quot;.
              </p>
              <Button onClick={openAddModal} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Create First Category
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Order</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((cat, idx) => {
                  const catAny = cat as Record<string, unknown>;
                  const color = (catAny.color as string) || '#3b82f6';
                  const iconName = (catAny.icon as string) || undefined;
                  return (
                    <TableRow key={cat.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={idx === 0 || reordering === cat.id}
                            onClick={() => handleMoveOrder(cat, 'up')}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={idx === filtered.length - 1 || reordering === cat.id}
                            onClick={() => handleMoveOrder(cat, 'down')}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div
                            className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: color + '20' }}
                          >
                            <CategoryIcon name={iconName} className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium flex items-center gap-2">
                              {cat.name}
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {cat.description || '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {itemCounts[cat.name] || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={cat.is_active !== false ? 'default' : 'secondary'}
                          className="cursor-pointer"
                          onClick={() => handleToggleStatus(cat)}
                        >
                          {cat.is_active !== false ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPreviewCat(cat)}
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditModal(cat)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(cat)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update the category details below.'
                : 'Create a new meal category for organizing menu items.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Breakfast, Lunch, Snacks"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>

            {/* Color Picker */}
            <div>
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      formColor === c
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setFormColor(c)}
                    type="button"
                  />
                ))}
              </div>
            </div>

            {/* Icon Selection */}
            <div>
              <Label>Icon</Label>
              <div className="grid grid-cols-6 gap-2 mt-2">
                {ICON_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.name}
                      className={`h-10 w-full rounded-lg border flex items-center justify-center transition-colors ${
                        formIcon === opt.name
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted'
                      }`}
                      onClick={() => setFormIcon(opt.name)}
                      type="button"
                      title={opt.name}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label>Display Order</Label>
              <Input
                type="number"
                value={formOrder}
                onChange={(e) => setFormOrder(e.target.value)}
                min="0"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formActive} onCheckedChange={setFormActive} />
              <Label>Active</Label>
            </div>

            {/* Live Preview */}
            <div>
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <div className="mt-2 border rounded-lg p-4 flex items-center gap-4">
                <div
                  className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: formColor + '20' }}
                >
                  <CategoryIcon name={formIcon} className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold flex items-center gap-2">
                    {formName || 'Category Name'}
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: formColor }}
                    />
                  </p>
                  <p className="text-sm text-muted-foreground truncate">
                    {formDescription || 'No description'}
                  </p>
                </div>
                <Badge variant={formActive ? 'default' : 'secondary'}>
                  {formActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewCat} onOpenChange={(open) => { if (!open) setPreviewCat(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Category Preview</DialogTitle>
            <DialogDescription>
              How this category appears in the system
            </DialogDescription>
          </DialogHeader>
          {previewCat && (() => {
            const catAny = previewCat as Record<string, unknown>;
            const color = (catAny.color as string) || '#3b82f6';
            const iconName = (catAny.icon as string) || undefined;
            const count = itemCounts[previewCat.name] || 0;
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-xl border">
                  <div
                    className="h-16 w-16 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: color + '20' }}
                  >
                    <CategoryIcon name={iconName} className="h-7 w-7" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      {previewCat.name}
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {previewCat.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant={previewCat.is_active !== false ? 'default' : 'secondary'}>
                        {previewCat.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {count} menu item{count !== 1 ? 's' : ''}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Order: {previewCat.display_order ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewCat(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}