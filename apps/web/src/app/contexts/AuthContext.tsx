// File: src/contexts/AuthContext.tsx
// Local-first authentication context: no remote account creation/login required.

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { saveSetting, getSetting } from '@/services/core/sqliteService';

export interface LoginResponse {
  success: boolean;
  data?: {
    api_key: string;
    username: string;
    email: string;
    credit_balance: number;
  };
  message?: string;
  error?: string;
}

export interface UserProfileResponse {
  success: boolean;
  data?: {
    id: number;
    username: string;
    email: string;
    account_type: string;
    credit_balance: number;
    is_verified: boolean;
    mfa_enabled: boolean;
    created_at: string;
    last_login_at: string;
  };
  message?: string;
  error?: string;
}

export interface DeviceRegisterResponse {
  success: boolean;
  data?: {
    api_key: string;
    expires_at: string;
    credit_balance: number;
    user_type: 'guest';
    message: string;
  };
  message?: string;
  error?: string;
  status_code?: number;
}

export interface ApiResponse {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
  status_code?: number;
}

export interface SubscriptionPlan {
  plan_id: string;
  name: string;
  description: string;
  price_usd: number;
  currency: string;
  credits: number;
  support_type: string;
  validity_days: number;
  features: string[];
  is_free: boolean;
  display_order: number;
  price_display?: string;
  credits_amount?: number;
  support_display?: string;
  validity_display?: string;
  is_popular?: boolean;
}

export interface PaymentSession {
  checkout_url: string;
  session_id: string;
  payment_uuid: string;
  order_id?: string;
  plan: {
    name: string;
    price: number;
  };
}

export interface UserSubscription {
  has_subscription: boolean;
  subscription?: {
    subscription_uuid: string;
    plan: {
      name: string;
      plan_id: string;
      price: number;
    };
    status: string;
    current_period_start: string;
    current_period_end: string;
    days_remaining: number;
    cancel_at_period_end: boolean;
    usage: {
      api_calls_used: number;
      api_calls_limit: number | string;
      usage_percentage: number;
    };
  };
}

export interface SessionData {
  authenticated: boolean;
  user_type: 'guest' | 'registered' | null;
  api_key: string | null;
  device_id: string;
  user_info?: {
    username?: string;
    email?: string;
    account_type?: string;
    credit_balance?: number;
    is_verified?: boolean;
    mfa_enabled?: boolean;
    phone?: string | null;
    country?: string | null;
    country_code?: string | null;
  };
  expires_at?: string;
  credit_balance?: number;
  requests_today?: number;
  subscription?: UserSubscription;
}

