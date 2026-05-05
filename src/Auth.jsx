import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { ShieldAlert, Mail, Lock, Loader2, UserPlus, LogIn, CheckCircle2 } from 'lucide-react';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  
  // NEW: Check browser memory for a success message that survived the unmount
  const [successMessage, setSuccessMessage] = useState(() => {
    const savedMsg = sessionStorage.getItem('vaultSuccess');
    if (savedMsg) {
      sessionStorage.removeItem('vaultSuccess'); // Clear it so it only shows once
      return savedMsg;
    }
    return '';
  });
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      setError(isSignUpMode ? "Please enter an email and password to create an account." : "Please enter your email and password to sign in.");
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');

    if (isSignUpMode) {
      // 1. Save the success flag to the browser memory BEFORE Supabase does anything
      sessionStorage.setItem('vaultSuccess', 'Vault Initialized! Your identity has been reserved. Please sign in to generate your keys.');
      
      // 2. Create the account
      const { error } = await supabase.auth.signUp({ email, password });
      
      if (error) {
        // If it fails, remove the success flag and show the error
        sessionStorage.removeItem('vaultSuccess');
        setError(error.message);
      } else {
        // 3. Force logout. The component will rebuild, but grab the message from memory!
        await supabase.auth.signOut(); 
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    
    setLoading(false);
  };

  const toggleMode = () => {
    setIsSignUpMode(!isSignUpMode);
    setError('');
    setSuccessMessage('');
    setEmail('');
    setPassword('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white/60 backdrop-blur-xl border border-white/80 shadow-2xl rounded-3xl p-8 animate-in fade-in zoom-in-95 duration-300">
        
        <div className="flex flex-col items-center mb-6">
          <div className="bg-indigo-600 p-4 rounded-2xl shadow-inner mb-4">
            <ShieldAlert className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            {isSignUpMode ? 'Create Your Vault' : 'SecureMed Vault'}
          </h1>
          <p className="text-sm font-medium text-gray-500 mt-2 text-center">
            Patient-Owned Zero-Trust Architecture
          </p>
        </div>

        {/* ERROR & SUCCESS ALERTS */}
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm mb-6 border border-red-200 font-medium">{error}</div>}
        
        {successMessage && !isSignUpMode && (
          <div className="bg-green-50 text-green-800 p-4 rounded-2xl text-sm mb-6 border border-green-200 font-medium flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <p>{successMessage}</p>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Patient Email</label>
            <div className="relative">
              <Mail className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 transform -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-white/70 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium text-gray-800 shadow-sm"
                placeholder="patient@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
              {isSignUpMode ? 'Create Vault Password' : 'Vault Password'}
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 transform -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-white/70 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none font-medium text-gray-800 shadow-sm"
                placeholder="••••••••"
              />
            </div>
            {isSignUpMode && <p className="text-[10px] font-bold text-gray-400 mt-2 ml-1">Must be at least 6 characters long.</p>}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl transition-all shadow-xl disabled:opacity-70 flex justify-center items-center gap-2 text-lg"
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : isSignUpMode ? (
                <><UserPlus className="w-5 h-5"/> Initialize New Vault</>
              ) : (
                <><LogIn className="w-5 h-5"/> Access My Vault</>
              )}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center border-t border-gray-200/60 pt-6">
          <p className="text-sm text-gray-500 font-medium">
            {isSignUpMode ? "Already have a secure vault? " : "Don't have a secure vault yet? "}
            <button 
              type="button" 
              onClick={toggleMode}
              className="text-indigo-600 font-bold hover:text-indigo-800 hover:underline transition-all outline-none"
            >
              {isSignUpMode ? "Sign In Here" : "Create Account"}
            </button>
          </p>
        </div>

      </div>
    </div>
  );
}