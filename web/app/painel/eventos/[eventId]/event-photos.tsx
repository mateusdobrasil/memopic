"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  centsToInputValue,
  formatPriceCents,
  parsePriceInput,
} from "@/lib/format";
import { updatePhotoPrice, deletePhoto } from "../actions";

export type Photo = {
  id: string;
  storage_path: string;
  preview_path: string | null;
  price_cents: number;
  status: "uploading" | "processing" | "ready" | "failed" | "hidden";
  faces_count: number;
  width: number | null;
  height: number | null;
  created_at: string;
};

const SELECT_COLUMNS =
  "id, storage_path, preview_path, price_cents, status, faces_count, width, height, created_at";

export function EventPhotos({
  eventId,
  userId,
  initialPhotos,
  defaultPriceCents,
}: {
  eventId: string;
  userId: string;
  initialPhotos: Photo[];
  defaultPriceCents: number;
}) {
  const supabase = createClient();
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updatePhoto(id: string, patch: Partial<Photo>) {
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  }

  async function processPhoto(id: string) {
    try {
      const res = await fetch("/api/photos/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: id }),
      });
      const result = await res.json();
      if (result.ok && result.photo) {
        updatePhoto(id, result.photo);
      } else {
        updatePhoto(id, { status: "failed" });
      }
    } catch {
      updatePhoto(id, { status: "failed" });
    }
  }

  async function uploadOne(file: File) {
    const id = crypto.randomUUID();
    const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
    const ext = (extMatch?.[1] || "jpg").toLowerCase();
    const path = `${eventId}/${id}.${ext}`;

    setPhotos((prev) => [
      {
        id,
        storage_path: path,
        preview_path: null,
        price_cents: defaultPriceCents,
        status: "uploading",
        faces_count: 0,
        width: null,
        height: null,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);

    const { error: uploadErr } = await supabase.storage
      .from("originals")
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
    if (uploadErr) {
      updatePhoto(id, { status: "failed" });
      return;
    }

    const { data: row, error: insertErr } = await supabase
      .from("photos")
      .insert({
        id,
        event_id: eventId,
        uploaded_by: userId,
        storage_path: path,
        price_cents: defaultPriceCents,
        status: "processing",
      })
      .select(SELECT_COLUMNS)
      .single();
    if (insertErr || !row) {
      await supabase.storage.from("originals").remove([path]);
      updatePhoto(id, { status: "failed" });
      return;
    }

    updatePhoto(id, row as Photo);
    await processPhoto(id);
  }

  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    for (const file of Array.from(files)) {
      await uploadOne(file);
    }
    setUploading(false);
    e.target.value = "";
  }

  function handleSavePrice(photoId: string, value: string) {
    const cents = parsePriceInput(value);
    if (cents === null) return;
    startTransition(async () => {
      await updatePhotoPrice(photoId, cents);
      updatePhoto(photoId, { price_cents: cents });
    });
  }

  function handleDelete(photoId: string) {
    startTransition(async () => {
      const result = await deletePhoto(photoId);
      if (result.status === "hidden") {
        updatePhoto(photoId, { status: "hidden" });
      } else {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      }
    });
  }

  function handleRetry(photoId: string) {
    updatePhoto(photoId, { status: "processing" });
    startTransition(async () => {
      await processPhoto(photoId);
    });
  }

  return (
    <div className="space-y-4">
      <label
        className={`block w-full cursor-pointer rounded-full border border-dashed border-zinc-300 px-5 py-3 text-center text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900 ${
          uploading ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {uploading ? "Enviando fotos..." : "+ Adicionar fotos"}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={uploading}
          onChange={handleFilesSelected}
        />
      </label>

      {photos.length === 0 ? (
        <p className="text-center text-sm text-zinc-500">
          Nenhuma foto enviada ainda.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              isPending={isPending}
              onSavePrice={handleSavePrice}
              onDelete={handleDelete}
              onRetry={handleRetry}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoCard({
  photo,
  isPending,
  onSavePrice,
  onDelete,
  onRetry,
}: {
  photo: Photo;
  isPending: boolean;
  onSavePrice: (photoId: string, value: string) => void;
  onDelete: (photoId: string) => void;
  onRetry: (photoId: string) => void;
}) {
  const supabase = createClient();
  const [priceInput, setPriceInput] = useState(
    centsToInputValue(photo.price_cents),
  );

  const previewUrl = photo.preview_path
    ? supabase.storage.from("previews").getPublicUrl(photo.preview_path).data
        .publicUrl
    : null;

  return (
    <div className="space-y-2">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Foto do evento"
            className="h-full w-full object-cover"
          />
        ) : photo.status === "failed" ? (
          <span className="px-2 text-center text-xs text-red-600">
            Falhou
          </span>
        ) : (
          <span className="px-2 text-center text-xs text-zinc-500">
            {photo.status === "uploading" ? "Enviando..." : "Processando..."}
          </span>
        )}
      </div>

      {photo.status === "processing" && (
        <p className="text-center text-[11px] text-zinc-500">
          Pode levar até 1 min na primeira foto.
        </p>
      )}

      {photo.status === "ready" && (
        <p className="text-center text-xs text-zinc-500">
          {photo.faces_count} rosto(s) detectado(s)
        </p>
      )}

      {photo.status === "hidden" && (
        <p className="text-center text-xs text-zinc-500">
          Vendida — oculta da busca
        </p>
      )}

      {photo.status === "failed" && (
        <button
          type="button"
          onClick={() => onRetry(photo.id)}
          disabled={isPending}
          className="w-full rounded-full border border-zinc-300 px-2 py-1 text-xs font-medium transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Tentar novamente
        </button>
      )}

      <div className="flex items-center gap-1">
        <span className="text-xs text-zinc-500">R$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="button"
          onClick={() => onSavePrice(photo.id, priceInput)}
          disabled={
            isPending || parsePriceInput(priceInput) === photo.price_cents
          }
          className="shrink-0 rounded-full border border-zinc-300 px-2 py-1 text-xs font-medium transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Salvar
        </button>
      </div>
      <p className="text-center text-[11px] text-zinc-400">
        Atual: {formatPriceCents(photo.price_cents)}
      </p>

      {photo.status !== "hidden" && (
        <button
          type="button"
          onClick={() => onDelete(photo.id)}
          disabled={isPending || photo.status === "uploading"}
          className="w-full rounded-full border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
        >
          Remover
        </button>
      )}
    </div>
  );
}
