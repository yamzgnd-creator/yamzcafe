import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Users, UserPlus, Trash2, Loader2, Mail, Shield,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { parentApi, guardianApi, type ParentChild, type Guardian } from '@/lib/api';

export default function ParentGuardianManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [children, setChildren] = useState<ParentChild[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-child guardian data
  const [guardiansByChild, setGuardiansByChild] = useState<Record<string, Guardian[]>>({});
  const [guardianLoading, setGuardianLoading] = useState<Record<string, boolean>>({});
  const [expandedChild, setExpandedChild] = useState<string | null>(null);

  // Add guardian dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForChildId, setAddForChildId] = useState<string | null>(null);
  const [addForChildName, setAddForChildName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianFullName, setGuardianFullName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('guardian');
  const [addLoading, setAddLoading] = useState(false);

  // Remove guardian confirmation
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{
    childId: string; linkId: string; guardianName: string; childName: string;
  } | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  useEffect(() => {
    loadChildren();
  }, []);

  const loadChildren = async () => {
    try {
      setLoading(true);
      const data = await parentApi.getChildren();
      const list = Array.isArray(data) ? data : [];
      setChildren(list);
      // Auto-expand first child
      if (list.length > 0) {
        setExpandedChild(list[0].id);
        loadGuardians(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load children:', err);
      setChildren([]);
    } finally {
      setLoading(false);
    }
  };

  const loadGuardians = useCallback(async (studentId: string) => {
    try {
      setGuardianLoading((prev) => ({ ...prev, [studentId]: true }));
      const data = await guardianApi.getByChild(studentId);
      setGuardiansByChild((prev) => ({ ...prev, [studentId]: Array.isArray(data) ? data : [] }));
    } catch (err) {
      console.error('Failed to load guardians:', err);
      setGuardiansByChild((prev) => ({ ...prev, [studentId]: [] }));
    } finally {
      setGuardianLoading((prev) => ({ ...prev, [studentId]: false }));
    }
  }, []);

  const toggleChild = (childId: string) => {
    if (expandedChild === childId) {
      setExpandedChild(null);
    } else {
      setExpandedChild(childId);
      if (!guardiansByChild[childId]) {
        loadGuardians(childId);
      }
    }
  };

  const openAddDialog = (childId: string, childName: string) => {
    setAddForChildId(childId);
    setAddForChildName(childName);
    setGuardianEmail('');
    setGuardianFullName('');
    setGuardianRelationship('guardian');
    setAddDialogOpen(true);
  };

  const handleAddGuardian = async () => {
    if (addLoading) return; // Prevent double submission
    if (!addForChildId || !guardianEmail.trim()) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      setAddLoading(true);
      const result = await guardianApi.add(
        addForChildId,
        guardianEmail.trim(),
        guardianRelationship,
        guardianFullName.trim() || undefined
      );
      if (result.account_created) {
        toast.success('New parent account created and guardian linked! A welcome email has been sent.');
      } else {
        toast.success('Guardian added successfully!');
      }
      setAddDialogOpen(false);
      loadGuardians(addForChildId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add guardian';
      if (message.toLowerCase().includes('already linked')) {
        toast.error('This guardian is already linked to this child. Check the guardian list below.');
        // Refresh the guardian list so user can see who's already linked
        loadGuardians(addForChildId);
      } else {
        toast.error(message);
      }
    } finally {
      setAddLoading(false);
    }
  };

  const openRemoveDialog = (childId: string, linkId: string, guardianName: string, childName: string) => {
    setRemoveTarget({ childId, linkId, guardianName, childName });
    setRemoveDialogOpen(true);
  };

  const handleRemoveGuardian = async () => {
    if (!removeTarget) return;

    try {
      setRemoveLoading(true);
      await guardianApi.remove(removeTarget.childId, removeTarget.linkId);
      toast.success(`${removeTarget.guardianName} has been removed as a guardian`);
      setRemoveDialogOpen(false);
      loadGuardians(removeTarget.childId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove guardian';
      toast.error(message);
    } finally {
      setRemoveLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/parent/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Manage Guardians</h1>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
              <CardContent><Skeleton className="h-20 w-full" /></CardContent>
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
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/parent/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Manage Guardians</h1>
            <p className="text-muted-foreground">
              Add or remove parents and guardians for your children
            </p>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">About Guardians</p>
              <p>
                Guardians are other parents or family members who can view your child's
                cafeteria account, balance, and transaction history. You can add them by
                their email address. If they don't have an account yet, one will be created
                automatically and a welcome email will be sent to them.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Children List */}
      {children.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No children linked to your account</p>
            <p className="text-sm mt-1">Contact the school administrator to link your children.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {children.map((child) => {
            const isExpanded = expandedChild === child.id;
            const guardians = guardiansByChild[child.id] || [];
            const isLoadingGuardians = guardianLoading[child.id];

            return (
              <Card key={child.id}>
                <CardHeader
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleChild(child.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {child.full_name?.charAt(0) || 'S'}
                      </div>
                      <div>
                        <CardTitle className="text-base">{child.full_name}</CardTitle>
                        <CardDescription>
                          {child.grade || 'N/A'} • #{child.student_id}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        {guardians.length} guardian{guardians.length !== 1 ? 's' : ''}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAddDialog(child.id, child.full_name);
                        }}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    {isLoadingGuardians ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
                        <span className="text-sm text-muted-foreground">Loading guardians...</span>
                      </div>
                    ) : guardians.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground border rounded-lg bg-muted/20">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No other guardians linked yet</p>
                        <p className="text-xs mt-1">
                          Click "Add" to invite another parent or guardian
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Relationship</TableHead>
                            <TableHead className="w-[80px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {guardians.map((g) => {
                            const isSelf = g.id === user?.id;
                            return (
                              <TableRow key={g.link_id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {g.full_name}
                                    {isSelf && (
                                      <Badge variant="secondary" className="text-xs">You</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />
                                    {g.email}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="capitalize">
                                    {g.relationship || 'parent'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {!isSelf && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() =>
                                        openRemoveDialog(child.id, g.link_id, g.full_name, child.full_name)
                                      }
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Guardian Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Guardian</DialogTitle>
            <DialogDescription>
              Add a parent or guardian to <strong>{addForChildName}</strong>.
              If they don't have an account yet, one will be created automatically and a welcome email will be sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="guardian-email">Guardian's Email Address <span className="text-destructive">*</span></Label>
              <Input
                id="guardian-email"
                type="email"
                placeholder="guardian@example.com"
                value={guardianEmail}
                onChange={(e) => setGuardianEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAddGuardian();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guardian-fullname">Full Name <span className="text-xs text-muted-foreground">(required if new account)</span></Label>
              <Input
                id="guardian-fullname"
                type="text"
                placeholder="e.g. Jane Smith"
                value={guardianFullName}
                onChange={(e) => setGuardianFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guardian-relationship">Relationship</Label>
              <Select value={guardianRelationship} onValueChange={setGuardianRelationship}>
                <SelectTrigger id="guardian-relationship">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guardian">Guardian</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="grandparent">Grandparent</SelectItem>
                  <SelectItem value="stepparent">Step-parent</SelectItem>
                  <SelectItem value="foster_parent">Foster Parent</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={addLoading}>
              Cancel
            </Button>
            <Button onClick={handleAddGuardian} disabled={addLoading || !guardianEmail.trim()}>
              {addLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Guardian
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Guardian Confirmation */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Guardian</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{removeTarget?.guardianName}</strong> as
              a guardian for <strong>{removeTarget?.childName}</strong>? They will no longer be
              able to view this child's cafeteria account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveGuardian}
              disabled={removeLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove Guardian'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}