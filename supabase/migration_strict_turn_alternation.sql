-- ==============================================================================
-- BINGO DUEL - MIGRATION: STRICT TURN ALTERNATION & SERVER-SIDE TURN GUARD
-- Resolves turn alternation bugs, eliminates out-of-turn calls, supports 5x5 & 10x10
-- ==============================================================================

-- 1. Ensure columns exist on games table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'board_size') THEN
        ALTER TABLE games ADD COLUMN board_size INT NOT NULL DEFAULT 5;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'variant') THEN
        ALTER TABLE games ADD COLUMN variant TEXT NOT NULL DEFAULT '5x5';
    END IF;
END $$;

-- 2. Update called_numbers constraint to support up to 100 for 10x10 variant
ALTER TABLE called_numbers DROP CONSTRAINT IF EXISTS called_numbers_number_check;
ALTER TABLE called_numbers ADD CONSTRAINT called_numbers_number_check CHECK (number >= 1 AND number <= 100);

-- 3. Update calculate_lines to support dynamic board size (5x5 or 10x10)
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
    v_size INT;
    v_total INT;
    r INT;
    c INT;
    row_complete BOOLEAN;
    col_complete BOOLEAN;
    d1_complete BOOLEAN;
    d2_complete BOOLEAN;
BEGIN
    IF p_board IS NULL OR p_called_numbers IS NULL THEN
        RETURN 0;
    END IF;

    v_total := jsonb_array_length(p_board);
    IF v_total = 100 THEN
        v_size := 10;
    ELSIF v_total = 25 THEN
        v_size := 5;
    ELSE
        RETURN 0;
    END IF;

    SELECT ARRAY(SELECT jsonb_array_elements_text(p_board)::INT) INTO v_board;

    -- Rows
    FOR r IN 0..(v_size - 1) LOOP
        row_complete := TRUE;
        FOR c IN 0..(v_size - 1) LOOP
            IF NOT (v_board[r * v_size + c + 1] = ANY(p_called_numbers)) THEN
                row_complete := FALSE;
                EXIT;
            END IF;
        END LOOP;
        IF row_complete THEN
            v_lines := v_lines + 1;
        END IF;
    END LOOP;

    -- Columns
    FOR c IN 0..(v_size - 1) LOOP
        col_complete := TRUE;
        FOR r IN 0..(v_size - 1) LOOP
            IF NOT (v_board[r * v_size + c + 1] = ANY(p_called_numbers)) THEN
                col_complete := FALSE;
                EXIT;
            END IF;
        END LOOP;
        IF col_complete THEN
            v_lines := v_lines + 1;
        END IF;
    END LOOP;

    -- Diagonal 1 (top-left to bottom-right)
    d1_complete := TRUE;
    FOR r IN 0..(v_size - 1) LOOP
        IF NOT (v_board[r * v_size + r + 1] = ANY(p_called_numbers)) THEN
            d1_complete := FALSE;
            EXIT;
        END IF;
    END LOOP;
    IF d1_complete THEN
        v_lines := v_lines + 1;
    END IF;

    -- Diagonal 2 (top-right to bottom-left)
    d2_complete := TRUE;
    FOR r IN 0..(v_size - 1) LOOP
        IF NOT (v_board[r * v_size + (v_size - 1 - r) + 1] = ANY(p_called_numbers)) THEN
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

-- 4. SET PLAYER BOARD RPC
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
    v_expected_count INT;
    v_num_count INT;
    v_distinct_count INT;
    v_all_ready BOOLEAN := FALSE;
    v_p1 RECORD;
    v_p2 RECORD;
    v_first_turn_id UUID := NULL;
    v_variant TEXT;
