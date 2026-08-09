"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEur } from "@/lib/domain";
import { reorderBinders } from "@/app/classeurs/actions";
import { BinderCover, type CoverItem } from "@/components/binder-cover";
import { Toast } from "@/components/toast";

export type BinderTile = {
  id: string;
  name: string;
  style: string | null;
  colorHex: string | null;
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
      <ul className="rise-in grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                className="panel group block cursor-grab overflow-hidden p-4 transition hover:border-edge-strong active:cursor-grabbing"
              >
                <BinderCover
                  style={b.style}
                  covers={b.covers}
                  name={b.name}
                  colorHex={b.colorHex}
                />
                <p className="mt-3 truncate text-base font-semibold group-hover:text-accent-strong">
                  {b.name}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  <span className="num">{b.count}</span> carte
                  {b.count > 1 ? "s" : ""}
                  {b.value != null && (
                    <>
                      {" "}
                      · <span className="num">{formatEur(b.value)}</span>
                    </>
                  )}
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
