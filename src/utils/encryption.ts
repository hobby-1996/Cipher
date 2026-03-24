import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';
import { MlKem1024 } from 'crystals-kyber-js';

// Helper to convert Uint8Array to Base64 string
export const uint8ArrayToBase64 = (u8Arr: Uint8Array): string => {
  let binary = '';
  const len = u8Arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(u8Arr[i]);
  }
  return window.btoa(binary);
};

// Helper to convert Base64 string to Uint8Array
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// Generate Kyber keypair
export const generatePQCKeyPair = async () => {
  const kem = new MlKem1024();
  const [pk, sk] = await kem.generateKeyPair();
  return {
    publicKey: uint8ArrayToBase64(pk),
    secretKey: uint8ArrayToBase64(sk)
  };
};

// Generate a human-readable safety number (fingerprint) from a public key
export const getSafetyNumber = (publicKeyBase64: string): string => {
  // Simple hash-like fingerprint: take first 32 chars of base64 and group them
  const clean = publicKeyBase64.replace(/[^a-zA-Z0-9]/g, '').slice(0, 30);
  const chunks = [];
  for (let i = 0; i < clean.length; i += 5) {
    chunks.push(clean.slice(i, i + 5));
  }
  return chunks.join('-');
};

// Encapsulate secret using recipient's public key
export const encapsulateSecret = async (recipientPublicKeyBase64: string) => {
  const kem = new MlKem1024();
  const pk = base64ToUint8Array(recipientPublicKeyBase64);
  const [ct, ss] = await kem.encap(pk);
  return {
    ciphertext: uint8ArrayToBase64(ct),
    sharedSecret: uint8ArrayToBase64(ss)
  };
};

// Decapsulate secret using own secret key
export const decapsulateSecret = async (ciphertextBase64: string, secretKeyBase64: string) => {
  const kem = new MlKem1024();
  const ct = base64ToUint8Array(ciphertextBase64);
  const sk = base64ToUint8Array(secretKeyBase64);
  const ss = await kem.decap(ct, sk);
  return uint8ArrayToBase64(ss);
};

// A simple utility to encrypt and decrypt messages between two users
// In a real-world app, you would use a secure key exchange mechanism (like Diffie-Hellman)
// For this demo, we derive a shared secret from the two user IDs.
export const getSharedSecret = (userId1: string, userId2: string) => {
  const sortedIds = [userId1, userId2].sort();
  return sortedIds.join('_');
};

export const encryptMessage = (message: string, secret: string) => {
  return AES.encrypt(message, secret).toString();
};

export const decryptMessage = (encryptedMessage: string, secret: string) => {
  try {
    const bytes = AES.decrypt(encryptedMessage, secret);
    return bytes.toString(Utf8);
  } catch (e) {
    return 'Failed to decrypt message';
  }
};
