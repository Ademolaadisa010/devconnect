"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Monitor,
  MonitorOff,
  MessageSquare,
  Bot,
  Users,
  Plus,
  Copy,
  Check,
  Send,
  Zap,
  X,
  Hash,
  Globe,
  Lock,
  ChevronRight,
  Code2,
  Loader2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LiveSession {
  id: string;
  title: string;
  hostId: string;
  hostName: string;
  teamId?: string;
  isPrivate: boolean;
  participants: string[];
  participantNames: string[];
  status: "waiting" | "active" | "ended";
  createdAt: any;
  tags?: string[];
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: any;
  isAI?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "from-blue-500 to-cyan-400",
  "from-violet-500 to-blue-400",
  "from-cyan-500 to-teal-400",
  "from-rose-500 to-orange-400",
  "from-emerald-500 to-cyan-400",
  "from-amber-500 to-orange-400",
];

function getAvatarColor(str?: string) {
  if (!str) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name?: string): string {
  if (!name) return "U";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function timeAgo(ts?: any): string {
  if (!ts?.seconds) return "";
  const diff = (Date.now() - ts.seconds * 1000) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── STUN servers for WebRTC ───────────────────────────────────────────────────
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
export default function LivePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const teamIdParam = searchParams.get("team") ?? undefined;

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);

  // ── Sessions list ─────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // ── Active session ────────────────────────────────────────────────────────
  const [activeSession, setActiveSession] = useState<LiveSession | null>(null);
  const [inCall, setInCall] = useState(false);

  // ── Media controls ────────────────────────────────────────────────────────
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const screenStreamRef = useRef<MediaStream | null>(null);

  // ── In-call chat + AI ─────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(true);
  const [aiThinking, setAiThinking] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Create modal ──────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createTags, setCreateTags] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // ── Load sessions ─────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingSessions(true);
    const q = query(
      collection(db, "liveSessions"),
      where("status", "in", ["waiting", "active"]),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: LiveSession[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setSessions(list);
      setLoadingSessions(false);
    });
    return () => unsub();
  }, []);

  // ── Auto-join if team param ───────────────────────────────────────────────
  useEffect(() => {
    if (!teamIdParam || !currentUser || sessions.length === 0) return;
    const teamSession = sessions.find((s) => s.teamId === teamIdParam && s.status !== "ended");
    if (teamSession) joinSession(teamSession);
  }, [teamIdParam, currentUser, sessions]);

  // ── In-call chat listener ─────────────────────────────────────────────────
  useEffect(() => {
    if (!activeSession) return;
    const q = query(
      collection(db, `liveSessions/${activeSession.id}/chat`),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs: ChatMessage[] = [];
      snap.forEach((d) => msgs.push({ id: d.id, ...(d.data() as any) }));
      setChatMessages(msgs);
    });
    return () => unsub();
  }, [activeSession]);

  // ── Auto scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Attach local stream to video ──────────────────────────────────────────
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ── Create session ────────────────────────────────────────────────────────
  const handleCreateSession = async () => {
    if (!currentUser) { router.push("/login"); return; }
    if (!createTitle.trim()) return;
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "liveSessions"), {
        title: createTitle.trim(),
        hostId: currentUser.uid,
        hostName: currentUser.displayName ?? currentUser.email?.split("@")[0] ?? "Anonymous",
        teamId: teamIdParam ?? null,
        isPrivate: createPrivate,
        participants: [currentUser.uid],
        participantNames: [currentUser.displayName ?? currentUser.email?.split("@")[0] ?? "Anonymous"],
        status: "waiting",
        tags: createTags.split(",").map((t) => t.trim()).filter(Boolean),
        createdAt: serverTimestamp(),
      });
      setCreateTitle(""); setCreatePrivate(false); setCreateTags("");
      setShowCreate(false);
      // Auto-join the created session
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await joinSession({ id: snap.id, ...(snap.data() as any) } as LiveSession);
      }
    } catch (err) {
      console.error("Create session failed:", err);
    } finally {
      setCreating(false);
    }
  };

  // ── Get user media ────────────────────────────────────────────────────────
  const getLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      return stream;
    } catch {
      // Fallback: audio only
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        setLocalStream(stream);
        setCamOn(false);
        return stream;
      } catch {
        setCamOn(false);
        setMicOn(false);
        return null;
      }
    }
  };

  // ── Join session ──────────────────────────────────────────────────────────
  const joinSession = async (session: LiveSession) => {
    if (!currentUser) { router.push("/login"); return; }

    setActiveSession(session);
    setInCall(true);

    // Add user to participants
    const sessionRef = doc(db, "liveSessions", session.id);
    if (!session.participants.includes(currentUser.uid)) {
      await updateDoc(sessionRef, {
        participants: [...session.participants, currentUser.uid],
        participantNames: [
          ...session.participantNames,
          currentUser.displayName ?? currentUser.email?.split("@")[0] ?? "Anonymous",
        ],
        status: "active",
      });
    }

    // Start local media
    const stream = await getLocalStream();
    if (!stream) return;

    // Set up WebRTC peer connections for existing participants
    for (const participantId of session.participants) {
      if (participantId === currentUser.uid) continue;
      await createPeerConnection(participantId, stream, session.id);
    }

    // Listen for new participants + signaling
    setupSignaling(session.id, stream);
  };

  // ── Create peer connection ────────────────────────────────────────────────
  const createPeerConnection = async (peerId: string, stream: MediaStream, sessionId: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections.current[peerId] = pc;

    // Add local tracks
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // Handle remote stream
    pc.ontrack = (event) => {
      setRemoteStreams((prev) => ({ ...prev, [peerId]: event.streams[0] }));
    };

    // ICE candidates → Firestore
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(collection(db, `liveSessions/${sessionId}/signals`), {
          type: "ice",
          from: currentUser.uid,
          to: peerId,
          candidate: event.candidate.toJSON(),
          createdAt: serverTimestamp(),
        });
      }
    };

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await addDoc(collection(db, `liveSessions/${sessionId}/signals`), {
      type: "offer",
      from: currentUser.uid,
      to: peerId,
      sdp: offer.sdp,
      createdAt: serverTimestamp(),
    });

    return pc;
  };

  // ── WebRTC signaling listener ─────────────────────────────────────────────
  const setupSignaling = (sessionId: string, stream: MediaStream) => {
    const q = query(
      collection(db, `liveSessions/${sessionId}/signals`),
      where("to", "==", currentUser.uid),
      orderBy("createdAt", "asc")
    );

    onSnapshot(q, async (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== "added") continue;
        const signal = change.doc.data();

        if (signal.type === "offer") {
          // Create peer connection as answerer
          if (!peerConnections.current[signal.from]) {
            const pc = new RTCPeerConnection(ICE_SERVERS);
            peerConnections.current[signal.from] = pc;
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));
            pc.ontrack = (e) => setRemoteStreams((prev) => ({ ...prev, [signal.from]: e.streams[0] }));
            pc.onicecandidate = async (e) => {
              if (e.candidate) {
                await addDoc(collection(db, `liveSessions/${sessionId}/signals`), {
                  type: "ice", from: currentUser.uid, to: signal.from,
                  candidate: e.candidate.toJSON(), createdAt: serverTimestamp(),
                });
              }
            };
            await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await addDoc(collection(db, `liveSessions/${sessionId}/signals`), {
              type: "answer", from: currentUser.uid, to: signal.from,
              sdp: answer.sdp, createdAt: serverTimestamp(),
            });
          }
        } else if (signal.type === "answer") {
          const pc = peerConnections.current[signal.from];
          if (pc && pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          }
        } else if (signal.type === "ice") {
          const pc = peerConnections.current[signal.from];
          if (pc) {
            try { await pc.addIceCandidate(signal.candidate); } catch {}
          }
        }
      }
    });
  };

  // ── Leave call ────────────────────────────────────────────────────────────
  const leaveCall = async () => {
    // Stop local stream
    localStream?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());

    // Close peer connections
    Object.values(peerConnections.current).forEach((pc) => pc.close());
    peerConnections.current = {};

    // Remove from participants
    if (activeSession && currentUser) {
      const ref = doc(db, "liveSessions", activeSession.id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as any;
        const newParticipants = data.participants.filter((id: string) => id !== currentUser.uid);
        const newNames = data.participantNames.filter(
          (_: string, i: number) => data.participants[i] !== currentUser.uid
        );
        if (newParticipants.length === 0) {
          await updateDoc(ref, { status: "ended", participants: [], participantNames: [] });
        } else {
          await updateDoc(ref, { participants: newParticipants, participantNames: newNames });
        }
      }
    }

    setLocalStream(null);
    setRemoteStreams({});
    setActiveSession(null);
    setInCall(false);
    setScreenSharing(false);
    setChatMessages([]);
    setMicOn(true);
    setCamOn(true);
  };

  // ── Toggle mic ────────────────────────────────────────────────────────────
  const toggleMic = () => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn(!micOn);
  };

  // ── Toggle camera ─────────────────────────────────────────────────────────
  const toggleCam = () => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn(!camOn);
  };

  // ── Screen share ──────────────────────────────────────────────────────────
  const toggleScreenShare = async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenSharing(false);
      // Restore camera tracks in peer connections
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          Object.values(peerConnections.current).forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            sender?.replaceTrack(videoTrack);
          });
        }
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        setScreenSharing(true);
        const screenTrack = screenStream.getVideoTracks()[0];
        // Replace video track in all peer connections
        Object.values(peerConnections.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          sender?.replaceTrack(screenTrack);
        });
        // Stop sharing when user clicks browser's "Stop sharing"
        screenTrack.onended = () => {
          setScreenSharing(false);
          screenStreamRef.current = null;
        };
      } catch {}
    }
  };

  // ── Send chat message ─────────────────────────────────────────────────────
  const sendChatMessage = async () => {
    if (!chatInput.trim() || !activeSession || !currentUser) return;
    const text = chatInput.trim();
    setChatInput("");

    await addDoc(collection(db, `liveSessions/${activeSession.id}/chat`), {
      senderId: currentUser.uid,
      senderName: currentUser.displayName ?? currentUser.email?.split("@")[0] ?? "Anonymous",
      text,
      isAI: false,
      createdAt: serverTimestamp(),
    });

    // Check if message mentions the AI
    if (text.toLowerCase().includes("@ai") || text.toLowerCase().startsWith("hey ai")) {
      await callAI(text, activeSession.id);
    }
  };

  // ── Call AI assistant ─────────────────────────────────────────────────────
  const callAI = async (prompt: string, sessionId: string) => {
    setAiThinking(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: "You are an AI coding assistant joining a live developer collaboration session. Be concise, helpful, and technical. Format code snippets with markdown backticks.",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await response.json();
      const aiText = data.content?.[0]?.text ?? "Sorry, I couldn't process that.";

      await addDoc(collection(db, `liveSessions/${sessionId}/chat`), {
        senderId: "ai",
        senderName: "DevConnect AI",
        text: aiText,
        isAI: true,
        createdAt: serverTimestamp(),
      });
    } catch {
      await addDoc(collection(db, `liveSessions/${sessionId}/chat`), {
        senderId: "ai",
        senderName: "DevConnect AI",
        text: "I'm having trouble connecting right now. Please try again.",
        isAI: true,
        createdAt: serverTimestamp(),
      });
    } finally {
      setAiThinking(false);
    }
  };

  const sendAIDirectly = async () => {
    if (!aiInput.trim() || !activeSession) return;
    const prompt = aiInput.trim();
    setAiInput("");
    await callAI(prompt, activeSession.id);
  };

  const copySessionLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/live?session=${id}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const navLinks = [
    { label: "Feed", href: "/feed" },
    { label: "Teams", href: "/teams" },
    { label: "Explore", href: "/explore" },
  ];

  // ── Remote video component ────────────────────────────────────────────────
  const RemoteVideo = ({ peerId, stream }: { peerId: string; stream: MediaStream }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
      if (videoRef.current) videoRef.current.srcObject = stream;
    }, [stream]);
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover rounded-xl"
      />
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ── IN-CALL VIEW ──────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  if (inCall && activeSession) {
    const remoteEntries = Object.entries(remoteStreams);
    const totalParticipants = activeSession.participants.length;

    return (
      <div className="flex h-screen bg-[#080B10] text-white font-sans overflow-hidden">

        {/* ── Video grid ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Call header */}
          <header className="h-12 border-b border-white/5 flex items-center justify-between px-5 bg-[#080B10]/90 backdrop-blur-xl flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-bold">{activeSession.title}</span>
              <span className="text-xs text-gray-600 border-l border-white/5 pl-2.5">
                {totalParticipants} participant{totalParticipants !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowChat(!showChat)}
                className={`p-2 rounded-xl text-xs flex items-center gap-1.5 transition-all ${showChat ? "bg-[#1E90FF]/15 text-[#1E90FF]" : "bg-white/5 text-gray-400 hover:text-white"}`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Chat</span>
              </button>
              <button
                onClick={() => setShowAIPanel(!showAIPanel)}
                className={`p-2 rounded-xl text-xs flex items-center gap-1.5 transition-all ${showAIPanel ? "bg-violet-500/15 text-violet-400" : "bg-white/5 text-gray-400 hover:text-white"}`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">AI</span>
              </button>
            </div>
          </header>

          {/* Video grid */}
          <div className="flex-1 p-3 overflow-hidden">
            <div className={`grid h-full gap-3 ${
              remoteEntries.length === 0 ? "grid-cols-1" :
              remoteEntries.length === 1 ? "grid-cols-2" :
              remoteEntries.length <= 3 ? "grid-cols-2 grid-rows-2" :
              "grid-cols-3 grid-rows-2"
            }`}>

              {/* Local video */}
              <div className="relative bg-[#0E1117] rounded-2xl overflow-hidden border border-white/5">
                {camOn ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getAvatarColor(currentUser?.uid)} flex items-center justify-center text-xl font-black`}>
                      {getInitials(currentUser?.displayName ?? currentUser?.email ?? undefined)}
                    </div>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-lg px-2 py-1">
                  {!micOn && <MicOff className="w-3 h-3 text-red-400" />}
                  <span className="text-[10px] font-semibold">
                    {currentUser?.displayName ?? currentUser?.email?.split("@")[0] ?? "You"} (You)
                  </span>
                </div>
                {screenSharing && (
                  <div className="absolute top-2 right-2 bg-[#1E90FF]/80 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Sharing
                  </div>
                )}
              </div>

              {/* Remote videos */}
              {remoteEntries.map(([peerId, stream]) => {
                const participantIdx = activeSession.participants.indexOf(peerId);
                const name = activeSession.participantNames[participantIdx] || "Participant";
                return (
                  <div key={peerId} className="relative bg-[#0E1117] rounded-2xl overflow-hidden border border-white/5">
                    <RemoteVideo peerId={peerId} stream={stream} />
                    <div className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-sm rounded-lg px-2 py-1">
                      <span className="text-[10px] font-semibold">{name}</span>
                    </div>
                  </div>
                );
              })}

              {/* Waiting placeholder if alone */}
              {remoteEntries.length === 0 && (
                <div className="bg-[#0E1117] rounded-2xl border border-white/5 border-dashed flex flex-col items-center justify-center text-center p-6">
                  <Users className="w-8 h-8 text-gray-700 mb-3" />
                  <p className="text-gray-600 text-sm">Waiting for others to join…</p>
                  <button
                    onClick={() => copySessionLink(activeSession.id)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-[#1E90FF] hover:underline"
                  >
                    <Copy className="w-3 h-3" />
                    Copy invite link
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Controls bar */}
          <div className="flex items-center justify-center gap-3 py-4 border-t border-white/5 bg-[#080B10] flex-shrink-0">
            <button
              onClick={toggleMic}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${micOn ? "bg-white/10 hover:bg-white/15 text-white" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}
            >
              {micOn ? <Mic className="w-4.5 h-4.5" /> : <MicOff className="w-4.5 h-4.5" />}
            </button>
            <button
              onClick={toggleCam}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${camOn ? "bg-white/10 hover:bg-white/15 text-white" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}
            >
              {camOn ? <Video className="w-4.5 h-4.5" /> : <VideoOff className="w-4.5 h-4.5" />}
            </button>
            <button
              onClick={toggleScreenShare}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${screenSharing ? "bg-[#1E90FF]/20 text-[#1E90FF] border border-[#1E90FF]/30" : "bg-white/10 hover:bg-white/15 text-white"}`}
            >
              {screenSharing ? <MonitorOff className="w-4.5 h-4.5" /> : <Monitor className="w-4.5 h-4.5" />}
            </button>
            <button
              onClick={leaveCall}
              className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all shadow-lg shadow-red-500/25"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Right panel: Chat + AI ── */}
        {(showChat || showAIPanel) && (
          <aside className="w-72 flex flex-col border-l border-white/5 bg-[#0A0D13] flex-shrink-0">

            {/* Panel tabs */}
            <div className="flex border-b border-white/5 flex-shrink-0">
              <button
                onClick={() => { setShowChat(true); setShowAIPanel(false); }}
                className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${showChat && !showAIPanel ? "text-white border-b-2 border-[#1E90FF]" : "text-gray-600 hover:text-gray-400"}`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> Chat
              </button>
              <button
                onClick={() => { setShowAIPanel(true); setShowChat(false); }}
                className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${showAIPanel ? "text-white border-b-2 border-violet-500" : "text-gray-600 hover:text-gray-400"}`}
              >
                <Bot className="w-3.5 h-3.5" /> AI Assistant
              </button>
            </div>

            {/* Chat panel */}
            {showChat && !showAIPanel && (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {chatMessages.length === 0 && (
                    <p className="text-xs text-gray-700 text-center mt-6">No messages yet. Say hi!</p>
                  )}
                  {chatMessages.map((msg) => {
                    const isMe = msg.senderId === currentUser?.uid;
                    return (
                      <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 ${msg.isAI ? "bg-gradient-to-br from-violet-500 to-blue-400" : `bg-gradient-to-br ${getAvatarColor(msg.senderId)}`}`}>
                          {msg.isAI ? <Bot className="w-3 h-3" /> : getInitials(msg.senderName)}
                        </div>
                        <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                          {!isMe && <span className="text-[9px] text-gray-600 mb-0.5 ml-1">{msg.isAI ? "DevConnect AI" : msg.senderName}</span>}
                          <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed break-words ${
                            msg.isAI
                              ? "bg-violet-500/10 border border-violet-500/20 text-gray-200"
                              : isMe
                              ? "bg-[#1E90FF] text-white"
                              : "bg-[#0E1117] border border-white/5 text-gray-300"
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {aiThinking && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-400 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-3 h-3" />
                      </div>
                      <div className="bg-violet-500/10 border border-violet-500/20 px-3 py-2 rounded-xl">
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-3 border-t border-white/5 flex-shrink-0">
                  <div className="flex gap-2 items-center bg-[#0E1117] border border-white/8 focus-within:border-[#1E90FF]/30 rounded-xl px-3 py-2 transition-colors">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                      placeholder="Message or @AI to ask…"
                      className="flex-1 bg-transparent text-xs text-white placeholder-gray-600 outline-none"
                    />
                    <button onClick={sendChatMessage} disabled={!chatInput.trim()} className="text-[#1E90FF] disabled:opacity-30">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-700 mt-1.5 text-center">Type @AI to summon the assistant</p>
                </div>
              </>
            )}

            {/* AI panel */}
            {showAIPanel && (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 text-xs text-gray-400 leading-relaxed">
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="w-4 h-4 text-violet-400" />
                      <span className="font-semibold text-violet-300">DevConnect AI</span>
                    </div>
                    Ask me anything during your session — debug errors, explain code, generate ideas, or just think out loud together.
                  </div>

                  {chatMessages.filter((m) => m.isAI || chatMessages.some((n) => n.senderId === currentUser?.uid && n.text.includes("@AI"))).map((msg) => (
                    <div key={msg.id} className={`flex gap-2 ${msg.senderId === currentUser?.uid ? "flex-row-reverse" : ""}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 ${msg.isAI ? "bg-gradient-to-br from-violet-500 to-blue-400" : `bg-gradient-to-br ${getAvatarColor(msg.senderId)}`}`}>
                        {msg.isAI ? <Bot className="w-3 h-3" /> : getInitials(msg.senderName)}
                      </div>
                      <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed break-words ${
                        msg.isAI
                          ? "bg-violet-500/10 border border-violet-500/20 text-gray-200"
                          : "bg-[#0E1117] border border-white/5 text-gray-300"
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}

                  {aiThinking && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-400 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-3 h-3" />
                      </div>
                      <div className="bg-violet-500/10 border border-violet-500/20 px-3 py-2 rounded-xl">
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-3 border-t border-white/5 flex-shrink-0">
                  <div className="flex gap-2 items-center bg-[#0E1117] border border-white/8 focus-within:border-violet-500/30 rounded-xl px-3 py-2 transition-colors">
                    <Bot className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                    <input
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendAIDirectly()}
                      placeholder="Ask the AI anything…"
                      className="flex-1 bg-transparent text-xs text-white placeholder-gray-600 outline-none"
                    />
                    <button onClick={sendAIDirectly} disabled={!aiInput.trim() || aiThinking} className="text-violet-400 disabled:opacity-30">
                      {aiThinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </aside>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── SESSIONS LIST VIEW ───────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080B10] text-white font-sans">

      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 py-3.5 border-b border-white/5 bg-[#080B10]/80 backdrop-blur-xl">
        <Link href="/">
          <span className="text-[#1E90FF] text-xl font-black tracking-tight">
            Dev<span className="text-white">Connect</span>
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-1 bg-white/5 border border-white/8 rounded-full px-1 py-1">
          {navLinks.map(({ label, href }) => (
            <Link key={label} href={href}>
              <button className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${pathname === href ? "bg-[#1E90FF] text-white shadow-lg shadow-blue-500/20" : "text-gray-400 hover:text-white"}`}>
                {label}
              </button>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {authReady && (currentUser ? (
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(currentUser.uid)} flex items-center justify-center text-xs font-bold overflow-hidden`}>
              {currentUser.photoURL
                ? <img src={currentUser.photoURL} alt="me" className="w-8 h-8 object-cover rounded-full" />
                : getInitials(currentUser.displayName ?? currentUser.email ?? undefined)}
            </div>
          ) : (
            <Link href="/login">
              <button className="text-sm bg-[#1E90FF] hover:bg-[#1a7de0] px-4 py-2 rounded-full font-semibold transition-all shadow-lg shadow-blue-500/20">Login</button>
            </Link>
          ))}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-400 font-semibold uppercase tracking-widest">Live Now</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black">Live Sessions</h1>
            <p className="text-gray-500 text-sm mt-1">Jump into a live coding session or start your own.</p>
          </div>
          <button
            onClick={() => currentUser ? setShowCreate(true) : router.push("/login")}
            className="flex items-center gap-2 bg-[#1E90FF] hover:bg-[#1a7de0] px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" /> Start Session
          </button>
        </div>

        {/* Feature chips */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { icon: <Video className="w-3 h-3" />, label: "Video Calls" },
            { icon: <Monitor className="w-3 h-3" />, label: "Screen Share" },
            { icon: <Code2 className="w-3 h-3" />, label: "Live Coding" },
            { icon: <Bot className="w-3 h-3" />, label: "AI Assistant" },
            { icon: <MessageSquare className="w-3 h-3" />, label: "In-call Chat" },
          ].map(({ icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs bg-white/5 border border-white/8 px-3 py-1.5 rounded-full text-gray-400">
              {icon}{label}
            </span>
          ))}
        </div>

        {/* Sessions grid */}
        {loadingSessions ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[#0E1117] border border-white/5 rounded-2xl p-5 animate-pulse space-y-3">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-white/5 rounded w-3/4" />
                    <div className="h-2 bg-white/5 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-2 bg-white/5 rounded w-full" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1E90FF]/10 border border-[#1E90FF]/20 flex items-center justify-center mx-auto mb-5">
              <Zap className="w-8 h-8 text-[#1E90FF]" />
            </div>
            <h3 className="font-bold text-xl mb-2">No live sessions right now</h3>
            <p className="text-gray-600 text-sm mb-6 max-w-sm mx-auto">
              Be the first to start one! Invite your team, share your screen, and bring in the AI assistant.
            </p>
            <button
              onClick={() => currentUser ? setShowCreate(true) : router.push("/login")}
              className="bg-[#1E90FF] hover:bg-[#1a7de0] px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20"
            >
              Start a Session
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="bg-[#0E1117] border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 hover:shadow-xl hover:shadow-black/20"
              >
                {/* Session header */}
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(session.hostId)} flex items-center justify-center text-sm font-bold flex-shrink-0`}>
                    {getInitials(session.hostName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm truncate">{session.title}</h3>
                      <div className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${session.status === "active" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${session.status === "active" ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
                        {session.status === "active" ? "Live" : "Waiting"}
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {session.hostName} · {timeAgo(session.createdAt)}
                    </p>
                  </div>
                  {session.isPrivate
                    ? <Lock className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" />
                    : <Globe className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" />}
                </div>

                {/* Tags */}
                {session.tags && session.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {session.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="flex items-center gap-1 text-[10px] bg-white/5 border border-white/8 px-2 py-0.5 rounded-full text-gray-500">
                        <Hash className="w-2.5 h-2.5" />{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Participants */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1.5">
                      {session.participantNames.slice(0, 4).map((name, i) => (
                        <div key={i} className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAvatarColor(session.participants[i])} border-2 border-[#0E1117] flex items-center justify-center text-[8px] font-bold`}>
                          {getInitials(name)}
                        </div>
                      ))}
                    </div>
                    <span className="text-xs text-gray-600">
                      {session.participants.length} in call
                    </span>
                  </div>
                  <button
                    onClick={() => copySessionLink(session.id)}
                    className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-all"
                  >
                    {copiedId === session.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Join button */}
                <button
                  onClick={() => joinSession(session)}
                  className="w-full flex items-center justify-center gap-2 bg-[#1E90FF]/10 hover:bg-[#1E90FF]/15 border border-[#1E90FF]/20 py-2.5 rounded-xl text-sm font-semibold text-[#1E90FF] transition-all"
                >
                  <Zap className="w-4 h-4" />
                  {session.participants.includes(currentUser?.uid) ? "Rejoin" : "Join Session"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative z-10 bg-[#0E1117] border border-white/8 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg">Start a Live Session</h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/8 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5 block">Session Title *</label>
                <input
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="e.g. Debugging the auth flow"
                  className="w-full bg-[#080B10] border border-white/8 focus:border-[#1E90FF]/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5 block">Tags (comma separated)</label>
                <input
                  value={createTags}
                  onChange={(e) => setCreateTags(e.target.value)}
                  placeholder="react, debugging, typescript"
                  className="w-full bg-[#080B10] border border-white/8 focus:border-[#1E90FF]/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none transition-colors"
                />
              </div>

              <div
                onClick={() => setCreatePrivate(!createPrivate)}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${createPrivate ? "border-[#1E90FF]/30 bg-[#1E90FF]/5" : "border-white/8 bg-white/3 hover:bg-white/5"}`}
              >
                <div className="flex items-center gap-2">
                  {createPrivate ? <Lock className="w-4 h-4 text-[#1E90FF]" /> : <Globe className="w-4 h-4 text-gray-400" />}
                  <div>
                    <p className="text-sm font-medium">{createPrivate ? "Private Session" : "Public Session"}</p>
                    <p className="text-[10px] text-gray-600">{createPrivate ? "Only invited members can join" : "Anyone can discover and join"}</p>
                  </div>
                </div>
                <div className={`w-9 h-5 rounded-full transition-all relative ${createPrivate ? "bg-[#1E90FF]" : "bg-white/10"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${createPrivate ? "left-4" : "left-0.5"}`} />
                </div>
              </div>

              {/* Features reminder */}
              <div className="bg-white/3 border border-white/5 rounded-xl p-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Your session includes</p>
                {["HD video & audio", "Screen sharing", "AI assistant on demand", "In-call group chat"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="w-1 h-1 rounded-full bg-[#1E90FF]" />{f}
                  </div>
                ))}
              </div>

              <button
                onClick={handleCreateSession}
                disabled={creating || !createTitle.trim()}
                className="w-full bg-[#1E90FF] hover:bg-[#1a7de0] disabled:opacity-40 disabled:cursor-not-allowed py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
              >
                {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</> : <><Zap className="w-4 h-4" /> Start Session</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}