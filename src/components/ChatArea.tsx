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
    <div className="flex flex-col h-full w-full bg-bg-soothing relative z-10">
      {/* Header */}
      <div className="h-20 border-b border-secondary-blue/30 bg-white flex items-center justify-between px-6 sm:px-8 shrink-0 z-20">
        <div className="flex items-center space-x-5">
          <button
            onClick={onBack}
            className="lg:hidden p-2 -ml-2 text-text-muted hover:bg-bg-soothing rounded-full transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-secondary-blue flex items-center justify-center text-primary-navy font-bold text-xl shadow-sm">
              {conversation.username.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-emerald-400 border-2 border-white rounded-full"></div>
          </div>
          <div>
            <h2 className="font-semibold text-primary-navy leading-tight text-lg">{conversation.username}</h2>
            <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest flex items-center mt-0.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-2"></span>
              Active Now
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-text-muted">
          <button className="p-2.5 hover:bg-bg-soothing hover:text-primary-navy rounded-xl transition-all hidden sm:block">
            <Phone className="w-5 h-5" />
          </button>
          <button className="p-2.5 hover:bg-bg-soothing hover:text-primary-navy rounded-xl transition-all hidden sm:block">
            <Video className="w-5 h-5" />
          </button>
          <button 
            onClick={onOpenSettings}
            className="p-2.5 hover:bg-bg-soothing hover:text-primary-navy rounded-xl transition-all"
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
              <span className="px-4 py-1.5 bg-white/50 text-text-muted text-[10px] font-bold uppercase tracking-widest rounded-full border border-secondary-blue/30 backdrop-blur-sm">
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
                    <div className={`w-9 h-9 rounded-xl bg-secondary-blue flex items-center justify-center text-primary-navy font-semibold text-sm shrink-0 transition-opacity duration-300 ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                      {conversation.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  {isMine && hoveredMessageId === msg.id && (
                    <button 
                      onClick={() => onDeleteMessage(msg.id)}
                      className="p-2 text-text-muted hover:text-red-500 hover:bg-red-50 rounded-xl transition-all mb-1 opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  <div
                    className={`max-w-[80%] sm:max-w-[70%] rounded-[1.5rem] px-5 py-3.5 shadow-[0_2px_10px_rgb(0,0,0,0.01)] ${
                      isMine
                        ? 'bg-primary-navy text-white rounded-br-none'
                        : 'bg-white text-text-main border border-secondary-blue/30 rounded-bl-none'
                    }`}
                  >
                    <p className="text-[15px] leading-relaxed break-words font-medium">{msg.content}</p>
                    <div
                      className={`text-[10px] mt-2 flex items-center justify-end font-semibold tracking-wide ${
                        isMine ? 'text-white/60' : 'text-text-muted'
                      }`}
                    >
                      {format(new Date(msg.created_at), 'h:mm a')}
                      {isMine && (
                        <svg className="w-3.5 h-3.5 ml-1.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  
                  {!isMine && hoveredMessageId === msg.id && (
                    <button 
                      onClick={() => onDeleteMessage(msg.id)}
                      className="p-2 text-text-muted hover:text-red-500 hover:bg-red-50 rounded-xl transition-all mb-1 opacity-0 group-hover:opacity-100"
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
      <div className="p-6 bg-white border-t border-secondary-blue/30 shrink-0">
        <form
          onSubmit={handleSubmit}
          className="flex items-center space-x-4 max-w-5xl mx-auto"
        >
          <div className="flex items-center space-x-1 text-text-muted">
            <button type="button" className="p-2.5 hover:bg-bg-soothing hover:text-primary-navy rounded-xl transition-all hidden sm:block">
              <Paperclip className="w-5 h-5" />
            </button>
            <button type="button" className="p-2.5 hover:bg-bg-soothing hover:text-primary-navy rounded-xl transition-all hidden sm:block">
              <ImageIcon className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 relative bg-bg-soothing rounded-2xl border border-secondary-blue/50 focus-within:border-primary-navy/30 focus-within:ring-4 focus-within:ring-primary-navy/5 transition-all">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Write a message..."
              className="w-full bg-transparent border-none py-4 pl-5 pr-14 focus:ring-0 text-text-main placeholder-text-muted outline-none font-medium"
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-text-muted hover:text-primary-navy rounded-xl transition-all">
              <Smile className="w-5 h-5" />
            </button>
          </div>
          
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="p-4 bg-primary-navy text-white rounded-2xl hover:bg-primary-navy/90 focus:outline-none focus:ring-4 focus:ring-primary-navy/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm flex-shrink-0 active:scale-95"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
