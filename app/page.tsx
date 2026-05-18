"use client";

import Link from "next/link";
import Image from "next/image";

// Replace these with your actual image imports
// import aicoding from "@/public/aicoding.png";
// import devops from "@/public/devops.png";
// import real from "@/public/real.png";
// import user from "@/public/user.png";
// import code from "@/public/code.png";
// import vision from "@/public/vision.png";

const projects = [
  {
    // img: aicoding,
    label: "AI",
    title: "AI Code Assistant",
    text: "An intelligent AI assistant that joins live sessions to help developers write cleaner code, debug errors, and explain logic in real time.",
    tag: "AI · Collaboration",
  },
  {
    // img: devops,
    label: "OPS",
    title: "DevOps Dashboard",
    text: "A comprehensive dashboard for monitoring CI/CD pipelines, deployment statuses, and team activity across all projects.",
    tag: "DevOps · Monitoring",
  },
  {
    // img: real,
    label: "</> ",
    title: "Real-time Code Editor",
    text: "Collaborate on code in real time with built-in version control, live previews, and permission-based codebase access.",
    tag: "Editor · Live",
  },
];

const howItWorks = [
  {
    // img: user,
    icon: "👥",
    step: "01",
    title: "Connect with Peers",
    text: "Create or join teams, add members, and start private chats. Build your network with developers worldwide.",
  },
  {
    // img: code,
    icon: "⚡",
    step: "02",
    title: "Build Together",
    text: "Launch live coding sessions, request codebase access, and bring in the AI assistant — all inside one call.",
  },
  {
    // img: vision,
    icon: "🚀",
    step: "03",
    title: "Share & Grow",
    text: "Post to the community feed, discover the latest tech updates, and showcase your projects to the world.",
  },
];

const testimonials = [
  {
    name: "Amara Osei",
    role: "Full-Stack Engineer",
    time: "2 hours ago",
    text: "The AI assistant in our team call helped us debug a gnarly race condition in under 10 minutes. DevConnect is on another level.",
    avatar: "AO",
    color: "from-blue-500 to-cyan-400",
  },
  {
    name: "João Martins",
    role: "Backend Developer",
    time: "5 hours ago",
    text: "Pair programming remotely used to be painful. With DevConnect's codebase access feature, it feels completely native now.",
    avatar: "JM",
    color: "from-violet-500 to-blue-400",
  },
  {
    name: "Priya Nair",
    role: "DevOps Engineer",
    time: "1 day ago",
    text: "The community feed keeps me updated with what engineers are actually building, not just what's trending on social media.",
    avatar: "PN",
    color: "from-cyan-500 to-teal-400",
  },
];

const stats = [
  { value: "12K+", label: "Developers" },
  { value: "3.4K+", label: "Teams Created" },
  { value: "98K+", label: "Live Sessions" },
  { value: "99.9%", label: "Uptime" },
];

