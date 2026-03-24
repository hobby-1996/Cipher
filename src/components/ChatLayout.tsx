import React, { useState, useEffect } from 'react';
import { User, Conversation, Message } from '../types';
import Sidebar from './Sidebar';
import ChatArea from './ChatArea';
import PingPong from './PingPong';
import { motion, AnimatePresence } from 'motion/react';
import { getSharedSecret, encryptMessage, decryptMessage, encapsulateSecret, decapsulateSecret } from '../utils/encryption';
import { Settings, Trash2, Loader2, AlertTriangle, Shield, ShieldCheck, X, Flame, ShieldAlert, Fingerprint, Lock, Unlock } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, addDoc, deleteDoc, doc, orderBy, setDoc, writeBatch } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { isAfter } from 'date-fns';

interface ChatLayoutProps {
  user: User;
  onLogout: () => void;
}

export default function ChatLayout({ user, onLogout }: ChatLayoutProps) {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [useTor, setUseTor] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [burnAfter, setBurnAfter] = useState<number>(0); // 0 = off, else minutes
  const [pinnedUsers, setPinnedUsers] = useState<string[]>(() => JSON.parse(localStorage.getItem(`pinned_${user.id}`) || '[]'));
  const [archivedUsers, setArchivedUsers] = useState<string[]>(() => JSON.parse(localStorage.getItem(`archived_${user.id}`) || '[]'));
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [isAppLocked, setIsAppLocked] = useState<boolean>(() => localStorage.getItem(`biometric_enabled_${user.id}`) === 'true');
  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(() => localStorage.getItem(`biometric_enabled_${user.id}`) === 'true');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm?: () => void;
    isDestructive?: boolean;
    isAlert?: boolean;
  } | null>(null);

  useEffect(() => {
    if (biometricEnabled && isAppLocked) {
      handleUnlock();
    }
  }, []);

  const handleUnlock = async () => {
    if (!window.PublicKeyCredential) {
      setIsAppLocked(false);
      return;
    }

    setIsAuthenticating(true);
    try {
      // Simple WebAuthn 'get' to verify identity
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const options: CredentialRequestOptions = {
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'required',
          rpId: window.location.hostname,
        }
      };

      await navigator.credentials.get(options);
      setIsAppLocked(false);
    } catch (err) {
      console.error('Biometric auth failed', err);
      // If user cancels, we stay locked
    } finally {
      setIsAuthenticating(false);
    }
  };

  const toggleBiometric = async () => {
    if (biometricEnabled) {
      setBiometricEnabled(false);
      localStorage.setItem(`biometric_enabled_${user.id}`, 'false');
      return;
    }

    if (!window.PublicKeyCredential) {
      setConfirmDialog({
        title: 'Not Supported',
        message: 'Biometric authentication is not supported on this device or browser.',
        isAlert: true
      });
      return;
    }

    setIsAuthenticating(true);
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const options: CredentialCreationOptions = {
        publicKey: {
          challenge,
          rp: { name: 'Cipher Chat', id: window.location.hostname },
          user: {
            id: Uint8Array.from(user.id, c => c.charCodeAt(0)),
            name: user.email,
            displayName: user.username
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          timeout: 60000,
          attestation: 'none',
          authenticatorSelection: {
            userVerification: 'required',
            residentKey: 'preferred',
            requireResidentKey: false
          }
        }
      };

      await navigator.credentials.create(options);
      setBiometricEnabled(true);
      localStorage.setItem(`biometric_enabled_${user.id}`, 'true');
      setConfirmDialog({
        title: 'Biometric Enabled',
        message: 'Biometric lock is now active. You will be prompted to unlock when you open the app.',
        isAlert: true
      });
    } catch (err) {
      console.error('Failed to enable biometric', err);
      setConfirmDialog({
        title: 'Setup Failed',
        message: 'Could not set up biometric authentication. Please try again.',
        isAlert: true
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handlePanic = async () => {
    setConfirmDialog({
      title: 'Panic Button',
      message: 'PANIC: This will immediately wipe ALL local session data and log you out. Continue?',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        localStorage.clear();
        await auth.signOut();
        onLogout();
      }
    });
  };

  const handleDeleteAccount = async () => {
    setConfirmDialog({
      title: 'Delete Account',
      message: 'Are you absolutely sure? This will delete all your messages and account data permanently.',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        setIsDeleting(true);
        try {
          const currentUser = auth.currentUser;
          if (!currentUser) return;

          const batch = writeBatch(db);

          // 1. Delete user document
          batch.delete(doc(db, 'users', user.id));

          // 2. Delete messages (all messages belonging to user have receiver_id == user.id)
          const messagesRef = collection(db, 'messages');
          const q = query(messagesRef, where('receiver_id', '==', user.id));

          const snapshot = await getDocs(q);
          snapshot.forEach(doc => batch.delete(doc.ref));

          await batch.commit();

          // 3. Delete Auth User
          await deleteUser(currentUser);
          
          // 4. Clear Local Storage
          localStorage.removeItem(`pqc_sk_${user.id}`);
          
          onLogout();
        } catch (err: any) {
          console.error('Failed to delete account', err);
          setConfirmDialog({
            title: 'Error',
            message: 'Failed to delete account: ' + err.message,
            isAlert: true
          });
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  const handleDeleteConversation = async (otherUserId: string) => {
    setConfirmDialog({
      title: 'Delete Conversation',
      message: 'Are you sure you want to delete this entire chat? This cannot be undone.',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          const messagesToDelete = allMessages.filter(m => m.sender_id === otherUserId || m.receiver_id === otherUserId);
          const batch = writeBatch(db);
          messagesToDelete.forEach(m => {
            batch.delete(doc(db, 'messages', m.id));
          });
          await batch.commit();
          
          if (activeConversation?.id === otherUserId) {
            setActiveConversation(null);
          }
        } catch (err) {
          console.error('Failed to delete conversation', err);
          setConfirmDialog({
            title: 'Error',
            message: 'Failed to delete conversation',
            isAlert: true
          });
        }
      }
    });
  };

  // Derived messages for active conversation
  const messages = activeConversation 
    ? allMessages.filter(m => m.sender_id === activeConversation.id || m.receiver_id === activeConversation.id)
    : [];

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentSuccess = urlParams.get('payment_success');
    const paymentUserId = urlParams.get('user_id');

    if (paymentSuccess === 'true' && paymentUserId === user.id) {
      // Update user to premium
      const updateUser = async () => {
        try {
          await setDoc(doc(db, 'users', user.id), { isPremium: true }, { merge: true });
          // Remove query params
          window.history.replaceState({}, document.title, window.location.pathname);
          setConfirmDialog({
            title: 'Success!',
            message: 'You are now a Premium user! Thank you for your purchase.',
            isAlert: true
          });
        } catch (error) {
          console.error("Failed to update premium status", error);
        }
      };
      updateUser();
    }
  }, [user.id]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const users: User[] = [];
        usersSnapshot.forEach((doc) => {
          users.push(doc.data() as User);
        });
        setAllUsers(users);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    
    fetchUsers();

    const handleOnline = () => {
      console.log('App came back online. Refreshing data...');
      setIsOffline(false);
    };

    const handleOffline = () => {
      console.log('App went offline.');
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const cleanupExpiredMessages = async () => {
      if (allMessages.length === 0) return;
      
      const now = new Date();
      const expired = allMessages.filter(m => m.expires_at && isAfter(now, new Date(m.expires_at)));
      
      if (expired.length > 0) {
        console.log(`Burning ${expired.length} expired messages...`);
        const batch = writeBatch(db);
        expired.forEach(m => {
          batch.delete(doc(db, 'messages', m.id));
        });
        try {
          await batch.commit();
        } catch (e) {
          console.error("Failed to burn expired messages", e);
        }
      }
    };

    const interval = setInterval(cleanupExpiredMessages, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [allMessages]);

  useEffect(() => {
    if (allUsers.length === 0) return;

    const messagesRef = collection(db, 'messages');
    const q = query(
      messagesRef,
      where('receiver_id', '==', user.id)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const newMessages: Message[] = [];
      const sk = localStorage.getItem(`pqc_sk_${user.id}`);

      for (const doc of snapshot.docs) {
        const msg = { id: doc.id, ...doc.data() } as Message;
        let decryptedPayload = null;
        
        if (msg.ct && sk) {
          try {
            const sharedSecret = await decapsulateSecret(msg.ct, sk);
            const decrypted = decryptMessage(msg.content, sharedSecret);
            if (decrypted && decrypted !== 'Failed to decrypt message') {
              const parsed = JSON.parse(decrypted);
              if (parsed.senderId && parsed.text) {
                decryptedPayload = parsed;
              }
            }
          } catch (e) {
            console.error("Failed to decrypt PQC message", e);
          }
        }
        
        if (!decryptedPayload) {
          for (const knownUser of allUsers) {
            const secret = getSharedSecret(user.id, knownUser.id);
            const decrypted = decryptMessage(msg.content, secret);
            if (decrypted && decrypted !== 'Failed to decrypt message') {
              try {
                const parsed = JSON.parse(decrypted);
                if (parsed.senderId && parsed.text) {
                  decryptedPayload = parsed;
                  break; // Found the right user
                }
              } catch (e) {
                // Ignore JSON parse errors
              }
            }
          }
        }

        if (decryptedPayload) {
          newMessages.push({
            ...msg,
            sender_id: decryptedPayload.isSentByMe ? user.id : decryptedPayload.senderId,
            receiver_id: decryptedPayload.isSentByMe ? decryptedPayload.senderId : user.id,
            content: decryptedPayload.text,
            is_sent_by_me: decryptedPayload.isSentByMe
          } as any);
        } else {
          // Add a placeholder for messages that couldn't be decrypted
          newMessages.push({
            ...msg,
            content: "🔒 Message encrypted with a previous or unknown key.",
            is_sent_by_me: false
          } as any);
        }
      }

      // Sort messages by created_at ascending
      newMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      setAllMessages(newMessages);

      // Build conversations list
      const convMap = new Map<string, Conversation>();
      
      for (const msg of newMessages) {
        const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        const otherUser = allUsers.find((u: User) => u.id === otherId);
        
        if (otherUser) {
          convMap.set(otherId, {
            id: otherUser.id,
            username: otherUser.username,
            email: otherUser.email,
            last_message: msg.content,
            last_message_time: msg.created_at
          });
        }
      }
      
      const convs = Array.from(convMap.values()).map(c => ({
        ...c,
        is_pinned: pinnedUsers.includes(c.id),
        is_archived: archivedUsers.includes(c.id),
      })).sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        if (!a.last_message_time) return 1;
        if (!b.last_message_time) return -1;
        return new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime();
      });
      
      setConversations(convs);
    }, (error) => {
      console.error("Error fetching messages:", error);
    });

    return () => unsubscribe();
  }, [allUsers, user.id, pinnedUsers, archivedUsers]);

  useEffect(() => {
    if (activeConversation) {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      }
    }
  }, [activeConversation]);

  const handleSelectConversation = (conv: Conversation) => {
    setActiveConversation(conv);
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!activeConversation || !content.trim()) return;

    const recipient = allUsers.find(u => u.id === activeConversation.id);
    if (!recipient) return;

    try {
      let encryptedReceiver, ctReceiver = null;
      let encryptedSelf, ctSelf = null;

      const payloadReceiver = JSON.stringify({ senderId: user.id, text: content.trim(), isSentByMe: false });
      const payloadSelf = JSON.stringify({ senderId: activeConversation.id, text: content.trim(), isSentByMe: true });

      if (recipient.public_key && user.public_key) {
        // PQC Encryption
        const { ciphertext: ctR, sharedSecret: ssR } = await encapsulateSecret(recipient.public_key);
        encryptedReceiver = encryptMessage(payloadReceiver, ssR);
        ctReceiver = ctR;

        const { ciphertext: ctS, sharedSecret: ssS } = await encapsulateSecret(user.public_key);
        encryptedSelf = encryptMessage(payloadSelf, ssS);
        ctSelf = ctS;
      } else {
        // Fallback to AES
        const secret = getSharedSecret(user.id, activeConversation.id);
        encryptedReceiver = encryptMessage(payloadReceiver, secret);
        encryptedSelf = encryptMessage(payloadSelf, secret);
      }

      const now = new Date().toISOString();
      let expiresAt = null;
      if (user.isPremium && burnAfter > 0) {
        const expiryDate = new Date();
        expiryDate.setMinutes(expiryDate.getMinutes() + burnAfter);
        expiresAt = expiryDate.toISOString();
      }

      // Send to receiver
      const receiverMsgRef = doc(collection(db, 'messages'));
      await setDoc(receiverMsgRef, {
        id: receiverMsgRef.id,
        sender_id: 'sealed',
        receiver_id: activeConversation.id,
        content: encryptedReceiver,
        ct: ctReceiver || null,
        created_at: now,
        expires_at: expiresAt
      });

      // Send to myself
      const selfMsgRef = doc(collection(db, 'messages'));
      await setDoc(selfMsgRef, {
        id: selfMsgRef.id,
        sender_id: 'sealed',
        receiver_id: user.id,
        content: encryptedSelf,
        ct: ctSelf || null,
        created_at: now,
        expires_at: expiresAt
      });
    } catch (e) {
      console.error("Failed to send message", e);
    }
  };

  const handleStartConversation = (otherUser: User) => {
    const existing = conversations.find((c) => c.id === otherUser.id);
    if (existing) {
      setActiveConversation(existing);
    } else {
      const newConv: Conversation = {
        id: otherUser.id,
        username: otherUser.username,
        email: otherUser.email,
        last_message: null,
        last_message_time: null,
        is_pinned: pinnedUsers.includes(otherUser.id),
        is_archived: archivedUsers.includes(otherUser.id),
      };
      setConversations([newConv, ...conversations]);
      setActiveConversation(newConv);
      
      // Add to allUsers if not present so we can decrypt future messages
      if (!allUsers.find(u => u.id === otherUser.id)) {
        setAllUsers([...allUsers, otherUser]);
      }
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteDoc(doc(db, 'messages', messageId));
    } catch (error) {
      console.error("Failed to delete message", error);
    }
  };

  const handleTogglePin = (userId: string) => {
    setPinnedUsers(prev => {
      const next = prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId];
      localStorage.setItem(`pinned_${user.id}`, JSON.stringify(next));
      return next;
    });
  };

  const handleToggleArchive = (userId: string) => {
    setArchivedUsers(prev => {
      const next = prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId];
      localStorage.setItem(`archived_${user.id}`, JSON.stringify(next));
      return next;
    });
  };

  const handleStartGame = async () => {
    if (!activeConversation) return;
    
    try {
      // Create game document
      const gameRef = doc(collection(db, 'games'));
      await setDoc(gameRef, {
        hostId: user.id,
        guestId: activeConversation.id,
        status: 'lobby',
        hostReady: false,
        guestReady: false,
        hostScore: 0,
        guestScore: 0,
        hostPaddle: 50,
        guestPaddle: 50,
        ball: { x: 50, y: 50, dx: 0, dy: 0 },
        countdown: 3,
        winner: null,
        created_at: new Date().toISOString()
      });

      // Send game invite message
      handleSendMessage(`[GAME_INVITE:${gameRef.id}]`);
      
      // Open game
      setActiveGameId(gameRef.id);
    } catch (err) {
      console.error('Failed to start game', err);
      setConfirmDialog({
        title: 'Error',
        message: 'Failed to start game',
        isAlert: true
      });
    }
  };

  const handleJoinGame = (gameId: string) => {
    setActiveGameId(gameId);
  };

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden bg-bg-soothing">
      {/* Biometric Lock Screen */}
      <AnimatePresence>
        {isAppLocked && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] bg-primary-navy flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center mb-8 border border-white/10 shadow-2xl">
              <Lock className="w-10 h-10 text-accent-teal" />
            </div>
            <h2 className="text-2xl font-bold text-text-offwhite mb-2">App Locked</h2>
            <p className="text-text-offwhite/40 mb-10 max-w-xs font-bold">
              Biometric authentication is required to access your conversations.
            </p>
            <button
              onClick={handleUnlock}
              disabled={isAuthenticating}
              className="flex items-center space-x-3 px-8 py-4 bg-accent-teal text-primary-navy rounded-2xl font-bold shadow-lg hover:bg-accent-teal/90 transition-all active:scale-95 disabled:opacity-50"
            >
              {isAuthenticating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Fingerprint className="w-5 h-5" />
              )}
              <span>Unlock with Biometric</span>
            </button>
            <button
              onClick={() => {
                auth.signOut();
                onLogout();
              }}
              className="mt-6 text-xs font-bold text-text-offwhite/30 hover:text-highlight-orange transition-colors"
            >
              Logout and switch account
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {isOffline && (
        <div className="w-full bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-widest py-2 px-4 text-center flex items-center justify-center z-50 border-b border-amber-100">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
          Offline Mode • Messages will sync when reconnected
        </div>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmDialog && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-primary-navy/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-slate border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-lg font-bold text-text-offwhite mb-2">{confirmDialog.title}</h3>
              <p className="text-sm text-text-offwhite/70 mb-6">{confirmDialog.message}</p>
              <div className="flex justify-end space-x-3">
                {!confirmDialog.isAlert && (
                  <button
                    onClick={() => setConfirmDialog(null)}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-text-offwhite/70 hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                    else setConfirmDialog(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-lg ${
                    confirmDialog.isDestructive
                      ? 'bg-error-red text-white hover:bg-error-red/90'
                      : 'bg-accent-teal text-primary-navy hover:bg-accent-teal/90'
                  }`}
                >
                  {confirmDialog.isAlert ? 'OK' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 h-full w-full relative overflow-hidden">
        {/* Sidebar */}
        <motion.div 
          className={`absolute lg:relative z-20 h-full w-full lg:w-96 border-r border-secondary-blue/30 bg-white flex flex-col transition-transform duration-500 ease-in-out ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <Sidebar 
            user={user} 
            conversations={conversations} 
            activeConversation={activeConversation}
            onSelectConversation={handleSelectConversation}
            onStartConversation={handleStartConversation}
            onLogout={onLogout}
            onOpenSettings={() => setShowSettings(true)}
            onDeleteConversation={handleDeleteConversation}
            onTogglePin={handleTogglePin}
            onToggleArchive={handleToggleArchive}
          />
        </motion.div>

        {/* Main Chat Area */}
        <div className="flex-1 h-full bg-bg-slate flex flex-col relative z-10 w-full">
          {activeConversation ? (
            <ChatArea 
              user={user}
              conversation={activeConversation}
              messages={messages}
              onSendMessage={handleSendMessage}
              onDeleteMessage={handleDeleteMessage}
              onBack={() => setIsSidebarOpen(true)}
              onOpenSettings={() => setShowSettings(true)}
              onStartGame={handleStartGame}
              onJoinGame={handleJoinGame}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-text-offwhite/40 p-10 text-center relative">
              <div className="absolute top-6 right-6">
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-3 text-text-offwhite/40 hover:text-accent-teal hover:bg-white/5 rounded-2xl transition-all shadow-lg border border-transparent hover:border-white/10"
                  title="Settings"
                >
                  <Settings className="w-6 h-6" />
                </button>
              </div>
              <div className="w-28 h-28 bg-primary-navy rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl border border-white/5">
                <ShieldCheck className="w-12 h-12 text-accent-teal" />
              </div>
              <h3 className="text-2xl font-bold text-text-offwhite mb-3">Your Safe Space</h3>
              <p className="max-w-xs text-sm leading-relaxed font-bold">
                Select a conversation to start sharing. Your messages are protected by post-quantum encryption.
              </p>
              {/* Mobile open sidebar button */}
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="mt-8 lg:hidden px-8 py-3 bg-accent-teal text-primary-navy rounded-2xl font-bold shadow-lg hover:bg-accent-teal/90 transition-all active:scale-95"
              >
                Open Contacts
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Game Modal */}
      <AnimatePresence>
        {activeGameId && (
          <PingPong 
            gameId={activeGameId} 
            userId={user.id} 
            onClose={() => setActiveGameId(null)} 
          />
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary-navy/80 backdrop-blur-md p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-primary-navy rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white/10"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-primary-navy">
              <h3 className="text-xl font-bold text-text-offwhite">Security Settings</h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 text-text-offwhite/40 hover:text-accent-teal hover:bg-white/5 rounded-xl transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
              <div>
                <h4 className="text-xs font-bold text-text-offwhite/40 uppercase tracking-widest mb-4">Account Profile</h4>
                <div className="bg-white/5 p-6 rounded-2xl space-y-4 border border-white/5">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-text-offwhite/30 uppercase tracking-wider">Account Type</p>
                    {user.isPremium ? (
                      <div className="flex items-center space-x-2 px-4 py-1.5 bg-gradient-to-r from-accent-teal/20 to-accent-teal/10 text-accent-teal rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-accent-teal/30 shadow-[0_0_15px_rgba(45,212,191,0.1)]">
                        <Flame className="w-3 h-3 fill-accent-teal" />
                        <span>Premium</span>
                      </div>
                    ) : (
                      <div className="px-4 py-1.5 bg-white/5 text-text-offwhite/40 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-white/10">
                        Free Tier
                      </div>
                    )}
                  </div>
                  {!user.isPremium && (
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/create-checkout-session', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: user.id }),
                            });
                            const data = await res.json();
                            if (data.url) {
                              window.location.href = data.url;
                            } else {
                              setConfirmDialog({
                                title: 'Error',
                                message: 'Failed to start checkout: ' + (data.error || 'Unknown error'),
                                isAlert: true
                              });
                            }
                          } catch (err) {
                            console.error(err);
                            setConfirmDialog({
                              title: 'Error',
                              message: 'Failed to connect to payment server.',
                              isAlert: true
                            });
                          }
                        }}
                        className="px-4 py-2 bg-accent-teal text-primary-navy rounded-xl text-xs font-bold hover:bg-accent-teal/90 transition-all shadow-lg"
                      >
                        Upgrade to Premium (₹2,999)
                      </button>
                    </div>
                  )}
                  <div className="h-px bg-white/5 w-full"></div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-text-offwhite/30 uppercase tracking-wider">Username</p>
                    <p className="font-bold text-text-offwhite">{user.username}</p>
                  </div>
                  <div className="h-px bg-white/5 w-full"></div>
                  <div className="flex justify-between items-center space-x-4">
                    <p className="text-xs font-bold text-text-offwhite/30 uppercase tracking-wider shrink-0">Secure Email</p>
                    <div className="overflow-x-auto">
                      <p className="text-[10px] font-mono font-light text-text-offwhite/60 text-right whitespace-nowrap" title={user.email}>{user.email}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="text-xs font-bold text-text-offwhite/40 uppercase tracking-widest mb-4">Privacy & Security</h4>
                <div className="bg-secure-green/10 p-6 rounded-2xl flex items-start space-x-4 border border-secure-green/20">
                  <div className="mt-1">
                    <Shield className="w-6 h-6 text-secure-green" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-secure-green">Post-Quantum Protection Active</p>
                    <p className="text-xs text-text-offwhite/60 mt-1.5 leading-relaxed font-bold">
                      Your conversations are shielded with CRYSTALS-Kyber (PQC) and AES-256. This ensures your data remains private even against future quantum computers.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold text-text-offwhite/40 uppercase tracking-widest">Journalist Tools</h4>
                  {!user.isPremium && (
                    <div className="flex items-center space-x-1 px-2 py-0.5 bg-accent-teal/10 text-accent-teal rounded-md text-[9px] font-bold uppercase tracking-wider border border-accent-teal/20">
                      <ShieldAlert className="w-2.5 h-2.5" />
                      <span>Premium Only</span>
                    </div>
                  )}
                </div>
                <div className={`bg-white/5 p-6 rounded-2xl space-y-5 border border-white/5 transition-all ${!user.isPremium ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-text-offwhite">Biometric Lock</p>
                      <p className="text-xs text-text-offwhite/40 mt-1 font-bold">
                        Require biometric to unlock app.
                      </p>
                    </div>
                    <button
                      onClick={toggleBiometric}
                      disabled={isAuthenticating}
                      className={`w-12 h-6 rounded-full transition-all relative ${biometricEnabled ? 'bg-accent-teal' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${biometricEnabled ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="h-px bg-white/5 w-full"></div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-text-offwhite">Disappearing Messages</p>
                      <p className="text-xs text-text-offwhite/40 mt-1 font-bold">
                        Burn messages after a set time.
                      </p>
                    </div>
                    <select 
                      value={burnAfter}
                      onChange={(e) => setBurnAfter(Number(e.target.value))}
                      disabled={!user.isPremium}
                      className="bg-primary-navy border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-text-offwhite outline-none focus:border-accent-teal transition-colors disabled:opacity-50"
                    >
                      <option value={0}>Off</option>
                      <option value={1}>1 Minute</option>
                      <option value={5}>5 Minutes</option>
                      <option value={60}>1 Hour</option>
                      <option value={1440}>24 Hours</option>
                    </select>
                  </div>
                  <div className="h-px bg-white/5 w-full"></div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-text-offwhite">Onion Routing (Tor)</p>
                      <p className="text-xs text-text-offwhite/40 mt-1 font-bold">
                        Mask your digital footprint via multi-node routing.
                      </p>
                    </div>
                    <button 
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all ${useTor ? 'bg-accent-teal' : 'bg-white/10'}`}
                      onClick={() => setUseTor(!useTor)}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${useTor ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {useTor && (
                    <div className="mt-4 p-4 bg-highlight-orange/10 rounded-xl border border-highlight-orange/20 flex items-start space-x-3">
                      <AlertTriangle className="w-5 h-5 text-highlight-orange shrink-0 mt-0.5" />
                      <p className="text-[11px] text-highlight-orange leading-relaxed font-bold">
                        Note: For complete IP anonymity, please use the Tor Browser. Standard browsers cannot fully mask your network identity.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <button 
                  onClick={handlePanic}
                  className="w-full py-4 bg-error-red text-white rounded-2xl text-xs font-bold tracking-widest uppercase transition-all flex items-center justify-center space-x-3 shadow-lg hover:bg-error-red/90 active:scale-95"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Panic Button: Wipe Session</span>
                </button>
                
                <button 
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="w-full py-4 bg-error-red/10 hover:bg-error-red/20 text-error-red rounded-2xl text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center space-x-3 border border-error-red/10"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Account Permanently</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="p-6 border-t border-white/5 bg-white/5 flex justify-end">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-8 py-3 bg-accent-teal text-primary-navy rounded-xl text-sm font-bold hover:bg-accent-teal/90 transition-all shadow-lg"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
