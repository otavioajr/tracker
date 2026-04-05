import { HistoryPlayer } from "@/components/map/history-player";

export default function HistoryPage() {
  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold lg:text-2xl">Historico de Rotas</h1>
        <p className="text-sm text-muted-foreground">
          Analise viagens, paradas e o replay da rota em um unico painel.
        </p>
      </div>
      <HistoryPlayer />
    </div>
  );
}
