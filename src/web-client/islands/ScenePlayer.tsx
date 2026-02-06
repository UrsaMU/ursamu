import { useEffect, useRef, useState } from "preact/hooks";
import { IPose, IScene } from "../../@types/IScene.ts";
import { ParsedText } from "../components/ParsedText.tsx";

interface ScenePlayerProps {
  initialScene?: IScene | null;
  sceneId: string;
  userId: string;
}

export default function ScenePlayer(
  { initialScene, sceneId, userId: _userId }: ScenePlayerProps,
) {
  const [scene, setScene] = useState<IScene | null>(initialScene || null);
  const [poseInput, setPoseInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputMode, setInputMode] = useState<"pose" | "ooc" | "set" | "qs">(
    "pose",
  );
  const [showManageModal, setShowManageModal] = useState(false);
  const [inviteTarget, setInviteTarget] = useState("");
  const [editingPoseId, setEditingPoseId] = useState<string | null>(null);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Poll for updates (and initial load if needed)
  useEffect(() => {
    const fetchScene = async () => {
      try {
        const token = localStorage.getItem("ursamu_token");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`/api/v1/scenes/${sceneId}`, { headers });
        if (res.ok) {
          const updated = await res.json();
          // If scene is null, set it. Or if changes detected.
          if (
            !scene || updated.poses.length !== scene.poses.length ||
            updated.status !== scene.status
          ) {
            setScene(updated);
          }
        }

        if (res.status === 401) {
          globalThis.location.href = `/login?redirect=${
            encodeURIComponent(globalThis.location.pathname)
          }`;
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    };

    // If no scene, fetch immediately
    if (!scene) fetchScene();

    const interval = setInterval(fetchScene, 3000);

    return () => clearInterval(interval);
  }, [sceneId, scene ? scene.poses.length : 0, scene ? scene.id : ""]);

  // Scroll to bottom on new poses
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [scene ? scene.poses.length : 0]);

  const handlePost = async () => {
    if (!poseInput.trim()) return;
    setIsSubmitting(true);
    if (!scene) return;

    const payload = {
      msg: poseInput,
      type: inputMode,
    };

    try {
      if (!scene) return;

      if (editingPoseId) {
        // Edit Mode
        const token = localStorage.getItem("ursamu_token");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(
          `/api/v1/scenes/${scene.id}/pose/${editingPoseId}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ msg: poseInput }),
          },
        );

        if (res.ok) {
          const updatedPose = await res.json();
          setScene((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              poses: prev.poses.map((p) =>
                p.id === updatedPose.id ? updatedPose : p
              ),
            };
          });
          setEditingPoseId(null);
          setPoseInput("");
          setInputMode("pose");
        }
      } else {
        // New Post
        const token = localStorage.getItem("ursamu_token");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`/api/v1/scenes/${scene.id}/pose`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const newPose = await res.json();
          setScene((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              poses: [...prev.poses, newPose],
            };
          });
          setPoseInput("");
          // Keep current mode for OOC/Set convenience?
          // setInputMode("pose");
        }
      }
    } catch (e) {
      console.error(e);
      alert("Error posting.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async () => {
    if (!scene) return;
    const newStatus = scene.status === "active"
      ? "paused"
      : scene.status === "paused"
      ? "closed"
      : "active";
    if (!confirm(`Change status to ${newStatus}?`)) return;

    try {
      const token = localStorage.getItem("ursamu_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/v1/scenes/${scene.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setScene(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleInvite = async () => {
    if (!inviteTarget.trim() || !scene) return;
    try {
      const token = localStorage.getItem("ursamu_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/v1/scenes/${scene.id}/invite`, {
        method: "POST",
        headers,
        body: JSON.stringify({ target: inviteTarget }),
      });

      if (res.ok) {
        const data = await res.json();
        setScene((prev) => {
          if (!prev) return null;
          return { ...prev, allowed: data.allowed };
        });
        setInviteTarget("");
        alert("User invited!");
      } else {
        alert("Failed to invite user (User not found?)");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSceneTypeChange = async (type: string) => {
    if (!scene) return;
    try {
      const token = localStorage.getItem("ursamu_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/v1/scenes/${scene.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ sceneType: type }),
      });

      if (res.ok) {
        const updated = await res.json();
        setScene(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startEdit = (pose: IPose) => {
    setPoseInput(pose.msg);
    setEditingPoseId(pose.id);
    setInputMode(pose.type); // "pose" | "ooc"
  };

  if (!scene) {
    return (
      <div class="flex items-center justify-center h-full text-slate-500">
        <span class="loading loading-spinner loading-lg"></span>
        <span class="ml-4">Loading Scene...</span>
      </div>
    );
  }

  return (
    <div class="flex flex-col h-full bg-slate-950/80 backdrop-blur-3xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative font-sans selection:bg-primary/30 selection:text-white mb-24 ring-1 ring-white/5">
      {/* Manage Modal */}
      {showManageModal && scene && (
        <div class="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div class="bg-slate-900 border border-white/10 p-6 rounded-xl w-full max-w-lg shadow-2xl space-y-6 transform transition-all scale-100">
            <div class="flex justify-between items-center border-b border-white/5 pb-4">
              <h3 class="text-xl font-header font-bold text-white tracking-wider">
                Manage Scene
              </h3>
              <button
                onClick={() => setShowManageModal(false)}
                class="text-slate-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-slate-400 uppercase mb-2">
                  Invite Character
                </label>
                <div class="flex gap-2">
                  <input
                    type="text"
                    value={inviteTarget}
                    onInput={(e) => setInviteTarget(e.currentTarget.value)}
                    class="flex-grow bg-slate-950 border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary focus:outline-none transition-colors"
                    placeholder="Character Name"
                  />
                  <button
                    type="button"
                    onClick={handleInvite}
                    class="btn btn-primary text-xs px-6"
                  >
                    Invite
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-400 uppercase mb-2">
                  Allowed Participants
                </label>
                <div class="flex flex-wrap gap-2 p-4 bg-slate-950 rounded-lg border border-white/5 min-h-[3rem]">
                  {(scene.allowed || []).length === 0
                    ? (
                      <span class="text-slate-600 text-sm italic">
                        No specific allowances.
                      </span>
                    )
                    : (
                      (scene.allowed || []).map((id) => (
                        <span
                          key={id}
                          class="flex items-center gap-2 bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs box-border border border-white/5"
                        >
                          <span>{id}</span>
                          {/* Could add remove button here later */}
                        </span>
                      ))
                    )}
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-bold text-slate-400 uppercase mb-2">
                Scene Type
              </label>
              <select
                value={scene.sceneType || "social"}
                onChange={(e) => handleSceneTypeChange(e.currentTarget.value)}
                class="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary focus:outline-none transition-colors appearance-none"
              >
                <option value="social">Social</option>
                <option value="event">Event</option>
                <option value="vignette">Vignette</option>
                <option value="plot">Plot</option>
                <option value="training">Training</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setShowManageModal(false)}
                class="btn btn-ghost text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compact Header */}
      <div class="bg-slate-950/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex flex-col gap-1 relative z-20 shrink-0 bg-gradient-to-r from-slate-900/90 via-slate-950/90 to-slate-900/50">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-4 overflow-hidden">
            <div class="flex items-baseline gap-3 truncate">
              <h1 class="text-xl font-header font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-wide drop-shadow-sm truncate">
                {scene.name}
              </h1>
              <span class="text-xs font-mono text-slate-500 bg-slate-900/50 px-1.5 py-0.5 rounded border border-white/5">#{scene.id}</span>
            </div>

            <span
              class={`px-2 py-0.5 rounded-md text-[0.6rem] uppercase font-bold tracking-widest border shrink-0 backdrop-blur-sm ${
                scene.status === "active"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_-3px_rgba(16,185,129,0.2)]"
                  : "bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_-3px_rgba(239,68,68,0.2)]"
              }`}
            >
              {scene.status}
            </span>
            {/* Scene Type Badge */}
            {scene.sceneType && (
              <span
                class={`px-2 py-0.5 rounded-md text-[0.6rem] uppercase font-bold tracking-widest border shrink-0 backdrop-blur-sm ${
                  scene.sceneType === "event"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    : scene.sceneType === "plot"
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    : scene.sceneType === "vignette"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : scene.sceneType === "training"
                    ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" // Social/Other
                }`}
              >
                {scene.sceneType}
              </span>
            )}
            {scene.private && (
              <span class="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-md text-[0.6rem] uppercase font-bold tracking-widest flex items-center gap-1 shrink-0">
                🔒 Private
              </span>
            )}
          </div>

          {/* Controls */}
          <div class="flex items-center gap-2 shrink-0">
            {scene.owner === _userId && (
              <button
                type="button"
                onClick={() => setShowManageModal(true)}
                class="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all hover:scale-105 active:scale-95 border border-white/5"
                title="Manage Scene"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z">
                  </path>
                </svg>
              </button>
            )}

            <button
              type="button"
              onClick={toggleStatus}
              class={`p-2 rounded-lg transition-all hover:scale-105 active:scale-95 border ${
                scene.status === "active"
                  ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20"
                  : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20"
              }`}
              title={scene.status === "active"
                ? "Pause Scene"
                : "Activate Scene"}
            >
              {scene.status === "active"
                ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                  </svg>
                )
                : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                )}
            </button>
          </div>
        </div>

        <div class="flex items-center gap-4 text-xs text-slate-400">
          <div class="flex items-center gap-1.5 shrink-0">
            <span class="text-slate-500 uppercase font-bold tracking-wider text-[0.65rem]">
              Loc
            </span>
            <span class="text-slate-300 truncate max-w-[150px]">
              {scene.locationDetails
                ? (
                  <>
                    {scene.locationDetails.name}{" "}
                    <span class="text-slate-500 font-mono text-[0.6rem]">
                      ({scene.locationDetails.id})
                    </span>
                  </>
                )
                : (
                  scene.location
                )}
            </span>
          </div>
          <div class="w-px h-3 bg-white/10 shrink-0"></div>
          <div class="flex items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
            <span class="text-slate-500 uppercase font-bold tracking-wider text-[0.65rem]">
              With
            </span>
            <span class="text-slate-300 truncate">
              {scene.participantsDetails && scene.participantsDetails.length > 0
                ? (
                  scene.participantsDetails.map((p, i, arr) => (
                    <span key={p.id}>
                      <ParsedText text={p.moniker || p.name} />
                      {(p.id === _userId || scene.owner === p.id) && (
                        <span class="opacity-50 ml-0.5 text-[0.6rem]">
                          ({p.id})
                        </span>
                      )}
                      {i < arr.length - 1 && ", "}
                    </span>
                  ))
                )
                : (
                  (scene.participants || []).map((p, i, arr) => (
                    <span key={p}>
                      {p}
                      {i < arr.length - 1 && ", "}
                    </span>
                  ))
                )}
            </span>
          </div>
        </div>
      </div>

      {/* Pose Stream */}
      <div
        ref={scrollRef}
        class="flex-grow overflow-y-auto p-4 md:p-6 space-y-6 min-h-[100px] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20"
      >
        {scene.poses.length === 0
          ? (
            <div class="flex flex-col items-center justify-center h-full text-slate-600 space-y-4">
              <div class="text-4xl opacity-20 filter grayscale">📜</div>
              <div class="text-sm italic tracking-wide">
                The scene is fresh and waiting...
              </div>
            </div>
          )
          : (
            scene.poses.map((pose) => {
              const isSet = pose.type === "set";
              const isOOC = pose.type === "ooc";

              if (isSet) {
                return (
                  <div key={pose.id} class="animate-fade-in my-8 relative">
                    <div
                      class="absolute inset-0 flex items-center"
                      aria-hidden="true"
                    >
                      <div class="w-full border-t border-white/5"></div>
                    </div>
                    <div class="relative flex justify-center">
                      <span class="bg-slate-900/80 backdrop-blur px-4 text-xs font-bold text-slate-500 uppercase tracking-widest border border-white/5 rounded-full py-1 shadow-sm">
                        {pose.msg}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={pose.id}
                  class={`animate-fade-in group flex gap-5 ${
                    isOOC
                      ? "opacity-75 hover:opacity-100 transition-opacity pl-2 ml-2 border-l-2 border-transparent hover:border-slate-700/50"
                      : "pl-2"
                  }`}
                >
                  <div class="shrink-0 pt-1">
                    {pose.avatar
                      ? (
                        <img
                          src={pose.avatar}
                          class="w-12 h-12 rounded-xl shadow-lg border border-white/10 object-cover ring-1 ring-black/50"
                          alt={pose.charName}
                        />
                      )
                      : (
                        <div
                          class={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-lg border border-white/10 ring-1 ring-black/50 ${
                            isOOC
                              ? "bg-slate-800"
                              : "bg-gradient-to-br from-indigo-900 to-slate-900"
                          }`}
                        >
                          {pose.charName.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                  </div>

                  <div class="flex-grow min-w-0">
                    <div class="flex items-baseline justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <span
                          class={`font-bold font-header tracking-wide ${
                            isOOC ? "text-slate-400" : "text-primary text-base"
                          }`}
                        >
                          <ParsedText text={pose.moniker || pose.charName} />
                        </span>
                        {isOOC && (
                          <span class="bg-slate-800/80 border border-white/5 text-slate-500 text-[0.6rem] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">
                            OOC
                          </span>
                        )}
                      </div>
                      <div class="flex items-center gap-3">
                        <span class="text-[0.65rem] text-slate-600 font-mono">
                          {new Date(pose.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(pose)}
                          class="opacity-0 group-hover:opacity-100 transition-all text-slate-600 hover:text-primary transform hover:scale-110"
                          title="Edit Pose"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z">
                            </path>
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div
                      class={`font-sans leading-relaxed whitespace-pre-wrap selection:bg-primary/20 selection:text-white ${
                        isOOC
                          ? "text-slate-400 italic text-sm bg-slate-900/30 p-3 rounded-xl border border-white/5"
                          : "text-slate-200 text-base"
                      }`}
                    >
                      {pose.msg}
                    </div>
                  </div>
                </div>
              );
            })
          )}
      </div>

      {/* Chat-Style Input Area */}
      {scene.status === "active" || scene.status === "paused"
        ? (
          <div class="shrink-0 relative z-30 p-6 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent -mt-6">
            <div class="flex flex-col gap-2 mb-2">
              {/* Editing Warning */}
              {editingPoseId && (
                <div class="flex justify-between items-center bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-lg mx-1 text-xs text-amber-200 backdrop-blur-md shadow-lg animate-fade-in-up">
                  <span class="font-bold flex items-center gap-2">
                    <span class="animate-pulse w-2 h-2 rounded-full bg-amber-500"></span> Editing Mode
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPoseId(null);
                      setPoseInput("");
                      setInputMode("pose");
                    }}
                    class="hover:text-white underline hover:text-amber-100 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Floating Glass Input */}
            <div class="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-visible ring-1 ring-white/5 p-2 flex items-end gap-2 transition-all focus-within:ring-primary/50 focus-within:bg-slate-900/80">
              
              {/* Mode Selector */}
              <div class="relative shrink-0">
                {showModeMenu && (
                  <>
                    <div
                      class="fixed inset-0 z-40"
                      onClick={() => setShowModeMenu(false)}
                    >
                    </div>
                    <div class="absolute bottom-full left-0 mb-3 w-40 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in flex flex-col p-1.5 gap-0.5 ring-1 ring-white/5">
                      {(["pose", "ooc", "set", "qs"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setInputMode(m);
                            setShowModeMenu(false);
                          }}
                          class={`text-left px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-3 transition-all ${
                            inputMode === m
                              ? "bg-white/10 text-white shadow-sm"
                              : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                          }`}
                        >
                          {/* Icon per mode */}
                          {m === "pose" && (
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                          )}
                          {m === "ooc" && (
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                          )}
                          {(m === "set" || m === "qs") && (
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
                          )}
                          {m}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button
                  type="button"
                  class={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
                    inputMode === "pose"
                      ? "bg-primary/20 text-primary hover:bg-primary/30 hover:shadow-[0_0_15px_-5px_var(--color-primary)]"
                      : inputMode === "ooc"
                      ? "bg-slate-700/50 text-slate-300 hover:bg-slate-700/70"
                      : "bg-amber-900/40 text-amber-500 hover:bg-amber-900/60"
                  }`}
                  onClick={() => setShowModeMenu(!showModeMenu)}
                  title="Change Mode"
                >
                  {/* Current Icon */}
                  {inputMode === "pose" && (
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                  )}
                  {inputMode === "ooc" && (
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  )}
                  {(inputMode === "set" || inputMode === "qs") && (
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
                  )}
                </button>
              </div>

              {/* Input */}
              <div class="flex-grow flex flex-col justify-center min-h-[44px]">
                 <textarea
                  value={poseInput}
                  rows={1}
                  onInput={(e) => {
                    setPoseInput(e.currentTarget.value);
                    e.currentTarget.style.height = "auto";
                    e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handlePost();
                      setTimeout(() => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = "auto";
                      }, 0);
                    }
                  }}
                  class="w-full bg-transparent border-none focus:ring-0 text-white placeholder-slate-500 py-3 px-2 max-h-[150px] resize-none leading-relaxed font-sans text-base focus:outline-none"
                  placeholder={inputMode === "ooc"
                    ? "Message OOC..."
                    : (inputMode === "set" || inputMode === "qs")
                    ? "Set scene context..."
                    : "Write your story..."}
                />
              </div>

              {/* Send Button */}
              <button
                type="button"
                onClick={handlePost}
                disabled={isSubmitting || !poseInput.trim() ||
                  scene.status === "paused"}
                class={`w-12 h-12 rounded-xl transition-all shrink-0 flex items-center justify-center transform duration-200 ${
                  !poseInput.trim()
                    ? "text-slate-600 bg-white/5 cursor-not-allowed"
                    : inputMode === "pose"
                    ? "bg-gradient-to-br from-primary to-amber-600 text-white hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5"
                    : inputMode === "ooc"
                    ? "bg-slate-600 text-white hover:bg-slate-500 hover:-translate-y-0.5"
                    : "bg-amber-600 text-white hover:bg-amber-500 hover:-translate-y-0.5"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
        )
        : (
          <div class="p-8 text-center bg-slate-950/20 border-t border-white/5 shrink-0 backdrop-blur-sm m-4 rounded-xl border-dashed">
            <div class="inline-block p-4 rounded-full bg-slate-900 border border-white/5 mb-3 shadow-inner">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-8 h-8 text-slate-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <p class="text-slate-500 font-bold font-header uppercase tracking-widest text-sm mb-2">
              Scene Closed
            </p>
            <button
              type="button"
              onClick={toggleStatus}
              class="text-xs text-primary mt-2 hover:underline hover:text-primary-hover transition-colors"
            >
              Re-open Scene
            </button>
          </div>
        )}
    </div>
  );
}
