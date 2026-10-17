import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * As tabelas `themidia_*` são personalização da The Mídia (ver
 * `presets/procedimentos/001_procedimentos.sql`) e não estão em
 * `lib/database.types.ts`, que é gerado do schema oficial. O cliente tipado
 * recusaria o nome da tabela; aqui ele é aberto de propósito, num lugar só.
 */
export function semTipos(cliente: unknown): SupabaseClient {
  return cliente as SupabaseClient;
}

/** Coluna nova ainda não existe / migration não aplicada. */
export function tabelaAusente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|Could not find the table/i.test(error.message ?? "")
  );
}

export const COLUNAS_DO_CATALOGO =
  "id, organization_id, nome, meses_validade, mensagem, etapa_destino_id, ativo, created_at, updated_at";

export const COLUNAS_DO_LEAD =
  "id, organization_id, lead_id, contact_id, procedimento_id, nome, status, agendado_para, realizado_em, vence_em, lembrete_enviado_em, lembrete_resultado, created_at, updated_at";
