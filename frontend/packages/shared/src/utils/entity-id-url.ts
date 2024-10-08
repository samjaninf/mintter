import {z} from 'zod'
import {StateStream} from './stream'

export const HYPERMEDIA_PUBLIC_WEB_GATEWAY = 'https://hyper.media'

export const HYPERMEDIA_SCHEME = 'hm'
export const HYPERMEDIA_ENTITY_TYPES = {
  a: 'Account',
  d: 'Document',
  g: 'Group',
  c: 'Comment',
} as const

export type HMEntityType = keyof typeof HYPERMEDIA_ENTITY_TYPES

export function createPublicWebHmUrl(
  type: keyof typeof HYPERMEDIA_ENTITY_TYPES,
  eid: string,
  {
    version,
    blockRef,
    blockRange,
    hostname,
    variants,
    latest,
  }: {
    version?: string | null | undefined
    blockRef?: string | null | undefined
    blockRange?: BlockRange | ExpandedBlockRange | null
    hostname?: string | null | undefined
    variants?: PublicationVariant[] | null
    latest?: boolean | null
  } = {},
) {
  const webPath = `/${type}/${eid}`
  const urlHost =
    hostname === undefined
      ? HYPERMEDIA_PUBLIC_WEB_GATEWAY
      : hostname === null
      ? ''
      : hostname
  let res = `${urlHost}${webPath}`
  const query: Record<string, string | null> = {}
  if (version) {
    query.v = version
  }
  if (variants?.length) {
    query.b = getVariantsParamValue(variants)
  }
  if (latest) {
    query.l = null
  }
  res += serializeQueryString(query)
  if (blockRef) {
    res += `#${blockRef}${serializeBlockRange(blockRange)}`
  }

  return res
}

export function groupDocUrl(
  groupEid: string,
  version: string | null | undefined,
  pathName: string,
  hostname: null | string = null,
) {
  const type = 'g'
  const webPath = `/${type}/${groupEid}`
  let urlHost =
    hostname === null
      ? ''
      : hostname === undefined
      ? HYPERMEDIA_PUBLIC_WEB_GATEWAY
      : hostname
  let webUrl = `${urlHost}${webPath}`
  if (pathName && pathName !== '/') webUrl += `/${pathName}`
  if (version) webUrl += `?v=${version}`
  return webUrl
}

function getVariantsParamValue(variants: PublicationVariant[]): string {
  return variants
    .map((variant) => {
      if (variant.key === 'group') {
        const groupId = unpackHmId(variant.groupId)
        if (!groupId) return false
        return `g/${groupId.eid}${
          variant.pathName ? `/${variant.pathName}` : ''
        }`
      }
      if (variant.key === 'author') {
        return `a/${variant.author}`
      }
      return false
    })
    .filter(Boolean)
    .join('.')
}

export function createHmId(
  type: keyof typeof HYPERMEDIA_ENTITY_TYPES,
  id: string,
  opts: {
    version?: string | null
    blockRef?: string | null
    blockRange?: BlockRange | ExpandedBlockRange | null
    id?: string
    groupPathName?: string | null
    variants?: PublicationVariant[] | null
    latest?: boolean | null
  } = {},
) {
  let path = `${type}/${id}`
  if (opts?.groupPathName) path += `/${opts.groupPathName}`
  let url = new URL(`${HYPERMEDIA_SCHEME}://${path}`)
  let responseUrl = url.toString()
  const query: Record<string, string | null> = {}
  if (opts.version) {
    query.v = opts.version
  }
  if (opts.variants?.length) {
    query.b = getVariantsParamValue(opts.variants)
  }
  if (opts.latest) {
    query.l = null
  }
  responseUrl += serializeQueryString(query)
  if (opts?.blockRef) {
    responseUrl += `#${opts.blockRef}${serializeBlockRange(opts.blockRange)}`
  }

  return responseUrl
}

type ParsedURL = {
  scheme: string | null
  path: string[]
  query: URLSearchParams
  fragment: string | null
}

