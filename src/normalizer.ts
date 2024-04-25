// Normalizer converts and normalizes JSX Presentation trees into internal nodes
// that roughly match what pptxgenjs will want to ingest

import type PptxGenJs from 'pptxgenjs'
import React, { ReactElement } from 'react'
import {
    ContainerProps,
    MasterSlideProps,
    NodeTypes,
    PresentationProps,
    SlideProps,
    TextBulletProps,
    TextChild,
    TextLinkProps,
    VisualProps,
    isContainer,
    isImage,
    isLine,
    isShape,
    isTable,
    isTableCell,
    isText,
    isTextBullet,
    isTextLink,
    isFlex,
} from './nodes'
import { flattenChildren, isReactElementOrElementArray, layoutToInches } from './util'
import {
    ComplexColor,
    Dimensions,
    HexColor,
    Position,
    isPresent,
    normalizeCoordinate,
    normalizeHexColor,
    normalizeHexOrComplexColor,
    normalizePosition,
    normalizeTRBL,
} from './normalize/normalize-utils'
import { InternalFlexContainer, normalizeFlex } from './normalize/normalize-flex'

type ObjectBase = {
    style: {
        x: Position
        y: Position
        w: Position
        h: Position
    }
}

const DEFAULT_FONT_SIZE = 18
const DEFAULT_FONT_FACE = 'Arial'

type PptxGenJsTextStyles = Pick<
    PptxGenJs.TextPropsOptions,
    | 'bold'
    | 'italic'
    | 'paraSpaceAfter'
    | 'paraSpaceBefore'
    | 'fontSize'
    | 'charSpacing'
    | 'fontFace'
    | 'margin'
    | 'lineSpacing'
    | 'underline'
    | 'subscript'
    | 'superscript'
    | 'strike'
    | 'rotate'
    | 'breakLine'
>
export interface InternalTextPartBaseStyle extends PptxGenJsTextStyles {
    color: HexColor | null
    verticalAlign?: 'top' | 'bottom' | 'middle'
    backgroundColor?: HexColor | ComplexColor | null
}

type PptxGenJsTextOptions = Pick<PptxGenJs.TextPropsOptions, 'rtlMode' | 'lang' | 'breakLine'>

export type InternalTextPart = PptxGenJsTextOptions & {
    text: string
    // Must be partial, because parent node should override non-specified properties
    style: Partial<InternalTextPartBaseStyle>
    link?: { tooltip?: string } & (
        | {
              url: string
          }
        | {
              slide: number
          }
    )
    bullet?: true | Exclude<PptxGenJs.TextBaseProps['bullet'], boolean>
}
export type InternalText = ObjectBase & {
    kind: 'text'
    text: InternalTextPart[]
    style: InternalTextPartBaseStyle & {
        align?: 'left' | 'right' | 'center'
        verticalAlign?: 'top' | 'bottom' | 'middle'
    }
}
export type InternalImage = ObjectBase & {
    kind: 'image'
    src: InternalImageSrc
    style: {
        sizing: {
            fit: 'contain' | 'cover' | 'crop'
            imageWidth?: number
            imageHeight?: number
        } | null
    }
}
export type InternalShape = ObjectBase & {
    kind: 'shape'
    type: keyof typeof PptxGenJs.ShapeType
    text: InternalTextPart[] | null
    style: {
        backgroundColor: HexColor | ComplexColor | null
        borderColor: HexColor | null
        borderWidth: number | null
    }
}
export type InternalTableStyle = {
    borderColor: HexColor | null
    borderWidth: number | null
    margin: number | null
}
export type InternalTableCell = InternalText & {
    colSpan?: number
    rowSpan?: number
}
export type InternalTable = ObjectBase & {
    kind: 'table'
    rows: Array<Array<InternalTableCell>>
    style: InternalTableStyle
}
export type InternalLine = {
    kind: 'line'
    x1: number
    y1: number
    x2: number
    y2: number
    style: {
        color: HexColor | null
        width: number | null
    }
}

export type InternalSlideObject =
    | InternalText
    | InternalImage
    | InternalShape
    | InternalTable
    | InternalTableCell
    | InternalLine
    | InternalContainer
    | InternalFlexContainer

export type InternalContainer = {
    kind: 'container'
    slideToRenderIn: InternalSlide | InternalMasterSlide
    padding: [top: number, right: number, bottom: number, left: number]
    margin: [top: number, right: number, bottom: number, left: number]
    x: number
    y: number
    w: number
    h: number
    objects: InternalSlideObject[]
}

