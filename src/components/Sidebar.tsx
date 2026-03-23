import React, { useState, useEffect } from 'react';
import { User, Conversation } from '../types';
import { Search, LogOut, MessageSquare, User as UserIcon, Settings } from 'lucide-react';
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
}

export default function Sidebar({
  user,
  conversations,
  activeConversation,
  onSelectConversation,
  onStartConversation,
  onLogout,
  onOpenSettings,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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
    <div className="flex flex-col h-full w-full bg-white border-r border-slate-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 leading-tight tracking-tight">Cipher</h2>
            <p className="text-xs text-slate-500 font-medium truncate max-w-[100px]">{user.username}</p>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={onOpenSettings}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onLogout}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-slate-100">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50 focus:bg-white transition-colors outline-none placeholder-slate-400"
            placeholder="Search email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {searchQuery.trim() ? (
          <div className="p-2">
            <h3 className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Search Results
            </h3>
            {isSearching ? (
              <div className="p-4 text-center text-sm text-slate-500">Searching...</div>
            ) : searchResults.length > 0 ? (
              searchResults.map((resultUser) => (
                <button
                  key={resultUser.id}
                  onClick={() => {
                    onStartConversation(resultUser);
                    setSearchQuery('');
                  }}
                  className="w-full text-left p-3 flex items-center space-x-3 hover:bg-slate-50 rounded-xl transition-colors mb-1"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium">
                    {resultUser.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {resultUser.username}
                    </p>
                    <p className="text-xs text-slate-500 font-mono truncate">
                      {resultUser.email}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-slate-500">No users found</div>
            )}
          </div>
        ) : (
          <div className="p-2">
            <h3 className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Recent Chats
            </h3>
            {conversations.length > 0 ? (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv)}
                  className={`w-full text-left p-3 flex items-center space-x-3 rounded-xl transition-colors mb-1 ${
                    activeConversation?.id === conv.id
                      ? 'bg-indigo-50 border border-indigo-100'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium shrink-0 ${
                    activeConversation?.id === conv.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {conv.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <p className={`text-sm font-medium truncate ${
                        activeConversation?.id === conv.id ? 'text-indigo-900' : 'text-slate-900'
                      }`}>
                        {conv.username}
                      </p>
                      {conv.last_message_time && (
                        <p className="text-xs text-slate-400 shrink-0 ml-2">
                          {formatDistanceToNow(new Date(conv.last_message_time), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    <p className={`text-sm truncate ${
                      activeConversation?.id === conv.id ? 'text-indigo-700/80' : 'text-slate-500'
                    }`}>
                      {conv.last_message || 'No messages yet'}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-8 text-center flex flex-col items-center">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                  <MessageSquare className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-sm text-slate-500">No conversations yet.</p>
                <p className="text-xs text-slate-400 mt-1">Search for a user to start chatting.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
