# ExamPilot 2027 — Full-stack student dashboard

A mobile-friendly study planner with an Express backend and persistent JSON database. Designed to run locally on Android through Termux, or on a computer with Node.js.

## Included features
- Account registration/sign-in and password hashing with Node's built-in `crypto` module
- Authenticated API with per-user record ownership
- Overview dashboard and summary metrics
- Subjects and target marks
- Tasks, deadlines, priority, status, filtering, and revision tracking
- Exam calendar, target marks, and actual scores
- Measurable goals with progress updates
- Attendance log and rate calculation
- Study notes with create/edit/delete
- 25-minute focus timer and persisted study-session log
- Analytics for tasks, targets, attendance, and entered exam scores
- Light/dark theme toggle
- JSON data export
- Responsive phone/tablet/desktop UI

## Run on Android (Termux) or computer
1. Install Node.js (Termux: `pkg update && pkg install nodejs`), if not already installed.
2. Extract this folder.
3. In the project folder run:
   ```sh
   npm install
   npm start
   ```
4. Open `http://127.0.0.1:3000` in your browser. Keep the Termux session running while using the app.

On a computer, use the same commands and open `http://localhost:3000`.

## Data and security notes
- User data is stored in `data/db.json`; back it up regularly.
- Passwords are stored as salted scrypt hashes, not plaintext.
- API routes require a bearer token; user records are scoped to the signed-in account.
- This is a functional local starter, not a production-hosted service. Before public deployment, add HTTPS, rate limiting, CSRF protections if cookie auth is introduced, stronger session expiry/rotation, database backups, and a proper database such as PostgreSQL/SQLite.
- No AI API key is required. Features are local and rule-based.