export type InternalImageSrc = { kind: 'data'; data: string } | { kind: 'path'; path: string }

export type InternalSlide = {
    kind: 'slide'
    masterName: string | null
    objects: InternalSlideObject[]
    backgroundColor: HexColor | ComplexColor | null
    backgroundImage: InternalImageSrc | null
    hidden: boolean
    notes?: string
    dimensions: Dimensions
}

export type InternalMasterSlide = {
    kind: 'master-slide'
    name: string
    objects: InternalSlideObject[]
    backgroundColor: HexColor | ComplexColor | null
    backgroundImage: InternalImageSrc | null
    dimensions: Dimensions
}

export type CustomLayout = { width: number; height: number }
export type InternalPresentation = {
    slides: InternalSlide[]
    masterSlides: { [name: string]: InternalMasterSlide }
    layout: '16x9' | '16x10' | '4x3' | 'WIDE' | CustomLayout
    author?: string
    company?: string
    revision?: string
    subject?: string
    title?: string
}

export const normalizeText = (t: TextChild): InternalTextPart[] => {
    if (isReactElementOrElementArray(t)) {
        return flattenChildren(t).reduce<InternalTextPart[]>(
            (textParts, el: string | number | ReactElement<TextLinkProps> | ReactElement<TextBulletProps>) => {
                if (React.isValidElement(el)) {
                    let bullet: true | Exclude<PptxGenJs.TextBaseProps['bullet'], boolean | undefined | 'style'>
                    if (isTextBullet(el)) {
                        // We know the intention is for a bullet, so pass on true if no customisation required
                        const { children, style, rtlMode, lang, ...bulletProps } = el.props
                        bullet = Object.keys(bulletProps).length ? bulletProps : true

                        const normalizedChildren = normalizeText(children)
                        const normalizedParentColor = style?.color ? normalizeHexColor(style.color) : undefined
                        const parentStyle = {
                            ...(style || {}),
                            color: normalizedParentColor,
                        }

                        // Make `breakLine = false` for all child components except the last one
                        // (so every child will sit within the same bullet point)
                        const childParts = normalizedChildren.map((childPart, index) => ({
                            rtlMode,
                            lang,
                            bullet: index === 0 ? bullet : undefined,
                            ...childPart,
                            style: {
                                ...parentStyle,
                                ...childPart.style,
                            },
                            breakLine: index + 1 >= normalizedChildren.length,
                        }))
                        return textParts.concat(childParts)
                    }

                    let link
                    if (isTextLink(el)) {
                        // props extracted here again so that ts can infer them as TextLinkProps
                        const { props } = el
                        if ('url' in props) {
                            link = { url: props.url, tooltip: props.tooltip }
                        } else if (props.slide) {
                            link = { slide: props.slide, tooltip: props.tooltip }
                        }
                    }
                    const { children, style, rtlMode, lang } = el.props
                    return textParts.concat({
                        text: children,
                        rtlMode,
                        lang,
                        link,
                        style: {
                            ...(style || {}),
                            color: style?.color ? normalizeHexColor(style.color) : undefined,
                        },
                    })
                } else {
                    return textParts.concat({
                        text: el.toString(),
                        style: {},
                    })
                }
            },
            []
        )
    } else if (Array.isArray(t)) {
        return t.reduce((prev: InternalTextPart[], cur) => prev.concat(normalizeText(cur)), [] as InternalTextPart[])
    } else if (['number', 'string'].includes(typeof t)) {
        return [
            {
                text: t.toString(),
                style: {},
            },
        ]
    } else {
        throw new TypeError('Invalid TextChild found; only strings/numbers/arrays of them are accepted')
    }
}

const normalizeImageSrc = (src: string | InternalImageSrc): InternalImageSrc => {
    if (typeof src === 'string') {
        return {
            kind: 'path',
            path: src,
        }
    }
    return src
}

const normalizeTextType = (node: React.ReactElement, normalizedCoordinates: Record<string, `${number}%` | number>) => {
    const style = node.props.style
    return {
        text: node.props.children !== undefined ? normalizeText(node.props.children) : [],
        style: {
            ...style,
            ...normalizedCoordinates,
            color: style.color ? normalizeHexColor(style.color) : null,
            fontFace: style.fontFace ?? DEFAULT_FONT_FACE,
            fontSize: style.fontSize ?? DEFAULT_FONT_SIZE,
        },
    }
}

