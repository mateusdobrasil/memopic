import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Termos e Privacidade — MemoPic",
};

export default async function TermosPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "biometric_consent_version")
    .single();
  const consentVersion = (settings?.value as string | undefined) ?? "1.0";

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div>
          <Link href="/" className="text-sm text-zinc-500">
            ← Voltar
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">
            Termos de Uso e Privacidade
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Versão vigente do termo de consentimento biométrico:{" "}
            {consentVersion}
          </p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <section className="space-y-2">
            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              1. Identificação do controlador
            </h2>
            <p>
              O MemoPic é operado por{" "}
              <strong>[razão social / CNPJ — preencher]</strong> (&quot;nós&quot;),
              responsável pelo tratamento dos dados pessoais descritos nestes
              termos, na qualidade de controlador, nos termos da Lei Geral de
              Proteção de Dados (Lei nº 13.709/2018 — LGPD). Dúvidas,
              solicitações ou reclamações sobre privacidade podem ser
              enviadas para{" "}
              <a href="mailto:privacidade@memopic.com.br" className="underline">
                privacidade@memopic.com.br
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              2. Dados que coletamos
            </h2>
            <p>
              <strong>Dados de cadastro:</strong> nome completo e e-mail. Para
              clientes que compram fotos via Pix, também coletamos o CPF,
              exigido pelo processamento de pagamento.
            </p>
            <p>
              <strong>Dados biométricos (selfie e vetor facial):</strong>{" "}
              quando você usa a busca por fotos, envia uma selfie. Essa
              imagem é processada em nosso servidor — nunca no seu navegador
              — por um sistema de reconhecimento facial (InsightFace), que
              gera um vetor numérico de 512 posições representando
              características do seu rosto. A selfie fica armazenada em um
              local privado e o vetor gerado a partir dela é vinculado à sua
              conta, exclusivamente para localizar fotos onde você aparece.
            </p>
            <p>
              <strong>Fotos de eventos:</strong> fotógrafos parceiros enviam
              fotos de eventos corporativos e religiosos para a plataforma.
              Essas fotos contêm imagens — e, portanto, dados biométricos —
              de pessoas fotografadas que podem não ter se cadastrado
              diretamente no MemoPic. O tratamento desses dados segue uma
              base legal distinta da do cliente que faz a busca, descrita na
              seção 4.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              3. Para que usamos esses dados
            </h2>
            <p>
              Usamos os dados coletados para: localizar, por reconhecimento
              facial, as fotos de eventos em que você aparece; processar o
              pagamento das fotos selecionadas; e entregar os arquivos em
              alta resolução após a confirmação do pagamento.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              4. Base legal
            </h2>
            <p>
              O tratamento da sua selfie e do vetor biométrico gerado a
              partir dela depende do seu <strong>consentimento específico
              e destacado</strong>, conforme o art. 11 da LGPD para dados
              sensíveis — coletado antes da primeira busca e renovado sempre
              que a versão deste termo é atualizada (veja seção 9). Os
              demais dados (cadastro, fotos de eventos, dados de pagamento)
              são tratados com base na execução do contrato com você ou com
              o fotógrafo/organizador do evento e no legítimo interesse em
              viabilizar a entrega das fotos.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              5. Compartilhamento com terceiros
            </h2>
            <p>
              Utilizamos a <strong>Supabase</strong> como infraestrutura de
              banco de dados, autenticação e armazenamento de arquivos, e o{" "}
              <strong>Mercado Pago</strong> para processar pagamentos via
              Pix. O Mercado Pago recebe apenas os dados necessários ao
              pagamento (como o CPF do pagador) — em nenhum momento o vetor
              biométrico ou a selfie são compartilhados com o Mercado Pago
              ou com qualquer outro terceiro.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              6. Retenção e exclusão
            </h2>
            <p>
              Sua selfie e o vetor biométrico ficam armazenados, vinculados à
              sua conta, enquanto você mantiver cadastro ativo no MemoPic.
              Você pode solicitar a exclusão da sua selfie, do vetor
              biométrico e/ou da sua conta a qualquer momento, enviando um
              e-mail para{" "}
              <a href="mailto:privacidade@memopic.com.br" className="underline">
                privacidade@memopic.com.br
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              7. Seus direitos
            </h2>
            <p>
              Nos termos do art. 18 da LGPD, você pode solicitar, a qualquer
              momento: confirmação de que tratamos seus dados, acesso aos
              dados, correção de dados incompletos ou desatualizados,
              eliminação de dados tratados com base no seu consentimento,
              portabilidade dos dados a outro fornecedor e revogação do
              consentimento dado para o tratamento de dados biométricos. As
              solicitações podem ser feitas pelo e-mail informado na seção 1.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              8. Dados de navegação
            </h2>
            <p>
              No momento em que você concorda com o processamento de dados
              biométricos, registramos o endereço IP e o user-agent do
              navegador usados para dar esse consentimento, junto com a data
              e a versão do termo aceito — isso serve como comprovação do
              aceite.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              9. Alterações nestes termos
            </h2>
            <p>
              A versão vigente do termo de consentimento biométrico é a{" "}
              <strong>{consentVersion}</strong>, exibida no topo desta
              página. Sempre que essa versão for atualizada, será solicitado
              um novo aceite antes de você poder usar a busca por fotos
              novamente.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              10. Contato
            </h2>
            <p>
              Para qualquer assunto relacionado a privacidade e proteção de
              dados, escreva para{" "}
              <a href="mailto:privacidade@memopic.com.br" className="underline">
                privacidade@memopic.com.br
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
