/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { User } from './types';
import Login from './components/Login';
import ChatLayout from './components/ChatLayout';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { generatePQCKeyPair } from './utils/encryption';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [newlyRegisteredPhone, setNewlyRegisteredPhone] = useState<string | null>(localStorage.getItem('justRegisteredPhone'));

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const justRegistered = localStorage.getItem('justRegisteredPhone');
        if (justRegistered) {
          setNewlyRegisteredPhone(justRegistered);
        }
        
        try {
          // Check if user exists in Firestore
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            const existingSecretKey = localStorage.getItem(`pqc_sk_${firebaseUser.uid}`);
            
            if (!existingSecretKey) {
              // Regenerate keys if missing from local storage
              const { publicKey, secretKey } = await generatePQCKeyPair();
              userData.public_key = publicKey;
              await setDoc(doc(db, 'users', firebaseUser.uid), { public_key: publicKey }, { merge: true });
              localStorage.setItem(`pqc_sk_${firebaseUser.uid}`, secretKey);
            }
            
            setUser(userData);
          } else {
            // Generate PQC Keypair for new user
            const { publicKey, secretKey } = await generatePQCKeyPair();
            
            const phone = firebaseUser.email?.includes('@cipher.app') ? firebaseUser.email.split('@')[0] : 'Anonymous';
            const newUser: User = {
              id: firebaseUser.uid,
              username: phone,
              email: firebaseUser.email || 'no-email@example.com',
              public_key: publicKey,
              created_at: new Date().toISOString(),
              last_active: new Date().toISOString()
            };
            
            await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
            localStorage.setItem(`pqc_sk_${firebaseUser.uid}`, secretKey);
            setUser(newUser);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setUser(null);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="h-screen w-full bg-bg-slate flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-teal shadow-lg"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (newlyRegisteredPhone) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-b from-[#1E2A38] to-[#243B55] flex flex-col items-center justify-center p-4 font-sans text-[#E6EAF0] overflow-hidden relative">
        {/* Subtle Noise Overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>

        <div className="max-w-md w-full relative z-10">
          <div className="bg-[#2C3E50] border border-white/[0.06] p-7 sm:p-8 rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.25)] text-center space-y-8">
            <div className="inline-flex h-16 w-16 bg-[#3EC6C1]/20 rounded-full items-center justify-center mx-auto mb-2">
              <svg className="h-8 w-8 text-[#3EC6C1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-[28px] font-bold text-[#E6EAF0] leading-tight">Registration Successful</h2>
              <p className="text-[#AAB4C0] text-sm">Your unique secure ID has been generated.</p>
            </div>
            
            <div className="bg-white/[0.04] border border-white/[0.08] p-6 rounded-[14px] space-y-1 shadow-inner">
              <p className="text-[11px] text-[#AAB4C0] uppercase tracking-widest font-medium">Your Phone Number</p>
              <p className="text-3xl font-mono font-bold text-[#3EC6C1] tracking-tighter">{newlyRegisteredPhone}</p>
            </div>

            <p className="text-xs text-amber-400/90 bg-amber-400/10 p-3.5 rounded-[12px] border border-amber-400/20 font-medium">
              Important: Save this number! You will need it to log in next time.
            </p>

            <button
              onClick={() => {
                localStorage.removeItem('justRegisteredPhone');
                setNewlyRegisteredPhone(null);
              }}
              className="w-full h-[56px] bg-gradient-to-r from-[#3EC6C1] to-[#2FA4A8] hover:brightness-95 text-[#0F172A] rounded-[16px] font-semibold shadow-[0_8px_20px_rgba(62,198,193,0.25)] transition-all text-base active:scale-[0.97] flex items-center justify-center mt-4"
            >
              Enter Cipher
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-bg-slate flex items-center justify-center p-0 lg:p-8">
      <div className="w-full max-w-7xl h-full lg:max-h-[900px] bg-primary-navy lg:rounded-[2.5rem] shadow-2xl overflow-hidden flex border border-white/5">
        <ChatLayout user={user} onLogout={handleLogout} />
      </div>
    </div>
  );
}
