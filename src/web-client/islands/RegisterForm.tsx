import { useState } from "preact/hooks";

export default function RegisterForm() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: Event) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:4203/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Registration failed");
      }

      const data = await res.json();

      if (data.token) {
        localStorage.setItem("ursamu_token", data.token);
        if (data.name) localStorage.setItem("ursamu_username", data.name);

        const params = new URLSearchParams(globalThis.location.search);
        const redirect = params.get("redirect");

        if (redirect && redirect !== "/register") {
          globalThis.location.href = redirect;
        } else {
          globalThis.location.href = "/";
        }
      } else {
        // Fallback if no token returned: redirect to login
        globalThis.location.href = "/login";
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="flex items-center justify-center min-h-[60vh] animate-fade-in">
      <div class="w-full max-w-md relative z-10">
        <form
          onSubmit={handleRegister}
          class="bg-slate-900/60 border border-white/5 p-8 md:p-10 rounded-3xl backdrop-blur-md shadow-2xl relative overflow-hidden group"
        >
          {/* Decorative gradients */}
          <div class="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl opacity-30 group-hover:opacity-50 transition-opacity duration-700">
          </div>
          <div class="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl opacity-30 group-hover:opacity-50 transition-opacity duration-700">
          </div>

          <div class="relative z-10">
            <div class="mb-10 text-center">
              <h2 class="text-4xl font-header font-bold text-white mb-2 tracking-tight">
                Join UrsaMU
              </h2>
              <p class="text-slate-400 text-sm">
                Create your legacy in the stars
              </p>
            </div>

            {error && (
              <div class="bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-3 rounded-xl mb-6 text-sm font-medium backdrop-blur-sm animate-fade-in flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-4 h-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                {error}
              </div>
            )}

            <div class="space-y-4">
              <div class="space-y-1.5">
                <label class="block text-slate-400 text-xs font-bold uppercase tracking-wider ml-1">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onInput={(e) => setUsername(e.currentTarget.value)}
                  class="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 focus:bg-black/40 transition-all duration-300 placeholder:text-slate-600 focus:ring-1 focus:ring-primary/50 text-base"
                  placeholder="Choose a username"
                  required
                />
              </div>

              <div class="space-y-1.5">
                <label class="block text-slate-400 text-xs font-bold uppercase tracking-wider ml-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  class="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 focus:bg-black/40 transition-all duration-300 placeholder:text-slate-600 focus:ring-1 focus:ring-primary/50 text-base"
                  placeholder="Enter your email"
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
              disabled={loading}
              class="w-full bg-gradient-to-r from-primary to-orange-600 hover:from-primary/90 hover:to-orange-600/90 text-white font-bold py-3.5 px-6 rounded-xl mt-8 transition-all duration-300 shadow-lg shadow-primary/20 hover:shadow-primary/30 uppercase tracking-widest text-xs transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex justify-center items-center gap-2"
            >
              {loading
                ? (
                  <>
                    <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin">
                    </span>
                    Creating Account...
                  </>
                )
                : (
                  "Create Account"
                )}
            </button>

            <p class="text-center mt-6 text-slate-500 text-sm">
              Already have an account?{" "}
              <a
                href={`/login${globalThis.location.search}`}
                class="text-primary hover:text-white transition-colors font-bold underline decoration-transparent hover:decoration-primary/50 underline-offset-4"
              >
                Sign in
              </a>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
