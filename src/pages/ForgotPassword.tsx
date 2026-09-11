import { useState, useEffect, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
import { Loader2, Mail, ArrowLeft, CheckCircle2, Utensils } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useBranding } from '@/contexts/BrandingContext';

export default function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const { branding } = useBranding();

  // Auto-fill email if redirected from login (parent password setup)
  useEffect(() => {
    const state = location.state as { email?: string } | null;
    if (state?.email && !autoSubmitted) {
      setEmail(state.email);
      setAutoSubmitted(true);
      // Auto-submit the form for convenience
      (async () => {
        setLoading(true);
        try {
          await authApi.forgotPassword(state.email!);
          setSent(true);
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : 'Failed to send reset email. Please try again.';
          setError(message);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [location.state, autoSubmitted]);

  const companyName = branding?.company_name || 'YAMZ Cafe';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send reset email. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Utensils className="h-4 w-4 text-primary" />
          </div>
          <span className="font-bold text-lg text-slate-800">{companyName}</span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-4 py-12 bg-gray-50">
        <Card className="w-full max-w-md shadow-lg">
          {sent ? (
            // Success state
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Check Your Email</h2>
              <p className="text-muted-foreground mb-2">
                If an account exists for <strong>{email}</strong>, we've sent a password reset link.
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                The link will expire in 24 hours. Check your spam folder if you don't see it.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" asChild>
                  <Link to="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSent(false);
                    setEmail('');
                  }}
                >
                  Send Again
                </Button>
              </div>
            </CardContent>
          ) : (
            // Form state
            <>
              <CardHeader className="text-center space-y-2 pb-2">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
                  <Mail className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="text-2xl font-bold">Forgot Password?</CardTitle>
                <CardDescription>
                  Enter your email address and we'll send you a link to reset your password.
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
                        autoFocus
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Reset Link'
                    )}
                  </Button>
                </form>

                <div className="mt-4 text-center">
                  <Link
                    to="/"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Login
                  </Link>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}