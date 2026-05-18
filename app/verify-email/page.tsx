"use client";

import { useEffect, useState } from "react";
import { auth } from "../../lib/firebase";
import { sendEmailVerification } from "firebase/auth";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState("Waiting for verification...");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      const user = auth.currentUser;
      if (!user) {
        setStatus("No active session. Please sign in or return after verifying your email.");
        return;
      }
      await user.reload();
      if (user.emailVerified) {
        setStatus("Email verified! Redirecting...");
        setTimeout(() => (window.location.href = "/dashboard"), 1200);
      } else {
        setStatus("Email not verified yet. Check your inbox for verification link.");
      }
    };

    check();
  }, []);

  const resend = async () => {
    setErr(null);
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No authenticated user. Please log in first.");
      await sendEmailVerification(user);
      setStatus("Verification email resent. Check your inbox.");
    } catch (e: any) {
      setErr(e.message || "Failed to resend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center bg-black w-full min-h-screen px-4">
      <section className="bg-[#1E2128] w-full max-w-md min-h-[50vh] border border-[#323743] rounded-2xl p-8 shadow-lg text-center">
        {/* <h1 className="text-[#1E90FF] text-2xl font-bold mb-4">Verify Your Email</h1> */}
        <p className="text-[#1E90FF] text-xl font-bold mb-4">Check Your Spam Folder to Verify Your Email</p>
        <p className="text-white mb-4">{status} </p>

        {err && <p className="text-red-400 text-sm mb-3">{err}</p>}

        <div className="flex flex-col gap-3 max-w-xs mx-auto">
          <button
            onClick={resend}
            disabled={loading}
            className="bg-[#1E90FF] w-full py-3 rounded-md text-white font-medium disabled:opacity-60"
          >
            {loading ? "Resending..." : "Resend Verification Email"}
          </button>

          <button
            onClick={() => {
              const user = auth.currentUser;
              if (user) {
                user.reload().then(() => {
                  if (auth.currentUser?.emailVerified) {
                    window.location.href = "/chat";
                  } else {
                    setStatus("Still not verified. Check your email.");
                  }
                });
              } else {
                window.location.href = "/login";
              }
            }}
            className="bg-black border border-gray-600 w-full py-3 rounded-md text-white font-medium"
          >
            I clicked the link — check status
          </button>
        </div>
      </section>
    </div>
  );
}
