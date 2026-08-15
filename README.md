# User & Admin Login Management System

A full-stack login/registration system with separate **User** and **Admin** dashboards, built with Express, Sequelize (SQLite), JWT auth, and a vanilla JS/Chart.js frontend.

## Stack
- **Backend:** Node.js, Express 5, Sequelize, SQLite, JWT, bcrypt
- **Frontend:** Static HTML/CSS/JS (served directly by Express), Chart.js

## Project structure
```
.
├── server.js            # Express app & all API routes
├── db.js                # Sequelize/SQLite connection
├── database.sqlite      # SQLite database file (auto-created on first run)
├── models/
│   └── User.js           # User model (username, email, password, role, isActive)
├── js/
│   └── main.js            # Frontend logic for every page
├── css/
│   ├── styles.css         # Shared base styles, theme, buttons, toasts
│   ├── auth.css            # Login / register / admin-login / 2FA pages
│   └── dashboard.css       # User & admin dashboard layout
├── index.html            # User login
├── register.html         # User registration
├── admin-login.html      # Admin login
├── dashboard.html        # User dashboard
├── admin-dashboard.html  # Admin dashboard
├── 2fa.html               # 2FA UI (not yet wired to a backend endpoint)
└── .env.example           # Copy to .env and fill in
```

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Configure environment variables**
   ```
   cp .env.example .env
   ```
   Then edit `.env` with a real `JWT_SECRET`. No database credentials are needed - Sequelize connects to a local `database.sqlite` file that's created automatically on first run.

3. **Run the server**
   ```
   node server.js
   ```
   or, with auto-reload during development:
   ```
   npx nodemon server.js
   ```

4. Open **http://localhost:3000** in your browser.

On first run, Sequelize syncs the `users` table and seeds a default admin account:
- Email: `admin@system.com`
- Password: `admin123`

**Change this password immediately in a real deployment.**

## API routes

| Method | Route                          | Auth        | Description                    |
|--------|--------------------------------|-------------|---------------------------------|
| POST   | `/api/register`                | —           | Register a new user            |
| POST   | `/api/login`                   | —           | User login                      |
| POST   | `/api/admin/login`             | —           | Admin login                     |
| GET    | `/api/user/activity`           | User        | Activity chart data             |
| GET    | `/api/admin/traffic`           | Admin       | Traffic chart data               |
| GET    | `/api/users/count`             | Admin       | Total non-admin user count       |
| GET    | `/api/admin/users?search=`     | Admin       | List/search users                |
| PUT    | `/api/admin/users/:id/status`  | Admin       | Toggle a user's active status    |

## Notes
- `updateFrontend.js` from an earlier draft has been removed — it was written against a different, unimplemented backend (port 5000, `/api/auth/*` routes) and would have corrupted `js/main.js` if run against this server.
- The 2FA page (`2fa.html`) is a working UI (auto-advancing code inputs) but isn't connected to a real verification endpoint yet — login currently goes straight to the dashboard after a valid password.
- The default JWT secret is a placeholder — always set a real value in `.env` before deploying.
- `database.sqlite` is created automatically the first time you run the server; delete it to reset all data.
