"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPixPayment } from "@/lib/mercadopago";

export async function createOrder(photoIds: string[], cpf: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const ids = Array.from(new Set(photoIds));
  if (ids.length === 0) throw new Error("nenhuma foto selecionada");

  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length !== 11) throw new Error("CPF inválido");

  // RLS já restringe a fotos visíveis (evento publicado + pronta, ou própria/admin)
  const { data: photos, error: photosErr } = await supabase
    .from("photos")
    .select("id, price_cents")
    .in("id", ids);
  if (photosErr) throw photosErr;
  if (!photos || photos.length !== ids.length) {
    throw new Error("Algumas fotos não estão mais disponíveis.");
  }

  const totalCents = photos.reduce((sum, p) => sum + p.price_cents, 0);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({ customer_id: user.id, total_cents: totalCents, status: "pending" })
    .select("id")
    .single();
  if (orderErr) throw orderErr;

  const items = photos.map((p) => ({
    order_id: order.id,
    photo_id: p.id,
    price_cents: p.price_cents,
  }));
  const { error: itemsErr } = await supabase.from("order_items").insert(items);
  if (itemsErr) throw itemsErr;

  // Reaproveitar o CPF em compras futuras (best-effort).
  await supabase.from("profiles").update({ cpf: cleanCpf }).eq("id", user.id);

  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto");
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const notificationUrl =
    proto === "https" && host
      ? `https://${host}/api/webhooks/mercadopago`
      : undefined;

  const admin = createAdminClient();

  try {
    const payment = await createPixPayment({
      amountCents: totalCents,
      description: `MemoPic — ${ids.length} foto(s)`,
      externalReference: order.id,
      payerEmail: user.email!,
      payerCpf: cleanCpf,
      notificationUrl,
    });

    const txData = payment.point_of_interaction?.transaction_data;
    await admin
      .from("orders")
      .update({
        payment_provider: "mercadopago",
        payment_ref: String(payment.id),
        payer_cpf: cleanCpf,
        pix_qr_code: txData?.qr_code ?? null,
        pix_qr_code_base64: txData?.qr_code_base64 ?? null,
        pix_ticket_url: txData?.ticket_url ?? null,
        pix_expires_at: payment.date_of_expiration,
      })
      .eq("id", order.id);
  } catch {
    await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    throw new Error("Não foi possível gerar o Pix. Tente novamente.");
  }

  return { orderId: order.id as string };
}
