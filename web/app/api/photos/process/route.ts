import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json()) as { photoId?: string };
  const photoId = body.photoId;
  if (!photoId) {
    return NextResponse.json(
      { ok: false, error: "missing photoId" },
      { status: 400 },
    );
  }

  // RLS garante que só o dono ou admin enxerga a foto.
  const { data: photo } = await supabase
    .from("photos")
    .select("id")
    .eq("id", photoId)
    .single();
  if (!photo) {
    return NextResponse.json(
      { ok: false, error: "not found" },
      { status: 404 },
    );
  }

  const workerRes = await fetch(`${process.env.WORKER_URL}/process-photo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Secret": process.env.WORKER_SECRET!,
    },
    body: JSON.stringify({ photo_id: photoId }),
  });

  if (!workerRes.ok) {
    return NextResponse.json(
      { ok: false, error: `worker error: ${workerRes.status}` },
      { status: 502 },
    );
  }

  const { data: updated } = await supabase
    .from("photos")
    .select("id, status, preview_path, faces_count, width, height")
    .eq("id", photoId)
    .single();

  return NextResponse.json({ ok: true, photo: updated });
}
