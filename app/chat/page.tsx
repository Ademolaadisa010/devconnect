"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  where,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  arrayUnion,
  getDocs,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  Send,
  Hash,
  AtSign,
  Plus,
  Search,
  MessageSquare,
  LogOut,
  X,
  ChevronDown,
  ChevronRight,
  Menu,
} from "lucide-react";

interface Message {
  id: string;
  channelId: string;
  senderId: string;
  text: string;
  createdAt: any;
  username: string;
  avatar: string;
}

interface Community {
  id: string;
  name: string;
  members: string[];
}

interface DMUser {
  uid: string;
  username: string;
  photoURL?: string;
}

const DEFAULT_COMMUNITY_ID = "general";

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

// ✅ Fixed: name param is string | undefined, not string | null
function getInitials(name?: string): string {
  if (!name) return "U";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatTime(ts?: any): string {
  if (!ts?.seconds) return "";
  return new Date(ts.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(ts?: any): string {
  if (!ts?.seconds) return "";
  const d = new Date(ts.seconds * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

export default function ChatPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [channel, setChannelId] = useState<string>(DEFAULT_COMMUNITY_ID);
  const [currentChannelName, setCurrentChannelName] = useState("General");
  const [isDM, setIsDM] = useState(false);

  const [communities, setCommunities] = useState<Community[]>([]);
  const [dmUsers, setDmUsers] = useState<DMUser[]>([]);
  const [allUsers, setAllUsers] = useState<DMUser[]>([]);

  const [showChannelSection, setShowChannelSection] = useState(true);
  const [showDMSection, setShowDMSection] = useState(true);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Auth + bootstrap ────────────────────────────────────────────────────────
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
          // ✅ Fixed: null-safe with ?? ""
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
          name: "General",
          createdBy: user.uid,
          members: [user.uid],
          createdAt: serverTimestamp(),
        });
      } else {
        const members: string[] = generalSnap.data()?.members || [];
        if (!members.includes(user.uid)) {
          await updateDoc(generalRef, { members: arrayUnion(user.uid) });
        }
      }
    });
    return () => unsub();
  }, []);

  // ── Load communities ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "communities"), where("members", "array-contains", currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list: Community[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setCommunities(list);
    });
    return () => unsub();
  }, [currentUser]);

  // ── Load DM conversations ───────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "directMessages"), where("members", "array-contains", currentUser.uid));
    const unsub = onSnapshot(q, async (snap) => {
      const users: DMUser[] = [];
      for (const d of snap.docs) {
        const members: string[] = d.data().members || [];
        const otherId = members.find((id) => id !== currentUser.uid);
        if (otherId) {
          const userDoc = await getDoc(doc(db, "users", otherId));
          if (userDoc.exists()) {
            users.push({
              uid: otherId,
              username: userDoc.data()?.username || "Unknown",
              // ✅ Fixed: convert null photoURL to undefined
              photoURL: userDoc.data()?.photoURL ?? undefined,
            });
          }
        }
      }
      setDmUsers(users);
    });
    return () => unsub();
  }, [currentUser]);

  // ── Load all users for search ───────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    getDocs(collection(db, "users")).then((snap) => {
      const list: DMUser[] = [];
      snap.forEach((d) => {
        if (d.id !== currentUser.uid) {
          list.push({
            uid: d.id,
            username: d.data()?.username || "Unknown",
            photoURL: d.data()?.photoURL ?? undefined,
          });
        }
      });
      setAllUsers(list);
    });
  }, [currentUser]);

  // ── Messages listener ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !channel) return;
    const q = query(
      collection(db, "messages"),
      where("channelId", "==", channel),
      orderBy("createdAt")
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs: Message[] = [];
      snap.forEach((d) => {
        const data = d.data();
        msgs.push({
          id: d.id,
          channelId: data.channelId,
          senderId: data.senderId,
          text: data.text,
          createdAt: data.createdAt,
          username: data.username || "Anonymous",
          avatar: data.avatar || "",
        });
      });
      setMessages(msgs);
    });
    return () => unsub();
  }, [channel, currentUser]);

  // ── Auto scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Channel name resolver ────────────────────────────────────────────────────
  useEffect(() => {
    if (!channel) return;
    const resolve = async () => {
      const communityDoc = await getDoc(doc(db, "communities", channel));
      if (communityDoc.exists()) {
        setCurrentChannelName(communityDoc.data().name || "Unknown");
        setIsDM(false);
        return;
      }
      const dmDoc = await getDoc(doc(db, "directMessages", channel));
      if (dmDoc.exists()) {
        setIsDM(true);
        const members: string[] = dmDoc.data()?.members || [];
        const otherId = members.find((id) => id !== currentUser?.uid);
        if (otherId) {
          const userDoc = await getDoc(doc(db, "users", otherId));
          setCurrentChannelName(userDoc.exists() ? userDoc.data()?.username || "Unknown" : "Unknown");
        }
      }
    };
    resolve();
  }, [channel, currentUser]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || !currentUser || !channel || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, "messages"), {
        channelId: channel,
        senderId: currentUser.uid,
        // ✅ Fixed: null-safe with ?? fallback
        username: currentUser.displayName ?? currentUser.email?.split("@")[0] ?? "Anonymous",
        avatar: currentUser.photoURL ?? "",
        text: input.trim(),
        createdAt: serverTimestamp(),
      });
      setInput("");
      inputRef.current?.focus();
    } catch (err) {
      console.error("Failed to send:", err);
    } finally {
      setSending(false);
    }
  };

  const createChannel = async () => {
    if (!newChannelName.trim() || !currentUser) return;
    const ref = await addDoc(collection(db, "communities"), {
      name: newChannelName.trim(),
      createdBy: currentUser.uid,
      members: [currentUser.uid],
      createdAt: serverTimestamp(),
    });
    setNewChannelName("");
    setShowNewChannel(false);
    switchChannel(ref.id, newChannelName.trim(), false);
  };

  const openDM = async (otherUser: DMUser) => {
    if (!currentUser) return;
    const dmId = [currentUser.uid, otherUser.uid].sort().join("_");
    const dmRef = doc(db, "directMessages", dmId);
    const dmSnap = await getDoc(dmRef);
    if (!dmSnap.exists()) {
      await setDoc(dmRef, { members: [currentUser.uid, otherUser.uid], createdAt: serverTimestamp() });
    }
    switchChannel(dmId, otherUser.username, true);
    setShowUserSearch(false);
    setUserSearchQuery("");
  };

  const switchChannel = (id: string, name: string, dm: boolean) => {
    setChannelId(id);
    setCurrentChannelName(name);
    setIsDM(dm);
    setMessages([]);
    setSidebarOpen(false);
  };

  // ── Group messages by date ──────────────────────────────────────────────────
  const groupedMessages: { label: string; msgs: Message[] }[] = [];
  messages.forEach((msg) => {
    const label = formatDateLabel(msg.createdAt);
    const last = groupedMessages[groupedMessages.length - 1];
    if (last && last.label === label) last.msgs.push(msg);
    else groupedMessages.push({ label, msgs: [msg] });
  });

  const isSameSender = (msgs: Message[], i: number) =>
    i > 0 && msgs[i].senderId === msgs[i - 1].senderId;

  const filteredUsers = allUsers.filter((u) =>
    u.username.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  // ── Sidebar JSX ─────────────────────────────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0A0D13] border-r border-white/5">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <Link href="/">
          <span className="text-[#1E90FF] text-lg font-black tracking-tight">
            Dev<span className="text-white">Connect</span>
          </span>
        </Link>
        <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* User strip */}
      {currentUser && (
        <div className="px-3 py-3 border-b border-white/5 flex items-center gap-2.5 flex-shrink-0">
          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(currentUser.uid)} flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden`}>
            {currentUser.photoURL
              ? <img src={currentUser.photoURL} alt="" className="w-8 h-8 object-cover rounded-full" />
              // ✅ Fixed: ?? undefined converts null to undefined for getInitials
              : getInitials(currentUser.displayName ?? currentUser.email ?? undefined)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">
              {currentUser.displayName ?? currentUser.email?.split("@")[0]}
            </p>
            <p className="text-[10px] text-gray-600 truncate">{currentUser.email}</p>
          </div>
          <button
            onClick={async () => { await signOut(auth); router.push("/"); }}
            className="p-1 rounded-lg text-gray-600 hover:text-red-400 hover:bg-white/5 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">

        {/* Channels */}
        <button
          onClick={() => setShowChannelSection(!showChannelSection)}
          className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-gray-300 transition-colors"
        >
          <span>Channels</span>
          <div className="flex items-center gap-1">
            <span onClick={(e) => { e.stopPropagation(); setShowNewChannel(!showNewChannel); }} className="p-0.5 rounded hover:text-[#1E90FF] cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
            </span>
            {showChannelSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </div>
        </button>

        {showNewChannel && (
          <div className="flex gap-1.5 px-2 pb-2">
            <input
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createChannel()}
              placeholder="channel-name"
              className="flex-1 bg-[#080B10] border border-white/8 focus:border-[#1E90FF]/40 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-700 outline-none"
            />
            <button onClick={createChannel} className="px-2.5 bg-[#1E90FF] hover:bg-[#1a7de0] rounded-lg text-xs font-bold transition-colors">
              Add
            </button>
          </div>
        )}

        {showChannelSection && communities.map((c) => (
          <button
            key={c.id}
            onClick={() => switchChannel(c.id, c.name, false)}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition-all ${
              channel === c.id && !isDM
                ? "bg-[#1E90FF]/10 text-[#1E90FF]"
                : "text-gray-500 hover:text-white hover:bg-white/5"
            }`}
          >
            <Hash className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{c.name}</span>
          </button>
        ))}

        {/* DMs */}
        <button
          onClick={() => setShowDMSection(!showDMSection)}
          className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-gray-300 transition-colors mt-2"
        >
          <span>Direct Messages</span>
          <div className="flex items-center gap-1">
            <span onClick={(e) => { e.stopPropagation(); setShowUserSearch(!showUserSearch); }} className="p-0.5 rounded hover:text-[#1E90FF] cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
            </span>
            {showDMSection ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </div>
        </button>

        {showUserSearch && (
          <div className="px-2 pb-2 space-y-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
              <input
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Find a user…"
                className="w-full bg-[#080B10] border border-white/8 focus:border-[#1E90FF]/40 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-gray-700 outline-none"
              />
            </div>
            {userSearchQuery && filteredUsers.slice(0, 5).map((u) => (
              <button key={u.uid} onClick={() => openDM(u)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${getAvatarColor(u.uid)} flex items-center justify-center text-[8px] font-bold flex-shrink-0`}>
                  {getInitials(u.username)}
                </div>
                {u.username}
              </button>
            ))}
          </div>
        )}

        {showDMSection && dmUsers.map((u) => {
          const dmId = [currentUser?.uid, u.uid].sort().join("_");
          return (
            <button
              key={u.uid}
              onClick={() => switchChannel(dmId, u.username, true)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition-all ${
                channel === dmId && isDM
                  ? "bg-[#1E90FF]/10 text-[#1E90FF]"
                  : "text-gray-500 hover:text-white hover:bg-white/5"
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${getAvatarColor(u.uid)} flex items-center justify-center text-[8px] font-bold flex-shrink-0`}>
                {getInitials(u.username)}
              </div>
              <span className="truncate">{u.username}</span>
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
            </button>
          );
        })}
      </div>

      {/* Bottom nav */}
      <div className="border-t border-white/5 px-2 py-3 flex items-center gap-1 flex-shrink-0">
        {[{ label: "Feed", href: "/feed" }, { label: "Teams", href: "/teams" }, { label: "Explore", href: "/explore" }].map(({ label, href }) => (
          <Link key={label} href={href} className="flex-1">
            <button className={`w-full py-1.5 rounded-lg text-xs font-medium transition-all ${pathname === href ? "bg-[#1E90FF]/10 text-[#1E90FF]" : "text-gray-600 hover:text-white hover:bg-white/5"}`}>
              {label}
            </button>
          </Link>
        ))}
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#080B10] overflow-hidden text-white font-sans">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-10 w-64 flex-shrink-0">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main chat */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="h-14 border-b border-white/5 flex items-center justify-between px-4 md:px-5 bg-[#080B10]/90 backdrop-blur-xl flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 mr-1">
              <Menu className="w-4 h-4" />
            </button>
            <div className="w-7 h-7 rounded-lg bg-[#1E90FF]/10 border border-[#1E90FF]/20 flex items-center justify-center">
              {isDM ? <AtSign className="w-3.5 h-3.5 text-[#1E90FF]" /> : <Hash className="w-3.5 h-3.5 text-[#1E90FF]" />}
            </div>
            <h2 className="font-bold text-sm">{currentChannelName}</h2>
            <span className="hidden md:inline text-xs text-gray-600 border-l border-white/5 pl-2.5">
              {isDM ? "Direct message" : "Community channel"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </div>
        </header>

        {/* Messages */}
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
              <Link href="/login">
                <button className="bg-[#1E90FF] hover:bg-[#1a7de0] px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20">
                  Sign In
                </button>
              </Link>
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
              <p className="text-gray-600 text-sm">
                {isDM ? "Beginning of your DM history." : "The very beginning of this channel."}
              </p>
            </div>
          )}

          {groupedMessages.map(({ label, msgs }) => (
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
                          {msg.avatar
                            ? <img src={msg.avatar} alt="" className="w-9 h-9 object-cover" />
                            : getInitials(msg.username)}
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
                      <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                        isMe
                          ? "bg-[#1E90FF] text-white rounded-tr-sm"
                          : "bg-[#0E1117] border border-white/5 text-gray-200 rounded-tl-sm"
                      }`}>
                        {msg.text}
                      </div>
                      {consecutive && (
                        <span className="text-[10px] text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 px-1">
                          {formatTime(msg.createdAt)}
                        </span>
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
                  {currentUser.photoURL
                    ? <img src={currentUser.photoURL} alt="" className="w-7 h-7 object-cover rounded-full" />
                    // ✅ Key fix for TS2345: currentUser.email is string|null, getInitials needs string|undefined
                    : getInitials(currentUser.displayName ?? currentUser.email ?? undefined)}
                </div>
              )}
              <input
                ref={inputRef}
                type="text"
                placeholder={`Message ${isDM ? "" : "#"}${currentChannelName}…`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                disabled={!channel || !currentUser}
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none disabled:opacity-40"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending || !currentUser}
                className="w-8 h-8 rounded-xl bg-[#1E90FF] hover:bg-[#1a7de0] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all flex-shrink-0 shadow-lg shadow-blue-500/20"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </footer>
      </main>
    </div>
  );
}