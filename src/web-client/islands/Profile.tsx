import { useEffect, useState } from "preact/hooks";

interface UserProfile {
  _id: string;
  name: string;
  email?: string;
  avatar?: string;
  joined?: string;
  // Add other fields as discovered
}

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Determine user from local storage or verify token
    const token = localStorage.getItem("ursamu_token");
    if (!token) {
      // Redirect to login if not authenticated
      globalThis.location.href = "/login?redirect=/profile";
      return;
    }

    const fetchProfile = async () => {
      try {
        // Assuming we have an endpoint for 'me' or we decrypt token
        // For now, we might need to rely on stored username if no /me endpoint
        const username = localStorage.getItem("ursamu_username");

        // Try fetching specific user data if API exists, or just use what we have
        // Let's try to hit the auth check or similar
        const res = await fetch("/api/v1/auth/verify", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setProfile({
            _id: data.id || "unknown",
            name: data.name || username || "Traveler",
            email: data.email,
            avatar: data.avatar,
            joined: data.joined || new Date().toISOString(), // Fallback
          });
        } else {
          // Fallback to local storage if verify fails but token exists (maybe expired?)
          if (username) {
            setProfile({
              _id: "local",
              name: username,
              joined: new Date().toISOString(),
            });
          } else {
            throw new Error("Session invalid");
          }
        }
      } catch (e) {
        console.error(e);
        // Force logout
        localStorage.removeItem("ursamu_token");
        globalThis.location.href = "/login?redirect=/profile";
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("ursamu_token");
    localStorage.removeItem("ursamu_username");
    globalThis.location.href = "/";
  };

  if (loading) {
    return (
      <div class="flex items-center justify-center min-h-[50vh]">
        <span class="loading loading-spinner text-primary"></span>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div class="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Profile Header */}
      <div class="relative bg-slate-900/60 border border-white/5 rounded-3xl p-8 overflow-hidden backdrop-blur-md shadow-2xl group">
        {/* Decorative Background */}
        <div class="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-50 pointer-events-none">
        </div>
        <div class="absolute -top-24 -right-24 w-64 h-64 bg-primary/20 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-opacity duration-1000">
        </div>

        <div class="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-8">
          {/* Avatar */}
          <div class="shrink-0 relative">
            <div class="w-32 h-32 rounded-full border-4 border-slate-900 shadow-2xl overflow-hidden bg-slate-800 flex items-center justify-center">
              {profile.avatar
                ? (
                  <img
                    src={profile.avatar}
                    class="w-full h-full object-cover"
                  />
                )
                : (
                  <span class="text-4xl font-bold text-slate-600">
                    {profile.name.substring(0, 2).toUpperCase()}
                  </span>
                )}
            </div>
            <div
              class="absolute bottom-1 right-1 w-6 h-6 bg-emerald-500 rounded-full border-4 border-slate-900"
              title="Online"
            >
            </div>
          </div>

          {/* Info */}
          <div class="text-center md:text-left flex-grow">
            <h1 class="text-4xl font-header font-bold text-white mb-2">
              {profile.name}
            </h1>
            <p class="text-slate-400 text-sm mb-6 flex items-center justify-center md:justify-start gap-2">
              <span>@{profile.name.toLowerCase()}</span>
              <span>•</span>
              <span>
                Joined {new Date(profile.joined!).toLocaleDateString()}
              </span>
            </p>

            <div class="flex flex-wrap justify-center md:justify-start gap-3">
              <button
                type="button"
                class="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold uppercase tracking-wider rounded-xl border border-white/5 transition-all"
              >
                Edit Profile
              </button>
              <button
                type="button"
                onClick={handleLogout}
                class="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wider rounded-xl border border-red-500/20 transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stats Card */}
        <div class="bg-slate-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
          <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">
            Statistics
          </h3>
          <div class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-slate-500">Total Playtime</span>
              <span class="text-white font-mono">0h 0m</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-500">Scenes Participated</span>
              <span class="text-white font-mono">0</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-slate-500">Characters Created</span>
              <span class="text-white font-mono">1</span>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div class="bg-slate-900/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
          <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-white/5 pb-2">
            Recent Activity
          </h3>
          <div class="text-center py-8 text-slate-600 italic text-sm">
            No recent activity to display.
          </div>
        </div>
      </div>
    </div>
  );
}
