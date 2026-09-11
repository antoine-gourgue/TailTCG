import { GameLoading } from "@/components/game/game-loading";

export default function Loading() {
  return (
    <GameLoading
      current="boosters"
      title="Boosters"
      subtitle="Ouvre autant de boosters que tu veux. 5 cartes du set de ton choix, un jeu à part : rien n'entre dans ta vraie collection."
      variant="packs"
    />
  );
}