export const normalizeSlideObject = (
    node: React.ReactElement<VisualProps>,
    parent: InternalSlide | InternalMasterSlide
): InternalSlideObject | null => {
    console.log(`🚀TCL ~ normalizeSlideObject`, node, parent)
    if (isContainer(node)) {
        return normalizeContainer(node, parent)
    }
    if (isFlex(node)) {
        return normalizeFlex(node, parent)
    }

    if (!node.props.style) {
        throw new TypeError(`A ${node.type} object is missing style attribute`)
    }

    if (isLine(node)) {
        return {
            kind: 'line',
            x1: node.props.x1,
            y1: node.props.y1,
            x2: node.props.x2,
            y2: node.props.y2,
            style: {
                color: node.props.style.color ? normalizeHexColor(node.props.style.color) : null,
                width: node.props.style.width ?? null,
            },
        }
    }

    const { x: origX, y: origY, w: origW, h: origH } = node.props.style
    const normalizedCoordinates = {
        x: normalizeCoordinate(origX, 0),
        y: normalizeCoordinate(origY, 0),
        w: normalizeCoordinate(origW, 1),
        h: normalizeCoordinate(origH, 1),
    }

    if (isText(node)) {
        return {
            kind: 'text',
            ...normalizeTextType(node, normalizedCoordinates),
        }
    } else if (isTableCell(node)) {
        return {
            kind: 'text',
            ...normalizeTextType(node, normalizedCoordinates),
            colSpan: node.props.colSpan,
            rowSpan: node.props.rowSpan,
        }
    } else if (isImage(node)) {
        return {
            kind: 'image',
            src: normalizeImageSrc(node.props.src),
            style: {
                ...normalizedCoordinates,
                sizing: node.props.style.sizing ?? null,
            },
        }
    } else if (isShape(node)) {
        return {
            kind: 'shape',
            type: node.props.type,
            text: node.props.children !== undefined ? normalizeText(node.props.children) : null,
            style: {
                ...normalizedCoordinates,
                backgroundColor: node.props.style.backgroundColor
                    ? normalizeHexOrComplexColor(node.props.style.backgroundColor)
                    : null,
                borderColor: node.props.style.borderColor ? normalizeHexColor(node.props.style.borderColor) : null,
                borderWidth: node.props.style.borderWidth ?? null,
            },
        }
    } else if (isTable(node)) {
        const normalized: InternalTableCell[][] = node.props.rows.map((row) =>
            row.map((cell) => {
                if (typeof cell === 'string') {
                    return {
                        kind: 'text',
                        text: [{ text: cell, style: {} }],
                        style: { x: 0, y: 0, w: 0, h: 0, color: null },
                    }
                } else {
                    return normalizeSlideObject(cell, parent) as InternalTableCell
                }
            })
        )
        return {
            kind: 'table',
            rows: normalized,
            style: {
                ...normalizedCoordinates,
                borderColor: node.props.style.borderColor ? normalizeHexColor(node.props.style.borderColor) : null,
                borderWidth: node.props.style.borderWidth ?? null,
                margin: node.props.style.margin ?? null,
            },
        }
    } else {
        throw new Error('unknown slide object')
    }
}

const normalizeContainerObject = (
    node: React.ReactElement<VisualProps>,
    parentContainer: InternalContainer
): InternalSlideObject | null => {
    if (!node.props.style) {
        throw new TypeError(`A ${node.type} object is missing style attribute`)
    }
    const p = parentContainer
    if (isLine(node)) {
        return {
            kind: 'line',
            x1: node.props.x1 + p.x,
            y1: node.props.y1 + p.y,
            x2: node.props.x2 + p.x,
            y2: node.props.y2 + p.y,
            style: {
                color: node.props.style.color ? normalizeHexColor(node.props.style.color) : null,
                width: node.props.style.width ?? null,
            },
        }
    }

    const { x, y, w, h } = node.props.style
    const normalizedX = normalizePosition(x, 0, p.w)
    const normalizedY = normalizePosition(y, 0, p.h)
    const normalizedW = normalizePosition(w, 1, p.w)
    const normalizedH = normalizePosition(h, 1, p.h)
    const maxParentW = p.w - (p.padding[1] + p.padding[3])
    const maxParentH = p.h - (p.padding[0] + p.padding[2])
    node.props.style.x = normalizedX + p.x + p.padding[3]
    node.props.style.y = normalizedY + p.y + p.padding[0]
    node.props.style.w = Math.min(normalizedW, maxParentW)
    node.props.style.h = Math.min(normalizedH, maxParentH)

    return normalizeSlideObject(node, parentContainer.slideToRenderIn)
}

