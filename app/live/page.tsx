"use client";

/**
 * DevConnect Live Page
 * 
 * WebRTC fix summary:
 * 1. RemoteVideoTile is a stable component outside the parent — never remounts
 * 2. Remote streams stored in a ref AND mirrored to state for rendering
 * 3. signaling listener starts BEFORE we send any offer
 * 4. ICE candidates are queued if remote description isn't set yet
 * 5. TURN servers added for cross-network audio/video
 * 6. Each peer gets its own dedicated MediaStream object for remote tracks
 * 7. processedSignals set prevents duplicate signal handling
 */

import { useEffect, useState, useRef, Suspense, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import {
  collection, addDoc, onSnapshot, query, where,
  orderBy, serverTimestamp, doc, updateDoc, getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Mic, MicOff, Video, VideoOff, PhoneOff,
  Monitor, MonitorOff, MessageSquare, Bot,
  Users, Plus, Copy, Check, Send, Zap, X,
  Hash, Globe, Lock, Code2, Loader2, Volume2,
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
const COLORS = [
  "from-blue-500 to-cyan-400", "from-violet-500 to-blue-400",
  "from-cyan-500 to-teal-400", "from-rose-500 to-orange-400",
  "from-emerald-500 to-cyan-400", "from-amber-500 to-orange-400",
];
function color(s?: string) {
  if (!s) return COLORS[0];
  let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}
function initials(n?: string) {
  if (!n) return "U";
  return n.split(" ").map(x => x[0]).join("").toUpperCase().slice(0, 2);
}
function ago(ts?: any) {
  if (!ts?.seconds) return "";
  const d = (Date.now() - ts.seconds * 1000) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

// ── ICE config with TURN for cross-network ────────────────────────────────────
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

// ── RemoteVideoTile — MUST be outside main component ─────────────────────────
// Defined at module level so React never recreates it on parent re-render.
// If this is inside the parent, it remounts every render → srcObject is lost.
function RemoteVideoTile({
  peerId, stream, name,
}: { peerId: string; stream: MediaStream; name: string }) {
  const vidRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = vidRef.current;
    if (!el) return;
    // Only reassign if the stream actually changed
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
  }, [stream]);

  return (
    <div className="relative w-full h-full bg-[#0E1117] rounded-2xl overflow-hidden border border-white/5">
      <video
        ref={vidRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
        <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${color(peerId)} flex items-center justify-center text-[7px] font-bold flex-shrink-0`}>
          {initials(name)}
        </div>
        <span className="text-[10px] font-semibold text-white truncate max-w-[100px]">{name}</span>
        <Volume2 className="w-3 h-3 text-green-400 flex-shrink-0" />
      </div>
    </div>
  );
}

// ── Peer state ────────────────────────────────────────────────────────────────
interface PeerEntry {
  pc: RTCPeerConnection;
  remoteStream: MediaStream;
  iceCandidateQueue: RTCIceCandidateInit[];
}

// ─────────────────────────────────────────────────────────────────────────────
function LivePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const teamParam = searchParams.get("team") ?? undefined;

  const [me, setMe] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);

  // Sessions list
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Call state
  const [inCall, setInCall] = useState(false);
  const [session, setSession] = useState<LiveSession | null>(null);

  // Media controls
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);

  // Remote streams: peerId → MediaStream
  // We keep a ref for the engine and mirror to state for rendering
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  // WebRTC
  const peersRef = useRef<Record<string, PeerEntry>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVidRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<string>("");
  const meRef = useRef<any>(null);
  const signalingUnsubRef = useRef<(() => void) | null>(null);
  const seenSignals = useRef<Set<string>>(new Set());

  // Chat / AI
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createTags, setCreateTags] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Keep refs in sync
  useEffect(() => { meRef.current = me; }, [me]);

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const u = onAuthStateChanged(auth, user => { setMe(user); setAuthReady(true); });
    return () => u();
  }, []);

  // ── Sessions listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "liveSessions"),
      where("status", "in", ["waiting", "active"]),
      orderBy("createdAt", "desc")
    );
    const u = onSnapshot(q, snap => {
      const list: LiveSession[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() as any }));
      setSessions(list);
      setLoadingSessions(false);
    });
    return () => u();
  }, []);

  // Auto-join from teams page
  useEffect(() => {
    if (!teamParam || !me || sessions.length === 0 || inCall) return;
    const s = sessions.find(x => x.teamId === teamParam && x.status !== "ended");
    if (s) handleJoin(s);
  }, [teamParam, me, sessions, inCall]);

  // ── Chat listener ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const q = query(
      collection(db, `liveSessions/${session.id}/chat`),
      orderBy("createdAt", "asc")
    );
    const u = onSnapshot(q, snap => {
      const list: ChatMessage[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() as any }));
      setMsgs(list);
    });
    return () => u();
  }, [session]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // Keep local video attached
  useEffect(() => {
    if (localVidRef.current && localStreamRef.current) {
      if (localVidRef.current.srcObject !== localStreamRef.current) {
        localVidRef.current.srcObject = localStreamRef.current;
      }
    }
  });

  // ── Get local media ─────────────────────────────────────────────────────────
  const getMedia = async (): Promise<MediaStream | null> => {
    // Try video + audio
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = s;
      if (localVidRef.current) {
        localVidRef.current.srcObject = s;
        localVidRef.current.play().catch(() => {});
      }
      return s;
    } catch {
      // Fallback: audio only
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        localStreamRef.current = s;
        setCamOn(false);
        return s;
      } catch {
        setCamOn(false);
        setMicOn(false);
        // Return silent stream so WebRTC still works
        return null;
      }
    }
  };

  // ── Create RTCPeerConnection for one peer ───────────────────────────────────
  const buildPC = useCallback((peerId: string, localStream: MediaStream): RTCPeerConnection => {
    // Clean up any existing connection
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].pc.close();
      delete peersRef.current[peerId];
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const remoteStream = new MediaStream(); // dedicated stream per peer

    peersRef.current[peerId] = { pc, remoteStream, iceCandidateQueue: [] };

    // Add all local tracks to this connection
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });

    // When remote tracks arrive, add to the dedicated stream
    pc.ontrack = (evt) => {
      console.log(`[${peerId}] ontrack`, evt.track.kind);
      evt.track.onunmute = () => {
        remoteStream.addTrack(evt.track);
        // Update both ref and state
        remoteStreamsRef.current[peerId] = remoteStream;
        setRemoteStreams(prev => ({ ...prev, [peerId]: remoteStream }));
      };
      // Also add immediately (some browsers fire unmute before ontrack)
      if (evt.track.readyState === "live") {
        remoteStream.addTrack(evt.track);
        remoteStreamsRef.current[peerId] = remoteStream;
        setRemoteStreams(prev => ({ ...prev, [peerId]: remoteStream }));
      }
    };

    // Send ICE candidates to Firestore
    pc.onicecandidate = async (evt) => {
      if (!evt.candidate) return;
      try {
        await addDoc(collection(db, `liveSessions/${sessionRef.current}/signals`), {
          type: "ice",
          from: meRef.current?.uid,
          to: peerId,
          candidate: evt.candidate.toJSON(),
          createdAt: serverTimestamp(),
        });
      } catch (e) { console.error("ICE send error:", e); }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[${peerId}] connection state:`, pc.connectionState);
      if (pc.connectionState === "failed") {
        // Attempt ICE restart
        pc.restartIce();
      }
      if (pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        setRemoteStreams(prev => {
          const n = { ...prev };
          delete n[peerId];
          return n;
        });
        delete remoteStreamsRef.current[peerId];
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log(`[${peerId}] ICE gathering:`, pc.iceGatheringState);
    };

    return pc;
  }, []);

  // ── Drain queued ICE candidates ─────────────────────────────────────────────
  const drainICE = useCallback(async (peerId: string) => {
    const entry = peersRef.current[peerId];
    if (!entry) return;
    while (entry.iceCandidateQueue.length > 0) {
      const c = entry.iceCandidateQueue.shift()!;
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) { console.warn("drain ICE error:", e); }
    }
  }, []);

  // ── Signaling listener ──────────────────────────────────────────────────────
  // Must start BEFORE we send any offer so we don't miss answers/ICE
  const startSignaling = useCallback((sessionId: string, localStream: MediaStream) => {
    signalingUnsubRef.current?.();
    seenSignals.current.clear();

    const q = query(
      collection(db, `liveSessions/${sessionId}/signals`),
      where("to", "==", meRef.current?.uid),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, async (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== "added") continue;
        const id = change.doc.id;
        if (seenSignals.current.has(id)) continue;
        seenSignals.current.add(id);

        const sig = change.doc.data();
        const fromId: string = sig.from;
        console.log(`[signaling] received ${sig.type} from ${fromId}`);

        if (sig.type === "offer") {
          // Someone is calling us — build PC as answerer
          const pc = buildPC(fromId, localStream);

          try {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: sig.sdp }));
            await drainICE(fromId);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await addDoc(collection(db, `liveSessions/${sessionId}/signals`), {
              type: "answer",
              from: meRef.current?.uid,
              to: fromId,
              sdp: answer.sdp,
              createdAt: serverTimestamp(),
            });
          } catch (e) { console.error("answer error:", e); }

        } else if (sig.type === "answer") {
          const entry = peersRef.current[fromId];
          if (!entry) { console.warn("no PC for answer from", fromId); continue; }
          if (entry.pc.signalingState !== "have-local-offer") continue;

          try {
            await entry.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: sig.sdp }));
            await drainICE(fromId);
          } catch (e) { console.error("setRemoteDescription(answer) error:", e); }

        } else if (sig.type === "ice") {
          const entry = peersRef.current[fromId];
          if (!entry) { console.warn("no PC for ICE from", fromId); continue; }

          const candidate: RTCIceCandidateInit = sig.candidate;
          if (!entry.pc.remoteDescription) {
            // Queue — remote description not set yet
            entry.iceCandidateQueue.push(candidate);
          } else {
            try {
              await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) { console.warn("addIceCandidate error:", e); }
          }
        }
      }
    });

    signalingUnsubRef.current = unsub;
  }, [buildPC, drainICE]);

  // ── Join a session ──────────────────────────────────────────────────────────
  const handleJoin = useCallback(async (s: LiveSession) => {
    if (!me) { router.push("/login"); return; }

    sessionRef.current = s.id;

    // 1. Get local media
    const localStream = await getMedia();

    // 2. Start signaling listener FIRST — before sending any offer
    startSignaling(s.id, localStream || new MediaStream());

    // 3. Add ourselves to Firestore participants
    const sRef = doc(db, "liveSessions", s.id);
    const snap = await getDoc(sRef);
    if (!snap.exists()) return;
    const data = snap.data() as any;

    const alreadyIn = (data.participants as string[]).includes(me.uid);
    if (!alreadyIn) {
      await updateDoc(sRef, {
        participants: [...data.participants, me.uid],
        participantNames: [
          ...data.participantNames,
          me.displayName ?? me.email?.split("@")[0] ?? "Anonymous",
        ],
        status: "active",
      });
    }

    // 4. Re-read fresh participant list
    const freshSnap = await getDoc(sRef);
    if (!freshSnap.exists()) return;
    const fresh = freshSnap.data() as any;
    const freshSession: LiveSession = { id: s.id, ...fresh };
    setSession(freshSession);
    setInCall(true);

    if (!localStream) return;

    // 5. For each OTHER participant already in the call,
    //    we create a PC and send an offer (we are the caller)
    const others = (fresh.participants as string[]).filter((p: string) => p !== me.uid);
    console.log("Sending offers to:", others);

    for (const peerId of others) {
      const pc = buildPC(peerId, localStream);
      try {
        // Create offer with explicit constraints
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);

        await addDoc(collection(db, `liveSessions/${s.id}/signals`), {
          type: "offer",
          from: me.uid,
          to: peerId,
          sdp: offer.sdp,
          createdAt: serverTimestamp(),
        });
      } catch (e) { console.error("offer error to", peerId, e); }
    }
  }, [me, buildPC, startSignaling, router]);

  // ── Leave call ──────────────────────────────────────────────────────────────
  const handleLeave = useCallback(async () => {
    // Stop signaling
    signalingUnsubRef.current?.();
    signalingUnsubRef.current = null;
    seenSignals.current.clear();

    // Stop local tracks
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current = null;

    // Close all peer connections
    Object.values(peersRef.current).forEach(({ pc }) => pc.close());
    peersRef.current = {};
    remoteStreamsRef.current = {};

    // Remove from Firestore
    if (session && me) {
      const r = doc(db, "liveSessions", session.id);
      const s = await getDoc(r);
      if (s.exists()) {
        const d = s.data() as any;
        const newP = (d.participants as string[]).filter((id: string) => id !== me.uid);
        const newN = (d.participantNames as string[]).filter(
          (_: string, i: number) => d.participants[i] !== me.uid
        );
        await updateDoc(r, {
          participants: newP,
          participantNames: newN,
          status: newP.length === 0 ? "ended" : "active",
        });
      }
    }

    setRemoteStreams({});
    setSession(null);
    setInCall(false);
    setSharing(false);
    setMsgs([]);
    setMicOn(true);
    setCamOn(true);
  }, [session, me]);

  // ── Toggle mic ──────────────────────────────────────────────────────────────
  const toggleMic = () => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !micOn;
    s.getAudioTracks().forEach(t => { t.enabled = next; });
    setMicOn(next);
  };

  // ── Toggle camera ───────────────────────────────────────────────────────────
  const toggleCam = () => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !camOn;
    s.getVideoTracks().forEach(t => { t.enabled = next; });
    setCamOn(next);
  };

  // ── Screen share ────────────────────────────────────────────────────────────
  const toggleShare = async () => {
    if (sharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setSharing(false);
      const cam = localStreamRef.current?.getVideoTracks()[0];
      if (cam) {
        Object.values(peersRef.current).forEach(({ pc }) => {
          const s = pc.getSenders().find(x => x.track?.kind === "video");
          s?.replaceTrack(cam).catch(() => {});
        });
      }
    } else {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } } as any,
          audio: true,
        });
        screenStreamRef.current = ss;
        setSharing(true);
        const screenTrack = ss.getVideoTracks()[0];
        Object.values(peersRef.current).forEach(({ pc }) => {
          const s = pc.getSenders().find(x => x.track?.kind === "video");
          s?.replaceTrack(screenTrack).catch(() => {});
        });
        screenTrack.onended = () => {
          setSharing(false);
          screenStreamRef.current = null;
          const cam = localStreamRef.current?.getVideoTracks()[0];
          if (cam) Object.values(peersRef.current).forEach(({ pc }) => {
            const s = pc.getSenders().find(x => x.track?.kind === "video");
            s?.replaceTrack(cam).catch(() => {});
          });
        };
      } catch {}
    }
  };

  // ── Chat ────────────────────────────────────────────────────────────────────
  const sendMsg = async () => {
    if (!chatInput.trim() || !session || !me) return;
    const text = chatInput.trim();
    setChatInput("");
    await addDoc(collection(db, `liveSessions/${session.id}/chat`), {
      senderId: me.uid,
      senderName: me.displayName ?? me.email?.split("@")[0] ?? "Anonymous",
      text, isAI: false, createdAt: serverTimestamp(),
    });
    if (text.toLowerCase().includes("@ai") || text.toLowerCase().startsWith("hey ai")) {
      await askAI(text, session.id);
    }
  };

  // ── AI ──────────────────────────────────────────────────────────────────────
  const askAI = async (prompt: string, sessionId: string) => {
    setAiLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: "You are an AI coding assistant in a live developer session. Be concise and technical. Use markdown backticks for code.",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text ?? "Sorry, couldn't process that.";
      await addDoc(collection(db, `liveSessions/${sessionId}/chat`), {
        senderId: "ai", senderName: "DevConnect AI",
        text: reply, isAI: true, createdAt: serverTimestamp(),
      });
    } catch {
      await addDoc(collection(db, `liveSessions/${sessionId}/chat`), {
        senderId: "ai", senderName: "DevConnect AI",
        text: "Connection issue. Try again.", isAI: true, createdAt: serverTimestamp(),
      });
    } finally { setAiLoading(false); }
  };

  const sendAI = async () => {
    if (!aiInput.trim() || !session) return;
    const p = aiInput.trim(); setAiInput("");
    await askAI(p, session.id);
  };

  // ── Create session ──────────────────────────────────────────────────────────
  const createSession = async () => {
    if (!me) { router.push("/login"); return; }
    if (!createTitle.trim()) return;
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "liveSessions"), {
        title: createTitle.trim(),
        hostId: me.uid,
        hostName: me.displayName ?? me.email?.split("@")[0] ?? "Anonymous",
        teamId: teamParam ?? null,
        isPrivate: createPrivate,
        participants: [],
        participantNames: [],
        status: "waiting",
        tags: createTags.split(",").map(t => t.trim()).filter(Boolean),
        createdAt: serverTimestamp(),
      });
      setCreateTitle(""); setCreatePrivate(false); setCreateTags(""); setShowCreate(false);
      const snap = await getDoc(ref);
      if (snap.exists()) await handleJoin({ id: snap.id, ...snap.data() as any } as LiveSession);
    } catch (e) { console.error(e); }
    finally { setCreating(false); }
  };

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/live?session=${id}`);
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
  };

  const navLinks = [
    { label: "Feed", href: "/feed" },
    { label: "Teams", href: "/teams" },
    { label: "Explore", href: "/explore" },
  ];

  // ── VIDEO GRID LAYOUT ───────────────────────────────────────────────────────
  const remoteEntries = Object.entries(remoteStreams);
  const total = 1 + remoteEntries.length;
  const gridCls =
    total === 1 ? "grid-cols-1" :
    total === 2 ? "grid-cols-1 md:grid-cols-2" :
    total <= 4 ? "grid-cols-2" :
    "grid-cols-2 md:grid-cols-3";

  // ═══════════════════════════════════════════════════════════════════════════
  // IN-CALL VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (inCall && session) {
    return (
      <div className="flex flex-col md:flex-row h-screen bg-[#080B10] text-white font-sans overflow-hidden">

        {/* ── Main area ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">

          {/* Header */}
          <header className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-[#080B10]/95 backdrop-blur-xl flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-bold truncate">{session.title}</span>
              <span className="hidden sm:block text-xs text-gray-600 border-l border-white/5 pl-2.5 flex-shrink-0">
                {session.participants.length} in call
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => { setShowChat(true); setShowAI(false); }}
                className={`px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all ${showChat && !showAI ? "bg-[#1E90FF]/15 text-[#1E90FF]" : "bg-white/5 text-gray-400 hover:text-white"}`}
              >
                <MessageSquare className="w-3.5 h-3.5" /><span className="hidden sm:block">Chat</span>
              </button>
              <button
                onClick={() => { setShowAI(true); setShowChat(false); }}
                className={`px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all ${showAI ? "bg-violet-500/15 text-violet-400" : "bg-white/5 text-gray-400 hover:text-white"}`}
              >
                <Bot className="w-3.5 h-3.5" /><span className="hidden sm:block">AI</span>
              </button>
              <button
                onClick={() => { setShowChat(false); setShowAI(false); }}
                className="p-1.5 rounded-xl text-gray-600 hover:text-white hover:bg-white/5 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </header>

          {/* Video grid */}
          <div className="flex-1 p-2 md:p-3 overflow-hidden min-h-0">
            <div className={`grid ${gridCls} gap-2 md:gap-3 h-full auto-rows-fr`}>

              {/* Local video */}
              <div className="relative bg-[#0E1117] rounded-2xl overflow-hidden border border-white/5 min-h-[120px]">
                <video
                  ref={localVidRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${!camOn ? "opacity-0" : ""}`}
                />
                {!camOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#0E1117]">
                    <div className={`w-16 h-16 md:w-24 md:h-24 rounded-full bg-gradient-to-br ${color(me?.uid)} flex items-center justify-center text-2xl font-black`}>
                      {initials(me?.displayName ?? me?.email ?? undefined)}
                    </div>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
                  {!micOn && <MicOff className="w-3 h-3 text-red-400" />}
                  <span className="text-[10px] font-semibold text-white truncate max-w-[100px]">
                    {me?.displayName ?? me?.email?.split("@")[0] ?? "You"} (You)
                  </span>
                </div>
                {sharing && (
                  <div className="absolute top-2 right-2 bg-[#1E90FF] text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Sharing
                  </div>
                )}
              </div>

              {/* Remote tiles */}
              {remoteEntries.map(([peerId, stream]) => {
                const idx = session.participants.indexOf(peerId);
                const name = session.participantNames[idx] ?? "Participant";
                return (
                  <RemoteVideoTile
                    key={peerId}
                    peerId={peerId}
                    stream={stream}
                    name={name}
                  />
                );
              })}

              {/* Waiting placeholder */}
              {remoteEntries.length === 0 && (
                <div className="bg-[#0E1117] rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center p-6 min-h-[120px]">
                  <Users className="w-8 h-8 text-gray-700 mb-3" />
                  <p className="text-gray-600 text-sm mb-3">Waiting for others to join…</p>
                  <button
                    onClick={() => copyLink(session.id)}
                    className="flex items-center gap-1.5 text-xs text-[#1E90FF] hover:underline"
                  >
                    <Copy className="w-3 h-3" /> Copy invite link
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex-shrink-0 border-t border-white/5 bg-[#080B10] py-3 flex items-center justify-center gap-3">
            <button
              onClick={toggleMic}
              className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all ${micOn ? "bg-white/10 hover:bg-white/15" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleCam}
              className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all ${camOn ? "bg-white/10 hover:bg-white/15" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}
            >
              {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleShare}
              className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all ${sharing ? "bg-[#1E90FF]/20 text-[#1E90FF] border border-[#1E90FF]/30" : "bg-white/10 hover:bg-white/15"}`}
            >
              {sharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
            </button>
            <button
              onClick={handleLeave}
              className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/25 transition-all"
            >
              <PhoneOff className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        </div>

        {/* ── Side panel ── */}
        {(showChat || showAI) && (
          <aside className="w-full md:w-72 flex flex-col border-t md:border-t-0 md:border-l border-white/5 bg-[#0A0D13] flex-shrink-0 max-h-60 md:max-h-none">
            <div className="flex border-b border-white/5 flex-shrink-0">
              <button
                onClick={() => { setShowChat(true); setShowAI(false); }}
                className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 ${showChat && !showAI ? "text-white border-b-2 border-[#1E90FF]" : "text-gray-600"}`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> Chat
              </button>
              <button
                onClick={() => { setShowAI(true); setShowChat(false); }}
                className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 ${showAI ? "text-white border-b-2 border-violet-500" : "text-gray-600"}`}
              >
                <Bot className="w-3.5 h-3.5" /> AI
              </button>
            </div>

            {/* Chat */}
            {showChat && !showAI && (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                  {msgs.length === 0 && <p className="text-xs text-gray-700 text-center mt-4">No messages yet.</p>}
                  {msgs.map(m => {
                    const isMe = m.senderId === me?.uid;
                    return (
                      <div key={m.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 ${m.isAI ? "bg-gradient-to-br from-violet-500 to-blue-400" : `bg-gradient-to-br ${color(m.senderId)}`}`}>
                          {m.isAI ? <Bot className="w-3 h-3" /> : initials(m.senderName)}
                        </div>
                        <div className={`max-w-[78%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                          {!isMe && <span className="text-[9px] text-gray-600 mb-0.5 ml-1">{m.isAI ? "AI" : m.senderName}</span>}
                          <div className={`px-2.5 py-1.5 rounded-xl text-xs leading-relaxed break-words ${m.isAI ? "bg-violet-500/10 border border-violet-500/20 text-gray-200" : isMe ? "bg-[#1E90FF] text-white" : "bg-[#0E1117] border border-white/5 text-gray-300"}`}>
                            {m.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {aiLoading && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-400 flex items-center justify-center flex-shrink-0"><Bot className="w-3 h-3" /></div>
                      <div className="bg-violet-500/10 border border-violet-500/20 px-3 py-2 rounded-xl flex gap-1">
                        {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>
                <div className="p-2.5 border-t border-white/5 flex-shrink-0">
                  <div className="flex gap-2 items-center bg-[#0E1117] border border-white/8 focus-within:border-[#1E90FF]/30 rounded-xl px-3 py-2 transition-colors">
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && sendMsg()}
                      placeholder="Message… @AI to ask"
                      className="flex-1 bg-transparent text-xs text-white placeholder-gray-600 outline-none"
                    />
                    <button onClick={sendMsg} disabled={!chatInput.trim()} className="text-[#1E90FF] disabled:opacity-30">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* AI */}
            {showAI && (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                  <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 text-xs text-gray-400 leading-relaxed">
                    <div className="flex items-center gap-2 mb-1.5"><Bot className="w-4 h-4 text-violet-400" /><span className="font-semibold text-violet-300">DevConnect AI</span></div>
                    Debug errors, explain code, or generate ideas. Type @AI in chat too.
                  </div>
                  {msgs.filter(m => m.isAI).map(m => (
                    <div key={m.id} className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-400 flex items-center justify-center flex-shrink-0"><Bot className="w-3 h-3" /></div>
                      <div className="max-w-[80%] px-2.5 py-1.5 rounded-xl text-xs bg-violet-500/10 border border-violet-500/20 text-gray-200 break-words">{m.text}</div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-400 flex items-center justify-center flex-shrink-0"><Bot className="w-3 h-3" /></div>
                      <div className="bg-violet-500/10 border border-violet-500/20 px-3 py-2 rounded-xl flex gap-1">
                        {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>
                <div className="p-2.5 border-t border-white/5 flex-shrink-0">
                  <div className="flex gap-2 items-center bg-[#0E1117] border border-white/8 focus-within:border-violet-500/30 rounded-xl px-3 py-2 transition-colors">
                    <Bot className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                    <input
                      value={aiInput}
                      onChange={e => setAiInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && sendAI()}
                      placeholder="Ask the AI…"
                      className="flex-1 bg-transparent text-xs text-white placeholder-gray-600 outline-none"
                    />
                    <button onClick={sendAI} disabled={!aiInput.trim() || aiLoading} className="text-violet-400 disabled:opacity-30">
                      {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSIONS LIST
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[#080B10] text-white font-sans">
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 py-3.5 border-b border-white/5 bg-[#080B10]/80 backdrop-blur-xl">
        <Link href="/"><span className="text-[#1E90FF] text-xl font-black tracking-tight">Dev<span className="text-white">Connect</span></span></Link>
        <div className="hidden md:flex items-center gap-1 bg-white/5 border border-white/8 rounded-full px-1 py-1">
          {navLinks.map(({ label, href }) => (
            <Link key={label} href={href}>
              <button className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${pathname === href ? "bg-[#1E90FF] text-white shadow-lg shadow-blue-500/20" : "text-gray-400 hover:text-white"}`}>{label}</button>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {authReady && (me ? (
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${color(me.uid)} flex items-center justify-center text-xs font-bold overflow-hidden`}>
              {me.photoURL ? <img src={me.photoURL} alt="" className="w-8 h-8 object-cover rounded-full" /> : initials(me.displayName ?? me.email ?? undefined)}
            </div>
          ) : (
            <Link href="/login"><button className="text-sm bg-[#1E90FF] hover:bg-[#1a7de0] px-4 py-2 rounded-full font-semibold transition-all shadow-lg shadow-blue-500/20">Login</button></Link>
          ))}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
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
            onClick={() => me ? setShowCreate(true) : router.push("/login")}
            className="flex items-center gap-2 bg-[#1E90FF] hover:bg-[#1a7de0] px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" /> Start Session
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { icon: <Video className="w-3 h-3" />, label: "Video Calls" },
            { icon: <Monitor className="w-3 h-3" />, label: "Screen Share" },
            { icon: <Code2 className="w-3 h-3" />, label: "Live Coding" },
            { icon: <Bot className="w-3 h-3" />, label: "AI Assistant" },
            { icon: <MessageSquare className="w-3 h-3" />, label: "In-call Chat" },
          ].map(({ icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs bg-white/5 border border-white/8 px-3 py-1.5 rounded-full text-gray-400">{icon}{label}</span>
          ))}
        </div>

        {loadingSessions ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-[#0E1117] border border-white/5 rounded-2xl p-5 animate-pulse space-y-3">
                <div className="flex gap-3"><div className="w-10 h-10 rounded-xl bg-white/5" /><div className="flex-1 space-y-2"><div className="h-3 bg-white/5 rounded w-3/4" /><div className="h-2 bg-white/5 rounded w-1/2" /></div></div>
                <div className="h-2 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1E90FF]/10 border border-[#1E90FF]/20 flex items-center justify-center mx-auto mb-5"><Zap className="w-8 h-8 text-[#1E90FF]" /></div>
            <h3 className="font-bold text-xl mb-2">No live sessions right now</h3>
            <p className="text-gray-600 text-sm mb-6">Be the first to start one!</p>
            <button onClick={() => me ? setShowCreate(true) : router.push("/login")} className="bg-[#1E90FF] hover:bg-[#1a7de0] px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20">Start a Session</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map(s => (
              <div key={s.id} className="bg-[#0E1117] border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color(s.hostId)} flex items-center justify-center text-sm font-bold flex-shrink-0`}>{initials(s.hostName)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm truncate">{s.title}</h3>
                      <div className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.status === "active" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${s.status === "active" ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
                        {s.status === "active" ? "Live" : "Waiting"}
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{s.hostName} · {ago(s.createdAt)}</p>
                  </div>
                  {s.isPrivate ? <Lock className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" /> : <Globe className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" />}
                </div>
                {s.tags && s.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.tags.slice(0, 3).map(t => <span key={t} className="flex items-center gap-1 text-[10px] bg-white/5 border border-white/8 px-2 py-0.5 rounded-full text-gray-500"><Hash className="w-2.5 h-2.5" />{t}</span>)}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1.5">
                      {s.participantNames.slice(0, 4).map((n, i) => (
                        <div key={i} className={`w-6 h-6 rounded-full bg-gradient-to-br ${color(s.participants[i])} border-2 border-[#0E1117] flex items-center justify-center text-[8px] font-bold`}>{initials(n)}</div>
                      ))}
                    </div>
                    <span className="text-xs text-gray-600">{s.participants.length} in call</span>
                  </div>
                  <button onClick={() => copyLink(s.id)} className="p-1.5 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-all">
                    {copiedId === s.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  onClick={() => handleJoin(s)}
                  className="w-full flex items-center justify-center gap-2 bg-[#1E90FF]/10 hover:bg-[#1E90FF]/15 border border-[#1E90FF]/20 py-2.5 rounded-xl text-sm font-semibold text-[#1E90FF] transition-all"
                >
                  <Zap className="w-4 h-4" />
                  {s.participants.includes(me?.uid) ? "Rejoin" : "Join Session"}
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
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/8 transition-all"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5 block">Session Title *</label>
                <input value={createTitle} onChange={e => setCreateTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && createSession()} placeholder="e.g. Debugging the auth flow" className="w-full bg-[#080B10] border border-white/8 focus:border-[#1E90FF]/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none transition-colors" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5 block">Tags (comma separated)</label>
                <input value={createTags} onChange={e => setCreateTags(e.target.value)} placeholder="react, debugging, typescript" className="w-full bg-[#080B10] border border-white/8 focus:border-[#1E90FF]/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none transition-colors" />
              </div>
              <div onClick={() => setCreatePrivate(!createPrivate)} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${createPrivate ? "border-[#1E90FF]/30 bg-[#1E90FF]/5" : "border-white/8 bg-white/3 hover:bg-white/5"}`}>
                <div className="flex items-center gap-2">
                  {createPrivate ? <Lock className="w-4 h-4 text-[#1E90FF]" /> : <Globe className="w-4 h-4 text-gray-400" />}
                  <div>
                    <p className="text-sm font-medium">{createPrivate ? "Private" : "Public"}</p>
                    <p className="text-[10px] text-gray-600">{createPrivate ? "Only invited members" : "Anyone can join"}</p>
                  </div>
                </div>
                <div className={`w-9 h-5 rounded-full transition-all relative ${createPrivate ? "bg-[#1E90FF]" : "bg-white/10"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${createPrivate ? "left-4" : "left-0.5"}`} />
                </div>
              </div>
              <div className="bg-white/3 border border-white/5 rounded-xl p-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Includes</p>
                {["HD video & audio", "Screen sharing", "AI assistant on demand", "In-call group chat"].map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-gray-500"><div className="w-1 h-1 rounded-full bg-[#1E90FF]" />{f}</div>
                ))}
              </div>
              <button onClick={createSession} disabled={creating || !createTitle.trim()} className="w-full bg-[#1E90FF] hover:bg-[#1a7de0] disabled:opacity-40 disabled:cursor-not-allowed py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2">
                {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</> : <><Zap className="w-4 h-4" /> Start Session</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LivePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080B10] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-[#1E90FF] border-t-transparent animate-spin" />
      </div>
    }>
      <LivePageContent />
    </Suspense>
  );
}