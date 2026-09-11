import { useState, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, type UserRole } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import AppSidebar from '@/components/AppSidebar';
import { Loader2 } from 'lucide-react';

interface DashboardLayoutProps {
  allowedRoles?: UserRole[];
}

export default function DashboardLayout({
  allowedRoles,
}: DashboardLayoutProps) {
  const { user, loading } = useAuth();
  const { branding } = useBranding();
  const location = useLocation();
  const isFullWidthPage = location.pathname === '/pos';

  // Preload-verify the background image so broken paths don't cause issues.
  // When Express can't find a file it may serve index.html (SPA fallback),
  // which the browser can't render as an image.
  const rawBgImage = branding?.dashboard_background_image || branding?.site_background_image;
  const [verifiedBgImage, setVerifiedBgImage] = useState<string | null>(null);

  useEffect(() => {
    if (!rawBgImage) {
      setVerifiedBgImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setVerifiedBgImage(rawBgImage);
    img.onerror = () => {
      console.warn('Dashboard background failed to load, ignoring:', rawBgImage);
      setVerifiedBgImage(null);
    };
    img.src = rawBgImage;
  }, [rawBgImage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const roleDefaults: Record<UserRole, string> = {
      admin: '/dashboard',
      staff: '/dashboard',
      cashier: '/pos',
      parent: '/parent/dashboard',
      student: '/dashboard',
    };
    return <Navigate to={roleDefaults[user.role] || '/dashboard'} replace />;
  }

  return (
    <SidebarProvider>
      <div
        className="flex min-h-screen w-full"
        style={
          verifiedBgImage
            ? {
                backgroundImage: `url(${verifiedBgImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed',
              }
            : undefined
        }
      >
        <AppSidebar branding={branding} />
        <main className="flex-1 flex flex-col min-w-0">
          <header
            className={`flex items-center gap-3 border-b px-4 py-3 md:px-6 ${
              verifiedBgImage ? 'bg-background/80 backdrop-blur-sm' : 'bg-background'
            }`}
          >
            <SidebarTrigger className="-ml-1" />
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">
                  {user.name
                    ?.split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2) || 'U'}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {user.role}
                </p>
              </div>
            </div>
          </header>
          <div
            className={`flex-1 overflow-auto ${
              isFullWidthPage ? '' : 'p-4 md:p-6'
            } ${
              verifiedBgImage ? 'bg-background/60 backdrop-blur-[2px]' : ''
            }`}
            id="dashboard-content"
          >
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}