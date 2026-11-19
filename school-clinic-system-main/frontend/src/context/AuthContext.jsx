import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { AuthContext } from './auth';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const role = localStorage.getItem('role');
        const userId = localStorage.getItem('userId');
        
        if (token && role && userId) {
            setUser({ token, role, userId });
        }
        setLoading(false);

        const handleExpiredSession = () => setUser(null);
        window.addEventListener('clinic:auth-expired', handleExpiredSession);
        return () => window.removeEventListener('clinic:auth-expired', handleExpiredSession);
    }, []);

    const login = async (email, password) => {
        const response = await api.post('/auth/login', { email, password });
        const { token, role, userId } = response.data;
        
        localStorage.setItem('token', token);
        localStorage.setItem('role', role);
        localStorage.setItem('userId', userId);
        
        setUser({ token, role, userId });
        return response.data;
    };

    const register = async (userData) => {
        const response = await api.post('/auth/register', userData);
        return response.data;
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('userId');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
