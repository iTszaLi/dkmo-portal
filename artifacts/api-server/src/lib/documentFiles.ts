import type { Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

const objectStorage = new ObjectStorageService();

/**
 * Extracts the internal object entity path ("/objects/…") from a stored file
 * URL such as "/api/storage/public-objects/objects/uuid" or
 * "/api/storage/objects/uuid".
 */
export function extractObjectEntityPath(fileUrl: string): string | null {
  const m = fileUrl.match(/\/(objects\/.+)$/);
  return m ? `/${m[1]}` : null;
}

/** True when a fileUrl is one of our own permission-checked API endpoints. */
export function isApiFileUrl(fileUrl: string | undefined): boolean {
  return typeof fileUrl === "string" && fileUrl.startsWith("/api/documents/");
}

/**
 * Streams a stored object to the response, after the caller has performed
 * all permission checks. Sends 404 if the file cannot be resolved.
 */
export async function streamStoredFile(res: Response, fileUrl: string, fileName?: string): Promise<void> {
  const objectPath = extractObjectEntityPath(fileUrl);
  if (!objectPath) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  try {
    const file = await objectStorage.getObjectEntityFile(objectPath);
    const response = await objectStorage.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (fileName) {
      res.setHeader("Content-Disposition", `inline; filename="${fileName.replace(/["\\]/g, "")}"`);
    }
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    throw err;
  }
}
