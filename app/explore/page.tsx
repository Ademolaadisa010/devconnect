"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  where,
  limit,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Search,
  TrendingUp,
  Users,
  Code2,
  Zap,
  Heart,
  MessageCircle,
  Hash,
  Globe,
  Star,
  Filter,
  X,
  ChevronRight,
  Flame,
  BookOpen,
  ExternalLink,
  UserPlus,
  UserCheck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Developer {
  uid: string;
  name?: string;
  username: string;
  email?: string;
  photoURL?: string;
  bio?: string;
  skills?: string[];
  github?: string;
  followers?: string[];
  following?: string[];
  postCount?: number;
  createdAt?: any;
}

interface Post {
  id: string;
  title?: string;
  content?: string;
  authorId?: string;
  authorName?: string;
  likes?: string[];
  createdAt?: any;
  tags?: string[];
  url?: string;
  image?: string;
}

interface Team {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerName?: string;
  members: string[];
  memberNames?: string[];
  tags?: string[];
  isPrivate?: boolean;
  createdAt?: any;
}

type Tab = "trending" | "developers" | "teams" | "posts";

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

const ALL_TAGS = [
  "React", "TypeScript", "Next.js", "Python", "Node.js",
  "Rust", "Go", "AI/ML", "DevOps", "Web3", "Mobile", "Backend",
];

