/**
 * Marcar um compromisso sem sair da tela em que a pessoa está.
 *
 * ─── Por que uma janela e não um quadro dentro da página ────────────────────
 *
 * O produto proíbe ser emoldurado (`X-Frame-Options: DENY`), e essa proteção
 * fica. A agenda já sabe abrir o painel de marcar com o cliente preenchido
 * quando chega por `/app/agenda?contato=…&conversa=…` (o link "Marcar
 * compromisso" do Inbox), então o que faltava era chegar nela sem trocar de
 * tela: uma janela estreita ao lado, de nome fixo, reaproveitada a cada gesto.
 *
 * Módulo sem React de propósito: a regra de QUAL etapa dispara a janela e a
 * forma do endereço são testadas sem montar tela.
 */

/** O mesmo nome a cada gesto: o clique seguinte reaproveita a janela aberta. */
export const NOME_DA_JANELA_DA_AGENDA = "agenda-marcar";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * A etapa em que o horário JÁ foi combinado e falta pôr na agenda: "Agendado",
 * "Diagnóstico marcado", "Consulta marcada"… Compara sem acento e sem maiúsculas,
 * palavra por palavra. Medido na clínica (16/10/2026): o funil "Pacientes" chama
 * a etapa só de "Agendado", e a regra anterior (exigia "diagnóstico" + "marcado")
 * não abria nada.
 *
 * Palavras que anulam: "não agendado", "desmarcado", "cancelado", "faltou",
 * "reagendar" — são etapas em que NÃO há horário a marcar.
 */
const PALAVRAS_DE_HORARIO_COMBINADO = ["agendado", "agendada", "marcado", "marcada"];
const PALAVRAS_QUE_ANULAM = [
  "nao",
  "sem",
  "desmarcado",
  "desmarcada",
  "cancelado",
  "cancelada",
  "faltou",
  "falta",
  "reagendar",
  "remarcar",
];

export function ehEtapaDeAgendamento(nome: string | null | undefined): boolean {
  if (!nome) return false;
  const palavras = normalizar(nome)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (palavras.some((p) => PALAVRAS_QUE_ANULAM.includes(p))) return false;
  return palavras.some((p) => PALAVRAS_DE_HORARIO_COMBINADO.includes(p));
}

/** O endereço da agenda já com o cliente (e a conversa, quando há) preenchidos. */
export function urlDaMarcacao(contatoId: string, conversaId?: string | null): string {
  const parametros = new URLSearchParams({ contato: contatoId });
  if (conversaId) parametros.set("conversa", conversaId);
  return `/app/agenda?${parametros.toString()}`;
}

/**
 * Abre a agenda numa janela ao lado. Devolve `false` quando o navegador
 * bloqueou (quem chama decide o plano B — um aviso com botão, não uma
 * navegação que tire a pessoa do quadro).
 */
export function abrirAgendaAoLado(url: string): boolean {
  const largura = 760;
  const altura = Math.min(880, window.screen.availHeight - 40);
  const esquerda = Math.max(0, window.screenX + window.outerWidth - largura - 16);
  const topo = Math.max(0, window.screenY + 40);
  const janela = window.open(
    url,
    NOME_DA_JANELA_DA_AGENDA,
    `popup=yes,width=${largura},height=${altura},left=${esquerda},top=${topo}`,
  );
  if (!janela) return false;
  janela.focus();
  return true;
}
