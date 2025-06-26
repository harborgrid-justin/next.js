import { useSegmentTree, type SegmentTrieNode } from '../../segment-explorer'
import { css } from '../../utils/css'
import { cx } from '../../utils/cx'

const isFileNode = (node: SegmentTrieNode) => {
  return !!node.value?.type && !!node.value?.pagePath
}

export function PageSegmentTree({ isAppRouter }: { isAppRouter: boolean }) {
  const tree = useSegmentTree()
  return (
    <div
      className="segment-explorer-content"
      data-nextjs-devtool-segment-explorer
    >
      {isAppRouter ? (
        <PageSegmentTreeLayerPresentation node={tree} level={0} segment="" />
      ) : (
        <p>Route Info currently is only available for the App Router.</p>
      )}
    </div>
  )
}

function PageSegmentTreeLayerPresentation({
  segment,
  node,
  level,
}: {
  segment: string
  node: SegmentTrieNode
  level: number
}) {
  const childrenKeys = Object.keys(node.children)

  const sortedChildrenKeys = childrenKeys.sort((a, b) => {
    // Prioritize if it's a file convention like layout or page,
    // then the rest parallel routes.
    const aHasExt = a.includes('.')
    const bHasExt = b.includes('.')
    if (aHasExt && !bHasExt) return -1
    if (!aHasExt && bHasExt) return 1
    // Otherwise sort alphabetically

    // If it's file, sort by order: layout > template > page
    if (aHasExt && bHasExt) {
      const aType = node.children[a]?.value?.type
      const bType = node.children[b]?.value?.type

      if (aType === 'layout' && bType !== 'layout') return -1
      if (aType !== 'layout' && bType === 'layout') return 1
      if (aType === 'template' && bType !== 'template') return -1
      if (aType !== 'template' && bType === 'template') return 1

      // If both are the same type, sort by pagePath
      const aFilePath = node.children[a]?.value?.pagePath || ''
      const bFilePath = node.children[b]?.value?.pagePath || ''
      return aFilePath.localeCompare(bFilePath)
    }

    return a.localeCompare(b)
  })

  // If it's the 1st level and contains a file, use 'app' as the folder name
  const folderName = level === 0 && !segment ? 'app' : segment

  const folderChildrenKeys: string[] = []
  const filesChildrenKeys: string[] = []

  for (const childKey of sortedChildrenKeys) {
    const childNode = node.children[childKey]
    if (!childNode) continue

    // If it's a file node, add it to filesChildrenKeys
    if (isFileNode(childNode)) {
      filesChildrenKeys.push(childKey)
      continue
    }

    // Otherwise, it's a folder node, add it to folderChildrenKeys
    folderChildrenKeys.push(childKey)
  }

  const hasFilesChildren = filesChildrenKeys.length > 0

  return (
    <>
      {hasFilesChildren && (
        <div
          className="segment-explorer-item"
          data-nextjs-devtool-segment-explorer-segment={segment + '-' + level}
        >
          <div
            className="segment-explorer-item-row"
            style={{
              // If it's children levels, show indents if there's any file at that level.
              // Otherwise it's empty folder, no need to show indents.
              ...{ paddingLeft: `${(level + 1) * 8}px` },
            }}
          >
            <div className="segment-explorer-filename">
              {folderName && (
                <span className="segment-explorer-filename--path">
                  {folderName}
                  {/* hidden slashes for testing snapshots */}
                  <small>{'/'}</small>
                </span>
              )}
              {/* display all the file segments in this level */}
              {filesChildrenKeys.length > 0 && (
                <span className="segment-explorer-files">
                  {filesChildrenKeys.map((fileChildSegment) => {
                    const childNode = node.children[fileChildSegment]
                    if (!childNode || !childNode.value) {
                      return null
                    }
                    const fileName =
                      childNode.value.pagePath.split('/').pop() || ''
                    return (
                      <span
                        key={fileChildSegment}
                        className={cx(
                          'segment-explorer-file-label',
                          `segment-explorer-file-label--${childNode.value.type}`
                        )}
                      >
                        {fileName}
                      </span>
                    )
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {folderChildrenKeys.map((childSegment) => {
        const child = node.children[childSegment]
        if (!child) {
          return null
        }

        // If it's an folder segment without any files under it,
        // merge it with the segment in the next level.
        const nextSegment = hasFilesChildren
          ? childSegment
          : segment + ' / ' + childSegment
        return (
          <PageSegmentTreeLayerPresentation
            key={childSegment}
            segment={nextSegment}
            node={child}
            level={hasFilesChildren ? level + 1 : level}
          />
        )
      })}
    </>
  )
}

export const DEV_TOOLS_INFO_RENDER_FILES_STYLES = css`
  .segment-explorer-content {
    font-size: var(--size-14);
  }

  .segment-explorer-item {
    margin: 4px 0;
    border-radius: 6px;
  }

  .segment-explorer-item:nth-child(even) {
    background-color: var(--color-background-200);
  }

  .segment-explorer-item-row {
    display: flex;
    align-items: center;
    padding-top: 10px;
    padding-bottom: 10px;
    padding-right: 4px;
    white-space: pre;
    cursor: default;
    color: var(--color-gray-1000);
  }

  .segment-explorer-children--intended {
    padding-left: 16px;
  }

  .segment-explorer-filename {
    display: inline-flex;
  }

  .segment-explorer-filename--path {
    margin-right: 8px;
  }
  .segment-explorer-filename--path small {
    display: inline-block;
    width: 0;
    opacity: 0;
  }
  .segment-explorer-filename--name {
    color: var(--color-gray-800);
  }

  .segment-explorer-files {
    display: inline-flex;
    gap: 8px;
  }

  .segment-explorer-file-label {
    padding: 2px 6px;
    border-radius: 16px;
    font-size: var(--size-12);
    font-weight: 500;
    user-select: none;
  }
  .segment-explorer-file-label--layout,
  .segment-explorer-file-label--template,
  .segment-explorer-file-label--default {
    background-color: var(--color-gray-300);
    color: var(--color-gray-1000);
  }
  .segment-explorer-file-label--page {
    background-color: var(--color-blue-300);
    color: var(--color-blue-800);
  }
  .segment-explorer-file-label--not-found,
  .segment-explorer-file-label--forbidden,
  .segment-explorer-file-label--unauthorized {
    background-color: var(--color-amber-300);
    color: var(--color-amber-900);
  }
  .segment-explorer-file-label--loading {
    background-color: var(--color-green-300);
    color: var(--color-green-900);
  }
  .segment-explorer-file-label--error,
  .segment-explorer-file-label--global-error {
    background-color: var(--color-red-300);
    color: var(--color-red-900);
  }
`
