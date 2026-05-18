"use client";

import { useState, useEffect } from "react";
import { db, auth } from "../../lib/firebase";
import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  addDoc,
  updateDoc,
  arrayUnion,
  Timestamp,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import Link from "next/link";

interface SideBarProps {
  setChannel: (channelId: string) => void;
  activeChannel?: string;
}

interface Community {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
}

interface User {
  id: string;
  name: string;
  username: string;
  photoURL?: string;
  email: string;
}

interface DirectMessage {
  id: string;
  members: string[];
}

// Default community
const DEFAULT_COMMUNITY_ID = "general";

const SideBar = ({ setChannel, activeChannel }: SideBarProps) => {
  const router = useRouter();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [usersMap, setUsersMap] = useState<{ [id: string]: User }>({});
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<{ [channelId: string]: number }>({});
  const [newCommunityName, setNewCommunityName] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [dmUsername, setDmUsername] = useState<string>("");


  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      setCurrentUser(user);

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      const generatedUsername =
        user.displayName?.replace(/\s+/g, "").toLowerCase() ||
        user.email?.split("@")[0] ||
        "user" + user.uid.slice(0, 5);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: user.displayName || "No Name",
          username: generatedUsername,
          email: user.email || "",
          photoURL: user.photoURL || `https://i.pravatar.cc/150?u=${user.uid}`,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }

      const generalRef = doc(db, "communities", DEFAULT_COMMUNITY_ID);
      const generalSnap = await getDoc(generalRef);

      if (!generalSnap.exists()) {
        await setDoc(generalRef, {
          name: "General",
          createdBy: user.uid,
          members: [user.uid],
          createdAt: Timestamp.now(),
        });
      } else {
        const members = generalSnap.data().members || [];
        if (!members.includes(user.uid)) {
          await updateDoc(generalRef, { members: arrayUnion(user.uid) });
        }
      }

      if (!activeChannel) setChannel(DEFAULT_COMMUNITY_ID);
    });

    return () => unsubscribe();
  }, [activeChannel, setChannel]);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, "communities"),
      where("members", "array-contains", currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCommunities(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name,
          createdBy: doc.data().createdBy,
          members: doc.data().members || [],
        }))
      );
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      const map: any = {};
      snap.docs.forEach((d) => (map[d.id] = { id: d.id, ...d.data() }));
      setUsersMap(map);
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const dmQuery = query(
      collection(db, "directMessages"),
      where("members", "array-contains", currentUser.uid)
    );

    const unsub = onSnapshot(dmQuery, (snap) => {
      setDirectMessages(snap.docs.map((d) => ({ id: d.id, members: d.data().members })));
    });

    return () => unsub();
  }, [currentUser]);

  const handleStartDM = async () => {
  if (!currentUser || !dmUsername.trim()) return;

  const q = query(collection(db, "users"), where("username", "==", dmUsername.trim()));
  const snap = await getDocs(q);

  if (snap.empty) return alert("User not found!");

  const otherUserId = snap.docs[0].id;

  if (otherUserId === currentUser.uid) return alert("You cannot DM yourself.");

  const dmRef = collection(db, "directMessages");
  const dmSnap = await getDocs(
    query(dmRef, where("members", "array-contains", currentUser.uid))
  );

  let dmId: string | null = null;

  dmSnap.docs.forEach((d) => {
    const members = d.data().members || [];
    if (members.includes(otherUserId)) dmId = d.id;
  });

  if (!dmId) {
    const docRef = await addDoc(dmRef, {
      members: [currentUser.uid, otherUserId],
      createdAt: Timestamp.now(),
    });
    dmId = docRef.id;
  }

  setChannel(dmId);   
  setDmUsername("");
  setMobileOpen(false);
};


  const createCommunity = async () => {
    if (!currentUser || !newCommunityName.trim()) return;

    const name = newCommunityName.trim();

    const existsCheck = await getDocs(
      query(collection(db, "communities"), where("name", "==", name))
    );
    if (!existsCheck.empty) return alert("Community already exists.");

    const docRef = await addDoc(collection(db, "communities"), {
      name,
      createdBy: currentUser.uid,
      members: [currentUser.uid],
      createdAt: Timestamp.now(),
    });

    setChannel(docRef.id);
    setNewCommunityName("");
    setMobileOpen(false);
  };

  const handleInviteUser = async (communityId: string) => {
    if (!inviteUsername.trim()) return alert("Enter a username!");

    const q = query(collection(db, "users"), where("username", "==", inviteUsername.trim()));
    const snap = await getDocs(q);

    if (snap.empty) return alert("User not found.");
    const userId = snap.docs[0].id;

    const communityRef = doc(db, "communities", communityId);
    await updateDoc(communityRef, { members: arrayUnion(userId) });

    alert("User added!");
    setInviteUsername("");
  };

  const handleChannelClick = (id: string) => {
    setChannel(id);
    setUnreadCounts((prev) => ({ ...prev, [id]: 0 }));
    setMobileOpen(false);
  };

  return (
    <>
      <div className="md:hidden bg-[#1E2128] p-2 text-white">
        <Menu className="w-7 h-7" onClick={() => setMobileOpen(true)} />
      </div>

      <aside
        className={`fixed top-0 left-0 h-screen bg-[#1E2128] text-white z-40
          overflow-y-auto transition-all duration-300
          w-[80%] sm:w-[60%] md:w-[20%]
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <div className="md:hidden flex justify-end p-4">
          <X className="w-7 h-7" onClick={() => setMobileOpen(false)} />
        </div>

        <div className="px-4">
          <h1 className="font-bold text-xl mb-4">DevConnect</h1>

          <p className="text-gray-400 mb-2">Your Communities</p>

          {communities.map((c) => (
            <div key={c.id} className="mb-4">
              <button
                onClick={() => handleChannelClick(c.id)}
                className="block w-full text-left px-2 py-2 hover:bg-gray-700 rounded"
              >
                #{c.name}
              </button>

              <div className="ml-4 text-gray-300">
                <p className="text-gray-400 text-sm">Members:</p>
                {c.members.map((uid) => (
                  <p key={uid} className="text-sm">
                    @{usersMap[uid]?.username}
                  </p>
                ))}
              </div>

              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="Invite username"
                  className="flex-1 bg-[#323743] text-white rounded px-2 py-1"
                />
                <button
                  onClick={() => handleInviteUser(c.id)}
                  className="bg-[#1E90FF] px-3 rounded"
                >
                  +
                </button>
              </div>
            </div>
          ))}

          <div className="flex gap-2 mt-4">
            <input
              type="text"
              value={newCommunityName}
              onChange={(e) => setNewCommunityName(e.target.value)}
              placeholder="New community"
              className="flex-1 bg-[#323743] text-white rounded px-2 py-1"
            />
            <button onClick={createCommunity} className="bg-[#1E90FF] px-3 rounded">
              +
            </button>
          </div>

          <p className="text-gray-400 mt-6 mb-2">Direct Messages</p>

          {directMessages.map((dm) => {
            const otherUserId = dm.members.find((id) => id !== currentUser?.uid);
            const other = otherUserId ? usersMap[otherUserId] : null;
            if (!other) return null;

            return (
              <button
                key={dm.id}
                onClick={() => handleChannelClick(dm.id)}
                className="flex items-center gap-2 px-2 py-2 hover:bg-gray-700 rounded w-full text-left"
              >
                <img
                  src={other.photoURL}
                  className="w-6 h-6 rounded-full"
                  alt=""
                />
                @{other.username}
              </button>
            );
          })}

          <div className="flex gap-2 mt-3">
            <input
              type="text"
              value={dmUsername}
              onChange={(e) => setDmUsername(e.target.value)}
              placeholder="Username to DM"
              className="flex-1 bg-[#323743] text-white rounded px-2 py-1"
            />
            <button onClick={handleStartDM} className="bg-[#1E90FF] px-3 rounded">
              DM
            </button>
          </div>
        </div>

        <div className="mt-6 px-4 mb-6">
          <button
            onClick={() => {
              router.push("/profile");
              setMobileOpen(false);
            }}
            className="block w-full px-4 py-2 hover:bg-gray-700 rounded"
          >
            Profile
          </button>
          <Link href="/">
          <button
            className="block w-full px-4 py-2 hover:bg-gray-700 rounded"
          >
            Logout
          </button>
          </Link>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        ></div>
      )}
    </>
  );
};

export default SideBar;
