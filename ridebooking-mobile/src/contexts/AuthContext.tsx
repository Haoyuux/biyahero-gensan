import React, { createContext, useContext } from 'react';
import { Profile } from '../lib/supabase';

interface AuthContextValue {
  profile: Profile;
  signOut: () => void;
  refetchProfile: () => void;
}

const AuthContext = createContext<AuthContextValue>(null!);
export const useProfile = () => useContext(AuthContext);
export const AuthProvider = AuthContext.Provider;
