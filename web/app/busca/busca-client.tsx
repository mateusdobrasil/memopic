"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPriceCents } from "@/lib/format";
import { recordConsent } from "./actions";

type Match = {
  photo_id: string;
  event_id: string;
  preview_path: string;
  price_cents: number;
  best_distance: number;
};

type SearchResponse = {
  ok: boolean;
  matches?: Match[];
  message?: string;
  error?: string;
};

type Stage = "consent" | "upload" | "results";

export function BuscaClient({
  hasValidConsent,
  requiredVersion,
}: {
  hasValidConsent: boolean;
  requiredVersion: string;
}) {
  const supabase = createClient();
  const [stage, setStage] = useState<Stage>(
    hasValidConsent ? "upload" : "consent",
  );
  const [isPending, startTransition] = useTransition();
  const [consentError, setConsentError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function handleAgree() {
    setConsentError(null);
    startTransition(async () => {
      try {
        await recordConsent(requiredVersion);
        setStage("upload");
      } catch {
        setConsentError(
          "Não foi possível registrar seu consentimento. Tente novamente.",
        );
      }
    });
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0] ?? null;
    setFile(selectedFile);
    setSearchError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(selectedFile ? URL.createObjectURL(selectedFile) : null);
  }

  async function handleSearch() {
    if (!file) return;
    setSearching(true);
    setSearchError(null);
    setEmptyMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/search", {
        method: "POST",
        body: formData,
      });

      const result: SearchResponse = await res.json();

      if (!res.ok || !result.ok) {
        setSearchError(
          result.error ?? "Não foi possível buscar suas fotos. Tente novamente.",
        );
        return;
      }

      const found = result.matches ?? [];
      setMatches(found);
      setSelected(new Set());
      if (found.length === 0) {
        setEmptyMessage(
          result.message ?? "Nenhuma foto sua foi encontrada ainda.",
        );
      }
      setStage("results");
    } catch {
      setSearchError(
        "Não foi possível buscar suas fotos. Verifique sua conexão e tente novamente.",
      );
    } finally {
      setSearching(false);
    }
  }

  function toggleSelected(photoId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }

  function handleCheckout() {
    alert("Finalização de compra em breve!");
  }

  function handleRetry() {
    setMatches(null);
    setEmptyMessage(null);
    setSearchError(null);
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStage("upload");
  }

  if (stage === "consent") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold">Antes de continuar</h1>
            <p className="text-sm text-zinc-500">
              Para encontrar suas fotos, vamos analisar uma selfie sua e
              comparar com os rostos detectados nas fotos dos eventos. Esse é
              um dado biométrico sensível, protegido pela LGPD.
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-zinc-200 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            <p>
              Ao continuar, você concorda que sua selfie será processada para
              gerar um vetor biométrico, usado exclusivamente para localizar
              fotos onde você aparece. Sua selfie e o vetor ficam vinculados à
              sua conta e você pode solicitar a exclusão a qualquer momento.
            </p>
            <p>Versão do termo: {requiredVersion}</p>
          </div>

          {consentError && (
            <p className="text-sm text-red-600">{consentError}</p>
          )}

          <button
            type="button"
            onClick={handleAgree}
            disabled={isPending}
            className="w-full rounded-full bg-black px-5 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {isPending ? "Salvando..." : "Concordo e continuar"}
          </button>
        </div>
      </main>
    );
  }

  if (stage === "upload") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold">Tire uma selfie</h1>
            <p className="text-sm text-zinc-500">
              Vamos usar sua selfie para encontrar as fotos onde você aparece.
            </p>
          </div>

          <label
            htmlFor="selfie"
            className="flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700"
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Pré-visualização da selfie"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="px-6 text-center text-sm text-zinc-500">
                Toque para tirar ou escolher uma foto
              </span>
            )}
          </label>
          <input
            id="selfie"
            name="selfie"
            type="file"
            accept="image/*"
            capture="user"
            className="sr-only"
            onChange={handleFileChange}
          />

          {searchError && (
            <p className="text-sm text-red-600">{searchError}</p>
          )}

          <button
            type="button"
            onClick={handleSearch}
            disabled={!file || searching}
            className="w-full rounded-full bg-black px-5 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {searching ? "Buscando..." : "Buscar minhas fotos"}
          </button>

          {searching && (
            <p className="text-center text-xs text-zinc-500">
              Isso pode levar até 1 minuto na primeira busca, enquanto nosso
              servidor de reconhecimento facial é iniciado.
            </p>
          )}
        </div>
      </main>
    );
  }

  // stage === "results"
  if (!matches || matches.length === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full max-w-md space-y-6">
          <h1 className="text-2xl font-semibold">Nenhuma foto encontrada</h1>
          <p className="text-sm text-zinc-500">
            {emptyMessage ?? "Ainda não encontramos fotos com o seu rosto."}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="w-full rounded-full border border-zinc-300 px-5 py-3 text-base font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-4 pb-28 pt-8">
      <h1 className="mb-4 text-center text-2xl font-semibold">
        Suas fotos ({matches.length})
      </h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {matches.map((match) => {
          const { data } = supabase.storage
            .from("previews")
            .getPublicUrl(match.preview_path);
          const isSelected = selected.has(match.photo_id);

          return (
            <button
              key={match.photo_id}
              type="button"
              onClick={() => toggleSelected(match.photo_id)}
              className={`relative overflow-hidden rounded-lg border-2 text-left transition-colors ${
                isSelected
                  ? "border-black dark:border-white"
                  : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.publicUrl}
                alt="Foto do evento"
                className="aspect-square w-full object-cover"
              />
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-xs font-medium text-white">
                {formatPriceCents(match.price_cents)}
              </span>
              {isSelected && (
                <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black text-xs font-bold text-white dark:bg-white dark:text-black">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
        <button
          type="button"
          onClick={handleCheckout}
          disabled={selected.size === 0}
          className="mx-auto block w-full max-w-md rounded-full bg-black px-5 py-3 text-base font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Finalizar compra ({selected.size})
        </button>
      </div>
    </main>
  );
}
