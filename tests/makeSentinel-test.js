// @flow

import makeSentinel, {
  configureSentinels,
  isSentinel,
  _globalOpts,
  type SentinelOpts,
} from "../src/makeSentinel";

const withUpdatedSentinelOpts = (opts: SentinelOpts, body: () => void) => {
  const backup = {..._globalOpts};
  configureSentinels(opts);
  try {
    body();
  } finally {
    configureSentinels(backup);
  }
};

function withMockWarn(body: (mockWarn: () => void) => void) {
  /* eslint-disable no-console */
  const prevFn = console.warn;
  const mockFn = jest.fn();
  (console: any).warn = mockFn;
  try {
    body(mockFn);
  } finally {
    (console: any).warn = prevFn;
  }
  /* eslint-enable no-console */
}

describe("configureSentinels", () => {
  it("updates the global options correctly", () => {
    const shouldIgnore = jest.fn();
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({shouldIgnore, mutationHandler}, () => {
      expect(_globalOpts.shouldIgnore).toBe(shouldIgnore);
      expect(_globalOpts.mutationHandler).toBe(mutationHandler);
    });
  });

  it("does not set shouldIgnore if it is not a function", () => {
    const prevShouldIgnore = _globalOpts.shouldIgnore;
    withUpdatedSentinelOpts({mutationHandler: (1: any)}, () => {
      expect(_globalOpts.shouldIgnore).toBe(prevShouldIgnore);
    });
  });

  it("does not set mutationHandler if it is not a function", () => {
    const prevMutationHandler = _globalOpts.mutationHandler;
    withUpdatedSentinelOpts({mutationHandler: (1: any)}, () => {
      expect(_globalOpts.mutationHandler).toBe(prevMutationHandler);
    });
  });

  it("allows resetting shouldIgnore by setting to undefined", () => {
    const prevShouldIgnore = _globalOpts.shouldIgnore;
    withUpdatedSentinelOpts({shouldIgnore: jest.fn()}, () => {
      expect(_globalOpts.shouldIgnore).not.toBe(prevShouldIgnore);
      withUpdatedSentinelOpts({shouldIgnore: undefined}, () => {
        expect(_globalOpts.shouldIgnore).toBe(prevShouldIgnore);
      });
    });
  });

  it("allows resetting mutationHandler by setting to undefined", () => {
    const prevMutationHandler = _globalOpts.mutationHandler;
    withUpdatedSentinelOpts({mutationHandler: jest.fn()}, () => {
      expect(_globalOpts.mutationHandler).not.toBe(prevMutationHandler);
      withUpdatedSentinelOpts({mutationHandler: undefined}, () => {
        expect(_globalOpts.mutationHandler).toBe(prevMutationHandler);
      });
    });
  });
});

