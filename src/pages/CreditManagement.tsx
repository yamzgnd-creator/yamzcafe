import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Search,
  Loader2,
  DollarSign,
  CheckCircle,
  AlertCircle,
  User,
} from 'lucide-react';
import { studentApi, transactionApi, usersApi, type Student, type ManagedUser } from '@/lib/api';
import { toast } from 'sonner';

export default function CreditManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [parents, setParents] = useState<ManagedUser[]>([]);
  const [selectedParent, setSelectedParent] = useState<ManagedUser | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [amount, setAmount] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const quickAmounts = [10, 20, 50, 100];

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    setError('');
    setSuccess('');
    try {
      // Search users with parent role
      const allUsers = await usersApi.getAll();
      const filtered = allUsers.filter(
        (u) =>
          u.role === 'parent' &&
          (u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setParents(filtered);
      if (filtered.length === 0) {
        setError('No parents found matching your search');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectParent = async (parent: ManagedUser) => {
    setSelectedParent(parent);
    setSelectedStudent(null);
    setAmount('');
    setCashReceived('');
    setNotes('');
    setError('');
    setSuccess('');
    // Load children for this parent
    try {
      const children = await studentApi.search('');
      // Filter students linked to this parent - we use the parent_id field
      const linked = children.filter((s) => s.parent_id === parent.id);
      setStudents(linked.length > 0 ? linked : children.slice(0, 10));
    } catch {
      setStudents([]);
    }
  };

  const calculateChange = () => {
    const a = parseFloat(amount) || 0;
    const c = parseFloat(cashReceived) || 0;
    return Math.max(0, c - a);
  };

  const handleProcessPayment = async () => {
    if (!selectedStudent) {
      setError('Please select a student');
      return;
    }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    const cashNum = parseFloat(cashReceived);
    if (!cashNum || cashNum < amountNum) {
      setError('Cash received must be ≥ amount');
      return;
    }

    setProcessing(true);
    setError('');
    setSuccess('');
    try {
      await transactionApi.addCredit({
        student_id: selectedStudent.id,
        amount: amountNum,
        payment_method: 'cash',
        notes: notes || `Cash payment from ${selectedParent?.full_name || 'parent'}`,
      });
      setSuccess(
        `$${amountNum.toFixed(2)} added to ${selectedStudent.full_name}'s account. Change: $${calculateChange().toFixed(2)}`
      );
      toast.success('Payment processed successfully');
      setAmount('');
      setCashReceived('');
      setNotes('');
      // Refresh student balance
      try {
        const updated = await studentApi.getById(selectedStudent.id);
        setSelectedStudent(updated);
      } catch {
        // ignore
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setSelectedParent(null);
    setSelectedStudent(null);
    setStudents([]);
    setAmount('');
    setCashReceived('');
    setNotes('');
    setError('');
    setSuccess('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Credit Management</h1>
        <p className="text-muted-foreground mt-1">
          Process cash payments and add funds to student accounts
        </p>
      </div>

      {/* Search Parent */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Parent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="Enter parent name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searching || !searchTerm.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Parent Results */}
      {parents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {parents.map((parent) => (
              <div
                key={parent.id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedParent?.id === parent.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => handleSelectParent(parent)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{parent.full_name}</h3>
                    <p className="text-sm text-muted-foreground">{parent.email}</p>
                  </div>
                  {selectedParent?.id === parent.id && (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Student Selection */}
      {selectedParent && students.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Select Student</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {students.map((student) => (
                <div
                  key={student.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedStudent?.id === student.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => {
                    setSelectedStudent(student);
                    setError('');
                    setSuccess('');
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{student.full_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        Grade {student.grade} • ID: {student.student_id}
                      </p>
                      <p className="text-sm font-semibold text-primary mt-1">
                        Balance: ${Number(student.balance || 0).toFixed(2)}
                      </p>
                    </div>
                    {selectedStudent?.id === student.id && (
                      <CheckCircle className="h-5 w-5 text-primary" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Form */}
      {selectedStudent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              Process Payment for {selectedStudent.full_name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick Amounts */}
            <div>
              <label className="text-sm font-medium mb-2 block">Quick Amounts</label>
              <div className="flex gap-2">
                {quickAmounts.map((qa) => (
                  <Button
                    key={qa}
                    variant="outline"
                    onClick={() => setAmount(qa.toString())}
                    className="flex-1"
                  >
                    ${qa}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Amount to Deposit *</label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Cash Received *</label>
              <Input
                type="number"
                placeholder="0.00"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>

            {amount && cashReceived && (
              <div className="p-4 bg-muted/50 rounded-lg flex justify-between items-center">
                <span className="text-sm font-medium">Change to Give:</span>
                <span className="text-xl font-bold text-primary">
                  ${calculateChange().toFixed(2)}
                </span>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">Notes (Optional)</label>
              <Textarea
                placeholder="Add any additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {error && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-sm text-green-700">{success}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button onClick={handleProcessPayment} disabled={processing} className="flex-1">
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {processing ? 'Processing...' : 'Process Payment'}
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={processing}>
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}