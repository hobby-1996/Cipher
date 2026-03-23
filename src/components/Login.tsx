import React, { useState } from 'react';
import { MessageSquare, Loader2, Shield, Lock, EyeOff, Globe, Smartphone, Key, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { usePWAInstall } from '../hooks/usePWAInstall';

export default function Login() {
  const { isInstallable, install } = usePWAInstall();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const generateRandomPhone = () => {
    const randomPart = Math.floor(10000 + Math.random() * 90000).toString();
    return `94190${randomPart}`;
  };

  const [generatedPhone, setGeneratedPhone] = useState('');

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

        setGeneratedPhone(newPhone);
      } else {
        const email = `${phone}@cipher.app`;
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
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

  if (generatedPhone) {
    return (
      <div className="min-h-screen w-full bg-[#0a0a0a] flex items-center justify-center p-4 font-sans text-white overflow-hidden relative">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white/5 backdrop-blur-2xl border border-white/10 p-8 rounded-[2.5rem] shadow-2xl text-center space-y-6"
        >
          <div className="h-16 w-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
            <Shield className="h-8 w-8 text-green-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Registration Successful</h2>
            <p className="text-slate-400 text-sm">Your unique secure ID has been generated.</p>
          </div>
          
          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-widest">Your Phone Number</p>
            <p className="text-3xl font-mono font-bold text-indigo-400 tracking-tighter">{generatedPhone}</p>
          </div>

          <p className="text-xs text-amber-400/80 bg-amber-400/5 p-3 rounded-xl border border-amber-400/10">
            Important: Save this number! You will need it to log in next time.
          </p>

          <button
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all"
          >
            Enter Cipher
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-[#0a0a0a] flex items-center justify-center p-4 font-sans text-white overflow-hidden relative pt-safe pb-safe">
      {/* Background Glow */}
      <div className="absolute top-[-5%] left-[-5%] w-[50%] h-[50%] bg-indigo-900/10 blur-[80px] sm:blur-[120px] rounded-full"></div>
      <div className="absolute bottom-[-5%] right-[-5%] w-[50%] h-[50%] bg-purple-900/10 blur-[80px] sm:blur-[120px] rounded-full"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full relative z-10 px-2 sm:px-0"
      >
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl space-y-6 sm:space-y-8">
          {/* Compact Branding */}
          <div className="text-center space-y-2 sm:space-y-3">
            <div className="inline-flex h-12 w-12 sm:h-14 sm:w-14 bg-indigo-600 rounded-2xl items-center justify-center shadow-lg shadow-indigo-500/20 mx-auto">
              <MessageSquare className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tighter text-white uppercase">CIPHER</h1>
              <p className="text-slate-400 text-[10px] sm:text-sm">Post-Quantum Secure Messaging</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={isRegistering ? 'register' : 'login'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="text-center">
                <h2 className="text-xl font-bold">{isRegistering ? 'Create Account' : 'Welcome Back'}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {isRegistering ? 'A secure number will be generated for you' : 'Sign in to your secure vault'}
                </p>
              </div>

              <form onSubmit={handlePhoneAuth} className="space-y-3 sm:space-y-4">
                {error && (
                  <div className="p-3 bg-red-500/10 text-red-400 text-[10px] sm:text-xs rounded-xl border border-red-500/20 text-center">
                    {error}
                  </div>
                )}

                {!isRegistering && (
                  <div className="space-y-1">
                    <div className="relative">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        type="tel" 
                        placeholder="94190XXXXX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 sm:py-4 pl-11 pr-5 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="password" 
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 sm:py-4 pl-11 pr-5 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 sm:py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 text-sm"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (isRegistering ? 'Generate ID & Register' : 'Sign In')}
                </button>

                <button
                  type="button"
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="w-full text-xs text-slate-500 hover:text-white transition-colors text-center"
                >
                  {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register"}
                </button>
              </form>
            </motion.div>
          </AnimatePresence>

          {/* Subtle Privacy Features */}
          <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2 opacity-40 hover:opacity-100 transition-opacity cursor-default">
              <Shield className="w-3 h-3 text-indigo-400" />
              <span className="text-[10px] uppercase tracking-tighter">PQC Encrypted</span>
            </div>
            <div className="flex items-center space-x-2 opacity-40 hover:opacity-100 transition-opacity cursor-default">
              <Lock className="w-3 h-3 text-indigo-400" />
              <span className="text-[10px] uppercase tracking-tighter">End-to-End</span>
            </div>
          </div>

          {isInstallable && (
            <button
              onClick={install}
              className="w-full flex items-center justify-center space-x-2 py-3 bg-white/5 hover:bg-white/10 text-indigo-400 rounded-2xl text-xs font-medium transition-all border border-white/5"
            >
              <Download className="w-4 h-4" />
              <span>Install Cipher App</span>
            </button>
          )}
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
