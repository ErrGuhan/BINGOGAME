'use client';

import React, { use, useState, useEffect, useRef, Suspense } from 'react';
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
  const joinedRoomRef = useRef<string | null>(null);
  const [showDebugHud, setShowDebugHud] = useState<boolean>(false);

  const {
    game,
    player,
    p1,
    p2,
    opponent,
    calledNumbers,
    myLines,
    opponentLines,
    boardSize,
    targetLines,
    isMyTurn,
    winner,
    isWinner,
    loading,
    error,
    optimisticCalled,
    isOpponentDisconnected,
    reconnectCountdown,
    channelStatus,
    activeGameId,
    joinGame,
    setGameMode,
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
    if (roomCode && joinedRoomRef.current !== roomCode) {
      joinedRoomRef.current = roomCode;
      joinGame(roomCode).catch(err => {
        console.error('Failed to join from direct link:', err);
      });
    }
  }, [roomCode, joinGame]);

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
    // When rematch is accepted — route to the new room code if it changed
    setOnRematchAccepted(() => (newCode?: string) => {
      if (newCode && newCode !== roomCode) {
        router.push(`/game/${newCode}`);
      }
    });
    return () => {
      setOnRematchDeclined(null);
      setOnRematchAccepted(null);
    };
  }, [router, roomCode, resetGame, setOnRematchAccepted, setOnRematchDeclined]);

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

        {/* Board Setup State (waiting/ready before play, or when rematch accepted, or if playing but player hasn't locked board yet) */}
        {(rematchStatus === 'accepted' || (game?.status !== 'playing' && game?.status !== 'completed') || (game?.status === 'playing' && !player?.board)) && (
          <BoardSetupScreen
            key={`setup_${game?.id || 'room'}_${game?.status}_${rematchStatus}_${boardSize}`}
            boardSize={boardSize}
            targetLines={targetLines}
            isHost={player?.player_number === 1}
            onSwitchMode={setGameMode}
            initialAutoFill={true}
            onConfirmBoard={handleBoardConfirmed}
            onBack={handleExitToArena}
            loading={loading}
            isReady={Boolean(player?.is_ready)}
            opponentName={opponentName}
            errorMessage={error}
          />
        )}

        {/* Main Game State (Gated: only render once player's board is locked and loaded) */}
        {game?.status === 'playing' && rematchStatus !== 'accepted' && Boolean(player?.board) && (
          <MainGameScreen
            board={player!.board!}
            calledNumbers={calledNumbers}
            isMyTurn={isMyTurn}
            myLines={myLines}
            boardSize={boardSize}
            targetLines={targetLines}
            playerName={player!.display_name}
            opponentName={opponentName}
            onCallNumber={callNumber}
            loading={loading}
            optimisticCalled={optimisticCalled}
          />
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
            boardSize={boardSize}
            targetLines={targetLines}
            rematchStatus={rematchStatus}
            rematchRequesterName={rematchRequesterName}
            onRematch={handleRematch}
            onAcceptRematch={async () => {
              try {
                await acceptRematch();
              } catch (err) {
                console.error('Failed to accept rematch:', err);
              }
            }}
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

        {/* Realtime Synchronization Debug Instrumentation HUD */}
        <aside aria-label="Realtime Sync Debug HUD" className="fixed bottom-3 right-3 z-50 flex flex-col items-end">
          {showDebugHud && (
            <div className="mb-2 p-3 rounded-2xl bg-surface-container/95 backdrop-blur-xl border border-outline-variant shadow-xl text-[11px] font-mono text-on-surface w-72 space-y-1.5 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between border-b border-outline-variant pb-1 font-semibold text-xs">
                <span className="text-primary-container">SYNC DIAGNOSTICS</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  channelStatus === 'SUBSCRIBED'
                    ? 'bg-secondary-container/10 text-secondary-container border border-secondary-container/30'
                    : channelStatus === 'CONNECTING'
                    ? 'bg-tertiary-container/10 text-tertiary-fixed border border-tertiary-fixed/30'
                    : 'bg-error-container text-on-error-container border border-error/30'
                }`}>
                  {channelStatus}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div><span className="text-on-surface-variant font-medium">Room:</span> <span className="font-semibold">{game?.room_code || 'None'}</span></div>
                <div><span className="text-on-surface-variant font-medium">Status:</span> <span className="font-semibold">{game?.status || 'idle'}</span></div>
                <div className="col-span-2 truncate"><span className="text-on-surface-variant font-medium">GameID:</span> <span className="font-semibold">{activeGameId ? activeGameId.slice(0, 13) + '...' : 'none'}</span></div>
                <div><span className="text-on-surface-variant font-medium">P1:</span> <span className="font-semibold">{p1?.is_ready ? '✓ LOCKED' : '○ WAIT'}</span></div>
                <div><span className="text-on-surface-variant font-medium">P2:</span> <span className="font-semibold">{p2?.is_ready ? '✓ LOCKED' : '○ WAIT'}</span></div>
                <div><span className="text-on-surface-variant font-medium">My Board:</span> <span className="font-semibold">{player?.board ? `${player.board.length} cells` : 'none'}</span></div>
                <div><span className="text-on-surface-variant font-medium">Calls:</span> <span className="font-semibold">{calledNumbers.length}</span></div>
                <div className="col-span-2"><span className="text-on-surface-variant font-medium">Turn:</span> <span className={`font-semibold ${isMyTurn ? 'text-primary-container' : 'text-on-surface-variant'}`}>{isMyTurn ? 'YOUR TURN' : 'OPPONENT TURN'}</span></div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowDebugHud(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container/90 hover:bg-surface-container-high backdrop-blur-md text-[11px] font-semibold text-on-surface border border-outline-variant shadow-xs cursor-pointer transition-all active:scale-95"
            title="Toggle Multiplayer Sync HUD"
          >
            <span className={`w-2 h-2 rounded-full ${
              channelStatus === 'SUBSCRIBED' ? 'bg-secondary-container animate-pulse' : channelStatus === 'CONNECTING' ? 'bg-amber-400' : 'bg-red-500'
            }`} />
            <span>SYNC HUD</span>
          </button>
        </aside>
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
