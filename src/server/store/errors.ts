/** An error the user should see, with the HTTP status the route handler returns. */
export class StoreError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}
