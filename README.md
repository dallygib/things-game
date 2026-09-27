# Things

A digital multiplayer party game — like The Game of Things.

## How it works

1. **Host** creates a room and picks a topic (e.g. *"Things you should never say at a job interview"*)
2. **Everyone** (including the host) writes one anonymous answer
3. Once all answers are in, the **guessing phase** begins — players take turns in round-robin:
   - Pick an answer from the list
   - Guess who wrote it
   - **Correct** → that writer is eliminated, you keep guessing
   - **Wrong** → next player's turn
4. The last player whose answer was never guessed **wins the round**

The host submits an answer but does not guess and cannot win.

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Share the 4-letter room code with friends.

## Stack

- Next.js (App Router)
- Socket.io for real-time multiplayer
- Tailwind CSS
- In-memory game state (no database needed)
