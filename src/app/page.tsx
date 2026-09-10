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
    isGameOver,
    winner,
    isWinner,
    loading,
    error,
    optimisticCalled,
    isOpponentDisconnected,
    reconnectCountdown,
    createGame,
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
  } = useBingoGame();

  // Auto-restore active game room on initial mount
  React.useEffect(() => {
    const savedRoom = getActiveRoomCode();
    if (savedRoom) {
      joinGame(savedRoom)
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
      setScreen('game');
    } else if (game.status === 'completed') {
      setScreen('victory');
    }
  }, [game?.status, player?.is_ready, player?.player_number, screen]);

  // Auto-navigate to setup when rematch is accepted
  React.useEffect(() => {
    if (rematchStatus === 'accepted') {
      setScreen('setup');
    }
  }, [rematchStatus]);

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
          />
        )}

        {screen === 'game' && (
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

        {screen === 'victory' && (
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
            onAcceptRematch={async () => {
              await acceptRematch();
              setScreen('setup');
            }}
            onDeclineRematch={declineRematch}
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
      </main>
    </>
  );
}
