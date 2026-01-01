import { useState, useEffect, useRef } from "preact/hooks";

interface Message {
  msg?: string;
  data?: unknown;
}

import SafeMessage from "../components/SafeMessage.tsx";

export default function GameClient() {
  const [token, setToken] = useState<string | null>(null);
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
      // Trying port 4202 for REST API as per discovery (server is on 4202)
      const res = await fetch("http://localhost:4202/api/v1/auth/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Login failed");
      }
      
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        // Optional: Save to localStorage (client-side only)
        // localStorage.setItem("ursamu_token", data.token);
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
      // Decode JWT to get ID (simple base64 decode of payload)
      let cid = "";
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        cid = payload.id;
      } catch (e) {
        console.error("Failed to decode token", e);
        setError("Invalid token");
        return;
      }

      // Connect to WS. 
      // User requested 4202. Code analysis suggested 4203 for Native WS.
      // I will try 4202 first. If it uses Socket.IO it might fail or upgrade.
      const wsUrl = "ws://localhost:4202"; 
      console.log(`Connecting to ${wsUrl}...`);
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("Connected to WS");
        setConnected(true);
        // Authenticate / Set CID
        ws.send(JSON.stringify({
          data: { cid },
          msg: "connect" // Trigger initial room look?
        }));
        
        // Send a look command to get initial state
        setTimeout(() => {
             ws.send(JSON.stringify({ msg: "look" }));
        }, 500);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages((prev) => [...prev, data]);
        } catch (e) {
          console.error("Error parsing WS message", e);
          setMessages((prev) => [...prev, { msg: event.data }]);
        }
      };

      ws.onclose = () => {
        console.log("WS Closed");
        setConnected(false);
        setSocket(null);
      };
      
      ws.onerror = (e) => {
        console.error("WS Error", e);
        // If 4202 fails, maybe hint to try 4203?
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
    
    // Send command
    socket.send(JSON.stringify({ msg: input }));
    setInput("");
  };

  if (!token) {
    return (
      <div class="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <form onSubmit={handleLogin} class="bg-gray-800 p-8 rounded-lg shadow-xl w-96 border border-gray-700">
          <h2 class="text-2xl font-bold mb-6 text-center text-purple-400">UrsaMU Login</h2>
          {error && <div class="bg-red-900/50 text-red-200 p-3 rounded mb-4 text-sm">{error}</div>}
          <div class="mb-4">
            <label class="block text-gray-400 text-sm font-bold mb-2">Username</label>
            <input 
              type="text" 
              value={username} 
              onInput={(e) => setUsername(e.currentTarget.value)}
              class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <div class="mb-6">
            <label class="block text-gray-400 text-sm font-bold mb-2">Password</label>
            <input 
              type="password" 
              value={password} 
              onInput={(e) => setPassword(e.currentTarget.value)}
              class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:outline-none focus:border-purple-500"
            />
          </div>
          <button type="submit" class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition duration-200">
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div class="flex flex-col h-screen bg-gray-900 text-gray-200 font-mono">
      {/* Header */}
      <header class="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center">
        <h1 class="text-xl font-bold text-purple-400">UrsaMU Client</h1>
        <div class="flex items-center gap-4">
           <span class={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
           <button type="button" onClick={() => { setToken(null); setSocket(null); }} class="text-xs text-gray-400 hover:text-white">Logout</button>
        </div>
      </header>

      {/* Terminal Output */}
      <div class="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-gray-700">
        {messages.map((m, i) => (
          <div key={i} class="break-words">
            {/* Render message content. Depending on format, it might need HTML parsing or ANSI conversion. 
                For now, just dumping the msg string or JSON */}
            {m.msg && <div class="whitespace-pre-wrap"><SafeMessage message={m.msg} /></div>}
            {/* If no msg, maybe data? */}
            {!m.msg && <pre class="text-xs text-gray-500">{JSON.stringify(m, null, 2)}</pre>}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={sendCommand} class="bg-gray-800 p-4 border-t border-gray-700 flex gap-2">
        <span class="text-green-500 py-2">{">"}</span>
        <input 
          type="text" 
          value={input} 
          onInput={(e) => setInput(e.currentTarget.value)}
          class="flex-1 bg-gray-900 border border-gray-600 rounded p-2 text-white focus:outline-none focus:border-green-500"
          placeholder="Enter command..."
          autoFocus
        />
        <button type="submit" class="bg-green-700 hover:bg-green-600 text-white px-4 rounded font-bold">
          Send
        </button>
      </form>
    </div>
  );
}