// ─────────────────────────────────────────────────────────────────────────────
export default function ExplorePage() {
  const router = useRouter();
  const pathname = usePathname();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [redditPosts, setRedditPosts] = useState<any[]>([]);

  const [loadingDevs, setLoadingDevs] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingReddit, setLoadingReddit] = useState(true);

  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // ── Load developers ───────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingDevs(true);
    getDocs(collection(db, "users")).then((snap) => {
      const list: Developer[] = [];
      snap.forEach((d) => {
        if (d.id !== currentUser?.uid) {
          list.push({ uid: d.id, ...(d.data() as any) });
        }
      });
      // Sort by follower count descending
      list.sort((a, b) => (b.followers?.length ?? 0) - (a.followers?.length ?? 0));
      setDevelopers(list);

      // Build following map
      if (currentUser) {
        const map: Record<string, boolean> = {};
        list.forEach((dev) => {
          map[dev.uid] = dev.followers?.includes(currentUser.uid) ?? false;
        });
        setFollowingMap(map);
      }
      setLoadingDevs(false);
    });
  }, [currentUser]);

  // ── Load posts ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingPosts(true);
    const q = query(collection(db, "feedPosts"), orderBy("createdAt", "desc"), limit(30));
    const unsub = onSnapshot(q, (snap) => {
      const list: Post[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setPosts(list);
      setLoadingPosts(false);
    });
    return () => unsub();
  }, []);

  // ── Load teams ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingTeams(true);
    const q = query(
      collection(db, "teams"),
      where("isPrivate", "==", false),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: Team[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setTeams(list);
      setLoadingTeams(false);
    });
    return () => unsub();
  }, []);

  // ── Load trending Reddit ──────────────────────────────────────────────────
  useEffect(() => {
    setLoadingReddit(true);
    fetch("/api/reddit?subreddit=programming&limit=6&sort=hot")
      .then((r) => r.json())
      .then((d) => setRedditPosts(d.posts || []))
      .catch(console.error)
      .finally(() => setLoadingReddit(false));
  }, []);

  // ── Follow / Unfollow ────────────────────────────────────────────────────
  const toggleFollow = async (dev: Developer) => {
    if (!currentUser) { router.push("/login"); return; }
    setFollowLoading(dev.uid);
    const isFollowing = followingMap[dev.uid];
    const devRef = doc(db, "users", dev.uid);
    const meRef = doc(db, "users", currentUser.uid);
    try {
      if (isFollowing) {
        await updateDoc(devRef, { followers: arrayRemove(currentUser.uid) });
        await updateDoc(meRef, { following: arrayRemove(dev.uid) });
      } else {
        await updateDoc(devRef, { followers: arrayUnion(currentUser.uid) });
        await updateDoc(meRef, { following: arrayUnion(dev.uid) });
      }
      setFollowingMap((prev) => ({ ...prev, [dev.uid]: !isFollowing }));
    } catch (err) {
      console.error(err);
    } finally {
      setFollowLoading(null);
    }
  };

  // ── Like post ─────────────────────────────────────────────────────────────
  const toggleLike = async (post: Post) => {
    if (!currentUser) { router.push("/login"); return; }
    const liked = post.likes?.includes(currentUser.uid);
    const ref = doc(db, "feedPosts", post.id);
    if (liked) await updateDoc(ref, { likes: arrayRemove(currentUser.uid) });
    else await updateDoc(ref, { likes: arrayUnion(currentUser.uid) });
  };

  // ── Tag toggle ────────────────────────────────────────────────────────────
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // ── Filtered data ─────────────────────────────────────────────────────────
  const filteredDevelopers = developers.filter((d) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      d.username.toLowerCase().includes(q) ||
      d.name?.toLowerCase().includes(q) ||
      d.bio?.toLowerCase().includes(q) ||
      d.skills?.some((s) => s.toLowerCase().includes(q));
    const matchesTags =
      selectedTags.length === 0 ||
      selectedTags.some((tag) => d.skills?.some((s) => s.toLowerCase().includes(tag.toLowerCase())));
    return matchesSearch && matchesTags;
  });

  const filteredPosts = posts.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      p.title?.toLowerCase().includes(q) ||
      p.content?.toLowerCase().includes(q) ||
      p.authorName?.toLowerCase().includes(q)
    );
  });

  const filteredTeams = teams.filter((t) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(q));
    const matchesTags =
      selectedTags.length === 0 ||
      selectedTags.some((tag) =>
        t.tags?.some((tt) => tt.toLowerCase().includes(tag.toLowerCase()))
      );
    return matchesSearch && matchesTags;
  });

  // ── Popular posts (by likes) ──────────────────────────────────────────────
  const popularPosts = [...posts]
    .sort((a, b) => (b.likes?.length ?? 0) - (a.likes?.length ?? 0))
    .slice(0, 6);

  const navLinks = [
    { label: "Feed", href: "/feed" },
    { label: "Teams", href: "/teams" },
    { label: "Explore", href: "/explore" },
  ];

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "trending", label: "Trending", icon: <Flame className="w-3.5 h-3.5" /> },
    { id: "developers", label: "Developers", icon: <Users className="w-3.5 h-3.5" /> },
    { id: "teams", label: "Teams", icon: <Code2 className="w-3.5 h-3.5" /> },
    { id: "posts", label: "Posts", icon: <BookOpen className="w-3.5 h-3.5" /> },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080B10] text-white font-sans">

      {/* ── HEADER ── */}
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

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">

        {/* ── PAGE HEADER ── */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black mb-1">Explore</h1>
          <p className="text-gray-500 text-sm">Discover developers, teams, posts, and trending tech.</p>
        </div>

        {/* ── SEARCH + FILTER BAR ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            <input
              placeholder={`Search ${activeTab}…`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0E1117] border border-white/5 focus:border-[#1E90FF]/30 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              showFilters || selectedTags.length > 0
                ? "bg-[#1E90FF]/10 border-[#1E90FF]/30 text-[#1E90FF]"
                : "bg-[#0E1117] border-white/5 text-gray-400 hover:text-white"
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {selectedTags.length > 0 && (
              <span className="bg-[#1E90FF] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {selectedTags.length}
              </span>
            )}
          </button>
        </div>

        {/* ── TAG FILTERS ── */}
        {showFilters && (
          <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Filter by Tag</p>
              {selectedTags.length > 0 && (
                <button onClick={() => setSelectedTags([])} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                  Clear all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border transition-all ${
                    selectedTags.includes(tag)
                      ? "bg-[#1E90FF]/15 border-[#1E90FF]/30 text-[#1E90FF]"
                      : "bg-white/5 border-white/8 text-gray-400 hover:text-white hover:border-white/15"
                  }`}
                >
                  <Hash className="w-2.5 h-2.5" />
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── TABS ── */}
        <div className="flex items-center gap-1 bg-[#0E1117] border border-white/5 rounded-2xl p-1 mb-8 w-fit overflow-x-auto">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === id
                  ? "bg-[#1E90FF] text-white shadow-lg shadow-blue-500/20"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── TRENDING TAB ── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "trending" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left: popular posts */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Flame className="w-4 h-4 text-orange-400" />
                <h2 className="font-bold text-base">Most Liked Posts</h2>
              </div>

              {loadingPosts
                ? Array(3).fill(0).map((_, i) => <SkeletonPost key={i} />)
                : popularPosts.map((post) => {
                    const liked = currentUser ? post.likes?.includes(currentUser.uid) : false;
                    return (
                      <div key={post.id} className="bg-[#0E1117] border border-white/5 hover:border-white/10 rounded-2xl p-5 transition-all duration-200">
                        <div className="flex items-start gap-3 mb-3">
                          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(post.authorId)} flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                            {getInitials(post.authorName)}
                          </div>
                          <div>
                            <span className="font-semibold text-sm">{post.authorName || "Anonymous"}</span>
                            <p className="text-xs text-gray-600">{timeAgo(post.createdAt)}</p>
                          </div>
                        </div>
                        {post.title && <h3 className="font-bold text-sm mb-1">{post.title}</h3>}
                        {post.content && (
                          <p className="text-gray-400 text-sm leading-relaxed line-clamp-3">{post.content}</p>
                        )}
                        {post.image && (
                          <img src={post.image} alt="" className="w-full max-h-48 object-cover rounded-xl mt-3 border border-white/5" />
                        )}
                        <div className="flex items-center gap-3 mt-4">
                          <button
                            onClick={() => toggleLike(post)}
                            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all ${liked ? "bg-[#1E90FF]/15 text-[#1E90FF] border border-[#1E90FF]/25" : "bg-white/5 text-gray-500 hover:text-white border border-transparent"}`}
                          >
                            <Heart className={`w-3.5 h-3.5 ${liked ? "fill-[#1E90FF]" : ""}`} />
                            {post.likes?.length ?? 0}
                          </button>
                          <Link href="/feed">
                            <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-white/5 text-gray-500 hover:text-white border border-transparent transition-all">
                              <MessageCircle className="w-3.5 h-3.5" /> Comment
                            </button>
                          </Link>
                          {post.url && (
                            <a href={post.url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-xs text-[#1E90FF] hover:underline">
                              <ExternalLink className="w-3 h-3" /> Source
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
            </div>

            {/* Right: trending devs + reddit */}
            <div className="space-y-5">

              {/* Top developers */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-amber-400" />
                  <h2 className="font-bold text-base">Top Developers</h2>
                </div>
                <div className="space-y-2">
                  {loadingDevs
                    ? Array(4).fill(0).map((_, i) => <SkeletonDev key={i} compact />)
                    : developers.slice(0, 5).map((dev) => (
                        <div key={dev.uid} className="bg-[#0E1117] border border-white/5 rounded-xl p-3 flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(dev.uid)} flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden`}>
                            {dev.photoURL
                              ? <img src={dev.photoURL} alt="" className="w-9 h-9 object-cover" />
                              : getInitials(dev.username)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{dev.username}</p>
                            <p className="text-[10px] text-gray-600">{dev.followers?.length ?? 0} followers</p>
                          </div>
                          <button
                            onClick={() => toggleFollow(dev)}
                            disabled={followLoading === dev.uid}
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all flex-shrink-0 ${
                              followingMap[dev.uid]
                                ? "bg-white/5 text-gray-400 border border-white/8"
                                : "bg-[#1E90FF]/10 text-[#1E90FF] border border-[#1E90FF]/20"
                            }`}
                          >
                            {followingMap[dev.uid] ? "Following" : "Follow"}
                          </button>
                        </div>
                      ))}
                </div>
              </div>

              {/* Reddit trending */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-[#ff4500]" />
                  <h2 className="font-bold text-base">Trending on Reddit</h2>
                </div>
                <div className="space-y-2">
                  {loadingReddit
                    ? Array(4).fill(0).map((_, i) => <SkeletonReddit key={i} />)
                    : redditPosts.slice(0, 5).map((r) => (
                        <a
                          key={r.id}
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex gap-2.5 bg-[#0E1117] border border-white/5 hover:border-white/10 rounded-xl p-3 group transition-all"
                        >
                          {r.image ? (
                            <img src={r.image} alt="" className="w-12 h-10 object-cover rounded-lg flex-shrink-0" />
                          ) : (
                            <div className="w-12 h-10 bg-[#ff4500]/10 rounded-lg flex-shrink-0 flex items-center justify-center border border-[#ff4500]/15">
                              <span className="text-[9px] font-black text-[#ff4500]/60">r/</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold leading-snug text-gray-300 group-hover:text-white line-clamp-2 transition-colors">
                              {r.title}
                            </p>
                            <p className="text-[10px] text-gray-600 mt-0.5">
                              r/{r.subreddit} · {r.score?.toLocaleString()} pts
                            </p>
                          </div>
                        </a>
                      ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── DEVELOPERS TAB ── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "developers" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-600">
                {filteredDevelopers.length} developer{filteredDevelopers.length !== 1 ? "s" : ""} found
              </p>
            </div>

            {loadingDevs ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array(6).fill(0).map((_, i) => <SkeletonDev key={i} />)}
              </div>
            ) : filteredDevelopers.length === 0 ? (
              <EmptyState icon={<Users className="w-7 h-7 text-gray-600" />} title="No developers found" subtitle="Try a different search or remove some filters." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDevelopers.map((dev) => (
                  <div key={dev.uid} className="bg-[#0E1117] border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 hover:shadow-xl hover:shadow-black/20">
                    {/* Avatar + name */}
                    <div className="flex items-start gap-3">
                      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(dev.uid)} flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden`}>
                        {dev.photoURL
                          ? <img src={dev.photoURL} alt="" className="w-12 h-12 object-cover rounded-full" />
                          : getInitials(dev.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{dev.name || dev.username}</p>
                        <p className="text-xs text-gray-500 truncate">@{dev.username}</p>
                      </div>
                    </div>

                    {/* Bio */}
                    {dev.bio && (
                      <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">{dev.bio}</p>
                    )}

                    {/* Skills */}
                    {dev.skills && dev.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {dev.skills.slice(0, 4).map((skill) => (
                          <span key={skill} className="text-[10px] bg-white/5 border border-white/8 px-2 py-0.5 rounded-full text-gray-500 flex items-center gap-1">
                            <Hash className="w-2.5 h-2.5" />{skill}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-center">
                      <div>
                        <p className="text-sm font-bold">{dev.followers?.length ?? 0}</p>
                        <p className="text-[10px] text-gray-600">Followers</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold">{dev.following?.length ?? 0}</p>
                        <p className="text-[10px] text-gray-600">Following</p>
                      </div>
                    </div>

                    {/* Follow button */}
                    {currentUser && dev.uid !== currentUser.uid && (
                      <button
                        onClick={() => toggleFollow(dev)}
                        disabled={followLoading === dev.uid}
                        className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all ${
                          followingMap[dev.uid]
                            ? "bg-white/5 border border-white/8 text-gray-400 hover:border-red-500/30 hover:text-red-400"
                            : "bg-[#1E90FF]/10 border border-[#1E90FF]/20 text-[#1E90FF] hover:bg-[#1E90FF]/15"
                        }`}
                      >
                        {followingMap[dev.uid]
                          ? <><UserCheck className="w-4 h-4" /> Following</>
                          : <><UserPlus className="w-4 h-4" /> Follow</>}
                      </button>
                    )}

                    {dev.github && (
                      <a href={`https://github.com/${dev.github}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-xs text-gray-600 hover:text-gray-300 transition-colors">
                        <ExternalLink className="w-3 h-3" /> GitHub
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── TEAMS TAB ── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "teams" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-600">
                {filteredTeams.length} public team{filteredTeams.length !== 1 ? "s" : ""}
              </p>
              <Link href="/teams">
                <button className="flex items-center gap-1.5 text-xs text-[#1E90FF] hover:underline">
                  Manage teams <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </Link>
            </div>

            {loadingTeams ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array(6).fill(0).map((_, i) => <SkeletonTeam key={i} />)}
              </div>
            ) : filteredTeams.length === 0 ? (
              <EmptyState icon={<Code2 className="w-7 h-7 text-gray-600" />} title="No teams found" subtitle="Try a different search or remove some filters." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTeams.map((team) => (
                  <div key={team.id} className="bg-[#0E1117] border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 hover:shadow-xl hover:shadow-black/20">
                    <div className="flex items-start gap-3">
                      <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${getAvatarColor(team.id)} flex items-center justify-center text-sm font-black flex-shrink-0`}>
                        {getInitials(team.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm truncate">{team.name}</h3>
                          <Globe className="w-3 h-3 text-gray-600 flex-shrink-0" />
                        </div>
                        <p className="text-xs text-gray-600">by {team.ownerName || "Unknown"}</p>
                      </div>
                    </div>

                    {team.description && (
                      <p className="text-gray-500 text-xs leading-relaxed line-clamp-2">{team.description}</p>
                    )}

                    {team.tags && team.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {team.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="flex items-center gap-1 text-[10px] bg-white/5 border border-white/8 px-2 py-0.5 rounded-full text-gray-500">
                            <Hash className="w-2.5 h-2.5" />{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                      <div className="flex -space-x-1.5">
                        {(team.memberNames || []).slice(0, 4).map((name, i) => (
                          <div key={i} className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAvatarColor(team.members[i])} border-2 border-[#0E1117] flex items-center justify-center text-[8px] font-bold`}>
                            {getInitials(name)}
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-gray-600 flex-1">
                        {team.members?.length ?? 0} member{(team.members?.length ?? 0) !== 1 ? "s" : ""}
                      </span>
                      <Link href="/teams">
                        <button className="text-xs text-[#1E90FF] hover:underline flex items-center gap-1">
                          View <ChevronRight className="w-3 h-3" />
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── POSTS TAB ── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "posts" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-600">
                {filteredPosts.length} post{filteredPosts.length !== 1 ? "s" : ""}
              </p>
              <Link href="/feed">
                <button className="flex items-center gap-1.5 text-xs text-[#1E90FF] hover:underline">
                  Go to feed <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </Link>
            </div>

            {loadingPosts ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array(4).fill(0).map((_, i) => <SkeletonPost key={i} />)}
              </div>
            ) : filteredPosts.length === 0 ? (
              <EmptyState icon={<BookOpen className="w-7 h-7 text-gray-600" />} title="No posts found" subtitle="Try a different search term." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPosts.map((post) => {
                  const liked = currentUser ? post.likes?.includes(currentUser.uid) : false;
                  return (
                    <div key={post.id} className="bg-[#0E1117] border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(post.authorId)} flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                          {getInitials(post.authorName)}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{post.authorName || "Anonymous"}</p>
                          <p className="text-xs text-gray-600">{timeAgo(post.createdAt)}</p>
                        </div>
                      </div>

                      {post.title && <h3 className="font-bold text-sm">{post.title}</h3>}
                      {post.content && (
                        <p className="text-gray-400 text-xs leading-relaxed line-clamp-3">{post.content}</p>
                      )}
                      {post.image && (
                        <img src={post.image} alt="" className="w-full max-h-40 object-cover rounded-xl border border-white/5" />
                      )}

                      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                        <button
                          onClick={() => toggleLike(post)}
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all ${liked ? "bg-[#1E90FF]/15 text-[#1E90FF] border border-[#1E90FF]/25" : "bg-white/5 text-gray-500 hover:text-white border border-transparent"}`}
                        >
                          <Heart className={`w-3.5 h-3.5 ${liked ? "fill-[#1E90FF]" : ""}`} />
                          {post.likes?.length ?? 0}
                        </button>
                        <Link href="/feed">
                          <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-white/5 text-gray-500 hover:text-white border border-transparent transition-all">
                            <MessageCircle className="w-3.5 h-3.5" /> Comment
                          </button>
                        </Link>
                        {post.url && (
                          <a href={post.url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-xs text-[#1E90FF] hover:underline">
                            <ExternalLink className="w-3 h-3" /> Source
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Skeleton components ───────────────────────────────────────────────────────
function SkeletonPost() {
  return (
    <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-5 animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/5" />
        <div className="space-y-1.5 flex-1">
          <div className="h-2.5 bg-white/5 rounded w-1/3" />
          <div className="h-2 bg-white/5 rounded w-1/4" />
        </div>
      </div>
      <div className="h-3 bg-white/5 rounded w-3/4" />
      <div className="h-2 bg-white/5 rounded w-full" />
      <div className="h-2 bg-white/5 rounded w-4/5" />
    </div>
  );
}

function SkeletonDev({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="bg-[#0E1117] border border-white/5 rounded-xl p-3 flex items-center gap-3 animate-pulse">
        <div className="w-9 h-9 rounded-full bg-white/5 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 bg-white/5 rounded w-1/2" />
          <div className="h-2 bg-white/5 rounded w-1/3" />
        </div>
        <div className="w-16 h-6 bg-white/5 rounded-lg" />
      </div>
    );
  }
  return (
    <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-5 animate-pulse space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/5 rounded w-2/3" />
          <div className="h-2 bg-white/5 rounded w-1/2" />
        </div>
      </div>
      <div className="h-2 bg-white/5 rounded w-full" />
      <div className="h-2 bg-white/5 rounded w-4/5" />
    </div>
  );
}

function SkeletonTeam() {
  return (
    <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-5 animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/5 rounded w-2/3" />
          <div className="h-2 bg-white/5 rounded w-1/2" />
        </div>
      </div>
      <div className="h-2 bg-white/5 rounded w-full" />
    </div>
  );
}

function SkeletonReddit() {
  return (
    <div className="flex gap-2.5 bg-[#0E1117] border border-white/5 rounded-xl p-3 animate-pulse">
      <div className="w-12 h-10 bg-white/5 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-2.5 bg-white/5 rounded w-full" />
        <div className="h-2.5 bg-white/5 rounded w-3/4" />
        <div className="h-2 bg-white/5 rounded w-1/2" />
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{subtitle}</p>
    </div>
  );
}
