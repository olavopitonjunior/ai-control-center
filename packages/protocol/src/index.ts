/**
 * @acc/protocol — the normalized data model and wire contract shared by the AI
 * Monitor Agent and the Surface control plane.
 *
 * Everything here is a zod schema paired with an inferred TypeScript type. Validate
 * at the boundary (agent output, Surface input) so malformed data is caught early
 * rather than corrupting the historical database.
 */
export const PROTOCOL_VERSION = "0.1.0";

export * from "./common";
export * from "./machine";
export * from "./usage";
export * from "./session";
export * from "./system";
export * from "./automation";
export * from "./snapshot";
export * from "./discovery";
