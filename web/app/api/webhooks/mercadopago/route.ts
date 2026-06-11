import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment, verifyWebhookSignature } from "@/lib/mercadopago";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { type?: string; data?: { id?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (body.type !== "payment" || !body.data?.id) {
    return NextResponse.json({ ok: true });
  }
  const dataId = body.data.id;

  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (secret) {
    const signatureHeader = request.headers.get("x-signature");
    const requestId = request.headers.get("x-request-id");
    const valid =
      signatureHeader &&
      requestId &&
      verifyWebhookSignature({ signatureHeader, requestId, dataId, secret });

    if (!valid) {
      console.warn("mercadopago webhook: assinatura inválida, ignorando");
      return NextResponse.json({ ok: true });
    }
  } else {
    console.warn(
      "mercadopago webhook: MERCADOPAGO_WEBHOOK_SECRET não configurado, pulando verificação de assinatura",
    );
  }

  try {
    const payment = await getPayment(dataId);
    if (payment.status === "approved" && payment.external_reference) {
      const admin = createAdminClient();
      await admin
        .from("orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          payment_ref: String(payment.id),
        })
        .eq("id", payment.external_reference)
        .eq("status", "pending");
    }
  } catch (err) {
    console.error("mercadopago webhook: erro ao processar pagamento", err);
  }

  return NextResponse.json({ ok: true });
}
