import { useEffect, useState } from "preact/hooks";

export default function CreateSceneForm() {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [desc, setDesc] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locations, setLocations] = useState<
    { id: string; name: string; type: string }[]
  >([]);
  const [isLoadingLocs, setIsLoadingLocs] = useState(true);

  useEffect(() => {
    const fetchLocs = async () => {
      try {
        const token = localStorage.getItem("ursamu_token");
        if (!token) {
          console.warn(
            "[CreateSceneForm] No token found, redirecting to login.",
          );
          globalThis.location.href = `/login?redirect=${
            encodeURIComponent(globalThis.location.pathname)
          }`;
          return;
        }

        const headers: Record<string, string> = {};
        headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch("/api/v1/scenes/locations", { headers });

        if (res.status === 401) {
          console.warn(
            "[CreateSceneForm] Token expired or invalid. Redirecting to login.",
          );
          localStorage.removeItem("ursamu_token");
          globalThis.location.href = `/login?redirect=${
            encodeURIComponent(globalThis.location.pathname)
          }`;
          return;
        }

        if (res.ok) {
          const data = await res.json();
          setLocations(data);
          // Default to first location if available?
          // Or let user choose.
          if (data.length > 0) setLocation(data[0].id);
        }
      } catch (e) {
        console.error("Failed to load locations", e);
      } finally {
        setIsLoadingLocs(false);
      }
    };
    fetchLocs();
  }, []);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem("ursamu_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/v1/scenes", {
        method: "POST",
        headers,
        body: JSON.stringify({ name, location, desc, private: isPrivate }),
      });

      if (res.ok) {
        const scene = await res.json();
        globalThis.location.href = `/scenes/${scene.id}`;
      } else {
        alert("Failed to create scene");
      }
    } catch (e) {
      console.error(e);
      alert("Error creating scene");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} class="space-y-6">
      <div>
        <label class="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
          Scene Title
        </label>
        <input
          type="text"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
          required
          class="w-full bg-slate-900 border border-white/10 rounded px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors"
          placeholder="e.g., A Quiet Drink in the Mess Hall"
        />
      </div>

      <div>
        <label class="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
          Location
        </label>
        {isLoadingLocs
          ? (
            <div class="animate-pulse h-12 bg-slate-900 rounded border border-white/10">
            </div>
          )
          : (
            <select
              value={location}
              onInput={(e) => setLocation(e.currentTarget.value)}
              required
              class="w-full bg-slate-900 border border-white/10 rounded px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors appearance-none"
            >
              <option value="" disabled>Select a location...</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} {loc.type === "private" ? "(Private)" : ""}
                </option>
              ))}
            </select>
          )}
      </div>

      <div>
        <label class="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
          Summary / Context (Optional)
        </label>
        <textarea
          value={desc}
          onInput={(e) => setDesc(e.currentTarget.value)}
          rows={3}
          class="w-full bg-slate-900 border border-white/10 rounded px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors"
          placeholder="Brief description of the setting..."
        />
      </div>

      {/* Privacy Toggle */}
      <div class="flex items-center gap-4 border border-white/10 p-4 rounded bg-slate-900/50">
        <div class="flex-grow">
          <div class="font-bold text-sm text-slate-300">Private Scene</div>
          <div class="text-xs text-slate-500">
            Only invited characters can see and join this scene.
          </div>
        </div>
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.currentTarget.checked)}
          class="toggle toggle-primary"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        class="hidden md:inline-block w-full btn btn-primary py-3 font-bold uppercase tracking-wider"
      >
        {isSubmitting ? "Creating..." : "Start Scene"}
      </button>
    </form>
  );
}
