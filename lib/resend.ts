import { auth } from "./firebase";
import { sendEmailVerification } from "firebase/auth";

export const resendVerificationEmail = async () => {
  if (!auth.currentUser) return;

  try {
    await sendEmailVerification(auth.currentUser);
    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
};
