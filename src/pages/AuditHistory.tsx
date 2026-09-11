import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, RefreshCw, Shield, Download, Filter } from 'lucide-react';
import { request } from '@/lib/api';

interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
}

const ACTION_COLORS: Record<string, string> = {
  change_password: 'bg-blue-500/15 text-blue-700 border-blue-300',
  admin_reset_password: 'bg-orange-500/15 text-orange-700 border-orange-300',
  password_reset_via_token: 'bg-yellow-500/15 text-yellow-700 border-yellow-300',
  parent_set_password: 'bg-green-500/15 text-green-700 border-green-300',
  login: 'bg-emerald-500/15 text-emerald-700 border-emerald-300',
  logout: 'bg-gray-500/15 text-gray-700 border-gray-300',
  create_user: 'bg-purple-500/15 text-purple-700 border-purple-300',
  delete_user: 'bg-red-500/15 text-red-700 border-red-300',
  update_settings: 'bg-indigo-500/15 text-indigo-700 border-indigo-300',
};

function getActionBadgeClass(action: string): string {
  return ACTION_COLORS[action] || 'bg-muted text-muted-foreground border-border';
}

function formatAction(action: string): string {
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function parseDetails(details: string | null): Record<string, string> | null {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return { info: details };
  }
}

export default function AuditHistory() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [limit, setLimit] = useState(100);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchAuditTrail = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter !== 'all') params.set('action', actionFilter);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      params.set('limit', String(limit));

      const data = await request<AuditEntry[]>(`/reports/audit-trail?${params.toString()}`);
      setEntries(data);
    } catch (err) {
      console.error('Failed to fetch audit trail:', err);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, startDate, endDate, limit]);

  useEffect(() => {
    fetchAuditTrail();
  }, [fetchAuditTrail]);

  // Get unique actions for filter dropdown
  const uniqueActions = Array.from(new Set(entries.map((e) => e.action))).sort();

  // Client-side search filter
  const filteredEntries = entries.filter((entry) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (entry.user_name?.toLowerCase().includes(q)) ||
      (entry.user_email?.toLowerCase().includes(q)) ||
      entry.action.toLowerCase().includes(q) ||
      (entry.details?.toLowerCase().includes(q))
    );
  });

  const handleExportCSV = () => {
    const headers = ['Date', 'User', 'Email', 'Action', 'Details'];
    const rows = filteredEntries.map((e) => [
      formatDate(e.created_at),
      e.user_name || 'System',
      e.user_email || '-',
      formatAction(e.action),
      e.details || '-',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Audit History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track all system activities and user actions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAuditTrail} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filteredEntries.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Entries</p>
            <p className="text-2xl font-bold">{entries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Unique Actions</p>
            <p className="text-2xl font-bold">{uniqueActions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Unique Users</p>
            <p className="text-2xl font-bold">
              {new Set(entries.filter((e) => e.user_id).map((e) => e.user_id)).size}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Showing</p>
            <p className="text-2xl font-bold">{filteredEntries.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users, actions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActions.map((action) => (
                  <SelectItem key={action} value={action}>
                    {formatAction(action)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Start Date"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="End Date"
            />
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50 entries</SelectItem>
                <SelectItem value="100">100 entries</SelectItem>
                <SelectItem value="250">250 entries</SelectItem>
                <SelectItem value="500">500 entries</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No audit entries found</p>
              <p className="text-sm mt-1">Try adjusting your filters or date range</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Date & Time</TableHead>
                    <TableHead className="w-[180px]">User</TableHead>
                    <TableHead className="w-[180px]">Action</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => {
                    const details = parseDetails(entry.details);
                    const isExpanded = expandedRow === entry.id;

                    return (
                      <TableRow
                        key={entry.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                      >
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDate(entry.created_at)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{entry.user_name || 'System'}</p>
                            {entry.user_email && (
                              <p className="text-xs text-muted-foreground">{entry.user_email}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getActionBadgeClass(entry.action)}>
                            {formatAction(entry.action)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {details ? (
                            isExpanded ? (
                              <div className="space-y-1">
                                {Object.entries(details).map(([key, value]) => (
                                  <div key={key} className="flex gap-2">
                                    <span className="text-muted-foreground font-medium min-w-[80px]">
                                      {key}:
                                    </span>
                                    <span className="break-all">{String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground truncate block max-w-[300px]">
                                {entry.details?.slice(0, 80)}
                                {(entry.details?.length ?? 0) > 80 ? '...' : ''}
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}