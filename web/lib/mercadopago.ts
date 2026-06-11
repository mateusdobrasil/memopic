import crypto from "node:crypto";

const MP_API = "https://api.mercadopago.com";

type CreatePixPaymentInput = {
  amountCents: number;
  description: string;
  externalReference: string; // order.id
  payerEmail: string;
  payerCpf: string; // 11 dígitos, sem formatação
  notificationUrl?: string;
};

export type MpPaymentResponse = {
  id: number;
  status: string;
  status_detail: string;
  date_of_expiration: string | null;
  external_reference?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

export async function createPixPayment(
  input: CreatePixPaymentInput,
): Promise<MpPaymentResponse> {
  const body: Record<string, unknown> = {
    transaction_amount: Math.round(input.amountCents) / 100,
    description: input.description,
    payment_method_id: "pix",
    payer: {
      email: input.payerEmail,
      identification: { type: "CPF", number: input.payerCpf },
    },
    external_reference: input.externalReference,
  };
  if (input.notificationUrl) body.notification_url = input.notificationUrl;

  const res = await fetch(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": input.externalReference,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mercado Pago error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getPayment(
  paymentId: string | number,
): Promise<MpPaymentResponse> {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mercado Pago error ${res.status}: ${text}`);
  }
  return res.json();
}

export function verifyWebhookSignature({
  signatureHeader,
  requestId,
  dataId,
  secret,
}: {
  signatureHeader: string;
  requestId: string;
  dataId: string;
  secret: string;
}): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=").map((s) => s.trim());
      return [k, v];
    }),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
