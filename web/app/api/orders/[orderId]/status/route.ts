import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment } from "@/lib/mercadopago";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status, payment_ref")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let status = order.status;

  if (status === "pending" && order.payment_ref) {
    try {
      const payment = await getPayment(order.payment_ref);
      if (payment.status === "approved") {
        const admin = createAdminClient();
        await admin
          .from("orders")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", orderId)
          .eq("status", "pending");
        status = "paid";
      }
    } catch {
      // Falha ao consultar o Mercado Pago não derruba o polling; tenta de novo na próxima.
    }
  }

  return NextResponse.json(
    { status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
