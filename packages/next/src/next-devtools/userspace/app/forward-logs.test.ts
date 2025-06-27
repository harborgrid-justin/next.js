import { UNDEFINED_MARKER } from '../../shared/forward-logs-shared'
import {
  safeClone,
  PROMISE_MARKER,
  UNAVAILABLE_MARKER,
  logStringify,
} from './forward-logs'

const safeStringify = (data: unknown) => logStringify(safeClone(data))

describe('forward-logs serialization', () => {
  describe('safeClone', () => {
    it('should handle undefined values', () => {
      console.log('this is what we expect, right?', safeClone(undefined))

      expect(safeClone(undefined)).toBe(UNDEFINED_MARKER)
    })

    it('should handle null values', () => {
      expect(safeClone(null)).toBe(null)
    })

    it('should handle primitive values', () => {
      expect(safeClone(42)).toBe(42)
      expect(safeClone('hello')).toBe('hello')
      expect(safeClone(true)).toBe(true)
      expect(safeClone(false)).toBe(false)
    })

    it('should handle simple objects', () => {
      const obj = { a: 1, b: 'test' }
      const cloned = safeClone(obj)
      expect(cloned).toEqual({ a: 1, b: 'test' })
    })

    it('should handle objects with undefined properties', () => {
      const obj = { a: 1, b: undefined, c: 'test' }
      const cloned = safeClone(obj)
      expect(cloned).toEqual({ a: 1, b: UNDEFINED_MARKER, c: 'test' })
    })

    it('should handle circular references', () => {
      const obj: any = { a: 1 }
      obj.self = obj
      const cloned = safeClone(obj)
      expect(cloned.a).toBe(1)
      expect(cloned.self).toBe(cloned)
    })

    it('should handle complex circular references', () => {
      const obj1: any = { name: 'obj1' }
      const obj2: any = { name: 'obj2' }
      obj1.ref = obj2
      obj2.ref = obj1

      const cloned = safeClone(obj1)
      expect(cloned.name).toBe('obj1')
      expect(cloned.ref.name).toBe('obj2')
      expect(cloned.ref.ref).toBe(cloned)
    })

    it('should handle promises', () => {
      const promise = Promise.resolve(42)
      expect(safeClone(promise)).toBe(PROMISE_MARKER)
    })

    it('should handle async functions', () => {
      const asyncFn = async () => 42
      expect(safeClone(asyncFn)).toBe(asyncFn)
    })

    it('should handle arrays', () => {
      const arr = [1, 'test', undefined, null]
      const cloned = safeClone(arr)
      expect(cloned).toEqual([1, 'test', UNDEFINED_MARKER, null])
    })

    it('should handle arrays with circular references', () => {
      const arr: any[] = [1, 2]
      arr.push(arr)
      const cloned = safeClone(arr)
      expect(cloned[0]).toBe(1)
      expect(cloned[1]).toBe(2)
      expect(cloned[2]).toBe(cloned)
    })

    it('should handle super deep objects', () => {
      let deepObj: any = { value: 'start' }
      for (let i = 0; i < 1000; i++) {
        deepObj = { nested: deepObj, level: i }
      }

      const cloned = safeClone(deepObj)
      expect(cloned.level).toBe(999)
      expect(cloned.nested.level).toBe(998)
    })

    it('should handle objects with getters that throw', () => {
      const obj = {
        normalProp: 'works',
        get throwingGetter() {
          throw new Error('Getter throws')
        },
      }

      const cloned = safeClone(obj)
      expect(cloned.normalProp).toBe('works')
      expect(cloned.throwingGetter).toBe(UNAVAILABLE_MARKER)
    })

    it('should handle proxies that throw', () => {
      const target = { a: 1, b: 2 }
      const throwingProxy = new Proxy(target, {
        get() {
          throw new Error('Proxy throws')
        },
      })

      const cloned = safeClone(throwingProxy)
      expect(cloned.a).toBe(UNAVAILABLE_MARKER)
      expect(cloned.b).toBe(UNAVAILABLE_MARKER)
    })

    it('should handle functions', () => {
      const fn = function namedFunction() {
        return 42
      }
      const cloned = safeClone(fn)
      expect(cloned).toBe(fn)
    })

    it('should handle arrow functions', () => {
      const arrowFn = () => 42
      const cloned = safeClone(arrowFn)
      expect(cloned).toBe(arrowFn)
    })

    it('should handle Date objects', () => {
      const date = new Date('2023-01-01')
      const cloned = safeClone(date)
      expect(cloned).toBe('[object Date]')
    })

    it('should handle RegExp objects', () => {
      const regex = /test/gi
      const cloned = safeClone(regex)
      expect(cloned).toBe('[object RegExp]')
    })

    it('should handle Error objects', () => {
      const error = new Error('Test error')
      const cloned = safeClone(error)
      expect(cloned).toBe('[object Error]')
    })

    it('should handle Map objects', () => {
      const map = new Map([['key', 'value']])
      const cloned = safeClone(map)
      expect(cloned).toBe('[object Map]')
    })

    it('should handle Set objects', () => {
      const set = new Set([1, 2, 3])
      const cloned = safeClone(set)
      expect(cloned).toBe('[object Set]')
    })

    it('should handle WeakMap objects', () => {
      const weakMap = new WeakMap()
      const cloned = safeClone(weakMap)
      expect(cloned).toBe('[object WeakMap]')
    })

    it('should handle WeakSet objects', () => {
      const weakSet = new WeakSet()
      const cloned = safeClone(weakSet)
      expect(cloned).toBe('[object WeakSet]')
    })

    it('should handle typed arrays', () => {
      const typedArray = new Uint8Array([1, 2, 3])
      const cloned = safeClone(typedArray)
      expect(cloned).toBe('[object Uint8Array]')
    })

    it('should handle ArrayBuffer', () => {
      const buffer = new ArrayBuffer(16)
      const cloned = safeClone(buffer)
      expect(cloned).toBe('[object ArrayBuffer]')
    })

    it('should handle symbols', () => {
      const symbol = Symbol('test')
      const cloned = safeClone(symbol)
      expect(cloned).toBe(symbol)
    })

    it('should handle BigInt', () => {
      const bigInt = BigInt('123456789012345678901234567890')
      const cloned = safeClone(bigInt)
      expect(cloned).toBe(bigInt)
    })

    it('should handle objects with symbol keys', () => {
      const sym = Symbol('key')
      const obj = { [sym]: 'value', normalKey: 'normal' }
      const cloned = safeClone(obj)
      expect(cloned).toEqual({ normalKey: 'normal' })
    })

    it('should handle objects with non-enumerable properties', () => {
      const obj = { visible: 'yes' }
      Object.defineProperty(obj, 'hidden', {
        value: 'no',
        enumerable: false,
      })

      const cloned = safeClone(obj)
      expect(cloned).toEqual({ visible: 'yes' })
    })

    it('should handle frozen objects', () => {
      const obj = Object.freeze({ a: 1, b: 2 })
      const cloned = safeClone(obj)
      expect(cloned).toEqual({ a: 1, b: 2 })
    })

    it('should handle sealed objects', () => {
      const obj = Object.seal({ a: 1, b: 2 })
      const cloned = safeClone(obj)
      expect(cloned).toEqual({ a: 1, b: 2 })
    })

    it('should handle objects with complex prototype chains', () => {
      class Parent {
        parentProp = 'parent'
      }
      class Child extends Parent {
        childProp = 'child'
      }

      const instance = new Child()
      const cloned = safeClone(instance)
      expect(cloned).toBe('[object Object]')
    })

    it('should handle mixed complex scenarios', () => {
      const promise = Promise.resolve(42)
      const circular: any = { name: 'circular' }
      circular.self = circular

      const complex = {
        number: 42,
        string: 'test',
        undef: undefined,
        nullVal: null,
        promise,
        circular,
        array: [1, undefined, promise],
        nested: {
          deep: {
            value: 'deep',
          },
        },
      }

      const cloned = safeClone(complex)
      expect(cloned.number).toBe(42)
      expect(cloned.string).toBe('test')
      expect(cloned.undef).toBe(UNDEFINED_MARKER)
      expect(cloned.nullVal).toBe(null)
      expect(cloned.promise).toBe(PROMISE_MARKER)
      expect(cloned.circular.name).toBe('circular')
      expect(cloned.circular.self).toBe(cloned.circular)
      expect(cloned.array).toEqual([1, UNDEFINED_MARKER, PROMISE_MARKER])
      expect(cloned.nested.deep.value).toBe('deep')
    })
  })

  describe('safeStringify', () => {
    it('should stringify simple values', () => {
      expect(safeStringify(42)).toBe('42')
      expect(safeStringify('hello')).toBe('"hello"')
      expect(safeStringify(true)).toBe('true')
      expect(safeStringify(null)).toBe('null')
    })

    it('should handle undefined as UNDEFINED_MARKER', () => {
      const result = safeStringify(undefined)
      expect(result).toBe(`"${UNDEFINED_MARKER}"`)
    })

    it('should handle objects with undefined properties', () => {
      const obj = { a: 1, b: undefined }
      const result = safeStringify(obj)
      expect(result).toBe(`{"a":1,"b":"${UNDEFINED_MARKER}"}`)
    })

    it('should handle promises as PROMISE_MARKER', () => {
      const promise = Promise.resolve(42)
      const result = safeStringify(promise)
      expect(result).toBe(`"${PROMISE_MARKER}"`)
    })

    it('should handle circular references', () => {
      const obj: any = { a: 1 }
      obj.self = obj
      const result = safeStringify(obj)
      expect(typeof result).toBe('string')
    })

    it('should handle arrays with problematic elements', () => {
      const arr = [1, undefined, Promise.resolve(42), 'normal']
      const result = safeStringify(arr)
      expect(result).toBe(
        `[1,"${UNDEFINED_MARKER}","${PROMISE_MARKER}","normal"]`
      )
    })

    it('should handle getters that throw', () => {
      const obj = {
        normal: 'works',
        get throwing() {
          throw new Error('Getter error')
        },
      }

      const result = safeStringify(obj)
      expect(result).toBe(
        `{"normal":"works","throwing":"${UNAVAILABLE_MARKER}"}`
      )
    })

    it('should handle very deep objects', () => {
      let deep: any = { value: 'bottom' }
      for (let i = 0; i < 100; i++) {
        deep = { level: i, nested: deep }
      }

      const result = safeStringify(deep)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle objects that break JSON.stringify', () => {
      const obj = {
        normal: 'value',
        toJSON() {
          throw new Error('toJSON throws')
        },
      }

      const result = safeStringify(obj)
      expect(typeof result).toBe('string')
    })
  })

  describe('edge limit handling', () => {
    it('should respect default edge limit for array elements', () => {
      const largeArray = Array.from({ length: 150 }, (_, i) => i)
      const result = safeStringify(largeArray)

      expect(result).toContain('[')
      expect(result).toContain(']')

      const parsed = JSON.parse(result)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed.length).toBe(101)
    })

    it('should respect default edge limit for object properties', () => {
      const largeObject: Record<string, number> = {}
      for (let i = 0; i < 150; i++) {
        largeObject[`prop${i}`] = i
      }
      const result = safeStringify(largeObject)
      expect(result).toContain('{')
      expect(result).toContain('}')

      const parsed = JSON.parse(result)
      expect(Object.keys(parsed).length).toBe(101)
    })

    it('should handle arrays within edge limit', () => {
      const smallArray = Array.from({ length: 50 }, (_, i) => i)
      const result = safeStringify(smallArray)
      const parsed = JSON.parse(result)
      expect(parsed.length).toBe(50)
    })
  })

  describe('depth limit handling', () => {
    it('should respect default depth limit of 5', () => {
      let deepObj: any = { value: 'bottom' }
      for (let i = 0; i < 5; i++) {
        deepObj = { level: i, nested: deepObj }
      }

      const result = safeStringify(deepObj)
      expect(result).toContain('level')
      expect(result).toContain('nested')

      expect(result).toContain('"level":0')
      expect(result).toContain('"level":1')
      expect(result).toContain('"level":2')
      expect(result).toContain('"level":3')
      expect(result).toContain('"level":4')

      expect(result).not.toContain('bottom')
    })
  })
})