export default function LandingPage() {
  return (
    <div className="bg-[#080B10] min-h-screen text-white font-sans overflow-x-hidden">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-12 py-4 border-b border-white/5 bg-[#080B10]/80 backdrop-blur-xl">
        <Link href="/">
          <span className="text-[#1E90FF] text-xl md:text-2xl font-black tracking-tight">
            Dev<span className="text-white">Connect</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-gray-400">
          <Link href="#features" className="hover:text-white transition-colors">Features</Link>
          <Link href="#how" className="hover:text-white transition-colors">How it Works</Link>
          <Link href="/feed" className="hover:text-white transition-colors">Community</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login">
            <button className="text-sm text-gray-300 hover:text-white px-4 py-2 transition-colors">
              Login
            </button>
          </Link>
          <Link href="/feed">
            <button className="text-sm bg-[#1E90FF] hover:bg-[#1a7de0] px-5 py-2.5 rounded-full font-semibold transition-all duration-200 shadow-lg shadow-blue-500/20">
              Get Started
            </button>
          </Link>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-32 px-6 text-center overflow-hidden">
        {/* Background glow blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-[#1E90FF]/10 rounded-full blur-[120px]" />
          <div className="absolute top-20 left-1/4 w-[300px] h-[300px] bg-violet-600/8 rounded-full blur-[100px]" />
          <div className="absolute top-10 right-1/4 w-[250px] h-[250px] bg-cyan-500/8 rounded-full blur-[100px]" />
        </div>

        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#1E90FF 1px, transparent 1px), linear-gradient(90deg, #1E90FF 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-gray-400 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Real-time collaboration · AI-powered · Now in beta
          </div>

          <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight">
            Where Developers
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1E90FF] via-cyan-400 to-[#1E90FF]">
              Build Together.
            </span>
          </h1>

          <p className="mt-6 text-gray-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            Teams. Live coding. AI assistant. Community feed.{" "}
            <span className="text-gray-300">Everything you need to collaborate,</span> debug, and
            ship faster — in one place.
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-12">
            <Link href="/feed">
              <button className="w-full sm:w-auto bg-[#1E90FF] hover:bg-[#1a7de0] px-10 py-4 rounded-full font-bold text-base transition-all duration-200 shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02]">
                Join the Community →
              </button>
            </Link>
            <Link href="/login">
              <button className="w-full sm:w-auto border border-white/10 bg-white/5 hover:bg-white/10 px-10 py-4 rounded-full font-semibold text-base text-gray-300 transition-all duration-200 hover:scale-[1.02]">
                Sign In
              </button>
            </Link>
          </div>

          {/* Stats row */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-2xl mx-auto">
            {stats.map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl md:text-3xl font-black text-white">{s.value}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURE PILLS ── */}
      <div className="flex flex-wrap justify-center gap-3 px-6 pb-16">
        {["Real-time Pair Programming", "AI Assistant in Calls", "Codebase Access Requests", "Community Feed", "Tech Updates", "Private Team Chat"].map(
          (f, i) => (
            <span
              key={i}
              className="border border-white/10 bg-white/5 text-gray-400 text-xs px-4 py-2 rounded-full"
            >
              {f}
            </span>
          )
        )}
      </div>

      {/* ── PROJECTS ── */}
      <section id="features" className="px-6 md:px-12 lg:px-20 pb-24">
        <div className="text-center mb-14">
          <p className="text-[#1E90FF] text-sm font-semibold uppercase tracking-widest mb-3">Built on DevConnect</p>
          <h2 className="text-3xl md:text-5xl font-black">Explore Top Projects</h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto">
            Discover what the community is shipping — from AI tools to real-time editors.
          </p>
        </div>

        <div className="grid gap-6 grid-cols-1 md:grid-cols-3 max-w-6xl mx-auto">
          {projects.map((item, index) => (
            <div
              key={index}
              className="group relative bg-[#0E1117] border border-white/5 hover:border-[#1E90FF]/30 rounded-2xl p-6 flex flex-col transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/10"
            >
              {/* Image placeholder — swap with <Image src={item.img} .../> when available */}
              <div className="w-full h-44 rounded-xl bg-gradient-to-br from-[#1E2128] to-[#0E1117] border border-white/5 flex items-center justify-center mb-5">
                <span className="text-4xl font-black text-[#1E90FF]/30 select-none">{item.label}</span>
              </div>

              <span className="text-[10px] font-semibold text-[#1E90FF] uppercase tracking-widest mb-2">
                {item.tag}
              </span>
              <h4 className="text-xl font-bold mb-2">{item.title}</h4>
              <p className="text-gray-500 text-sm leading-relaxed flex-1">{item.text}</p>

              <Link href="/feed">
                <button className="mt-6 w-full py-2.5 rounded-xl border border-white/8 bg-white/3 hover:bg-[#1E90FF]/10 hover:border-[#1E90FF]/30 text-[#1E90FF] text-sm font-semibold transition-all duration-200">
                  View Project
                </button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="px-6 md:px-12 lg:px-20 py-24 bg-[#0A0D13] border-y border-white/5">
        <div className="text-center mb-14">
          <p className="text-[#1E90FF] text-sm font-semibold uppercase tracking-widest mb-3">The Process</p>
          <h2 className="text-3xl md:text-5xl font-black">How DevConnect Works</h2>
          <p className="text-gray-500 mt-4 max-w-xl mx-auto">
            From first connection to shipping — your entire dev workflow, unified.
          </p>
        </div>

        <div className="grid gap-6 grid-cols-1 md:grid-cols-3 max-w-5xl mx-auto">
          {howItWorks.map((item, index) => (
            <div key={index} className="relative bg-[#0E1117] border border-white/5 rounded-2xl p-8 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#1E90FF]/10 border border-[#1E90FF]/20 flex items-center justify-center text-2xl mb-5">
                {item.icon}
              </div>
              <span className="absolute top-6 right-6 text-4xl font-black text-white/5 select-none">
                {item.step}
              </span>
              <h4 className="text-lg font-bold mb-3">{item.title}</h4>
              <p className="text-gray-500 text-sm leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>

        {/* Connector line */}
        <div className="hidden md:flex justify-center items-center gap-0 mt-[-140px] mb-[140px] pointer-events-none px-36 max-w-5xl mx-auto relative z-0">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#1E90FF]/20 to-transparent" />
        </div>
      </section>

      {/* ── AI ASSISTANT HIGHLIGHT ── */}
      <section className="px-6 md:px-12 lg:px-20 py-24">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-[#1E90FF] text-sm font-semibold uppercase tracking-widest mb-4">AI-Powered</p>
            <h2 className="text-3xl md:text-5xl font-black leading-tight">
              Your AI teammate,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1E90FF] to-cyan-400">
                always in the call.
              </span>
            </h2>
            <p className="text-gray-500 mt-5 leading-relaxed">
              Summon the AI assistant by name during any live session. Ask it to explain code,
              suggest fixes, generate ideas, or just think through problems together — without
              ever leaving the call.
            </p>
            <ul className="mt-8 space-y-3">
              {["Debug errors collaboratively", "Explain any code block on demand", "Generate implementation ideas", "Answer technical questions live"].map((f, i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-gray-400">
                  <span className="w-5 h-5 rounded-full bg-[#1E90FF]/15 border border-[#1E90FF]/30 flex items-center justify-center text-[#1E90FF] text-xs">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Mock AI chat UI */}
          <div className="bg-[#0E1117] border border-white/5 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 pb-4 border-b border-white/5">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm text-gray-400">AI Assistant · In Call</span>
            </div>
            {[
              { from: "user", msg: "Hey AI, why is this useEffect running twice?" },
              { from: "ai", msg: "In React 18 Strict Mode, effects intentionally run twice in development to help detect side effects. Your production build won't do this. Want me to show you how to handle cleanup properly?" },
              { from: "user", msg: "Yes please, show me." },
            ].map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    m.from === "user"
                      ? "bg-[#1E90FF] text-white rounded-br-sm"
                      : "bg-white/5 text-gray-300 rounded-bl-sm border border-white/8"
                  }`}
                >
                  {m.msg}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-2 border-t border-white/5">
              <div className="flex-1 bg-white/5 rounded-xl px-4 py-2.5 text-sm text-gray-600">
                Ask the AI anything...
              </div>
              <button className="w-9 h-9 rounded-xl bg-[#1E90FF] flex items-center justify-center text-sm">↑</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="px-6 md:px-12 lg:px-20 py-24 bg-[#0A0D13] border-y border-white/5">
        <div className="text-center mb-14">
          <p className="text-[#1E90FF] text-sm font-semibold uppercase tracking-widest mb-3">Community Love</p>
          <h2 className="text-3xl md:text-5xl font-black">What Developers Say</h2>
        </div>

        <div className="grid gap-6 grid-cols-1 md:grid-cols-3 max-w-6xl mx-auto">
          {testimonials.map((item, index) => (
            <div key={index} className="bg-[#0E1117] border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors duration-200">
              <p className="text-gray-400 text-sm leading-relaxed mb-6">"{item.text}"</p>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center text-xs font-bold text-white`}>
                  {item.avatar}
                </div>
                <div>
                  <p className="font-semibold text-sm">{item.name}</p>
                  <p className="text-gray-600 text-xs">{item.role} · {item.time}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <footer className="relative px-6 text-center py-32 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-[#1E90FF]/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] bg-violet-600/8 rounded-full blur-[80px]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          <p className="text-[#1E90FF] text-sm font-semibold uppercase tracking-widest mb-5">Join the Movement</p>
          <h2 className="text-4xl md:text-6xl font-black leading-tight">
            Ready to Build
            <br />
            Something Great?
          </h2>
          <p className="mt-5 text-gray-500 max-w-xl mx-auto leading-relaxed">
            Join DevConnect today — connect with developers, start collaborating in real time, and ship faster than ever.
          </p>
          <Link href="/feed">
            <button className="mt-10 bg-[#1E90FF] hover:bg-[#1a7de0] px-12 py-4 rounded-full font-bold text-base transition-all duration-200 shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02]">
              Join DevConnect — It's Free
            </button>
          </Link>
        </div>
      </footer>

      {/* ── FOOTER BAR ── */}
      <div className="border-t border-white/5 py-6 px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-600">
        <span>© 2025 DevConnect. All rights reserved.</span>
        <div className="flex gap-6">
          <Link href="#" className="hover:text-gray-400 transition-colors">Privacy</Link>
          <Link href="#" className="hover:text-gray-400 transition-colors">Terms</Link>
          <Link href="#" className="hover:text-gray-400 transition-colors">Contact</Link>
        </div>
      </div>
    </div>
  );
}