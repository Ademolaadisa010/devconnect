"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import {
  collection, query, orderBy, onSnapshot, addDoc,
  serverTimestamp, where, getDoc, doc, setDoc,
  updateDoc, arrayUnion, arrayRemove, getDocs,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  Send, Hash, AtSign, Plus, Search, MessageSquare,
  LogOut, X, ChevronDown, ChevronRight, Menu,
  UserPlus, Users, Crown, Trash2, Settings,
  CheckCircle2, UserMinus,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id: string; channelId: string; senderId: string;
  text: string; createdAt: any; username: string; avatar: string;
}
interface Community {
  id: string; name: string; members: string[];
  createdBy?: string; memberNames?: string[];
}
interface DMUser {
  uid: string; username: string; photoURL?: string;
}
interface ChannelMember {
  uid: string; username: string; photoURL?: string; isOwner?: boolean;
}

const DEFAULT_COMMUNITY_ID = "general";

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "from-blue-500 to-cyan-400", "from-violet-500 to-blue-400",
  "from-cyan-500 to-teal-400", "from-rose-500 to-orange-400",
  "from-emerald-500 to-cyan-400", "from-amber-500 to-orange-400",
];
function getAvatarColor(s?: string) {
  if (!s) return AVATAR_COLORS[0];
  let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getInitials(n?: string): string {
  if (!n) return "U";
  return n.split(" ").map(x => x[0]).join("").toUpperCase().slice(0, 2);
}
function formatTime(ts?: any): string {
  if (!ts?.seconds) return "";
  return new Date(ts.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDateLabel(ts?: any): string {
  if (!ts?.seconds) return "";
  const d = new Date(ts.seconds * 1000);
  const today = new Date(); const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);

  // Messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Channel state
  const [channel, setChannelId] = useState<string>(DEFAULT_COMMUNITY_ID);
  const [currentChannelName, setCurrentChannelName] = useState("General");
  const [isDM, setIsDM] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<Community | null>(null);

  // Sidebar data
  const [communities, setCommunities] = useState<Community[]>([]);
  const [dmUsers, setDmUsers] = useState<DMUser[]>([]);
  const [allUsers, setAllUsers] = useState<DMUser[]>([]);

  // Sidebar UI
  const [showChannelSection, setShowChannelSection] = useState(true);
  const [showDMSection, setShowDMSection] = useState(true);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Right panel — members
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Add member modal
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberQuery, setAddMemberQuery] = useState("");
  const [addingMember, setAddingMember] = useState<string | null>(null);
  const [addedMembers, setAddedMembers] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Auth + bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user) return;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: user.displayName || "Anonymous",
          username: user.email?.split("@")[0] ?? "user" + user.uid.slice(0, 5),
          email: user.email ?? "",
          photoURL: user.photoURL ?? "",
          createdAt: serverTimestamp(),
        });
      }

      const generalRef = doc(db, "communities", DEFAULT_COMMUNITY_ID);
      const generalSnap = await getDoc(generalRef);
      if (!generalSnap.exists()) {
        await setDoc(generalRef, {
          name: "General", createdBy: user.uid,
          members: [user.uid], memberNames: [user.displayName ?? user.email?.split("@")[0] ?? "Anonymous"],
          createdAt: serverTimestamp(),
        });
      } else {
        const members: string[] = generalSnap.data()?.members || [];
        if (!members.includes(user.uid)) {
          await updateDoc(generalRef, {
            members: arrayUnion(user.uid),
            memberNames: arrayUnion(user.displayName ?? user.email?.split("@")[0] ?? "Anonymous"),
          });
        }
      }
    });
    return () => unsub();
  }, []);

  // ── Communities listener ───────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "communities"), where("members", "array-contains", currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list: Community[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as any) }));
      setCommunities(list);
    });
    return () => unsub();
  }, [currentUser]);

  // ── Current channel listener (for live member updates) ─────────────────────
  useEffect(() => {
    if (!channel || isDM) { setCurrentChannel(null); return; }
    const unsub = onSnapshot(doc(db, "communities", channel), (snap) => {
      if (snap.exists()) setCurrentChannel({ id: snap.id, ...(snap.data() as any) });
    });
    return () => unsub();
  }, [channel, isDM]);

  // ── Refresh members when panel opens ──────────────────────────────────────
  useEffect(() => {
    if (!showMembersPanel || !currentChannel) return;
    loadChannelMembers(currentChannel);
  }, [showMembersPanel, currentChannel]);

  // ── DM conversations ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "directMessages"), where("members", "array-contains", currentUser.uid));
    const unsub = onSnapshot(q, async (snap) => {
      const users: DMUser[] = [];
      for (const d of snap.docs) {
        const members: string[] = d.data().members || [];
        const otherId = members.find(id => id !== currentUser.uid);
        if (otherId) {
          const userDoc = await getDoc(doc(db, "users", otherId));
          if (userDoc.exists()) {
            users.push({
              uid: otherId,
              username: userDoc.data()?.username || "Unknown",
              photoURL: userDoc.data()?.photoURL ?? undefined,
            });
          }
        }
      }
      setDmUsers(users);
    });
    return () => unsub();
  }, [currentUser]);

  // ── All users for search ───────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    getDocs(collection(db, "users")).then(snap => {
      const list: DMUser[] = [];
      snap.forEach(d => {
        if (d.id !== currentUser.uid) {
          list.push({ uid: d.id, username: d.data()?.username || "Unknown", photoURL: d.data()?.photoURL ?? undefined });
        }
      });
      setAllUsers(list);
    });
  }, [currentUser]);

  // ── Messages listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !channel) return;
    const q = query(collection(db, "messages"), where("channelId", "==", channel), orderBy("createdAt"));
    const unsub = onSnapshot(q, snap => {
      const msgs: Message[] = [];
      snap.forEach(d => {
        const data = d.data();
        msgs.push({ id: d.id, channelId: data.channelId, senderId: data.senderId, text: data.text, createdAt: data.createdAt, username: data.username || "Anonymous", avatar: data.avatar || "" });
      });
      setMessages(msgs);
    });
    return () => unsub();
  }, [channel, currentUser]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Channel name resolver ──────────────────────────────────────────────────
  useEffect(() => {
    if (!channel) return;
    const resolve = async () => {
      const communityDoc = await getDoc(doc(db, "communities", channel));
      if (communityDoc.exists()) {
        setCurrentChannelName(communityDoc.data().name || "Unknown");
        setIsDM(false); return;
      }
      const dmDoc = await getDoc(doc(db, "directMessages", channel));
      if (dmDoc.exists()) {
        setIsDM(true);
        const members: string[] = dmDoc.data()?.members || [];
        const otherId = members.find(id => id !== currentUser?.uid);
        if (otherId) {
          const userDoc = await getDoc(doc(db, "users", otherId));
          setCurrentChannelName(userDoc.exists() ? userDoc.data()?.username || "Unknown" : "Unknown");
        }
      }
    };
    resolve();
  }, [channel, currentUser]);

  // ── Load channel members ───────────────────────────────────────────────────
  const loadChannelMembers = async (ch: Community) => {
    setLoadingMembers(true);
    try {
      const memberList: ChannelMember[] = [];
      for (const uid of ch.members || []) {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
          memberList.push({
            uid,
            username: userDoc.data()?.username || "Unknown",
            photoURL: userDoc.data()?.photoURL ?? undefined,
            isOwner: uid === ch.createdBy,
          });
        } else {
          memberList.push({ uid, username: "Unknown", isOwner: uid === ch.createdBy });
        }
      }
      // Sort: owner first
      memberList.sort((a, b) => (b.isOwner ? 1 : 0) - (a.isOwner ? 1 : 0));
      setChannelMembers(memberList);
    } finally {
      setLoadingMembers(false);
    }
  };

  // ── Add member to channel ──────────────────────────────────────────────────
  const addMemberToChannel = async (user: DMUser) => {
    if (!currentChannel || !currentUser) return;
    // Only channel owner or members can add
    setAddingMember(user.uid);
    try {
      await updateDoc(doc(db, "communities", currentChannel.id), {
        members: arrayUnion(user.uid),
        memberNames: arrayUnion(user.username),
      });
      setAddedMembers(prev => new Set([...prev, user.uid]));
      // Refresh member list
      const refreshed = await getDoc(doc(db, "communities", currentChannel.id));
      if (refreshed.exists()) {
        await loadChannelMembers({ id: refreshed.id, ...(refreshed.data() as any) });
      }
    } catch (e) {
      console.error("Failed to add member:", e);
    } finally {
      setAddingMember(null);
    }
  };

  // ── Remove member from channel ─────────────────────────────────────────────
  const removeMemberFromChannel = async (member: ChannelMember) => {
    if (!currentChannel || !currentUser) return;
    if (member.isOwner) return; // can't remove owner
    // Only owner can remove others; members can remove themselves
    const isOwner = currentChannel.createdBy === currentUser.uid;
    const isSelf = member.uid === currentUser.uid;
    if (!isOwner && !isSelf) return;

    try {
      await updateDoc(doc(db, "communities", currentChannel.id), {
        members: arrayRemove(member.uid),
        memberNames: arrayRemove(member.username),
      });
      setChannelMembers(prev => prev.filter(m => m.uid !== member.uid));
      // If removing self, switch to general
      if (isSelf) switchChannel(DEFAULT_COMMUNITY_ID, "General", false);
    } catch (e) {
      console.error("Failed to remove member:", e);
    }
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || !currentUser || !channel || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, "messages"), {
        channelId: channel,
        senderId: currentUser.uid,
        username: currentUser.displayName ?? currentUser.email?.split("@")[0] ?? "Anonymous",
        avatar: currentUser.photoURL ?? "",
        text: input.trim(),
        createdAt: serverTimestamp(),
      });
      setInput(""); inputRef.current?.focus();
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  // ── Create channel ─────────────────────────────────────────────────────────
  const createChannel = async () => {
    if (!newChannelName.trim() || !currentUser) return;
    const ref = await addDoc(collection(db, "communities"), {
      name: newChannelName.trim(),
      createdBy: currentUser.uid,
      members: [currentUser.uid],
      memberNames: [currentUser.displayName ?? currentUser.email?.split("@")[0] ?? "Anonymous"],
      createdAt: serverTimestamp(),
    });
    setNewChannelName(""); setShowNewChannel(false);
    switchChannel(ref.id, newChannelName.trim(), false);
  };

  // ── Open DM ────────────────────────────────────────────────────────────────
  const openDM = async (otherUser: DMUser) => {
    if (!currentUser) return;
    const dmId = [currentUser.uid, otherUser.uid].sort().join("_");
    const dmRef = doc(db, "directMessages", dmId);
    if (!(await getDoc(dmRef)).exists()) {
      await setDoc(dmRef, { members: [currentUser.uid, otherUser.uid], createdAt: serverTimestamp() });
    }
    switchChannel(dmId, otherUser.username, true);
    setShowUserSearch(false); setUserSearchQuery("");
  };

  const switchChannel = (id: string, name: string, dm: boolean) => {
    setChannelId(id); setCurrentChannelName(name);
    setIsDM(dm); setMessages([]); setSidebarOpen(false);
    setShowMembersPanel(false); setAddedMembers(new Set());
  };

  // ── Grouped messages ───────────────────────────────────────────────────────
  const grouped: { label: string; msgs: Message[] }[] = [];
  messages.forEach(msg => {
    const label = formatDateLabel(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.msgs.push(msg);
    else grouped.push({ label, msgs: [msg] });
  });
  const isSameSender = (msgs: Message[], i: number) =>
    i > 0 && msgs[i].senderId === msgs[i - 1].senderId;

  // Users not already in the channel (for add member)
  const usersNotInChannel = allUsers.filter(u =>
    !currentChannel?.members?.includes(u.uid) &&
    u.username.toLowerCase().includes(addMemberQuery.toLowerCase())
  );

  const isChannelOwner = currentChannel?.createdBy === currentUser?.uid;

  // ── Sidebar content ────────────────────────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0A0D13] border-r border-white/5">
      <div className="px-4 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <Link href="/"><span className="text-[#1E90FF] text-lg font-black tracking-tight">Dev<span className="text-white">Connect</span></span></Link>
        <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/5"><X className="w-4 h-4" /></button>
      </div>

      {currentUser && (
        <div className="px-3 py-3 border-b border-white/5 flex items-center gap-2.5 flex-shrink-0">
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(currentUser.uid)} flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden`}>
            {currentUser.photoURL ? <img src={currentUser.photoURL} alt="" className="w-8 h-8 object-cover rounded-full" /> : getInitials(currentUser.displayName ?? currentUser.email ?? undefined)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{currentUser.displayName ?? currentUser.email?.split("@")[0]}</p>
            <p className="text-[10px] text-gray-600 truncate">{currentUser.email}</p>
          </div>
          <button onClick={async () => { await signOut(auth); router.push("/"); }} className="p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-white/5 transition-all">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {/* Channels */}
        <button onClick={() => setShowChannelSection(!showChannelSection)} className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-gray-300 transition-colors">
          <span>Channels</span>
          <div className="flex items-center gap-1">
            <span onClick={e => { e.stopPropagation(); setShowNewChannel(!showNewChannel); }} className="p-0.5 rounded hover:text-[#1E90FF] cursor-pointer"><Plus className="w-3.5 h-3.5" /></span>
            {showChannelSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </div>
        </button>

        {showNewChannel && (
          <div className="flex gap-1.5 px-2 pb-2">
            <input value={newChannelName} onChange={e => setNewChannelName(e.target.value)} onKeyDown={e => e.key === "Enter" && createChannel()} placeholder="channel-name" className="flex-1 bg-[#080B10] border border-white/8 focus:border-[#1E90FF]/40 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-700 outline-none" />
            <button onClick={createChannel} className="px-2.5 bg-[#1E90FF] hover:bg-[#1a7de0] rounded-lg text-xs font-bold transition-colors">Add</button>
          </div>
        )}

        {showChannelSection && communities.map(c => (
          <button key={c.id} onClick={() => switchChannel(c.id, c.name, false)} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition-all ${channel === c.id && !isDM ? "bg-[#1E90FF]/10 text-[#1E90FF]" : "text-gray-500 hover:text-white hover:bg-white/5"}`}>
            <Hash className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate flex-1">{c.name}</span>
            <span className="text-[9px] text-gray-700 flex-shrink-0">{c.members?.length ?? 0}</span>
          </button>
        ))}

        {/* DMs */}
        <button onClick={() => setShowDMSection(!showDMSection)} className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-gray-300 transition-colors mt-2">
          <span>Direct Messages</span>
          <div className="flex items-center gap-1">
            <span onClick={e => { e.stopPropagation(); setShowUserSearch(!showUserSearch); }} className="p-0.5 rounded hover:text-[#1E90FF] cursor-pointer"><Plus className="w-3.5 h-3.5" /></span>
            {showDMSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </div>
        </button>

        {showUserSearch && (
          <div className="px-2 pb-2 space-y-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
              <input value={userSearchQuery} onChange={e => setUserSearchQuery(e.target.value)} placeholder="Find a user…" className="w-full bg-[#080B10] border border-white/8 focus:border-[#1E90FF]/40 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-gray-700 outline-none" />
            </div>
            {userSearchQuery && allUsers.filter(u => u.username.toLowerCase().includes(userSearchQuery.toLowerCase())).slice(0, 5).map(u => (
              <button key={u.uid} onClick={() => openDM(u)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${getAvatarColor(u.uid)} flex items-center justify-center text-[8px] font-bold flex-shrink-0`}>{getInitials(u.username)}</div>
                {u.username}
              </button>
            ))}
          </div>
        )}

        {showDMSection && dmUsers.map(u => {
          const dmId = [currentUser?.uid, u.uid].sort().join("_");
          return (
            <button key={u.uid} onClick={() => switchChannel(dmId, u.username, true)} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition-all ${channel === dmId && isDM ? "bg-[#1E90FF]/10 text-[#1E90FF]" : "text-gray-500 hover:text-white hover:bg-white/5"}`}>
              <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${getAvatarColor(u.uid)} flex items-center justify-center text-[8px] font-bold flex-shrink-0`}>{getInitials(u.username)}</div>
              <span className="truncate">{u.username}</span>
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/5 px-2 py-3 flex items-center gap-1 flex-shrink-0">
        {[{ label: "Feed", href: "/feed" }, { label: "Teams", href: "/teams" }, { label: "Explore", href: "/explore" }].map(({ label, href }) => (
          <Link key={label} href={href} className="flex-1">
            <button className={`w-full py-1.5 rounded-lg text-xs font-medium transition-all ${pathname === href ? "bg-[#1E90FF]/10 text-[#1E90FF]" : "text-gray-600 hover:text-white hover:bg-white/5"}`}>{label}</button>
          </Link>
        ))}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#080B10] overflow-hidden text-white font-sans">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0"><SidebarContent /></aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 w-64 flex-shrink-0"><SidebarContent /></aside>
        </div>
      )}

      {/* Main chat */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="h-14 border-b border-white/5 flex items-center justify-between px-4 md:px-5 bg-[#080B10]/90 backdrop-blur-xl flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 mr-1">
              <Menu className="w-4 h-4" />
            </button>
            <div className="w-7 h-7 rounded-lg bg-[#1E90FF]/10 border border-[#1E90FF]/20 flex items-center justify-center flex-shrink-0">
              {isDM ? <AtSign className="w-3.5 h-3.5 text-[#1E90FF]" /> : <Hash className="w-3.5 h-3.5 text-[#1E90FF]" />}
            </div>
            <h2 className="font-bold text-sm truncate">{currentChannelName}</h2>
            {!isDM && currentChannel && (
              <span className="hidden md:flex items-center gap-1 text-xs text-gray-600 border-l border-white/5 pl-2.5 flex-shrink-0">
                <Users className="w-3 h-3" />
                {currentChannel.members?.length ?? 0} members
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
            </span>
            {/* Add member button — only for channels, not DMs */}
            {!isDM && currentUser && (
              <button
                onClick={() => { setShowAddMember(true); setAddMemberQuery(""); setAddedMembers(new Set()); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-[#1E90FF]/10 hover:bg-[#1E90FF]/15 text-[#1E90FF] border border-[#1E90FF]/20 transition-all font-semibold"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:block">Add Member</span>
              </button>
            )}
            {/* Members panel toggle */}
            {!isDM && (
              <button
                onClick={() => setShowMembersPanel(!showMembersPanel)}
                className={`p-2 rounded-xl text-xs transition-all ${showMembersPanel ? "bg-white/10 text-white" : "bg-white/5 text-gray-400 hover:text-white"}`}
                title="Members"
              >
                <Users className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          {/* Messages area */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <section className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-1">

              {!authReady && (
                <div className="flex items-center justify-center h-full">
                  <div className="w-6 h-6 rounded-full border-2 border-[#1E90FF] border-t-transparent animate-spin" />
                </div>
              )}

              {authReady && !currentUser && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#1E90FF]/10 border border-[#1E90FF]/20 flex items-center justify-center mb-4">
                    <MessageSquare className="w-7 h-7 text-[#1E90FF]" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">Sign in to chat</h3>
                  <p className="text-gray-600 text-sm mb-6">Join the conversation with developers worldwide.</p>
                  <Link href="/login"><button className="bg-[#1E90FF] hover:bg-[#1a7de0] px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20">Sign In</button></Link>
                </div>
              )}

              {authReady && currentUser && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center pb-10">
                  <div className="w-14 h-14 rounded-2xl bg-[#1E90FF]/10 border border-[#1E90FF]/20 flex items-center justify-center mb-4">
                    {isDM ? <AtSign className="w-7 h-7 text-[#1E90FF]" /> : <Hash className="w-7 h-7 text-[#1E90FF]" />}
                  </div>
                  <h3 className="font-bold text-lg mb-1">
                    {isDM ? `Start chatting with ${currentChannelName}` : `Welcome to #${currentChannelName}`}
                  </h3>
                  <p className="text-gray-600 text-sm mb-4">
                    {isDM ? "Beginning of your DM history." : "The very beginning of this channel."}
                  </p>
                  {!isDM && (
                    <button
                      onClick={() => { setShowAddMember(true); setAddMemberQuery(""); setAddedMembers(new Set()); }}
                      className="flex items-center gap-2 text-sm text-[#1E90FF] bg-[#1E90FF]/10 border border-[#1E90FF]/20 px-4 py-2 rounded-xl hover:bg-[#1E90FF]/15 transition-all"
                    >
                      <UserPlus className="w-4 h-4" /> Invite members to this channel
                    </button>
                  )}
                </div>
              )}

              {grouped.map(({ label, msgs }) => (
                <div key={label}>
                  <div className="flex items-center gap-3 py-4">
                    <div className="flex-1 h-px bg-white/5" />
                    <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest px-1">{label}</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                  {msgs.map((msg, i) => {
                    const isMe = msg.senderId === currentUser?.uid;
                    const consecutive = isSameSender(msgs, i);
                    return (
                      <div key={msg.id} className={`flex gap-3 group ${consecutive ? "mt-0.5" : "mt-4"} ${isMe ? "flex-row-reverse" : ""}`}>
                        <div className="flex-shrink-0 w-9">
                          {!consecutive && (
                            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(msg.senderId)} flex items-center justify-center text-xs font-bold overflow-hidden`}>
                              {msg.avatar ? <img src={msg.avatar} alt="" className="w-9 h-9 object-cover" /> : getInitials(msg.username)}
                            </div>
                          )}
                        </div>
                        <div className={`flex flex-col max-w-[70%] ${isMe ? "items-end" : "items-start"}`}>
                          {!consecutive && (
                            <div className={`flex items-center gap-2 mb-1 ${isMe ? "flex-row-reverse" : ""}`}>
                              <span className="text-xs font-semibold text-gray-300">{msg.username}</span>
                              <span className="text-[10px] text-gray-600">{formatTime(msg.createdAt)}</span>
                            </div>
                          )}
                          <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words ${isMe ? "bg-[#1E90FF] text-white rounded-tr-sm" : "bg-[#0E1117] border border-white/5 text-gray-200 rounded-tl-sm"}`}>
                            {msg.text}
                          </div>
                          {consecutive && (
                            <span className="text-[10px] text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 px-1">{formatTime(msg.createdAt)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </section>

            {/* Input */}
            <footer className="flex-shrink-0 border-t border-white/5 px-4 md:px-6 py-4 bg-[#080B10]">
              {authReady && !currentUser ? (
                <div className="text-center text-sm text-gray-600 py-2">
                  <Link href="/login" className="text-[#1E90FF] hover:underline font-medium">Sign in</Link> to send messages.
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-[#0E1117] border border-white/8 focus-within:border-[#1E90FF]/30 rounded-2xl px-4 py-3 transition-colors">
                  {currentUser && (
                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(currentUser.uid)} flex items-center justify-center text-[10px] font-bold flex-shrink-0 overflow-hidden`}>
                      {currentUser.photoURL ? <img src={currentUser.photoURL} alt="" className="w-7 h-7 object-cover rounded-full" /> : getInitials(currentUser.displayName ?? currentUser.email ?? undefined)}
                    </div>
                  )}
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder={`Message ${isDM ? "" : "#"}${currentChannelName}…`}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                    disabled={!channel || !currentUser}
                    className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none disabled:opacity-40"
                  />
                  <button onClick={handleSend} disabled={!input.trim() || sending || !currentUser} className="w-8 h-8 rounded-xl bg-[#1E90FF] hover:bg-[#1a7de0] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all flex-shrink-0 shadow-lg shadow-blue-500/20">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </footer>
          </div>

          {/* ── Members panel (right side) ── */}
          {showMembersPanel && !isDM && (
            <aside className="w-56 border-l border-white/5 bg-[#0A0D13] flex flex-col flex-shrink-0">
              <div className="px-4 py-3.5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
                <div>
                  <p className="text-xs font-bold">Members</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{currentChannel?.members?.length ?? 0} in channel</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setShowAddMember(true); setAddMemberQuery(""); setAddedMembers(new Set()); }}
                    className="p-1.5 rounded-lg bg-[#1E90FF]/10 text-[#1E90FF] hover:bg-[#1E90FF]/15 transition-all"
                    title="Add member"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setShowMembersPanel(false)} className="p-1.5 rounded-lg text-gray-600 hover:text-white hover:bg-white/5 transition-all">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
                {loadingMembers && (
                  <div className="flex justify-center py-6">
                    <div className="w-4 h-4 rounded-full border-2 border-[#1E90FF] border-t-transparent animate-spin" />
                  </div>
                )}
                {!loadingMembers && channelMembers.map(member => (
                  <div key={member.uid} className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-white/5 group transition-all">
                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(member.uid)} flex items-center justify-center text-[9px] font-bold flex-shrink-0 overflow-hidden`}>
                      {member.photoURL ? <img src={member.photoURL} alt="" className="w-7 h-7 object-cover rounded-full" /> : getInitials(member.username)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{member.username}</p>
                      {member.isOwner && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Crown className="w-2.5 h-2.5 text-amber-400" />
                          <span className="text-[9px] text-amber-400">Owner</span>
                        </div>
                      )}
                    </div>
                    {/* Remove button — owner can remove others; anyone can remove themselves */}
                    {!member.isOwner && (isChannelOwner || member.uid === currentUser?.uid) && (
                      <button
                        onClick={() => removeMemberFromChannel(member)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title={member.uid === currentUser?.uid ? "Leave channel" : "Remove member"}
                      >
                        {member.uid === currentUser?.uid ? <LogOut className="w-3 h-3" /> : <UserMinus className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* ── ADD MEMBER MODAL ── */}
      {showAddMember && !isDM && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddMember(false)} />
          <div className="relative z-10 bg-[#0E1117] border border-white/8 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-bold text-lg">Add Members</h2>
                <p className="text-xs text-gray-600 mt-0.5">Invite people to <span className="text-white font-semibold">#{currentChannelName}</span></p>
              </div>
              <button onClick={() => setShowAddMember(false)} className="p-1.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/8 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
              <input
                value={addMemberQuery}
                onChange={e => setAddMemberQuery(e.target.value)}
                placeholder="Search users by username…"
                autoFocus
                className="w-full bg-[#080B10] border border-white/8 focus:border-[#1E90FF]/40 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors"
              />
            </div>

            {/* Already in channel */}
            {addedMembers.size > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {[...addedMembers].map(uid => {
                  const user = allUsers.find(u => u.uid === uid);
                  return (
                    <div key={uid} className="flex items-center gap-1.5 bg-[#1E90FF]/10 border border-[#1E90FF]/20 px-2.5 py-1 rounded-full text-xs text-[#1E90FF]">
                      <CheckCircle2 className="w-3 h-3" />
                      {user?.username ?? uid}
                    </div>
                  );
                })}
              </div>
            )}

            {/* User list */}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {usersNotInChannel.length === 0 && (
                <p className="text-xs text-gray-600 text-center py-6">
                  {addMemberQuery ? "No users found." : "Everyone is already in this channel!"}
                </p>
              )}
              {usersNotInChannel.slice(0, 20).map(user => {
                const alreadyAdded = addedMembers.has(user.uid);
                const isLoading = addingMember === user.uid;
                return (
                  <div key={user.uid} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all">
                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(user.uid)} flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden`}>
                      {user.photoURL ? <img src={user.photoURL} alt="" className="w-9 h-9 object-cover rounded-full" /> : getInitials(user.username)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{user.username}</p>
                      <p className="text-xs text-gray-600">Developer</p>
                    </div>
                    <button
                      onClick={() => !alreadyAdded && addMemberToChannel(user)}
                      disabled={alreadyAdded || isLoading}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex-shrink-0 ${
                        alreadyAdded
                          ? "bg-green-500/10 text-green-400 border border-green-500/20 cursor-default"
                          : "bg-[#1E90FF]/10 text-[#1E90FF] border border-[#1E90FF]/20 hover:bg-[#1E90FF]/15"
                      }`}
                    >
                      {isLoading ? (
                        <div className="w-3 h-3 rounded-full border border-[#1E90FF] border-t-transparent animate-spin" />
                      ) : alreadyAdded ? (
                        <><CheckCircle2 className="w-3 h-3" /> Added</>
                      ) : (
                        <><UserPlus className="w-3 h-3" /> Add</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowAddMember(false)}
              className="w-full mt-4 bg-white/5 hover:bg-white/8 border border-white/8 py-2.5 rounded-xl text-sm font-semibold transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}