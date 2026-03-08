// File: src/App.tsx
// Main application entrypoint (local open-source mode, dashboard-first runtime)

import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { NavigationProvider } from './contexts/NavigationContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { DataSourceProvider } from './contexts/DataSourceContext';
import { ProviderProvider } from './contexts/ProviderContext';
import { workflowService } from './services/core/workflowService';
import { initializeNodeSystem } from './services/nodeSystem';
import { initializeStockBrokers } from './brokers/stocks';
import { notificationService } from './services/notifications';
import { fileStorageService } from './services/fileStorageService';
import { initMCPBridge, destroyMCPBridge } from './services/mcp/mcpBridge';
import { newsMCPBridge, economicsMCPBridge } from './services/mcp/internal';

import DashboardScreen from './components/dashboard/DashboardScreen';
import BackgroundPattern from './components/common/BackgroundPattern';
import SetupScreen from './components/setup/SetupScreen';
import { Toaster } from 'sonner';
import { NotificationProvider } from './utils/notifications';

export type Screen =
  | 'login'
  | 'register'
  | 'forgotPassword'
  | 'help'
  | 'contactUs'
  | 'termsOfService'
  | 'trademarks'
  | 'privacyPolicy'
  | 'pricing'
  | 'paymentProcessing'
  | 'paymentSuccess'
  | 'dashboard';

