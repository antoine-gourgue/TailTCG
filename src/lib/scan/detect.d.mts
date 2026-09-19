export declare const CARD_W: number;
export declare const CARD_H: number;
export type Pt = [number, number];
export type QuadCandidate = { corners: Pt[]; area: number; ratio: number; support: number; minSide: number; rim: number; through: number; contains?: boolean; score: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DetectDebug = { closed?: number; hough?: number; lines?: unknown[]; edges?: any; blur?: any; evaluate?: (q: Pt[]) => unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function detectCardQuads(cv: any, src: any, k?: number, debug?: DetectDebug): QuadCandidate[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function detectCardQuad(cv: any, src: any, debug?: DetectDebug): QuadCandidate | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function warpCard(cv: any, src: any, corners: Pt[]): any;
