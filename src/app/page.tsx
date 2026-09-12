'use client';

import React, { useState } from 'react';
import { Header } from '@/components/Header';
import { HomeScreen } from '@/components/HomeScreen';
import { CreateGameScreen } from '@/components/CreateGameScreen';
import { JoinGameScreen } from '@/components/JoinGameScreen';
import { BoardSetupScreen } from '@/components/BoardSetupScreen';
import { MainGameScreen } from '@/components/MainGameScreen';
import { VictoryScreen } from '@/components/VictoryScreen';
import { ReconnectingModal } from '@/components/ReconnectingModal';
import { useBingoGame } from '@/hooks/useBingoGame';
import { sounds } from '@/components/AudioController';
import { getActiveRoomCode, clearActiveRoomCode } from '@/lib/gameEngine';

type ScreenState = 'home' | 'create' | 'join' | 'setup' | 'game' | 'victory';

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('home');
  const [autoFillBoard, setAutoFillBoard] = useState<boolean>(true);
  const [prefilledJoinCode, setPrefilledJoinCode] = useState<string>('');
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
    createGame,
    setGameMode,
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

  // Auto-restore active game room on initial mount
  React.useEffect(() => {
    const savedRoom = getActiveRoomCode();
    if (savedRoom) {
      joinGame(savedRoom, undefined, true)
        .then(() => {
          // Successfully restored room
        })
        .catch((err) => {
          console.warn('Auto-reconnect failed for saved room:', savedRoom, err);
          clearActiveRoomCode();
          resetGame(); // Ensure home screen is completely clean without a phantom error banner
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch game status transitions
  React.useEffect(() => {
    if (!game) return;

    if (game.status === 'waiting') {
      if (screen !== 'setup' && screen !== 'create') {
        setScreen('create');
      }
    } else if (game.status === 'ready') {
      // Auto-navigate to setup on rematch or when challenger joins
      if (screen === 'victory' || (!player?.is_ready && screen !== 'setup' && screen !== 'create')) {
        setScreen('setup');
      } else if (player?.player_number === 2 && !player?.is_ready && screen !== 'setup') {
        setScreen('setup');
      }
    } else if (game.status === 'playing') {
      // Gated screen transition: only advance to active match if player's board is loaded
      if (player?.board) {
        setScreen('game');
      } else {
        // Keep player on setup until their board is locked
        if (screen !== 'setup') {
          setScreen('setup');
        }
      }
    } else if (game.status === 'completed') {
      if (rematchStatus !== 'accepted') {
        setScreen('victory');
      }
    }
  }, [game?.status, player?.is_ready, player?.player_number, player?.board, screen, rematchStatus]);

  // Register rematch event callbacks (avoids React state-batching race conditions)
  React.useEffect(() => {
    // When opponent ACCEPTS our rematch request — go to board setup for the new match
    setOnRematchAccepted(() => (_newRoomCode?: string) => {
      setScreen('setup');
    });
    // When opponent DECLINES our rematch request — clean up and go home
    setOnRematchDeclined(() => () => {
      sounds.playAlert();
      clearActiveRoomCode();
      resetGame();
      setScreen('home');
    });
    return () => {
      setOnRematchAccepted(null);
      setOnRematchDeclined(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Home -> Create Game
  const handleStartCreate = async () => {
    try {
      clearActiveRoomCode();
      const code = await createGame();
      if (code) {
        setScreen('create');
      }
    } catch (err) {
      console.error('Failed to create game room:', err);
    }
  };

  // Handle Home -> Join Game
  const handleStartJoin = (code?: string) => {
    if (code) {
      setPrefilledJoinCode(code);
      joinGame(code)
        .then(() => setScreen('setup'))
        .catch(() => setScreen('join'));
    } else {
      setPrefilledJoinCode('');
      setScreen('join');
    }
  };

  // Handle Join Code Submission
  const handleJoinSubmit = async (code: string) => {
    try {
      await joinGame(code);
      setScreen('setup');
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Create -> Proceed to Setup
  const handleProceedToSetup = (autoFill: boolean) => {
    setAutoFillBoard(autoFill);
    setScreen('setup');
  };

  // Handle Board Setup Confirmation
  const handleBoardConfirmed = async (boardData: number[]) => {
    try {
      await setBoard(boardData);
      if (game?.status === 'playing') {
        setScreen('game');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Rematch (sends challenge request to opponent)
  const handleRematch = async () => {
    sounds.playTap();
    try {
      await requestRematch();
    } catch (err) {
      console.error('Rematch request error:', err);
    }
  };

  // Handle Back To Home
  const handleBackToHome = () => {
    clearActiveRoomCode();
    resetGame();
    sounds.playTap();
    setScreen('home');
  };

  // Compute Header parameters
  const headerConfig = {
    home: { badge: 'LIVE', badgeType: 'live' as const, subTitle: 'Home', showBack: false },
    create: { badge: 'LIVE', badgeType: 'create' as const, subTitle: 'Create', showBack: true },
    join: { badge: 'LIVE', badgeType: 'live' as const, subTitle: 'Join', showBack: true },
    setup: { badge: 'MATCH', badgeType: 'setup' as const, subTitle: 'Setup', showBack: true },
    game: { badge: 'MATCH', badgeType: 'match' as const, subTitle: 'Game', showBack: false },
    victory: { badge: 'MATCH', badgeType: 'match' as const, subTitle: 'Gameover', showBack: false },
  }[screen];

  const hostPlayerName = p1?.display_name || 'Host';
  const guestPlayerName = p2?.display_name || 'Challenger';
  const opponentName = opponent?.display_name || (player?.player_number === 1 ? guestPlayerName : hostPlayerName);

  return (
    <>
      <Header
        badge={headerConfig.badge}
        badgeType={headerConfig.badgeType}
        subTitle={headerConfig.subTitle}
        showBack={headerConfig.showBack}
        onBack={handleBackToHome}
      />

      <main className="flex flex-col relative z-10 w-full min-h-screen px-container-padding-mobile pt-16 pb-12 bg-transparent justify-center">
        {screen === 'home' && (
          <HomeScreen
            onCreateGame={handleStartCreate}
            onJoinGame={handleStartJoin}
            loading={loading}
            errorMessage={error}
          />
        )}

        {screen === 'create' && (
          <CreateGameScreen
            roomCode={game?.room_code || '....'}
            opponentConnected={Boolean(p2?.connected)}
            opponentName={p2?.display_name || 'Challenger'}
            boardSize={boardSize}
            onSwitchMode={setGameMode}
            onProceedToSetup={handleProceedToSetup}
            onBack={handleBackToHome}
          />
        )}

        {screen === 'join' && (
          <JoinGameScreen
            initialCode={prefilledJoinCode}
            onJoin={handleJoinSubmit}
            onBack={handleBackToHome}
            loading={loading}
            errorMessage={error}
          />
        )}

        {screen === 'setup' && (
          <BoardSetupScreen
            key={`setup_${game?.id || 'room'}_${game?.status}_${rematchStatus}_${boardSize}`}
            boardSize={boardSize}
            targetLines={targetLines}
            isHost={player?.player_number === 1}
            onSwitchMode={setGameMode}
            initialAutoFill={autoFillBoard}
            onConfirmBoard={handleBoardConfirmed}
            onBack={() => {
              if (player?.player_number === 1) {
                setScreen('create');
              } else {
                handleBackToHome();
              }
            }}
            loading={loading}
            isReady={Boolean(player?.is_ready)}
            opponentName={opponentName}
            errorMessage={error}
          />
        )}

        {screen === 'game' && (
          player?.board ? (
            <MainGameScreen
              board={player.board}
              calledNumbers={calledNumbers}
              isMyTurn={isMyTurn}
              myLines={myLines}
              boardSize={boardSize}
              targetLines={targetLines}
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

        {screen === 'victory' && (
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
              setScreen('setup');
            }}
            onDeclineRematch={() => {
              declineRematch();
              clearActiveRoomCode();
              resetGame();
              setScreen('home');
            }}
            onCancelRematchRequest={cancelRematchRequest}
            onBackToHome={handleBackToHome}
          />
        )}

        {/* Connection Interrupted / Reconnecting Overlay */}
        {isOpponentDisconnected && game?.status === 'playing' && (
          <ReconnectingModal
            roomCode={game.room_code}
            opponentName={opponentName}
            countdown={reconnectCountdown}
            onClaimTimeoutWin={claimTimeoutWin}
            onSurrender={handleBackToHome}
          />
        )}

        {/* Realtime Synchronization Debug Instrumentation HUD */}
        <aside aria-label="Realtime Sync Debug HUD" className="fixed bottom-3 right-3 z-50 flex flex-col items-end">
          {showDebugHud && (
            <div className="mb-2 p-3 rounded-2xl bg-surface-container-highest/95 backdrop-blur-xl border border-primary-container/40 shadow-2xl text-[11px] font-mono text-on-surface w-72 space-y-1.5 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-1 font-bold text-xs">
                <span className="text-primary-fixed">SYNC DIAGNOSTICS</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  channelStatus === 'SUBSCRIBED'
                    ? 'bg-primary-container/30 text-primary-fixed border border-primary-container/50'
                    : channelStatus === 'CONNECTING'
                    ? 'bg-tertiary-container/30 text-tertiary-fixed border border-tertiary/50'
                    : 'bg-error-container/30 text-error border border-error/50'
                }`}>
                  {channelStatus}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div><span className="text-on-surface-variant font-medium">Room:</span> <span className="font-bold">{game?.room_code || 'None'}</span></div>
                <div><span className="text-on-surface-variant font-medium">Status:</span> <span className="font-bold">{game?.status || 'idle'}</span></div>
                <div className="col-span-2 truncate"><span className="text-on-surface-variant font-medium">GameID:</span> <span className="font-bold">{activeGameId ? activeGameId.slice(0, 13) + '...' : 'none'}</span></div>
                <div><span className="text-on-surface-variant font-medium">P1:</span> <span className="font-bold">{p1?.is_ready ? '✓ LOCKED' : '○ WAIT'}</span></div>
                <div><span className="text-on-surface-variant font-medium">P2:</span> <span className="font-bold">{p2?.is_ready ? '✓ LOCKED' : '○ WAIT'}</span></div>
                <div><span className="text-on-surface-variant font-medium">My Board:</span> <span className="font-bold">{player?.board ? `${player.board.length} cells` : 'none'}</span></div>
                <div><span className="text-on-surface-variant font-medium">Calls:</span> <span className="font-bold">{calledNumbers.length}</span></div>
                <div className="col-span-2"><span className="text-on-surface-variant font-medium">Turn:</span> <span className={`font-bold ${isMyTurn ? 'text-primary-fixed' : 'text-on-surface-variant'}`}>{isMyTurn ? 'YOUR TURN' : 'OPPONENT TURN'}</span></div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowDebugHud(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high/90 hover:bg-surface-bright backdrop-blur-md text-[11px] font-bold text-on-surface border border-outline-variant/30 shadow-lg cursor-pointer transition-all active:scale-95"
            title="Toggle Multiplayer Sync HUD"
          >
            <span className={`w-2 h-2 rounded-full ${
              channelStatus === 'SUBSCRIBED' ? 'bg-primary-container animate-pulse' : channelStatus === 'CONNECTING' ? 'bg-amber-400' : 'bg-red-500'
            }`} />
            <span>SYNC HUD</span>
          </button>
        </aside>
      </main>
    </>
  );
}
