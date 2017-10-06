[![Build Status](https://travis-ci.org/flexport/mutation-sentinel.svg?branch=master)](https://travis-ci.org/flexport/mutation-sentinel)
[![codecov](https://codecov.io/gh/flexport/mutation-sentinel/branch/master/graph/badge.svg)](https://codecov.io/gh/flexport/mutation-sentinel)

# Mutation Sentinel

Mutation Sentinel helps you *deeply* detect mutations at runtime and enforce immutability in your codebase.

## Motivation

So you decided to optimize your React app with PureComponents, but you also know that [mutations can cause stale rendering bugs](https://flexport.engineering/optimizing-react-rendering-part-1-9634469dca02) when mixed with PureComponents. Mutation Sentinel allows you to incrementally detect and fix the mutations in your code, and enforce immutability along the way.

## Installation

```
npm install --save mutation-sentinel
```

## Usage

Wrap object (including arrays) and functions with `makeSentinel` to detect mutations. Calling `makeSentinel` with a value that cannot be wrapped will simply return the value itself.

```js
import makeSentinel from "mutation-sentinel";
// const makeSentinel = require("mutation-sentinel").default;

const obj = {};
const wrappedObj = makeSentinel(obj);
wrappedObj.value = "oops";
// console: Mutation detected by a sentinel!
```

This also works with arrays:

```js
const array = [];
const wrappedArray = makeSentinel(array);
wrappedArray.push("oops");
// console: Mutation detected by a sentinel!
```

And even deeply nested objects!

```js
const obj = {array: [{}]};
const wrappedObj = makeSentinel(obj);
wrappedObj.array[0].value = "oops";
// console: Mutation detected by a sentinel!
```

Best of all, the stack trace gives you the *exact* line in the code where the mutation occurs :astonished:

```js
function foo(obj) {
  bar(obj);
}

function bar(obj) {
  obj.value = "oops";
}

const obj = {};
const wrappedObj = makeSentinel(obj);
foo(wrappedObj);

// console: Mutation detected by a sentinel!
// Stack trace:
//   ...
//   bar         @ VM478:6  <-- Mutation
//   foo         @ VM478:2
//   (anonymous) @ VM478:11
```

## Configuration

Your army of sentinels can be reconfigured globally at any time:

```js
import {configureSentinels} from "mutation-sentinel";
// const configureSentinels = require("mutation-sentinel").configureSentinels;

configureSentinels({
  shouldIgnore: obj => {
    // return true to NOT wrap obj with a sentinel
  },
  mutationHandler: mutation => {
    // respond to the mutation however you want
  }
});
```

[Here is an example configuration](https://gist.github.com/dounan/207cc05e47a97e22494739fcb42e2c3c)

The `mutation` object in `mutationHandler` has the following flow type:

```js
type Mutation =
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

// Only objects (including arrays) and functions will be wrapped by sentinels.
type Observable = {} | (() => mixed);
```

## Browser Compatibility

This library relies on [the Proxy object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy). For browsers that do not [support Proxies](http://caniuse.com/#feat=proxy), `makeSentinel` simply returns the original object and no mutation detection occurs.

## Flexport's Use Case

Due to the size of Flexport’s app, we decided to purify our components incrementally. Since the sentinels can be reconfigured dynamically, we enabled and disabled the `mutationHandler` on a route by route basis.

Here is the general approach that we took:
1. Wrap all of our flux store records with `makeSentinel`.
2. For the route we want to purify, configure the `mutationHandler` to log mutations to the console in development, and [Sentry](https://sentry.io) (our error reporting service) in production.
3. Deploy sentinels to production and fix the mutations as they are detected.
4. Once all the mutations are fixed, change `mutationHandler` to throw in development and no-op in production.

To fix the mutations, we used a combination of [array spreading](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_operator), [object spreading](https://github.com/tc39/proposal-object-rest-spread), and the [immutability-helper](https://github.com/kolodny/immutability-helper) library.

## Limitations

- Since the detection happens at runtime, sentinels can’t find mutations in code that isn’t executed. We left the detection on in production for about a month to catch as many mutations as possible.
- It wasn’t feasible to wrap every object in our app with a sentinel, which means the unwrapped objects are still susceptible to undetected mutations.

## Gotchas

- While a sentinel behaves the same as the original object, it is not equal to it.

```js
makeSentinel(myObj) !== myObj
```

- Shallow copies of sentinels are *not* themselves sentinels…but the nested objects of the shallow copy *are* sentinels.

```js
const obj = {nested: {}};
const wrappedObj = makeSentinel(obj);

// copiedObj is not a sentinel
const copiedObj = {...wrappedObj};
copiedObj.value = "oops"; // mutation is NOT detected

// copiedObj.nested is a sentinel because it was copied from wrappedObj
copiedObj.nested.value = "oops"; // MUTATION DETECTED!
```

- Appending a `File` that is wrapped by a sentinel to `FormData` does not work properly (tested on Mac Chrome 60.0.3112.113). We got around this issue by ignoring `File` instances in `shouldIgnore`.

```js
const file = new File(["some data"], "testfile");
const wrappedFile = makeSentinel(file);
const formData = new FormData();
formData.append("origFile", file);
formData.append("wrappedFile", wrappedFile);

formData.get("origFile");
// File {name: "testfile", …}
formData.get("wrappedFile");
// "[object File]" <--- ???
```

## Alternatives

Another option is to use static analysis to detect mutations (e.g. [eslint-plugin-immutable](https://github.com/jhusain/eslint-plugin-immutable)).

For us, this approach surfaced too many mutations and did not allow us to easily remove mutations on a route by route basis.
