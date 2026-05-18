"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import {
  Plus,
  Users,
  Search,
  X,
  LogIn,
  Crown,
  Copy,
  Check,
  Zap,
  MessageSquare,
  Hash,
  Lock,
  Globe,
} from "lucide-react";

type Team = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerName?: string;
  members: string[];
  memberNames?: string[];
  inviteCode?: string;
  isPrivate?: boolean;
  createdAt?: any;
  tags?: string[];
};

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

function getInitials(name?: string) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const inputCls =
  "w-full bg-[#080B10] border border-white/8 focus:border-[#1E90FF]/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-700 outline-none transition-colors";

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-5 animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-white/5" />
        <div className="space-y-2 flex-1">
          <div className="h-3 bg-white/5 rounded w-2/3" />
          <div className="h-2 bg-white/5 rounded w-1/2" />
        </div>
      </div>
      <div className="h-2 bg-white/5 rounded w-full" />
      <div className="h-2 bg-white/5 rounded w-4/5" />
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-[#0E1117] border border-white/8 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/8 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Team Card ─────────────────────────────────────────────────────────────────
function TeamCard({
  team,
  currentUser,
  isMember,
  onLeave,
  onJoin,
  onCopyCode,
  copied,
  onChat,
  onLive,
}: {
  team: Team;
  currentUser: any;
  isMember: boolean;
  onLeave?: () => void;
  onJoin?: () => void;
  onCopyCode?: () => void;
  copied: boolean;
  onChat?: () => void;
  onLive?: () => void;
}) {
  const isOwner = currentUser?.uid === team.ownerId;

  return (
    <div className="bg-[#0E1117] border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 hover:shadow-xl hover:shadow-black/20">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${getAvatarColor(team.id)} flex items-center justify-center text-sm font-black flex-shrink-0`}
        >
          {getInitials(team.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-sm truncate">{team.name}</h3>

            {/* ✅ FIX: wrap Crown in a <span title="..."> instead of passing title to the icon */}
            {isOwner && (
              <span title="You own this team" className="flex items-center">
                <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              </span>
            )}

            {team.isPrivate ? (
              <Lock className="w-3 h-3 text-gray-600 flex-shrink-0" />
            ) : (
              <Globe className="w-3 h-3 text-gray-600 flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-gray-600 mt-0.5">by {team.ownerName || "Unknown"}</p>
        </div>
      </div>

      {team.description && (
        <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">{team.description}</p>
      )}

      {team.tags && team.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {team.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 text-[10px] bg-white/5 border border-white/8 px-2 py-0.5 rounded-full text-gray-500"
            >
              <Hash className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          {(team.memberNames || []).slice(0, 4).map((name, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAvatarColor(name)} border-2 border-[#0E1117] flex items-center justify-center text-[8px] font-bold`}
            >
              {getInitials(name)}
            </div>
          ))}
        </div>
        <span className="text-xs text-gray-600">
          {team.members?.length || 0} member{(team.members?.length || 0) !== 1 ? "s" : ""}
        </span>
      </div>

      {isMember ? (
        <div className="flex flex-col gap-2 mt-auto">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onChat}
              className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/8 border border-white/8 py-2 rounded-xl text-xs font-semibold text-gray-300 transition-all"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Chat
            </button>
            <button
              onClick={onLive}
              className="flex items-center justify-center gap-1.5 bg-[#1E90FF]/10 hover:bg-[#1E90FF]/15 border border-[#1E90FF]/20 py-2 rounded-xl text-xs font-semibold text-[#1E90FF] transition-all"
            >
              <Zap className="w-3.5 h-3.5" /> Live
            </button>
          </div>
          {team.inviteCode && (
            <button
              onClick={onCopyCode}
              className="flex items-center justify-center gap-1.5 bg-white/3 hover:bg-white/5 border border-white/5 py-2 rounded-xl text-xs text-gray-600 hover:text-gray-400 transition-all"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Copied!" : `Invite: ${team.inviteCode}`}
            </button>
          )}
          {!isOwner && (
            <button
              onClick={onLeave}
              className="text-xs text-gray-700 hover:text-red-400 transition-colors text-center py-1"
            >
              Leave team
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={onJoin}
          className="mt-auto flex items-center justify-center gap-1.5 w-full bg-[#1E90FF]/10 hover:bg-[#1E90FF]/15 border border-[#1E90FF]/20 py-2.5 rounded-xl text-sm font-semibold text-[#1E90FF] transition-all"
        >
          <LogIn className="w-4 h-4" /> Join Team
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TeamsPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [discoverTeams, setDiscoverTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"my" | "discover">("my");
  const [searchQuery, setSearchQuery] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createTags, setCreateTags] = useState("");
  const [creating, setCreating] = useState(false);

  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    setLoading(true);
    const q = query(collection(db, "teams"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const all: Team[] = [];
      snap.forEach((d) => all.push({ id: d.id, ...(d.data() as any) }));
      if (currentUser) {
        setMyTeams(all.filter((t) => t.members?.includes(currentUser.uid)));
        setDiscoverTeams(all.filter((t) => !t.members?.includes(currentUser.uid) && !t.isPrivate));
      } else {
        setMyTeams([]);
        setDiscoverTeams(all.filter((t) => !t.isPrivate));
      }
      setLoading(false);
    });
    return () => unsub();
  }, [authReady, currentUser]);

  const handleCreate = async () => {
    if (!currentUser) { router.push("/login"); return; }
    if (!createName.trim()) return;
    setCreating(true);
    try {
      await addDoc(collection(db, "teams"), {
        name: createName.trim(),
        description: createDesc.trim() || null,
        ownerId: currentUser.uid,
        ownerName: currentUser.displayName || currentUser.email?.split("@")[0] || "Anonymous",
        members: [currentUser.uid],
        memberNames: [currentUser.displayName || currentUser.email?.split("@")[0] || "Anonymous"],
        inviteCode: generateInviteCode(),
        isPrivate: createPrivate,
        tags: createTags.split(",").map((t) => t.trim()).filter(Boolean),
        createdAt: serverTimestamp(),
      });
      setCreateName(""); setCreateDesc(""); setCreatePrivate(false); setCreateTags("");
      setShowCreate(false);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!currentUser) { router.push("/login"); return; }
    setJoining(true); setJoinError("");
    try {
      const snap = await getDocs(query(collection(db, "teams"), where("inviteCode", "==", joinCode.trim().toUpperCase())));
      if (snap.empty) { setJoinError("Invalid invite code."); setJoining(false); return; }
      const teamDoc = snap.docs[0];
      if ((teamDoc.data() as any).members?.includes(currentUser.uid)) {
        setJoinError("You are already a member."); setJoining(false); return;
      }
      await updateDoc(doc(db, "teams", teamDoc.id), {
        members: arrayUnion(currentUser.uid),
        memberNames: arrayUnion(currentUser.displayName || currentUser.email?.split("@")[0] || "Anonymous"),
      });
      setJoinCode(""); setShowJoin(false);
    } catch {
      setJoinError("Something went wrong.");
    } finally {
      setJoining(false);
    }
  };

  const joinPublicTeam = async (team: Team) => {
    if (!currentUser) { router.push("/login"); return; }
    await updateDoc(doc(db, "teams", team.id), {
      members: arrayUnion(currentUser.uid),
      memberNames: arrayUnion(currentUser.displayName || currentUser.email?.split("@")[0] || "Anonymous"),
    });
  };

  const leaveTeam = async (team: Team) => {
    if (!currentUser || team.ownerId === currentUser.uid) return;
    await updateDoc(doc(db, "teams", team.id), {
      members: arrayRemove(currentUser.uid),
      memberNames: arrayRemove(currentUser.displayName || currentUser.email?.split("@")[0] || "Anonymous"),
    });
  };

  const copyInviteCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredDiscover = discoverTeams.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const navLinks = [
    { label: "Feed", href: "/feed" },
    { label: "Teams", href: "/teams" },
    { label: "Explore", href: "/explore" },
  ];

  return (
    <div className="min-h-screen bg-[#080B10] text-white font-sans">
      {/* HEADER */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 py-3.5 border-b border-white/5 bg-[#080B10]/80 backdrop-blur-xl">
        <Link href="/">
          <span className="text-[#1E90FF] text-xl font-black tracking-tight">
            Dev<span className="text-white">Connect</span>
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-1 bg-white/5 border border-white/8 rounded-full px-1 py-1">
          {navLinks.map(({ label, href }) => (
            <Link key={label} href={href}>
              <button
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  pathname === href
                    ? "bg-[#1E90FF] text-white shadow-lg shadow-blue-500/20"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {authReady &&
            (currentUser ? (
              <div
                className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(currentUser.uid)} flex items-center justify-center text-xs font-bold overflow-hidden`}
              >
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt="me" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  getInitials(currentUser.displayName || currentUser.email)
                )}
              </div>
            ) : (
              <Link href="/login">
                <button className="text-sm bg-[#1E90FF] hover:bg-[#1a7de0] px-4 py-2 rounded-full font-semibold transition-all shadow-lg shadow-blue-500/20">
                  Login
                </button>
              </Link>
            ))}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        {/* PAGE HEADER */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black">Teams</h1>
            <p className="text-gray-500 text-sm mt-1">Collaborate, build, and ship together in real time.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => (currentUser ? setShowJoin(true) : router.push("/login"))}
              className="flex items-center gap-2 border border-white/10 bg-white/5 hover:bg-white/8 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            >
              <LogIn className="w-4 h-4" /> Join via Code
            </button>
            <button
              onClick={() => (currentUser ? setShowCreate(true) : router.push("/login"))}
              className="flex items-center gap-2 bg-[#1E90FF] hover:bg-[#1a7de0] px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" /> New Team
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="flex items-center gap-1 bg-[#0E1117] border border-white/5 rounded-2xl p-1 mb-6 w-fit">
          {(["my", "discover"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-[#1E90FF] text-white shadow-lg shadow-blue-500/20"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              {tab === "my" ? `My Teams${myTeams.length ? ` (${myTeams.length})` : ""}` : "Discover"}
            </button>
          ))}
        </div>

        {/* SEARCH */}
        {activeTab === "discover" && (
          <div className="relative mb-6 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            <input
              placeholder="Search teams by name or tag…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0E1117] border border-white/5 focus:border-[#1E90FF]/30 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors"
            />
          </div>
        )}

        {/* MY TEAMS */}
        {activeTab === "my" &&
          (!currentUser ? (
            <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#1E90FF]/10 border border-[#1E90FF]/20 flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-[#1E90FF]" />
              </div>
              <h3 className="font-bold text-lg mb-2">Sign in to see your teams</h3>
              <p className="text-gray-600 text-sm mb-6">Join or create teams to start collaborating.</p>
              <Link href="/login">
                <button className="bg-[#1E90FF] hover:bg-[#1a7de0] px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20">
                  Sign In
                </button>
              </Link>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : myTeams.length === 0 ? (
            <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7 text-gray-600" />
              </div>
              <h3 className="font-bold text-lg mb-2">No teams yet</h3>
              <p className="text-gray-600 text-sm mb-6">Create a team or join one with an invite code.</p>
              <div className="flex justify-center gap-3 flex-wrap">
                <button
                  onClick={() => setShowCreate(true)}
                  className="bg-[#1E90FF] hover:bg-[#1a7de0] px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Create Team
                </button>
                <button
                  onClick={() => setShowJoin(true)}
                  className="border border-white/10 bg-white/5 hover:bg-white/8 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
                >
                  <LogIn className="w-4 h-4" /> Join via Code
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myTeams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  currentUser={currentUser}
                  isMember
                  onLeave={() => leaveTeam(team)}
                  onCopyCode={() => copyInviteCode(team.id, team.inviteCode!)}
                  copied={copiedId === team.id}
                  onChat={() => router.push(`/chat?team=${team.id}`)}
                  onLive={() => router.push(`/live?team=${team.id}`)}
                />
              ))}
            </div>
          ))}

        {/* DISCOVER */}
        {activeTab === "discover" &&
          (loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : filteredDiscover.length === 0 ? (
            <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-12 text-center">
              <p className="text-gray-600 text-sm">
                No public teams found{searchQuery ? ` for "${searchQuery}"` : ""}.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDiscover.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  currentUser={currentUser}
                  isMember={false}
                  onJoin={() => joinPublicTeam(team)}
                  copied={false}
                />
              ))}
            </div>
          ))}
      </div>

      {/* CREATE MODAL */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Create a Team">
          <div className="space-y-4">
            <Field label="Team Name *">
              <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Rocket Squad" className={inputCls} />
            </Field>
            <Field label="Description">
              <textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} placeholder="What does your team work on?" rows={3} className={`${inputCls} resize-none`} />
            </Field>
            <Field label="Tags (comma separated)">
              <input value={createTags} onChange={(e) => setCreateTags(e.target.value)} placeholder="react, typescript, backend" className={inputCls} />
            </Field>
            <div
              onClick={() => setCreatePrivate(!createPrivate)}
              className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${createPrivate ? "border-[#1E90FF]/30 bg-[#1E90FF]/5" : "border-white/8 bg-white/3 hover:bg-white/5"}`}
            >
              <div className="flex items-center gap-2">
                {createPrivate ? <Lock className="w-4 h-4 text-[#1E90FF]" /> : <Globe className="w-4 h-4 text-gray-400" />}
                <span className="text-sm font-medium">{createPrivate ? "Private Team" : "Public Team"}</span>
              </div>
              <div className={`w-9 h-5 rounded-full transition-all relative ${createPrivate ? "bg-[#1E90FF]" : "bg-white/10"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${createPrivate ? "left-4" : "left-0.5"}`} />
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !createName.trim()}
              className="w-full bg-[#1E90FF] hover:bg-[#1a7de0] disabled:opacity-40 disabled:cursor-not-allowed py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20"
            >
              {creating ? "Creating…" : "Create Team"}
            </button>
          </div>
        </Modal>
      )}

      {/* JOIN MODAL */}
      {showJoin && (
        <Modal onClose={() => { setShowJoin(false); setJoinError(""); setJoinCode(""); }} title="Join via Invite Code">
          <div className="space-y-4">
            <Field label="Invite Code">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. AB1C2D"
                maxLength={6}
                className={`${inputCls} tracking-widest font-mono text-center text-base uppercase`}
              />
            </Field>
            {joinError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-red-400 text-xs">{joinError}</p>
              </div>
            )}
            <button
              onClick={handleJoin}
              disabled={joining || joinCode.length < 4}
              className="w-full bg-[#1E90FF] hover:bg-[#1a7de0] disabled:opacity-40 disabled:cursor-not-allowed py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20"
            >
              {joining ? "Joining…" : "Join Team"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}