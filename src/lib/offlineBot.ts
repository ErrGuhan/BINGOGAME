import { BoardSize } from '@/types/bingo';
import { generateRandomBoard, getLineIndices } from './gameEngine';

export interface BotDuelist {
  sessionId: string;
  displayName: string;
  board: number[];
}

export function createBotDuelist(boardSize: BoardSize = 5, botName: string = 'CyberDuelist [AI]'): BotDuelist {
  return {
    sessionId: `bot-session-${Date.now()}`,
    displayName: botName,
    board: generateRandomBoard(boardSize),
  };
}

/**
 * Intelligent bot heuristic:
 * 1. Checks which lines on the bot's board are closest to completion (e.g., 4/5 marked).
 * 2. Picks the missing number from the most complete line to attempt a strike/win.
 * 3. Falls back to uncalled numbers on its board, or any uncalled number.
 */
export function chooseBotNumber(
  botBoard: number[],
  calledNumbers: number[],
  boardSize: BoardSize = 5
): number {
  const calledSet = new Set(calledNumbers);
  const totalNumbers = boardSize * boardSize;
  const lineIndices = getLineIndices(boardSize);

  // Score candidate numbers by how many lines they would advance
  const numberScores = new Map<number, number>();

  for (const line of lineIndices) {
    const uncalledIndicesInLine: number[] = [];
    let markedCount = 0;

    for (const idx of line) {
      const val = botBoard[idx];
      if (calledSet.has(val)) {
        markedCount++;
      } else {
        uncalledIndicesInLine.push(idx);
      }
    }

    // If only 1 number is left to complete this line, give it a massive weight!
    const weight = markedCount === boardSize - 1 ? 100 : markedCount * 5;

    for (const idx of uncalledIndicesInLine) {
      const val = botBoard[idx];
      numberScores.set(val, (numberScores.get(val) || 0) + weight);
    }
  }

  // Find the highest-scoring uncalled candidate
  let bestNumber: number | null = null;
  let highestScore = -1;

  for (const [num, score] of numberScores.entries()) {
    if (!calledSet.has(num) && score > highestScore) {
      highestScore = score;
      bestNumber = num;
    }
  }

  if (bestNumber !== null) {
    return bestNumber;
  }

  // Fallback 1: any uncalled number on bot board
  const remainingOnBoard = botBoard.filter(num => !calledSet.has(num));
  if (remainingOnBoard.length > 0) {
    return remainingOnBoard[Math.floor(Math.random() * remainingOnBoard.length)];
  }

  // Fallback 2: any uncalled number in the 1..totalNumbers pool
  const allPossible: number[] = [];
  for (let i = 1; i <= totalNumbers; i++) {
    if (!calledSet.has(i)) {
      allPossible.push(i);
    }
  }

  if (allPossible.length > 0) {
    return allPossible[Math.floor(Math.random() * allPossible.length)];
  }

  return 1;
}
