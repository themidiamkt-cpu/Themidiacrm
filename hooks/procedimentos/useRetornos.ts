"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { ResumoDosRetornos } from "@/lib/procedimentos/retornos";

/** O retorno de procedimentos como follow-up (cartões + fila). 404 = recurso não ativado: a tela some com a seção. */
export function useRetornosDeProcedimentos() {
  return useQuery({
    queryKey: ["procedimentos", "retornos"],
    queryFn: async () => (await apiClient.get<{ data: ResumoDosRetornos }>("/api/v1/procedimentos/retornos")).data,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
}
