/**
 * The semantic palette, mirrored from the token sheet for the places that need
 * a colour as a value rather than a class — inline SVG fills and strokes.
 * Verdict colours mean their verdict and nothing else; `sig` is the one free
 * accent. Nothing here may be used decoratively.
 */
export const C = {
  fg: '#e6e8ee',
  mut: '#a9afbd',
  dim: '#8b93a7',
  sig: '#ff6a1a',
  sig2: '#ffb08a',
  l2: '#ff5c5c',
  l1: '#f5b400',
  l0: '#2fd07f',
  unk: '#8b93a7',
  border: '#1e2330',
  line: '#232733',
  node: '#131620',
} as const;

export type Verdict = 'l2' | 'l1' | 'l0' | 'unk';

export const VERDICT_LABEL: Record<Verdict, string> = {
  l2: 'L2 act now',
  l1: 'L1 imported',
  l0: 'L0 present only',
  unk: 'unscanned',
};
