import { useEffect, useState } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Bell, AlertTriangle, CheckCircle, Search, Download,
  Loader2, Filter, Clock, ShieldAlert, DollarSign,
  Monitor, XCircle,
} from 'lucide-react';
import { notificationApi, type Notification } from '@/lib/api';
import { format } from 'date-fns';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  info: 'bg-gray-100 text-gray-800 border-gray-200',
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  transaction: DollarSign,
  dietary: ShieldAlert,
  system: Monitor,
  balance: DollarSign,
  security: ShieldAlert,
};

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [showHistory, setShowHistory] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissNote, setDismissNote] = useState('');
  const [showDismissDialog, setShowDismissDialog] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const data = await notificationApi.getAll();
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = notifications.filter((n) => {
    const catMatch = categoryFilter === 'all' || n.category === categoryFilter;
    const sevMatch = severityFilter === 'all' || n.severity === severityFilter;
    const resolvedMatch = showHistory ? true : !n.resolved;
    const searchMatch =
      !searchQuery ||
      n.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return catMatch && sevMatch && resolvedMatch && searchMatch;
  });

  const unresolvedCount = notifications.filter((n) => !n.resolved).length;
  const criticalCount = notifications.filter((n) => !n.resolved && n.severity === 'critical').length;

  const handleDismiss = async () => {
    if (!dismissingId) return;
    try {
      await notificationApi.dismiss(dismissingId, dismissNote);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === dismissingId
            ? { ...n, resolved: true, resolved_at: new Date().toISOString(), resolved_note: dismissNote }
            : n
        )
      );
      setShowDismissDialog(false);
      setDismissingId(null);
      setDismissNote('');
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  };

  const openDismiss = (id: string) => {
    setDismissingId(id);
    setDismissNote('');
    setShowDismissDialog(true);
  };

  const handleExport = () => {
    const csv = [
      ['ID', 'Category', 'Severity', 'Title', 'Description', 'Resolved', 'Created'],
      ...filtered.map((n) => [
        n.id, n.category, n.severity, n.title, n.description,
        n.resolved ? 'Yes' : 'No', n.created_at,
      ]),
    ].map((row) => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notifications_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notification Center</h1>
          <p className="text-muted-foreground">
            Monitor system alerts, transaction issues, and student notifications
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={loadNotifications}>
            <Loader2 className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Bell className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{notifications.length}</p>
              <p className="text-xs text-muted-foreground">Total Notifications</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{unresolvedCount}</p>
              <p className="text-xs text-muted-foreground">Unresolved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{criticalCount}</p>
              <p className="text-xs text-muted-foreground">Critical</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="transaction">Transaction</SelectItem>
                <SelectItem value="dietary">Dietary</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="balance">Balance</SelectItem>
                <SelectItem value="security">Security</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch checked={showHistory} onCheckedChange={setShowHistory} />
              <span className="text-sm">Show resolved</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((notif) => {
            const CatIcon = CATEGORY_ICONS[notif.category] || Bell;
            return (
              <Card key={notif.id} className={notif.resolved ? 'opacity-60' : ''}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      notif.severity === 'critical' ? 'bg-red-100' :
                      notif.severity === 'high' ? 'bg-orange-100' :
                      notif.severity === 'medium' ? 'bg-yellow-100' : 'bg-blue-100'
                    }`}>
                      <CatIcon className={`h-5 w-5 ${
                        notif.severity === 'critical' ? 'text-red-600' :
                        notif.severity === 'high' ? 'text-orange-600' :
                        notif.severity === 'medium' ? 'text-yellow-600' : 'text-blue-600'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm">{notif.title}</h3>
                        <Badge className={SEVERITY_STYLES[notif.severity] || SEVERITY_STYLES.info}>
                          {notif.severity}
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">{notif.category}</Badge>
                        {notif.resolved && (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" /> Resolved
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{notif.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {(() => { try { return format(new Date(notif.created_at), 'MMM d, h:mm a'); } catch { return notif.created_at; } })()}
                        </span>
                        {notif.student_name && <span>Student: {notif.student_name}</span>}
                      </div>
                    </div>
                    {!notif.resolved && (
                      <Button size="sm" variant="outline" onClick={() => openDismiss(notif.id)}>
                        Dismiss
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No notifications found</p>
          </CardContent>
        </Card>
      )}

      {/* Dismiss Dialog */}
      <Dialog open={showDismissDialog} onOpenChange={setShowDismissDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Notification</DialogTitle>
            <DialogDescription>Add an optional note about the resolution.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Resolution note (optional)"
            value={dismissNote}
            onChange={(e) => setDismissNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDismissDialog(false)}>Cancel</Button>
            <Button onClick={handleDismiss}>Dismiss</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}