describe("makeSentinel", () => {
  it("does not wrap primitives", () => {
    expect(makeSentinel(null)).toBeNull();
    expect(makeSentinel(undefined)).toBeUndefined();
    expect(makeSentinel(1)).toBe(1);
    expect(makeSentinel("foo")).toBe("foo");
  });

  it("does not wrap object if shouldIgnore returns true", () => {
    const obj = {};
    const shouldIgnore = value => true;
    withUpdatedSentinelOpts({shouldIgnore}, () => {
      expect(makeSentinel(obj)).toBe(obj);
    });
  });

  it("does not wrap nested object if shouldIgnore returns true", () => {
    const obj = {
      nested: {
        skip: true,
      },
    };
    const shouldIgnore = value =>
      value != null && typeof value === "object" && !!value.skip;
    withUpdatedSentinelOpts({shouldIgnore}, () => {
      const sentinel = makeSentinel(obj);
      expect(sentinel).not.toBe(obj);
      expect(sentinel.nested).toBe(obj.nested);
    });
  });

  it("ignores shouldIgnore if it is not a function", () => {
    const obj = {};
    const shouldIgnore: any = 1;
    withUpdatedSentinelOpts({shouldIgnore}, () => {
      expect(makeSentinel(obj)).not.toBe(obj);
    });
  });

  it("does not re-wrap mutation sentinels", () => {
    const obj = {};
    const sentinel = makeSentinel(obj);
    const secondSentinel = makeSentinel(sentinel);
    expect(secondSentinel).toBe(sentinel);
  });

  it("get handler respects property invariants when accessing properties", () => {
    const obj = {
      regular: {},
      nonWritable: undefined,
      nonConfigurable: undefined,
      readonly: undefined,
    };
    Object.defineProperty(obj, "nonWritable", {
      configurable: true,
      value: {},
      writable: false,
    });
    Object.defineProperty(obj, "nonConfigurable", {
      configurable: false,
      value: {},
      writable: true,
    });
    Object.defineProperty(obj, "readonly", {
      configurable: false,
      value: {},
      writable: false,
    });
    const sentinel = makeSentinel(obj);
    // These are all be wrapped by a sentinel
    expect(sentinel.regular).not.toBe(obj.regular);
    expect(sentinel.nonWritable).not.toBe(obj.nonWritable);
    expect(sentinel.nonConfigurable).not.toBe(obj.nonConfigurable);
    // sentinel.readonly is not wrapped by a sentinel
    expect(sentinel.readonly).toBe(obj.readonly);
  });

  it("detects mutations via assignment", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {a: 1};
      const sentinel = makeSentinel(obj);
      sentinel.a = 2;
      expect(mutationHandler.mock.calls.length).toBe(1);
      expect(mutationHandler.mock.calls[0][0]).toEqual({
        type: "set",
        target: obj,
        property: "a",
        value: 2,
      });
    });
  });

  it("does not report mutation if assigning the same value", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {a: 1};
      const sentinel = makeSentinel(obj);
      sentinel.a = 1;
      expect(mutationHandler.mock.calls.length).toBe(0);
    });
  });

  it("detects mutations via assignment to new property", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {};
      const sentinel = makeSentinel(obj);
      sentinel.a = 2;
      expect(mutationHandler.mock.calls.length).toBe(1);
      expect(mutationHandler.mock.calls[0][0]).toEqual({
        type: "set",
        target: obj,
        property: "a",
        value: 2,
      });
    });
  });

  it("detects mutations via defineProperty on new property", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {};
      const sentinel = makeSentinel(obj);
      const descriptor = {value: 1};
      Object.defineProperty(sentinel, "a", descriptor);
      expect(mutationHandler.mock.calls.length).toBe(1);
      expect(mutationHandler.mock.calls[0][0]).toEqual({
        type: "defineProperty",
        target: obj,
        property: "a",
        descriptor,
      });
    });
  });

  it("detects mutations if defining a property with a new value", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {a: 1};
      const sentinel = makeSentinel(obj);
      const descriptor = {value: 100};
      Object.defineProperty(sentinel, "a", descriptor);
      expect(mutationHandler.mock.calls.length).toBe(1);
      expect(mutationHandler.mock.calls[0][0]).toEqual({
        type: "defineProperty",
        target: obj,
        property: "a",
        descriptor,
      });
    });
  });

  it("does not report mutation if defining a property with the same value", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {a: 1};
      const sentinel = makeSentinel(obj);
      Object.defineProperty(sentinel, "a", {value: 1});
      expect(mutationHandler.mock.calls.length).toBe(0);
    });
  });

  it("detects mutations if defining a property with a getter", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {a: undefined};
      const sentinel = makeSentinel(obj);
      // Flow has issues with defineProperty without a value
      // https://github.com/facebook/flow/issues/285
      /* eslint-disable flowtype/no-weak-types */
      const descriptor = ({get: () => undefined}: Object);
      /* eslint-enable flowtype/no-weak-types */
      Object.defineProperty(sentinel, "a", descriptor);
      expect(mutationHandler.mock.calls.length).toBe(1);
      expect(mutationHandler.mock.calls[0][0]).toEqual({
        type: "defineProperty",
        target: obj,
        property: "a",
        descriptor,
      });
    });
  });

  it("detects mutations via deletion", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {a: 1};
      const sentinel = makeSentinel(obj);
      delete sentinel.a;
      expect(mutationHandler.mock.calls.length).toBe(1);
      expect(mutationHandler.mock.calls[0][0]).toEqual({
        type: "deleteProperty",
        target: obj,
        property: "a",
      });
    });
  });

  it("detects mutations via setPrototypeOf", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {};
      const sentinel = makeSentinel(obj);
      const prototype = {};
      Object.setPrototypeOf(sentinel, prototype);
      expect(mutationHandler.mock.calls.length).toBe(1);
      expect(mutationHandler.mock.calls[0][0]).toEqual({
        type: "setPrototypeOf",
        target: obj,
        property: "[[Prototype]]",
        prototype,
      });
    });
  });

  it("does not detect mutations via setPrototypeOf with same prototype", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {};
      const sentinel = makeSentinel(obj);
      Object.setPrototypeOf(sentinel, Object.prototype);
      expect(mutationHandler.mock.calls.length).toBe(0);
    });
  });

  it("detects mutations in nested objects", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {
        nested: {},
      };
      const sentinel = makeSentinel(obj);
      sentinel.nested.a = 2;
      expect(mutationHandler.mock.calls.length).toBe(1);
      expect(mutationHandler.mock.calls[0][0]).toEqual({
        type: "set",
        target: obj.nested,
        property: "a",
        value: 2,
      });
    });
  });

  it("does not report mutations when setting a property to the sentinel version of itself", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {
        nested: {},
      };
      const sentinel = makeSentinel(obj);
      const nestedSentinel = sentinel.nested;
      expect(nestedSentinel).not.toBe(obj.nested);
      // Setting nested to a sentinel representation of itself
      sentinel.nested = nestedSentinel;
      expect(mutationHandler.mock.calls.length).toBe(0);
    });
  });

  it("detects mutations in functions", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const fn = () => {};
      const sentinel = makeSentinel(fn);
      sentinel.a = 2;
      expect(mutationHandler.mock.calls.length).toBe(1);
      expect(mutationHandler.mock.calls[0][0]).toEqual({
        type: "set",
        target: fn,
        property: "a",
        value: 2,
      });
    });
  });

  it("detects mutation attempts on frozen objects", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {};
      Object.freeze(obj);
      const sentinel = makeSentinel(obj);
      try {
        sentinel.a = 2;
      } catch (e) {
        // Do nothing
      }
      expect(mutationHandler.mock.calls.length).toBe(1);
      expect(mutationHandler.mock.calls[0][0]).toEqual({
        type: "set",
        target: obj,
        property: "a",
        value: 2,
      });
    });
  });

  it("does not detect mutations in shallow copy", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {a: 1};
      const sentinel = makeSentinel(obj);
      const copied = {...sentinel};
      copied.a = 2;
      expect(mutationHandler.mock.calls.length).toBe(0);
    });
  });

  it("detects mutations in nested props after shallow copy", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {nested: {a: 1}};
      const sentinel = makeSentinel(obj);
      const copied = {...sentinel};
      copied.nested.a = 2;
      expect(mutationHandler.mock.calls.length).toBe(1);
      expect(mutationHandler.mock.calls[0][0]).toEqual({
        type: "set",
        target: obj.nested,
        property: "a",
        value: 2,
      });
    });
  });

  it("uses the cached sentinel when called with the same object", () => {
    const obj = {};
    const sentinel1 = makeSentinel(obj);
    const sentinel2 = makeSentinel(obj);
    expect(sentinel1).toBe(sentinel2);
  });

  it("handles assigning to falsey value", () => {
    const mutationHandler = jest.fn();
    withUpdatedSentinelOpts({mutationHandler}, () => {
      const obj = {a: 1};
      const sentinel = makeSentinel(obj);
      expect(() => (sentinel.a = NaN)).not.toThrow();
    });
  });

  it("reports mutations to console.warn by default", () => {
    withMockWarn(mockWarn => {
      const obj = {a: 1};
      const sentinel = makeSentinel(obj);
      expect(mockWarn.mock.calls.length).toBe(0);
      sentinel.a = 2;
      expect(mockWarn.mock.calls.length).toBe(1);
    });
  });
});

describe("isSentinel", () => {
  it("returns false for null and undefined", () => {
    expect(isSentinel(null)).toBe(false);
    expect(isSentinel(undefined)).toBe(false);
  });

  it("returns false for primititives", () => {
    expect(isSentinel(true)).toBe(false);
    expect(isSentinel(1)).toBe(false);
    expect(isSentinel("hi")).toBe(false);
  });

  it("returns false for objects", () => {
    expect(isSentinel({})).toBe(false);
    expect(isSentinel([])).toBe(false);
  });

  it("returns false for functions", () => {
    expect(isSentinel(function() {})).toBe(false);
  });

  it("returns true for sentinels", () => {
    const sentinel = makeSentinel({});
    expect(isSentinel(sentinel)).toBe(true);
  });
});
