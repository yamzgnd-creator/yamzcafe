import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle, AlertCircle, Eye, EyeOff, Lock, Loader2,
} from 'lucide-react';
import { authApi, tokenHelpers } from '@/lib/api';

export default function ParentAccountSetup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });

  const requirements = {
    minLength: formData.password.length >= 6,
  };

  const allMet = Object.values(requirements).every(Boolean);
  const passwordsMatch = formData.password === formData.confirmPassword;
  const strength = allMet ? 100 : (formData.password.length / 6) * 100;

  const isValid = allMet && passwordsMatch && formData.password.length > 0 && formData.confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError('');

    try {
      // Call password setup endpoint
      const token = tokenHelpers.getToken();
      if (!token) {
        setError('No authentication token found. Please use the link from your email.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: formData.password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to set password');
      }

      setSuccess(true);
      setTimeout(() => navigate('/parent/dashboard', { replace: true }), 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to set password';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Password Created!</h2>
          <p className="text-gray-600 mb-4">Redirecting you to your dashboard...</p>
          <Progress value={100} className="h-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-1">Create Your Password</h1>
          <p className="text-blue-100 text-sm">Secure your parent account</p>
        </div>

        {/* Form */}
        <div className="p-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Create Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter your password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {formData.password && (
                <div className="space-y-1">
                  <Progress value={Math.min(strength, 100)} className="h-1.5" />
                  <p className={`text-xs ${strength >= 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {strength >= 100 ? 'Strong password' : 'Password needs to be at least 6 characters'}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Re-enter your password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {formData.confirmPassword && (
                <div className="flex items-center gap-1 text-xs">
                  {passwordsMatch ? (
                    <><CheckCircle className="w-3 h-3 text-emerald-600" /><span className="text-emerald-600">Passwords match</span></>
                  ) : (
                    <><AlertCircle className="w-3 h-3 text-red-600" /><span className="text-red-600">Passwords do not match</span></>
                  )}
                </div>
              )}
            </div>

            {/* Requirements */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium text-gray-700 mb-1">Password Requirements:</p>
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle className={`w-3 h-3 ${requirements.minLength ? 'text-emerald-600' : 'text-gray-300'}`} />
                <span className={requirements.minLength ? 'text-emerald-700' : 'text-gray-500'}>
                  At least 6 characters
                </span>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={!isValid || loading}>
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Creating Password...</>
              ) : (
                'Create Password & Continue'
              )}
            </Button>
          </form>

          <div className="mt-4 bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">
              <Lock className="w-3 h-3 inline mr-1" />
              Your password is encrypted and secure.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}