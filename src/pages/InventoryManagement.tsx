import { useEffect, useState } from 'react';
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
import { Progress } from '@/components/ui/progress';
import {
  Search,
  Loader2,
  Package,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  Minus,
  PackageOpen,
} from 'lucide-react';
import { inventoryApi, type MenuItem } from '@/lib/api';
import { toast } from 'sonner';

type StockStatus = 'ok' | 'low' | 'out';

function getStockStatus(item: MenuItem): StockStatus {
  const qty = item.stock_quantity ?? 0;
  const threshold = item.low_stock_threshold ?? 5;
  if (qty <= 0) return 'out';
  if (qty <= threshold) return 'low';
  return 'ok';
}

export default function InventoryManagement() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');

  // Restock dialog
  const [restockItem, setRestockItem] = useState<MenuItem | null>(null);
  const [restockAmount, setRestockAmount] = useState('10');
  const [maxStockVal, setMaxStockVal] = useState('50');
  const [thresholdVal, setThresholdVal] = useState('5');

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const items = await inventoryApi.getAll();
      setMenuItems(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('Failed to load inventory:', err);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdjust = async (itemId: string, delta: number) => {
    try {
      const updated = await inventoryApi.adjustStock(itemId, delta);
      setMenuItems((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (err) {
      console.error('Failed to adjust stock:', err);
      toast.error('Failed to adjust stock');
    }
  };

  const handleRestock = async () => {
    if (!restockItem) return;
    const amount = parseInt(restockAmount, 10) || 0;
    const maxStock = parseInt(maxStockVal, 10) || 50;
    const threshold = parseInt(thresholdVal, 10) || 5;

    if (amount <= 0) {
      toast.error('Please enter a positive restock amount');
      return;
    }

    try {
      const updated = await inventoryApi.restock(restockItem.id, {
        amount,
        max_stock: maxStock,
        low_stock_threshold: threshold,
      });
      setMenuItems((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      toast.success(`Restocked ${restockItem.name} (+${amount})`);
      setRestockItem(null);
    } catch (err) {
      console.error('Failed to restock:', err);
      toast.error('Failed to restock item');
    }
  };

  const openRestockDialog = (item: MenuItem) => {
    setRestockItem(item);
    setRestockAmount('10');
    setMaxStockVal(String(item.max_stock ?? 50));
    setThresholdVal(String(item.low_stock_threshold ?? 5));
  };

  // Get unique categories
  const categories = Array.from(
    new Set(menuItems.map((i) => i.category).filter(Boolean))
  );

  // Filter items
  const filtered = menuItems.filter((item) => {
    const status = getStockStatus(item);
    const matchesSearch =
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || item.category === categoryFilter;
    const matchesStock =
      stockFilter === 'all' ||
      (stockFilter === 'low' && status === 'low') ||
      (stockFilter === 'out' && status === 'out') ||
      (stockFilter === 'ok' && status === 'ok');
    return matchesSearch && matchesCategory && matchesStock;
  });

  // Summary
  const totalItems = menuItems.length;
  const lowStockItems = menuItems.filter(
    (i) => getStockStatus(i) === 'low'
  ).length;
  const outOfStockItems = menuItems.filter(
    (i) => getStockStatus(i) === 'out'
  ).length;
  const wellStockedItems = totalItems - lowStockItems - outOfStockItems;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Inventory Management
          </h1>
          <p className="text-muted-foreground">
            Track stock levels and manage restocking
          </p>
        </div>
        <Button variant="outline" onClick={loadItems} disabled={loading}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalItems}</p>
              <p className="text-xs text-muted-foreground">Total Items</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{wellStockedItems}</p>
              <p className="text-xs text-muted-foreground">Well Stocked</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{lowStockItems}</p>
              <p className="text-xs text-muted-foreground">Low Stock</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{outOfStockItems}</p>
              <p className="text-xs text-muted-foreground">Out of Stock</p>
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
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat} className="capitalize">
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Stock Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="ok">Well Stocked</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <PackageOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No items found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stock Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Quick Adjust</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => {
                  const qty = item.stock_quantity ?? 0;
                  const max = item.max_stock ?? 50;
                  const status = getStockStatus(item);
                  const pct = max > 0 ? (qty / max) * 100 : 0;

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="h-9 w-9 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                              <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              ${item.price.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {item.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 w-32">
                          <div className="flex justify-between text-xs">
                            <span className="font-mono">{qty}</span>
                            <span className="text-muted-foreground">
                              / {max}
                            </span>
                          </div>
                          <Progress
                            value={pct}
                            className={`h-2 ${
                              status === 'out'
                                ? '[&>div]:bg-red-500'
                                : status === 'low'
                                ? '[&>div]:bg-amber-500'
                                : '[&>div]:bg-emerald-500'
                            }`}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        {status === 'out' ? (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                            Out of Stock
                          </Badge>
                        ) : status === 'low' ? (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                            Low Stock
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            In Stock
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleQuickAdjust(item.id, -1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-mono">
                            {qty}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleQuickAdjust(item.id, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRestockDialog(item)}
                        >
                          Restock
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

      {/* Restock Dialog */}
      <Dialog
        open={!!restockItem}
        onOpenChange={(open) => !open && setRestockItem(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Restock Item</DialogTitle>
            <DialogDescription>
              {restockItem?.name} — Current stock:{' '}
              {restockItem?.stock_quantity ?? 0}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Add Quantity</Label>
              <Input
                type="number"
                min="1"
                value={restockAmount}
                onChange={(e) => setRestockAmount(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Max Stock</Label>
                <Input
                  type="number"
                  min="1"
                  value={maxStockVal}
                  onChange={(e) => setMaxStockVal(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Low Threshold</Label>
                <Input
                  type="number"
                  min="0"
                  value={thresholdVal}
                  onChange={(e) => setThresholdVal(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestockItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleRestock}>Restock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}