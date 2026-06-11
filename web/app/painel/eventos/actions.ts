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

export async function deletePhoto(photoId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { data: photo, error: fetchErr } = await supabase
    .from("photos")
    .select("event_id, storage_path, preview_path")
    .eq("id", photoId)
    .single();
  if (fetchErr || !photo) throw new Error("Foto não encontrada");

  const admin = createAdminClient();
  await admin.storage.from("originals").remove([photo.storage_path]);
  if (photo.preview_path) {
    await admin.storage.from("previews").remove([photo.preview_path]);
  }

  const { error } = await supabase.from("photos").delete().eq("id", photoId);
  if (error) throw error;

  revalidatePath(`/painel/eventos/${photo.event_id}`);
}
