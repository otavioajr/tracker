import { HistoryPlayer } from "@/components/map/history-player";

export default function HistoryPage() {
  return (
    <div className="h-[calc(100vh-8rem)]">
      <h1 className="text-2xl font-bold mb-4">Historico de Rotas</h1>
      <HistoryPlayer />
    </div>
  );
}
