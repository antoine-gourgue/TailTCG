import { GameLoading } from "@/components/game/game-loading";

export default function Loading() {
  return (
    <GameLoading
      current="echanges"
      title="Échanges"
      subtitle="Une carte contre une carte de même rareté. Mets tes doubles à échanger et propose aux autres dresseurs."
      variant="grid"
    />
  );
}
