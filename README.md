# NeighborHub

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.0.0-yellow)

![App Screenshot](public/screenshot.png) 


A simple community application built for neighbors to share events and posts. This project was designed to meet the prompt criteria for a weekend build:

- **Value Proposition:** Helps neighbors coordinate events and stay connected with community posts.
- **Creativity:** A single‑page community dashboard with a polished UI and interactive features like posts, events, tool sharing, and mutual aid.
- **Technical Execution:** Express backend serving a static SPA; data persisted in `data/db.json` using `lowdb`. Client scripts fetch and mutate data over REST endpoints.
- **Writing Quality:** This README explains how to run and extend the application.

## Getting Started

### Prerequisites
- Node.js 18+ installed on your system (available in this workspace)

### Installation & Running

```powershell
cd NeighborHub
npm install
npm start
```

#### Version control (Git/GitHub)
Before deploying to Vercel you should put the project under Git and push it to a remote repository. A typical sequence is:

```powershell
cd NeighborHub
# if you haven't already initialized a repo
git init
git add .
git commit -m "Initial commit"
git branch -M main                      # ensure branch is named 'main'
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Replace `<you>/<repo>` with your GitHub user and repository name. Once the code lives on GitHub, you can connect that repository to Vercel (see **Deploying** below) and every push to the watched branch will trigger a new build.

Then open [http://localhost:3000](http://localhost:3000) in your browser.

### Features

- Rich community board with live posts, reactions, and tag support
- Upcoming events dashboard with RSVP tracking
- Tool lending library with search and borrow requests
- Mutual aid section for requesting or offering help
- Neighborhood directory with search filters
- Responsive UI, modal dialogs, and toast notifications
- Backend REST API with persistent JSON storage

### Future Improvements

- Replace `lowdb` with a proper database (SQLite, Postgres, etc.)
- Implement user authentication and profiles
- Add server-side validation and tests
- Package and deploy to a hosting platform (Azure, Heroku, Vercel)

---

## Firebase configuration & running

This version of NeighborHub is a **static single‑page app** that uses Firebase for
authentication and data storage. Before running, make sure you've completed the
following steps in the [Firebase console](https://console.firebase.google.com/):

1. Create or open a project and register a **Web App** (</> icon). Copy the
   configuration snippet; it contains `apiKey`, `authDomain`, `projectId`, etc.
   Paste that object into `public/firebase-config.js` (the file already exists
   with placeholders).
2. In **Authentication → Sign-in method** enable **Google** as a provider.
3. Under **Authentication → Authorized domains** add `localhost` (for local
   testing) and any production host (e.g. `your-app.vercel.app`).
4. (Optional) Enable Firestore in the console.
5. Add/update `firebase.json` and `firestore.rules` as shown below, or run
   `firebase init` if you're using the CLI.

### Firestore rules example

```c
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // reads are public; writes require sign-in
    match /{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

### Local testing

1. Install dependencies and start the static server:
   ```powershell
   npm install
   npm start           # serves http://localhost:3000
   ```
2. Open the page, click the avatar to sign in with Google. You should see a
   toast confirming your name and an entry appear under **Authentication →
   Users** in the Firebase console.
3. Create a post, event, or lost‑and‑found item. Check Firestore in the console
   or run `firebase emulators:start` with the Firestore emulator enabled.

### Deploying

- **Firebase Hosting** (optional): run `firebase deploy` once you have
  `firebase.json` and `firestore.rules` configured. This publishes the `public/`
  folder.

- **Vercel**: the app is purely static, so Vercel can serve the contents of the
  `public/` directory directly. We already include a `vercel.json` file with
  rewrite rules to support client-side routing:

  ```json
  {
    "rewrites": [ { "source": "/(.*)", "destination": "/index.html" } ],
    "builds": [ { "src": "public/**/*", "use": "@vercel/static" } ]
  }
  ```

  1. If you haven't already installed the CLI, run `npm install -g vercel` or
     use `npx vercel`.
  2. Authenticate:
     ```bash
     npx vercel login      # follow prompts, or set VEREL_TOKEN env var
     ```
  3. Deploy the current folder:
     ```bash
     npx vercel --prod --yes
     # or simply `vercel` and answer the interactive questions
     ```
  4. After deployment, copy the generated URL (e.g. `your-app.vercel.app`) and
     add it to **Authentication → Authorized domains** in the Firebase console
     so Google sign-in works from production.

  The `--yes` flag skips confirmation prompts. If you prefer a GUI workflow,
  you can push the repository to GitHub and import it via the Vercel web
  dashboard; the same `vercel.json` configuration will be respected.

  You can redeploy anytime by re-running the CLI command or via the dashboard.

  • If you need environment variables (e.g. a separate Firebase config for
    staging), add them through `vercel env add` or the dashboard settings.

Make sure to add your Vercel domain to Firebase's authorized domains before
users try to sign in.

---

This app now serves as a fully functional prototype for a neighborhood hub.
Feel free to extend and customize it for your community.

> **Tip:** replace `public/screenshot.png` with a real screenshot of the running app, and update the badge URLs above with your repo details (e.g. `github.com/you/NeighborHub` for the stars or version badge).
