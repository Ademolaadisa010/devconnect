"use client";

import { useState, useEffect, useRef } from "react";
import { db, auth } from "../../lib/firebase";
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
} from "firebase/firestore";
import SideBar from "../sidebar/page";

interface Message {
  id: string;
  channelId: string;
  senderId: string;
  text: string;
  createdAt: any;
  username: string;
  avatar: string;
}

const DEFAULT_COMMUNITY_ID = "general";

const ChatPage = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [channel, setChannel] = useState<string>(DEFAULT_COMMUNITY_ID);
  const [currentChannelName, setCurrentChannelName] = useState<string>("General");
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (!user) return;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: user.displayName || "Anonymous",
          username: user.email?.split("@")[0] || "user" + user.uid.slice(0, 5),
          email: user.email || "",
          photoURL: user.photoURL || `https://i.pravatar.cc/150?u=${user.uid}`,
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

      setChannel(DEFAULT_COMMUNITY_ID);
      setCurrentChannelName("General");
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser || !channel) return;

    const q = query(
      collection(db, "messages"),
      where("channelId", "==", channel),
      orderBy("createdAt")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        msgs.push({
          id: doc.id,
          channelId: data.channelId,
          senderId: data.senderId,
          text: data.text,
          createdAt: data.createdAt,
          username: data.username || "Anonymous",
          avatar: data.avatar || `https://i.pravatar.cc/150?u=${data.senderId}`,
        });
      });
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [channel, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!channel) return;

    const fetchChannelName = async () => {
      const communityDoc = await getDoc(doc(db, "communities", channel));
      if (communityDoc.exists()) {
        setCurrentChannelName(communityDoc.data().name || "Unknown Community");
        return;
      }

      const dmDoc = await getDoc(doc(db, "directMessages", channel));
      if (dmDoc.exists()) {
        const members: string[] = dmDoc.data()?.members || [];
        const otherUserId = members.find((id) => id !== currentUser?.uid);
        if (otherUserId) {
          const userDoc = await getDoc(doc(db, "users", otherUserId));
          setCurrentChannelName(userDoc.exists() ? userDoc.data()?.username || "Unknown User" : "Unknown User");
        }
      }
    };

    fetchChannelName();
  }, [channel, currentUser]);

  const handleSend = async () => {
    if (!input.trim() || !currentUser || !channel) return;

    try {
      await addDoc(collection(db, "messages"), {
        channelId: channel,
        senderId: currentUser.uid,
        username: currentUser.displayName || "Anonymous",
        avatar: currentUser.photoURL || `https://i.pravatar.cc/150?u=${currentUser.uid}`,
        text: input,
        createdAt: serverTimestamp(),
      });
      setInput("");
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  return (
    <div className="flex h-screen">
      <SideBar setChannel={setChannel} activeChannel={channel} />

      <main className="flex-1 flex flex-col md:ml-[20%] bg-[#0E0F12]">
        <header className="h-16 border-b border-[#2A2D35] flex items-center px-4 md:px-6">
          <h2 className="text-white text-xl font-semibold">{currentChannelName}</h2>
        </header>

        <section className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 bg-[#121418] scrollbar-hide">
          {messages.length === 0 && (
            <p className="text-gray-500 text-center mt-10">No messages yet</p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-3">
              <img src={msg.avatar} alt="" className="w-10 h-10 rounded-full" />
              <div>
                <p className="text-white font-semibold">
                  {msg.username}{" "}
                  <span className="text-gray-400 text-xs">
                    {msg.createdAt?.seconds
                      ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString()
                      : ""}
                  </span>
                </p>
                <p className="text-gray-300 mt-1 break-words">{msg.text}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </section>

        <footer className="h-20 border-t border-[#2A2D35] px-4 md:px-6 flex items-center">
          <input
            type="text"
            placeholder={channel ? `Message #${currentChannelName}` : "Select a community first"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={!channel}
            className="w-full bg-[#1E2128] h-12 rounded-lg px-4 text-white outline-none border border-[#2A2D35] focus:border-[#1E90FF] disabled:opacity-60"
          />
        </footer>
      </main>
    </div>
  );
};

export default ChatPage;