interface AuthContextType {
  session: SessionData | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  isFirstTimeUser: boolean;
  availablePlans: SubscriptionPlan[];
  isLoadingPlans: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; mfa_required?: boolean }>;
  signup: (
    username: string,
    email: string,
    password: string,
    phone?: string,
    country?: string,
    country_code?: string
  ) => Promise<{ success: boolean; error?: string }>;
  verifyOtp: (email: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  verifyMfaAndLogin: (email: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  setupGuestAccess: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkApiConnectivity: () => Promise<boolean>;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  fetchPlans: () => Promise<{ success: boolean; error?: string }>;
  createPaymentSession: (planId: string, currency?: string, customerPhone?: string) => Promise<{ success: boolean; data?: PaymentSession; error?: string }>;
  getUserSubscription: () => Promise<{ success: boolean; data?: UserSubscription; error?: string }>;
  refreshUserData: () => Promise<void>;
  updateApiKey: (newApiKey: string) => Promise<void>;
  updateUserInfo: (patch: Partial<NonNullable<SessionData['user_info']>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'fincept_session';
const LOCAL_API_KEY_STORAGE = 'fincept_local_api_key';

const LOCAL_UNLOCKED_SUBSCRIPTION: UserSubscription = {
  has_subscription: true,
  subscription: {
    subscription_uuid: 'local-open-source-subscription',
    plan: {
      name: 'Open Source Unlimited',
      plan_id: 'enterprise',
      price: 0,
    },
    status: 'active',
    current_period_start: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    current_period_end: new Date('2126-01-01T00:00:00.000Z').toISOString(),
    days_remaining: 36500,
    cancel_at_period_end: false,
    usage: {
      api_calls_used: 0,
      api_calls_limit: 'unlimited',
      usage_percentage: 0,
    },
  },
};

const LOCAL_PLANS: SubscriptionPlan[] = [
  {
    plan_id: 'enterprise',
    name: 'Open Source Unlimited',
    description: 'All features unlocked locally, no billing required.',
    price_usd: 0,
    currency: 'USD',
    credits: 1000000000,
    support_type: 'community',
    validity_days: 36500,
    features: ['No login required', 'No payment required', 'All modules unlocked'],
    is_free: true,
    display_order: 0,
    is_popular: true,
  },
];

const generateDeviceId = (): string => {
  const getNavigatorInfo = () => ({
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    language: navigator.language,
    screenRes: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const infoString = JSON.stringify(getNavigatorInfo());
  let hash = 0;
  for (let i = 0; i < infoString.length; i++) {
    const char = infoString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const hashStr = Math.abs(hash).toString(16);
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  const deviceId = `fincept_local_${hashStr}_${timestamp}_${random}`;
  return deviceId.length > 255 ? deviceId.substring(0, 255) : deviceId;
};

const saveSession = async (session: SessionData) => {
  try {
    await saveSetting(STORAGE_KEY, JSON.stringify({ ...session, saved_at: new Date().toISOString() }), 'auth');
  } catch (error) {
    console.error('Failed to save local session:', error);
  }
};

const loadSession = async (): Promise<SessionData | null> => {
  try {
    const stored = await getSetting(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load local session:', error);
    return null;
  }
};

const clearSessionStorage = async () => {
  try {
    await saveSetting(STORAGE_KEY, '', 'auth');
  } catch (error) {
    console.error('Failed to clear local session:', error);
  }
};

const checkIsFirstTimeUser = async (): Promise<boolean> => {
  const session = await getSetting(STORAGE_KEY);
  return !session;
};

const getOrCreateLocalApiKey = async (): Promise<string> => {
  const existing = await getSetting(LOCAL_API_KEY_STORAGE);
  if (existing) return existing;

  const generated = `fk_local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  await saveSetting(LOCAL_API_KEY_STORAGE, generated, 'auth');
  return generated;
};

const buildLocalSession = async (overrides?: Partial<SessionData>): Promise<SessionData> => {
  const apiKey = (overrides?.api_key && overrides.api_key.length > 0)
    ? overrides.api_key
    : await getOrCreateLocalApiKey();

  return {
    authenticated: true,
    user_type: 'registered',
    api_key: apiKey,
    device_id: overrides?.device_id || generateDeviceId(),
    credit_balance: overrides?.credit_balance ?? 1000000000,
    requests_today: overrides?.requests_today ?? 0,
    user_info: {
      username: overrides?.user_info?.username || 'Local User',
      email: overrides?.user_info?.email || 'local@fincept.local',
      account_type: overrides?.user_info?.account_type || 'enterprise',
      credit_balance: overrides?.user_info?.credit_balance ?? 1000000000,
      is_verified: true,
      mfa_enabled: false,
      phone: overrides?.user_info?.phone ?? null,
      country: overrides?.user_info?.country ?? null,
      country_code: overrides?.user_info?.country_code ?? null,
    },
    subscription: overrides?.subscription || LOCAL_UNLOCKED_SUBSCRIPTION,
  };
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>(LOCAL_PLANS);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initializeLocalSession = async () => {
      try {
        const firstTime = await checkIsFirstTimeUser();
        if (!mounted) return;
        setIsFirstTimeUser(firstTime);

        const savedSession = await loadSession();
        if (!mounted) return;

        if (savedSession?.authenticated) {
          const normalizedSession = await buildLocalSession({
            ...savedSession,
            user_type: 'registered',
            credit_balance: savedSession.credit_balance ?? 1000000000,
            user_info: {
              ...(savedSession.user_info || {}),
              account_type: 'enterprise',
              credit_balance: savedSession.user_info?.credit_balance ?? 1000000000,
              is_verified: true,
            },
            subscription: LOCAL_UNLOCKED_SUBSCRIPTION,
          });
          setSession(normalizedSession);
          await saveSession(normalizedSession);
          await saveSetting('fincept_api_key', normalizedSession.api_key || '', 'auth');
          await saveSetting('fincept_device_id', normalizedSession.device_id, 'auth');
          return;
        }

        const localSession = await buildLocalSession();
        if (!mounted) return;

        setSession(localSession);
        await saveSession(localSession);
        await saveSetting('fincept_api_key', localSession.api_key || '', 'auth');
        await saveSetting('fincept_device_id', localSession.device_id, 'auth');
      } catch (error) {
        console.error('Local session initialization error:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initializeLocalSession();
    return () => { mounted = false; };
  }, []);

  const updateApiKey = async (newApiKey: string): Promise<void> => {
    if (!session) return;
    const updatedSession: SessionData = { ...session, api_key: newApiKey };
    setSession(updatedSession);
    await saveSession(updatedSession);
    await saveSetting('fincept_api_key', newApiKey, 'auth');
    await saveSetting(LOCAL_API_KEY_STORAGE, newApiKey, 'auth');
  };

  const refreshUserData = async (): Promise<void> => {
    if (!session) return;
    await saveSession(session);
  };

  const updateUserInfo = async (patch: Partial<NonNullable<SessionData['user_info']>>): Promise<void> => {
    if (!session) return;

    const updatedSession: SessionData = {
      ...session,
      user_info: {
        ...(session.user_info || {}),
        ...patch,
      },
    };

    setSession(updatedSession);
    await saveSession(updatedSession);
  };

  const ensureLocalSession = async (patch?: Partial<SessionData>): Promise<void> => {
    const existing = await loadSession();
    const merged = await buildLocalSession({
      ...(existing || {}),
      ...(patch || {}),
      user_info: {
        ...(existing?.user_info || {}),
        ...(patch?.user_info || {}),
      },
    });

    setSession(merged);
    await saveSession(merged);
    await saveSetting('fincept_api_key', merged.api_key || '', 'auth');
    await saveSetting('fincept_device_id', merged.device_id, 'auth');
  };

  const login = async (email: string, _password: string): Promise<{ success: boolean; error?: string; mfa_required?: boolean }> => {
    await ensureLocalSession({
      user_info: {
        email,
        username: email.split('@')[0] || 'Local User',
      },
    });
    return { success: true };
  };

  const signup = async (
    username: string,
    email: string,
    _password: string,
    phone?: string,
    country?: string,
    country_code?: string
  ): Promise<{ success: boolean; error?: string }> => {
    await ensureLocalSession({
      user_info: {
        username: username || 'Local User',
        email,
        phone: phone || null,
        country: country || null,
        country_code: country_code || null,
      },
    });
    return { success: true };
  };

  const verifyOtp = async (_email: string, _otp: string): Promise<{ success: boolean; error?: string }> => {
    await ensureLocalSession();
    return { success: true };
  };

  const verifyMfaAndLogin = async (_email: string, _otp: string): Promise<{ success: boolean; error?: string }> => {
    await ensureLocalSession();
    return { success: true };
  };

  const forgotPassword = async (_email: string): Promise<{ success: boolean; error?: string }> => {
    return { success: true };
  };

  const resetPassword = async (_email: string, _otp: string, _newPassword: string): Promise<{ success: boolean; error?: string }> => {
    return { success: true };
  };

  const setupGuestAccess = async (): Promise<{ success: boolean; error?: string }> => {
    await ensureLocalSession();
    return { success: true };
  };

  const checkApiConnectivity = async (): Promise<boolean> => {
    return true;
  };

  const fetchPlans = async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoadingPlans(true);
    try {
      setAvailablePlans(LOCAL_PLANS);
      return { success: true };
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const createPaymentSession = async (
    _planId: string,
    _currency: string = 'USD',
    _customerPhone?: string
  ): Promise<{ success: boolean; data?: PaymentSession; error?: string }> => {
    return {
      success: false,
      error: 'Payments are disabled in local mode.',
    };
  };

  const getUserSubscription = async (): Promise<{ success: boolean; data?: UserSubscription; error?: string }> => {
    return {
      success: true,
      data: LOCAL_UNLOCKED_SUBSCRIPTION,
    };
  };

  const logout = async (): Promise<void> => {
    if (isLoggingOut) return;

    try {
      setIsLoggingOut(true);
      await clearSessionStorage();
      await saveSetting('fincept_api_key', '', 'auth');
      await saveSetting('fincept_device_id', '', 'auth');

      const freshLocalSession = await buildLocalSession();
      setSession(freshLocalSession);
      await saveSession(freshLocalSession);
      await saveSetting('fincept_api_key', freshLocalSession.api_key || '', 'auth');
      await saveSetting('fincept_device_id', freshLocalSession.device_id, 'auth');

      const firstTime = await checkIsFirstTimeUser();
      setIsFirstTimeUser(firstTime);
    } catch (error) {
      console.error('[AuthContext] Local logout reset failed:', error);
      const fallback = await buildLocalSession();
      setSession(fallback);
      await saveSession(fallback);
    } finally {
      await new Promise(resolve => setTimeout(resolve, 50));
      setIsLoggingOut(false);
    }
  };

  const value: AuthContextType = {
    session,
    isLoading,
    isLoggingOut,
    isFirstTimeUser,
    availablePlans,
    isLoadingPlans,
    login,
    signup,
    verifyOtp,
    verifyMfaAndLogin,
    setupGuestAccess,
    logout,
    checkApiConnectivity,
    forgotPassword,
    resetPassword,
    fetchPlans,
    createPaymentSession,
    getUserSubscription,
    refreshUserData,
    updateApiKey,
    updateUserInfo,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
