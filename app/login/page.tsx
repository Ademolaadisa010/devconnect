"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebase";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
} from "firebase/auth";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import Link from "next/link";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      await user.reload();

      if (!user.emailVerified) {
        setErr("Please verify your email (click link sent to your inbox).");
        setLoading(false);
        return;
      }

      router.push("/community-feed");
    } catch (error: any) {
      setErr(error.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  // OAuth login
  const handleOAuth = async (providerName: "google" | "github") => {
    setErr(null);
    setLoading(true);

    try {
      const provider =
        providerName === "google"
          ? new GoogleAuthProvider()
          : new GithubAuthProvider();

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!user) throw new Error("Failed to get user");

      // Ensure user exists in Firestore
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: user.displayName || "Anonymous",
          username: user.email?.split("@")[0] || "user" + user.uid.slice(0, 5),
          email: user.email || "",
          photoURL: user.photoURL || `https://i.pravatar.cc/150?u=${user.uid}`,
          createdAt: Timestamp.now(),
        });
      }

      router.push("/community-feed");
    } catch (e: any) {
      setErr(e.message || "OAuth login failed");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center pt-10 bg-black w-full min-h-screen px-4">
      <section className="flex flex-col items-center justify-center bg-[#1E2128] w-full max-w-md min-h-[85vh] border border-[#323743] rounded-2xl p-8 shadow-lg">
        <h1 className="text-[#1E90FF] font-bold text-3xl mb-8">DevConnect</h1>

        <form className="w-full flex flex-col gap-5" onSubmit={handleLogin}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="bg-[#323743] h-12 rounded-lg px-3 text-white outline-none border border-transparent focus:border-[#1E90FF]"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="bg-[#323743] h-12 rounded-lg px-3 text-white outline-none border border-transparent focus:border-[#1E90FF]"
          />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-[#1E90FF] h-12 font-bold text-white rounded-md w-full mt-2 disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="my-5 text-white text-sm">OR</p>

        <button
          onClick={() => handleOAuth("google")}
          className="w-full bg-black border border-gray-600 text-white h-12 rounded-lg mb-3 text-sm"
        >
          Continue with Google
        </button>

        <Link href="/register" className="text-gray-500">Doesn't have an account <b className="text-white">Sign Up</b></Link>

        <button
          onClick={() => handleOAuth("github")}
          className="w-full hidden bg-black border border-gray-600 text-white h-12 rounded-lg text-sm"
        >
          Continue with GitHub
        </button>
      </section>
    </div>
  );
}