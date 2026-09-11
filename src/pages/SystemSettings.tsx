import { useEffect, useState, useCallback } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Settings, Palette, Save, Loader2, CheckCircle,
  XCircle, Building2, Globe, Phone, Mail, MapPin,
  Clock, Calendar, DollarSign, Image, Bell, Lock, Monitor,
  ImageIcon, Trash2, Wallet, Send, Eye, EyeOff,
  FileText, RotateCcw, Code, Upload,
} from 'lucide-react';
import {
  settingsApi, brandingApi, uploadApi, smtpApi, emailTemplateApi,
  type SystemSetting, type BrandingSettings, type SmtpSettings, type EmailTemplate,
  type UploadedFile,
} from '@/lib/api';
import { useBranding } from '@/contexts/BrandingContext';

const CATEGORY_META: Record<string, { icon: React.ElementType; color: string }> = {
  financial: { icon: DollarSign, color: 'text-green-600' },
  notifications: { icon: Bell, color: 'text-blue-600' },
  security: { icon: Lock, color: 'text-red-600' },
  display: { icon: Monitor, color: 'text-purple-600' },
  general: { icon: Settings, color: 'text-gray-600' },
};

const CURRENCY_OPTIONS = [
  { value: '$', label: '$ — US Dollar (USD)' },
  { value: '€', label: '€ — Euro (EUR)' },
  { value: '£', label: '£ — British Pound (GBP)' },
  { value: '¥', label: '¥ — Japanese Yen (JPY)' },
  { value: '₹', label: '₹ — Indian Rupee (INR)' },
  { value: 'C$', label: 'C$ — Canadian Dollar (CAD)' },
  { value: 'A$', label: 'A$ — Australian Dollar (AUD)' },
  { value: '₱', label: '₱ — Philippine Peso (PHP)' },
  { value: 'R$', label: 'R$ — Brazilian Real (BRL)' },
  { value: 'CHF', label: 'CHF — Swiss Franc (CHF)' },
  { value: 'EC$', label: 'EC$ — East Caribbean Dollar (XCD)' },
];

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)' },
  { value: 'Europe/Paris', label: 'Central European Time (CET)' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
  { value: 'Asia/Shanghai', label: 'China Standard Time (CST)' },
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)' },
];

const DATE_FORMAT_OPTIONS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (03/09/2026)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (09/03/2026)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2026-03-09)' },
  { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY (09-Mar-2026)' },
  { value: 'MMM DD, YYYY', label: 'MMM DD, YYYY (Mar 09, 2026)' },
];

