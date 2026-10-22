import PocketBase from "pocketbase";

const baseURL =
  import.meta.env.VITE_API_BASE_URL || window.location.origin;

export const pb = new PocketBase(baseURL);

// Let callers decide when a request should be cancelled.
pb.autoCancellation(false);
