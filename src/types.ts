export type Template = {
  label: string;
  description?: string;
  body: string;
  source?: string;
  tags?: string[];
};

export type MirrorStatus = {
  name: string;
  url: string;
  ok: boolean;
  ms?: number;
  error?: string;
};