const App: React.FC = () => {
  const { session, isLoading, isLoggingOut } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [setupComplete, setSetupComplete] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [syncingPackages, setSyncingPackages] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Keep MCP bridges in sync with the current user's API key
  useEffect(() => {
    const key = session?.api_key ?? '';
    newsMCPBridge.setApiKey(key);
    economicsMCPBridge.setApiKey(key);
  }, [session?.api_key]);

  // Check setup status on app initialization and initialize node system
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const status: any = await invoke('check_setup_status');

        if (!status.needs_setup && status.needs_sync) {
          // Base setup is complete but requirements changed — let user in, sync in background
          setSetupComplete(true);
          setSyncingPackages(true);
          setSyncMessage(status.sync_message || 'Updating packages...');

          invoke('sync_requirements')
            .then(() => {
              console.log('[App] Requirements sync completed successfully');
              setSyncingPackages(false);
              setSyncMessage(null);
            })
            .catch((err: any) => {
              console.error('[App] Requirements sync failed:', err);
              setSyncingPackages(false);
              setSyncMessage(null);
              // Don't block the app — user can still use it, retry happens on next launch
            });
        } else {
          setSetupComplete(!status.needs_setup);
        }
      } catch (err) {
        console.error('Failed to check setup status:', err);
        // If check fails, assume setup is needed
        setSetupComplete(false);
      } finally {
        setCheckingSetup(false);
      }
    };

    // Initialize node system (loads all nodes into registry)
    initializeNodeSystem().catch((err) => {
      console.error('Failed to initialize node system:', err);
    });

    // Initialize notification service
    notificationService.initialize().catch((err) => {
      console.error('Failed to initialize notification service:', err);
    });

    // Initialize file storage service
    fileStorageService.initialize().catch((err) => {
      console.error('Failed to initialize file storage service:', err);
    });

    // Initialize stock broker adapters
    try {
      initializeStockBrokers();
    } catch (err) {
      console.error('Failed to initialize stock brokers:', err);
    }

    checkSetup();
  }, []);

  // Initialize MCP bridge so Python agents can call TypeScript internal tools
  useEffect(() => {
    initMCPBridge().catch(err => console.error('[App] MCP bridge init failed:', err));
    return () => { destroyMCPBridge(); };
  }, []);

  // Global monitor_alert listener — fires notifications even when MonitoringPanel is not mounted
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const fn = await listen<{ symbol: string; provider: string; field: string; triggered_value: number; triggered_at: number }>('monitor_alert', (event) => {
        const alert = event.payload;
        const triggerTime = new Date(alert.triggered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        console.log('[App] monitor_alert received:', alert.symbol, alert.triggered_value, 'at', triggerTime);
        notificationService.notify({
          type: 'warning',
          title: `Price Alert: ${alert.symbol}`,
          body: `${alert.field.toUpperCase()} = ${alert.triggered_value.toFixed(2)} on ${alert.provider} at ${triggerTime}`,
          timestamp: new Date(alert.triggered_at).toISOString(),
          metadata: { symbol: alert.symbol, provider: alert.provider, field: alert.field, time: triggerTime },
        }).catch(err => console.warn('[App] Notification send error:', err));
      });
      unlisten = fn;
    })();

    return () => { if (unlisten) unlisten(); };
  }, []);

  // Cleanup running workflows on app unmount
  useEffect(() => {
    return () => {
      workflowService.cleanupRunningWorkflows().catch((error: Error) => {
        console.error('Failed to cleanup running workflows:', error);
      });
    };
  }, []);

  // Keep app on dashboard for local open-source mode.
  useEffect(() => {
    if (isLoading) return;
    if (currentScreen !== 'dashboard') {
      setCurrentScreen('dashboard');
    }
  }, [session?.authenticated, isLoading, currentScreen]);

  // Show setup screen if setup not complete
  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-black relative overflow-hidden flex items-center justify-center" style={{ minHeight: '100vh', height: '100%' }}>
        <BackgroundPattern />
        <div className="relative z-10 text-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-zinc-400 text-sm">Initializing Fincept Terminal...</p>
        </div>
      </div>
    );
  }

  if (!setupComplete) {
    return <SetupScreen onSetupComplete={() => setSetupComplete(true)} />;
  }

  // Show loading screen while checking authentication or logging out
  if (isLoading || isLoggingOut) {
    return (
      <div className="min-h-screen bg-black relative overflow-hidden flex items-center justify-center" style={{ minHeight: '100vh', height: '100%' }}>
        <BackgroundPattern />
        <div className="relative z-10 text-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-zinc-400 text-sm">
            {isLoggingOut ? 'Signing out...' : 'Initializing Fincept Terminal...'}
          </p>
        </div>
      </div>
    );
  }

  // Main dashboard app (default mode)
  if (session?.authenticated) {
    return (
      <NotificationProvider>
        <ProviderProvider>
          <DataSourceProvider>
            <ThemeProvider>
              <NavigationProvider onNavigate={setCurrentScreen} onSetActiveTab={setActiveTab} activeTab={activeTab}>
                <DashboardScreen />
                {/* Background package sync indicator */}
                {syncingPackages && (
                  <div style={{
                    position: 'fixed',
                    bottom: 16,
                    right: 16,
                    zIndex: 9999,
                    background: '#0f0f0f',
                    border: '1px solid #2a2a2a',
                    borderRadius: 8,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  }}>
                    <div style={{
                      width: 16, height: 16,
                      border: '2px solid rgba(255,136,0,0.3)',
                      borderTop: '2px solid #FF8800',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }} />
                    <div>
                      <p style={{ color: '#e4e4e7', fontSize: 12, fontWeight: 500, margin: 0 }}>Updating packages...</p>
                      {syncMessage && <p style={{ color: '#71717a', fontSize: 11, margin: '2px 0 0 0' }}>{syncMessage}</p>}
                    </div>
                  </div>
                )}
              </NavigationProvider>
            </ThemeProvider>
          </DataSourceProvider>
        </ProviderProvider>
        {/* Toast Notifications */}
        <Toaster position="top-right" richColors closeButton />
      </NotificationProvider>
    );
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden flex items-center justify-center" style={{ minHeight: '100vh', height: '100%' }}>
      <BackgroundPattern />
      <div className="relative z-10 text-center">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-zinc-400 text-sm">Finalizing local session...</p>
      </div>
    </div>
  );
};

export default App;
