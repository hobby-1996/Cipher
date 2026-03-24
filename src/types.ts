export interface User {
  id: string;
  username: string;
  email: string;
  public_key?: string;
  created_at: string;
  last_active?: string;
  isPremium?: boolean;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  ct?: string; // Ciphertext for PQC
  expires_at?: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  username: string;
  email: string;
  public_key?: string;
  last_message: string | null;
  last_message_time: string | null;
  is_pinned?: boolean;
  is_archived?: boolean;
}
