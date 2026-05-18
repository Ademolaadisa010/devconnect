"use client";

import { useState, useEffect } from "react";
import { auth, db, storage } from "../../lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged, updateProfile } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function Profile() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUsername(data.username || "");
          setName(data.name || "");
          setPhotoURL(data.photoURL || null);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleUpdateProfile = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      // Update Firestore
      await updateDoc(doc(db, "users", currentUser.uid), { name, username, photoURL });
      // Update Firebase Auth
      await updateProfile(currentUser, { displayName: username, photoURL: photoURL || undefined });

      // Refetch to ensure state updates immediately
      const updatedDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (updatedDoc.exists()) {
        const data = updatedDoc.data();
        setUsername(data.username || "");
        setName(data.name || "");
        setPhotoURL(data.photoURL || null);
      }

      alert("Profile updated successfully!");
    } catch (err) {
      console.error("Failed to update profile:", err);
      alert("Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentUser || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const storageRef = ref(storage, `profilePictures/${currentUser.uid}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    setPhotoURL(url);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#1E2128] p-4">
      <h1 className="text-white text-2xl mb-4">Your Profile</h1>

      <div className="flex flex-col gap-4 w-full max-w-md">
        <div className="flex flex-col items-center">
          {photoURL ? (
            <img src={photoURL} className="w-24 h-24 rounded-full mb-2" alt="Profile" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gray-600 mb-2 flex items-center justify-center text-white">
              No Photo
            </div>
          )}
          <input type="file" onChange={handleUploadPhoto} className="text-white" />
        </div>

        <input
          type="text"
          placeholder="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 rounded bg-[#323743] text-white outline-none border border-gray-600 focus:border-[#1E90FF]"
        />

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 rounded bg-[#323743] text-white outline-none border border-gray-600 focus:border-[#1E90FF]"
        />

        <button
          onClick={handleUpdateProfile}
          disabled={loading}
          className="bg-[#1E90FF] py-2 rounded text-white font-semibold disabled:opacity-60"
        >
          {loading ? "Updating..." : "Update Profile"}
        </button>

        <button
          onClick={() => router.push("/chat")}
          className="mt-2 bg-gray-700 py-2 rounded text-white font-semibold"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
