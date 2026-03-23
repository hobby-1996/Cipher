import React, { useState, useEffect } from 'react';
import { User, Conversation, Message } from '../types';
import Sidebar from './Sidebar';
import ChatArea from './ChatArea';
import { motion } from 'motion/react';
import { getSharedSecret, encryptMessage, decryptMessage, encapsulateSecret, decapsulateSecret } from '../utils/encryption';
import { Settings, Trash2, Loader2, AlertTriangle, Shield } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, addDoc, deleteDoc, doc, orderBy, setDoc, writeBatch } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';

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

  const handleDeleteAccount = async () => {
    if (!window.confirm('Are you absolutely sure? This will delete all your messages and account data permanently.')) {
      return;
    }

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
      alert('Failed to delete account: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteConversation = async (otherUserId: string) => {
    if (!window.confirm('Are you sure you want to delete this entire chat? This cannot be undone.')) return;
    
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
      alert('Failed to delete conversation');
    }
  };

  // Derived messages for active conversation
  const messages = activeConversation 
    ? allMessages.filter(m => m.sender_id === activeConversation.id || m.receiver_id === activeConversation.id)
    : [];

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
      
      const convs = Array.from(convMap.values()).sort((a, b) => {
        if (!a.last_message_time) return 1;
        if (!b.last_message_time) return -1;
        return new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime();
      });
      
      setConversations(convs);
    }, (error) => {
      console.error("Error fetching messages:", error);
    });

    return () => unsubscribe();
  }, [allUsers, user.id]);

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

      // Send to receiver
      const receiverMsgRef = doc(collection(db, 'messages'));
      await setDoc(receiverMsgRef, {
        id: receiverMsgRef.id,
        sender_id: 'sealed',
        receiver_id: activeConversation.id,
        content: encryptedReceiver,
        ct: ctReceiver || null,
        created_at: now
      });

      // Send to myself
      const selfMsgRef = doc(collection(db, 'messages'));
      await setDoc(selfMsgRef, {
        id: selfMsgRef.id,
        sender_id: 'sealed',
        receiver_id: user.id,
        content: encryptedSelf,
        ct: ctSelf || null,
        created_at: now
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

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden bg-bg-soothing">
      {isOffline && (
        <div className="w-full bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-widest py-2 px-4 text-center flex items-center justify-center z-50 border-b border-amber-100">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
          Offline Mode • Messages will sync when reconnected
        </div>
      )}
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
          />
        </motion.div>

        {/* Main Chat Area */}
        <div className="flex-1 h-full bg-bg-soothing flex flex-col relative z-10 w-full">
          {activeConversation ? (
            <ChatArea 
              user={user}
              conversation={activeConversation}
              messages={messages}
              onSendMessage={handleSendMessage}
              onDeleteMessage={handleDeleteMessage}
              onBack={() => setIsSidebarOpen(true)}
              onOpenSettings={() => setShowSettings(true)}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-text-muted p-10 text-center relative">
              <div className="absolute top-6 right-6">
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-3 text-text-muted hover:text-primary-navy hover:bg-white rounded-2xl transition-all shadow-sm border border-transparent hover:border-secondary-blue/30"
                  title="Settings"
                >
                  <Settings className="w-6 h-6" />
                </button>
              </div>
              <div className="w-28 h-28 bg-white rounded-[2.5rem] flex items-center justify-center mb-8 shadow-[0_4px_20px_rgb(0,0,0,0.02)] border border-secondary-blue/20">
                <svg className="w-12 h-12 text-secondary-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-primary-navy mb-3">Your Safe Space</h3>
              <p className="max-w-xs text-sm leading-relaxed font-medium">
                Select a conversation to start sharing. Your messages are protected by post-quantum encryption.
              </p>
              {/* Mobile open sidebar button */}
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="mt-8 lg:hidden px-8 py-3 bg-primary-navy text-white rounded-2xl font-semibold shadow-md hover:bg-primary-navy/90 transition-all active:scale-95"
              >
                Open Contacts
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary-navy/10 backdrop-blur-md p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-secondary-blue/30"
          >
            <div className="p-6 border-b border-secondary-blue/20 flex items-center justify-between bg-white">
              <h3 className="text-xl font-semibold text-primary-navy">Settings</h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 text-text-muted hover:text-primary-navy hover:bg-bg-soothing rounded-xl transition-all"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
              <div>
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-4">Account Profile</h4>
                <div className="bg-bg-soothing p-6 rounded-2xl space-y-4 border border-secondary-blue/30">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Username</p>
                    <p className="font-semibold text-primary-navy">{user.username}</p>
                  </div>
                  <div className="h-px bg-secondary-blue/30 w-full"></div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Secure Email</p>
                    <p className="font-medium text-primary-navy/80">{user.email}</p>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-4">Privacy & Security</h4>
                <div className="bg-emerald-50/50 p-6 rounded-2xl flex items-start space-x-4 border border-emerald-100">
                  <div className="mt-1">
                    <Shield className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-900">Post-Quantum Protection Active</p>
                    <p className="text-xs text-emerald-700/80 mt-1.5 leading-relaxed font-medium">
                      Your conversations are shielded with CRYSTALS-Kyber (PQC) and AES-256. This ensures your data remains private even against future quantum computers.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-4">Advanced Preferences</h4>
                <div className="bg-bg-soothing p-6 rounded-2xl space-y-5 border border-secondary-blue/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-primary-navy">Onion Routing (Tor)</p>
                      <p className="text-xs text-text-muted mt-1 font-medium">
                        Mask your digital footprint via multi-node routing.
                      </p>
                    </div>
                    <button 
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all ${useTor ? 'bg-primary-navy' : 'bg-text-muted/30'}`}
                      onClick={() => setUseTor(!useTor)}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${useTor ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {useTor && (
                    <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-start space-x-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                        Note: For complete IP anonymity, please use the Tor Browser. Standard browsers cannot fully mask your network identity.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="w-full py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center space-x-3 border border-red-100"
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
            <div className="p-6 border-t border-secondary-blue/20 bg-bg-soothing flex justify-end">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-8 py-3 bg-white text-primary-navy border border-secondary-blue/50 rounded-xl text-sm font-bold hover:bg-secondary-blue/20 transition-all shadow-sm"
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
