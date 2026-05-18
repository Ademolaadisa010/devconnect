import Link from "next/link";
import Image from "next/image";

import aicoding from "@/public/aicoding.png";
import devops from "@/public/devops.png";
import real from "@/public/real.png";
import user from "@/public/user.png";
import code from "@/public/code.png";
import vision from "@/public/vision.png";

export default function Landingpage() {
  return (
    <div className="bg-black w-full min-h-screen text-white">
      <header className="flex items-center justify-between px-5 md:px-10 py-4 border-b border-gray-800">
        <Link href="/">
          <h4 className="text-[#1E90FF] text-xl md:text-2xl font-bold">
            DevConnect
          </h4>
        </Link>

        <nav className="flex items-center gap-6">
          <Link href="/feed" className="text-white hover:text-[#1E90FF] transition">
            Join Community
          </Link>
          <Link href="/login" className="text-white hover:text-[#1E90FF] transition">
            Login
          </Link>
        </nav>
      </header>

      <section className="py-20 text-center px-6">
        <h1 className="text-4xl md:text-6xl font-extrabold">
          Connect. Build. Present.
        </h1>

        <p className="text-gray-400 mt-6 max-w-2xl mx-auto text-lg">
          DevConnect empowers developers to collaborate on innovative projects,
          share their work, and engage with a thriving global community.
        </p>

        <div className="flex justify-center items-center gap-5 mt-10">
          <Link href="/feed">
            <button className="bg-[#1E90FF] px-8 py-3 rounded-full font-medium hover:opacity-80 transition">
              Join Community
            </button>
          </Link>

          <Link href="/login">
            <button className="border border-gray-500 px-8 py-3 rounded-full font-medium text-[#1E90FF] hover:bg-gray-900 transition">
              Login
            </button>
          </Link>
        </div>
      </section>

      <h2 className="text-center text-3xl md:text-4xl font-bold mt-20 mb-12">
        Explore Top Projects
      </h2>

      <section className="grid gap-6 px-6 md:px-12 lg:px-20 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {[ 
          { img: aicoding, title: "AI Code Assistant", text: "An intelligent AI assistant designed to help developers write cleaner code with real-time debugging." },
          { img: devops, title: "DevOps Dashboard", text: "A comprehensive dashboard for monitoring CI/CD pipelines and deployment statuses." },
          { img: real, title: "Real-time Code Editor", text: "Collaborate on code in real time with built-in version control and live previews." }
        ].map((item, index) => (
          <div key={index} className="flex flex-col justify-between bg-[#1E2128] rounded-xl p-5">
            <Image src={item.img} alt="Project" className="rounded-lg" />
            <nav>
              <h4 className="mt-4 text-2xl font-bold">{item.title}</h4>
              <p className="text-gray-400 mt-2">{item.text}</p>

              <Link href="/feed">
                <button className="mt-5 bg-black w-full py-2 rounded-lg text-[#1E90FF] hover:bg-gray-900 transition">
                    View Project
                  </button>
              </Link>
            </nav>
            
          </div>
        ))}
      </section>
      <h2 className="text-center text-3xl md:text-4xl font-bold mt-28 mb-12">
        How DevConnect Works
      </h2>
      <section className="grid gap-6 px-6 md:px-12 lg:px-20 grid-cols-1 md:grid-cols-3">
        {[
          { img: user, title: "Connect with Peers", text: "Join communities, find collaborators, and expand your professional network." },
          { img: code, title: "Build Together", text: "Use shared tools and workspaces to co-create, debug, and innovate effortlessly." },
          { img: vision, title: "Present Your Vision", text: "Showcase your finished projects with live demos and gather feedback." }
        ].map((item, index) => (
          <div key={index} className="bg-[#1E2128] rounded-xl py-10 px-6 text-center flex flex-col items-center">
            <Image src={item.img} width={60} height={60} alt="Icon" />
            <h4 className="mt-4 text-2xl font-bold">{item.title}</h4>
            <p className="text-gray-400 mt-3">{item.text}</p>
          </div>
        ))}
      </section>

      <h2 className="text-center text-3xl md:text-4xl font-bold mt-28 mb-12">
        What Our Community Says
      </h2>

      <section className="grid gap-6 px-6 md:px-12 lg:px-20 grid-cols-1 md:grid-cols-3">
        {[ 
          { name: "Gentle Smith", time: "2 hours ago" },
          { name: "Jogh Mark", time: "5 hours ago" },
          { name: "Chris Kim", time: "1 day ago" }
        ].map((item, index) => (
          <div key={index} className="bg-[#1E2128] rounded-xl p-6">
            <div className="flex gap-4 items-center">
              <Image src={code} width={50} height={50} alt="Avatar" />
              <div>
                <p className="font-bold">{item.name}</p>
                <p className="text-gray-400 text-sm">{item.time}</p>
              </div>
            </div>

            <p className="mt-4 text-gray-300">
              Just finished refactoring my React app, feeling productive! Anyone else using Zustand for state management?
            </p>
          </div>
        ))}
      </section>

      <footer className="text-center mt-28 bg-[#A020F01A] py-20 px-6">
        <h1 className="text-3xl md:text-5xl font-bold max-w-3xl mx-auto">
          Ready to Elevate Your Developer Journey?
        </h1>

        <p className="mt-4 text-gray-400 max-w-2xl mx-auto">
          Join DevConnect today and start connecting, collaborating, and showcasing your work.
        </p>

        <Link href="/feed">
        <button className="bg-[#1E90FF] px-10 py-3 rounded-full mt-10 hover:opacity-80 transition">
          Join DevConnect Now
        </button>
        </Link>
      </footer>

      <p className="text-center py-6 text-gray-400 text-sm border-t border-gray-800 mt-10">
        © 2025 DevConnect. All rights reserved.
      </p>
    </div>
  );
}