BEGIN
    SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Game not found';
    END IF;

    SELECT * INTO v_player FROM players WHERE game_id = p_game_id AND session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Player not found in this game';
    END IF;

    v_variant := COALESCE(v_game.variant, CASE WHEN v_game.board_size = 10 THEN '10x10' ELSE '5x5' END);
    v_expected_count := CASE WHEN v_variant = '10x10' OR v_game.board_size = 10 THEN 100 ELSE 25 END;

    IF p_board IS NULL OR jsonb_array_length(p_board) <> v_expected_count THEN
        RAISE EXCEPTION 'Board must contain exactly % numbers', v_expected_count;
    END IF;

    SELECT COUNT(*), COUNT(DISTINCT (val::INT))
    INTO v_num_count, v_distinct_count
    FROM jsonb_array_elements_text(p_board) AS val
    WHERE (val::INT) >= 1 AND (val::INT) <= v_expected_count;

    IF v_num_count <> v_expected_count OR v_distinct_count <> v_expected_count THEN
        RAISE EXCEPTION 'All numbers must be between 1 and % with no duplicates', v_expected_count;
    END IF;

    UPDATE players
    SET board = p_board,
        is_ready = TRUE,
        last_seen_at = NOW()
    WHERE id = v_player.id;

    SELECT * INTO v_p1 FROM players WHERE game_id = p_game_id AND player_number = 1;
    SELECT * INTO v_p2 FROM players WHERE game_id = p_game_id AND player_number = 2;

    IF v_p1.is_ready = TRUE AND v_p2.is_ready = TRUE THEN
        v_all_ready := TRUE;
        -- Player 1 (Host) ALWAYS goes first
        v_first_turn_id := v_p1.id;

        UPDATE games
        SET status = 'playing',
            current_turn_player_id = v_first_turn_id,
            updated_at = NOW()
        WHERE id = p_game_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'player_id', v_player.id,
        'is_ready', TRUE,
        'all_ready', v_all_ready,
        'current_turn_player_id', v_first_turn_id,
        'status', CASE WHEN v_all_ready THEN 'playing' ELSE v_game.status END,
        'game_status', CASE WHEN v_all_ready THEN 'playing' ELSE v_game.status END,
        'board_size', v_game.board_size,
        'variant', v_variant
    );
END;
$$;