const normalizeSlide = ({ props }: React.ReactElement<SlideProps>, dimensions: Dimensions): InternalSlide => {
    const slide: InternalSlide = {
        kind: 'slide',
        masterName: props.masterName ?? null,
        hidden: props.hidden ?? false,
        backgroundColor: props?.style?.backgroundColor ? normalizeHexOrComplexColor(props.style.backgroundColor) : null,
        backgroundImage: props?.style?.backgroundImage ?? null,
        notes: props.notes,
        objects: [],
        dimensions,
    }
    if (props.children) {
        slide.objects = flattenChildren(props.children)
            .filter((child) => typeof child !== 'string' && typeof child !== 'number')
            .map((child) => normalizeSlideObject(child as any, slide))
            .filter(isPresent)
    }
    return slide
}

const normalizeContainer = (
    node: React.ReactElement<ContainerProps>,
    parent: InternalSlide | InternalMasterSlide
): InternalContainer => {
    console.log(`🚀TCL ~ normalizeContainer`, node, parent)
    const { props } = node
    if (!props.style) {
        throw new TypeError(`A ${node.type} object is missing style attribute`)
    }
    const margin: [number, number, number, number] = props.m ? normalizeTRBL(props.m) : [0, 0, 0, 0]
    const padding: [number, number, number, number] = props.p ? normalizeTRBL(props.p) : [0, 0, 0, 0]
    const container: InternalContainer = {
        kind: 'container',
        slideToRenderIn: parent,
        padding,
        margin,
        x: normalizePosition(props.style.x, 0, parent.dimensions[1]) + margin[3],
        y: normalizePosition(props.style.y, 0, parent.dimensions[0]) + margin[0],
        w: normalizePosition(props.style.w, 1, parent.dimensions[0]) - (margin[1] + margin[3]),
        h: normalizePosition(props.style.h, 1, parent.dimensions[1]) - (margin[0] + margin[2]),
        objects: [],
    }
    const containerShape = {
        kind: 'shape',
        type: 'rect',
        text: null,
        style: {
            x: container.x,
            y: container.y,
            w: container.w,
            h: container.h,
            backgroundColor: props?.style?.backgroundColor
                ? normalizeHexOrComplexColor(props.style.backgroundColor)
                : null,
            borderColor: props?.style?.borderColor ? normalizeHexColor(props.style.borderColor) : null,
            borderWidth: props?.style?.borderWidth ?? null,
        },
    } as const
    if (props.children) {
        container.objects = flattenChildren(props.children)
            .filter((child) => typeof child !== 'string' && typeof child !== 'number')
            .map((child) => normalizeContainerObject(child as any, container))
            .filter(isPresent)
    }
    if (props.style.backgroundColor || props.style.borderColor) {
        container.objects.push(containerShape!)
    }
    return container
}

const normalizeMasterSlide = (
    { props }: React.ReactElement<MasterSlideProps>,
    dimensions: Dimensions
): InternalMasterSlide => {
    const slide: InternalMasterSlide = {
        kind: 'master-slide',
        name: props.name,
        backgroundColor: props?.style?.backgroundColor ? normalizeHexOrComplexColor(props.style.backgroundColor) : null,
        backgroundImage: props?.style?.backgroundImage ?? null,
        objects: [],
        dimensions,
    }
    if (props.children) {
        slide.objects = flattenChildren(props.children)
            .filter((child) => typeof child !== 'string' && typeof child !== 'number')
            .map((child) => normalizeSlideObject(child as any, slide))
            .filter(isPresent)
    }
    return slide
}

export const normalizePresentation = ({ props }: React.ReactElement<PresentationProps>): InternalPresentation => {
    const pres: InternalPresentation = {
        layout: props.layout ?? '16x9',
        masterSlides: {},
        slides: [],
        author: props.author,
        company: props.company,
        revision: props.revision,
        subject: props.subject,
        title: props.title,
    }
    const dimensions = layoutToInches(pres.layout)
    if (props.children) {
        const children = flattenChildren(props.children)

        pres.slides = children
            .filter((child) => (child as any).type === NodeTypes.SLIDE)
            .map((slide) => normalizeSlide(slide as any, dimensions))

        const masterSlides = children
            .filter((child) => (child as any).type === NodeTypes.MASTER_SLIDE)
            .map((slide) => normalizeMasterSlide(slide as any, dimensions))
        pres.masterSlides = Object.fromEntries(masterSlides.map((slide) => [slide.name, slide]))
    }
    return pres
}
