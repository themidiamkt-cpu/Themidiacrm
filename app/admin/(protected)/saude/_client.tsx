"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { centavosParaDolar } from "@/lib/saude/avaliar";
import type { SaudeData } from "@/app/api/v1/admin/saude/route";

function Cartao({ titulo, valor, ruim }: { titulo: string; valor: string | number; ruim?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${ruim ? "border-destructive/60" : ""}`}>
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className={`mt-1 text-2xl font-semibold ${ruim ? "text-destructive" : ""}`}>{valor}</div>
    </div>
  );
}

export function SaudeClient() {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "saude"],
    queryFn: () => apiClient.get<{ data: SaudeData }>("/api/v1/admin/saude").then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading) return <Skeleton className="h-64 rounded-lg" />;
  if (isError || !data) {
    return (
      <div className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
        Não foi possível carregar o painel de saúde.
      </div>
    );
  }

  const c = data.contadores;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Saúde da instalação</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          IA, WhatsApp, fila e follow-ups em um só lugar. Atualiza a cada minuto
          {dataUpdatedAt ? ` (última leitura ${new Date(dataUpdatedAt).toLocaleTimeString("pt-BR")})` : ""}.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Alertas</h2>
        {data.alertas.length === 0 ? (
          <div className="rounded-lg border p-4 text-sm">Nenhum alerta agora.</div>
        ) : (
          data.alertas.map((a, i) => (
            <div
              key={`${a.codigo}-${i}`}
              className={`rounded-lg border p-4 ${a.gravidade === "critico" ? "border-destructive/60" : ""}`}
            >
              <div className="text-sm font-medium">
                {a.gravidade === "critico" ? "Crítico · " : "Atenção · "}
                {a.titulo}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{a.detalhe}</div>
            </div>
          ))
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Mensagens com falha (24 h)" valor={c.mensagens_falhas_24h} ruim={c.mensagens_falhas_24h > 0} />
        <Cartao titulo="Jobs atrasados (> 10 min)" valor={c.jobs_pendentes_atrasados} ruim={c.jobs_pendentes_atrasados > 0} />
        <Cartao titulo="Jobs esgotados (24 h)" valor={c.jobs_mortos_24h} ruim={c.jobs_mortos_24h > 0} />
        <Cartao titulo="Follow-ups travados" valor={c.followups_mortos} ruim={c.followups_mortos > 0} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">IA por provedor (24 h)</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Provedor</th><th className="p-2">Ok</th><th className="p-2">Erros</th><th className="p-2">Último erro</th><th className="p-2">Última chamada ok</th></tr>
            </thead>
            <tbody>
              {data.provedores.map((p) => (
                <tr key={p.provider} className="border-t">
                  <td className="p-2">{p.provider}</td>
                  <td className="p-2">{p.ok}</td>
                  <td className="p-2">{p.erros}</td>
                  <td className="p-2">{p.ultimo_erro_code ?? "—"}</td>
                  <td className="p-2">{p.ultimo_ok_em ? new Date(p.ultimo_ok_em).toLocaleString("pt-BR") : "—"}</td>
                </tr>
              ))}
              {data.provedores.length === 0 && (
                <tr><td className="p-2 text-muted-foreground" colSpan={5}>Nenhuma chamada de IA nas últimas 24 h.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">WhatsApp</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Organização</th><th className="p-2">Canal</th><th className="p-2">Status</th><th className="p-2">Falhas</th><th className="p-2">IA aberta ao público</th></tr>
            </thead>
            <tbody>
              {data.canais.map((k) => (
                <tr key={k.id} className="border-t">
                  <td className="p-2">{k.organizacao}</td>
                  <td className="p-2">{k.nome}</td>
                  <td className="p-2">{k.status}</td>
                  <td className="p-2">{k.falhas_seguidas}</td>
                  <td className="p-2">{k.ia_aberta ? "sim" : "não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          Custo de IA, 7 dias: {centavosParaDolar(data.custo_7d.total_cents)}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="p-2">Cliente</th><th className="p-2">Chamadas</th><th className="p-2">Erros</th><th className="p-2">Custo</th></tr>
              </thead>
              <tbody>
                {data.custo_7d.por_organizacao.map((o) => (
                  <tr key={o.organizacao} className="border-t">
                    <td className="p-2">{o.organizacao}</td>
                    <td className="p-2">{o.chamadas}</td>
                    <td className="p-2">{o.erros}</td>
                    <td className="p-2">{centavosParaDolar(o.custo_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="p-2">Ponto de IA</th><th className="p-2">Modelo</th><th className="p-2">Chamadas</th><th className="p-2">Custo</th></tr>
              </thead>
              <tbody>
                {data.custo_7d.por_ponto.map((p) => (
                  <tr key={`${p.purpose}-${p.model}`} className="border-t">
                    <td className="p-2">{p.purpose}</td>
                    <td className="p-2">{p.model}</td>
                    <td className="p-2">{p.chamadas}</td>
                    <td className="p-2">{centavosParaDolar(p.custo_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
