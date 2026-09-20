// Index d'embeddings côté client : charge embed.bin (format GPXE : 512-d int8
// + échelle par carte) et embed.json (métadonnées d'affichage), puis cherche
// la carte la plus proche en cosinus. ~40 ms pour 100k cartes, en local.
export type NeuralCard = {
  id: string;
  lang: string;
  name: string;
  setId: string;
  setName: string;
  localId: string;
  image: string;
};
export type NeuralHit = NeuralCard & { cos: number };

export class NeuralIndex {
  dim = 512;
  count = 0;
  private q8: Int8Array = new Int8Array(0);
  private scale: Float32Array = new Float32Array(0);
  cards: NeuralCard[] = [];
  loaded = false;

  async load(binUrl: string, jsonUrl: string): Promise<void> {
    const [bin, meta] = await Promise.all([
      fetch(binUrl).then((r) => r.arrayBuffer()),
      fetch(jsonUrl).then((r) => r.json()),
    ]);
    const dv = new DataView(bin);
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== "GPXE") throw new Error("index");
    this.count = dv.getUint32(8, true);
    this.dim = dv.getUint32(12, true);
    const per = this.dim + 4;
    const bytes = new Int8Array(bin);
    this.q8 = new Int8Array(this.count * this.dim);
    this.scale = new Float32Array(this.count);
    for (let c = 0; c < this.count; c++) {
      const off = 16 + c * per;
      this.q8.set(bytes.subarray(off, off + this.dim), c * this.dim);
      this.scale[c] = dv.getFloat32(off + this.dim, true);
    }
    this.cards = (meta.cards as unknown[][]).map((a) => ({
      id: a[0] as string,
      lang: a[1] as string,
      name: a[2] as string,
      setId: a[3] as string,
      setName: a[4] as string,
      localId: a[5] as string,
      image: a[6] as string,
    }));
    this.loaded = true;
  }

  /** Carte(s) la/les plus proche(s) d'un embedding requête (Float32Array L2-normalisé). */
  search(q: Float32Array, k = 3): NeuralHit[] {
    const { dim, count, q8, scale } = this;
    // Requête quantifiée int8 : produit int8·int8 (comme l'index), rapide.
    let mx = 0;
    for (let i = 0; i < dim; i++) {
      const a = Math.abs(q[i]);
      if (a > mx) mx = a;
    }
    const qs = (mx || 1) / 127;
    const qq = new Int8Array(dim);
    for (let i = 0; i < dim; i++) qq[i] = Math.max(-127, Math.min(127, Math.round(q[i] / qs)));
    const best: { i: number; cos: number }[] = [];
    for (let c = 0; c < count; c++) {
      let s = 0;
      const o = c * dim;
      for (let d = 0; d < dim; d++) s += q8[o + d] * qq[d];
      const cos = s * scale[c] * qs;
      if (best.length < k) {
        best.push({ i: c, cos });
        if (best.length === k) best.sort((a, b) => a.cos - b.cos);
      } else if (cos > best[0].cos) {
        best[0] = { i: c, cos };
        best.sort((a, b) => a.cos - b.cos);
      }
    }
    best.sort((a, b) => b.cos - a.cos);
    return best.map(({ i, cos }) => ({ ...this.cards[i], cos }));
  }
}
