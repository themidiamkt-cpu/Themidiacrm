"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";

export interface Procedimento {
  id: string;
  nome: string;
  meses_validade: number;
  mensagem: string;
  etapa_destino_id: string | null;
  ativo: boolean;
}

export interface EntradaDeProcedimento {
  nome: string;
  meses_validade: number;
  mensagem: string;
  etapa_destino_id: string | null;
  ativo: boolean;
}

export const CHAVE_DOS_PROCEDIMENTOS = ["procedimentos"] as const;

/** O catálogo de procedimentos da organização (agent+ lê). 404 = ainda não ativado nesta instalação. */
export function useProcedimentos() {
  return useQuery({
    queryKey: CHAVE_DOS_PROCEDIMENTOS,
    queryFn: async () => (await apiClient.get<{ data: Procedimento[] }>("/api/v1/procedimentos")).data,
    staleTime: 30_000,
    retry: false,
  });
}

export function useSalvarProcedimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...dados }: Partial<EntradaDeProcedimento> & { id?: string }) =>
      id
        ? apiClient.patch<{ data: Procedimento }>(`/api/v1/procedimentos/${id}`, dados)
        : apiClient.post<{ data: Procedimento }>("/api/v1/procedimentos", dados),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE_DOS_PROCEDIMENTOS }),
    onError: showApiError,
  });
}

export function useExcluirProcedimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/v1/procedimentos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE_DOS_PROCEDIMENTOS }),
    onError: showApiError,
  });
}
