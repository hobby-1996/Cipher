import React, { useState, useEffect } from 'react';
import { User, Conversation } from '../types';
import { Search, LogOut, MessageSquare, User as UserIcon, Settings, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

interface SidebarProps {
  user: User;
  conversations: Conversation[];
  activeConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
  onStartConversation: (user: User) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  onDeleteConversation: (conversationId: string) => void;
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
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [showDeleteMenu, setShowDeleteMenu] = useState<string | null>(null);

  const handleTouchStart = (convId: string) => {
    const timer = setTimeout(() => {
      setShowDeleteMenu(convId);
    }, 700); // 700ms for long press
    setLongPressTimer(timer);
  };

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  useEffect(() => {
    const handleClickOutside = () => setShowDeleteMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

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
      // Simple search by email or username prefix
      const qEmail = query(
        usersRef, 
        where('email', '>=', searchStr),
        where('email', '<=', searchStr + '\uf8ff'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(qEmail);
      const users: User[] = [];
      querySnapshot.forEach((doc) => {
        if (doc.id !== user.id) {
          users.push(doc.data() as User);
        }
      });
      
      setSearchResults(users);
    } catch (err) {
      console.error('Failed to search users', err);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white border-r border-secondary-blue/30">
      {/* Header */}
      <div className="p-6 border-b border-secondary-blue/20 flex items-center justify-between bg-white">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-navy flex items-center justify-center shadow-sm">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-primary-navy leading-tight tracking-tight text-lg">Cipher</h2>
            <p className="text-xs text-text-muted font-medium truncate max-w-[120px]">{user.username}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenSettings}
            className="p-2.5 text-text-muted hover:text-primary-navy hover:bg-secondary-blue/50 rounded-xl transition-all"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onLogout}
            className="p-2.5 text-text-muted hover:text-primary-navy hover:bg-secondary-blue/50 rounded-xl transition-all"
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
            <Search className="h-4 w-4 text-text-muted" />
          </div>
          <input
            type="text"
            className="block w-full pl-11 pr-4 py-3 border border-secondary-blue/50 rounded-2xl text-sm focus:ring-2 focus:ring-primary-navy/5 focus:border-primary-navy bg-bg-soothing transition-all outline-none placeholder-text-muted"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {searchQuery.trim() ? (
          <div className="space-y-2">
            <h3 className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
              Search Results
            </h3>
            {isSearching ? (
              <div className="p-4 text-center text-sm text-text-muted">Searching...</div>
            ) : searchResults.length > 0 ? (
              searchResults.map((resultUser) => (
                <button
                  key={resultUser.id}
                  onClick={() => {
                    onStartConversation(resultUser);
                    setSearchQuery('');
                  }}
                  className="w-full text-left p-4 flex items-center space-x-4 hover:bg-bg-soothing rounded-2xl transition-all mb-1"
                >
                  <div className="w-11 h-11 rounded-2xl bg-secondary-blue flex items-center justify-center text-primary-navy font-semibold">
                    {resultUser.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-primary-navy truncate">
                      {resultUser.username}
                    </p>
                    <p className="text-xs text-text-muted font-medium truncate">
                      {resultUser.email}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-text-muted">No users found</div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
              Recent Conversations
            </h3>
            {conversations.length > 0 ? (
              conversations.map((conv) => (
                <div key={conv.id} className="relative group">
                  <button
                    onClick={() => {
                      if (!showDeleteMenu) onSelectConversation(conv);
                    }}
                    onMouseDown={() => handleTouchStart(conv.id)}
                    onMouseUp={handleTouchEnd}
                    onMouseLeave={handleTouchEnd}
                    onTouchStart={() => handleTouchStart(conv.id)}
                    onTouchEnd={handleTouchEnd}
                    className={`w-full text-left p-4 flex items-center space-x-4 rounded-2xl transition-all mb-1 ${
                      activeConversation?.id === conv.id
                        ? 'bg-secondary-blue/50 border border-secondary-blue'
                        : 'hover:bg-bg-soothing border border-transparent'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-semibold shrink-0 transition-all ${
                      activeConversation?.id === conv.id
                        ? 'bg-primary-navy text-white shadow-sm'
                        : 'bg-secondary-blue text-primary-navy'
                    }`}>
                      {conv.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <p className={`text-sm font-semibold truncate ${
                          activeConversation?.id === conv.id ? 'text-primary-navy' : 'text-text-main'
                        }`}>
                          {conv.username}
                        </p>
                        {conv.last_message_time && (
                          <p className="text-[10px] text-text-muted font-medium shrink-0 ml-2">
                            {formatDistanceToNow(new Date(conv.last_message_time), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                      <p className={`text-xs truncate font-medium ${
                        activeConversation?.id === conv.id ? 'text-primary-navy/70' : 'text-text-muted'
                      }`}>
                        {conv.last_message || 'Start a conversation'}
                      </p>
                    </div>
                  </button>

                  {showDeleteMenu === conv.id && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteConversation(conv.id);
                          setShowDeleteMenu(null);
                        }}
                        className="bg-red-500 text-white p-2.5 rounded-xl shadow-lg flex items-center space-x-2 hover:bg-red-600 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-xs font-bold">Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="p-10 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-bg-soothing rounded-3xl flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-secondary-blue" />
                </div>
                <p className="text-sm text-text-muted font-medium">Your inbox is empty.</p>
                <p className="text-xs text-text-muted/70 mt-1">Find a friend to start chatting.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
