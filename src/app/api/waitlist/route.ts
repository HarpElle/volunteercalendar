import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/utils/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(request, { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await request.json();

    const { name, email, church_name, team_size, current_tool, workflow_preference, phone } = body;

    // Validate required fields
    if (!name || !email || !church_name || !current_tool || !workflow_preference) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }

    // Import Firebase dynamically to avoid client-side bundle issues
    const { collection, addDoc, getFirestore } = await import("firebase/firestore");
    const { initializeApp, getApps, getApp } = await import("firebase/app");

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const db = getFirestore(app);

    await addDoc(collection(db, "waitlist"), {
      name,
      email,
      church_name,
      team_size: team_size || 0,
      current_tool,
      workflow_preference,
      phone: phone || null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Waitlist submission error:", error);
    return NextResponse.json(
      { error: "Failed to save submission" },
      { status: 500 },
    );
  }
}
