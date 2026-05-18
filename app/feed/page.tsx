"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDocs,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import {
  Heart,
  MessageCircle,
  Share2,
  Send,
  Image as ImageIcon,
  Link as LinkIcon,
  TrendingUp,
  Zap,
  Users,
  BookOpen,
  ChevronRight,
  ExternalLink,
  LogOut,
  Home,
  Compass,
} from "lucide-react";
import Link from "next/link";

type Post = {
  id: string;
  title?: string;
  content?: string;
  url?: string;
  image?: string;
  source?: string;
  createdAt?: any;
  authorId?: string;
  authorName?: string;
  likes?: string[];
};

type RedditPost = {
  id: string;
  title: string;
  content?: string;
  url?: string;
  image?: string | null;
  author?: string;
  subreddit?: string;
  score?: number;
  numComments?: number;
  createdAt?: number;
};

function getInitials(name?: string) {
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

const AVATAR_COLORS = [
  "from-blue-500 to-cyan-400",
  "from-violet-500 to-blue-400",
  "from-cyan-500 to-teal-400",
  "from-rose-500 to-orange-400",
  "from-emerald-500 to-cyan-400",
];

function getAvatarColor(str?: string) {
  if (!str) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function CommunityFeedPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [redditPosts, setRedditPosts] = useState<RedditPost[]>([]);
  const [loadingReddit, setLoadingReddit] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [creating, setCreating] = useState(false);
  const [postFocused, setPostFocused] = useState(false);

  const [activeTab, setActiveTab] = useState<"Latest" | "Popular" | "Following">("Latest");
  const [commentsOpenFor, setCommentsOpenFor] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [postComments, setPostComments] = useState<Record<string, Array<any>>>({});

  const commentInputs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // ── Firestore posts ────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "feedPosts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const arr: Post[] = [];
      snap.forEach((d) => {
        const data: any = d.data();
        arr.push({
          id: d.id,
          title: data.title,
          content: data.content,
          url: data.url,
          image: data.image,
          source: data.source,
          createdAt: data.createdAt,
          authorId: data.authorId,
          authorName: data.authorName,
          likes: data.likes || [],
        });
      });
      setPosts(arr);
    });
    return () => unsub();
  }, []);

  // ── Reddit proxy ───────────────────────────────────────────────────────────
  useEffect(() => {
    const loadReddit = async () => {
      try {
        setLoadingReddit(true);
        const res = await fetch("/api/reddit?subreddit=technology&limit=8&sort=top");
        if (!res.ok) { setLoadingReddit(false); return; }
        const json = await res.json();
        setRedditPosts(json.posts || []);
      } catch (err) {
        console.error("Reddit fetch failed:", err);
      } finally {
        setLoadingReddit(false);
      }
    };
    loadReddit();
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  const requireAuth = (action: () => void) => {
    if (!currentUser) { router.push("/login"); return; }
    action();
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  const createPost = () => {
    requireAuth(async () => {
      if (!newText.trim()) return;
      setCreating(true);
      try {
        await addDoc(collection(db, "feedPosts"), {
          title: newTitle || null,
          content: newText,
          url: null,
          image: null,
          source: null,
          authorId: currentUser.uid,
          authorName:
            currentUser.displayName ||
            currentUser.email?.split("@")[0] ||
            "Anonymous",
          likes: [],
          createdAt: serverTimestamp(),
        });
        setNewTitle("");
        setNewText("");
        setPostFocused(false);
      } catch (err) {
        console.error("createPost failed:", err);
        alert("Failed to create post");
      } finally {
        setCreating(false);
      }
    });
  };

  const toggleLike = (postId: string, likedAlready: boolean) => {
    requireAuth(async () => {
      const ref = doc(db, "feedPosts", postId);
      if (likedAlready) await updateDoc(ref, { likes: arrayRemove(currentUser.uid) });
      else await updateDoc(ref, { likes: arrayUnion(currentUser.uid) });
    });
  };

  const openComments = async (postId: string) => {
    if (!currentUser) { router.push("/login"); return; }
    setCommentsOpenFor(commentsOpenFor === postId ? null : postId);
    if (!postComments[postId]) {
      const snap = await getDocs(collection(db, `feedPosts/${postId}/comments`));
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setPostComments((prev) => ({ ...prev, [postId]: arr }));
    }
    setTimeout(() => commentInputs.current[postId]?.focus(), 120);
  };

  const addComment = (postId: string) => {
    requireAuth(async () => {
      if (!commentText.trim()) return;
      await addDoc(collection(db, `feedPosts/${postId}/comments`), {
        userId: currentUser.uid,
        username:
          currentUser.displayName ||
          currentUser.email?.split("@")[0] ||
          "Anonymous",
        text: commentText.trim(),
        createdAt: serverTimestamp(),
      });
      setCommentText("");
      const snap = await getDocs(collection(db, `feedPosts/${postId}/comments`));
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setPostComments((prev) => ({ ...prev, [postId]: arr }));
    });
  };

  // ── Filtered posts by tab ──────────────────────────────────────────────────
  const filteredPosts = (() => {
    if (activeTab === "Popular") {
      return [...posts].sort((a, b) => (b.likes?.length ?? 0) - (a.likes?.length ?? 0));
    }
    if (activeTab === "Following") {
      // Show only current user's posts as a stub until following system is built
      return currentUser ? posts.filter((p) => p.authorId === currentUser.uid) : [];
    }
    return posts; // Latest (default, already ordered by Firestore)
  })();

  // ── Nav items ──────────────────────────────────────────────────────────────
  const navItems = [
    { icon: Home,       label: "Feed",          href: "/feed" },
    { icon: Users,      label: "My Teams",      href: "/teams" },
    { icon: Compass,    label: "Explore",       href: "/explore" },
    { icon: Zap,        label: "Live Sessions", href: "/live" },
    { icon: BookOpen,   label: "Tech Updates",  href: "/tech-updates" },
    { icon: TrendingUp, label: "Trending",      href: "/trending" },
  ];

  return (
    <div className="min-h-screen bg-[#080B10] text-white font-sans">

      {/* ── TOP NAV ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-10 py-3.5 border-b border-white/5 bg-[#080B10]/80 backdrop-blur-xl">
        <Link href="/">
          <span className="text-[#1E90FF] text-xl font-black tracking-tight">
            Dev<span className="text-white">Connect</span>
          </span>
        </Link>

        {/* Centre nav tabs */}
        <div className="hidden md:flex items-center gap-1 bg-white/5 border border-white/8 rounded-full px-1 py-1">
          {[
            { label: "Feed",    href: "/feed" },
            { label: "Teams",   href: "/teams" },
            { label: "Explore", href: "/explore" },
          ].map(({ label, href }) => (
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

        {/* Right auth area */}
        <div className="flex items-center gap-3">
          {authReady && (
            currentUser ? (
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(currentUser.uid)} flex items-center justify-center text-xs font-bold overflow-hidden cursor-pointer`}
                  title={currentUser.displayName || currentUser.email}
                >
                  {currentUser.photoURL
                    ? <img src={currentUser.photoURL} alt="me" className="w-8 h-8 rounded-full object-cover" />
                    : getInitials(currentUser.displayName || currentUser.email)}
                </div>
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/8 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Link href="/login">
                  <button className="text-sm text-gray-400 hover:text-white px-3 py-1.5 transition-colors">
                    Login
                  </button>
                </Link>
                <Link href="/register">
                  <button className="text-sm bg-[#1E90FF] hover:bg-[#1a7de0] px-4 py-2 rounded-full font-semibold transition-all shadow-lg shadow-blue-500/20">
                    Join Free
                  </button>
                </Link>
              </>
            )
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 px-4 md:px-6 py-6">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="hidden lg:flex flex-col lg:col-span-3 gap-4">
          <div className="sticky top-20 space-y-4">

            {/* Profile / CTA card */}
            {authReady && (
              currentUser ? (
                <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-5">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${getAvatarColor(currentUser.uid)} flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden`}>
                      {currentUser.photoURL
                        ? <img src={currentUser.photoURL} alt="me" className="w-11 h-11 object-cover rounded-full" />
                        : getInitials(currentUser.displayName || currentUser.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {currentUser.displayName || currentUser.email?.split("@")[0]}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{currentUser.email}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5 text-center">
                    {[
                      ["Posts", posts.filter((p) => p.authorId === currentUser.uid).length],
                      ["Likes", posts.reduce((acc, p) => acc + (p.likes?.includes(currentUser.uid) ? 1 : 0), 0)],
                      ["Teams", "—"],
                    ].map(([label, val]) => (
                      <div key={label as string}>
                        <p className="text-sm font-bold">{val}</p>
                        <p className="text-[10px] text-gray-500">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-5">
                  <div className="w-10 h-10 rounded-xl bg-[#1E90FF]/10 border border-[#1E90FF]/20 flex items-center justify-center mb-3">
                    <Users className="w-5 h-5 text-[#1E90FF]" />
                  </div>
                  <h2 className="font-bold text-base">Join DevConnect</h2>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    Share your work, chat with devs, and collaborate in real time.
                  </p>
                  <div className="flex flex-col gap-2 mt-4">
                    <Link href="/register">
                      <button className="w-full bg-[#1E90FF] hover:bg-[#1a7de0] py-2 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-500/20">
                        Get Started Free
                      </button>
                    </Link>
                    <Link href="/login">
                      <button className="w-full border border-white/8 bg-white/3 hover:bg-white/8 py-2 rounded-xl text-sm text-gray-400 transition-all">
                        Login
                      </button>
                    </Link>
                  </div>
                </div>
              )
            )}

            {/* Navigation links — all clickable with Link */}
            <nav className="bg-[#0E1117] border border-white/5 rounded-2xl p-3">
              {navItems.map(({ icon: Icon, label, href }) => {
                const isActive = pathname === href;
                return (
                  <Link key={label} href={href}>
                    <span
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all cursor-pointer ${
                        isActive
                          ? "bg-[#1E90FF]/10 text-[#1E90FF]"
                          : "text-gray-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {label}
                      <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
                    </span>
                  </Link>
                );
              })}
            </nav>

            {/* Active now */}
            <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                Active Now
              </p>
              <div className="flex -space-x-2">
                {AVATAR_COLORS.map((c, i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${c} border-2 border-[#080B10] flex items-center justify-center text-[10px] font-bold`}
                  >
                    {["AO", "JM", "PN", "KL", "RB"][i]}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2">+248 developers online</p>
            </div>
          </div>
        </aside>

        {/* ── MAIN FEED ── */}
        <main className="lg:col-span-6 space-y-4">

          {/* Compose box */}
          {authReady && currentUser && (
            <div
              className={`bg-[#0E1117] border rounded-2xl p-5 transition-all duration-200 ${
                postFocused ? "border-[#1E90FF]/30 shadow-lg shadow-blue-500/5" : "border-white/5"
              }`}
            >
              <div className="flex gap-3">
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(currentUser.uid)} flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden`}
                >
                  {currentUser.photoURL
                    ? <img src={currentUser.photoURL} alt="me" className="w-10 h-10 rounded-full object-cover" />
                    : getInitials(currentUser.displayName || currentUser.email)}
                </div>
                <div className="flex-1">
                  {postFocused && (
                    <input
                      placeholder="Post title (optional)"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full bg-transparent text-white placeholder-gray-600 outline-none text-sm font-semibold mb-2"
                    />
                  )}
                  <textarea
                    placeholder="What are you building? Share an update…"
                    value={newText}
                    onFocus={() => setPostFocused(true)}
                    onChange={(e) => setNewText(e.target.value)}
                    className={`w-full bg-transparent text-white placeholder-gray-600 outline-none resize-none text-sm transition-all duration-200 ${
                      postFocused ? "h-24" : "h-10"
                    }`}
                  />
                  {postFocused && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-1">
                        <button className="p-2 rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all">
                          <ImageIcon className="w-4 h-4" />
                        </button>
                        <button className="p-2 rounded-xl text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all">
                          <LinkIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setNewText(""); setNewTitle(""); setPostFocused(false); }}
                          className="px-3 py-1.5 rounded-xl text-xs text-gray-500 hover:text-gray-300 border border-white/8 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={createPost}
                          disabled={creating || !newText.trim()}
                          className="bg-[#1E90FF] hover:bg-[#1a7de0] disabled:opacity-40 disabled:cursor-not-allowed px-5 py-1.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-500/20"
                        >
                          {creating ? "Posting…" : "Post"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Sign-in nudge */}
          {authReady && !currentUser && (
            <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">Sign in to post and interact with the community.</p>
              <Link href="/login">
                <button className="text-sm bg-[#1E90FF] hover:bg-[#1a7de0] px-4 py-2 rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/20">
                  Login
                </button>
              </Link>
            </div>
          )}

          {/* Tab bar */}
          <div className="flex items-center gap-1 bg-[#0E1117] border border-white/5 rounded-2xl p-1">
            {(["Latest", "Popular", "Following"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab
                    ? "bg-white/8 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Posts */}
          <div className="space-y-4">
            {filteredPosts.length === 0 && (
              <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-10 text-center">
                <p className="text-gray-600 text-sm">
                  {activeTab === "Following"
                    ? currentUser
                      ? "You haven't posted anything yet."
                      : "Sign in to see posts from people you follow."
                    : "No posts yet. Be the first to share something!"}
                </p>
              </div>
            )}

            {filteredPosts.map((p) => {
              const liked = currentUser ? p.likes?.includes(currentUser.uid) : false;
              const isCommentsOpen = commentsOpenFor === p.id;

              return (
                <article
                  key={p.id}
                  className="bg-[#0E1117] border border-white/5 hover:border-white/10 rounded-2xl overflow-hidden transition-all duration-200"
                >
                  <div className="p-5">
                    {/* Author */}
                    <div className="flex items-start gap-3 mb-4">
                      <div
                        className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(p.authorId)} flex items-center justify-center text-sm font-bold flex-shrink-0`}
                      >
                        {getInitials(p.authorName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{p.authorName || "Anonymous"}</span>
                          {p.source && (
                            <span className="text-[10px] bg-[#1E90FF]/10 text-[#1E90FF] border border-[#1E90FF]/20 px-2 py-0.5 rounded-full">
                              {p.source}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{timeAgo(p.createdAt)}</p>
                      </div>
                    </div>

                    {p.title && <h4 className="font-bold text-base mb-2 leading-snug">{p.title}</h4>}
                    {p.image && (
                      <div className="rounded-xl overflow-hidden mb-3 border border-white/5">
                        <img src={p.image} alt="" className="w-full max-h-72 object-cover" />
                      </div>
                    )}
                    {p.content && (
                      <p className="text-gray-400 text-sm leading-relaxed">{p.content}</p>
                    )}
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-[#1E90FF] hover:underline mt-2"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Read original
                      </a>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 px-5 pb-4">
                    <button
                      onClick={() => toggleLike(p.id!, !!liked)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                        liked
                          ? "bg-[#1E90FF]/15 text-[#1E90FF] border border-[#1E90FF]/25"
                          : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/8 border border-transparent"
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${liked ? "fill-[#1E90FF]" : ""}`} />
                      {liked ? "Liked" : "Like"}
                      {!!p.likes?.length && (
                        <span className="text-gray-500">{p.likes.length}</span>
                      )}
                    </button>

                    <button
                      onClick={() => openComments(p.id!)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                        isCommentsOpen
                          ? "bg-white/8 text-white border border-white/10"
                          : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/8 border border-transparent"
                      }`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Comments
                      {!!postComments[p.id!]?.length && (
                        <span className="text-gray-500">{postComments[p.id!].length}</span>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.origin + "/feed?post=" + p.id);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 text-gray-400 hover:text-white hover:bg-white/8 border border-transparent transition-all ml-auto"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Share
                    </button>
                  </div>

                  {/* Comments panel */}
                  {isCommentsOpen && currentUser && (
                    <div className="border-t border-white/5 px-5 py-4 bg-[#080B10]/50">
                      {(postComments[p.id!] || []).length > 0 && (
                        <div className="space-y-3 mb-4 max-h-52 overflow-y-auto pr-1">
                          {(postComments[p.id!] || []).map((c: any) => (
                            <div key={c.id} className="flex gap-2.5">
                              <div
                                className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(c.userId)} flex items-center justify-center text-[10px] font-bold flex-shrink-0`}
                              >
                                {getInitials(c.username)}
                              </div>
                              <div className="flex-1 bg-white/5 rounded-xl px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-gray-300">{c.username}</span>
                                  <span className="text-[10px] text-gray-600">
                                    {c.createdAt?.seconds
                                      ? new Date(c.createdAt.seconds * 1000).toLocaleTimeString([], {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })
                                      : ""}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-400 mt-0.5">{c.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {(postComments[p.id!] || []).length === 0 && (
                        <p className="text-xs text-gray-600 mb-4">No comments yet. Be the first!</p>
                      )}

                      <div className="flex gap-2">
                        <div
                          className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(currentUser.uid)} flex items-center justify-center text-[10px] font-bold flex-shrink-0`}
                        >
                          {getInitials(currentUser.displayName || currentUser.email)}
                        </div>
                        <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2 focus-within:border-[#1E90FF]/30 transition-colors">
                          <input
                            ref={(el) => { if (p.id) commentInputs.current[p.id] = el; }}
                            placeholder="Write a comment…"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addComment(p.id!)}
                            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
                          />
                          <button
                            onClick={() => addComment(p.id!)}
                            disabled={!commentText.trim()}
                            className="text-[#1E90FF] disabled:opacity-30 hover:opacity-80 transition-opacity"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </main>

        {/* ── RIGHT SIDEBAR — Reddit only, no news ── */}
        <aside className="hidden lg:flex flex-col lg:col-span-3 gap-4">
          <div className="sticky top-20 space-y-4">

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#ff4500]/10 border border-[#ff4500]/20 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-[#ff4500]" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Tech on Reddit</h3>
                <p className="text-[10px] text-gray-600">Top posts from r/technology</p>
              </div>
            </div>

            <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-0.5">
              {/* Loading skeletons */}
              {loadingReddit &&
                [1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex gap-3 bg-[#0E1117] border border-white/5 rounded-2xl p-3 animate-pulse"
                  >
                    <div className="w-16 h-12 bg-white/5 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-white/5 rounded w-full" />
                      <div className="h-2.5 bg-white/5 rounded w-3/4" />
                      <div className="h-2 bg-white/5 rounded w-1/2" />
                    </div>
                  </div>
                ))}

              {/* Reddit posts */}
              {!loadingReddit && redditPosts.length === 0 && (
                <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-5 text-center">
                  <p className="text-xs text-gray-600">Could not load Reddit posts.</p>
                </div>
              )}

              {!loadingReddit &&
                redditPosts.map((r) => (
                  <a
                    key={r.id}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex gap-3 bg-[#0E1117] border border-white/5 hover:border-white/10 rounded-2xl p-3 group transition-all duration-200 cursor-pointer"
                  >
                    {r.image ? (
                      <img
                        src={r.image}
                        alt=""
                        className="w-16 h-12 object-cover rounded-lg flex-shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-12 bg-[#ff4500]/10 rounded-lg flex-shrink-0 flex items-center justify-center border border-[#ff4500]/15">
                        <span className="text-[10px] font-black text-[#ff4500]/60">r/</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold leading-snug text-gray-200 group-hover:text-white line-clamp-2 transition-colors">
                        {r.title}
                      </p>
                      <p className="text-[10px] text-gray-600 mt-1">
                        {r.subreddit ? `r/${r.subreddit}` : ""}
                        {r.author ? ` · by ${r.author}` : ""}
                        {r.score ? ` · ${r.score.toLocaleString()} pts` : ""}
                      </p>
                    </div>
                  </a>
                ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}