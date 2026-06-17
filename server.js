const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const port = Number(process.env.PORT || 8000);
const root = __dirname;
const rooms = new Map();
const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".md": "text/markdown; charset=utf-8" };

function randomPart(length) {
  return crypto.randomBytes(length).toString("hex").slice(0, length).toUpperCase();
}

function json(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });

  response.end(JSON.stringify(data));
}

function addEvent(room, type, name) {
  room.events.push({ id: crypto.randomUUID(), type, name, createdAt: Date.now() });
  room.events = room.events.slice(-50);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) request.destroy();
    });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

function publicRoom(room) {
  const now = Date.now();
  for (const [id, person] of room.people) {
    if (now - person.lastSeen > 20_000) {
      room.people.delete(id);
      addEvent(room, "leave", person.name);
    }
  }
  let remaining = room.timer.remaining;
  if (room.timer.running) {
    remaining = Math.max(0, Math.ceil((room.timer.endsAt - now) / 1000));
    if (remaining === 0) Object.assign(room.timer, { running: false, remaining: 0 });
  }
  return {
    id: room.id,
    people: [...room.people.values()].map(({ name, subject }) => ({ name, subject })),
    timer: { running: room.timer.running, remaining },
    messages: room.messages.slice(-60),
    events: room.events.slice(-30),
  };
}

async function api(request, response, url) {
  const body = await readBody(request);
  if (request.method === "POST" && url.pathname === "/api/rooms") {
    const id = `${randomPart(4)}-${randomPart(2)}`;
    const password = randomPart(4).toLowerCase();
    rooms.set(id, { id, password, people: new Map(), messages: [], events: [], timer: { running: false, remaining: 3000, endsAt: null } });
    return json(response, 201, { id, password });
  }

  const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/(join|heartbeat|timer|chat|leave)$/);
  if (!match) return json(response, 404, { error: "Not found" });
  const room = rooms.get(decodeURIComponent(match[1]).toUpperCase());
  if (!room || body.password !== room.password) return json(response, 401, { error: "Room ID or password is incorrect" });

  if (request.method === "POST" && (match[2] === "join" || match[2] === "heartbeat")) {
    if (!body.clientId) return json(response, 400, { error: "Missing client ID" });
    const isNew = !room.people.has(String(body.clientId));
    const name = String(body.name || "Friend").trim().slice(0, 24) || "Friend";
    room.people.set(String(body.clientId), {
      name,
      subject: String(body.subject || "Studying").trim().slice(0, 30) || "Studying",
      lastSeen: Date.now(),
    });
    if (isNew) addEvent(room, "join", name);
    return json(response, 200, publicRoom(room));
  }

  if (request.method === "POST" && match[2] === "timer") {
    if (body.command === "start") Object.assign(room.timer, { running: true, endsAt: Date.now() + room.timer.remaining * 1000 });
    if (body.command === "pause") Object.assign(room.timer, { running: false, remaining: Math.max(0, Math.ceil((room.timer.endsAt - Date.now()) / 1000)) });
    if (body.command === "reset") Object.assign(room.timer, { running: false, remaining: Math.max(60, Math.min(10_800, Number(body.seconds) || 3000)) });
    return json(response, 200, publicRoom(room));
  }

  if (request.method === "POST" && match[2] === "chat") {
    const person = room.people.get(String(body.clientId));
    const text = String(body.text || "").trim().slice(0, 240);
    if (!person || !text) return json(response, 400, { error: "Message cannot be empty" });
    room.messages.push({ id: crypto.randomUUID(), clientId: String(body.clientId), name: person.name, text, createdAt: Date.now() });
    room.messages = room.messages.slice(-100);
    return json(response, 200, publicRoom(room));
  }

  if (request.method === "POST" && match[2] === "leave") {
    const person = room.people.get(String(body.clientId));
    if (person) {
      room.people.delete(String(body.clientId));
      addEvent(room, "leave", person.name);
    }
    return json(response, 200, publicRoom(room));
  }
  return json(response, 405, { error: "Method not allowed" });
}

function serveFile(response, url) {
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = path.resolve(root, requested);
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404);
    return response.end("Not found");
  }
  response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
}

http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "OPTIONS") {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  return response.end();
}
  try {
    if (url.pathname.startsWith("/api/")) return await api(request, response, url);
    serveFile(response, url);
  } catch {
    json(response, 500, { error: "Something went wrong" });
  }
}).listen(port, "0.0.0.0", () => console.log(`Stillroom is running at http://localhost:${port}`));
