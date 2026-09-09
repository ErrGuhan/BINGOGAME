# BINGO (BingoDuel) — Real-Time 1v1 Competitive Mobile Web Game

A high-stakes, real-time 1v1 competitive Bingo web application designed from **Google Stitch** (`BingoDuel`) and built with **Next.js (App Router)**, **Tailwind CSS**, and **Supabase (PostgreSQL + Realtime Broadcast)**.

Optimized for low-latency sub-300ms perceived round-trip play on mobile networks.

---

## ⚡ Key Features

- **Imported Google Stitch Design**: Dark mode cosmic arena, glassmorphism substrates, electric cyan (`#00F5D4`), vivid violet (`#A855F7`), and amber glowing accents.
- **5x5 Matrix (1-25 Numbers)**: Both players place numbers 1-25 with no repeats (manual drafting or instant 1-tap auto-fill).
- **Strict Server-Side Validation**:
  - Turns strictly alternate (enforced server-side via Supabase RPC).
  - Duplicate-call prevention.
  - Server-side win condition: first player to complete **5 lines** (rows, columns, diagonals) wins.
- **Ultra-Low Latency (<300ms perceived)**:
  - Optimistic UI updates on tap with rollback if server rejects.
  - Supabase Realtime **Broadcast channels** for instant sub-100ms peer-to-peer event transmission.
  - Zero-latency synthesized audio using the **Web Audio API** (no audio file download delay).
  - Mobile haptic feedback via `navigator.vibrate`.
- **Ephemeral Session Persistence**:
  - No login required. Ephemeral session IDs in `localStorage` preserve game state across page refreshes and reconnection.
- **Dual Engine**:
  - Runs natively with real Supabase Postgres + Realtime.
  - Automatic fallback in-memory Realtime simulation across browser tabs when Supabase credentials are not yet configured, allowing 100% full multi-tab testing immediately!

---

## 🚀 Getting Started (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

> **💡 Multi-Tab Duel Testing**:
> Open two browser windows side-by-side:
> 1. In Window A, tap **"Create Game"** -> note the 4-letter room code (e.g. `7XQ2`).
> 2. In Window B, tap **"Join Game"** -> enter the code.
> 3. Confirm boards on both windows. The match starts instantly!
> 4. Take turns calling numbers in real time.

---

## 🗄️ Supabase Backend Configuration

To connect the application to your live Supabase project:

1. Go to [Supabase](https://supabase.com) and create a new project.
2. Open the **SQL Editor** in your Supabase project dashboard.
3. Open [`supabase/schema.sql`](supabase/schema.sql), copy its entire contents, paste it into the SQL editor, and click **Run**.
   - This creates the `games`, `players`, and `called_numbers` tables.
   - Configures RLS policies and Realtime publications.
   - Installs all secure server-side RPC functions (`create_game`, `join_game`, `set_player_board`, `call_number`, `get_game_state`, `claim_timeout_win`, `heartbeat`).
4. Copy your project URL and anon public key from **Project Settings > API**.
5. Create a `.env.local` file in the project root:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```
6. Restart your Next.js dev server:
   ```bash
   npm run dev
   ```

---

## 🚢 Deploying to Vercel

1. Push your repository to GitHub.
2. Import the project in [Vercel](https://vercel.com).
3. Add your Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**. Vercel will build the Next.js App Router application automatically.

---

## 🎮 Game Rules

1. Each player receives a 5x5 grid filled with numbers 1 through 25 (no duplicates).
2. Players take alternating turns calling one number at a time.
3. When a number is called, it is marked on **both** players' boards.
4. Each completed row, column, or diagonal counts as **1 line**.
5. The first player to complete **5 lines** gets **B-I-N-G-O** and wins the duel!
