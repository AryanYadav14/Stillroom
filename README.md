# Stillroom

A calm, minimal shared study-room prototype. Friends can join using a room ID and
password, see who is online, set a private intention, and start a shared focus
timer together.

Phase 2 adds synchronized room chat, join/leave activity notifications, an
always-available generated rain sound, personal music uploads, and animated
interactive controls.

## Run locally

Run the built-in Node.js room server:

```powershell
node server.js
```

Then visit `http://localhost:8000`.

## Current scope

The server keeps rooms in memory. Friends using the same running server can join
with the generated room ID and password, see one another online, and control the
same timer. For a public production deployment, add persistent storage, HTTPS,
and stronger authentication.
