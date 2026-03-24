import React, { useState, useEffect } from 'react';
import { User, Conversation } from '../types';
import { Search, LogOut, MessageSquare, Settings, Trash2, Pin, Archive, MoreVertical, Shield, Flame } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

interface SidebarProps {
  user: User;
  conversations: Conversation[];
  activeConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
  onStartConversation: (user: User) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  onDeleteConversation: (conversationId: string) => void;
  onTogglePin: (userId: string) => void;
  onToggleArchive: (userId: string) => void;
}

export default function Sidebar({
  user,
  conversations,
  activeConversation,
  onSelectConversation,
  onStartConversation,
  onLogout,
  onOpenSettings,
  onDeleteConversation,
  onTogglePin,
  onToggleArchive,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim()) {
        searchUsers(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const searchUsers = async (searchStr: string) => {
    setIsSearching(true);
    try {
      const usersRef = collection(db, 'users');
      
      // Exact match by email
      const qEmail = query(
        usersRef, 
        where('email', '==', searchStr),
        limit(1)
      );
      
      // Exact match by username
      const qUsername = query(
        usersRef,
        where('username', '==', searchStr),
        limit(1)
      );
      
      const [emailSnapshot, usernameSnapshot] = await Promise.all([
        getDocs(qEmail),
        getDocs(qUsername)
      ]);
      
      const usersMap = new Map<string, User>();
      
      emailSnapshot.forEach((doc) => {
        if (doc.id !== user.id) {
          usersMap.set(doc.id, doc.data() as User);
        }
      });
      
      usernameSnapshot.forEach((doc) => {
        if (doc.id !== user.id) {
          usersMap.set(doc.id, doc.data() as User);
        }
      });
      
      setSearchResults(Array.from(usersMap.values()));
    } catch (err) {
      console.error('Failed to search users', err);
    } finally {
      setIsSearching(false);
    }
  };

  const filteredConversations = conversations.filter(c => {
    const matchesSearch = c.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (c.last_message?.toLowerCase().includes(searchQuery.toLowerCase()));
    const isArchived = c.is_archived;
    return matchesSearch && (showArchived ? isArchived : !isArchived);
  });

  return (
    <div className="flex flex-col h-full w-full bg-primary-navy border-r border-white/5 transition-colors">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-primary-navy">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-accent-teal flex items-center justify-center shadow-lg">
            <MessageSquare className="w-6 h-6 text-primary-navy" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-bold text-text-offwhite leading-tight tracking-tight text-lg">Cipher</h2>
              {user.isPremium ? (
                <div className="flex items-center space-x-1 px-2 py-0.5 bg-accent-teal/20 text-accent-teal rounded-md text-[8px] font-black uppercase tracking-wider border border-accent-teal/30">
                  <Flame className="w-2.5 h-2.5 fill-accent-teal" />
                  <span>Pro</span>
                </div>
              ) : (
                <div className="px-2 py-0.5 bg-white/5 text-text-offwhite/40 rounded-md text-[8px] font-black uppercase tracking-wider border border-white/10">
                  Free
                </div>
              )}
            </div>
            <p className="text-[10px] text-text-offwhite/40 font-bold uppercase tracking-widest truncate max-w-[120px]">{user.username}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenSettings}
            className="p-2.5 text-text-offwhite/40 hover:text-accent-teal hover:bg-white/5 rounded-xl transition-all"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onLogout}
            className="p-2.5 text-text-offwhite/40 hover:text-highlight-orange hover:bg-white/5 rounded-xl transition-all"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-text-offwhite/30" />
          </div>
          <input
            type="text"
            className="block w-full pl-11 pr-4 py-3 border border-white/10 rounded-2xl text-sm focus:ring-2 focus:ring-accent-teal/20 focus:border-accent-teal bg-white/5 text-text-offwhite transition-all outline-none placeholder-text-offwhite/20"
            placeholder="Enter full contact or number to add..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Toggle Archived */}
      <div className="px-6 pb-2">
        <button 
          onClick={() => setShowArchived(!showArchived)}
          className="text-[10px] font-bold text-text-offwhite/30 uppercase tracking-widest hover:text-accent-teal transition-colors flex items-center space-x-2"
        >
          <Archive className="w-3 h-3" />
          <span>{showArchived ? 'Show Active Chats' : 'Show Archived Chats'}</span>
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {searchQuery.trim() && searchResults.length > 0 ? (
          <div className="space-y-2">
            <h3 className="px-4 py-2 text-[10px] font-bold text-text-offwhite/30 uppercase tracking-widest">
              Search Results
            </h3>
            {searchResults.map((resultUser) => (
              <button
                key={resultUser.id}
                onClick={() => {
                  onStartConversation(resultUser);
                  setSearchQuery('');
                }}
                className="w-full text-left p-4 flex items-center space-x-4 hover:bg-white/5 rounded-2xl transition-all mb-1"
              >
                <div className="w-11 h-11 rounded-2xl bg-accent-teal flex items-center justify-center text-primary-navy font-bold">
                  {resultUser.username.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text-offwhite truncate">
                    {resultUser.username}
                  </p>
                  <p className="text-xs text-text-offwhite/40 font-medium truncate">
                    {resultUser.email}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="px-4 py-2 text-[10px] font-bold text-text-offwhite/30 uppercase tracking-widest">
              {showArchived ? 'Archived Conversations' : 'Recent Conversations'}
            </h3>
            {filteredConversations.length > 0 ? (
              filteredConversations.map((conv) => (
                <div key={conv.id} className="relative group overflow-hidden rounded-2xl mb-1">
                  {/* Background Delete Action */}
                  <div className="absolute inset-0 bg-error-red flex items-center justify-end pr-6 rounded-2xl">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      className="flex flex-col items-center space-y-1 text-white hover:scale-110 transition-transform"
                    >
                      <Trash2 className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Delete</span>
                    </button>
                  </div>

                  <motion.div
                    drag="x"
                    dragConstraints={{ left: -100, right: 0 }}
                    dragElastic={0.05}
                    whileTap={{ cursor: 'grabbing' }}
                    onClick={() => onSelectConversation(conv)}
                    className={`relative z-10 w-full text-left p-4 flex items-center space-x-4 rounded-2xl transition-all cursor-pointer ${
                      activeConversation?.id === conv.id
                        ? 'bg-accent-teal text-primary-navy shadow-lg'
                        : 'bg-primary-navy hover:bg-white/5 text-text-offwhite/70 border border-transparent'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0 transition-all ${
                      activeConversation?.id === conv.id
                        ? 'bg-primary-navy text-accent-teal shadow-inner'
                        : 'bg-white/5 text-accent-teal'
                    }`}>
                      {conv.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <div className="flex items-center space-x-1 truncate">
                          <p className={`text-sm font-bold truncate ${
                            activeConversation?.id === conv.id ? 'text-primary-navy' : 'text-text-offwhite'
                          }`}>
                            {conv.username}
                          </p>
                          {conv.is_pinned && <Pin className={`w-3 h-3 fill-current ${activeConversation?.id === conv.id ? 'text-primary-navy' : 'text-accent-teal'}`} />}
                        </div>
                        {conv.last_message_time && (
                          <p className={`text-[10px] font-bold shrink-0 ml-2 ${activeConversation?.id === conv.id ? 'text-primary-navy/60' : 'text-text-offwhite/30'}`}>
                            {formatDistanceToNow(new Date(conv.last_message_time), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                      <p className={`text-xs truncate font-medium ${
                        activeConversation?.id === conv.id ? 'text-primary-navy/70' : 'text-text-offwhite/40'
                      }`}>
                        {conv.last_message || 'Start a conversation'}
                      </p>
                    </div>
                    
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowMenu(showMenu === conv.id ? null : conv.id);
                        }}
                        className={`p-1 rounded-lg ${activeConversation?.id === conv.id ? 'hover:bg-primary-navy/10' : 'hover:bg-white/10'}`}
                        aria-label="More options"
                      >
                        <MoreVertical className={`w-4 h-4 ${activeConversation?.id === conv.id ? 'text-primary-navy/60' : 'text-text-offwhite/30'}`} />
                      </button>
                    </div>
                  </motion.div>

                  {showMenu === conv.id && (
                    <div className="absolute right-4 top-12 z-50 bg-primary-navy border border-white/10 rounded-xl shadow-2xl py-2 min-w-[140px] backdrop-blur-xl">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePin(conv.id);
                          setShowMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-xs font-bold text-text-offwhite hover:bg-white/5 flex items-center space-x-2"
                      >
                        <Pin className="w-3.5 h-3.5 text-accent-teal" />
                        <span>{conv.is_pinned ? 'Unpin' : 'Pin Chat'}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleArchive(conv.id);
                          setShowMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-xs font-bold text-text-offwhite hover:bg-white/5 flex items-center space-x-2"
                      >
                        <Archive className="w-3.5 h-3.5 text-highlight-orange" />
                        <span>{conv.is_archived ? 'Unarchive' : 'Archive Chat'}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(conv.id);
                          setShowMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-xs font-bold text-error-red hover:bg-error-red/10 flex items-center space-x-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Chat</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="p-10 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-white/10" />
                </div>
                <p className="text-sm text-text-offwhite/30 font-medium">No conversations found.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
