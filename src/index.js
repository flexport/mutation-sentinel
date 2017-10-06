// @flow

import makeSentinel, {configureSentinels, isSentinel} from "./makeSentinel";

import type {
  ShouldIgnore as _ShouldIgnore,
  Mutation as _Mutation,
  MutationHandler as _MutationHandler,
  SentinelOpts as _SentinelOpts,
} from "./makeSentinel";

export default makeSentinel;

export {configureSentinels, isSentinel};

export type ShouldIgnore = _ShouldIgnore;
export type Mutation = _Mutation;
export type MutationHandler = _MutationHandler;
export type SentinelOpts = _SentinelOpts;
