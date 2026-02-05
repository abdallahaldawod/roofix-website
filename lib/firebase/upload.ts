/**
 * Upload a file to Firebase Storage and return its public URL.
 * Use path prefix "content/" to match storage.rules (read: all, write: auth).
 * Requires the user to be signed in. Deploy rules: firebase deploy --only storage
 */

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirebaseAuth, getFirebaseStorage } from "@/lib/firebase/client";

const CONTENT_PREFIX = "content";

export async function uploadImage(
  file: File,
  folder: string,
  name?: string
): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) {
    throw new Error("You must be signed in to upload images. Log in at /control-centre.");
  }
  const storage = getFirebaseStorage();
  const safeName = name ?? `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const path = `${CONTENT_PREFIX}/${folder}/${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}
