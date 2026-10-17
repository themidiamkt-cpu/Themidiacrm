"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";

export type StatusDoProcedimento = "agendado" | "realizado" | "cancelado";

export interface ProcedimentoDoLead {
  id: string;
  lead_id: string;
  procedimento_id: string | null;
  nome: string;
  status: StatusDoProcedimento;
  agendado_para: string | null;
  realizado_em: string | null;
  vence_em: string | null;
  lembrete_enviado_em: string | null;
  lembrete_resultado: string | null;
}

const chave = (leadId: string) => ["lead", leadId, "procedimentos"] as const;

/** Procedimentos agendados ou feitos do lead. 404 = recurso não ativado: a seção some. */
export function useProcedimentosDoLead(leadId: string) {
  return useQuery({
    queryKey: chave(leadId),
    queryFn: async () =>
      (await apiClient.get<{ data: ProcedimentoDoLead[] }>(`/api/v1/leads/${leadId}/procedimentos`)).data,
    staleTime: 30_000,
    retry: false,
  });
}

export function useRegistrarProcedimentoDoLead(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dados: {
      procedimento_id: string;
      status: "agendado" | "realizado";
      agendado_para?: string;
      realizado_em?: string;
    }) => apiClient.post(`/api/v1/leads/${leadId}/procedimentos`, dados),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(leadId) }),
    onError: showApiError,
  });
}

export function useAtualizarProcedimentoDoLead(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...dados
    }: {
      id: string;
      status?: StatusDoProcedimento;
      agendado_para?: string | null;
      realizado_em?: string;
    }) => apiClient.patch(`/api/v1/leads/${leadId}/procedimentos/${id}`, dados),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(leadId) }),
    onError: showApiError,
  });
}

export function useExcluirProcedimentoDoLead(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/v1/leads/${leadId}/procedimentos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: chave(leadId) }),
    onError: showApiError,
  });
}
