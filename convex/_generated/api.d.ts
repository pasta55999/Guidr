/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as events from "../events.js";
import type * as fixtures_ftaTaxInvoice from "../fixtures/ftaTaxInvoice.js";
import type * as knowledge from "../knowledge.js";
import type * as lessons from "../lessons.js";
import type * as prompts from "../prompts.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as speech from "../speech.js";
import type * as tutor from "../tutor.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  events: typeof events;
  "fixtures/ftaTaxInvoice": typeof fixtures_ftaTaxInvoice;
  knowledge: typeof knowledge;
  lessons: typeof lessons;
  prompts: typeof prompts;
  seed: typeof seed;
  sessions: typeof sessions;
  speech: typeof speech;
  tutor: typeof tutor;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
