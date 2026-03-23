import React, { useState, useRef, useEffect } from 'react';
import { User, Conversation, Message } from '../types';
import { Send, Phone, Video, MoreVertical, ArrowLeft, Image as ImageIcon, Paperclip, Smile, Settings, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface ChatAreaProps {
  user: User;
  conversation: Conversation;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onBack: () => void;
  onOpenSettings: () => void;
}

export default function ChatArea({
  user,
  conversation,
  messages,
  onSendMessage,
  onDeleteMessage,
  onBack,
  onOpenSettings,
}: ChatAreaProps) {
  const [newMessage, setNewMessage] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className="flex flex-col h-full w-full bg-slate-50 relative z-10">
      {/* Header */}
      <div className="h-14 sm:h-16 border-b border-slate-200 bg-white flex items-center justify-between px-3 sm:px-6 shrink-0 shadow-sm z-20">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <button
            onClick={onBack}
            className="lg:hidden p-2 -ml-1 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="relative">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-base sm:text-lg shadow-inner">
              {conversation.username.charAt(0).toUpperCase()}
            </div>
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 leading-tight truncate text-sm sm:text-base">{conversation.username}</h2>
            <p className="text-[10px] sm:text-xs text-slate-500 font-mono flex items-center">
              <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-emerald-500 rounded-full mr-1 sm:mr-1.5"></span>
              Online
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1 sm:space-x-2 text-slate-400">
          <button className="p-2 hover:bg-slate-100 hover:text-indigo-600 rounded-full transition-colors hidden sm:block">
            <Phone className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-slate-100 hover:text-indigo-600 rounded-full transition-colors hidden sm:block">
            <Video className="w-5 h-5" />
          </button>
          <button 
            onClick={onOpenSettings}
            className="p-2 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-[#f8fafc]">
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date} className="space-y-6">
            <div className="flex justify-center">
              <span className="px-3 py-1 bg-slate-200/60 text-slate-500 text-xs font-medium rounded-full backdrop-blur-sm">
                {date}
              </span>
            </div>
            {msgs.map((msg, index) => {
              const isMine = msg.sender_id === user.id;
              const showAvatar = !isMine && (index === 0 || msgs[index - 1].sender_id === user.id);
              
              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'} items-end space-x-2 group`}
                  onMouseEnter={() => setHoveredMessageId(msg.id)}
                  onMouseLeave={() => setHoveredMessageId(null)}
                >
                  {!isMine && (
                    <div className={`w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium text-sm shrink-0 ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                      {conversation.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  {isMine && hoveredMessageId === msg.id && (
                    <button 
                      onClick={() => onDeleteMessage(msg.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors mb-2 opacity-0 group-hover:opacity-100"
                      title="Delete for me"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  <div
                    className={`max-w-[85%] sm:max-w-[65%] rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 shadow-sm ${
                      isMine
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'
                    }`}
                  >
                    <p className="text-sm sm:text-[15px] leading-relaxed break-words">{msg.content}</p>
                    <div
                      className={`text-[10px] mt-1 flex items-center justify-end ${
                        isMine ? 'text-indigo-200' : 'text-slate-400'
                      }`}
                    >
                      {format(new Date(msg.created_at), 'h:mm a')}
                      {isMine && (
                        <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  
                  {!isMine && hoveredMessageId === msg.id && (
                    <button 
                      onClick={() => onDeleteMessage(msg.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors mb-2 opacity-0 group-hover:opacity-100"
                      title="Delete for me"
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
      <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0 pb-safe">
        <form
          onSubmit={handleSubmit}
          className="flex items-end space-x-2 max-w-4xl mx-auto"
        >
          <div className="flex items-center space-x-1 sm:space-x-2 text-slate-400 pb-1.5 sm:pb-2">
            <button type="button" className="p-2 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors hidden sm:block">
              <Paperclip className="w-5 h-5" />
            </button>
            <button type="button" className="p-2 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors hidden sm:block">
              <ImageIcon className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 relative bg-slate-50 rounded-2xl border border-slate-200 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="w-full bg-transparent border-none py-2.5 sm:py-3 pl-4 pr-10 sm:pr-12 focus:ring-0 text-slate-900 placeholder-slate-400 outline-none text-sm sm:text-base"
            />
            <button type="button" className="absolute right-1.5 bottom-1.5 sm:right-2 sm:bottom-2 p-1.5 text-slate-400 hover:text-slate-600 rounded-full transition-colors">
              <Smile className="w-5 h-5" />
            </button>
          </div>
          
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="p-2.5 sm:p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex-shrink-0"
          >
            <Send className="w-5 h-5 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
