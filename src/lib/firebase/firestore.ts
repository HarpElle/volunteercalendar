import {
  collection,
  doc,
  addDoc,
  setDoc,
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

/** Set a document with a specific ID (create or overwrite) */
export async function setDocument(collectionPath: string, docId: string, data: DocumentData) {
  return setDoc(doc(db, collectionPath, docId), data);
}

/** Get a single document by path */
export async function getDocument(path: string, docId: string) {
  const snap = await getDoc(doc(db, path, docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** Get all documents in a church subcollection */
export async function getChurchDocuments(
  churchId: string,
  subcollection: string,
  ...constraints: QueryConstraint[]
) {
  const ref = collection(db, "churches", churchId, subcollection);
  const q = constraints.length > 0 ? query(ref, ...constraints) : query(ref);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Update a church subcollection document */
export async function updateChurchDocument(
  churchId: string,
  subcollection: string,
  docId: string,
  data: Partial<DocumentData>,
) {
  return updateDoc(doc(db, "churches", churchId, subcollection, docId), data);
}

/** Delete a church subcollection document */
export async function removeChurchDocument(
  churchId: string,
  subcollection: string,
  docId: string,
) {
  return deleteDoc(doc(db, "churches", churchId, subcollection, docId));
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
