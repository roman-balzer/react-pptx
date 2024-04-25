import { TRBL } from '../nodes'
import Color from 'color'

export type HexColor = string // 6-Character hex (without prefix hash)
export type ComplexColor = {
    type: 'solid'
    color: HexColor
    alpha: number // [0, 100]
}
export type Position = number | `${number}%` // number (inches) or string (`{percentage}%`)
export type Dimensions = [w: number, h: number]

export const normalizeTRBL = (tlbr: TRBL): [number, number, number, number] => {
    return typeof tlbr === 'number'
        ? [tlbr, tlbr, tlbr, tlbr]
        : tlbr.length === 4
          ? tlbr
          : [tlbr[0], tlbr[1], tlbr[0], tlbr[1]]
}

const PERCENTAGE_REGEXP = /^\d+%$/

export const normalizeCoordinate = (x: string | number | null | undefined, _default: number): `${number}%` | number => {
    if (typeof x === 'string') {
        if (!PERCENTAGE_REGEXP.test(x)) {
            throw new TypeError(`"${x}" is invalid position; string positions must be of format '[0-9]+%'`)
        }
        return x as `${number}%`
    } else if (typeof x === 'number') {
        return x
    }
    return _default
}

export const normalizePosition = (
    x: string | number | null | undefined,
    _default: number,
    dimensions: number
): number => {
    const normalized = normalizeCoordinate(x, _default)
    if (typeof normalized === 'string') {
        const percentage = parseFloat(normalized.replace('%', ''))
        return dimensions * (percentage / 100)
    }
    return normalized
}

export const normalizeHexColor = (colorString: string): HexColor => {
    return Color(colorString).hex().substring(1).toUpperCase()
}

export const normalizeHexOrComplexColor = (colorString: string): HexColor | ComplexColor => {
    const clr = Color(colorString)
    const hexColor = clr.hex().substring(1).toUpperCase() // PptxGenJs hex color don't use leading # for hex colors
    return clr.alpha() === 1
        ? hexColor
        : {
              type: 'solid',
              color: hexColor,
              alpha: 100 - Math.round(clr.alpha() * 100),
          }
}

export const isPresent = <T>(x: T | null): x is T => {
    return x !== null
}
