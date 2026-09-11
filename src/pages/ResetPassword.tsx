import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
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
import { Loader2, Lock, CheckCircle2, XCircle, Utensils } from 'lucide-react';
import { authApi, brandingApi, type BrandingSettings } from '@/lib/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [userName, setUserName] = useState('');
  const [branding, setBranding] = useState<BrandingSettings | null>(null);

  const companyName = branding?.company_name || 'YAMZ Cafe';

  useEffect(() => {
    brandingApi
      .get()
      .then((data) => setBranding(data || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setTokenError('No reset token provided. Please use the link from your email.');
      return;
    }

    authApi
      .validateResetToken(token)
      .then((data) => {
        if (data.valid) {
          setTokenValid(true);
          setUserName(data.user?.full_name || '');
        } else {
          setTokenError(data.error || 'Invalid or expired reset link.');
        }
      })
      .catch(() => {
        setTokenError('Unable to validate the reset link. Please try again.');
      })
      .finally(() => {
        setValidating(false);
      });
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Password is required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPasswordWithToken(token, password);
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Password reset failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Loading state while validating token
  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Validating your reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invalid token state
  if (!tokenValid && !success) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="bg-white border-b px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Utensils className="h-4 w-4 text-primary" />
            </div>
            <span className="font-bold text-lg text-slate-800">{companyName}</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-12 bg-gray-50">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <XCircle className="h-12 w-12 text-destructive mb-4" />
              <h2 className="text-xl font-semibold mb-2">Invalid Reset Link</h2>
              <p className="text-muted-foreground mb-6">{tokenError}</p>
              <div className="flex gap-3">
                <Button variant="outline" asChild>
                  <Link to="/">Back to Login</Link>
                </Button>
                <Button asChild>
                  <Link to="/forgot-password">Request New Link</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="bg-white border-b px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Utensils className="h-4 w-4 text-primary" />
            </div>
            <span className="font-bold text-lg text-slate-800">{companyName}</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-12 bg-gray-50">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Password Set Successfully!</h2>
              <p className="text-muted-foreground mb-6">
                Your password has been set. You can now sign in with your new password.
              </p>
              <Button onClick={() => navigate('/', { replace: true })}>
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Password form
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Utensils className="h-4 w-4 text-primary" />
          </div>
          <span className="font-bold text-lg text-slate-800">{companyName}</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12 bg-gray-50">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center space-y-2 pb-2">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">Set Your Password</CardTitle>
            <CardDescription>
              {userName ? (
                <>Welcome, <strong>{userName}</strong>! Create a secure password for your account.</>
              ) : (
                'Create a secure password for your account.'
              )}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {/* Password strength hints */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p className={password.length >= 6 ? 'text-green-600' : ''}>
                  {password.length >= 6 ? '✓' : '○'} At least 6 characters
                </p>
                <p className={password && password === confirmPassword ? 'text-green-600' : ''}>
                  {password && password === confirmPassword ? '✓' : '○'} Passwords match
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting Password...
                  </>
                ) : (
                  'Set Password'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Link to="/" className="text-sm text-primary hover:underline">
                Back to Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}