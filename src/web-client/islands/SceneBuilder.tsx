import { useState } from "preact/hooks";

export default function SceneBuilder() {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [parent, setParent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<
    { id: string; name: string } | null
  >(null);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/v1/building/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: desc, parent }),
      });

      if (res.ok) {
        const room = await res.json();
        setCreatedRoom(room);
        setName("");
        setDesc("");
        setParent("");
      } else {
        const err = await res.text();
        alert(`Failed to create room: ${err}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error creating room");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startScene = () => {
    if (!createdRoom) return;
    // Redirect to scene creation with location pre-filled?
    // Or simpler: Just create the scene now?
    // Let's redirect to a scene creation URL with query params?
    // Current CreateSceneForm doesn't support query params yet, but we can assume it might or user will copy paste.
    // For now, let's just show the success message.
    alert(
      `Room created! ID: #${createdRoom.id}. You can now start a scene there.`,
    );
  };

  return (
    <div class="bg-slate-800/50 p-6 rounded-lg border border-white/10">
      <h2 class="text-xl font-bold text-white mb-6">
        Scene Builder: Create Location
      </h2>

      {createdRoom
        ? (
          <div class="bg-green-500/20 border border-green-500/50 p-4 rounded mb-6 text-green-200">
            <p class="font-bold">Room Created Successfully!</p>
            <p>Name: {createdRoom.name}</p>
            <p>ID: #{createdRoom.id}</p>
            <div class="mt-4 flex gap-2">
              <button
                onClick={() => setCreatedRoom(null)}
                class="btn btn-secondary text-xs"
              >
                Create Another
              </button>
              {/* Placeholder for future integration */}
              <button
                onClick={() => navigator.clipboard.writeText(createdRoom.id)}
                class="btn btn-primary text-xs"
              >
                Copy ID
              </button>
            </div>
          </div>
        )
        : (
          <form onSubmit={handleSubmit} class="space-y-4">
            <div>
              <label class="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                Room Name
              </label>
              <input
                type="text"
                value={name}
                onInput={(e) => setName(e.currentTarget.value)}
                required
                class="w-full bg-slate-900 border border-white/10 rounded px-4 py-2 text-white focus:border-primary focus:outline-none transition-colors"
                placeholder="e.g., The Hidden Grove"
              />
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                Description
              </label>
              <textarea
                value={desc}
                onInput={(e) => setDesc(e.currentTarget.value)}
                rows={3}
                class="w-full bg-slate-900 border border-white/10 rounded px-4 py-2 text-white focus:border-primary focus:outline-none transition-colors"
                placeholder="A quiet grove..."
              />
            </div>

            <div>
              <label class="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                Parent / Zone (Optional DBRef)
              </label>
              <input
                type="text"
                value={parent}
                onInput={(e) => setParent(e.currentTarget.value)}
                class="w-full bg-slate-900 border border-white/10 rounded px-4 py-2 text-white focus:border-primary focus:outline-none transition-colors"
                placeholder="e.g., #10 (The Forest Zone)"
              />
            </div>

            <div class="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                class="w-full btn btn-primary py-2 font-bold uppercase tracking-wider"
              >
                {isSubmitting ? "Creating..." : "Build Room"}
              </button>
            </div>
          </form>
        )}
    </div>
  );
}
