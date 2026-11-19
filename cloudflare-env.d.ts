declare namespace Cloudflare {
  interface Env {
    DATABASE_URL?: string;
    HYPERDRIVE?: { connectionString: string };
    BUCKET?: R2Bucket;
  }
}
