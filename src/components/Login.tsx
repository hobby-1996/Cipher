import React, { useState } from 'react';
import { MessageSquare, Loader2, Shield, Lock, EyeOff, Globe, Smartphone, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const generateRandomPhone = () => {
    const randomPart = Math.floor(10000 + Math.random() * 90000).toString();
    return `94190${randomPart}`;
  };

  const handlePhoneAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isRegistering && !phone) {
      setError('Please enter your phone number');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    
    try {
      if (isRegistering) {
        const newPhone = generateRandomPhone();
        localStorage.setItem('justRegisteredPhone', newPhone);
        const email = `${newPhone}@cipher.app`;
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Create user document in Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          id: userCredential.user.uid,
          username: newPhone,
          email: email,
          phone: newPhone,
          created_at: new Date().toISOString()
        });

      } else {
        const email = `${phone}@cipher.app`;
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      localStorage.removeItem('justRegisteredPhone');
      console.error('Phone auth error:', err);
      if (err.code === 'auth/user-not-found' && !isRegistering) {
        setError('No account found with this number.');
      } else if (err.code === 'auth/email-already-in-use' && isRegistering) {
        setError('Registration failed. Please try again.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password sign-in is not enabled in your Firebase Console. Please enable it under Authentication > Sign-in method.');
      } else {
        setError(err.message || 'Authentication failed');
      }
      setLoading(false);
    }
  };

  const privacyFeatures = [
    { icon: <Shield className="w-5 h-5 text-indigo-500" />, title: "Post-Quantum Security", desc: "Encrypted with CRYSTALS-Kyber to resist future quantum attacks." },
    { icon: <Lock className="w-5 h-5 text-indigo-500" />, title: "End-to-End Encryption", desc: "Only you and your recipient can read your messages." },
    { icon: <EyeOff className="w-5 h-5 text-indigo-500" />, title: "Zero-Knowledge", desc: "We don't store your keys or have access to your conversations." },
    { icon: <Globe className="w-5 h-5 text-indigo-500" />, title: "Tor-Ready Routing", desc: "Optional onion routing to mask your digital footprint." }
  ];

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#1E2A38] to-[#243B55] flex flex-col items-center justify-center p-4 font-sans text-[#E6EAF0] overflow-hidden relative">
      {/* Subtle Noise Overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-md w-full relative z-10"
      >
        <div className="bg-[#2C3E50] border border-white/[0.06] p-7 sm:p-8 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.25)] space-y-8">
          {/* Minimal Branding */}
          <div className="text-center space-y-4">
            <div className="inline-flex h-14 w-14 bg-accent-teal rounded-2xl items-center justify-center shadow-[0_0_20px_rgba(62,198,193,0.3)] mx-auto mb-2">
              <MessageSquare className="h-7 w-7 text-primary-navy" />
            </div>
            <div className="space-y-1">
              <h1 className="text-[24px] font-medium tracking-tight text-[#E6EAF0]">Cipher</h1>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={isRegistering ? 'register' : 'login'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-8"
            >
              <div className="text-center mb-8">
                <h2 className="text-[32px] font-bold text-[#E6EAF0] leading-tight">
                  {isRegistering ? 'Create Account' : 'Welcome Back'}
                </h2>
                <p className="text-[#AAB4C0] text-sm mt-3 mb-2">
                  {isRegistering ? 'A unique secure number will be generated' : 'Sign in to your private vault'}
                </p>
                <div className="flex items-center justify-center space-x-1.5 text-[#AAB4C0] opacity-80 mt-4">
                  <Lock className="w-3 h-3" />
                  <span className="text-[11px] uppercase tracking-wider font-medium">End-to-end encrypted</span>
                </div>
              </div>

              <form onSubmit={handlePhoneAuth} className="space-y-6">
                {error && (
                  <div className="p-4 bg-error-red/20 text-error-red text-xs rounded-xl border border-error-red/30 text-center animate-in fade-in slide-in-from-top-1">
                    {error}
                  </div>
                )}

                {!isRegistering && (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white opacity-60" />
                      <input 
                        type="tel" 
                        placeholder="Phone Number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className="w-full h-[52px] bg-white/[0.04] border border-white/[0.08] rounded-[14px] pl-12 pr-5 text-[#E6EAF0] placeholder-white/30 shadow-inner focus:ring-2 focus:ring-[#3EC6C1]/20 focus:border-[#3EC6C1] outline-none transition-all text-sm"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white opacity-60" />
                    <input 
                      type="password" 
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-[52px] bg-white/[0.04] border border-white/[0.08] rounded-[14px] pl-12 pr-5 text-[#E6EAF0] placeholder-white/30 shadow-inner focus:ring-2 focus:ring-[#3EC6C1]/20 focus:border-[#3EC6C1] outline-none transition-all text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[56px] bg-gradient-to-r from-[#3EC6C1] to-[#2FA4A8] hover:brightness-95 text-[#0F172A] rounded-[16px] font-semibold shadow-[0_8px_20px_rgba(62,198,193,0.25)] transition-all disabled:opacity-50 text-base active:scale-[0.97] flex items-center justify-center mt-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (isRegistering ? 'Create Secure ID' : 'Sign In')}
                </button>

                <button
                  type="button"
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="w-full text-sm text-[#AAB4C0] hover:opacity-80 transition-opacity text-center mt-4"
                >
                  {isRegistering ? (
                    <>Already have an account? <span className="text-[#3EC6C1] hover:underline">Login</span></>
                  ) : (
                    <>Don't have an account? <span className="text-[#3EC6C1] hover:underline">Register</span></>
                  )}
                </button>
              </form>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function ArrowLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}
