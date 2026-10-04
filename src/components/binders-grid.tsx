"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEur } from "@/lib/domain";
import { reorderBinders } from "@/app/classeurs/actions";
import { BinderCover, type CoverItem } from "@/components/binder-cover";
import { Toast } from "@/components/toast";
import type { CoverTexture } from "@/lib/binder-design";
import type { CoverRender } from "@/lib/binder-cover";

export type BinderTile = {
  id: string;
  name: string;
  style: string | null;
  colorHex: string | null;
  texture: CoverTexture;
  layout: CoverRender | null;
  count: number;
  value: number | null;
  covers: CoverItem[];
};

// Grille des classeurs, réordonnable par glisser-déposer (desktop)
export function BindersGrid({ binders }: { binders: BinderTile[] }) {
  const router = useRouter();
  const byId = new Map(binders.map((b) => [b.id, b]));
  const [ids, setIds] = useState(binders.map((b) => b.id));
  const idsRef = useRef(ids);
  const dragFrom = useRef<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function moveTo(target: number) {
    const from = dragFrom.current;
    if (from == null || from === target) return;
    setIds((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      idsRef.current = next;
      return next;
    });
    dragFrom.current = target;
  }

  async function persist() {
    setDragging(null);
    dragFrom.current = null;
    const { error } = await reorderBinders(idsRef.current);
    setToast(error ? "Ordre non enregistré" : "Ordre enregistré");
    router.refresh();
  }

  return (
    <>
      <ul className="rise-in grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
        {ids.map((id, i) => {
          const b = byId.get(id);
          if (!b) return null;
          return (
            <li
              key={id}
              draggable
              onDragStart={(e) => {
                dragFrom.current = i;
                setDragging(id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => moveTo(i)}
              onDragEnd={persist}
              className={`transition-opacity ${
                dragging === id ? "opacity-40" : ""
              }`}
            >
              <Link
                href={`/classeurs/${b.id}`}
                draggable={false}
                title="Glisser pour réordonner"
                className="group block cursor-grab active:cursor-grabbing"
              >
                <div className="overflow-hidden rounded-2xl shadow-[0_18px_40px_rgba(0,0,0,.45)] ring-1 ring-white/[0.08] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_26px_50px_rgba(0,0,0,.55)]">
                  <BinderCover style={b.style} covers={b.covers} name={b.name} colorHex={b.colorHex} texture={b.texture} layout={b.layout} />
                </div>
                <p className="mt-3 truncate text-sm font-semibold group-hover:text-accent-strong sm:text-base">{b.name}</p>
                <p className="num mt-0.5 flex items-baseline justify-between gap-2 text-xs text-muted">
                  <span>
                    {b.count} carte{b.count > 1 ? "s" : ""}
                  </span>
                  {b.value != null && <span className="font-semibold text-foreground">{formatEur(b.value)}</span>}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
