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
import { LeaderboardScreen } from '@/components/LeaderboardScreen';
import { ConnectionHandshakeModal } from '@/components/ConnectionHandshakeModal';
import { OfflineConnectionModal, OfflineConnectMode } from '@/components/OfflineConnectionModal';
import { InstallAppModal } from '@/components/InstallAppModal';
import { useBingoGame } from '@/hooks/useBingoGame';
import { sounds } from '@/components/AudioController';
import { getActiveRoomCode, clearActiveRoomCode } from '@/lib/gameEngine';

type ScreenState = 'home' | 'create' | 'join' | 'setup' | 'game' | 'victory' | 'leaderboard';

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('home');
  const [autoFillBoard, setAutoFillBoard] = useState<boolean>(true);
  const [prefilledJoinCode, setPrefilledJoinCode] = useState<string>('');
  const [showDebugHud, setShowDebugHud] = useState<boolean>(false);
  const [showHandshake, setShowHandshake] = useState<boolean>(false);
  const [showOfflineModal, setShowOfflineModal] = useState<boolean>(false);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

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
    isOfflineMode,
    offlineMode,
    startOfflineDuel,
    passAndPlayActivePlayerNumber,
    switchPassAndPlayPlayer,
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
          resetGame();
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

  // Register rematch event callbacks
  React.useEffect(() => {
    setOnRematchAccepted(() => (_newRoomCode?: string) => {
      setScreen('setup');
    });
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
        .then(() => setShowHandshake(true))
        .catch(() => setScreen('join'));
    } else {
      setPrefilledJoinCode('');
      setScreen('join');
    }
  };

  // Handle Join Code Submission
  const handleJoinSubmit = async (code: string) => {
    try {
      setPrefilledJoinCode(code);
      await joinGame(code);
      setShowHandshake(true);
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Offline Duel launch
  const handleStartOfflineDuel = async (mode: OfflineConnectMode, options?: any) => {
    try {
      clearActiveRoomCode();
      const code = await startOfflineDuel(mode, options);
      if (mode === 'bot' || mode === 'pass-and-play') {
        setScreen('setup');
      } else if (options?.role === 'host') {
        setScreen('create');
      } else {
        setShowHandshake(true);
      }
    } catch (err) {
      console.error('Failed to start offline duel:', err);
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
      if (offlineMode === 'pass-and-play' && passAndPlayActivePlayerNumber === 1 && !p2?.board) {
        switchPassAndPlayPlayer();
        sounds.playDraft(880);
        return;
      }
      if (game?.status === 'playing') {
        setScreen('game');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Rematch
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
    home: { badge: isOfflineMode ? 'OFFLINE' : 'LIVE', badgeType: 'live' as const, subTitle: 'Home', showBack: false },
    create: { badge: isOfflineMode ? 'OFFLINE' : 'LIVE', badgeType: 'create' as const, subTitle: 'Create', showBack: true },
    join: { badge: isOfflineMode ? 'OFFLINE' : 'LIVE', badgeType: 'live' as const, subTitle: 'Join', showBack: true },
    setup: { badge: 'MATCH', badgeType: 'setup' as const, subTitle: 'Setup', showBack: true },
    game: { badge: isOfflineMode ? 'LOCAL' : 'MATCH', badgeType: 'match' as const, subTitle: 'Game', showBack: false },
    victory: { badge: 'MATCH', badgeType: 'match' as const, subTitle: 'Gameover', showBack: false },
    leaderboard: { badge: 'LIVE', badgeType: 'live' as const, subTitle: 'Leaderboard', showBack: true },
  }[screen];

  const hostPlayerName = p1?.display_name || 'Host';
  const guestPlayerName = p2?.display_name || (offlineMode === 'bot' ? 'CyberDuelist [AI]' : 'Challenger');
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
            onLeaderboard={() => { sounds.playTap(); setScreen('leaderboard'); }}
            onOpenOfflineModal={() => setShowOfflineModal(true)}
            onOpenInstallModal={() => setShowInstallModal(true)}
            loading={loading}
            errorMessage={error}
          />
        )}

        {screen === 'create' && (
          <CreateGameScreen
            roomCode={game?.room_code || '....'}
            opponentConnected={Boolean(p2?.connected) || Boolean(p2?.id)}
            opponentName={opponentName}
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

        {showHandshake && (
          <ConnectionHandshakeModal
            roomCode={game?.room_code || prefilledJoinCode}
            hostName={p1?.display_name || 'Host'}
            challengerName={player?.display_name || 'You'}
            boardSize={boardSize}
            onComplete={() => {
              setShowHandshake(false);
              setScreen('setup');
            }}
          />
        )}

        {screen === 'setup' && (
          <BoardSetupScreen
            key={`setup_${game?.id || 'room'}_${game?.status}_${rematchStatus}_${boardSize}_${passAndPlayActivePlayerNumber}`}
            boardSize={boardSize}
            targetLines={targetLines}
            initialAutoFill={autoFillBoard}
            isHost={player?.player_number === 1}
            onSwitchMode={setGameMode}
            onConfirmBoard={handleBoardConfirmed}
            onBack={handleBackToHome}
            loading={loading}
            isReady={Boolean(player?.is_ready)}
            opponentName={opponentName}
            errorMessage={error}
          />
        )}

        {screen === 'game' && player?.board && (
          <div className="flex flex-col gap-2">
            {offlineMode === 'pass-and-play' && (
              <div className="w-full py-1.5 px-3 rounded-xl bg-primary-container/20 border border-primary-container/40 text-center text-xs font-bold text-primary-container">
                📱 Pass & Play Mode · Current Turn: {isMyTurn ? (player?.display_name || 'Player 1') : (opponentName || 'Player 2')}
              </div>
            )}
            <MainGameScreen
              board={player.board}
              calledNumbers={calledNumbers}
              isMyTurn={isMyTurn}
              myLines={myLines}
              playerName={player.display_name}
              opponentName={opponentName}
              onCallNumber={callNumber}
              loading={loading}
              optimisticCalled={optimisticCalled}
              boardSize={boardSize}
              targetLines={targetLines}
              errorMessage={error}
            />
          </div>
        )}

        {screen === 'victory' && (
          <VictoryScreen
            winnerName={winner?.display_name || (isWinner ? player?.display_name || 'You' : opponentName)}
            isWinner={isWinner}
            playerName={player?.display_name || 'Duelist'}
            opponentName={opponentName}
            myLines={myLines}
            opponentLines={opponentLines}
            targetLines={targetLines}
            boardSize={boardSize}
            totalCalls={calledNumbers.length}
            onRematch={handleRematch}
            onBackToHome={handleBackToHome}
            rematchStatus={rematchStatus}
            rematchRequesterName={rematchRequesterName}
            onAcceptRematch={acceptRematch}
            onDeclineRematch={declineRematch}
            onCancelRematchRequest={cancelRematchRequest}
          />
        )}

        {screen === 'leaderboard' && (
          <LeaderboardScreen
            onBack={handleBackToHome}
          />
        )}

        {isOpponentDisconnected && !isOfflineMode && (
          <ReconnectingModal
            roomCode={game?.room_code || '....'}
            opponentName={opponentName}
            countdown={reconnectCountdown}
            onClaimTimeoutWin={claimTimeoutWin}
            onSurrender={handleBackToHome}
          />
        )}

        {/* Offline Connection Modal */}
        <OfflineConnectionModal
          isOpen={showOfflineModal}
          onClose={() => setShowOfflineModal(false)}
          onStartOfflineDuel={handleStartOfflineDuel}
        />

        {/* PWA Download / Install App Modal */}
        <InstallAppModal
          isOpen={showInstallModal}
          onClose={() => setShowInstallModal(false)}
        />
      </main>
    </>
  );
}
