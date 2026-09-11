import { useEffect, useState } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Bell, DollarSign, ShieldAlert, UtensilsCrossed, Calendar,
  Loader2, Save, RotateCcw, CheckCircle, Mail, Smartphone, Monitor,
} from 'lucide-react';
import {
  parentApi, notificationApi,
  type ParentChild, type NotificationPreferences,
} from '@/lib/api';

interface NotificationType {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const NOTIFICATION_TYPES: NotificationType[] = [
  { key: 'low_balance', label: 'Low Balance Alerts', description: 'Get notified when your child\'s balance drops below the threshold', icon: DollarSign, color: 'text-amber-600 bg-amber-100' },
  { key: 'transactions', label: 'Transaction Notifications', description: 'Receive updates for each cafeteria purchase', icon: DollarSign, color: 'text-blue-600 bg-blue-100' },
  { key: 'dietary_alerts', label: 'Dietary Alerts', description: 'Alerts when dietary restrictions are flagged during checkout', icon: ShieldAlert, color: 'text-red-600 bg-red-100' },
  { key: 'menu_updates', label: 'Menu Updates', description: 'Weekly menu changes and new item notifications', icon: UtensilsCrossed, color: 'text-green-600 bg-green-100' },
  { key: 'preorder_reminders', label: 'Pre-Order Reminders', description: 'Reminders to place pre-orders before the deadline', icon: Calendar, color: 'text-purple-600 bg-purple-100' },
];

const FREQUENCY_OPTIONS = [
  { value: 'realtime', label: 'Real-time' },
  { value: 'hourly', label: 'Hourly digest' },
  { value: 'daily', label: 'Daily digest' },
  { value: 'weekly', label: 'Weekly digest' },
];

const DELIVERY_METHODS = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'sms', label: 'SMS', icon: Smartphone },
  { value: 'push', label: 'In-App', icon: Monitor },
];

const DEFAULT_PREFS: NotificationPreferences = Object.fromEntries(
  NOTIFICATION_TYPES.map((t) => [
    t.key,
    { enabled: true, frequency: 'realtime', delivery: ['email', 'push'] },
  ])
);

export default function ParentNotificationSettings() {
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadChildren();
  }, []);

  useEffect(() => {
    if (selectedChildId) loadPreferences();
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

  const loadPreferences = async () => {
    try {
      const data = await notificationApi.getPreferences(selectedChildId);
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        setPreferences(data);
      } else {
        setPreferences(DEFAULT_PREFS);
      }
      setHasChanges(false);
    } catch {
      setPreferences(DEFAULT_PREFS);
    }
  };

  const toggleEnabled = (key: string) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key]?.enabled },
    }));
    setHasChanges(true);
  };

  const setFrequency = (key: string, frequency: string) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: { ...prev[key], frequency },
    }));
    setHasChanges(true);
  };

  const toggleDelivery = (key: string, method: string) => {
    setPreferences((prev) => {
      const current = prev[key]?.delivery || [];
      const newDelivery = current.includes(method)
        ? current.filter((m) => m !== method)
        : [...current, method];
      return { ...prev, [key]: { ...prev[key], delivery: newDelivery } };
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await notificationApi.updatePreferences(preferences, selectedChildId);
      setHasChanges(false);
      setSuccess('Preferences saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Failed to save preferences:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPreferences(DEFAULT_PREFS);
    setHasChanges(true);
  };

  const selectedChild = children.find((c) => c.id === selectedChildId);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Notification Settings</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 bg-primary/10 rounded-xl flex items-center justify-center">
          <Bell className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notification Settings</h1>
          <p className="text-muted-foreground">Customize notification preferences for each child</p>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <CheckCircle className="h-4 w-4" />
          {success}
        </div>
      )}

      {/* Child Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Child Account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => setSelectedChildId(child.id)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  selectedChildId === child.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                    {child.full_name?.charAt(0) || 'S'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{child.full_name}</p>
                    <p className="text-xs text-muted-foreground">{child.grade} • #{child.student_id}</p>
                  </div>
                  {selectedChildId === child.id && (
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notification Types */}
      {selectedChild && (
        <div className="space-y-4">
          {NOTIFICATION_TYPES.map((type) => {
            const pref = preferences[type.key] || { enabled: true, frequency: 'realtime', delivery: ['email'] };
            const Icon = type.icon;
            return (
              <Card key={type.key}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${type.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold">{type.label}</h3>
                        <Switch
                          checked={pref.enabled}
                          onCheckedChange={() => toggleEnabled(type.key)}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground">{type.description}</p>
                    </div>
                  </div>

                  {pref.enabled && (
                    <div className="grid gap-6 sm:grid-cols-2 pt-4 border-t">
                      <div className="space-y-2">
                        <Label className="text-sm">Frequency</Label>
                        <Select value={pref.frequency} onValueChange={(v) => setFrequency(type.key, v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FREQUENCY_OPTIONS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-3">
                        <Label className="text-sm">Delivery Methods</Label>
                        {DELIVERY_METHODS.map((method) => {
                          const MIcon = method.icon;
                          return (
                            <div key={method.value} className="flex items-center gap-2">
                              <Checkbox
                                checked={pref.delivery?.includes(method.value)}
                                onCheckedChange={() => toggleDelivery(type.key, method.value)}
                              />
                              <MIcon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{method.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Actions */}
      {selectedChild && (
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}