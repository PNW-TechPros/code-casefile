# The "Prop Shaft" Pattern

"Prop drilling" in JSX (usually React) code becomes quite an annoyance when multiple properties need to be drilled through large numbers of component layers.  It also creates a problem of "shotgun surgery," where each additional drilled prop requires editing several components to pass on the additional property.

## Corralling the Problem

Instead of drilling individual props through multiple layers, choose one consistent property name (`ps` is suggested, if not in use) and use it as the "prop shaft:" each participating component accepts `ps` (with an empty-Object default) and passed that prop on to all children (all the ones that would need to participate in the prop drilling, at least).  This property name should be consistent throughout the entire codebase.

Individual properties of `ps` serve as poor man's contexts.  Adding contexts should be done by spreading `ps` in a new Object literal and adding the new context property:

```jsx
<Child ps={{...ps, newContext='foo'}} />
```

## Where to Apply This Pattern

Trees!  If your code builds a tree where some of the component instances can contain instances of the same component as descendants.  This is the most typical case driving significant prop drilling.  The nodes need to participate in the prop shaft, as do any components that appear between the levels of nodes.

## Advantages Over Naïve Prop Drilling

* Because the property used for the prop shaft is named the same everywhere it is used, components simply opt in to the prop shaft and don't have to worry about coupling tighly with parent and children components.
* Since the pattern is consistent, all developers will quickly learn to see the prop shaft property for its intent and understand that properties added to its value propagate as far down the component tree as there is opt-in to the prop shaft.
* The need for shotgun surgery to add more drilled values/context is reduced to only the first time a component needs a value from the prop shaft, and only extends up the component tree to the nearest ancestor participating in the the prop shaft.
* Components participating in the prop shaft without *contributing* to it take a one-time code hit to add the `ps` propagation, but become no more complex no matter how much context is passed via the prop shaft.
* Unlike state management systems (e.g. Redux), a prop shaft is pure JSX and does not introduce dependencies for testing.

## Helpful Hints

These assume `ps` has been chosen as the prop shaft property in example code.  Substitute your choice for prop shaft property as needed.

* Accept the prop shaft property with an empty Object default: `ps = {}`
* If no additions to the prop shaft are needed, pass it to any relevant children as the same prop: `{...{ps}}` is the DRYest form, though `ps={ps}` works, too
* Add a property to the shaft by spreading the existing shaft value into a fresh Object: `ps={{...ps, newProp: 'foo'}}`
* **Assume properties in the shaft can be missing**: this reduces coupling with containg components and simplifies creating test cases