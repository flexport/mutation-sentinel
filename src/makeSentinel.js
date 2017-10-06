// @flow

import isWeakMapAvailable from "./isWeakMapAvailable";

// =============================================================================
// Global configuration
// =============================================================================

type FullSentinelOpts = {|
  shouldIgnore: ShouldIgnore,
  mutationHandler: MutationHandler,
|};

export type SentinelOpts = {|
  shouldIgnore?: ShouldIgnore | void,
  mutationHandler?: MutationHandler | void,
|};

export type ShouldIgnore = mixed => boolean;
export type MutationHandler = Mutation => void;

// Flow core.js uses the weak Object types for these.
/* eslint-disable flowtype/no-weak-types */
export type Mutation =
  | {|
      type: "defineProperty",
      target: Observable,
      property: string,
      descriptor: Object,
    |}
  | {|
      type: "deleteProperty",
      target: Observable,
      property: string,
    |}
  | {|
      type: "set",
      target: Observable,
      property: string,
      value: any,
    |}
  | {|
      type: "setPrototypeOf",
      target: Observable,
      property: "[[Prototype]]",
      prototype: ?Object,
    |};
/* eslint-enable flowtype/no-weak-types */

type Observable = {} | (() => mixed);

// Visible for testing
export const _globalOpts: FullSentinelOpts = {
  shouldIgnore: falseFn,
  mutationHandler: _defaultMutationHandler,
};

export function configureSentinels(opts: SentinelOpts) {
  _globalOpts.shouldIgnore =
    typeof opts.shouldIgnore === "function" ? opts.shouldIgnore : falseFn;
  _globalOpts.mutationHandler =
    typeof opts.mutationHandler === "function"
      ? opts.mutationHandler
      : _defaultMutationHandler;
}

function falseFn() {
  return false;
}

// =============================================================================
// makeSentinel
// =============================================================================

// Map a non-sentinel value to its sentinel counterpart.
// By using this cache we can guarantee the invariant that for a single object
// reference, there will ever only be one corresponding sentinel.
//
// There is no way to type the WeakMap to enforce that a key/value pair has the
// same type for the key and value, but allow different types of key/value
// pairs in the map. Therefore we type the value as `any` and make sure that in
// our code we enforce that we only cache <T, T> key/value pairs (or more
// specifically, <T, Proxy<T>> pairs).
type SentinelCache = WeakMap<Observable, any>;
const _sentinelCache: SentinelCache | void = isWeakMapAvailable
  ? new WeakMap()
  : undefined;

// This really just needs to be a set, but not all browsers that support Proxy
// support WeakSet, but they all support WeakMap.
type KnownSentinels = WeakMap<Observable, boolean>;
const _knownSentinels: KnownSentinels | void = isWeakMapAvailable
  ? new WeakMap()
  : undefined;

/**
 * Returns a Proxy for the value if it is possible to watch for mutations on
 * the value. Otherwise, return the value itself.
 *
 * Since our sentinel Proxy does not change the object in any way, including
 * the flow types, we can force the return type to always be T.
 */
export default function makeSentinel<T>(value: T): T {
  if (
    typeof Proxy === "undefined" ||
    _sentinelCache == null ||
    _knownSentinels == null ||
    value == null ||
    (typeof value !== "object" && typeof value !== "function") ||
    _globalOpts.shouldIgnore(value)
  ) {
    return value;
  }

  const knownSentinels = _knownSentinels;
  const sentinelCache = _sentinelCache;

  if (knownSentinels.has(value)) {
    return value;
  }

  const cachedSentinel = sentinelCache.get(value);
  if (cachedSentinel != null) {
    return cachedSentinel;
  }

  const sentinel = new Proxy(value, {
    get: (target, property, receiver) => {
      const targetVal = target[property];
      if (_canMakeNestedSentinel(target, property, targetVal, knownSentinels)) {
        return makeSentinel(targetVal);
      } else {
        return targetVal;
      }
    },
    defineProperty: (target, property, descriptor) => {
      const curDescriptor = Object.getOwnPropertyDescriptor(target, property);
      // We consider any property that has a getter as mutating because that
      // getter can return any value.
      if (
        curDescriptor == null ||
        curDescriptor.value !== descriptor.value ||
        descriptor.get
      ) {
        _globalOpts.mutationHandler({
          type: "defineProperty",
          target,
          property,
          descriptor,
        });
      }
      Object.defineProperty(target, property, descriptor);
      return true;
    },
    deleteProperty: (target, property) => {
      if (Object.prototype.hasOwnProperty.call(target, property)) {
        _globalOpts.mutationHandler({
          type: "deleteProperty",
          target,
          property,
        });
      }
      return delete target[property];
    },
    set: (target, property, value, receiver) => {
      if (!_valueEq(target[property], value, sentinelCache)) {
        _globalOpts.mutationHandler({
          type: "set",
          target,
          property,
          value,
        });
      }
      target[property] = value;
      return true;
    },
    setPrototypeOf: (target, prototype) => {
      if (Object.getPrototypeOf(target) !== prototype) {
        _globalOpts.mutationHandler({
          type: "setPrototypeOf",
          target,
          property: "[[Prototype]]",
          prototype,
        });
      }
      Object.setPrototypeOf(target, prototype);
      return true;
    },
  });

  sentinelCache.set(value, sentinel);
  knownSentinels.set(sentinel, true);
  return sentinel;
}

/**
 * The `get` handler for a Proxy must enforce certain invariants:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/handler/get
 *
 * However, we only need to enforce the first invariant. The second invariant
 * deals with `undefined` values, which we don't try to wrap with a Sentinel
 * anyways.
 *
 * The invariant is enforced only on target's own properties, which means that
 * we don't need to check if a non-writable and non-configurable property with
 * the same name exists up the prototype chain.
 */
function _canMakeNestedSentinel<T>(
  target: T,
  property: string,
  targetVal: mixed,
  knownSentinels: KnownSentinels
): boolean {
  if (
    targetVal == null ||
    (typeof targetVal !== "object" && typeof targetVal !== "function") ||
    knownSentinels.has(targetVal)
  ) {
    return false;
  }
  const descriptor = Object.getOwnPropertyDescriptor(target, property);
  return descriptor && (descriptor.writable || descriptor.configurable);
}

/**
 * Returns true if curValue is equal to newValue or if newValue is the sentinel
 * version of curValue.
 */
function _valueEq(
  curValue: mixed,
  newValue: mixed,
  sentinelCache: SentinelCache
): boolean {
  if (curValue === newValue) {
    return true;
  }
  if (newValue == null || typeof newValue !== "object") {
    // newValue can't be a sentinel
    return false;
  }
  // It is legal to call WeakMap.get with any type, but flow doesn't like
  // it. Just cast to 'any' so we can avoid unnecessary typeof checking.
  return sentinelCache.get((curValue: any)) === newValue;
}

function _defaultMutationHandler(mutation: Mutation): void {
  // eslint-disable-next-line no-console
  console.warn("Mutation detected by a sentinel!", mutation);
}
