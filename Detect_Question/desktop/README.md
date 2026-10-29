# Detect Question Backend for Windows

`release/DetectQuestionBackend.exe` is the local backend used by the Chrome
extension. It is a self-contained Windows executable: the target computer does
not need Node.js or npm.

## First run

1. In this project, the app automatically uses the existing root `.env`.
   Nothing needs to be entered again.
2. Double-click `release/Start Detect Question Backend.vbs`. It starts the
   backend in the background with no console window.

For a copied portable release outside this project, place a preconfigured
`.env` beside `DetectQuestionBackend.exe`.

The app binds only to `http://127.0.0.1:8787`. Every start checks port 8787,
force-stops any listener already using that port, then starts a new clean
backend process. This is intentional, so do not use port 8787 for another
application.

## Stop the backend

Run:

```powershell
.\DetectQuestionBackend.exe --stop
```

## Rebuild (developer machine only)

```powershell
npm install
npm run build:backend-app
```
