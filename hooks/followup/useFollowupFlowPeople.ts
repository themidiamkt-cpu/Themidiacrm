"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { PessoasNoFluxo } from "@/lib/followup/pessoas-no-fluxo";

export interface FollowupFlowPeople extends PessoasNoFluxo {
  truncado: boolean;
  janela_dos_encerrados_dias: number;
}

export const followupFlowPeopleQueryKey = (flowId: string) =>
  ["followup", "flow", flowId, "people"] as const;

/**
 * Quem está em cada passo do fluxo. Relê sozinho: o motor anda sem a tela saber,
 * e um retrato parado de quem está "esperando resposta" envelhece em minutos.
 */
export function useFollowupFlowPeople(flowId: string) {
  return useQuery({
    queryKey: followupFlowPeopleQueryKey(flowId),
    queryFn: async () =>
      (
        await apiClient.get<{ data: FollowupFlowPeople }>(
          `/api/v1/ai/followup-flows/${flowId}/people`,
        )
      ).data,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Quantas pessoas estão em cada fluxo agora (`pointer_id` → quantas), para a lista de fluxos. */
export function useFollowupFlowsPeopleCounts() {
  return useQuery({
    queryKey: ["followup", "flows", "people-counts"] as const,
    queryFn: async () =>
      (
        await apiClient.get<{ data: { por_fluxo: Record<string, number>; truncado: boolean } }>(
          "/api/v1/ai/followup-flows/people-counts",
        )
      ).data,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
