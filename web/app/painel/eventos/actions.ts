"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createEvent(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Nome do evento é obrigatório");

  const { data, error } = await supabase
    .from("events")
    .insert({
      photographer_id: user.id,
      name,
      description: (formData.get("description") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      event_date: (formData.get("event_date") as string) || null,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;

  redirect(`/painel/eventos/${data.id}`);
}

export async function updateEvent(eventId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = (formData.get("name") as string)?.trim();
  if (!name) throw new Error("Nome do evento é obrigatório");

  const status = formData.get("status") as string;

  const { error } = await supabase
    .from("events")
    .update({
      name,
      description: (formData.get("description") as string)?.trim() || null,
      city: (formData.get("city") as string)?.trim() || null,
      event_date: (formData.get("event_date") as string) || null,
      status,
    })
    .eq("id", eventId);
  if (error) throw error;

  revalidatePath(`/painel/eventos/${eventId}`);
  revalidatePath("/painel");
}

export async function updatePhotoPrice(photoId: string, priceCents: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { error } = await supabase
    .from("photos")
    .update({ price_cents: priceCents })
    .eq("id", photoId);
  if (error) throw error;
}

type SupabaseSession = Awaited<ReturnType<typeof createClient>>;
type SupabaseAdmin = ReturnType<typeof createAdminClient>;

// Tenta apagar a linha de `photos` (e os arquivos no storage). Se a foto já
// foi vendida, `order_items.photo_id` (FK on delete restrict) bloqueia o
// delete com 23503 — nesse caso, oculta da busca em vez de remover, pra não
// quebrar a entrega via /pedidos.
async function deletePhotoRow(
  supabase: SupabaseSession,
  admin: SupabaseAdmin,
  photo: { id: string; storage_path: string; preview_path: string | null },
): Promise<"deleted" | "hidden"> {
  const { error } = await supabase.from("photos").delete().eq("id", photo.id);

  if (error) {
    if (error.code === "23503") {
      const { error: hideError } = await supabase
        .from("photos")
        .update({ status: "hidden" })
        .eq("id", photo.id);
      if (hideError) throw hideError;
      return "hidden";
    }
    throw error;
  }

  await admin.storage.from("originals").remove([photo.storage_path]);
  if (photo.preview_path) {
    await admin.storage.from("previews").remove([photo.preview_path]);
  }
  return "deleted";
}

export async function deletePhoto(
  photoId: string,
): Promise<{ status: "deleted" | "hidden" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { data: photo, error: fetchErr } = await supabase
    .from("photos")
    .select("id, event_id, storage_path, preview_path")
    .eq("id", photoId)
    .single();
  if (fetchErr || !photo) throw new Error("Foto não encontrada");

  const status = await deletePhotoRow(supabase, createAdminClient(), photo);

  revalidatePath(`/painel/eventos/${photo.event_id}`);
  return { status };
}

export async function deleteEvent(
  eventId: string,
): Promise<{ status: "deleted" | "archived" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("not authorized");

  const { data: photos, error: photosErr } = await supabase
    .from("photos")
    .select("id, storage_path, preview_path")
    .eq("event_id", eventId);
  if (photosErr) throw photosErr;

  const admin = createAdminClient();
  let anyHidden = false;
  for (const photo of photos ?? []) {
    const status = await deletePhotoRow(supabase, admin, photo);
    if (status === "hidden") anyHidden = true;
  }

  if (anyHidden) {
    // Pelo menos uma foto já foi vendida e ficou oculta — o evento não pode
    // ser apagado (photos.event_id ainda referencia ele), então arquiva.
    const { error } = await supabase
      .from("events")
      .update({ status: "archived" })
      .eq("id", eventId);
    if (error) throw error;

    revalidatePath("/painel");
    revalidatePath(`/painel/eventos/${eventId}`);
    return { status: "archived" };
  }

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw error;

  revalidatePath("/painel");
  return { status: "deleted" };
}
