import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken, setOnUnauthorized } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setOnUnauthorized(() => {
      setToken(null);
      setUser(null);
    });
    const stored = localStorage.getItem('superadmin_user');
    if (getToken() && stored) {
      setUser(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username, password) => {
    const result = await api.post('/superadmin/auth/login', { username, password });
    setToken(result.token);
    localStorage.setItem('superadmin_user', JSON.stringify(result.user));
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem('superadmin_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
