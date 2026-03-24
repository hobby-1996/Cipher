import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { X, Trophy } from 'lucide-react';

interface PingPongProps {
  gameId: string;
  userId: string;
  onClose: () => void;
}

export default function PingPong({ gameId, userId, onClose }: PingPongProps) {
  const [gameState, setGameState] = useState<any>(null);
  const gameRef = doc(db, 'games', gameId);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const lastPaddleUpdate = useRef<number>(0);
  const lastBallUpdate = useRef<number>(0);

  useEffect(() => {
    const unsubscribe = onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        setGameState(doc.data());
      }
    });
    return () => unsubscribe();
  }, [gameId]);

  const isHost = gameState?.hostId === userId;

  // Handle paddle movement
  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState?.status !== 'playing') return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    let clientX = 0;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
    } else {
      clientX = (e as React.MouseEvent).clientX;
    }

    let x = ((clientX - rect.left) / rect.width) * 100;
    x = Math.max(10, Math.min(90, x)); // Paddle width is 20%, so center is between 10 and 90

    // Throttle updates to Firestore to avoid quota issues
    const now = Date.now();
    if (now - lastPaddleUpdate.current > 50) {
      updateDoc(gameRef, {
        [isHost ? 'hostPaddle' : 'guestPaddle']: x
      });
      lastPaddleUpdate.current = now;
    }
  };

  // Host game loop
  useEffect(() => {
    if (!isHost || gameState?.status !== 'playing') return;

    let lastTime = performance.now();
    let currentBall = { ...gameState.ball };

    const updatePhysics = (time: number) => {
      const deltaTime = (time - lastTime) / 1000;
      lastTime = time;

      // Move ball
      currentBall.x += currentBall.dx * deltaTime;
      currentBall.y += currentBall.dy * deltaTime;

      // Wall collisions
      if (currentBall.x <= 2 || currentBall.x >= 98) {
        currentBall.dx *= -1;
        currentBall.x = Math.max(2, Math.min(98, currentBall.x));
      }

      // Paddle collisions
      // Host paddle is at y=95
      if (currentBall.y >= 93 && currentBall.y <= 97 && currentBall.dy > 0) {
        if (Math.abs(currentBall.x - gameState.hostPaddle) <= 12) {
          currentBall.dy *= -1.1; // Speed up slightly
          currentBall.dx += (currentBall.x - gameState.hostPaddle) * 0.5; // Add spin
          currentBall.y = 92;
        }
      }

      // Guest paddle is at y=5
      if (currentBall.y <= 7 && currentBall.y >= 3 && currentBall.dy < 0) {
        if (Math.abs(currentBall.x - gameState.guestPaddle) <= 12) {
          currentBall.dy *= -1.1;
          currentBall.dx += (currentBall.x - gameState.guestPaddle) * 0.5;
          currentBall.y = 8;
        }
      }

      // Scoring
      let scored = false;
      let newHostScore = gameState.hostScore;
      let newGuestScore = gameState.guestScore;

      if (currentBall.y > 100) {
        newGuestScore += 1;
        scored = true;
      } else if (currentBall.y < 0) {
        newHostScore += 1;
        scored = true;
      }

      if (scored) {
        if (newHostScore >= 5 || newGuestScore >= 5) {
          updateDoc(gameRef, {
            status: 'finished',
            hostScore: newHostScore,
            guestScore: newGuestScore,
            winner: newHostScore >= 5 ? gameState.hostId : gameState.guestId
          });
          return;
        } else {
          currentBall = { x: 50, y: 50, dx: (Math.random() > 0.5 ? 30 : -30), dy: (currentBall.y > 100 ? -40 : 40) };
          updateDoc(gameRef, {
            hostScore: newHostScore,
            guestScore: newGuestScore,
            ball: currentBall
          });
        }
      } else {
        // Sync ball position periodically
        const now = Date.now();
        if (now - lastBallUpdate.current > 50) {
          updateDoc(gameRef, { ball: currentBall });
          lastBallUpdate.current = now;
        }
      }

      requestRef.current = requestAnimationFrame(updatePhysics);
    };

    requestRef.current = requestAnimationFrame(updatePhysics);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isHost, gameState?.status, gameState?.hostPaddle, gameState?.guestPaddle, gameState?.hostScore, gameState?.guestScore]);

  // Countdown logic
  useEffect(() => {
    if (isHost && gameState?.status === 'countdown') {
      let count = 3;
      const interval = setInterval(() => {
        count -= 1;
        if (count > 0) {
          updateDoc(gameRef, { countdown: count });
        } else {
          clearInterval(interval);
          updateDoc(gameRef, { 
            status: 'playing',
            ball: { x: 50, y: 50, dx: 30, dy: 40 }
          });
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isHost, gameState?.status]);

  // Check if both ready to start countdown
  useEffect(() => {
    if (isHost && gameState?.status === 'lobby' && gameState?.hostReady && gameState?.guestReady) {
      updateDoc(gameRef, { status: 'countdown', countdown: 3 });
    }
  }, [isHost, gameState?.status, gameState?.hostReady, gameState?.guestReady]);

  if (!gameState) return null;

  const handleReady = () => {
    updateDoc(gameRef, {
      [isHost ? 'hostReady' : 'guestReady']: true
    });
  };

  const myScore = isHost ? gameState.hostScore : gameState.guestScore;
  const opponentScore = isHost ? gameState.guestScore : gameState.hostScore;

  return (
    <div className="absolute inset-0 z-50 bg-primary-navy/95 backdrop-blur-md flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-bg-slate rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 flex flex-col h-[80vh]">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-primary-navy">
          <h3 className="font-bold text-text-offwhite flex items-center">
            <span className="text-xl mr-2">🏓</span> Ping Pong
          </h3>
          <button onClick={onClose} className="p-2 text-text-offwhite/40 hover:text-white hover:bg-white/10 rounded-xl transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 relative flex flex-col cursor-crosshair" ref={containerRef} onMouseMove={handleMouseMove} onTouchMove={handleMouseMove}>
          {/* Scores */}
          <div className="absolute top-4 left-4 text-white/50 font-mono text-2xl font-bold">{opponentScore}</div>
          <div className="absolute bottom-4 right-4 text-accent-teal font-mono text-2xl font-bold">{myScore}</div>

          {/* Center Line */}
          <div className="absolute top-1/2 left-0 w-full border-t-2 border-dashed border-white/10"></div>

          {gameState.status === 'lobby' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-primary-navy/80 backdrop-blur-sm z-10">
              <h2 className="text-2xl font-bold text-white mb-6">Game Lobby</h2>
              <div className="flex space-x-8 mb-8">
                <div className="flex flex-col items-center">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mb-2 ${gameState.hostReady ? 'bg-secure-green text-primary-navy' : 'bg-white/10 text-white/40'}`}>
                    P1
                  </div>
                  <span className="text-xs text-white/60 uppercase tracking-widest">{gameState.hostReady ? 'Ready' : 'Waiting'}</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mb-2 ${gameState.guestReady ? 'bg-secure-green text-primary-navy' : 'bg-white/10 text-white/40'}`}>
                    P2
                  </div>
                  <span className="text-xs text-white/60 uppercase tracking-widest">{gameState.guestReady ? 'Ready' : 'Waiting'}</span>
                </div>
              </div>
              {!(isHost ? gameState.hostReady : gameState.guestReady) ? (
                <button 
                  onClick={handleReady}
                  className="px-8 py-3 bg-accent-teal text-primary-navy rounded-xl font-bold shadow-lg hover:bg-accent-teal/90 transition-all"
                >
                  I'm Ready
                </button>
              ) : (
                <p className="text-accent-teal font-bold animate-pulse">Waiting for opponent...</p>
              )}
            </div>
          )}

          {gameState.status === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <span className="text-8xl font-bold text-accent-teal animate-ping">{gameState.countdown}</span>
            </div>
          )}

          {gameState.status === 'finished' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-primary-navy/90 backdrop-blur-md z-20">
              <Trophy className="w-16 h-16 text-amber-400 mb-4" />
              <h2 className="text-3xl font-bold text-white mb-2">
                {gameState.winner === userId ? 'You Won!' : 'You Lost!'}
              </h2>
              <p className="text-white/60 mb-8">Final Score: {myScore} - {opponentScore}</p>
              <button 
                onClick={onClose}
                className="px-8 py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-all"
              >
                Close Game
              </button>
            </div>
          )}

          {/* Game Elements */}
          {/* Opponent Paddle (Top) */}
          <div 
            className="absolute top-[5%] h-2 bg-error-red rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]"
            style={{ 
              width: '20%', 
              left: `${isHost ? gameState.guestPaddle : gameState.hostPaddle}%`,
              transform: 'translateX(-50%)'
            }}
          />

          {/* My Paddle (Bottom) */}
          <div 
            className="absolute bottom-[5%] h-2 bg-accent-teal rounded-full shadow-[0_0_10px_rgba(62,198,193,0.5)]"
            style={{ 
              width: '20%', 
              left: `${isHost ? gameState.hostPaddle : gameState.guestPaddle}%`,
              transform: 'translateX(-50%)'
            }}
          />

          {/* Ball */}
          <div 
            className="absolute w-4 h-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)]"
            style={{
              left: `${gameState.ball.x}%`,
              top: `${isHost ? gameState.ball.y : 100 - gameState.ball.y}%`,
              transform: 'translate(-50%, -50%)'
            }}
          />
        </div>
      </div>
    </div>
  );
}
