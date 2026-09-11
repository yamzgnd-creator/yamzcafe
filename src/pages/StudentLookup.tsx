import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Loader2, User, DollarSign, GraduationCap, Receipt, X } from 'lucide-react';
import { studentApi, transactionApi, type Student, type Transaction } from '@/lib/api';
import { toast } from 'sonner';

export default function StudentLookup() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  // Real-time debounced search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    try {
      const results = await studentApi.search(q.trim());
      setSearchResults(Array.isArray(results) ? results : []);
      setShowDropdown(true);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (student) return; // Don't auto-search when a student is already selected
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(searchTerm);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, student, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectStudent = async (s: Student) => {
    setStudent(s);
    setSearchTerm(s.full_name);
    setSearchResults([]);
    setShowDropdown(false);
    // Load transactions
    setLoadingTx(true);
    try {
      const txs = await transactionApi.getAll({ student_id: s.id, limit: '20' });
      setTransactions(txs);
    } catch {
      setTransactions([]);
    } finally {
      setLoadingTx(false);
    }
  };

  const clearSelection = () => {
    setStudent(null);
    setSearchTerm('');
    setTransactions([]);
    setSearchResults([]);
    setShowDropdown(false);
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setStudent(null);
    setTransactions([]);
    try {
      const results = await studentApi.search(searchTerm.trim());
      if (results.length === 1) {
        selectStudent(results[0]);
      } else if (results.length > 1) {
        setSearchResults(results);
        setShowDropdown(true);
      } else {
        toast.error('No students found matching your search');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Student Account Lookup</h1>
        <p className="text-muted-foreground mt-1">
          Search and view detailed student account information
        </p>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3" ref={dropdownRef}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Start typing student name or ID..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (student) {
                    setStudent(null);
                    setTransactions([]);
                  }
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                onFocus={() => {
                  if (searchResults.length > 0 && !student) setShowDropdown(true);
                }}
                className="pl-10 pr-10"
              />
              {searchTerm && (
                <button
                  onClick={clearSelection}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {searching && (
                <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}

              {/* Live search dropdown */}
              {showDropdown && searchResults.length > 0 && !student && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg max-h-64 overflow-auto">
                  {searchResults.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => selectStudent(s)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left border-b last:border-b-0"
                    >
                      {s.photo ? (
                        <img src={s.photo} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{s.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {s.student_id} · Grade: {s.grade || 'N/A'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-medium">{formatCurrency(Number(s.balance || 0))}</p>
                        <Badge
                          variant={s.account_status === 'active' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {s.account_status}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={handleSearch} disabled={searching || !searchTerm.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {student && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student Profile */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Student Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Full Name</p>
                    <p className="font-semibold">{student.full_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Student ID</p>
                    <p className="font-semibold">{student.student_id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Grade</p>
                    <p className="font-semibold">{student.grade || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant={student.account_status === 'active' ? 'default' : 'secondary'}>
                      {student.account_status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Meal Program</p>
                    <p className="font-semibold">{student.meal_program || 'Standard'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Dietary Restrictions</p>
                    <p className="font-semibold">{student.dietary_restrictions || 'None'}</p>
                  </div>
                  {student.parent_name && (
                    <>
                      <div>
                        <p className="text-sm text-muted-foreground">Parent/Guardian</p>
                        <p className="font-semibold">{student.parent_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Parent Email</p>
                        <p className="font-semibold">{student.parent_email}</p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Transaction History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Recent Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingTx ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : transactions.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No transactions found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {tx.type || tx.transaction_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            ${Number(tx.amount || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="capitalize text-sm">
                            {tx.payment_method}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={tx.status === 'completed' ? 'default' : 'secondary'}
                              className="capitalize"
                            >
                              {tx.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Account Summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Account Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <p className="text-4xl font-bold text-primary">
                    ${Number(student.balance || 0).toFixed(2)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Current Balance</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Transactions</span>
                  <span className="font-semibold">{transactions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Spent</span>
                  <span className="font-semibold">
                    ${transactions
                      .filter((t) => t.type === 'purchase')
                      .reduce((sum, t) => sum + Number(t.amount || 0), 0)
                      .toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Credits</span>
                  <span className="font-semibold">
                    ${transactions
                      .filter((t) => t.type === 'credit' || t.type === 'deposit')
                      .reduce((sum, t) => sum + Number(t.amount || 0), 0)
                      .toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {!student && !searching && searchResults.length === 0 && (
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Start typing a student name or ID to see results instantly</p>
        </div>
      )}
    </div>
  );
}