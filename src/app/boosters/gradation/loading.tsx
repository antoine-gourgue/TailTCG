import { GameLoading } from "@/components/game/game-loading";

export default function Loading() {
  return (
    <GameLoading
      current="gradation"
      title="Gradation"
      subtitle="Coche des cartes et lance la gradation : 4 sous-notes, une note globale, et la carte passe sous boîtier."
      variant="grid"
    />
  );
}
