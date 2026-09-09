-- ==============================================================================
-- BINGO DUEL - SUPABASE DATABASE SCHEMA & REALTIME ENGINE
-- 2-Player Real-time Synchronized Competitive Bingo
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. DROP EXISTING OBJECTS (Clean Migration)
DROP FUNCTION IF EXISTS call_number(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS calculate_lines(JSONB, INT[]);
DROP FUNCTION IF EXISTS set_player_board(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS join_game(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_game(TEXT, TEXT);
DROP FUNCTION IF EXISTS claim_timeout_win(UUID, TEXT);
DROP FUNCTION IF EXISTS heartbeat(UUID, TEXT);
DROP FUNCTION IF EXISTS get_game_state(UUID, TEXT);
DROP FUNCTION IF EXISTS generate_room_code();

DROP TABLE IF EXISTS called_numbers CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS games CASCADE;

-- 2. CREATE TABLES

-- Games Table
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'playing', 'completed', 'abandoned')),
    current_turn_player_id UUID,
    winner_id UUID,
    target_lines INT NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Players Table
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    board JSONB, -- Array of 25 numbers: [1, 14, 3, 22, 9, ...]
    is_ready BOOLEAN NOT NULL DEFAULT FALSE,
    player_number INT NOT NULL CHECK (player_number IN (1, 2)),
    connected BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (game_id, player_number)
);

-- Called Numbers Table
CREATE TABLE called_numbers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    number INT NOT NULL CHECK (number >= 1 AND number <= 25),
    called_by UUID REFERENCES players(id) ON DELETE SET NULL,
    sequence INT NOT NULL,
    called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (game_id, number),
    UNIQUE (game_id, sequence)
);

