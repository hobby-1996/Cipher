import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
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
  const ballRef = useRef<HTMLDivElement>(null);
  const hostPaddleRef = useRef<HTMLDivElement>(null);
  const guestPaddleRef = useRef<HTMLDivElement>(null);
  
  const requestRef = useRef<number>();
  const lastPaddleUpdate = useRef<number>(0);
  const lastBallUpdate = useRef<number>(0);
  
  // Local physics state to avoid React render lag
  const localBall = useRef({ x: 50, y: 50, dx: 0, dy: 0 });
  const targetBall = useRef({ x: 50, y: 50, dx: 0, dy: 0 });
  const localHostPaddle = useRef(50);
  const localGuestPaddle = useRef(50);

  const currentUserId = auth.currentUser?.uid;
  const isHost = gameState?.hostId === currentUserId;

  useEffect(() => {
    const unsubscribe = onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setGameState(data);
        
        // Sync local physics with authoritative state
        if (data.ball) {
          if (data.hostId === currentUserId) {
            // Host: Only sync back if the ball was reset (e.g., after a goal)
            const isReset = Math.abs(data.ball.x - 50) < 0.1 && Math.abs(data.ball.y - 50) < 0.1;
            if (isReset) {
              localBall.current = { ...data.ball };
            }
          } else {
            // Guest: Update target for interpolation and sync velocity for prediction
            targetBall.current = { ...data.ball };
            localBall.current.dx = data.ball.dx;
            localBall.current.dy = data.ball.dy;
            
            // If we're way off, snap it (e.g., after a goal)
            const dist = Math.sqrt(Math.pow(localBall.current.x - data.ball.x, 2) + Math.pow(localBall.current.y - data.ball.y, 2));
            if (dist > 20) {
              localBall.current.x = data.ball.x;
              localBall.current.y = data.ball.y;
            }
          }
        }
        if (data.hostPaddle !== undefined) localHostPaddle.current = data.hostPaddle;
        if (data.guestPaddle !== undefined) localGuestPaddle.current = data.guestPaddle;
      }
    });
    return () => unsubscribe();
  }, [gameId, currentUserId]);

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
    
    // Update local ref immediately for smoothness
    if (isHost) localHostPaddle.current = x;
    else localGuestPaddle.current = x;
  };

  // Unified animation loop for both Host and Guest
  useEffect(() => {
    if (gameState?.status !== 'playing') return;

    let lastTime = performance.now();

    const loop = (time: number) => {
      const deltaTime = Math.min((time - lastTime) / 1000, 0.1); // Cap delta to avoid huge jumps
      lastTime = time;

      if (isHost) {
        // HOST: Calculate physics
        localBall.current.x += localBall.current.dx * deltaTime;
        localBall.current.y += localBall.current.dy * deltaTime;

        // Wall collisions
        if (localBall.current.x <= 2 || localBall.current.x >= 98) {
          localBall.current.dx *= -1;
          localBall.current.x = Math.max(2, Math.min(98, localBall.current.x));
        }

        // Paddle collisions
        if (localBall.current.y >= 93 && localBall.current.y <= 97 && localBall.current.dy > 0) {
          if (Math.abs(localBall.current.x - localHostPaddle.current) <= 12) {
            localBall.current.dy *= -1.05; // Gentle speed up
            localBall.current.dx += (localBall.current.x - localHostPaddle.current) * 0.8; // More spin
            localBall.current.y = 92.9;
          }
        }

        if (localBall.current.y <= 7 && localBall.current.y >= 3 && localBall.current.dy < 0) {
          if (Math.abs(localBall.current.x - localGuestPaddle.current) <= 12) {
            localBall.current.dy *= -1.05;
            localBall.current.dx += (localBall.current.x - localGuestPaddle.current) * 0.8;
            localBall.current.y = 7.1;
          }
        }

        // Scoring
        let scored = false;
        let newHostScore = gameState.hostScore;
        let newGuestScore = gameState.guestScore;

        if (localBall.current.y > 110) {
          newGuestScore += 1;
          scored = true;
        } else if (localBall.current.y < -10) {
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
            localBall.current = { x: 50, y: 50, dx: (Math.random() > 0.5 ? 40 : -40), dy: (localBall.current.y > 100 ? -50 : 50) };
            updateDoc(gameRef, {
              hostScore: newHostScore,
              guestScore: newGuestScore,
              ball: localBall.current
            });
          }
        } else {
          // Sync ball position periodically to Firestore
          const now = Date.now();
          if (now - lastBallUpdate.current > 70) {
            updateDoc(gameRef, { ball: localBall.current });
            lastBallUpdate.current = now;
          }
        }
      } else {
        // GUEST: Predict ball movement
        localBall.current.x += localBall.current.dx * deltaTime;
        localBall.current.y += localBall.current.dy * deltaTime;
        
        // Interpolate towards target to correct drift smoothly
        // This is the "secret sauce" for ultra-smooth movement
        localBall.current.x += (targetBall.current.x - localBall.current.x) * 0.15;
        localBall.current.y += (targetBall.current.y - localBall.current.y) * 0.15;
        
        // Simple wall bounce prediction
        if (localBall.current.x <= 2 || localBall.current.x >= 98) {
          localBall.current.dx *= -1;
          localBall.current.x = Math.max(2, Math.min(98, localBall.current.x));
        }
      }

      // Update DOM directly with translate3d for GPU acceleration
      if (ballRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const ballX = (localBall.current.x / 100) * rect.width;
        const ballY = ((isHost ? localBall.current.y : 100 - localBall.current.y) / 100) * rect.height;
        ballRef.current.style.transform = `translate3d(${ballX}px, ${ballY}px, 0) translate(-50%, -50%)`;
      }
      
      if (hostPaddleRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const paddleX = (localHostPaddle.current / 100) * rect.width;
        hostPaddleRef.current.style.transform = `translate3d(${paddleX}px, 0, 0) translate(-50%, 0)`;
      }
      
      if (guestPaddleRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const paddleX = (localGuestPaddle.current / 100) * rect.width;
        guestPaddleRef.current.style.transform = `translate3d(${paddleX}px, 0, 0) translate(-50%, 0)`;
      }

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isHost, gameState?.status, gameState?.hostScore, gameState?.guestScore]);

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
            ref={isHost ? guestPaddleRef : hostPaddleRef}
            className="absolute top-[5%] h-2 bg-error-red rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)] will-change-transform"
            style={{ 
              width: '20%', 
              left: 0,
              top: '5%',
              transform: `translate3d(${(isHost ? localGuestPaddle.current : localHostPaddle.current) / 100 * (containerRef.current?.clientWidth || 0)}px, 0, 0) translate(-50%, 0)`
            }}
          />

          {/* My Paddle (Bottom) */}
          <div 
            ref={isHost ? hostPaddleRef : guestPaddleRef}
            className="absolute bottom-[5%] h-2 bg-accent-teal rounded-full shadow-[0_0_10px_rgba(62,198,193,0.5)] will-change-transform"
            style={{ 
              width: '20%', 
              left: 0,
              bottom: '5%',
              transform: `translate3d(${(isHost ? localHostPaddle.current : localGuestPaddle.current) / 100 * (containerRef.current?.clientWidth || 0)}px, 0, 0) translate(-50%, 0)`
            }}
          />

          {/* Ball */}
          <div 
            ref={ballRef}
            className="absolute w-4 h-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] will-change-transform"
            style={{
              left: 0,
              top: 0,
              transform: `translate3d(${localBall.current.x / 100 * (containerRef.current?.clientWidth || 0)}px, ${(isHost ? localBall.current.y : 100 - localBall.current.y) / 100 * (containerRef.current?.clientHeight || 0)}px, 0) translate(-50%, -50%)`
            }}
          />
        </div>
      </div>
    </div>
  );
}
