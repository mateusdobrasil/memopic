import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type WorkerMatch = {
  photo_id: string;
  event_id: string;
  preview_path: string;
  price_cents: number;
  best_distance: number;
};

type WorkerSearchResponse = {
  ok: boolean;
  matches: WorkerMatch[];
  embedding?: string;
  message?: string;
};

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

  const incomingForm = await request.formData();
  const file = incomingForm.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "missing file" },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileBytes = Buffer.from(arrayBuffer);

  const workerForm = new FormData();
  workerForm.append(
    "file",
    new Blob([fileBytes], { type: file.type || "image/jpeg" }),
    file.name || "selfie.jpg",
  );

  const workerRes = await fetch(`${process.env.WORKER_URL}/search`, {
    method: "POST",
    headers: { "X-Worker-Secret": process.env.WORKER_SECRET! },
    body: workerForm,
  });

  if (!workerRes.ok) {
    return NextResponse.json(
      { ok: false, error: `worker error: ${workerRes.status}` },
      { status: 502 },
    );
  }

  const result = (await workerRes.json()) as WorkerSearchResponse;

  if (result.ok && result.embedding) {
    const ext = (file.type?.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const selfiePath = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("selfies")
      .upload(selfiePath, fileBytes, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (!uploadError) {
      await supabase.from("customer_faces").insert({
        customer_id: user.id,
        embedding: result.embedding,
        selfie_path: selfiePath,
        is_primary: true,
      });
    }
    // Falha ao salvar a selfie não derruba a resposta da busca.
  }

  return NextResponse.json(result);
}
