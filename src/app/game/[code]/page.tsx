'use client';

import React, { use, useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { BoardSetupScreen } from '@/components/BoardSetupScreen';
import { MainGameScreen } from '@/components/MainGameScreen';
import { VictoryScreen } from '@/components/VictoryScreen';
import { ReconnectingModal } from '@/components/ReconnectingModal';
import { useBingoGame } from '@/hooks/useBingoGame';
import { useRouter } from 'next/navigation';

export default function GameRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const roomCode = resolvedParams.code?.toUpperCase() || '';
  const router = useRouter();

  const [hasJoined, setHasJoined] = useState(false);

  const {
    game,
    player,
    p1,
    p2,
    opponent,
    calledNumbers,
    myLines,
    opponentLines,
    isMyTurn,
    winner,
    isWinner,
    loading,
    error,
    optimisticCalled,
    isOpponentDisconnected,
    reconnectCountdown,
    joinGame,
    setBoard,
    callNumber,
    claimTimeoutWin,
    resetGame,
  } = useBingoGame();

  useEffect(() => {
    if (roomCode && !hasJoined) {
      setHasJoined(true);
      joinGame(roomCode).catch(err => {
        console.error('Failed to join from direct link:', err);
      });
    }
  }, [roomCode, hasJoined, joinGame]);

  const handleBoardConfirmed = async (boardData: number[]) => {
    await setBoard(boardData);
  };

  const opponentName = opponent?.display_name || (player?.player_number === 1 ? (p2?.display_name || 'Challenger') : (p1?.display_name || 'Host'));

  return (
    <>
      <Header
        badge="MATCH"
        badgeType="match"
        subTitle={`Room #${roomCode}`}
        showBack={true}
        onBack={() => {
          resetGame();
          router.push('/');
        }}
      />

      <main className="flex flex-col relative z-10 w-full min-h-screen px-container-padding-mobile pt-16 pb-12 bg-transparent justify-center">
        {error && (
          <div className="w-full max-w-md mx-auto p-4 rounded-xl bg-error-container/80 text-on-error border border-error text-center mb-4 font-bold">
            {error}
            <div className="mt-2">
              <button
                onClick={() => router.push('/')}
                className="px-4 py-1.5 rounded-lg bg-surface text-on-surface text-xs font-bold"
              >
                Back to Arena
              </button>
            </div>
          </div>
        )}

        {/* Board Setup State */}
        {game?.status !== 'playing' && game?.status !== 'completed' && (
          <BoardSetupScreen
            initialAutoFill={true}
            onConfirmBoard={handleBoardConfirmed}
            onBack={() => router.push('/')}
            loading={loading}
            isReady={Boolean(player?.is_ready)}
            opponentName={opponentName}
          />
        )}

        {/* Main Game State */}
        {game?.status === 'playing' && (
          player?.board ? (
            <MainGameScreen
              board={player.board}
              calledNumbers={calledNumbers}
              isMyTurn={isMyTurn}
              myLines={myLines}
              opponentLines={opponentLines}
              playerName={player.display_name}
              opponentName={opponentName}
              onCallNumber={callNumber}
              loading={loading}
              optimisticCalled={optimisticCalled}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <span className="w-10 h-10 border-4 border-primary-container border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-on-surface-variant font-bold text-sm">Entering Duel Arena...</p>
            </div>
          )
        )}

        {/* Victory State */}
        {game?.status === 'completed' && (
          <VictoryScreen
            isWinner={isWinner}
            winnerName={winner?.display_name || 'Winner'}
            playerName={player?.display_name || 'You'}
            opponentName={opponentName}
            myLines={myLines}
            opponentLines={opponentLines}
            totalCalls={calledNumbers.length}
            onRematch={() => router.push('/')}
            onBackToHome={() => router.push('/')}
          />
        )}

        {/* Reconnecting Overlay */}
        {isOpponentDisconnected && game?.status === 'playing' && (
          <ReconnectingModal
            roomCode={roomCode}
            opponentName={opponentName}
            countdown={reconnectCountdown}
            onClaimTimeoutWin={claimTimeoutWin}
            onSurrender={() => router.push('/')}
          />
        )}
      </main>
    </>
  );
}
