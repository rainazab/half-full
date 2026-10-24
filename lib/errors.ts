export class PipelineError extends Error {
  constructor(public code: string, message: string, public status = 502) {
    super(message);
    this.name = "PipelineError";
  }
}

export function publicError(error: unknown) {
  if (error instanceof PipelineError) return error;
  // SDK and validation errors can contain request content. Never return them verbatim.
  return new PipelineError("PIPELINE_FAILED", "The edition could not be generated. Inspect the last failed run-log stage; no new edition was published.");
}
