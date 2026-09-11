import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Wallet,
  ShoppingCart,
  Loader2,
  CheckCircle2,
  User,
  X,
  Maximize,
  Minimize,
  Pause,
  Play,
  Clock,
  TrendingUp,
  DollarSign,
  Hash,
  AlertTriangle,
  Percent,
  StickyNote,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Star,
  Volume2,
  VolumeX,
  Keyboard,
  Printer,
  Mail,
  SkipForward,
} from 'lucide-react';
import {
  menuApi,
  studentApi,
  transactionApi,
  dietaryApi,
  mealCategoryApi,
  settingsApi,
  type MenuItem,
  type Student,
  type TodayStats,
  type PopularItem,
  type RecentCashierTx,
  type MealCategory,
  type DietaryRestriction,
} from '@/lib/api';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  addedAt: number; // timestamp for animation
}

interface HeldOrder {
  id: string;
  cart: CartItem[];
  student: Student | null;
  notes: string;
  timestamp: number;
}

interface DiscountState {
  type: 'percentage' | 'fixed' | null;
  amount: number;
  reason: string;
}

// ─── Audio helper ────────────────────────────────────────────────────────────

const audioCtxRef = { current: null as AudioContext | null };

function playClickSound() {
  try {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.value = 0.08;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // ignore audio errors
  }
}

function playSuccessSound() {
  try {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.value = 0.1;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15 * (i + 1) + 0.1);
      osc.start(ctx.currentTime + 0.15 * i);
      osc.stop(ctx.currentTime + 0.15 * (i + 1) + 0.1);
    });
  } catch {
    // ignore
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EMPTY_CART_IMG =
  'https://mgx-backend-cdn.metadl.com/generate/images/737931/2026-03-06/0fc315d6-b166-4dce-93bd-7828e134a0d4.png';

const CASH_PRESETS = [1, 5, 10, 20, 50, 100];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);

// ─── Component ───────────────────────────────────────────────────────────────

