import React, { useState, useRef, useEffect } from 'react';
import { User, Conversation, Message } from '../types';
import { Send, Phone, Video, MoreVertical, ArrowLeft, Image as ImageIcon, Paperclip, Smile, Settings, Trash2, ShieldCheck, Flame, Gamepad2 } from 'lucide-react';
import { format, isAfter } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { getSafetyNumber } from '../utils/encryption';

interface ChatAreaProps {
  user: User;
  conversation: Conversation;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onBack: () => void;
  onOpenSettings: () => void;
  onStartGame?: () => void;
  onJoinGame?: (gameId: string) => void;
}

export default function ChatArea({
  user,
  conversation,
  messages,
  onSendMessage,
  onDeleteMessage,
  onBack,
  onOpenSettings,
  onStartGame,
  onJoinGame,
}: ChatAreaProps) {
  const [newMessage, setNewMessage] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [showSafetyNumber, setShowSafetyNumber] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const safetyNumber = conversation.id && conversation.id !== 'sealed' ? getSafetyNumber(conversation.id) : 'N/A';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage);
      setNewMessage('');
    }
  };

  const groupMessagesByDate = () => {
    const groups: { [key: string]: Message[] } = {};
    messages.forEach((msg) => {
      const date = format(new Date(msg.created_at), 'MMMM d, yyyy');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(msg);
    });
    return groups;
  };

  const groupedMessages = groupMessagesByDate();

  return (
    <div className="flex flex-col h-full w-full bg-bg-slate relative z-10">
      {/* Header */}
      <div className="h-20 border-b border-white/5 bg-primary-navy flex items-center justify-between px-6 sm:px-8 shrink-0 z-20">
        <div className="flex items-center space-x-5">
          <button
            onClick={onBack}
            className="lg:hidden p-2 -ml-2 text-text-offwhite/40 hover:bg-white/5 rounded-full transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-accent-teal flex items-center justify-center text-primary-navy font-bold text-xl shadow-lg">
              {conversation.username.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-secure-green border-2 border-primary-navy rounded-full shadow-sm"></div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <h2 className="font-bold text-text-offwhite leading-tight text-lg">{conversation.username}</h2>
              <button 
                onClick={() => setShowSafetyNumber(!showSafetyNumber)}
                className="text-secure-green hover:text-secure-green/80 transition-colors"
                title="Verify Safety Number"
              >
                <ShieldCheck className="w-4 h-4" />
              </button>
            </div>
            {showSafetyNumber ? (
              <p className="text-[9px] font-mono text-text-offwhite/40 tracking-tighter bg-white/5 px-2 py-0.5 rounded border border-white/10">
                SN: {safetyNumber}
              </p>
            ) : (
              <p className="text-[10px] text-secure-green font-bold uppercase tracking-widest flex items-center mt-0.5">
                <span className="w-1.5 h-1.5 bg-secure-green rounded-full mr-2 animate-pulse"></span>
                Active Now
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2 text-text-offwhite/40">
          <button 
            onClick={onStartGame}
            className="p-2.5 hover:bg-white/5 hover:text-accent-teal rounded-xl transition-all"
            title="Play Ping Pong"
          >
            <Gamepad2 className="w-5 h-5" />
          </button>
          <button className="p-2.5 hover:bg-white/5 hover:text-accent-teal rounded-xl transition-all hidden sm:block">
            <Phone className="w-5 h-5" />
          </button>
          <button className="p-2.5 hover:bg-white/5 hover:text-accent-teal rounded-xl transition-all hidden sm:block">
            <Video className="w-5 h-5" />
          </button>
          <button 
            onClick={onOpenSettings}
            className="p-2.5 hover:bg-white/5 hover:text-accent-teal rounded-xl transition-all"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-8">
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date} className="space-y-8">
            <div className="flex justify-center">
              <span className="px-4 py-1.5 bg-primary-navy/40 text-text-offwhite/30 text-[10px] font-bold uppercase tracking-widest rounded-full border border-white/5 backdrop-blur-sm">
                {date}
              </span>
            </div>
            {msgs.map((msg, index) => {
              const isMine = msg.sender_id === user.id;
              const showAvatar = !isMine && (index === 0 || msgs[index - 1].sender_id === user.id);
              
              return (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'} items-end space-x-3 group`}
                  onMouseEnter={() => setHoveredMessageId(msg.id)}
                  onMouseLeave={() => setHoveredMessageId(null)}
                >
                  {!isMine && (
                    <div className={`w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-accent-teal font-bold text-sm shrink-0 transition-opacity duration-300 ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                      {conversation.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  {isMine && hoveredMessageId === msg.id && (
                    <button 
                      onClick={() => onDeleteMessage(msg.id)}
                      className="p-2 text-text-offwhite/20 hover:text-error-red hover:bg-error-red/10 rounded-xl transition-all mb-1 opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  <div
                    className={`max-w-[80%] sm:max-w-[70%] rounded-[1.5rem] px-5 py-3.5 shadow-xl relative ${
                      isMine
                        ? 'bg-accent-teal text-primary-navy rounded-br-none'
                        : 'bg-white/5 text-text-offwhite border border-white/5 rounded-bl-none backdrop-blur-md'
                    }`}
                  >
                    {msg.expires_at && (
                      <div className="absolute -top-2 -right-2 bg-highlight-orange text-primary-navy p-1 rounded-full shadow-lg">
                        <Flame className="w-3 h-3" />
                      </div>
                    )}
                    {msg.content.startsWith('[GAME_INVITE:') ? (
                      <div className="flex flex-col items-center space-y-3 p-2">
                        <span className="text-3xl">🏓</span>
                        <span className="font-bold text-center">Ping Pong Invitation</span>
                        <button 
                          onClick={() => onJoinGame && onJoinGame(msg.content.replace('[GAME_INVITE:', '').replace(']', ''))}
                          className={`px-6 py-2 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg transition-all ${isMine ? 'bg-primary-navy text-accent-teal hover:bg-primary-navy/80' : 'bg-accent-teal text-primary-navy hover:bg-accent-teal/90'}`}
                        >
                          Join Game
                        </button>
                      </div>
                    ) : (
                      <p className="text-[15px] leading-relaxed break-words font-bold">{msg.content}</p>
                    )}
                    <div
                      className={`text-[10px] mt-2 flex items-center justify-between font-bold tracking-wide ${
                        isMine ? 'text-primary-navy/60' : 'text-text-offwhite/30'
                      }`}
                    >
                      <div className="flex items-center space-x-1">
                        {msg.expires_at && (
                          <span className="text-[9px] uppercase tracking-tighter opacity-80">
                            Burns {format(new Date(msg.expires_at), 'h:mm a')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center">
                        {format(new Date(msg.created_at), 'h:mm a')}
                        {isMine && (
                          <svg className="w-3.5 h-3.5 ml-1.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {!isMine && hoveredMessageId === msg.id && (
                    <button 
                      onClick={() => onDeleteMessage(msg.id)}
                      className="p-2 text-text-offwhite/20 hover:text-error-red hover:bg-error-red/10 rounded-xl transition-all mb-1 opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-primary-navy border-t border-white/5 shrink-0">
        <form
          onSubmit={handleSubmit}
          className="flex items-center space-x-4 max-w-5xl mx-auto"
        >
          <div className="flex items-center space-x-1 text-text-offwhite/30">
            <button type="button" className="p-2.5 hover:bg-white/5 hover:text-accent-teal rounded-xl transition-all hidden sm:block">
              <Paperclip className="w-5 h-5" />
            </button>
            <button type="button" className="p-2.5 hover:bg-white/5 hover:text-accent-teal rounded-xl transition-all hidden sm:block">
              <ImageIcon className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 relative bg-white/5 rounded-2xl border border-white/10 focus-within:border-accent-teal/30 focus-within:ring-4 focus-within:ring-accent-teal/5 transition-all">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Write a message..."
              className="w-full bg-transparent border-none py-4 pl-5 pr-14 focus:ring-0 text-text-offwhite placeholder-text-offwhite/20 outline-none font-bold"
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-text-offwhite/20 hover:text-accent-teal rounded-xl transition-all">
              <Smile className="w-5 h-5" />
            </button>
          </div>
          
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="p-4 bg-accent-teal text-primary-navy rounded-2xl hover:bg-accent-teal/90 focus:outline-none focus:ring-4 focus:ring-accent-teal/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg flex-shrink-0 active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