-- Add Foreign Key Constraints to Games table for player references
ALTER TABLE games
    ADD CONSTRAINT fk_games_turn_player FOREIGN KEY (current_turn_player_id) REFERENCES players(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_games_winner FOREIGN KEY (winner_id) REFERENCES players(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX idx_games_room_code ON games(room_code);
CREATE INDEX idx_players_game_session ON players(game_id, session_id);
CREATE INDEX idx_called_numbers_game_seq ON called_numbers(game_id, sequence);

-- 3. ROW LEVEL SECURITY (RLS)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE called_numbers ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read access so clients can query game states
CREATE POLICY "Allow public read games" ON games FOR SELECT USING (true);
CREATE POLICY "Allow public read players" ON players FOR SELECT USING (true);
CREATE POLICY "Allow public read called_numbers" ON called_numbers FOR SELECT USING (true);

-- Enable Realtime Broadcast / Publication for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE games, players, called_numbers;

-- 4. UTILITY & SERVER-SIDE RPC FUNCTIONS

-- Generate a short, unique 4-character room code (avoiding confusing chars: 0, O, 1, I)
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    chars TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    result TEXT := '';
    i INT;
BEGIN
    FOR i IN 1..4 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::INT, 1);
    END LOOP;
    RETURN result;
END;
$$;

-- CREATE GAME RPC
CREATE OR REPLACE FUNCTION create_game(
    p_session_id TEXT,
    p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room_code TEXT;
    v_game_id UUID;
    v_player_id UUID;
    v_attempts INT := 0;
BEGIN
    LOOP
        v_room_code := generate_room_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM games WHERE room_code = v_room_code AND status IN ('waiting', 'ready', 'playing'));
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN
            RAISE EXCEPTION 'Could not generate unique room code, please retry';
        END IF;
    END LOOP;

    INSERT INTO games (room_code, status, target_lines)
    VALUES (v_room_code, 'waiting', 5)
    RETURNING id INTO v_game_id;

    INSERT INTO players (game_id, session_id, display_name, player_number, is_ready, connected, last_seen_at)
    VALUES (v_game_id, p_session_id, COALESCE(NULLIF(TRIM(p_display_name), ''), 'Host'), 1, FALSE, TRUE, NOW())
    RETURNING id INTO v_player_id;

    RETURN jsonb_build_object(
        'game_id', v_game_id,
        'room_code', v_room_code,
        'player_id', v_player_id,
        'player_number', 1,
        'status', 'waiting'
    );
END;
$$;

-- JOIN GAME RPC
CREATE OR REPLACE FUNCTION join_game(
    p_room_code TEXT,
    p_session_id TEXT,
    p_display_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_game RECORD;
    v_player_id UUID;
    v_existing_player RECORD;
    v_player_count INT;
BEGIN
    SELECT * INTO v_game FROM games WHERE UPPER(room_code) = UPPER(p_room_code);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Room % not found', p_room_code;
    END IF;

    -- Check if this session is already a player in this game (re-join)
    SELECT * INTO v_existing_player FROM players WHERE game_id = v_game.id AND session_id = p_session_id;
    IF FOUND THEN
        UPDATE players SET connected = TRUE, last_seen_at = NOW() WHERE id = v_existing_player.id;
        RETURN jsonb_build_object(
            'game_id', v_game.id,
            'room_code', v_game.room_code,
            'player_id', v_existing_player.id,
            'player_number', v_existing_player.player_number,
            'status', v_game.status,
            'is_reconnect', TRUE
        );
    END IF;

    -- If not rejoining, verify game is not completed or abandoned
    IF v_game.status IN ('completed', 'abandoned') THEN
        RAISE EXCEPTION 'Game % has already ended', p_room_code;
    END IF;

    SELECT COUNT(*) INTO v_player_count FROM players WHERE game_id = v_game.id;
    IF v_player_count >= 2 THEN
        RAISE EXCEPTION 'Room % is already full (2 players maximum)', p_room_code;
    END IF;

    -- Insert Player 2
    INSERT INTO players (game_id, session_id, display_name, player_number, is_ready, connected, last_seen_at)
    VALUES (v_game.id, p_session_id, COALESCE(NULLIF(TRIM(p_display_name), ''), 'Challenger'), 2, FALSE, TRUE, NOW())
    RETURNING id INTO v_player_id;

    -- Update game status to ready
    UPDATE games SET status = 'ready', updated_at = NOW() WHERE id = v_game.id;

    RETURN jsonb_build_object(
        'game_id', v_game.id,
        'room_code', v_game.room_code,
        'player_id', v_player_id,
        'player_number', 2,
        'status', 'ready',
        'is_reconnect', FALSE
    );
END;
$$;

-- LINE CALCULATION HELPER
-- Computes the number of completed lines on a 5x5 board given an array of called numbers
CREATE OR REPLACE FUNCTION calculate_lines(
    p_board JSONB,
    p_called_numbers INT[]
)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_board INT[];
    v_lines INT := 0;
    r INT;
    c INT;
    row_complete BOOLEAN;
    col_complete BOOLEAN;
    d1_complete BOOLEAN;
    d2_complete BOOLEAN;
BEGIN
    IF p_board IS NULL OR jsonb_array_length(p_board) <> 25 OR p_called_numbers IS NULL OR cardinality(p_called_numbers) < 5 THEN
        RETURN 0;
    END IF;

    -- Convert JSONB array to Postgres INT array
    SELECT ARRAY(SELECT jsonb_array_elements_text(p_board)::INT) INTO v_board;

    -- 1. Check 5 Rows
    FOR r IN 0..4 LOOP
        row_complete := TRUE;
        FOR c IN 0..4 LOOP
            IF NOT (v_board[r * 5 + c + 1] = ANY(p_called_numbers)) THEN
                row_complete := FALSE;
                EXIT;
            END IF;
        END LOOP;
        IF row_complete THEN
            v_lines := v_lines + 1;
        END IF;
    END LOOP;

    -- 2. Check 5 Columns
    FOR c IN 0..4 LOOP
        col_complete := TRUE;
        FOR r IN 0..4 LOOP
            IF NOT (v_board[r * 5 + c + 1] = ANY(p_called_numbers)) THEN
                col_complete := FALSE;
                EXIT;
            END IF;
        END LOOP;
        IF col_complete THEN
            v_lines := v_lines + 1;
        END IF;
    END LOOP;

    -- 3. Check Diagonal 1 (top-left to bottom-right: 0, 6, 12, 18, 24)
    d1_complete := TRUE;
    FOR r IN 0..4 LOOP
        IF NOT (v_board[r * 5 + r + 1] = ANY(p_called_numbers)) THEN
            d1_complete := FALSE;
            EXIT;
        END IF;
    END LOOP;
    IF d1_complete THEN
        v_lines := v_lines + 1;
    END IF;

    -- 4. Check Diagonal 2 (top-right to bottom-left: 4, 8, 12, 16, 20)
    d2_complete := TRUE;
    FOR r IN 0..4 LOOP
        IF NOT (v_board[r * 5 + (4 - r) + 1] = ANY(p_called_numbers)) THEN
            d2_complete := FALSE;
            EXIT;
        END IF;
    END LOOP;
    IF d2_complete THEN
        v_lines := v_lines + 1;
    END IF;

    RETURN v_lines;
END;
$$;

-- SET PLAYER BOARD & READY STATE RPC
CREATE OR REPLACE FUNCTION set_player_board(
    p_game_id UUID,
    p_session_id TEXT,
    p_board JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_player RECORD;
    v_game RECORD;
    v_num_count INT;
    v_distinct_count INT;
    v_other_ready BOOLEAN;
    v_p1_id UUID;
    v_all_ready BOOLEAN := FALSE;
BEGIN
    SELECT * INTO v_game FROM games WHERE id = p_game_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Game not found';
    END IF;

    SELECT * INTO v_player FROM players WHERE game_id = p_game_id AND session_id = p_session_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Player not found in this game';
    END IF;

    -- Validate board structure: exactly 25 numbers, 1-25 with no repeats
    IF p_board IS NULL OR jsonb_array_length(p_board) <> 25 THEN
        RAISE EXCEPTION 'Board must contain exactly 25 numbers';
    END IF;

    SELECT COUNT(*), COUNT(DISTINCT (val::INT))
    INTO v_num_count, v_distinct_count
    FROM jsonb_array_elements_text(p_board) AS val
    WHERE (val::INT) >= 1 AND (val::INT) <= 25;

    IF v_num_count <> 25 OR v_distinct_count <> 25 THEN
        RAISE EXCEPTION 'Board must contain all numbers from 1 to 25 with no duplicates';
    END IF;

    -- Update player board and set ready
    UPDATE players
    SET board = p_board, is_ready = TRUE, last_seen_at = NOW()
    WHERE id = v_player.id;

    -- Check if opponent is also ready
    SELECT is_ready INTO v_other_ready
    FROM players
    WHERE game_id = p_game_id AND id <> v_player.id;

    IF v_other_ready = TRUE THEN
        v_all_ready := TRUE;
        -- Both ready: start game! Player 1 starts
        SELECT id INTO v_p1_id FROM players WHERE game_id = p_game_id AND player_number = 1;

        UPDATE games
        SET status = 'playing',
            current_turn_player_id = v_p1_id,
            updated_at = NOW()
        WHERE id = p_game_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'is_ready', TRUE,
        'all_ready', v_all_ready,
        'game_status', CASE WHEN v_all_ready THEN 'playing' ELSE v_game.status END,
        'current_turn_player_id', CASE WHEN v_all_ready THEN v_p1_id ELSE NULL END
    );
END;
$$;

-- CALL NUMBER RPC (STRICT SERVER-SIDE VALIDATION & WIN DETECTION)
CREATE OR REPLACE FUNCTION call_number(
    p_game_id UUID,
    p_session_id TEXT,
    p_number INT
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

    -- 4. Validate Number Range
    IF p_number < 1 OR p_number > 25 THEN
        RAISE EXCEPTION 'Called number must be between 1 and 25';
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

    -- Check win condition (>= 5 lines)
    IF v_caller.player_number = 1 THEN
        v_caller_lines := v_p1_lines;
        v_opponent_lines := v_p2_lines;
    ELSE
        v_caller_lines := v_p2_lines;
        v_opponent_lines := v_p1_lines;
    END IF;

    IF v_caller_lines >= v_game.target_lines THEN
        -- Caller won!
        v_winner_id := v_caller.id;
        v_is_game_over := TRUE;
    ELSIF v_opponent_lines >= v_game.target_lines THEN
        -- Opponent reached 5 lines on this call
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

-- CLAIM TIMEOUT WIN RPC
CREATE OR REPLACE FUNCTION claim_timeout_win(
    p_game_id UUID,
    p_session_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_game RECORD;
    v_caller RECORD;
    v_opponent RECORD;
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

    RETURN jsonb_build_object(
        'success', TRUE,
        'winner_id', v_caller.id,
        'reason', 'timeout'
    );
END;
$$;

-- HEARTBEAT & PRESENCE RPC
CREATE OR REPLACE FUNCTION heartbeat(
    p_game_id UUID,
    p_session_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE players
    SET last_seen_at = NOW(), connected = TRUE
    WHERE game_id = p_game_id AND session_id = p_session_id;

    RETURN jsonb_build_object('success', TRUE, 'timestamp', NOW());
END;
$$;

-- GET FULL GAME STATE RPC (SOURCE OF TRUTH REHYDRATION)
CREATE OR REPLACE FUNCTION get_game_state(
    p_game_id UUID,
    p_session_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_game RECORD;
    v_p1 RECORD;
    v_p2 RECORD;
    v_caller RECORD;
    v_called JSONB;
    v_all_called_nums INT[];
    v_p1_lines INT := 0;
    v_p2_lines INT := 0;
BEGIN
    SELECT * INTO v_game FROM games WHERE id = p_game_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_caller FROM players WHERE game_id = p_game_id AND session_id = p_session_id;
    SELECT * INTO v_p1 FROM players WHERE game_id = p_game_id AND player_number = 1;
    SELECT * INTO v_p2 FROM players WHERE game_id = p_game_id AND player_number = 2;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'number', number,
        'called_by', called_by,
        'sequence', sequence,
        'called_at', called_at
    ) ORDER BY sequence ASC), '[]'::JSONB)
    INTO v_called
    FROM called_numbers
    WHERE game_id = p_game_id;

    SELECT ARRAY_AGG(number ORDER BY sequence ASC) INTO v_all_called_nums
    FROM called_numbers
    WHERE game_id = p_game_id;

    IF v_all_called_nums IS NOT NULL THEN
        IF v_p1.board IS NOT NULL THEN
            v_p1_lines := calculate_lines(v_p1.board, v_all_called_nums);
        END IF;
        IF v_p2.board IS NOT NULL THEN
            v_p2_lines := calculate_lines(v_p2.board, v_all_called_nums);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'game', jsonb_build_object(
            'id', v_game.id,
            'room_code', v_game.room_code,
            'status', v_game.status,
            'current_turn_player_id', v_game.current_turn_player_id,
            'winner_id', v_game.winner_id,
            'target_lines', v_game.target_lines,
            'created_at', v_game.created_at
        ),
        'player', CASE WHEN v_caller.id IS NOT NULL THEN jsonb_build_object(
            'id', v_caller.id,
            'session_id', v_caller.session_id,
            'display_name', v_caller.display_name,
            'player_number', v_caller.player_number,
            'board', v_caller.board,
            'is_ready', v_caller.is_ready,
            'connected', v_caller.connected
        ) ELSE NULL END,
        'p1', CASE WHEN v_p1.id IS NOT NULL THEN jsonb_build_object(
            'id', v_p1.id,
            'display_name', v_p1.display_name,
            'player_number', 1,
            'board', CASE WHEN v_caller.player_number = 1 OR v_game.status = 'completed' THEN v_p1.board ELSE NULL END,
            'is_ready', v_p1.is_ready,
            'connected', v_p1.connected,
            'lines_completed', v_p1_lines,
            'last_seen_at', v_p1.last_seen_at
        ) ELSE NULL END,
        'p2', CASE WHEN v_p2.id IS NOT NULL THEN jsonb_build_object(
            'id', v_p2.id,
            'display_name', v_p2.display_name,
            'player_number', 2,
            'board', CASE WHEN v_caller.player_number = 2 OR v_game.status = 'completed' THEN v_p2.board ELSE NULL END,
            'is_ready', v_p2.is_ready,
            'connected', v_p2.connected,
            'lines_completed', v_p2_lines,
            'last_seen_at', v_p2.last_seen_at
        ) ELSE NULL END,
        'called_numbers', v_called,
        'p1_lines', v_p1_lines,
        'p2_lines', v_p2_lines
    );
END;
$$;

-- 5. EXPLICIT SECURITY & EXECUTION PERMISSIONS
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_game(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION join_game(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_player_board(UUID, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION call_number(UUID, TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_timeout_win(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION heartbeat(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_game_state(UUID, TEXT) TO anon, authenticated;