export function parseCustomURL(url: string): ParsedURL | null {
  if (!url) return null
  const [scheme, rest] = url.split('://')
  if (!rest) return null
  const [pathAndQuery, fragment = null] = rest.split('#')

  const [path, queryString] = pathAndQuery.split('?')
  const query = new URLSearchParams(queryString)
  return {
    scheme,
    path: path.split('/'),
    query,
    fragment,
  }
}

function inKeys<V extends string>(
  key: string,
  values: Record<V, string>,
): V | null {
  // TODO: change to expect-error instead
  // @ts-ignore
  if (values[key]) return key as V
  return null
}

export const groupVariantSchema = z.object({
  key: z.literal('group'),
  groupId: z.string(),
  pathName: z.string().or(z.null()),
})
export type GroupVariant = z.infer<typeof groupVariantSchema>

export const authorVariantSchema = z.object({
  key: z.literal('author'),
  author: z.string(),
})
export type AuthorVariant = z.infer<typeof authorVariantSchema>

export const publicationVariantSchema = z.discriminatedUnion('key', [
  groupVariantSchema,
  authorVariantSchema,
])
export type PublicationVariant = z.infer<typeof publicationVariantSchema>

export type UnpackedHypermediaId = {
  id: string
  type: keyof typeof HYPERMEDIA_ENTITY_TYPES
  eid: string
  qid: string
  groupPathName: string | null
  version: string | null
  blockRef: string | null
  blockRange?: BlockRange | ExpandedBlockRange | null
  hostname: string | null
  scheme: string | null
  variants?: PublicationVariant[] | null
  latest?: boolean | null
}

export function hmId(
  type: keyof typeof HYPERMEDIA_ENTITY_TYPES,
  eid: string,
  opts: {
    version?: string | null
    blockRef?: string | null
    blockRange?: BlockRange | ExpandedBlockRange | null
    groupPathName?: string | null
    variants?: PublicationVariant[] | null
    latest?: boolean | null
    hostname?: string | null
  } = {},
): UnpackedHypermediaId {
  return {
    id: createHmId(type, eid, opts),
    type,
    eid,
    qid: createHmId(type, eid),
    groupPathName: opts.groupPathName || null,
    version: opts.version || null,
    blockRef: opts.blockRef || null,
    blockRange: opts.blockRange || null,
    hostname: opts.hostname || null,
    scheme: null,
    ...opts,
  }
}