export default function SystemSettings() {
  const { refreshBranding } = useBranding();
  const [activeTab, setActiveTab] = useState('site');
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [editedValues, setEditedValues] = useState<Record<string, unknown>>({});
  const [branding, setBranding] = useState<BrandingSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loginLogoPreview, setLoginLogoPreview] = useState<string | null>(null);
  const [uploadingLoginLogo, setUploadingLoginLogo] = useState(false);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [loginBgPreview, setLoginBgPreview] = useState<string | null>(null);
  const [uploadingLoginBg, setUploadingLoginBg] = useState(false);
  const [dashboardBgPreview, setDashboardBgPreview] = useState<string | null>(null);
  const [uploadingDashboardBg, setUploadingDashboardBg] = useState(false);
  // Background gallery state
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryTarget, setGalleryTarget] = useState<'login' | 'site' | 'dashboard'>('login');
  const [galleryFiles, setGalleryFiles] = useState<UploadedFile[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const [negativeBalanceEnabled, setNegativeBalanceEnabled] = useState(false);
  const [negativeBalanceCap, setNegativeBalanceCap] = useState<number>(0);
  const [savingFinancial, setSavingFinancial] = useState(false);

  // SMTP state
  const [smtp, setSmtp] = useState<Partial<SmtpSettings>>({
    smtp_host: '',
    smtp_port: 587,
    smtp_secure: false,
    smtp_user: '',
    smtp_password: '',
    smtp_from_name: '',
    smtp_from_email: '',
  });
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  // Email template state
  const [emailTemplates, setEmailTemplates] = useState<Record<string, EmailTemplate>>({});
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('welcome');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateIsCustom, setTemplateIsCustom] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [resettingTemplate, setResettingTemplate] = useState(false);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [settingsData, brandingData] = await Promise.all([
        settingsApi.getAll().catch(() => []),
        brandingApi.get().catch(() => ({})),
      ]);
      const list = Array.isArray(settingsData) ? settingsData : [];
      setSettings(list);
      const initial: Record<string, unknown> = {};
      list.forEach((s) => { initial[s.id] = s.setting_value?.value; });
      setEditedValues(initial);
      const bd = brandingData || {};
      // Apply defaults for numeric fields that may be null in the database
      // This ensures sliders have real values in state, not just visual fallbacks via ??
      setBranding({
        ...bd,
        login_bg_opacity: bd.login_bg_opacity ?? 40,
        login_bg_blur: bd.login_bg_blur ?? 4,
        login_card_opacity: bd.login_card_opacity ?? 100,
      });
      if (bd.logo_url) setLogoPreview(bd.logo_url);
      if (bd.favicon_url) setFaviconPreview(bd.favicon_url);
      if (bd.login_logo_url) setLoginLogoPreview(bd.login_logo_url);
      if (bd.site_background_image) setBgPreview(bd.site_background_image);
      if (bd.login_background_image) setLoginBgPreview(bd.login_background_image);
      if (bd.dashboard_background_image) setDashboardBgPreview(bd.dashboard_background_image);

      // Load negative balance settings
      try {
        const enabledVal = await settingsApi.getByKey<unknown>('negative_balance_enabled');
        let enabled = false;
        if (enabledVal === true || enabledVal === 'true') {
          enabled = true;
        } else if (typeof enabledVal === 'string') {
          try { enabled = JSON.parse(enabledVal) === true; } catch { enabled = enabledVal.toLowerCase() === 'true'; }
        }
        setNegativeBalanceEnabled(enabled);
      } catch {
        setNegativeBalanceEnabled(false);
      }
      try {
        const capVal = await settingsApi.getByKey<unknown>('negative_balance_cap');
        let cap = 0;
        if (typeof capVal === 'number') {
          cap = capVal;
        } else if (typeof capVal === 'string') {
          try { cap = parseFloat(JSON.parse(capVal)) || 0; } catch { cap = parseFloat(capVal) || 0; }
        }
        setNegativeBalanceCap(cap);
      } catch {
        setNegativeBalanceCap(0);
      }

      // Load SMTP settings
      try {
        const smtpData = await smtpApi.get();
        if (smtpData && typeof smtpData === 'object') {
          setSmtp({
            smtp_host: smtpData.smtp_host || '',
            smtp_port: smtpData.smtp_port || 587,
            smtp_secure: smtpData.smtp_secure || false,
            smtp_user: smtpData.smtp_user || '',
            smtp_password: smtpData.smtp_password || '',
            smtp_from_name: smtpData.smtp_from_name || '',
            smtp_from_email: smtpData.smtp_from_email || '',
          });
        }
      } catch {
        // SMTP not configured yet — that's fine
      }

      // Load email templates
      try {
        const tplData = await emailTemplateApi.getAll();
        if (tplData && typeof tplData === 'object') {
          setEmailTemplates(tplData);
          // Load the first template into the editor
          const firstKey = 'welcome';
          if (tplData[firstKey]) {
            setTemplateSubject(tplData[firstKey].subject);
            setTemplateBody(tplData[firstKey].body);
            setTemplateIsCustom(tplData[firstKey].is_custom);
          }
        }
      } catch {
        // Templates not loaded — that's fine
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      for (const setting of settings) {
        if (editedValues[setting.id] !== setting.setting_value?.value) {
          await settingsApi.update(setting.setting_key, editedValues[setting.id]);
        }
      }
      showMessage('success', 'Settings saved successfully!');
      await loadData();
    } catch {
      showMessage('error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSiteSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await settingsApi.updateBranding(branding);
      showMessage('success', 'Site & Brand settings saved successfully!');
      await loadData();
      // Refresh the global branding context so all components update immediately
      await refreshBranding();
    } catch {
      showMessage('error', 'Failed to save site settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoPreview(dataUrl);
      setBranding(prev => ({ ...prev, logo_url: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleLoginLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show immediate preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLoginLogoPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to server
    setUploadingLoginLogo(true);
    try {
      const result = await uploadApi.uploadImage('logos', file);
      setBranding(prev => ({ ...prev, login_logo_url: result.path }));
      setLoginLogoPreview(result.path);
      showMessage('success', 'Login logo uploaded! Click "Save Login & Colors" to apply.');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to upload logo');
    } finally {
      setUploadingLoginLogo(false);
    }
  };

  const handleRemoveLoginLogo = () => {
    setBranding(prev => ({ ...prev, login_logo_url: '' }));
    setLoginLogoPreview(null);
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show immediate preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFaviconPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to server
    setUploadingFavicon(true);
    try {
      const result = await uploadApi.uploadImage('logos', file);
      setBranding(prev => ({ ...prev, favicon_url: result.path }));
      setFaviconPreview(result.path);
      showMessage('success', 'Favicon uploaded! Click "Save Login & Colors" to apply.');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to upload favicon');
    } finally {
      setUploadingFavicon(false);
    }
  };

  const handleRemoveFavicon = () => {
    setBranding(prev => ({ ...prev, favicon_url: '' }));
    setFaviconPreview(null);
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show immediate preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBgPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to server
    setUploadingBg(true);
    try {
      const result = await uploadApi.uploadImage('backgrounds', file);
      setBranding(prev => ({ ...prev, site_background_image: result.path }));
      setBgPreview(result.path);
      showMessage('success', 'Background image uploaded! Click "Save Site Settings" to apply.');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to upload background image');
    } finally {
      setUploadingBg(false);
    }
  };

  const handleRemoveBg = () => {
    setBranding(prev => ({ ...prev, site_background_image: '' }));
    setBgPreview(null);
  };

  const handleLoginBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showMessage('error', 'File must be under 5MB'); return; }

    // Show immediate data-URL preview so the user sees the image right away
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLoginBgPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    setUploadingLoginBg(true);
    try {
      const result = await uploadApi.uploadImage('backgrounds', file);
      setBranding(prev => ({ ...prev, login_background_image: result.path }));
      // Update preview to the server path (which Express serves via /uploads)
      setLoginBgPreview(result.path);
      showMessage('success', 'Login background uploaded! Click "Save Site Settings" to apply.');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to upload login background');
    } finally {
      setUploadingLoginBg(false);
    }
  };

  const handleRemoveLoginBg = () => {
    setBranding(prev => ({ ...prev, login_background_image: '' }));
    setLoginBgPreview(null);
  };

  const handleDashboardBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showMessage('error', 'File must be under 5MB'); return; }
    setUploadingDashboardBg(true);
    try {
      const result = await uploadApi.uploadImage('backgrounds', file);
      setBranding(prev => ({ ...prev, dashboard_background_image: result.path }));
      setDashboardBgPreview(result.path);
      showMessage('success', 'Dashboard background uploaded! Click "Save Site Settings" to apply.');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to upload dashboard background');
    } finally {
      setUploadingDashboardBg(false);
    }
  };

  const handleRemoveDashboardBg = () => {
    setBranding(prev => ({ ...prev, dashboard_background_image: '' }));
    setDashboardBgPreview(null);
  };

  // ─── Background Gallery helpers ───────────────────────────────────────────
  const openGallery = async (target: 'login' | 'site' | 'dashboard') => {
    setGalleryTarget(target);
    setGalleryOpen(true);
    setGalleryLoading(true);
    try {
      const files = await uploadApi.listByCategory('backgrounds');
      setGalleryFiles(files);
    } catch {
      showMessage('error', 'Failed to load previously uploaded backgrounds');
      setGalleryFiles([]);
    } finally {
      setGalleryLoading(false);
    }
  };

  const handleGallerySelect = (file: UploadedFile) => {
    const path = file.path;
    if (galleryTarget === 'login') {
      setBranding(prev => ({ ...prev, login_background_image: path }));
      setLoginBgPreview(path);
    } else if (galleryTarget === 'site') {
      setBranding(prev => ({ ...prev, site_background_image: path }));
      setBgPreview(path);
    } else {
      setBranding(prev => ({ ...prev, dashboard_background_image: path }));
      setDashboardBgPreview(path);
    }
    setGalleryOpen(false);
    showMessage('success', 'Background selected! Click the Save button to apply.');
  };

  const handleGalleryDelete = async (file: UploadedFile) => {
    if (!confirm(`Delete "${file.filename}"? This cannot be undone.`)) return;
    setDeletingFile(file.filename);
    try {
      await uploadApi.deleteFile('backgrounds', file.filename);
      setGalleryFiles(prev => prev.filter(f => f.filename !== file.filename));
      // If the deleted file is currently selected, clear it
      if (loginBgPreview === file.path) {
        setBranding(prev => ({ ...prev, login_background_image: '' }));
        setLoginBgPreview(null);
      }
      if (bgPreview === file.path) {
        setBranding(prev => ({ ...prev, site_background_image: '' }));
        setBgPreview(null);
      }
      if (dashboardBgPreview === file.path) {
        setBranding(prev => ({ ...prev, dashboard_background_image: '' }));
        setDashboardBgPreview(null);
      }
      showMessage('success', 'Background image deleted.');
    } catch {
      showMessage('error', 'Failed to delete background image');
    } finally {
      setDeletingFile(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSaveFinancialSettings = async () => {
    setSavingFinancial(true);
    setMessage(null);
    try {
      await settingsApi.update('negative_balance_enabled', negativeBalanceEnabled);
      await settingsApi.update('negative_balance_cap', negativeBalanceEnabled ? negativeBalanceCap : 0);
      showMessage('success', 'Financial settings saved successfully!');
    } catch {
      showMessage('error', 'Failed to save financial settings');
    } finally {
      setSavingFinancial(false);
    }
  };

  const handleSaveSmtp = async () => {
    setSavingSmtp(true);
    setMessage(null);
    try {
      await smtpApi.save(smtp);
      showMessage('success', 'SMTP settings saved successfully!');
    } catch {
      showMessage('error', 'Failed to save SMTP settings');
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!testEmail) {
      showMessage('error', 'Please enter a recipient email address for the test');
      return;
    }
    setTestingSmtp(true);
    setMessage(null);
    try {
      const result = await smtpApi.sendTest(testEmail);
      showMessage('success', result.message || 'Test email sent successfully!');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to send test email. Check your SMTP settings.');
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleSelectTemplate = useCallback((key: string) => {
    setSelectedTemplateKey(key);
    const tpl = emailTemplates[key];
    if (tpl) {
      setTemplateSubject(tpl.subject);
      setTemplateBody(tpl.body);
      setTemplateIsCustom(tpl.is_custom);
    }
  }, [emailTemplates]);

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    setMessage(null);
    try {
      const result = await emailTemplateApi.save(selectedTemplateKey, {
        subject: templateSubject,
        body: templateBody,
      });
      setTemplateIsCustom(true);
      setEmailTemplates((prev) => ({
        ...prev,
        [selectedTemplateKey]: {
          key: selectedTemplateKey,
          subject: templateSubject,
          body: templateBody,
          is_custom: true,
        },
      }));
      showMessage('success', result.message || 'Email template saved successfully!');
    } catch {
      showMessage('error', 'Failed to save email template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleResetTemplate = async () => {
    setResettingTemplate(true);
    setMessage(null);
    try {
      const result = await emailTemplateApi.reset(selectedTemplateKey);
      setTemplateSubject(result.subject);
      setTemplateBody(result.body);
      setTemplateIsCustom(false);
      setEmailTemplates((prev) => ({
        ...prev,
        [selectedTemplateKey]: {
          key: selectedTemplateKey,
          subject: result.subject,
          body: result.body,
          is_custom: false,
        },
      }));
      showMessage('success', result.message || 'Email template reset to default!');
    } catch {
      showMessage('error', 'Failed to reset email template');
    } finally {
      setResettingTemplate(false);
    }
  };

  const getPreviewHtml = () => {
    const sampleVars: Record<string, string> = {
      user_name: 'John Smith',
      user_email: 'john.smith@school.edu',
      user_role: 'Cashier',
      reset_link: 'https://example.com/reset-password?token=abc123',
      app_name: branding.company_name || 'YAMZ Cafe',
      login_url: 'https://example.com',
      expiry_hours: '24',
    };
    let html = templateBody;
    for (const [key, value] of Object.entries(sampleVars)) {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return html;
  };

  const TEMPLATE_OPTIONS = [
    { key: 'welcome', label: 'Welcome Email', description: 'Sent to new users created by admin' },
    { key: 'reset_password', label: 'Password Reset', description: 'Sent when user requests password reset' },
    { key: 'parent_welcome', label: 'Parent Registration', description: 'Sent to self-registered parents' },
  ];

  const PLACEHOLDER_DOCS = [
    { placeholder: '{{user_name}}', description: "Recipient's full name" },
    { placeholder: '{{user_email}}', description: "Recipient's email address" },
    { placeholder: '{{user_role}}', description: "User's role (e.g. Cashier, Parent)" },
    { placeholder: '{{reset_link}}', description: 'Password reset URL' },
    { placeholder: '{{app_name}}', description: 'Your organization name' },
    { placeholder: '{{login_url}}', description: 'Login page URL' },
    { placeholder: '{{expiry_hours}}', description: 'Token expiry time (e.g. 24)' },
  ];

  const categories = [...new Set(settings.map((s) => s.category))];

  const renderSettingInput = (setting: SystemSetting) => {
    const value = editedValues[setting.id];
    const type = typeof setting.setting_value?.value;

    if (type === 'boolean') {
      return (
        <Switch
          checked={!!value}
          onCheckedChange={(v) => setEditedValues({ ...editedValues, [setting.id]: v })}
          disabled={!setting.is_editable}
        />
      );
    }

    if (type === 'number') {
      return (
        <Input
          type="number"
          step="0.01"
          value={String(value ?? '')}
          onChange={(e) => setEditedValues({ ...editedValues, [setting.id]: parseFloat(e.target.value) || 0 })}
          disabled={!setting.is_editable}
        />
      );
    }

    return (
      <Input
        value={String(value ?? '')}
        onChange={(e) => setEditedValues({ ...editedValues, [setting.id]: e.target.value })}
        disabled={!setting.is_editable}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground">Configure system-wide settings and branding</p>
      </div>

      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="site" className="gap-1">
            <Building2 className="h-4 w-4" /> Site & Brand
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-1">
            <Palette className="h-4 w-4" /> Login & Colors
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1">
            <Mail className="h-4 w-4" /> Email / SMTP
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-1">
            <Settings className="h-4 w-4" /> Advanced
          </TabsTrigger>
        </TabsList>

        {/* ─── Site & Brand Settings Tab ─── */}
        <TabsContent value="site" className="space-y-6 mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Organization Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600" />
                    Organization Information
                  </CardTitle>
                  <CardDescription>Basic information about your school or organization</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company_name">School / Organization Name</Label>
                      <Input
                        id="company_name"
                        value={branding.company_name || ''}
                        onChange={(e) => setBranding(prev => ({ ...prev, company_name: e.target.value }))}
                        placeholder="e.g. Lincoln Elementary School"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tagline">Tagline / Slogan</Label>
                      <Input
                        id="tagline"
                        value={branding.tagline || ''}
                        onChange={(e) => setBranding(prev => ({ ...prev, tagline: e.target.value }))}
                        placeholder="e.g. Nourishing Young Minds"
                      />
                    </div>
                  </div>

                  {/* Logo Upload */}
                  <div className="space-y-2">
                    <Label>Logo</Label>
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-24 h-24 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center overflow-hidden bg-muted/50">
                        {logoPreview ? (
                          <img
                            src={logoPreview}
                            alt="Logo preview"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Image className="h-8 w-8 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoFileChange}
                          className="cursor-pointer"
                        />
                        <p className="text-xs text-muted-foreground">
                          Recommended: PNG or SVG, at least 200×200px
                        </p>
                        <div className="space-y-1">
                          <Label htmlFor="logo_url" className="text-xs">Or enter logo URL directly</Label>
                          <Input
                            id="logo_url"
                            value={branding.logo_url || ''}
                            onChange={(e) => {
                              setBranding(prev => ({ ...prev, logo_url: e.target.value }));
                              setLogoPreview(e.target.value);
                            }}
                            placeholder="/images/Logo.jpg"
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Phone className="h-5 w-5 text-green-600" />
                    Contact Information
                  </CardTitle>
                  <CardDescription>How parents and staff can reach your organization</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contact_email" className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> Contact Email
                      </Label>
                      <Input
                        id="contact_email"
                        type="email"
                        value={branding.contact_email || ''}
                        onChange={(e) => setBranding(prev => ({ ...prev, contact_email: e.target.value }))}
                        placeholder="admin@school.edu"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact_phone" className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" /> Contact Phone
                      </Label>
                      <Input
                        id="contact_phone"
                        type="tel"
                        value={branding.contact_phone || ''}
                        onChange={(e) => setBranding(prev => ({ ...prev, contact_phone: e.target.value }))}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address" className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> Address
                    </Label>
                    <Textarea
                      id="address"
                      value={branding.address || ''}
                      onChange={(e) => setBranding(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="123 School Street, City, State 12345"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website_url" className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" /> Website URL
                    </Label>
                    <Input
                      id="website_url"
                      type="url"
                      value={branding.website_url || ''}
                      onChange={(e) => setBranding(prev => ({ ...prev, website_url: e.target.value }))}
                      placeholder="https://www.school.edu"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Regional & Format Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-5 w-5 text-purple-600" />
                    Regional & Format Settings
                  </CardTitle>
                  <CardDescription>Currency, timezone, and date display preferences</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5" /> Currency Symbol
                      </Label>
                      <Select
                        value={branding.currency_symbol || '$'}
                        onValueChange={(v) => setBranding(prev => ({ ...prev, currency_symbol: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> Time Zone
                      </Label>
                      <Select
                        value={branding.timezone || 'America/New_York'}
                        onValueChange={(v) => setBranding(prev => ({ ...prev, timezone: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" /> Date Format
                      </Label>
                      <Select
                        value={branding.date_format || 'MM/DD/YYYY'}
                        onValueChange={(v) => setBranding(prev => ({ ...prev, date_format: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select date format" />
                        </SelectTrigger>
                        <SelectContent>
                          {DATE_FORMAT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Login Page Background */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-blue-600" />
                    Login Page Background
                  </CardTitle>
                  <CardDescription>
                    Upload a custom background image for the login / sign-in page.
                    When no image is set, the default login background is used.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-6">
                    <div className="flex-shrink-0 space-y-2">
                      <div className="w-48 h-28 border-2 border-dashed border-muted-foreground/30 rounded-xl flex items-center justify-center overflow-hidden bg-muted/50">
                        {loginBgPreview ? (
                          <img src={loginBgPreview} alt="Login background preview" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center">
                            <ImageIcon className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                            <span className="text-xs text-muted-foreground/50 mt-1 block">No background</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground text-center">Preview</p>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="space-y-2">
                        <Label>Upload Login Background</Label>
                        <div className="flex items-center gap-2">
                          <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLoginBgUpload} disabled={uploadingLoginBg} className="cursor-pointer flex-1" />
                          {uploadingLoginBg && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground">Accepts JPEG, PNG, WebP. Max 5MB. Recommended: 1920×1080px or larger.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openGallery('login')} className="gap-1.5">
                        <ImageIcon className="h-4 w-4" /> Browse Previously Uploaded
                      </Button>
                      <div className="space-y-2">
                        <Label htmlFor="login_bg_url" className="text-sm">Or enter URL directly</Label>
                        <Input
                          id="login_bg_url"
                          value={branding.login_background_image || ''}
                          onChange={(e) => { setBranding(prev => ({ ...prev, login_background_image: e.target.value })); setLoginBgPreview(e.target.value || null); }}
                          placeholder="/uploads/backgrounds/login-bg.jpg or https://..."
                          className="text-sm"
                        />
                      </div>
                      {loginBgPreview && (
                        <Button variant="outline" size="sm" onClick={handleRemoveLoginBg} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4 mr-1" /> Remove Login Background
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Overlay Opacity & Blur Controls */}
                  <div className="border-t pt-4 space-y-4">
                    <h4 className="text-sm font-semibold text-muted-foreground">Overlay Settings</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Overlay Opacity</Label>
                          <span className="text-sm font-mono text-muted-foreground">{branding.login_bg_opacity ?? 40}%</span>
                        </div>
                        <Slider
                          value={[branding.login_bg_opacity ?? 40]}
                          onValueChange={([v]) => setBranding(prev => ({ ...prev, login_bg_opacity: v }))}
                          min={0}
                          max={100}
                          step={5}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          Controls the dark overlay on the login background. 0% = fully transparent, 100% = fully opaque.
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Background Blur</Label>
                          <span className="text-sm font-mono text-muted-foreground">{branding.login_bg_blur ?? 4}px</span>
                        </div>
                        <Slider
                          value={[branding.login_bg_blur ?? 4]}
                          onValueChange={([v]) => setBranding(prev => ({ ...prev, login_bg_blur: v }))}
                          min={0}
                          max={20}
                          step={1}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          Controls the blur effect on the login background image. 0px = no blur, 20px = heavy blur.
                        </p>
                      </div>

                      {/* Login Card Opacity */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Card Window Opacity</Label>
                          <span className="text-sm font-mono text-muted-foreground">{branding.login_card_opacity ?? 100}%</span>
                        </div>
                        <Slider
                          value={[branding.login_card_opacity ?? 100]}
                          onValueChange={([v]) => setBranding(prev => ({ ...prev, login_card_opacity: v }))}
                          min={20}
                          max={100}
                          step={5}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground">
                          Controls the opacity of the white sign-in card. 100% = fully solid, 20% = mostly transparent with blur effect.
                        </p>
                      </div>
                    </div>

                    {/* Live Preview */}
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Live Preview</Label>
                      <div className="relative w-full h-32 rounded-xl overflow-hidden border">
                        <div
                          className="absolute inset-0 bg-cover bg-center"
                          style={{
                            backgroundImage: loginBgPreview
                              ? `url("${loginBgPreview}")`
                              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          }}
                        />
                        <div
                          className="absolute inset-0"
                          style={{
                            backgroundColor: `rgba(0, 0, 0, ${(branding.login_bg_opacity ?? 40) / 100})`,
                            backdropFilter: `blur(${branding.login_bg_blur ?? 4}px)`,
                            WebkitBackdropFilter: `blur(${branding.login_bg_blur ?? 4}px)`,
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div
                            className="rounded-lg px-6 py-3 shadow-lg"
                            style={{
                              backgroundColor: `rgba(255, 255, 255, ${(branding.login_card_opacity ?? 100) / 100})`,
                              backdropFilter: (branding.login_card_opacity ?? 100) < 100 ? 'blur(8px)' : undefined,
                            }}
                          >
                            <p className="text-sm font-semibold text-slate-800">Login Card Preview</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Site Background */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-green-600" />
                    Site Background
                  </CardTitle>
                  <CardDescription>
                    Upload a custom background image used across the site.
                    When no image is set, the default site background is used.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-6">
                    <div className="flex-shrink-0 space-y-2">
                      <div className="w-48 h-28 border-2 border-dashed border-muted-foreground/30 rounded-xl flex items-center justify-center overflow-hidden bg-muted/50">
                        {bgPreview ? (
                          <img src={bgPreview} alt="Site background preview" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center">
                            <ImageIcon className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                            <span className="text-xs text-muted-foreground/50 mt-1 block">No background</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground text-center">Preview</p>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="space-y-2">
                        <Label>Upload Site Background</Label>
                        <div className="flex items-center gap-2">
                          <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleBgUpload} disabled={uploadingBg} className="cursor-pointer flex-1" />
                          {uploadingBg && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground">Accepts JPEG, PNG, WebP. Max 5MB. Recommended: 1920×1080px or larger.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openGallery('site')} className="gap-1.5">
                        <ImageIcon className="h-4 w-4" /> Browse Previously Uploaded
                      </Button>
                      <div className="space-y-2">
                        <Label htmlFor="site_bg_url" className="text-sm">Or enter URL directly</Label>
                        <Input
                          id="site_bg_url"
                          value={branding.site_background_image || ''}
                          onChange={(e) => { setBranding(prev => ({ ...prev, site_background_image: e.target.value })); setBgPreview(e.target.value || null); }}
                          placeholder="/uploads/backgrounds/site-bg.jpg or https://..."
                          className="text-sm"
                        />
                      </div>
                      {bgPreview && (
                        <Button variant="outline" size="sm" onClick={handleRemoveBg} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4 mr-1" /> Remove Site Background
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Dashboard / App Background */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-amber-600" />
                    Dashboard / App Background
                  </CardTitle>
                  <CardDescription>
                    Upload a custom background image for the main dashboard and in-app pages.
                    When no image is set, the default app background is used.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-6">
                    <div className="flex-shrink-0 space-y-2">
                      <div className="w-48 h-28 border-2 border-dashed border-muted-foreground/30 rounded-xl flex items-center justify-center overflow-hidden bg-muted/50">
                        {dashboardBgPreview ? (
                          <img src={dashboardBgPreview} alt="Dashboard background preview" className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-center">
                            <ImageIcon className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                            <span className="text-xs text-muted-foreground/50 mt-1 block">No background</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground text-center">Preview</p>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="space-y-2">
                        <Label>Upload Dashboard Background</Label>
                        <div className="flex items-center gap-2">
                          <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleDashboardBgUpload} disabled={uploadingDashboardBg} className="cursor-pointer flex-1" />
                          {uploadingDashboardBg && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground">Accepts JPEG, PNG, WebP. Max 5MB. Recommended: 1920×1080px or larger.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openGallery('dashboard')} className="gap-1.5">
                        <ImageIcon className="h-4 w-4" /> Browse Previously Uploaded
                      </Button>
                      <div className="space-y-2">
                        <Label htmlFor="dashboard_bg_url" className="text-sm">Or enter URL directly</Label>
                        <Input
                          id="dashboard_bg_url"
                          value={branding.dashboard_background_image || ''}
                          onChange={(e) => { setBranding(prev => ({ ...prev, dashboard_background_image: e.target.value })); setDashboardBgPreview(e.target.value || null); }}
                          placeholder="/uploads/backgrounds/dashboard-bg.jpg or https://..."
                          className="text-sm"
                        />
                      </div>
                      {dashboardBgPreview && (
                        <Button variant="outline" size="sm" onClick={handleRemoveDashboardBg} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4 mr-1" /> Remove Dashboard Background
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleSaveSiteSettings} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save Site Settings
                </Button>
              </div>

              {/* Financial Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-green-600" />
                    Financial Settings
                  </CardTitle>
                  <CardDescription>
                    Configure financial policies for student accounts and transactions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Enable/Disable Negative Balance Toggle */}
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                    <div className="space-y-1">
                      <Label className="text-sm font-semibold flex items-center gap-1.5">
                        <Wallet className="h-4 w-4" />
                        Allow Negative Balances
                      </Label>
                      <p className="text-xs text-muted-foreground max-w-md">
                        When enabled, students can make purchases even if their account balance is insufficient.
                        The charge will be placed against their account, creating a negative balance up to the configured limit.
                      </p>
                    </div>
                    <Switch
                      checked={negativeBalanceEnabled}
                      onCheckedChange={setNegativeBalanceEnabled}
                    />
                  </div>

                  {/* Negative Balance Cap Amount */}
                  {negativeBalanceEnabled && (
                    <div className="space-y-3 pl-4 border-l-2 border-amber-300">
                      <div className="space-y-2">
                        <Label htmlFor="negative_balance_cap" className="flex items-center gap-1.5">
                          <DollarSign className="h-3.5 w-3.5" />
                          Maximum Negative Balance Limit
                        </Label>
                        <div className="flex items-center gap-2 max-w-xs">
                          <span className="text-lg font-semibold text-muted-foreground">$</span>
                          <Input
                            id="negative_balance_cap"
                            type="number"
                            min="0.01"
                            step="0.50"
                            value={String(negativeBalanceCap)}
                            onChange={(e) => setNegativeBalanceCap(parseFloat(e.target.value) || 0)}
                            placeholder="10.00"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          The maximum amount a student account can go into the negative. For example, setting this to <strong>$10.00</strong> means
                          a student with $0.00 balance can still make purchases up to $10.00, resulting in a -$10.00 balance.
                        </p>
                      </div>

                      {negativeBalanceCap > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                          <strong>Active:</strong> Students can go up to <strong>-${negativeBalanceCap.toFixed(2)}</strong> in their account balance.
                          Orders will be allowed as long as the resulting balance doesn&apos;t exceed this limit.
                        </div>
                      )}
                      {negativeBalanceCap <= 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                          <strong>Warning:</strong> Please set a limit greater than $0.00 to allow negative balances.
                        </div>
                      )}
                    </div>
                  )}

                  {!negativeBalanceEnabled && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                      <strong>Disabled:</strong> Students must have sufficient balance to place orders. No negative balances are allowed.
                      Charges will not be placed against student accounts when funds are insufficient.
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleSaveFinancialSettings} disabled={savingFinancial}>
                  {savingFinancial ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save Financial Settings
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── Login & Colors Tab (previously "Branding") ─── */}
        <TabsContent value="branding" className="space-y-6 mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Login Page Logo Upload */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Image className="h-5 w-5 text-indigo-600" />
                    Login Page Logo
                  </CardTitle>
                  <CardDescription>
                    Upload a logo to display on the login page. This appears above the sign-in form.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-6">
                    {/* Preview */}
                    <div className="flex-shrink-0 space-y-2">
                      <div className="w-32 h-32 border-2 border-dashed border-muted-foreground/30 rounded-xl flex items-center justify-center overflow-hidden bg-muted/50">
                        {loginLogoPreview ? (
                          <img
                            src={loginLogoPreview}
                            alt="Login logo preview"
                            className="w-full h-full object-contain p-2"
                          />
                        ) : (
                          <div className="text-center">
                            <Image className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                            <span className="text-xs text-muted-foreground/50 mt-1 block">No logo</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground text-center">Preview</p>
                    </div>

                    {/* Upload controls */}
                    <div className="flex-1 space-y-3">
                      <div className="space-y-2">
                        <Label>Upload Logo Image</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
                            onChange={handleLoginLogoUpload}
                            disabled={uploadingLoginLogo}
                            className="cursor-pointer flex-1"
                          />
                          {uploadingLoginLogo && (
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Accepts JPEG, PNG, WebP, SVG, GIF. Max 5MB. Recommended: 200×200px or larger, square or landscape.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="login_logo_url" className="text-sm">Or enter URL directly</Label>
                        <Input
                          id="login_logo_url"
                          value={branding.login_logo_url || ''}
                          onChange={(e) => {
                            setBranding(prev => ({ ...prev, login_logo_url: e.target.value }));
                            setLoginLogoPreview(e.target.value || null);
                          }}
                          placeholder="/uploads/logos/my-logo.png"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Logo Display Size</Label>
                        <Select
                          value={branding.login_logo_size || 'xlarge'}
                          onValueChange={(v) => setBranding(prev => ({ ...prev, login_logo_size: v }))}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Select size" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="small">Small (48px)</SelectItem>
                            <SelectItem value="medium">Medium (64px)</SelectItem>
                            <SelectItem value="large">Large (80px)</SelectItem>
                            <SelectItem value="xlarge">X-Large (96px)</SelectItem>
                            <SelectItem value="2xlarge">2X-Large (128px)</SelectItem>
                            <SelectItem value="3xlarge">3X-Large (160px)</SelectItem>
                            <SelectItem value="4xlarge">4X-Large (200px)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {loginLogoPreview && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveLoginLogo}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Remove Login Logo
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Favicon */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Favicon (Browser Tab Icon)</CardTitle>
                  <CardDescription>Upload a custom favicon for the browser tab. If not set, the main logo will be used. Recommended: 32×32 or 64×64 PNG/ICO/SVG.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-6">
                    <div className="flex-shrink-0">
                      {faviconPreview ? (
                        <img
                          src={faviconPreview}
                          alt="Favicon preview"
                          className="h-16 w-16 object-contain border rounded bg-white p-1"
                        />
                      ) : (
                        <div className="h-16 w-16 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground text-xs text-center">
                          No favicon
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 flex-1">
                      <div>
                        <Label htmlFor="favicon-upload" className="cursor-pointer">
                          <span className="inline-flex items-center px-3 py-1.5 border rounded-md text-sm hover:bg-accent transition-colors">
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Favicon
                          </span>
                        </Label>
                        <input
                          id="favicon-upload"
                          type="file"
                          accept="image/png,image/x-icon,image/svg+xml,image/ico,image/vnd.microsoft.icon"
                          className="hidden"
                          onChange={handleFaviconUpload}
                          disabled={uploadingFavicon}
                        />
                        {uploadingFavicon && (
                          <span className="ml-2 text-sm text-muted-foreground">Uploading...</span>
                        )}
                      </div>
                      <div>
                        <Label className="text-sm text-muted-foreground">Or enter URL</Label>
                        <Input
                          value={branding.favicon_url || ''}
                          onChange={(e) => {
                            setBranding(prev => ({ ...prev, favicon_url: e.target.value }));
                            setFaviconPreview(e.target.value || null);
                          }}
                          placeholder="https://example.com/favicon.png"
                          className="mt-1"
                        />
                      </div>
                      {faviconPreview && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveFavicon}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Remove Favicon
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Login Page Text */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Login Page Text</CardTitle>
                  <CardDescription>Customize the welcome message on the login page</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Welcome Text</Label>
                      <Input
                        value={branding.welcome_text || ''}
                        onChange={(e) => setBranding(prev => ({ ...prev, welcome_text: e.target.value }))}
                        placeholder="Welcome Back"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Subtitle Text</Label>
                      <Input
                        value={branding.subtitle_text || ''}
                        onChange={(e) => setBranding(prev => ({ ...prev, subtitle_text: e.target.value }))}
                        placeholder="Sign in to access your account"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Color Scheme */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-5 w-5" /> Color Scheme
                  </CardTitle>
                  <CardDescription>Brand colors used throughout the application</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { key: 'primary_color' as const, label: 'Primary Color', default: '#1e3a8a' },
                    { key: 'secondary_color' as const, label: 'Secondary Color', default: '#0f766e' },
                    { key: 'accent_color' as const, label: 'Accent Color', default: '#ea580c' },
                  ].map(({ key, label, default: def }) => (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={branding[key] || def}
                          onChange={(e) => setBranding(prev => ({ ...prev, [key]: e.target.value }))}
                          className="h-10 w-20 rounded border cursor-pointer"
                        />
                        <Input
                          value={branding[key] || def}
                          onChange={(e) => setBranding(prev => ({ ...prev, [key]: e.target.value }))}
                          className="flex-1"
                        />
                        <div
                          className="h-10 w-10 rounded-lg border shadow-sm"
                          style={{ backgroundColor: branding[key] || def }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleSaveSiteSettings} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save Login & Colors
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ─── Email / SMTP Tab ─── */}
        <TabsContent value="email" className="space-y-6 mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* SMTP Server Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="h-5 w-5 text-blue-600" />
                    SMTP Server Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure your outgoing mail server to send notifications, receipts, and alerts to parents and staff.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="smtp_host">SMTP Host</Label>
                      <Input
                        id="smtp_host"
                        value={smtp.smtp_host || ''}
                        onChange={(e) => setSmtp({ ...smtp, smtp_host: e.target.value })}
                        placeholder="smtp.gmail.com"
                      />
                      <p className="text-xs text-muted-foreground">
                        e.g. smtp.gmail.com, smtp.office365.com, smtp.sendgrid.net
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtp_port">SMTP Port</Label>
                      <Input
                        id="smtp_port"
                        type="number"
                        value={String(smtp.smtp_port || 587)}
                        onChange={(e) => {
                          const port = parseInt(e.target.value, 10) || 587;
                          setSmtp({ ...smtp, smtp_port: port, smtp_secure: port === 465 });
                        }}
                        placeholder="587"
                      />
                      <p className="text-xs text-muted-foreground">
                        Common ports: 587 (STARTTLS — recommended), 465 (SSL), 25 (unencrypted)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Switch
                      checked={!!smtp.smtp_secure}
                      onCheckedChange={(v) => setSmtp({ ...smtp, smtp_secure: v })}
                    />
                    <div>
                      <Label className="cursor-pointer">Use implicit SSL (port 465 only)</Label>
                      <p className="text-xs text-muted-foreground">
                        Auto-detected based on port. Port 465 → SSL (on). Port 587 → STARTTLS (off, upgraded automatically).
                        The server always auto-corrects this based on port, so misconfiguration is safe.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="smtp_user">SMTP Username / Email</Label>
                      <Input
                        id="smtp_user"
                        value={smtp.smtp_user || ''}
                        onChange={(e) => setSmtp({ ...smtp, smtp_user: e.target.value })}
                        placeholder="noreply@yourschool.edu"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtp_password">SMTP Password / App Password</Label>
                      <div className="relative">
                        <Input
                          id="smtp_password"
                          type={showSmtpPassword ? 'text' : 'password'}
                          value={smtp.smtp_password || ''}
                          onChange={(e) => setSmtp({ ...smtp, smtp_password: e.target.value })}
                          placeholder="••••••••"
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full w-10"
                          onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                        >
                          {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        For Gmail, use an App Password (not your regular password).
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Sender Identity */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="h-5 w-5 text-green-600" />
                    Sender Identity
                  </CardTitle>
                  <CardDescription>
                    The name and email address that will appear as the sender in outgoing emails.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="smtp_from_name">Sender Name</Label>
                      <Input
                        id="smtp_from_name"
                        value={smtp.smtp_from_name || ''}
                        onChange={(e) => setSmtp({ ...smtp, smtp_from_name: e.target.value })}
                        placeholder="YAMZ Cafe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtp_from_email">Sender Email</Label>
                      <Input
                        id="smtp_from_email"
                        type="email"
                        value={smtp.smtp_from_email || ''}
                        onChange={(e) => setSmtp({ ...smtp, smtp_from_email: e.target.value })}
                        placeholder="noreply@yourschool.edu"
                      />
                      <p className="text-xs text-muted-foreground">
                        If left blank, the SMTP username will be used.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleSaveSmtp} disabled={savingSmtp}>
                  {savingSmtp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save SMTP Settings
                </Button>
              </div>

              {/* Test Email */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-amber-600" />
                    Test Email Configuration
                  </CardTitle>
                  <CardDescription>
                    Send a test email to verify your SMTP settings are working correctly. Save your settings first!
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end gap-3">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="test_email">Recipient Email</Label>
                      <Input
                        id="test_email"
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="admin@yourschool.edu"
                      />
                    </div>
                    <Button
                      onClick={handleTestSmtp}
                      disabled={testingSmtp || !testEmail}
                      variant="outline"
                    >
                      {testingSmtp ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Send className="h-4 w-4 mr-1" />
                      )}
                      Send Test Email
                    </Button>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                    <strong>Tip:</strong> If using Gmail, enable 2-Factor Authentication and create an
                    App Password at{' '}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      myaccount.google.com/apppasswords
                    </a>.
                    Use the generated 16-character password as your SMTP password.
                  </div>
                </CardContent>
              </Card>

              {/* ─── Email Templates Section ─── */}
              <div className="pt-4 border-t">
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-violet-600" />
                  Email Templates
                </h3>
              </div>

              {/* Template Selector */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Code className="h-5 w-5 text-violet-600" />
                    Customize Email Templates
                  </CardTitle>
                  <CardDescription>
                    Edit the HTML content and subject lines for emails sent by the system.
                    Use placeholders like <code className="bg-muted px-1 py-0.5 rounded text-xs">{'{{user_name}}'}</code> that get replaced with actual values at send time.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Template picker */}
                  <div className="space-y-2">
                    <Label>Select Template</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {TEMPLATE_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => handleSelectTemplate(opt.key)}
                          className={`text-left p-3 rounded-lg border-2 transition-all ${
                            selectedTemplateKey === opt.key
                              ? 'border-primary bg-primary/5'
                              : 'border-muted hover:border-muted-foreground/30'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{opt.label}</span>
                            {emailTemplates[opt.key]?.is_custom && (
                              <Badge variant="secondary" className="text-xs">Custom</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{opt.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subject line */}
                  <div className="space-y-2">
                    <Label htmlFor="tpl_subject">Subject Line</Label>
                    <Input
                      id="tpl_subject"
                      value={templateSubject}
                      onChange={(e) => setTemplateSubject(e.target.value)}
                      placeholder="Email subject..."
                    />
                  </div>

                  {/* HTML Body */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="tpl_body">HTML Body</Label>
                      <div className="flex items-center gap-2">
                        {templateIsCustom && (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                            Customized
                          </Badge>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowTemplatePreview(true)}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Preview
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      id="tpl_body"
                      value={templateBody}
                      onChange={(e) => setTemplateBody(e.target.value)}
                      placeholder="<html>...</html>"
                      rows={16}
                      className="font-mono text-xs leading-relaxed"
                    />
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      onClick={handleResetTemplate}
                      disabled={resettingTemplate || !templateIsCustom}
                      className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                    >
                      {resettingTemplate ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <RotateCcw className="h-4 w-4 mr-1" />
                      )}
                      Reset to Default
                    </Button>
                    <Button onClick={handleSaveTemplate} disabled={savingTemplate}>
                      {savingTemplate ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Save className="h-4 w-4 mr-1" />
                      )}
                      Save Template
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Available Placeholders Reference */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-5 w-5 text-indigo-600" />
                    Available Placeholders
                  </CardTitle>
                  <CardDescription>
                    Use these placeholders in your email templates. They will be replaced with actual values when the email is sent.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {PLACEHOLDER_DOCS.map((p) => (
                      <div
                        key={p.placeholder}
                        className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                      >
                        <code className="bg-background px-2 py-1 rounded text-xs font-mono border whitespace-nowrap">
                          {p.placeholder}
                        </code>
                        <span className="text-sm text-muted-foreground">{p.description}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Template Preview Dialog */}
              <Dialog open={showTemplatePreview} onOpenChange={setShowTemplatePreview}>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Email Preview
                      <Badge variant="secondary" className="ml-2 text-xs">Sample Data</Badge>
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-sm">
                        <strong>Subject:</strong>{' '}
                        {templateSubject
                          .replace(/\{\{app_name\}\}/g, branding.company_name || 'YAMZ Cafe')
                          .replace(/\{\{user_name\}\}/g, 'John Smith')
                          .replace(/\{\{user_email\}\}/g, 'john.smith@school.edu')
                          .replace(/\{\{user_role\}\}/g, 'Cashier')}
                      </p>
                    </div>
                    <div className="flex-1 overflow-auto border rounded-lg bg-white">
                      <iframe
                        srcDoc={getPreviewHtml()}
                        title="Email Preview"
                        className="w-full h-full min-h-[400px] border-0"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </TabsContent>

        {/* ─── Advanced Settings Tab ─── */}
        <TabsContent value="advanced" className="space-y-6 mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {categories.map((category) => {
                const catSettings = settings.filter((s) => s.category === category);
                if (catSettings.length === 0) return null;
                const meta = CATEGORY_META[category] || CATEGORY_META.general;
                const CatIcon = meta.icon;

                return (
                  <Card key={category}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 capitalize text-base">
                        <CatIcon className={`h-5 w-5 ${meta.color}`} />
                        {category} Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {catSettings.map((setting) => (
                        <div key={setting.id} className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Label className="capitalize font-semibold">
                                {setting.setting_key.replace(/_/g, ' ')}
                              </Label>
                              {!setting.is_editable && (
                                <span className="text-xs bg-muted px-2 py-0.5 rounded">Read-only</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{setting.description}</p>
                            <div className="max-w-md pt-2">
                              {renderSettingInput(setting)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}

              <div className="flex justify-end">
                <Button onClick={handleSaveSettings} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Save All Settings
                </Button>
              </div>

              {settings.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Settings className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>No advanced settings found. Settings will appear here when configured in the database.</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Background Gallery Dialog ─── */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Previously Uploaded Backgrounds
              <Badge variant="secondary" className="ml-2 text-xs capitalize">
                {galleryTarget === 'login' ? 'Login Page' : galleryTarget === 'site' ? 'Site' : 'Dashboard'}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Click an image to select it as the {galleryTarget === 'login' ? 'login page' : galleryTarget === 'site' ? 'site' : 'dashboard'} background. You can also delete old images you no longer need.
          </p>
          <div className="flex-1 overflow-auto">
            {galleryLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : galleryFiles.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No backgrounds uploaded yet</p>
                <p className="text-sm mt-1">Upload a background image first, then it will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-2">
                {galleryFiles.map((file) => {
                  const isCurrentlyUsed =
                    file.path === branding.login_background_image ||
                    file.path === branding.site_background_image ||
                    file.path === branding.dashboard_background_image;
                  const isSelected =
                    (galleryTarget === 'login' && file.path === branding.login_background_image) ||
                    (galleryTarget === 'site' && file.path === branding.site_background_image) ||
                    (galleryTarget === 'dashboard' && file.path === branding.dashboard_background_image);

                  return (
                    <div
                      key={file.filename}
                      className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer hover:shadow-lg ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-muted hover:border-muted-foreground/40'
                      }`}
                      onClick={() => handleGallerySelect(file)}
                    >
                      <div className="aspect-video bg-muted">
                        <img
                          src={file.path}
                          alt={file.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      {/* Overlay with info */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs text-white truncate font-medium">{file.filename}</p>
                        <p className="text-xs text-white/70">
                          {formatFileSize(file.size)} · {new Date(file.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                      {/* Badges */}
                      {isSelected && (
                        <div className="absolute top-2 left-2">
                          <Badge className="bg-primary text-primary-foreground text-xs">Selected</Badge>
                        </div>
                      )}
                      {isCurrentlyUsed && !isSelected && (
                        <div className="absolute top-2 left-2">
                          <Badge variant="secondary" className="text-xs">In Use</Badge>
                        </div>
                      )}
                      {/* Delete button */}
                      <button
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGalleryDelete(file);
                        }}
                        disabled={deletingFile === file.filename}
                        title="Delete this background"
                      >
                        {deletingFile === file.filename ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}