-- 5. CALL NUMBER RPC (Strict Server-Side Turn Enforcement & Deterministic Alternation)
DROP FUNCTION IF EXISTS call_number(UUID, TEXT, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS call_number(UUID, TEXT, INT);

CREATE OR REPLACE FUNCTION call_number(
    p_game_id              UUID,
    p_session_id           TEXT,
    p_number               INT,
    p_player_id            TEXT DEFAULT NULL,
    p_opponent_player_id   TEXT DEFAULT NULL
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
    v_next_turn_id UUID := NULL;
    v_p1 RECORD;
    v_p2 RECORD;
    v_p1_lines INT := 0;
    v_p2_lines INT := 0;
    v_variant TEXT;
    v_max_number INT;
BEGIN
    -- 1. Validate Game with Row Lock
    SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Game not found';
    END IF;

    IF v_game.status <> 'playing' THEN
        RAISE EXCEPTION 'Game is not in playing state (current: %)', v_game.status;
    END IF;

    -- 2. Validate Caller
    SELECT * INTO v_caller FROM players WHERE game_id = p_game_id AND session_id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Player not found';
    END IF;

    -- 3. Strict Server-Side Turn Guard (Rejects when NULL or when caller does not match)
    IF v_game.current_turn_player_id IS NULL OR v_game.current_turn_player_id <> v_caller.id THEN
        RAISE EXCEPTION 'It is not your turn to call a number (current turn: %, caller: %)',
            COALESCE(v_game.current_turn_player_id::TEXT, 'none'), v_caller.id::TEXT;
    END IF;

    -- 4. Variant-Aware Number Range Validation
    v_variant := COALESCE(v_game.variant, CASE WHEN v_game.board_size = 10 THEN '10x10' ELSE '5x5' END);
    v_max_number := CASE WHEN v_variant = '10x10' OR v_game.board_size = 10 THEN 100 ELSE 25 END;

    IF p_number < 1 OR p_number > v_max_number THEN
        RAISE EXCEPTION 'Called number must be between 1 and %', v_max_number;
    END IF;

    -- 5. Duplicate Call Prevention
    IF EXISTS (SELECT 1 FROM called_numbers WHERE game_id = p_game_id AND number = p_number) THEN
        RAISE EXCEPTION 'Number % has already been called in this game', p_number;
    END IF;

    -- 6. Deterministic Opponent Resolution (Player 1 -> Player 2, Player 2 -> Player 1)
    SELECT * INTO v_opponent
    FROM players
    WHERE game_id = p_game_id AND player_number = (3 - v_caller.player_number);

    IF v_opponent.id IS NULL THEN
        -- Fallback: any player row with different id
        SELECT * INTO v_opponent FROM players WHERE game_id = p_game_id AND id <> v_caller.id LIMIT 1;
    END IF;

    IF v_opponent.id IS NULL THEN
        RAISE EXCEPTION 'Opponent player not found in game %', p_game_id;
    END IF;

    -- 7. Insert Called Number
    SELECT COALESCE(MAX(sequence), 0) + 1 INTO v_next_seq FROM called_numbers WHERE game_id = p_game_id;

    INSERT INTO called_numbers (game_id, number, called_by, sequence)
    VALUES (p_game_id, p_number, v_caller.id, v_next_seq);

    -- 8. Calculate Lines / Strikes
    SELECT ARRAY_AGG(number ORDER BY sequence ASC) INTO v_all_called
    FROM called_numbers
    WHERE game_id = p_game_id;

    SELECT * INTO v_p1 FROM players WHERE game_id = p_game_id AND player_number = 1;
    SELECT * INTO v_p2 FROM players WHERE game_id = p_game_id AND player_number = 2;

    IF v_p1.board IS NOT NULL THEN
        v_p1_lines := calculate_lines(v_p1.board, v_all_called);
    END IF;
    IF v_p2.board IS NOT NULL THEN
        v_p2_lines := calculate_lines(v_p2.board, v_all_called);
    END IF;

    IF v_caller.player_number = 1 THEN
        v_caller_lines := v_p1_lines;
        v_opponent_lines := v_p2_lines;
    ELSE
        v_caller_lines := v_p2_lines;
        v_opponent_lines := v_p1_lines;
    END IF;

    -- 9. Check Win Condition
    IF v_caller_lines >= v_game.target_lines THEN
        v_winner_id := v_caller.id;
        v_is_game_over := TRUE;
    ELSIF v_opponent_lines >= v_game.target_lines THEN
        v_winner_id := v_opponent.id;
        v_is_game_over := TRUE;
    END IF;

    -- 10. Update Game State & Turn Alternation
    IF v_is_game_over THEN
        UPDATE games
        SET status = 'completed',
            winner_id = v_winner_id,
            current_turn_player_id = NULL,
            updated_at = NOW()
        WHERE id = p_game_id;
        v_next_turn_id := NULL;
    ELSE
        -- Strict Alternating Turns: Durably pass turn to opponent
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

-- Backward-compatible 3-argument wrapper
CREATE OR REPLACE FUNCTION call_number(
    p_game_id UUID,
    p_session_id TEXT,
    p_number INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN call_number(p_game_id, p_session_id, p_number, NULL, NULL);
END;
$$;

-- 6. GET GAME STATE RPC (Reliable Turn State Reporting)
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
    v_variant TEXT;
BEGIN
    SELECT * INTO v_game FROM games WHERE id = p_game_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_variant := COALESCE(v_game.variant, CASE WHEN v_game.board_size = 10 THEN '10x10' ELSE '5x5' END);

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
            'board_size', COALESCE(v_game.board_size, CASE WHEN v_variant = '10x10' THEN 10 ELSE 5 END),
            'variant', v_variant,
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
            'lines_completed', v_p1_lines
        ) ELSE NULL END,
        'p2', CASE WHEN v_p2.id IS NOT NULL THEN jsonb_build_object(
            'id', v_p2.id,
            'display_name', v_p2.display_name,
            'player_number', 2,
            'board', CASE WHEN v_caller.player_number = 2 OR v_game.status = 'completed' THEN v_p2.board ELSE NULL END,
            'is_ready', v_p2.is_ready,
            'connected', v_p2.connected,
            'lines_completed', v_p2_lines
        ) ELSE NULL END,
        'called_numbers', v_called
    );
END;
$$;

-- 7. Grant Permissions
GRANT EXECUTE ON FUNCTION set_player_board(UUID, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION call_number(UUID, TEXT, INT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION call_number(UUID, TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_game_state(UUID, TEXT) TO anon, authenticated;
