/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authShared from "../authShared.js";
import type * as authz from "../authz.js";
import type * as clients from "../clients.js";
import type * as dates from "../dates.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as interactions from "../interactions.js";
import type * as invitationEmail from "../invitationEmail.js";
import type * as passwordChangedEmail from "../passwordChangedEmail.js";
import type * as passwordReset from "../passwordReset.js";
import type * as passwordResetEmail from "../passwordResetEmail.js";
import type * as provisionUsers from "../provisionUsers.js";
import type * as sales from "../sales.js";
import type * as seed from "../seed.js";
import type * as seguimientos from "../seguimientos.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authShared: typeof authShared;
  authz: typeof authz;
  clients: typeof clients;
  dates: typeof dates;
  email: typeof email;
  http: typeof http;
  interactions: typeof interactions;
  invitationEmail: typeof invitationEmail;
  passwordChangedEmail: typeof passwordChangedEmail;
  passwordReset: typeof passwordReset;
  passwordResetEmail: typeof passwordResetEmail;
  provisionUsers: typeof provisionUsers;
  sales: typeof sales;
  seed: typeof seed;
  seguimientos: typeof seguimientos;
  users: typeof users;
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
