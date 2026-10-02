export class Floor1Error extends Error {
  constructor(readonly code: string, message: string, readonly status = 0, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "Floor1Error";
  }
}
