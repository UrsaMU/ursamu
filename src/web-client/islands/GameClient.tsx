import { useEffect, useRef, useState } from "preact/hooks";

interface Message {
  msg?: string;
  data?: any;
  room?: any;
}

import GameOutput from "../components/GameOutput.tsx";

export default function GameClient() {
  const [token, setToken] = useState<string | null>(
    typeof localStorage !== "undefined"
      ? localStorage.getItem("ursamu_token")
      : null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  // Login State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Login handler
  const handleLogin = async (e: Event) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("http://localhost:4203/api/v1/auth/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Login failed");
      }

      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        localStorage.setItem("ursamu_token", data.token);
      } else {
        throw new Error("No token received");
      }
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
    }
  };

  // WebSocket Connection
  useEffect(() => {
    if (token && !socket) {
      let cid = "";
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        cid = payload.id;
      } catch (e) {
        console.error("Failed to decode token", e);
        setError("Invalid token");
        return;
      }

      // Connect to WS with client=web
      const wsUrl = "ws://localhost:4203?client=web";
      console.log(`Connecting to ${wsUrl}...`);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("Connected to WS");
        setConnected(true);
        ws.send(JSON.stringify({ data: { cid } }));

        setTimeout(() => {
          ws.send(JSON.stringify({ msg: "look" }));
        }, 500);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.msg || payload.room) {
            setMessages((prev) => [...prev, payload]);
          }
          // Special handling for disconnects/reconnects could go here
        } catch (e) {
          console.error("Error parsing WS message", e);
          setMessages((prev) => [...prev, { msg: `Error: ${e}` }]);
        }
      };

      ws.onclose = () => {
        console.log("WS Closed");
        setConnected(false);
        setSocket(null);
      };

      ws.onerror = (e) => {
        console.error("WS Error", e);
      };

      setSocket(ws);

      return () => {
        ws.close();
      };
    }
  }, [token]);

  const sendCommand = (e: Event) => {
    e.preventDefault();
    if (!socket || !input.trim()) return;
    socket.send(JSON.stringify({ msg: input }));
    setInput("");
  };

  if (!token) {
    return (
      <div class="flex items-center justify-center min-h-[60vh] animate-fade-in">
        <div class="w-full max-w-md relative z-10">
          <form
            onSubmit={handleLogin}
            class="bg-slate-900/60 border border-white/5 p-8 md:p-10 rounded-3xl backdrop-blur-md shadow-2xl relative overflow-hidden group"
          >
            <div class="mb-10 text-center">
              <h2 class="text-4xl font-header font-bold text-white mb-2 tracking-tight">
                Terminal Access
              </h2>
              <p class="text-slate-400 text-sm">
                Authenticate to establish uplink
              </p>
            </div>

            {error && (
              <div class="bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-3 rounded-xl mb-6 text-sm font-medium backdrop-blur-sm animate-fade-in">
                {error}
              </div>
            )}

            <div class="space-y-5">
              <div class="space-y-1.5">
                <label class="block text-slate-400 text-xs font-bold uppercase tracking-wider ml-1">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onInput={(e) => setUsername(e.currentTarget.value)}
                  class="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 focus:bg-black/40 transition-all duration-300 placeholder:text-slate-600 focus:ring-1 focus:ring-primary/50 text-base"
                  placeholder="Enter your username"
                  required
                />
              </div>

              <div class="space-y-1.5">
                <label class="block text-slate-400 text-xs font-bold uppercase tracking-wider ml-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  class="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 focus:bg-black/40 transition-all duration-300 placeholder:text-slate-600 focus:ring-1 focus:ring-primary/50 text-base"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              class="w-full bg-gradient-to-r from-primary to-orange-600 hover:from-primary/90 hover:to-orange-600/90 text-white font-bold py-3.5 px-6 rounded-xl mt-8 transition-all duration-300 shadow-lg shadow-primary/20 hover:shadow-primary/30 uppercase tracking-widest text-xs transform hover:-translate-y-0.5"
            >
              Initialize Session
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div class="flex flex-col h-[75vh] bg-slate-950/80 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl mx-4 md:mx-0 relative group">
      {/* Game Output Container */}
      <div class="flex-1 flex overflow-hidden relative">
        {/* Helper grid background for terminal feel */}
        <div class="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none">
        </div>

        <GameOutput messages={messages} />

        <div ref={messagesEndRef} />

        {/* Status Overlay (Top Right) */}
        <div class="absolute top-4 right-4 flex gap-2">
          <span
            class={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border backdrop-blur-md shadow-lg flex items-center gap-2 ${
              connected
                ? "bg-green-500/10 border-green-500/20 text-green-400"
                : "bg-red-500/10 border-red-500/20 text-red-400"
            }`}
          >
            <span
              class={`w-1.5 h-1.5 rounded-full ${
                connected ? "bg-green-400 animate-pulse" : "bg-red-400"
              }`}
            >
            </span>
            {connected ? "Signal Active" : "No Signal"}
          </span>
        </div>
      </div>

      {/* Input Area - Floating Glass */}
      <div class="p-4 bg-slate-900/90 border-t border-white/5 backdrop-blur-md">
        <form
          onSubmit={sendCommand}
          class="flex gap-3 relative"
        >
          <div class="relative flex-grow">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-mono text-lg animate-pulse">
              {">"}
            </span>
            <input
              type="text"
              value={input}
              onInput={(e) => setInput(e.currentTarget.value)}
              class="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-slate-200 focus:outline-none focus:border-primary/50 focus:bg-black/60 transition-all font-mono placeholder:text-slate-600"
              placeholder="Enter command..."
              autoFocus
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setToken(null);
              setSocket(null);
              localStorage.removeItem("ursamu_token");
            }}
            class="px-5 py-2 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/5 hover:border-red-500/30 text-xs text-slate-400 hover:text-red-300 uppercase tracking-widest font-bold transition-all duration-300"
          >
            Disconnect
          </button>
        </form>
      </div>
    </div>
  );
}
