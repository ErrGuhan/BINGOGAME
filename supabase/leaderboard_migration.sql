-- ==============================================================================
-- BINGO DUEL - LEADERBOARD MIGRATION
-- Win-based dual-variant leaderboard (Classic 5x5 / Mega 10x10)
-- Run this in the Supabase SQL Editor after the base schema is installed.
-- ==============================================================================

-- 1. DROP EXISTING LEADERBOARD OBJECTS (idempotent re-run)
DROP FUNCTION IF EXISTS get_leaderboard(TEXT, INT);
DROP FUNCTION IF EXISTS get_player_rank(TEXT, TEXT);
DROP FUNCTION IF EXISTS upsert_player_stats(TEXT, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS call_number(UUID, TEXT, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS claim_timeout_win(UUID, TEXT, TEXT, TEXT);
DROP TABLE IF EXISTS player_stats CASCADE;

-- 2. PLAYER STATS TABLE
-- Stores persistent win/match counts keyed by stable client-generated player_id.
-- player_id is stored in localStorage (survives refresh on the same device/browser;
-- resets on storage clear or new device).
-- TODO: upgrade player_id to Supabase auth UID for cross-device persistence.
CREATE TABLE player_stats (
    player_id    TEXT PRIMARY KEY,             -- Stable localStorage UUID
    display_name TEXT NOT NULL DEFAULT 'Duelist',
    wins_5x5     INT  NOT NULL DEFAULT 0 CHECK (wins_5x5 >= 0),
    wins_10x10   INT  NOT NULL DEFAULT 0 CHECK (wins_10x10 >= 0),
    matches_played_5x5  INT NOT NULL DEFAULT 0 CHECK (matches_played_5x5 >= 0),
    matches_played_10x10 INT NOT NULL DEFAULT 0 CHECK (matches_played_10x10 >= 0),
    last_win_at  TIMESTAMPTZ,                  -- NULL until first win; used for tie-breaking
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PERFORMANCE INDEXES for top-50 leaderboard queries
CREATE INDEX idx_player_stats_wins_5x5   ON player_stats (wins_5x5 DESC, matches_played_5x5 ASC, last_win_at ASC);
CREATE INDEX idx_player_stats_wins_10x10 ON player_stats (wins_10x10 DESC, matches_played_10x10 ASC, last_win_at ASC);

-- 4. ROW LEVEL SECURITY
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read leaderboard data
CREATE POLICY "Allow public read player_stats" ON player_stats FOR SELECT USING (true);
-- No direct insert/update allowed — only through SECURITY DEFINER functions below

-- 5. UPSERT PLAYER STATS (helper called from call_number / claim_timeout_win)
-- Atomically increments match count for both players and win count for the winner only.
-- Safe to call from within a transaction alongside the game completion update.
CREATE OR REPLACE FUNCTION upsert_player_stats(
    p_player_id   TEXT,
    p_display_name TEXT,
    p_variant     TEXT,  -- '5x5' or '10x10'
    p_is_winner   BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Skip if no player_id provided (old client that doesn't send it)
    IF p_player_id IS NULL OR TRIM(p_player_id) = '' THEN
        RETURN;
    END IF;

    IF p_variant = '5x5' THEN
        INSERT INTO player_stats (player_id, display_name, wins_5x5, matches_played_5x5, last_win_at, updated_at)
        VALUES (
            p_player_id,
            COALESCE(NULLIF(TRIM(p_display_name), ''), 'Duelist'),
            CASE WHEN p_is_winner THEN 1 ELSE 0 END,
            1,
            CASE WHEN p_is_winner THEN NOW() ELSE NULL END,
            NOW()
        )
        ON CONFLICT (player_id) DO UPDATE
            SET display_name        = EXCLUDED.display_name,
                wins_5x5            = player_stats.wins_5x5 + (CASE WHEN p_is_winner THEN 1 ELSE 0 END),
                matches_played_5x5  = player_stats.matches_played_5x5 + 1,
                last_win_at         = CASE WHEN p_is_winner THEN NOW() ELSE player_stats.last_win_at END,
                updated_at          = NOW();
    ELSIF p_variant = '10x10' THEN
        INSERT INTO player_stats (player_id, display_name, wins_10x10, matches_played_10x10, last_win_at, updated_at)
        VALUES (
            p_player_id,
            COALESCE(NULLIF(TRIM(p_display_name), ''), 'Duelist'),
            CASE WHEN p_is_winner THEN 1 ELSE 0 END,
            1,
            CASE WHEN p_is_winner THEN NOW() ELSE NULL END,
            NOW()
        )
        ON CONFLICT (player_id) DO UPDATE
            SET display_name          = EXCLUDED.display_name,
                wins_10x10            = player_stats.wins_10x10 + (CASE WHEN p_is_winner THEN 1 ELSE 0 END),
                matches_played_10x10  = player_stats.matches_played_10x10 + 1,
                last_win_at           = CASE WHEN p_is_winner THEN NOW() ELSE player_stats.last_win_at END,
                updated_at            = NOW();
    END IF;
END;
$$;

-- 6. UPDATED CALL NUMBER RPC (adds optional player_id params for stat tracking)
-- The two new params default to NULL so the existing 3-param callsite in old clients
-- continues to work without stat tracking — no breaking change.
DROP FUNCTION IF EXISTS call_number(UUID, TEXT, INT);

CREATE OR REPLACE FUNCTION call_number(
    p_game_id              UUID,
    p_session_id           TEXT,
    p_number               INT,
    p_player_id            TEXT DEFAULT NULL,   -- stable localStorage UUID (winner attribution)
    p_opponent_player_id   TEXT DEFAULT NULL    -- stable localStorage UUID (loser match count)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_game RECORD;
    v_caller RECORD;
    v_opponent RECORD;
    v_next_seq INT;
    v_all_called INT[];
    v_caller_lines INT;
    v_opponent_lines INT;
    v_winner_id UUID := NULL;
    v_is_game_over BOOLEAN := FALSE;
    v_next_turn_id UUID;
    v_p1 RECORD;
    v_p2 RECORD;
    v_p1_lines INT;
    v_p2_lines INT;
    v_variant TEXT;
    v_max_number INT;
BEGIN
    -- 1. Validate Game
    SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Game not found';
    END IF;

    IF v_game.status <> 'playing' THEN
        RAISE EXCEPTION 'Game is not in playing state (current: %)', v_game.status;
    END IF;

    -- 2. Validate Caller
    SELECT * INTO v_caller FROM players WHERE game_id = p_game_id AND session_id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Player not found';
    END IF;

    -- 3. Strict Turn Enforcement
    IF v_game.current_turn_player_id <> v_caller.id THEN
        RAISE EXCEPTION 'It is not your turn to call a number';
    END IF;

    -- 4. Variant-Aware Number Range Validation
    v_variant := COALESCE(v_game.variant, CASE WHEN v_game.board_size = 10 THEN '10x10' ELSE '5x5' END);
    v_max_number := CASE WHEN v_variant = '10x10' OR v_game.board_size = 10 THEN 100 ELSE 25 END;

    IF p_number < 1 OR p_number > v_max_number THEN
        RAISE EXCEPTION 'Called number must be between 1 and %', v_max_number;
    END IF;

    -- 5. Duplicate Prevention
    IF EXISTS (SELECT 1 FROM called_numbers WHERE game_id = p_game_id AND number = p_number) THEN
        RAISE EXCEPTION 'Number % has already been called in this game', p_number;
    END IF;

    -- Find Opponent
    SELECT * INTO v_opponent FROM players WHERE game_id = p_game_id AND id <> v_caller.id;

    -- Determine Next Sequence
    SELECT COALESCE(MAX(sequence), 0) + 1 INTO v_next_seq FROM called_numbers WHERE game_id = p_game_id;

    -- Insert into called_numbers
    INSERT INTO called_numbers (game_id, number, called_by, sequence)
    VALUES (p_game_id, p_number, v_caller.id, v_next_seq);

    -- Gather all called numbers for line calculation
    SELECT ARRAY_AGG(number ORDER BY sequence ASC) INTO v_all_called
    FROM called_numbers
    WHERE game_id = p_game_id;

    -- Fetch P1 and P2
    SELECT * INTO v_p1 FROM players WHERE game_id = p_game_id AND player_number = 1;
    SELECT * INTO v_p2 FROM players WHERE game_id = p_game_id AND player_number = 2;

    -- Calculate lines for both
    v_p1_lines := calculate_lines(v_p1.board, v_all_called);
    v_p2_lines := calculate_lines(v_p2.board, v_all_called);

    -- Check win condition (>= target_lines)
    IF v_caller.player_number = 1 THEN
        v_caller_lines := v_p1_lines;
        v_opponent_lines := v_p2_lines;
    ELSE
        v_caller_lines := v_p2_lines;
        v_opponent_lines := v_p1_lines;
    END IF;

    IF v_caller_lines >= v_game.target_lines THEN
        v_winner_id := v_caller.id;
        v_is_game_over := TRUE;
    ELSIF v_opponent_lines >= v_game.target_lines THEN
        v_winner_id := v_opponent.id;
        v_is_game_over := TRUE;
    END IF;

    IF v_is_game_over THEN
        UPDATE games
        SET status = 'completed',
            winner_id = v_winner_id,
            current_turn_player_id = NULL,
            updated_at = NOW()
        WHERE id = p_game_id;
        v_next_turn_id := NULL;

        -- ── Atomic stat write on game completion ──────────────────────────────
        -- Determine variant from board size
        v_variant := CASE WHEN v_game.board_size = 10 THEN '10x10' ELSE '5x5' END;

        -- Determine winner and loser player_ids
        -- p_player_id = caller (the one who just called)
        -- p_opponent_player_id = the other player
        DECLARE
            v_winner_player_id TEXT;
            v_loser_player_id  TEXT;
            v_winner_display   TEXT;
            v_loser_display    TEXT;
        BEGIN
            IF v_winner_id = v_caller.id THEN
                v_winner_player_id := p_player_id;
                v_loser_player_id  := p_opponent_player_id;
                v_winner_display   := v_caller.display_name;
                v_loser_display    := v_opponent.display_name;
            ELSE
                v_winner_player_id := p_opponent_player_id;
                v_loser_player_id  := p_player_id;
                v_winner_display   := v_opponent.display_name;
                v_loser_display    := v_caller.display_name;
            END IF;

            -- Write winner stats (wins++ and matches_played++)
            PERFORM upsert_player_stats(v_winner_player_id, v_winner_display, v_variant, TRUE);
            -- Write loser stats (matches_played++ only)
            PERFORM upsert_player_stats(v_loser_player_id, v_loser_display, v_variant, FALSE);
        END;
        -- ─────────────────────────────────────────────────────────────────────
    ELSE
        -- Strict Alternating Turns: Switch to opponent
        v_next_turn_id := v_opponent.id;
        UPDATE games
        SET current_turn_player_id = v_next_turn_id,
            updated_at = NOW()
        WHERE id = p_game_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'number', p_number,
        'sequence', v_next_seq,
        'called_by', v_caller.id,
        'next_turn_player_id', v_next_turn_id,
        'winner_id', v_winner_id,
        'is_game_over', v_is_game_over,
        'p1_lines', v_p1_lines,
        'p2_lines', v_p2_lines,
        'all_called_count', cardinality(v_all_called)
    );
END;
$$;

-- 7. UPDATED CLAIM TIMEOUT WIN RPC (adds optional player_id params)
DROP FUNCTION IF EXISTS claim_timeout_win(UUID, TEXT);

CREATE OR REPLACE FUNCTION claim_timeout_win(
    p_game_id              UUID,
    p_session_id           TEXT,
    p_player_id            TEXT DEFAULT NULL,   -- stable localStorage UUID (winner)
    p_opponent_player_id   TEXT DEFAULT NULL    -- stable localStorage UUID (forfeiting player)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_game RECORD;
    v_caller RECORD;
    v_opponent RECORD;
    v_variant TEXT;
BEGIN
    SELECT * INTO v_game FROM games WHERE id = p_game_id;
    IF NOT FOUND OR v_game.status <> 'playing' THEN
        RAISE EXCEPTION 'Game not in active playing state';
    END IF;

    SELECT * INTO v_caller FROM players WHERE game_id = p_game_id AND session_id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Player not found';
    END IF;

    SELECT * INTO v_opponent FROM players WHERE game_id = p_game_id AND id <> v_caller.id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Opponent not found';
    END IF;

    IF v_opponent.last_seen_at > (NOW() - INTERVAL '60 seconds') AND v_opponent.connected = TRUE THEN
        RAISE EXCEPTION 'Opponent is still connected or timeout (60s) has not elapsed';
    END IF;

    -- Award win to caller due to forfeit/disconnect
    UPDATE games
    SET status = 'completed',
        winner_id = v_caller.id,
        current_turn_player_id = NULL,
        updated_at = NOW()
    WHERE id = p_game_id;

    -- ── Atomic stat write on timeout win ─────────────────────────────────────
    v_variant := CASE WHEN v_game.board_size = 10 THEN '10x10' ELSE '5x5' END;
    PERFORM upsert_player_stats(p_player_id, v_caller.display_name, v_variant, TRUE);
    PERFORM upsert_player_stats(p_opponent_player_id, v_opponent.display_name, v_variant, FALSE);
    -- ─────────────────────────────────────────────────────────────────────────

    RETURN jsonb_build_object(
        'success', TRUE,
        'winner_id', v_caller.id,
        'reason', 'timeout'
    );
END;
$$;

-- 8. GET LEADERBOARD RPC
-- Returns top p_limit players for the given variant, with compound tie-breaking:
--   1. wins DESC            (primary: most wins first)
--   2. matches_played ASC   (secondary: better win-rate — fewer matches for same wins)
--   3. last_win_at ASC      (tertiary: earlier achiever wins tie)
CREATE OR REPLACE FUNCTION get_leaderboard(
    p_variant TEXT,      -- '5x5' or '10x10'
    p_limit   INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF p_variant = '5x5' THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'rank',           row_number() OVER (),
                'player_id',      player_id,
                'display_name',   display_name,
                'wins',           wins_5x5,
                'matches_played', matches_played_5x5,
                'last_win_at',    last_win_at
            )
        )
        INTO v_result
        FROM (
            SELECT *
            FROM player_stats
            WHERE wins_5x5 > 0
            ORDER BY wins_5x5 DESC, matches_played_5x5 ASC, last_win_at ASC
            LIMIT p_limit
        ) ranked;
    ELSIF p_variant = '10x10' THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'rank',           row_number() OVER (),
                'player_id',      player_id,
                'display_name',   display_name,
                'wins',           wins_10x10,
                'matches_played', matches_played_10x10,
                'last_win_at',    last_win_at
            )
        )
        INTO v_result
        FROM (
            SELECT *
            FROM player_stats
            WHERE wins_10x10 > 0
            ORDER BY wins_10x10 DESC, matches_played_10x10 ASC, last_win_at ASC
            LIMIT p_limit
        ) ranked;
    ELSE
        RAISE EXCEPTION 'Invalid variant: must be "5x5" or "10x10"';
    END IF;

    RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- 9. GET PLAYER RANK RPC
-- Returns a single player's rank and win count for the "Your Rank" sticky strip.
-- Uses a window function to get rank even if the player is outside the top 50.
CREATE OR REPLACE FUNCTION get_player_rank(
    p_player_id TEXT,
    p_variant   TEXT   -- '5x5' or '10x10'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rank    BIGINT;
    v_wins    INT;
    v_matches INT;
BEGIN
    IF p_variant = '5x5' THEN
        SELECT ranked.rn, ranked.wins_5x5, ranked.matches_played_5x5
        INTO v_rank, v_wins, v_matches
        FROM (
            SELECT
                player_id,
                wins_5x5,
                matches_played_5x5,
                RANK() OVER (ORDER BY wins_5x5 DESC, matches_played_5x5 ASC, last_win_at ASC) AS rn
            FROM player_stats
            WHERE wins_5x5 > 0
        ) ranked
        WHERE ranked.player_id = p_player_id;
    ELSIF p_variant = '10x10' THEN
        SELECT ranked.rn, ranked.wins_10x10, ranked.matches_played_10x10
        INTO v_rank, v_wins, v_matches
        FROM (
            SELECT
                player_id,
                wins_10x10,
                matches_played_10x10,
                RANK() OVER (ORDER BY wins_10x10 DESC, matches_played_10x10 ASC, last_win_at ASC) AS rn
            FROM player_stats
            WHERE wins_10x10 > 0
        ) ranked
        WHERE ranked.player_id = p_player_id;
    END IF;

    IF v_rank IS NULL THEN
        RETURN NULL;  -- Player has no wins in this variant yet
    END IF;

    RETURN jsonb_build_object(
        'rank', v_rank,
        'wins', COALESCE(v_wins, 0),
        'matches_played', COALESCE(v_matches, 0)
    );
END;
$$;

-- 10. GRANT EXECUTE PERMISSIONS
GRANT EXECUTE ON FUNCTION upsert_player_stats(TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION call_number(UUID, TEXT, INT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_timeout_win(UUID, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_leaderboard(TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_player_rank(TEXT, TEXT) TO anon, authenticated;
GRANT SELECT ON player_stats TO anon, authenticated;
