export type HarnessTestCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type HarnessTestJsonResult<TPayload> = HarnessTestCommandResult & {
  payload: TPayload;
};

export type HarnessTestPaths = {
  repoRoot: string;
  cli: string;
  tmpRoot: string;
};

export type WorkbenchRuntime = {
  url: string;
  csrf: string;
  stdout: string;
  stderr: string;
};

export type ZipFixtureEntry = {
  name: string;
  data: string | Uint8Array;
  method?: 0 | 8;
  compressedData?: Uint8Array;
  compressedSize?: number;
  uncompressedSize?: number;
  flags?: number;
  externalAttributes?: number;
};
