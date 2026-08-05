import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Role, ScreenId, UserProfile, Subscription } from '../types';
import { screenToRouteMap, getRoleDefaultRoute } from '../routes/routeMap';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  subscription: Subscription | null;
  currentRole: Role;
  currentScreen: ScreenId;
  isRoleSelectorOpen: boolean;
  syncStatus: 'online' | 'offline' | 'syncing' | 'error';
  navigate: ((path: string) => void) | null;
  setNavigate: (fn: (path: string) => void) => void;
  refreshUserSession: () => Promise<void>;
  changeRole: (role: Role, preferredScreen?: ScreenId) => void;
  changeScreen: (screen: ScreenId, shouldNavigate?: boolean) => void;
  setIsRoleSelectorOpen: (open: boolean) => void;
  setSyncStatus: (status: 'online' | 'offline' | 'syncing' | 'error') => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [currentRole, setCurrentRole] = useState<Role>('DIRECTOR');
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('LANDING_PAGE');
  const [isRoleSelectorOpen, setIsRoleSelectorOpen] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'online' | 'offline' | 'syncing' | 'error'>('online');
  // navigateRef holds the react-router navigate function injected by AppLayout
  const navigateRef = useRef<((path: string) => void) | null>(null);
  const [, forceUpdate] = useState(0);

  const setNavigate = useCallback((fn: (path: string) => void) => {
    navigateRef.current = fn;
    forceUpdate(n => n + 1);
  }, []);

  const refreshUserSession = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
        
        // Fetch User Profile from public.profiles table
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setUserProfile(profile as UserProfile);
          const role = (profile.role as Role) || 'DRIVER';
          setCurrentRole(role);
          
          // Auto-redirect to role workspace after login
          const defaultRoute = getRoleDefaultRoute(role);
          if (navigateRef.current && window.location.pathname === '/') {
            navigateRef.current(defaultRoute);
          }
          
          // Fetch Company Subscription if available
          if (profile.tenant_id) {
            const { data: sub } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('tenant_id', profile.tenant_id)
              .single();
            if (sub) {
              setSubscription(sub as Subscription);
            }
          }
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
        setSubscription(null);
      }
    } catch (e) {
      console.warn('Error refreshing user session:', e);
      setSyncStatus('error');
    }
  }, []);

  const changeRole = useCallback((role: Role, preferredScreen?: ScreenId) => {
    setCurrentRole(role);
    if (preferredScreen) {
      setCurrentScreen(preferredScreen);
    }
  }, []);

  const changeScreen = useCallback((screen: ScreenId, shouldNavigate: boolean = true) => {
    setCurrentScreen(screen);
    if (shouldNavigate && navigateRef.current) {
      const route = screenToRouteMap[screen];
      if (route) {
        navigateRef.current(route);
      }
    }
  }, []);

  useEffect(() => {
    refreshUserSession();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      refreshUserSession();
    });
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [refreshUserSession]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        subscription,
        currentRole,
        currentScreen,
        isRoleSelectorOpen,
        syncStatus,
        navigate: navigateRef.current,
        setNavigate,
        refreshUserSession,
        changeRole,
        changeScreen,
        setIsRoleSelectorOpen,
        setSyncStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
