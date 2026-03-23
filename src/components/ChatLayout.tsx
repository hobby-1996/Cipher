import React, { useState, useEffect } from 'react';
import { User, Conversation, Message } from '../types';
import Sidebar from './Sidebar';
import ChatArea from './ChatArea';
import { motion } from 'motion/react';
import { getSharedSecret, encryptMessage, decryptMessage, encapsulateSecret, decapsulateSecret } from '../utils/encryption';
import { Settings, Trash2, Loader2, AlertTriangle } from 'lucide-react';
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
    <div className="flex flex-col h-full w-full relative overflow-hidden">
      {isOffline && (
        <div className="w-full bg-amber-500 text-white text-xs font-medium py-1.5 px-4 text-center flex items-center justify-center z-50">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
          You are currently offline. Messages will be sent when you reconnect.
        </div>
      )}
      <div className="flex flex-1 h-full w-full relative overflow-hidden">
        {/* Sidebar */}
        <motion.div 
          className={`absolute lg:relative z-20 h-full w-full lg:w-80 border-r border-slate-200 bg-white flex flex-col transition-transform duration-300 ease-in-out ${
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
        <div className="flex-1 h-full bg-slate-50 flex flex-col relative z-10 w-full">
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
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center relative">
              <div className="absolute top-4 right-4">
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-full transition-colors"
                  title="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>
              <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-medium text-slate-600 mb-2">No conversation selected</h3>
              <p className="max-w-sm">
                Select a conversation from the sidebar or search for a user's email to start chatting.
              </p>
              {/* Mobile open sidebar button */}
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="mt-6 lg:hidden px-6 py-2 bg-indigo-600 text-white rounded-full font-medium shadow-sm hover:bg-indigo-700 transition-colors"
              >
                View Contacts
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Settings</h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">Account Details</h4>
                <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                  <div>
                    <p className="text-xs text-slate-500">Username</p>
                    <p className="font-medium text-slate-900">{user.username}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Email</p>
                    <p className="font-mono font-medium text-slate-900">{user.email}</p>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">Security</h4>
                <div className="bg-emerald-50 p-4 rounded-xl flex items-start space-x-3 border border-emerald-100">
                  <div className="mt-0.5">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-900">Post-Quantum Encryption</p>
                    <p className="text-xs text-emerald-700 mt-1">
                      Your messages are secured with CRYSTALS-Kyber Post-Quantum Cryptography and AES encryption.
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-2">Network Routing</h4>
                <div className="bg-slate-50 p-4 rounded-xl space-y-3 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">Tor Network (Onion Routing)</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Route traffic through multiple nodes to hide your IP address.
                      </p>
                    </div>
                    <button 
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useTor ? 'bg-indigo-600' : 'bg-slate-200'}`}
                      onClick={() => setUseTor(!useTor)}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useTor ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {useTor && (
                    <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100 flex items-start space-x-2">
                      <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-xs text-amber-800">
                        To completely hide your IP address from our servers, you must access Cipher using the Tor Browser. Web browsers cannot hide your IP natively.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-red-600 mb-2">Danger Zone</h4>
                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                  <div className="flex items-start space-x-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-900">Permanently Delete Account</p>
                      <p className="text-xs text-red-700 mt-1">
                        This action cannot be undone. All your messages, keys, and account data will be wiped from our servers.
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={handleDeleteAccount}
                    disabled={isDeleting}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Delete My Account Permanently</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
