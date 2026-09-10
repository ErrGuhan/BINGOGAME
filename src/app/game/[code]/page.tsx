'use client';

import React, { use, useState, useEffect, Suspense } from 'react';
import { Header } from '@/components/Header';
import { BoardSetupScreen } from '@/components/BoardSetupScreen';
import { MainGameScreen } from '@/components/MainGameScreen';
import { VictoryScreen } from '@/components/VictoryScreen';
import { ReconnectingModal } from '@/components/ReconnectingModal';
import { useBingoGame } from '@/hooks/useBingoGame';
import { clearActiveRoomCode } from '@/lib/gameEngine';
import { useRouter } from 'next/navigation';
import { sounds } from '@/components/AudioController';

function GameRoomContent({ roomCode }: { roomCode: string }) {
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
    requestRematch,
    acceptRematch,
    declineRematch,
    cancelRematchRequest,
    rematchStatus,
    rematchRequesterName,
    resetGame,
    setOnRematchDeclined,
    setOnRematchAccepted,
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

  const handleExitToArena = () => {
    clearActiveRoomCode();
    resetGame();
    router.push('/');
  };

  // Register rematch event callbacks (avoids React state-batching race conditions)
  useEffect(() => {
    // When requester receives REMATCH_DECLINED broadcast — clean up and go home
    setOnRematchDeclined(() => () => {
      clearActiveRoomCode();
      resetGame();
      router.push('/');
    });
    // When recipient receives REMATCH_ACCEPTED broadcast — no extra navigation needed:
    // the component conditionally renders BoardSetupScreen when rematchStatus === 'accepted'
    setOnRematchAccepted(() => () => {
      // state is already updated in the hook; component re-renders to BoardSetupScreen
    });
    return () => {
      setOnRematchDeclined(null);
      setOnRematchAccepted(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleRematch = async () => {
    try {
      await requestRematch();
    } catch (err) {
      console.error('Failed to request rematch:', err);
    }
  };

  const opponentName = opponent?.display_name || (player?.player_number === 1 ? (p2?.display_name || 'Challenger') : (p1?.display_name || 'Host'));

  return (
    <>
      <Header
        badge="MATCH"
        badgeType="match"
        subTitle={`Room #${roomCode}`}
        showBack={true}
        onBack={handleExitToArena}
      />

      <main className="flex flex-col relative z-10 w-full min-h-screen px-container-padding-mobile pt-16 pb-12 bg-transparent justify-center">
        {error && (
          <div className="w-full max-w-md mx-auto p-4 rounded-xl bg-error-container/80 text-on-error border border-error text-center mb-4 font-bold">
            {error}
            <div className="mt-2">
              <button
                onClick={handleExitToArena}
                className="px-4 py-1.5 rounded-lg bg-surface text-on-surface text-xs font-bold cursor-pointer"
              >
                Back to Arena
              </button>
            </div>
          </div>
        )}

        {/* Board Setup State (waiting/ready before play, or when rematch accepted) */}
        {(rematchStatus === 'accepted' || (game?.status !== 'playing' && game?.status !== 'completed')) && (
          <BoardSetupScreen
            key={`setup_${game?.id || 'room'}_${game?.status}_${rematchStatus}`}
            initialAutoFill={true}
            onConfirmBoard={handleBoardConfirmed}
            onBack={handleExitToArena}
            loading={loading}
            isReady={Boolean(player?.is_ready)}
            opponentName={opponentName}
          />
        )}

        {/* Main Game State */}
        {game?.status === 'playing' && rematchStatus !== 'accepted' && (
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

        {/* Victory State (Match completed: only show if rematch is not accepted) */}
        {game?.status === 'completed' && rematchStatus !== 'accepted' && (
          <VictoryScreen
            isWinner={isWinner}
            winnerName={winner?.display_name || 'Winner'}
            playerName={player?.display_name || 'You'}
            opponentName={opponentName}
            myLines={myLines}
            opponentLines={opponentLines}
            totalCalls={calledNumbers.length}
            rematchStatus={rematchStatus}
            rematchRequesterName={rematchRequesterName}
            onRematch={handleRematch}
            onAcceptRematch={acceptRematch}
            onDeclineRematch={() => {
              declineRematch();
              // Navigate decliner to home immediately (requester is handled via callback)
              handleExitToArena();
            }}
            onCancelRematchRequest={cancelRematchRequest}
            onBackToHome={handleExitToArena}
          />
        )}

        {/* Reconnecting Overlay */}
        {isOpponentDisconnected && game?.status === 'playing' && (
          <ReconnectingModal
            roomCode={roomCode}
            opponentName={opponentName}
            countdown={reconnectCountdown}
            onClaimTimeoutWin={claimTimeoutWin}
            onSurrender={handleExitToArena}
          />
        )}
      </main>
    </>
  );
}

export default function GameRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params);
  const roomCode = resolvedParams.code?.toUpperCase() || '';

  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen text-center">
          <span className="w-10 h-10 border-4 border-primary-container border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-on-surface-variant font-bold text-sm">Loading Duel Arena...</p>
        </div>
      }
    >
      <GameRoomContent roomCode={roomCode} />
    </Suspense>
  );
}
