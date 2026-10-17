import { z } from "zod";

import { ehDataISO, MENSAGEM_MAXIMA, MESES_MAXIMO } from "./regras";

const dataISO = z.string().refine(ehDataISO, { message: "Data inválida (use AAAA-MM-DD)." });

export const criarProcedimentoSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  meses_validade: z.number().int().min(1).max(MESES_MAXIMO),
  mensagem: z.string().trim().min(1).max(MENSAGEM_MAXIMA),
  etapa_destino_id: z.string().uuid().nullable().optional(),
  ativo: z.boolean().optional(),
});
export type CriarProcedimentoInput = z.infer<typeof criarProcedimentoSchema>;

export const atualizarProcedimentoSchema = criarProcedimentoSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Informe ao menos um campo." });

export const registrarProcedimentoDoLeadSchema = z
  .object({
    procedimento_id: z.string().uuid(),
    status: z.enum(["agendado", "realizado"]),
    agendado_para: dataISO.optional(),
    /** Sem data, "realizado" vale HOJE (no fuso da organização). */
    realizado_em: dataISO.optional(),
  })
  .refine((d) => d.status !== "agendado" || !!d.agendado_para, {
    message: "Informe a data do agendamento.",
    path: ["agendado_para"],
  });

export const atualizarProcedimentoDoLeadSchema = z
  .object({
    status: z.enum(["agendado", "realizado", "cancelado"]),
    agendado_para: dataISO.nullable(),
    realizado_em: dataISO,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Informe ao menos um campo." });
