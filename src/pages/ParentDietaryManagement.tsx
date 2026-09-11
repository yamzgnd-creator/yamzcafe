import { useEffect, useState } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ShieldAlert, Plus, Loader2, Trash2, Edit, AlertTriangle,
  CheckCircle, Info,
} from 'lucide-react';
import {
  parentApi, dietaryApi,
  type ParentChild, type DietaryRestriction,
} from '@/lib/api';

const SEVERITY_COLORS: Record<string, string> = {
  'life-threatening': 'bg-red-100 text-red-800 border-red-200',
  severe: 'bg-orange-100 text-orange-800 border-orange-200',
  moderate: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  mild: 'bg-blue-100 text-blue-800 border-blue-200',
};

const SEVERITY_OPTIONS = ['mild', 'moderate', 'severe', 'life-threatening'];
const CATEGORY_OPTIONS = ['allergy', 'intolerance', 'dietary', 'religious', 'medical', 'preference'];

export default function ParentDietaryManagement() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [restrictions, setRestrictions] = useState<DietaryRestriction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<DietaryRestriction | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    restriction_name: '',
    category: 'allergy',
    severity: 'moderate',
    notes: '',
  });

  useEffect(() => {
    loadChildren();
  }, []);

  useEffect(() => {
    if (selectedChildId) loadRestrictions();
  }, [selectedChildId]);

  const loadChildren = async () => {
    try {
      setLoading(true);
      const data = await parentApi.getChildren();
      const list = Array.isArray(data) ? data : [];
      setChildren(list);
      if (list.length > 0) setSelectedChildId(list[0].id);
    } catch (err) {
      console.error('Failed to load children:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRestrictions = async () => {
    try {
      const data = await dietaryApi.getStudentRestrictions(selectedChildId);
      setRestrictions(Array.isArray(data) ? data : []);
    } catch {
      setRestrictions([]);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setFormData({ restriction_name: '', category: 'allergy', severity: 'moderate', notes: '' });
    setShowModal(true);
  };

  const openEdit = (r: DietaryRestriction) => {
    setEditing(r);
    setFormData({
      restriction_name: r.restriction_name,
      category: r.category,
      severity: r.severity,
      notes: r.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.restriction_name.trim()) return;
    try {
      setSaving(true);
      if (editing) {
        await dietaryApi.updateRestriction(editing.id, formData);
      } else {
        await dietaryApi.addRestriction(selectedChildId, formData);
      }
      setShowModal(false);
      await loadRestrictions();
    } catch (err) {
      console.error('Failed to save restriction:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this dietary restriction?')) return;
    try {
      await dietaryApi.deleteRestriction(id);
      await loadRestrictions();
    } catch (err) {
      console.error('Failed to delete restriction:', err);
    }
  };

  const selectedChild = children.find((c) => c.id === selectedChildId);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dietary Management</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dietary Management</h1>
        <p className="text-muted-foreground">
          Manage dietary restrictions, allergies, and food preferences for your children
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left — Child Selection */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Children</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => setSelectedChildId(child.id)}
                  className={`w-full p-3 rounded-lg border text-left transition-all ${
                    selectedChildId === child.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {child.full_name?.charAt(0) || 'S'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{child.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {child.grade || 'N/A'} • #{child.student_id}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Info className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Important Information</h3>
              </div>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>Dietary restrictions are immediately visible to cafeteria staff</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>Severe allergies require medical documentation</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>POS terminals will alert cashiers during checkout</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Right — Restrictions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" />
                  {selectedChild?.full_name}'s Dietary Profile
                </CardTitle>
                <CardDescription>
                  {restrictions.length} restriction{restrictions.length !== 1 ? 's' : ''} on file
                </CardDescription>
              </div>
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4 mr-1" /> Add Restriction
              </Button>
            </CardHeader>
            <CardContent>
              {restrictions.length > 0 ? (
                <div className="space-y-3">
                  {restrictions.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-start justify-between p-4 rounded-lg border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{r.restriction_name}</span>
                          <Badge className={SEVERITY_COLORS[r.severity] || ''}>
                            {r.severity}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">
                            {r.category}
                          </Badge>
                        </div>
                        {r.notes && (
                          <p className="text-sm text-muted-foreground">{r.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>No dietary restrictions on file</p>
                  <p className="text-sm mt-1">Add restrictions to keep your child safe at the cafeteria.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Dietary Restriction</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the restriction details' : 'Add a new dietary restriction for'} {selectedChild?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Restriction Name</Label>
              <Input
                placeholder="e.g., Peanut Allergy, Gluten Free"
                value={formData.restriction_name}
                onChange={(e) => setFormData({ ...formData, restriction_name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional details, emergency procedures, etc."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formData.restriction_name.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editing ? 'Update' : 'Add'} Restriction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}