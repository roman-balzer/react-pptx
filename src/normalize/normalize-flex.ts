import { FlexProps, TRBL, VisualProps, isLine } from '../nodes'
import { InternalMasterSlide, InternalSlide, InternalSlideObject, normalizeSlideObject } from '../normalizer'
import { flattenChildren } from '../util'
import { isPresent, normalizePosition, normalizeTRBL } from './normalize-utils'

export type InternalFlexContainer = VisualProps & {
    kind: 'flex'
    slideToRenderIn: InternalSlide | InternalMasterSlide
    padding: [top: number, right: number, bottom: number, left: number]
    margin: [top: number, right: number, bottom: number, left: number]
    direction: NonNullable<FlexProps['direction']>
    gap: NonNullable<FlexProps['gap']>
    alignItems: NonNullable<FlexProps['alignItems']>
    objects: InternalSlideObject[]
}

export const normalizeFlex = (
    node: React.ReactElement<FlexProps>,
    parent: InternalSlide | InternalMasterSlide
): InternalFlexContainer => {
    const { props } = node
    if (!props.style) {
        throw new TypeError(`A ${node.type} object is missing style attribute`)
    }
    const padding: TRBL = props.padding ? normalizeTRBL(props.padding) : [0, 0, 0, 0]
    const margin: TRBL = props.margin ? normalizeTRBL(props.margin) : [0, 0, 0, 0]

    const width = normalizePosition(props.style.w, 1, parent.dimensions[0]) - (margin[1] + margin[3])
    const innerWidth = width - (padding[1] + padding[3])
    const height = normalizePosition(props.style.h, 1, parent.dimensions[1]) - (margin[0] + margin[2])
    const innerHeight = height - (padding[0] + padding[2])

    // const children = flattenChildren(props.children).filter(
    //     (child) => typeof child !== 'string' && typeof child !== 'number'
    // ) as React.ReactElement<VisualProps>[]

    // const childDimensions = children.reduce(
    //     (acc, curr) => {
    //         const style = curr.props.style
    //         if (!style) return acc
    //         if (typeof style.w === 'number' && style.w > acc.w) acc.w = style.w
    //         if (typeof style.h === 'number' && style.h > acc.h) acc.h = style.h
    //         return acc
    //     },
    //     { w: 0, h: 0 }
    // )

    const flexContainer: InternalFlexContainer = {
        kind: 'flex',
        slideToRenderIn: parent,
        padding,
        margin,
        direction: props.direction ?? 'column',
        gap: props.gap ?? 0,
        alignItems: props.alignItems ?? 'start',
        x: normalizePosition(props.style.x, 0, parent.dimensions[1]) + margin[3],
        y: normalizePosition(props.style.y, 0, parent.dimensions[0]) + margin[0],
        w: innerWidth, // normalizePosition(props.style.w, 1, parent.dimensions[0]) - (margin[1] + margin[3]),
        h: innerHeight, // normalizePosition(props.style.h, 1, parent.dimensions[1]) - (margin[0] + margin[2]),
        objects: [],
    }

    const nextOrigin: [number, number] = [flexContainer.x + padding[3], flexContainer.y + padding[0]]

    if (props.children) {
        flexContainer.objects = flattenChildren(props.children)
            .filter((child) => typeof child !== 'string' && typeof child !== 'number')
            .map((child) => {
                const { object, w, h } = normalizeFlexObject(child as any, flexContainer, nextOrigin)
                flexContainer.direction === 'row' && (nextOrigin[0] += w + flexContainer.gap)
                flexContainer.direction === 'column' && (nextOrigin[1] += h + flexContainer.gap)
                return object
            })
            .filter(isPresent)
    }
    return flexContainer
}

export const normalizeFlexObject = (
    node: React.ReactElement<VisualProps>,
    parentContainer: InternalFlexContainer,
    origin: [number, number]
): { object: InternalSlideObject | null; w: number; h: number } => {
    if (isLine(node)) {
        throw new Error(`Node type ${node.type} is not supported inside Flex`)
    }
    if (!node.props.style) {
        throw new TypeError(`A ${node.type} object is missing style attribute`)
    }

    const p = parentContainer
    const x = origin[0]
    const y = origin[1]

    // style.x and style.y will be ignored inside a flex container
    const { w, h } = node.props.style
    const normalizedW = normalizePosition(w, 1, p.w)
    const normalizedH = normalizePosition(h, 1, p.h)
    const maxParentW = p.w - (p.padding[1] + p.padding[3])
    const maxParentH = p.h - (p.padding[0] + p.padding[2])
    node.props.style.x = x + p.x + p.padding[3]
    node.props.style.y = y + p.y + p.padding[0]
    node.props.style.w = Math.min(normalizedW, maxParentW)
    node.props.style.h = Math.min(normalizedH, maxParentH)

    const object = normalizeSlideObject(node, parentContainer.slideToRenderIn)

    return { object, w: node.props.style.w, h: node.props.style.h }
}
