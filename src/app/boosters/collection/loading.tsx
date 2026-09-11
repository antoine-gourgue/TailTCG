import { GameLoading } from "@/components/game/game-loading";

export default function Loading() {
  return (
    <GameLoading
      current="collection"
      title="Collection virtuelle"
      subtitle="Les cartes de tes boosters, à part de ta vraie collection."
      variant="list"
    />
  );
}
