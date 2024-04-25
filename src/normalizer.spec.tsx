import {
    normalizeHexColor,
    normalizeHexOrComplexColor,
    normalizeText,
    normalizeCoordinate,
    normalizePresentation,
} from './normalizer'
import React from 'react'
import { Presentation } from './nodes'

describe('normalizeHexColor', () => {
    describe('valid colors', () => {
        it.each(['red', '#ff0000', '#f00', 'rgb(255, 0, 0)', 'rgba(255, 0, 0, 0.5)'])("'%s' parses as red", (s) => {
            expect(normalizeHexColor(s)).toBe('FF0000')
        })
    })

    describe('invalid colors', () => {
        it.each(['blalblabblab', 'asd(155, 5, 5)'])("'%s' throws", (s) => {
            expect(() => normalizeHexColor(s)).toThrow(/Unable to parse/)
        })
    })
})

describe('normalizeHexOrComplexColor', () => {
    describe('without opacity', () => {
        it('falls back to hex color', () => {
            expect(normalizeHexOrComplexColor('#f00')).toBe('FF0000')
        })
    })

    describe('with opacity', () => {
        it.each(['rgba(255, 0, 0, 0.8)', '#ff0000CC'])("'%s' parses as red", (s) => {
            expect(normalizeHexOrComplexColor(s)).toMatchObject({
                type: 'solid',
                color: 'FF0000',
                alpha: 20,
            })
        })
    })

    describe('invalid colors', () => {
        it.each(['blalblabblab', 'asd(155, 5, 5)'])("'%s' throws", (s) => {
            expect(() => normalizeHexOrComplexColor(s)).toThrow(/Unable to parse/)
        })
    })
})

describe('normalizeText', () => {
    it('handles all kinds of inputs', () => {
        expect(normalizeText(['a', 'b', 'c'])).toStrictEqual([
            { text: 'a', style: {} },
            { text: 'b', style: {} },
            { text: 'c', style: {} },
        ])
        expect(normalizeText(['a', 1, '2'])).toStrictEqual([
            { text: 'a', style: {} },
            { text: '1', style: {} },
            { text: '2', style: {} },
        ])
        expect(normalizeText(['a', ['nested', [42, 12], 'arrays'], 'yep'])).toStrictEqual([
            { text: 'a', style: {} },
            { text: 'nested', style: {} },
            { text: '42', style: {} },
            { text: '12', style: {} },
            { text: 'arrays', style: {} },
            { text: 'yep', style: {} },
        ])
    })
})

describe('normalizeCoordinate', () => {
    it('handles null', () => {
        expect(normalizeCoordinate(null, 1)).toBe(1)
    })
    it.each([
        [1, 1],
        ['1%', '1%'],
        ['100%', '100%'],
    ])("'%s' normalizes to '%s'", (a, b) => {
        expect(normalizeCoordinate(a, 0)).toBe(b)
    })
    it('fails on invalid strings', () => {
        expect(() => normalizeCoordinate('1', 0)).toThrow(/is invalid position/)
    })
})

describe('normalizeJsx', () => {
    it('has layout', () => {
        expect(normalizePresentation(<Presentation layout="16x10" />)).toMatchObject({
            layout: '16x10',
        })
    })
    it('has custom layout', () => {
        expect(normalizePresentation(<Presentation layout={{ width: 10, height: 15 }} />)).toMatchObject({
            layout: { width: 10, height: 15 },
        })
    })
})
