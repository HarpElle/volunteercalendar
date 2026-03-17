import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "./config";

/** Get a reference to a top-level collection */
export function getCollection(path: string) {
  return collection(db, path);
}

/** Get a reference to a church subcollection: churches/{churchId}/{subcollection} */
export function getChurchCollection(churchId: string, subcollection: string) {
  return collection(db, "churches", churchId, subcollection);
}

/** Add a document to a collection */
export async function addDocument(collectionPath: string, data: DocumentData) {
  const ref = collection(db, collectionPath);
  return addDoc(ref, data);
}

/** Add a document to a church subcollection */
export async function addChurchDocument(
  churchId: string,
  subcollection: string,
  data: DocumentData,
) {
  const ref = collection(db, "churches", churchId, subcollection);
  return addDoc(ref, data);
}

/** Get a single document by path */
export async function getDocument(path: string, docId: string) {
  const snap = await getDoc(doc(db, path, docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** Query documents with constraints */
export async function queryDocuments(
  collectionPath: string,
  ...constraints: QueryConstraint[]
) {
  const q = query(collection(db, collectionPath), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Update a document */
export async function updateDocument(
  path: string,
  docId: string,
  data: Partial<DocumentData>,
) {
  return updateDoc(doc(db, path, docId), data);
}

/** Delete a document */
export async function removeDocument(path: string, docId: string) {
  return deleteDoc(doc(db, path, docId));
}

export { where, orderBy, limit };
