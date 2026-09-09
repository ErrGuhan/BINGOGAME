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
    resetGame,
  } = useBingoGame();

  // Watch game status transitions
  React.useEffect(() => {
    if (!game) return;

    if (game.status === 'waiting') {
      if (screen !== 'setup' && screen !== 'create') {
        setScreen('create');
      }
    } else if (game.status === 'ready') {
      // If player doesn't have a board submitted yet, go to setup
      if (!player?.is_ready && screen !== 'setup') {
        setScreen('setup');
      }
    } else if (game.status === 'playing') {
      setScreen('game');
    } else if (game.status === 'completed') {
      setScreen('victory');
    }
  }, [game?.status, player?.is_ready, screen]);

  // Handle Home -> Create Game
  const handleStartCreate = async () => {
    try {
      await createGame();
      setScreen('create');
    } catch (err) {
      console.error(err);
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

  // Handle Rematch
  const handleRematch = async () => {
    resetGame();
    sounds.playTap();
    await handleStartCreate();
  };

  // Handle Back To Home
  const handleBackToHome = () => {
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
        onBack={() => setScreen('home')}
      />

      <main className="flex flex-col relative z-10 w-full min-h-screen px-container-padding-mobile pt-16 pb-12 bg-transparent justify-center">
        {screen === 'home' && (
          <HomeScreen
            onCreateGame={handleStartCreate}
            onJoinGame={handleStartJoin}
            loading={loading}
          />
        )}

        {screen === 'create' && (
          <CreateGameScreen
            roomCode={game?.room_code || '....'}
            opponentConnected={Boolean(p2?.connected)}
            opponentName={p2?.display_name || 'Challenger'}
            onProceedToSetup={handleProceedToSetup}
            onBack={() => setScreen('home')}
          />
        )}

        {screen === 'join' && (
          <JoinGameScreen
            initialCode={prefilledJoinCode}
            onJoin={handleJoinSubmit}
            onBack={() => setScreen('home')}
            loading={loading}
            errorMessage={error}
          />
        )}

        {screen === 'setup' && (
          <BoardSetupScreen
            initialAutoFill={autoFillBoard}
            onConfirmBoard={handleBoardConfirmed}
            onBack={() => setScreen(player?.player_number === 1 ? 'create' : 'home')}
            loading={loading}
          />
        )}

        {screen === 'game' && player?.board && (
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
            onRematch={handleRematch}
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