export default function PosTerminal() {
  // Menu state
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [menuSearch, setMenuSearch] = useState('');
  const [mealCategories, setMealCategories] = useState<MealCategory[]>([]);

  // Student state
  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentResults, setStudentResults] = useState<Student[]>([]);
  const [searchingStudent, setSearchingStudent] = useState(false);
  const [studentRestrictions, setStudentRestrictions] = useState<DietaryRestriction[]>([]);
  const [allergenWarnings, setAllergenWarnings] = useState<string[]>([]);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('account');
  const [orderNotes, setOrderNotes] = useState('');

  // Discount state
  const [discount, setDiscount] = useState<DiscountState>({ type: null, amount: 0, reason: '' });
  const [showDiscountPanel, setShowDiscountPanel] = useState(false);

  // Cash payment state
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [showNumpad, setShowNumpad] = useState(false);
  const [numpadValue, setNumpadValue] = useState('');

  // Transaction state
  const [processing, setProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Receipt prompt state
  const [showReceiptPrompt, setShowReceiptPrompt] = useState(false);
  const [completedTxId, setCompletedTxId] = useState<string | null>(null);
  const [completedCartSnapshot, setCompletedCartSnapshot] = useState<CartItem[]>([]);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [completedSubtotal, setCompletedSubtotal] = useState(0);
  const [completedPaymentMethod, setCompletedPaymentMethod] = useState('');
  const [completedStudent, setCompletedStudent] = useState<Student | null>(null);
  const [completedDiscount, setCompletedDiscount] = useState<DiscountState>({ type: null, amount: 0, reason: '' });
  const [completedCashReceived, setCompletedCashReceived] = useState(0);
  const [completedChangeDue, setCompletedChangeDue] = useState(0);
  const [emailingReceipt, setEmailingReceipt] = useState(false);

  // Held orders
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);

  // Negative balance settings
  const [negativeBalanceEnabled, setNegativeBalanceEnabled] = useState(false);
  const [negativeBalanceCap, setNegativeBalanceCap] = useState(0);

  // Daily stats
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [popularItems, setPopularItems] = useState<PopularItem[]>([]);
  const [recentTxns, setRecentTxns] = useState<RecentCashierTx[]>([]);
  const [showRecentPanel, setShowRecentPanel] = useState(false);

  // UI state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Mobile view toggle
  const [mobileView, setMobileView] = useState<'menu' | 'cart'>('menu');

  // Refs
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const barcodeBufferRef = useRef('');
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    loadMenu();
    loadCategories();
    loadTodayStats();
    loadPopularItems();
    loadRecentTxns();
    loadNegativeBalanceCap();
  }, []);

  const loadMenu = async () => {
    try {
      setMenuLoading(true);
      const items = await menuApi.getAvailable();
      setMenuItems(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('Failed to load menu:', err);
      toast.error('Failed to load menu items');
    } finally {
      setMenuLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const cats = await mealCategoryApi.getAll();
      setMealCategories(Array.isArray(cats) ? cats : []);
    } catch {
      // ignore
    }
  };

  const loadTodayStats = async () => {
    try {
      const stats = await transactionApi.getTodayStats();
      setTodayStats(stats);
    } catch {
      // ignore
    }
  };

  const loadPopularItems = async () => {
    try {
      const items = await transactionApi.getPopularItems();
      setPopularItems(Array.isArray(items) ? items : []);
    } catch {
      // ignore
    }
  };

  const loadRecentTxns = async () => {
    try {
      const txns = await transactionApi.getRecentCashier();
      setRecentTxns(Array.isArray(txns) ? txns : []);
    } catch {
      // ignore
    }
  };

  const loadNegativeBalanceCap = async () => {
    // Load enabled flag
    try {
      const enabledResult = await settingsApi.getByKey<unknown>('negative_balance_enabled');
      // The API returns the raw JSON value from system_config.
      // It could be: true, "true", or a JSON-stringified string like '"true"'
      let enabled = false;
      if (enabledResult === true || enabledResult === 'true') {
        enabled = true;
      } else if (typeof enabledResult === 'string') {
        try {
          const parsed = JSON.parse(enabledResult);
          enabled = parsed === true || parsed === 'true';
        } catch {
          enabled = enabledResult.toLowerCase() === 'true';
        }
      }
      setNegativeBalanceEnabled(enabled);
    } catch {
      setNegativeBalanceEnabled(false);
    }
    // Load cap amount
    try {
      const result = await settingsApi.getByKey<unknown>('negative_balance_cap');
      // The API returns the raw JSON value — could be a number, string number, or JSON-stringified
      let cap = 0;
      if (typeof result === 'number') {
        cap = result;
      } else if (typeof result === 'string') {
        try {
          const parsed = JSON.parse(result);
          cap = parseFloat(String(parsed)) || 0;
        } catch {
          cap = parseFloat(result) || 0;
        }
      } else if (result && typeof result === 'object') {
        // Handle { value: ... } wrapper if present
        const val = (result as Record<string, unknown>).value ?? result;
        cap = parseFloat(String(val)) || 0;
      }
      setNegativeBalanceCap(cap);
    } catch {
      setNegativeBalanceCap(0);
    }
  };

  // ─── Student search ────────────────────────────────────────────────────────

  const searchStudent = useCallback(async (q?: string) => {
    const query = q || studentQuery;
    if (!query.trim()) return;
    setSearchingStudent(true);
    try {
      const results = await studentApi.search(query.trim());
      setStudentResults(Array.isArray(results) ? results : []);
      // If barcode scan returned exactly 1 result, auto-select
      if (q && Array.isArray(results) && results.length === 1) {
        selectStudent(results[0]);
        setStudentResults([]);
      }
    } catch (err) {
      console.error('Student search failed:', err);
      toast.error('Student search failed');
    } finally {
      setSearchingStudent(false);
    }
  }, [studentQuery]);

  // Real-time debounced student search as user types
  const studentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (selectedStudent) return; // Don't search if student already selected
    if (studentQuery.trim().length < 2) {
      setStudentResults([]);
      return;
    }
    if (studentDebounceRef.current) clearTimeout(studentDebounceRef.current);
    studentDebounceRef.current = setTimeout(() => {
      searchStudent(studentQuery.trim());
    }, 300);
    return () => {
      if (studentDebounceRef.current) clearTimeout(studentDebounceRef.current);
    };
  }, [studentQuery, selectedStudent, searchStudent]);

  const selectStudent = async (s: Student) => {
    setSelectedStudent(s);
    setStudentResults([]);
    // Load dietary restrictions
    try {
      const restrictions = await dietaryApi.getStudentRestrictions(s.id);
      setStudentRestrictions(Array.isArray(restrictions) ? restrictions : []);
    } catch {
      setStudentRestrictions([]);
    }
  };

  // ─── Barcode scanner detection ─────────────────────────────────────────────

  const handleBarcodeInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setStudentQuery(val);

    // Detect rapid input (barcode scanner types fast)
    if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
    barcodeBufferRef.current += val.slice(-1);

    barcodeTimerRef.current = setTimeout(() => {
      if (barcodeBufferRef.current.length >= 4) {
        // Likely a barcode scan - auto search
        searchStudent(val);
      }
      barcodeBufferRef.current = '';
    }, 100);
  }, [searchStudent]);

  // ─── Allergen checking ─────────────────────────────────────────────────────

  const checkAllergens = useCallback((item: MenuItem): string[] => {
    if (!selectedStudent || studentRestrictions.length === 0) return [];
    const warnings: string[] = [];
    const itemAllergens = (item.allergens || []).map(a => a.toLowerCase());
    const itemTags = (item.dietary_tags || []).map(t => t.toLowerCase());

    for (const restriction of studentRestrictions) {
      const rName = restriction.restriction_name.toLowerCase();
      if (itemAllergens.some(a => a.includes(rName) || rName.includes(a))) {
        warnings.push(`⚠️ Contains ${restriction.restriction_name} - student has ${restriction.restriction_name} restriction (${restriction.severity})`);
      }
      if (itemTags.some(t => t.includes(rName) || rName.includes(t))) {
        warnings.push(`⚠️ Tagged as ${restriction.restriction_name} - conflicts with student restriction`);
      }
    }
    return warnings;
  }, [selectedStudent, studentRestrictions]);

  // ─── Cart operations ───────────────────────────────────────────────────────

  const addToCart = (item: MenuItem) => {
    if (soundEnabled) playClickSound();

    // Check allergens
    const warnings = checkAllergens(item);
    if (warnings.length > 0) {
      setAllergenWarnings(warnings);
      // Still add but show warning
      toast.warning(warnings[0], { duration: 4000 });
    }

    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItem.id === item.id
            ? { ...c, quantity: c.quantity + 1, addedAt: Date.now() }
            : c
        );
      }
      return [...prev, { menuItem: item, quantity: 1, addedAt: Date.now() }];
    });

    // Show a brief toast on mobile instead of auto-switching to cart
    // This keeps users on the menu to continue adding items
  };

  const updateQuantity = (itemId: string, delta: number) => {
    if (soundEnabled) playClickSound();
    setCart((prev) =>
      prev
        .map((c) =>
          c.menuItem.id === itemId
            ? { ...c, quantity: Math.max(0, c.quantity + delta) }
            : c
        )
        .filter((c) => c.quantity > 0)
    );
  };

  const removeFromCart = (itemId: string) => {
    if (soundEnabled) playClickSound();
    setCart((prev) => prev.filter((c) => c.menuItem.id !== itemId));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedStudent(null);
    setStudentQuery('');
    setStudentResults([]);
    setStudentRestrictions([]);
    setAllergenWarnings([]);
    setOrderNotes('');
    setDiscount({ type: null, amount: 0, reason: '' });
    setCashReceived(0);
    setShowDiscountPanel(false);
    setShowNumpad(false);
  };

  // ─── Cart item count map ───────────────────────────────────────────────────

  const cartCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    cart.forEach((c) => { map[c.menuItem.id] = c.quantity; });
    return map;
  }, [cart]);

  // ─── Totals ────────────────────────────────────────────────────────────────

  const subtotal = cart.reduce(
    (sum, c) => sum + c.menuItem.price * c.quantity,
    0
  );

  const discountAmount = useMemo(() => {
    if (!discount.type || discount.amount <= 0) return 0;
    if (discount.type === 'percentage') return subtotal * (discount.amount / 100);
    return Math.min(discount.amount, subtotal);
  }, [discount, subtotal]);

  const total = Math.max(0, subtotal - discountAmount);
  const changeDue = paymentMethod === 'cash' ? Math.max(0, cashReceived - total) : 0;

  // ─── Balance warning for account payment ───────────────────────────────────

  const balanceWarning = useMemo(() => {
    if (paymentMethod !== 'account' || !selectedStudent || cart.length === 0) return null;
    const balance = selectedStudent.balance;
    const resultingBalance = balance - total;

    if (resultingBalance >= 0) return null;

    // If negative balances are enabled and within the cap, show warning (but allow)
    if (negativeBalanceEnabled && negativeBalanceCap > 0 && resultingBalance >= -negativeBalanceCap) {
      return {
        type: 'warning' as const,
        message: `Balance will go to ${formatCurrency(resultingBalance)}. Within negative limit of ${formatCurrency(-negativeBalanceCap)}.`,
      };
    }

    // If negative balances are enabled but would exceed the cap
    if (negativeBalanceEnabled && negativeBalanceCap > 0) {
      return {
        type: 'error' as const,
        message: `Would exceed negative balance limit of ${formatCurrency(-negativeBalanceCap)}. Resulting: ${formatCurrency(resultingBalance)}`,
      };
    }

    // Negative balances not enabled at all
    return {
      type: 'error' as const,
      message: `Insufficient balance (${formatCurrency(balance)}). Negative balances are not allowed.`,
    };
  }, [paymentMethod, selectedStudent, total, negativeBalanceEnabled, negativeBalanceCap, cart.length]);

  // ─── Hold / Resume orders ──────────────────────────────────────────────────

  const holdOrder = () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    const held: HeldOrder = {
      id: `HOLD-${Date.now()}`,
      cart: [...cart],
      student: selectedStudent,
      notes: orderNotes,
      timestamp: Date.now(),
    };
    setHeldOrders((prev) => [...prev, held]);
    clearCart();
    toast.success('Order held');
    if (soundEnabled) playClickSound();
  };

  const resumeOrder = (heldId: string) => {
    const held = heldOrders.find((h) => h.id === heldId);
    if (!held) return;
    // Save current cart if not empty
    if (cart.length > 0) {
      holdOrder();
    }
    setCart(held.cart);
    setSelectedStudent(held.student);
    setOrderNotes(held.notes);
    setHeldOrders((prev) => prev.filter((h) => h.id !== heldId));
    toast.success('Order resumed');
  };

  // ─── Fullscreen ────────────────────────────────────────────────────────────

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // ─── Print receipt ─────────────────────────────────────────────────────────

  const printReceipt = (
    cartItems: CartItem[],
    totalAmt: number,
    subtotalAmt: number,
    method: string,
    student: Student | null,
    discountInfo: DiscountState,
    cashRcv: number,
    changeAmt: number
  ) => {
    const receiptWindow = window.open('', '_blank', 'width=320,height=600');
    if (!receiptWindow) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const receiptNum = `RCP-${Date.now().toString().slice(-8)}`;

    const itemsHtml = cartItems
      .map(
        (c) =>
          `<tr>
            <td style="padding:2px 0">${c.menuItem.name}</td>
            <td style="text-align:center;padding:2px 4px">${c.quantity}</td>
            <td style="text-align:right;padding:2px 0">$${(c.menuItem.price * c.quantity).toFixed(2)}</td>
          </tr>`
      )
      .join('');

    const discountHtml = discountInfo.type
      ? `<div style="display:flex;justify-content:space-between;color:#c00"><span>Discount${discountInfo.type === 'percentage' ? ` (${discountInfo.amount}%)` : ''}:</span><span>-$${(subtotalAmt - totalAmt).toFixed(2)}</span></div>`
      : '';

    const cashHtml = method === 'cash'
      ? `<div style="margin-top:4px"><div style="display:flex;justify-content:space-between"><span>Cash Received:</span><span>$${cashRcv.toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;font-weight:bold"><span>Change:</span><span>$${changeAmt.toFixed(2)}</span></div></div>`
      : '';

    receiptWindow.document.write(`
      <!DOCTYPE html><html><head><title>Receipt</title></head>
      <body style="font-family:monospace;width:280px;margin:0 auto;padding:16px;font-size:12px">
        <div style="text-align:center;margin-bottom:12px">
          <h2 style="margin:0;font-size:16px">YAMZ Cafe</h2>
          <p style="margin:4px 0;font-size:10px">School Cafeteria POS</p>
          <hr style="border:1px dashed #999">
        </div>
        <div style="margin-bottom:8px">
          <p style="margin:2px 0">Date: ${dateStr}</p>
          <p style="margin:2px 0">Time: ${timeStr}</p>
          <p style="margin:2px 0">Receipt: ${receiptNum}</p>
          ${student ? `<p style="margin:2px 0">Student: ${student.full_name}</p>` : ''}
          <p style="margin:2px 0">Payment: ${method.charAt(0).toUpperCase() + method.slice(1)}</p>
        </div>
        <hr style="border:1px dashed #999">
        <table style="width:100%;border-collapse:collapse;margin:8px 0">
          <tr style="border-bottom:1px solid #ccc"><th style="text-align:left;padding:4px 0">Item</th><th style="text-align:center;padding:4px">Qty</th><th style="text-align:right;padding:4px 0">Price</th></tr>
          ${itemsHtml}
        </table>
        <hr style="border:1px dashed #999">
        <div style="margin:8px 0">
          <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>$${subtotalAmt.toFixed(2)}</span></div>
          ${discountHtml}
          <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:4px">
            <span>TOTAL:</span><span>$${totalAmt.toFixed(2)}</span>
          </div>
          ${cashHtml}
        </div>
        <hr style="border:1px dashed #999">
        <div style="text-align:center;margin-top:12px;font-size:10px">
          <p>Thank you for your purchase!</p><p>Have a great day! 🍕</p>
        </div>
        <script>window.onload=function(){window.print();}</script>
      </body></html>
    `);
    receiptWindow.document.close();
  };

  // ─── Process transaction ───────────────────────────────────────────────────

  const handleReceiptPrint = () => {
    printReceipt(
      completedCartSnapshot, completedTotal, completedSubtotal,
      completedPaymentMethod, completedStudent, completedDiscount,
      completedCashReceived, completedChangeDue
    );
    setShowReceiptPrompt(false);
    toast.success('Receipt sent to printer');
  };

  const handleReceiptEmail = async () => {
    if (!completedTxId) return;
    setEmailingReceipt(true);
    try {
      const result = await transactionApi.emailReceipt(completedTxId);
      toast.success(`Receipt emailed to ${result.email}`);
      setShowReceiptPrompt(false);
    } catch (err) {
      console.error('Email receipt failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to email receipt');
    } finally {
      setEmailingReceipt(false);
    }
  };

  const handleReceiptSkip = () => {
    setShowReceiptPrompt(false);
  };

  const processTransaction = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    if (paymentMethod === 'account' && !selectedStudent) {
      toast.error('Please select a student for account payment');
      return;
    }
    if (paymentMethod === 'cash' && cashReceived < total) {
      toast.error('Cash received is less than total');
      return;
    }
    if (balanceWarning?.type === 'error') {
      toast.error(balanceWarning.message);
      return;
    }

    setProcessing(true);
    try {
      const txResult = await transactionApi.create({
        student_id: selectedStudent?.id || '',
        items: cart.map((c) => ({
          menu_item_id: c.menuItem.id,
          quantity: c.quantity,
        })),
        payment_method: paymentMethod,
        notes: orderNotes || undefined,
        cash_received: paymentMethod === 'cash' ? cashReceived : undefined,
        change_given: paymentMethod === 'cash' ? changeDue : undefined,
        discount_amount: discount.type ? discount.amount : undefined,
        discount_type: discount.type || undefined,
        discount_reason: discount.reason || undefined,
      });

      // Snapshot data for receipt prompt
      setCompletedTxId(txResult.id);
      setCompletedCartSnapshot([...cart]);
      setCompletedTotal(total);
      setCompletedSubtotal(subtotal);
      setCompletedPaymentMethod(paymentMethod);
      setCompletedStudent(selectedStudent);
      setCompletedDiscount({ ...discount });
      setCompletedCashReceived(cashReceived);
      setCompletedChangeDue(changeDue);

      if (soundEnabled) playSuccessSound();
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        // Show receipt prompt after success animation
        setShowReceiptPrompt(true);
        clearCart();
        loadTodayStats();
        loadRecentTxns();
      }, 2000);

      toast.success('Transaction completed!');
    } catch (err) {
      console.error('Transaction failed:', err);
      toast.error(err instanceof Error ? err.message : 'Transaction failed');
    } finally {
      setProcessing(false);
    }
  };

  // ─── Quick reorder from recent ─────────────────────────────────────────────

  const quickReorder = (tx: RecentCashierTx) => {
    const items = tx.items || [];
    const newCart: CartItem[] = [];
    for (const item of items) {
      const menuItem = menuItems.find(
        (mi) => mi.name === item.name
      );
      if (menuItem) {
        newCart.push({ menuItem, quantity: item.quantity, addedAt: Date.now() });
      }
    }
    if (newCart.length > 0) {
      setCart(newCart);
      toast.success('Items loaded from previous order');
    } else {
      toast.error('Could not find matching menu items');
    }
  };

  // ─── Numpad for cash ───────────────────────────────────────────────────────

  const handleNumpadPress = (key: string) => {
    if (soundEnabled) playClickSound();
    if (key === 'C') {
      setNumpadValue('');
      setCashReceived(0);
    } else if (key === '⌫') {
      const newVal = numpadValue.slice(0, -1);
      setNumpadValue(newVal);
      setCashReceived(parseFloat(newVal) || 0);
    } else if (key === '.') {
      if (!numpadValue.includes('.')) {
        const newVal = numpadValue + '.';
        setNumpadValue(newVal);
      }
    } else if (key === 'OK') {
      setShowNumpad(false);
    } else {
      const newVal = numpadValue + key;
      setNumpadValue(newVal);
      setCashReceived(parseFloat(newVal) || 0);
    }
  };

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Enter') {
        e.preventDefault();
        processTransaction();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearCart();
      } else if (e.key === 'F1') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      } else if (e.key === 'F2') {
        e.preventDefault();
        holdOrder();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, paymentMethod, selectedStudent, processing, total, cashReceived]);

  // ─── Categories with colors ────────────────────────────────────────────────

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    menuItems.forEach((i) => {
      if (i.category) {
        const key = i.category.toLowerCase().replace(/s$/, '');
        if (!seen.has(key)) seen.set(key, i.category);
      }
    });
    return ['all', ...Array.from(seen.values())];
  }, [menuItems]);

  const getCategoryColor = (catName: string) => {
    const mc = mealCategories.find((c) => c.name === catName);
    return mc?.color || undefined;
  };

  const filteredMenu = useMemo(() => {
    let items = menuItems;
    if (categoryFilter !== 'all') {
      const filterKey = categoryFilter.toLowerCase().replace(/s$/, '');
      items = items.filter((i) => i.category && i.category.toLowerCase().replace(/s$/, '') === filterKey);
    }
    if (menuSearch.trim()) {
      const q = menuSearch.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.category && i.category.toLowerCase().includes(q)) ||
          (i.description && i.description.toLowerCase().includes(q))
      );
    }
    return items;
  }, [menuItems, categoryFilter, menuSearch]);

  // ─── Success overlay ───────────────────────────────────────────────────────

  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-50 bg-emerald-600 flex items-center justify-center">
        <div className="text-center text-white animate-in fade-in zoom-in duration-300">
          <CheckCircle2 className="h-24 w-24 mx-auto mb-4" />
          <h2 className="text-3xl font-bold mb-2">Transaction Complete!</h2>
          <p className="text-emerald-100 text-lg">{formatCurrency(total)}</p>
          {paymentMethod === 'cash' && changeDue > 0 && (
            <p className="text-emerald-200 text-2xl font-bold mt-2">
              Change: {formatCurrency(changeDue)}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
      {/* Top Stats Bar */}
      <div className="flex items-center gap-3 px-2 py-1.5 bg-muted/40 border-b text-sm shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <DollarSign className="h-3.5 w-3.5" />
          <span className="font-medium">Today:</span>
          <span className="font-bold text-foreground">
            {formatCurrency(parseFloat(todayStats?.total_sales || '0'))}
          </span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Hash className="h-3.5 w-3.5" />
          <span>{todayStats?.total_transactions || '0'} txns</span>
        </div>
        <Separator orientation="vertical" className="h-4" />
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Avg: {formatCurrency(parseFloat(todayStats?.avg_order || '0'))}</span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {heldOrders.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              {heldOrders.length} held
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setShowRecentPanel(!showRecentPanel)}
          >
            <Clock className="h-3.5 w-3.5 mr-1" />
            Recent
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={toggleFullscreen}
            title="Toggle fullscreen"
          >
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </Button>
          <div className="text-[10px] text-muted-foreground ml-1 hidden lg:block">
            <Keyboard className="h-3 w-3 inline mr-0.5" />
            Enter=Pay Esc=Clear F1=Search F2=Hold
          </div>
        </div>
      </div>

      {/* Mobile Tab Toggle */}
      <div className="flex lg:hidden border-b shrink-0">
        <button
          onClick={() => setMobileView('menu')}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
            mobileView === 'menu'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <Search className="h-4 w-4 inline mr-1.5" />
          Menu Items
        </button>
        <button
          onClick={() => setMobileView('cart')}
          className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors relative ${
            mobileView === 'cart'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
          }`}
        >
          <ShoppingCart className="h-4 w-4 inline mr-1.5" />
          Cart
          {cart.length > 0 && (
            <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">
              {cart.reduce((s, c) => s + c.quantity, 0)}
            </Badge>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 gap-0 min-h-0 overflow-hidden">
        {/* Left: Menu Area */}
        <div className={`flex-1 flex flex-col min-w-0 border-r ${mobileView !== 'menu' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Student Search Bar */}
          <div className="p-2 border-b bg-background">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={barcodeInputRef}
                  placeholder="Scan barcode or search student..."
                  value={studentQuery}
                  onChange={handleBarcodeInput}
                  onKeyDown={(e) => e.key === 'Enter' && searchStudent()}
                  className="pl-9 h-10 text-base"
                />
              </div>
              <Button
                onClick={() => searchStudent()}
                disabled={searchingStudent}
                variant="secondary"
                className="h-10 min-w-[80px]"
              >
                {searchingStudent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Search'
                )}
              </Button>
            </div>

            {/* Selected Student */}
            {selectedStudent && (
              <div className="mt-2 flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-2">
                {selectedStudent.photo ? (
                  <img
                    src={selectedStudent.photo}
                    alt={selectedStudent.full_name}
                    className="h-10 w-10 rounded-full object-cover border-2 border-emerald-300"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                    <User className="h-5 w-5 text-emerald-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {selectedStudent.full_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ID: {selectedStudent.student_id} • Balance:{' '}
                    <span className={selectedStudent.balance < 0 ? 'text-red-500 font-bold' : 'text-emerald-600 font-bold'}>
                      {formatCurrency(selectedStudent.balance)}
                    </span>
                  </p>
                </div>
                {studentRestrictions.length > 0 && (
                  <Badge variant="destructive" className="text-[10px] shrink-0">
                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                    {studentRestrictions.length} restriction{studentRestrictions.length > 1 ? 's' : ''}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedStudent(null);
                    setStudentRestrictions([]);
                    setAllergenWarnings([]);
                  }}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Allergen Warnings */}
            {allergenWarnings.length > 0 && selectedStudent && (
              <div className="mt-1 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg">
                {allergenWarnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-800 dark:text-amber-300">{w}</p>
                ))}
              </div>
            )}

            {/* Search Results */}
            {studentResults.length > 0 && !selectedStudent && (
              <div className="mt-2 border rounded-lg divide-y max-h-40 overflow-auto bg-background shadow-lg">
                {studentResults.slice(0, 5).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectStudent(s)}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-center gap-2 text-sm"
                  >
                    {s.photo ? (
                      <img src={s.photo} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <User className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">{s.full_name}</span>
                    <span className="text-muted-foreground">({s.student_id})</span>
                    <span className="ml-auto font-mono text-xs">
                      {formatCurrency(s.balance)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category Filter + Item Search */}
          <div className="flex items-center gap-2 px-2 py-1.5 border-b bg-muted/20 shrink-0">
            <div className="flex gap-1.5 overflow-x-auto flex-1">
              {categories.map((cat) => {
                const color = cat !== 'all' ? getCategoryColor(cat) : undefined;
                const isActive = categoryFilter === cat;
                return (
                  <Button
                    key={cat}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCategoryFilter(cat)}
                    className="capitalize whitespace-nowrap min-h-[32px] h-8 px-3 text-xs font-medium"
                    style={
                      color && !isActive
                        ? { borderColor: color, color: color }
                        : color && isActive
                          ? { backgroundColor: color, borderColor: color, color: '#fff' }
                          : undefined
                    }
                  >
                    {cat}
                  </Button>
                );
              })}
            </div>
            <div className="relative shrink-0 w-40 lg:w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
              {menuSearch && (
                <button
                  onClick={() => setMenuSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Popular Items Bar */}
          {popularItems.length > 0 && categoryFilter === 'all' && (
            <div className="px-2 py-1.5 border-b bg-amber-50/50 dark:bg-amber-950/20 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400 shrink-0">Quick:</span>
                {popularItems.slice(0, 8).map((pi) => {
                  const menuItem = menuItems.find((m) => m.id === pi.menu_item_id);
                  if (!menuItem) return null;
                  return (
                    <button
                      key={pi.menu_item_id}
                      onClick={() => addToCart(menuItem)}
                      className="shrink-0 px-2.5 py-1 bg-white dark:bg-gray-800 border rounded-full text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors flex items-center gap-1"
                    >
                      {pi.name}
                      <span className="text-muted-foreground">{formatCurrency(menuItem.price)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Menu Grid */}
          <div className="flex-1 overflow-auto p-2">
            {menuLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredMenu.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No menu items available</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-1.5">
                {filteredMenu.map((item) => {
                  const inCart = cartCountMap[item.id];
                  const hasAllergenConflict = selectedStudent && studentRestrictions.length > 0 && checkAllergens(item).length > 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className={`relative bg-card border rounded-lg p-2 text-left transition-all group active:scale-95 ${
                        hasAllergenConflict
                          ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
                          : 'hover:shadow-md hover:border-primary/30'
                      }`}
                    >
                      {/* Quantity badge */}
                      {inCart && (
                        <div className="absolute -top-1 -right-1 z-10 bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-[10px] font-bold shadow-md animate-in zoom-in duration-200">
                          {inCart}
                        </div>
                      )}
                      {/* Allergen indicator */}
                      {hasAllergenConflict && (
                        <div className="absolute top-1 left-1 z-10">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </div>
                      )}
                      {item.image && (
                        <div className="aspect-[3/2] rounded bg-muted mb-1.5 overflow-hidden">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                      )}
                      <h3 className="font-semibold text-xs truncate">{item.name}</h3>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="font-bold text-sm text-primary">
                          {formatCurrency(item.price)}
                        </span>
                        {item.category && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1 py-0"
                            style={getCategoryColor(item.category) ? { backgroundColor: getCategoryColor(item.category) + '20', color: getCategoryColor(item.category) } : undefined}
                          >
                            {item.category}
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart Panel */}
        <div className={`w-full lg:w-[380px] xl:w-[420px] flex flex-col bg-background shrink-0 ${mobileView !== 'cart' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-3 py-2 border-b flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            <span className="font-bold text-lg">Order</span>
            {cart.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {cart.reduce((s, c) => s + c.quantity, 0)} items
              </Badge>
            )}
            <div className="ml-auto flex gap-1">
              {heldOrders.length > 0 && (
                <Select onValueChange={resumeOrder}>
                  <SelectTrigger className="h-8 w-auto text-xs gap-1">
                    <Play className="h-3 w-3" />
                    Resume ({heldOrders.length})
                  </SelectTrigger>
                  <SelectContent>
                    {heldOrders.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.student?.full_name || 'Guest'} • {h.cart.length} items •{' '}
                        {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={holdOrder}
                disabled={cart.length === 0}
              >
                <Pause className="h-3 w-3 mr-1" />
                Hold
              </Button>
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-auto px-3 py-2 space-y-1.5 min-h-0">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <img
                  src={EMPTY_CART_IMG}
                  alt="Empty cart"
                  className="h-20 w-20 mb-3 opacity-60"
                />
                <p className="text-sm">No items in cart</p>
                <p className="text-xs">Tap menu items to add</p>
              </div>
            ) : (
              cart.map((c) => (
                <div
                  key={c.menuItem.id}
                  className="flex items-center gap-2 bg-muted/30 rounded-lg p-2 animate-in slide-in-from-right-2 duration-200"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {c.menuItem.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(c.menuItem.price)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(c.menuItem.id, -1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-8 text-center text-sm font-bold">
                      {c.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(c.menuItem.id, 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeFromCart(c.menuItem.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-sm font-bold w-16 text-right">
                    {formatCurrency(c.menuItem.price * c.quantity)}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Totals & Payment */}
          {cart.length > 0 && (
            <div className="border-t px-3 py-2 space-y-2 bg-muted/10">
              {/* Order Notes */}
              <div className="flex items-center gap-2">
                <StickyNote className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Order notes..."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              {/* Discount */}
              <div>
                <button
                  onClick={() => setShowDiscountPanel(!showDiscountPanel)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Percent className="h-3 w-3" />
                  {discount.type ? (
                    <span className="text-red-500 font-medium">
                      Discount: -{discount.type === 'percentage' ? `${discount.amount}%` : formatCurrency(discount.amount)}
                    </span>
                  ) : (
                    'Add discount'
                  )}
                  <ChevronRight className={`h-3 w-3 transition-transform ${showDiscountPanel ? 'rotate-90' : ''}`} />
                </button>
                {showDiscountPanel && (
                  <div className="mt-1.5 p-2 bg-muted/30 rounded-lg space-y-1.5">
                    <div className="flex gap-1">
                      <Button
                        variant={discount.type === 'percentage' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs flex-1"
                        onClick={() => setDiscount((d) => ({ ...d, type: 'percentage' }))}
                      >
                        <Percent className="h-3 w-3 mr-1" /> %
                      </Button>
                      <Button
                        variant={discount.type === 'fixed' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs flex-1"
                        onClick={() => setDiscount((d) => ({ ...d, type: 'fixed' }))}
                      >
                        <DollarSign className="h-3 w-3 mr-1" /> Fixed
                      </Button>
                      {discount.type && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setDiscount({ type: null, amount: 0, reason: '' })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {discount.type && (
                      <>
                        <Input
                          type="number"
                          placeholder={discount.type === 'percentage' ? 'Percentage (e.g. 10)' : 'Amount (e.g. 2.50)'}
                          value={discount.amount || ''}
                          onChange={(e) => setDiscount((d) => ({ ...d, amount: parseFloat(e.target.value) || 0 }))}
                          className="h-7 text-xs"
                        />
                        <Input
                          placeholder="Reason (optional)"
                          value={discount.reason}
                          onChange={(e) => setDiscount((d) => ({ ...d, reason: e.target.value }))}
                          className="h-7 text-xs"
                        />
                      </>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Totals */}
              <div className="space-y-0.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-red-500">
                    <span>Discount</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-xl">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Balance Warning */}
              {balanceWarning && (
                <div className={`p-2 rounded-lg text-xs ${
                  balanceWarning.type === 'error'
                    ? 'bg-red-50 dark:bg-red-950/30 border border-red-300 text-red-700 dark:text-red-400'
                    : 'bg-amber-50 dark:bg-amber-950/30 border border-amber-300 text-amber-700 dark:text-amber-400'
                }`}>
                  <AlertTriangle className="h-3 w-3 inline mr-1" />
                  {balanceWarning.message}
                </div>
              )}

              <Separator />

              {/* Payment Method */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { value: 'account', label: 'Account', icon: Wallet },
                  { value: 'cash', label: 'Cash', icon: Banknote },
                  { value: 'card', label: 'Card', icon: CreditCard },
                ].map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    variant={paymentMethod === value ? 'default' : 'outline'}
                    className={`h-12 flex flex-col gap-0.5 text-xs ${
                      paymentMethod === value ? '' : ''
                    }`}
                    onClick={() => {
                      setPaymentMethod(value);
                      if (soundEnabled) playClickSound();
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                ))}
              </div>

              {/* Cash Payment - Change Calculator */}
              {paymentMethod === 'cash' && (
                <div className="p-2 bg-muted/30 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Cash Received</span>
                    <span className="text-lg font-bold">{formatCurrency(cashReceived)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {CASH_PRESETS.map((amt) => (
                      <Button
                        key={amt}
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs font-medium"
                        onClick={() => {
                          setCashReceived(amt);
                          setNumpadValue(String(amt));
                          if (soundEnabled) playClickSound();
                        }}
                      >
                        ${amt}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() => {
                        const exact = Math.ceil(total);
                        setCashReceived(exact);
                        setNumpadValue(String(exact));
                      }}
                    >
                      Exact
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs"
                      onClick={() => setShowNumpad(!showNumpad)}
                    >
                      <Hash className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Numpad */}
                  {showNumpad && (
                    <div className="grid grid-cols-3 gap-1">
                      {['1','2','3','4','5','6','7','8','9','.','0','⌫'].map((key) => (
                        <Button
                          key={key}
                          variant="outline"
                          className="h-10 text-lg font-medium"
                          onClick={() => handleNumpadPress(key)}
                        >
                          {key}
                        </Button>
                      ))}
                      <Button
                        variant="outline"
                        className="h-10 col-span-2 text-sm"
                        onClick={() => handleNumpadPress('C')}
                      >
                        Clear
                      </Button>
                      <Button
                        variant="default"
                        className="h-10 text-sm"
                        onClick={() => handleNumpadPress('OK')}
                      >
                        OK
                      </Button>
                    </div>
                  )}

                  {cashReceived >= total && (
                    <div className="flex justify-between items-center p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200">
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Change Due</span>
                      <span className="text-xl font-bold text-emerald-600">
                        {formatCurrency(changeDue)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={clearCart}
                  className="flex-1 h-12 text-base"
                >
                  Clear
                </Button>
                <Button
                  onClick={processTransaction}
                  disabled={processing || (balanceWarning?.type === 'error')}
                  className="flex-[2] h-12 text-base font-bold"
                >
                  {processing ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <CreditCard className="h-5 w-5 mr-2" />
                  )}
                  {processing ? 'Processing...' : `Pay ${formatCurrency(total)}`}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Recent Transactions Sidebar */}
        {showRecentPanel && (
          <div className="w-72 border-l bg-background flex flex-col shrink-0">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <span className="font-semibold text-sm">Recent Transactions</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setShowRecentPanel(false)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              {recentTxns.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No transactions today</p>
              ) : (
                recentTxns.map((tx) => (
                  <div key={tx.id} className="px-3 py-2 border-b hover:bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">
                        {tx.student_name || 'Guest'}
                      </span>
                      <span className="text-xs font-bold">{formatCurrency(tx.total)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' • '}
                        {tx.payment_method}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px]"
                        onClick={() => quickReorder(tx)}
                      >
                        <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                        Reorder
                      </Button>
                    </div>
                    <div className="mt-0.5">
                      {(tx.items || []).map((item, i) => (
                        <span key={i} className="text-[10px] text-muted-foreground">
                          {item.quantity}x {item.name}{i < tx.items.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Receipt Prompt Dialog */}
      <Dialog open={showReceiptPrompt} onOpenChange={setShowReceiptPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Transaction Complete
            </DialogTitle>
            <DialogDescription>
              {formatCurrency(completedTotal)} paid via {completedPaymentMethod}
              {completedStudent ? ` • ${completedStudent.full_name}` : ''}
              {completedPaymentMethod === 'cash' && completedChangeDue > 0 && (
                <span className="block mt-1 font-semibold text-emerald-600">
                  Change due: {formatCurrency(completedChangeDue)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground text-center">
              How would you like to handle the receipt?
            </p>
            <div className="grid grid-cols-1 gap-2">
              <Button
                onClick={handleReceiptPrint}
                variant="default"
                className="h-14 text-base justify-start gap-3"
              >
                <Printer className="h-5 w-5" />
                <div className="text-left">
                  <div className="font-semibold">Print Receipt</div>
                  <div className="text-xs opacity-80">Send to connected printer</div>
                </div>
              </Button>
              <Button
                onClick={handleReceiptEmail}
                variant="outline"
                className="h-14 text-base justify-start gap-3"
                disabled={emailingReceipt || !completedStudent}
              >
                {emailingReceipt ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Mail className="h-5 w-5" />
                )}
                <div className="text-left">
                  <div className="font-semibold">
                    {emailingReceipt ? 'Sending...' : 'Email Receipt'}
                  </div>
                  <div className="text-xs opacity-80">
                    {completedStudent
                      ? 'Send to parent/guardian email'
                      : 'No student selected — unavailable'}
                  </div>
                </div>
              </Button>
              <Button
                onClick={handleReceiptSkip}
                variant="ghost"
                className="h-12 text-base justify-start gap-3 text-muted-foreground"
              >
                <SkipForward className="h-5 w-5" />
                <div className="text-left">
                  <div className="font-medium">No Receipt</div>
                  <div className="text-xs opacity-80">Skip and continue</div>
                </div>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}