import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getProfile, upsertProfile } from '../services/database';
import type { Profile, SignupData } from '../types';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (data: SignupData) => Promise<void>;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Session error:', error.message);
        setLoading(false);
        return;
      }
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        getProfile(data.session.user.id)
          .then((p) => {
            if (!p) {
              return upsertProfile(data.session!.user.id, {
                full_name: data.session!.user.user_metadata?.full_name ?? '',
              });
            }
            return p;
          })
          .then((p) => p && setProfile(p as Profile))
          .catch((err) => console.error('Profile load error:', err.message))
          .finally(() => {
            setIsAdmin(!!data.session?.user?.app_metadata?.role && data.session.user.app_metadata.role === 'admin');
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      console.error('getSession error:', err.message);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        try {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          if (newSession?.user) {
            const p = await getProfile(newSession.user.id);
            const googleAvatar = newSession.user.user_metadata?.avatar_url ?? null;
            if (!p) {
              const created = await upsertProfile(newSession.user.id, {
                full_name: newSession.user.user_metadata?.full_name ?? '',
                avatar_url: googleAvatar,
              });
              if (created) setProfile(created as Profile);
            } else {
              // Link Google avatar to existing profile if not already set.
              if (googleAvatar && !p.avatar_url) {
                const updated = await upsertProfile(newSession.user.id, { avatar_url: googleAvatar });
                if (updated) setProfile(updated as Profile);
              } else {
                setProfile(p as Profile);
              }
            }
          } else {
            setProfile(null);
          }
          setIsAdmin(!!newSession?.user?.app_metadata?.role && newSession.user.app_metadata.role === 'admin');
        } catch (err: any) {
          console.error('Auth state change error:', err?.message ?? err);
        }
      })();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = async (signupData: SignupData) => {
    const { fullName, email, password, college, branch, year, skills, status } = signupData;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    if (data.user) {
      await upsertProfile(data.user.id, {
        full_name: fullName,
        college: college || null,
        branch,
        year,
        skills: skills || [],
        status,
      });
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signInWithGoogle = async () => {
    const redirectTo = `${window.location.origin}/dashboard`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await getProfile(user.id);
      if (p) setProfile(p);
    }
  };

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, isAdmin, signUp, signIn, signInWithGoogle, signOut, resetPassword, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
