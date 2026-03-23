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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
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
            
            const newUser: User = {
              id: firebaseUser.uid,
              username: firebaseUser.displayName || (firebaseUser.email?.includes('@cipher.app') ? firebaseUser.email.split('@')[0] : 'Anonymous'),
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
      <div className="h-screen w-full bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.4)]"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="h-screen w-full bg-slate-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-6xl h-full max-h-[900px] bg-white rounded-2xl shadow-xl overflow-hidden flex border border-slate-200">
        <ChatLayout user={user} onLogout={handleLogout} />
      </div>
    </div>
  );
}
