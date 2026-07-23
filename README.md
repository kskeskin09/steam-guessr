# 🎮 Steam Review Guesser

Can you guess the Steam game from user reviews? Test your gaming knowledge and see how few reviews you need to figure out the title!

👉 **[Play Live Here](https://kskeskin09.github.io/steam-guessr/)**

---

## 🕹️ How to Play

1. Read the initial Steam review for a hidden game.
2. Type in your guess using the search box.
3. If you get it wrong or request a hint, a new review is revealed.
4. Score points based on how few attempts you need:
   - **1st attempt:** 100 points
   - **2nd attempt:** 50 points
   - **3rd attempt:** 33 points
   - **4th attempt:** 25 points
   
      You have 10 attempts.
5. Keep your streak alive and climb the leaderboard!

---

## ✨ Features

- **Progressive Hints:** Reveal up to 10 real user reviews per game to narrow down your guess.
- **Seamless Guest Session:** Play instantly without logging in. Your score automatically merges when you decide to sign up.
- **Global Leaderboard:** Compete for the top total and high scores using Supabase backend.
- **Import Your Own Steam Library** You can import your Steam library and try your luck only with the games you own.

---

## 🛠️ Tech Stack

- **Frontend:** React 18, Vite
- **Styling:** Tailwind CSS, Lucide Icons
- **Backend / DB:** Supabase (Auth, Database, RPC anti-cheat rules)
- **Deployment:** GitHub Pages

---

## 💻 Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/kskeskin09/steam-guessr.git
   cd steam-guessr
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment variables (Optional):**
   Create a `.env` file in the root folder if connecting to your own Supabase project:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start local dev server:**
   ```bash
   npm run dev
   ```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) © 2026 kskeskin09.

