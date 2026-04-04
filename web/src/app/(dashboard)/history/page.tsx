import { HistoryPlayer } from "@/components/map/history-player";

export default function HistoryPage() {
  return (
    <div className="h-[calc(100dvh-12rem)] lg:h-[calc(100vh-8rem)]">
      <h1 className="text-xl lg:text-2xl font-bold mb-3 lg:mb-4">Histórico de Rotas</h1>
      <HistoryPlayer />
    </div>
  );
}