export function parseVariantsQuery(
  variantsString?: string[] | string | null,
): PublicationVariant[] | null {
  if (!variantsString) return null
  if (Array.isArray(variantsString)) variantsString = variantsString.join('.')
  const variants: PublicationVariant[] = []
  variantsString.split('.').forEach((singleVariantString: string) => {
    if (!singleVariantString) return
    const [key, ...rest] = singleVariantString.split(/:|\//)
    if (key === 'g') {
      const [groupEid, pathName] = rest
      variants.push({
        key: 'group',
        groupId: createHmId('g', groupEid),
        pathName: pathName || null,
      })
    }
    if (key === 'a') {
      const [author] = rest
      variants.push({key: 'author', author})
    }
  })
  if (!variants.length) return null
  return variants
}

export function unpackHmId(hypermediaId: string): UnpackedHypermediaId | null {
  const parsed = parseCustomURL(hypermediaId)
  if (!parsed) return null
  if (parsed.scheme === HYPERMEDIA_SCHEME) {
    const type = inKeys(parsed?.path[0], HYPERMEDIA_ENTITY_TYPES)
    const eid = parsed.path[1]
    const version = parsed.query.get('v')
    const latest = parsed.query.has('l')
    const variants = parseVariantsQuery(parsed.query.get('b'))
    if (!type) return null
    const qid = createHmId(type, eid)
    const fragment = parseFragment(parsed.fragment)

    let blockRange = null
    if (fragment) {
      if ('start' in fragment) {
        blockRange = {
          start: fragment.start,
          end: fragment.end,
        }
      } else if ('expanded' in fragment) {
        blockRange = {
          expanded: fragment.expanded,
        }
      }
    }

    return {
      id: hypermediaId,
      qid,
      type,
      eid,
      groupPathName: parsed.path[2] || null,
      version,
      variants,
      blockRef: fragment ? fragment.blockId : null,
      blockRange,
      hostname: null,
      latest,
      scheme: parsed.scheme,
    }
  }
  if (parsed?.scheme === 'https' || parsed?.scheme === 'http') {
    const type = inKeys(parsed.path[1], HYPERMEDIA_ENTITY_TYPES)
    const eid = parsed.path[2]
    const version = parsed.query.get('v')
    const latest = parsed.query.has('l')
    const variants = parseVariantsQuery(parsed.query.get('b'))
    let hostname = parsed.path[0]
    if (!type) return null
    const qid = createHmId(type, eid)
    const fragment = parseFragment(parsed.fragment)

    let blockRange = null
    if (fragment) {
      if ('start' in fragment) {
        blockRange = {
          start: fragment.start,
          end: fragment.end,
        }
      } else if ('expanded' in fragment) {
        blockRange = {
          expanded: fragment.expanded,
        }
      }
    }
    return {
      id: hypermediaId,
      qid,
      type,
      eid,
      groupPathName: parsed.path[3] || null,
      version,
      variants,
      blockRef: fragment ? fragment.blockId : null,
      blockRange,
      hostname,
      latest,
      scheme: parsed.scheme,
    }
  }
  return null
}

export type UnpackedDocId = UnpackedHypermediaId & {docId: string}

export function unpackDocId(inputUrl: string): UnpackedDocId | null {
  const unpackedHm = unpackHmId(inputUrl)
  if (!unpackedHm?.eid) return null
  if (unpackedHm.type !== 'd') {
    throw new Error('URL is expected to be a document ID: ' + inputUrl)
  }
  return {
    ...unpackedHm,
    id: inputUrl,
    type: 'd',
    docId: createHmId('d', unpackedHm.eid),
  }
}

export function isHypermediaScheme(url?: string) {
  return !!url?.startsWith(`${HYPERMEDIA_SCHEME}://`)
}

export function isPublicGatewayLink(text: string, gwUrl: StateStream<string>) {
  const matchesGateway = text.indexOf(gwUrl.get()) === 0
  return !!matchesGateway
}

export function idToUrl(
  hmId: string,
  hostname?: string | null | undefined,
  {
    version,
    blockRef,
    blockRange,
    variants,
  }: {
    version?: string | null | undefined
    blockRef?: string | null | undefined
    blockRange?: BlockRange | ExpandedBlockRange | null | undefined
    variants?: PublicationVariant[] | null | undefined
  } = {},
) {
  const unpacked = unpackHmId(hmId)
  if (!unpacked?.type) return null
  return createPublicWebHmUrl(unpacked.type, unpacked.eid, {
    version: version || unpacked.version,
    blockRef: blockRef || unpacked.blockRef,
    blockRange: blockRange || unpacked.blockRange,
    hostname,
    variants,
  })
}

export function normalizeHmId(
  urlMaybe: string,
  gwUrl: StateStream<string>,
): string | undefined {
  if (isHypermediaScheme(urlMaybe)) return urlMaybe
  if (isPublicGatewayLink(urlMaybe, gwUrl)) {
    const unpacked = unpackHmId(urlMaybe)

    console.log(`== ~ unpacked:`, urlMaybe, unpacked)

    if (unpacked?.eid && unpacked.type) {
      return createHmId(unpacked.type, unpacked.eid, {
        blockRange: unpacked.blockRange,
        blockRef: unpacked.blockRef,
        version: unpacked.version,
      })
    }
    return undefined
  }
}

export function createHmDocLink({
  documentId,
  version,
  blockRef,
  blockRange,
  latest,
  variants,
}: {
  documentId: string
  version?: string | null
  blockRef?: string | null
  blockRange?: BlockRange | ExpandedBlockRange | null
  latest?: boolean
  variants?: PublicationVariant[] | null | undefined
}): string {
  let res = documentId
  const query: Record<string, string | null> = {}
  if (version) {
    query.v = version
  }
  if (variants?.length) {
    query.b = getVariantsParamValue(variants)
  }
  if (latest) {
    query.l = null
  }
  res += serializeQueryString(query)
  if (blockRef) {
    res += `${
      !blockRef.startsWith('#') ? '#' : ''
    }${blockRef}${serializeBlockRange(blockRange)}`
  }
  return res
}

function serializeQueryString(query: Record<string, string | null>) {
  const queryString = Object.entries(query)
    .map(([key, value]) => (value === null ? key : `${key}=${value}`))
    .join('&')
  if (!queryString) return ''
  return `?${queryString}`
}

export function createHmGroupDocLink(
  groupId: string,
  pathName: string,
  version?: string | null,
  blockRef?: string | null,
  blockRange?: BlockRange | ExpandedBlockRange | null,
): string {
  let res = groupId
  if (pathName) {
    if (pathName === '/') res += '/-'
    else res += `/${pathName}`
  }
  if (version) res += `?v=${version}`
  if (blockRef)
    res += `${
      !blockRef.startsWith('#') ? '#' : ''
    }${blockRef}${serializeBlockRange(blockRange)}`
  return res
}

export function labelOfEntityType(type: keyof typeof HYPERMEDIA_ENTITY_TYPES) {
  return HYPERMEDIA_ENTITY_TYPES[type]
}

export function hmIdWithVersion(
  hmId: string | null | undefined,
  version: string | null | undefined,
  blockRef?: string | null | undefined,
  blockRange?: BlockRange | ExpandedBlockRange | null,
) {
  if (!hmId) return null
  const unpacked = unpackHmId(hmId)
  if (!unpacked) return null
  return createHmId(unpacked.type, unpacked.eid, {
    groupPathName: unpacked.groupPathName,
    version: version || unpacked.version,
    blockRef,
    blockRange,
  })
}

export function extractBlockRefOfUrl(
  url: string | null | undefined,
): string | null {
  const fragment = url?.match(/#(.*)$/)?.[1] || null

  if (fragment) {
    return parseFragment(fragment)?.blockId || null
  } else {
    return null
  }
}

export function extractBlockRangeOfUrl(
  url: string | null | undefined,
): BlockRange | ExpandedBlockRange | null {
  const fragment = url?.match(/#(.*)$/)?.[1] || null

  if (fragment) {
    let res = parseFragment(fragment)
    if (res) {
      const {blockId, ...range} = res
      return range
    } else {
      return null
    }
  } else {
    return null
  }
}

export type ParsedFragment =
  | {blockId: string}
  | (BlockRange & {blockId: string})
  | (ExpandedBlockRange & {blockId: string})

export type BlockRange = {
  start: number
  end: number
}
export type ExpandedBlockRange = {
  expanded: boolean
}

export function parseFragment(input: string | null): ParsedFragment | null {
  if (!input) return null
  const regex =
    /^(?<blockId>\S{8})((?<expanded>\+)|\[(?<rangeStart>\d+)\:(?<rangeEnd>\d+)\])?$/
  const match = input.match(regex)
  if (match && match.groups) {
    if (match.groups.expanded == '+') {
      return {
        blockId: match.groups.blockId,
        expanded: true,
      }
    } else if (
      typeof match.groups.rangeStart != 'undefined' ||
      typeof match.groups.rangeEnd != 'undefined'
    ) {
      return {
        blockId: match.groups.blockId,
        start: parseInt(match.groups.rangeStart || '0'),
        end: parseInt(match.groups.rangeEnd || '0'),
      }
    } else {
      return {
        blockId: match.groups.blockId,
      }
    }
  } else {
    return {
      blockId: input,
    }
  }
}

export function serializeBlockRange(
  range: BlockRange | ExpandedBlockRange | null | undefined,
): string {
  let res = ''
  if (range) {
    if ('expanded' in range && range.expanded) {
      res += '+'
    } else if ('start' in range) {
      res += `[${range.start}:${range.end}]`
    }
  }

  return res
}
