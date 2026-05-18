import { db, auth } from "../../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export async function sendMessage(channelId: string, text: string) {
  if (!auth.currentUser) return;

  await addDoc(collection(db, "messages"), {
    channelId,
    senderId: auth.currentUser.uid,
    text,
    createdAt: serverTimestamp(),
    username: auth.currentUser.displayName || "Anonymous",
    avatar: auth.currentUser.photoURL || `https://i.pravatar.cc/300?u=${auth.currentUser.uid}`
  });
}