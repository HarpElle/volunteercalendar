import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const { collectionGroup, query, where, getDocs, getFirestore } = await import("firebase/firestore");
    const { initializeApp, getApps, getApp } = await import("firebase/app");

    const app = getApps().length === 0
      ? initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        })
      : getApp();
    const db = getFirestore(app);

    const q = query(
      collectionGroup(db, "assignments"),
      where("confirmation_token", "==", token),
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const assignDoc = snap.docs[0];
    const data = assignDoc.data() as Record<string, unknown>;

    // Fetch volunteer name, service name, ministry name for the confirmation page
    const { doc, getDoc } = await import("firebase/firestore");
    const churchId = data.church_id as string;

    const [volSnap, svcSnap, minSnap] = await Promise.all([
      getDoc(doc(db, "churches", churchId, "volunteers", data.volunteer_id as string)),
      getDoc(doc(db, "churches", churchId, "services", data.service_id as string)),
      getDoc(doc(db, "churches", churchId, "ministries", data.ministry_id as string)),
    ]);

    // Fetch church name
    const churchSnap = await getDoc(doc(db, "churches", churchId));

    return NextResponse.json({
      assignment: {
        id: assignDoc.id,
        status: data.status,
        service_date: data.service_date,
        role_title: data.role_title,
        responded_at: data.responded_at,
      },
      volunteer_name: volSnap.exists() ? volSnap.data()?.name : "Volunteer",
      service_name: svcSnap.exists() ? svcSnap.data()?.name : "Service",
      ministry_name: minSnap.exists() ? minSnap.data()?.name : "Ministry",
      church_name: churchSnap.exists() ? churchSnap.data()?.name : "Church",
    });
  } catch (error) {
    console.error("Confirm lookup error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, action } = body;

    if (!token || !action) {
      return NextResponse.json({ error: "Missing token or action" }, { status: 400 });
    }

    if (action !== "confirm" && action !== "decline") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { collectionGroup, query, where, getDocs, updateDoc, getFirestore } = await import("firebase/firestore");
    const { initializeApp, getApps, getApp } = await import("firebase/app");

    const app = getApps().length === 0
      ? initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        })
      : getApp();
    const db = getFirestore(app);

    const q = query(
      collectionGroup(db, "assignments"),
      where("confirmation_token", "==", token),
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const assignDoc = snap.docs[0];
    const current = assignDoc.data();

    // Don't allow re-responding if already responded
    if (current.responded_at) {
      return NextResponse.json({
        error: "Already responded",
        status: current.status,
      }, { status: 409 });
    }

    const newStatus = action === "confirm" ? "confirmed" : "declined";
    await updateDoc(assignDoc.ref, {
      status: newStatus,
      responded_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error("Confirm action error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
