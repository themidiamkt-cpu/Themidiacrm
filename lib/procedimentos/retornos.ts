/**
 * O retorno de procedimentos como o operador o enxerga na tela Follow-ups:
 * contagens por procedimento + a fila. Puro: recebe as linhas já lidas.
 */
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";

type Embed<T> = T | T[] | null;

export interface LinhaDoRetorno {
  id: string;
  lead_id: string;
  contact_id: string | null;
  procedimento_id: string | null;
  nome: string;
  realizado_em: string | null;
  vence_em: string | null;
  lembrete_enviado_em: string | null;
  lembrete_resultado: string | null;
  contacts: Embed<{ name: string | null; display_name: string | null; phone_number: string | null }>;
  crm_leads: Embed<{ title: string | null }>;
}

export interface ItemDaFila {
  id: string;
  lead_id: string;
  contact_id: string | null;
  procedimento_id: string | null;
  paciente: string;
  procedimento: string;
  realizado_em: string | null;
  vence_em: string | null;
  /** aguardando | aguardando_envio (já venceu e não saiu: janela de horário, canal em teste…) | enviado | expirado | sem_numero | contato_bloqueado | sem_procedimento | falhou */
  estado: string;
  quando: string | null;
}

export interface CartaoDoProcedimento {
  id: string;
  nome: string;
  meses_validade: number;
  ativo: boolean;
  aguardando: number;
  proximo_vencimento: string | null;
  enviados_30d: number;
}

export interface ResumoDosRetornos {
  procedimentos: CartaoDoProcedimento[];
  fila: ItemDaFila[];
}

function um<T>(valor: Embed<T>): T | null {
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

function paraItem(linha: LinhaDoRetorno, estado: string): ItemDaFila {
  const contato = um(linha.contacts);
  const lead = um(linha.crm_leads);
  return {
    id: linha.id,
    lead_id: linha.lead_id,
    contact_id: linha.contact_id,
    procedimento_id: linha.procedimento_id,
    paciente: nomeDoContato(contato) ?? lead?.title ?? contato?.phone_number ?? "—",
    procedimento: linha.nome,
    realizado_em: linha.realizado_em,
    vence_em: linha.vence_em,
    estado,
    quando: linha.lembrete_enviado_em,
  };
}

export function resumirRetornos(
  entrada: {
    catalogo: Array<{ id: string; nome: string; meses_validade: number; ativo: boolean }>;
    pendentes: LinhaDoRetorno[];
    recentes: LinhaDoRetorno[];
  },
  /** Hoje (`YYYY-MM-DD`, no fuso da organização): quem já venceu e ainda não saiu vira `aguardando_envio`. */
  hoje?: string,
): ResumoDosRetornos {
  const procedimentos = entrada.catalogo.map<CartaoDoProcedimento>((p) => {
    const aguardando = entrada.pendentes.filter((l) => l.procedimento_id === p.id);
    const vencimentos = aguardando.map((l) => l.vence_em).filter((v): v is string => !!v).sort();
    return {
      id: p.id,
      nome: p.nome,
      meses_validade: p.meses_validade,
      ativo: p.ativo,
      aguardando: aguardando.length,
      proximo_vencimento: vencimentos[0] ?? null,
      enviados_30d: entrada.recentes.filter(
        (l) => l.procedimento_id === p.id && l.lembrete_resultado === "enviado",
      ).length,
    };
  });
  const fila = [
    ...entrada.pendentes.map((l) =>
      paraItem(l, hoje && l.vence_em && l.vence_em <= hoje ? "aguardando_envio" : "aguardando"),
    ),
    ...entrada.recentes.map((l) => paraItem(l, l.lembrete_resultado ?? "aguardando")),
  ];
  return { procedimentos, fila };
}
