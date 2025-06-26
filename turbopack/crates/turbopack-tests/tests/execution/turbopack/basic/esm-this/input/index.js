const t = this

it('`this` in esm should be undefined', () => {
  // TODO: This is WRONG, it should be undefined
  expect(t).toBe(globalThis)
})

// Use a dummy export to ensure this is parsed as an esm module
export const foo = t
