import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, Mail, ShieldCheck, Utensils } from 'lucide-react';

const LOGIN_BG_URL =
  'https://mgx-backend-cdn.metadl.com/generate/images/737931/2026-03-06/f4d26aa5-e792-4445-acb1-01d03e36c9df.png';
const DEFAULT_LOGO_URL =
  'https://mgx-backend-cdn.metadl.com/generate/images/737931/2026-03-06/15303f11-632f-4c38-bd2a-7c93117e9c38.png';

const ROLE_ROUTES: Record<string, string> = {
  admin: '/dashboard',
  staff: '/dashboard',
  cashier: '/pos',
  parent: '/dashboard',
};

const LOGO_SIZE_MAP: Record<string, string> = {
  small: 'h-12 w-12',
  medium: 'h-16 w-16',
  large: 'h-20 w-20',
  xlarge: 'h-24 w-24',
  '2xlarge': 'h-32 w-32',
  '3xlarge': 'h-40 w-40',
  '4xlarge': 'h-48 w-48',
};

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { branding } = useBranding();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bgUrl, setBgUrl] = useState(LOGIN_BG_URL);

  // Resolve the custom background image.
  // Preload ALL image URLs (including local /uploads/... paths) to verify they
  // actually return a valid image.  When Express can't find the file it may serve
  // index.html via the SPA catch-all, which the browser can't render as an image.
  useEffect(() => {
    const customBg = branding?.login_background_image || branding?.site_background_image;
    if (!customBg) {
      setBgUrl(LOGIN_BG_URL);
      return;
    }

    // Preload to verify the URL returns a real image (local or external)
    const img = new window.Image();
    img.onload = () => setBgUrl(customBg);
    img.onerror = () => {
      console.warn('Custom login background failed to load, falling back to default:', customBg);
      setBgUrl(LOGIN_BG_URL);
    };
    img.src = customBg;
  }, [branding?.login_background_image, branding?.site_background_image]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      const user = await signIn(email, password);
      const dest = ROLE_ROUTES[user.role] || '/dashboard';
      navigate(dest, { replace: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Login failed. Please try again.';
      // If the server says password setup is required, redirect to forgot-password
      if (message === 'Password setup required') {
        setError('Your account requires a password to be set. Redirecting you to set up your password...');
        setTimeout(() => {
          navigate('/forgot-password', { replace: true, state: { email } });
        }, 2000);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Resolve branding values with fallbacks
  const companyName = branding?.company_name || 'YAMZ Cafe';
  const headerLogo = branding?.logo_url || DEFAULT_LOGO_URL;
  const loginLogo = branding?.login_logo_url || '';
  const loginLogoSize = branding?.login_logo_size || 'xlarge';
  const welcomeText = branding?.welcome_text || 'Welcome Back';
  const subtitleText =
    branding?.subtitle_text || `Sign in to access ${companyName} management system`;

  const logoSizeClass = LOGO_SIZE_MAP[loginLogoSize] || 'h-24 w-24';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <img
            src={headerLogo}
            alt={companyName}
            className="h-8 w-8 rounded-lg object-contain"
          />
          <span className="font-bold text-lg text-slate-800">{companyName}</span>
        </div>
      </header>

      {/* Main */}
      <main
        className="flex-1 flex items-center justify-center px-4 py-12 bg-cover bg-center relative"
        style={{ backgroundImage: `url("${bgUrl}")` }}
      >
        {/* Overlay — opacity & blur driven by branding settings */}
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: `rgba(0, 0, 0, ${(branding?.login_bg_opacity ?? 40) / 100})`,
            backdropFilter: `blur(${branding?.login_bg_blur ?? 4}px)`,
            WebkitBackdropFilter: `blur(${branding?.login_bg_blur ?? 4}px)`,
          }}
        />

        <Card
          className="w-full max-w-md relative z-10 shadow-2xl"
          style={{
            backgroundColor: `rgba(255, 255, 255, ${(branding?.login_card_opacity ?? 100) / 100})`,
            backdropFilter: (branding?.login_card_opacity ?? 100) < 100 ? 'blur(8px)' : undefined,
            WebkitBackdropFilter: (branding?.login_card_opacity ?? 100) < 100 ? 'blur(8px)' : undefined,
          }}
        >
          <CardHeader className="text-center space-y-3 pb-2">
            {/* Login Logo or default icon */}
            <div className="mx-auto flex items-center justify-center">
              {loginLogo ? (
                <img
                  src={loginLogo}
                  alt={`${companyName} logo`}
                  className={`${logoSizeClass} object-contain rounded-2xl`}
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Utensils className="h-8 w-8 text-primary" />
                </div>
              )}
            </div>
            <CardTitle className="text-2xl font-bold">{welcomeText}</CardTitle>
            <CardDescription>{subtitleText}</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@school.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>

              <div className="text-center">
                <Link
                  to="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot your password?
                </Link>
              </div>
            </form>

            {/* Security badges */}
            <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>256-bit SSL</span>
              </div>
              <div className="flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" />
                <span>FERPA Compliant</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t py-4 px-4 text-center">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} {companyName}. All rights reserved. |
          FERPA Compliant
        </p>
      </footer>
    </div>
  );
}