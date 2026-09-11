import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { brandingApi, type BrandingSettings } from '@/lib/api';
import { Loader2 } from 'lucide-react';

const DEFAULT_BRANDING: BrandingSettings = {
  company_name: 'YAMZ Cafe',
  tagline: '',
  logo_url: '',
  favicon_url: '',
  login_logo_url: '',
  login_logo_size: 'xlarge',
  welcome_text: 'Welcome Back',
  subtitle_text: 'Sign in to access YAMZ Cafe management system',
  primary_color: '#1e3a8a',
  secondary_color: '#0f766e',
  accent_color: '#ea580c',
  site_background_image: '',
  login_background_image: '',
  dashboard_background_image: '',
  login_bg_opacity: 40,
  login_bg_blur: 4,
  login_card_opacity: 100,
};

interface BrandingContextValue {
  branding: BrandingSettings;
  loading: boolean;
  refreshBranding: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used within BrandingProvider');
  return ctx;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBranding = useCallback(async () => {
    try {
      const data = await brandingApi.get();
      if (data) {
        // Filter out null/undefined values so they don't override defaults
        // This ensures DB columns that haven't been set yet fall back to DEFAULT_BRANDING
        const cleaned: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
          if (value !== null && value !== undefined) {
            cleaned[key] = value;
          }
        }
        setBranding({ ...DEFAULT_BRANDING, ...cleaned } as BrandingSettings);
      } else {
        setBranding({ ...DEFAULT_BRANDING });
      }
    } catch {
      // On error, fall back to defaults so the app still works
      setBranding({ ...DEFAULT_BRANDING });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBranding();
  }, [loadBranding]);

  // Apply dynamic favicon and title once branding is loaded
  useEffect(() => {
    if (!branding) return;

    // Update browser tab title
    if (branding.company_name) {
      document.title = branding.company_name;
    }

    // Update favicon dynamically — prefer dedicated favicon_url, fall back to logo_url
    const faviconSrc = branding.favicon_url || branding.logo_url;
    if (faviconSrc) {
      let link = document.getElementById('dynamic-favicon') as HTMLLinkElement | null;
      if (!link) {
        link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      }
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.id = 'dynamic-favicon';
      // Detect type from extension
      const isSvg = faviconSrc.toLowerCase().includes('.svg');
      link.type = isSvg ? 'image/svg+xml' : 'image/png';
      // Cache-buster to force browser to reload the favicon
      link.href = faviconSrc + (faviconSrc.includes('?') ? '&' : '?') + 't=' + Date.now();
    }

    // Apply CSS custom properties for branding colors
    if (branding.primary_color) {
      document.documentElement.style.setProperty('--branding-primary', branding.primary_color);
    }
    if (branding.secondary_color) {
      document.documentElement.style.setProperty('--branding-secondary', branding.secondary_color);
    }
    if (branding.accent_color) {
      document.documentElement.style.setProperty('--branding-accent', branding.accent_color);
    }
  }, [branding]);

  const refreshBranding = useCallback(async () => {
    setLoading(true);
    await loadBranding();
  }, [loadBranding]);

  const value: BrandingContextValue = {
    branding: branding || DEFAULT_BRANDING,
    loading,
    refreshBranding,
  };

  // Gate all children until branding is loaded to prevent flash of default values
  if (loading || !branding) {
    return (
      <BrandingContext.Provider value={value}>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      </BrandingContext.Provider>
    );
  }

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}